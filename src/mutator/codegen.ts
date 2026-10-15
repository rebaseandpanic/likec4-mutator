/**
 * DSL code generation helpers.
 *
 * Each function produces a snippet of LikeC4 source text that can be spliced
 * into a document via a TextEdit.  The caller is responsible for supplying the
 * correct indentation strings.
 */
import { isLikeC4Id, isSingleIncludeRule, type IncludeViewType } from '../parser/grammar.js';

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
  /**
   * Optional metadata key/value pairs — emitted as a `metadata { ... }` block.
   *
   * Each value may be a single string (emitted as `key 'value'`) or an array of
   * strings (emitted as `key ['v1', 'v2']`).  Empty arrays are not allowed by
   * the LikeC4 grammar — supplying one will throw at codegen time.
   */
  metadata?: Record<string, string | string[]>;
}

/**
 * Generate a LikeC4 element declaration snippet.
 *
 * If no body properties are required the element is emitted on a single line.
 * Otherwise a `{ ... }` block is produced with the appropriate inner indent.
 */
export function generateElement(opts: GenerateElementOpts): string {
  const { indent, name, kind, title, summary, description, technology, tags, links, style, metadata } = opts;

  let result = `${indent}${name} = ${kind}`;
  if (title) result += ` '${escapeTitle(title)}'`;
  result += generateBody(indent, {
    tags,
    strings: [
      ['summary', summary],
      ['description', description],
      ['technology', technology],
    ],
    links,
    style: style && Object.keys(style).length > 0 ? generateStyleBlock(style, indent + '  ') : '',
    metadata,
  });
  return result;
}

/** The parts of a declaration body, in the order they are written. */
export interface BodyParts {
  /** Tags, each written on its own line with a `#` prefix (first, as the grammar requires) */
  tags?: string[];
  /** String properties `[key, value]`, each written when the value is non-empty */
  strings?: Array<[key: string, value: string | undefined]>;
  /** Hyperlinks, each a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** A complete `style { ... }` block (see {@link generateStyleBlock}), or '' for none */
  style?: string;
  /** Metadata, written as a `metadata { ... }` block (see {@link generateMetadataBlock}) */
  metadata?: Record<string, string | string[]>;
}

/**
 * The `{ ... }` body of a declaration whose line is indented by `indent`:
 * ` {`, the parts one level deeper (tags, string properties, links, style,
 * metadata) and `}` at `indent`.  Returns '' when no part has content, so the
 * declaration stays a single line.
 */
