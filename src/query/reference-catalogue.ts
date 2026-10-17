/**
 * The reference catalogue: every element, deployment, view and import
 * reference written in a workspace, with what it links to and where it sits
 * — the one inventory that removal, rename, move and the reference stability
 * check read (lc4m-15.30, D60).
 *
 *  - **Entries.**  One entry per written reference: every topmost `FqnRef`
 *    chain, every `StrictFqnRef` chain (`extend <node>`), every
 *    `StrictFqnElementRef` chain (`extend <element>`), every view reference
 *    (`extends`, `navigateTo`) and every imported name, resolved or not, per
 *    document in source order, documents in LikeC4's document order.  Text
 *    the parser could not recover has no AST node and no entry.
 *  - **Role.**  The FR-001 role of the place the reference is written at
 *    (see {@link CatalogueRole}), decided from the AST containers.  A
 *    reference at an unmodelled place is `opaque-flow` (a flow block of a
 *    dynamic view other than `par` / `parallel`) or `global-or-import`
 *    (a `global` block, an `import`), whatever its local container.
 *  - **Target.**  What LikeC4 links the reference to, as this library's
 *    resolvers reproduce it: model relationships, `extend` targets and
 *    endpoints and view `of` through `resolveDocumentReferences`; the
 *    deployment model and deployment views through `DeploymentResolver`;
 *    element and dynamic view bodies, `extends` and `navigateTo` through
 *    `ViewReferenceResolver`; `views`-block style targets and `global`
 *    references in the document scope (no container scope, as a view `of`);
 *    an imported name as the root element of that name.
 *  - **Statement class and containers.**  The FR-003 class of the view
 *    statement the reference is written in, and the chain of constructs a
 *    cascade edits around it (item, rule, groups; step statement, `par`).
 *
 * The catalogue reads the unlinked AST of the standalone parser and is
 * bound to one generation of the indices it is built from.
 */
import { DeploymentResolver, type LinkedTarget } from './deployment-resolver.js';
import type { DeploymentAstNode, DeploymentIndex } from './deployment-index.js';
import { resolveFqnRef } from './fqn.js';
import type { ViewAstNode, ViewDeclaration, ViewIndex } from './view-index.js';
import { ViewReferenceResolver, type ViewTargetRole } from './view-resolver.js';
import { DocumentReferenceResolver, resolveDocumentReferences, type WorkspaceIndex } from './workspace-index.js';

/**
 * Where a reference is written, by the rows of FR-001 (lc4m-15.30):
 * - `relationship-endpoint`: a model relationship endpoint, at any nesting
 *   level and in `extend` bodies;
 * - `extend-element-target`: the target of `extend <element>`;
 * - `extend-relationship-endpoint`: an endpoint of `extend a -> b`;
 * - `deployment-relationship-endpoint`: a deployment relationship endpoint,
 *   a path through an instance into its element included;
 * - `extend-node-target`: the target of `extend <node>`;
 * - `instance-of`, `view-of`, `view-extends`;
 * - `predicate-item`: an include / exclude item of an element, dynamic or
 *   deployment view, at top level or in a `group`, or a dynamic `include`;
 * - `navigate-to`: `navigateTo` in an element `with`, a relation `with`, a
 *   step, a model or a deployment relationship body;
 * - `step-endpoint`: an endpoint of a dynamic step or chain segment;
 * - `style-target`: a target of a view or `views`-block style rule;
 * - `rank-target`: a target of a `rank` rule;
 * - `opaque-flow`: any reference at an unmodelled flow place;
 * - `global-or-import`: any reference in a `global` block or an `import`.
 */
export type CatalogueRole =
  | 'relationship-endpoint'
  | 'extend-element-target'
  | 'extend-relationship-endpoint'
  | 'deployment-relationship-endpoint'
  | 'extend-node-target'
  | 'instance-of'
  | 'view-of'
  | 'view-extends'
  | 'predicate-item'
  | 'navigate-to'
  | 'step-endpoint'
  | 'style-target'
  | 'rank-target'
  | 'opaque-flow'
  | 'global-or-import';

/**
 * What a reference links to: a logical element, a deployment node or
 * instance (with the element when the path steps into the instance's
 * element), or a view.
 */
export type CatalogueTarget = LinkedTarget | { view: string };

