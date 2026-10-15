/**
 * Resolution of the references written in views, mirroring LikeC4 1.59.4's
 * view scoping (language-server `LikeC4ScopeProvider`,
 * `genScopeForParentlessFqnRef` / `genScopeElementView`), and the
 * step-contribution predicate {@link contributesSteps}.
 *
 *  - Element references in element and dynamic views see elements only: a
 *    parentless name is looked up in the view's frame (element views: X of
 *    `view … of X`, else the `of` element of the `extends` parent chain;
 *    dynamic views: none), then among the names unique across the
 *    document's model blocks, then among the root elements of the project
 *    (see `resolveReferenceText`).  The scopes of each document are
 *    prepared once per resolver: a resolver is bound to one generation of
 *    the indices and is replaced when they are rebuilt.
 *  - References in deployment views resolve to deployment nodes and
 *    instances first, then to elements (`DeploymentResolver`).
 *  - View references are typed by role: `navigateTo` of an element `with`
 *    accepts any view, of a relation `with` or a step only a dynamic view,
 *    `extends` only an element view.
 *  - Tags, element kinds, deployment node kinds and relationship kinds
 *    resolve against the specifications of the workspace.
 */
import { DeploymentResolver, type LinkedTarget } from './deployment-resolver.js';
import type { DeploymentIndex } from './deployment-index.js';
import { resolveFqnRef } from './fqn.js';
import type { ViewAstNode, ViewDeclaration, ViewIndex, ViewStepStatementEntry } from './view-index.js';
import { DocumentReferenceResolver, type WorkspaceIndex } from './workspace-index.js';

/** The view types a view reference accepts, by where it is written. */
export type ViewTargetRole =
  /** `navigateTo` of an element predicate's `with`: any view */
  | 'any'
  /** `navigateTo` of a relation predicate's `with` or of a step: a dynamic view */
  | 'dynamic'
  /** `extends`: an element view */
  | 'element';

const TARGET_TYPES: Readonly<Record<ViewTargetRole, ReadonlySet<string>>> = {
  any: new Set(['element', 'dynamic', 'deployment']),
  dynamic: new Set(['dynamic']),
  element: new Set(['element']),
};

/** Resolves the references written in the views of a workspace. */
export class ViewReferenceResolver {
  private readonly deploymentResolver: DeploymentResolver;
  private readonly frames = new Map<ViewDeclaration, string | undefined>();
  /** Prepared scopes of each document, by position in document order */
  private readonly documentResolvers = new Map<number, DocumentReferenceResolver>();
  private readonly elementCache = new Map<string, string | undefined>();

  /**
   * @param workspace   - Element index of the workspace
   * @param deployments - Deployment index of the same documents
   * @param views       - View index of the same documents
   */
  constructor(
    private readonly workspace: WorkspaceIndex,
    deployments: DeploymentIndex,
    private readonly views: ViewIndex,
  ) {
    this.deploymentResolver = new DeploymentResolver(deployments, workspace);
  }

  /**
   * The element of `view … of X`, resolved in the view's document as
   * LikeC4 links it (outside the body: no frame); undefined when the view
   * has no `of` or it does not resolve.
   */
  viewOf(view: ViewDeclaration): string | undefined {
    const ref = (view.node.viewOf as { modelElement?: unknown } | undefined)?.modelElement;
    if (!ref) return undefined;
    return this.documentResolver(view).resolve(resolveFqnRef(ref), 'views');
  }

  /** The view id written after `extends`; undefined when none. */
  extendsText(view: ViewDeclaration): string | undefined {
    return (view.node.extends as { view?: { $refText?: string } } | undefined)?.view?.$refText;
  }

  /**
   * The declaration `extends` links to: the first element view declared
   * with the written id; undefined when none is declared.
   */
  extendsParent(view: ViewDeclaration): ViewDeclaration | undefined {
    const text = this.extendsText(view);
    return text === undefined ? undefined : this.views.declarationsOf(text).find((d) => d.type === 'element');
  }

  /**
   * The element whose scope the body of an element view adds: its `of`
   * element, else that of its `extends` parent, recursively; undefined for
   * dynamic and deployment views, for views without either, and for an
   * `extends` cycle.
   */
  frame(view: ViewDeclaration): string | undefined {
    if (this.frames.has(view)) return this.frames.get(view);
    this.frames.set(view, undefined); // an `extends` cycle ends with no frame
    let frame: string | undefined;
    if (view.type === 'element') {
      if (view.node.viewOf) frame = this.viewOf(view);
      else {
        const parent = this.extendsParent(view);
        frame = parent ? this.frame(parent) : undefined;
      }
    }
    this.frames.set(view, frame);
    return frame;
  }

  /**
   * The element FQN an element reference written as `text` in the body of
   * the element or dynamic view `view` links to; undefined when it does not
   * resolve (unknown or ambiguous name).
   */
  resolveElementText(view: ViewDeclaration, text: string): string | undefined {
    const frame = this.frame(view);
    const key = `${view.document}\u0000${frame ?? ''}\u0000${text}`;
    if (this.elementCache.has(key)) return this.elementCache.get(key);
    const fqn = this.documentResolver(view).resolve(text, { view: frame === undefined ? {} : { frame } });
    this.elementCache.set(key, fqn);
    return fqn;
  }

