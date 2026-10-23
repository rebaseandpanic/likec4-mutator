/**
 * `moveViewStep`, `removeViewStep` and `addViewParallel` (US-11, D31, D37,
 * D40; rows 82–88 and 96 of the lc4m-15.29 test matrix): the D37 move
 * examples, moves in and out of `par` blocks, removals, the D40 block rules
 * with the `try` / `alt` contribution classes, and the rejections.
 *
 * Expected texts are written by hand from the spec's examples and the
 * input; expected sequences are LikeC4 1.60.0's computed sequence before the
 * write, transformed as the spec says (SEQ); every accepted write passes the
 * conventions of `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { computedViews, expectValidLikeC4, parsedViews, validateLikeC4 } from '../helpers/likec4-model.js';
import { editedLines, expectStepSequence, expectValidViewWrite, type LinkOptions, type SequenceGroup, type SequenceStep } from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

/** The write is rejected on `field` and changes nothing (BI); the error. */
function expectRejected(m: LikeC4Mutator, write: () => unknown, field: string): InvalidWriteError {
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
  return error as InvalidWriteError;
}

const MODEL = `specification {
  element system
}
model {
  a = system
  b = system
  c = system
  d = system
}
`;

/** One file with the dynamic view `v` holding `body` (lines at 4 spaces) and another view. */
const files = (body: string, crlf = false): Record<string, string> => {
  const text = `${MODEL}views {\n  dynamic view v {\n${body}  }\n  dynamic view other {\n    a -> d\n  }\n}\n`;
  return { 'm.c4': crlf ? text.replace(/\n/g, '\r\n') : text };
};

const s = (source: string, target: string, title: string | null = null): SequenceStep => ({ source, target, title, backward: false });
const one = (step: SequenceStep): SequenceGroup => ({ parallel: false, steps: [step] });
const par = (...steps: SequenceStep[]): SequenceGroup => ({ parallel: true, steps });

/** The accepted write: expected text, Wv and SEQ against literal groups. */
async function expectAccepted(
  m: LikeC4Mutator,
  before: Record<string, string>,
  expected: Record<string, string>,
  groups: SequenceGroup[] | ((g: SequenceGroup[]) => SequenceGroup[]),
  removal = false,
): Promise<Record<string, string>> {
  const after = m.serialize();
  expect(after).toEqual(expected);
  // A removal takes its references with it; a move keeps them, matched by ordinal.
  const link: LinkOptions = removal ? editedLines(before, after, 'm.c4') : {};
  await expectValidViewWrite(m, before, link);
  await expectStepSequence(before, after, 'v', typeof groups === 'function' ? groups : () => groups);
  return after;
}

/** `groups` without the steps from `source` to `target`; groups left empty go too. */
const without = (source: string, target: string) => (groups: SequenceGroup[]): SequenceGroup[] =>
  groups
    .map((g) => ({ ...g, steps: g.steps.filter((x) => !(x.source === source && x.target === target)) }))
    .filter((g) => g.steps.length > 0);

const A = "    a -> b 'A'\n";
const B = "    b -> c 'B'\n";
const C = "    c -> d 'C'\n";

// ---------------------------------------------------------------------------
// Row 82: the D37 examples
// ---------------------------------------------------------------------------

describe('D37 move examples (row 82)', SLOW, () => {
  const ABC = files(A + B + C);

  it.each([
    { name: '[0] → [2] gives [B, A, C]', from: [0], to: [2], body: B + A + C, groups: [one(s('b', 'c', 'B')), one(s('a', 'b', 'A')), one(s('c', 'd', 'C'))] },
    { name: '[0] → [3] gives [B, C, A]', from: [0], to: [3], body: B + C + A, groups: [one(s('b', 'c', 'B')), one(s('c', 'd', 'C')), one(s('a', 'b', 'A'))] },
    { name: '[2] → [0] gives [C, A, B]', from: [2], to: [0], body: C + A + B, groups: [one(s('c', 'd', 'C')), one(s('a', 'b', 'A')), one(s('b', 'c', 'B'))] },
  ])('$name', async ({ from, to, body, groups }) => {
    await expectValidLikeC4(ABC);
    const m = LikeC4Mutator.fromFiles(ABC);
    expect(m.moveViewStep('v', { path: from }, to)).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [] });
    await expectAccepted(m, ABC, files(body), groups);
  });

  it('[0] → [2, 0] with C a par block moves A into it', async () => {
    const before = files(A + B + '    par {\n  ' + C + '    }\n');
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.moveViewStep('v', { path: [0] }, [2, 0]);
    await expectAccepted(m, before, files(B + '    par {\n  ' + A + '  ' + C + '    }\n'), [one(s('b', 'c', 'B')), par(s('a', 'b', 'A'), s('c', 'd', 'C'))]);
  });

  it.each([
    { name: '[0] → [0]', to: [0] },
    { name: '[0] → [1]', to: [1] },
  ])('$name changes nothing and writes nothing', ({ to }) => {
    const m = LikeC4Mutator.fromFiles(ABC);
    expect(m.moveViewStep('v', { path: [0] }, to)).toEqual({ changedFiles: [], removedParallelBlocks: [] });
    expect(m.serialize()).toEqual(ABC);
  });
});

