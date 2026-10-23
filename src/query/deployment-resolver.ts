/**
 * Resolution of deployment references the way LikeC4 1.60.0 links them
 * (language-server `LikeC4ScopeComputation.processDeployments`,
 * `LikeC4ScopeProvider.computeScope` / `streamForFqnRef` /
 * `getScopeForStrictFqnRef`, `FqnIndex.uniqueDescedants`).
 *
 * The standalone parser does not link references, so they are available as
 * written only.  This module turns them into the targets LikeC4 links them
 * to:
 *
 *  - **Local scopes.**  Every deployment container — a `deployment` block, a
 *    node body, an instance body, an `extend <node>` body — sees its named
 *    direct children (nodes and instances) plus the deeper names that are
 *    unique within its subtree and not used by a direct child.  A node or
 *    instance body also binds `this` / `it` to its owner.  The document scope
 *    holds the names of the document's `deployment` blocks that are unique per
 *    kind (node or instance).
 *  - **Parentless names** are looked up in passes: deployment nodes first —
 *    the containers from the reference outwards, each `extend` body adding
 *    the extended node (by name) and its unique descendants (of any kind, as
 *    LikeC4 does), the document scope, the root nodes of every document —
 *    then instances along the same chain.  So a root node beats a closer
 *    instance with the same name, and `this` / `it` inside an instance body
 *    is the enclosing node.  In a deployment view, logical elements are a
 *    third pass (document scope and root elements).
 *  - **Qualified names** `a.b`: `b` among the unique descendants of `a` — of
 *    a node in the deployment model; of an instance or an element in the
 *    logical model (the instance's element).  An endpoint that steps into an
 *    instance's element is `{ deployment: <instance>, element: <fqn> }`.
 *  - **`extend X`** is a strict path: a root node, then direct child nodes
 *    named uniquely among the children of the path written before them.
 *  - **`instanceOf X`** is an element reference: the document's model scope
 *    and the root elements, then unique descendants
 *    (`resolveReferenceText(…, 'views')`).
 *
 * An unknown or ambiguous name resolves to nothing, as LikeC4 leaves such a
 * reference unlinked.
 */
import { readStrictFqnRef, resolveFqnRef } from './fqn.js';
import type { DeploymentAstNode, DeploymentDeclaration, DeploymentExtendRef, DeploymentIndex, DeploymentRelationRef } from './deployment-index.js';
import { resolveReferenceText, type WorkspaceDocumentAst, type WorkspaceIndex } from './workspace-index.js';

/**
 * A deployment target: a node or an instance, plus the FQN of the element
 * when the reference steps into the instance's element.
 */
export interface DeploymentTarget {
  /** Deployment id of the node or instance */
  deployment: string;
  /** FQN of the element inside the instance's element */
  element?: string;
}

/** What a reference links to: a deployment target, or a logical element (deployment views only). */
export type LinkedTarget = DeploymentTarget | { model: string };

/** A topmost reference of a deployment view rule, with its target. */
export interface DeploymentViewReference {
  /** The topmost `FqnRef` AST node */
  node: DeploymentAstNode;
  /** The reference as written, e.g. 'prod.eu.vm1' */
  text: string;
  /** What it links to; undefined when it does not resolve */
  target: LinkedTarget | undefined;
}

/** How a parentless name is looked up. */
type ResolutionMode =
  /** A deployment reference: nodes, then instances */
  | 'deployment'
  /** A reference of a deployment view rule: nodes, instances, then elements */
  | 'view'
  /** An element reference (`instanceOf`) */
  | 'element'
  /** A reference in a `global` block or a `views`-block style rule: elements, nodes, then instances */
  | 'global';

/** A deployment element a scope offers under a name (LikeC4 `AstNodeDescription`). */
interface Description {
  name: string;
  type: 'DeploymentNode' | 'DeployedInstance';
  id: string;
  node: DeploymentAstNode;
}

/** What a reference segment links to. */
type Linked =
  | Description
  /** A logical element; `instance` is set when it was reached through an instance */
  | { type: 'Element'; fqn: string; instance?: string };

