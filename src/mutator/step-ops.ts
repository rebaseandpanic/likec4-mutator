/**
 * Text-edit operations and checks that target the steps of dynamic views.
 */
import { isLikeC4Id, isReferenceForm } from '../parser/grammar.js';
import type { ParsedDocument } from '../parser/types.js';
import type { ViewAstNode, ViewDeclaration, ViewStepStatementEntry } from '../query/view-index.js';
import { contributesSteps, type ViewReferenceResolver } from '../query/view-resolver.js';
import type { WorkspaceIndex } from '../query/workspace-index.js';
import { BodyInsertions } from './body-layout.js';
import { escapeString, generateStep, type GenerateStepOpts } from './codegen.js';
import { buildRemovalEdit } from './cst-helpers.js';
import { getNodeIndent } from './indent.js';
import type { TextEdit } from './text-edit.js';
import { checkStyle, InvalidWriteError } from './write-checks.js';

/**
 * A step of a dynamic view as a write gives it (US-9): `source` and
 * `target` in LikeC4's sense — the element the interaction goes from and
 * the one it goes to (D36) —, written as references resolved in the view's
 * document; `direction` `backward` is written `target <- source`.
 */
export interface ViewStepSpec {
  source: string;
  target: string;
  /** Default `forward` */
  direction?: 'forward' | 'backward';
  /** A declared relationship kind; a forward step only (D38) */
  kind?: string;
  /** How the kind is written: `-[kind]->` (`bracket`, default) or `.kind` (`dot`) */
  kindForm?: 'bracket' | 'dot';
  /** Title written after the target */
  title?: string;
  description?: string;
  technology?: string;
  notes?: string;
  notation?: string;
  /** The id of a dynamic view */
  navigateTo?: string;
  color?: string;
  line?: string;
  head?: string;
  tail?: string;
}

const STRING_FIELDS = ['title', 'description', 'technology', 'notes', 'notation'] as const;
const STYLE_FIELDS = ['color', 'line', 'head', 'tail'] as const;

/** Whether `fqn` is below `ancestor`. */
function isDescendant(fqn: string, ancestor: string): boolean {
  return fqn.startsWith(`${ancestor}.`);
}

/**
 * Check a step for the dynamic view `view` and return its generator fields
 * (without the indentation).  Rejected, on `<field>.<name>`: an endpoint
 * that is not a reference or does not resolve to an element in the view's
 * document scope (LikeC4 links step endpoints there, D25); endpoints that
 * are a parent and its descendant (LikeC4: `Invalid parent-child
 * relationship`; a step from an element to itself is valid) — on `target`; a direction or kind form that
 * is not one of its values; a kind that is not a declared relationship
 * kind, or a kind on a backward step (D38, no connector has both); a
 * `navigateTo` that is not a dynamic view; a body string that is not a
 * string; a style value as `checkStyle` rejects it.
 *
 * @param field   - The option holding the step: `step`, `steps[i]`, `patch`
 * @param patched - Check only these fields (the fields a patch gives) —
 *                  and D38 on the whole step; by default every field
 */
