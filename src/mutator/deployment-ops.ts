/**
 * Text-edit operations that target the deployment model.
 *
 * Each function accepts pre-parsed documents plus contextual arguments and
 * returns the TextEdits that produce the desired structural change; the
 * mutator applies them atomically.
 */
import type { ParsedDocument } from '../parser/types.js';
import type {
  DeploymentAstNode,
  DeploymentDeclaration,
  DeploymentFrame,
  DeploymentIndex,
  DeploymentRelationRef,
} from '../query/deployment-index.js';
import type { DeploymentResolver } from '../query/deployment-resolver.js';
import { mergeOrder } from '../query/workspace-index.js';
import type { TextEdit } from './text-edit.js';
import { lineEndingOf, withLineEnding } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import { BodyInsertions } from './body-layout.js';
import type { BodyOwnerNode, CstNodeLike } from './cst-helpers.js';
import type { ElementStyle } from './codegen.js';
import type { UpdateElementPatch } from './element-ops.js';
import { checkFile, InvalidWriteError } from './write-checks.js';

/** Options of `LikeC4Mutator.addDeploymentNode`. */
export interface AddDeploymentNodeOpts {
  /** Node name: one identifier; the node's id is the parent's id + `.` + name */
  name: string;
  /** Deployment node kind, declared by a specification (`deploymentNode vm`) */
  kind: string;
  /** Title, written inline after the kind (`''` is written as `''`) */
  title?: string;
  /** Summary, written in the body */
  summary?: string;
  /** Description, written in the body */
  description?: string;
  /** Technology, written in the body (a node has no inline technology) */
  technology?: string;
  /** Tags, declared by a specification; a leading `#` is optional */
  tags?: string[];
  /** Links, each a URL with an optional label */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata: key → value, or a list of values */
  metadata?: Record<string, string | string[]>;
  /** Style, as for an element */
  style?: ElementStyle;
  /**
   * File of a root node (one of the loaded files; see
   * {@link chooseDeploymentPlacement}).  Not accepted for a child node,
   * which is written in its parent's declaration.
   */
  file?: string;
}

/** Options of `LikeC4Mutator.addDeploymentInstance`. */
export interface AddDeploymentInstanceOpts {
  /**
   * The deployed element, written after `instanceOf` as given (`app.api`)
   * and resolved as LikeC4 links `instanceOf`: the document's model scope
   * and the root elements, then unique descendants
   */
  element: string;
  /**
   * Instance name: one identifier; the instance's id is the node's id + `.`
   * + name.  Without it the instance is written unnamed and its name is the
   * last segment of `element` as written
   */
  name?: string;
  /** Title, written inline after the element (`''` is written as `''`) */
  title?: string;
  /** Summary, written in the body */
  summary?: string;
  /** Description, written in the body */
  description?: string;
  /** Technology, written in the body (an instance has no inline technology) */
  technology?: string;
  /** Tags, declared by a specification; a leading `#` is optional */
  tags?: string[];
  /** Links, each a URL with an optional label */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata: key → value, or a list of values */
  metadata?: Record<string, string | string[]>;
  /** Style, as for an element */
  style?: ElementStyle;
  /**
   * Not accepted: an instance is written in the declaration of its node.  A
   * value is rejected on `file`.
   */
  file?: never;
}

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
 * Patch of `LikeC4Mutator.updateDeploymentNode`: the fields of an element
 * patch, with the same semantics (strings, tags and links replace, style
 * merges per field, metadata merges with `null` deleting a key).
 */
export type UpdateDeploymentNodePatch = UpdateElementPatch;

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

/**
 * The one declaration of deployment node `id`: the id must be declared
 * exactly once, and as a node.  Used for the node a write addresses and for
 * the parent a child is added to.
 *
 * @param field - The option that holds `id` (`id`, `parent`)
 * @throws {InvalidWriteError} on `field` when nothing is declared with the
 *   id, when it is an instance, or when it is declared more than once
 *   (naming the declarations)
 */
