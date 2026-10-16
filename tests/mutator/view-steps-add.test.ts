/**
 * `addViewStep` (US-9, D24, D25, D36, D38; rows 73–77 of the lc4m-15.29
 * test matrix): insertion paths, the round trip of every single step of
 * both fixtures, every step field, the rejections, and bodyless, one-line
 * and CRLF views.
 *
 * Expected texts are written by hand; expected sequences are LikeC4
 * 1.59.4's computed sequence before the write with the new step put where
 * the spec says (SEQ); every accepted write passes the conventions of
 * `view-writes.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, type ViewStepSpec } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type { ViewStepInfo, ViewStepStatementInfo } from '../../src/query/types.js';
import { computedViews, expectValidLikeC4, parsedViews } from '../helpers/likec4-model.js';
import { expectStepSequence, expectValidViewWrite, stepSequence, type SequenceGroup, type SequenceStep } from '../helpers/view-writes.js';

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
const FLOW = `  dynamic view flow {
    user -> app.api
    par {
      app.api -> app.db
    }
    user -> app.api -> app.db
    opt {
      app.db -> user
    }
    include app
    autoLayout TopBottom
  }
`;
const OTHER_VIEWS = '  dynamic view later {\n    user -> app.db\n  }\n  view index {\n    include *\n  }\n';
const OTHER = 'model {\n  ext = system {\n    deep = service\n  }\n}\n';

/** The workspace with the flow view written as `flow`. */
const workspace = (flow = FLOW): Record<string, string> => ({ 'm.c4': `${MODEL}views {\n${flow}${OTHER_VIEWS}}\n`, 'n.c4': OTHER });
const BASE = workspace();

/** A computed step entry, as the sequence comparison sees it. */
const step = (source: string, target: string, title: string | null, extra: Partial<SequenceStep> = {}): SequenceStep => ({
  source,
  target,
  title,
  backward: false,
  ...extra,
});

/** Wv and SEQ for an accepted step write; the files after it. */
async function expectAccepted(
  m: LikeC4Mutator,
  before: Record<string, string>,
  id: string,
  edit: (groups: SequenceGroup[]) => SequenceGroup[],
): Promise<Record<string, string>> {
  const after = m.serialize();
  await expectValidViewWrite(m, before);
  await expectStepSequence(before, after, id, edit);
  return after;
}

/** The statement at `path` of view `id`. */
function statementAt(m: LikeC4Mutator, id: string, path: number[]): ViewStepStatementInfo {
  let statements = m.getView(id)!.steps!;
  let statement = statements[path[0]!]!;
  if (path.length === 2) {
    expect(statement.type).toBe('parallel');
    statements = (statement as Extract<ViewStepStatementInfo, { type: 'parallel' }>).statements;
    statement = statements[path[1]!]!;
  }
  return statement;
}

// ---------------------------------------------------------------------------
// Row 73: insertion paths
// ---------------------------------------------------------------------------