/** Structural view of an AST node with its container link, as Langium builds it. */
interface AstLike {
  $type?: string;
  $container?: AstLike;
  [k: string]: unknown;
}

/** Structural view of an `FqnRef` / `StrictFqnRef`. */
interface RefLike {
  $type?: string;
  $container?: AstLike;
  parent?: RefLike;
  value?: { $refText?: string };
}

const SELF_ALIASES = ['this', 'it'] as const;

/** Resolves deployment references of the documents of a {@link DeploymentIndex}. */
export class DeploymentResolver {
  /** Container AST node (or document root) → descriptions in the order LikeC4 offers them */
  private readonly scopes = new Map<object, Description[]>();
  /** Document root AST → position in document order */
  private readonly documentOf = new Map<object, number>();
  /** Declaration AST node → its declaration */
  private readonly declarationOf = new Map<object, DeploymentDeclaration>();
  /** Root node descriptions of every document, in document order (project scope) */
  private readonly projectRoots: Description[] = [];
  private readonly uniqueDescendantsCache = new Map<string, Map<string, Description>>();
  private readonly elementCache = new Map<string, string | undefined>();

  /**
   * @param index     - Deployment index of the workspace
   * @param workspace - Element index of the same documents (for `instanceOf`
   *                    and references that step into an instance's element)
   */
  constructor(
    private readonly index: DeploymentIndex,
    private readonly workspace: WorkspaceIndex,
  ) {
    for (const id of index.ids()) {
      for (const declaration of index.declarations(id)) this.declarationOf.set(declaration.node, declaration);
    }
    index.documents.forEach(({ ast }, document) => {
      this.documentOf.set(ast, document);
      const exported: Description[] = [];
      for (const block of ast.deployments ?? []) {
        exported.push(...this.processDeployments(block as AstLike));
        for (const raw of block.elements ?? []) {
          const description = this.describe(raw as AstLike);
          if (description?.type === 'DeploymentNode') this.projectRoots.push(description);
        }
      }
      this.scopes.set(ast, uniqueByTypeAndName(exported));
    });
  }

  /**
   * Source and target of a deployment relationship; undefined when either
   * does not resolve (LikeC4 then drops the relationship).  A relationship
   * written without a source starts at the enclosing node or instance.
   */
  relationEndpoints(relation: DeploymentRelationRef): { source: DeploymentTarget; target: DeploymentTarget } | undefined {
    const node = relation.node as AstLike;
    const source = node['source']
      ? this.endpoint(node['source'] as RefLike)
      : this.enclosingOwner(node);
    const target = this.endpoint(node['target'] as RefLike | undefined);
    return source && target ? { source, target } : undefined;
  }

  /**
   * The element an instance deploys (`instanceOf X`), as an absolute FQN;
   * undefined when the reference does not resolve.
   */
  instanceElement(instance: DeploymentAstNode): string | undefined {
    const ref = (instance['target'] as { modelElement?: RefLike } | undefined)?.modelElement;
    if (!ref) return undefined;
    const linked = this.resolveRef(ref, 'element');
    return linked?.type === 'Element' ? linked.fqn : undefined;
  }

  /**
   * The node an `extend <node>` block links to: its written path when that
   * path resolves strictly (a root node, then direct child nodes); undefined
   * otherwise.  The last segment decides, as LikeC4 links it: it must name a
   * node that is the only child with that name of the path written before it.
   */
  extendTarget(extend: DeploymentExtendRef): string | undefined {
    return this.strictTarget(extend.node['deploymentNode'] as RefLike | undefined);
  }

  /**
   * The node a strict path written as `text` (the target of `extend <text>`)
   * links to, as {@link extendTarget} links a parsed one; undefined
   * otherwise.
   */
  resolveStrictText(text: string): string | undefined {
    let ref: RefLike | undefined;
    for (const segment of text.split('.')) {
      ref = ref === undefined ? { value: { $refText: segment } } : { parent: ref, value: { $refText: segment } };
    }
    return this.strictTarget(ref);
  }

