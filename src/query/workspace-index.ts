/**
 * Workspace-wide element index and relationship-endpoint resolution.
 *
 * The standalone parser does not run Langium's linking phase, so a relation
 * endpoint is only available as the reference text written in the source
 * (`api`, `this`, `app.db`, ...).  This module reproduces LikeC4's own scoping
 * rules (language-server `LikeC4ScopeComputation` / `LikeC4ScopeProvider` /
 * `FqnIndex`) to turn that text into the absolute FQN LikeC4 would link it to:
 *
 *  - A parentless reference `x` is looked up from the innermost container
 *    outwards (element body → enclosing bodies → `model` block → document),
 *    first match wins.  A container's local scope holds its direct child
 *    elements plus descendants whose name is unique within that subtree and
 *    not shadowed by a direct child.  An element body also binds `this` and
 *    `it` to the element.
 *  - Inside `extend X { ... }` the scope additionally holds X itself (by its
 *    name), `this` / `it` bound to X, and the unique descendants of X across
 *    the whole workspace.
 *  - After the containers, root elements of every document whose name is
 *    unique across the workspace are visible.
 *  - A qualified reference `a.b.c` resolves `a` as above; every next segment
 *    is looked up among the unique descendants of the previous one across the
 *    whole workspace (direct children first, then deeper unique names).
 *  - A sourceless relation (`-> x`) takes the owner of the enclosing body as
 *    its source: the element itself, or the extended element for `extend`.
 *
 * A reference that cannot be resolved (unknown or ambiguous name) keeps its
 * reference text, joined with dots, so callers still see what was written.
 */
import { compareNaturalHierarchically } from '@likec4/core/utils';
import { forEachElementDeclaration, readStrictFqnRef, resolveFqnRef } from './fqn.js';
import { removeIndent } from './likec4-text.js';
import { relationKind } from './relation-node.js';
import { relationFingerprint, type ExtendRelationNode, type RelationIdentity } from './relation-extends.js';
import { readKindSpec, specificationKinds, type KindSpec } from './kind-specs.js';

/** Minimal structural view of an AST node used by this module. */
interface AstNodeLike {
  $type?: string;
  name?: string;
  elements?: unknown[];
  body?: AstNodeLike;
  element?: unknown;
  source?: unknown;
  target?: unknown;
  [k: string]: unknown;
}

/** True for an `extend X { ... }` node of a model block. */
function isExtendElement(node: AstNodeLike): node is AstNodeLike & ExtendElementNode {
  return node.$type === 'ExtendElement';
}

/** Shape of a `FqnRef` / `StrictFqnElementRef` node (linked list via `parent`). */
interface RefLike {
  parent?: RefLike;
  value?: { $refText?: string };
  el?: { $refText?: string };
}

/** Root AST of one parsed document, as far as this module reads it. */
export interface WorkspaceDocumentAst {
  models?: Array<{ elements?: unknown[] }>;
  specifications?: unknown[];
  views?: unknown[];
  /** `deployment { ... }` blocks */
  deployments?: Array<{ elements?: unknown[] }>;
}

/** A document of the workspace together with the name of its file. */
export interface WorkspaceDocument {
  /**
   * File name, e.g. `model.c4` or `sub/ext.c4` — a path relative to the
   * project root (`/` or `\` separated).  It decides the order in which
   * `extend` blocks are merged and is reported as provenance.
   */
  file: string;
  /** Root AST of the document */
  ast: WorkspaceDocumentAst;
}

/** Source range of an AST node, as Langium's CST node exposes it. */
interface CstRange {
  offset: number;
  end: number;
  text?: string;
  range?: { start?: { line?: number; character?: number } };
}

/**
 * Structural view of an `extend X { ... }` AST node
 * (`ExtendElement: 'extend' element=StrictFqnElementRef body=ExtendElementBody`),
 * as far as the library reads it.
 */
export interface ExtendElementNode {
  $type: 'ExtendElement';
  $cstNode?: CstRange;
  /** Reference to the extended element */
  element?: unknown;
  /** The block body: tags, properties (links, metadata) and nested elements / relations */
  body?: {
    $cstNode?: CstRange;
    tags?: unknown;
    props?: Array<{
      $type?: string;
      $cstNode?: CstRange;
      key?: string;
      value?: unknown;
      props?: unknown[];
    }>;
    elements?: Array<{ $type?: string; $cstNode?: CstRange }>;
  };
}

