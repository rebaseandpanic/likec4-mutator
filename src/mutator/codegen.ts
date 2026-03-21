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

/**
 * Visual style properties for an element, emitted as a `style { ... }` block.
 */
export interface ElementStyle {
  /** Element shape, e.g. rectangle, person, browser, mobile, cylinder, storage, queue, bucket, document */
  shape?: string;
  /** Theme color or custom color name, e.g. primary, secondary, blue, amber */
  color?: string;
  /** Icon reference, e.g. tech:postgresql, aws:lambda, or a URL */
  icon?: string;
  /** Opacity percentage string, e.g. '40%', '100%' */
  opacity?: string;
  /** Border style: solid, dashed, dotted, none */
  border?: string;
  /** Whether to show multiple instances */
  multiple?: boolean;
  /** Size token: xs, sm, md, lg, xl */
  size?: string;
  /** Padding token: xs, sm, md, lg, xl */
  padding?: string;
  /** Text size token: xs, sm, md, lg, xl */
  textSize?: string;
  /** Icon position: left, right, top, bottom */
  iconPosition?: string;
  /** Icon color (theme color name) */
  iconColor?: string;
  /** Icon size token: xs, sm, md, lg, xl */
  iconSize?: string;
}

export interface GenerateElementOpts {
  /** Leading whitespace for the element declaration line */
  indent: string;
  /** Local identifier (not the FQN) */
  name: string;
  /** Element kind reference, e.g. 'service' */
  kind: string;
  /** Optional inline title */
  title?: string;
  /** Optional short summary shown on diagrams */
  summary?: string;
  /** Optional body description */
  description?: string;
  /** Optional technology label */
  technology?: string;
  /** Optional tags — each tag name is prefixed with `#` in the output */
  tags?: string[];
  /** Optional hyperlinks — each becomes a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** Optional visual style properties — emitted as a `style { ... }` block */
  style?: ElementStyle;
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
  const { indent, name, kind, title, summary, description, technology, tags, links, style, metadata } = opts;
  const innerIndent = indent + '  ';

  const hasTags = !!(tags && tags.length > 0);
  const hasLinks = !!(links && links.length > 0);
  const hasStyle = !!(style && Object.keys(style).length > 0);
  const hasMetadata = !!(metadata && Object.keys(metadata).length > 0);
  const hasBody = !!(summary || description || technology || hasTags || hasLinks || hasStyle || hasMetadata);

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
    if (summary) result += `${innerIndent}summary '${escapeString(summary)}'\n`;
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
    if (hasStyle) {
      result += generateStyleBlock(style!, innerIndent);
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

/** Visual style overrides for a LikeC4 relationship. */
export interface RelationshipStyle {
  /** Line style: solid, dashed, dotted */
  line?: string;
  /** Theme color name */
  color?: string;
  /** Arrow head style: normal, onormal, diamond, odiamond, crow, open, vee, dot, odot, none */
  head?: string;
  /** Arrow tail style — same values as head */
  tail?: string;
}

export interface GenerateRelationshipOpts {
  /** Leading whitespace for the relationship line */
  indent: string;
  /** Source element identifier (local name or FQN) */
  source: string;
  /** Target element identifier (local name or FQN) */
  target: string;
  /** Optional relationship label */
  label?: string;
  /** Optional technology label */
  technology?: string;
  /** Optional description — when present a body block is emitted */
  description?: string;
  /** Optional tags — each tag name is prefixed with `#` in the output */
  tags?: string[];
  /** Optional hyperlinks — each becomes a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** Optional metadata key/value pairs — emitted as a `metadata { ... }` block */
  metadata?: Record<string, string>;
  /** Optional visual style overrides — emitted as a `style { ... }` block */
  style?: RelationshipStyle;
}

/**
 * Generate a LikeC4 relationship declaration snippet.
 *
 * When any body property is supplied the output becomes a block form:
 * ```
 * source -> target 'label' {
 *   #tag
 *   description 'text'
 *   technology 'REST'
 *   link https://docs.example.com 'Docs'
 *   style {
 *     line dashed
 *     color red
 *   }
 *   metadata {
 *     sla '99.9%'
 *   }
 * }
 * ```
 */
export function generateRelationship(opts: GenerateRelationshipOpts): string {
  const { indent, source, target, label, technology, description, tags, links, metadata, style } =
    opts;
  const innerIndent = indent + '  ';

  let result = `${indent}${source} -> ${target}`;
  if (label) result += ` '${escapeString(label)}'`;

  const hasBody = !!(
    technology ||
    description ||
    (tags && tags.length > 0) ||
    (links && links.length > 0) ||
    (metadata && Object.keys(metadata).length > 0) ||
    (style && Object.keys(style).length > 0)
  );

  if (hasBody) {
    result += ' {\n';

    if (tags) {
      for (const tag of tags) result += `${innerIndent}#${tag}\n`;
    }

    if (description) result += `${innerIndent}description '${escapeString(description)}'\n`;
    if (technology) result += `${innerIndent}technology '${escapeString(technology)}'\n`;

    if (links) {
      for (const link of links) {
        if (link.label) {
          result += `${innerIndent}link ${link.url} '${escapeString(link.label)}'\n`;
        } else {
          result += `${innerIndent}link ${link.url}\n`;
        }
      }
    }

    if (style && Object.keys(style).length > 0) {
      result += `${innerIndent}style {\n`;
      if (style.line) result += `${innerIndent}  line ${style.line}\n`;
      if (style.color) result += `${innerIndent}  color ${style.color}\n`;
      if (style.head) result += `${innerIndent}  head ${style.head}\n`;
      if (style.tail) result += `${innerIndent}  tail ${style.tail}\n`;
      result += `${innerIndent}}\n`;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      result += `${innerIndent}metadata {\n`;
      for (const [key, val] of Object.entries(metadata)) {
        result += `${innerIndent}  ${key} '${escapeString(val)}'\n`;
      }
      result += `${innerIndent}}\n`;
    }

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
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Escape backslashes and single quotes for use inside LikeC4 single-quoted
 * string literals.  Note: the grammar does not support embedded newlines or
 * tab characters in string tokens; callers should strip or reject them before
 * calling this function.
 */
export function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Generate a `style { ... }` block for an element.
 *
 * @param style       - Style properties to emit
 * @param innerIndent - Leading whitespace for the `style {` line
 * @returns Complete style block string (including trailing newline)
 */
export function generateStyleBlock(style: ElementStyle, innerIndent: string): string {
  const styleIndent = innerIndent + '  ';
  let result = `${innerIndent}style {\n`;
  if (style.shape) result += `${styleIndent}shape ${style.shape}\n`;
  if (style.color) result += `${styleIndent}color ${style.color}\n`;
  if (style.icon) result += `${styleIndent}icon ${style.icon}\n`;
  if (style.opacity) result += `${styleIndent}opacity ${style.opacity}\n`;
  if (style.border) result += `${styleIndent}border ${style.border}\n`;
  if (style.multiple !== undefined) result += `${styleIndent}multiple ${style.multiple}\n`;
  if (style.size) result += `${styleIndent}size ${style.size}\n`;
  if (style.padding) result += `${styleIndent}padding ${style.padding}\n`;
  if (style.textSize) result += `${styleIndent}textSize ${style.textSize}\n`;
  if (style.iconPosition) result += `${styleIndent}iconPosition ${style.iconPosition}\n`;
  if (style.iconColor) result += `${styleIndent}iconColor ${style.iconColor}\n`;
  if (style.iconSize) result += `${styleIndent}iconSize ${style.iconSize}\n`;
  result += `${innerIndent}}\n`;
  return result;
}
