/**
 * Cascade planning (lc4m-15.30, FR-001, FR-003, D55, D77): the edits that
 * remove the view statements referring to something a removal takes away.
 *
 *  - **What is removed.**  For a reference in a rule (include / exclude,
 *    style, `rank`, dynamic `include`; `views`-block styles) the rule item —
 *    with its `with { … }` and `where`, which are part of the item; for a
 *    reference in a step statement the whole statement (a step, a chain).
 *    References at unmodelled places are never cascaded.
 *  - **Normalization** (D55).  A construct the cascade empties goes with it,
 *    repeatedly: a rule whose last item goes, a `group` whose last rule goes,
 *    a `par` / `parallel` block whose last statement goes.  An emptied view
 *    is never removed.
 *  - **Edits.**  Items of a list that keeps other items are cut out with
 *    one separating comma; every other removed construct is given as its
 *    range, for the removal to delete together with its own constructs.
 *  - **Content check** (D77, D108).  A view that had a content-producing
 *    statement — an `include` rule of an element or deployment view (top
 *    level or in a `group`), a step statement or a dynamic `include` of a
 *    dynamic view — and would have none left is reported.  Content from
 *    `extends` or `global` predicates does not count.
 */
import type { CatalogueEntry } from '../query/reference-catalogue.js';
import type { ViewAstNode, ViewDeclaration, ViewStepStatementEntry } from '../query/view-index.js';
import type { ViewReferenceResolver } from '../query/view-resolver.js';
import { leaveParallel } from './step-ops.js';
import { InvalidWriteError } from './write-checks.js';
import type { TextEdit } from './text-edit.js';

/** A text range of a file. */
export interface Range {
  offset: number;
  end: number;
}

/**
 * What a cascade removes and how.  The removal applies it together with the
 * rest of its edits, one group per file (see `removalEditsForRanges` in
 * `cst-helpers.ts`).
 */
export interface CascadePlan {
  /** Per file, the ranges of the constructs removed whole (statements, rules, groups, properties) */
  ranges: Map<string, Range[]>;
  /**
   * Per file, the edits inside a construct that stays: list items cut out of
   * a rule, a `with { … }` cut off its item; they do not overlap
   */
  partial: Map<string, TextEdit[]>;
  /** Every AST node the cascade removes: the items, statements and emptied containers */
  removed: Set<object>;
  /** The views that would lose their last content-producing statement (D77), in entry order */
  emptied: ViewDeclaration[];
  /**
   * The views with a `par` / `parallel` block the cascade would leave with
   * only statements LikeC4 discards (D40), in entry order
   */
  stranded: ViewDeclaration[];
}

/** The `prev`-linked item list of each rule type that holds rule items. */
const RULE_LISTS: Readonly<Record<string, string>> = {
  ViewRulePredicate: 'exprs',
  DeploymentViewRulePredicate: 'expr',
  DynamicViewIncludePredicate: 'exprs',
  ViewRuleStyle: 'targets',
  DeploymentViewRuleStyle: 'targets',
  ViewRuleRank: 'targets',
};

/** Rules that produce content in element and deployment views (when they include). */
const INCLUDE_RULES: ReadonlySet<string> = new Set(['ViewRulePredicate', 'DeploymentViewRulePredicate']);

/**
 * Plan the removal of the view statements of `entries` — references at
 * modelled places whose statement class is `rule` or `step`.  The views the
 * plan would empty (D77) or leave with a `par` block of discarded
 * statements only (D40) are reported, for the caller to reject.
 *
 * @param resolver   - Resolves view references, for the `par` check of D40
 * @param field      - The field of the D40 check
 * @throws {Error} (internal) for an entry that is not cascadable
 */