/** An `extend X { ... }` block found by {@link WorkspaceIndex.extendBlocks}. */
export interface ExtendBlockRef {
  /** File of the block; undefined when the document was indexed without a name */
  file?: string;
  /** The `ExtendElement` AST node */
  node: ExtendElementNode;
}

/** An `extend a -> b { ... }` block found by {@link WorkspaceIndex.extendRelationBlocks}. */
export interface ExtendRelationBlockRef {
  /** File of the block; undefined when the document was indexed without a name */
  file?: string;
  /** The `ExtendRelation` AST node */
  node: ExtendRelationNode;
  /** Absolute FQN of the source */
  sourceFqn: string;
  /** Absolute FQN of the target */
  targetFqn: string;
}

/** A relation found in a document together with its resolved endpoints. */
export interface ResolvedRelation {
  /** The raw `Relation` AST node. */
  node: unknown;
  /** Absolute FQN of the source (reference text when unresolvable). */
  sourceFqn: string;
  /** Absolute FQN of the target (reference text when unresolvable). */
  targetFqn: string;
  /**
   * Source as written in the document: the reference text, or the FQN of the
   * enclosing element for a sourceless relation (`-> x`).
   */
  sourceText: string;
  /** Target reference text as written in the document. */
  targetText: string;
  /** True when both endpoints resolved to declared elements. */
  resolved: boolean;
  /**
   * FQN the written source reference links to; undefined when it does not
   * resolve or the relation is sourceless (`-> x`, no reference written).
   */
  linkedSource: string | undefined;
  /** FQN the target reference links to; undefined when it does not resolve. */
  linkedTarget: string | undefined;
}

/** Name → FQN map of one scope container. */
type LocalScope = Map<string, string>;

const SELF_ALIASES = ['this', 'it'] as const;

/**
 * Index of every element declared across a set of documents (one LikeC4
 * project).  Elements declared inside `extend X { ... }` bodies are indexed
 * under X.
 */
export class WorkspaceIndex {
  /** Number of declarations per FQN (duplicates make a name ambiguous). */
  private readonly declarations = new Map<string, number>();
  /** parent FQN → child FQNs (one entry per declaration) */
  private readonly childrenOf = new Map<string, string[]>();
  /** root element name → FQNs (one entry per declaration) */
  private readonly roots = new Map<string, string[]>();
  private readonly uniqueDescendantsCache = new Map<string, Map<string, string>>();

  /** extended FQN → `extend` blocks targeting exactly it, in merge order */
  private readonly extendsOf = new Map<string, ExtendBlockRef[]>();
  /** Documents in merge order */
  private readonly ordered: IndexedDocument[];
  /** element kind → the declaration LikeC4 uses */
  private readonly elementKinds = new Map<string, KindSpec>();
  /** relationship kind → the declaration LikeC4 uses */
  private readonly relationshipKinds = new Map<string, KindSpec>();
  /** deployment node kind → the declaration LikeC4 uses */
  private readonly deploymentNodeKinds = new Map<string, KindSpec>();
  /** Tags declared by a specification (`tag x`) */
  private readonly declaredTags = new Set<string>();
  /** Custom colors declared by a specification (`color x #hex`) */
  private readonly declaredColors = new Set<string>();
  /** relation fingerprint → `extend a -> b` blocks, in merge order (built on first use) */
  private relationExtends: Map<string, ExtendRelationBlockRef[]> | undefined;
  private relationExtendList: Array<{ key: string; block: ExtendRelationBlockRef }> | undefined;

