/**
 * Text-edit operations that target the views block.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { TextEdit } from './text-edit.js';
import type { GenerateViewOpts } from './codegen.js';
import { generateView } from './codegen.js';

export type { GenerateViewOpts };

/**
 * Build a TextEdit that inserts a new view inside the `views { }` block,
 * just before its closing `}`.
 *
 * @param doc  - Parsed document
 * @param opts - Options for the new view
 * @returns TextEdit to insert the view
 */
export function addViewEdit(doc: ParsedDocument, opts: Omit<GenerateViewOpts, 'indent'>): TextEdit {
  const { ast, fullText } = doc;

  const views = ast.views?.[0];
  if (!views?.$cstNode) {
    throw new Error('No views block found in document');
  }

  const viewsCst = views.$cstNode;
  const closingBrace = findClosingBrace(fullText, viewsCst.offset, viewsCst.end);
  const indent = '  ';

  const snippet = generateView({ indent, ...opts });
  const insertAt = insertionPointBeforeBrace(fullText, closingBrace);
  const braceLine = fullText.substring(insertAt, closingBrace + 1);
  const newText = '\n' + snippet + braceLine;

  return { offset: insertAt, end: closingBrace + 1, newText };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function findClosingBrace(fullText: string, _start: number, endExclusive: number): number {
  for (let i = endExclusive - 1; i >= _start; i--) {
    if (fullText[i] === '}') return i;
  }
  throw new Error('Could not find closing brace in views block');
}

function insertionPointBeforeBrace(fullText: string, closingBraceOffset: number): number {
  let i = closingBraceOffset - 1;
  while (i >= 0 && (fullText[i] === ' ' || fullText[i] === '\t')) {
    i--;
  }
  if (i >= 0 && fullText[i] === '\n') return i;
  return closingBraceOffset;
}
