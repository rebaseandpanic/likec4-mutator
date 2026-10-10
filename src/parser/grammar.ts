/**
 * Questions about the LikeC4 grammar answered by the installed
 * `@likec4/language-server` itself (its lexer and grammar), so they cannot
 * drift from the parser that later reads the generated text.
 */
import { Content as LibIcons } from '@likec4/language-server/likec4lib';
import { getServices } from './services.js';

/** Minimal structural view of the Langium grammar AST nodes walked below. */
interface GrammarNode {
  readonly $type: string;
  readonly value?: string;
  readonly name?: string;
  readonly rule?: { readonly ref?: GrammarNode };
  readonly definition?: GrammarNode;
  readonly terminal?: GrammarNode;
  readonly elements?: ReadonlyArray<GrammarNode>;
}

let idTokenTypes: ReadonlySet<string> | null = null;

/**
 * Token types the `Id` parser rule accepts: the `IdTerminal` terminal plus
 * every keyword reachable through its alternatives (e.g. `element`, `model`,
 * theme colors).  Any other keyword — `title`, `link`, `metadata`, ... — is
 * lexed as a keyword token and is not an `Id`.
 */
function getIdTokenTypes(): ReadonlySet<string> {
  if (idTokenTypes) return idTokenTypes;
  const grammar = getServices().likec4.Grammar as unknown as {
    rules: ReadonlyArray<GrammarNode>;
  };
  const idRule = grammar.rules.find((r) => r.$type === 'ParserRule' && r.name === 'Id');
  if (!idRule?.definition) {
    throw new Error('LikeC4 grammar has no Id parser rule');
  }
  const types = new Set<string>();
  const visitedRules = new Set<GrammarNode>([idRule]);
  const walk = (node: GrammarNode | undefined): void => {
    if (!node) return;
    if (node.$type === 'Keyword' && node.value !== undefined) {
      types.add(node.value);
      return;
    }
    if (node.$type === 'RuleCall') {
      const target = node.rule?.ref;
      if (!target || visitedRules.has(target)) return;
      visitedRules.add(target);
      if (target.$type === 'TerminalRule') {
        if (target.name !== undefined) types.add(target.name);
        return;
      }
      walk(target.definition);
      return;
    }
    walk(node.terminal);
    for (const child of node.elements ?? []) walk(child);
  };
  walk(idRule.definition);
  idTokenTypes = types;
  return types;
}

/**
 * Whether `name` is lexed as exactly one token that the grammar's `Id` rule
 * accepts — the form of a metadata attribute key (`MetadataAttribute:
 * key=Id ...`).
 *
 * Rejected, for example: `1abc` (lexed as a hex number), `-x`, `_`, `a b`,
 * `true` / `true-x` (the BOOLEAN terminal wins over identifiers) and keywords
 * outside the `Id` rule such as `title` or `metadata`.
 */
export function isLikeC4Id(name: string): boolean {
  const { tokens, errors, hidden } = getServices().likec4.parser.Lexer.tokenize(name);
  if (errors.length > 0 || (hidden?.length ?? 0) > 0 || tokens.length !== 1) return false;
  const [token] = tokens;
  return token!.image === name && getIdTokenTypes().has(token!.tokenType.name);
}

/** View kinds an `include` rule can be written for. */
export type IncludeViewType = 'element' | 'dynamic' | 'deployment';

const VIEW_KEYWORD: Record<IncludeViewType, string> = {
  element: 'view',
  dynamic: 'dynamic view',
  deployment: 'deployment view',
};

/** AST type of the `include` rule in the body of each view kind. */
const INCLUDE_RULE_TYPE: Record<IncludeViewType, string> = {
  element: 'ViewRulePredicate',
  dynamic: 'DynamicViewIncludePredicate',
  deployment: 'DeploymentViewRulePredicate',
};

/**
 * Whether `expression` — the text written after the `include` keyword — forms
 * exactly one `include` rule in the body of a view of `type`: it parses without
 * errors and adds no further rule, property, step, view or top-level block.
 * Comma-separated predicates (`a, b`) form one rule.  This guards against an
 * expression such as `* exclude x` or `*\n autoLayout LeftRight`, which is
 * valid LikeC4 but would write more than the one include rule asked for.  A
 * comment after the predicates (`* // every element`) is accepted: the rule is
 * written on a line of its own, so the comment ends with it.
 */