  /**
   * @param documents - Every document of the project: root ASTs, or
   *                    {@link WorkspaceDocument}s carrying file names.  When
   *                    every document is named, `extend` blocks are merged in
   *                    LikeC4's document order (file paths sorted naturally,
   *                    segment by segment); otherwise in the order given.
   * @throws When two file names denote the same path (e.g. `a.c4` and
   *         `./a.c4`).
   */
  constructor(documents: ReadonlyArray<WorkspaceDocumentAst | WorkspaceDocument>) {
    const docs = documents.map(toWorkspaceDocument);
    for (const { ast } of docs) {
      forEachElementDeclaration(ast, (_node, fqn, parentFqn) => {
        this.declarations.set(fqn, (this.declarations.get(fqn) ?? 0) + 1);
        if (parentFqn) push(this.childrenOf, parentFqn, fqn);
        else push(this.roots, fqn, fqn);
      });
    }
    this.ordered = mergeOrder(docs);
    for (const { file, ast } of this.ordered) {
      // LikeC4 merges the specifications of all documents with
      // `Object.assign` (a later document wins); within a document the last
      // declaration of an element or deployment node kind wins
      // (`Object.assign`) and the first one of a relationship kind (later
      // ones are skipped).
      const kinds = specificationKinds(ast);
      const elementKinds = new Map<string, KindSpec>();
      for (const node of kinds.elements) elementKinds.set(node.kind!.name!, readKindSpec(node, file, false));
      for (const node of kinds.deploymentNodes) {
        this.deploymentNodeKinds.set(node.kind!.name!, readKindSpec(node, file, false));
      }
      const relationshipKinds = new Map<string, KindSpec>();
      for (const node of kinds.relationships) {
        const name = node.kind!.name!;
        if (!relationshipKinds.has(name)) relationshipKinds.set(name, readKindSpec(node, file, true));
      }
      for (const [name, spec] of elementKinds) this.elementKinds.set(name, spec);
      for (const [name, spec] of relationshipKinds) this.relationshipKinds.set(name, spec);
      for (const raw of ast.specifications ?? []) {
        const spec = raw as {
          tags?: Array<{ tag?: { name?: string } }>;
          colors?: Array<{ name?: { name?: string } }>;
        };
        for (const tag of spec.tags ?? []) if (tag.tag?.name) this.declaredTags.add(tag.tag.name);
        for (const color of spec.colors ?? []) if (color.name?.name) this.declaredColors.add(color.name.name);
      }
    }
    for (const { file, ast } of this.ordered) {
      for (const model of ast.models ?? []) {
        for (const item of (model.elements ?? []) as AstNodeLike[]) {
          if (!isExtendElement(item)) continue;
          const target = readStrictFqnRef(item.element);
          if (!target) continue;
          push(this.extendsOf, target, file === undefined ? { node: item } : { file, node: item });
        }
      }
    }
  }

  /**
   * The `extend X { ... }` blocks whose X is exactly `fqn`, in the order
   * LikeC4 merges their tags, links and metadata: by document (see the
   * constructor), then in source order.
   */
  extendBlocks(fqn: string): readonly ExtendBlockRef[] {
    return this.extendsOf.get(fqn) ?? [];
  }

  /**
   * The `extend a -> b { ... }` blocks that apply to a relationship, in the
   * order LikeC4 merges their tags, links and metadata: by document (see the
   * constructor), then in source order.  A block applies when its resolved
   * endpoints, kind, title and direction equal the relationship's (LikeC4
   * `relationFingerprint`); several relationships may share it.
   *
   * @param relation - The relationship.  `title` is its own title as LikeC4
   *                   compares it (see `relationTitle`); when it is '' and
   *                   the kind's specification declares a title, that title
   *                   is compared instead, as LikeC4 does.
   */
  extendRelationBlocks(relation: RelationIdentity): readonly ExtendRelationBlockRef[] {
    return this.relationExtendIndex().get(relationFingerprint(this.effectiveIdentity(relation))) ?? [];
  }

  /**
   * The specification declaration LikeC4 uses for an element kind (see
   * `KindDefaults`); undefined when no specification declares it.
   */
  elementKind(kind: string): KindSpec | undefined {
    return this.elementKinds.get(kind);
  }

  /**
   * The specification declaration LikeC4 uses for a relationship kind (see
   * `KindDefaults`); undefined when no specification declares it.
   */
  relationshipKind(kind: string): KindSpec | undefined {
    return this.relationshipKinds.get(kind);
  }

  /**
   * The specification declaration LikeC4 uses for a deployment node kind
   * (`deploymentNode <kind>`): the last one of the last document in merge
   * order, as for an element kind; undefined when no specification
   * declares it.
   */
  deploymentNodeKind(kind: string): KindSpec | undefined {
    return this.deploymentNodeKinds.get(kind);
  }

  /**
   * True when a specification declares the tag `name` (without `#`).  A tag
   * reference links to such a declaration in any document of the project
   * (language-server `LikeC4ScopeComputation.exportSpecification`).
   */
  hasTag(name: string): boolean {
    return this.declaredTags.has(name);
  }

  /** True when a specification declares the custom color `name`. */
  hasCustomColor(name: string): boolean {
    return this.declaredColors.has(name);
  }

