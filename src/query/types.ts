import type { ElementStyle, RelationshipStyle } from '../mutator/codegen.js';
import type { LinkedTarget } from './deployment-resolver.js';

/** Position of a construct in the source text of its file. */
export interface SourceRange {
  /** Offset of the first character (0-based) */
  offset: number;
  /** Offset just past the last character */
  end: number;
  /** Line of the first character (0-based) */
  line: number;
  /** Column of the first character (0-based) */
  column: number;
}

/**
 * Tags, links and metadata as written in one body (an element declaration or
 * an `extend` block).  Absent fields mean the body declares none.
 */
export interface ElementDecorations {
  /** Tags in source order */
  tags?: string[];
  /** Links in source order */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Metadata as declared in the body's first `metadata { ... }` block (the
   * only one LikeC4 reads): `key 'value'` reads as a string,
   * `key ['v1', ...]` as an array (also with a single element); when a key
   * is repeated inside the block, the last value is reported.
   */
  metadata?: Record<string, string | string[]>;
}

/** One `extend X { ... }` block of an element, or `extend a -> b { ... }` block of a relationship. */
export interface ExtendContribution extends ElementDecorations {
  /**
   * Name of the file that holds the block — the key passed to
   * `LikeC4Mutator.fromFiles`, or the `file` given to `WorkspaceIndex`.
   * Absent when the document was indexed without a name.
   */
  file?: string;
  /** Position of the whole `extend` block in its file */
  sourceRange: SourceRange;
  /**
   * For the block of a relationship (`extend a -> b`, `extend a <-> b`):
   * whether it is bidirectional, part of the identity it is matched by
   * (D69).  Absent on the block of an element or deployment node.
   */
  bidirectional?: boolean;
}

/**
 * The declaration of an element or relationship kind in a `specification`
 * block (`element <kind> { ... }` / `relationship <kind> { ... }`) and the
 * defaults it writes.  When a kind is declared more than once, this is the
 * declaration LikeC4 uses: the one of the last document (files sorted as for
 * {@link ElementInfo.extendedBy}); within a document the last one for an
 * element kind, the first one for a relationship kind.  (LikeC4's validator
 * reports a duplicate kind as an error; the library does not.)
 */
export interface KindDefaults {
  /** Kind name, as in {@link ElementInfo.kind} / {@link RelationshipInfo.kind} */
  kind: string;
  /**
   * File of the declaration — the key passed to `LikeC4Mutator.fromFiles`,
   * or the `file` given to `WorkspaceIndex`.  Absent when the document was
   * indexed without a name.
   */
  file?: string;
  /** Position of the declaration in its file */
  sourceRange: SourceRange;
  /** Default title, normalized as {@link ElementInfo.title} */
  title?: string;
  /** Default summary (element kinds only), normalized as {@link ElementInfo.summary} */
  summary?: string;
  /** Default description, normalized as {@link ElementInfo.description} */
  description?: string;
  /** Default technology, normalized as {@link ElementInfo.technology} */
  technology?: string;
  /** Default tags as written, in source order */
  tags?: string[];
  /** Default links as written, in source order */
  links?: Array<{ url: string; label?: string }>;
}

/**
 * Information about a model element resolved with its FQN.
 *
 * `title`, `summary`, `description`, `technology`, `tags`, `links` and
 * `metadata` are the element's effective values, the way LikeC4 builds its
 * model: the defaults of the element's kind (see
 * {@link ElementInfo.fromSpecification}), overridden or extended by the
 * declaration, then merged with every `extend` block of the element.
 * `fromSpecification`, `declared` and `extendedBy` tell where they come from.
 *
 * `ownStyle` and `style` are its own and effective styles (D74); see
 * {@link ElementInfo.style}.
 *
 * Not covered: notation (no field here), and the technology
 * LikeC4 derives from the element icon when the project setting
 * `inferTechnologyFromIcon` (on by default) is on and the element has no
 * technology or an empty one — the library does not read project settings.
 */
