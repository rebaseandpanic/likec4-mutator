/**
 * Text-edit operations and checks that target views.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { ViewAstNode, ViewDeclaration, ViewIndex } from '../query/view-index.js';
import type { TextEdit } from './text-edit.js';
import type { GenerateViewOpts } from './codegen.js';
import { escapeString, escapeTitle, formatLinkUrl, formatTag, generateView } from './codegen.js';
import { blockInsertEdit, type BlockPlacement } from './block-placement.js';
import { BodyInsertions } from './body-layout.js';
import { buildRemovalEdit, buildReplaceLinksEdit, buildReplaceTagsInPlaceEdit, type BodyOwnerNode } from './cst-helpers.js';
import { getNodeIndent } from './indent.js';
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

/**
 * Patch of `LikeC4Mutator.updateView` (D33): `title` and `description`
 * replace the view's own value (`null` removes it, `''` is written as an
 * empty string); `tags` and `links` replace the whole list; `autoLayout`
 * replaces the effective (last) `autoLayout` rule, or is appended as the
 * last rule, and `null` removes every `autoLayout` rule.
 */
export interface UpdateViewPatch {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  autoLayout?: string | null;
}

/** The text of a view string property. */
function viewStringProperty(key: 'title' | 'description', value: string): string {
  return `${key} '${key === 'title' ? escapeTitle(value) : escapeString(value)}'`;
}

/**
 * The edits that apply `patch` (checked by the caller) to the declaration
 * `view` in `doc`.  Properties go where the grammar puts them: tags open the
 * body, other properties follow the tags and precede the first rule or step
 * (FOR-PLAN 2); a declaration without a body gets one.  Text outside the
 * replaced values is kept.
 */
