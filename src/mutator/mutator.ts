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
import { DeploymentIndex, type DeploymentExtendRef, type DeploymentRelationRef } from '../query/deployment-index.js';
import { ViewIndex, type ViewDeclaration, type ViewStepStatementEntry } from '../query/view-index.js';
import { buildViewInfo } from '../query/view-query.js';
import { contributesSteps, ViewReferenceResolver } from '../query/view-resolver.js';
import {
  DeploymentQuery,
  type DeploymentElementSource,
  type DeploymentInstanceFilter,
  type DeploymentNodeFilter,
  type DeploymentRelationshipFilter,
} from '../query/deployment-query.js';
import { DeploymentResolver } from '../query/deployment-resolver.js';
import {
  compareReferenceSnapshots,
  takeReferenceSnapshot,
  type ReferenceSnapshot,
  type TextRange,
} from '../query/reference-snapshot.js';
import { buildReferenceCatalogue, type ReferenceCatalogue } from '../query/reference-catalogue.js';
import { newNameCaptures, unmodelledInventory, type UnmodelledName, type UnmodelledNameClass } from '../query/unmodelled.js';
import { forEachElementDeclaration, resolveFqnRef } from '../query/fqn.js';
import { isSameHierarchy } from '@likec4/core/utils';
import {
  WorkspaceIndex,
  resolveReferenceText,
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
  DeploymentEndpoint,
  DeploymentInstanceInfo,
  DeploymentNodeInfo,
  DeploymentNodeKindDefaults,
  DeploymentRelationshipInfo,
  ElementInfo,
  RelationshipInfo,
  SpecificationInfo,
  ViewInfo,
  ViewRuleAddress,
  ViewStepAddress,
  ViewStepWriteResult,
  ViewType,
  ViewWriteResult,
} from '../query/types.js';
import type { ParsedDocument } from '../parser/types.js';
import { applyEdits, lineEndingOf, withLineEnding, type TextEdit } from './text-edit.js';
import {
  addElementEdit,
  updateElementEdit,
  updateDeclarationEdits,
  deployedInstanceInlineAnchor,
  deploymentNodeInlineAnchor,
  removeElementEdit,
  findExtendBlocks,
  removeExtendBlockEdit,
  clearExtendContributionsEdits,
  type ExtendBlock,
  type AddElementOpts,
  type UpdateElementPatch,
} from './element-ops.js';
import {
  generateDeployedInstance,
  generateDeploymentExtend,
  generateDeploymentNode,
  generateDeploymentRelationship,
  generateParallel,
  generateStep,
  viewIncludeExpression,
  type ElementStyle,
  type RelationshipStyle,
} from './codegen.js';
import {
  checkEndpointForm,
  checkSelectorForm,
  chooseDeploymentPlacement,
  declarationBodyInsertEdit,
  deploymentInsertEdit,
  instanceDeclaration,
  isInSubtree,
  isNestedInSubtree,
  endpointText,
  extendBlocksIn,
  idsDeclaredIn,
  nodeDeclaration,
  placementContainer,
  relationEndpointInSubtree,
  selectDeploymentRelationship,
  selectExtendBlock,
  viewReferencesIntoSubtree,
  type AddDeploymentExtendOpts,
  type AddDeploymentInstanceOpts,
  type AddDeploymentNodeOpts,
  type AddDeploymentRelationshipOpts,
  type DeploymentExtendSelector,
  type DeploymentRelationshipSelector,
  type UpdateDeploymentInstancePatch,
  type UpdateDeploymentRelationshipPatch,
  type UpdateDeploymentNodePatch,
} from './deployment-ops.js';
import {
  addRelationshipEdit,
  removeRelationNodeEdit,
  selectedRelationshipPatchEdits,
  buildExtendRelationTitleEdit,
  relationPatchEdits,
  type UpdateRelationshipMatcher,
  type UpdateRelationshipPatch,
} from './relationship-ops.js';
import {
  RelationshipAmbiguityError,
  selectRelationship,
  type RelationshipCandidate,
  type RelationshipPosition,
  type RelationshipSelector,
  type SelectedRelationship,
} from './relationship-selector.js';
import {
  addViewEdit,
  addViewRuleEdits,
  removeViewRuleEdit,
  replaceViewRuleEdit,
  describeReferrer,
  extendsParent,
  outsideReferrers,
  removeViewEdit,
  updateViewEdits,
  type GenerateViewOpts,
  type UpdateViewPatch,
} from './view-ops.js';
import { dynamicView, namedView, ruleAt, stepAt } from './view-address.js';
import {
  checkViewStep,
  indentedText,
  insertStepEdits,
  isOwnBoundary,
  leaveParallel,
  removeStatementEdit,
  statementText,
  topLevelInsertion,
  stepInsertion,
  stepText,
  updateStepEdits,
  writtenStep,
  type ViewStepPatch,
  type ViewStepSpec,
} from './step-ops.js';
import { chooseBlockPlacement } from './block-placement.js';
import { checkBraceBalance } from './brace-balance.js';
import { normalizedMetadataValue, type MetadataPatch } from './metadata-ops.js';
import {
  InvalidWriteError,
  checkAutoLayout,
  checkElementName,
  checkKind,
  checkMetadata,
  checkReferenceForm,
  checkStyle,
  checkTags,
  checkLinks,
  checkViewId,
  checkViewRule,
  type ViewRuleText,
} from './write-checks.js';

export type { AddElementOpts, UpdateElementPatch };
export type { AddDeploymentNodeOpts, UpdateDeploymentNodePatch };
export type { AddDeploymentInstanceOpts, UpdateDeploymentInstancePatch };
export type { AddDeploymentRelationshipOpts, DeploymentRelationshipSelector, UpdateDeploymentRelationshipPatch };
export type { AddDeploymentExtendOpts, DeploymentExtendSelector };
export type { ElementStyle };
export type { RelationshipStyle };
export type { UpdateRelationshipMatcher, UpdateRelationshipPatch };
export type { RelationshipCandidate, RelationshipPosition, RelationshipSelector };
export { RelationshipAmbiguityError };

/** Result of {@link LikeC4Mutator.removeRelationship}. */
export interface RemoveRelationshipResult {
  /** Files whose text changed, in load order: the relationship's, and those of removed orphaned `extend` blocks */
  changedFiles: string[];
}

/**
 * Options of {@link LikeC4Mutator.addView}: the view fields of the code
 * generator (`id`, `type`, `target` — the `of` element —, `extends`,
 * `title`, `description`, `includes`, `autoLayout`) and the `file` to write
 * the view to (a loaded file; see {@link LikeC4Mutator.addView}).
 */
export type AddViewOpts = Omit<GenerateViewOpts, 'indent'> & { file?: string };
export type { UpdateViewPatch };
export type { ViewStepPatch, ViewStepSpec };

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
 * Result of {@link LikeC4Mutator.updateDeploymentNode}.
 */
export interface UpdateDeploymentNodeResult {
  /**
   * Files whose text changed, without duplicates, in the order the files
   * were loaded: the file of the node's declaration and files whose
   * `extend <node>` blocks lost tags, links or metadata keys.  Empty when the
   * update changed nothing.  Describes the in-memory state: nothing is
   * written to disk.
   */
  changedFiles: string[];
}

/**
 * Result of {@link LikeC4Mutator.updateDeploymentInstance}.
 */
export interface UpdateDeploymentInstanceResult {
  /**
   * Files whose text changed: the file of the instance's declaration, or
   * none when the update changed nothing.  Describes the in-memory state:
   * nothing is written to disk.
   */
  changedFiles: string[];
}

/**
 * Result of {@link LikeC4Mutator.updateDeploymentRelationship}.
 */
export interface UpdateDeploymentRelationshipResult {
  /**
   * Files whose text changed: the file of the relationship, or none when
   * the update changed nothing.  Describes the in-memory state: nothing is
   * written to disk.
   */
  changedFiles: string[];
}

/**
 * Result of {@link LikeC4Mutator.removeDeploymentNode}.  Lists every
 * deployment relationship removed with the node, as
 * {@link LikeC4Mutator.listDeploymentRelationships} reported it before the
 * removal: endpoints as deployment ids (plus the element FQN when an
 * endpoint steps into an instance's element) and the title.
 */
export interface RemoveDeploymentNodeResult {
  removedRelationships: Array<{ source: DeploymentEndpoint; target: DeploymentEndpoint; title?: string }>;
}

/**
 * Result of {@link LikeC4Mutator.removeDeploymentInstance}: the deployment
 * relationships removed with the instance, as for
 * {@link RemoveDeploymentNodeResult}.
 */
export type RemoveDeploymentInstanceResult = RemoveDeploymentNodeResult;

/**
 * Result of {@link LikeC4Mutator.removeDeploymentExtend}: the deployment
 * relationships removed with the block — those declared in it and those
 * whose endpoint was declared in it — listed as for
 * {@link RemoveDeploymentNodeResult}.
 */
export type RemoveDeploymentExtendResult = RemoveDeploymentNodeResult;

/**
 * Result of {@link LikeC4Mutator.removeDeploymentRelationship}: the one
 * relationship removed, listed as for {@link RemoveDeploymentNodeResult}.
 */