// ---------------------------------------------------------------------------
// Row 83: moves in and out of par blocks
// ---------------------------------------------------------------------------

describe('moves in and out of par blocks (row 83)', SLOW, () => {
  const D = "    d -> a 'D'\n";
  const PAR_BC = '    par {\n  ' + B + '  ' + C + '    }\n';

  it('moves a statement into a block', async () => {
    const before = files(A + PAR_BC + D);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.moveViewStep('v', { path: [0] }, [1, 1])).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [] });
    await expectAccepted(m, before, files('    par {\n  ' + B + '  ' + A + '  ' + C + '    }\n' + D), [par(s('b', 'c', 'B'), s('a', 'b', 'A'), s('c', 'd', 'C')), one(s('d', 'a', 'D'))]);
  });

  it('moves a statement out of a block', async () => {
    const before = files(A + PAR_BC + D);
    const m = LikeC4Mutator.fromFiles(before);
    m.moveViewStep('v', { path: [1, 0] }, [0]);
    await expectAccepted(m, before, files(B + A + '    par {\n  ' + C + '    }\n' + D), [one(s('b', 'c', 'B')), one(s('a', 'b', 'A')), par(s('c', 'd', 'C')), one(s('d', 'a', 'D'))]);
  });

  it('removes the block its last statement leaves, reporting its pre-write path', async () => {
    const before = files(A + '    par {\n  ' + B + '    }\n' + C);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.moveViewStep('v', { path: [1, 0] }, [3])).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [[1]] });
    const after = await expectAccepted(m, before, files(A + C + B), [one(s('a', 'b', 'A')), one(s('c', 'd', 'C')), one(s('b', 'c', 'B'))]);
    // OP: no par block is left in LikeC4's parsed steps.
    const steps = (await parsedViews(after)).find((e) => e.view.id === 'v')!.view.steps as Array<Record<string, unknown>>;
    expect(steps.every((step) => !Array.isArray(step.steps))).toBe(true);
  });

  it('moves a whole chain', async () => {
    const before = files("    a -> b -> c 'X'\n" + C);
    const m = LikeC4Mutator.fromFiles(before);
    m.moveViewStep('v', { path: [0] }, [2]);
    await expectAccepted(m, before, files(C + "    a -> b -> c 'X'\n"), [one(s('c', 'd', 'C')), one(s('a', 'b')), one(s('b', 'c', 'X'))]);
  });
});

// ---------------------------------------------------------------------------
// Row 84: removeViewStep
// ---------------------------------------------------------------------------

