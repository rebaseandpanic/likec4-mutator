/**
 * Reads of views: the rule list of a view with its structured predicates
 * (US-2, US-3) and the step statements of a dynamic view (US-4), built from
 * the `ViewIndex` and resolved with the `ViewReferenceResolver`.
 *
 * Structure and values follow LikeC4 1.59.4's parse of the same text
 * (language-server `ViewsParser`, `parseFqnExprWith`,
 * `parseCustomRelationProperties`, `parseWhereClause`), except where the
 * library reports what is written: the relationship kind of a relation
 * expression stays on the expression (LikeC4 turns it into a `where`
 * condition), items LikeC4 drops (D34) are reported, style values keep
 * their written form (D18), and block-level styles are not rules of the
 * view.
 */
import type { LinkedTarget } from './deployment-resolver.js';
import { resolveFqnRef } from './fqn.js';
import { markdownAsString, removeIndent } from './likec4-text.js';
import { toSourceRange } from './source-range.js';
import { readElementStyleProps, readKindRelationshipStyle } from './style-read.js';
import type {
  ViewElementExpression,
  ViewPredicateItem,
  ViewReference,
  ViewRelationExpression,
  ViewRelationKind,
  ViewRuleInfo,
  ViewStepBody,
  ViewStepInfo,
  ViewStepStatementInfo,
  ViewText,
  ViewWhereCondition,
  ViewWhereLeaf,
  ViewWithProperties,
} from './types.js';
import type { ViewAstNode, ViewDeclaration, ViewStepSegment, ViewStepStatementEntry } from './view-index.js';
import { contributesSteps, type ViewReferenceResolver, type ViewTargetRole } from './view-resolver.js';

/**
 * The rules of `view` in source order: for a dynamic view only its rules
 * (its steps are read separately).  Rules of the enclosing `views { style … }`
 * block are not rules of the view and are not listed.
 */
export function buildViewRules(view: ViewDeclaration, resolver: ViewReferenceResolver): ViewRuleInfo[] {
  const reader = new PredicateReader(view, resolver);
  return view.rules.map((rule): ViewRuleInfo => {
    const cst = rule.node.$cstNode;
    const info: ViewRuleInfo = {
      index: rule.index,
      kind: rule.kind,
      text: cst?.text ?? '',
      sourceRange: toSourceRange(cst),
    };
    if (rule.kind === 'include' || rule.kind === 'exclude') info.items = rule.items.map((item) => reader.item(item));
    if (rule.kind === 'autoLayout') {
      const node = rule.node as ViewAstNode & { direction?: string; rankSep?: unknown; nodeSep?: unknown };
      info.autoLayout = {
        direction: node.direction as NonNullable<ViewRuleInfo['autoLayout']>['direction'],
        ...(typeof node.rankSep === 'number' && { rankSep: node.rankSep }),
        ...(typeof node.nodeSep === 'number' && { nodeSep: node.nodeSep }),
      };
    }
    return info;
  });
}

/** A `MarkdownOrString` AST value. */
interface MarkdownOrStringNode {
  markdown?: string;
  text?: string;
}

/** A LikeC4 `removeIndent` of a `MarkdownOrString`: `{ md }` or `{ txt }`. */
export function viewText(value: unknown): ViewText | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as MarkdownOrStringNode;
  if (typeof v.markdown === 'string') return { md: removeIndent(v.markdown) };
  return { txt: typeof v.text === 'string' ? removeIndent(v.text) : '' };
}

/** Reads the predicate items of one view. */
class PredicateReader {
  constructor(
    private readonly view: ViewDeclaration,
    private readonly resolver: ViewReferenceResolver,
  ) {}

