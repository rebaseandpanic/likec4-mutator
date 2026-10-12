/**
 * Text-edit operations that target the deployment model.
 *
 * Each function accepts pre-parsed documents plus contextual arguments and
 * returns the TextEdits that produce the desired structural change; the
 * mutator applies them atomically.
 */
import type { ParsedDocument } from '../parser/types.js';
import { mergeOrder } from '../query/workspace-index.js';
import type { TextEdit } from './text-edit.js';
import { lineEndingOf, withLineEnding } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import { BodyInsertions } from './body-layout.js';
import type { CstNodeLike } from './cst-helpers.js';
import { checkFile, InvalidWriteError } from './write-checks.js';

/** A `deployment { ... }` block of a document (`ModelDeployments`). */
interface DeploymentBlockNode {
  $cstNode?: CstNodeLike;
}

/**
 * Where a root deployment construct (a root node, a relationship at the
 * top level of a `deployment` block, an `extend <node>` block) is written.
 */
export interface DeploymentPlacement {
  /** File the construct is written to */
  file: string;
  /**
   * The `deployment` block it is appended to; undefined when a new block is
   * appended at the end of `file`
   */
  block?: DeploymentBlockNode;
}

/**
 * Choose where a root deployment construct is written (D4, D11).  The
 * choice branches on `file` first:
 *
 * - **Explicit `file`** (must be a loaded file): that file's first
 *   `deployment` block, else a new block at the end of that file.  No
 *   other file is consulted.
 * - **No `file`:** the first `deployment` block of the first file, in
 *   LikeC4's document order, that has one; else a new block at the end of
 *   the first file with a `model` block; else of the first file.
 *
 * @param documents - Every loaded document by file name
 * @param file      - The caller's `file` option
 * @throws {InvalidWriteError} on `file` when `file` is not a loaded file, or
 *   when no file is loaded
 */
export function chooseDeploymentPlacement(
  documents: ReadonlyMap<string, ParsedDocument>,
  file: string | undefined,
): DeploymentPlacement {
  if (file !== undefined) {
    checkFile(file, documents.keys());
    return placementIn(file, documents.get(file)!);
  }
  const ordered = mergeOrder([...documents].map(([name, doc]) => ({ file: name, ast: doc.ast })));
  const withBlock = ordered.find((doc) => firstDeploymentBlock(documents.get(doc.file!)!) !== undefined);
  if (withBlock) return placementIn(withBlock.file!, documents.get(withBlock.file!)!);
  const withModel = ordered.find((doc) => ((doc.ast as { models?: unknown[] }).models ?? []).length > 0);
  const chosen = withModel ?? ordered[0];
  if (!chosen) {
    throw new InvalidWriteError('file', 'no file is loaded, so there is no file to write the deployment model to');
  }
  return { file: chosen.file! };
}

/**
 * The TextEdit that writes `snippet` at `placement` in `doc` (the document
 * of `placement.file`): appended to the end of the chosen `deployment`
 * block, or wrapped in a new `deployment { ... }` block appended at the end
 * of the file, after a blank line.  Line breaks are written with the file's
 * line ending.
 *
 * @param snippet - Produces the construct's text (one or more lines, without
 *                  the final line break) for the given indentation
 */
export function deploymentInsertEdit(
  doc: ParsedDocument,
  placement: DeploymentPlacement,
  snippet: (indent: string) => string,
): TextEdit {
  const { fullText } = doc;
  const eol = lineEndingOf(fullText);
  const blockCst = placement.block?.$cstNode;
  if (blockCst) {
    const inserts = BodyInsertions.forBlock(blockCst, fullText, getNodeIndent(placement.block, fullText));
    inserts.append(snippet(inserts.innerIndent) + '\n');
    const [edit] = inserts.apply([]);
    if (!edit) throw new Error('internal: no edit for the deployment block insertion');
    return withLineEnding([edit], eol)[0]!;
  }
  const separator = fullText === '' ? '' : /\r?\n$/.test(fullText) ? '\n' : '\n\n';
  const newText = `${separator}deployment {\n${snippet('  ')}\n}\n`;
  return withLineEnding([{ offset: fullText.length, end: fullText.length, newText }], eol)[0]!;
}

/** The placement in `file`: its first `deployment` block, else a new block. */
function placementIn(file: string, doc: ParsedDocument): DeploymentPlacement {
  const block = firstDeploymentBlock(doc);
  return block ? { file, block } : { file };
}

/** The first `deployment` block of `doc` that has a CST node. */
function firstDeploymentBlock(doc: ParsedDocument): DeploymentBlockNode | undefined {
  const blocks = ((doc.ast as { deployments?: DeploymentBlockNode[] }).deployments ?? []);
  return blocks.find((block) => block.$cstNode !== undefined);
}
