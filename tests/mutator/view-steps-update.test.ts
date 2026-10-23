/**
 * `updateViewStep` (US-10, D31, D36, D38; rows 78–81 of the lc4m-15.29 test
 * matrix): token-level patches of single steps and chain segments, D38 on
 * the final state, and the rejections.
 *
 * Expected texts are written by hand from the patch and the input (the
 * whole file is compared, so every untouched byte is checked); expected
 * sequences are LikeC4 1.60.0's computed sequence before the write with the
 * patched step changed (SEQ); every accepted write passes the conventions
 * of `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, type ViewStepPatch } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type { ViewStepAddress } from '../../src/query/types.js';
import { computedViews, expectValidLikeC4 } from '../helpers/likec4-model.js';
import { editedLines, expectStepSequence, expectValidViewWrite, stepSequence, type SequenceGroup, type SequenceStep } from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

/** The write is rejected on `field` and changes nothing (BI). */
function expectRejected(m: LikeC4Mutator, write: () => unknown, field: string): void {
  const files = m.serialize();
  const views = m.listViews();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error, 'the write is rejected').toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(files);
  expect(m.listViews()).toEqual(views);
}

const MODEL = `specification {
  element system
  element service
  relationship async
  color brand #3366ff
}
model {
  app = system {
    api = service
    db = service
  }
  other = system {
    api = service
  }
  user = system
}
`;
const STEP0 = "    user -> app.api 'Calls' {\n      // keep this comment\n      technology 'http'\n      color red\n    }\n";
const STEP1 = '    app.api -[async]-> app.db\n';
const STEP2 = "    app.db <- user 'Reads'\n";
const CHAIN = "    user -> app.api -[async]-> app.db -> app.api 'returns' -> user\n";
const OPT = '    opt {\n      app.db -> user\n    }\n';
const REST = '  dynamic view later {\n    user -> app.db\n  }\n  view index {\n    include *\n  }\n';

/** The workspace with the statements of the flow view replaced as given. */
function workspace(statements: { step0?: string; step1?: string; step2?: string; chain?: string } = {}): Record<string, string> {
  const flow = `  dynamic view flow {\n${statements.step0 ?? STEP0}${statements.step1 ?? STEP1}${statements.step2 ?? STEP2}${statements.chain ?? CHAIN}${OPT}  }\n`;
  return { 'm.c4': `${MODEL}views {\n${flow}${REST}}\n` };
}
const BASE = workspace();

/** Replace the step at index `index` of the flat step list of `groups` by `patch(step)`. */
function patchStep(index: number, patch: (step: SequenceStep) => SequenceStep): (groups: SequenceGroup[]) => SequenceGroup[] {
  return (groups) => {
    let i = 0;
    return groups.map((group) => ({ ...group, steps: group.steps.map((step) => (i++ === index ? patch(step) : step)) }));
  };
}

/** The accepted patch: the expected text, Wv and SEQ. */
async function expectPatched(
  address: ViewStepAddress,
  patch: ViewStepPatch,
  expected: Record<string, string>,
  edit: (groups: SequenceGroup[]) => SequenceGroup[],
): Promise<LikeC4Mutator> {
  await expectValidLikeC4(BASE);
  const m = LikeC4Mutator.fromFiles(BASE);
  expect(m.updateViewStep('flow', address, patch)).toEqual({ changedFiles: ['m.c4'] });
  const after = m.serialize();
  expect(after).toEqual(expected);
  await expectValidViewWrite(m, BASE, editedLines(BASE, after, 'm.c4'));
  await expectStepSequence(BASE, after, 'flow', edit);
  return m;
}

// ---------------------------------------------------------------------------
// Row 78: single steps
// ---------------------------------------------------------------------------