  /**
   * Every topmost reference in the rules of the deployment views of one
   * document (by its position in document order), with its target.
   */
  viewReferences(document: number): DeploymentViewReference[] {
    const out: DeploymentViewReference[] = [];
    for (const view of this.index.views(document)) {
      walkAst(view.node as AstLike, (node) => {
        if (node.$type !== 'FqnRef' || node.$container?.$type === 'FqnRef') return true;
        if (!hasContainer(node, 'DeploymentViewBody')) return true;
        out.push({ node: node as DeploymentAstNode, text: resolveFqnRef(node), target: this.resolveReference(node as RefLike) });
        return false;
      });
    }
    return out;
  }

  /**
   * What a reference written as `text` (`api`, `prod.vm1.api`, `this`)
   * resolves to when written directly in `container` — a `deployment` block,
   * a node, instance or `extend` body, or a deployment view body.  Elements
   * are candidates only in a deployment view body.  Undefined when it does
   * not resolve.
   */
  resolveText(text: string, container: DeploymentAstNode): LinkedTarget | undefined {
    const ref = writtenRef(text, container);
    if (!ref) return undefined;
    return toTarget(this.resolveRef(ref, hasContainer(container as AstLike, 'DeploymentViewBody', true) ? 'view' : 'deployment'));
  }

  /**
   * The element an `instanceOf <text>` written directly in `container` (a
   * node body) would deploy, as an absolute FQN: `text` is looked up as
   * LikeC4 links `instanceOf` — the document's model scope and the root
   * elements, then unique descendants — never among nodes or instances.
   * Undefined when it does not resolve (an unknown or ambiguous name).
   */
  resolveElementText(text: string, container: DeploymentAstNode): string | undefined {
    const ref = writtenRef(text, container);
    const linked = ref && this.resolveRef(ref, 'element');
    return linked?.type === 'Element' ? linked.fqn : undefined;
  }

  /** What a parsed `FqnRef` of a deployment model or deployment view links to. */
  resolveReference(ref: RefLike): LinkedTarget | undefined {
    const mode: ResolutionMode = hasContainer(ref as AstLike, 'ElementRef')
      ? 'element'
      : hasContainer(ref as AstLike, 'DeploymentViewBody')
        ? 'view'
        : 'deployment';
    return toTarget(this.resolveRef(ref, mode));
  }

  /**
   * What a parsed `FqnRef` written in a `global` block or a `views`-block
   * style rule links to.  LikeC4 offers a parentless name there as an
   * element, then a deployment node, then a deployed instance
   * (`genScopeForParentlessFqnRef`, `isFqnRefInsideGlobals`), so the target
   * is a logical element, a node or instance, or an element reached through
   * an instance.  Undefined when it does not resolve.
   */
  resolveGlobalReference(ref: RefLike): LinkedTarget | undefined {
    return toTarget(this.resolveRef(ref, 'global'));
  }

  /**
   * Name → description of the deployment elements reachable by a single name
   * below `id`: direct children (nodes and instances) with a unique name,
   * then deeper descendants whose name is unique among all descendants and
   * not used by a direct child (`FqnIndex.uniqueDescedants`).
   */
  private uniqueDescendants(id: string): Map<string, Description> {
    const cached = this.uniqueDescendantsCache.get(id);
    if (cached) return cached;
    const children = new Map<string, Description[]>();
    const all = new Map<string, Description[]>();
    const prefix = `${id}.`;
    for (const candidate of this.index.ids()) {
      if (!candidate.startsWith(prefix)) continue;
      for (const declaration of this.index.declarations(candidate)) {
        const description = this.describe(declaration.node as AstLike)!;
        push(all, description.name, description);
        if (declaration.parentId === id) push(children, description.name, description);
      }
    }
    const result = new Map<string, Description>();
    for (const [name, list] of children) if (list.length === 1) result.set(name, list[0]!);
    for (const [name, list] of all) if (list.length === 1 && !children.has(name)) result.set(name, list[0]!);
    this.uniqueDescendantsCache.set(id, result);
    return result;
  }