  /** One item of an include / exclude rule. */
  item(node: ViewAstNode): ViewPredicateItem {
    const cst = node.$cstNode;
    let subject = node;
    let withProps: ViewWithProperties | undefined;
    let where: ViewWhereCondition | undefined;
    if (subject.$type === 'FqnExprWith' || subject.$type === 'RelationExprWith') {
      const relation = subject.$type === 'RelationExprWith';
      withProps = this.withProperties((subject.custom as ViewAstNode | undefined)?.props as ViewAstNode[] | undefined, relation);
      subject = subject.subject as ViewAstNode;
    }
    if (subject.$type === 'FqnExprWhere' || subject.$type === 'RelationExprWhere') {
      if (subject.where) where = this.condition(subject.where as ViewAstNode);
      subject = subject.subject as ViewAstNode;
    }
    return {
      text: cst?.text ?? '',
      sourceRange: toSourceRange(cst),
      expression: this.expression(subject),
      ...(where && { where }),
      ...(withProps && { with: withProps }),
    };
  }

  /** An element or relation expression. */
  private expression(node: ViewAstNode): ViewElementExpression | ViewRelationExpression {
    switch (node.$type) {
      case 'DirectedRelationExpr': {
        const outgoing = node.source as ViewAstNode;
        return {
          type: 'direct',
          source: this.elementExpression(outgoing.from as ViewAstNode),
          target: this.elementExpression(node.target as ViewAstNode),
          ...this.relationKind(outgoing),
          bidirectional: outgoing.isBidirectional === true,
        };
      }
      case 'OutgoingRelationExpr':
        return {
          type: 'outgoing',
          source: this.elementExpression(node.from as ViewAstNode),
          ...this.relationKind(node),
          bidirectional: node.isBidirectional === true,
        };
      case 'IncomingRelationExpr':
        return { type: 'incoming', target: this.elementExpression(node.to as ViewAstNode) };
      case 'InOutRelationExpr':
        return { type: 'inOut', element: this.elementExpression((node.inout as ViewAstNode).to as ViewAstNode) };
      default:
        return this.elementExpression(node);
    }
  }

  /** An element expression: wildcard, reference with selector, `element.kind` / `element.tag`. */
  private elementExpression(node: ViewAstNode): ViewElementExpression {
    switch (node.$type) {
      case 'WildcardExpression':
        return { type: 'wildcard' };
      case 'ElementKindExpression':
        return { type: 'elementKind', operator: node.isEqual ? '=' : '!=', kind: refText(node.kind) };
      case 'ElementTagExpression':
        return { type: 'elementTag', operator: node.isEqual ? '=' : '!=', tag: tagName(node.tag) };
      default: {
        const selector = SELECTORS[String(node.selector)];
        return { type: 'element', ref: this.elementRef(node.ref), ...(selector && { selector }) };
      }
    }
  }

  /** An element reference, resolved as LikeC4 scopes it in this view. */
  private elementRef(ref: unknown): ViewReference | ViewReference<LinkedTarget> {
    const text = (ref as ViewAstNode | undefined)?.$cstNode?.text ?? resolveFqnRef(ref);
    if (this.view.type === 'deployment') return { text, target: this.resolver.resolveDeploymentRef(ref) ?? null };
    return { text, target: this.resolver.resolveElementRef(this.view, ref) ?? null };
  }

  /** The relationship kind written on an outgoing connector (`-[k]->` or `.k`). */
  private relationKind(node: ViewAstNode): { kind?: ViewRelationKind } {
    if (node.kind) return { kind: { name: refText(node.kind), form: 'bracket' } };
    const dot = node.dotKind as ViewAstNode | undefined;
    if (dot) return { kind: { name: refText(dot.kind), form: 'dot' } };
    return {};
  }

