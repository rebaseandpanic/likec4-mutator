/**
 * Shared CST/string-level helpers used by element-ops, relationship-ops, and
 * metadata-ops.  These are intentionally low-level and AST-agnostic — they
 * operate on offsets, raw text, and minimal AST shapes.
 */
import type { TextEdit } from './text-edit.js';
import { escapeString } from './codegen.js';

/**
 * Find the offset of the matching closing `}` for the opening `{` at or after
 * `startOffset`.  Skips over braces inside single- or double-quoted string
 * literals and `//` line comments.  Throws when no balanced closing brace is
 * found in the range.
 *
 * @param fullText     - Full source text
 * @param startOffset  - Offset at or before the opening `{`
 * @param endExclusive - Exclusive upper bound for the scan
 */
export function findClosingBrace(
  fullText: string,
  startOffset: number,
  endExclusive: number,
): number {
  let openIdx = startOffset;
  while (openIdx < endExclusive && fullText[openIdx] !== '{') {
    openIdx++;
  }
  if (openIdx >= endExclusive) {
    throw new Error('Could not find opening brace in range');
  }

  let depth = 0;
  let i = openIdx;
  while (i < endExclusive) {
    const ch = fullText[i];
    if (ch === "'") {
      i++;
      while (i < endExclusive) {
        const sc = fullText[i];
        if (sc === '\\') {
          i = Math.min(i + 2, endExclusive);
          continue;
        }
        if (sc === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < endExclusive) {
        const sc = fullText[i];
        if (sc === '\\') {
          i = Math.min(i + 2, endExclusive);
          continue;
        }
        if (sc === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '/' && fullText[i + 1] === '/') {
      i += 2;
      while (i < endExclusive && fullText[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error('Could not find closing brace in range');
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
    $cstNode?: { offset: number; end: number };
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
 * Compute the offset at which a new property line/block should be spliced into
 * an existing body so that it lands BEFORE any child elements.  The LikeC4
 * grammar requires `(properties* tags*) children*` ordering — inserting
 * properties after children produces a parse error.
 *
 * If the body has no children (or none with a CST node), returns `closingBrace`
 * — the original insertion point, which is correct in that case.
 *
 * Otherwise locates the earliest child by CST offset, walks back over leading
 * whitespace, and returns the offset of the line-start `\n` (so the caller can
 * splice text whose final character is `\n`, ending up on its own line above
 * the child with the child's indent intact).  When the child is on the same
 * line as the opening brace (no preceding `\n`), falls back to `closingBrace`.
 */
export function findInsertOffsetBeforeChildren(
  node: BodyOwnerNode,
  fullText: string,
  closingBrace: number,
): number {
  const children = node.body?.elements;
  if (!children || children.length === 0) return closingBrace;

  let firstOffset = Infinity;
  for (const child of children) {
    const off = child.$cstNode?.offset;
    if (typeof off === 'number' && off < firstOffset) firstOffset = off;
  }
  if (!Number.isFinite(firstOffset)) return closingBrace;
  if (firstOffset >= closingBrace) return closingBrace;

  let i = firstOffset;
  while (i > 0 && (fullText[i - 1] === ' ' || fullText[i - 1] === '\t')) i--;
  if (i > 0 && fullText[i - 1] === '\n') return i;
  return closingBrace;
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

  const bodyCst = node.body.$cstNode;
  const closingBrace = findClosingBrace(fullText, bodyCst.offset, bodyCst.end);
  const insertAt = findInsertOffsetBeforeChildren(node, fullText, closingBrace);
  const snippet = snippetFn(innerIndent);
  return { offset: insertAt, end: insertAt, newText: snippet };
}

/**
 * Build a TextEdit that replaces all existing `link <url> [label]` lines with
 * a new set of link lines.  When `links` is an empty array all existing link
 * lines are removed.  When there are no existing links and `links` is non-empty
 * the snippet is inserted before the closing `}` (creating a body block when
 * absent).
 *
 * Used by both element-ops and relationship-ops (the LinkProperty AST shape is
 * the same for both element and relation bodies).
 */
export function buildReplaceLinksEdit(
  node: BodyOwnerNode,
  fullText: string,
  indent: string,
  links: Array<{ url: string; label?: string }>,
): TextEdit | null {
  const innerIndent = indent + '  ';
  const sanitizeUrl = (url: string) => url.replace(/[\n\r']/g, '');
  const newSnippetLines = links
    .map((lnk) => {
      const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
      return `${innerIndent}link ${sanitizeUrl(lnk.url)}${escaped}`;
    })
    .join('\n');
  const replacement = links.length === 0 ? '' : '\n' + newSnippetLines + '\n';

  // Collect existing LinkProperty CST nodes.
  const existing: Array<{ offset: number; end: number }> = [];
  for (const prop of node.body?.props ?? []) {
    if (prop.$type === 'LinkProperty' && prop.$cstNode) {
      existing.push({ offset: prop.$cstNode.offset, end: prop.$cstNode.end });
    }
  }

  if (existing.length === 0) {
    if (links.length === 0) return null;
    return buildInsertBodySnippet(node, fullText, indent, (ii) =>
      links
        .map((lnk) => {
          const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
          return `${ii}link ${sanitizeUrl(lnk.url)}${escaped}`;
        })
        .join('\n') + '\n',
    );
  }

  existing.sort((a, b) => a.offset - b.offset);
  let start = existing[0].offset;
  let end = existing[existing.length - 1].end;
  ({ offset: start, end } = expandRangeToConsumeSurroundingNewlines(fullText, start, end));

  return { offset: start, end, newText: replacement };
}

// ---------------------------------------------------------------------------
// Relation collection
// ---------------------------------------------------------------------------

/**
 * Walk every model block in the AST and return all Relation nodes, keeping
 * track of the FQN of the enclosing element (used to resolve implicit-source
 * relations).  Each result row carries the original AST node plus a
 * `_parentFqn` field for source resolution.
 */
export function collectAllRelations(ast: {
  models?: Array<{ elements?: unknown[] }>;
}): Array<{ node: unknown; parentFqn: string }> {
  const out: Array<{ node: unknown; parentFqn: string }> = [];
  for (const model of ast.models ?? []) {
    walk(model.elements ?? [], '', out);
  }
  return out;

  function walk(elements: unknown[], parentFqn: string, results: typeof out): void {
    for (const item of elements) {
      const it = item as { $type?: string; name?: string; body?: { elements?: unknown[] } };
      if (it.$type === 'Relation') {
        results.push({ node: item, parentFqn });
      } else if (it.$type === 'Element') {
        const fqn = parentFqn ? `${parentFqn}.${it.name ?? ''}` : (it.name ?? '');
        if (it.body?.elements) walk(it.body.elements, fqn, results);
      }
    }
  }
}