/**
 * The FR-003 class of the view statement a reference is written in: a rule
 * (include / exclude, style, `rank`, dynamic `include`; `views`-block style
 * rules), a step statement (a step, a chain, a `par` / `parallel` block and
 * what it holds), an opaque statement (any other flow block and what it
 * holds; `global` predicates and styles), or a view property.
 */
export type StatementClass = 'rule' | 'step' | 'opaque' | 'property';

/** One reference of the catalogue. */
export interface CatalogueEntry {
  /** File the reference is written in */
  file: string;
  /** Position of the document in LikeC4's document order */
  document: number;
  /** The reference node as written (the topmost chain node, the view reference, the `Imported`) */
  node: ViewAstNode;
  /** Offset of the written reference in its file */
  offset: number;
  /** End offset of the written reference */
  end: number;
  /** 1-based line of the written reference */
  line: number;
  role: CatalogueRole;
  /** What the reference is, for messages, e.g. `relationship source`, `view rule reference` */
  description: string;
  /** The reference as written (a whole dotted chain) */
  text: string;
  /** What it links to; undefined when it does not resolve (an unknown or ambiguous name) */
  target: CatalogueTarget | undefined;
  /** The view declaration it is written in; undefined outside views and in `views`-block style rules */
  view?: ViewDeclaration;
  /** The FR-003 class of its view statement; undefined outside view statements (`of`, `extends`, the model, imports) */
  statementClass?: StatementClass;
  /**
   * The constructs a cascade edits around the reference, innermost first:
   * the rule item, the rule, the enclosing groups; or the step statement
   * and the enclosing `par` / `parallel` block.  Empty outside view
   * statements.
   */
  containers: ViewAstNode[];
  /** It lies at an unmodelled place: never cascaded, rewritten or counted as content */
  unmodelled: boolean;
}

/** Flow blocks of a dynamic view that are modelled: their statements are step statements. */
const MODELLED_FLOWS: ReadonlySet<string> = new Set(['par', 'parallel']);

/** The containers that make what they hold unmodelled, besides a non-`par` `SubflowStep`. */
const UNMODELLED_TYPES: ReadonlySet<string> = new Set([
  'AltSteps',
  'TryBlock',
  'CatchBlock',
  'FinallyBlock',
  'Globals',
  'ImportsFromPoject',
]);

/** Rule nodes a cascade edits, and the role of a reference item they hold. */
const RULE_ROLES: Readonly<Record<string, CatalogueRole>> = {
  ViewRulePredicate: 'predicate-item',
  DeploymentViewRulePredicate: 'predicate-item',
  DynamicViewIncludePredicate: 'predicate-item',
  ViewRuleStyle: 'style-target',
  DeploymentViewRuleStyle: 'style-target',
  ViewRuleRank: 'rank-target',
};

/** The `prev`-linked item lists of rules: their `value` is a rule item. */
const ITEM_LISTS: ReadonlySet<string> = new Set(['Expressions', 'FqnExpressions']);

const VIEW_REFERENCE_TYPES: ReadonlySet<string> = new Set(['ViewRef', 'DynamicViewRef', 'ElementViewRef']);

/** The catalogue of one generation of the indices. */
export class ReferenceCatalogue {
  /**
   * @param documents - The documents the entries are written in, in LikeC4's document order
   * @param list      - Every entry, per document in source order
   */
  constructor(
    readonly documents: ReadonlyArray<{ file: string; ast: object }>,
    private readonly list: readonly CatalogueEntry[],
  ) {}

  /** Every entry, per document in source order, documents in LikeC4's document order. */
  entries(): readonly CatalogueEntry[] {
    return this.list;
  }

  /** The entries whose target is the element `fqn` or lies below it, a path through an instance included. */
  intoElement(fqn: string): CatalogueEntry[] {
    return this.list.filter((entry) => {
      const target = entry.target;
      if (target === undefined || 'view' in target) return false;
      const element = 'model' in target ? target.model : target.element;
      return element !== undefined && inSubtree(element, fqn);
    });
  }

  /** The entries whose target is the deployment node or instance `id` or lies below it. */
  intoDeployment(id: string): CatalogueEntry[] {
    return this.list.filter((entry) => entry.target !== undefined && 'deployment' in entry.target && inSubtree(entry.target.deployment, id));
  }

  /** The entries whose target is the view `id`. */
  toView(id: string): CatalogueEntry[] {
    return this.list.filter((entry) => entry.target !== undefined && 'view' in entry.target && entry.target.view === id);
  }
}

