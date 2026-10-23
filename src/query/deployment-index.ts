/**
 * Workspace-wide index of the deployment model: deployment nodes, instances,
 * `extend <node>` blocks, deployment relationships and deployment views of
 * every document, in LikeC4's document order.
 *
 * Ids are built the way LikeC4 1.60.0 builds them (language-server
 * `DeploymentsIndex.createDocumentIndex`, `LikeC4NameProvider.getName`):
 *
 *  - a node or instance id is its parent's id + `.` + its name; a root node's
 *    id is its name;
 *  - an instance written without a name (`instanceOf a.b`) is named after the
 *    last segment of the reference as written (`b`);
 *  - a node or instance declared inside `extend X { ... }` is a child of X,
 *    the path written after `extend` (whether or not a node has that id);
 *  - instances hold no nodes or instances (their bodies hold relationships
 *    only).
 *
 * The index records every declaration of an id, so duplicates (a LikeC4
 * error) stay visible.  It does not resolve references; see
 * `DeploymentResolver`.
 */
import { readStrictFqnRef } from './fqn.js';
import {
  mergeOrder,
  toWorkspaceDocument,
  type IndexedDocument,
  type WorkspaceDocument,
  type WorkspaceDocumentAst,
} from './workspace-index.js';

/** Structural view of a deployment AST node, as far as this module reads it. */
export interface DeploymentAstNode {
  $type?: string;
  name?: string;
  body?: { elements?: unknown[]; [k: string]: unknown };
  [k: string]: unknown;
}

/**
 * A container that encloses a declaration or relationship and contributes to
 * reference scoping: a node body, an instance body or an `extend <node>`
 * body.
 */
export type DeploymentFrame =
  | { type: 'node'; id: string; node: DeploymentAstNode }
  | { type: 'instance'; id: string; node: DeploymentAstNode }
  | { type: 'extend'; target: string; node: DeploymentAstNode };

/** One declaration of a deployment node or instance. */
export interface DeploymentDeclaration {
  /** Deployment id, e.g. 'prod.eu.vm1' */
  id: string;
  /** Local name (explicit, or implicit for an unnamed instance) */
  name: string;
  /** Whether this is a `DeploymentNode` or a `DeployedInstance` */
  type: 'node' | 'instance';
  /** Id of the parent node; undefined for a root node */
  parentId?: string;
  /** The `DeploymentNode` / `DeployedInstance` AST node */
  node: DeploymentAstNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
  /** Enclosing frames, outermost first */
  frames: readonly DeploymentFrame[];
}

/** An `extend <node> { ... }` block. */
export interface DeploymentExtendRef {
  /** The path written after `extend` */
  target: string;
  /** The `ExtendDeployment` AST node */
  node: DeploymentAstNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
}

/** A deployment relationship together with the frames that enclose it. */
export interface DeploymentRelationRef {
  /** The `DeploymentRelation` AST node */
  node: DeploymentAstNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
  /** Enclosing frames, outermost first; empty at the top level of a `deployment` block */
  frames: readonly DeploymentFrame[];
}

/** A `deployment view` of a `views` block. */
export interface DeploymentViewRef {
  /** The `DeploymentView` AST node */
  node: DeploymentAstNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
}

/** Index of the deployment model of a workspace. */
export class DeploymentIndex {
  /** Documents in LikeC4's document order */
  readonly documents: readonly IndexedDocument[];

  private readonly byId = new Map<string, DeploymentDeclaration[]>();
  private readonly childrenOf = new Map<string, string[]>();
  private readonly rootIds: string[] = [];
  private readonly rootsOfDocument: string[][] = [];
  private readonly extendsOf = new Map<string, DeploymentExtendRef[]>();
  private readonly extendList: DeploymentExtendRef[] = [];
  private readonly relationList: DeploymentRelationRef[] = [];
  private readonly viewsOfDocument: DeploymentViewRef[][] = [];

  /**
   * @param documents - Every document of the project, as for `WorkspaceIndex`:
   *                    root ASTs, or documents carrying file names (then
   *                    walked in LikeC4's document order).
   * @throws When two file names denote the same path.
   */
  constructor(documents: ReadonlyArray<WorkspaceDocumentAst | WorkspaceDocument>) {
    this.documents = mergeOrder(documents.map(toWorkspaceDocument));
    this.documents.forEach((doc, index) => this.indexDocument(doc, index));
  }

  /** Every declared id (nodes and instances), each once, in walk order. */
  ids(): string[] {
    return [...this.byId.keys()];
  }

  /** True when at least one node or instance is declared with `id`. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Every declaration of `id` in document order; more than one is a duplicate id. */
  declarations(id: string): readonly DeploymentDeclaration[] {
    return this.byId.get(id) ?? [];
  }