export interface ElementInfo {
  /** Fully qualified name, e.g. 'app.api' */
  fqn: string;
  /** Local identifier, e.g. 'api' */
  name: string;
  /** Element kind reference text, e.g. 'service' */
  kind: string;
  /**
   * Title as LikeC4 computes it: the element's own — the one written after
   * the kind (`name = kind 'title'`), otherwise the body `title` property
   * (the last one) — when non-empty; otherwise the title of its kind when
   * that is non-empty; otherwise the element name.  Always defined.
   * Normalized as LikeC4 does (see {@link ElementInfo.technology})
   */
  title: string;
  /**
   * Summary as LikeC4 computes it: the one written after the title
   * (`name = kind 'title' 'summary'`) when non-empty, otherwise the body
   * `summary` property (the last one, an empty one included), otherwise the
   * summary of its kind.  Normalized as LikeC4 does (see
   * {@link ElementInfo.technology})
   */
  summary?: string;
  /**
   * Description: the body `description` property (the last one, an empty
   * one included), otherwise the description of its kind.  Normalized as
   * LikeC4 does (see {@link ElementInfo.technology})
   */
  description?: string;
  /**
   * Technology as LikeC4 reads it: the one written after the summary
   * (`name = kind 'title' 'summary' 'technology'`, an empty one included),
   * otherwise the body `technology` property (the last one), otherwise the
   * technology of its kind.  An empty own technology is reported as `''`
   * (LikeC4 replaces it by one derived from the icon, see
   * {@link ElementInfo}).
   *
   * `title`, `summary`, `description` and `technology` are plain strings
   * normalized as LikeC4 normalizes them: common indentation removed and
   * trimmed (a technology written after the summary is also joined into one
   * line), a Markdown string (`'''...'''`) read as its content, so a
   * whitespace-only Markdown summary or description reads as `''`.  An empty
   * Markdown `title` or `technology` is no value.
   */
  technology?: string;
  /**
   * Effective tags: those of the element's kind, then those of the
   * declaration, then those of each `extend` block in merge order (see
   * {@link ElementInfo.extendedBy}), without duplicates.
   */
  tags?: string[];
  /**
   * Effective links: those of the declaration — or, when it has none, those
   * of the element's kind — followed by those of each `extend` block in
   * merge order.  Duplicates are kept, as in LikeC4.  A label is read as
   * LikeC4 does: dedented, trimmed and joined into one line; an empty label
   * is absent.
   */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Effective metadata, merged as LikeC4 does: every value is dedented and
   * trimmed and empty values are dropped; every remaining value of a key —
   * from the declaration, then from each `extend` block in merge order — is
   * collected; when a key occurs in more than one body, duplicate values are
   * dropped.  A key with a single value maps to a string (also when written
   * as `key ['v1']`), otherwise to an array.
   */
  metadata?: Record<string, string | string[]>;
  /**
   * Own style: the first `style { ... }` block of the declaration — later
   * properties overriding earlier ones — then a body-level `icon`
   * overriding `style.icon`.  Values as written (opacity `'40%'`), no theme
   * defaults; absent when no field is set (D18, D74)
   */
  ownStyle?: ElementStyle;
  /**
   * Effective style, as LikeC4's model holds it before theme defaults: the
   * style of the element's kind ({@link ElementKindDefaults.style})
   * overridden field by field by {@link ElementInfo.ownStyle}, so a body
   * `icon` wins over `style { icon }`.  Theme defaults and configured
   * `styles.defaults` are not applied (D74); absent when no field is set
   */
  style?: ElementStyle;
  /**
   * The specification declaration of the element's kind and the defaults it
   * writes, its style included; absent when no specification declares the
   * kind (LikeC4 then leaves the element out of its model).
   */
  fromSpecification?: ElementKindDefaults;
  /** Tags, links and metadata written in the element's own declaration body */
  declared: ElementDecorations;
  /**
   * Every `extend X { ... }` block whose target is exactly this element, in
   * the order LikeC4 merges them: files sorted by path (natural, segment by
   * segment — `ext9.c4` before `ext10.c4`), then source order within a
   * file.  Blocks that only declare nested elements, or nothing, are listed
   * too.
   */
  extendedBy: ExtendContribution[];
  /** FQNs of direct children, including those declared in `extend` blocks of any file */
  children: string[];
  /** FQN of the parent element, undefined for root elements */
  parentFqn?: string;
  /** Position of the declaration in its file */
  sourceRange: SourceRange;
}

/**
 * Information about a relationship between two elements.
 *
 * `title`, `description`, `technology`, `tags`, `links` and `metadata` are
 * the relationship's effective values, the way LikeC4 builds its model: the
 * defaults of its kind (see {@link RelationshipInfo.fromSpecification}),
 * overridden or extended by its own values, then merged with every
 * `extend a -> b { ... }` block that applies to it.  `fromSpecification`,
 * `declared` and `extendedBy` tell where they come from.  Style and notation
 * are not covered.
 */