  /** Mirror of `processDeployments`: fills the scope of `container` and returns it. */
  private processDeployments(container: AstLike): Description[] {
    const local = new Map<string, Description[]>();
    const descendants: Description[] = [];
    for (const raw of (container['elements'] as unknown[] | undefined) ?? []) {
      const el = raw as AstLike;
      if (el.$type === 'DeploymentRelation') continue;
      const body = el['body'] as AstLike | undefined;
      if (el.$type !== 'ExtendDeployment') {
        const description = this.describe(el);
        if (description) {
          push(local, description.name, description);
          if (body) for (const alias of SELF_ALIASES) this.addScope(body, [{ ...description, name: alias }]);
        }
      }
      if (body) descendants.push(...this.processDeployments(body));
    }
    const byName = new Map<string, Description[]>();
    for (const description of descendants) {
      if (!local.has(description.name)) push(byName, description.name, description);
    }
    for (const [name, list] of byName) if (list.length === 1) local.set(name, list);
    const values = [...local.values()].flat();
    this.addScope(container, values);
    return values;
  }

  private addScope(container: object, descriptions: Description[]): void {
    const list = this.scopes.get(container);
    if (list) list.push(...descriptions);
    else this.scopes.set(container, [...descriptions]);
  }

  /** The description of a node or instance declaration; undefined when it has no id. */
  private describe(el: AstLike): Description | undefined {
    if (el.$type !== 'DeploymentNode' && el.$type !== 'DeployedInstance') return undefined;
    const declaration = this.declarationOf.get(el);
    if (!declaration) return undefined;
    return { name: declaration.name, type: el.$type, id: declaration.id, node: declaration.node };
  }

  private resolveRef(ref: RefLike, mode: ResolutionMode): Linked | undefined {
    const name = ref.value?.$refText;
    if (!name) return undefined;
    if (!ref.parent) return this.resolveName(name, ref as AstLike, mode);
    const parent = this.resolveRef(ref.parent, mode);
    if (!parent) return undefined;
    if (parent.type === 'DeploymentNode') return this.uniqueDescendants(parent.id).get(name);
    // An instance steps into its element's model tree; an element into its own.
    const [base, instance] =
      parent.type === 'Element' ? [parent.fqn, parent.instance] : [this.instanceElement(parent.node), parent.id];
    if (base === undefined) return undefined;
    const fqn = this.workspace.uniqueDescendants(base).get(name);
    if (fqn === undefined) return undefined;
    return { type: 'Element', fqn, ...(instance !== undefined && { instance }) };
  }

  private resolveName(name: string, from: AstLike, mode: ResolutionMode): Linked | undefined {
    const deployed = (): Description | undefined =>
      this.lookup(name, from, 'DeploymentNode') ?? this.lookup(name, from, 'DeployedInstance');
    if (mode === 'deployment' || mode === 'view') {
      const found = deployed();
      if (found || mode === 'deployment') return found;
    }
    const element = this.elementOf(name, from);
    if (element || mode !== 'global') return element;
    return deployed();
  }

  /** The element a parentless `name` written at `from` names: the document's model scope, then root elements. */
  private elementOf(name: string, from: AstLike): Linked | undefined {
    const root = documentRoot(from);
    const document = root === undefined ? undefined : this.documentOf.get(root);
    if (root === undefined || document === undefined) return undefined;
    const fqn = this.elementByName(document, root as WorkspaceDocumentAst, name);
    return fqn === undefined ? undefined : { type: 'Element', fqn };
  }

  /** One pass of `computeScope` for `type`, then the project scope. */
  private lookup(name: string, from: AstLike, type: Description['type']): Description | undefined {
    for (let container: AstLike | undefined = from; container; container = container.$container) {
      const local = this.scopes.get(container)?.find((d) => d.type === type && d.name === name);
      if (local) return local;
      if (container.$type === 'ExtendDeploymentBody' && container.$container) {
        const target = this.strictTarget(container.$container['deploymentNode'] as RefLike | undefined);
        if (target !== undefined) {
          const extended = this.index.declarations(target)[0];
          if (extended && extended.name === name) return this.describe(extended.node as AstLike);
          const descendant = this.uniqueDescendants(target).get(name);
          if (descendant) return descendant;
        }
      }
    }
    return type === 'DeploymentNode' ? this.projectRoots.find((d) => d.name === name) : undefined;
  }