  /**
   * Ids of the direct children of `id` (nodes and instances), each once, in
   * document order — including those declared in `extend` blocks.
   */
  children(id: string): readonly string[] {
    return this.childrenOf.get(id) ?? [];
  }

  /** Ids of the root nodes of the project, each once, in document order. */
  roots(): readonly string[] {
    return this.rootIds;
  }

  /** Ids of the root nodes declared in one document (by its position in document order). */
  documentRoots(document: number): readonly string[] {
    return this.rootsOfDocument[document] ?? [];
  }

  /** The `extend <node>` blocks whose written path is exactly `target`, in merge order. */
  extendBlocks(target: string): readonly DeploymentExtendRef[] {
    return this.extendsOf.get(target) ?? [];
  }

  /** Every `extend <node>` block, in merge order. */
  allExtendBlocks(): readonly DeploymentExtendRef[] {
    return this.extendList;
  }

  /** Every deployment relationship, in document order, then source order. */
  relations(): readonly DeploymentRelationRef[] {
    return this.relationList;
  }

  /** The deployment views of one document (by its position in document order). */
  views(document: number): readonly DeploymentViewRef[] {
    return this.viewsOfDocument[document] ?? [];
  }

  private indexDocument({ file, ast }: IndexedDocument, document: number): void {
    const roots: string[] = [];
    this.rootsOfDocument.push(roots);
    const at = file === undefined ? { document } : { file, document };
    for (const block of ast.deployments ?? []) {
      for (const raw of block.elements ?? []) {
        const item = raw as DeploymentAstNode;
        if (item.$type === 'ExtendDeployment') {
          const target = readStrictFqnRef(item['deploymentNode']);
          if (target === undefined) continue;
          const ref: DeploymentExtendRef = { target, node: item, ...at };
          push(this.extendsOf, target, ref);
          this.extendList.push(ref);
          this.walkBody(item, target, [{ type: 'extend', target, node: item }], at);
        } else if (item.$type === 'DeploymentRelation') {
          this.relationList.push({ node: item, ...at, frames: [] });
        } else {
          const id = this.declare(item, undefined, [], at);
          if (id !== undefined && !roots.includes(id)) roots.push(id);
        }
      }
    }
    const views: DeploymentViewRef[] = [];
    for (const block of (ast.views ?? []) as Array<{ views?: DeploymentAstNode[] }>) {
      for (const view of block.views ?? []) {
        if (view.$type === 'DeploymentView') views.push({ node: view, ...at });
      }
    }
    this.viewsOfDocument.push(views);
  }

  /** Record a node or instance declaration and walk its body; returns its id. */
  private declare(
    item: DeploymentAstNode,
    parentId: string | undefined,
    frames: readonly DeploymentFrame[],
    at: { file?: string; document: number },
  ): string | undefined {
    const type = item.$type === 'DeploymentNode' ? 'node' : item.$type === 'DeployedInstance' ? 'instance' : undefined;
    if (type === undefined) return undefined;
    const name = type === 'node' ? item.name : (item.name ?? implicitInstanceName(item));
    if (!name) return undefined;
    const id = parentId === undefined ? name : `${parentId}.${name}`;
    push(this.byId, id, { id, name, type, ...(parentId !== undefined && { parentId }), node: item, ...at, frames });
    if (parentId === undefined) {
      if (!this.rootIds.includes(id)) this.rootIds.push(id);
    } else {
      const siblings = this.childrenOf.get(parentId);
      if (!siblings) this.childrenOf.set(parentId, [id]);
      else if (!siblings.includes(id)) siblings.push(id);
    }
    this.walkBody(item, id, [...frames, { type, id, node: item }], at);
    return id;
  }

  /** Walk the body of a node, an instance or an `extend` block. */
  private walkBody(
    owner: DeploymentAstNode,
    ownerId: string,
    frames: readonly DeploymentFrame[],
    at: { file?: string; document: number },
  ): void {
    const ownerIsInstance = owner.$type === 'DeployedInstance';
    for (const raw of owner.body?.elements ?? []) {
      const child = raw as DeploymentAstNode;
      if (child.$type === 'DeploymentRelation') {
        this.relationList.push({ node: child, ...at, frames });
      } else if (!ownerIsInstance) {
        this.declare(child, ownerId, frames, at);
      }
    }
  }
}

/**
 * The name LikeC4 gives an instance written without one: the last segment of
 * its `instanceOf` reference as written.
 */
export function implicitInstanceName(instance: DeploymentAstNode): string | undefined {
  const target = instance['target'] as { modelElement?: { value?: { $refText?: string } } } | undefined;
  return target?.modelElement?.value?.$refText || undefined;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