export function generateBody(indent: string, parts: BodyParts): string {
  const { tags, strings = [], links, style = '', metadata } = parts;
  const innerIndent = indent + '  ';
  const writtenStrings = strings.filter((entry): entry is [string, string] => !!entry[1]);
  const hasBody =
    (tags !== undefined && tags.length > 0) ||
    writtenStrings.length > 0 ||
    (links !== undefined && links.length > 0) ||
    style !== '' ||
    (metadata !== undefined && Object.keys(metadata).length > 0);
  if (!hasBody) return '';

  let result = ' {\n';
  for (const tag of tags ?? []) {
    result += `${innerIndent}${formatTag(tag)}\n`;
  }
  for (const [key, value] of writtenStrings) {
    result += `${innerIndent}${key} '${escapeString(value)}'\n`;
  }
  for (const lnk of links ?? []) {
    if (lnk.label) {
      result += `${innerIndent}link ${formatLinkUrl(lnk.url)} '${escapeString(lnk.label)}'\n`;
    } else {
      result += `${innerIndent}link ${formatLinkUrl(lnk.url)}\n`;
    }
  }
  result += style;
  if (metadata && Object.keys(metadata).length > 0) {
    result += generateMetadataBlock(metadata, innerIndent);
  }
  result += `${indent}}`;
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
  /**
   * Optional metadata key/value pairs — emitted as a `metadata { ... }` block.
   *
   * Each value may be a single string (emitted as `key 'value'`) or an array of
   * strings (emitted as `key ['v1', 'v2']`).  Empty arrays are not allowed by
   * the LikeC4 grammar — supplying one will throw at codegen time.
   */
  metadata?: Record<string, string | string[]>;
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

  let result = `${indent}${source} -> ${target}`;
  if (label) result += ` '${escapeString(label)}'`;
  result += generateBody(indent, {
    tags,
    strings: [
      ['description', description],
      ['technology', technology],
    ],
    links,
    style: style && Object.keys(style).length > 0 ? generateRelationshipStyleBlock(style, indent + '  ') : '',
    metadata,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Deployment generation
// ---------------------------------------------------------------------------

/** Options shared by deployment nodes and deployed instances. */
interface DeploymentElementOpts {
  /** Leading whitespace for the declaration line */
  indent: string;
  /** Inline title; written whenever defined, `''` included */
  title?: string;
  /** Body summary */
  summary?: string;
  /** Body description */
  description?: string;
  /** Body technology (the grammar has no inline technology for nodes and instances) */
  technology?: string;
  /** Tags — each tag name is prefixed with `#` in the output */
  tags?: string[];
  /** Hyperlinks — each becomes a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** Visual style — emitted as a `style { ... }` block */
  style?: ElementStyle;
  /** Metadata key/value pairs — emitted as a `metadata { ... }` block (see {@link GenerateElementOpts.metadata}) */
  metadata?: Record<string, string | string[]>;
}

export interface GenerateDeploymentNodeOpts extends DeploymentElementOpts {
  /** Node name (one identifier, not the id) */
  name: string;
  /** Deployment node kind, e.g. 'vm' */
  kind: string;
}

export interface GenerateDeployedInstanceOpts extends DeploymentElementOpts {
  /** Element reference as written after `instanceOf`, e.g. 'app.api' */
  element: string;
  /** Instance name; omitted for an unnamed instance (its name is the last segment of `element`) */
  name?: string;
}

/** The inline title and body of a deployment node or instance declaration. */
function deploymentElementTail(opts: DeploymentElementOpts): string {
  const { indent, title, summary, description, technology, tags, links, style, metadata } = opts;
  let result = title === undefined ? '' : ` '${escapeString(title)}'`;
  result += generateBody(indent, {
    tags,
    strings: [
      ['summary', summary],
      ['description', description],
      ['technology', technology],
    ],
    links,
    style: style && Object.keys(style).length > 0 ? generateStyleBlock(style, indent + '  ') : '',
    metadata,
  });
  return result;
}

/**
 * Generate a deployment node declaration in the `name = kind` form:
 * `prod = vm 'Production' { ... }`.  The title is written inline whenever it
 * is defined (an empty title is kept as `''`); summary, description and
 * technology go into the body.
 */
export function generateDeploymentNode(opts: GenerateDeploymentNodeOpts): string {
  return `${opts.indent}${opts.name} = ${opts.kind}${deploymentElementTail(opts)}`;
}

/**
 * Generate a deployed instance declaration: `api = instanceOf app.api 'API'
 * { ... }`, or `instanceOf app.api ...` without a name.  Title, body and
 * strings as for {@link generateDeploymentNode}.
 */
export function generateDeployedInstance(opts: GenerateDeployedInstanceOpts): string {
  const name = opts.name === undefined ? '' : `${opts.name} = `;
  return `${opts.indent}${name}instanceOf ${opts.element}${deploymentElementTail(opts)}`;
}

export interface GenerateDeploymentRelationshipOpts {
  /** Leading whitespace for the relationship line */
  indent: string;
  /** Source endpoint as written, e.g. 'prod.api' */
  source: string;
  /** Target endpoint as written */
  target: string;
  /** Relationship kind, written as `-[kind]->` */
  kind?: string;
  /** Written as `<->` (or `-[kind]<->`) */
  bidirectional?: boolean;
  /** Inline title; written whenever defined, `''` included */
  title?: string;
  /** Body description (never inline: LikeC4 ignores an inline one) */
  description?: string;
  /** Body technology (never inline: LikeC4 ignores an inline one) */
  technology?: string;
  /** Tags — written first in the body */
  tags?: string[];
  /** Hyperlinks — each becomes a `link <url> ['label']` statement */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata key/value pairs — emitted as a `metadata { ... }` block */
  metadata?: Record<string, string | string[]>;
  /** Visual style — emitted as a `style { ... }` block */
  style?: RelationshipStyle;
}

/**
 * Generate a deployment relationship: `source -> target 'title' { ... }` with
 * the connector `->`, `<->`, `-[kind]->` or `-[kind]<->`.  Description and
 * technology are written in the body only: LikeC4 parses the inline forms on
 * a deployment relation but ignores them.
 */
export function generateDeploymentRelationship(opts: GenerateDeploymentRelationshipOpts): string {
  const { indent, source, target, kind, bidirectional, title, description, technology, tags, links, metadata, style } =
    opts;
  const arrow = bidirectional ? '<->' : '->';
  const connector = kind === undefined ? arrow : `-[${kind}]${arrow}`;
  let result = `${indent}${source} ${connector} ${target}`;
  if (title !== undefined) result += ` '${escapeString(title)}'`;
  result += generateBody(indent, {
    tags,
    strings: [
      ['description', description],
      ['technology', technology],
    ],
    links,
    style: style && Object.keys(style).length > 0 ? generateRelationshipStyleBlock(style, indent + '  ') : '',
    metadata,
  });
  return result;
}

export interface GenerateDeploymentExtendOpts {
  /** Leading whitespace for the `extend` line */
  indent: string;
  /** Id of the extended node, written as its path, e.g. 'prod.eu' */
  node: string;
  /** Tags contributed to the node */
  tags?: string[];
  /** Links contributed to the node */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata contributed to the node */
  metadata?: Record<string, string | string[]>;
}

/**
 * Generate an `extend <node> { ... }` block.  Only tags, links and metadata
 * are written: the grammar allows no string or style properties in an
 * `extend` body.
 */
export function generateDeploymentExtend(opts: GenerateDeploymentExtendOpts): string {
  const { indent, node, tags, links, metadata } = opts;
  const body = generateBody(indent, { tags, links, metadata });
  return `${indent}extend ${node}${body === '' ? ' {\n' + indent + '}' : body}`;
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
  /** For element views: the id of the element view this one extends (written `extends <id>`) */
  extends?: string;
  /** Optional view title */
  title?: string;
  /** Optional view description, written after the title */
  description?: string;
  /**
   * Optional include rules, one `include` statement per item.  An item is the
   * part after the keyword: one or more comma-separated predicates (`'*'`,
   * `'app.api'`, `'app.*, app -> db'`).  One leading `include` keyword is
   * accepted and stripped (`'include *'` writes `include *`), see
   * {@link viewIncludeExpression}.
   */
  includes?: string[];
  /**
   * Layout algorithm directive.  Defaults to `'TopBottom'`.
   * Pass an empty string or `null`/`undefined` to suppress the directive entirely.
   */
  autoLayout?: string | null;
}

/**
 * The predicates of one view `include` rule given as `item`: trimmed, with one
 * leading `include` keyword (followed by whitespace or nothing) removed, so
 * that both `'*'` and `'include *'` give `'*'`.  Returns `undefined` when
 * nothing remains (an empty item or a bare `include`), and — when `type` is
 * given — when the predicates do not form exactly one `include` rule of a view
 * of that type (a parse error, or a further rule, property or view such as
 * `'* exclude x'`; see {@link isSingleIncludeRule}).
 */
export function viewIncludeExpression(item: string, type?: IncludeViewType): string | undefined {
  const expression = item
    .trim()
    .replace(/^include(?=\s|$)/, '')
    .trim();
  if (expression === '') return undefined;
  if (type !== undefined && !isSingleIncludeRule(expression, type)) return undefined;
  return expression;
}

/**
 * Generate a LikeC4 view declaration snippet.  By default an
 * `autoLayout TopBottom` directive is included; pass `autoLayout: ''`
 * to suppress it.
 *
 * @throws {Error} when an `includes` item is empty, a bare `include` keyword,
 *   or not exactly one include rule of the view (see {@link viewIncludeExpression}),
 *   and when both `target` and `extends` are given
 */
export function generateView(opts: GenerateViewOpts): string {
  const { indent, id, type, target, title, description, includes, autoLayout = 'TopBottom' } = opts;
  const innerIndent = indent + '  ';

  const expressions = includes?.map((item, i) => {
    const expression = viewIncludeExpression(item, type);
    if (expression === undefined) {
      throw new Error(
        `View '${id}': includes[${i}] is not exactly one include rule (got ${JSON.stringify(item)})`,
      );
    }
    return expression;
  });

  // Element views without explicit includes default to `include *` so that the
  // generated view is never empty — all real LikeC4 element views use this.
  const effectiveIncludes =
    expressions && expressions.length > 0 ? expressions : type === 'element' ? ['*'] : undefined;

  if (target && opts.extends) {
    throw new Error(`View '${id}': a view cannot have both 'of' and 'extends'`);
  }
  let header: string;
  if (type === 'element' && target) {
    header = `${indent}view ${id} of ${target}`;
  } else if (type === 'element' && opts.extends) {
    header = `${indent}view ${id} extends ${opts.extends}`;
  } else if (type === 'dynamic') {
    header = `${indent}dynamic view ${id}`;
  } else if (type === 'deployment') {
    header = `${indent}deployment view ${id}`;
  } else {
    header = `${indent}view ${id}`;
  }

  let result = header + ' {\n';
  // Title must be declared inside the body (not inline) per the LikeC4 grammar.
  if (title) result += `${innerIndent}title '${escapeTitle(title)}'\n`;
  if (description) result += `${innerIndent}description '${escapeString(description)}'\n`;
  if (effectiveIncludes) {
    for (const inc of effectiveIncludes) {
      result += `${innerIndent}include ${inc}\n`;
    }
  }
  if (autoLayout) result += `${innerIndent}autoLayout ${autoLayout}\n`;
  result += `${indent}}`;

  return result;
}

/**
 * A view rule line: `<kind> <expression>` at `indent`, the expression written
 * as given (checked by `checkViewRule` before it is written).
 */
export function generateViewRule(indent: string, rule: { kind: 'include' | 'exclude'; expression: string }): string {
  return `${indent}${rule.kind} ${rule.expression}`;
}

export interface GenerateStepOpts {
  /** Leading whitespace for the step line */
  indent: string;
  /** The element the interaction goes from, as written (LikeC4's sense, D36) */
  source: string;
  /** The element the interaction goes to, as written */
  target: string;
  /** `backward` is written `target <- source` (D36); default `forward` */
  direction?: 'forward' | 'backward';
  /** Relationship kind; a forward step only (D38) */
  kind?: string;
  /** How the kind is written: `-[kind]->` (`bracket`, default) or `.kind` (`dot`) */
  kindForm?: 'bracket' | 'dot';
  /** Title written after the target */
  title?: string;
  /** Body strings, written when non-empty */
  description?: string;
  technology?: string;
  notes?: string;
  /** Id of a dynamic view */
  navigateTo?: string;
  /** `color`, `line`, `head`, `tail`, written directly in the step body */
  style?: RelationshipStyle;
}

/**
 * Generate a single dynamic view step:
 * ```
 * source -> target 'title' {
 *   description '…'
 *   technology '…'
 *   notes '…'
 *   navigateTo other
 *   color red
 * }
 * ```
 * A forward step is `source -> target`, `source -[kind]-> target` or
 * `source .kind target`; a backward step is `target <- source`.  The body
 * is written only when a body field has a value.
 *
 * @throws {Error} for a backward step with a kind (D38): the grammar has no
 *   connector for both
 */
export function generateStep(opts: GenerateStepOpts): string {
  const { indent, source, target, direction = 'forward', kind, kindForm = 'bracket', title, style } = opts;
  if (direction === 'backward' && kind) {
    throw new Error(`A backward step cannot have a relationship kind (got '${kind}'): LikeC4 has no connector for both`);
  }
  let result: string;
  if (direction === 'backward') result = `${indent}${target} <- ${source}`;
  else if (!kind) result = `${indent}${source} -> ${target}`;
  else if (kindForm === 'dot') result = `${indent}${source} .${kind} ${target}`;
  else result = `${indent}${source} -[${kind}]-> ${target}`;
  if (title !== undefined) result += ` '${escapeString(title)}'`;

  const innerIndent = indent + '  ';
  const lines: string[] = [];
  for (const key of ['description', 'technology', 'notes'] as const) {
    const value = opts[key];
    if (value) lines.push(`${innerIndent}${key} '${escapeString(value)}'\n`);
  }
  if (opts.navigateTo) lines.push(`${innerIndent}navigateTo ${opts.navigateTo}\n`);
  for (const [key, value] of style ? relationshipStyleEntries(style) : []) lines.push(`${innerIndent}${key} ${value}\n`);
  if (lines.length > 0) result += ` {\n${lines.join('')}${indent}}`;
  return result;
}

/**
 * Generate a `par` block holding `statements` (D40: at least one).  Each
 * statement text starts with its first token and has its further lines
 * indented relative to that first line; every line is indented one level
 * deeper than `indent` (empty lines stay empty).  Lines are joined with
 * `\n`; the mutator writes the file's line ending.
 *
 * @throws {Error} when `statements` is empty: LikeC4 drops an empty block
 */
export function generateParallel(indent: string, statements: readonly string[]): string {
  if (statements.length === 0) throw new Error('A par block needs at least one statement: LikeC4 drops an empty block');
  const innerIndent = indent + '  ';
  const body = statements
    .flatMap((statement) => statement.split(LINE_BREAK))
    .map((line) => (line === '' ? '' : innerIndent + line))
    .join('\n');
  return `${indent}par {\n${body}\n${indent}}`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A line break in a value given by the caller: `\r\n`, `\n` or `\r`. */
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Escape backslashes and single quotes for use inside LikeC4 single-quoted
 * string literals.  Line breaks (`\r\n`, `\n`, `\r`) and tab characters are
 * replaced with a space: these values are written as single-line strings.
 */
export function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|[\r\n\t]/g, ' ');
}

/**
 * Escape a view or element title for a LikeC4 single-quoted string, like
 * {@link escapeString} except that `\/` is written as is.
 *
 * In a title, `/` separates view folders and `\/` is a literal slash
 * (LikeC4 docs, "Organize views"); LikeC4 reads a title's `\/` from the
 * source text unchanged (`unescapeKeepingSlash`), so a title value takes
 * that notation: `'Cost \/ Benefit'` is one title, `'Deployment / Prod'` the
 * view `Prod` in the folder `Deployment`.  Every other backslash is escaped,
 * so the title LikeC4 reads is exactly the value given.
 */
export function escapeTitle(s: string): string {
  return s.replace(/\\(?!\/)/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|[\r\n\t]/g, ' ');
}

/**
 * A metadata string value as LikeC4 source text.  A value without line
 * breaks is a single-quoted string (see {@link escapeString}).  A value with
 * line breaks is a Markdown string (see {@link formatMarkdownString}), so its
 * lines reach LikeC4's model unchanged.
 *
 * @param indent - Indentation of the line the value starts on
 */
export function formatMetadataString(value: string, indent: string): string {
  return LINE_BREAK.test(value) ? formatMarkdownString(value, indent) : `'${escapeString(value)}'`;
}

/**
 * A multi-line value as a LikeC4 Markdown string: three single quotes ending
 * the current line, every line of the value on its own line one level deeper
 * than `indent` (empty lines stay empty), and the closing three quotes on a
 * line of their own at `indent`:
 *
 * ```
 * manifest '''
 *   apiVersion: v1
 *   kind: Deployment
 * '''
 * ```
 *
 * LikeC4 reads a Markdown string's content with Langium's string escapes
 * (so `\` is written `\\`) and ends it at the first three quotes in a row
 * (so a `'` followed by another `'` is written `\'`); then, like every
 * metadata value, it removes the indentation its lines have in common and
 * trims it (`removeIndent`).  The added indentation is therefore removed
 * again, and the value reads back as given when it has no leading or
 * trailing whitespace and its non-empty lines do not all start with
 * whitespace.  Lines are joined with `\n`; the mutator writes the file's
 * line ending.
 */
export function formatMarkdownString(value: string, indent: string): string {
  const lineIndent = indent + '  ';
  const lines = value
    .split(LINE_BREAK)
    .map((line) => (line === '' ? '' : lineIndent + line.replace(/\\/g, '\\\\').replace(/'(?=')/g, "\\'")));
  const quotes = "'''";
  return `${quotes}\n${lines.join('\n')}\n${indent}${quotes}`;
}

/**
 * Format a tag reference as `#name`.  One leading `#` supplied by the caller is
 * stripped (so both `'ok'` and `'#ok'` produce `#ok`).
 *
 * @throws {Error} when the name is not lexed as one token the `Id` rule
 *   accepts — it would otherwise not form a tag and could leak into the model
 */
export function formatTag(tag: string): string {
  const name = tag.startsWith('#') ? tag.slice(1) : tag;
  // `TagRef` is `#` followed by the grammar's `Id` rule — the same rule a tag
  // is declared with in `specification`.
  if (!isLikeC4Id(name)) {
    throw new Error(
      `Invalid tag ${JSON.stringify(tag)}: a tag name must be a single LikeC4 identifier (letters, digits, '_' or '-', not starting with a digit or '-', and not a reserved keyword such as true, false or title)`,
    );
  }
  return `#${name}`;
}

/**
 * The LikeC4 `Uri` rule: a link URL is emitted unquoted and must form exactly
 * one of these terminal tokens.
 */
const LINK_URI_TERMINALS = [
  /^\w+:\/{2}\S+$/, // URI_WITH_SCHEMA  e.g. https://host/path, ssh://host
  /^\.{0,2}\/[^/]\S+$/, // URI_RELATIVE  e.g. ../src/index.ts, /docs/readme.md
  /^@[a-zA-Z0-9_-]*\/\S+$/, // URI_ALIAS   e.g. @alias/path
];

/**
 * Whether `url` can be written as an unquoted `link` token: one of the LikeC4
 * URI forms (`scheme://…`, `/…`, `./…`, `../…`, `@alias/…`) without
 * whitespace.
 */
export function isLinkUrl(url: string): boolean {
  return !/\s/.test(url) && LINK_URI_TERMINALS.some((re) => re.test(url));
}

/**
 * Validate a link URL for emission as an unquoted `link` token and return it
 * unchanged.
 *
 * @throws {Error} when the URL contains whitespace or does not match one of
 *   the LikeC4 URI forms (`scheme://…`, `/…`, `./…`, `../…`, `@alias/…`) —
 *   it would otherwise not be a single token and its tail would become part
 *   of the model
 */
export function formatLinkUrl(url: string): string {
  if (!isLinkUrl(url)) {
    throw new Error(
      `Invalid link URL ${JSON.stringify(url)}: expected 'scheme://…', a relative path ('/…', './…', '../…') or '@alias/…' without whitespace`,
    );
  }
  return url;
}

/**
 * Validate a metadata key for emission as the key of a `metadata { ... }`
 * attribute and return it unchanged.  The grammar rule is
 * `MetadataAttribute: key=Id ...`, so the key must be lexed by LikeC4 as one
 * token the `Id` rule accepts (see {@link isLikeC4Id}).
 *
 * @throws {Error} when the key is not such a token — e.g. `1abc`, `-x`,
 *   `true`, or a keyword such as `title` — since the generated block would
 *   otherwise not parse
 */
export function validateMetadataKey(key: string): string {
  if (!isLikeC4Id(key)) {
    throw new Error(
      `Invalid metadata key ${JSON.stringify(key)}: a metadata key must be a LikeC4 identifier — start with a letter (or underscores followed by a letter or digit), contain only letters, digits, '_' or '-', not begin with the keyword true or false, and not be a reserved keyword such as 'title' or 'metadata'`,
    );
  }
  return key;
}

/**
 * Format a single metadata value (string or string-array) for emission inside
 * a `metadata { ... }` block.  Returns just the right-hand-side text — i.e.
 * everything after the key, but excluding the leading space and trailing
 * newline.
 *
 * - Scalar string: emitted as `'value'` (escaped), or as a Markdown string
 *   when it has line breaks (see {@link formatMetadataString}); so is every
 *   array item.
 * - One-element array: emitted inline as `['value']`.
 * - Multi-element array: emitted as a multi-line bracket list.
 * - Empty array: throws.  The LikeC4 grammar does not accept `[]`.
 *
 * @param value       - Scalar string or array of strings
 * @param innerIndent - Indent of the line on which the `key` token sits
 *                      (used to align the multi-line array form one level deeper).
 */
export function formatMetadataValue(value: string | string[], innerIndent: string): string {
  if (typeof value === 'string') {
    return formatMetadataString(value, innerIndent);
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid metadata value: expected string or string[], got ${typeof value}`,
    );
  }
  if (value.length === 0) {
    throw new Error('empty array not allowed by LikeC4 grammar');
  }
  if (value.length === 1) {
    return `[${formatMetadataString(value[0], innerIndent)}]`;
  }
  // Multi-line: each entry on its own line, no trailing comma after the last.
  const itemIndent = innerIndent + '  ';
  const items = value.map((v) => `${itemIndent}${formatMetadataString(v, itemIndent)}`).join(',\n');
  return `[\n${items}\n${innerIndent}]`;
}

/**
 * Generate a complete `metadata { ... }` block for an element or relation,
 * including the leading indent and trailing newline.  Empty objects produce
 * an empty string (no block emitted).
 *
 * @param metadata    - Map of key → string | string[]
 * @param innerIndent - Leading whitespace for the `metadata {` line
 * @returns Block text (with trailing newline) or '' when metadata is empty
 */
export function generateMetadataBlock(
  metadata: Record<string, string | string[]>,
  innerIndent: string,
): string {
  if (Object.keys(metadata).length === 0) return '';
  const entryIndent = innerIndent + '  ';
  let block = `${innerIndent}metadata {\n`;
  for (const [key, value] of Object.entries(metadata)) {
    const formatted = formatMetadataValue(value, entryIndent);
    block += `${entryIndent}${validateMetadataKey(key)} ${formatted}\n`;
  }
  block += `${innerIndent}}\n`;
  return block;
}

/** Element style fields in the order they are written. */
const ELEMENT_STYLE_KEYS = [
  'shape',
  'color',
  'icon',
  'opacity',
  'border',
  'multiple',
  'size',
  'padding',
  'textSize',
  'iconPosition',
  'iconColor',
  'iconSize',
] as const satisfies ReadonlyArray<keyof ElementStyle>;

/** Relationship style fields in the order they are written. */
const RELATIONSHIP_STYLE_KEYS = ['line', 'color', 'head', 'tail'] as const satisfies ReadonlyArray<
  keyof RelationshipStyle
>;

/**
 * The `[key, value text]` pairs of a style, in the order they are written.
 * A string field is written when non-empty (an empty string makes no sense
 * as a style value and is treated as unset); a boolean field whenever it is
 * defined.
 */
function styleEntries<S extends object>(style: S, keys: ReadonlyArray<keyof S & string>): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const key of keys) {
    const value: unknown = style[key];
    if (typeof value === 'boolean' || (typeof value === 'string' && value !== '')) entries.push([key, String(value)]);
  }
  return entries;
}

/** The `[key, value text]` pairs of an element style, in the order they are written. */
export function elementStyleEntries(style: ElementStyle): Array<[string, string]> {
  return styleEntries(style, ELEMENT_STYLE_KEYS);
}

/** The `[key, value text]` pairs of a relationship style, in the order they are written. */
export function relationshipStyleEntries(style: RelationshipStyle): Array<[string, string]> {
  return styleEntries(style, RELATIONSHIP_STYLE_KEYS);
}

/** A `style { ... }` block holding `entries`, with trailing newline. */
function styleBlock(entries: Array<[string, string]>, innerIndent: string): string {
  const styleIndent = innerIndent + '  ';
  return (
    `${innerIndent}style {\n` +
    entries.map(([key, value]) => `${styleIndent}${key} ${value}\n`).join('') +
    `${innerIndent}}\n`
  );
}

/**
 * Generate a `style { ... }` block for an element.
 *
 * @param style       - Style properties to emit
 * @param innerIndent - Leading whitespace for the `style {` line
 * @returns Complete style block string (including trailing newline)
 */
export function generateStyleBlock(style: ElementStyle, innerIndent: string): string {
  return styleBlock(elementStyleEntries(style), innerIndent);
}

/**
 * Generate a `style { ... }` block for a relationship.
 *
 * @param style       - Style properties to emit
 * @param innerIndent - Leading whitespace for the `style {` line
 * @returns Complete style block string (including trailing newline)
 */
export function generateRelationshipStyleBlock(
  style: RelationshipStyle,
  innerIndent: string,
): string {
  return styleBlock(relationshipStyleEntries(style), innerIndent);
}
