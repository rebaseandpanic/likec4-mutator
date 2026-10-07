/**
 * Structural brace-balance check based on the LikeC4 lexer.
 */
import { getServices } from '../parser/services.js';

/**
 * Check that `{` and `}` tokens are balanced in `source`.
 *
 * The source is tokenized with the lexer of the LikeC4 grammar itself, so
 * only real brace tokens are counted: braces inside line and block comments,
 * string literals (including triple-quoted markdown strings) and unquoted
 * URIs are part of other tokens and are ignored exactly as the parser
 * ignores them.
 *
 * @returns An error message string when braces are unbalanced, or null when they match.
 */
export function checkBraceBalance(source: string): string | null {
  const { tokens } = getServices().likec4.parser.Lexer.tokenize(source);
  let depth = 0;
  for (const token of tokens) {
    const name = token.tokenType.name;
    if (name === '{') {
      depth++;
    } else if (name === '}') {
      depth--;
      if (depth < 0) {
        return `Brace imbalance: unexpected '}' at offset ${token.startOffset}`;
      }
    }
  }
  if (depth !== 0) {
    return `Brace imbalance: ${depth} unclosed '{' brace(s)`;
  }
  return null;
}