export function planCascade(
  entries: readonly CatalogueEntry[],
  resolver: ViewReferenceResolver,
  field: string,
): CascadePlan {
  const removed = new Set<object>();
  const fileOf = new Map<object, string>();
  const chains: ViewAstNode[][] = [];
  for (const entry of entries) {
    if (entry.unmodelled || (entry.statementClass !== 'rule' && entry.statementClass !== 'step') || entry.containers.length === 0) {
      throw new Error(`Internal error: the ${entry.role} '${entry.text}' in '${entry.file}' is not cascadable`);
    }
    removed.add(entry.containers[0]!);
    for (const node of entry.containers) fileOf.set(node, entry.file);
    chains.push(entry.containers);
  }

  // Normalize: a container whose every member goes, goes too (to a fixpoint,
  // as members of one container may come from different entries).
  for (let changed = true; changed; ) {
    changed = false;
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const container = chain[i]!;
        if (removed.has(container)) continue;
        if (!membersOf(container).every((member) => removed.has(member))) break;
        removed.add(container);
        changed = true;
      }
    }
  }

  // The `par` blocks that lose statements but stay must still contribute a step (D40).
  const views = distinct(entries.map((entry) => entry.view).filter((view): view is ViewDeclaration => view !== undefined));
  const stranded = views.filter((view) =>
    parallelBlocks(view.steps).some((block) => {
      if (removed.has(block.node)) return false;
      const leaving = new Set(block.statements.filter((s) => removed.has(s.node)));
      if (leaving.size === 0) return false;
      try {
        leaveParallel(view, block, leaving, resolver, field);
        return false;
      } catch (err) {
        if (err instanceof InvalidWriteError) return true;
        throw err;
      }
    }),
  );

  const emptied = views.filter((view) => contentCount(view, new Set()) > 0 && contentCount(view, removed) === 0);
  return { ...removalEdits(removed, fileOf), removed, emptied, stranded };
}

/**
 * The members whose removal empties `container`: the items of a rule, the
 * rules of a `group`, the statements of a `par` / `parallel` block.
 */
function membersOf(container: ViewAstNode): ViewAstNode[] {
  const type = container.$type ?? '';
  const list = RULE_LISTS[type];
  if (list) return listItems(container[list] as ViewAstNode | undefined);
  if (type === 'ViewRuleGroup') return (container['groupRules'] as ViewAstNode[] | undefined) ?? [];
  if (type === 'SubflowStep') return (container['steps'] as ViewAstNode[] | undefined) ?? [];
  throw new Error(`Internal error: no members of a ${type}`);
}

/** The items of a `prev`-linked list (`Expressions`, `FqnExpressions`), in source order. */
function listItems(list: ViewAstNode | undefined): ViewAstNode[] {
  const items: ViewAstNode[] = [];
  for (let node = list; node; node = node['prev'] as ViewAstNode | undefined) {
    const value = node['value'] as ViewAstNode | undefined;
    if (value) items.push(value);
  }
  return items.reverse();
}

/**
 * The ranges of the topmost removed constructs and the list-item edits of
 * the rules that keep other items, per file.
 */
function removalEdits(
  removed: ReadonlySet<object>,
  fileOf: ReadonlyMap<object, string>,
): { ranges: Map<string, Range[]>; partial: Map<string, TextEdit[]> } {
  const isTopmost = (node: ViewAstNode): boolean => {
    for (let up = node.$container; up; up = up.$container) if (removed.has(up)) return false;
    return true;
  };
  const ranges = new Map<string, Range[]>();
  const partial = new Map<string, TextEdit[]>();
  // Items of lists that keep other items, grouped by their list's rule.
  const items = new Map<ViewAstNode, ViewAstNode[]>();
  for (const node of removed as ReadonlySet<ViewAstNode>) {
    if (!isTopmost(node)) continue;
    const file = fileOf.get(node)!;
    const listNode = node.$container;
    if (listNode && (listNode.$type === 'Expressions' || listNode.$type === 'FqnExpressions') && listNode['value'] === node) {
      const rule = ruleOf(listNode);
      items.set(rule, [...(items.get(rule) ?? []), node]);
      continue;
    }
    const cst = node.$cstNode;
    if (!cst) throw new Error(`Internal error: a removed ${node.$type} has no position`);
    push(ranges, file, { offset: cst.offset, end: cst.end });
  }
  for (const [rule, gone] of items) {
    const file = fileOf.get(rule)!;
    for (const edit of listItemEdits(listItems(rule[RULE_LISTS[rule.$type ?? '']!] as ViewAstNode), new Set(gone))) push(partial, file, edit);
  }
  return { ranges, partial };
}

