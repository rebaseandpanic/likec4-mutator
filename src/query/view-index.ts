/**
 * Workspace-wide index of the views of every document, in LikeC4's document
 * order: each declaration with its `views` block, its body members in source
 * order, its rule list, and for dynamic views its step-statement tree; plus a
 * reverse index of the references to views (`navigateTo`, `extends`).
 *
 * The index reads the unlinked AST of the standalone parser.  Source order
 * exists only in the CST: a body keeps tags, properties, rules and steps in
 * separate arrays, so members are merged by CST offset.  It does not resolve
 * references (see `ViewReferenceResolver`).
 */
import type { ViewRuleKind, ViewType } from './types.js';
import { mergeOrder, toWorkspaceDocument, type IndexedDocument, type WorkspaceDocument, type WorkspaceDocumentAst } from './workspace-index.js';

/** Structural view of an AST node of a view, as far as this module reads it. */
export interface ViewAstNode {
  $type?: string;
  $container?: ViewAstNode;
  $cstNode?: { offset: number; end: number; text?: string; range?: { start?: { line?: number; character?: number } } };
  [k: string]: unknown;
}

/** A `views [folder] { … }` block. */
export interface ViewsBlockNode extends ViewAstNode {
  /** The folder string as the parser converted it (quotes removed) */
  folder?: string;
  views?: ViewAstNode[];
  styles?: ViewAstNode[];
}

/** A member of a view body: the tag list, a property, a rule or a step statement. */
export interface ViewBodyMember {
  kind: 'tags' | 'property' | 'rule' | 'step';
  node: ViewAstNode;
}

/** One rule of a view body. */
export interface ViewRuleEntry {
  /** 0-based position in the view's rule list */
  index: number;
  kind: ViewRuleKind;
  node: ViewAstNode;
  /** `include` / `exclude`: the expression values in source order, without the empty item of a trailing comma */
  items: ViewAstNode[];
}

/**
 * One segment of a step statement: the `Step` node of a single step or of a
 * chain's first segment, or a `StepSeries` node of a later chain segment.
 */
export interface ViewStepSegment {
  node: ViewAstNode;
  /** 0-based segment number */
  segment: number;
  /** Start of the segment: the node's start for the first one, the end of the previous segment otherwise */
  offset: number;
  end: number;
}

/** An inner part of a stage-6 block: the block itself, an `alt` branch, or the `try` / `catch` / `finally` part. */
export interface ViewStepBlockPart {
  /** `opt`, `loop`, `break`, `if`, `when`, `else`, `try`, `catch`, `finally` */
  keyword: string;
  statements: ViewStepStatementEntry[];
}

/** A step statement of a dynamic view body or of a block inside it. */
export interface ViewStepStatementEntry {
  /** Address: `[i]` at the top level, `[i, j]` inside the `par` block at `i`; undefined inside a stage-6 block (not addressable) */
  path: number[] | undefined;
  node: ViewAstNode;
  form: 'step' | 'chain' | 'parallel' | 'opaque';
  /** `par` / `parallel` for a parallel block; the block keyword of an opaque statement (`opt`, `loop`, `alt`, `try`, `break`, `if`, `when`, `else`) */
  keyword?: string;
  /** Segments of a step (one) or chain, in order */
  segments: ViewStepSegment[];
  /** Statements of a parallel block */
  statements: ViewStepStatementEntry[];
  /** Inner parts of an opaque block */
  parts: ViewStepBlockPart[];
}

/** One view declaration. */
export interface ViewDeclaration {
  /** Declared name; undefined for an unnamed element view */
  id: string | undefined;
  type: ViewType;
  /** The `ElementView` / `DynamicView` / `DeploymentView` node */
  node: ViewAstNode;
  /** The body; undefined for a declaration without one */
  body: ViewAstNode | undefined;
  /** The enclosing `views` block */
  block: ViewsBlockNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
  /** How many declarations of the workspace carry this id (1 when unique; 1 for an unnamed view) */
  declarationCount: number;
  /** Body members merged in source order */
  members: ViewBodyMember[];
  /** Tag groups of the body's tag list in source order (`#a #b, #c` → `[['a', 'b'], ['c']]`) */
  tagGroups: string[][];
  /** Rules in source order */
  rules: ViewRuleEntry[];
  /** Step statements in source order (dynamic views; empty otherwise) */
  steps: ViewStepStatementEntry[];
}