export function updateViewEdits(doc: ParsedDocument, view: ViewDeclaration, patch: UpdateViewPatch): TextEdit[] {
  const { fullText } = doc;
  const indent = getNodeIndent(view.node, fullText);
  const body = view.body as (ViewAstNode & { props?: ViewAstNode[]; tags?: ViewAstNode }) | undefined;

  if (!body) {
    const inner = indent + '  ';
    const lines = [
      ...(patch.tags ?? []).map((tag) => `${inner}${formatTag(tag)}\n`),
      ...(['title', 'description'] as const).flatMap((key) => {
        const value = patch[key];
        return typeof value === 'string' ? [`${inner}${viewStringProperty(key, value)}\n`] : [];
      }),
      ...(patch.links ?? []).map(
        (link) => `${inner}link ${formatLinkUrl(link.url)}${link.label ? ` '${escapeString(link.label)}'` : ''}\n`,
      ),
      ...(typeof patch.autoLayout === 'string' ? [`${inner}autoLayout ${patch.autoLayout}\n`] : []),
    ];
    const end = view.node.$cstNode?.end;
    if (lines.length === 0 || end === undefined) return [];
    return [{ offset: end, end, newText: ` {\n${lines.join('')}${indent}}` }];
  }

  const inserts = BodyInsertions.forViewBody(body as Parameters<typeof BodyInsertions.forViewBody>[0], fullText, indent);
  const edits: TextEdit[] = [];
  const removal = (node: ViewAstNode): TextEdit => {
    const cst = node.$cstNode!;
    const { offset, end, newText } = buildRemovalEdit(fullText, cst.offset, cst.end);
    return { offset, end, newText };
  };

  if (patch.tags !== undefined) {
    const tagsCst = body.tags?.$cstNode;
    if (tagsCst) {
      edits.push(patch.tags.length === 0 ? removal(body.tags!) : buildReplaceTagsInPlaceEdit(fullText, tagsCst, patch.tags));
    } else if (patch.tags.length > 0) {
      inserts.prepend(patch.tags.map((tag) => `${inserts.innerIndent}${formatTag(tag)}\n`).join(''));
    }
  }

  for (const key of ['title', 'description'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    const existing = (body.props ?? []).filter((p) => p.$type === 'ViewStringProperty' && p.key === key);
    if (value === null) {
      edits.push(...existing.map(removal));
    } else if (existing.length > 0) {
      for (const prop of existing) {
        const cst = prop.$cstNode!;
        edits.push({ offset: cst.offset, end: cst.end, newText: viewStringProperty(key, value) });
      }
    } else {
      inserts.addProperty(`${inserts.innerIndent}${viewStringProperty(key, value)}\n`);
    }
  }

  if (patch.links !== undefined) {
    edits.push(...buildReplaceLinksEdit(view.node as unknown as BodyOwnerNode, fullText, indent, patch.links, inserts));
  }

  if (patch.autoLayout !== undefined) {
    const layouts = view.rules.filter((rule) => rule.kind === 'autoLayout');
    if (patch.autoLayout === null) {
      edits.push(...layouts.map((rule) => removal(rule.node)));
    } else if (layouts.length > 0) {
      const cst = layouts.at(-1)!.node.$cstNode!;
      edits.push({ offset: cst.offset, end: cst.end, newText: `autoLayout ${patch.autoLayout}` });
    } else {
      inserts.append(`${inserts.innerIndent}autoLayout ${patch.autoLayout}\n`);
    }
  }

  return inserts.apply(edits);
}

/** The edit that removes the declaration of `view` with the lines it fills. */
export function removeViewEdit(doc: ParsedDocument, view: ViewDeclaration): TextEdit {
  const cst = view.node.$cstNode;
  if (!cst) throw new Error(`internal: view '${view.id}' has no CST node`);
  const { offset, end, newText } = buildRemovalEdit(doc.fullText, cst.offset, cst.end);
  return { offset, end, newText };
}

/**
 * The edit that writes the rule line `text` (`<kind> <expression>`) into
 * the view `view`: before the body item starting at `before` when given;
 * otherwise after the last body item, or before it when that item is an
 * `autoLayout` rule (LikeC4 reads every rule wherever it stands; the layout
 * stays last).  A declaration without a body gets one.
 */
export function addViewRuleEdits(doc: ParsedDocument, view: ViewDeclaration, text: string, before?: number): TextEdit[] {
  const { fullText } = doc;
  const indent = getNodeIndent(view.node, fullText);
  if (!view.body) {
    const end = view.node.$cstNode?.end;
    if (end === undefined) throw new Error(`internal: view '${view.id}' has no CST node`);
    return [{ offset: end, end, newText: ` {\n${indent}  ${text}\n${indent}}` }];
  }
  const inserts = BodyInsertions.forViewBody(view.body as Parameters<typeof BodyInsertions.forViewBody>[0], fullText, indent);
  const line = `${inserts.innerIndent}${text}\n`;
  let anchor = before;
  if (anchor === undefined) {
    const items = [...view.rules.map((r) => ({ node: r.node, layout: r.kind === 'autoLayout' })), ...view.steps.map((s) => ({ node: s.node, layout: false }))];
    const last = items.sort((a, b) => (a.node.$cstNode?.offset ?? 0) - (b.node.$cstNode?.offset ?? 0)).at(-1);
    if (last?.layout) anchor = last.node.$cstNode?.offset;
  }
  if (anchor === undefined) inserts.append(line);
  else inserts.before(anchor, line);
  return inserts.apply([]);
}

/** The edit that replaces the rule `node` with the rule line `text`. */
export function replaceViewRuleEdit(node: ViewAstNode, text: string): TextEdit {
  const cst = node.$cstNode;
  if (!cst) throw new Error('internal: rule without a CST node');
  return { offset: cst.offset, end: cst.end, newText: text };
}

/** The edit that removes the rule `node` with the lines it fills (a trailing comma is part of the rule). */
export function removeViewRuleEdit(doc: ParsedDocument, node: ViewAstNode): TextEdit {
  const cst = node.$cstNode;
  if (!cst) throw new Error('internal: rule without a CST node');
  const { offset, end, newText } = buildRemovalEdit(doc.fullText, cst.offset, cst.end);
  return { offset, end, newText };
}
