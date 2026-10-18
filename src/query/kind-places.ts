/**
 * The FR-002 place catalogue of lc4m-15.30: every place of the loaded files
 * whose reference names an element kind, a deployment node kind, the union
 * of both (`where … kind is`, participant kind conditions), a relationship
 * kind or a tag, with its kind type, its place and whether it is written
 * negated.  Kind and tag renames rewrite these places and removals list them
 * (US-7, D78, D95, D128).
 *
 * Places are found generically: every cross-reference of the standalone
 * parse whose reference type (`AstReflection.getReferenceType`) is one of
 * the five above.  A reference of those types at a place the classification
 * does not know is an internal error, so a new grammar position cannot pass
 * silently.  Places below an unmodelled place (`isUnmodelledPlace`) are
 * not listed: they belong to the unmodelled-name inventory (FR-004).  Text
 * inside string and markdown values is never a reference.
 */
import { AstUtils, type AstNode, type CstNode, type Reference } from 'langium';
import { getServices } from '../parser/services.js';
import type { ParsedDocument } from '../parser/types.js';
import { isUnmodelledPlace } from './reference-catalogue.js';

/** The kind type of a place: `shared` names element and deployment node kinds at once. */
export type KindPlaceType = 'element' | 'deploymentNode' | 'shared' | 'relationship' | 'tag';

/** The relationships whose connector (`-[k]->`, `-[k]<->`, `.k`) is a place. */
export type KindConnectorContext = 'model-relationship' | 'deployment-relationship' | 'extend-relationship' | 'step' | 'predicate';

/** The constructs whose tags list is a place. */
export type KindTagsContext =
  | 'element'
  | 'relationship'
  | 'deploymentNode'
  | 'instance'
  | 'deployment-relationship'
  | 'view'
  | 'extend'
  | 'kind-default';

/** The expressions that name a kind or a tag. */
export type KindExpressionConstruct =
  | 'element.kind'
  | 'element.tag'
  | 'where-kind'
  | 'where-tag'
  | 'relation-where-kind'
  | 'relation-where-tag'
  | 'participant-kind'
  | 'participant-tag';

/** Where an expression of {@link KindExpressionConstruct} is written. */
export type KindExpressionContext = 'predicate' | 'style-target' | 'rank-target';

/**
 * The FR-002 place name, `<construct>:<context>` (D128):
 *  - `declaration:element`, `declaration:deploymentNode` — the kind token of
 *    an element or deployment node declaration (`= kind`, `kind name`);
 *  - `connector:<relationship>` — `-[k]->`, `-[k]<->` or `.k` of a model,
 *    deployment or `extend` relationship, a dynamic step or a relation
 *    predicate;
 *  - `tags:<owner>` — a tags list;
 *  - `<expression>:<context>` — an expression in an include or exclude
 *    predicate, a style rule target or a `rank` target.
 */
export type KindPlaceRole =
  | `declaration:${'element' | 'deploymentNode'}`
  | `connector:${KindConnectorContext}`
  | `tags:${KindTagsContext}`
  | `${KindExpressionConstruct}:${KindExpressionContext}`;

/** One FR-002 place. */
export interface KindPlace {
  file: string;
  /** Offset of the name as written, `#` of a tag included */
  offset: number;
  /** End offset of the name as written */
  end: number;
  /** 1-based line of the name */
  line: number;
  /** The name as written (`#t` for a tag) */
  text: string;
  /** The kind or tag name: the written text without `#` */
  name: string;
  kindType: KindPlaceType;
  role: KindPlaceRole;
  /** Written in a negated form: `!=`, `!==`, `is not`, or inside a `not (…)` condition */
  negated: boolean;
  /** Offset of the construct holding the reference: the expression, the relationship, the tags list or the declaration */
  constructOffset: number;
}

/** Reference types of the grammar that name a kind or a tag, with their kind type. */
const REFERENCE_KIND_TYPES: Readonly<Record<string, KindPlaceType>> = {
  ElementKind: 'element',
  DeploymentNodeKind: 'deploymentNode',
  DeploymentNodeOrElementKind: 'shared',
  RelationshipKind: 'relationship',
  Tag: 'tag',
};

const CONNECTORS: Readonly<Record<string, KindConnectorContext>> = {
  Relation: 'model-relationship',
  DeploymentRelation: 'deployment-relationship',
  ExtendRelation: 'extend-relationship',
  Step: 'step',
  StepSeries: 'step',
  OutgoingRelationExpr: 'predicate',
};

const TAG_OWNERS: Readonly<Record<string, KindTagsContext>> = {
  Element: 'element',
  Relation: 'relationship',
  DeploymentNode: 'deploymentNode',
  DeployedInstance: 'instance',
  DeploymentRelation: 'deployment-relationship',
  ElementView: 'view',
  DynamicView: 'view',
  DeploymentView: 'view',
  ExtendElement: 'extend',
  ExtendRelation: 'extend',
  ExtendDeployment: 'extend',
  SpecificationElementKind: 'kind-default',
  SpecificationDeploymentNodeKind: 'kind-default',
  SpecificationRelationshipKind: 'kind-default',
};