  /**
   * The relationship identity LikeC4 compares: a kind no specification
   * declares is no kind (the reference does not resolve); an empty title is
   * replaced by the title of the kind's specification, when it declares a
   * non-empty one (`MergedSpecification.toModelRelation`).
   */
  effectiveIdentity(relation: RelationIdentity): RelationIdentity {
    const resolved = this.resolvedKindIdentity(relation);
    if (resolved.title !== '' || resolved.kind === undefined) return resolved;
    const specTitle = this.relationshipKinds.get(resolved.kind)?.defaults.title;
    return specTitle ? { ...resolved, title: specTitle } : resolved;
  }

  /**
   * `identity` with its kind as LikeC4 resolves the reference
   * (`kind.ref?.name`): undefined when no specification declares it.
   */
  private resolvedKindIdentity(identity: RelationIdentity): RelationIdentity {
    if (identity.kind === undefined || this.relationshipKinds.has(identity.kind)) return identity;
    const { kind: _unresolved, ...rest } = identity;
    return rest;
  }

  /**
   * Every `extend a -> b { ... }` block of the workspace whose endpoints
   * resolve, in merge order, with its fingerprint (`relationFingerprint` of
   * a relationship it applies to).
   *
   * @internal
   */
  extendRelationBlockList(): ReadonlyArray<{ key: string; block: ExtendRelationBlockRef }> {
    if (this.relationExtendList) return this.relationExtendList;
    const list: Array<{ key: string; block: ExtendRelationBlockRef }> = [];
    for (const { file, ast } of this.ordered) {
      for (const block of resolveExtendRelations(ast, this)) {
        // The title of a block is compared as written (no specification title).
        const key = relationFingerprint(
          this.resolvedKindIdentity({
            sourceFqn: block.sourceFqn,
            targetFqn: block.targetFqn,
            kind: relationKind(block.node),
            title: removeIndent(block.node.title ?? ''),
            isBidirectional: block.node.isBidirectional === true,
          }),
        );
        list.push({ key, block: file === undefined ? block : { file, ...block } });
      }
    }
    this.relationExtendList = list;
    return list;
  }

  /** Fingerprint → `extend a -> b` blocks of every document. */
  private relationExtendIndex(): Map<string, ExtendRelationBlockRef[]> {
    if (this.relationExtends) return this.relationExtends;
    const index = new Map<string, ExtendRelationBlockRef[]>();
    for (const { key, block } of this.extendRelationBlockList()) push(index, key, block);
    this.relationExtends = index;
    return index;
  }

  /** True when at least one element with this FQN is declared. */
  has(fqn: string): boolean {
    return this.declarations.has(fqn);
  }

  /**
   * FQNs of the direct children of `fqn` across the workspace — declared in
   * its body or in any `extend` of it — in declaration order, without
   * duplicates.
   */
  children(fqn: string): string[] {
    return [...new Set(this.childrenOf.get(fqn) ?? [])];
  }

  /**
   * Root element with this name, when it is declared exactly once across the
   * workspace.
   */
  rootElement(name: string): string | undefined {
    const fqns = this.roots.get(name);
    return fqns?.length === 1 ? fqns[0] : undefined;
  }

  /**
   * Name → FQN of the elements reachable by a single name below `parent`:
   * direct children with a unique name, then deeper descendants whose name is
   * unique among all descendants and not used by a direct child.
   */
  uniqueDescendants(parent: string): Map<string, string> {
    const cached = this.uniqueDescendantsCache.get(parent);
    if (cached) return cached;

    const children = new Map<string, string[]>();
    for (const fqn of this.childrenOf.get(parent) ?? []) {
      push(children, lastSegment(fqn), fqn);
    }
    const deeper = new Map<string, string[]>();
    const walk = (fqn: string): void => {
      for (const child of this.childrenOf.get(fqn) ?? []) {
        push(deeper, lastSegment(child), child);
        walk(child);
      }
    };
    for (const child of new Set(this.childrenOf.get(parent) ?? [])) walk(child);

    const result = new Map<string, string>();
    for (const [name, fqns] of children) {
      if (fqns.length === 1) result.set(name, fqns[0]);
    }
    for (const [name, fqns] of deeper) {
      if (fqns.length === 1 && !children.has(name)) result.set(name, fqns[0]);
    }
    this.uniqueDescendantsCache.set(parent, result);
    return result;
  }
}

/**
 * Collect every relation of `ast` (model level, nested in element bodies and
 * inside `extend` bodies) with endpoints resolved against `workspace`.
 *
 * @param ast       - Root AST of one document
 * @param workspace - Index of all documents of the project (must include `ast`)
 */