export function checkViewStep(
  view: ViewDeclaration,
  step: ViewStepSpec,
  resolver: ViewReferenceResolver,
  workspace: WorkspaceIndex,
  field: string,
  patched?: ReadonlySet<string>,
): Omit<GenerateStepOpts, 'indent'> {
  const checks = (key: string): boolean => patched === undefined || patched.has(key);
  if (typeof step !== 'object' || step === null) {
    throw new InvalidWriteError(field, `expected a step { source, target, ... }, got ${JSON.stringify(step)}`);
  }
  const endpoint = (key: 'source' | 'target'): string | undefined => {
    const text: unknown = step[key];
    if (!checks('source') && !checks('target')) return undefined;
    if (!checks(key) && typeof text === 'string') return resolver.resolveElementText(view, text);
    if (typeof text !== 'string' || !isReferenceForm(text)) {
      throw new InvalidWriteError(`${field}.${key}`, `${JSON.stringify(text)} is not an element reference: expected LikeC4 identifiers joined by '.' (e.g. app.api)`);
    }
    const fqn = resolver.resolveElementText(view, text);
    if (fqn === undefined) {
      throw new InvalidWriteError(
        `${field}.${key}`,
        `'${text}' does not resolve to an element in the document of view '${view.id}' (a name must be unique in that document, or qualified); LikeC4 would report: Could not resolve reference`,
      );
    }
    return fqn;
  };
  const source = endpoint('source');
  const target = endpoint('target');
  if (source !== undefined && target !== undefined && (isDescendant(source, target) || isDescendant(target, source))) {
    throw new InvalidWriteError(
      `${field}.target`,
      `'${step.target}' (${target}) and '${step.source}' (${source}) are a parent and its descendant; LikeC4 rejects such a step (Invalid parent-child relationship)`,
    );
  }

  const direction = step.direction ?? 'forward';
  if (direction !== 'forward' && direction !== 'backward') {
    throw new InvalidWriteError(`${field}.direction`, `${JSON.stringify(step.direction)} is not a direction: expected forward or backward`);
  }
  const kindForm = step.kindForm ?? 'bracket';
  if (kindForm !== 'bracket' && kindForm !== 'dot') {
    throw new InvalidWriteError(`${field}.kindForm`, `${JSON.stringify(step.kindForm)} is not a kind form: expected bracket or dot`);
  }
  if (step.kind !== undefined) {
    if (checks('kind') && (typeof step.kind !== 'string' || !isLikeC4Id(step.kind))) {
      throw new InvalidWriteError(`${field}.kind`, `${JSON.stringify(step.kind)} is not a relationship kind name`);
    }
    if (checks('kind') && !resolver.isRelationshipKind(step.kind)) {
      throw new InvalidWriteError(
        `${field}.kind`,
        `relationship kind '${step.kind}' is not declared by a specification of the loaded files (\`specification { relationship ${step.kind} }\`)`,
      );
    }
    if (direction === 'backward') {
      throw new InvalidWriteError(
        patched === undefined || patched.has('kind') ? `${field}.kind` : `${field}.direction`,
        `a backward step cannot have a relationship kind: LikeC4 has no connector for both (write it forward, or without the kind)`,
      );
    }
  }
  if (step.navigateTo !== undefined && checks('navigateTo')) {
    if (typeof step.navigateTo !== 'string' || !isLikeC4Id(step.navigateTo)) {
      throw new InvalidWriteError(`${field}.navigateTo`, `${JSON.stringify(step.navigateTo)} is not a view id`);
    }
    if (resolver.resolveViewText(step.navigateTo, 'dynamic') === undefined) {
      throw new InvalidWriteError(`${field}.navigateTo`, `'${step.navigateTo}' is not a declared dynamic view; a step navigates to dynamic views only`);
    }
  }
  for (const key of STRING_FIELDS) {
    if (checks(key) && step[key] !== undefined && typeof step[key] !== 'string') {
      throw new InvalidWriteError(`${field}.${key}`, `${JSON.stringify(step[key])} is not a string`);
    }
  }
  const style = Object.fromEntries(STYLE_FIELDS.flatMap((key) => (step[key] === undefined ? [] : [[key, step[key]]])));
  checkStyle(Object.fromEntries(Object.entries(style).filter(([key]) => checks(key))), 'relationship', workspace, field);

  return {
    source: step.source,
    target: step.target,
    direction,
    ...(step.kind !== undefined && { kind: step.kind, kindForm }),
    ...Object.fromEntries(STRING_FIELDS.flatMap((key) => (step[key] === undefined ? [] : [[key, step[key]]]))),
    ...(step.navigateTo !== undefined && { navigateTo: step.navigateTo }),
    ...(Object.keys(style).length > 0 && { style }),
  };
}

/** Where a new step statement goes, resolved from an insertion path (D24). */
export interface StepInsertion {
  /** The `par` block it goes into; undefined at the top level */
  parallel?: ViewStepStatementEntry;
  /** The statement it goes before; undefined to append (after the last statement of its level) */
  before?: ViewStepStatementEntry;
}

/**
 * The insertion boundary `path` of the dynamic view `view`: `[i]` before
 * top-level statement `i` (`[n]` after the last one), `[i, j]` before
 * statement `j` of the `par` block at `i` (`[i, n]` at its end); no path
 * means after the last top-level statement.
 *
 * @throws {InvalidWriteError} on `field` for a path that does not exist, or
 *   whose block is not a `par` (a chain, a stage-6 block, a single step)
 */
