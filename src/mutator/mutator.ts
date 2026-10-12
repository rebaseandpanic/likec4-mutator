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
import { DeploymentIndex } from '../query/deployment-index.js';
import { isSameHierarchy } from '@likec4/core/utils';
import {
  WorkspaceIndex,
  resolveDocumentReferences,
  resolveReferenceText,
  type ReferenceResolution,
  resolveRelations,
  type ExtendRelationBlockRef,
  type ResolvedRelation,
} from '../query/workspace-index.js';
import { buildRemovalEdit } from './cst-helpers.js';
import { relationFingerprint, relationIdentity, type RelationIdentity } from '../query/relation-extends.js';
import { removeIndent } from '../query/likec4-text.js';
import { readContribution, type Decorations } from '../query/extend-merge.js';
import { specificationKinds } from '../query/kind-specs.js';
import type {
  DeploymentNodeKindDefaults,
  ElementInfo,
  RelationshipInfo,
  SpecificationInfo,
} from '../query/types.js';
import type { ParsedDocument } from '../parser/types.js';
import { applyEdits, lineEndingOf, withLineEnding, type TextEdit } from './text-edit.js';
import {
  addElementEdit,
  updateElementEdit,
  removeElementEdit,
  findExtendBlocks,
  removeExtendBlockEdit,
  clearExtendContributionsEdits,
  type ExtendBlock,
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
  matchResolvedRelations,
  buildExtendRelationTitleEdit,
  formatNotFoundError,
  type UpdateRelationshipMatcher,
  type UpdateRelationshipPatch,
} from './relationship-ops.js';
import { addViewEdit, type GenerateViewOpts } from './view-ops.js';
import { checkBraceBalance } from './brace-balance.js';
import {
  InvalidWriteError,
  checkAutoLayout,
  checkElementName,
  checkKind,
  checkReferenceForm,
  checkStyle,
  checkTags,
  checkViewId,
  checkViewIncludes,
} from './write-checks.js';

export type { AddElementOpts, UpdateElementPatch };
export type { ElementStyle };
export type { RelationshipStyle };
export type { UpdateRelationshipMatcher, UpdateRelationshipPatch };

export type AddViewOpts = Omit<GenerateViewOpts, 'indent'>;

/**
 * Result of {@link LikeC4Mutator.removeElement}.  Lists every relationship
 * that was removed along with the element: those whose source or target is
 * the deleted element or one of its descendants (in any file), and those
 * declared inside the deleted element's body or inside a removed `extend`
 * block of its subtree.  `source` / `target` are absolute FQNs.
 */
export interface RemoveElementResult {
  removedRelationships: Array<{ source: string; target: string; title?: string }>;
}

/**
 * Result of {@link LikeC4Mutator.updateElement}.
 */
export interface UpdateElementResult {
  /**
   * Files whose text changed, without duplicates, in the order the files
   * were loaded.  Besides the file of the declaration this includes files
   * whose `extend` blocks lost tags, links or metadata keys.  Empty when the
   * update changed nothing.  Describes the in-memory state: nothing is
   * written to disk.
   */
  changedFiles: string[];
}

/**
 * Result of {@link LikeC4Mutator.updateRelationship}.
 */
export interface UpdateRelationshipResult {
  /**
   * Files whose text changed, without duplicates, in the order the files
   * were loaded: the file of the relationship and files whose
   * `extend a -> b { ... }` blocks lost tags, links or metadata keys or got
   * the new title.  Empty when the update changed nothing.  Describes the
   * in-memory state: nothing is written to disk.
   */
  changedFiles: string[];
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
  /** Deployment model index over all documents */
  private deployments: DeploymentIndex;