export function isSingleIncludeRule(expression: string, type: IncludeViewType): boolean {
  const source = `views {\n${VIEW_KEYWORD[type]} probe {\ninclude ${expression}\n}\n}\n`;
  const result = getServices().likec4.parser.LangiumParser.parse(source);
  if (result.parserErrors.length > 0 || result.lexerErrors.length > 0) return false;

  const document = result.value as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith('$') || key === 'views') continue;
    if (Array.isArray(value) && value.length > 0) return false;
  }
  const blocks = document.views as ReadonlyArray<{ views?: ReadonlyArray<unknown> }> | undefined;
  if (blocks?.length !== 1 || blocks[0]!.views?.length !== 1) return false;

  const view = blocks[0]!.views[0] as {
    body?: { rules?: ReadonlyArray<{ $type: string; isInclude?: boolean }>; props?: unknown[]; steps?: unknown[] };
  };
  const body = view.body;
  if (!body || (body.props?.length ?? 0) > 0 || (body.steps?.length ?? 0) > 0) return false;
  const rules = body.rules ?? [];
  if (rules.length !== 1) return false;
  const [rule] = rules;
  return rule!.$type === INCLUDE_RULE_TYPE[type] && rule!.isInclude !== false;
}

// ---------------------------------------------------------------------------
// Checks of write parameters (identifiers, references, style values, layout)
// ---------------------------------------------------------------------------

/**
 * Names LikeC4 rejects for an element, an element kind or a view although the
 * `Id` rule accepts them: `Reserved word: <name>` (language-server 1.59.4,
 * `src/validation/index.ts` `RESERVED_WORDS`, used by `checkElement`,
 * `checkElementKind` and `viewChecks`).  The list is not exported by the
 * package, so it is repeated here.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set(['this', 'it', 'self', 'super', 'likec4lib', 'global']);

/**
 * Whether `name` can be written as the name of an element or a view: one
 * `Id` token (see {@link isLikeC4Id}) that is not a reserved word.
 */
export function isDeclarableName(name: string): boolean {
  return isLikeC4Id(name) && !RESERVED_WORDS.has(name);
}

/**
 * Whether `reference` has the form of an element reference (`FqnRef`,
 * `ElementRef`): one or more `Id` tokens joined by dots without whitespace,
 * e.g. `app`, `app.api`, `this`.
 */
export function isReferenceForm(reference: string): boolean {
  return reference.split('.').every((segment) => isLikeC4Id(segment));
}

/**
 * Keywords of a datatype rule of the installed grammar, in grammar order —
 * e.g. `ElementShape` gives `rectangle`, `component`, `person`, ...  Rules it
 * calls are followed (`BorderStyleValue` includes `LineOptions`).
 */
export function grammarKeywords(ruleName: string): readonly string[] {
  const cached = keywordCache.get(ruleName);
  if (cached) return cached;
  const grammar = getServices().likec4.Grammar as unknown as { rules: ReadonlyArray<GrammarNode> };
  const rule = grammar.rules.find((r) => r.$type === 'ParserRule' && r.name === ruleName);
  if (!rule?.definition) throw new Error(`LikeC4 grammar has no parser rule ${ruleName}`);
  const keywords: string[] = [];
  const visited = new Set<GrammarNode>([rule]);
  const walk = (node: GrammarNode | undefined): void => {
    if (!node) return;
    if (node.$type === 'Keyword' && node.value !== undefined) {
      if (!keywords.includes(node.value)) keywords.push(node.value);
      return;
    }
    if (node.$type === 'RuleCall') {
      const target = node.rule?.ref;
      if (!target || visited.has(target) || target.$type !== 'ParserRule') return;
      visited.add(target);
      walk(target.definition);
      return;
    }
    walk(node.terminal);
    for (const child of node.elements ?? []) walk(child);
  };
  walk(rule.definition);
  keywordCache.set(ruleName, keywords);
  return keywords;
}
const keywordCache = new Map<string, readonly string[]>();

