/**
 * Placement of a construct written at the top level of a `deployment` or
 * `views` block (D4, D11, D27, D41): the file it goes to, and the block it is
 * appended to or the new block that is created for it.
 */
import type { ParsedDocument } from '../parser/types.js';
import { mergeOrder } from '../query/workspace-index.js';
import { getNodeIndent } from './indent.js';
import { BodyInsertions } from './body-layout.js';
import type { CstNodeLike } from './cst-helpers.js';
import type { TextEdit } from './text-edit.js';
import { lineEndingOf, withLineEnding } from './text-edit.js';
import { checkFile, InvalidWriteError } from './write-checks.js';

/** Keyword of a top-level block a construct can be placed in. */
export type BlockKeyword = 'deployment' | 'views';

/** A top-level `deployment` / `views` block node with its CST. */
export interface TopLevelBlockNode {
  $type?: string;
  $cstNode?: CstNodeLike;
}

/** Where a construct is written. */
export interface BlockPlacement<B extends TopLevelBlockNode = TopLevelBlockNode> {
  /** File the construct is written to */
  file: string;
  /**
   * The block it is appended to; undefined when a new block is appended at
   * the end of `file`
   */
  block?: B;
}

/** Property of the document AST holding the blocks of each keyword. */
const BLOCKS_PROPERTY: Readonly<Record<BlockKeyword, string>> = {
  deployment: 'deployments',
  views: 'views',
};

/** What a write of each keyword places, for the error without any loaded file. */
const PLACED: Readonly<Record<BlockKeyword, string>> = {
  deployment: 'the deployment model',
  views: 'the view',
};

/**
 * Choose where a construct of a `keyword` block is written.  The choice
 * branches on `file` first:
 *
 * - **Explicit `file`** (must be a loaded file): that file's first `keyword`
 *   block, else a new block at the end of that file.  No other file is
 *   consulted.
 * - **No `file`:** the first `keyword` block of the first file, in LikeC4's
 *   document order, that has one; else a new block at the end of the first
 *   file with a `model` block; else of the first file.
 *
 * @param documents - Every loaded document by file name
 * @param file      - The caller's `file` option
 * @throws {InvalidWriteError} on `file` when `file` is not a loaded file, or
 *   when no file is loaded
 */
export function chooseBlockPlacement<B extends TopLevelBlockNode>(
  keyword: BlockKeyword,
  documents: ReadonlyMap<string, ParsedDocument>,
  file: string | undefined,
): BlockPlacement<B> {
  if (file !== undefined) {
    checkFile(file, documents.keys());
    return placementIn<B>(keyword, file, documents.get(file)!);
  }
  const ordered = mergeOrder([...documents].map(([name, doc]) => ({ file: name, ast: doc.ast })));
  const withBlock = ordered.find((doc) => firstBlock(keyword, documents.get(doc.file!)!) !== undefined);
  if (withBlock) return placementIn<B>(keyword, withBlock.file!, documents.get(withBlock.file!)!);
  const withModel = ordered.find((doc) => ((doc.ast as { models?: unknown[] }).models ?? []).length > 0);
  const chosen = withModel ?? ordered[0];
  if (!chosen) {
    throw new InvalidWriteError('file', `no file is loaded, so there is no file to write ${PLACED[keyword]} to`);
  }
  return { file: chosen.file! };
}

/**
 * The TextEdit that writes `snippet` at `placement` in `doc` (the document
 * of `placement.file`): appended to the end of the chosen block, or wrapped
 * in a new `keyword { ... }` block appended at the end of the file, after a
 * blank line.  Line breaks are written with the file's line ending.
 *
 * @param snippet - Produces the construct's text (one or more lines, without
 *                  the final line break) for the given indentation
 */
export function blockInsertEdit(
  keyword: BlockKeyword,
  doc: ParsedDocument,
  placement: BlockPlacement,
  snippet: (indent: string) => string,
): TextEdit {
  const { fullText } = doc;
  const eol = lineEndingOf(fullText);
  const blockCst = placement.block?.$cstNode;
  if (blockCst) {
    const inserts = BodyInsertions.forBlock(blockCst, fullText, getNodeIndent(placement.block, fullText));
    inserts.append(snippet(inserts.innerIndent) + '\n');
    const [edit] = inserts.apply([]);
    if (!edit) throw new Error(`internal: no edit for the ${keyword} block insertion`);
    return withLineEnding([edit], eol)[0]!;
  }
  const separator = fullText === '' ? '' : /\r?\n$/.test(fullText) ? '\n' : '\n\n';
  const newText = `${separator}${keyword} {\n${snippet('  ')}\n}\n`;
  return withLineEnding([{ offset: fullText.length, end: fullText.length, newText }], eol)[0]!;
}

/** The placement in `file`: its first `keyword` block, else a new block. */
function placementIn<B extends TopLevelBlockNode>(keyword: BlockKeyword, file: string, doc: ParsedDocument): BlockPlacement<B> {
  const block = firstBlock<B>(keyword, doc);
  return block ? { file, block } : { file };
}

/** The first `keyword` block of `doc` that has a CST node. */
function firstBlock<B extends TopLevelBlockNode>(keyword: BlockKeyword, doc: ParsedDocument): B | undefined {
  const blocks = ((doc.ast as unknown as Record<string, B[] | undefined>)[BLOCKS_PROPERTY[keyword]] ?? []);
  return blocks.find((block) => block.$cstNode !== undefined);
}