  constructor(files: Record<string, string>) {
    this.parser = new C4Parser();
    this.sources = new Map(Object.entries(files));
    this.documents = new Map();
    this.queries = new Map();
    this.workspace = new WorkspaceIndex([]);
    this.deployments = new DeploymentIndex([]);
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
   * Return the specification of the whole project: the specification blocks
   * of every file merged, as LikeC4 does.  Names are listed in order of first
   * declaration (file order, then source order); a name declared more than
   * once — a duplicate LikeC4 reports — is listed once.
   *
   * `deploymentNodeKinds` is present only when at least one deployment node
   * kind is declared.  Returns null when no file declares any element kind,
   * tag, relationship kind or deployment node kind.
   */
  getSpecification(): SpecificationInfo | null {
    const elementKinds = new Set<string>();
    const tags = new Set<string>();
    const relationshipKinds = new Set<string>();
    const deploymentNodeKinds = new Set<string>();
    for (const [file, query] of this.queries) {
      const spec = query.getSpecification();
      for (const kind of spec.elementKinds) elementKinds.add(kind);
      for (const tag of spec.tags) tags.add(tag);
      for (const kind of spec.relationshipKinds) relationshipKinds.add(kind);
      for (const node of specificationKinds(this.documents.get(file)!.ast).deploymentNodes) {
        deploymentNodeKinds.add(node.kind!.name!);
      }
    }
    if (elementKinds.size === 0 && tags.size === 0 && relationshipKinds.size === 0 && deploymentNodeKinds.size === 0) {
      return null;
    }
    return {
      elementKinds: [...elementKinds],
      tags: [...tags],
      relationshipKinds: [...relationshipKinds],
      ...(deploymentNodeKinds.size > 0 && { deploymentNodeKinds: [...deploymentNodeKinds] }),
    };
  }

  /**
   * Return the declaration of a deployment node kind (`deploymentNode <kind>`
   * in a `specification` block) and the defaults it writes, style included.
   * A kind declared more than once is taken as for an element kind: the
   * last declaration of the last file in LikeC4 document order.
   *
   * Returns null when no specification declares the kind.
   */
  getDeploymentNodeKind(kind: string): DeploymentNodeKindDefaults | null {
    const spec = this.workspace.deploymentNodeKind(kind);
    if (!spec) return null;
    return { ...spec.defaults, ...(spec.style && { style: spec.style as ElementStyle }) };
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
    checkElementName(opts.name);
    checkKind(opts.kind, 'element', this.workspace);
    checkTags(opts.tags, this.workspace);
    checkStyle(opts.style, 'element', this.workspace);
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

    const fqn = parentFqn ? `${parentFqn}.${opts.name}` : opts.name;
    if (this.workspace.has(fqn)) {
      // LikeC4 reports `Duplicate element name` for two declarations of one
      // FQN anywhere in the project (`checkElement`, `FqnIndex.byFqn`).
      throw new InvalidWriteError(
        'name',
        `an element '${fqn}' is already declared${parentFqn ? ` in '${parentFqn}'` : ' at the model root'} (in a loaded file)`,
      );
    }

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = addElementEdit(doc, parentFqn, opts);
    const before = this.referenceResolutions();
    const snapshot = this.snapshot();
    try {
      this.applyEdit(filename, edit);
      this.rejectChangedReferences(before, fqn);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return fqn;
  }

  /**
   * Update properties on an existing element.
   *
   * Semantics apply to the element's effective values — the declaration
   * merged with every `extend` block of the element (see
   * {@link ElementInfo}):
   *  - `title`, `summary`, `description`, `technology`: REPLACE.
   *  - `tags`: REPLACE.  Empty array clears all tags.
   *  - `links`: REPLACE.  Empty array clears all links.
   *  - `style`: MERGE per-field; absent fields are preserved.  Pass a
   *    complete style object to replace everything.
   *  - `metadata`: MERGE with `null`-deletion.  Map a key to `null` to delete
   *    it; map to a string or string[] to upsert.  Keys absent from the
   *    patch are preserved verbatim (including their original array
   *    formatting).
   *
   * New values are written into the element's declaration.  When the patch
   * sets `tags` or `links`, those are removed from every `extend X { ... }`
   * block whose X is exactly this element, in every loaded file; every
   * metadata key of the patch (upserted or deleted) is removed from those
   * blocks too.  Anything else in the blocks — other keys, nested elements
   * and relationships, comments — is kept, and a block that ends up empty
   * stays in place.
   *
   * The defaults of the element's kind (see
   * {@link ElementInfo.fromSpecification}) are never edited: the
   * specification stays as it is and the effective value afterwards follows
   * LikeC4's rules — `tags: T` reads as the kind tags then `T` (`[]` leaves
   * the kind tags); `links: []` brings back the kind links; an empty `title`
   * reads as the kind title, else the element name; a `summary` or
   * `description` written as `''` in the body reads as `''`.
   *
   * Because an `extend` block may hide in a file that does not parse, a
   * `tags`, `links` or `metadata` update is rejected — before anything is
   * changed — while any loaded file has syntax errors (as reported by
   * {@link validate}).
   *
   * The operation is atomic in memory: when any step fails, every file is
   * restored and the error is rethrown.
   *
   * @param fqn   - FQN of the element to update
   * @param props - Properties to change (undefined = keep existing)
   * @returns The files that changed.
   */
  updateElement(fqn: string, props: UpdateElementPatch): UpdateElementResult {
    checkTags(props.tags, this.workspace);
    checkStyle(props.style, 'element', this.workspace);
    const filename = this.findFileContaining(fqn);
    if (!filename) throw new Error(`Element '${fqn}' not found in any file`);

    const clearing = {
      tags: props.tags !== undefined,
      links: props.links !== undefined,
      metadataKeys: props.metadata ? Object.keys(props.metadata) : [],
    };
    const crossFile = clearing.tags || clearing.links || clearing.metadataKeys.length > 0;
    if (crossFile) this.rejectWhileSyntaxErrors(`tags, links or metadata of '${fqn}'`);

    // Every edit is computed against the current documents before any file
    // changes, then applied as one group per file.
    const editsByFile = new Map<string, TextEdit[]>();
    const addEdits = (file: string, edits: TextEdit[]): void => addEditGroup(editsByFile, file, edits);
    addEdits(filename, updateElementEdit(this.document(filename), fqn, props));
    if (crossFile) {
      for (const block of this.workspace.extendBlocks(fqn)) {
        // The mutator indexes every document under its file name.
        const { file, node } = block;
        if (file === undefined) throw new Error(`Internal error: extend block of '${fqn}' has no file name`);
        addEdits(file, clearExtendContributionsEdits(this.document(file), node, clearing));
      }
    }

    return { changedFiles: this.applyEditGroups(editsByFile) };
  }

  /**
   * Remove an element (and its entire body) from the model, together with
   * every relationship that depends on it.
   *
   * The element's subtree includes children declared in `extend` blocks, so
   * every `extend X { ... }` block whose X is the element or one of its
   * descendants — in any loaded file — is removed as well (it would otherwise
   * refer to an element that no longer exists).
   *
   * Removed relationships are those whose source or target is the element or
   * one of its descendants — in any loaded file — plus those declared inside
   * the element's body or inside a removed `extend` block (which disappear
   * with it).  `extend a -> b { ... }` blocks whose source or target is in
   * the subtree, and blocks that applied only to removed relationships, are
   * removed too (see {@link removeRelationship}); they are not listed in the
   * result.  The operation is atomic: when any step fails, no file is
   * changed.
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
      const ranges = this.removedRanges(fqn, filename, file);
      for (const r of query.getRelationships()) {
        if (isDependent(r) || ranges.some((range) => isWithin(r.sourceRange, range))) {
          removedRelationships.push({ source: r.sourceFqn, target: r.targetFqn, title: r.title });
        }
      }
    }

    // Fingerprints of the relationships that go and of those that stay, for
    // the `extend a -> b` blocks below.
    const removedNodes = new Set<unknown>();
    for (const [file, doc] of this.documents) {
      const ranges = this.removedRanges(fqn, filename, file);
      for (const rel of resolveRelations(doc.ast, this.workspace)) {
        const cst = (rel.node as { $cstNode?: { offset: number; end: number } }).$cstNode;
        if (isDependent(rel) || (cst && ranges.some((range) => isWithin(cst, range)))) removedNodes.add(rel.node);
      }
    }
    const keys = this.relationKeys((rel) => removedNodes.has(rel.node));

    const snapshot = this.snapshot();
    try {
      // Remove dependent relationships declared outside the removed ranges one
      // at a time (each removal reparses its file, so offsets stay valid),
      // then the `extend a -> b` blocks that lose their relationships or an
      // endpoint (while the endpoints still resolve), then the `extend`
      // blocks of the subtree, then the element itself.  Relationships inside
      // the element's body or an `extend` block go along with it.
      for (;;) {
        const next = this.findRelationOutsideRemovedRanges(fqn, filename, isDependent);
        if (!next) break;
        this.applyEdit(next.filename, removeRelationNodeEdit(this.document(next.filename).fullText, next.node));
      }
      this.removeOrphanedExtendRelations(keys, (endpoint) => isSameOrDescendant(endpoint, fqn));

      for (;;) {
        const next = this.findExtendBlock(fqn);
        if (!next) break;
        const doc = this.document(next.filename);
        this.applyEdit(next.filename, removeExtendBlockEdit(doc, next.block));
      }

      this.applyEdit(filename, removeElementEdit(this.document(filename), fqn));
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
    checkReferenceForm(source, 'source');
    checkReferenceForm(target, 'target');
    checkTags(opts?.tags, this.workspace);
    checkStyle(opts?.style, 'relationship', this.workspace);
    const filename = this.findFileWithModel();
    if (!filename) throw new Error('No file with a model block found');

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    // The relationship is written into the first model block of `filename`;
    // its endpoints link from there as LikeC4 links them.
    const sourceFqn = this.resolveWritten(doc, filename, source, 'source', { model: 0 });
    const targetFqn = this.resolveWritten(doc, filename, target, 'target', { model: 0 });
    // LikeC4 rejects a relationship between an element and itself or one of
    // its ancestors / descendants: `Invalid parent-child relationship`
    // (language-server `relationChecks`, `isSameHierarchy` of the resolved
    // endpoints).
    if (isSameHierarchy(sourceFqn, targetFqn)) {
      throw new InvalidWriteError(
        'target',
        sourceFqn === targetFqn
          ? `'${target}' resolves to the source '${sourceFqn}' itself: LikeC4 rejects a relationship of an element with itself`
          : `'${source}' (${sourceFqn}) and '${target}' (${targetFqn}) are parent and child: LikeC4 rejects such a relationship`,
      );
    }
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
   * `extend a -> b { ... }` blocks that apply to the relationship (see
   * {@link RelationshipInfo.extendedBy}) take part as for
   * {@link updateElement}: `tags`, `links` and `metadata` act on the
   * effective values — new values go into the relationship, and the patched
   * tags, links and metadata keys are removed from every such block in every
   * loaded file (a block that ends up empty stays).  A block is identified
   * by the relationship's title, so a `label` that changes the title is
   * written into every such block too; otherwise they would stop applying.
   *
   * A block also applies to every other relationship with the same source,
   * target, kind, title and direction.  When such a block would change, the
   * update is rejected before anything changes: it would change the other
   * relationship as well.
   *
   * The defaults of the relationship's kind (see
   * {@link RelationshipInfo.fromSpecification}) are never edited: `tags: T`
   * reads as the kind tags then `T`; `links: []` brings back the kind links;
   * an empty `label` reads as the kind title; a `description` or
   * `technology` written as `''` reads as `''`.
   * A `label` that changes the identity is likewise rejected when the
   * relationship's blocks would then also apply to another relationship with
   * the new identity, or when blocks of the new identity contribute tags,
   * links or metadata (they would start applying to this relationship).
   *
   * A `label`, `tags`, `links` or `metadata` update is rejected — before
   * anything is changed — while any loaded file has syntax errors (as
   * reported by {@link validate}).  The operation is atomic in memory: when
   * any step fails, every file is restored and the error is rethrown.
   *
   * @param matcher - Source/target plus optional matchKind/matchTitle disambiguators
   * @param patch   - Update payload (at least one field must be specified)
   * @returns The files that changed.
   */
  updateRelationship(matcher: UpdateRelationshipMatcher, patch: UpdateRelationshipPatch): UpdateRelationshipResult {
    checkTags(patch.tags, this.workspace);
    checkStyle(patch.style, 'relationship', this.workspace);
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
    const doc = this.document(filename);
    // Validates the patch and selects exactly one relationship in `doc`.
    const relationEdits = updateRelationshipEdit(doc, matcher, patch, this.workspace);
    const [relation] = matchResolvedRelations(doc.ast, matcher, this.workspace);
    if (!relation) throw new Error(formatNotFoundError(matcher));

    const clearing = {
      tags: patch.tags !== undefined,
      links: patch.links !== undefined,
      metadataKeys: patch.metadata ? Object.keys(patch.metadata) : [],
    };
    const crossFile =
      clearing.tags || clearing.links || clearing.metadataKeys.length > 0 || patch.label !== undefined;
    const name = `'${relation.sourceFqn} -> ${relation.targetFqn}'`;
    if (crossFile) this.rejectWhileSyntaxErrors(`the label, tags, links or metadata of relationship ${name}`);

    const editsByFile = new Map<string, TextEdit[]>();
    addEditGroup(editsByFile, filename, relationEdits);

    // A relationship with an unresolved endpoint is not in LikeC4's model:
    // no `extend` block applies to it.
    if (crossFile && relation.resolved) {
      const identity = relationIdentity(relation);
      const label = patch.label;
      const newTitle = label === undefined ? undefined : this.extendTitleAfterLabel(identity, label);
      const oldKey = relationFingerprint(this.workspace.effectiveIdentity(identity));
      const changedBlockFiles: string[] = [];
      for (const { file, node } of this.workspace.extendRelationBlocks(identity)) {
        // The mutator indexes every document under its file name.
        if (file === undefined) throw new Error(`Internal error: extend block of ${name} has no file name`);
        const blockEdits = clearExtendContributionsEdits(this.document(file), node, clearing);
        if (newTitle !== undefined) blockEdits.push(buildExtendRelationTitleEdit(node, newTitle));
        if (blockEdits.length === 0) continue;
        changedBlockFiles.push(file);
        addEditGroup(editsByFile, file, blockEdits);
      }
      const blockFiles = (files: string[]): string => [...new Set(files)].join(', ');
      if (changedBlockFiles.length > 0) {
        const others = this.countRelationsSharing(oldKey, relation.node);
        if (others > 0) {
          throw new Error(
            `Cannot update relationship ${name}: its extend blocks (${blockFiles(changedBlockFiles)}) ` +
              `would change, and each also applies to ${others} other relationship(s) with the same source, ` +
              `target, kind, title and direction`,
          );
        }
      }
      if (label !== undefined && newTitle !== undefined) {
        // The new title gives the relationship another identity.  Its blocks
        // move there and would also apply to the relationships that already
        // have it; the blocks already there would apply to this one.
        const newKey = relationFingerprint(
          this.workspace.effectiveIdentity({ ...identity, title: removeIndent(label) }),
        );
        const others = this.countRelationsSharing(newKey, relation.node);
        if (changedBlockFiles.length > 0 && others > 0) {
          throw new Error(
            `Cannot update relationship ${name}: its extend blocks (${blockFiles(changedBlockFiles)}) ` +
              `would take the new title and also apply to ${others} other relationship(s) with the same ` +
              `source, target, kind, title and direction`,
          );
        }
        const destinationFiles = this.workspace
          .extendRelationBlockList()
          .filter(({ key, block }) => key === newKey && hasContributions(readContribution(block.node.body)))
          .map(({ block }) => block.file ?? '');
        if (destinationFiles.length > 0) {
          throw new Error(
            `Cannot update relationship ${name}: extend blocks (${blockFiles(destinationFiles)}) of the new ` +
              `title would apply to it and change its tags, links or metadata`,
          );
        }
      }
    }

    return { changedFiles: this.applyEditGroups(editsByFile) };
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
   * `extend a -> b { ... }` blocks that applied to the removed relationship
   * and apply to no remaining one are removed too, in every loaded file: they
   * only decorated it (LikeC4 would warn that they match no relation).
   * Blocks that matched nothing before are left alone.  The operation is
   * atomic: when any step fails, no file is changed.
   *
   * @param source - Source FQN (or reference text as written)
   * @param target - Target FQN (or reference text as written)
   */
  removeRelationship(source: string, target: string): void {
    const [filename] = this.locateRelations({ source, target });
    if (!filename) throw new Error(`Relationship '${source} -> ${target}' not found`);

    const doc = this.document(filename);
    const edit = removeRelationshipEdit(doc, source, target, this.workspace);
    const [removed] = matchResolvedRelations(doc.ast, { source, target }, this.workspace);
    const keys = this.relationKeys((rel) => rel.node === removed?.node);

    const snapshot = this.snapshot();
    try {
      this.applyEdit(filename, edit);
      this.removeOrphanedExtendRelations(keys, () => false);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  /**
   * Add a new view to the views block.
   *
   * @param opts - Options for the new view
   */
  addView(opts: AddViewOpts): void {
    checkViewId(opts.id);
    if (this.viewIds().has(opts.id)) {
      // LikeC4 reports `Duplicate view` for two views of one id in the
      // project, whatever their types (`viewChecks`).
      throw new InvalidWriteError('id', `a view '${opts.id}' is already declared (in a loaded file)`);
    }
    if (opts.type === 'element' && opts.target !== undefined && opts.target !== '') {
      checkReferenceForm(opts.target, 'target');
    }
    checkViewIncludes(opts.includes, opts.type);
    checkAutoLayout(opts.autoLayout);
    const filename = this.findFileWithViews();
    if (!filename) throw new Error('No file with a views block found');

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    if (opts.type === 'element' && opts.target !== undefined && opts.target !== '') {
      this.resolveWritten(doc, filename, opts.target, 'target', 'views');
    }
    const edit = addViewEdit(doc, opts);
    this.applyEdit(filename, edit);
  }

  // ---------------------------------------------------------------------------
  // Validation & serialization
  // ---------------------------------------------------------------------------

  /**
   * Collect the parser/lexer errors of every file (from its latest parse,
   * which always matches its current text) and perform a brace-balance
   * check (skipping string literals) on each file that parses, to catch
   * structural damage that the parser might not report as an error.
   *
   * @returns Array of error message strings (empty = all files parse cleanly)
   */
  validate(): string[] {
    const errors: string[] = [];
    for (const [filename, source] of this.sources) {
      errors.push(...this.fileErrors(filename, source, this.document(filename)));
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

  /**
   * Parser/lexer errors of one file, or — when it parses — a brace-balance
   * error (string literals skipped) catching structural damage the parser
   * accepts silently.  Parse errors already cover an imbalance, so the
   * balance check only runs on files that parse.
   */
  private fileErrors(filename: string, source: string, doc: ParsedDocument): string[] {
    if (doc.errors.length > 0) {
      return doc.errors.map((err) => `${filename}:${err.line}:${err.column}: ${err.message}`);
    }
    const balanceError = checkBraceBalance(source);
    return balanceError === null ? [] : [`${filename}: ${balanceError}`];
  }

  private parseAll(): void {
    for (const [filename, source] of this.sources) {
      this.documents.set(filename, this.parser.parse(source));
    }
    this.rebuildQueries();
  }

  /**
   * Rebuild the workspace and deployment indices and every per-file query.
   * A change in one file can change how references in other files resolve,
   * so all of them are rebuilt together.
   */
  private rebuildQueries(): void {
    const documents = [...this.documents].map(([file, doc]) => ({ file, ast: doc.ast }));
    this.workspace = new WorkspaceIndex(documents);
    this.deployments = new DeploymentIndex(documents);
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

  /**
   * Throw, naming every syntax error, when any loaded file does not parse:
   * `extend` blocks in such a file cannot be located reliably.
   */
  private rejectWhileSyntaxErrors(what: string): void {
    const errors = this.validate();
    if (errors.length === 0) return;
    throw new Error(
      `Cannot update ${what}: extend blocks of loaded files ` +
        `cannot be located reliably while files have syntax errors:\n` +
        errors.map((e) => `  ${e}`).join('\n'),
    );
  }

  /**
   * Apply edit groups (file → edits computed against the current documents)
   * atomically: when any file fails, every file is restored and the error is
   * rethrown.
   *
   * @returns The files whose text changed, in load order.
   */
  private applyEditGroups(editsByFile: Map<string, TextEdit[]>): string[] {
    const snapshot = this.snapshot();
    try {
      for (const file of this.sources.keys()) {
        const edits = editsByFile.get(file);
        if (edits) this.applyEditsToFile(file, edits);
      }
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return [...this.sources]
      .filter(([file, text]) => snapshot.sources.get(file) !== text)
      .map(([file]) => file);
  }

  /**
   * The title to write into the `extend` blocks of a relationship whose label
   * becomes `label`, or undefined when the blocks keep applying unchanged.
   * The title LikeC4 compares is the dedented, trimmed label — or, when that
   * is empty, the title of the kind's specification.
   */
  private extendTitleAfterLabel(identity: RelationIdentity, label: string): string | undefined {
    const before = this.workspace.effectiveIdentity(identity);
    const after = this.workspace.effectiveIdentity({ ...identity, title: removeIndent(label) });
    if (relationFingerprint(before) === relationFingerprint(after)) return undefined;
    return after.title === removeIndent(label) ? label : after.title;
  }

  /**
   * Number of relationships, other than `node`, in any loaded file whose
   * effective fingerprint is `key`: the `extend` blocks of that fingerprint
   * apply to them as well.
   */
  private countRelationsSharing(key: string, node: unknown): number {
    let count = 0;
    for (const doc of this.documents.values()) {
      for (const rel of resolveRelations(doc.ast, this.workspace)) {
        if (rel.node === node || !rel.resolved) continue;
        if (relationFingerprint(this.workspace.effectiveIdentity(relationIdentity(rel))) === key) count++;
      }
    }
    return count;
  }

  /**
   * Fingerprints of the relationships (with resolved endpoints) of every
   * loaded file, split by `isRemoved`.
   */
  private relationKeys(isRemoved: (rel: ResolvedRelation) => boolean): { removed: Set<string>; remaining: Set<string> } {
    const removed = new Set<string>();
    const remaining = new Set<string>();
    for (const doc of this.documents.values()) {
      for (const rel of resolveRelations(doc.ast, this.workspace)) {
        if (!rel.resolved) continue;
        const key = relationFingerprint(this.workspace.effectiveIdentity(relationIdentity(rel)));
        (isRemoved(rel) ? removed : remaining).add(key);
      }
    }
    return { removed, remaining };
  }

  /**
   * Remove, one at a time, every `extend a -> b { ... }` block (endpoints
   * resolved) that applied to a removed relationship and to no remaining
   * one, or whose source or target satisfies `endpointRemoved`.
   */
  private removeOrphanedExtendRelations(
    keys: { removed: Set<string>; remaining: Set<string> },
    endpointRemoved: (fqn: string) => boolean,
  ): void {
    const isOrphaned = ({ key, block }: { key: string; block: ExtendRelationBlockRef }): boolean =>
      endpointRemoved(block.sourceFqn) ||
      endpointRemoved(block.targetFqn) ||
      (keys.removed.has(key) && !keys.remaining.has(key));
    for (;;) {
      const next = this.workspace.extendRelationBlockList().find(isOrphaned);
      if (!next) return;
      const { file, node } = next.block;
      if (file === undefined || !node.$cstNode) throw new Error('Internal error: extend block without file or position');
      const { offset, end, newText } = buildRemovalEdit(this.document(file).fullText, node.$cstNode.offset, node.$cstNode.end);
      this.applyEdit(file, { offset, end, newText });
    }
  }

  /**
   * The FQN an element reference written into `doc` at `position` links to,
   * as LikeC4 resolves it (see {@link resolveReferenceText}).  Only the loaded
   * files are known: a reference to an element of a file that is not loaded
   * does not resolve and is rejected.
   *
   * @throws {InvalidWriteError} on `field` when the reference does not resolve
   */
  private resolveWritten(
    doc: ParsedDocument,
    filename: string,
    reference: string,
    field: string,
    position: Parameters<typeof resolveReferenceText>[3],
  ): string {
    const fqn = resolveReferenceText(doc.ast, this.workspace, reference, position);
    if (fqn === undefined) {
      throw new InvalidWriteError(
        field,
        `'${reference}' does not resolve to an element of the loaded files when written into '${filename}' ` +
          `(LikeC4 would report: Could not resolve reference)`,
      );
    }
    return fqn;
  }

  /** Every element reference of every loaded file that the index resolves (see {@link resolveDocumentReferences}). */
  private referenceResolutions(): Map<string, ReferenceResolution[]> {
    const result = new Map<string, ReferenceResolution[]>();
    for (const [file, doc] of this.documents) result.set(file, resolveDocumentReferences(doc.ast, this.workspace));
    return result;
  }

  /**
   * Throw when declaring element `fqn` changed what an existing reference
   * links to: a reference that resolved before (`before`, taken before the
   * declaration was written) now resolves to another element or not at all.
   * A new name can do that by taking a unique descendant's name out of scope
   * (`api` resolving to `app.api` becomes ambiguous once `other.api` exists)
   * or by shadowing it.  References that did not resolve before are not
   * considered: they are not changed by the call.
   *
   * @throws {InvalidWriteError} on `name`
   */
  private rejectChangedReferences(before: Map<string, ReferenceResolution[]>, fqn: string): void {
    const after = this.referenceResolutions();
    for (const [file, previous] of before) {
      const current = after.get(file) ?? [];
      // Declaring an element adds no reference, so both lists hold the same
      // references in the same order.
      if (current.length !== previous.length || current.some((ref, i) => ref.text !== previous[i]!.text)) {
        throw new Error(`Internal error: the references of '${file}' changed while adding element '${fqn}'`);
      }
      previous.forEach((old, i) => {
        const now = current[i]!.fqn;
        if (old.fqn === undefined || now === old.fqn) return;
        throw new InvalidWriteError(
          'name',
          `declaring '${fqn}' changes what an existing reference links to: the ${old.role} '${old.text}' in '${file}' ` +
            `links to '${old.fqn}' and would ${
              now === undefined
                ? 'no longer resolve (LikeC4 would report: Could not resolve reference)'
                : `link to '${now}' instead`
            }`,
        );
      });
    }
  }

  /** Ids of the views declared in every loaded file. */
  private viewIds(): Set<string> {
    const ids = new Set<string>();
    for (const doc of this.documents.values()) {
      for (const block of (doc.ast.views ?? []) as Array<{ views?: Array<{ name?: string }> }>) {
        for (const view of block.views ?? []) if (view.name) ids.add(view.name);
      }
    }
    return ids;
  }

  /** Latest parsed document of `filename`. */
  private document(filename: string): ParsedDocument {
    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    return doc;
  }

  /**
   * Source ranges of `file` that disappear when element `fqn` (declared in
   * `elementFile`) is removed: the element's own declaration and every
   * `extend` block targeting it or one of its descendants.
   */
  private removedRanges(
    fqn: string,
    elementFile: string,
    file: string,
  ): Array<{ offset: number; end: number }> {
    const ranges = findExtendBlocks(this.document(file), fqn).map((b) => b.range);
    if (file === elementFile) {
      const el = this.queries.get(file)?.getElement(fqn);
      if (el) ranges.push({ offset: el.sourceRange.offset, end: el.sourceRange.end });
    }
    return ranges;
  }

  /**
   * First relation (in file order) that satisfies `isDependent` and is not
   * declared inside a range removed together with element `fqn` (see
   * {@link removedRanges}).
   */
  private findRelationOutsideRemovedRanges(
    fqn: string,
    elementFile: string,
    isDependent: (r: { sourceFqn: string; targetFqn: string }) => boolean,
  ): { filename: string; node: unknown } | null {
    for (const [file, doc] of this.documents) {
      const ranges = this.removedRanges(fqn, elementFile, file);
      for (const rel of resolveRelations(doc.ast, this.workspace)) {
        if (!isDependent(rel)) continue;
        const cst = (rel.node as { $cstNode?: { offset: number; end: number } }).$cstNode;
        if (cst && ranges.some((range) => isWithin(cst, range))) continue;
        return { filename: file, node: rel.node };
      }
    }
    return null;
  }

  /** First `extend` block (in file order) targeting `fqn` or a descendant. */
  private findExtendBlock(
    fqn: string,
  ): { filename: string; block: ExtendBlock } | null {
    for (const [file, doc] of this.documents) {
      const [block] = findExtendBlocks(doc, fqn);
      if (block) return { filename: file, block };
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
    // New text is generated with `\n`; it gets the file's own line ending.
    const updated = applyEdits(current, withLineEnding(edits, lineEndingOf(current)));
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

/** Append `edits` to the group of `file` (empty lists are ignored). */
function addEditGroup(editsByFile: Map<string, TextEdit[]>, file: string, edits: TextEdit[]): void {
  if (edits.length === 0) return;
  editsByFile.set(file, [...(editsByFile.get(file) ?? []), ...edits]);
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

/** True when a body contributes tags, links or metadata. */
function hasContributions(contribution: Decorations): boolean {
  return contribution.tags !== undefined || contribution.links !== undefined || contribution.metadata !== undefined;
}
