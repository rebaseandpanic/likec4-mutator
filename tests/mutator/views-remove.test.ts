/**
 * `removeView` (US-8, D26, D43; rows 63–65 and 94 of the lc4m-15.29 test
 * matrix): referenced views are not removed, the error lists the
 * references; unreferenced, bodyless and self-referencing views are; view
 * addressing.  The reference policy of lc4m-15.30 US-2 (rows 66–71 of its
 * matrix): `navigateTo` is cascaded with `cascade: true`, `extends` and
 * unmodelled places reject in both modes (D56, D61, D92, D104, D111–D113).
 *
 * Expected lines come from the input text; expected links from LikeC4
 * 1.59.4's linker; every accepted write passes the conventions of
 * `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError, ReferencedRemovalError, type RemovalReference } from '../../src/mutator/write-checks.js';
import { computedViews, expectAcceptedWrite, expectValidLikeC4, linkedViewReferences } from '../helpers/likec4-model.js';
import { expectValidViewWrite } from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

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

/** 1-based line of the first occurrence of `needle` in `text`. */
function lineOf(text: string, needle: string): number {
  const at = text.indexOf(needle);
  expect(at, `'${needle}' is in the input`).not.toBe(-1);
  return text.slice(0, at).split('\n').length;
}

const SPEC = `specification {
  element system
  deploymentNode env
}
`;
const MODEL = `${SPEC}model {
  a = system
  b = system
}
`;

// ---------------------------------------------------------------------------
// Row 63: referenced views
// ---------------------------------------------------------------------------

describe('referenced views cannot be removed (row 63)', SLOW, () => {
  const TARGETS = `  view v {
    include *
  }
  dynamic view flow {
    a -> b
  }
`;
  it.each([
    {
      name: "navigateTo in an element predicate's with",
      removed: 'v',
      text: `${MODEL}views {\n${TARGETS}  view w {\n    include a with { navigateTo v }\n  }\n}\n`,
      referrer: 'navigateTo v',
    },
    {
      name: "navigateTo in a relation predicate's with",
      removed: 'flow',
      text: `${MODEL}views {\n${TARGETS}  view w {\n    include a -> b with { navigateTo flow }\n  }\n}\n`,
      referrer: 'navigateTo flow',
    },
    {
      name: 'navigateTo of a dynamic step',
      removed: 'flow',
      text: `${MODEL}views {\n${TARGETS}  dynamic view d {\n    a -> b {\n      navigateTo flow\n    }\n  }\n}\n`,
      referrer: 'navigateTo flow',
    },
    {
      name: 'navigateTo of a model relationship',
      removed: 'flow',
      text: `${SPEC}model {\n  a = system\n  b = system\n  a -> b {\n    navigateTo flow\n  }\n}\nviews {\n${TARGETS}}\n`,
      referrer: 'navigateTo flow',
    },
    {
      name: 'navigateTo of a deployment relationship',
      removed: 'flow',
      text: `${MODEL}deployment {\n  x = env\n  y = env\n  x -> y {\n    navigateTo flow\n  }\n}\nviews {\n${TARGETS}}\n`,
      referrer: 'navigateTo flow',
    },
    {
      name: 'extends',
      removed: 'v',
      text: `${MODEL}views {\n${TARGETS}  view c extends v {\n    include a\n  }\n}\n`,
      referrer: 'extends v',
    },
  ])('rejects removing a view referenced by $name on id', async ({ removed, text, referrer }) => {
    const files = { 'm.c4': text };
    await expectValidLikeC4(files);
    // OP: LikeC4 links the reference to the view.
    const linked = (await linkedViewReferences(files)).filter((r) => r.text === removed && r.view !== removed);
    expect(linked.map((r) => r.target)).toEqual([{ view: removed }]);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.removeView(removed), 'id');
    expect(error.detail).toContain(`m.c4:${lineOf(text, referrer)}`);
  });

  it('lists every referrer with its file and line', async () => {
    const files = {
      'm.c4': `${MODEL}views {\n${TARGETS}  view w {\n    include a with { navigateTo v }\n  }\n}\n`,
      'n.c4': 'views {\n  view c extends v {\n    include b\n  }\n}\n',
    };
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.removeView('v'), 'id');
    expect(error.detail).toContain(`m.c4:${lineOf(files['m.c4'], 'navigateTo v')}`);
    expect(error.detail).toContain(`n.c4:${lineOf(files['n.c4'], 'extends v')}`);
  });
});

