/**
 * Placement of new lines inside a braced block — an element or relation
 * body, a `model { }` or a `views { }` block, or the body a declaration is
 * given when it has none — so that the result is laid
 * out the way a person would write it: every inserted construct on its own
 * line, indented one level deeper than the block's owner, and the closing
 * `}` on its own line at the owner's indentation.
 *
 * The new text is collected first ({@link BodyInsertions.prepend},
 * {@link BodyInsertions.addProperty}, {@link BodyInsertions.before},
 * {@link BodyInsertions.append}) and
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

/**
 * Offsets of a braced block and the indentation of the line of its owner.
 * `open` and `close` are equal for a body that is not written yet (see
 * {@link BodyInsertions.forDeclaration}): the offset after the declaration,
 * where it is created.
 */
export interface BraceBlock {
  /** Offset of the opening `{` */
  open: number;
  /** Offset of the closing `}` */
  close: number;
  /** True when the block does not exist yet and is created at `open` */
  create?: boolean;
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
  private readonly positioned: Array<{ offset: number; snippet: string }> = [];
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
   * Insertions into the body of a declaration (an element, a deployment node
   * or instance), creating the body when the declaration has none: ` {`, the
   * new lines and `}` at the owner's indentation are written right after the
   * declaration, so its form (`name = kind …` or `kind name …`) and inline
   * strings are kept as written.
   *
   * @param indent - Leading whitespace of the owner's line
   */
  static forDeclaration(node: BodyOwnerNode, fullText: string, indent: string): BodyInsertions {
    if (node.body?.$cstNode) return BodyInsertions.forBody(node, fullText, indent);
    const cst = node.$cstNode;
    if (!cst) throw new Error('internal: body creation for a declaration without a position');
    return new BodyInsertions(fullText, { open: cst.end, close: cst.end, indent, create: true });
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

  /**
   * Insertions into the body of a view (FOR-PLAN 2): tags open the body
   * ({@link prepend}); properties go after the tags and before the first
   * rule or step statement ({@link addProperty}); a rule or step statement
   * goes before an arbitrary body item ({@link before}) or at the end
   * ({@link append}).  For the inside of a `par` block use
   * {@link forBlock} on the block's CST.
   *
   * @param body   - The `ElementViewBody` / `DynamicViewBody` / `DeploymentViewBody` node
   * @param indent - Leading whitespace of the view declaration's line
   */
  static forViewBody(
    body: { $cstNode?: CstNodeLike; rules?: ReadonlyArray<{ $cstNode?: CstNodeLike }>; steps?: ReadonlyArray<{ $cstNode?: CstNodeLike }> },
    fullText: string,
    indent: string,
  ): BodyInsertions {
    const cst = body.$cstNode;
    const open = cst && firstToken(cst, '{');
    if (!cst || open === undefined) throw new Error('internal: view body insertion into a view without a `{ ... }` body');
    let firstChild: number | undefined;
    for (const item of [...(body.rules ?? []), ...(body.steps ?? [])]) {
      const offset = item.$cstNode?.offset;
      if (offset !== undefined && (firstChild === undefined || offset < firstChild)) firstChild = offset;
    }
    return new BodyInsertions(fullText, {
      open,
      close: findClosingBraceOffset(cst),
      indent,
      ...(firstChild !== undefined && { firstChild }),
    });
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

  /**
   * Lines before the construct starting at `offset`, a nested item of the
   * block (a rule, a step statement, a declaration).  Lines given for one
   * offset keep their order, after any properties placed there.
   */
  before(offset: number, snippet: string): void {
    this.positioned.push({ offset, snippet });
  }

  /** Lines at the end of the block (new nested declarations). */
  append(snippet: string): void {
    this.end.push(snippet);
  }

  /**
   * The lines placed before nested items, by offset in ascending order:
   * properties before the first nested declaration (when there is one), then
   * the {@link before} lines.
   */
  private anchored(): Array<[offset: number, lines: string]> {
    const { close, firstChild } = this.block;
    const byOffset = new Map<number, string>();
    const add = (offset: number, lines: string): void => {
      byOffset.set(offset, (byOffset.get(offset) ?? '') + lines);
    };
    if (this.properties.length > 0 && firstChild !== undefined && firstChild < close) add(firstChild, this.properties.join(''));
    for (const { offset, snippet } of this.positioned) add(offset, snippet);
    return [...byOffset].sort(([a], [b]) => a - b);
  }

  /** Whether the properties go at the end of the block (no nested declaration to precede). */
  private propertiesAtEnd(): boolean {
    const { close, firstChild } = this.block;
    return !(firstChild !== undefined && firstChild < close);
  }

  /**
   * The edits of an operation with these insertions placed.  `edits` are the
   * operation's other edits of the same document; edits inside the block are
   * folded into the rewrite of a block that is not laid out over several
   * lines, so they never overlap the insertion.
   */
  apply(edits: readonly TextEdit[]): TextEdit[] {
    if (this.start.length + this.properties.length + this.positioned.length + this.end.length === 0) return [...edits];
    const { fullText } = this;
    const { open, close } = this.block;
    if (this.block.create) {
      const lines = [...this.start, ...this.properties, ...this.positioned.map((p) => p.snippet), ...this.end].join('');
      return [...edits, { offset: open, end: open, newText: ' {\n' + lines + this.block.indent + '}' }];
    }
    const interior = fullText.substring(open + 1, close);
    if (/^\s*$/.test(interior)) {
      const lines = [...this.start, ...this.properties, ...this.positioned.map((p) => p.snippet), ...this.end].join('');
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
    const { open, close } = this.block;
    const edits: TextEdit[] = [];
    if (this.start.length > 0) {
      // At the end of the `{` line (before a trailing comment's line break).
      let at = fullText.indexOf('\n', open + 1);
      if (fullText[at - 1] === '\r') at--;
      edits.push({ offset: at, end: at, newText: '\n' + withoutFinalNewline(this.start.join('')) });
    }
    for (const [offset, lines] of this.anchored()) edits.push(insertBefore(fullText, offset, lines, others));
    let atEnd = this.propertiesAtEnd() ? this.properties.join('') : '';
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
   * its own.  Properties go before the first nested declaration, the
   * {@link before} lines before their item.
   */
  private rewriteBlock(edits: readonly TextEdit[]): TextEdit[] {
    const { fullText } = this;
    const { open, close, indent } = this.block;
    const from = open + 1;
    const inside: TextEdit[] = [];
    const outside: TextEdit[] = [];
    for (const edit of edits) {
      if (edit.offset >= from && edit.end <= close) inside.push(edit);
      else if (edit.end <= from || edit.offset >= close) outside.push(edit);
      else throw new Error('internal: an edit overlaps the boundary of the block it inserts into');
    }
    const anchored = this.anchored();
    const splits = anchored.map(([offset]) => offset);
    for (const e of inside) {
      if (e.offset !== e.end && splits.some((split) => e.offset < split && e.end > split)) {
        throw new Error('internal: an edit overlaps the nested item it inserts before');
      }
    }
    const part = (start: number, stop: number): string => {
      const own = inside.filter((e) =>
        e.offset === e.end ? e.offset >= start && (e.offset < stop || stop === close) : e.offset >= start && e.end <= stop,
      );
      const local = own.map((e) => ({ offset: e.offset - start, end: e.end - start, newText: e.newText }));
      return applyEdits(fullText.substring(start, stop), local).trim();
    };
    const asLines = (text: string): string => (text === '' ? '' : this.innerIndent + text + '\n');
    let content = '';
    let start = from;
    for (const [offset, lines] of anchored) {
      content += asLines(part(start, offset)) + lines;
      start = offset;
    }
    content += asLines(part(start, close));
    const atEnd = this.propertiesAtEnd() ? this.properties.join('') : '';
    const newText = '\n' + this.start.join('') + content + atEnd + this.end.join('') + indent;
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