  /**
   * The properties of a `with { ... }` block, as LikeC4 parses them: the
   * last occurrence of a property wins; strings dedented and trimmed;
   * an element block's `summary` is its `description`.
   */
  private withProperties(props: ViewAstNode[] | undefined, relation: boolean): ViewWithProperties {
    const result: ViewWithProperties = {};
    for (const prop of props ?? []) {
      switch (prop.$type) {
        case 'NavigateToProperty':
        case 'RelationNavigateToProperty': {
          const text = refText((prop.value as ViewAstNode | undefined)?.view);
          if (text) result.navigateTo = this.viewRef(text, relation ? 'dynamic' : 'any');
          break;
        }
        case 'NotesProperty': {
          const value = viewText(prop.value);
          if (value) result.notes = value;
          break;
        }
        case 'ElementStringProperty':
        case 'RelationStringProperty':
        case 'NotationProperty': {
          const key = String(prop.key);
          if (key === 'description' || key === 'summary') {
            const value = viewText(prop.value);
            if (value) result.description = value;
          } else {
            const value = markdownAsString(prop.value as MarkdownOrStringNode | undefined);
            // LikeC4 drops an empty element notation, and keeps other empty strings.
            if (value !== undefined && !(key === 'notation' && !relation && value === '')) {
              if (key === 'title' || key === 'technology' || key === 'notation') result[key] = value;
            }
          }
          break;
        }
        case 'MultipleProperty':
          if (relation && typeof prop.value === 'boolean') result.multiple = prop.value;
          break;
      }
    }
    const style = relation ? readKindRelationshipStyle(props) : readElementStyleProps(props);
    if (style) result.style = style;
    return result;
  }

  /** A view reference written as `text`, resolved for the view types `role` accepts. */
  private viewRef(text: string, role: ViewTargetRole): ViewReference {
    return { text, target: this.resolver.resolveViewText(text, role) ?? null };
  }

  /** A `where` condition; same-operator `and` / `or` chains are flattened, as LikeC4 does. */
  private condition(node: ViewAstNode): ViewWhereCondition {
    switch (node.$type) {
      case 'WhereBinaryExpression': {
        const operator = String(node.operator).toLowerCase() === 'or' ? 'or' : 'and';
        const operands = [node.left, node.right].flatMap((side) => {
          if (!side) return [];
          const child = this.condition(side as ViewAstNode);
          return operator in child ? (child as Record<string, ViewWhereCondition[]>)[operator]! : [child];
        });
        return operator === 'or' ? { or: operands } : { and: operands };
      }
      case 'WhereElementNegation':
      case 'WhereRelationNegation':
        return { not: this.condition(node.value as ViewAstNode) };
      default:
        return this.leaf(node);
    }
  }

  /** A leaf of a `where` condition. */
  private leaf(node: ViewAstNode): ViewWhereLeaf {
    const type = node.$type ?? '';
    const field = /Tag$/.test(type) ? 'tag' : /Kind$/.test(type) ? 'kind' : 'metadata';
    const leaf: ViewWhereLeaf = { field };
    if (node.participant === 'source' || node.participant === 'target') leaf.participant = node.participant;
    if (field === 'metadata') leaf.key = String(node.key ?? '');
    const operator = whereOperator(node);
    if (operator) leaf.operator = operator;
    if (field === 'tag') leaf.value = tagName(node.value);
    else if (field === 'kind') leaf.value = refText(node.value);
    else if (node.value !== undefined && node.value !== null) leaf.value = node.value as string | boolean;
    return leaf;
  }
}

const SELECTORS: Readonly<Record<string, 'children' | 'descendants' | 'expanded'>> = {
  '.*': 'children',
  '.**': 'descendants',
  '._': 'expanded',
};

/** The operator of a where leaf (`EqOperator`): `=`, `!=`, `is` or `is not`; undefined when none is written. */
function whereOperator(node: ViewAstNode): ViewWhereLeaf['operator'] {
  switch (node.operator) {
    case '=':
    case '!=':
      return node.operator;
    case 'is':
      return node.not ? 'is not' : 'is';
    default:
      return undefined;
  }
}

/** The text of a cross-reference as written. */
function refText(ref: unknown): string {
  return (ref as { $refText?: string } | undefined)?.$refText ?? '';
}