export interface RelationshipInfo {
  /** FQN of the source element */
  sourceFqn: string;
  /** FQN of the target element */
  targetFqn: string;
  /**
   * Title: its own — the one after the target, otherwise the body `title`
   * property (the last one) — when non-empty, otherwise the title of its
   * kind when that declares one, otherwise its own (`''` or none), as LikeC4
   * computes it.  Normalized as for {@link ElementInfo.title}
   */
  title?: string;
  /** Relationship kind as written: `app -[calls]-> api` or `app .calls api` */
  kind?: string;
  /**
   * Whether the relationship is bidirectional (`<->`, `-[k]<->`), as
   * LikeC4's `isBidirectional` — the field deployment relationships report
   * (D69)
   */
  bidirectional: boolean;
  /**
   * Technology: the one after the description
   * (`a -> b 'title' 'description' 'technology'`, an empty one included,
   * joined into one line), otherwise the body `technology` property (an
   * empty one included), otherwise the technology of its kind, as LikeC4
   * computes it.  Normalized as for {@link ElementInfo.technology}
   */
  technology?: string;
  /**
   * Description: the one after the title when non-empty, otherwise the body
   * `description` property (an empty one included), otherwise the
   * description of its kind, as LikeC4 computes it.  Normalized as for
   * {@link ElementInfo.description}
   */
  description?: string;
  /**
   * Effective tags: those of its kind, then the relationship's own — those
   * written on the relation line, or else those of its body — then those of
   * each `extend` block in merge order (see
   * {@link RelationshipInfo.extendedBy}), without duplicates.
   */
  tags?: string[];
  /**
   * Effective links: the relationship's own — or, when it has none, those
   * of its kind — then those of each `extend` block in merge order — a
   * block's link is skipped when a link with the same url and label is
   * already present (duplicates before that are kept), as in LikeC4.  Labels are read as for
   * {@link ElementInfo.links}.
   */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Effective metadata, normalized and merged as for
   * {@link ElementInfo.metadata}: the relationship's first `metadata { ... }`
   * block, then the first block of each `extend` block in merge order.
   */
  metadata?: Record<string, string | string[]>;
  /**
   * Own style: the first `style { ... }` block of the relationship (`line`,
   * `color`, `head`, `tail`), values as written; absent when no field is set
   */
  ownStyle?: RelationshipStyle;
  /**
   * Effective style, as LikeC4's model holds it before theme defaults: the
   * style of its kind ({@link RelationshipKindDefaults.style}) overridden
   * field by field by {@link RelationshipInfo.ownStyle}.  A bidirectional
   * relationship always has a `tail`: the one written, else the `head`,
   * else `'normal'`.  No theme defaults (D74); absent when no field is set
   */
  style?: RelationshipStyle;
  /**
   * The specification declaration of the relationship's kind and the
   * defaults it writes, its style and `multiple` included; absent when the
   * relationship has no kind or no specification declares it.
   */
  fromSpecification?: RelationshipKindDefaults;
  /** Tags, links and metadata written in the relationship itself */
  declared: ElementDecorations;
  /**
   * Every `extend a -> b { ... }` block that applies to this relationship,
   * in the order LikeC4 merges them (files sorted as for
   * {@link ElementInfo.extendedBy}, then source order).  A block applies
   * when its endpoints (resolved to FQNs), kind, title and direction equal
   * the relationship's: no kind matches no kind only (a kind no
   * specification declares counts as no kind); titles are compared
   * dedented and trimmed, a relationship without a title being compared with
   * the title of its kind's specification when that declares one; the
   * endpoints of a bidirectional relationship match in either order.  One
   * block applies to every relationship it matches.
   */
  extendedBy: ExtendContribution[];
  /** Position in source */
  sourceRange: {
    offset: number;
    end: number;
    line: number;
    column: number;
  };
}

/**
 * Summary of the specification block.
 */
export interface SpecificationInfo {
  /** Declared element kinds, e.g. ['system', 'service', 'database'] */
  elementKinds: string[];
  /** Declared tags, e.g. ['deprecated', 'backend'] */
  tags: string[];
  /** Declared relationship kinds, e.g. ['uses', 'requests'] */
  relationshipKinds: string[];
  /**
   * Declared deployment node kinds (`deploymentNode <kind>`), e.g.
   * ['environment', 'zone'].  Present only when at least one is declared;
   * their defaults are read with `LikeC4Mutator.getDeploymentNodeKind`.
   */
  deploymentNodeKinds?: string[];
}