describe('updateViewStep on a single step (row 78)', SLOW, () => {
  it.each([
    {
      name: 'replaces the title',
      address: { path: [0] },
      patch: { title: 'Invokes' },
      statements: { step0: STEP0.replace("'Calls'", "'Invokes'") },
      edit: patchStep(0, (s) => ({ ...s, title: 'Invokes' })),
    },
    {
      name: 'removes the title given null',
      address: { path: [0] },
      patch: { title: null },
      statements: { step0: STEP0.replace(" 'Calls'", '') },
      edit: patchStep(0, (s) => ({ ...s, title: null })),
    },
    {
      name: 'adds a title',
      address: { path: [1] },
      patch: { title: 'Stores' },
      statements: { step1: "    app.api -[async]-> app.db 'Stores'\n" },
      edit: patchStep(1, (s) => ({ ...s, title: 'Stores' })),
    },
    {
      name: 'replaces the source',
      address: { path: [1] },
      patch: { source: 'user' },
      statements: { step1: '    user -[async]-> app.db\n' },
      edit: patchStep(1, (s) => ({ ...s, source: 'user' })),
    },
    {
      name: 'turns a forward step backward, written <- (D36)',
      address: { path: [0] },
      patch: { direction: 'backward' },
      statements: { step0: STEP0.replace('user -> app.api', 'app.api <- user') },
      edit: patchStep(0, (s) => ({ ...s, backward: true })),
    },
    {
      name: 'turns a backward step forward',
      address: { path: [2] },
      patch: { direction: 'forward' },
      statements: { step2: "    user -> app.db 'Reads'\n" },
      edit: patchStep(2, (s) => ({ ...s, backward: false })),
    },
    {
      name: 'writes the kind in dot form',
      address: { path: [1] },
      patch: { kindForm: 'dot' },
      statements: { step1: '    app.api .async app.db\n' },
      edit: (g: SequenceGroup[]) => g,
    },
    {
      name: 'removes the kind given null',
      address: { path: [1] },
      patch: { kind: null },
      statements: { step1: '    app.api -> app.db\n' },
      edit: patchStep(1, ({ kind: _kind, ...s }) => s),
    },
    {
      name: 'patches body properties per field, keeping the comment',
      address: { path: [0], text: STEP0.trim() },
      patch: { technology: 'grpc', color: null, notes: 'Retried' },
      statements: { step0: "    user -> app.api 'Calls' {\n      // keep this comment\n      technology 'grpc'\n      notes 'Retried'\n    }\n" },
      edit: (g: SequenceGroup[]) => g,
    },
    {
      name: 'creates a body for a step without one',
      address: { path: [2] },
      patch: { navigateTo: 'later', color: 'brand' },
      statements: { step2: "    app.db <- user 'Reads' {\n      navigateTo later\n      color brand\n    }\n" },
      edit: (g: SequenceGroup[]) => g,
    },
  ] as Array<{ name: string; address: ViewStepAddress; patch: ViewStepPatch; statements: Parameters<typeof workspace>[0]; edit: (g: SequenceGroup[]) => SequenceGroup[] }>)(
    '$name',
    async ({ address, patch, statements, edit }) => {
      const m = await expectPatched(address, patch, workspace(statements), edit);
      const read = m.getView('flow')!.steps![address.path[0]!]!;
      expect(read.type).toBe('step');
    },
  );
});

// ---------------------------------------------------------------------------
// Row 79: chain segments (D31)
// ---------------------------------------------------------------------------

describe('chain segments (row 79)', SLOW, () => {
  it('changes the title, body strings, navigateTo and style of a segment in place', async () => {
    await expectPatched(
      { path: [3], segment: 1 },
      { title: 'Stores', notes: 'Kept', navigateTo: 'later', color: 'brand' },
      workspace({
        chain: "    user -> app.api -[async]-> app.db 'Stores' {\n      notes 'Kept'\n      navigateTo later\n      color brand\n    } -> app.api 'returns' -> user\n",
      }),
      patchStep(4, (s) => ({ ...s, title: 'Stores' })),
    );
  });

  it('changes the kind of a returning segment, which stays backward', async () => {
    // OP: LikeC4 parses the third and fourth segments as backward (they return along the chain).
    const backward = async (files: Record<string, string>) =>
      (await stepSequence(files, 'flow')).flatMap((g) => g.steps.map((s) => s.backward));
    expect((await backward(BASE)).slice(3, 7)).toEqual([false, false, true, true]);
    const m = await expectPatched(
      { path: [3], segment: 2 },
      { kind: 'async' },
      workspace({ chain: "    user -> app.api -[async]-> app.db -[async]-> app.api 'returns' -> user\n" }),
      patchStep(5, (s) => ({ ...s, kind: 'async' })),
    );
    expect((await backward(m.serialize())).slice(3, 7)).toEqual([false, false, true, true]);
  });

  it.each([
    { name: 'an endpoint', address: { path: [3], segment: 2 }, patch: { target: 'user' }, field: 'patch.target' },
    { name: 'the source of the first segment', address: { path: [3], segment: 0 }, patch: { source: 'app.db' }, field: 'patch.source' },
    { name: 'the direction', address: { path: [3], segment: 1 }, patch: { direction: 'backward' }, field: 'patch.direction' },
  ] as Array<{ name: string; address: ViewStepAddress; patch: ViewStepPatch; field: string }>)('rejects changing $name of a segment, naming the chain', ({ address, patch, field }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', address, patch), field);
  });

  it('rejects addressing a chain without a segment on segment', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [3] }, { title: 'x' }), 'segment');
  });
});