export function resolveRelations(
  ast: WorkspaceDocumentAst,
  workspace: WorkspaceIndex,
): ResolvedRelation[] {
  const results: ResolvedRelation[] = [];
  const models = ast.models ?? [];

  // Document scope: names visible in each model block, kept only when unique
  // across all model blocks of the document.
  const modelScopes = models.map((m) => computeLocalScope(m.elements ?? [], null).scope);
  const documentScope = uniqueAcross(modelScopes);

  const resolver = new EndpointResolver(workspace, documentScope);
  models.forEach((model, i) => {
    resolver.walkContainer(model.elements ?? [], [{ scope: modelScopes[i] }], '', results);
  });
  return results;
}

/** Where a reference is written, for {@link resolveReferenceText}. */
export type ReferencePosition =
  /** Directly in the `model` block with this index (a model-level relation) */
  | { model: number }
  /** In a `views` block, outside a view body (the element of `view ... of X`) */
  | 'views'
  /**
   * In the body of an element or dynamic view.  `frame` is the element whose
   * scope the body adds (LS `genScopeElementView`): X of `view ... of X`, or
   * the `of` element of the `extends` parent chain; dynamic views and views
   * without one have none.
   */
  | { view: { frame?: string } };

/**
 * The absolute FQN LikeC4 links an element reference written as `reference`
 * (`api`, `app.api`, ...) to, when it is written at `position` in the
 * document `ast`; undefined when it does not resolve.
 *
 * Follows LikeC4 1.59.4 (language-server `LikeC4ScopeProvider.computeScope`
 * and `streamForFqnRef`): a parentless name is looked up in the local scope
 * of each container from the reference outwards — for a model-level relation
 * the `model` block (its children and unique descendants), for a reference in
 * a `views` block none, for one in a view body the view's frame element
 * (itself, then its unique descendants) — then in the document scope (names unique across the
 * document's model blocks), then among the root elements of the project.
 * Every further segment is looked up among the unique descendants of the
 * previous one (`FqnIndex.uniqueDescedants`).  `this` / `it` resolve only
 * inside an element or `extend` body, so at these positions they do not.
 */
export function resolveReferenceText(
  ast: WorkspaceDocumentAst,
  workspace: WorkspaceIndex,
  reference: string,
  position: ReferencePosition,
): string | undefined {
  return new DocumentReferenceResolver(ast, workspace).resolve(reference, position);
}

/**
 * {@link resolveReferenceText} for many references of one document: the
 * document's model scopes and the frame scopes of view bodies are prepared
 * once and reused, so each reference costs a lookup.  Resolves exactly as
 * {@link resolveReferenceText}.  Valid as long as `ast` and `workspace` do
 * not change.
 */
export class DocumentReferenceResolver {
  private readonly modelScopes: LocalScope[];
  private readonly resolver: EndpointResolver;
  private readonly frameScopes = new Map<string, LocalScope>();

  constructor(
    ast: WorkspaceDocumentAst,
    private readonly workspace: WorkspaceIndex,
  ) {
    this.modelScopes = (ast.models ?? []).map((m) => computeLocalScope(m.elements ?? [], null).scope);
    this.resolver = new EndpointResolver(workspace, uniqueAcross(this.modelScopes));
  }

  /** The absolute FQN `reference` written at `position` links to; undefined when it does not resolve. */
  resolve(reference: string, position: ReferencePosition): string | undefined {
    let ref: RefLike | undefined;
    for (const segment of reference.split('.')) {
      ref = ref === undefined ? { value: { $refText: segment } } : { parent: ref, value: { $refText: segment } };
    }
    const chain: ScopeFrame[] = [];
    if (position === 'views') {
      // No container scope: the document scope and the root elements only.
    } else if ('view' in position) {
      const frame = position.view.frame;
      if (frame !== undefined) chain.push({ scope: this.frameScope(frame) });
    } else {
      const scope = this.modelScopes[position.model];
      if (scope) chain.push({ scope });
    }
    return this.resolver.resolveEndpoint(ref, chain);
  }

  /**
   * The scope a view body adds for its frame element: the element itself by
   * its name, then its unique descendants; LikeC4 offers the element first,
   * so it wins over a descendant of the same name.
   */
  private frameScope(frame: string): LocalScope {
    let scope = this.frameScopes.get(frame);
    if (!scope) {
      scope = new Map(this.workspace.uniqueDescendants(frame));
      scope.set(lastSegment(frame), frame);
      this.frameScopes.set(frame, scope);
    }
    return scope;
  }
}