/** Append `value` to the list of `key` in `map`. */
function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The rule that holds the list node `list` (the outermost list node's container). */
function ruleOf(list: ViewAstNode): ViewAstNode {
  let node = list;
  while (node.$container && node.$container.$type === list.$type) node = node.$container;
  if (!node.$container) throw new Error('Internal error: a rule list without a rule');
  return node.$container;
}

/**
 * The edits that cut the items `gone` out of the list `items`, which keeps
 * at least one item: each run of removed items goes up to the next kept
 * item, or — for a run at the end — from the end of the kept item before it,
 * so exactly one separating comma goes with each run.
 */
function listItemEdits(items: readonly ViewAstNode[], gone: ReadonlySet<ViewAstNode>): TextEdit[] {
  const edits: TextEdit[] = [];
  const range = (node: ViewAstNode): { offset: number; end: number } => {
    const cst = node.$cstNode;
    if (!cst) throw new Error(`Internal error: a rule item ${node.$type} has no position`);
    return cst;
  };
  for (let start = 0; start < items.length; ) {
    if (!gone.has(items[start]!)) {
      start++;
      continue;
    }
    let stop = start;
    while (stop + 1 < items.length && gone.has(items[stop + 1]!)) stop++;
    if (stop + 1 < items.length) edits.push({ offset: range(items[start]!).offset, end: range(items[stop + 1]!).offset, newText: '' });
    else if (start > 0) edits.push({ offset: range(items[start - 1]!).end, end: range(items[stop]!).end, newText: '' });
    else throw new Error('Internal error: a list item edit for a list that loses every item');
    start = stop + 1;
  }
  return edits;
}

/** The `par` / `parallel` blocks among `statements`, nested ones included. */
function parallelBlocks(statements: readonly ViewStepStatementEntry[]): ViewStepStatementEntry[] {
  return statements.flatMap((s) => (s.form === 'parallel' ? [s, ...parallelBlocks(s.statements)] : []));
}

/**
 * How many content-producing statements of `view` (FR-003) stay when the
 * nodes `removed` go: `include` rules of element and deployment views, top
 * level or in a `group`; step statements and dynamic `include` rules of
 * dynamic views.
 */
function contentCount(view: ViewDeclaration, removed: ReadonlySet<object>): number {
  const body = view.body;
  if (!body) return 0;
  const rules = (body['rules'] as ViewAstNode[] | undefined) ?? [];
  if (view.type === 'dynamic') {
    const steps = view.steps.filter((s) => s.form !== 'opaque' && !removed.has(s.node)).length;
    return steps + rules.filter((rule) => rule.$type === 'DynamicViewIncludePredicate' && !removed.has(rule)).length;
  }
  const count = (list: readonly ViewAstNode[]): number =>
    list.reduce((n, rule) => {
      if (removed.has(rule)) return n;
      if (rule.$type === 'ViewRuleGroup') return n + count((rule['groupRules'] as ViewAstNode[] | undefined) ?? []);
      return n + (INCLUDE_RULES.has(rule.$type ?? '') && rule['isInclude'] === true ? 1 : 0);
    }, 0);
  return count(rules);
}

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Wrappers whose `with { … }` holds custom properties: removed when the properties are all gone. */
const WITH_WRAPPERS: ReadonlySet<string> = new Set(['FqnExprWith', 'RelationExprWith']);

/**
 * Plan the removal of the `navigateTo` properties of `entries` — view
 * references at modelled places (FR-001, `removeView`): each property goes
 * with the lines it fills; a `with { … }` of a predicate item whose every
 * property goes is removed with them (the item stays).  A step or
 * relationship body keeps its braces.
 *
 * @throws {Error} (internal) for an entry that is not a `navigateTo` value
 */
export function planNavigateToCascade(entries: readonly CatalogueEntry[]): CascadePlan {
  const removed = new Set<object>();
  const ranges = new Map<string, Range[]>();
  const partial = new Map<string, TextEdit[]>();
  const byContainer = new Map<ViewAstNode, { file: string; properties: Set<ViewAstNode> }>();
  for (const entry of entries) {
    const property = entry.node.$container;
    const container = property?.$container;
    if (entry.unmodelled || entry.role !== 'navigate-to' || !property || !container) {
      throw new Error(`Internal error: the ${entry.role} '${entry.text}' in '${entry.file}' is not a removable navigateTo`);
    }
    const group = byContainer.get(container) ?? { file: entry.file, properties: new Set<ViewAstNode>() };
    group.properties.add(property);
    byContainer.set(container, group);
  }
  for (const [container, { file, properties }] of byContainer) {
    const wrapper = container.$container;
    const all = ((container['props'] as ViewAstNode[] | undefined) ?? []).every((prop) => properties.has(prop));
    if (all && wrapper && WITH_WRAPPERS.has(wrapper.$type ?? '') && wrapper['custom'] === container) {
      // `subject with { … }` becomes `subject`.
      const subject = (wrapper['subject'] as ViewAstNode | undefined)?.$cstNode;
      const end = wrapper.$cstNode?.end;
      if (!subject || end === undefined) throw new Error('Internal error: a with block without a position');
      push(partial, file, { offset: subject.end, end, newText: '' });
      removed.add(container);
      continue;
    }
    for (const property of properties) {
      const cst = property.$cstNode;
      if (!cst) throw new Error('Internal error: a navigateTo without a position');
      push(ranges, file, { offset: cst.offset, end: cst.end });
      removed.add(property);
    }
  }
  return { ranges, partial, removed, emptied: [], stranded: [] };
}