describe('removeViewStep (row 84)', SLOW, () => {
  const BODY = A + "    b -> c -> d 'X'\n" + '    include a\n' + '    par {\n  ' + C + '    }\n' + '    opt {\n      d -> a\n    }\n' + B;
  const BEFORE = files(BODY);

  it.each([
    { name: 'a single step', path: [0], body: BODY.replace(A, ''), edit: without('a', 'b') },
    {
      name: 'a whole chain',
      path: [1],
      body: BODY.replace("    b -> c -> d 'X'\n", ''),
      // The chain's two segments; `c -> d 'C'` of the par block stays.
      edit: (g: SequenceGroup[]) => g.filter((x) => !x.steps.some((y) => (y.source === 'b' && y.target === 'c' && y.title === null) || y.title === 'X')),
    },
    { name: 'a par block with its contents', path: [2], body: BODY.replace('    par {\n  ' + C + '    }\n', ''), edit: (g: SequenceGroup[]) => g.filter((x) => !x.parallel) },
    { name: 'an opaque block', path: [3], body: BODY.replace('    opt {\n      d -> a\n    }\n', ''), edit: without('d', 'a') },
  ])('removes $name', async ({ path, body, edit }) => {
    await expectValidLikeC4(BEFORE);
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expect(m.removeViewStep('v', { path })).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [] });
    expect(m.getView('v')!.rules.map((r) => r.text)).toEqual(['include a']);
    await expectAccepted(m, BEFORE, files(body), edit, true);
  });

  it('removes the block its last statement leaves, in a CRLF file', async () => {
    const before = files(A + '    par {\n  ' + B + '    }\n' + C, true);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.removeViewStep('v', { path: [1, 0] })).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [[1]] });
    const after = await expectAccepted(m, before, files(A + C, true), [one(s('a', 'b', 'A')), one(s('c', 'd', 'C'))], true);
    expect(/(?<!\r)\n/.test(after['m.c4']!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 85 and row 96 (leaving a block): D40
// ---------------------------------------------------------------------------

/** The text of a par block holding `a -> b` and then `rest`, at the top of the view. */
const block = (rest: string): string => `    par {\n      a -> b\n      ${rest}\n    }\n`;

describe('leaving a block (rows 85 and 96)', SLOW, () => {
  it.each([
    { name: 'an empty opt (row 85)', rest: 'opt { }' },
    { name: 'an alt whose branches are empty (row 96)', rest: 'alt { if { } else { } }' },
    { name: 'a try whose try part is empty (row 96)', rest: 'try { } catch { c -> d }' },
  ])('rejects moving or removing a -> b when only $name would be left, naming the block', async ({ rest }) => {
    const before = files(block(rest) + C);
    // OP: on the text the write would produce, LikeC4 drops the block and validate() is clean.
    const result = files(`    par {\n      ${rest}\n    }\n` + C + '    a -> b\n');
    expect(await validateLikeC4(result)).toEqual([]);
    const parsed = (await parsedViews(result)).find((e) => e.view.id === 'v')!.view.steps as Array<Record<string, unknown>>;
    expect(parsed.every((step) => !Array.isArray(step.steps))).toBe(true);

    const m = LikeC4Mutator.fromFiles(before);
    expect(expectRejected(m, () => m.moveViewStep('v', { path: [0, 0] }, [2]), 'from').detail).toContain('[0]');
    expect(expectRejected(m, () => m.removeViewStep('v', { path: [0, 0] }), 'address').detail).toContain('[0]');
  });

  it.each([
    { name: 'an alt with a contributing else', rest: 'alt { if { } else { c -> d } }' },
    { name: 'a try whose try part contributes', rest: 'try { c -> d } catch { }' },
  ])('accepts moving and removing a -> b when $name is left (row 96)', async ({ rest }) => {
    const before = files(block(rest) + C);
    await expectValidLikeC4(before);
    const moved = LikeC4Mutator.fromFiles(before);
    expect(moved.moveViewStep('v', { path: [0, 0] }, [2])).toEqual({ changedFiles: ['m.c4'], removedParallelBlocks: [] });
    await expectAccepted(moved, before, files(`    par {\n      ${rest}\n    }\n` + C + '    a -> b\n'), (g) => [...without('a', 'b')(g), one(s('a', 'b'))]);
    const removed = LikeC4Mutator.fromFiles(before);
    removed.removeViewStep('v', { path: [0, 0] });
    await expectAccepted(removed, before, files(`    par {\n      ${rest}\n    }\n` + C), without('a', 'b'), true);
  });
});

// ---------------------------------------------------------------------------
// Rows 86, 87 and 96 (creation): addViewParallel
// ---------------------------------------------------------------------------

describe('addViewParallel accepted forms (row 86)', SLOW, () => {
  const BEFORE = files(A + '    include a\n' + B + C);

  it('moves statements only, the rule between them staying', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expect(m.addViewParallel('v', { statements: [[0], [1]], path: [2] })).toEqual({ changedFiles: ['m.c4'] });
    await expectAccepted(m, BEFORE, files('    include a\n    par {\n  ' + A + '  ' + B + '    }\n' + C), [par(s('a', 'b', 'A'), s('b', 'c', 'B')), one(s('c', 'd', 'C'))]);
    expect(m.getView('v')!.rules.map((r) => [r.index, r.text])).toEqual([[0, 'include a']]);
    expect(m.getView('v')!.steps![0]).toMatchObject({ type: 'parallel', keyword: 'par', path: [0] });
  });

  it('writes new steps only, after the last statement by default', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    m.addViewParallel('v', { steps: [{ source: 'd', target: 'a', title: 'N' }, { source: 'd', target: 'b' }] });
    await expectAccepted(m, BEFORE, files(A + '    include a\n' + B + C + "    par {\n      d -> a 'N'\n      d -> b\n    }\n"), (g) => [...g, par(s('d', 'a', 'N'), s('d', 'b'))]);
  });

  it('writes moved statements first, then new steps, at the pre-move boundary', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    m.addViewParallel('v', { statements: [[2]], steps: [{ source: 'd', target: 'a', title: 'N' }], path: [0] });
    await expectAccepted(m, BEFORE, files('    par {\n  ' + C + "      d -> a 'N'\n    }\n" + A + '    include a\n' + B), [par(s('c', 'd', 'C'), s('d', 'a', 'N')), one(s('a', 'b', 'A')), one(s('b', 'c', 'B'))]);
  });
});

