/**
 * Placement of new lines inside a braced block — an element or relation
 * body, a `model { }` or a `views { }` block — so that the result is laid
 * out the way a person would write it: every inserted construct on its own
 * line, indented one level deeper than the block's owner, and the closing
 * `}` on its own line at the owner's indentation.
 *
 * The new text is collected first ({@link BodyInsertions.prepend},
 * {@link BodyInsertions.addProperty}, {@link BodyInsertions.append}) and
 * turned into edits once, together with the other edits of the same
 * operation ({@link BodyInsertions.apply}), because how a line is inserted
 * depends on the block's layout:
 *
 * - A block written over several lines — nothing but blanks or a `//`
 *   comment after `{` on its line, and the `}` alone on its line — gets
 *   zero-width insertions: the existing text keeps every byte.
 * - Any other block (`{ }`, `{ description 'd' }`, a `}` written after the
 *   last construct) is rewritten as one edit: its content, with the other
 *   edits of the operation applied to it, goes on its own lines between
 *   `{` and `}`, the new lines around it.
 */
import { applyEdits, type TextEdit } from './text-edit.js';
import { findClosingBraceOffset, type BodyOwnerNode, type CstNodeLike } from './cst-helpers.js';

/** Offsets of a braced block and the indentation of the line of its owner. */
export interface BraceBlock {
  /** Offset of the opening `{` */
  open: number;
  /** Offset of the closing `}` */
  close: number;
  /** Leading whitespace of the owner's line; the closing `}` gets it */
  indent: string;
  /** Offset of the first nested declaration, before which properties go */
  firstChild?: number;
}

/**
 * New lines for one braced block, placed by {@link apply}.  Every snippet is
 * one or more complete lines, each indented with {@link innerIndent} (or
 * deeper) and ending with `\n`.
 */
export class BodyInsertions {
  private readonly start: string[] = [];
  private readonly properties: string[] = [];
  private readonly end: string[] = [];

  constructor(
    private readonly fullText: string,
    private readonly block: BraceBlock,
  ) {}

  /**
   * Insertions into the body of an element or relation (or `extend` block),
   * which must have one.
   *
   * @param indent - Leading whitespace of the owner's line
   */
  static forBody(node: BodyOwnerNode, fullText: string, indent: string): BodyInsertions {
    const bodyCst = node.body?.$cstNode;
    if (!bodyCst || fullText[bodyCst.offset] !== '{') {
      throw new Error('internal: body insertion into a node without a `{ ... }` body');
    }
    let firstChild: number | undefined;
    for (const child of node.body?.elements ?? []) {
      const offset = child.$cstNode?.offset;
      if (offset !== undefined && (firstChild === undefined || offset < firstChild)) firstChild = offset;
    }
    return new BodyInsertions(fullText, {
      open: bodyCst.offset,
      close: findClosingBraceOffset(bodyCst),
      indent,
      ...(firstChild !== undefined && { firstChild }),
    });
  }

  /**
   * Insertions into a keyword block such as `model { ... }` or
   * `views { ... }`: its first `{` token and its closing `}`.
   */
  static forBlock(cst: CstNodeLike, fullText: string, indent: string): BodyInsertions {
    const open = firstToken(cst, '{');
    if (open === undefined) throw new Error('internal: block without an opening brace');
    return new BodyInsertions(fullText, { open, close: findClosingBraceOffset(cst), indent });
  }

  /** Indentation of the block's own lines (owner's indentation + one level). */
  get innerIndent(): string {
    return this.block.indent + '  ';
  }

  /** Lines that must open the body (tags). */
  prepend(snippet: string): void {
    this.start.push(snippet);
  }

  /** Property lines: before the first nested declaration, else at the end. */
  addProperty(snippet: string): void {
    this.properties.push(snippet);
  }

  /** Lines at the end of the block (new nested declarations). */
  append(snippet: string): void {
    this.end.push(snippet);
  }

  /**
   * The edits of an operation with these insertions placed.  `edits` are the
   * operation's other edits of the same document; edits inside the block are
   * folded into the rewrite of a block that is not laid out over several
   * lines, so they never overlap the insertion.
   */
  apply(edits: readonly TextEdit[]): TextEdit[] {
    if (this.start.length + this.properties.length + this.end.length === 0) return [...edits];
    const { fullText } = this;
    const { open, close } = this.block;
    const interior = fullText.substring(open + 1, close);
    if (/^\s*$/.test(interior)) {
      const lines = [...this.start, ...this.properties, ...this.end].join('');
      return [...edits, { offset: open + 1, end: close, newText: '\n' + lines + this.block.indent }];
    }
    if (this.isLaidOutOverLines()) return [...edits, ...this.insertIntoLines(edits)];
    return this.rewriteBlock(edits);
  }