/** One element reference written in a document, with the FQN LikeC4 links it to. */
export interface ReferenceResolution {
  /** What the reference is, e.g. `relationship source`, `view target` */
  role: string;
  /** The reference as written (`api`, `app.api`) */
  text: string;
  /** Linked FQN; undefined when the reference does not resolve */
  fqn: string | undefined;
  /**
   * The AST node the reference is written in: the relation, the
   * `extend a -> b` or `extend X` block, or the view
   */
  node: object;
  /**
   * The reference node as written: the topmost `FqnRef`, or the
   * `StrictFqnElementRef` of `extend X`; undefined when the parser
   * recovered the construct without it
   */
  ref: object | undefined;
}

/**
 * Every element reference of `ast` that this module resolves, in source order
 * per kind, with the FQN it links to in `workspace`:
 *  - the written source and the target of every relationship (model level,
 *    in element bodies and in `extend X` bodies; see {@link resolveRelations});
 *  - the source and target of every `extend a -> b { ... }` block;
 *  - the X of every `extend X { ... }` block (a strict FQN: it resolves when
 *    an element with exactly that FQN is declared);
 *  - the element of every `view ... of X` (see {@link resolveReferenceText}).
 *
 * References of view rules, dynamic view steps and the deployment model are
 * not included: their scopes are not reproduced by this module.
 */
export function resolveDocumentReferences(
  ast: WorkspaceDocumentAst,
  workspace: WorkspaceIndex,
): ReferenceResolution[] {
  const results: ReferenceResolution[] = [];
  for (const rel of resolveRelations(ast, workspace)) {
    const node = rel.node as AstNodeLike;
    if (node.source) {
      results.push({ role: 'relationship source', text: rel.sourceText, fqn: rel.linkedSource, node, ref: node.source as object | undefined });
    }
    results.push({ role: 'relationship target', text: rel.targetText, fqn: rel.linkedTarget, node, ref: node.target as object | undefined });
  }

  const models = ast.models ?? [];
  const modelScopes = models.map((m) => computeLocalScope(m.elements ?? [], null).scope);
  const resolver = new EndpointResolver(workspace, uniqueAcross(modelScopes));
  models.forEach((model, i) => {
    const chain: ScopeFrame[] = [{ scope: modelScopes[i] }];
    for (const raw of model.elements ?? []) {
      const item = raw as AstNodeLike;
      if (item.$type === 'ExtendRelation') {
        for (const role of ['source', 'target'] as const) {
          const ref = item[role] as RefLike | undefined;
          results.push({
            role: `extend relationship ${role}`,
            text: resolveFqnRef(ref),
            fqn: resolver.resolveEndpoint(ref, chain),
            node: item,
            ref,
          });
        }
      } else if (isExtendElement(item)) {
        const text = readStrictFqnRef(item.element);
        if (text !== undefined) {
          results.push({ role: 'extend target', text, fqn: workspace.has(text) ? text : undefined, node: item, ref: item.element as object | undefined });
        }
      }
    }
  });

  for (const block of (ast.views ?? []) as Array<{ views?: Array<{ viewOf?: { modelElement?: unknown } }> }>) {
    for (const view of block.views ?? []) {
      const ref = view.viewOf?.modelElement as RefLike | undefined;
      if (!ref) continue;
      results.push({ role: 'view target', text: resolveFqnRef(ref), fqn: resolver.resolveEndpoint(ref, []), node: view, ref });
    }
  }
  return results;
}

/**
 * Every `extend a -> b { ... }` block of `ast` whose endpoints both resolve
 * (in the scope of its `model` block, like a model-level relation), in
 * source order.
 */
