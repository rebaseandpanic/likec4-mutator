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
import { WorkspaceIndex, resolveRelations } from '../query/workspace-index.js';
import type { ElementInfo, RelationshipInfo, SpecificationInfo } from '../query/types.js';
import type { ParsedDocument } from '../parser/types.js';
import { applyEdits, type TextEdit } from './text-edit.js';
import {
  addElementEdit,
  updateElementEdit,
  removeElementEdit,
  type AddElementOpts,
  type UpdateElementPatch,
} from './element-ops.js';
import type { ElementStyle, RelationshipStyle } from './codegen.js';
import {
  addRelationshipEdit,
  removeRelationshipEdit,
  removeRelationNodeEdit,
  updateRelationshipEdit,
  findMatchingRelations,
  formatNotFoundError,
  type UpdateRelationshipMatcher,
  type UpdateRelationshipPatch,
} from './relationship-ops.js';
import { addViewEdit, type GenerateViewOpts } from './view-ops.js';

export type { AddElementOpts, UpdateElementPatch };
export type { ElementStyle };
export type { RelationshipStyle };
export type { UpdateRelationshipMatcher, UpdateRelationshipPatch };

export type AddViewOpts = Omit<GenerateViewOpts, 'indent'>;

/**
 * Result of {@link LikeC4Mutator.removeElement}.  Lists every relationship
 * that was removed along with the element: those whose source or target is
 * the deleted element or one of its descendants (in any file), and those
 * declared inside the deleted element's body.  `source` / `target` are
 * absolute FQNs.
 */
