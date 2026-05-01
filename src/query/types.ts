/**
 * Information about a model element resolved with its FQN.
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
  /** Tags declared on the element */
  tags?: string[];
  /** Hyperlinks declared on the element */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Metadata key/value pairs declared on the element.  Each value is either a
   * string (for `key 'value'`) or string[] (for `key ['v1', 'v2']`).
   */
  metadata?: Record<string, string | string[]>;
  /** FQNs of direct children */
  children: string[];
  /** FQN of the parent element, undefined for root elements */
  parentFqn?: string;
  /** Position in source */
  sourceRange: {
    offset: number;
    end: number;
    line: number;
    column: number;
  };
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
   * Metadata key/value pairs declared on the relationship.  Each value is
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