// ---------------------------------------------------------------------------
// Row 64: accepted removals
// ---------------------------------------------------------------------------

describe('accepted removals (row 64)', SLOW, () => {
  const HEAD = `${MODEL}views {\n  view keep {\n    include a\n  }\n`;
  const TAIL = '  // after\n  view last {\n    include b\n  }\n}\n';

  it.each([
    { name: 'an unreferenced view', id: 'gone', declaration: '  view gone {\n    include *\n  }\n' },
    { name: 'a bodyless view', id: 'gone', declaration: '  view gone\n' },
    { name: 'a declared index', id: 'index', declaration: '  view index {\n    include *\n  }\n' },
  ])('removes $name and nothing else', async ({ id, declaration }) => {
    const before = { 'm.c4': HEAD + declaration + TAIL };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.removeView(id)).toEqual({ changedFiles: ['m.c4'] });
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': HEAD + TAIL });
    expect(m.getView(id)).toBeNull();
    if (id === 'index') {
      // OP: LikeC4 synthesizes an index once the declared one is gone.
      expect(Object.keys(await computedViews(after))).toContain('index');
    }
    await expectValidViewWrite(m, before, { removedView: id, editedBefore: (r) => r.view === id });
  });

  it('removes a view from a CRLF file without a lone LF', async () => {
    const crlf = (text: string) => text.replace(/\n/g, '\r\n');
    const before = { 'm.c4': crlf(HEAD + '  view gone {\n    include *\n  }\n' + TAIL) };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.removeView('gone');
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': crlf(HEAD + TAIL) });
    expect(/(?<!\r)\n/.test(after['m.c4']!)).toBe(false);
    await expectValidViewWrite(m, before, { removedView: 'gone' });
  });
});

// ---------------------------------------------------------------------------
// Row 65: view addressing
// ---------------------------------------------------------------------------

describe('removeView addresses one named view (row 65)', () => {
  const ONE = { 'm.c4': `${MODEL}views {\n  view v {\n    include *\n  }\n}\n` };

  it('rejects an unknown id', () => {
    const m = LikeC4Mutator.fromFiles(ONE);
    expectRejected(m, () => m.removeView('nope'), 'id');
  });

  it('rejects an id declared in two files, removing neither', () => {
    const m = LikeC4Mutator.fromFiles({ ...ONE, 'n.c4': 'views {\n  view v {\n    include a\n  }\n}\n' });
    expectRejected(m, () => m.removeView('v'), 'id');
  });

  it('rejects the id LikeC4 generates for an unnamed view', async () => {
    const before = { 'm.c4': `${MODEL}views {\n  view of a {\n    include *\n  }\n}\n` };
    const generated = Object.keys(await computedViews(before)).filter((id) => id !== 'index');
    expect(generated).toHaveLength(1);
    const m = LikeC4Mutator.fromFiles(before);
    expectRejected(m, () => m.removeView(generated[0]!), 'id');
  });
});

// ---------------------------------------------------------------------------
// Row 94: self-references do not block removal (D43)
// ---------------------------------------------------------------------------