  /** Strict path resolution of `extend X` (`getScopeForStrictFqnRef`). */
  private strictTarget(ref: RefLike | undefined): string | undefined {
    const path = readStrictFqnRef(ref);
    const name = ref?.value?.$refText;
    if (path === undefined || !name) return undefined;
    if (!ref!.parent) return this.projectRoots.some((d) => d.name === name) ? path : undefined;
    const parentPath = readStrictFqnRef(ref!.parent);
    if (parentPath === undefined) return undefined;
    const named = this.index.children(parentPath).flatMap((id) =>
      this.index.declarations(id).filter((d) => d.parentId === parentPath && d.name === name),
    );
    return named.length === 1 && named[0]!.type === 'node' ? path : undefined;
  }

  /** Element scope of a parentless name: the document's model scope, then root elements. */
  private elementByName(document: number, ast: WorkspaceDocumentAst, name: string): string | undefined {
    const key = `${document}:${name}`;
    if (!this.elementCache.has(key)) this.elementCache.set(key, resolveReferenceText(ast, this.workspace, name, 'views'));
    return this.elementCache.get(key);
  }

  private endpoint(ref: RefLike | undefined): DeploymentTarget | undefined {
    if (!ref) return undefined;
    const target = toTarget(this.resolveRef(ref, 'deployment'));
    return target && 'deployment' in target ? target : undefined;
  }

  /** The node or instance whose body holds a source-less relationship. */
  private enclosingOwner(relation: AstLike): DeploymentTarget | undefined {
    const body = relation.$container;
    if (body?.$type !== 'DeploymentNodeBody' && body?.$type !== 'DeployedInstanceBody') return undefined;
    const owner = body.$container && this.declarationOf.get(body.$container);
    return owner ? { deployment: owner.id } : undefined;
  }
}

/** The `FqnRef` chain of `text` (`a.b.c`) as if written directly in `container`. */
function writtenRef(text: string, container: DeploymentAstNode): RefLike | undefined {
  let ref: RefLike | undefined;
  for (const segment of text.split('.')) {
    ref = ref === undefined
      ? { $type: 'FqnRef', $container: container as AstLike, value: { $refText: segment } }
      : { $type: 'FqnRef', parent: ref, $container: container as AstLike, value: { $refText: segment } };
  }
  return ref;
}

function toTarget(linked: Linked | undefined): LinkedTarget | undefined {
  if (!linked) return undefined;
  if (linked.type !== 'Element') return { deployment: linked.id };
  return linked.instance !== undefined ? { deployment: linked.instance, element: linked.fqn } : { model: linked.fqn };
}

/** LikeC4 `uniqueDescriptions` for the document scope: names unique per kind. */
function uniqueByTypeAndName(descriptions: Description[]): Description[] {
  const groups = new Map<string, Description[]>();
  for (const description of descriptions) push(groups, `${description.type}.${description.name}`, description);
  return [...groups.values()].flatMap((list) => (list.length === 1 ? list : []));
}

function hasContainer(node: AstLike, type: string, includeSelf = false): boolean {
  for (let c = includeSelf ? node : node.$container; c; c = c.$container) if (c.$type === type) return true;
  return false;
}

function documentRoot(node: AstLike): AstLike | undefined {
  let current: AstLike | undefined = node;
  while (current?.$container) current = current.$container;
  return current;
}

/** Visit the AST nodes below `node` (not references); `visit` returns false to skip a subtree. */
function walkAst(node: AstLike, visit: (node: AstLike) => boolean): void {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child || typeof child !== 'object' || '$refText' in child || !('$type' in child)) continue;
      if (visit(child as AstLike)) walkAst(child as AstLike, visit);
    }
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