function resolveExtendRelations(
  ast: WorkspaceDocumentAst,
  workspace: WorkspaceIndex,
): ExtendRelationBlockRef[] {
  const results: ExtendRelationBlockRef[] = [];
  const models = ast.models ?? [];
  const modelScopes = models.map((m) => computeLocalScope(m.elements ?? [], null).scope);
  const resolver = new EndpointResolver(workspace, uniqueAcross(modelScopes));
  models.forEach((model, i) => {
    const chain: ScopeFrame[] = [{ scope: modelScopes[i] }];
    for (const raw of model.elements ?? []) {
      const item = raw as AstNodeLike;
      if (item.$type !== 'ExtendRelation') continue;
      const sourceFqn = resolver.resolveEndpoint(item.source as RefLike | undefined, chain);
      const targetFqn = resolver.resolveEndpoint(item.target as RefLike | undefined, chain);
      if (sourceFqn === undefined || targetFqn === undefined) continue;
      results.push({ node: item as unknown as ExtendRelationNode, sourceFqn, targetFqn });
    }
  });
  return results;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** One level of the lexical scope chain, innermost first. */
interface ScopeFrame {
  scope: LocalScope;
  /** Element bound to `this` / `it` (and the implicit source) in this frame. */
  self?: string;
  /** Set for `extend X { ... }` bodies: the extended element X. */
  extended?: string;
}

class EndpointResolver {
  constructor(
    private readonly workspace: WorkspaceIndex,
    private readonly documentScope: LocalScope,
  ) {}

  walkContainer(
    elements: unknown[],
    chain: ScopeFrame[],
    ownerFqn: string,
    results: ResolvedRelation[],
  ): void {
    for (const raw of elements) {
      const item = raw as AstNodeLike;
      if (item.$type === 'Relation') {
        results.push(this.resolveRelation(item, chain, ownerFqn));
      } else if (item.$type === 'Element' && item.name) {
        const fqn = ownerFqn ? `${ownerFqn}.${item.name}` : item.name;
        const body = item.body;
        if (!body?.elements) continue;
        const frame: ScopeFrame = {
          scope: computeLocalScope(body.elements, fqn).scope,
          self: fqn,
        };
        this.walkContainer(body.elements, [frame, ...chain], fqn, results);
      } else if (item.$type === 'ExtendElement') {
        const extended = readStrictFqnRef(item.element);
        const body = item.body;
        if (!extended || !body?.elements) continue;
        const frame: ScopeFrame = {
          scope: computeLocalScope(body.elements, extended).scope,
          self: extended,
          extended,
        };
        this.walkContainer(body.elements, [frame, ...chain], extended, results);
      }
    }
  }

  private resolveRelation(rel: AstNodeLike, chain: ScopeFrame[], ownerFqn: string): ResolvedRelation {
    const targetText = resolveFqnRef(rel.target);
    const resolvedTarget = this.resolveRef(rel.target as RefLike | undefined, chain);
    const targetFqn = resolvedTarget ?? targetText;
    if (rel.source) {
      const sourceText = resolveFqnRef(rel.source);
      const resolvedSource = this.resolveRef(rel.source as RefLike, chain);
      const sourceFqn = resolvedSource ?? sourceText;
      const resolved = resolvedSource !== undefined && resolvedTarget !== undefined;
      return {
        node: rel,
        sourceFqn,
        targetFqn,
        sourceText,
        targetText,
        resolved,
        linkedSource: resolvedSource,
        linkedTarget: resolvedTarget,
      };
    }
    // Sourceless relation: the owner of the enclosing body is the source.
    const resolved = ownerFqn !== '' && resolvedTarget !== undefined;
    return {
      node: rel,
      sourceFqn: ownerFqn,
      targetFqn,
      sourceText: ownerFqn,
      targetText,
      resolved,
      linkedSource: undefined,
      linkedTarget: resolvedTarget,
    };
  }

  /** Resolve a relation endpoint reference; undefined when unresolvable. */
  resolveEndpoint(ref: RefLike | undefined, chain: ScopeFrame[]): string | undefined {
    return this.resolveRef(ref, chain);
  }

  /** Resolve a (possibly qualified) reference; undefined when unresolvable. */
  private resolveRef(ref: RefLike | undefined, chain: ScopeFrame[]): string | undefined {
    if (!ref) return undefined;
    const name = ref.value?.$refText;
    if (!name) return undefined;
    if (!ref.parent) return this.resolveName(name, chain);
    const parentFqn = this.resolveRef(ref.parent, chain);
    if (parentFqn === undefined) return undefined;
    return this.workspace.uniqueDescendants(parentFqn).get(name);
  }

  private resolveName(name: string, chain: ScopeFrame[]): string | undefined {
    for (const frame of chain) {
      // LikeC4 registers `this` / `it` in a body scope before the body's
      // children, so the alias shadows a child that shares its name.
      if (frame.self !== undefined && (SELF_ALIASES as readonly string[]).includes(name)) {
        return frame.self;
      }
      const local = frame.scope.get(name);
      if (local !== undefined) return local;
      if (frame.extended !== undefined) {
        if (lastSegment(frame.extended) === name) return frame.extended;
        const desc = this.workspace.uniqueDescendants(frame.extended).get(name);
        if (desc !== undefined) return desc;
      }
    }
    const fromDocument = this.documentScope.get(name);
    if (fromDocument !== undefined) return fromDocument;
    return this.workspace.rootElement(name);
  }
}

/**
 * Local scope of one container (model block, element body or extend body):
 * direct child elements plus descendants whose name is unique across the
 * container's subtree and not shadowed by a direct child.  Mirrors
 * `LikeC4ScopeComputation.processContainer`.
 *
 * @param elements - The container's `elements` array
 * @param ownerFqn - FQN that children of this container are nested under
 *                   (null for a model block)
 */
function computeLocalScope(
  elements: unknown[],
  ownerFqn: string | null,
): { scope: LocalScope } {
  const direct = new Map<string, string[]>();
  const nested: LocalScope[] = [];
  for (const raw of elements) {
    const item = raw as AstNodeLike;
    if (item.$type === 'Element' && item.name) {
      const fqn = ownerFqn ? `${ownerFqn}.${item.name}` : item.name;
      push(direct, item.name, fqn);
      if (item.body?.elements?.length) nested.push(computeLocalScope(item.body.elements, fqn).scope);
    } else if (item.$type === 'ExtendElement') {
      const extended = readStrictFqnRef(item.element);
      if (extended && item.body?.elements?.length) {
        nested.push(computeLocalScope(item.body.elements, extended).scope);
      }
    }
  }

  const scope: LocalScope = new Map();
  for (const [name, fqns] of direct) {
    // LikeC4 keeps the first declaration; a duplicate is reported by its validator.
    scope.set(name, fqns[0]);
  }
  for (const [name, fqn] of uniqueAcross(nested)) {
    if (!direct.has(name)) scope.set(name, fqn);
  }
  return { scope };
}

/** Names that occur in exactly one of the given scopes. */
function uniqueAcross(scopes: LocalScope[]): LocalScope {
  const seen = new Map<string, string[]>();
  for (const scope of scopes) {
    for (const [name, fqn] of scope) push(seen, name, fqn);
  }
  const out: LocalScope = new Map();
  for (const [name, fqns] of seen) {
    if (fqns.length === 1) out.set(name, fqns[0]);
  }
  return out;
}

/** A document with its optional file name. */
export interface IndexedDocument {
  file?: string;
  ast: WorkspaceDocumentAst;
}

/** A document as given to an index constructor, with its file name when it has one. */
export function toWorkspaceDocument(doc: WorkspaceDocumentAst | WorkspaceDocument): IndexedDocument {
  if ('file' in doc && typeof doc.file === 'string' && 'ast' in doc) {
    return { file: doc.file, ast: doc.ast };
  }
  return { ast: doc as WorkspaceDocumentAst };
}

/** LikeC4 orders the documents of a project by URI path (`compareByUri`). */
const compareByPath = compareNaturalHierarchically('/');

/**
 * Documents in the order LikeC4 merges their `extend` blocks: sorted by
 * normalized path when every document is named, otherwise as given.
 *
 * @throws When two file names denote the same path.
 */
export function mergeOrder(docs: IndexedDocument[]): IndexedDocument[] {
  if (docs.some((d) => d.file === undefined)) return docs;
  const byPath = new Map<string, string>();
  const keyed = docs.map((doc) => {
    const path = normalizePath(doc.file!);
    const other = byPath.get(path);
    if (other !== undefined) {
      throw new Error(`Files '${other}' and '${doc.file}' denote the same path '${path}'`);
    }
    byPath.set(path, doc.file!);
    return { doc, path };
  });
  keyed.sort((a, b) => compareByPath(a.path, b.path));
  return keyed.map((k) => k.doc);
}

/**
 * Path of a file below the virtual project root, as it appears in a
 * document URI: `\` and `/` separate segments, `.` segments are dropped and
 * `..` removes the preceding segment (never above the root).
 */
function normalizePath(file: string): string {
  const segments: string[] = [];
  for (const segment of file.split(/[\\/]/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

function lastSegment(fqn: string): string {
  const dot = fqn.lastIndexOf('.');
  return dot === -1 ? fqn : fqn.slice(dot + 1);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