/**
 * The declaration of an element kind and the defaults it writes (see
 * {@link KindDefaults}), with its style (D89).
 */
export interface ElementKindDefaults extends KindDefaults {
  /**
   * Default style as written in the kind's `style { ... }` block: the first
   * block, the last value of a repeated field, values as written (opacity
   * as `'40%'`), no theme defaults
   */
  style?: ElementStyle;
}

/**
 * The declaration of a relationship kind and the defaults it writes (see
 * {@link KindDefaults}), with its style and `multiple` (D89).
 */
export interface RelationshipKindDefaults extends KindDefaults {
  /** Default style: the `line`, `color`, `head` and `tail` written in the kind, values as written */
  style?: RelationshipStyle;
  /** The kind's `multiple` flag, as written; absent when not written */
  multiple?: boolean;
}

/**
 * The declaration of a deployment node kind in a `specification` block
 * (`deploymentNode <kind> { ... }`) and the defaults it writes, chosen as for
 * an element kind when the kind is declared more than once (see
 * {@link KindDefaults}).
 */
export interface DeploymentNodeKindDefaults extends KindDefaults {
  /**
   * Default style as written in the kind's `style { ... }` block: the first
   * block, the last value of a repeated field, values as written (opacity
   * as `'40%'`), no theme defaults
   */
  style?: ElementStyle;
}

/**
 * One end of a deployment relationship.  `id` is a deployment id — of a node
 * or of an instance; when the endpoint steps into the element of an instance
 * (`prod.db.replLog`), `id` is the instance and `element` is the FQN of the
 * element inside the instance's element (`app.db.replLog`).
 */
export interface DeploymentEndpoint {
  /** Deployment id of the node or instance, e.g. 'prod.eu.vm1' */
  id: string;
  /** FQN of the nested element when the endpoint steps into the instance's element */
  element?: string;
}

/**
 * Information about a deployment node, addressed by its LikeC4 deployment id.
 *
 * `title`, `summary`, `description`, `technology`, `tags`, `links`,
 * `metadata` and `style` are the node's effective values, the way LikeC4
 * builds its model: the defaults of the node's kind (see
 * {@link DeploymentNodeInfo.fromSpecification}), overridden or extended by
 * the declaration, then merged with every `extend <node>` block of the node.
 * `fromSpecification`, `declared` and `extendedBy` tell where they come from.
 * Strings are normalized as for {@link ElementInfo.technology}.
 */
export interface DeploymentNodeInfo {
  /** Deployment id: the parent's id + `.` + name, e.g. 'prod.eu.vm1' */
  id: string;
  /** Local name, e.g. 'vm1' */
  name: string;
  /** Deployment node kind as written, e.g. 'host' */
  kind: string;
  /** Deployment id of the parent node, undefined for root nodes */
  parentId?: string;
  /**
   * Title as LikeC4 computes it: the node's own when it has one (an empty
   * one stays `''`), otherwise the title of its kind, otherwise the node
   * name; an own title equal to the node name is replaced by the kind title
   * when the kind has one.  Always defined.
   */
  title: string;
  /** Summary: the node's own, otherwise the summary of its kind */
  summary?: string;
  /** Description: the node's own, otherwise the description of its kind */
  description?: string;
  /** Technology: the node's own (body property), otherwise the technology of its kind */
  technology?: string;
  /**
   * Effective tags: the node's own — or, when it has none, those of its kind
   * — then those of each `extend` block in merge order (see
   * {@link DeploymentNodeInfo.extendedBy}), then the tags of its kind
   * appended, without duplicates.
   */
  tags?: string[];
  /**
   * Effective links: the node's own — or, when it has none, those of its
   * kind — then those of each `extend` block in merge order, merged as for
   * {@link ElementInfo.links}.
   */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Effective metadata: the node's own, then each `extend` block in merge
   * order, normalized and merged as for {@link ElementInfo.metadata}.
   */
  metadata?: Record<string, string | string[]>;
  /**
   * Effective style: the style of its kind overridden field by field by the
   * node's own `style { ... }` block, read as for
   * {@link DeploymentNodeKindDefaults.style}.
   */
  style?: ElementStyle;
  /**
   * The specification declaration of the node's kind and the defaults it
   * writes; absent when no specification declares the kind.
   */
  fromSpecification?: DeploymentNodeKindDefaults;
  /** Tags, links and metadata written in the node's own declaration body */
  declared: ElementDecorations;
  /**
   * Every `extend <node> { ... }` block whose target is exactly this node,
   * in the order LikeC4 merges them (files sorted as for
   * {@link ElementInfo.extendedBy}, then source order within a file).
   */
  extendedBy: ExtendContribution[];
  /** Deployment ids of the direct child nodes, including those declared in `extend` blocks */
  children: string[];
  /** Deployment ids of the instances directly in this node, including those declared in `extend` blocks */
  instances: string[];
  /**
   * File of the declaration — the key passed to `LikeC4Mutator.fromFiles`,
   * or the `file` given to `WorkspaceIndex`.  Absent when the document was
   * indexed without a name.
   */
  file?: string;
  /** Position of the declaration in its file */
  sourceRange: SourceRange;
}

