/**
 * Shared CST/string-level helpers used by element-ops, relationship-ops, and
 * metadata-ops.  These are intentionally low-level and AST-agnostic — they
 * operate on offsets, raw text, and minimal AST shapes.
 */
import type { TextEdit } from './text-edit.js';
import type { BodyInsertions } from './body-layout.js';
import { escapeString, formatLinkUrl, formatTag } from './codegen.js';

/**
 * Minimal shape of a Langium CST node: composite nodes carry `content`,
 * leaf nodes carry `text` and `hidden` (true for comments and whitespace).
 */
export interface CstNodeLike {
  offset: number;
  end: number;
  text?: string;
  hidden?: boolean;
  content?: CstNodeLike[];
}

/**
 * Return the offset of the closing `}` of a braced block (`model { }`,
 * `views { }`, an element or relation body) from the block's CST node.
 *
 * The brace is the last non-hidden leaf token of the node, as produced by
 * the LikeC4 lexer and parser — so braces inside comments, string literals
 * (including markdown strings) and unquoted URIs are never mistaken for it.
 * Throws when the node does not end with a `}` token.
 */
export function findClosingBraceOffset(node: CstNodeLike): number {
  const leaf = lastNonHiddenLeaf(node);
  if (!leaf || leaf.text !== '}') {
    throw new Error('Could not find closing brace of the block');
  }
  return leaf.offset;
}

function lastNonHiddenLeaf(node: CstNodeLike): CstNodeLike | null {
  if (!node.content) return node.hidden ? null : node;
  for (let i = node.content.length - 1; i >= 0; i--) {
    const found = lastNonHiddenLeaf(node.content[i]);
    if (found) return found;
  }
  return null;
}

/**
 * Expand a `[offset, end)` range to consume the leading line break + indent
 * preceding `offset` and (optionally) the trailing line break at `end`
 * (`\n` or `\r\n`).
 *
 * Intended for REPLACEMENTS whose new text brings its own leading and
 * trailing newlines (default: both surrounding newlines are consumed).  Do
 * not use it for pure deletions — consuming both newlines joins the previous
 * and the next line, and a `//` comment ending the previous line would then
 * swallow the next line.  Use {@link buildRemovalEdit} for deletions.
 */
export function expandRangeToConsumeSurroundingNewlines(
  fullText: string,
  offset: number,
  end: number,
  options?: { consumeTrailingNewline?: boolean },
): { offset: number; end: number } {
  const consumeTrailing = options?.consumeTrailingNewline ?? true;
  let newOffset = offset;
  let newEnd = end;
  let j = newOffset - 1;
  while (j >= 0 && (fullText[j] === ' ' || fullText[j] === '\t')) j--;
  if (j >= 0 && fullText[j] === '\n') {
    newOffset = j > 0 && fullText[j - 1] === '\r' ? j - 1 : j;
  }
  if (consumeTrailing) {
    if (fullText.startsWith('\r\n', newEnd)) newEnd += 2;
    else if (fullText[newEnd] === '\n') newEnd += 1;
  }
  return { offset: newOffset, end: newEnd };
}

/** Result of {@link buildRemovalEdit}. */
export interface RemovalEdit extends TextEdit {
  /**
   * True when the removed construct occupied its lines alone and the edit
   * deletes those whole lines (`offset` is a line start, `end` is just past
   * the terminating newline).  False when the construct shared a line with
   * other code and only the construct itself was cut out.
   */
  wholeLines: boolean;
}

/**
 * Build an edit that deletes the source range `[offset, end)` of a single
 * construct (element, relation, property, tag block) without disturbing the
 * surrounding lines.
 *
 * - When the construct is alone on its lines (only indentation before it,
 *   only whitespace and optionally a `//` comment after it on its last line),
 *   those whole lines are deleted, including the terminating newline.  The
 *   newline ending the PREVIOUS line is never consumed, so a `//` comment at
 *   the end of the previous line cannot swallow the next line.  A trailing
 *   `//` comment on the construct's own last line is deleted with it.
 * - Otherwise only the construct is cut out, together with the horizontal
 *   whitespace on one side of it; newlines are left untouched.  When code
 *   remains on both sides, a single space separates it.
 */
