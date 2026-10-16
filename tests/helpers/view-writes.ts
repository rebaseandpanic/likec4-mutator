/**
 * The obligations of an accepted view write (the conventions of the
 * lc4m-15.29 test matrix), checked against LikeC4 1.59.4 through the oracle
 * of `likec4-model.ts`; nothing here reads the library's own model except
 * `listViews()`, which is the value under test in Wv.
 *
 *  - **Wv** (valid input): the output validates, every declared view reads
 *    back equal to LikeC4's parse, SURV and LINK.
 *  - **Wi** (input with LikeC4 errors): the error multiset after the write
 *    equals the one before (minus named errors), SURV and LINK.
 *  - **SURV**: `expectComputedViewsSurvive`.
 *  - **LINK** (INV-8): every view reference LikeC4 resolved before is linked
 *    to the same target after, matched by view, role, text and ordinal.
 *  - **CMP / SEQ**: the computed nodes and step sequence of a view equal
 *    those of a hand-written expected text.
 */
import { expect } from 'vitest';
import {
  computedViews,
  parsedViews,
  expectComputedViewsSurvive,
  expectValidLikeC4,
  expectViewsAgreeWithLikeC4,
  linkedViewReferences,
  validateLikeC4,
  type LinkedViewReference,
  type ReportedView,
} from './likec4-model.js';

/** A write under test: its output files and its own reading of the views. */
export interface WrittenViews {
  serialize(): Record<string, string>;
  listViews(): ReportedView[];
}

/** Which references LINK leaves out. */
export interface LinkOptions {
  /** A reference of the input that lies in text the write edits or removes on purpose */
  editedBefore?: (reference: LinkedViewReference) => boolean;
  /** A reference of the output that lies in text the write inserted */
  insertedAfter?: (reference: LinkedViewReference) => boolean;
}

/** The match key of each reference: view, role, text and ordinal among equal ones. */
function keyed(references: LinkedViewReference[]): Map<string, LinkedViewReference> {
  const counts = new Map<string, number>();
  const result = new Map<string, LinkedViewReference>();
  for (const reference of references) {
    const prefix = JSON.stringify([reference.view, reference.role, reference.text]);
    const ordinal = counts.get(prefix) ?? 0;
    counts.set(prefix, ordinal + 1);
    result.set(`${prefix}#${ordinal}`, reference);
  }
  return result;
}

/** LINK: every view reference LikeC4 resolved in `before` is linked to the same target in `after`. */
export async function expectLinksKept(
  before: Record<string, string>,
  after: Record<string, string>,
  options: LinkOptions = {},
): Promise<void> {
  const was = keyed((await linkedViewReferences(before)).filter((r) => !options.editedBefore?.(r)));
  const now = keyed((await linkedViewReferences(after)).filter((r) => !options.insertedAfter?.(r)));
  const changed: string[] = [];
  for (const [key, reference] of was) {
    if (reference.target === null) continue;
    const target = now.get(key)?.target ?? null;
    if (JSON.stringify(target) !== JSON.stringify(reference.target)) {
      changed.push(`${reference.at} ${reference.role} '${reference.text}': ${JSON.stringify(reference.target)} → ${JSON.stringify(target)}`);
    }
  }
  expect(changed, 'view references LikeC4 resolved before the write and links differently after it').toEqual([]);
}

/** Wv: the accepted write on a valid input. */
export async function expectValidViewWrite(
  written: WrittenViews,
  before: Record<string, string>,
  options: LinkOptions & { removedView?: string } = {},
): Promise<void> {
  const after = written.serialize();
  await expectValidLikeC4(after);
  await expectViewsAgreeWithLikeC4(written.listViews(), after);
  await expectComputedViewsSurvive(before, after, options.removedView);
  await expectLinksKept(before, after, options);
}

/** LikeC4's errors of `files` as `<file>: <message>`, line numbers dropped, sorted. */
export async function errorMultiset(files: Record<string, string>): Promise<string[]> {
  return (await validateLikeC4(files)).map((e) => e.replace(/^([^:]+):\d+: /, '$1: ')).sort();
}

/**
 * Wi: the accepted write on an input that already has LikeC4 errors.  The
 * errors after the write equal those before, minus exactly `resolved` (each
 * `<file>: <message>`, once per occurrence).
 */
export async function expectViewWriteOnInvalidInput(
  written: WrittenViews,
  before: Record<string, string>,
  options: LinkOptions & { removedView?: string; resolved?: string[] } = {},
): Promise<void> {
  const after = written.serialize();
  const expected = await errorMultiset(before);
  for (const error of options.resolved ?? []) {
    const index = expected.indexOf(error);
    expect(index, `the error the write resolves is reported before it: ${error}`).not.toBe(-1);
    expected.splice(index, 1);
  }
  expect(await errorMultiset(after)).toEqual(expected);
  await expectComputedViewsSurvive(before, after, options.removedView);
  await expectLinksKept(before, after, options);
}