  /** The element FQN a parsed `FqnRef` in the body of the element or dynamic view `view` links to. */
  resolveElementRef(view: ViewDeclaration, ref: unknown): string | undefined {
    const text = resolveFqnRef(ref);
    return text === '' ? undefined : this.resolveElementText(view, text);
  }

  /**
   * What a reference written as `text` in the body of the deployment view
   * `view` links to: a node or instance, or an element (a model
   * reference); undefined when it does not resolve.
   */
  resolveDeploymentText(view: ViewDeclaration, text: string): LinkedTarget | undefined {
    return view.body ? this.deploymentResolver.resolveText(text, view.body) : undefined;
  }

  /** What a parsed `FqnRef` in the body of a deployment view links to. */
  resolveDeploymentRef(ref: unknown): LinkedTarget | undefined {
    return this.deploymentResolver.resolveReference(ref as Parameters<DeploymentResolver['resolveReference']>[0]);
  }

  /**
   * The view id a view reference written as `text` links to when the
   * reference accepts the view types of `role`: some declaration of that
   * id has one of them; undefined otherwise.
   */
  resolveViewText(text: string, role: ViewTargetRole): string | undefined {
    return this.views.declarationsOf(text).some((d) => TARGET_TYPES[role].has(d.type)) ? text : undefined;
  }

  /** Whether `name` (without `#`) is a tag declared by a specification. */
  isTag(name: string): boolean {
    return this.workspace.hasTag(name);
  }

  /** Whether `name` is a declared element kind (`element.kind = name`). */
  isElementKind(name: string): boolean {
    return this.workspace.elementKind(name) !== undefined;
  }

  /** Whether `name` is a declared element kind or deployment node kind (`where kind is name`). */
  isElementOrDeploymentNodeKind(name: string): boolean {
    return this.isElementKind(name) || this.workspace.deploymentNodeKind(name) !== undefined;
  }

  /** Whether `name` is a declared relationship kind. */
  isRelationshipKind(name: string): boolean {
    return this.workspace.relationshipKind(name) !== undefined;
  }

  /** The prepared scopes of the document `view` is declared in, built on first use. */
  private documentResolver(view: ViewDeclaration): DocumentReferenceResolver {
    let resolver = this.documentResolvers.get(view.document);
    if (!resolver) {
      resolver = new DocumentReferenceResolver(this.views.documents[view.document]!.ast, this.workspace);
      this.documentResolvers.set(view.document, resolver);
    }
    return resolver;
  }
}

/**
 * Whether the step statement `statement` of the dynamic view `view`
 * contributes at least one step to LikeC4's parse of the view (LS:6596-6790):
 *  - a single step: both endpoints resolve (an endpoint that does not
 *    resolve to an element makes the parser throw);
 *  - a chain: every endpoint resolves and the first segment is not
 *    backward (LikeC4 parses a chain after `a <- b` to nothing);
 *  - a `par` / `parallel`, `opt`, `loop` or `break` block: at least one
 *    contributing statement (an empty block fails an invariant);
 *  - `try`: its `try` part contributes;
 *  - `alt`: at least one `if` / `when` / `else` branch contributes;
 *  - a stray `if` / `when` / `else` never contributes.
 * As observed on 1.59.4, a parent-child step and a `par` nested in a `par`
 * are still parsed (and computed) despite their validation errors, and
 * unresolved relationship kinds or `navigateTo` targets do not stop a step
 * from contributing.
 */
export function contributesSteps(
  statement: ViewStepStatementEntry,
  view: ViewDeclaration,
  resolver: ViewReferenceResolver,
): boolean {
  const any = (statements: ViewStepStatementEntry[]): boolean =>
    statements.some((s) => contributesSteps(s, view, resolver));
  switch (statement.form) {
    case 'step':
    case 'chain':
      return chainContributes(statement, view, resolver);
    case 'parallel':
      return any(statement.statements);
    case 'opaque':
      switch (statement.keyword) {
        case 'opt':
        case 'loop':
        case 'break':
          return any(statement.parts[0]?.statements ?? []);
        case 'try':
          return any(statement.parts.find((p) => p.keyword === 'try')?.statements ?? []);
        case 'alt':
          return statement.parts.some((p) => ['if', 'when', 'else'].includes(p.keyword) && any(p.statements));
        default:
          return false;
      }
  }
}

/** Whether a step or chain contributes its steps (see {@link contributesSteps}). */
function chainContributes(statement: ViewStepStatementEntry, view: ViewDeclaration, resolver: ViewReferenceResolver): boolean {
  const [first, ...rest] = statement.segments;
  if (!first) return false;
  const source = resolver.resolveElementRef(view, (first.node.source as ViewAstNode | undefined)?.modelElement);
  const target = resolver.resolveElementRef(view, (first.node.target as ViewAstNode | undefined)?.modelElement);
  if (source === undefined || target === undefined) return false;
  if (rest.length > 0 && first.node.isBackward) return false;
  return rest.every(
    (segment) => resolver.resolveElementRef(view, (segment.node.target as ViewAstNode | undefined)?.modelElement) !== undefined,
  );
}