/** Where a reference to a view is written. */
export type ViewReferrerRole =
  | 'extends'
  | 'elementWithNavigateTo'
  | 'relationWithNavigateTo'
  | 'stepNavigateTo'
  | 'relationshipNavigateTo'
  | 'deploymentRelationshipNavigateTo';

/** A reference to a view, by the id written. */
export interface ViewReferrer {
  /** The view id as written */
  target: string;
  role: ViewReferrerRole;
  /** The node the reference is written in: the `navigateTo` property, or the `extends` reference */
  node: ViewAstNode;
  /** File of the document; undefined when the document was indexed without a name */
  file?: string;
  /** Position of the document in LikeC4's document order */
  document: number;
  /** The view declaration the reference is written in; undefined outside views (relationship bodies) */
  view?: ViewDeclaration;
}

/** Rule kind of each rule AST type of the view grammar. */
const RULE_KINDS: Readonly<Record<string, ViewRuleKind>> = {
  ViewRuleAutoLayout: 'autoLayout',
  ViewRuleStyle: 'style',
  DeploymentViewRuleStyle: 'style',
  ViewRuleGroup: 'group',
  ViewRuleRank: 'rank',
  ViewRuleGlobalPredicateRef: 'globalPredicate',
  DynamicViewGlobalPredicateRef: 'globalPredicate',
  ViewRuleGlobalStyle: 'globalStyle',
  ViewRuleAncestors: 'includeAncestors',
};

const VIEW_TYPES: Readonly<Record<string, ViewType>> = {
  ElementView: 'element',
  DynamicView: 'dynamic',
  DeploymentView: 'deployment',
};

/** Index of the views of a workspace. */
export class ViewIndex {
  /** Documents in LikeC4's document order */
  readonly documents: readonly IndexedDocument[];

  private readonly list: ViewDeclaration[] = [];
  private readonly byId = new Map<string, ViewDeclaration[]>();
  private readonly referrerList: ViewReferrer[] = [];
  private readonly referrersById = new Map<string, ViewReferrer[]>();

  /**
   * @param documents - Every document of the project, as for `WorkspaceIndex`:
   *                    root ASTs, or documents carrying file names (then
   *                    walked in LikeC4's document order).
   */
  constructor(documents: ReadonlyArray<WorkspaceDocumentAst | WorkspaceDocument>) {
    this.documents = mergeOrder(documents.map(toWorkspaceDocument));
    this.documents.forEach(({ file, ast }, document) => {
      for (const block of (ast.views ?? []) as ViewsBlockNode[]) {
        for (const node of block.views ?? []) {
          const type = VIEW_TYPES[node.$type ?? ''];
          if (!type) continue;
          const declaration = readDeclaration(node, type, block, file, document);
          this.list.push(declaration);
          if (declaration.id !== undefined) push(this.byId, declaration.id, declaration);
        }
      }
    });
    for (const declaration of this.list) {
      if (declaration.id !== undefined) declaration.declarationCount = this.byId.get(declaration.id)!.length;
    }
    const enclosing = new Map(this.list.map((d) => [d.node, d]));
    this.documents.forEach(({ file, ast }, document) => {
      walk(ast as unknown as ViewAstNode, (node) => {
        const found = readReferrer(node);
        if (!found) return;
        const view = enclosingView(node, enclosing);
        const referrer: ViewReferrer = {
          ...found,
          ...(file !== undefined && { file }),
          document,
          ...(view && { view }),
        };
        this.referrerList.push(referrer);
        push(this.referrersById, referrer.target, referrer);
      });
    });
  }

  /** Every view declaration, in LikeC4's document order, then source order. */
  declarations(): readonly ViewDeclaration[] {
    return this.list;
  }

  /** The declarations of `id` (more than one is a LikeC4 error), in document order. */
  declarationsOf(id: string): readonly ViewDeclaration[] {
    return this.byId.get(id) ?? [];
  }

  /** Every reference to a view (`navigateTo`, `extends`), per document in source order. */
  referrers(): readonly ViewReferrer[] {
    return this.referrerList;
  }

  /** The references written to the view id `id`. */
  referrersOf(id: string): readonly ViewReferrer[] {
    return this.referrersById.get(id) ?? [];
  }
}

