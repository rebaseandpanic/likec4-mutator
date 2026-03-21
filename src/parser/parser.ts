import { getServices } from './services.js';
import type { ParsedDocument, ParseError } from './types.js';

export class C4Parser {
  /**
   * Parse a .c4 source string into AST + CST.
   * Synchronous — uses LangiumParser.parse() directly.
   */
  parse(source: string): ParsedDocument {
    const services = getServices();
    const parser = services.likec4.parser.LangiumParser;
    const result = parser.parse(source);

    const ast = result.value;
    const cst = (ast as any).$cstNode;
    const fullText = cst?.fullText ?? source;

    const errors: ParseError[] = [
      ...result.parserErrors.map((e: any) => ({
        message: e.message,
        line: e.token?.startLine ?? 0,
        column: e.token?.startColumn ?? 0,
        offset: e.token?.startOffset ?? 0,
        length: ((e.token?.endOffset ?? 0) - (e.token?.startOffset ?? 0)) + 1,
      })),
      ...result.lexerErrors.map((e: any) => ({
        message: e.message,
        line: e.line ?? 0,
        column: e.column ?? 0,
        offset: e.offset ?? 0,
        length: e.length ?? 0,
      })),
    ];

    return { ast, cst, fullText, errors };
  }
}
