/**
 * DSL code generation helpers.
 *
 * Each function produces a snippet of LikeC4 source text that can be spliced
 * into a document via a TextEdit.  The caller is responsible for supplying the
 * correct indentation strings.
 */

// ---------------------------------------------------------------------------
// Element generation
// ---------------------------------------------------------------------------

export interface GenerateElementOpts {
  /** Leading whitespace for the element declaration line */
  indent: string;
  /** Local identifier (not the FQN) */
  name: string;
  /** Element kind reference, e.g. 'service' */
  kind: string;
  /** Optional inline title */
  title?: string;
  /** Optional body description */
  description?: string;
  /** Optional technology label */
  technology?: string;
  /** Optional tags — each tag name is prefixed with `#` in the output */
  tags?: string[];
  /** Optional hyperlinks — each becomes a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** Optional metadata key/value pairs — emitted as a `metadata { ... }` block */
  metadata?: Record<string, string>;
}

/**
 * Generate a LikeC4 element declaration snippet.
 *
 * If no body properties are required the element is emitted on a single line.
 * Otherwise a `{ ... }` block is produced with the appropriate inner indent.
 */
export function generateElement(opts: GenerateElementOpts): string {
  const { indent, name, kind, title, description, technology, tags, links, metadata } = opts;
  const innerIndent = indent + '  ';

  const hasTags = !!(tags && tags.length > 0);
  const hasLinks = !!(links && links.length > 0);
  const hasMetadata = !!(metadata && Object.keys(metadata).length > 0);
  const hasBody = !!(description || technology || hasTags || hasLinks || hasMetadata);

  let result = `${indent}${name} = ${kind}`;
  if (title) result += ` '${escapeString(title)}'`;

  if (hasBody) {
    result += ' {\n';
    // Tags come first, each on its own line with a # prefix
    if (hasTags) {
      for (const tag of tags!) {
        result += `${innerIndent}#${tag}\n`;
      }
    }
    if (description) result += `${innerIndent}description '${escapeString(description)}'\n`;
    if (technology) result += `${innerIndent}technology '${escapeString(technology)}'\n`;
    if (hasLinks) {
      for (const lnk of links!) {
        if (lnk.label) {
          result += `${innerIndent}link ${lnk.url} '${escapeString(lnk.label)}'\n`;
        } else {
          result += `${innerIndent}link ${lnk.url}\n`;
        }
      }
    }
    if (hasMetadata) {
      result += `${innerIndent}metadata {\n`;
      const innerInnerIndent = innerIndent + '  ';
      for (const [key, value] of Object.entries(metadata!)) {
        result += `${innerInnerIndent}${key} '${escapeString(value)}'\n`;
      }
      result += `${innerIndent}}\n`;
    }
    result += `${indent}}`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relationship generation
// ---------------------------------------------------------------------------

export interface GenerateRelationshipOpts {
  /** Leading whitespace for the relationship line */
  indent: string;
  /** Source element identifier (local name or FQN) */
  source: string;
  /** Target element identifier (local name or FQN) */
  target: string;
  /** Optional relationship label */
  label?: string;
  /** Optional technology label (currently reserved) */
  technology?: string;
  /** Optional description — when present a body block is emitted */
  description?: string;
}

/**
 * Generate a LikeC4 relationship declaration snippet.
 *
 * When a description is supplied the output becomes a block form:
 * ```
 * source -> target 'label' {
 *   description 'text'
 * }
 * ```
 */
export function generateRelationship(opts: GenerateRelationshipOpts): string {
  const { indent, source, target, label, description } = opts;
  const innerIndent = indent + '  ';

  let result = `${indent}${source} -> ${target}`;
  if (label) result += ` '${escapeString(label)}'`;

  if (description) {
    result += ' {\n';
    result += `${innerIndent}description '${escapeString(description)}'\n`;
    result += `${indent}}`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// View generation
// ---------------------------------------------------------------------------

export interface GenerateViewOpts {
  /** Leading whitespace for the view declaration line */
  indent: string;
  /** View identifier */
  id: string;
  /** View type */
  type: 'element' | 'dynamic' | 'deployment';
  /** For element views: the FQN of the scoped element */
  target?: string;
  /** Optional view title */
  title?: string;
  /** Optional include expressions (each becomes an `include` statement) */
  includes?: string[];
}

/**
 * Generate a LikeC4 view declaration snippet including a default
 * `autoLayout TopBottom` directive.
 */
export function generateView(opts: GenerateViewOpts): string {
  const { indent, id, type, target, title, includes } = opts;
  const innerIndent = indent + '  ';

  let header: string;
  if (type === 'element' && target) {
    header = `${indent}view ${id} of ${target}`;
  } else if (type === 'dynamic') {
    header = `${indent}dynamic view ${id}`;
  } else if (type === 'deployment') {
    header = `${indent}deployment view ${id}`;
  } else {
    header = `${indent}view ${id}`;
  }

  let result = header + ' {\n';
  // Title must be declared inside the body (not inline) per the LikeC4 grammar.
  if (title) result += `${innerIndent}title '${escapeString(title)}'\n`;
  if (includes) {
    for (const inc of includes) {
      result += `${innerIndent}include ${inc}\n`;
    }
  }
  result += `${innerIndent}autoLayout TopBottom\n`;
  result += `${indent}}`;

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