describe('addViewParallel with a stage-6 statement (row 96)', SLOW, () => {
  it.each([
    { name: 'try with a contributing try part', statement: 'try {\n      a -> b\n    } catch {\n    }' },
    { name: 'alt with a contributing else', statement: 'alt {\n      if {\n      }\n      else {\n        a -> b\n      }\n    }' },
  ])('accepts moving in $name', async ({ statement }) => {
    const before = files(`    ${statement}\n` + C);
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.addViewParallel('v', { statements: [[0]] });
    const inner = statement.replace(/\n/g, '\n  ');
    const after = await expectAccepted(m, before, files(C + `    par {\n      ${inner}\n    }\n`), (g) => [one(s('c', 'd', 'C')), ...g.filter((x) => x.steps.some((y) => y.source === 'a')).map((x) => ({ parallel: true, steps: x.steps }))]);
    void after;
  });

  it.each([
    { name: 'try whose steps are in catch only', statement: 'try { } catch { a -> b }' },
    { name: 'try whose steps are in finally only', statement: 'try { } finally { a -> b }' },
    { name: 'alt whose branches are empty', statement: 'alt { if { } else { } }' },
  ])('rejects moving in $name on statements', async ({ statement }) => {
    const before = files(`    ${statement}\n` + C);
    // OP: LikeC4 drops such a block written alone in a par, with a clean validate().
    const result = files(C + `    par {\n      ${statement}\n    }\n`);
    expect(await validateLikeC4(result)).toEqual([]);
    expect(((await parsedViews(result)).find((e) => e.view.id === 'v')!.view.steps as unknown[]).length).toBe(1);
    const m = LikeC4Mutator.fromFiles(before);
    expectRejected(m, () => m.addViewParallel('v', { statements: [[0]] }), 'statements');
  });
});

describe('addViewParallel rejections (row 87)', () => {
  const BEFORE = files(A + '    par {\n  ' + B + '    }\n' + '    opt { }\n' + C);

  it.each([
    { name: 'no statement and no step', opts: {}, field: 'statements' },
    { name: 'only an empty opt moved in', opts: { statements: [[2]] }, field: 'statements' },
    { name: 'a path that is not top-level', opts: { statements: [[1, 0]] }, field: 'statements[0]' },
    { name: 'a par block (nested parallel)', opts: { statements: [[1]] }, field: 'statements[0]' },
    { name: 'a duplicate path', opts: { statements: [[0], [0]] }, field: 'statements[1]' },
    { name: 'a path that does not exist', opts: { statements: [[9]] }, field: 'statements[0]' },
    { name: 'an invalid new step', opts: { steps: [{ source: 'nope', target: 'a' }] }, field: 'steps[0].source' },
  ] as Array<{ name: string; opts: Parameters<LikeC4Mutator['addViewParallel']>[1]; field: string }>)('rejects $name on $field', ({ opts, field }) => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.addViewParallel('v', opts), field);
  });

  it('rejects an unknown id, an id declared in two files and a generated id on id', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.addViewParallel('nope', { statements: [[0]] }), 'id');
    const twice = LikeC4Mutator.fromFiles({ ...BEFORE, 'z.c4': 'views {\n  dynamic view v {\n    a -> b\n  }\n}\n' });
    expectRejected(twice, () => twice.addViewParallel('v', { statements: [[0]] }), 'id');
    const withUnnamed = { ...BEFORE, 'z.c4': 'views {\n  view of a {\n    include *\n  }\n}\n' };
    const generated = Object.keys(await computedViews(withUnnamed)).filter((id) => !['v', 'other', 'index'].includes(id));
    expect(generated).toHaveLength(1);
    const unnamed = LikeC4Mutator.fromFiles(withUnnamed);
    expectRejected(unnamed, () => unnamed.addViewParallel(generated[0]!, { statements: [[0]] }), 'id');
  });
});