/**
 * Build the catalogue of the documents of `views` (the same documents as
 * `workspace` and `deployments`).
 *
 * @throws {Error} (internal) for a reference at a modelled place whose role
 *   or target source is not known, so a grammar change cannot pass silently
 */
export function buildReferenceCatalogue(
  workspace: WorkspaceIndex,
  deployments: DeploymentIndex,
  views: ViewIndex,
): ReferenceCatalogue {
  const deploymentResolver = new DeploymentResolver(deployments, workspace);
  const viewResolver = new ViewReferenceResolver(workspace, deployments, views);
  const declarations = new Map<object, ViewDeclaration>(views.declarations().map((d) => [d.node, d]));

  const extendTargets = new Map<object, string | undefined>();
  for (const extend of deployments.allExtendBlocks()) {
    const ref = extend.node['deploymentNode'];
    if (ref && typeof ref === 'object') extendTargets.set(ref, deploymentResolver.extendTarget(extend));
  }

  const documents = views.documents.map(({ file, ast }) => ({ file: file ?? '', ast: ast as object }));
  const list: CatalogueEntry[] = [];
  documents.forEach(({ file, ast }, document) => {
    const modelTargets = new Map<object, string | undefined>();
    for (const reference of resolveDocumentReferences(views.documents[document]!.ast, workspace)) {
      if (reference.ref) modelTargets.set(reference.ref, reference.fqn);
    }
    let documentResolver: DocumentReferenceResolver | undefined;
    const resolveInDocument = (text: string): string | undefined => {
      documentResolver ??= new DocumentReferenceResolver(views.documents[document]!.ast, workspace);
      return documentResolver.resolve(text, 'views');
    };

    const found: CatalogueEntry[] = [];
    walk(ast as ViewAstNode, (node) => {
      const written = readReference(node);
      if (!written) return true;
      const context = contextOf(node, declarations);
      const role = context.unmodelled
        ? context.global
          ? 'global-or-import'
          : 'opaque-flow'
        : modelledRole(node);
      const cst = written.cst;
      found.push({
        file,
        document,
        node,
        offset: cst.offset,
        end: cst.end,
        line: (cst.range?.start?.line ?? 0) + 1,
        role,
        description: describe(node, context),
        text: written.text,
        target: targetOf(node, written.text, context),
        ...(context.view && { view: context.view }),
        ...(context.statementClass && { statementClass: context.statementClass }),
        containers: context.containers,
        unmodelled: context.unmodelled,
      });
      // An import list nests the earlier names; a reference chain holds no other reference.
      return node.$type === 'Imported';
    });
    list.push(...found.sort((a, b) => a.offset - b.offset));

    /** The target of the reference `node`, written as `text`, from the resolver of its place. */
    function targetOf(node: ViewAstNode, text: string, context: ReferenceContext): CatalogueTarget | undefined {
      const model = (fqn: string | undefined): CatalogueTarget | undefined => (fqn === undefined ? undefined : { model: fqn });
      switch (node.$type) {
        case 'Imported':
          return model(workspace.rootElement(text));
        case 'ElementViewRef':
          return view(viewResolver.resolveViewText(text, 'element'));
        case 'ViewRef':
        case 'DynamicViewRef': {
          const accepts: ViewTargetRole = node.$type === 'ViewRef' ? 'any' : 'dynamic';
          return view(viewResolver.resolveViewText(text, accepts));
        }
        case 'StrictFqnRef':
          return deployment(extendTargets.get(node));
        case 'StrictFqnElementRef':
          return model(known(modelTargets, node));
      }
      // A topmost `FqnRef`.
      if (context.view) {
        const declaration = context.view;
        if (declaration.type === 'deployment') return viewResolver.resolveDeploymentRef(node);
        if (node.$container?.$type === 'ElementRef' && node.$container.$container === declaration.node) {
          return model(viewResolver.viewOf(declaration));
        }
        return model(viewResolver.resolveElementRef(declaration, node));
      }
      switch (context.block) {
        case 'Globals':
        case 'ModelViews':
          return model(resolveInDocument(text));
        case 'ModelDeployments': {
          const instance = node.$container?.$type === 'ElementRef' ? node.$container.$container : undefined;
          if (instance?.$type === 'DeployedInstance') return model(deploymentResolver.instanceElement(instance as DeploymentAstNode));
          return deploymentResolver.resolveReference(node);
        }
        case 'Model':
          return model(known(modelTargets, node));
      }
      throw new Error(`Internal error: no resolver for the reference '${text}' in '${file}'`);
    }

    /** The target `targets` holds for `node`; every model reference has one. */
    function known(targets: Map<object, string | undefined>, node: ViewAstNode): string | undefined {
      if (!targets.has(node)) {
        throw new Error(`Internal error: the reference '${resolveFqnRef(node)}' in '${file}' was not resolved with the model`);
      }
      return targets.get(node);
    }
  });
  return new ReferenceCatalogue(documents, list);
}

