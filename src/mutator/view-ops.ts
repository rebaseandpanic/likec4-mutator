/**
 * Text-edit operations that target the views block.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { TextEdit } from './text-edit.js';
import type { GenerateViewOpts } from './codegen.js';
import { generateView } from './codegen.js';
import { findClosingBraceOffset, insertionPointBeforeBrace } from './cst-helpers.js';

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

  const closingBrace = findClosingBraceOffset(views.$cstNode);
  const indent = '  ';

  const snippet = generateView({ indent, ...opts });
  const insertAt = insertionPointBeforeBrace(fullText, closingBrace);
  const braceLine = fullText.substring(insertAt, closingBrace + 1);
  const newText = '\n' + snippet + braceLine;

  return { offset: insertAt, end: closingBrace + 1, newText };
}
