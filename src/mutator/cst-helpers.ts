/**
 * Shared CST/string-level helpers used by element-ops, relationship-ops, and
 * metadata-ops.  These are intentionally low-level and AST-agnostic — they
 * operate on offsets, raw text, and minimal AST shapes.
 */
import type { TextEdit } from './text-edit.js';
import { escapeString } from './codegen.js';

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
 * Return the insertion offset to use when adding new content immediately
 * before the closing `}` at `closingBraceOffset`.  Walks back past whitespace
 * to the preceding newline, so the caller can splice in `\n<content>` while
 * leaving the brace's indentation intact.
 */
export function insertionPointBeforeBrace(fullText: string, closingBraceOffset: number): number {
  let i = closingBraceOffset - 1;
  while (i >= 0 && (fullText[i] === ' ' || fullText[i] === '\t')) {
    i--;
  }
  if (i >= 0 && fullText[i] === '\n') return i;
  return closingBraceOffset;
}

/**
 * Expand a `[offset, end)` range to consume the leading newline + indent
 * preceding `offset` and (optionally) the trailing newline at `end`.
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
    newOffset = j;
  }
  if (consumeTrailing && fullText[newEnd] === '\n') {
    newEnd += 1;
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
 * Build a TextEdit that splices a new property snippet into an existing body
 * so that it lands BEFORE any child elements.  The LikeC4 grammar requires
 * `(properties* tags*) children*` ordering — inserting properties after
 * children produces a parse error.
 *
 * `snippet` is one or more complete, indented lines ending with `\n`.
 * The returned edit is always a zero-width insertion, so several property
 * insertions produced by one update compose without overlapping.
 *
 * - No children: the snippet is inserted at `closingBrace` (unchanged
 *   historical behaviour).
 * - First child starts its own line: the snippet is inserted at the start
 *   of that line, above the child.
 * - First child shares its line with preceding code (e.g. `{ child = x }`):
 *   the snippet is inserted on new lines between that code and the child;
 *   the child follows the last inserted property on its line.
 */
export function buildInsertBeforeChildrenEdit(
  node: BodyOwnerNode,
  fullText: string,
  closingBrace: number,
  snippet: string,
): TextEdit {
  const atBrace: TextEdit = { offset: closingBrace, end: closingBrace, newText: snippet };
  const children = node.body?.elements;
  if (!children || children.length === 0) return atBrace;

  let firstOffset = Infinity;
  for (const child of children) {
    const off = child.$cstNode?.offset;
    if (typeof off === 'number' && off < firstOffset) firstOffset = off;
  }
  if (!Number.isFinite(firstOffset) || firstOffset >= closingBrace) return atBrace;

  let i = firstOffset;
  while (i > 0 && (fullText[i - 1] === ' ' || fullText[i - 1] === '\t')) i--;
  if (i > 0 && fullText[i - 1] === '\n') {
    return { offset: i, end: i, newText: snippet };
  }
  // Zero-width insertion just before the whitespace preceding the child, so
  // that several property insertions in one update compose without
  // overlapping.  The snippet's final newline is dropped: the original
  // whitespace (or a single space when there is none) separates the last
  // inserted property from the child.
  const body = snippet.endsWith('\n') ? snippet.slice(0, -1) : snippet;
  const separator = i === firstOffset ? ' ' : '';
  return { offset: i, end: i, newText: '\n' + body + separator };
}

/**
 * Build a TextEdit that inserts a generated snippet just before the closing `}`
 * of `node.body`.  If the node has no body block yet, one is created on the
 * same line as the node and the snippet is placed inside it.
 *
 * The `snippetFn` receives the inner indent string (parent indent + one level)
 * and must return the text to insert (including a trailing newline).
 */
export function buildInsertBodySnippet(
  node: BodyOwnerNode,
  fullText: string,
  indent: string,
  snippetFn: (innerIndent: string) => string,
): TextEdit | null {
  const innerIndent = indent + '  ';

  if (!node.body?.$cstNode) {
    const cst = node.$cstNode;
    if (!cst) return null;
    const snippet = snippetFn(innerIndent);
    const insertion = ' {\n' + snippet + `${indent}}`;
    return { offset: cst.end, end: cst.end, newText: insertion };
  }

  const closingBrace = findClosingBraceOffset(node.body.$cstNode);
  return buildInsertBeforeChildrenEdit(node, fullText, closingBrace, snippetFn(innerIndent));
}

/**
 * Build the TextEdits that replace all existing `link <url> [label]`
 * properties with a new set of links.  When `links` is an empty array all
 * existing links are removed.  When there are no existing links and `links`
 * is non-empty the new links are inserted into the body (before any child
 * elements), creating a body block when absent.
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
): TextEdit[] {
  const sanitizeUrl = (url: string) => url.replace(/[\n\r']/g, '');
  const linkText = (lnk: { url: string; label?: string }) => {
    const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
    return `link ${sanitizeUrl(lnk.url)}${escaped}`;
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
    const insert = buildInsertBodySnippet(node, fullText, indent, (ii) =>
      links.map((lnk) => `${ii}${linkText(lnk)}\n`).join(''),
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
