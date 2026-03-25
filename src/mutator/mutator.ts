/**
 * LikeC4Mutator — high-level facade for reading and mutating .c4 source files.
 *
 * Usage pattern:
 *   const mutator = LikeC4Mutator.fromFiles({ 'model.c4': source });
 *   mutator.addElement('app', { name: 'newService', kind: 'service', title: 'New Service' });
 *   const updated = mutator.serialize();
 */
import { C4Parser } from '../parser/parser.js';
import { C4Query } from '../query/query.js';
import type { ElementInfo, RelationshipInfo, SpecificationInfo } from '../query/types.js';
import type { ParsedDocument } from '../parser/types.js';
import { applyEdits, type TextEdit } from './text-edit.js';
import { addElementEdit, updateElementEdit, removeElementEdit, type AddElementOpts } from './element-ops.js';
import type { ElementStyle, RelationshipStyle } from './codegen.js';
import { addRelationshipEdit, removeRelationshipEdit } from './relationship-ops.js';
import { addViewEdit, type GenerateViewOpts } from './view-ops.js';

export type { AddElementOpts };
export type { ElementStyle };
export type { RelationshipStyle };

export type AddViewOpts = Omit<GenerateViewOpts, 'indent'>;

/**
 * Programmatic read/write access to a set of LikeC4 source files.
 *
 * All mutations are text-level: each operation computes a TextEdit (or list of
 * edits), applies them to the in-memory source string, then re-parses so that
 * subsequent operations work against a fresh AST.
 */
export class LikeC4Mutator {
  /** filename -> current source text */
  private sources: Map<string, string>;
  private parser: C4Parser;
  /** filename -> latest ParsedDocument */
  private documents: Map<string, ParsedDocument>;
  /** filename -> latest C4Query */
  private queries: Map<string, C4Query>;

  constructor(files: Record<string, string>) {
    this.parser = new C4Parser();
    this.sources = new Map(Object.entries(files));
    this.documents = new Map();
    this.queries = new Map();
    this.parseAll();
  }

  /**
   * Create a mutator from a record of filename → source-text pairs.
   */
  static fromFiles(files: Record<string, string>): LikeC4Mutator {
    return new LikeC4Mutator(files);
  }

  // ---------------------------------------------------------------------------
  // Query API — delegates to per-file C4Query instances
  // ---------------------------------------------------------------------------

  /**
   * Look up a single element across all files by its FQN.
   * Returns null if not found.
   */
  getElement(fqn: string): ElementInfo | null {
    for (const query of this.queries.values()) {
      const el = query.getElement(fqn);
      if (el) return el;
    }
    return null;
  }

  /**
   * List elements across all files, optionally filtered by parent FQN and/or kind.
   */
  listElements(opts?: { parentFqn?: string; kind?: string }): ElementInfo[] {
    const results: ElementInfo[] = [];
    for (const query of this.queries.values()) {
      results.push(...query.listElements(opts));
    }
    return results;
  }

  /**
   * Return all relationships across all files, optionally filtered.
   */
  getRelationships(opts?: { sourceFqn?: string; targetFqn?: string }): RelationshipInfo[] {
    const results: RelationshipInfo[] = [];
    for (const query of this.queries.values()) {
      results.push(...query.getRelationships(opts));
    }
    return results;
  }

  /**
   * Return the raw CST source text for an element.
   */
  getElementSource(fqn: string): string | null {
    for (const query of this.queries.values()) {
      const src = query.getElementSource(fqn);
      if (src !== null) return src;
    }
    return null;
  }