/**
 * Information about an instance of a logical element in a deployment node
 * (`instanceOf <element>`), addressed by its LikeC4 deployment id.
 *
 * The effective values follow LikeC4's computed model: the instance's own
 * value when it has one, otherwise the effective value of its element (see
 * {@link ElementInfo}), with two documented exceptions: `summary` and
 * `description` are inherited field by field, without LikeC4's display
 * fallback from one to the other, and no technology is derived from an
 * icon (the library reads no project settings).  Strings are normalized as
 * for {@link ElementInfo.technology}.  Instances cannot be extended.
 */
export interface DeploymentInstanceInfo {
  /** Deployment id: the parent node's id + `.` + name, e.g. 'prod.eu.vm1.api' */
  id: string;
  /**
   * Local name: the explicit one (`name = instanceOf ...`), otherwise the
   * last segment of the `instanceOf` reference as written
   */
  name: string;
  /** Deployment id of the node that holds the instance */
  parentId: string;
  /** FQN of the element the instance deploys, e.g. 'shop.api' */
  element: string;
  /** Title: the instance's own (an empty one stays `''`), otherwise the element's title.  Always defined. */
  title: string;
  /** Summary: the instance's own, otherwise the element's summary */
  summary?: string;
  /** Description: the instance's own, otherwise the element's description */
  description?: string;
  /** Technology: the instance's own, otherwise the element's technology */
  technology?: string;
  /** Effective tags: the instance's own, then the element's tags, without duplicates */
  tags?: string[];
  /** Links: the instance's own, otherwise the element's links */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Metadata: the instance's own map, otherwise the element's map — an own
   * map replaces the element's whole map, keys are not merged
   */
  metadata?: Record<string, string | string[]>;
  /**
   * Effective style: the element's style (its kind's style overridden by its
   * own) overridden field by field by the instance's own `style { ... }`
   * block, read as for {@link DeploymentNodeKindDefaults.style}
   */
  style?: ElementStyle;
  /** Tags, links and metadata written in the instance's own body */
  declared: ElementDecorations;
  /**
   * File of the declaration — the key passed to `LikeC4Mutator.fromFiles`,
   * or the `file` given to `WorkspaceIndex`.  Absent when the document was
   * indexed without a name.
   */
  file?: string;
  /** Position of the declaration in its file */
  sourceRange: SourceRange;
}

/**
 * Information about a relationship of the deployment model.
 *
 * The effective values follow LikeC4's computed model: the relationship's
 * own values, with the defaults of its kind (see
 * {@link DeploymentRelationshipInfo.fromSpecification}) where it has none.
 * A description or technology written on the relation line is ignored, as
 * LikeC4 ignores it; only body properties count.  Deployment relationships
 * cannot be extended.  Strings are normalized as for
 * {@link ElementInfo.technology}.
 */
