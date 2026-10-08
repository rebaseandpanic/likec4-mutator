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

/** One `extend X { ... }` block of an element. */
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
  /** Title from positional props or explicit title property */
  title?: string;
  /** Description text */
  description?: string;
  /** Technology text */
  technology?: string;
  /**
   * Effective tags: those of the declaration, then those of each `extend`
   * block in merge order (see {@link ElementInfo.extendedBy}), without
   * duplicates.
   */
  tags?: string[];
  /**
   * Effective links: those of the declaration followed by those of each
   * `extend` block in merge order.  Duplicates are kept, as in LikeC4.
   */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Effective metadata, merged as LikeC4 does: every value of a key — from
   * the declaration, then from each `extend` block in merge order — is
   * collected; when a key occurs in more than one body, duplicate values are
   * dropped.  A key with a single value maps to a string (also when written
   * as `key ['v1']`), otherwise to an array.  String contents are reported
   * as written (LikeC4 additionally dedents and trims them).
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
 */
export interface RelationshipInfo {
  /** FQN of the source element */
  sourceFqn: string;
  /** FQN of the target element */
  targetFqn: string;
  /** Optional relationship title */
  title?: string;
  /** Optional explicit relationship-kind reference (e.g. `app -.calls.-> api`). */
  kind?: string;
  /** Optional technology label */
  technology?: string;
  /** Optional description */
  description?: string;
  /** Tags declared on the relationship */
  tags?: string[];
  /** Hyperlinks declared on the relationship */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Metadata key/value pairs declared in the relationship's first
   * `metadata { ... }` block (the only one LikeC4 reads).  Each value is
   * either a string or string[].
   */
  metadata?: Record<string, string | string[]>;
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