/** Read one view declaration. */
function readDeclaration(
  node: ViewAstNode,
  type: ViewType,
  block: ViewsBlockNode,
  file: string | undefined,
  document: number,
): ViewDeclaration {
  const body = node.body as ViewAstNode | undefined;
  const members: ViewBodyMember[] = [];
  if (body) {
    if (body.tags) members.push({ kind: 'tags', node: body.tags as ViewAstNode });
    for (const prop of (body.props ?? []) as ViewAstNode[]) members.push({ kind: 'property', node: prop });
    for (const rule of (body.rules ?? []) as ViewAstNode[]) members.push({ kind: 'rule', node: rule });
    for (const step of (body.steps ?? []) as ViewAstNode[]) members.push({ kind: 'step', node: step });
    members.sort((a, b) => offsetOf(a.node) - offsetOf(b.node));
  }
  const rules = members
    .filter((m) => m.kind === 'rule')
    .map((m, index): ViewRuleEntry => ({ index, kind: ruleKind(m.node), node: m.node, items: ruleItems(m.node) }));
  const steps = members
    .filter((m) => m.kind === 'step')
    .map((m, i) => readStatement(m.node, [i]));
  return {
    id: typeof node.name === 'string' && node.name !== '' ? node.name : undefined,
    type,
    node,
    body,
    block,
    ...(file !== undefined && { file }),
    document,
    declarationCount: 1,
    members,
    tagGroups: body?.tags ? tagGroups(body.tags as ViewAstNode) : [],
    rules,
    steps,
  };
}

/** The kind of a rule node. */
function ruleKind(node: ViewAstNode): ViewRuleKind {
  switch (node.$type) {
    case 'ViewRulePredicate':
    case 'DeploymentViewRulePredicate':
      return node.isInclude ? 'include' : 'exclude';
    case 'DynamicViewIncludePredicate':
      return 'include';
  }
  const kind = RULE_KINDS[node.$type ?? ''];
  if (!kind) throw new Error(`Internal error: unknown view rule type '${node.$type}'`);
  return kind;
}

/** The expression values of an include / exclude rule, in source order. */
function ruleItems(node: ViewAstNode): ViewAstNode[] {
  const list = (node.exprs ?? node.expr) as ViewAstNode | undefined;
  return list ? listValues(list, 'value') : [];
}

/**
 * Values of a `prev`-linked list (`Expressions`, `FqnExpressions`): the
 * outermost node holds the last value; a trailing comma leaves a node
 * without a value, which is dropped.
 */
function listValues(list: ViewAstNode, feature: string): ViewAstNode[] {
  const values: ViewAstNode[] = [];
  for (let node: ViewAstNode | undefined = list; node; node = node.prev as ViewAstNode | undefined) {
    const value = node[feature] as ViewAstNode | undefined;
    if (value) values.push(value);
  }
  return values.reverse();
}