  /**
   * Return the specification summary from the first file that has one.
   */
  getSpecification(): SpecificationInfo | null {
    for (const query of this.queries.values()) {
      const spec = query.getSpecification();
      if (spec.elementKinds.length > 0 || spec.tags.length > 0) return spec;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Mutation API
  // ---------------------------------------------------------------------------

  /**
   * Add a new element as a child of `parentFqn`, or at model level when
   * `parentFqn` is null/empty.
   *
   * The file is automatically reparsed after the edit.
   *
   * @param parentFqn - FQN of the parent element, or '' / null for model level
   * @param opts      - Properties for the new element
   */
  addElement(parentFqn: string | null, opts: AddElementOpts): string {
    const filename = parentFqn
      ? this.findFileContaining(parentFqn)
      : this.findFileWithModel();

    if (!filename) {
      throw new Error(
        parentFqn
          ? `Parent element '${parentFqn}' not found in any file`
          : 'No file with a model block found',
      );
    }

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = addElementEdit(doc, parentFqn, opts);
    this.applyEdit(filename, edit);
    return parentFqn ? `${parentFqn}.${opts.name}` : opts.name;
  }

  /**
   * Update properties on an existing element.
   *
   * @param fqn   - FQN of the element to update
   * @param props - Properties to change (undefined = keep existing)
   */
  updateElement(
    fqn: string,
    props: Partial<{
      title: string;
      summary: string;
      description: string;
      technology: string;
      tags: string[];
      links: Array<{ url: string; label?: string }>;
      style: ElementStyle;
      metadata: Record<string, string>;
    }>,
  ): void {
    const filename = this.findFileContaining(fqn);
    if (!filename) throw new Error(`Element '${fqn}' not found in any file`);

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edits = updateElementEdit(doc, fqn, props);
    if (edits.length > 0) {
      this.applyEditsToFile(filename, edits);
    }
  }

  /**
   * Remove an element (and its entire body) from the model.
   *
   * @param fqn - FQN of the element to remove
   * @returns Info about any relationships that were implicitly removed because
   *          they referenced the deleted element (or one of its descendants).
   */
  removeElement(fqn: string): { removedRelationships: Array<{ source: string; target: string; title?: string }> } {
    const filename = this.findFileContaining(fqn);
    if (!filename) throw new Error(`Element '${fqn}' not found in any file`);

    // Capture relationships that reference the element (or any descendant) before removal.
    const allRels = this.getRelationships();
    const prefix = fqn + '.';
    const affected = allRels.filter(
      (r) =>
        r.sourceFqn === fqn ||
        r.targetFqn === fqn ||
        r.sourceFqn.startsWith(prefix) ||
        r.targetFqn.startsWith(prefix),
    );

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = removeElementEdit(doc, fqn);
    this.applyEdit(filename, edit);

    return {
      removedRelationships: affected.map((r) => ({
        source: r.sourceFqn,
        target: r.targetFqn,
        title: r.title,
      })),
    };
  }

  /**
   * Add a new relationship at model level.
   *
   * @param source - Source element identifier
   * @param target - Target element identifier
   * @param label  - Optional relationship label
   * @param opts   - Optional property bag
   */
  addRelationship(
    source: string,
    target: string,
    label?: string,
    opts?: {
      description?: string;
      technology?: string;
      tags?: string[];
      links?: Array<{ url: string; label?: string }>;
      metadata?: Record<string, string>;
      style?: RelationshipStyle;
    },
  ): void {
    const filename = this.findFileWithModel();
    if (!filename) throw new Error('No file with a model block found');

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = addRelationshipEdit(doc, source, target, label, opts);
    this.applyEdit(filename, edit);
  }

  /**
   * Remove a relationship matching the given source and target identifiers.
   *
   * @param source - Source FQN or local name
   * @param target - Target FQN or local name
   */
  removeRelationship(source: string, target: string): void {
    const filename = this.findFileWithModel();
    if (!filename) throw new Error('No file with a model block found');

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = removeRelationshipEdit(doc, source, target);
    this.applyEdit(filename, edit);
  }

  /**
   * Add a new view to the views block.
   *
   * @param opts - Options for the new view
   */
  addView(opts: AddViewOpts): void {
    const filename = this.findFileWithViews();
    if (!filename) throw new Error('No file with a views block found');

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = addViewEdit(doc, opts);
    this.applyEdit(filename, edit);
  }

  // ---------------------------------------------------------------------------
  // Validation & serialization
  // ---------------------------------------------------------------------------

  /**
   * Re-parse all files and collect any parser/lexer errors.
   * Also performs a brace-balance check (skipping string literals) on each file
   * to catch structural damage that the parser might not report as an error.
   *
   * @returns Array of error message strings (empty = all files parse cleanly)
   */
  validate(): string[] {
    const errors: string[] = [];
    for (const [filename, source] of this.sources) {
      const doc = this.parser.parse(source);
      const parseErrors = doc.errors;
      for (const err of parseErrors) {
        errors.push(`${filename}:${err.line}:${err.column}: ${err.message}`);
      }
      // Level 2: brace balance check (skip string literals).
      // Only emitted when the parser did not already report errors for this file,
      // because brace imbalance found by the parser would cause parse errors that
      // already cover the structural problem.  The balance check catches cases of
      // silent structural damage that the parser accepts but that corrupt the file.
      if (parseErrors.length === 0) {
        const balanceError = checkBraceBalance(source);
        if (balanceError !== null) {
          errors.push(`${filename}: ${balanceError}`);
        }
      }
    }
    return errors;
  }

  /**
   * Return the current in-memory source texts for all files.
   */
  serialize(): Record<string, string> {
    return Object.fromEntries(this.sources);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseAll(): void {
    for (const [filename, source] of this.sources) {
      this.reparse(filename, source);
    }
  }

  private reparse(filename: string, source?: string): void {
    const text = source ?? this.sources.get(filename);
    if (text === undefined) throw new Error(`No source registered for '${filename}'`);
    const doc = this.parser.parse(text);
    this.documents.set(filename, doc);
    this.queries.set(filename, new C4Query(doc.ast));
  }

  private findFileContaining(fqn: string): string | null {
    for (const [filename, query] of this.queries) {
      if (query.getElement(fqn)) return filename;
    }
    return null;
  }

  /**
   * Return the filename of the FIRST file that contains at least one model block.
   * When multiple files are loaded and each contains a model block, relationships
   * and root-level elements are always inserted into this first matching file.
   * Use a single-file setup or pass an explicit target file (future work) when
   * precise file targeting is required.
   */
  private findFileWithModel(): string | null {
    for (const [filename, doc] of this.documents) {
      if (doc.ast.models?.length > 0) return filename;
    }
    return null;
  }

  /**
   * Return the filename of the FIRST file that contains at least one views block.
   * When multiple files are loaded and each contains a views block, new views are
   * always inserted into this first matching file.
   * Use a single-file setup or pass an explicit target file (future work) when
   * precise file targeting is required.
   */
  private findFileWithViews(): string | null {
    for (const [filename, doc] of this.documents) {
      if (doc.ast.views?.length > 0) return filename;
    }
    return null;
  }

  private applyEdit(filename: string, edit: TextEdit): void {
    this.applyEditsToFile(filename, [edit]);
  }

  private applyEditsToFile(filename: string, edits: TextEdit[]): void {
    const current = this.sources.get(filename);
    if (current === undefined) throw new Error(`No source registered for '${filename}'`);
    const updated = applyEdits(current, edits);
    const doc = this.parser.parse(updated);
    if (doc.errors.length > 0) {
      // Rollback: do not apply the edits; leave source as it was.
      const details = doc.errors
        .map((e) => `  ${filename}:${e.line}:${e.column}: ${e.message}`)
        .join('\n');
      throw new Error(`Edit produced parse errors in '${filename}':\n${details}`);
    }
    // Secondary structural check: catch brace imbalance that the parser may
    // accept silently (e.g. extra braces appended outside of any grammar rule).
    const balanceError = checkBraceBalance(updated);
    if (balanceError !== null) {
      throw new Error(`Edit produced structural errors in '${filename}': ${balanceError}`);
    }
    this.sources.set(filename, updated);
    this.documents.set(filename, doc);
    this.queries.set(filename, new C4Query(doc.ast));
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Check that `{` and `}` are balanced in `source`, skipping content inside
 * string literals (single-quoted and double-quoted) and `//` line comments.
 *
 * @returns An error message string when braces are unbalanced, or null when they match.
 */
function checkBraceBalance(source: string): string | null {
  let depth = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'") {
      // Skip single-quoted string literal
      i++;
      while (i < source.length) {
        const sc = source[i];
        if (sc === '\\') {
          i += 2;
          continue;
        }
        if (sc === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      // Skip double-quoted string literal
      i++;
      while (i < source.length) {
        const sc = source[i];
        if (sc === '\\') {
          i += 2;
          continue;
        }
        if (sc === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      // Skip line comment — advance to the end of the line
      i += 2;
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth < 0) {
        return `Brace imbalance: unexpected '}' at offset ${i}`;
      }
    }
    i++;
  }
  if (depth !== 0) {
    return `Brace imbalance: ${depth} unclosed '{' brace(s)`;
  }
  return null;
}