/** Parse `source` with the LikeC4 parser; undefined when it has errors. */
function parseClean(source: string): Record<string, unknown> | undefined {
  const result = getServices().likec4.parser.LangiumParser.parse(source);
  if (result.parserErrors.length > 0 || result.lexerErrors.length > 0) return undefined;
  return result.value as unknown as Record<string, unknown>;
}

/** True when `document` holds nothing but one non-empty array under `key`. */
function onlyBlock(document: Record<string, unknown>, key: string): boolean {
  for (const [k, value] of Object.entries(document)) {
    if (k.startsWith('$') || k === key) continue;
    if (Array.isArray(value) && value.length > 0) return false;
  }
  const blocks = document[key];
  return Array.isArray(blocks) && blocks.length === 1;
}

/** Arguments of an `autoLayout` rule, as parsed from a probe view. */
export interface AutoLayoutValue {
  direction: string;
  rankSep?: number;
  nodeSep?: number;
}

/**
 * The value of an `autoLayout` rule written as `value` (the text after the
 * keyword, e.g. `LeftRight` or `LeftRight 120 40`), or undefined when it is
 * not exactly one `autoLayout` rule of the grammar (`ViewRuleAutoLayout:
 * 'autoLayout' direction=ViewLayoutDirection (rankSep=Number
 * nodeSep=Number?)?`) — e.g. an unknown direction or anything after it.
 * A trailing comment is accepted: the directive is written on a line of its
 * own, so the comment ends with it.
 */
export function parseAutoLayout(value: string): AutoLayoutValue | undefined {
  const document = parseClean(`views {\nview probe {\nautoLayout ${value}\n}\n}\n`);
  if (!document || !onlyBlock(document, 'views')) return undefined;
  const views = (document.views as ReadonlyArray<{ views?: ReadonlyArray<unknown> }>)[0]!.views ?? [];
  if (views.length !== 1) return undefined;
  const body = (views[0] as { body?: { rules?: unknown[]; props?: unknown[] } }).body;
  if (!body || (body.props?.length ?? 0) > 0 || body.rules?.length !== 1) return undefined;
  const rule = body.rules[0] as { $type: string; direction?: string; rankSep?: number; nodeSep?: number };
  if (rule.$type !== 'ViewRuleAutoLayout' || rule.direction === undefined) return undefined;
  return {
    direction: rule.direction,
    ...(rule.rankSep !== undefined && { rankSep: rule.rankSep }),
    ...(rule.nodeSep !== undefined && { nodeSep: rule.nodeSep }),
  };
}

/** A style property as the grammar parses it (`StyleProperty`, `RelationshipStyleProperty`). */
export interface ParsedStyleProperty {
  /** AST type, e.g. `ColorProperty`, `ShapeProperty` */
  $type: string;
  /** Property keyword, e.g. `color`, `head` */
  key: string;
  /** Keyword / literal value (`ShapeProperty`, `OpacityProperty`, `IconProperty` URI or `none`, ...) */
  value?: unknown;
  /** Theme color of a `ColorRef` */
  themeColor?: string;
  /** Custom color reference of a `ColorRef` */
  customColor?: { $refText?: string };
  /** Library icon reference of an `IconProperty` */
  libicon?: { $refText?: string };
}

/**
 * Parse `key value` as the single property of a `style { ... }` block of an
 * element or a relationship.  Returns the property node, or undefined when the
 * text is not exactly one property with this key — e.g. a value the grammar
 * does not accept for the key, or a value followed by another property — or
 * when `value` is more than the value's tokens: a comment (`red // x`) or a
 * separator (`red;`).  Whitespace around the value is allowed.
 */
