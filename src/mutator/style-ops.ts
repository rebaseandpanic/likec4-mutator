/**
 * Per-field merge of a style patch into an existing `style { ... }` block of
 * an element or relation, shared by element-ops and relationship-ops.
 *
 * LikeC4 reads the first `style { }` block of a body; inside it a field
 * written more than once takes its last value.  A patched field is
 * therefore rewritten wherever the first block declares it, and a field the
 * block lacks is added to it.  Only the values of patched fields change:
 * other fields, comments, separators (`color: red;`) and indentation keep
 * their exact text.
 */
import type { TextEdit } from './text-edit.js';
import { blockEntryLayout, type CstNodeLike } from './cst-helpers.js';

/** A field of a `style { }` block as parsed: its keyword in `key`. */
interface StyleFieldShape {
  key?: string;
  $cstNode?: CstNodeLike;
}

/** A parsed `style { }` block of a body. */
export interface StyleBlockShape {
  $cstNode?: CstNodeLike;
  props?: ReadonlyArray<unknown>;
}

/**
 * Build the edits that merge `entries` (`[field keyword, value text]`, in
 * the order new fields are written) into `block`.
 *
 * @param fallbackIndent - Indentation of a new field when the block has no
 *   field on a line of its own and its `}` shares a line with other code
 */
export function buildMergeStyleEdits(
  fullText: string,
  block: StyleBlockShape,
  entries: ReadonlyArray<[string, string]>,
  fallbackIndent: string,
): TextEdit[] {
  const cst = block.$cstNode;
  if (!cst) return [];
  const values = new Map(entries);
  const fields = (block.props ?? []) as StyleFieldShape[];
  const present = new Set<string>();
  const edits: TextEdit[] = [];
  for (const field of fields) {
    const key = field.key;
    if (key === undefined || !field.$cstNode) continue;
    const value = values.get(key);
    if (value === undefined) continue;
    present.add(key);
    edits.push(valueEdit(field.$cstNode, key, value));
  }
  const added = entries.filter(([key]) => !present.has(key));
  if (added.length > 0) {
    const kept = fields.flatMap((f) => (f.$cstNode ? [f.$cstNode] : []));
    edits.push(blockEntryLayout(fullText, cst, kept, fallbackIndent).append(added.map(([k, v]) => `${k} ${v}`)));
  }
  return edits;
}

/**
 * Replace the value of one field: the tokens after its keyword (and an
 * optional `:`), up to an optional trailing `;`.  A field without a value
 * token (recovered by the parser) is rewritten whole.
 */
function valueEdit(fieldCst: CstNodeLike, key: string, value: string): TextEdit {
  const tokens = visibleTokens(fieldCst);
  let first = 1;
  if (tokens[first]?.text === ':') first++;
  let last = tokens.length - 1;
  if (last >= first && tokens[last]?.text === ';') last--;
  const from = tokens[first];
  const to = tokens[last];
  if (last < first || !from || !to) return { offset: fieldCst.offset, end: fieldCst.end, newText: `${key} ${value}` };
  return { offset: from.offset, end: to.end, newText: value };
}

/** The non-hidden leaf tokens of a CST node, in source order. */
function visibleTokens(node: CstNodeLike): CstNodeLike[] {
  if (!node.content) return node.hidden ? [] : [node];
  return node.content.flatMap(visibleTokens);
}