/** Where a reference sits, from its AST containers. */
interface ReferenceContext {
  /** The top-level block it is written in (`Model`, `ModelDeployments`, `ModelViews`, `Globals`, `ImportsFromPoject`, …) */
  block: string | undefined;
  view: ViewDeclaration | undefined;
  /** It lies at an unmodelled place */
  unmodelled: boolean;
  /** The unmodelled place is a `global` block or an import */
  global: boolean;
  statementClass: StatementClass | undefined;
  containers: ViewAstNode[];
}

/**
 * Whether `node` opens an unmodelled place — the unmodelled boundary of
 * lc4m-15.30: a `SubflowStep` whose kind is not `par` or `parallel`, an
 * `AltSteps`, a `TryBlock`, `CatchBlock` or `FinallyBlock`, a `Globals`
 * block or an `ImportsFromPoject`.  What it holds is never cascaded,
 * rewritten or counted as content.
 */
export function isUnmodelledPlace(node: { $type?: string; [k: string]: unknown }): boolean {
  const type = node.$type ?? '';
  return (type === 'SubflowStep' && !MODELLED_FLOWS.has(String(node['kind']))) || UNMODELLED_TYPES.has(type);
}

/** The context of the reference `node`: one walk up its containers. */
function contextOf(node: ViewAstNode, declarations: ReadonlyMap<object, ViewDeclaration>): ReferenceContext {
  const context: ReferenceContext = {
    block: undefined,
    view: undefined,
    unmodelled: false,
    global: false,
    statementClass: undefined,
    containers: [],
  };
  let inStep = false;
  let inRule = false;
  let inBody = false;
  for (let child = node, up = node.$container; up; child = up, up = up.$container) {
    const type = up.$type ?? '';
    if (isUnmodelledPlace(up)) {
      context.unmodelled = true;
      if (type === 'Globals' || type === 'ImportsFromPoject') context.global = true;
    }
    if (ITEM_LISTS.has(type) && up['value'] === child) context.containers.push(child);
    if (Object.hasOwn(RULE_ROLES, type) || type === 'ViewRuleGroup') {
      context.containers.push(up);
      inRule = true;
    }
    if (
      ((type === 'Step' || type === 'StepSeries') && up.$container?.$type !== 'StepSeries') ||
      (type === 'SubflowStep' && MODELLED_FLOWS.has(String(up['kind'])))
    ) {
      context.containers.push(up);
      inStep = true;
    }
    if (type.endsWith('ViewBody')) inBody = true;
    const declaration = declarations.get(up);
    if (declaration) context.view ??= declaration;
    if (up.$container !== undefined && up.$container.$container === undefined) context.block = type;
  }
  if (context.unmodelled) context.statementClass = context.block === 'ImportsFromPoject' ? undefined : 'opaque';
  else if (inStep) context.statementClass = 'step';
  else if (inRule) context.statementClass = 'rule';
  else if (inBody) context.statementClass = 'property';
  if (context.statementClass === undefined || context.unmodelled) context.containers = [];
  return context;
}

/** The FR-001 role of a reference at a modelled place, from its containers. */
function modelledRole(node: ViewAstNode): CatalogueRole {
  switch (node.$type) {
    case 'StrictFqnRef':
      return 'extend-node-target';
    case 'StrictFqnElementRef':
      return 'extend-element-target';
    case 'ElementViewRef':
      return 'view-extends';
    case 'ViewRef':
    case 'DynamicViewRef':
      return 'navigate-to';
    case 'Imported':
      return 'global-or-import';
  }
  const container = node.$container;
  switch (container?.$type) {
    case 'Relation':
      return 'relationship-endpoint';
    case 'ExtendRelation':
      return 'extend-relationship-endpoint';
    case 'DeploymentRelation':
      return 'deployment-relationship-endpoint';
    case 'ElementRef': {
      const owner = container.$container?.$type ?? '';
      if (owner === 'DeployedInstance') return 'instance-of';
      if (owner === 'ElementView') return 'view-of';
      if (owner === 'Step' || owner === 'StepSeries') return 'step-endpoint';
      break;
    }
    default:
      for (let up = container; up; up = up.$container) {
        if (Object.hasOwn(RULE_ROLES, up.$type ?? '')) return RULE_ROLES[up.$type!]!;
      }
  }
  throw new Error(`Internal error: no reference role for '${resolveFqnRef(node)}' in a ${container?.$type ?? 'document'}`);
}