/** Tag groups of a `Tags` list in source order; each group's names without `#`. */
function tagGroups(tags: ViewAstNode): string[][] {
  const groups: string[][] = [];
  for (let node: ViewAstNode | undefined = tags; node; node = node.prev as ViewAstNode | undefined) {
    const values = (node.values ?? []) as Array<{ tag?: { $refText?: string } }>;
    groups.push(values.map((v) => (v.tag?.$refText ?? '').replace(/^#/, '')).filter((name) => name !== ''));
  }
  return groups.reverse();
}

/** Read a step statement; `path` is undefined inside a stage-6 block. */
function readStatement(node: ViewAstNode, path: number[] | undefined): ViewStepStatementEntry {
  const entry: ViewStepStatementEntry = { path, node, form: 'opaque', segments: [], statements: [], parts: [] };
  switch (node.$type) {
    case 'Step':
      entry.form = 'step';
      entry.segments = chainSegments(node);
      break;
    case 'StepSeries':
      entry.form = 'chain';
      entry.segments = chainSegments(node);
      break;
    case 'SubflowStep': {
      const keyword = String(node.kind);
      const inner = (node.steps ?? []) as ViewAstNode[];
      entry.keyword = keyword;
      if (keyword === 'par' || keyword === 'parallel') {
        entry.form = 'parallel';
        entry.statements = inner.map((child, j) => readStatement(child, path && [...path, j]));
      } else {
        entry.parts = [{ keyword, statements: inner.map((child) => readStatement(child, undefined)) }];
      }
      break;
    }
    case 'AltSteps':
      entry.keyword = 'alt';
      entry.parts = ((node.branches ?? []) as ViewAstNode[]).map((branch) => ({
        keyword: String(branch.kind),
        statements: ((branch.steps ?? []) as ViewAstNode[]).map((child) => readStatement(child, undefined)),
      }));
      break;
    case 'TryBlock':
    case 'CatchBlock':
    case 'FinallyBlock':
      entry.keyword = 'try';
      entry.parts = tryParts(node);
      break;
    default:
      throw new Error(`Internal error: unknown step statement type '${node.$type}'`);
  }
  return entry;
}

/** The `try`, `catch` and `finally` parts of a try statement, in source order. */
function tryParts(node: ViewAstNode): ViewStepBlockPart[] {
  const statements = (block: unknown): ViewStepStatementEntry[] =>
    (((block as ViewAstNode | undefined)?.steps ?? []) as ViewAstNode[]).map((child) => readStatement(child, undefined));
  switch (node.$type) {
    case 'FinallyBlock':
      return [...tryParts(node.tryCatch as ViewAstNode), { keyword: 'finally', statements: statements(node.finally) }];
    case 'CatchBlock':
      return [...tryParts(node.try as ViewAstNode), { keyword: 'catch', statements: statements(node.catch) }];
    default:
      return [{ keyword: 'try', statements: statements(node) }];
  }
}

/**
 * Segments of a step or chain.  A chain `a -> b -> c` is a `StepSeries`
 * whose `source` nests down to the `Step` of the first segment; segment `i`
 * spans from the end of segment `i - 1` to the end of its own node.
 */
function chainSegments(node: ViewAstNode): ViewStepSegment[] {
  const nodes: ViewAstNode[] = [];
  for (let current: ViewAstNode | undefined = node; current; ) {
    nodes.push(current);
    current = current.$type === 'StepSeries' ? (current.source as ViewAstNode | undefined) : undefined;
  }
  nodes.reverse();
  let previousEnd = offsetOf(nodes[0]!);
  return nodes.map((segmentNode, segment) => {
    const end = segmentNode.$cstNode?.end ?? previousEnd;
    const offset = segment === 0 ? offsetOf(segmentNode) : previousEnd;
    previousEnd = end;
    return { node: segmentNode, segment, offset, end };
  });
}

/** The view reference written in `node`, if it is a `navigateTo` property or a view with `extends`. */
function readReferrer(node: ViewAstNode): Pick<ViewReferrer, 'target' | 'role' | 'node'> | undefined {
  if (node.$type === 'NavigateToProperty' || node.$type === 'RelationNavigateToProperty') {
    const target = (node.value as { view?: { $refText?: string } } | undefined)?.view?.$refText;
    const role = navigateToRole(node);
    return target && role ? { target, role, node } : undefined;
  }
  if (node.$type === 'ElementView' && node.extends) {
    const ref = node.extends as ViewAstNode & { view?: { $refText?: string } };
    const target = ref.view?.$refText;
    return target ? { target, role: 'extends', node: ref } : undefined;
  }
  return undefined;
}

/** Where a `navigateTo` property sits. */
function navigateToRole(node: ViewAstNode): ViewReferrerRole | undefined {
  for (let up = node.$container; up; up = up.$container) {
    switch (up.$type) {
      case 'FqnExprWith':
        return 'elementWithNavigateTo';
      case 'RelationExprWith':
        return 'relationWithNavigateTo';
      case 'Step':
      case 'StepSeries':
        return 'stepNavigateTo';
      case 'DeploymentRelation':
        return 'deploymentRelationshipNavigateTo';
      case 'Relation':
        return 'relationshipNavigateTo';
    }
  }
  return undefined;
}

/** The declaration of the view `node` is written in. */
function enclosingView(node: ViewAstNode, declarations: Map<ViewAstNode, ViewDeclaration>): ViewDeclaration | undefined {
  for (let up: ViewAstNode | undefined = node; up; up = up.$container) {
    const declaration = declarations.get(up);
    if (declaration) return declaration;
  }
  return undefined;
}

/** Visit `node` and every AST node below it, in source order of the properties. */
function walk(node: ViewAstNode, visit: (node: ViewAstNode) => void): void {
  const children: ViewAstNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (isAstNode(item)) children.push(item);
    } else if (isAstNode(value)) {
      children.push(value);
    }
  }
  children.sort((a, b) => offsetOf(a) - offsetOf(b));
  visit(node);
  for (const child of children) walk(child, visit);
}

function isAstNode(value: unknown): value is ViewAstNode {
  return typeof value === 'object' && value !== null && typeof (value as ViewAstNode).$type === 'string';
}

function offsetOf(node: ViewAstNode): number {
  return node.$cstNode?.offset ?? 0;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
