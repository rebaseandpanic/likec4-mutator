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