describe('addViewStep paths (row 73)', SLOW, () => {
  const NEW: ViewStepSpec = { source: 'app.db', target: 'user', title: 'reply' };
  const ENTRY = step('app.db', 'user', 'reply');

  it.each([
    {
      name: 'the default: after the last step statement, before the rules after it',
      path: undefined,
      readAt: [4],
      flow: FLOW.replace('    include app\n', "    app.db -> user 'reply'\n    include app\n"),
      edit: (g: SequenceGroup[]) => [...g, { parallel: false, steps: [ENTRY] }],
    },
    {
      name: '[0]: before the first top-level statement',
      path: [0],
      readAt: [0],
      flow: FLOW.replace('    user -> app.api\n    par', "    app.db -> user 'reply'\n    user -> app.api\n    par"),
      edit: (g: SequenceGroup[]) => [{ parallel: false, steps: [ENTRY] }, ...g],
    },
    {
      name: '[1, 0]: inside the par block, before its statement',
      path: [1, 0],
      readAt: [1, 0],
      flow: FLOW.replace('    par {\n      app.api -> app.db\n', "    par {\n      app.db -> user 'reply'\n      app.api -> app.db\n"),
      edit: (g: SequenceGroup[]) => [g[0]!, { parallel: true, steps: [ENTRY, ...g[1]!.steps] }, ...g.slice(2)],
    },
    {
      name: '[1, 1]: appended to the par block',
      path: [1, 1],
      readAt: [1, 1],
      flow: FLOW.replace('    par {\n      app.api -> app.db\n', "    par {\n      app.api -> app.db\n      app.db -> user 'reply'\n"),
      edit: (g: SequenceGroup[]) => [g[0]!, { parallel: true, steps: [...g[1]!.steps, ENTRY] }, ...g.slice(2)],
    },
  ])('$name', async ({ path, readAt, flow, edit }) => {
    await expectValidLikeC4(BASE);
    const m = LikeC4Mutator.fromFiles(BASE);
    expect(m.addViewStep('flow', NEW, path ? { path } : {})).toEqual({ changedFiles: ['m.c4'] });
    expect(m.serialize()).toEqual(workspace(flow));
    const read = statementAt(m, 'flow', readAt);
    expect(read).toMatchObject({ type: 'step', path: readAt, step: { source: { target: 'app.db' }, target: { target: 'user' }, direction: 'forward', title: 'reply' } });
    await expectAccepted(m, BASE, 'flow', edit);
  });
});

// ---------------------------------------------------------------------------
// Row 74: D36 round trip, both fixtures
// ---------------------------------------------------------------------------

/** Every `.c4` file of a fixture workspace by its path relative to the workspace. */
function readWorkspace(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.c4')) files[relative(root, path)] = readFileSync(path, 'utf-8');
    }
  };
  walk(root);
  return files;
}

/** The single steps of `statements`, inside `par` blocks too. */
function singleSteps(statements: ViewStepStatementInfo[]): ViewStepInfo[] {
  return statements.flatMap((s) => (s.type === 'step' ? [s.step] : s.type === 'parallel' ? singleSteps(s.statements) : []));
}

/** The text of a `ViewText`. */
const plain = (value: { md: string } | { txt: string } | undefined): string | undefined =>
  value === undefined ? undefined : 'md' in value ? value.md : value.txt;

/** The fields `addViewStep` takes, from a read step (D36: written back, they produce the same interaction). */
function specOf(read: ViewStepInfo): ViewStepSpec {
  const body = read.body ?? {};
  const spec: ViewStepSpec = { source: read.source.text, target: read.target.text, direction: read.direction };
  if (read.kind) Object.assign(spec, { kind: read.kind.name, kindForm: read.kind.form });
  const title = body.title ?? read.title;
  if (title !== undefined) spec.title = title;
  const description = plain(body.description);
  if (description !== undefined) spec.description = description;
  const notes = plain(body.notes);
  if (notes !== undefined) spec.notes = notes;
  if (body.technology !== undefined) spec.technology = body.technology;
  if (body.notation !== undefined) spec.notation = body.notation;
  if (body.navigateTo) spec.navigateTo = body.navigateTo.text;
  Object.assign(spec, body.style ?? {});
  return spec;
}

/** LikeC4's parsed step of view `id` at the computed position `sequence`, without positional keys. */
async function parsedStepAt(files: Record<string, string>, id: string, sequence: { step: number; parallel?: number }): Promise<unknown> {
  const computed = (await computedViews(files))[id]!.steps;
  const index = computed.findIndex((s) => s.step === sequence.step && s.parallel === sequence.parallel);
  expect(index, `LikeC4 computes a step ${JSON.stringify(sequence)} of '${id}'`).not.toBe(-1);
  const flat: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const n = node as Record<string, unknown>;
    let block = false;
    for (const key of ['steps', 'branches']) if (Array.isArray(n[key])) ((block = true), walk(n[key]));
    for (const key of ['try', 'catch', 'finally']) {
      const part = n[key] as { steps?: unknown } | undefined;
      if (part?.steps) ((block = true), walk(part.steps));
    }
    if (!block && typeof n.source === 'string') flat.push(n);
  };
  walk((await parsedViews(files)).find((e) => e.view.id === id)!.view.steps);
  const { astPath: _astPath, ...content } = flat[index]! as Record<string, unknown> & { astPath?: unknown };
  return content;
}