export type RemoveDeploymentRelationshipResult = RemoveDeploymentNodeResult;

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
  /** View index over all documents */
  private views: ViewIndex;
  /** Resolver of view references over the current indices; dropped when they are rebuilt */
  private viewReferenceResolver: ViewReferenceResolver | undefined;
  /** Reference catalogue of the current indices; dropped when they are rebuilt */
  private catalogue: ReferenceCatalogue | undefined;
  /** Unmodelled-name inventory of the current documents; dropped when they are reparsed */
  private unmodelled: UnmodelledName[] | undefined;
  /** Reads of the deployment model */
  private deploymentQuery: DeploymentQuery;

  constructor(files: Record<string, string>) {
    this.parser = new C4Parser();
    this.sources = new Map(Object.entries(files));
    this.documents = new Map();
    this.queries = new Map();
    this.workspace = new WorkspaceIndex([]);
    this.deployments = new DeploymentIndex([]);
    this.views = new ViewIndex([]);
    this.deploymentQuery = this.createDeploymentQuery();
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
   * Tags and links are the values LikeC4 computes for the kind: tags of
   * every comma-separated group in LikeC4's order (the last group first),
   * without duplicates; link labels read as one line.  (The
   * `fromSpecification` of a node reports them as written.)
   *
   * Returns null when no specification declares the kind.
   */
  getDeploymentNodeKind(kind: string): DeploymentNodeKindDefaults | null {
    const spec = this.workspace.deploymentNodeKind(kind);
    if (!spec) return null;
    const { tags: _declaredTags, links: _declaredLinks, ...defaults } = structuredClone(spec.defaults);
    const { tags, links } = structuredClone(spec.contribution);
    return {
      ...defaults,
      ...(tags && { tags }),
      ...(links && { links }),
      ...(spec.style && { style: structuredClone(spec.style as ElementStyle) }),
    };
  }

  /**
   * Return the deployment node with deployment id `id` (parent id + `.` +
   * name, e.g. 'prod.eu.vm1'), with its effective values as LikeC4 computes
   * them and their provenance (see {@link DeploymentNodeInfo}).  Returns null
   * when no node has the id, or when LikeC4 leaves the node out of its model:
   * a node of a kind no specification declares, a node below one, or a node
   * declared in an `extend` block of a node that does not exist.  An id
   * declared more than once (a LikeC4 error) is reported from its first
   * declaration in LikeC4 document order.
   */
  getDeploymentNode(id: string): DeploymentNodeInfo | null {
    return this.deploymentQuery.node(id);
  }

  /**
   * List deployment nodes of every file, in LikeC4 document order (a parent
   * before its children), optionally filtered by kind (as written) and by
   * parent id (direct children only).  An id declared more than once is
   * listed once per declaration.
   */
  listDeploymentNodes(opts?: DeploymentNodeFilter): DeploymentNodeInfo[] {
    return this.deploymentQuery.listNodes(opts);
  }

  /**
   * Return the instance with deployment id `id` (its node's id + `.` + name,
   * e.g. 'prod.vm1.api'), with its effective values — its own, otherwise
   * those of its element — and their provenance (see
   * {@link DeploymentInstanceInfo}).  Returns null when no instance has the
   * id, or when its `instanceOf` target does not resolve (LikeC4 drops such
   * an instance).  An id declared more than once (a LikeC4 error) is
   * reported from its first declaration in LikeC4 document order.
   */
  getDeploymentInstance(id: string): DeploymentInstanceInfo | null {
    return this.deploymentQuery.instance(id);
  }

  /**
   * List instances of every file, in LikeC4 document order, optionally
   * filtered by the node that holds them (direct instances only) and by the
   * FQN of their element (as resolved, not as written).  An id declared more
   * than once is listed once per declaration.
   */
  listDeploymentInstances(opts?: DeploymentInstanceFilter): DeploymentInstanceInfo[] {
    return this.deploymentQuery.listInstances(opts);
  }

  /**
   * List the relationships of the deployment model of every file (not
   * those of the logical model, which {@link getRelationships} returns), in
   * LikeC4 document order, then source order.  Endpoints are deployment ids,
   * plus the element FQN when an endpoint steps into an instance's element
   * (`prod.db.replLog`).  A relationship whose endpoint does not resolve is
   * not listed, as LikeC4 drops it.
   *
   * @param opts.source - Only relationships from this node or instance; an
   *                      instance id also matches sources that step into its element
   * @param opts.target - Only relationships to this node or instance, as for `source`
   * @param opts.kind   - Only relationships of this kind
   */
  listDeploymentRelationships(opts?: DeploymentRelationshipFilter): DeploymentRelationshipInfo[] {
    return this.deploymentQuery.listRelationships(opts);
  }

  /**
   * List every view declaration of every file, in LikeC4 document order,
   * then source order, optionally filtered by type and by file (an exact
   * file name).  Values are the view's own (see {@link ViewInfo}): no
   * `extends` inheritance, no folder prefix in the title.  An unnamed
   * element view is listed with `id: null`; a declaration without a body
   * with `inModel: false`; an id declared more than once (a LikeC4 error)
   * once per declaration.  Views LikeC4 generates (an `index` that is not
   * declared, implicit views) are not listed.
   */
  listViews(opts?: { type?: ViewType; file?: string }): ViewInfo[] {
    const resolver = this.viewResolver();
    return this.views
      .declarations()
      .filter((view) => (opts?.type === undefined || view.type === opts.type) && (opts?.file === undefined || view.file === opts.file))
      .map((view) => buildViewInfo(view, resolver));
  }

  /**
   * Return the view declared with id `id` (see {@link listViews} for its
   * values); null for an unknown id and for the id LikeC4 generates for an
   * unnamed view.  An id declared more than once is reported from its first
   * declaration in LikeC4 document order.
   */
  getView(id: string): ViewInfo | null {
    const view = this.views.declarationsOf(id)[0];
    return view ? buildViewInfo(view, this.viewResolver()) : null;
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
   * The write is rejected with an `InvalidWriteError` on `name`, with no
   * file changed, when the new element would change what an existing
   * reference links to, or when a construct the library does not resolve
   * (a `global` block, an import, an opaque flow block of a dynamic view,
   * text the parser could not recover) names the new name as a bare
   * identifier or as the leading segment of a dotted name (FR-004, D107).
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
    this.rejectCapturedName(opts.name, 'element', 'name', `an element named '${opts.name}'`);

    const doc = this.documents.get(filename);
    if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
    const edit = addElementEdit(doc, parentFqn, opts);
    const before = this.referenceSnapshot();
    const snapshot = this.snapshot();
    try {
      this.applyEdit(filename, edit);
      this.rejectChangedReferences(before, new Map([[filename, insertedRanges(doc.fullText, [edit])]]), fqn);
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
   * The removal is rejected, with no file changed, while the deployment
   * model refers to the element or one of its descendants: as the element of
   * an instance (`instanceOf`), or as the element part of a deployment
   * relationship endpoint that steps into an instance's element.
   *
   * @param fqn - FQN of the element to remove
   * @returns The relationships that were removed.
   * @throws {InvalidWriteError} on `fqn` when the deployment model refers to
   *   the element or its subtree, listing the instances and endpoints
   */
  removeElement(fqn: string): RemoveElementResult {
    const filename = this.findFileContaining(fqn);
    if (!filename) throw new Error(`Element '${fqn}' not found in any file`);
    this.rejectDeploymentReferences(fqn);

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
   * The relationship is the one `selector` addresses (see
   * {@link selectRelationship}): no match is an `InvalidWriteError` on
   * `source` (on `position` when a position is given); more than one is a
   * {@link RelationshipAmbiguityError} on `source` listing every candidate
   * with its 1-based position, which selects it when passed back.
   *
   * @param selector - Source/target plus optional matchKind, matchTitle, matchBidirectional and position
   * @param patch    - Update payload (at least one field must be specified)
   * @returns The files that changed.
   */
  updateRelationship(selector: RelationshipSelector, patch: UpdateRelationshipPatch): UpdateRelationshipResult {
    checkTags(patch.tags, this.workspace);
    checkStyle(patch.style, 'relationship', this.workspace);
    const { file: filename, relation } = this.selectRelationship(selector);
    const doc = this.document(filename);
    const relationEdits = selectedRelationshipPatchEdits(doc, relation.node, patch);

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
   * Remove the relationship `selector` addresses (see
   * {@link selectRelationship}); `removeRelationship(source, target)` is the
   * selector with endpoints only.
   *
   * Endpoints are compared as absolute FQNs (`app.api` matches `api` written
   * inside `app { ... }`), a bidirectional relationship in either order; when
   * no relationship matches by FQN, the reference text as written is compared
   * instead.  Every loaded file is searched.  No match is an
   * `InvalidWriteError` on `source` (on `position` when a position is
   * given); more than one is a {@link RelationshipAmbiguityError} on `source`
   * listing every candidate with its 1-based position, which selects it when
   * passed back (D70, D81, D87).  Both leave every file unchanged.
   *
   * `extend a -> b { ... }` blocks that applied to the removed relationship
   * and apply to no remaining one are removed too, in every loaded file: they
   * only decorated it (LikeC4 would warn that they match no relation).
   * Blocks that matched nothing before are left alone.  The operation is
   * atomic: when any step fails, no file is changed.
   *
   * @returns The files that changed, in load order.
   */
  removeRelationship(selector: RelationshipSelector): RemoveRelationshipResult;
  /**
   * @param source - Source FQN (or reference text as written)
   * @param target - Target FQN (or reference text as written)
   */
  removeRelationship(source: string, target: string): RemoveRelationshipResult;
  removeRelationship(selectorOrSource: RelationshipSelector | string, target?: string): RemoveRelationshipResult {
    const selector: RelationshipSelector =
      typeof selectorOrSource === 'string' ? { source: selectorOrSource, target: target ?? '' } : selectorOrSource;
    const { file: filename, relation } = this.selectRelationship(selector);
    const edit = removeRelationNodeEdit(this.document(filename).fullText, relation.node);
    const keys = this.relationKeys((rel) => rel.node === relation.node);

    const snapshot = this.snapshot();
    try {
      this.applyEdit(filename, edit);
      this.removeOrphanedExtendRelations(keys, () => false);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return { changedFiles: [...this.sources].filter(([file, text]) => snapshot.sources.get(file) !== text).map(([file]) => file) };
  }

  /**
   * Add a new view.
   *
   * **Placement (D27, D41).**  With `opts.file` (a loaded file) the view is
   * appended to that file's first `views` block, or to a new `views` block at
   * its end.  Without it: the first `views` block of the first file, in
   * LikeC4's document order, that has one; else a new block at the end of
   * the first file with a `model` block; else of the first file.
   *
   * **Header.**  An element view is `view <id> of <target>`, `view <id>
   * extends <parent>` or `view <id>`; the body holds the title, the
   * description (single-line text), one `include` rule per `includes` item
   * (`include *` for an element view without items) and the `autoLayout`
   * directive (`TopBottom` unless `autoLayout` is `''` or `null`).
   *
   * The write is rejected, with no file changed, when:
   *  - `id` is not one identifier, is reserved, or is already declared in a
   *    loaded file, or a construct the library does not resolve (a `global`
   *    block, an opaque flow block, text the parser could not recover)
   *    names it as a bare view reference (FR-004, D107) — field `id`;
   *  - `target` is not an element reference, or does not resolve in the
   *    chosen file — `target`;
   *  - `extends` is given together with `target`, on a dynamic or deployment
   *    view, or names no declared element view with a body, or the parent's
   *    `extends` chain leads back to `id` (LikeC4 drops such views) —
   *    `extends`;
   *  - `file` is not a loaded file — `file`;
   *  - an `includes` item is not one include rule LikeC4 applies in the new
   *    view, as {@link LikeC4Mutator.addViewRule} checks rules (references
   *    resolved in the chosen file with the `of` element's, or the
   *    `extends` parent's, scope; declared kinds, tags and colors; no
   *    construct LikeC4 drops) — `includes[i]`;
   *  - `autoLayout` is not a layout directive — `autoLayout`.
   *
   * A view reference that did not resolve before (a `navigateTo` or
   * `extends` naming `id`) resolving afterwards is not a change.
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
    this.rejectCapturedName(opts.id, 'view', 'id', `a view '${opts.id}'`);
    const target = opts.type === 'element' && opts.target !== undefined && opts.target !== '' ? opts.target : undefined;
    if (target !== undefined) checkReferenceForm(target, 'target');
    const parentId = opts.extends !== undefined && opts.extends !== '' ? opts.extends : undefined;
    if (parentId !== undefined) {
      if (opts.type !== 'element') {
        throw new InvalidWriteError('extends', `a ${opts.type} view cannot extend another view; only element views extend element views`);
      }
      if (target !== undefined) {
        throw new InvalidWriteError('extends', `a view cannot have both 'of' (target '${target}') and 'extends': LikeC4's grammar allows one of them`);
      }
      checkViewId(parentId, 'extends');
    }
    checkAutoLayout(opts.autoLayout);
    const placement = chooseBlockPlacement('views', this.documents, opts.file);
    const filename = placement.file;
    const doc = this.document(filename);
    const frame = target !== undefined ? this.resolveWritten(doc, filename, target, 'target', 'views') : undefined;
    const parent = parentId !== undefined ? extendsParent(this.views, opts.id, parentId) : undefined;

    const document = this.views.documents.findIndex((d) => d.file === filename);
    const resolver = this.viewResolver();
    const place = { type: opts.type, document, frame: frame ?? (parent ? resolver.frame(parent) : undefined) };
    opts.includes?.forEach((item, i) => {
      const field = `includes[${i}]`;
      const expression = typeof item === 'string' ? viewIncludeExpression(item) : undefined;
      if (expression === undefined) {
        throw new InvalidWriteError(
          field,
          `${JSON.stringify(item)} is not exactly one include rule of a ${opts.type} view: expected its predicates, such as '*' or 'app.api, app.db'`,
        );
      }
      checkViewRule({ kind: 'include', expression }, place, resolver, this.workspace, { kind: field, expression: field });
    });

    const { file: _file, ...view } = opts;
    const edit = addViewEdit(doc, placement, {
      ...view,
      ...(target === undefined && { target: undefined }),
      ...(parentId === undefined && { extends: undefined }),
    });
    const before = this.referenceSnapshot();
    const snapshot = this.snapshot();
    try {
      refusedOn('file', () => this.applyEdit(filename, edit));
      this.rejectChangedReferences(
        before,
        new Map([[filename, insertedRanges(doc.fullText, [edit])]]),
        opts.id,
        { field: 'id', action: 'adding the view' },
      );
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  /**
   * Update the own properties of the named view `id` (US-6, D33):
   *  - `title`, `description`: REPLACE; `null` removes the property, `''` is
   *    written as an empty string;
   *  - `tags`, `links`: REPLACE the whole list (`[]` removes them);
   *  - `autoLayout`: replaces the last `autoLayout` rule in place (the one
   *    LikeC4 uses), or is appended as the last rule; `null` removes every
   *    `autoLayout` rule.
   *
   * Properties are written where the grammar puts them — tags open the body,
   * the other properties follow the tags and precede the first rule or step
   * — and a declaration without a body gets one.  Text and comments outside
   * the replaced values are kept.  Unlike element writes, the update is
   * allowed while other loaded files have syntax errors (D42); an edit that
   * would leave the view's own file unparsable is refused.
   *
   * @returns `{ changedFiles }`: the view's file, or none when nothing changed
   * @throws {InvalidWriteError} on `id` (not exactly one named view),
   *   `title` / `description` (not a string or null), `tags` / `tags[i]`
   *   (not an array, an undeclared tag), `links` / `links[i].url`
   *   (not an array, an invalid URL), `autoLayout` (not a layout directive)
   */
  updateView(id: string, patch: UpdateViewPatch): ViewWriteResult {
    const view = namedView(this.views, id);
    if (typeof patch !== 'object' || patch === null) {
      throw new InvalidWriteError('patch', `expected an object of view properties, got ${JSON.stringify(patch)}`);
    }
    for (const key of ['title', 'description'] as const) {
      const value: unknown = patch[key];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new InvalidWriteError(key, `${JSON.stringify(value)} is not a string (null removes the property)`);
      }
    }
    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags)) throw new InvalidWriteError('tags', `expected an array of tags, got ${JSON.stringify(patch.tags)}`);
      checkTags(patch.tags, this.workspace);
    }
    if (patch.links !== undefined) {
      if (!Array.isArray(patch.links)) throw new InvalidWriteError('links', `expected an array of links, got ${JSON.stringify(patch.links)}`);
      checkLinks(patch.links);
    }
    if (patch.autoLayout !== undefined && patch.autoLayout !== null) {
      if (patch.autoLayout === '') {
        throw new InvalidWriteError('autoLayout', "'' is not a layout directive; null removes every autoLayout rule");
      }
      checkAutoLayout(patch.autoLayout);
    }
    const file = view.file;
    if (file === undefined) throw new Error(`Internal error: view '${id}' has no file`);
    const before = this.document(file).fullText;
    const edits = updateViewEdits(this.document(file), view, patch);
    if (edits.length > 0) refusedOn('id', () => this.applyEditsToFile(file, edits));
    return { changedFiles: this.sources.get(file) === before ? [] : [file] };
  }

  /**
   * Remove the declaration of the named view `id` and nothing else (US-8).
   * A manual layout snapshot of the view, if one exists, is not touched.
   *
   * Rejected on `id`, with nothing changed, when `id` is not exactly one
   * named view, or while LikeC4 links a reference outside the declaration to
   * the view (D26): `extends` of an element view, a `navigateTo` in an
   * element predicate's `with` (any view), or in a relation predicate's
   * `with`, a dynamic step, a relationship or deployment relationship body
   * (a dynamic view).  The error lists every such reference with its file
   * and line.  References inside the declaration itself — a view navigating
   * to itself — are removed with it and do not block (D43).
   *
   * @returns `{ changedFiles }`: the view's file
   */
  removeView(id: string): ViewWriteResult {
    const view = namedView(this.views, id);
    const referrers = outsideReferrers(this.views, view);
    if (referrers.length > 0) {
      throw new InvalidWriteError(
        'id',
        `view '${id}' is referenced, and LikeC4 would no longer resolve these references: ${referrers.map(describeReferrer).join(', ')}`,
      );
    }
    const file = view.file;
    if (file === undefined) throw new Error(`Internal error: view '${id}' has no file`);
    const edit = removeViewEdit(this.document(file), view);
    const before = this.referenceSnapshot(new Set([view.node]));
    const snapshot = this.snapshot();
    try {
      refusedOn('id', () => this.applyEdit(file, edit));
      this.rejectChangedReferences(before, new Map(), id, { field: 'id', action: 'removing the view' });
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return { changedFiles: [file] };
  }

  /**
   * Add an `include` / `exclude` rule, given as its kind and the expression
   * written after the keyword (D23), to the named view `id` (US-7).
   *
   * Placed before the rule at `opts.before` (`{ index, text? }`, see
   * {@link ViewRuleAddress}); by default after the last item of the body,
   * or before it when that item is an `autoLayout` rule — in a dynamic view
   * after the last step.  A declaration without a body gets one.
   *
   * The rule must be one LikeC4 applies at that place: one rule of a kind
   * the view type has (`exclude` is not a dynamic view rule; `with` is not
   * applied in deployment views), references resolved in the view's scope
   * (its `of` element, its `extends` parent's, its document; deployment
   * views: nodes and instances, a logical element only inside a relation
   * predicate of an `exclude`), declared kinds, tags and custom colors,
   * typed `navigateTo` targets, and none of the items LikeC4 drops (see
   * {@link LikeC4Mutator.addView}).
   *
   * @returns `{ changedFiles }`: the view's file
   * @throws {InvalidWriteError} on `id`, `before.index` / `before.text`,
   *   `rule.kind` or `rule.expression`
   */
  addViewRule(id: string, rule: ViewRuleText, opts: { before?: ViewRuleAddress } = {}): ViewWriteResult {
    const view = namedView(this.views, id);
    const before = opts.before === undefined ? undefined : ruleAt(view, opts.before, 'before');
    this.checkRule(view, rule);
    const file = this.viewFile(view);
    const edits = addViewRuleEdits(this.document(file), view, `${rule.kind} ${rule.expression}`, before?.node.$cstNode?.offset);
    this.writeViewEdits(file, edits, new Set(), 'rule.expression');
    return { changedFiles: [file] };
  }

  /**
   * Replace the rule at `address` (`{ index, text? }`) of the named view
   * `id` — of any kind, `autoLayout` and stage-6 rules included — with an
   * `include` / `exclude` rule, checked as {@link LikeC4Mutator.addViewRule}
   * checks it.
   *
   * @returns `{ changedFiles }`: the view's file
   * @throws {InvalidWriteError} on `id`, `address.index` / `address.text`,
   *   `rule.kind` or `rule.expression`
   */
  replaceViewRule(id: string, address: ViewRuleAddress, rule: ViewRuleText): ViewWriteResult {
    const view = namedView(this.views, id);
    const old = ruleAt(view, address, 'address');
    this.checkRule(view, rule);
    const file = this.viewFile(view);
    this.writeViewEdits(file, [replaceViewRuleEdit(old.node, `${rule.kind} ${rule.expression}`)], new Set([old.node]), 'rule.expression');
    return { changedFiles: [file] };
  }

  /**
   * Remove the rule at `address` (`{ index, text? }`) of the named view
   * `id`: any kind of rule, `autoLayout` and the stage-6 rules included
   * (D30), with the lines it fills; a trailing comma goes with it.
   *
   * @returns `{ changedFiles }`: the view's file
   * @throws {InvalidWriteError} on `id`, `address.index` / `address.text`
   */
  removeViewRule(id: string, address: ViewRuleAddress): ViewWriteResult {
    const view = namedView(this.views, id);
    const old = ruleAt(view, address, 'address');
    const file = this.viewFile(view);
    this.writeViewEdits(file, [removeViewRuleEdit(this.document(file), old.node)], new Set([old.node]), 'address');
    return { changedFiles: [file] };
  }

  /**
   * Add a step to the named dynamic view `id` (US-9), written as a single
   * step statement: `source -> target`, `source -[kind]-> target` or
   * `source .kind target`, and `target <- source` for a backward step (D36),
   * with its title after the target and the other fields in its body.
   *
   * `opts.path` is the insertion boundary (D24): `[i]` before top-level
   * statement `i` (`[n]` after the last one), `[i, j]` before statement `j`
   * of the `par` block at `i` (`[i, n]` at its end).  By default the step goes
   * right after the last top-level step statement.  A declaration without a
   * body gets one.
   *
   * Rejected, with nothing changed: an `id` that names no view, an unnamed
   * view, a view declared more than once or a view that is not a dynamic view
   * (`id`); an endpoint that does not
   * resolve in the view's document — a name unique there, or qualified
   * (`step.source`, `step.target`); endpoints that are a parent and its
   * descendant (`step.target`); an undeclared kind, or a
   * kind on a backward step, which no connector writes (`step.kind`); a
   * `navigateTo` that is not a dynamic view (`step.navigateTo`); an invalid
   * style value (`step.color`, `step.line`, `step.head`, `step.tail`); a
   * path that does not exist or leads into a chain or a stage-6 block
   * (`path`).
   *
   * @returns `{ changedFiles }`: the view's file
   */
  addViewStep(id: string, step: ViewStepSpec, opts: { path?: number[] } = {}): ViewWriteResult {
    const view = dynamicView(this.views, id);
    const insertion = stepInsertion(view, opts.path);
    const fields = checkViewStep(view, step, this.viewResolver(), this.workspace, 'step');
    const file = this.viewFile(view);
    this.writeViewEdits(file, insertStepEdits(this.document(file), view, insertion, stepText(fields)), new Set(), 'step');
    return { changedFiles: [file] };
  }

  /**
   * Patch the step at `address` of the named dynamic view `id` in place
   * (US-10): a single step (`{ path, text? }`) or one segment of a chain
   * (`{ path, segment, text? }`).  Each field of `patch` replaces the step's
   * value — `null` removes an optional one (`kind`, `title`, a body string,
   * `navigateTo`, a style field) — and only the tokens it concerns are
   * rewritten: the references, the connector, the inline title, one body
   * property.  `source`, `target` and `direction` are meant as for
   * {@link LikeC4Mutator.addViewStep}; turning a step backward writes it
   * `target <- source`.
   *
   * On a segment of a chain only the title, the kind, body strings,
   * `navigateTo` and style change: its endpoints and direction belong to the
   * chain (D31).  A step that would end up backward with a kind is rejected
   * (D38), unless the same patch removes the kind or makes it forward.
   *
   * Rejected, with nothing changed: `id` as for {@link LikeC4Mutator.addViewStep}, a view that is not a dynamic view included; a
   * path that is not a step or chain, or a `text` that does not match
   * (`path`, `segment`, `text`); a patched value as `addViewStep` rejects
   * it, on `patch.<field>`; an endpoint or direction change on a chain
   * segment (`patch.<field>`).
   *
   * @returns `{ changedFiles }`: the view's file, or none when nothing changed
   */
  updateViewStep(id: string, address: ViewStepAddress, patch: ViewStepPatch): ViewWriteResult {
    const view = dynamicView(this.views, id);
    const { statement, segment } = stepAt(view, address, '');
    if (statement.form !== 'step' && statement.form !== 'chain') {
      throw new InvalidWriteError('path', `${JSON.stringify(address.path)} is a ${statement.form === 'parallel' ? 'par' : (statement.keyword ?? 'stage-6')} block, not a step`);
    }
    if (statement.form === 'chain' && !segment) {
      throw new InvalidWriteError('segment', `${JSON.stringify(address.path)} is a chain of ${statement.segments.length} segments: address one segment by its number`);
    }
    if (typeof patch !== 'object' || patch === null) {
      throw new InvalidWriteError('patch', `expected an object of step fields, got ${JSON.stringify(patch)}`);
    }
    const node = (segment ?? statement.segments[0]!).node;
    const step = writtenStep(node);
    const text = (ref: { $cstNode?: { text?: string } } | undefined): string => ref?.$cstNode?.text ?? '';
    const left = step.left ? text(step.left) : undefined;
    const right = text(step.right);
    // The current interaction in LikeC4's sense; a later chain segment goes from the previous one's target.
    const previous = node.source as { target?: { $cstNode?: { text?: string } } } | undefined;
    const source = left === undefined ? text(previous?.target) : step.backward ? right : left;
    const target = left === undefined ? right : step.backward ? left : right;
    const direction = step.backward ? 'backward' : 'forward';

    if (statement.form === 'chain') {
      const changed = { source: patch.source !== undefined && patch.source !== source, target: patch.target !== undefined && patch.target !== target, direction: patch.direction !== undefined && patch.direction !== direction };
      for (const key of ['source', 'target', 'direction'] as const) {
        if (changed[key]) {
          throw new InvalidWriteError(
            `patch.${key}`,
            `segment ${segment!.segment} belongs to the chain at ${JSON.stringify(address.path)}: its endpoints and direction are the chain's; only its title, kind, body strings, navigateTo and style can change`,
          );
        }
      }
    }
    const final = {
      source: patch.source ?? source,
      target: patch.target ?? target,
      direction: patch.direction ?? direction,
      kind: patch.kind === null ? undefined : (patch.kind ?? step.kind),
      kindForm: patch.kindForm ?? step.kindForm ?? 'bracket',
    } as const;
    if (patch.kindForm !== undefined && final.kind === undefined) {
      throw new InvalidWriteError('patch.kindForm', 'the step has no kind to write in that form');
    }
    const patched = new Set(Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined));
    const values = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null && value !== undefined));
    checkViewStep(
      view,
      { ...values, source: final.source, target: final.target, direction: final.direction, ...(final.kind !== undefined && { kind: final.kind, kindForm: final.kindForm }) },
      this.viewResolver(),
      this.workspace,
      'patch',
      patched,
    );
    const backward = final.direction === 'backward';
    const update = updateStepEdits(this.document(this.viewFile(view)), node, patch, {
      ...(left !== undefined && { left: backward ? final.target : final.source }),
      right: left === undefined ? right : backward ? final.source : final.target,
      backward: left !== undefined && backward,
      ...(final.kind !== undefined && { kind: final.kind }),
      kindForm: final.kindForm,
    });
    const file = this.viewFile(view);
    if (update.edits.length === 0) return { changedFiles: [] };
    this.writeViewEdits(file, update.edits, update.removed, 'patch');
    return { changedFiles: [file] };
  }

  /**
   * Move the step statement at `from` — a single step, a whole chain, a
   * `par` block or a stage-6 block — to the boundary `to` of the named
   * dynamic view `id` (US-11, D37).  Both are paths in the view as it is
   * before the move: `to` is "before the statement at this path" (`[n]`
   * after the last top-level statement, `[i, n]` at the end of the `par`
   * block at `i`).  A move to the statement's own boundary (`to` equal to
   * `from` or to the next path at its level) changes nothing.
   *
   * Leaving a `par` block (D40): a block the move empties is removed in the
   * same write and its pre-write path reported in `removedParallelBlocks`; a
   * move that would leave it holding only statements LikeC4 discards (such
   * as an empty `opt { }`) is rejected on `from`, naming the block.
   *
   * Rejected, with nothing changed: `id` as for {@link LikeC4Mutator.addViewStep}, a view that is not a dynamic view included; a
   * `from` that does not exist or a `text` that does not match (`from`,
   * `text`); a single segment of a chain (`segment`); a `to` that does not
   * exist, lies inside the moved statement, or puts a `par` block into a
   * `par` block (`to`; LikeC4: Nested parallel blocks are not allowed).
   */
  moveViewStep(id: string, from: ViewStepAddress, to: number[]): ViewStepWriteResult {
    const view = dynamicView(this.views, id);
    const source = this.statementAddress(view, from, 'from');
    const insertion = stepInsertion(view, to, 'to');
    const fromPath = source.statement.path!;
    if (isOwnBoundary(fromPath, to)) return { changedFiles: [], removedParallelBlocks: [] };
    if (insertion.parallel === source.statement) {
      throw new InvalidWriteError('to', `${JSON.stringify(to)} lies inside the moved statement at ${JSON.stringify(fromPath)}`);
    }
    if (source.statement.form === 'parallel' && insertion.parallel) {
      throw new InvalidWriteError('to', `${JSON.stringify(to)} is inside a par block: a par block cannot go into a par block (LikeC4: Nested parallel blocks are not allowed)`);
    }
    const file = this.viewFile(view);
    const doc = this.document(file);
    const removedParallelBlocks: number[][] = [];
    let removedNode = source.statement.node;
    let target = insertion;
    if (source.parent && insertion.parallel !== source.parent) {
      if (leaveParallel(view, source.parent, source.statement, this.viewResolver(), 'from') === 'remove') {
        removedNode = source.parent.node;
        removedParallelBlocks.push(source.parent.path!);
        if (target.before === source.parent) {
          const next = view.steps[view.steps.indexOf(source.parent) + 1];
          target = next ? { before: next } : {};
        }
      }
    }
    const edits = insertStepEdits(doc, view, target, indentedText(statementText(doc, source.statement)), [removeStatementEdit(doc, removedNode)]);
    this.writeViewEdits(file, edits, new Set(), 'to');
    return { changedFiles: [file], removedParallelBlocks };
  }

  /**
   * Remove the step statement at `address` of the named dynamic view `id`
   * (US-11): a single step, a whole chain, a `par` block with its contents
   * or a stage-6 block, with the lines it fills.  A `par` block the removal
   * empties goes with it and is reported in `removedParallelBlocks` (its
   * pre-write path); a removal that would leave the block holding only
   * statements LikeC4 discards is rejected on `address`, naming the block
   * (D40).
   *
   * Rejected, with nothing changed: `id` as for {@link LikeC4Mutator.addViewStep}, a view that is not a dynamic view included; an
   * `address` that does not exist or a `text` that does not match
   * (`address`, `text`); a single segment of a chain (`segment`, D31).
   */
  removeViewStep(id: string, address: ViewStepAddress): ViewStepWriteResult {
    const view = dynamicView(this.views, id);
    const target = this.statementAddress(view, address, 'address');
    const removedParallelBlocks: number[][] = [];
    let node = target.statement.node;
    if (target.parent && leaveParallel(view, target.parent, target.statement, this.viewResolver(), 'address') === 'remove') {
      node = target.parent.node;
      removedParallelBlocks.push(target.parent.path!);
    }
    const file = this.viewFile(view);
    this.writeViewEdits(file, [removeStatementEdit(this.document(file), node)], new Set([node]), 'address');
    return { changedFiles: [file], removedParallelBlocks };
  }

  /**
   * Write a new `par` block into the named dynamic view `id` (US-11, D40) at
   * the top-level boundary `opts.path` (a pre-move path; by default after
   * the last top-level statement).  The block holds the existing top-level
   * statements at `opts.statements` (pre-move paths), moved in the order
   * given, then the new steps `opts.steps` (each as `addViewStep` takes and
   * checks it), in the order given.  Rules between moved statements stay
   * where they are.
   *
   * Rejected, with nothing changed: `id` as for {@link LikeC4Mutator.addViewStep}, a view that is not a dynamic view included; no
   * statement and no step, or a block that would contribute no step to
   * LikeC4, which drops such a block (`statements`); a statement path that
   * is not top-level, does not exist, repeats one before it or addresses a
   * `par` block (`statements[i]`); an invalid step (`steps[i].<field>`); a
   * `path` that is not a top-level boundary (`path`).
   */
  addViewParallel(
    id: string,
    opts: { path?: number[]; statements?: number[][]; steps?: ViewStepSpec[] } = {},
  ): ViewWriteResult {
    const view = dynamicView(this.views, id);
    const statements = opts.statements ?? [];
    const steps = opts.steps ?? [];
    if (!Array.isArray(statements)) throw new InvalidWriteError('statements', `expected a list of top-level paths, got ${JSON.stringify(statements)}`);
    if (!Array.isArray(steps)) throw new InvalidWriteError('steps', `expected a list of steps, got ${JSON.stringify(steps)}`);
    if (statements.length + steps.length === 0) {
      throw new InvalidWriteError('statements', 'a par block needs at least one statement or step: LikeC4 drops an empty block');
    }
    const moved: ViewStepStatementEntry[] = [];
    statements.forEach((path, i) => {
      const field = `statements[${i}]`;
      if (!Array.isArray(path) || path.length !== 1 || !Number.isInteger(path[0]) || path[0]! < 0) {
        throw new InvalidWriteError(field, `${JSON.stringify(path)} is not a top-level path [i]: only top-level statements go into a new par block`);
      }
      const entry = view.steps[path[0]!];
      if (!entry) throw new InvalidWriteError(field, `${JSON.stringify(path)}: view '${id}' has ${view.steps.length} top-level step statement(s)`);
      if (entry.form === 'parallel') {
        throw new InvalidWriteError(field, `${JSON.stringify(path)} is a par block: a par block cannot go into a par block (LikeC4: Nested parallel blocks are not allowed)`);
      }
      if (moved.includes(entry)) throw new InvalidWriteError(field, `${JSON.stringify(path)} is given twice`);
      moved.push(entry);
    });
    const resolver = this.viewResolver();
    const fields = steps.map((step, i) => checkViewStep(view, step, resolver, this.workspace, `steps[${i}]`));
    if (fields.length === 0 && !moved.some((entry) => contributesSteps(entry, view, resolver))) {
      throw new InvalidWriteError(
        'statements',
        'the new par block would contribute no step: none of its statements gives LikeC4 a step, so LikeC4 would drop the block',
      );
    }
    const insertion = topLevelInsertion(view, opts.path, new Set(moved), 'path');
    const file = this.viewFile(view);
    const doc = this.document(file);
    const texts = [...moved.map((entry) => statementText(doc, entry)), ...fields.map((f) => generateStep({ indent: '', ...f }))];
    const edits = insertStepEdits(doc, view, insertion, (indent) => generateParallel(indent, texts), moved.map((entry) => removeStatementEdit(doc, entry.node)));
    this.writeViewEdits(file, edits, new Set(), 'statements');
    return { changedFiles: [file] };
  }

  /**
   * The statement at a step address of a move or removal: a statement, not a
   * chain segment (D31); path errors are reported on `field`.
   */
  private statementAddress(view: ViewDeclaration, address: ViewStepAddress, field: string): ReturnType<typeof stepAt> {
    let found: ReturnType<typeof stepAt>;
    try {
      found = stepAt(view, address, '');
    } catch (err) {
      if (err instanceof InvalidWriteError && err.field === 'path') throw new InvalidWriteError(field, err.detail);
      throw err;
    }
    if (found.segment) {
      throw new InvalidWriteError('segment', `segment ${found.segment.segment} belongs to the chain at ${JSON.stringify(address.path)}: a chain is moved or removed whole`);
    }
    return found;
  }

  /** `checkViewRule` of `rule` in the body of `view`, with the rule writers' fields. */
  private checkRule(view: ViewDeclaration, rule: ViewRuleText): void {
    if (typeof rule !== 'object' || rule === null) {
      throw new InvalidWriteError('rule', `expected a rule { kind, expression }, got ${JSON.stringify(rule)}`);
    }
    checkViewRule(rule, view, this.viewResolver(), this.workspace, { kind: 'rule.kind', expression: 'rule.expression' });
  }

  /** The file the declaration `view` is written in. */
  private viewFile(view: ViewDeclaration): string {
    if (view.file === undefined) throw new Error(`Internal error: view '${view.id}' has no file`);
    return view.file;
  }

  /**
   * Apply the edits of a view write to `file`, guarded by the reference
   * snapshot with view references (INV-8): `removed` holds the AST nodes the
   * write deletes on purpose; a reference that would link elsewhere
   * afterwards rejects the write on `field`, with nothing changed, as does an
   * edit the file's parser refuses.
   */
  private writeViewEdits(file: string, edits: TextEdit[], removed: ReadonlySet<object>, field: string): void {
    const doc = this.document(file);
    const before = this.referenceSnapshot(removed);
    const snapshot = this.snapshot();
    try {
      refusedOn(field, () => this.applyEditsToFile(file, edits));
      this.rejectChangedReferences(
        before,
        new Map([[file, insertedRanges(doc.fullText, edits)]]),
        file,
        { field, action: `writing into '${file}'` },
      );
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Deployment model writes
  // ---------------------------------------------------------------------------

  /**
   * Add a deployment node as a child of node `parentId`, or as a root node
   * when `parentId` is null.  The node is written in the `name = kind` form,
   * with the title inline and summary, description, technology, tags,
   * links, style and metadata in its body.
   *
   * A child node is written at the end of the body of its parent's
   * declaration (a body `{ ... }` is created when the declaration has none),
   * also when the parent has children in `extend` blocks.  A root node is
   * written into a `deployment` block chosen by `opts.file` and LikeC4's
   * document order (see {@link chooseDeploymentPlacement}); a new block is
   * created when there is none.
   *
   * The write is rejected, with no file changed, when:
   *  - `name` is not one identifier or is reserved, or a node or instance of
   *    any loaded file already has the new id (children declared in `extend`
   *    blocks included) — field `name`;
   *  - `kind` is not declared as a deployment node kind — `kind`;
   *  - a tag is not declared, or a style value is invalid — `tags[i]`,
   *    `style.<field>`;
   *  - `parentId` is not declared, is an instance, or is declared more than
   *    once — `parent`;
   *  - `file` is given for a child node, or is not a loaded file — `file`;
   *  - the new node would change what an existing reference links to (a
   *    deployment relationship endpoint, a deployment view rule, ...), or a
   *    construct the library does not resolve (a `global` block, an import,
   *    an opaque flow block, text the parser could not recover) names its
   *    name as a bare identifier or the leading segment of a dotted name
   *    (FR-004, D107) — `name`.
   *
   * @param parentId - Deployment id of the parent node, or null for a root node
   * @param opts     - Name, kind and properties of the new node
   * @returns The id of the new node.
   */
  addDeploymentNode(parentId: string | null, opts: AddDeploymentNodeOpts): string {
    checkElementName(opts.name);
    checkKind(opts.kind, 'deploymentNode', this.workspace);
    checkTags(opts.tags, this.workspace);
    checkStyle(opts.style, 'element', this.workspace);
    checkMetadata(opts.metadata);
    if (parentId !== null && opts.file !== undefined) {
      throw new InvalidWriteError(
        'file',
        `a child node is written in the declaration of its parent '${parentId}'; file is accepted for a root node only`,
      );
    }
    const parent = parentId === null ? undefined : nodeDeclaration(this.deployments, parentId, 'parent');
    const id = parentId === null ? opts.name : `${parentId}.${opts.name}`;
    if (this.deployments.has(id)) {
      // LikeC4 reports a duplicate for two nodes or instances of one id
      // anywhere in the project.
      throw new InvalidWriteError('name', `a node or instance '${id}' is already declared (in a loaded file)`);
    }
    this.rejectCapturedName(opts.name, 'element', 'name', `a deployment node named '${opts.name}'`);

    const { file: _file, ...props } = opts;
    const snippet = (indent: string): string => generateDeploymentNode({ indent, ...props });
    let filename: string;
    let edit: TextEdit;
    if (parent) {
      if (parent.file === undefined) throw new Error(`Internal error: declaration of '${parentId}' has no file name`);
      filename = parent.file;
      edit = declarationBodyInsertEdit(this.document(filename), parent.node, snippet);
    } else {
      const placement = chooseDeploymentPlacement(this.documents, opts.file);
      filename = placement.file;
      edit = deploymentInsertEdit(this.document(filename), placement, snippet);
    }

    const doc = this.document(filename);
    const before = this.referenceSnapshot();
    const snapshot = this.snapshot();
    try {
      this.applyEdit(filename, edit);
      this.rejectChangedReferences(before, new Map([[filename, insertedRanges(doc.fullText, [edit])]]), id);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return id;
  }

  /**
   * Update the properties of deployment node `id` (see
   * {@link getDeploymentNode} for how ids are written).  The node must be
   * declared exactly once; a node declared in an `extend` block is
   * addressed by its id like any other.
   *
   * Semantics apply to the node's effective values, as for
   * {@link updateElement}:
   *  - `title`, `summary`, `description`, `technology`: REPLACE every
   *    declaration LikeC4 reads, inline and in the body.  A new title is
   *    written inline; summary, description and technology go into the body
   *    (a node has no inline technology).
   *  - `tags`, `links`: REPLACE.  An empty array clears them.
   *  - `style`: MERGE per field.  `style.icon` is written into the body-level
   *    `icon` property when the body has one (it overrides the style block's
   *    icon), else into the style block.
   *  - `metadata`: MERGE with `null` deleting a key.
   *
   * When the patch sets `tags` or `links`, those are removed from every
   * `extend <node>` block whose path is exactly `id`, in every loaded file;
   * every metadata key of the patch is removed from those blocks too.
   * Blocks of other nodes (descendants included) are not touched.  The kind
   * is not changed, and its defaults keep applying as LikeC4 reads them.
   *
   * A `tags`, `links` or `metadata` update is rejected while any loaded file
   * has syntax errors ({@link validate}): an `extend` block could hide in it.
   * The operation is atomic in memory.
   *
   * @param id    - Deployment id of the node
   * @param patch - Properties to change (undefined = keep existing)
   * @returns The files that changed.
   * @throws {InvalidWriteError} on `id` when no node has the id, it is an
   *   instance or it is declared more than once; on `tags[i]` / `style.<field>`
   *   for an invalid value; on `tags`, `links` or `metadata` while a file has
   *   syntax errors
   */
  updateDeploymentNode(id: string, patch: UpdateDeploymentNodePatch): UpdateDeploymentNodeResult {
    checkTags(patch.tags, this.workspace);
    checkStyle(patch.style, 'element', this.workspace);
    checkMetadata(patch.metadata);
    const declaration = nodeDeclaration(this.deployments, id, 'id');
    if (declaration.file === undefined) throw new Error(`Internal error: declaration of '${id}' has no file name`);

    const clearing = {
      tags: patch.tags !== undefined,
      links: patch.links !== undefined,
      metadataKeys: patch.metadata ? Object.keys(patch.metadata) : [],
    };
    const crossField = clearing.tags ? 'tags' : clearing.links ? 'links' : clearing.metadataKeys.length > 0 ? 'metadata' : undefined;
    if (crossField !== undefined) this.rejectFieldWhileSyntaxErrors(crossField, `'${id}'`);

    const editsByFile = new Map<string, TextEdit[]>();
    const node = declaration.node as Parameters<typeof deploymentNodeInlineAnchor>[0];
    addEditGroup(
      editsByFile,
      declaration.file,
      updateDeclarationEdits(node, this.document(declaration.file), patch, deploymentNodeInlineAnchor(node), {
        styleIconInBodyIcon: true,
      }),
    );
    if (crossField !== undefined) {
      for (const block of this.deployments.extendBlocks(id)) {
        if (block.file === undefined) throw new Error(`Internal error: extend block of '${id}' has no file name`);
        const extend = block.node as Parameters<typeof clearExtendContributionsEdits>[1];
        addEditGroup(editsByFile, block.file, clearExtendContributionsEdits(this.document(block.file), extend, clearing));
      }
    }
    return { changedFiles: this.applyEditGroups(editsByFile) };
  }

  /**
   * Remove deployment node `id` with its whole subtree — child nodes,
   * instances and the relationships declared in them — together with:
   *  - every `extend <node>` block whose path is the node or a node of its
   *    subtree, in every loaded file (with what is declared in it);
   *  - every deployment relationship anywhere whose source or target
   *    resolves into the subtree (to a node or instance of it, or to an
   *    element stepped into through an instance of it).
   *
   * The node must be declared exactly once; a node declared in an `extend`
   * block is addressed by its id like any other.  The removal is rejected,
   * with no file changed, while a rule of a deployment view refers to the
   * node or anything in its subtree (the view is not edited), and when the
   * removal would change what a surviving reference links to (a name that
   * becomes unique can re-target a reference written elsewhere).  The
   * operation is atomic.
   *
   * @param id - Deployment id of the node
   * @returns The deployment relationships that were removed.
   * @throws {InvalidWriteError} on `id` when no node has the id, it is an
   *   instance or it is declared more than once; when a deployment view
   *   refers to the subtree (listing the references); when a surviving
   *   reference would link to another target
   */
  removeDeploymentNode(id: string): RemoveDeploymentNodeResult {
    const declaration = nodeDeclaration(this.deployments, id, 'id');
    return this.removeDeploymentSubtree(id, declaration, { extendBlocks: true, scope: 'it or its subtree' });
  }

  /**
   * Remove deployed instance `id` together with the relationships declared
   * in its body and every deployment relationship anywhere whose source or
   * target is the instance or an element stepped into through it
   * (`prod.vm1.api.handler`).
   *
   * The instance must be declared exactly once; an instance declared in an
   * `extend` block is addressed by its id like any other.  The element it
   * deploys is not touched.  The removal is rejected, with no file changed,
   * while a rule of a deployment view refers to the instance or to an
   * element through it (the view is not edited), and when the removal would
   * change what a surviving reference links to (a name that becomes unique
   * can re-target a reference written elsewhere).  The operation is atomic.
   *
   * @param id - Deployment id of the instance
   * @returns The deployment relationships that were removed.
   * @throws {InvalidWriteError} on `id` when no instance has the id, it is a
   *   node or it is declared more than once; when a deployment view refers
   *   to it (listing the references); when a surviving reference would link
   *   to another target
   */
  removeDeploymentInstance(id: string): RemoveDeploymentInstanceResult {
    const declaration = instanceDeclaration(this.deployments, id, 'id');
    return this.removeDeploymentSubtree(id, declaration, { extendBlocks: false, scope: 'it or an element through it' });
  }

  /**
   * Add a deployed instance of element `opts.element` to deployment node
   * `nodeId` and return its id (see {@link getDeploymentInstance}).  It is
   * written at the end of the body of the node's declaration (a body
   * `{ ... }` is created when the declaration has none), also when the node
   * has children in `extend` blocks: `name = instanceOf element`, or
   * `instanceOf element` without a name, with the title inline (an empty
   * title is written as `''`) and summary, description, technology, tags,
   * links, style and metadata in the body — an instance has no inline
   * technology.
   *
   * Without `name` the instance is unnamed and LikeC4 names it after the
   * last segment of `element` as written (`instanceOf app.api` is `api`);
   * that id must be free, otherwise a name has to be given.
   *
   * The write is rejected, with no file changed, when:
   *  - `name` is not one identifier or is reserved — `name`;
   *  - `element` is not an element reference, or does not resolve as
   *    LikeC4 links `instanceOf` from the node's body (the document's model
   *    scope and the root elements, then unique descendants; nodes and
   *    instances are never candidates) — `element`;
   *  - a tag is not declared, or a style value is invalid — `tags[i]`,
   *    `style.<field>`;
   *  - `file` is given — `file`;
   *  - `nodeId` is not declared, is an instance, or is declared more than
   *    once — `node`;
   *  - a node or instance of any loaded file already has the new id
   *    (children declared in `extend` blocks included) — `name`;
   *  - the new instance would change what an existing reference links to (a
   *    deployment relationship endpoint, a deployment view rule, ...), or a
   *    construct the library does not resolve (a `global` block, an import,
   *    an opaque flow block, text the parser could not recover) names its
   *    id's last segment — the given name or the one taken from `element` —
   *    as a bare identifier or the leading segment of a dotted name (FR-004,
   *    D107) — `name`.
   *
   * @param nodeId - Deployment id of the node the instance is deployed in
   * @param opts   - Element, name and properties of the new instance
   * @returns The id of the new instance.
   */
  addDeploymentInstance(nodeId: string, opts: AddDeploymentInstanceOpts): string {
    if (opts.name !== undefined) checkElementName(opts.name);
    checkReferenceForm(opts.element, 'element');
    checkTags(opts.tags, this.workspace);
    checkStyle(opts.style, 'element', this.workspace);
    checkMetadata(opts.metadata);
    if (opts.file !== undefined) {
      throw new InvalidWriteError(
        'file',
        `an instance is written in the declaration of its node '${nodeId}'; file is not accepted`,
      );
    }
    const node = nodeDeclaration(this.deployments, nodeId, 'node');
    if (node.file === undefined) throw new Error(`Internal error: declaration of '${nodeId}' has no file name`);
    const resolver = new DeploymentResolver(this.deployments, this.workspace);
    if (resolver.resolveElementText(opts.element, node.node) === undefined) {
      throw new InvalidWriteError(
        'element',
        `'${opts.element}' does not resolve to one element from '${nodeId}': instanceOf is looked up in the ` +
          `document's model scope and among the root elements, then among unique descendants ` +
          `(LikeC4 would report: Could not resolve reference)`,
      );
    }
    const name = opts.name ?? opts.element.slice(opts.element.lastIndexOf('.') + 1);
    const id = `${nodeId}.${name}`;
    if (this.deployments.has(id)) {
      // LikeC4 reports a duplicate for two nodes or instances of one id
      // anywhere in the project.
      throw new InvalidWriteError(
        'name',
        opts.name === undefined
          ? `the implicit id '${id}' of an unnamed instance of '${opts.element}' is already used by a node or ` +
              `instance (in a loaded file); give the instance a name`
          : `a node or instance '${id}' is already declared (in a loaded file)`,
      );
    }
    this.rejectCapturedName(name, 'element', 'name', `an instance named '${name}'`);

    const { file: _file, ...props } = opts;
    const doc = this.document(node.file);
    const edit = declarationBodyInsertEdit(doc, node.node, (indent) => generateDeployedInstance({ indent, ...props }));
    const before = this.referenceSnapshot();
    const snapshot = this.snapshot();
    try {
      this.applyEdit(node.file, edit);
      this.rejectChangedReferences(before, new Map([[node.file, insertedRanges(doc.fullText, [edit])]]), id);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return id;
  }

  /**
   * Update the properties of deployed instance `id` (see
   * {@link getDeploymentInstance}).  The instance must be declared exactly
   * once; an instance declared in an `extend` block is addressed by its id
   * like any other.  Only the instance's declaration is edited: the element
   * it deploys is never changed, and neither is its `instanceOf` target.
   *
   *  - `title`, `summary`, `description`, `technology`: REPLACE the
   *    instance's own values, inline and in the body.  A new title is written
   *    inline; summary, description and technology go into the body (an
   *    instance has no inline technology).
   *  - `tags`: REPLACE the instance's own tags.  LikeC4 always appends the
   *    element's tags, so they stay in the read value.
   *  - `links`: REPLACE the instance's own links.  `[]` removes them, and the
   *    element's links apply again.
   *  - `style`: MERGE per field into the instance's own style.  `style.icon`
   *    is written into the body-level `icon` when the instance has one.
   *  - `metadata`: patched on the effective map.  LikeC4 reads the
   *    instance's own map when it has one and the element's whole map
   *    otherwise; so when the instance has no own map, the element's keys
   *    are first copied into the instance, then the patch is applied —
   *    a string or list upserts a key, `null` removes it.  An own
   *    `metadata { ... }` block left without attributes is removed.
   *
   * LikeC4 cannot express an empty own map: an empty block, or values that
   * normalize to nothing, count as absent and the element's map applies
   * again.  The metadata patch is therefore accepted only when, after the
   * write, every patched key reads as requested — an upserted key with its
   * value, a `null` key absent; otherwise the call is rejected on
   * `metadata.<key>` and nothing changes.  Unpatched keys of the element can
   * come back: with own `{ tier }` and element `{ region }`, `{ tier: null }`
   * leaves the effective map `{ region }`.
   *
   * A `tags`, `links` or `metadata` update is rejected while any loaded file
   * has syntax errors ({@link validate}): the element's values that the
   * instance inherits could hide in such a file.  The operation is atomic in
   * memory.
   *
   * @param id    - Deployment id of the instance
   * @param patch - Properties to change (undefined = keep existing)
   * @returns The files that changed.
   * @throws {InvalidWriteError} on `id` when no instance has the id, it is a
   *   node or it is declared more than once (naming the declarations); on
   *   `tags[i]` / `style.<field>` for an invalid value; on `tags`, `links` or
   *   `metadata` while a file has syntax errors; on `metadata.<key>` when a
   *   patched key would not read as requested
   */
  updateDeploymentInstance(id: string, patch: UpdateDeploymentInstancePatch): UpdateDeploymentInstanceResult {
    checkTags(patch.tags, this.workspace);
    checkStyle(patch.style, 'element', this.workspace);
    checkMetadata(patch.metadata);
    const declaration = instanceDeclaration(this.deployments, id, 'id');
    if (declaration.file === undefined) throw new Error(`Internal error: declaration of '${id}' has no file name`);
    const metadataKeys = patch.metadata ? Object.keys(patch.metadata) : [];
    const crossField =
      patch.tags !== undefined ? 'tags' : patch.links !== undefined ? 'links' : metadataKeys.length > 0 ? 'metadata' : undefined;
    if (crossField !== undefined) {
      this.rejectFieldWhileSyntaxErrors(
        crossField,
        `'${id}'`,
        'the values the instance inherits from its element cannot be read reliably',
      );
    }

    const node = declaration.node as Parameters<typeof deployedInstanceInlineAnchor>[0];
    const effectivePatch = { ...patch };
    if (patch.metadata && metadataKeys.length > 0 && readContribution(declaration.node.body).metadata === undefined) {
      // No own map: LikeC4 reads the element's.  Copy it first, so that the
      // patch acts on the map the caller sees.
      const inherited = this.getDeploymentInstance(id)?.metadata ?? {};
      const changesEffective = metadataKeys.some((key) => patch.metadata![key] !== null || Object.hasOwn(inherited, key));
      effectivePatch.metadata = changesEffective ? { ...inherited, ...patch.metadata } : {};
    }
    const edits = updateDeclarationEdits(node, this.document(declaration.file), effectivePatch, deployedInstanceInlineAnchor(node), {
      styleIconInBodyIcon: true,
    });

    const snapshot = this.snapshot();
    const changedFiles = this.applyEditGroups(new Map(edits.length > 0 ? [[declaration.file, edits]] : []));
    try {
      if (patch.metadata) this.rejectUnreadMetadata(id, patch.metadata);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return { changedFiles };
  }

  /**
   * Add a deployment relationship `source -> target` at the top level of a
   * `deployment` block chosen by `opts.file` and LikeC4's document order
   * (see {@link chooseDeploymentPlacement}); a new block is created when
   * there is none.  The connector is `->`, `<->` (`bidirectional`),
   * `-[kind]->` or `-[kind]<->`; the title is written inline (an empty title
   * as `''`), and description, technology, tags, links, metadata and style
   * in the body — LikeC4 ignores a description or technology written on the
   * relationship line.
   *
   * Each endpoint is `{ id, element? }`, as
   * {@link listDeploymentRelationships} reports endpoints:
   *  - `id` is written as given and must resolve, from the insertion point
   *    and by LikeC4's deployment scoping, to a node or an instance: a
   *    full id (`prod.eu.vm1`) or a shorter reference LikeC4 links there;
   *  - `element` steps into the element the instance deploys: the FQN of an
   *    element below it, written as the path from the instance's element
   *    (`{ id: 'prod.vm1.db', element: 'app.db.replLog' }`, with `db` an
   *    instance of `app.db`, is written `prod.vm1.db.replLog`).
   *
   * The write is rejected, with no file changed, when:
   *  - an `id` is not a reference, does not resolve to one node or instance
   *    (an unknown or ambiguous name, or a logical element), or itself steps
   *    into an element — `source.id` / `target.id`;
   *  - an `element` is not an FQN, is given on a node, is not an element
   *    below the instance's element, or the written path does not link to
   *    it — `source.element` / `target.element`;
   *  - `kind` is not a declared relationship kind, a tag is not declared,
   *    or a style value is invalid — `kind`, `tags[i]`, `style.<field>`;
   *  - a metadata key or value cannot be written — `metadata.<key>`;
   *  - `file` is not a loaded file — `file`;
   *  - the endpoints are the same node or instance, or one lies below the
   *    other (LikeC4: "Invalid parent-child relationship"; element parts do
   *    not count) — `target`.
   *
   * @param source - Source endpoint
   * @param target - Target endpoint
   * @param opts   - Kind, direction and properties of the relationship
   */
  addDeploymentRelationship(
    source: DeploymentEndpoint,
    target: DeploymentEndpoint,
    opts: AddDeploymentRelationshipOpts = {},
  ): void {
    checkEndpointForm(source, 'source');
    checkEndpointForm(target, 'target');
    if (opts.kind !== undefined) checkKind(opts.kind, 'relationship', this.workspace);
    checkTags(opts.tags, this.workspace);
    checkStyle(opts.style, 'relationship', this.workspace);
    checkMetadata(opts.metadata);
    const placement = chooseDeploymentPlacement(this.documents, opts.file);
    const doc = this.document(placement.file);
    const container = placementContainer(doc, placement);
    const where = `the deployment block in '${placement.file}'`;
    const resolver = new DeploymentResolver(this.deployments, this.workspace);
    const from = endpointText(this.deployments, resolver, source, container, 'source', where);
    const to = endpointText(this.deployments, resolver, target, container, 'target', where);
    // LikeC4 checks the deployment parts only (language-server
    // `deploymentRelationChecks`: `isSameHierarchy` of the deployment ids).
    if (isSameHierarchy(from.target.deployment, to.target.deployment)) {
      throw new InvalidWriteError(
        'target',
        from.target.deployment === to.target.deployment
          ? `'${to.text}' is in '${to.target.deployment}', the source's own node or instance: ` +
              `LikeC4 rejects such a relationship (Invalid parent-child relationship)`
          : `'${from.target.deployment}' and '${to.target.deployment}' are parent and child: ` +
              `LikeC4 rejects such a relationship (Invalid parent-child relationship)`,
      );
    }

    const { file: _file, ...props } = opts;
    const snippet = (indent: string): string =>
      generateDeploymentRelationship({ indent, ...props, source: from.text, target: to.text });
    this.applyEdit(placement.file, deploymentInsertEdit(doc, placement, snippet));
  }

  /**
   * Update the deployment relationship `selector` selects: by its source
   * and target endpoints as {@link listDeploymentRelationships} reports them
   * (deployment id, plus the element FQN when an endpoint steps into an
   * instance's element), optionally narrowed by kind and title (as
   * reported: own, else the kind's).  A bidirectional relationship matches
   * its endpoints in either order.
   *
   *  - `title`: REPLACE, written inline after the target (LikeC4 reads it
   *    over a title in the body).
   *  - `description`, `technology`: REPLACE, written in the body.  A
   *    description or technology on the relationship line, which LikeC4
   *    ignores, is left as written.
   *  - `tags`: REPLACE where LikeC4 reads them — on the relationship line
   *    when it has tags there, else in the body.  An empty array clears
   *    them; the kind's tags keep applying.
   *  - `links`: REPLACE.  An empty array clears them.
   *  - `metadata`: MERGE with `null` deleting a key.
   *  - `style`: MERGE per field.
   *
   * The endpoints, kind and direction are not changed.  A `tags`, `links`
   * or `metadata` update is rejected while any loaded file has syntax errors
   * ({@link validate}).  The operation is atomic in memory.
   *
   * @param selector - Endpoints and optional kind / title of the relationship
   * @param patch    - Properties to change (undefined = keep existing)
   * @returns The files that changed.
   * @throws {InvalidWriteError} on `source` when no relationship or several
   *   match (naming them); on `source.id`, `source.element`, `target.id`,
   *   `target.element` for a malformed endpoint; on `tags[i]`,
   *   `style.<field>`, `metadata.<key>` for an invalid value; on `tags`,
   *   `links` or `metadata` while a file has syntax errors
   */
  updateDeploymentRelationship(
    selector: DeploymentRelationshipSelector,
    patch: UpdateDeploymentRelationshipPatch,
  ): UpdateDeploymentRelationshipResult {
    checkSelectorForm(selector);
    checkTags(patch.tags, this.workspace);
    checkStyle(patch.style, 'relationship', this.workspace);
    checkMetadata(patch.metadata);
    const { relation } = selectDeploymentRelationship(
      this.deployments.relations(),
      this.listDeploymentRelationships(),
      selector,
    );
    if (relation.file === undefined) throw new Error('Internal error: a deployment relationship without a file name');

    const crossField =
      patch.tags !== undefined ? 'tags' : patch.links !== undefined ? 'links' : patch.metadata !== undefined ? 'metadata' : undefined;
    if (crossField !== undefined) {
      this.rejectFieldWhileSyntaxErrors(
        crossField,
        'a deployment relationship',
        'where LikeC4 reads them cannot be told reliably',
      );
    }

    const { title, ...rest } = patch;
    const edits = relationPatchEdits(
      relation.node as Parameters<typeof relationPatchEdits>[0],
      this.document(relation.file).fullText,
      { ...rest, ...(title !== undefined && { label: title }) },
      { inlineStrings: 'body-only' },
    );
    return { changedFiles: this.applyEditGroups(new Map(edits.length > 0 ? [[relation.file, edits]] : [])) };
  }

  /**
   * Remove the deployment relationship `selector` selects, as for
   * {@link updateDeploymentRelationship}: by its endpoints as
   * {@link listDeploymentRelationships} reports them, optionally narrowed by
   * kind and title; a bidirectional relationship matches its endpoints in
   * either order.  The relationship's text is removed wherever it is
   * declared — at the top level of a `deployment` block, in a node or
   * instance body, or in an `extend` block; nothing else changes.
   *
   * @param selector - Endpoints and optional kind / title of the relationship
   * @returns The removed relationship, with its endpoints and title as read
   *   before the removal.
   * @throws {InvalidWriteError} on `source` when no relationship or several
   *   match (naming them); on `source.id`, `source.element`, `target.id`,
   *   `target.element` for a malformed endpoint
   */
  removeDeploymentRelationship(selector: DeploymentRelationshipSelector): RemoveDeploymentRelationshipResult {
    checkSelectorForm(selector);
    const { relation, info } = selectDeploymentRelationship(
      this.deployments.relations(),
      this.listDeploymentRelationships(),
      selector,
    );
    this.removeDeploymentConstruct(relation.file, relation.node);
    const { source, target, title } = info;
    return { removedRelationships: [{ source, target, ...(title !== undefined && { title }) }] };
  }

  /**
   * Add an `extend <node>` block for deployment node `nodeId` in
   * `opts.file`, contributing tags, links and metadata to the node: the
   * block is appended to the file's first `deployment` block, or to a new
   * one at the end of the file.  The target is written as the node's id
   * (`extend prod.eu`), which LikeC4 resolves as a strict path.  Only tags,
   * links and metadata are written — the grammar allows no strings or style
   * in an `extend` body.  The node's reads then include the contribution,
   * with the block in `extendedBy`.
   *
   * The write is rejected, with no file changed, when:
   *  - `nodeId` is not a reference, is not declared, is declared more than
   *    once, or is an instance (LikeC4: "ExtendDeployment allows only
   *    DeploymentNode") — `node`;
   *  - a tag is not declared, metadata cannot be written — `tags[i]`,
   *    `metadata.<key>`;
   *  - there is no tag, link or metadata key to contribute — `tags`;
   *  - `file` is missing or not a loaded file — `file`.
   *
   * @param nodeId - Deployment id of the node
   * @param opts   - File and contributions of the block
   */
  addDeploymentExtend(nodeId: string, opts: AddDeploymentExtendOpts): void {
    checkReferenceForm(nodeId, 'node');
    checkTags(opts.tags, this.workspace);
    checkMetadata(opts.metadata);
    if (!(opts.tags?.length || opts.links?.length || Object.keys(opts.metadata ?? {}).length)) {
      throw new InvalidWriteError(
        'tags',
        `an extend block of '${nodeId}' needs at least one tag, link or metadata key to contribute`,
      );
    }
    if (opts.file === undefined) {
      throw new InvalidWriteError('file', 'the file of the extend block is required (one of the loaded files)');
    }
    const declarations = this.deployments.declarations(nodeId);
    if (declarations.length === 1 && declarations[0]!.type === 'instance') {
      throw new InvalidWriteError(
        'node',
        `'${nodeId}' is an instance; LikeC4 extends deployment nodes only (ExtendDeployment allows only DeploymentNode)`,
      );
    }
    nodeDeclaration(this.deployments, nodeId, 'node');
    const placement = chooseDeploymentPlacement(this.documents, opts.file);
    const snippet = (indent: string): string =>
      generateDeploymentExtend({ indent, node: nodeId, tags: opts.tags, links: opts.links, metadata: opts.metadata });
    this.applyEdit(placement.file, deploymentInsertEdit(this.document(placement.file), placement, snippet));
  }

  /**
   * Remove the `extend <node>` block `selector` selects: by the node id
   * written after `extend` and the file, plus the 1-based `occurrence` in
   * source order when the file holds several blocks of the node.  What is
   * declared in the block goes with it, as for {@link removeDeploymentNode}:
   *  - the nodes and instances declared in it, with their subtrees and every
   *    `extend <node>` block of those subtrees in any file;
   *  - the relationships declared in it, and every deployment relationship
   *    anywhere whose source or target resolves into what is declared in it.
   *
   * The removal is rejected, with no file changed, while a rule of a
   * deployment view refers to something declared in the block (the view is
   * not edited), and when the removal would change what a surviving
   * reference links to.  The operation is atomic.
   *
   * @param selector - Node, file and optional occurrence of the block
   * @returns The deployment relationships that were removed.
   * @throws {InvalidWriteError} on `node` when it is not a reference or the
   *   file has no block of it, when a deployment view refers into the block
   *   or a surviving reference would link to another target; on `file` when
   *   the file is not loaded; on `occurrence` when it is missing for several
   *   blocks (naming them), out of range or not a positive whole number
   */
  removeDeploymentExtend(selector: DeploymentExtendSelector): RemoveDeploymentExtendResult {
    const { block, occurrence } = selectExtendBlock(this.deployments, this.documents.keys(), selector);
    const { node, file } = selector;
    const current = (): DeploymentExtendRef => {
      const found = extendBlocksIn(this.deployments, node, file)[occurrence - 1];
      if (!found) throw new Error(`Internal error: the 'extend ${node}' block is gone before its removal`);
      return found;
    };
    const roots = idsDeclaredIn(this.deployments, block);
    return this.removeDeploymentPart({
      roots,
      extendBlocks: true,
      construct: block.node,
      // Declared in the block, or in an extend block of what is declared in
      // it (removed too).
      inside: (relation) => {
        const extend = current().node;
        return (
          relation.frames.some((frame) => frame.type === 'extend' && frame.node === extend) ||
          roots.some((root) => isNestedInSubtree(relation.frames, root))
        );
      },
      locate: current,
      field: 'node',
      subject: `extend ${node}`,
      viewMessage: (references) =>
        `the 'extend ${node}' block in '${file}' cannot be removed while deployment views refer to what is declared ` +
        `in it: ${references.join(', ')}`,
    });
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
   * Rebuild the workspace, deployment and view indices and every per-file query.
   * A change in one file can change how references in other files resolve,
   * so all of them are rebuilt together.
   */
  private rebuildQueries(): void {
    const documents = [...this.documents].map(([file, doc]) => ({ file, ast: doc.ast }));
    this.workspace = new WorkspaceIndex(documents);
    this.deployments = new DeploymentIndex(documents);
    this.views = new ViewIndex(documents);
    this.viewReferenceResolver = undefined;
    this.catalogue = undefined;
    this.unmodelled = undefined;
    this.queries = new Map();
    for (const [filename, doc] of this.documents) {
      this.queries.set(filename, new C4Query(doc.ast, this.workspace));
    }
    this.deploymentQuery = this.createDeploymentQuery();
  }

  /**
   * Deployment reads over the current indices.  An instance inherits from
   * the element {@link getElement} reports: the first declaration of the
   * FQN in file order.
   */
  private createDeploymentQuery(): DeploymentQuery {
    const nodes = new Map<string, unknown>();
    for (const doc of this.documents.values()) {
      forEachElementDeclaration(doc.ast, (node, fqn) => {
        if (!nodes.has(fqn)) nodes.set(fqn, node);
      });
    }
    const elements: DeploymentElementSource = {
      info: (fqn) => this.getElement(fqn),
      node: (fqn) => nodes.get(fqn),
    };
    const resolver = new DeploymentResolver(this.deployments, this.workspace);
    return new DeploymentQuery(this.deployments, this.workspace, resolver, elements);
  }

  /**
   * Filenames of the relations matching `matcher`, one entry per match, in
   * file order.  Matches by absolute FQN in any file take precedence over
   * matches by reference text as written — the same precedence the per-file
   * edit builders apply, so the file chosen here holds the relation they
   * select.
   */
  /**
   * The one model relationship `selector` addresses, searched in every loaded
   * file in LikeC4's document order (see `selectRelationship` of
   * `relationship-selector.ts`).
   *
   * @throws {InvalidWriteError} when nothing matches
   * @throws {RelationshipAmbiguityError} when more than one relationship matches
   */
  private selectRelationship(selector: RelationshipSelector): SelectedRelationship {
    const documents = this.views.documents.map(({ file }) => {
      if (file === undefined) throw new Error('Internal error: a loaded document has no file name');
      return { file, doc: this.document(file) };
    });
    return selectRelationship(documents, selector, this.workspace);
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
   * Throw an {@link InvalidWriteError} on `field`, naming every syntax error,
   * when any loaded file does not parse: `extend` blocks in such a file
   * cannot be located reliably, so a value they may contribute cannot be
   * replaced.
   *
   * @param target - The construct being updated, for the message
   * @param reason - Why the value depends on every file, for the message
   */
  private rejectFieldWhileSyntaxErrors(
    field: string,
    target: string,
    reason = 'extend blocks of loaded files cannot be located reliably',
  ): void {
    const errors = this.validate();
    if (errors.length === 0) return;
    throw new InvalidWriteError(
      field,
      `cannot be updated on ${target} while files have syntax errors: ${reason} (${errors.join('; ')})`,
    );
  }

  /**
   * Throw when a metadata key patched on instance `id` does not read as
   * requested after the write (D14): an upserted key must read with its
   * value as LikeC4 normalizes it, a `null` key must be absent.  LikeC4
   * cannot express an empty own map — the element's map applies again — so
   * such a patch cannot be honoured.
   *
   * @throws {InvalidWriteError} on `metadata.<key>` for the first such key
   */
  private rejectUnreadMetadata(id: string, patch: MetadataPatch): void {
    const metadata = this.getDeploymentInstance(id)?.metadata ?? {};
    for (const [key, value] of Object.entries(patch)) {
      const read = Object.hasOwn(metadata, key) ? metadata[key] : undefined;
      const expected = value === null ? undefined : normalizedMetadataValue(value);
      // An upsert must read as a value: one that normalizes to nothing never does.
      const honoured = value === null ? read === undefined : expected !== undefined && JSON.stringify(read) === JSON.stringify(expected);
      if (honoured) continue;
      throw new InvalidWriteError(
        `metadata.${key}`,
        value === null
          ? `removing '${key}' would leave '${id}' without its own metadata, and LikeC4 then reads the element's ` +
              `map, where '${key}' is ${JSON.stringify(read)}: an instance's metadata override cannot be empty`
          : `${JSON.stringify(value)} would ${read === undefined ? 'not be read' : `read as ${JSON.stringify(read)}`} on '${id}': LikeC4 drops values that ` +
              `are empty after trimming, and an instance's metadata override cannot be empty`,
      );
    }
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

  /**
   * Throw when the deployment model refers to element `fqn` or an element of
   * its subtree: an instance deploys it (`instanceOf`), or a deployment
   * relationship endpoint steps into it through an instance.  Removing the
   * element would leave such a reference unresolved (LikeC4: Could not
   * resolve reference).
   *
   * @throws {InvalidWriteError} on `fqn`, listing the instances and endpoints
   */
  private rejectDeploymentReferences(fqn: string): void {
    const resolver = new DeploymentResolver(this.deployments, this.workspace);
    const instances: string[] = [];
    for (const id of this.deployments.ids()) {
      for (const declaration of this.deployments.declarations(id)) {
        if (declaration.type !== 'instance') continue;
        const element = resolver.instanceElement(declaration.node);
        if (element === undefined || !isSameOrDescendant(element, fqn)) continue;
        const entry = `'${id}' (instanceOf '${element}')`;
        if (!instances.includes(entry)) instances.push(entry);
      }
    }
    const endpoints: string[] = [];
    for (const relation of this.deployments.relations()) {
      for (const role of ['source', 'target'] as const) {
        const ref = relation.node[role] as Parameters<DeploymentResolver['resolveReference']>[0] | undefined;
        if (!ref) continue;
        const target = resolver.resolveReference(ref);
        if (!target || !('deployment' in target) || target.element === undefined) continue;
        if (!isSameOrDescendant(target.element, fqn)) continue;
        endpoints.push(
          `${role} '${resolveFqnRef(ref)}' in '${relation.file ?? ''}' (element '${target.element}' of instance '${target.deployment}')`,
        );
      }
    }
    if (instances.length === 0 && endpoints.length === 0) return;
    const parts = [
      ...(instances.length > 0 ? [`instances ${instances.join(', ')}`] : []),
      ...(endpoints.length > 0 ? [`deployment relationship endpoints ${endpoints.join(', ')}`] : []),
    ];
    throw new InvalidWriteError(
      'fqn',
      `'${fqn}' cannot be removed while the deployment model refers to it or its descendants: ${parts.join('; ')} ` +
        `(LikeC4 would report: Could not resolve reference)`,
    );
  }

  /**
   * The reference snapshot of the loaded files (see {@link takeReferenceSnapshot}):
   * every reference kind of the catalogue, whatever the write (US-4, INV-3).
   *
   * @param removed - AST nodes the coming write deletes
   */
  private referenceSnapshot(removed?: ReadonlySet<object>): ReferenceSnapshot {
    return takeReferenceSnapshot(this.referenceCatalogue(), this.deployments, removed);
  }

  /**
   * Throw when a construct the library does not resolve names `name`, the
   * new name of an addition of class `nameClass`, as a bare identifier or the
   * leading segment of a dotted name (new mode of the unmodelled-name
   * inventory; FR-004, D101, D107): the new declaration would capture that
   * reference, and the library could neither check nor rewrite it.
   *
   * @param field   - The field the error names
   * @param subject - The declaration for the message, e.g. `an element named 'api'`
   * @throws {InvalidWriteError} on `field`
   */
  private rejectCapturedName(name: string, nameClass: UnmodelledNameClass, field: string, subject: string): void {
    this.unmodelled ??= unmodelledInventory([...this.documents].map(([file, parsed]) => ({ file, parsed })));
    const [hit] = newNameCaptures(this.unmodelled, name, nameClass);
    if (!hit) return;
    throw new InvalidWriteError(
      field,
      `${subject} would capture the reference '${hit.segments.map((segment) => segment.name).join('.')}' at '${hit.file}:${hit.line}', ` +
        `written where the library does not resolve references (a global block, an import, an opaque flow block or unparsed text)`,
    );
  }

  /** The reference catalogue of the current indices, built on first use. */
  private referenceCatalogue(): ReferenceCatalogue {
    this.catalogue ??= buildReferenceCatalogue(this.workspace, this.deployments, this.views);
    return this.catalogue;
  }

  /**
   * Throw when declaring element `fqn` (or deployment node `fqn`) changed
   * what an existing reference links to: a reference that resolved before
   * (`before`, taken before the declaration was written) now resolves to
   * another target or not at all.  A new name can do that by taking a unique descendant's name out of scope
   * (`api` resolving to `app.api` becomes ambiguous once `other.api` exists)
   * or by shadowing it — in the logical model, in `instanceOf` targets, in
   * deployment relationship endpoints that step into an instance's element
   * and in the rules of deployment views.  References that did not resolve
   * before are not considered: they are not changed by the call.
   *
   * A removal is checked the same way, with `before` taken over the
   * surviving references only (see {@link referenceSnapshot}): removing a
   * name can make a surviving reference resolve to another target.
   *
   * @param inserted - Per file, the text ranges the write inserted
   * @param write    - The field the error names and the verb of the message
   * @throws {InvalidWriteError} on `write.field` (`name` by default)
   */
  private rejectChangedReferences(
    before: ReferenceSnapshot,
    inserted: ReadonlyMap<string, readonly TextRange[]>,
    fqn: string,
    write: { field: string; action: string } = { field: 'name', action: 'declaring' },
  ): void {
    const [change] = compareReferenceSnapshots(before, this.referenceSnapshot(), inserted);
    if (!change) return;
    throw new InvalidWriteError(
      write.field,
      `${write.action} '${fqn}' changes what an existing reference links to: the ${change.role} '${change.text}' in '${change.file}' ` +
        `links to ${change.before.display} and would ${
          change.after === undefined
            ? 'no longer resolve (LikeC4 would report: Could not resolve reference)'
            : `link to ${change.after.display} instead`
        }`,
    );
  }

  /**
   * Remove the deployment node or instance `id` (its declaration
   * `declaration`) with what is declared in it, the deployment relationships
   * whose endpoint resolves into it and — with `options.extendBlocks` — the
   * `extend <node>` blocks of its subtree (see {@link removeDeploymentNode},
   * {@link removeDeploymentInstance}).  Atomic.
   *
   * @param options.scope - What deployment view references are checked for, for the message
   */
  private removeDeploymentSubtree(
    id: string,
    declaration: { node: object },
    options: { extendBlocks: boolean; scope: string },
  ): RemoveDeploymentNodeResult {
    return this.removeDeploymentPart({
      roots: [id],
      extendBlocks: options.extendBlocks,
      construct: declaration.node,
      inside: (relation) => isNestedInSubtree(relation.frames, id),
      locate: () => {
        const [current] = this.deployments.declarations(id);
        if (!current) throw new Error(`Internal error: the declaration of '${id}' is gone before its removal`);
        return current;
      },
      field: 'id',
      subject: id,
      viewMessage: (references) =>
        `'${id}' cannot be removed while deployment views refer to ${options.scope}: ${references.join(', ')}`,
    });
  }

  /**
   * Remove one deployment construct — a declaration or an `extend <node>`
   * block — with what is declared in it, together with:
   *  - the deployment relationships outside it whose endpoint resolves into
   *    the subtree of one of `part.roots` (the ids declared in it);
   *  - with `part.extendBlocks`, the `extend <node>` blocks that target such
   *    a subtree.
   *
   * Rejected on `part.field` while a deployment view refers into one of
   * those subtrees, and when the removal would change what a surviving
   * reference links to.  Atomic.
   *
   * @param part.construct - The construct's AST node in the current index
   * @param part.inside    - True for a relationship that goes with the construct
   *                         (declared in it), evaluated against the current index
   * @param part.locate    - The construct in the current index (it is removed last,
   *                         after the other removals reparsed its file)
   * @param part.subject   - What is removed, for the message of a re-targeted reference
   */
  private removeDeploymentPart(part: {
    roots: readonly string[];
    extendBlocks: boolean;
    construct: object;
    inside: (relation: DeploymentRelationRef) => boolean;
    locate: () => { file?: string; node: object };
    field: string;
    subject: string;
    viewMessage: (references: string[]) => string;
  }): RemoveDeploymentNodeResult {
    const { roots } = part;
    const resolver = new DeploymentResolver(this.deployments, this.workspace);
    const viewReferences = roots.flatMap((root) => viewReferencesIntoSubtree(this.deployments, resolver, root));
    if (viewReferences.length > 0) throw new InvalidWriteError(part.field, part.viewMessage(viewReferences));

    const targetsSubtree = (target: string): boolean => roots.some((root) => isInSubtree(target, root));
    const cascades = (relation: DeploymentRelationRef, current: DeploymentResolver): boolean =>
      !part.inside(relation) && roots.some((root) => relationEndpointInSubtree(current, relation, root));

    // What disappears: the construct, the extend blocks of the subtrees and
    // the relationships outside them with an endpoint in a subtree (the
    // relationships declared inside go along with their container).
    const removed = new Set<object>([part.construct]);
    if (part.extendBlocks) {
      for (const extend of this.deployments.allExtendBlocks()) {
        if (targetsSubtree(extend.target)) removed.add(extend.node);
      }
    }
    const removedRelations = new Set<string>();
    for (const relation of this.deployments.relations()) {
      const nested = part.inside(relation);
      const cascaded = cascades(relation, resolver);
      if (cascaded) removed.add(relation.node);
      const cst = (relation.node as { $cstNode?: { offset: number } }).$cstNode;
      if ((nested || cascaded) && cst) removedRelations.add(`${relation.file ?? ''}:${cst.offset}`);
    }
    const removedRelationships = this.listDeploymentRelationships()
      .filter((r) => removedRelations.has(`${r.file ?? ''}:${r.sourceRange.offset}`))
      .map(({ source, target, title }) => ({ source, target, ...(title !== undefined && { title }) }));

    const before = this.referenceSnapshot(removed);
    const snapshot = this.snapshot();
    try {
      // One construct at a time (each removal reparses its file): the
      // relationships outside the construct, the extend blocks, the construct.
      for (;;) {
        const current = new DeploymentResolver(this.deployments, this.workspace);
        const next = this.deployments.relations().find((relation) => cascades(relation, current));
        if (!next) break;
        this.removeDeploymentConstruct(next.file, next.node);
      }
      while (part.extendBlocks) {
        const next = this.deployments.allExtendBlocks().find((extend) => targetsSubtree(extend.target));
        if (!next) break;
        this.removeDeploymentConstruct(next.file, next.node);
      }
      const construct = part.locate();
      this.removeDeploymentConstruct(construct.file, construct.node);
      this.rejectChangedReferences(before, new Map(), part.subject, { field: part.field, action: 'removing' });
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
    return { removedRelationships };
  }

  /** Remove one deployment construct (a declaration, relationship or extend block) from `file`. */
  private removeDeploymentConstruct(file: string | undefined, node: object): void {
    const cst = (node as { $cstNode?: { offset: number; end: number } }).$cstNode;
    if (file === undefined || !cst) throw new Error('Internal error: a deployment construct without file or position');
    const { offset, end, newText } = buildRemovalEdit(this.document(file).fullText, cst.offset, cst.end);
    this.applyEdit(file, { offset, end, newText });
  }

  /** Resolves the references written in views, over the current indices (built once per rebuild). */
  private viewResolver(): ViewReferenceResolver {
    this.viewReferenceResolver ??= new ViewReferenceResolver(this.workspace, this.deployments, this.views);
    return this.viewReferenceResolver;
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
      throw new EditRefusedError(`Edit produced parse errors in '${filename}':\n${details}`);
    }
    // Secondary structural check: catch brace imbalance that the parser may
    // accept silently (e.g. extra braces appended outside of any grammar rule).
    const balanceError = checkBraceBalance(updated);
    if (balanceError !== null) {
      throw new EditRefusedError(`Edit produced structural errors in '${filename}': ${balanceError}`);
    }
    this.sources.set(filename, updated);
    this.documents.set(filename, doc);
    this.rebuildQueries();
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * An edit the file's parser refuses: the edited text would not parse, or
 * its braces would not balance.  Nothing is written.  The view writes report
 * it as an {@link InvalidWriteError} on the input that addresses the edited
 * text (see {@link refusedOn}); the other writes keep it as a plain `Error`.
 */
class EditRefusedError extends Error {}

/** Run `write`, reporting a refused edit as an {@link InvalidWriteError} on `field`. */
function refusedOn(field: string, write: () => void): void {
  try {
    write();
  } catch (err) {
    if (err instanceof EditRefusedError) {
      throw new InvalidWriteError(field, `the write was refused because the edited file would not parse — ${err.message}`);
    }
    throw err;
  }
}

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

/**
 * The ranges of the text that applying `edits` to `source` produces which
 * hold the edits' new text (written with the line ending of `source`, as
 * `applyEditsToFile` writes it).
 */
function insertedRanges(source: string, edits: readonly TextEdit[]): TextRange[] {
  let shift = 0;
  return withLineEnding(edits, lineEndingOf(source))
    .sort((a, b) => a.offset - b.offset || a.end - b.end)
    .map(({ offset, end, newText }) => {
      const range = { offset: offset + shift, end: offset + shift + newText.length };
      shift += newText.length - (end - offset);
      return range;
    });
}