export function stepInsertion(view: ViewDeclaration, path: readonly number[] | undefined, field = 'path'): StepInsertion {
  if (view.type !== 'dynamic') {
    throw new InvalidWriteError(field, `view '${view.id}' is a ${view.type} view; only dynamic views have steps`);
  }
  if (path === undefined) return {};
  if (!Array.isArray(path) || path.length === 0 || path.length > 2 || !path.every((i) => Number.isInteger(i) && i >= 0)) {
    throw new InvalidWriteError(field, `${JSON.stringify(path)} is not a step path: expected [i] or [i, j] with non-negative integers`);
  }
  const [i, j] = path as [number, number | undefined];
  if (i > view.steps.length || (j !== undefined && i >= view.steps.length)) {
    throw new InvalidWriteError(field, `${JSON.stringify(path)}: view '${view.id}' has ${view.steps.length} top-level step statement(s)`);
  }
  if (j === undefined) return i < view.steps.length ? { before: view.steps[i]! } : {};
  const block = view.steps[i]!;
  if (block.form !== 'parallel') {
    const what = block.form === 'opaque' ? `an '${block.keyword ?? 'stage-6'}' block` : block.form === 'chain' ? 'a chain' : 'a single step';
    throw new InvalidWriteError(field, `${JSON.stringify(path)}: the statement at [${i}] is ${what}; steps go into a par block only`);
  }
  if (j > block.statements.length) {
    throw new InvalidWriteError(field, `${JSON.stringify(path)}: the par block at [${i}] has ${block.statements.length} statement(s)`);
  }
  return { parallel: block, ...(j < block.statements.length && { before: block.statements[j]! }) };
}

/**
 * The edits that write the statement produced by `text` (given the
 * indentation of its level) at `insertion` in the dynamic view `view`.  At
 * the top level, appending puts it right after the last step statement
 * (before whatever body item follows it); with no step statement, after the
 * last body item, or before it when that is an `autoLayout` rule.  A
 * declaration without a body gets one.  `others` are the operation's other
 * edits of the same document (see `BodyInsertions.apply`).
 */
export function insertStepEdits(
  doc: ParsedDocument,
  view: ViewDeclaration,
  insertion: StepInsertion,
  text: (indent: string) => string,
  others: readonly TextEdit[] = [],
): TextEdit[] {
  const { fullText } = doc;
  const indent = getNodeIndent(view.node, fullText);
  if (!view.body) {
    const end = view.node.$cstNode?.end;
    if (end === undefined) throw new Error(`internal: view '${view.id}' has no CST node`);
    return [{ offset: end, end, newText: ` {\n${text(indent + '  ')}\n${indent}}` }];
  }
  if (insertion.parallel) {
    const block = insertion.parallel.node;
    const cst = block.$cstNode;
    if (!cst) throw new Error('internal: par block without a CST node');
    const inserts = BodyInsertions.forBlock(cst as Parameters<typeof BodyInsertions.forBlock>[0], fullText, getNodeIndent(block, fullText));
    const line = text(inserts.innerIndent) + '\n';
    const anchor = insertion.before?.node.$cstNode?.offset;
    if (anchor === undefined) inserts.append(line);
    else inserts.before(anchor, line);
    return inserts.apply(others);
  }
  const inserts = BodyInsertions.forViewBody(view.body as Parameters<typeof BodyInsertions.forViewBody>[0], fullText, indent);
  const line = text(inserts.innerIndent) + '\n';
  let anchor = insertion.before?.node.$cstNode?.offset;
  if (insertion.before === undefined) {
    const items = [...view.rules.map((r) => ({ node: r.node, layout: r.kind === 'autoLayout' })), ...view.steps.map((s) => ({ node: s.node, layout: false }))].sort(
      (a, b) => (a.node.$cstNode?.offset ?? 0) - (b.node.$cstNode?.offset ?? 0),
    );
    const lastStep = view.steps.at(-1);
    if (lastStep) {
      const end = lastStep.node.$cstNode?.end ?? 0;
      anchor = items.find((item) => (item.node.$cstNode?.offset ?? 0) >= end)?.node.$cstNode?.offset;
    } else if (items.at(-1)?.layout) {
      anchor = items.at(-1)!.node.$cstNode?.offset;
    }
  }
  if (anchor === undefined) inserts.append(line);
  else inserts.before(anchor, line);
  return inserts.apply(others);
}