export interface RemoveElementResult {
  removedRelationships: Array<{ source: string; target: string; title?: string }>;
}

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
  /** Element index over all documents, used to resolve relationship endpoints */
  private workspace: WorkspaceIndex;

  constructor(files: Record<string, string>) {
    this.parser = new C4Parser();
    this.sources = new Map(Object.entries(files));
    this.documents = new Map();
    this.queries = new Map();
    this.workspace = new WorkspaceIndex([]);
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
      if (
        spec.elementKinds.length > 0 ||
        spec.tags.length > 0 ||
        spec.relationshipKinds.length > 0
      ) {
        return spec;
      }
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
   * Semantics summary (v0.4.0):
   *  - `title`, `summary`, `description`, `technology`: REPLACE.
   *  - `tags`: REPLACE (BREAKING vs. v0.3 — used to APPEND).  Empty array
   *    clears all existing tags.
   *  - `links`: REPLACE.  Empty array clears all existing links.
   *  - `style`: MERGE per-field (BREAKING vs. v0.3 — used to fully REPLACE
   *    the existing block).  Pass a complete style object to reproduce the
   *    old replace-all behaviour.
   *  - `metadata`: MERGE with `null`-deletion.  Map a key to `null` to delete
   *    it; map to a string or string[] to upsert.  Keys absent from the
   *    patch are preserved verbatim (including their original array
   *    formatting).
   *
   * @param fqn   - FQN of the element to update
   * @param props - Properties to change (undefined = keep existing)
   */
  updateElement(fqn: string, props: UpdateElementPatch): void {
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
   * Remove an element (and its entire body) from the model, together with
   * every relationship that depends on it.
   *
   * Removed relationships are those whose source or target is the element or
   * one of its descendants — in any loaded file — plus those declared inside
   * the element's body (which disappear with the body).  The operation is
   * atomic: when any step fails, no file is changed.
   *
   * @param fqn - FQN of the element to remove
   * @returns The relationships that were removed.
   */
  removeElement(fqn: string): RemoveElementResult {
    const filename = this.findFileContaining(fqn);
    if (!filename) throw new Error(`Element '${fqn}' not found in any file`);

    const isDependent = (r: { sourceFqn: string; targetFqn: string }): boolean =>
      isSameOrDescendant(r.sourceFqn, fqn) || isSameOrDescendant(r.targetFqn, fqn);

    // Report every relationship that is about to disappear, in file order.
    const removedRelationships: RemoveElementResult['removedRelationships'] = [];
    for (const [file, query] of this.queries) {
      const range = file === filename ? this.elementRange(fqn, file) : null;
      for (const r of query.getRelationships()) {
        if (isDependent(r) || (range !== null && isWithin(r.sourceRange, range))) {
          removedRelationships.push({ source: r.sourceFqn, target: r.targetFqn, title: r.title });
        }
      }
    }

    const snapshot = this.snapshot();
    try {
      // Remove dependent relationships declared outside the element one at a
      // time (each removal reparses its file, so offsets stay valid), then
      // the element itself, which takes the relationships in its body along.
      for (;;) {
        const next = this.findRelationOutsideElement(fqn, filename, isDependent);
        if (!next) break;
        const doc = this.documents.get(next.filename);
        if (!doc) throw new Error(`Internal error: document for '${next.filename}' not found in cache`);
        this.applyEdit(next.filename, removeRelationNodeEdit(doc.fullText, next.node));
      }

      const doc = this.documents.get(filename);
      if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
      this.applyEdit(filename, removeElementEdit(doc, fqn));
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }

    return { removedRelationships };
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
      metadata?: Record<string, string | string[]>;
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
   * Update fields on an existing relationship.
   *
   * Disambiguation: when more than one relation matches `matcher.source` /
   * `matcher.target`, supply `matcher.matchKind` (e.g. `'calls'`) and/or
   * `matcher.matchTitle` to select exactly one.  Throws when zero relations
   * match or when more than one still matches after disambiguation.
   *
   * Patch semantics:
   *  - `label`, `description`, `technology`: REPLACE.
   *  - `tags`: REPLACE.  Empty array clears all existing tags.
   *  - `links`: REPLACE.  Empty array clears all existing links.
   *  - `metadata`: MERGE with `null`-deletion (same as `updateElement`).
   *  - `style`: MERGE per-field; absent fields are preserved.
   *
   * Multi-file behaviour: every loaded document is scanned and every match
   * across files is collected.  Throws on cross-file ambiguity.
   *
   * @param matcher - Source/target plus optional matchKind/matchTitle disambiguators
   * @param patch   - Update payload (at least one field must be specified)
   */
  updateRelationship(matcher: UpdateRelationshipMatcher, patch: UpdateRelationshipPatch): void {
    const matches = this.locateRelations(matcher);
    if (matches.length === 0) {
      throw new Error(formatNotFoundError(matcher));
    }
    if (matches.length > 1) {
      const fileList = [...new Set(matches)].join(', ');
      throw new Error(
        `Multiple relationships match (${matches.length} found across files: ${fileList}). ` +
          `Specify matchKind and/or matchTitle to disambiguate.`,
      );
    }

    const filename = matches[0];
    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edits = updateRelationshipEdit(doc, matcher, patch, this.workspace);
    if (edits.length > 0) {
      this.applyEditsToFile(filename, edits);
    }
  }

  /**
   * Remove a relationship matching the given source and target identifiers.
   *
   * Endpoints are compared as absolute FQNs (`app.api` matches `api` written
   * inside `app { ... }`).  When no relationship matches by FQN, the reference
   * text as written in the source is compared instead.  Every loaded file is
   * searched; when several relationships match, the first one in file order
   * is removed.
   *
   * @param source - Source FQN (or reference text as written)
   * @param target - Target FQN (or reference text as written)
   */
  removeRelationship(source: string, target: string): void {
    const [filename] = this.locateRelations({ source, target });
    if (!filename) throw new Error(`Relationship '${source} -> ${target}' not found`);

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = removeRelationshipEdit(doc, source, target, this.workspace);
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
      this.documents.set(filename, this.parser.parse(source));
    }
    this.rebuildQueries();
  }

  /**
   * Rebuild the workspace index and every per-file query.  A change in one
   * file can change how references in other files resolve, so all queries
   * are rebuilt together.
   */
  private rebuildQueries(): void {
    const docs = [...this.documents.values()];
    this.workspace = new WorkspaceIndex(docs.map((d) => d.ast));
    this.queries = new Map();
    for (const [filename, doc] of this.documents) {
      this.queries.set(filename, new C4Query(doc.ast, this.workspace));
    }
  }

  /**
   * Filenames of the relations matching `matcher`, one entry per match, in
   * file order.  Matches by absolute FQN in any file take precedence over
   * matches by reference text as written — the same precedence the per-file
   * edit builders apply, so the file chosen here holds the relation they
   * select.
   */
  private locateRelations(matcher: UpdateRelationshipMatcher): string[] {
    const byFqn: string[] = [];
    const byText: string[] = [];
    for (const [filename, doc] of this.documents) {
      const found = findMatchingRelations(doc.ast, matcher, this.workspace);
      for (let i = 0; i < found.byFqn.length; i++) byFqn.push(filename);
      for (let i = 0; i < found.byText.length; i++) byText.push(filename);
    }
    return byFqn.length > 0 ? byFqn : byText;
  }

  /** Source range of an element in `filename`, or null when not found there. */
  private elementRange(fqn: string, filename: string): { offset: number; end: number } | null {
    const el = this.queries.get(filename)?.getElement(fqn);
    return el ? { offset: el.sourceRange.offset, end: el.sourceRange.end } : null;
  }

  /**
   * First relation (in file order) that satisfies `isDependent` and is not
   * declared inside the body of element `fqn` (which lives in `elementFile`).
   */
  private findRelationOutsideElement(
    fqn: string,
    elementFile: string,
    isDependent: (r: { sourceFqn: string; targetFqn: string }) => boolean,
  ): { filename: string; node: unknown } | null {
    for (const [file, doc] of this.documents) {
      const range = file === elementFile ? this.elementRange(fqn, file) : null;
      for (const rel of resolveRelations(doc.ast, this.workspace)) {
        if (!isDependent(rel)) continue;
        const cst = (rel.node as { $cstNode?: { offset: number; end: number } }).$cstNode;
        if (range !== null && cst && isWithin(cst, range)) continue;
        return { filename: file, node: rel.node };
      }
    }
    return null;
  }

  /** Capture the mutable state so that a multi-step operation can roll back. */
  private snapshot(): MutatorSnapshot {
    return { sources: new Map(this.sources), documents: new Map(this.documents) };
  }

  /** Restore state captured by {@link snapshot}. */
  private restore(state: MutatorSnapshot): void {
    this.sources = state.sources;
    this.documents = state.documents;
    this.rebuildQueries();
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
    this.rebuildQueries();
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/** Mutable state of a {@link LikeC4Mutator}, captured for rollback. */
interface MutatorSnapshot {
  sources: Map<string, string>;
  documents: Map<string, ParsedDocument>;
}

/** True when `fqn` equals `ancestor` or is nested below it. */
function isSameOrDescendant(fqn: string, ancestor: string): boolean {
  return fqn === ancestor || fqn.startsWith(ancestor + '.');
}

/** True when range `inner` lies entirely inside range `outer`. */
function isWithin(
  inner: { offset: number; end: number },
  outer: { offset: number; end: number },
): boolean {
  return inner.offset >= outer.offset && inner.end <= outer.end;
}

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
