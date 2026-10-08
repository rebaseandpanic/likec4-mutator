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
  /** relationship kind → title of its specification (when it declares one) */
  private readonly kindTitles = new Map<string, string>();
  /** relation fingerprint → `extend a -> b` blocks, in merge order (built on first use) */
  private relationExtends: Map<string, ExtendRelationBlockRef[]> | undefined;

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
    for (const { ast } of this.ordered) {
      // LikeC4 merges the specifications of all documents with
      // `Object.assign` (a later document wins); within a document the first
      // declaration of a kind wins.
      const titles = new Map<string, string | undefined>();
      for (const kind of specificationRelationshipKinds(ast)) {
        if (!titles.has(kind.name)) titles.set(kind.name, kind.title);
      }
      for (const [name, title] of titles) {
        if (title === undefined) this.kindTitles.delete(name);
        else this.kindTitles.set(name, title);
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
   * The relationship identity LikeC4 compares: an empty title is replaced by
   * the title of the kind's specification, when it declares one
   * (`MergedSpecification.toModelRelation`).
   */
  effectiveIdentity(relation: RelationIdentity): RelationIdentity {
    if (relation.title !== '' || relation.kind === undefined) return relation;
    const specTitle = this.kindTitles.get(relation.kind);
    return specTitle === undefined ? relation : { ...relation, title: specTitle };
  }

  /** Fingerprint → `extend a -> b` blocks of every document. */
  private relationExtendIndex(): Map<string, ExtendRelationBlockRef[]> {
    if (this.relationExtends) return this.relationExtends;
    const index = new Map<string, ExtendRelationBlockRef[]>();
    for (const { file, ast } of this.ordered) {
      for (const block of resolveExtendRelations(ast, this)) {
        const key = relationFingerprint({
          sourceFqn: block.sourceFqn,
          targetFqn: block.targetFqn,
          kind: relationKind(block.node),
          title: removeIndent(block.node.title ?? ''),
          isBidirectional: block.node.isBidirectional === true,
        });
        push(index, key, file === undefined ? block : { file, ...block });
      }
    }
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

/** Relationship kinds declared in the specification blocks of `ast`, with their title. */
function specificationRelationshipKinds(ast: WorkspaceDocumentAst): Array<{ name: string; title?: string }> {
  const kinds: Array<{ name: string; title?: string }> = [];
  for (const rawSpec of ast.specifications ?? []) {
    const spec = rawSpec as {
      relationships?: Array<{
        kind?: { name?: string };
        props?: Array<{ $type?: string; key?: string; value?: { text?: string; markdown?: string } }>;
      }>;
    };
    for (const rel of spec.relationships ?? []) {
      const name = rel.kind?.name;
      if (!name) continue;
      let title: string | undefined;
      for (const prop of rel.props ?? []) {
        if (prop.$type !== 'SpecificationRelationshipStringProperty' || prop.key !== 'title') continue;
        const text = prop.value?.text ?? prop.value?.markdown;
        if (text !== undefined) title = text;
      }
      // `parseBaseProps`: the title is dedented; an empty one is no title.
      const normalized = title === undefined ? undefined : removeIndent(title);
      kinds.push(normalized ? { name, title: normalized } : { name });
    }
  }
  return kinds;
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
      return { node: rel, sourceFqn, targetFqn, sourceText, targetText, resolved };
    }
    // Sourceless relation: the owner of the enclosing body is the source.
    const resolved = ownerFqn !== '' && resolvedTarget !== undefined;
    return { node: rel, sourceFqn: ownerFqn, targetFqn, sourceText: ownerFqn, targetText, resolved };
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
interface IndexedDocument {
  file?: string;
  ast: WorkspaceDocumentAst;
}

function toWorkspaceDocument(doc: WorkspaceDocumentAst | WorkspaceDocument): IndexedDocument {
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
 */
function mergeOrder(docs: IndexedDocument[]): IndexedDocument[] {
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
