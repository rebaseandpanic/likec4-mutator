/**
 * Text-edit operations and checks that target views.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { ViewDeclaration, ViewIndex } from '../query/view-index.js';
import type { TextEdit } from './text-edit.js';
import type { GenerateViewOpts } from './codegen.js';
import { generateView } from './codegen.js';
import { blockInsertEdit, type BlockPlacement } from './block-placement.js';
import { InvalidWriteError } from './write-checks.js';

export type { GenerateViewOpts };

/**
 * Build the TextEdit that writes a new view at `placement` (see
 * `chooseBlockPlacement`): on its own lines at the end of the chosen `views`
 * block, or in a new `views { ... }` block at the end of the file.
 *
 * @param doc       - Parsed document of `placement.file`
 * @param placement - Where the view goes
 * @param opts      - Options for the new view
 * @returns TextEdit to insert the view
 */
export function addViewEdit(
  doc: ParsedDocument,
  placement: BlockPlacement,
  opts: Omit<GenerateViewOpts, 'indent'>,
): TextEdit {
  return blockInsertEdit('views', doc, placement, (indent) => generateView({ indent, ...opts }));
}

/** The view id written after `extends` in `view`; undefined when none. */
function extendsText(view: ViewDeclaration): string | undefined {
  return (view.node.extends as { view?: { $refText?: string } } | undefined)?.view?.$refText;
}

/**
 * The parent a new element view `id` may extend (D34, INV-9): `parentId`
 * must be declared once, as a named element view with a body (LikeC4 does
 * not turn a bodyless declaration into a view, and drops a child whose
 * parent is not an element view), and the parent's own `extends` chain must
 * not lead back to `id` — LikeC4 drops every view of an `extends` cycle,
 * and `validate()` does not report it.
 *
 * @param field - The option that holds `parentId`
 * @throws {InvalidWriteError} on `field`
 */
export function extendsParent(views: ViewIndex, id: string, parentId: string, field = 'extends'): ViewDeclaration {
  const declarations = views.declarationsOf(parentId);
  if (declarations.length === 0) {
    throw new InvalidWriteError(field, `no view '${parentId}' is declared in the loaded files`);
  }
  if (declarations.length > 1) {
    throw new InvalidWriteError(field, `view '${parentId}' is declared ${declarations.length} times; LikeC4 reports a duplicate view`);
  }
  const parent = declarations[0]!;
  if (parent.type !== 'element') {
    throw new InvalidWriteError(field, `'${parentId}' is a ${parent.type} view; a view can extend an element view only`);
  }
  if (!parent.body) {
    throw new InvalidWriteError(
      field,
      `view '${parentId}' is declared without a body, so LikeC4 does not make it a view and would drop the new view that extends it`,
    );
  }
  const seen = new Set<ViewDeclaration>();
  for (let current: ViewDeclaration | undefined = parent; current && !seen.has(current); ) {
    seen.add(current);
    const next = extendsText(current);
    if (next === undefined) break;
    if (next === id) {
      throw new InvalidWriteError(
        field,
        `view '${parentId}' extends '${id}'${current === parent ? '' : ` through '${current.id}'`}, so the new view would close an extends cycle, and LikeC4 drops every view of a cycle`,
      );
    }
    current = views.declarationsOf(next).find((d) => d.type === 'element');
  }
  return parent;
}
