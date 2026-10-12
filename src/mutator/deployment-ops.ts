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
import type { DeploymentResolver, DeploymentTarget } from '../query/deployment-resolver.js';
import type { DeploymentEndpoint, DeploymentRelationshipInfo } from '../query/types.js';
import { mergeOrder } from '../query/workspace-index.js';
import type { TextEdit } from './text-edit.js';
import { lineEndingOf, withLineEnding } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import { BodyInsertions } from './body-layout.js';
import type { BodyOwnerNode, CstNodeLike } from './cst-helpers.js';
import type { ElementStyle, RelationshipStyle } from './codegen.js';
import type { UpdateElementPatch } from './element-ops.js';
import type { MetadataPatch } from './metadata-ops.js';
import { checkFile, checkReferenceForm, InvalidWriteError } from './write-checks.js';

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

/** Options of `LikeC4Mutator.addDeploymentRelationship`. */
export interface AddDeploymentRelationshipOpts {
  /** Relationship kind, declared by a specification (`relationship calls`); written as `-[kind]->` */
  kind?: string;
  /** Written as `<->` (or `-[kind]<->`) */
  bidirectional?: boolean;
  /** Title, written inline after the target (`''` is written as `''`) */
  title?: string;
  /** Description, written in the body (LikeC4 ignores an inline one) */
  description?: string;
  /** Technology, written in the body (LikeC4 ignores an inline one) */
  technology?: string;
  /** Tags, declared by a specification; a leading `#` is optional */
  tags?: string[];
  /** Links, each a URL with an optional label */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata: key → value, or a list of values */
  metadata?: Record<string, string | string[]>;
  /** Style, as for a relationship */
  style?: RelationshipStyle;
  /**
   * File the relationship is written to (one of the loaded files; see
   * {@link chooseDeploymentPlacement})
   */
  file?: string;
}

/**
 * Selects one deployment relationship by what
 * `LikeC4Mutator.listDeploymentRelationships` reports: its endpoints, and
 * optionally its kind and title.  A bidirectional relationship matches its
 * endpoints in either order.
 */
export interface DeploymentRelationshipSelector {
  /** Source endpoint: deployment id, plus the element FQN when it steps into an instance's element */
  source: DeploymentEndpoint;
  /** Target endpoint, as `source` */
  target: DeploymentEndpoint;
  /** Kind, as reported (`calls`); narrows the match */
  kind?: string;
  /** Title, as reported (own, else the kind's); narrows the match */
  title?: string;
}

/**
 * Patch of `LikeC4Mutator.updateDeploymentRelationship`.  Strings, tags and
 * links replace, metadata merges with `null` deleting a key, style merges
 * per field.
 */
