/**
 * Reads of views: the rule list of a view with its structured predicates
 * (US-2, US-3), built from the `ViewIndex` and resolved with the
 * `ViewReferenceResolver`.
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
  ViewText,
  ViewWhereCondition,
  ViewWhereLeaf,
  ViewWithProperties,
} from './types.js';
import type { ViewAstNode, ViewDeclaration } from './view-index.js';
import type { ViewReferenceResolver, ViewTargetRole } from './view-resolver.js';

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
