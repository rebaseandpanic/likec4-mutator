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
}

/**
 * Information about a model element resolved with its FQN.
 *
 * `tags`, `links` and `metadata` are the element's effective values: the
 * declaration body merged with every `extend` block of the element, the way
 * LikeC4 builds its model.  `declared` and `extendedBy` tell where they come
 * from.
 */
export interface ElementInfo {
  /** Fully qualified name, e.g. 'app.api' */
  fqn: string;
  /** Local identifier, e.g. 'api' */
  name: string;
  /** Element kind reference text, e.g. 'service' */
  kind: string;
  /**
   * Title as LikeC4 reads it: the one written after the kind
   * (`name = kind 'title'`, an empty one included), otherwise the body
   * `title` property (the last one).  Normalized as LikeC4 does (see
   * {@link ElementInfo.technology})
   */
  title?: string;
  /**
   * Summary as LikeC4 reads it: the one written after the title
   * (`name = kind 'title' 'summary'`) when non-empty, otherwise the body
   * `summary` property (the last one).  Normalized as LikeC4 does (see
   * {@link ElementInfo.technology})
   */
  summary?: string;
  /**
   * Description: the body `description` property (the last one).  Normalized
   * as LikeC4 does (see {@link ElementInfo.technology})
   */
  description?: string;
  /**
   * Technology as LikeC4 reads it: the one written after the summary
   * (`name = kind 'title' 'summary' 'technology'`, an empty one included),
   * otherwise the body `technology` property (the last one).
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
   * Effective tags: those of the declaration, then those of each `extend`
   * block in merge order (see {@link ElementInfo.extendedBy}), without
   * duplicates.
   */
  tags?: string[];
  /**
   * Effective links: those of the declaration followed by those of each
   * `extend` block in merge order.  Duplicates are kept, as in LikeC4.  A
   * label is read as LikeC4 does: dedented, trimmed and joined into one
   * line; an empty label is absent.
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
 * `tags`, `links` and `metadata` are the relationship's effective values:
 * its own merged with every `extend a -> b { ... }` block that applies to
 * it, the way LikeC4 builds its model.  `declared` and `extendedBy` tell
 * where they come from.
 */
export interface RelationshipInfo {
  /** FQN of the source element */
  sourceFqn: string;
  /** FQN of the target element */
  targetFqn: string;
  /**
   * Title: the one after the target (an empty `''` included), otherwise the
   * body `title` property (the last one), as LikeC4 reads it.  Normalized as
   * for {@link ElementInfo.title}
   */
  title?: string;
  /** Relationship kind as written: `app -[calls]-> api` or `app .calls api` */
  kind?: string;
  /**
   * Technology: the one after the description
   * (`a -> b 'title' 'description' 'technology'`, an empty one included,
   * joined into one line), otherwise the body `technology` property, as
   * LikeC4 reads it.  Normalized as for {@link ElementInfo.technology}
   */
  technology?: string;
  /**
   * Description: the one after the title when non-empty, otherwise the body
   * `description` property, as LikeC4 reads it.  Normalized as for
   * {@link ElementInfo.description}
   */
  description?: string;
  /**
   * Effective tags: the relationship's own — those written on the relation
   * line, or else those of its body — then those of each `extend` block in
   * merge order (see {@link RelationshipInfo.extendedBy}), without
   * duplicates.
   */
  tags?: string[];
  /**
   * Effective links: the relationship's own, then those of each `extend`
   * block in merge order — a block's link is skipped when a link with the
   * same url and label is already present (the relationship's own
   * duplicates are kept), as in LikeC4.  Labels are read as for
   * {@link ElementInfo.links}.
   */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Effective metadata, normalized and merged as for
   * {@link ElementInfo.metadata}: the relationship's first `metadata { ... }`
   * block, then the first block of each `extend` block in merge order.
   */
  metadata?: Record<string, string | string[]>;
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
}