/** The text of a single step statement at `indent`. */
export function stepText(fields: Omit<GenerateStepOpts, 'indent'>): (indent: string) => string {
  return (indent) => generateStep({ indent, ...fields });
}

/**
 * Patch of `LikeC4Mutator.updateViewStep` (US-10): each field given
 * replaces the step's value; `null` removes an optional one (`kind`,
 * `title`, a body string, `navigateTo`, a style field).  `source`,
 * `target` and `direction` are meant as for {@link ViewStepSpec} (D36).
 */
export interface ViewStepPatch {
  source?: string;
  target?: string;
  direction?: 'forward' | 'backward';
  kind?: string | null;
  kindForm?: 'bracket' | 'dot';
  title?: string | null;
  description?: string | null;
  technology?: string | null;
  notes?: string | null;
  notation?: string | null;
  navigateTo?: string | null;
  color?: string | null;
  line?: string | null;
  head?: string | null;
  tail?: string | null;
}

/** Fields of a chain segment a patch may change (D31). */
const SEGMENT_FIELDS: ReadonlySet<string> = new Set([
  'kind',
  'kindForm',
  'title',
  'description',
  'technology',
  'notes',
  'notation',
  'navigateTo',
  'color',
  'line',
  'head',
  'tail',
]);

/** Body keys of a step, as the grammar writes them. */
const BODY_KEYS = ['description', 'technology', 'notes', 'notation', 'navigateTo', 'color', 'line', 'head', 'tail'] as const;
type BodyKey = (typeof BODY_KEYS)[number];

/** A CST node, as far as a step patch reads it. */
interface StepCst {
  offset: number;
  end: number;
  text: string;
  hidden?: boolean;
  content?: StepCst[];
}

/** The leaves of `node`, hidden ones (comments) left out. */
function tokens(node: StepCst): StepCst[] {
  return node.content ? node.content.flatMap(tokens) : node.hidden ? [] : [node];
}

/** The step a segment node holds, as written, with the CST it needs. */
export interface WrittenStep {
  node: ViewAstNode;
  /** The left reference as written; undefined for a later chain segment (its source is the previous segment) */
  left?: ViewAstNode;
  right: ViewAstNode;
  backward: boolean;
  kind?: string;
  kindForm?: 'bracket' | 'dot';
  title?: string;
}

/** The step written in the segment node `node` (`Step` or `StepSeries`). */
export function writtenStep(node: ViewAstNode): WrittenStep {
  const later = node.$type === 'StepSeries';
  const dot = node.dotKind as ViewAstNode | undefined;
  const kind = ((node.kind as { $refText?: string } | undefined)?.$refText ?? (dot?.kind as { $refText?: string } | undefined)?.$refText) || undefined;
  return {
    node,
    ...(!later && { left: node.source as ViewAstNode }),
    right: node.target as ViewAstNode,
    backward: node.isBackward === true,
    ...(kind !== undefined && { kind, kindForm: dot ? 'dot' : 'bracket' }),
    ...(typeof node.title === 'string' && { title: node.title }),
  };
}

/** The connector of a step as the grammar writes it. */
function connector(backward: boolean, kind: string | undefined, form: 'bracket' | 'dot'): string {
  if (backward) return '<-';
  if (kind === undefined) return '->';
  return form === 'dot' ? `.${kind}` : `-[${kind}]->`;
}

/** The text of a body property `key` with `value`. */
function bodyLine(key: BodyKey, value: string): string {
  if (key === 'navigateTo' || STYLE_FIELDS.includes(key as (typeof STYLE_FIELDS)[number])) return `${key} ${value}`;
  return `${key} '${escapeString(value)}'`;
}

/** The result of {@link updateStepEdits}: the edits and the AST nodes they replace. */
export interface StepUpdate {
  edits: TextEdit[];
  /** Nodes whose text the edits replace or remove (their references do not survive) */
  removed: Set<object>;
}

/**
 * The edits that apply `patch` to the step `segment` (a `Step` or a later
 * chain segment `StepSeries`), whose final fields `final` the caller has
 * checked: the left and right references, the connector and the inline
 * title are replaced token by token when they change, body properties per
 * field (`null` removes one, a new one is added at the end of the body, a
 * missing body is created).  Everything else — comments included — is kept.
 */