describe.each([
  { fixture: 'views-flows', file: 'flows.c4', anchor: '  dynamic view later\n' },
  { fixture: 'views-catalog', file: 'views.c4', anchor: '  dynamic view orderFlow {' },
])('D36 round trip of every single step of $fixture (row 74)', ({ fixture, file, anchor }) => {
  it('writes each read step back into a scratch view, where LikeC4 parses it equally', { timeout: 900_000 }, async () => {
    const original = readWorkspace(fixture);
    const files = { ...original, [file]: original[file]!.replace(anchor, `  dynamic view scratch {\n  }\n${anchor}`) };
    // P: the input is valid and has single steps of every form the round trip covers.
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const reads = m
      .listViews({ type: 'dynamic' })
      .filter((v) => v.id !== 'scratch')
      .flatMap((v) => singleSteps(v.steps ?? []).filter((s) => s.sequence !== undefined).map((s) => ({ view: v.id!, step: s })));
    expect(reads.length).toBeGreaterThan(0);
    if (fixture === 'views-flows') {
      expect(reads.some((r) => r.step.direction === 'backward')).toBe(true);
      expect(reads.some((r) => r.step.kind?.form === 'dot')).toBe(true);
      expect(reads.some((r) => r.step.kind?.form === 'bracket')).toBe(true);
      expect(reads.some((r) => r.step.body?.notation !== undefined && r.step.body?.navigateTo !== undefined)).toBe(true);
    }

    for (const { view, step: read } of reads) {
      const before = m.serialize();
      const spec = specOf(read);
      m.addViewStep('scratch', spec);
      const after = m.serialize();
      const statements = m.getView('scratch')!.steps!;
      const written = statements.at(-1)!;
      expect(written.type).toBe('step');
      const back = (written as Extract<ViewStepStatementInfo, { type: 'step' }>).step;
      if (read.direction === 'backward') expect(back.arrow).toBe('<-');
      // LikeC4's parsed new step equals its parsed original.
      expect(await parsedStepAt(after, 'scratch', back.sequence!)).toEqual(await parsedStepAt(after, view, read.sequence!));
      await expectValidViewWrite(m, before);
      const last = (await stepSequence(after, 'scratch')).at(-1)!;
      await expectStepSequence(before, after, 'scratch', (g) => [...g, last]);
      expect(last.steps).toHaveLength(1);
      expect(last.parallel).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Row 75: every step field
// ---------------------------------------------------------------------------

describe('every step field (row 75)', SLOW, () => {
  it.each([
    {
      name: 'a bracket kind and every body field',
      spec: {
        source: 'user',
        target: 'app.db',
        kind: 'async',
        title: 'Store',
        description: 'Stores the order',
        technology: 'sql',
        notes: 'Retried',
        notation: 'Write',
        navigateTo: 'later',
        color: 'brand',
        line: 'dotted',
        head: 'vee',
        tail: 'crow',
      },
      text: "    user -[async]-> app.db 'Store' {\n      description 'Stores the order'\n      technology 'sql'\n      notes 'Retried'\n      notation 'Write'\n      navigateTo later\n      line dotted\n      color brand\n      head vee\n      tail crow\n    }\n",
      parsed: {
        source: 'user',
        target: 'app.db',
        kind: 'async',
        title: 'Store',
        description: { txt: 'Stores the order' },
        technology: 'sql',
        notes: { txt: 'Retried' },
        notation: 'Write',
        navigateTo: 'later',
        color: 'brand',
        line: 'dotted',
        head: 'vee',
        tail: 'crow',
      },
    },
    {
      name: 'a dot kind',
      spec: { source: 'user', target: 'app.db', kind: 'async', kindForm: 'dot' },
      text: '    user .async app.db\n',
      parsed: { source: 'user', target: 'app.db', kind: 'async' },
    },
  ] as Array<{ name: string; spec: ViewStepSpec; text: string; parsed: Record<string, unknown> }>)('$name', async ({ spec, text, parsed }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    m.addViewStep('flow', spec);
    const after = m.serialize();
    expect(after).toEqual(workspace(FLOW.replace('    include app\n', `${text}    include app\n`)));
    const read = (statementAt(m, 'flow', [4]) as Extract<ViewStepStatementInfo, { type: 'step' }>).step;
    expect(read).toMatchObject({ source: { text: 'user' }, target: { text: 'app.db' }, kind: { name: 'async', form: spec.kindForm ?? 'bracket' } });
    if (spec.navigateTo) {
      expect(read).toMatchObject({
        title: 'Store',
        body: {
          description: { txt: 'Stores the order' },
          technology: 'sql',
          notes: { txt: 'Retried' },
          notation: 'Write',
          navigateTo: { text: 'later', target: 'later' },
          style: { color: 'brand', line: 'dotted', head: 'vee', tail: 'crow' },
        },
      });
    }
    // LikeC4's parsed step has the same values.
    expect(await parsedStepAt(after, 'flow', read.sequence!)).toMatchObject(parsed);
    await expectAccepted(m, BASE, 'flow', (g) => [...g, { parallel: false, steps: [step('user', 'app.db', spec.title ?? null, { kind: 'async' })] }]);
  });
});

// ---------------------------------------------------------------------------
// Row 76: rejections
// ---------------------------------------------------------------------------

describe('addViewStep rejections (row 76)', SLOW, () => {
  it.each([
    { name: 'an ambiguous endpoint', rejected: { source: 'api', target: 'user' }, field: 'step.source', accepted: { source: 'app.api', target: 'user' }, entry: step('app.api', 'user', null) },
    { name: 'an endpoint declared only in another file', rejected: { source: 'user', target: 'deep' }, field: 'step.target', accepted: { source: 'user', target: 'ext.deep' }, entry: step('user', 'ext.deep', null) },
    { name: 'a parent–child pair', rejected: { source: 'app', target: 'app.api' }, field: 'step.target', accepted: { source: 'app', target: 'user' }, entry: step('app', 'user', null) },
    { name: 'an undeclared kind', rejected: { source: 'user', target: 'app.db', kind: 'nokind' }, field: 'step.kind', accepted: { source: 'user', target: 'app.db', kind: 'async' }, entry: step('user', 'app.db', null, { kind: 'async' }) },
    { name: 'a backward step with a kind (D38)', rejected: { source: 'user', target: 'app.db', direction: 'backward', kind: 'async' }, field: 'step.kind', accepted: { source: 'user', target: 'app.db', direction: 'backward' }, entry: step('user', 'app.db', null, { backward: true }) },
    { name: 'navigateTo an element view', rejected: { source: 'user', target: 'app.db', navigateTo: 'index' }, field: 'step.navigateTo', accepted: { source: 'user', target: 'app.db', navigateTo: 'later' }, entry: step('user', 'app.db', null) },
    { name: 'navigateTo an unknown view', rejected: { source: 'user', target: 'app.db', navigateTo: 'nope' }, field: 'step.navigateTo', accepted: { source: 'user', target: 'app.db', navigateTo: 'later' }, entry: step('user', 'app.db', null) },
    { name: 'an undeclared color', rejected: { source: 'user', target: 'app.db', color: 'nocolor' }, field: 'step.color', accepted: { source: 'user', target: 'app.db', color: 'brand' }, entry: step('user', 'app.db', null) },
    { name: 'an endpoint that smuggles DSL', rejected: { source: 'user -> app.api', target: 'app.db' }, field: 'step.source', accepted: { source: 'user', target: 'app.db' }, entry: step('user', 'app.db', null) },
    { name: 'a kind that smuggles DSL', rejected: { source: 'user', target: 'app.db', kind: 'async]-> app.api' }, field: 'step.kind', accepted: { source: 'user', target: 'app.db', kind: 'async' }, entry: step('user', 'app.db', null, { kind: 'async' }) },
    { name: 'a navigateTo that smuggles DSL', rejected: { source: 'user', target: 'app.db', navigateTo: 'later }' }, field: 'step.navigateTo', accepted: { source: 'user', target: 'app.db', navigateTo: 'later' }, entry: step('user', 'app.db', null) },
  ] as Array<{ name: string; rejected: ViewStepSpec; field: string; accepted: ViewStepSpec; entry: SequenceStep }>)(
    '$name → $field',
    async ({ rejected, field, accepted, entry }) => {
      const m = LikeC4Mutator.fromFiles(BASE);
      expectRejected(m, () => m.addViewStep('flow', rejected), field);
      m.addViewStep('flow', accepted);
      await expectAccepted(m, BASE, 'flow', (g) => [...g, { parallel: false, steps: [entry] }]);
    },
  );

  it.each([
    { name: 'a path that does not exist', path: [9] },
    { name: 'a path inside a par block that does not exist', path: [1, 5] },
    { name: 'a path into a single step', path: [0, 0] },
    { name: 'a path into a chain', path: [2, 0] },
    { name: 'a path into a stage-6 block', path: [3, 0] },
    { name: 'a path that is not a list of indices', path: [-1] },
  ])('rejects $name on path', ({ path }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addViewStep('flow', { source: 'user', target: 'app.db' }, { path }), 'path');
  });

  it('rejects an unknown id, an id declared in two files and a generated id on id', async () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addViewStep('nope', { source: 'user', target: 'app.db' }), 'id');
    const twice = LikeC4Mutator.fromFiles({ ...BASE, 'z.c4': 'views {\n  dynamic view flow {\n    user -> app.db\n  }\n}\n' });
    expectRejected(twice, () => twice.addViewStep('flow', { source: 'user', target: 'app.db' }), 'id');
    const files = { ...BASE, 'z.c4': 'views {\n  view of app {\n    include *\n  }\n}\n' };
    const generated = Object.keys(await computedViews(files)).filter((id) => !['flow', 'later', 'index'].includes(id));
    expect(generated).toHaveLength(1);
    const unnamed = LikeC4Mutator.fromFiles(files);
    expectRejected(unnamed, () => unnamed.addViewStep(generated[0]!, { source: 'user', target: 'app.db' }), 'id');
  });
});

// ---------------------------------------------------------------------------
// Row 77: bodyless, one-line and CRLF dynamic views
// ---------------------------------------------------------------------------

describe('bodyless, one-line and CRLF dynamic views (row 77)', SLOW, () => {
  const NEW: ViewStepSpec = { source: 'app.db', target: 'user' };
  const ENTRY = step('app.db', 'user', null);

  it('gives a bodyless dynamic view a body', async () => {
    const before = { 'm.c4': `${MODEL}views {\n  dynamic view d\n  dynamic view keep {\n    user -> app.api\n  }\n}\n` };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.addViewStep('d', NEW);
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': `${MODEL}views {\n  dynamic view d {\n    app.db -> user\n  }\n  dynamic view keep {\n    user -> app.api\n  }\n}\n` });
    await expectValidViewWrite(m, before);
    // SEQ: LikeC4 computes no view from the bodyless declaration before the write.
    expect(Object.keys(await computedViews(before))).not.toContain('d');
    expect(await stepSequence(after, 'd')).toEqual([{ parallel: false, steps: [ENTRY] }]);
  });

  it('adds a second step to a one-line body', async () => {
    const before = { 'm.c4': `${MODEL}views {\n  dynamic view d { user -> app.api }\n}\n` };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.addViewStep('d', NEW);
    expect(m.serialize()).toEqual({ 'm.c4': `${MODEL}views {\n  dynamic view d {\n    user -> app.api\n    app.db -> user\n  }\n}\n` });
    await expectAccepted(m, before, 'd', (g) => [...g, { parallel: false, steps: [ENTRY] }]);
  });

  it('writes CRLF into a CRLF file, the rest unchanged', async () => {
    const head = `${MODEL}views {\n  dynamic view d {\n    user -> app.api\n`.replace(/\n/g, '\r\n');
    const tail = '  }\r\n}\r\n';
    const before = { 'm.c4': head + tail };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.addViewStep('d', NEW);
    const text = m.serialize()['m.c4']!;
    expect(text).toBe(head + '    app.db -> user\r\n' + tail);
    expect(/(?<!\r)\n/.test(text)).toBe(false);
    await expectAccepted(m, before, 'd', (g) => [...g, { parallel: false, steps: [ENTRY] }]);
  });
});