/** What the reference `node` is, for messages. */
function describe(node: ViewAstNode, context: ReferenceContext): string {
  const container = node.$container;
  const side = container?.['source'] === node ? 'source' : 'target';
  switch (node.$type) {
    case 'Imported':
      return 'import';
    case 'StrictFqnRef':
      return 'deployment extend target';
    case 'StrictFqnElementRef':
      return 'extend target';
    case 'ElementViewRef':
      return 'view extends';
    case 'ViewRef':
      return 'element with navigateTo';
    case 'DynamicViewRef':
      for (let up = container; up; up = up.$container) {
        switch (up.$type) {
          case 'Step':
          case 'StepSeries':
            return 'step navigateTo';
          case 'RelationExprWith':
            return 'relation with navigateTo';
          case 'DeploymentRelation':
            return 'deployment relationship navigateTo';
          case 'Relation':
            return 'relationship navigateTo';
        }
      }
      return 'navigateTo';
  }
  switch (container?.$type) {
    case 'Relation':
      return `relationship ${side}`;
    case 'ExtendRelation':
      return `extend relationship ${side}`;
    case 'DeploymentRelation':
      return `deployment relationship ${side}`;
  }
  if (context.block === 'Globals') return 'global reference';
  if (context.view?.type === 'deployment') return 'deployment view reference';
  if (context.view) {
    if (container?.$type === 'ElementRef' && container.$container === context.view.node) return 'view target';
    return isInStep(node) ? 'view step endpoint' : 'view rule reference';
  }
  if (container?.$type === 'ElementRef') return 'instanceOf target';
  if (context.block === 'ModelViews') return 'views style target';
  return 'reference';
}

/** Whether `node` is written in a dynamic step (a step endpoint, in an opaque block too). */
function isInStep(node: ViewAstNode): boolean {
  for (let up = node.$container; up; up = up.$container) {
    if (up.$type === 'Step' || up.$type === 'StepSeries') return true;
  }
  return false;
}

/** The written form of a reference node, or undefined when `node` is not one (or not topmost). */
function readReference(node: ViewAstNode): { text: string; cst: NonNullable<ViewAstNode['$cstNode']> } | undefined {
  const type = node.$type ?? '';
  if (type === 'FqnRef' || type === 'StrictFqnRef' || type === 'StrictFqnElementRef') {
    if (node.$container?.$type === type || !node.$cstNode) return undefined;
    return { text: node.$cstNode.text ?? resolveFqnRef(node), cst: node.$cstNode };
  }
  if (VIEW_REFERENCE_TYPES.has(type)) {
    const text = (node['view'] as { $refText?: string } | undefined)?.$refText;
    return text === undefined || !node.$cstNode ? undefined : { text, cst: node.$cstNode };
  }
  if (type === 'Imported') {
    const imported = node['imported'] as { $refText?: string; $refNode?: ViewAstNode['$cstNode'] } | undefined;
    return imported?.$refText === undefined || !imported.$refNode ? undefined : { text: imported.$refText, cst: imported.$refNode };
  }
  return undefined;
}

/**
 * Visit `node` and the AST nodes below it in property order; `visit`
 * returning false skips the children of the visited node.
 */
function walk(node: ViewAstNode, visit: (node: ViewAstNode) => boolean): void {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child || typeof child !== 'object' || '$refText' in child || typeof (child as ViewAstNode).$type !== 'string') continue;
      if (visit(child as ViewAstNode)) walk(child as ViewAstNode, visit);
    }
  }
}

function view(id: string | undefined): CatalogueTarget | undefined {
  return id === undefined ? undefined : { view: id };
}

function deployment(id: string | undefined): CatalogueTarget | undefined {
  return id === undefined ? undefined : { deployment: id };
}

function inSubtree(fqn: string, root: string): boolean {
  return fqn === root || fqn.startsWith(`${root}.`);
}