const EXPRESSIONS: Readonly<Record<string, KindExpressionConstruct>> = {
  ElementKindExpression: 'element.kind',
  ElementTagExpression: 'element.tag',
  WhereElementKind: 'where-kind',
  WhereElementTag: 'where-tag',
  WhereRelationKind: 'relation-where-kind',
  WhereRelationTag: 'relation-where-tag',
  WhereRelationParticipantKind: 'participant-kind',
  WhereRelationParticipantTag: 'participant-tag',
};

/** Rule nodes that decide the context of an expression. */
const EXPRESSION_CONTEXTS: Readonly<Record<string, KindExpressionContext>> = {
  ViewRuleStyle: 'style-target',
  DeploymentViewRuleStyle: 'style-target',
  ViewRuleRank: 'rank-target',
  ViewRulePredicate: 'predicate',
  DynamicViewIncludePredicate: 'predicate',
  DeploymentViewRulePredicate: 'predicate',
};

/**
 * The FR-002 places of `documents`, per file in source order, files in the
 * order given.
 *
 * @throws {Error} (internal) for a kind or tag reference at a place the classification does not know
 */
export function kindPlaces(documents: Iterable<{ file: string; parsed: ParsedDocument }>): KindPlace[] {
  const reflection = getServices().shared.AstReflection;
  const places: KindPlace[] = [];
  for (const { file, parsed } of documents) {
    const found: KindPlace[] = [];
    for (const node of AstUtils.streamAst(parsed.ast as AstNode)) {
      for (const info of AstUtils.streamReferences(node)) {
        const kindType = REFERENCE_KIND_TYPES[reflection.getReferenceType(info)];
        if (!kindType || underUnmodelledPlace(node)) continue;
        const written = (info.reference as Reference & { $refNode?: CstNode }).$refNode;
        if (!written) continue;
        const text = written.text;
        const { role, construct } = classify(node, file);
        found.push({
          file,
          offset: written.offset,
          end: written.end,
          line: lineOf(parsed.fullText, written.offset),
          text,
          name: text.startsWith('#') ? text.slice(1) : text,
          kindType,
          role,
          negated: isNegated(node),
          constructOffset: construct.$cstNode?.offset ?? written.offset,
        });
      }
    }
    places.push(...found.sort((a, b) => a.offset - b.offset));
  }
  return places;
}

/** Whether `node` lies below an unmodelled place. */
function underUnmodelledPlace(node: AstNode): boolean {
  for (let up = node.$container; up; up = up.$container) if (isUnmodelledPlace(up as unknown as { $type?: string })) return true;
  return false;
}

/**
 * The place of a kind or tag reference held by `holder` (the node owning
 * the reference property), and the construct holding it.
 */
function classify(holder: AstNode, file: string): { role: KindPlaceRole; construct: AstNode } {
  const unknown = (): never => {
    throw new Error(`Internal error: a kind or tag reference in ${holder.$type} at an unknown place in '${file}'`);
  };
  // A tag reference sits in a `TagRef`; a dot connector `.k` in a `RelationKindDotRef`.
  const owner = holder.$type === 'TagRef' || holder.$type === 'RelationKindDotRef' ? holder.$container! : holder;
  if (holder === owner && owner.$type === 'Element') return { role: 'declaration:element', construct: owner };
  if (holder === owner && owner.$type === 'DeploymentNode') return { role: 'declaration:deploymentNode', construct: owner };
  const connector = CONNECTORS[owner.$type];
  if (connector) return { role: `connector:${connector}`, construct: owner };
  if (owner.$type === 'Tags') {
    // `Tags` lists chain through `prev` and sit in a body or directly in their owner.
    for (let up = owner.$container; up; up = up.$container) {
      const context = TAG_OWNERS[up.$type];
      if (context) return { role: `tags:${context}`, construct: owner };
    }
    return unknown();
  }
  const expression = EXPRESSIONS[owner.$type];
  if (!expression) return unknown();
  for (let up = owner.$container; up; up = up.$container) {
    const context = EXPRESSION_CONTEXTS[up.$type];
    if (context) return { role: `${expression}:${context}`, construct: owner };
  }
  return unknown();
}

/** Whether the expression holding a reference is written negated: by its operator, or inside a `not (…)` condition. */
function isNegated(holder: AstNode): boolean {
  const owner = holder.$type === 'TagRef' ? holder.$container! : holder;
  const expression = owner as AstNode & { isEqual?: boolean; operator?: string; not?: boolean };
  // LikeC4 `parseEquals`: an operator starting with `!=` (`!=`, `!==`) is not-equal, one starting
  // with `=` is equal, otherwise (`is` / `is not`) the `not` flag decides.
  if (expression.isEqual === false || expression.operator?.startsWith('!=')) return true;
  if (!expression.operator?.startsWith('=') && expression.not === true) return true;
  for (let up = owner.$container; up; up = up.$container) {
    if (up.$type === 'WhereElementNegation' || up.$type === 'WhereRelationNegation') return true;
  }
  return false;
}

/** The 1-based line of `offset` in `text`. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
