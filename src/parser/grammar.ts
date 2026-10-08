/**
 * Questions about the LikeC4 grammar answered by the installed
 * `@likec4/language-server` itself (its lexer and grammar), so they cannot
 * drift from the parser that later reads the generated text.
 */
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
 * valid LikeC4 but would write more than the one include rule asked for.
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
