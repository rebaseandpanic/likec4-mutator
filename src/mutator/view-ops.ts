/**
 * Text-edit operations that target the views block.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { TextEdit } from './text-edit.js';
import type { GenerateViewOpts } from './codegen.js';
import { generateView } from './codegen.js';
import { BodyInsertions } from './body-layout.js';
import { getNodeIndent } from './indent.js';

export type { GenerateViewOpts };

/**
 * Build a TextEdit that inserts a new view on its own lines at the end of
 * the first `views { }` block.
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

  const inserts = BodyInsertions.forBlock(views.$cstNode, fullText, getNodeIndent(views, fullText));
  inserts.append(generateView({ indent: inserts.innerIndent, ...opts }) + '\n');
  const [edit] = inserts.apply([]);
  if (!edit) throw new Error('internal: no edit for the new view');
  return edit;
}