describe('self-references do not block removal (row 94)', SLOW, () => {
  const HEAD = `${MODEL}views {\n  view keep {\n    include *\n  }\n`;
  const SELF_V = '  view v {\n    include a with { navigateTo v }\n  }\n';
  const SELF_D = '  dynamic view d {\n    a -> b {\n      navigateTo d\n    }\n  }\n';

  it.each([
    { name: 'an element view navigating to itself from a with', id: 'v', declaration: SELF_V, role: 'elementWithNavigateTo' },
    { name: 'a dynamic view navigating to itself from a step', id: 'd', declaration: SELF_D, role: 'stepNavigateTo' },
  ])('removes $name', async ({ id, declaration, role }) => {
    const before = { 'm.c4': `${HEAD}${declaration}}\n` };
    // OP: the input is valid and LikeC4 links the self-reference to the view itself.
    await expectValidLikeC4(before);
    expect((await linkedViewReferences(before)).filter((r) => r.text === id).map((r) => [r.view, r.role, r.target])).toEqual([
      [id, role, { view: id }],
    ]);
    const m = LikeC4Mutator.fromFiles(before);
    m.removeView(id);
    expect(m.serialize()).toEqual({ 'm.c4': `${HEAD}}\n` });
    await expectValidViewWrite(m, before, { removedView: id, editedBefore: (r) => r.view === id });
  });

  it('rejects the self-referencing view that another view also references, naming only that one', async () => {
    const text = `${HEAD}${SELF_V}  view w {\n    include b with { navigateTo v }\n  }\n}\n`;
    const files = { 'm.c4': text };
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.removeView('v'), 'id');
    const outside = text.split('\n').findIndex((line) => line.includes('include b with { navigateTo v }')) + 1;
    const self = text.split('\n').findIndex((line) => line.includes('include a with { navigateTo v }')) + 1;
    expect(error.detail).toContain(`m.c4:${outside}`);
    expect(error.detail).not.toContain(`m.c4:${self}`);
  });
});

// ---------------------------------------------------------------------------
// lc4m-15.30 rows 66–71: the reference policy (US-2)
// ---------------------------------------------------------------------------

type Files = Record<string, string>;

