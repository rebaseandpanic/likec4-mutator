/**
 * Text-edit operations and checks that target the steps of dynamic views.
 */
import { isLikeC4Id, isReferenceForm } from '../parser/grammar.js';
import type { ParsedDocument } from '../parser/types.js';
import type { ViewDeclaration, ViewStepStatementEntry } from '../query/view-index.js';
import type { ViewReferenceResolver } from '../query/view-resolver.js';
import type { WorkspaceIndex } from '../query/workspace-index.js';
import { BodyInsertions } from './body-layout.js';
import { generateStep, type GenerateStepOpts } from './codegen.js';
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
 * @param field - The option holding the step: `step`, `steps[i]`
 */
export function checkViewStep(
  view: ViewDeclaration,
  step: ViewStepSpec,
  resolver: ViewReferenceResolver,
  workspace: WorkspaceIndex,
  field: string,
): Omit<GenerateStepOpts, 'indent'> {
  if (typeof step !== 'object' || step === null) {
    throw new InvalidWriteError(field, `expected a step { source, target, ... }, got ${JSON.stringify(step)}`);
  }
  const endpoint = (key: 'source' | 'target'): string => {
    const text: unknown = step[key];
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
  if (isDescendant(source, target) || isDescendant(target, source)) {
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
    if (typeof step.kind !== 'string' || !isLikeC4Id(step.kind)) {
      throw new InvalidWriteError(`${field}.kind`, `${JSON.stringify(step.kind)} is not a relationship kind name`);
    }
    if (!resolver.isRelationshipKind(step.kind)) {
      throw new InvalidWriteError(
        `${field}.kind`,
        `relationship kind '${step.kind}' is not declared by a specification of the loaded files (\`specification { relationship ${step.kind} }\`)`,
      );
    }
    if (direction === 'backward') {
      throw new InvalidWriteError(
        `${field}.kind`,
        `a backward step cannot have a relationship kind: LikeC4 has no connector for both (write it forward, or without the kind)`,
      );
    }
  }
  if (step.navigateTo !== undefined) {
    if (typeof step.navigateTo !== 'string' || !isLikeC4Id(step.navigateTo)) {
      throw new InvalidWriteError(`${field}.navigateTo`, `${JSON.stringify(step.navigateTo)} is not a view id`);
    }
    if (resolver.resolveViewText(step.navigateTo, 'dynamic') === undefined) {
      throw new InvalidWriteError(`${field}.navigateTo`, `'${step.navigateTo}' is not a declared dynamic view; a step navigates to dynamic views only`);
    }
  }
  for (const key of STRING_FIELDS) {
    if (step[key] !== undefined && typeof step[key] !== 'string') {
      throw new InvalidWriteError(`${field}.${key}`, `${JSON.stringify(step[key])} is not a string`);
    }
  }
  const style = Object.fromEntries(STYLE_FIELDS.flatMap((key) => (step[key] === undefined ? [] : [[key, step[key]]])));
  checkStyle(style, 'relationship', workspace, field);

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
 * declaration without a body gets one.
 */
export function insertStepEdits(
  doc: ParsedDocument,
  view: ViewDeclaration,
  insertion: StepInsertion,
  text: (indent: string) => string,
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
    return inserts.apply([]);
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
  return inserts.apply([]);
}

/** The text of a single step statement at `indent`. */
export function stepText(fields: Omit<GenerateStepOpts, 'indent'>): (indent: string) => string {
  return (indent) => generateStep({ indent, ...fields });
}