export interface UpdateDeploymentRelationshipPatch {
  /** Title, written inline after the target */
  title?: string;
  /** Description, written in the body */
  description?: string;
  /** Technology, written in the body */
  technology?: string;
  /** Tags; an empty array clears them */
  tags?: string[];
  /** Links; an empty array clears them */
  links?: Array<{ url: string; label?: string }>;
  /** Metadata patch: key → value to set, or `null` to delete the key */
  metadata?: MetadataPatch;
  /** Style fields to set */
  style?: RelationshipStyle;
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
 * Patch of `LikeC4Mutator.updateDeploymentInstance`: the fields of an
 * element patch.  Strings, tags and links replace the instance's own values,
 * style merges per field into its own style, and metadata is patched on the
 * instance's effective map (see the method).
 */
export type UpdateDeploymentInstancePatch = UpdateElementPatch;

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

/**
 * The AST node a construct written at `placement` resolves its references
 * from: the chosen `deployment` block, or — for a new block — the document
 * itself (an empty block adds no names to the document's scopes).
 */
export function placementContainer(doc: ParsedDocument, placement: DeploymentPlacement): DeploymentAstNode {
  return (placement.block ?? doc.ast) as DeploymentAstNode;
}

/**
 * Form check of a relationship endpoint `{ id, element? }`: `id` is a
 * reference (identifiers joined by `.`) and `element`, when given, an FQN.
 *
 * @param field - The endpoint option (`source`, `target`)
 * @throws {InvalidWriteError} on `<field>` when the endpoint is not an
 *   object, on `<field>.id` / `<field>.element` for a malformed part
 */
export function checkEndpointForm(endpoint: DeploymentEndpoint, field: string): void {
  if (typeof endpoint !== 'object' || endpoint === null) {
    throw new InvalidWriteError(field, `expected an endpoint { id, element? }, got ${JSON.stringify(endpoint)}`);
  }
  checkReferenceForm(endpoint.id, `${field}.id`);
  if (endpoint.element !== undefined) checkReferenceForm(endpoint.element, `${field}.element`);
}

/**
 * The text a relationship endpoint `{ id, element? }` is written as, and
 * the target it links to from `container` (see {@link placementContainer}).
 *
 * `id` is written as given and must resolve, by LikeC4's deployment
 * scoping, to a node or an instance.  `element` is the FQN of an element
 * below the element that instance deploys, as reads report it; it is
 * written as the path from the instance's element (`{ id: 'prod.vm1.db',
 * element: 'app.db.replLog' }` for an instance of `app.db` is written
 * `prod.vm1.db.replLog`), and that text must link to exactly this element.
 *
 * @param field - The endpoint option (`source`, `target`)
 * @param where - The insertion point, for messages
 * @throws {InvalidWriteError} on `<field>.id` when `id` does not resolve to
 *   a node or instance (an unknown or ambiguous name, a logical element),
 *   or steps into an element itself; on `<field>.element` when `id` is not
 *   an instance, or `element` is not an element below the instance's
 *   element that the written path links to
 */
export function endpointText(
  index: DeploymentIndex,
  resolver: DeploymentResolver,
  endpoint: DeploymentEndpoint,
  container: DeploymentAstNode,
  field: string,
  where: string,
): { text: string; target: DeploymentTarget } {
  const { id, element } = endpoint;
  const resolved = resolver.resolveText(id, container);
  if (resolved === undefined || !('deployment' in resolved)) {
    throw new InvalidWriteError(
      `${field}.id`,
      `'${id}' does not resolve to one deployment node or instance from ${where} ` +
        `(a logical element is not a deployment endpoint; LikeC4 would report the relationship as not resolved)`,
    );
  }
  if (resolved.element !== undefined) {
    throw new InvalidWriteError(
      `${field}.id`,
      `'${id}' steps into element '${resolved.element}' of instance '${resolved.deployment}'; ` +
        `give the instance in id and the element FQN in element`,
    );
  }
  if (element === undefined) return { text: id, target: { deployment: resolved.deployment } };

  const declaration = index.declarations(resolved.deployment)[0];
  if (declaration?.type !== 'instance') {
    throw new InvalidWriteError(
      `${field}.element`,
      `'${id}' is the deployment node '${resolved.deployment}'; only an instance's element can be stepped into`,
    );
  }
  const base = resolver.instanceElement(declaration.node);
  if (base === undefined || !element.startsWith(base + '.')) {
    throw new InvalidWriteError(
      `${field}.element`,
      base === undefined
        ? `the element of instance '${resolved.deployment}' does not resolve, so '${element}' cannot be reached through it`
        : `'${element}' is not an element below '${base}', the element of instance '${resolved.deployment}'`,
    );
  }
  const text = `${id}.${element.slice(base.length + 1)}`;
  const linked = resolver.resolveText(text, container);
  if (!linked || !('deployment' in linked) || linked.deployment !== resolved.deployment || linked.element !== element) {
    throw new InvalidWriteError(
      `${field}.element`,
      `'${element}' is not an element of the loaded files reachable as '${text}' from ${where}`,
    );
  }
  return { text, target: { deployment: resolved.deployment, element } };
}

/**
 * Form check of a relationship selector: both endpoints as
 * {@link checkEndpointForm}, `kind` and `title` strings when given.
 *
 * @throws {InvalidWriteError} on `source` / `target` (and their `.id` /
 *   `.element`), `kind` or `title`
 */
export function checkSelectorForm(selector: DeploymentRelationshipSelector): void {
  if (typeof selector !== 'object' || selector === null) {
    throw new InvalidWriteError('source', `expected a selector { source, target, kind?, title? }, got ${JSON.stringify(selector)}`);
  }
  checkEndpointForm(selector.source, 'source');
  checkEndpointForm(selector.target, 'target');
  for (const field of ['kind', 'title'] as const) {
    if (selector[field] !== undefined && typeof selector[field] !== 'string') {
      throw new InvalidWriteError(field, `expected a string, got ${JSON.stringify(selector[field])}`);
    }
  }
}

/**
 * The one deployment relationship `selector` matches (see
 * {@link DeploymentRelationshipSelector}) among the relationships of the
 * index, compared with `reported` — what the reads report for them.
 *
 * @param relations - Every deployment relationship of the index
 * @param reported  - The relationships as listed by the reads
 * @throws {InvalidWriteError} on `source` when no relationship matches, or
 *   several do (naming them)
 */
export function selectDeploymentRelationship(
  relations: readonly DeploymentRelationRef[],
  reported: readonly DeploymentRelationshipInfo[],
  selector: DeploymentRelationshipSelector,
): { relation: DeploymentRelationRef; info: DeploymentRelationshipInfo } {
  const matches = reported.filter((info) => {
    if (selector.kind !== undefined && info.kind !== selector.kind) return false;
    if (selector.title !== undefined && info.title !== selector.title) return false;
    const forward = sameEndpoint(info.source, selector.source) && sameEndpoint(info.target, selector.target);
    const backward =
      info.bidirectional && sameEndpoint(info.source, selector.target) && sameEndpoint(info.target, selector.source);
    return forward || backward;
  });
  const [match] = matches;
  if (!match) {
    throw new InvalidWriteError(
      'source',
      `no deployment relationship ${describeSelector(selector)} is declared in the loaded files`,
    );
  }
  if (matches.length > 1) {
    throw new InvalidWriteError(
      'source',
      `${matches.length} deployment relationships match ${describeSelector(selector)} (` +
        matches.map(describeRelationship).join('; ') +
        `); narrow the selector by kind or title` +
        (matches.every((m) => m.kind === match.kind && m.title === match.title)
          ? ', or tell them apart by an edit first: they have the same endpoints, kind and title'
          : ''),
    );
  }
  const relation = relations.find(
    (r) => r.file === match.file && (r.node.$cstNode as { offset?: number } | undefined)?.offset === match.sourceRange.offset,
  );
  if (!relation) throw new Error('internal: a reported deployment relationship without its declaration');
  return { relation, info: match };
}

function sameEndpoint(reported: DeploymentEndpoint, selected: DeploymentEndpoint): boolean {
  return reported.id === selected.id && reported.element === selected.element;
}

function describeEndpoint(endpoint: DeploymentEndpoint): string {
  return endpoint.element === undefined ? `'${endpoint.id}'` : `'${endpoint.id}' (element '${endpoint.element}')`;
}

function describeSelector(selector: DeploymentRelationshipSelector): string {
  const narrowing = [
    selector.kind !== undefined ? `kind '${selector.kind}'` : undefined,
    selector.title !== undefined ? `title '${selector.title}'` : undefined,
  ].filter((part) => part !== undefined);
  return (
    `from ${describeEndpoint(selector.source)} to ${describeEndpoint(selector.target)}` +
    (narrowing.length > 0 ? ` with ${narrowing.join(' and ')}` : '')
  );
}

/** `'a' -> 'b' [kind k] ['title'] in '<file>' at line <n>`, for the candidates of an ambiguous selector. */
function describeRelationship(info: DeploymentRelationshipInfo): string {
  const arrow = info.bidirectional ? '<->' : '->';
  return (
    `${describeEndpoint(info.source)} ${arrow} ${describeEndpoint(info.target)}` +
    (info.kind !== undefined ? ` kind '${info.kind}'` : '') +
    (info.title !== undefined ? ` title '${info.title}'` : '') +
    ` in '${info.file ?? ''}' at line ${info.sourceRange.line + 1}`
  );
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
  const declaration = singleDeclaration(index, id, field, 'deployment node');
  if (declaration.type !== 'node') {
    throw new InvalidWriteError(field, `'${id}' is an instance, not a deployment node`);
  }
  return declaration;
}

/**
 * The one declaration of deployed instance `id`: the id must be declared
 * exactly once, and as an instance.
 *
 * @param field - The option that holds `id`
 * @throws {InvalidWriteError} on `field` when nothing is declared with the
 *   id, when it is a node, or when it is declared more than once (naming the
 *   declarations)
 */
export function instanceDeclaration(index: DeploymentIndex, id: string, field: string): DeploymentDeclaration {
  const declaration = singleDeclaration(index, id, field, 'deployed instance');
  if (declaration.type !== 'instance') {
    throw new InvalidWriteError(field, `'${id}' is a deployment node, not an instance`);
  }
  return declaration;
}

/** The only declaration of `id`, of any type (see {@link nodeDeclaration}). */
function singleDeclaration(index: DeploymentIndex, id: string, field: string, what: string): DeploymentDeclaration {
  const declarations = index.declarations(id);
  const [declaration] = declarations;
  if (!declaration) {
    throw new InvalidWriteError(field, `${JSON.stringify(id)} is not the id of a ${what} of the loaded files`);
  }
  if (declarations.length > 1) {
    const candidates = declarations.map(describeDeclaration).join(', ');
    throw new InvalidWriteError(field, `'${id}' is declared ${declarations.length} times (${candidates}); it is ambiguous`);
  }
  return declaration;
}

/** `a <type> in '<file>' at line <n>`, for the candidates of an ambiguous id. */
function describeDeclaration(declaration: DeploymentDeclaration): string {
  const line = (declaration.node.$cstNode as { range?: { start: { line: number } } } | undefined)?.range?.start.line;
  const what = declaration.type === 'node' ? 'a node' : 'an instance';
  return `${what} in '${declaration.file ?? ''}'${line === undefined ? '' : ` at line ${line + 1}`}`;
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