/** The name of a `TagRef` (`#t` → `t`). */
function tagName(tagRef: unknown): string {
  return refText((tagRef as { tag?: unknown } | undefined)?.tag).replace(/^#/, '');
}

/**
 * The step statements of the dynamic view `view` in source order (empty for
 * other views), with the position of each step in LikeC4's step sequence:
 * every step and chain segment LikeC4 parses takes the next number at the
 * top level (`step-NN`); a `par` block takes one number and numbers its own
 * steps (`step-NN:par.MM`); a stage-6 block takes one number.  Statements
 * LikeC4's parse drops (see `contributesSteps`) take none.
 */
export function buildViewSteps(view: ViewDeclaration, resolver: ViewReferenceResolver): ViewStepStatementInfo[] {
  if (view.type !== 'dynamic') return [];
  const reader = new StepReader(view, resolver);
  let next = 1;
  return view.steps.map((statement) =>
    reader.statement(statement, (count) => {
      const step = next;
      next += count;
      return step;
    }),
  );
}

/** Takes `count` positions of a numbering level and returns the first. */
type Numbering = (count: number) => number;

/** Reads the step statements of one dynamic view. */
class StepReader {
  constructor(
    private readonly view: ViewDeclaration,
    private readonly resolver: ViewReferenceResolver,
  ) {}

  /**
   * One addressable statement.  `number` hands out positions at the level
   * of the statement; `parallel` is set inside a `par` block, whose number
   * its steps share.
   */
  statement(entry: ViewStepStatementEntry, number: Numbering, parallel?: number): ViewStepStatementInfo {
    const cst = entry.node.$cstNode;
    const base = { path: entry.path ?? [], text: cst?.text ?? '', sourceRange: toSourceRange(cst) };
    const inModel = contributesSteps(entry, this.view, this.resolver);
    switch (entry.form) {
      case 'step':
      case 'chain': {
        const positions = inModel ? entry.segments.map(() => number(1)) : [];
        const sequence = (i: number) => (parallel === undefined ? { step: positions[i]! } : { step: parallel, parallel: positions[i]! });
        const segments = this.segments(entry.segments, (i) => (inModel ? sequence(i) : undefined));
        return entry.form === 'step' ? { ...base, type: 'step', step: segments[0]! } : { ...base, type: 'chain', segments };
      }
      case 'parallel': {
        const step = inModel ? number(1) : 0;
        let inner = 1;
        const innerNumber: Numbering = (count) => {
          const first = inner;
          inner += count;
          return first;
        };
        const title = entry.node.title;
        return {
          ...base,
          type: 'parallel',
          keyword: entry.keyword === 'parallel' ? 'parallel' : 'par',
          ...(typeof title === 'string' && { title }),
          inModel,
          // A dropped block numbers nothing: its statements get no positions.
          statements: entry.statements.map((s) => this.statement(s, inModel ? innerNumber : () => 0, inModel ? step : undefined)),
        };
      }
      case 'opaque':
        if (inModel) number(1);
        return { ...base, type: 'opaque', keyword: entry.keyword ?? '', inModel };
    }
  }

  /** The segments of a step or chain, with source and target in LikeC4's sense (LS `parseStep`, `recursiveParseStepSeries`). */
  private segments(segments: ViewStepSegment[], sequence: (i: number) => ViewStepInfo['sequence']): ViewStepInfo[] {
    const result: ViewStepInfo[] = [];
    /** Pairs of endpoints a later segment may return along (LikeC4's call stack of a chain) */
    const callstack: Array<[string, string]> = [];
    segments.forEach((segment, i) => {
      const node = segment.node;
      const target = this.endpoint(node.target);
      const kind = this.kind(node);
      let source: ViewStepInfo['source'];
      let direction: ViewStepInfo['direction'] = 'forward';
      let to = target;
      if (i === 0) {
        source = this.endpoint(node.source);
        if (node.isBackward) {
          [source, to] = [to, source];
          direction = 'backward';
        }
      } else {
        const previous = result[i - 1]!;
        source = previous.target;
        const key = (ref: ViewStepInfo['source']) => ref.target ?? ref.text;
        if (i === 1) {
          if (key(to) === key(previous.source)) direction = 'backward';
          else if (segments.length > 2) callstack.push([key(previous.source), key(previous.target)], [key(source), key(to)]);
        } else {
          const index = callstack.findIndex(([s, t]) => s === key(to) && t === key(source));
          if (index !== -1) {
            direction = 'backward';
            callstack.splice(index);
          } else callstack.push([key(source), key(to)]);
        }
      }
      const body = this.body((node.custom as ViewAstNode | undefined)?.props as ViewAstNode[] | undefined);
      const title = typeof node.title === 'string' ? removeIndent(node.title) : '';
      const position = sequence(i);
      const cst = node.$cstNode;
      const text = i === 0 ? (cst?.text ?? '') : this.sourceText(segment);
      result.push({
        source,
        target: to,
        direction,
        arrow: node.isBackward ? '<-' : kind?.form === 'dot' ? `.${kind.name}` : kind ? `-[${kind.name}]->` : '->',
        ...(kind && { kind }),
        ...(title !== '' && { title }),
        ...(body && { body }),
        ...(position && { sequence: position }),
        ...(segments.length > 1 && { segment: segment.segment }),
        text,
        sourceRange: { ...toSourceRange(cst), offset: segment.offset, end: segment.end, ...this.position(segment) },
      });
    });
    return result;
  }

  /** The source text of a later chain segment: from the end of the previous segment to its own end. */
  private sourceText(segment: ViewStepSegment): string {
    const root = this.root(segment.node);
    const text = (root.$cstNode as { text?: string } | undefined)?.text;
    const rootOffset = root.$cstNode?.offset ?? 0;
    return text === undefined ? '' : text.slice(segment.offset - rootOffset, segment.end - rootOffset);
  }

  /** Line and column of a segment's start offset. */
  private position(segment: ViewStepSegment): { line: number; column: number } {
    const root = this.root(segment.node);
    const text = (root.$cstNode as { text?: string } | undefined)?.text ?? '';
    const before = text.slice(0, segment.offset - (root.$cstNode?.offset ?? 0));
    const line = before.split('\n').length - 1;
    return { line, column: before.length - (before.lastIndexOf('\n') + 1) };
  }

  /** The document root of an AST node. */
  private root(node: ViewAstNode): ViewAstNode {
    let current = node;
    while (current.$container) current = current.$container;
    return current;
  }

  /** A step endpoint: an element reference resolved in the document scope. */
  private endpoint(ref: unknown): ViewStepInfo['source'] {
    const fqnRef = (ref as ViewAstNode | undefined)?.modelElement;
    const text = (ref as ViewAstNode | undefined)?.$cstNode?.text ?? resolveFqnRef(fqnRef);
    return { text, target: this.resolver.resolveElementRef(this.view, fqnRef) ?? null };
  }

  /** The relationship kind of a step or segment (`-[k]->` or `.k`). */
  private kind(node: ViewAstNode): ViewRelationKind | undefined {
    if (node.kind) return { name: refText(node.kind), form: 'bracket' };
    const dot = node.dotKind as ViewAstNode | undefined;
    return dot ? { name: refText(dot.kind), form: 'dot' } : undefined;
  }

  /** A step body, as LikeC4 parses it (LS `parseAbstractDynamicStep`); undefined when none or empty. */
  private body(props: ViewAstNode[] | undefined): ViewStepBody | undefined {
    if (!props) return undefined;
    const body: ViewStepBody = {};
    for (const prop of props) {
      switch (prop.$type) {
        case 'RelationNavigateToProperty': {
          const text = refText((prop.value as ViewAstNode | undefined)?.view);
          if (text) body.navigateTo = { text, target: this.resolver.resolveViewText(text, 'dynamic') ?? null };
          break;
        }
        case 'NotesProperty': {
          const value = viewText(prop.value);
          if (value) body.notes = value;
          break;
        }
        case 'RelationStringProperty':
        case 'NotationProperty': {
          const key = String(prop.key);
          if (prop.value === undefined) break;
          if (key === 'description') {
            const value = viewText(prop.value);
            if (value) body.description = value;
          } else if (key === 'title' || key === 'technology' || key === 'notation') {
            body[key] = markdownAsString(prop.value as MarkdownOrStringNode) ?? '';
          }
          break;
        }
      }
    }
    const style = readKindRelationshipStyle(props);
    if (style) body.style = style;
    return Object.keys(body).length > 0 ? body : undefined;
  }
}