export interface DeploymentRelationshipInfo {
  /** Source endpoint; for a relationship written without a source, the enclosing node or instance */
  source: DeploymentEndpoint;
  /** Target endpoint */
  target: DeploymentEndpoint;
  /** Relationship kind as written: `a -[calls]-> b` or `a .calls b` */
  kind?: string;
  /** Whether the relationship is bidirectional (`<->`, `-[k]<->`) */
  bidirectional: boolean;
  /**
   * Title, as LikeC4 computes it: its own (written after the target, else
   * in the body), otherwise the title of its kind; an empty own title is no
   * title, also when the kind declares one
   */
  title?: string;
  /** Description: the body `description` property, otherwise the description of its kind */
  description?: string;
  /**
   * Technology: the body `technology` property when non-empty, otherwise the
   * technology of its kind
   */
  technology?: string;
  /**
   * Effective tags: those of its kind, then its own — those written on the
   * relation line, or else those of its body — without duplicates
   */
  tags?: string[];
  /** Links: its own, otherwise those of its kind */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata: its first `metadata { ... }` block, normalized as for {@link ElementInfo.metadata} */
  metadata?: Record<string, string | string[]>;
  /**
   * Effective style: the style of its kind overridden field by field by its
   * own `style { ... }` block, values as written.  A bidirectional
   * relationship always has a `tail`, as LikeC4 computes it: the one
   * written, otherwise its `head`, otherwise `'normal'`.
   */
  style?: RelationshipStyle;
  /**
   * The specification declaration of the relationship's kind, the defaults
   * it writes and its style; absent when the relationship has no kind or no
   * specification declares it.
   */
  fromSpecification?: KindDefaults & { style?: RelationshipStyle };
  /** Tags, links and metadata written in the relationship itself */
  declared: ElementDecorations;
  /**
   * File of the relationship — the key passed to `LikeC4Mutator.fromFiles`,
   * or the `file` given to `WorkspaceIndex`.  Absent when the document was
   * indexed without a name.
   */
  file?: string;
  /** Position of the relationship in its file */
  sourceRange: SourceRange;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** The three view types of LikeC4. */
export type ViewType = 'element' | 'dynamic' | 'deployment';

/**
 * A reference written in a view, with what it resolves to as LikeC4 scopes
 * it at that place: an element FQN (element and dynamic views), a
 * deployment target or a logical element (deployment views, the
 * `LinkedTarget` shape), or a view id (`navigateTo`, `extends`).
 */
export interface ViewReference<T = string> {
  /** The reference as written, e.g. 'app.api' */
  text: string;
  /** The resolved target; `null` when the reference does not resolve (unknown or ambiguous name, wrong target type) */
  target: T | null;
}

/**
 * A Markdown-or-string value as LikeC4 parses it: `{ md }` for a Markdown
 * string (`'''...'''`), `{ txt }` for a plain string; the text dedented and
 * trimmed.
 */
export type ViewText = { md: string } | { txt: string };

/** The direction keywords of `autoLayout`. */
export type ViewLayoutDirection = 'TopBottom' | 'BottomTop' | 'LeftRight' | 'RightLeft';

/** The values of an `autoLayout` rule. */
export interface ViewAutoLayout {
  /** Direction keyword as written */
  direction: ViewLayoutDirection;
  /** Rank spacing, when written */
  rankSep?: number;
  /** Node spacing, when written (only after a rank spacing) */
  nodeSep?: number;
}

/**
 * Stage-6 rule kinds, reported as opaque positions: their contents are not
 * structured, but they have an address and can be removed.
 */
export type ViewOpaqueRuleKind = 'style' | 'group' | 'rank' | 'globalPredicate' | 'globalStyle' | 'includeAncestors';

/** The kind of a view rule. */
export type ViewRuleKind = 'include' | 'exclude' | 'autoLayout' | ViewOpaqueRuleKind;

/** A relationship kind written in a predicate or a step, with the form it is written in: `-[kind]->` (`bracket`) or `.kind` (`dot`). */
export interface ViewRelationKind {
  /** Kind name as written */
  name: string;
  form: 'bracket' | 'dot';
}

/**
 * An element expression of a view predicate.  Kind and tag names are
 * reported without `#`.
 * - `wildcard`: `*`
 * - `element`: an element reference (a deployment reference in deployment
 *   views) with its selector — `children` (`.*`), `descendants` (`.**`),
 *   `expanded` (`._`) — or none
 * - `elementKind` / `elementTag`: `element.kind = k`, `element.tag != #t`
 */
export type ViewElementExpression =
  | { type: 'wildcard' }
  | {
      type: 'element';
      ref: ViewReference | ViewReference<LinkedTarget>;
      selector?: 'children' | 'descendants' | 'expanded';
    }
  | { type: 'elementKind'; operator: '=' | '!='; kind: string }
  | { type: 'elementTag'; operator: '=' | '!='; tag: string };

/**
 * A relation expression of a view predicate; each endpoint is an element
 * expression.
 * - `direct`: `a -> b`, `a <-> b`, `a -[k]-> b`, `a .k b`
 * - `incoming`: `-> b`
 * - `outgoing`: `a ->`, `a <->`, `a -[k]->`, `a .k`
 * - `inOut`: `-> a ->`
 */
export type ViewRelationExpression =
  | {
      type: 'direct';
      source: ViewElementExpression;
      target: ViewElementExpression;
      kind?: ViewRelationKind;
      bidirectional: boolean;
    }
  | { type: 'incoming'; target: ViewElementExpression }
  | { type: 'outgoing'; source: ViewElementExpression; kind?: ViewRelationKind; bidirectional: boolean }
  | { type: 'inOut'; element: ViewElementExpression };

/**
 * A leaf of a `where` condition: `tag`, `kind` or `metadata.<key>`, on a
 * relation optionally of its `source` or `target` (`source.tag is #t`).
 */
export interface ViewWhereLeaf {
  field: 'tag' | 'kind' | 'metadata';
  /** The relation endpoint the leaf tests, for the participant variants */
  participant?: 'source' | 'target';
  /** Metadata key */
  key?: string;
  /** Operator as written; absent for a metadata key without a value */
  operator?: '=' | '!=' | 'is' | 'is not';
  /** Tag or kind name (without `#`), or the metadata value (a string, or a boolean when written as `true` / `false`) */
  value?: string | boolean;
}

/** A `where` condition tree: `and` / `or` operands in source order, `not`, and leaves. */
export type ViewWhereCondition =
  | { and: ViewWhereCondition[] }
  | { or: ViewWhereCondition[] }
  | { not: ViewWhereCondition }
  | ViewWhereLeaf;

/**
 * The properties written in a `with { ... }` block.  A repeated property
 * reads as its last occurrence; an element block's `summary` is read as
 * its `description`, as LikeC4 does.  Style values are reported as written
 * (opacity as `'40%'`, size tokens and icon paths unchanged).
 */
export interface ViewWithProperties {
  title?: string;
  description?: ViewText;
  technology?: string;
  notation?: string;
  notes?: ViewText;
  /** Element `with`: any view; relation `with`: a dynamic view */
  navigateTo?: ViewReference;
  /** Element style fields for an element predicate, relationship style fields for a relation predicate */
  style?: ElementStyle | RelationshipStyle;
  /** Relation predicates only (an element predicate's `multiple` is a style field) */
  multiple?: boolean;
}

/** One item of an include or exclude rule, in source order (a trailing comma adds no item). */
export interface ViewPredicateItem {
  /** The item's source text */
  text: string;
  sourceRange: SourceRange;
  expression: ViewElementExpression | ViewRelationExpression;
  /** The `where` condition, when written */
  where?: ViewWhereCondition;
  /** The `with { ... }` properties, when written */
  with?: ViewWithProperties;
}

/**
 * One rule of a view, in source order.  Its address is
 * {@link ViewRuleAddress}: `index` plus, optionally, `text` as a guard.
 */
export interface ViewRuleInfo {
  /** 0-based position in the view's rule list */
  index: number;
  kind: ViewRuleKind;
  /** Exact source text of the rule */
  text: string;
  sourceRange: SourceRange;
  /** `include` / `exclude`: the predicate items */
  items?: ViewPredicateItem[];
  /** `autoLayout`: its values */
  autoLayout?: ViewAutoLayout;
}

/** The body of a dynamic step (`{ ... }` after it).  Style values as written. */
export interface ViewStepBody {
  /** Overrides the title written after the target */
  title?: string;
  description?: ViewText;
  technology?: string;
  notes?: ViewText;
  notation?: string;
  /** A dynamic view */
  navigateTo?: ViewReference;
  /** `color`, `line`, `head`, `tail` */
  style?: RelationshipStyle;
}

/**
 * One interaction of a dynamic view: a single step, or one segment of a
 * chain.  `source` and `target` are meant as LikeC4 means them (the
 * element the interaction goes from and the one it goes to): for
 * `a <- b` the source is `b`.
 */
export interface ViewStepInfo {
  source: ViewReference;
  target: ViewReference;
  /**
   * As LikeC4 parses it: `backward` for `a <- b`, and for a chain segment
   * that returns to the element it came from (its written arrow stays `->`)
   */
  direction: 'forward' | 'backward';
  /** The connector as written: `->`, `<-`, `-[kind]->` or `.kind` */
  arrow: string;
  kind?: ViewRelationKind;
  /** The title written after the target */
  title?: string;
  body?: ViewStepBody;
  /**
   * Position in LikeC4's step sequence, as in its step ids
   * `step-NN[:par.MM]`: `step` is `NN` (1-based; a stage-6 block takes one
   * number), `parallel` is `MM` inside a `par` block.  Absent when LikeC4's
   * parse drops the step (an endpoint that does not resolve, a chain after a
   * backward step, a statement of a block LikeC4 drops)
   */
  sequence?: { step: number; parallel?: number };
  /** 0-based segment number inside a chain; absent for a single step */
  segment?: number;
  /** Source text of the step, or of the segment from its connector on */
  text: string;
  sourceRange: SourceRange;
}

/** Fields shared by every step statement. */
export interface ViewStepStatementBase {
  /** Address: `[i]` at the top level of the view, `[i, j]` inside the `par` block at `i` */
  path: number[];
  /** Exact source text of the statement */
  text: string;
  sourceRange: SourceRange;
}

/**
 * A step statement of a dynamic view, in source order.  Its address is
 * {@link ViewStepAddress}.
 * - `step`: a single step
 * - `chain`: `a -> b -> c`, its segments in order
 * - `parallel`: a `par` / `parallel` block with its statements; `inModel`
 *   is false when the block contributes no LikeC4 step (an empty block, or
 *   one holding only blocks LikeC4 discards) — LikeC4 drops it
 * - `opaque`: a stage-6 block (`opt`, `loop`, `alt`, `try` with its
 *   `catch` / `finally`, `break`, or a stray `if` / `when` / `else`): its
 *   inner steps are not addressable; `inModel` is false when LikeC4 drops
 *   the block
 */
export type ViewStepStatementInfo =
  | (ViewStepStatementBase & { type: 'step'; step: ViewStepInfo })
  | (ViewStepStatementBase & { type: 'chain'; segments: ViewStepInfo[] })
  | (ViewStepStatementBase & {
      type: 'parallel';
      /** Keyword as written; new blocks are written as `par` */
      keyword: 'par' | 'parallel';
      title?: string;
      inModel: boolean;
      statements: ViewStepStatementInfo[];
    })
  | (ViewStepStatementBase & { type: 'opaque'; keyword: string; inModel: boolean });

/**
 * A view declaration.  Values are the view's own (not inherited through
 * `extends`), as LikeC4 parses them; absent fields mean the view declares
 * none.
 */
export interface ViewInfo {
  /** Declared id; `null` for an unnamed element view (read-only) */
  id: string | null;
  type: ViewType;
  /** `view ... of X`: X as written and resolved */
  of?: ViewReference;
  /** `view ... extends P`: P as written and resolved to an element view */
  extends?: ViewReference;
  /** Own title, single line, without the folder prefix LikeC4 adds */
  title?: string;
  description?: ViewText;
  /** Own tags, unique, in the order LikeC4's parse returns them */
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  /** Folder string of the enclosing `views` block */
  folder?: string;
  /** File the view is declared in */
  file: string;
  sourceRange: SourceRange;
  /** False for a declaration without a body: LikeC4 builds no view from it */
  inModel: boolean;
  /** Rules in source order (for dynamic views, without the steps) */
  rules: ViewRuleInfo[];
  /** Dynamic views only: step statements in source order */
  steps?: ViewStepStatementInfo[];
}

/** Address of a rule: its index in the view's rule list, and optionally its source text, which must match. */
export interface ViewRuleAddress {
  index: number;
  text?: string;
}

/**
 * Address of a step statement: its path, a segment number inside a chain,
 * and optionally the source text of the statement (or segment), which must
 * match.
 */
export interface ViewStepAddress {
  path: number[];
  segment?: number;
  text?: string;
}

/** Result of a view write. */
export interface ViewWriteResult {
  /** Files whose text changed, without duplicates.  Describes the in-memory state: nothing is written to disk. */
  changedFiles: string[];
}

/** Result of a step move or removal. */
export interface ViewStepWriteResult extends ViewWriteResult {
  /** Pre-write paths of the `par` blocks removed because the write left them empty */
  removedParallelBlocks: number[][];
}