export function updateStepEdits(
  doc: ParsedDocument,
  segment: ViewAstNode,
  patch: ViewStepPatch,
  final: { left?: string; right: string; backward: boolean; kind?: string; kindForm: 'bracket' | 'dot' },
): StepUpdate {
  const { fullText } = doc;
  const step = writtenStep(segment);
  const edits: TextEdit[] = [];
  const removed = new Set<object>();
  const span = (node: ViewAstNode): { offset: number; end: number } => node.$cstNode!;
  const replace = (node: ViewAstNode, text: string): void => {
    const { offset, end } = span(node);
    if (fullText.slice(offset, end) === text) return;
    edits.push({ offset, end, newText: text });
    removed.add(node);
  };

  if (step.left && final.left !== undefined) replace(step.left, final.left);
  replace(step.right, final.right);

  // The connector: the tokens between the left side (the left reference,
  // or the previous segment) and the right reference.
  const leftEnd = span((segment.source as ViewAstNode | undefined) ?? step.right).end;
  const rightStart = span(step.right).offset;
  const own = tokens(segment.$cstNode as unknown as StepCst);
  const between = own.filter((t) => t.offset >= leftEnd && t.end <= rightStart);
  const wanted = connector(final.backward, final.kind, final.kindForm);
  const current = connector(step.backward, step.kind, step.kindForm ?? 'bracket');
  if (wanted !== current && between.length > 0) {
    edits.push({ offset: between[0]!.offset, end: between.at(-1)!.end, newText: wanted });
  }

  // The inline title: the string token after the right reference.
  const custom = segment.custom as (ViewAstNode & { props?: ViewAstNode[] }) | undefined;
  const bodyStart = custom ? span(custom).offset : span(segment).end;
  const titleToken = own.find((t) => t.offset >= span(step.right).end && t.end <= bodyStart && /^['"]/.test(t.text));
  if (patch.title !== undefined) {
    if (patch.title === null) {
      if (titleToken) {
        let start = titleToken.offset;
        while (start > 0 && (fullText[start - 1] === ' ' || fullText[start - 1] === '\t')) start--;
        edits.push({ offset: start, end: titleToken.end, newText: '' });
      }
    } else {
      const text = `'${escapeString(patch.title)}'`;
      if (titleToken) edits.push({ offset: titleToken.offset, end: titleToken.end, newText: text });
      else edits.push({ offset: span(step.right).end, end: span(step.right).end, newText: ` ${text}` });
    }
  }

  // Body properties, per field.
  const indent = getNodeIndent(segment, fullText);
  const added: string[] = [];
  const props = custom?.props ?? [];
  for (const key of BODY_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const existing = props.filter((p) => p.key === key);
    if (value === null) {
      for (const prop of existing) {
        const { offset, end, newText } = buildRemovalEdit(fullText, span(prop).offset, span(prop).end);
        edits.push({ offset, end, newText });
        removed.add(prop);
      }
    } else if (existing.length > 0) {
      for (const prop of existing) replace(prop, bodyLine(key, value));
    } else {
      added.push(bodyLine(key, value));
    }
  }
  if (added.length === 0) return { edits, removed };
  if (!custom) {
    // After the title (kept or replaced), else after the right reference —
    // where a title this patch adds goes too, merged before the body.
    const at = titleToken && patch.title !== null ? titleToken.end : span(step.right).end;
    const lines = added.map((line) => `${indent}  ${line}\n`).join('');
    edits.push({ offset: at, end: at, newText: ` {\n${lines}${indent}}` });
    return { edits: mergeAtSameOffset(edits), removed };
  }
  const inserts = BodyInsertions.forBlock(span(custom) as Parameters<typeof BodyInsertions.forBlock>[0], fullText, indent);
  inserts.append(added.map((line) => `${inserts.innerIndent}${line}\n`).join(''));
  return { edits: inserts.apply(edits), removed };
}

/** Zero-width edits at one offset joined into one, in the order given. */
function mergeAtSameOffset(edits: TextEdit[]): TextEdit[] {
  const result: TextEdit[] = [];
  for (const edit of edits) {
    const last = result.find((e) => e.offset === edit.offset && e.end === edit.offset && edit.end === edit.offset);
    if (last) last.newText += edit.newText;
    else result.push({ ...edit });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Moving and removing step statements; par blocks (US-11, D37, D40)
// ---------------------------------------------------------------------------

/**
 * The text of the statement `entry` with the indentation of its first line
 * taken off its further lines, so that it can be written at another level
 * (see {@link indentedText}).
 */
export function statementText(doc: ParsedDocument, entry: ViewStepStatementEntry): string {
  const cst = entry.node.$cstNode;
  if (!cst) throw new Error('internal: step statement without a CST node');
  const indent = getNodeIndent(entry.node, doc.fullText);
  return doc.fullText
    .slice(cst.offset, cst.end)
    .split(/\r?\n/)
    .map((line, i) => (i === 0 || !line.startsWith(indent) ? (i === 0 ? line : line.trimStart()) : line.slice(indent.length)))
    .join('\n');
}

/** `text` (see {@link statementText}) written at `indent`: every line indented, empty lines kept empty. */
export function indentedText(text: string): (indent: string) => string {
  return (indent) =>
    text
      .split('\n')
      .map((line) => (line === '' ? '' : indent + line))
      .join('\n');
}

/** The edit that removes the statement or block `node` with the lines it fills. */
export function removeStatementEdit(doc: ParsedDocument, node: ViewAstNode): TextEdit {
  const cst = node.$cstNode;
  if (!cst) throw new Error('internal: step statement without a CST node');
  const { offset, end, newText } = buildRemovalEdit(doc.fullText, cst.offset, cst.end);
  return { offset, end, newText };
}

/**
 * What leaving the `par` block `block` (taking away its statement `leaving`)
 * does to it (D40): `remove` when nothing is left, so the block goes with it;
 * `keep` when a remaining statement still contributes a step to LikeC4.
 *
 * @throws {InvalidWriteError} on `field` when only statements LikeC4
 *   discards would be left: LikeC4 would drop the block silently, and its
 *   remaining text is not deleted for the caller
 */
export function leaveParallel(
  view: ViewDeclaration,
  block: ViewStepStatementEntry,
  leaving: ViewStepStatementEntry,
  resolver: ViewReferenceResolver,
  field: string,
): 'remove' | 'keep' {
  const rest = block.statements.filter((s) => s !== leaving);
  if (rest.length === 0) return 'remove';
  if (rest.some((s) => contributesSteps(s, view, resolver))) return 'keep';
  throw new InvalidWriteError(
    field,
    `the par block at ${JSON.stringify(block.path)} would hold only statements LikeC4 discards (${rest.map((s) => s.keyword ?? s.form).join(', ')}), and LikeC4 would drop the block; remove or fill those first`,
  );
}

/** The top-level index and, inside a `par` block, the inner index of `path`. */
function levelOf(path: readonly number[]): { top: number; inner?: number } {
  return path.length === 2 ? { top: path[0]!, inner: path[1]! } : { top: path[0]! };
}

/**
 * The top-level boundary `path` (`[i]`, `[n]` to append) as an insertion,
 * skipping the statements in `moved`: a boundary at a statement that leaves
 * goes before the next one that stays.
 */
export function topLevelInsertion(
  view: ViewDeclaration,
  path: readonly number[] | undefined,
  moved: ReadonlySet<ViewStepStatementEntry>,
  field: string,
): StepInsertion {
  const insertion = stepInsertion(view, path, field);
  if (insertion.parallel) throw new InvalidWriteError(field, `${JSON.stringify(path)}: expected a top-level boundary [i]`);
  if (!insertion.before) return insertion;
  const from = view.steps.indexOf(insertion.before);
  const next = view.steps.slice(from).find((s) => !moved.has(s));
  return next ? { before: next } : {};
}

/** Whether moving the statement at `from` to the boundary `to` leaves it where it is. */
export function isOwnBoundary(from: readonly number[], to: readonly number[]): boolean {
  if (from.length !== to.length) return false;
  const a = levelOf(from);
  const b = levelOf(to);
  if (a.inner === undefined) return b.top === a.top || b.top === a.top + 1;
  return a.top === b.top && (b.inner === a.inner || b.inner === a.inner! + 1);
}