export function buildRemovalEdit(fullText: string, offset: number, end: number): RemovalEdit {
  const lineStart = fullText.lastIndexOf('\n', offset - 1) + 1;
  const newlineAfter = fullText.indexOf('\n', end);
  const lineEnd = newlineAfter === -1 ? fullText.length : newlineAfter;
  const leading = fullText.substring(lineStart, offset);
  const trailing = fullText.substring(end, lineEnd);

  if (/^[ \t]*$/.test(leading) && /^[ \t]*(\/\/.*)?\r?$/.test(trailing)) {
    if (newlineAfter !== -1) {
      return { offset: lineStart, end: newlineAfter + 1, newText: '', wholeLines: true };
    }
    // Last line of the file without a terminating newline: drop the newline
    // that ends the previous line instead (nothing follows, so nothing can
    // be joined to it).
    let start = lineStart;
    if (start > 0) {
      start--;
      if (start > 0 && fullText[start - 1] === '\r') start--;
    }
    return { offset: start, end: fullText.length, newText: '', wholeLines: true };
  }

  const isHorizontalWs = (ch: string | undefined) => ch === ' ' || ch === '\t';
  let start = offset;
  let stop = end;
  while (isHorizontalWs(fullText[stop])) stop++;
  if (stop === end || stop === lineEnd) {
    // Nothing (or only whitespace up to the newline) follows: take the
    // whitespace before the construct instead.
    stop = end;
    while (start > lineStart && isHorizontalWs(fullText[start - 1])) start--;
  }
  const before = start > 0 ? fullText[start - 1] : undefined;
  const after = stop < fullText.length ? fullText[stop] : undefined;
  const needsSeparator =
    before !== undefined && after !== undefined && !/\s/.test(before) && !/\s/.test(after);
  return { offset: start, end: stop, newText: needsSeparator ? ' ' : '', wholeLines: false };
}

/**
 * The first leaf token of `node` that is not hidden (comment or whitespace)
 * and starts at or after `from`; undefined when there is none.
 */
export function firstVisibleLeaf(node: CstNodeLike, from: number): CstNodeLike | undefined {
  if (!node.content) return !node.hidden && node.offset >= from ? node : undefined;
  for (const child of node.content) {
    const leaf = firstVisibleLeaf(child, from);
    if (leaf) return leaf;
  }
  return undefined;
}

/**
 * Single leaf CST token: contiguous range plus the matched text.
 */
export interface CstLeaf {
  offset: number;
  end: number;
  text: string;
}

/**
 * Collect every leaf CST token reachable from `node` in document order.
 * A composite node is recognised by the presence of a `content` array; any
 * other node is treated as a leaf carrying `offset`, `end`, and `text`.
 */
export function collectLeaves(node: {
  content?: unknown[];
  offset?: number;
  end?: number;
  text?: string;
}): CstLeaf[] {
  const result: CstLeaf[] = [];
  function walk(n: {
    content?: unknown[];
    offset?: number;
    end?: number;
    text?: string;
  }): void {
    if (n.content) {
      for (const child of n.content) walk(child as typeof n);
    } else {
      result.push({
        offset: n.offset as number,
        end: n.end as number,
        text: n.text as string,
      });
    }
  }
  walk(node);
  return result;
}

// ---------------------------------------------------------------------------
// AST shape used by these helpers
// ---------------------------------------------------------------------------

export interface BodyOwnerNode {
  $cstNode?: { offset: number; end: number };
  body?: {
    $cstNode?: CstNodeLike;
    props?: Array<{
      $type?: string;
      $cstNode?: { offset: number; end: number };
      key?: string;
      name?: string;
      value?: unknown;
      props?: Array<unknown>;
    }>;
    /** Child elements (Element/Relation nodes) declared inside the body. */
    elements?: Array<{ $cstNode?: { offset: number; end: number } }>;
  };
}

/**
 * Build a TextEdit that creates a body holding `snippet` for a node without
 * one, or — when the node has a body — hand the snippet to `inserts` as a
 * property (placed before nested declarations, see {@link BodyInsertions})
 * and return null.
 *
 * The `snippetFn` receives the inner indent string (parent indent + one level)
 * and must return the text to insert (complete lines, each ending with `\n`).
 */
export function buildInsertBodySnippet(
  node: BodyOwnerNode,
  indent: string,
  snippetFn: (innerIndent: string) => string,
  inserts: BodyInsertions,
): TextEdit | null {
  const innerIndent = indent + '  ';

  if (!node.body?.$cstNode) {
    const cst = node.$cstNode;
    if (!cst) return null;
    const snippet = snippetFn(innerIndent);
    const insertion = ' {\n' + snippet + `${indent}}`;
    return { offset: cst.end, end: cst.end, newText: insertion };
  }

  inserts.addProperty(snippetFn(innerIndent));
  return null;
}

/**
 * Build the TextEdits that replace all existing `link <url> [label]`
 * properties with a new set of links.  When `links` is an empty array all
 * existing links are removed.  When there are no existing links and `links`
 * is non-empty the new links are handed to `inserts` (placed before any
 * child elements), or a body block holding them is created when absent.
 *
 * Each existing link is edited individually: the first one is replaced by
 * the new links and every other one is deleted.  Anything declared between
 * two links (other properties, comments) is left untouched.
 *
 * Used by both element-ops and relationship-ops (the LinkProperty AST shape is
 * the same for both element and relation bodies).
 */