  /** `{` followed by nothing but blanks or a line comment, and `}` alone on its line. */
  private isLaidOutOverLines(): boolean {
    const { fullText } = this;
    const { open, close } = this.block;
    const openLineEnd = fullText.indexOf('\n', open + 1);
    if (openLineEnd === -1 || openLineEnd >= close) return false;
    if (!/^[ \t]*(\/\/.*)?\r?$/.test(fullText.substring(open + 1, openLineEnd))) return false;
    return /^[ \t]*$/.test(fullText.substring(lineStart(fullText, close), close));
  }

  /** Zero-width insertions into a block laid out over several lines. */
  private insertIntoLines(others: readonly TextEdit[]): TextEdit[] {
    const { fullText } = this;
    const { open, close, firstChild } = this.block;
    const edits: TextEdit[] = [];
    if (this.start.length > 0) {
      // At the end of the `{` line (before a trailing comment's line break).
      let at = fullText.indexOf('\n', open + 1);
      if (fullText[at - 1] === '\r') at--;
      edits.push({ offset: at, end: at, newText: '\n' + withoutFinalNewline(this.start.join('')) });
    }
    let atEnd = this.properties.join('');
    if (this.properties.length > 0 && firstChild !== undefined && firstChild < close) {
      atEnd = '';
      edits.push(insertBefore(fullText, firstChild, this.properties.join(''), others));
    }
    atEnd += this.end.join('');
    if (atEnd !== '') {
      const at = lineStart(fullText, close);
      edits.push({ offset: at, end: at, newText: atEnd });
    }
    return edits;
  }

  /**
   * Rewrite a block that is not laid out over several lines as one edit:
   * `{`, the new first lines, its content (with the edits inside it applied)
   * and the other new lines each on their own lines, then `}` on a line of
   * its own.  Properties go before the first nested declaration.
   */
  private rewriteBlock(edits: readonly TextEdit[]): TextEdit[] {
    const { fullText } = this;
    const { open, close, indent, firstChild } = this.block;
    const from = open + 1;
    const inside: TextEdit[] = [];
    const outside: TextEdit[] = [];
    for (const edit of edits) {
      if (edit.offset >= from && edit.end <= close) inside.push(edit);
      else if (edit.end <= from || edit.offset >= close) outside.push(edit);
      else throw new Error('internal: an edit overlaps the boundary of the block it inserts into');
    }
    const split = this.properties.length > 0 && firstChild !== undefined && firstChild < close ? firstChild : close;
    const part = (start: number, stop: number): string => {
      const own = inside.filter((e) =>
        e.offset === e.end ? e.offset >= start && (e.offset < stop || stop === close) : e.offset >= start && e.end <= stop,
      );
      for (const e of inside) {
        if (e.offset !== e.end && e.offset < stop && e.end > stop && stop !== close) {
          throw new Error('internal: an edit overlaps the first nested declaration it inserts before');
        }
      }
      const local = own.map((e) => ({ offset: e.offset - start, end: e.end - start, newText: e.newText }));
      return applyEdits(fullText.substring(start, stop), local).trim();
    };
    const asLines = (text: string): string => (text === '' ? '' : this.innerIndent + text + '\n');
    const before = part(from, split);
    const after = split === close ? '' : part(split, close);
    const newText =
      '\n' +
      this.start.join('') +
      asLines(before) +
      this.properties.join('') +
      asLines(after) +
      this.end.join('') +
      indent;
    return [...outside, { offset: from, end: close, newText }];
  }
}

/** Offset of the start of the line holding `offset`. */
function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/** `snippet` without its last line break. */
function withoutFinalNewline(snippet: string): string {
  return snippet.endsWith('\n') ? snippet.slice(0, -1) : snippet;
}

/**
 * Insert complete lines before the construct at `offset`: above its line
 * when it starts the line, otherwise on new lines between the code before it
 * and the construct, which then starts a line of its own.  The blanks
 * between that code and the construct are replaced, unless another edit of
 * the operation (`others`) already touches them.
 */
function insertBefore(text: string, offset: number, lines: string, others: readonly TextEdit[]): TextEdit {
  const start = lineStart(text, offset);
  const leading = text.substring(start, offset);
  if (/^[ \t]*$/.test(leading)) return { offset: start, end: start, newText: lines };
  let wsStart = offset;
  while (wsStart > start && (text[wsStart - 1] === ' ' || text[wsStart - 1] === '\t')) wsStart--;
  if (others.some((e) => e.offset < offset && e.end > wsStart)) wsStart = offset;
  const indent = /^[ \t]*/.exec(lines)?.[0] ?? '';
  return { offset: wsStart, end: offset, newText: '\n' + lines + indent };
}

/** Offset of the first non-hidden token of `node` whose text is `text`. */
function firstToken(node: CstNodeLike, text: string): number | undefined {
  if (!node.content) return !node.hidden && node.text === text ? node.offset : undefined;
  for (const child of node.content) {
    const found = firstToken(child, text);
    if (found !== undefined) return found;
  }
  return undefined;
}