/**
 * CMP (and SEQ for a dynamic view): view `id` computed from `actual` has
 * the nodes and the step sequence it has computed from `expected`, a
 * hand-written text.  Steps are compared by content and `par` grouping,
 * not by their positional ids.
 */
export async function expectSameComputedView(
  actual: Record<string, string>,
  expected: Record<string, string>,
  id: string,
): Promise<void> {
  const [a, e] = await Promise.all([computedViews(actual), computedViews(expected)]);
  expect(e[id], `LikeC4 computes view '${id}' from the expected text`).toBeDefined();
  expect(a[id], `LikeC4 computes view '${id}' from the output`).toBeDefined();
  expect([...a[id]!.nodes].sort()).toEqual([...e[id]!.nodes].sort());
  const sequence = (view: (typeof a)[string]) =>
    view.steps.map(({ step, parallel, source, target, title, kind, backward }) => ({
      step,
      parallel,
      source,
      target,
      title,
      kind,
      backward,
    }));
  expect(sequence(a[id]!)).toEqual(sequence(e[id]!));
}

/** `value` without the positional `astPath` keys LikeC4 gives parsed steps. */
function withoutAstPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAstPaths);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'astPath').map(([key, v]) => [key, withoutAstPaths(v)]));
}

/**
 * SEQ for a write that must leave the steps of the dynamic view `id` as
 * they were (a rule write): LikeC4's computed step sequence — endpoints,
 * titles, kinds, `par` grouping — and its parsed steps, whose
 * `isBackward` is the direction of each step, are the same in `after` as
 * in `before`.  The computed `dir: 'back'` is not compared: it follows the
 * actor order, which the view's rules decide.
 */
export async function expectSameStepSequence(
  before: Record<string, string>,
  after: Record<string, string>,
  id: string,
): Promise<void> {
  const sequence = async (files: Record<string, string>) =>
    (await computedViews(files))[id]!.steps.map(({ step, parallel, source, target, title, kind }) => ({
      step,
      parallel,
      source,
      target,
      title,
      kind,
    }));
  const parsed = async (files: Record<string, string>) =>
    withoutAstPaths((await parsedViews(files)).find((e) => e.view.id === id)!.view.steps);
  expect(await sequence(after)).toEqual(await sequence(before));
  expect(await parsed(after)).toEqual(await parsed(before));
}

/** One step of a computed sequence: endpoints, label and kind as computed, direction as parsed. */
export interface SequenceStep {
  source: string;
  target: string;
  title: string | null;
  kind?: string;
  /** `isBackward` of LikeC4's parsed step */
  backward: boolean;
}

/** The steps that share one number of the computed sequence: one step, or the steps of a `par` block. */
export interface SequenceGroup {
  parallel: boolean;
  steps: SequenceStep[];
}

/** The parsed steps of a dynamic view in sequence order, the inner steps of every block included. */
function flattenParsed(nodes: unknown): Array<{ isBackward?: boolean }> {
  const result: Array<{ isBackward?: boolean }> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const n = node as Record<string, unknown>;
    let block = false;
    for (const key of ['steps', 'branches']) {
      if (Array.isArray(n[key])) {
        block = true;
        walk(n[key]);
      }
    }
    for (const key of ['try', 'catch', 'finally']) {
      const part = n[key] as { steps?: unknown } | undefined;
      if (part?.steps) {
        block = true;
        walk(part.steps);
      }
    }
    if (!block && typeof n.source === 'string') result.push(n as { isBackward?: boolean });
  };
  walk(nodes);
  return result;
}

/**
 * LikeC4's computed step sequence of the dynamic view `id`, grouped by step
 * number, each step with its parsed direction (the computed `dir` follows
 * the actor order, see `LikeC4ComputedStep.backward`).
 */
export async function stepSequence(files: Record<string, string>, id: string): Promise<SequenceGroup[]> {
  const computed = (await computedViews(files))[id]!.steps;
  const parsed = flattenParsed((await parsedViews(files)).find((e) => e.view.id === id)!.view.steps);
  expect(parsed.length, `LikeC4 parses as many steps of '${id}' as it computes`).toBe(computed.length);
  const groups: SequenceGroup[] = [];
  computed.forEach((step, i) => {
    const entry: SequenceStep = {
      source: step.source,
      target: step.target,
      title: step.title,
      ...(step.kind !== undefined && { kind: step.kind }),
      backward: parsed[i]!.isBackward === true,
    };
    const last = groups.at(-1);
    if (last && step.parallel !== undefined && last.parallel && computed[i - 1]?.step === step.step) last.steps.push(entry);
    else groups.push({ parallel: step.parallel !== undefined, steps: [entry] });
  });
  return groups;
}

/**
 * SEQ for a step write: the sequence of `id` after the write equals the one
 * before it with `edit` applied — the spec's transformation, written by the
 * test (insert, patch, reorder, regroup, drop).
 */
export async function expectStepSequence(
  before: Record<string, string>,
  after: Record<string, string>,
  id: string,
  edit: (groups: SequenceGroup[]) => SequenceGroup[],
): Promise<void> {
  expect(await stepSequence(after, id)).toEqual(edit(await stepSequence(before, id)));
}