export function buildReplaceLinksEdit(
  node: BodyOwnerNode,
  fullText: string,
  indent: string,
  links: Array<{ url: string; label?: string }>,
  inserts: BodyInsertions,
): TextEdit[] {
  const linkText = (lnk: { url: string; label?: string }) => {
    const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
    return `link ${formatLinkUrl(lnk.url)}${escaped}`;
  };

  // Collect existing LinkProperty CST nodes in document order.
  const existing: Array<{ offset: number; end: number }> = [];
  for (const prop of node.body?.props ?? []) {
    if (prop.$type === 'LinkProperty' && prop.$cstNode) {
      existing.push({ offset: prop.$cstNode.offset, end: prop.$cstNode.end });
    }
  }

  if (existing.length === 0) {
    if (links.length === 0) return [];
    const insert = buildInsertBodySnippet(
      node,
      indent,
      (ii) => links.map((lnk) => `${ii}${linkText(lnk)}\n`).join(''),
      inserts,
    );
    return insert ? [insert] : [];
  }

  existing.sort((a, b) => a.offset - b.offset);
  const removals = existing.map((link) => buildRemovalEdit(fullText, link.offset, link.end));
  const edits: TextEdit[] = removals.map(({ offset, end, newText }) => ({ offset, end, newText }));

  if (links.length > 0) {
    const first = existing[0];
    const removal = removals[0];
    if (removal.wholeLines) {
      // The first link sat on its own line: put the new links on their own
      // lines in its place, with the same indentation.
      const lineIndent = /^[ \t]*/.exec(fullText.substring(removal.offset, first.offset))?.[0] ?? '';
      edits[0] = {
        offset: removal.offset,
        end: removal.end,
        newText: links.map((lnk) => `${lineIndent}${linkText(lnk)}\n`).join(''),
      };
    } else {
      // The first link shared a line with other code: replace it in place.
      edits[0] = { offset: first.offset, end: first.end, newText: links.map(linkText).join(' ') };
    }
  }
  return edits;
}

/**
 * Replace a body's tag block (`#a #b`, possibly over several lines) with
 * `tags` (non-empty), keeping its place and what surrounds it.  When the
 * block starts its line, every tag gets a line of its own at the block's
 * indentation; otherwise the tags replace it on its line, separated by a
 * space.  A comment after the block stays where it is.
 */
export function buildReplaceTagsInPlaceEdit(
  fullText: string,
  tagsCst: { offset: number; end: number },
  tags: string[],
): TextEdit {
  const lineStart = fullText.lastIndexOf('\n', tagsCst.offset - 1) + 1;
  const leading = fullText.substring(lineStart, tagsCst.offset);
  const separator = /^[ \t]*$/.test(leading) ? '\n' + leading : ' ';
  return { offset: tagsCst.offset, end: tagsCst.end, newText: tags.map((t) => formatTag(t)).join(separator) };
}

/**
 * The leading whitespace of the line holding `offset` when only whitespace
 * precedes `offset` on that line, else undefined.
 */
export function ownLineIndent(fullText: string, offset: number): string | undefined {
  const lineStart = fullText.lastIndexOf('\n', offset - 1) + 1;
  const leading = fullText.substring(lineStart, offset);
  return /^[ \t]*$/.test(leading) ? leading : undefined;
}

/** Where new entries of a `key value` block (`metadata { }`, `style { }`) go, see {@link blockEntryLayout}. */
export interface BlockEntryLayout {
  /** Indentation of an entry written on a line of its own. */
  indent: string;
  /** Edit that adds `entries` (complete `key value` texts) at the end of the block. */
  append(entries: string[]): TextEdit;
}

/**
 * How new entries are added to a `key value` block such as `metadata { }`
 * or `style { }`: on their own lines just above the closing `}` of a block
 * laid out over several lines, at the indentation of the last entry kept on
 * a line of its own (else the `}` line's indentation plus one level); after
 * the last entry kept on the line of a one-line block.
 *
 * @param block          - CST node of the block, ending with its `}`
 * @param kept           - Source ranges of the entries that stay, in source order
 * @param fallbackIndent - Entry indentation when nothing else determines it
 */
export function blockEntryLayout(
  fullText: string,
  block: CstNodeLike,
  kept: ReadonlyArray<{ offset: number; end: number }>,
  fallbackIndent: string,
): BlockEntryLayout {
  const lastOnOwnLine = [...kept].reverse().find((e) => ownLineIndent(fullText, e.offset) !== undefined);
  const closingBrace = findClosingBraceOffset(block);
  const closingIndent = ownLineIndent(fullText, closingBrace);
  const indent =
    (lastOnOwnLine && ownLineIndent(fullText, lastOnOwnLine.offset)) ??
    (closingIndent !== undefined ? closingIndent + '  ' : fallbackIndent);
  return {
    indent,
    append(entries: string[]): TextEdit {
      if (closingIndent !== undefined) {
        // Multi-line block: new lines just above the closing brace.
        const lineStart = closingBrace - closingIndent.length;
        return { offset: lineStart, end: lineStart, newText: entries.map((e) => `${indent}${e}\n`).join('') };
      }
      // One-line block: on the same line, after the last entry kept.
      const lastKept = kept[kept.length - 1];
      const at = lastKept ? lastKept.end : fullText.indexOf('{', block.offset) + 1;
      const trailing = fullText[at] === '}' ? ' ' : '';
      return { offset: at, end: at, newText: ` ${entries.join(' ')}${trailing}` };
    },
  };
}