export function nodeDeclaration(index: DeploymentIndex, id: string, field: string): DeploymentDeclaration {
  const declarations = index.declarations(id);
  const [declaration] = declarations;
  if (!declaration) {
    throw new InvalidWriteError(field, `${JSON.stringify(id)} is not the id of a deployment node of the loaded files`);
  }
  if (declarations.length > 1) {
    const candidates = declarations.map((d) => `a ${d.type} in '${d.file ?? ''}'`).join(', ');
    throw new InvalidWriteError(field, `'${id}' is declared ${declarations.length} times (${candidates}); it is ambiguous`);
  }
  if (declaration.type !== 'node') {
    throw new InvalidWriteError(field, `'${id}' is an instance, not a deployment node`);
  }
  return declaration;
}

/**
 * The TextEdit that writes `snippet` at the end of the body of the
 * declaration `owner` in `doc`, or — when the declaration has no body —
 * gives it a body `{ ... }` holding the snippet.
 *
 * @param snippet - Produces the construct's text (one or more lines, without
 *                  the final line break) for the given indentation
 */
export function declarationBodyInsertEdit(
  doc: ParsedDocument,
  owner: DeploymentAstNode,
  snippet: (indent: string) => string,
): TextEdit {
  const { fullText } = doc;
  const node = owner as BodyOwnerNode;
  const indent = getNodeIndent(owner, fullText);
  if (!node.body?.$cstNode) {
    const cst = node.$cstNode;
    if (!cst) throw new Error('internal: a deployment declaration without a position');
    return { offset: cst.end, end: cst.end, newText: ` {\n${snippet(indent + '  ')}\n${indent}}` };
  }
  const inserts = BodyInsertions.forBody(node, fullText, indent);
  inserts.append(snippet(inserts.innerIndent) + '\n');
  const [edit] = inserts.apply([]);
  if (!edit) throw new Error('internal: no edit for the body insertion');
  return edit;
}

/** True when deployment id `id` is `root` or lies below it. */
export function isInSubtree(id: string, root: string): boolean {
  return id === root || id.startsWith(root + '.');
}

/**
 * True when frames `frames` (of a relationship or declaration) lie inside
 * the subtree of `root`: in the body of a node or instance of the subtree,
 * or in an `extend` block of one.
 */
export function isNestedInSubtree(frames: readonly DeploymentFrame[], root: string): boolean {
  return frames.some((frame) => isInSubtree(frame.type === 'extend' ? frame.target : frame.id, root));
}

/**
 * True when the source or the target written on `relation` resolves into
 * the subtree of `root` (a node or instance of it, or an element stepped
 * into through an instance of it).  Each endpoint is resolved on its own,
 * so a relationship whose other endpoint does not resolve still counts.
 */
export function relationEndpointInSubtree(
  resolver: DeploymentResolver,
  relation: DeploymentRelationRef,
  root: string,
): boolean {
  return (['source', 'target'] as const).some((role) => {
    const ref = relation.node[role] as Parameters<DeploymentResolver['resolveReference']>[0] | undefined;
    const target = ref && resolver.resolveReference(ref);
    return target !== undefined && 'deployment' in target && isInSubtree(target.deployment, root);
  });
}

/**
 * The references in the rules of deployment views that resolve into the
 * subtree of `root`, each as `'<reference>' in view '<name>' ('<file>')`, in
 * document order.
 */
export function viewReferencesIntoSubtree(index: DeploymentIndex, resolver: DeploymentResolver, root: string): string[] {
  const out: string[] = [];
  index.documents.forEach(({ file }, document) => {
    for (const reference of resolver.viewReferences(document)) {
      const target = reference.target;
      if (target === undefined || !('deployment' in target) || !isInSubtree(target.deployment, root)) continue;
      out.push(`'${reference.text}' in view '${viewName(reference.node) ?? ''}' ('${file ?? ''}')`);
    }
  });
  return out;
}

/** Name of the view enclosing AST node `node`. */
function viewName(node: DeploymentAstNode): string | undefined {
  let current = node as { $type?: string; $container?: unknown; name?: string } | undefined;
  while (current && current.$type !== 'DeploymentView') current = current.$container as typeof current;
  return current?.name;
}