/** `{ file, line, column }` of the `occurrence`-th `needle` in `files[file]` (1-based), from the test's own input. */
function at(files: Files, file: string, needle: string, occurrence = 0): { file: string; line: number; column: number } {
  const text = files[file]!;
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) {
    offset = text.indexOf(needle, offset + 1);
    if (offset < 0) throw new Error(`test input: '${needle}' #${occurrence} not found in ${file}`);
  }
  const before = text.slice(0, offset);
  return { file, line: before.split('\n').length, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

/** RRE: `removeView` throws a `ReferencedRemovalError` on `id` and changes nothing. */
function expectRRE(files: Files, id: string, cascade: boolean): ReferencedRemovalError {
  const m = LikeC4Mutator.fromFiles(files);
  const error = expectRejected(m, () => m.removeView(id, { cascade }), 'id');
  expect(error).toBeInstanceOf(ReferencedRemovalError);
  return error as ReferencedRemovalError;
}

const TARGET_VIEWS = '  view v {\n    include *\n  }\n  dynamic view flow {\n    a -> b\n  }\n';

describe('navigateTo in its five roles (row 66)', SLOW, () => {
  const CASES: Array<{ name: string; id: string; text: string; after: string; needle: string; view?: string; rules?: [string, string[]] }> = [
    {
      name: "an element predicate's with, left empty",
      id: 'v',
      text: `${MODEL}views {\n${TARGET_VIEWS}  view w {\n    include a with {\n      navigateTo v\n    }\n  }\n}\n`,
      after: `${MODEL}views {\n  dynamic view flow {\n    a -> b\n  }\n  view w {\n    include a\n  }\n}\n`,
      needle: 'v\n    }',
      view: 'w',
      rules: ['w', ['include a']],
    },
    {
      name: "an element predicate's with, keeping its title",
      id: 'v',
      text: `${MODEL}views {\n${TARGET_VIEWS}  view w {\n    include a with {\n      title 'A'\n      navigateTo v\n    }\n  }\n}\n`,
      after: `${MODEL}views {\n  dynamic view flow {\n    a -> b\n  }\n  view w {\n    include a with {\n      title 'A'\n    }\n  }\n}\n`,
      needle: 'v\n    }',
      view: 'w',
    },
    {
      name: "a relation predicate's with, left empty",
      id: 'flow',
      text: `${MODEL}views {\n${TARGET_VIEWS}  view w {\n    include a -> b with {\n      navigateTo flow\n    }\n  }\n}\n`,
      after: `${MODEL}views {\n  view v {\n    include *\n  }\n  view w {\n    include a -> b\n  }\n}\n`,
      needle: 'flow\n    }',
      view: 'w',
      rules: ['w', ['include a -> b']],
    },
    {
      name: 'a dynamic step body',
      id: 'flow',
      text: `${MODEL}views {\n${TARGET_VIEWS}  dynamic view d {\n    a -> b {\n      navigateTo flow\n    }\n  }\n}\n`,
      after: `${MODEL}views {\n  view v {\n    include *\n  }\n  dynamic view d {\n    a -> b {\n    }\n  }\n}\n`,
      needle: 'flow\n    }',
      view: 'd',
    },
    {
      name: 'a model relationship body',
      id: 'flow',
      text: `${SPEC}model {\n  a = system\n  b = system\n  a -> b {\n    navigateTo flow\n  }\n}\nviews {\n${TARGET_VIEWS}}\n`,
      after: `${SPEC}model {\n  a = system\n  b = system\n  a -> b {\n  }\n}\nviews {\n  view v {\n    include *\n  }\n}\n`,
      needle: 'flow\n  }',
    },
    {
      name: 'a deployment relationship body',
      id: 'flow',
      text: `${MODEL}deployment {\n  x = env\n  y = env\n  x -> y {\n    navigateTo flow\n  }\n}\nviews {\n${TARGET_VIEWS}}\n`,
      after: `${MODEL}deployment {\n  x = env\n  y = env\n  x -> y {\n  }\n}\nviews {\n  view v {\n    include *\n  }\n}\n`,
      needle: 'flow\n  }',
    },
  ];

  describe.each(CASES)('$name', ({ id, text, after, needle, view, rules }) => {
    const files: Files = { 'm.c4': text };

    it('is RRE by default, the navigateTo cascadable', async () => {
      await expectValidLikeC4(files);
      expect(expectRRE(files, id, false).references).toEqual([
        { ...at(files, 'm.c4', needle), role: 'navigate-to', cascadable: true, ...(view !== undefined && { view }) },
      ]);
    });

    it('with cascade removes the property', async () => {
      const m = LikeC4Mutator.fromFiles(files);
      expect(m.removeView(id, { cascade: true })).toEqual({ changedFiles: ['m.c4'], cascaded: [{ ...at(files, 'm.c4', needle), role: 'navigate-to' }] });
      expect(m.serialize()['m.c4']).toBe(after);
      if (rules) expect(m.getView(rules[0])!.rules.map((r) => r.text)).toEqual(rules[1]);
      await expectAcceptedWrite(files, m.serialize(), { removedViewId: id });
    });
  });
});

describe('extends of the removed view, a two-level chain (row 67)', () => {
  const files: Files = {
    'm.c4': `${MODEL}views {\n${TARGET_VIEWS}  view c1 extends v {\n    include a\n  }\n  view c2 extends c1 {\n    include b\n  }\n}\n`,
  };

  it.each([false, true])('is RRE with cascade %s, naming each view of the chain', async (cascade) => {
    await expectValidLikeC4(files);
    const expected: RemovalReference[] = [
      { ...at(files, 'm.c4', 'v {\n    include a'), role: 'view-extends', cascadable: false, view: 'c1' },
      { ...at(files, 'm.c4', 'c1 {\n    include b'), role: 'view-extends', cascadable: false, view: 'c2' },
    ];
    expect(expectRRE(files, 'v', cascade).references).toEqual(expected);
  });
});

describe('navigateTo at unmodelled places (row 68)', () => {
  it.each([
    {
      name: 'inside an opt step',
      id: 'flow',
      text: `${MODEL}views {\n${TARGET_VIEWS}  dynamic view d {\n    a -> b\n    opt {\n      a -> b {\n        navigateTo flow\n      }\n    }\n  }\n}\n`,
      needle: 'flow\n      }',
      role: 'opaque-flow' as const,
      view: 'd',
    },
    {
      name: "in a global predicate's with",
      id: 'v',
      text: `${MODEL}global {\n  predicateGroup g {\n    include a with {\n      navigateTo v\n    }\n  }\n}\nviews {\n${TARGET_VIEWS}}\n`,
      needle: 'v\n    }',
      role: 'global-or-import' as const,
      view: undefined,
    },
  ])('$name is RRE under cascade', async ({ id, text, needle, role, view }) => {
    const files: Files = { 'm.c4': text };
    await expectValidLikeC4(files);
    expect(expectRRE(files, id, true).references).toEqual([
      { ...at(files, 'm.c4', needle), role, cascadable: false, ...(view !== undefined && { view }) },
    ]);
  });
});

describe('the view id in unrecovered text (row 69)', () => {
  it.each([false, true])('is RRE with cascade %s', (cascade) => {
    const files: Files = { 'm.c4': `${MODEL}views {\n${TARGET_VIEWS}}\n`, 'b.c4': "model {\n  x -> -> flow 'q'\n}\n" };
    expect(expectRRE(files, 'flow', cascade).references).toEqual([{ ...at(files, 'b.c4', 'flow'), role: 'unrecovered', cascadable: false }]);
  });
});

describe('references inside the removed view do not block under cascade (row 70, D43)', SLOW, () => {
  it('removes a view navigating to itself and naming elements', async () => {
    const before: Files = { 'm.c4': `${MODEL}views {\n  view keep {\n    include *\n  }\n  view v {\n    include a with {\n      navigateTo v\n    }\n    include b\n  }\n}\n` };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.removeView('v', { cascade: true })).toEqual({ changedFiles: ['m.c4'], cascaded: [] });
    expect(m.serialize()).toEqual({ 'm.c4': `${MODEL}views {\n  view keep {\n    include *\n  }\n}\n` });
    await expectAcceptedWrite(before, m.serialize(), { removedViewId: 'v' });
  });
});