// ---------------------------------------------------------------------------
// Row 88: move and remove rejections
// ---------------------------------------------------------------------------

describe('move and remove rejections (row 88)', () => {
  const BEFORE = files(A + '    par {\n  ' + B + '    }\n' + '    par {\n  ' + C + '    }\n' + "    a -> b -> c 'X'\n");

  it('rejects a par block moved into a par block on to', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [1] }, [2, 0]), 'to');
  });

  it('rejects a destination inside the moved statement on to', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [1] }, [1, 0]), 'to');
  });

  it('rejects a single segment of a chain on segment', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [3], segment: 1 }, [0]), 'segment');
    expectRejected(m, () => m.removeViewStep('v', { path: [3], segment: 1 }), 'segment');
  });

  it('rejects a missing path on from and on address', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [9] }, [0]), 'from');
    expectRejected(m, () => m.removeViewStep('v', { path: [9] }), 'address');
  });

  it('rejects a destination that does not exist on to', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [0] }, [9]), 'to');
  });

  it('rejects a guard mismatch on text', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('v', { path: [0], text: 'a -> b' }, [4]), 'text');
    expectRejected(m, () => m.removeViewStep('v', { path: [0], text: 'a -> b' }), 'text');
  });

  it('rejects an unknown id, an id declared in two files and a generated id on id', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.moveViewStep('nope', { path: [0] }, [2]), 'id');
    expectRejected(m, () => m.removeViewStep('nope', { path: [0] }), 'id');
    const twice = LikeC4Mutator.fromFiles({ ...BEFORE, 'z.c4': 'views {\n  dynamic view v {\n    a -> b\n  }\n}\n' });
    expectRejected(twice, () => twice.moveViewStep('v', { path: [0] }, [2]), 'id');
    expectRejected(twice, () => twice.removeViewStep('v', { path: [0] }), 'id');
    const withUnnamed = { ...BEFORE, 'z.c4': 'views {\n  view of a {\n    include *\n  }\n}\n' };
    const generated = Object.keys(await computedViews(withUnnamed)).filter((id) => !['v', 'other', 'index'].includes(id));
    const unnamed = LikeC4Mutator.fromFiles(withUnnamed);
    expectRejected(unnamed, () => unnamed.moveViewStep(generated[0]!, { path: [0] }, [1]), 'id');
    expectRejected(unnamed, () => unnamed.removeViewStep(generated[0]!, { path: [0] }), 'id');
  });
});

// ---------------------------------------------------------------------------
// D52: step writes on a view that is not a dynamic view
// ---------------------------------------------------------------------------

describe('step writes on a view that is not a dynamic view are rejected on id (D52)', () => {
  const OTHER_TYPES = {
    'm.c4': `${MODEL}views {\n  dynamic view v {\n${A}${B}  }\n  view ev {\n    include *\n  }\n  deployment view dv {\n    include *\n  }\n}\n`,
  };
  const STEP = { source: 'a', target: 'b' };
  const WRITES: Array<[string, (m: LikeC4Mutator, id: string) => unknown]> = [
    ['addViewStep', (m, id) => m.addViewStep(id, STEP, { path: [0] })],
    ['updateViewStep', (m, id) => m.updateViewStep(id, { path: [0] }, { title: 'T' })],
    ['moveViewStep', (m, id) => m.moveViewStep(id, { path: [0] }, [2])],
    ['removeViewStep', (m, id) => m.removeViewStep(id, { path: [0] })],
    ['addViewParallel', (m, id) => m.addViewParallel(id, { statements: [[0]], steps: [STEP] })],
  ];

  it.each(WRITES)('%s', (_name, write) => {
    for (const id of ['ev', 'dv']) {
      const m = LikeC4Mutator.fromFiles(OTHER_TYPES);
      const error = expectRejected(m, () => write(m, id), 'id');
      expect(error.detail).toContain('only dynamic views have steps');
    }
    // The same arguments are accepted on the dynamic view: the view type alone is rejected.
    const m = LikeC4Mutator.fromFiles(OTHER_TYPES);
    expect(() => write(m, 'v')).not.toThrow();
  });
});