// ---------------------------------------------------------------------------
// Row 80: D38 on the final state
// ---------------------------------------------------------------------------

describe('D38 on the final state (row 80)', SLOW, () => {
  it('rejects turning a kind-bearing step backward', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [1] }, { direction: 'backward' }), 'patch.direction');
  });

  it('accepts turning it backward when the same patch removes the kind', async () => {
    await expectPatched(
      { path: [1] },
      { direction: 'backward', kind: null },
      workspace({ step1: '    app.db <- app.api\n' }),
      patchStep(1, ({ kind: _kind, ...s }) => ({ ...s, backward: true })),
    );
  });

  it('rejects a kind on a backward step', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [2] }, { kind: 'async' }), 'patch.kind');
  });

  it('accepts a kind when the same patch makes the step forward', async () => {
    await expectPatched(
      { path: [2] },
      { kind: 'async', direction: 'forward' },
      workspace({ step2: "    user -[async]-> app.db 'Reads'\n" }),
      patchStep(2, (s) => ({ ...s, kind: 'async', backward: false })),
    );
  });
});

// ---------------------------------------------------------------------------
// Row 81: rejections
// ---------------------------------------------------------------------------

describe('updateViewStep rejections (row 81)', () => {
  it.each([
    { name: 'an ambiguous endpoint', patch: { source: 'api' }, field: 'patch.source' },
    { name: 'an endpoint that smuggles DSL', patch: { target: 'app.db { }' }, field: 'patch.target' },
    { name: 'a parent–child pair', patch: { source: 'app' }, field: 'patch.target' },
    { name: 'an undeclared kind', patch: { kind: 'nokind' }, field: 'patch.kind' },
    { name: 'navigateTo an element view', patch: { navigateTo: 'index' }, field: 'patch.navigateTo' },
    { name: 'an undeclared color', patch: { color: 'nocolor' }, field: 'patch.color' },
    { name: 'a string that is not a string', patch: { technology: 5 as unknown as string }, field: 'patch.technology' },
  ] as Array<{ name: string; patch: ViewStepPatch; field: string }>)('rejects $name on $field', ({ patch, field }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [1] }, patch), field);
  });

  it('rejects a text guard that does not match on text', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [1], text: 'app.api -> app.db' }, { title: 'x' }), 'text');
  });

  it('rejects a path into a stage-6 block on path', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [4, 0] }, { title: 'x' }), 'path');
  });

  it('rejects addressing a block that is not a step on path', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('flow', { path: [4] }, { title: 'x' }), 'path');
  });

  it('rejects an unknown id, an id declared in two files and a generated id on id', async () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateViewStep('nope', { path: [0] }, { title: 'x' }), 'id');
    const twice = LikeC4Mutator.fromFiles({ ...BASE, 'z.c4': 'views {\n  dynamic view flow {\n    user -> app.db\n  }\n}\n' });
    expectRejected(twice, () => twice.updateViewStep('flow', { path: [0] }, { title: 'x' }), 'id');
    const files = { ...BASE, 'z.c4': 'views {\n  view of app {\n    include *\n  }\n}\n' };
    const generated = Object.keys(await computedViews(files)).filter((id) => !['flow', 'later', 'index'].includes(id));
    expect(generated).toHaveLength(1);
    const unnamed = LikeC4Mutator.fromFiles(files);
    expectRejected(unnamed, () => unnamed.updateViewStep(generated[0]!, { path: [0] }, { title: 'x' }), 'id');
  });
});