describe('plain InvalidWriteError without references (row 71, D104, D113)', () => {
  const ONE: Files = { 'm.c4': `${MODEL}views {\n  view v {\n    include *\n  }\n}\n` };

  it.each([
    { name: 'an unknown id', files: ONE, id: () => 'nope' },
    { name: 'an id declared in two files', files: { ...ONE, 'n.c4': 'views {\n  view v {\n    include a\n  }\n}\n' }, id: () => 'v' },
    { name: 'a file with a stray }', files: { 'm.c4': `${ONE['m.c4']}}\n` }, id: () => 'v' },
  ])('$name', ({ files, id }) => {
    for (const cascade of [false, true]) {
      const m = LikeC4Mutator.fromFiles(files);
      const error = expectRejected(m, () => m.removeView(id(), { cascade }), 'id');
      expect(error).not.toBeInstanceOf(ReferencedRemovalError);
    }
  });

  it('the generated id of an unnamed view', async () => {
    const files: Files = { 'm.c4': `${MODEL}views {\n  view of a {\n    include *\n  }\n}\n` };
    const [generated] = Object.keys(await computedViews(files)).filter((id) => id !== 'index');
    for (const cascade of [false, true]) {
      const m = LikeC4Mutator.fromFiles(files);
      const error = expectRejected(m, () => m.removeView(generated!, { cascade }), 'id');
      expect(error).not.toBeInstanceOf(ReferencedRemovalError);
    }
  });
});