export function parseStyleProperty(
  target: 'element' | 'relationship',
  key: string,
  value: string,
): ParsedStyleProperty | undefined {
  const body = `{\nstyle {\n${key} ${value}\n}\n}`;
  const source = target === 'element' ? `model {\nprobe = probe ${body}\n}\n` : `model {\na -> b ${body}\n}\n`;
  const document = parseClean(source);
  if (!document || !onlyBlock(document, 'models')) return undefined;
  const items = (document.models as ReadonlyArray<{ elements?: ReadonlyArray<unknown> }>)[0]!.elements ?? [];
  if (items.length !== 1) return undefined;
  const owner = items[0] as {
    $type: string;
    body?: { props?: unknown[]; elements?: unknown[]; tags?: unknown };
  };
  if (owner.$type !== (target === 'element' ? 'Element' : 'Relation')) return undefined;
  const ownerBody = owner.body;
  if (!ownerBody || ownerBody.props?.length !== 1 || (ownerBody.elements?.length ?? 0) > 0 || ownerBody.tags) {
    return undefined;
  }
  const style = ownerBody.props[0] as { $type: string; props?: unknown[] };
  const styleType = target === 'element' ? 'ElementStyleProperty' : 'RelationStyleProperty';
  if (style.$type !== styleType || style.props?.length !== 1) return undefined;
  const property = style.props[0] as ParsedStyleProperty & { $cstNode?: CstNodeView };
  if (property.key !== key || !property.$cstNode) return undefined;
  // The value must be exactly the value's tokens: no comment (`red // x` would
  // comment out whatever follows the value on its line once written into an
  // existing style block) and no separator such as a trailing `;`.
  const valueStart = source.indexOf(`\n${key} ${value}\n`) + key.length + 2;
  const leaves = cstLeaves(property.$cstNode).filter((leaf) => leaf.offset >= valueStart);
  if (leaves.length === 0 || leaves.some((leaf) => leaf.hidden || leaf.text === ';')) return undefined;
  const span = source.slice(leaves[0]!.offset, leaves[leaves.length - 1]!.end);
  return span === value.trim() && !containsComment(value) ? property : undefined;
}

/** Minimal structural view of a Langium CST node. */
interface CstNodeView {
  readonly offset: number;
  readonly end: number;
  readonly text: string;
  readonly hidden?: boolean;
  readonly content?: ReadonlyArray<CstNodeView>;
}

/** The leaf nodes of `node` in source order, hidden ones (comments) included. */
function cstLeaves(node: CstNodeView): CstNodeView[] {
  if (!node.content) return [node];
  return node.content.flatMap((child) => cstLeaves(child));
}

/**
 * Whether the LikeC4 lexer reads a comment (`// ...` or `/* ... *\/`) in
 * `text`.  A `//` inside a token — a URI such as `https://host/path` or a
 * string — is not a comment.
 */
export function containsComment(text: string): boolean {
  const { hidden } = getServices().likec4.parser.Lexer.tokenize(text);
  return (hidden ?? []).length > 0;
}

/**
 * Whether an `include` expression of a deployment view uses `with { ... }`
 * (`FqnExprWith` / `RelationExprWith`).  LikeC4 documents that `with` does not
 * work in deployment views; it ignores such customizations there.
 */
export function deploymentIncludeUsesWith(expression: string): boolean {
  const document = parseClean(`views {\ndeployment view probe {\ninclude ${expression}\n}\n}\n`);
  if (!document) return false;
  let found = false;
  const walk = (node: unknown): void => {
    if (found || typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    // Only AST nodes are walked: a reference object would trigger linking.
    if (typeof record.$type !== 'string') return;
    if (record.$type === 'FqnExprWith' || record.$type === 'RelationExprWith') {
      found = true;
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('$')) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(document);
  return found;
}

let libraryIcons: ReadonlySet<string> | null = null;

/**
 * Names of the icons of LikeC4's built-in library (`tech:postgresql`,
 * `aws:lambda`, ...), read from the `likec4lib { icons { ... } }` document the
 * installed language server links library icon references against.
 */
export function libraryIconNames(): ReadonlySet<string> {
  if (libraryIcons) return libraryIcons;
  const document = getServices().likec4.parser.LangiumParser.parse(LibIcons).value as unknown as {
    likec4lib?: ReadonlyArray<{ icons?: ReadonlyArray<{ name?: string }> }>;
  };
  const names = new Set<string>();
  for (const lib of document.likec4lib ?? []) {
    for (const icon of lib.icons ?? []) if (icon.name) names.add(icon.name);
  }
  if (names.size === 0) throw new Error('LikeC4 built-in icon library is empty');
  libraryIcons = names;
  return names;
}
