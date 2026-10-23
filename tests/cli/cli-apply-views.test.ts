/**
 * `apply` with the view operations (US-12; rows 89–93 of the lc4m-15.29
 * test matrix): each operation on a copy of the `views-catalog` fixture,
 * the strict validation of the mutations file, library rejections through
 * `apply`, and `addView` `autoLayout`.
 *
 * Expected texts and sequences are written by hand from the fixture and the
 * spec; every accepted run passes the conventions of `view-writes.ts` on
 * its output.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { computedViews, expectValidLikeC4 } from '../helpers/likec4-model.js';
import {
  editedLines,
  expectSameComputedView,
  expectStepSequence,
  expectValidViewWrite,
  type SequenceGroup,
} from '../helpers/view-writes.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE = join(PROJECT_ROOT, 'tests', 'fixtures', 'views-catalog');
const SLOW = { timeout: 180_000 };

/** Every `.c4` file of the fixture by its path relative to it. */
function fixture(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.c4')) files[relative(FIXTURE, path)] = readFileSync(path, 'utf-8');
    }
  };
  walk(FIXTURE);
  return files;
}
const BASE = fixture();

/** Run `apply --in-place` on a copy of `files`; the exit status, stderr, stdout and the files after it. */
function runApply(mutations: unknown, files: Record<string, string> = BASE) {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-views-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text, 'utf-8');
  }
  const mutationsPath = join(tmpdir(), `mutations-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  const after: Record<string, string> = {};
  for (const name of Object.keys(files)) after[name] = readFileSync(join(dir, name), 'utf-8');
  return { status: result.status, stderr: result.stderr, stdout: result.stdout, after };
}

/** The run was rejected naming `path`, and wrote nothing. */
function expectRejectedRun(mutations: unknown[], path: string, files: Record<string, string> = BASE): void {
  const run = runApply(mutations, files);
  expect(run.status, run.stderr).toBe(1);
  expect(run.stderr).toContain(`${path}:`);
  expect(run.after).toEqual(files);
}

/** The run succeeded; Wv on its output; the mutator reading it. */
async function expectAcceptedRun(mutations: unknown[], files: Record<string, string> = BASE, link = false): Promise<{ m: LikeC4Mutator; after: Record<string, string> }> {
  const run = runApply(mutations, files);
  expect(run.status, run.stderr).toBe(0);
  const m = LikeC4Mutator.fromFiles(run.after);
  expect(m.serialize()).toEqual(run.after);
  const changed = Object.keys(files).find((name) => files[name] !== run.after[name]);
  await expectValidViewWrite(m, files, link && changed ? editedLines(files, run.after, changed) : {});
  return { m, after: run.after };
}

const VIEWS = 'views.c4';
/** `BASE` with `views.c4` edited by hand. */
const edited = (from: string, to: string): Record<string, string> => {
  expect(BASE[VIEWS]).toContain(from);
  return { ...BASE, [VIEWS]: BASE[VIEWS]!.replace(from, to) };
};

const ORDER_FLOW = "  dynamic view orderFlow {\n    title 'Order flow'\n    customer -> shop.storefront 'opens'\n    shop.storefront -[sync]-> shop.orders\n    include partner\n    autoLayout LeftRight\n  }\n";

// ---------------------------------------------------------------------------
// Row 89: every operation through apply
// ---------------------------------------------------------------------------

describe('each view operation through apply (row 89)', SLOW, () => {
  it('updateView', async () => {
    await expectValidLikeC4(BASE);
    const { m } = await expectAcceptedRun([{ op: 'updateView', id: 'landscape', title: 'Overview', tags: ['beta'], links: [{ url: 'https://example.com/x', label: 'X' }], autoLayout: 'RightLeft' }]);
    expect(m.getView('landscape')).toMatchObject({ title: 'Overview', tags: ['beta'], links: [{ url: 'https://example.com/x', label: 'X' }] });
    expect(m.getView('landscape')!.rules.at(-1)).toMatchObject({ kind: 'autoLayout', autoLayout: { direction: 'RightLeft' } });
  });

  it('addViewRule, replaceViewRule and removeViewRule', async () => {
    const add = await expectAcceptedRun([{ op: 'addViewRule', id: 'landscape', rule: { kind: 'exclude', expression: 'customer' } }], BASE, true);
    const added = edited('    autoLayout LeftRight\n    autoLayout TopBottom 120 60\n', '    autoLayout LeftRight\n    exclude customer\n    autoLayout TopBottom 120 60\n');
    expect(add.after).toEqual(added);
    expect(add.m.getView('landscape')!.rules[3]).toMatchObject({ kind: 'exclude', text: 'exclude customer' });
    await expectSameComputedView(add.after, added, 'landscape');

    const replace = await expectAcceptedRun([{ op: 'replaceViewRule', id: 'landscape', address: { index: 1, text: 'exclude partner' }, rule: { kind: 'exclude', expression: 'customer' } }], BASE, true);
    const replaced = edited('    exclude partner\n', '    exclude customer\n');
    expect(replace.after).toEqual(replaced);
    await expectSameComputedView(replace.after, replaced, 'landscape');

    const remove = await expectAcceptedRun([{ op: 'removeViewRule', id: 'landscape', address: { index: 1 } }], BASE, true);
    const removed = edited('    exclude partner\n', '');
    expect(remove.after).toEqual(removed);
    expect(remove.m.getView('landscape')!.rules.map((r) => r.text)).not.toContain('exclude partner');
    await expectSameComputedView(remove.after, removed, 'landscape');
  });

  it('removeView', async () => {
    const { m, after } = await expectAcceptedRun([{ op: 'removeView', id: 'draft' }], BASE, true);
    expect(after).toEqual(edited('  view draft\n', ''));
    expect(m.getView('draft')).toBeNull();
  });

  it('addViewStep, updateViewStep, moveViewStep, removeViewStep and addViewParallel', async () => {
    const cases: Array<{ mutation: unknown; text: string; edit: (g: SequenceGroup[]) => SequenceGroup[] }> = [
      {
        mutation: { op: 'addViewStep', id: 'orderFlow', step: { source: 'shop.orders', target: 'shop.ledger', title: 'records' } },
        text: ORDER_FLOW.replace('    include partner\n', "    shop.orders -> shop.ledger 'records'\n    include partner\n"),
        edit: (g) => [...g, { parallel: false, steps: [{ source: 'shop.orders', target: 'shop.ledger', title: 'records', backward: false }] }],
      },
      {
        mutation: { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: { title: 'visits' } },
        text: ORDER_FLOW.replace("'opens'", "'visits'"),
        edit: (g) => [{ parallel: false, steps: [{ ...g[0]!.steps[0]!, title: 'visits' }] }, ...g.slice(1)],
      },
      {
        mutation: { op: 'moveViewStep', id: 'orderFlow', from: { path: [1] }, to: [0] },
        text: ORDER_FLOW.replace("    customer -> shop.storefront 'opens'\n    shop.storefront -[sync]-> shop.orders\n", "    shop.storefront -[sync]-> shop.orders\n    customer -> shop.storefront 'opens'\n"),
        edit: (g) => [g[1]!, g[0]!],
      },
      {
        mutation: { op: 'removeViewStep', id: 'orderFlow', address: { path: [1] } },
        text: ORDER_FLOW.replace('    shop.storefront -[sync]-> shop.orders\n', ''),
        edit: (g) => [g[0]!],
      },
      {
        mutation: { op: 'addViewParallel', id: 'orderFlow', statements: [[0], [1]] },
        text: ORDER_FLOW.replace("    customer -> shop.storefront 'opens'\n    shop.storefront -[sync]-> shop.orders\n", "    par {\n      customer -> shop.storefront 'opens'\n      shop.storefront -[sync]-> shop.orders\n    }\n"),
        edit: (g) => [{ parallel: true, steps: [...g[0]!.steps, ...g[1]!.steps] }],
      },
    ];
    for (const { mutation, text, edit } of cases) {
      const removal = (mutation as { op: string }).op === 'removeViewStep';
      const { m, after } = await expectAcceptedRun([mutation], BASE, removal);
      expect(after).toEqual(edited(ORDER_FLOW, text));
      expect(m.getView('orderFlow')!.steps!.length).toBeGreaterThan(0);
      await expectStepSequence(BASE, after, 'orderFlow', edit);
    }
  });

  it('addView with autoLayout, description, extends and file', async () => {
    const { m, after } = await expectAcceptedRun([
      { op: 'addView', id: 'detail', type: 'element', extends: 'landscape', title: 'Detail', description: 'Details', includes: ['shop'], autoLayout: 'LeftRight', file: 'operations.c4' },
    ]);
    expect(m.getView('detail')).toMatchObject({ file: 'operations.c4', extends: { text: 'landscape', target: 'landscape' }, title: 'Detail', description: { txt: 'Details' } });
    expect(m.getView('detail')!.rules.map((r) => r.text)).toEqual(['include shop', 'autoLayout LeftRight']);
    expect(after[VIEWS]).toBe(BASE[VIEWS]);
    expect(Object.keys(await computedViews(after))).toContain('detail');
    // EFF (review W2): the view as written by hand at the end of the CRLF file's views block.
    const operations = BASE['operations.c4']!;
    expect(operations.endsWith('  }\r\n}\r\n')).toBe(true);
    const expected = {
      ...BASE,
      'operations.c4':
        operations.slice(0, -'}\r\n'.length) +
        "  view detail extends landscape {\r\n    title 'Detail'\r\n    description 'Details'\r\n    include shop\r\n    autoLayout LeftRight\r\n  }\r\n}\r\n",
    };
    expect(after).toEqual(expected);
    await expectSameComputedView(after, expected, 'detail');
  });
});

// ---------------------------------------------------------------------------
// Row 90: strict validation of the mutations file
// ---------------------------------------------------------------------------

const RULE = { kind: 'include', expression: '*' };
const STEP = { source: 'customer', target: 'shop.orders' };

describe('strict validation of the mutations file (row 90)', SLOW, () => {
  it.each([
    // (a) unknown fields
    ['(a) top level', { op: 'removeView', id: 'draft', name: 'x' }, 'mutations[0].name'],
    ['(a) inside step', { op: 'addViewStep', id: 'orderFlow', step: { ...STEP, label: 'x' } }, 'mutations[0].step.label'],
    ['(a) inside patch', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: { label: 'x' } }, 'mutations[0].patch.label'],
    ['(a) inside address', { op: 'removeViewRule', id: 'landscape', address: { index: 0, line: 1 } }, 'mutations[0].address.line'],
    ['(a) inside rule', { op: 'addViewRule', id: 'landscape', rule: { ...RULE, where: 'x' } }, 'mutations[0].rule.where'],
    ['(a) inside before', { op: 'addViewRule', id: 'landscape', rule: RULE, before: { index: 0, at: 1 } }, 'mutations[0].before.at'],
    ['(a) inside links[j]', { op: 'updateView', id: 'landscape', links: [{ url: 'https://example.com', title: 'x' }] }, 'mutations[0].links[0].title'],
    // (b) malformed objects
    ['(b) step as a string', { op: 'addViewStep', id: 'orderFlow', step: 'a -> b' }, 'mutations[0].step'],
    ['(b) patch as a number', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: 1 }, 'mutations[0].patch'],
    ['(b) rule as an array', { op: 'addViewRule', id: 'landscape', rule: ['include', '*'] }, 'mutations[0].rule'],
    ['(b) address as null', { op: 'removeViewRule', id: 'landscape', address: null }, 'mutations[0].address'],
    ['(b) before as a string', { op: 'addViewRule', id: 'landscape', rule: RULE, before: '0' }, 'mutations[0].before'],
    // (c) wrong scalar types inside objects
    ['(c) rule.kind not include / exclude', { op: 'addViewRule', id: 'landscape', rule: { kind: 'style', expression: '*' } }, 'mutations[0].rule.kind'],
    ['(c) rule.kind not a string', { op: 'addViewRule', id: 'landscape', rule: { kind: 1, expression: '*' } }, 'mutations[0].rule.kind'],
    ['(c) rule.expression not a string', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 1 } }, 'mutations[0].rule.expression'],
    ['(c) address.index negative', { op: 'removeViewRule', id: 'landscape', address: { index: -1 } }, 'mutations[0].address.index'],
    ['(c) address.index not an integer', { op: 'removeViewRule', id: 'landscape', address: { index: 1.5 } }, 'mutations[0].address.index'],
    ['(c) address.index a string', { op: 'removeViewRule', id: 'landscape', address: { index: '1' } }, 'mutations[0].address.index'],
    ['(c) address.text not a string', { op: 'removeViewRule', id: 'landscape', address: { index: 0, text: 1 } }, 'mutations[0].address.text'],
    ['(c) address.segment not an index', { op: 'removeViewStep', id: 'orderFlow', address: { path: [0], segment: -1 } }, 'mutations[0].address.segment'],
    ['(c) step.source not a string', { op: 'addViewStep', id: 'orderFlow', step: { source: 1, target: 'shop.orders' } }, 'mutations[0].step.source'],
    ['(c) step.target not a string', { op: 'addViewStep', id: 'orderFlow', step: { source: 'customer', target: [] } }, 'mutations[0].step.target'],
    ['(c) step.direction', { op: 'addViewStep', id: 'orderFlow', step: { ...STEP, direction: 'up' } }, 'mutations[0].step.direction'],
    ['(c) step.kindForm', { op: 'addViewStep', id: 'orderFlow', step: { ...STEP, kindForm: 'arrow' } }, 'mutations[0].step.kindForm'],
    ['(c) a patch string as a number', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: { technology: 1 } }, 'mutations[0].patch.technology'],
    // (d) containers
    ['(d) path not an array', { op: 'addViewStep', id: 'orderFlow', step: STEP, path: 1 }, 'mutations[0].path'],
    ['(d) path with a negative index', { op: 'addViewStep', id: 'orderFlow', step: STEP, path: [-1] }, 'mutations[0].path[0]'],
    ['(d) from not a step address', { op: 'moveViewStep', id: 'orderFlow', from: [0], to: [1] }, 'mutations[0].from'],
    ['(d) to not an array', { op: 'moveViewStep', id: 'orderFlow', from: { path: [0] }, to: '1' }, 'mutations[0].to'],
    ['(d) to with a string element', { op: 'moveViewStep', id: 'orderFlow', from: { path: [0] }, to: ['1'] }, 'mutations[0].to[0]'],
    ['(d) statements not an array', { op: 'addViewParallel', id: 'orderFlow', statements: 0 }, 'mutations[0].statements'],
    ['(d) statements with a malformed path', { op: 'addViewParallel', id: 'orderFlow', statements: [[0], [1.5]] }, 'mutations[0].statements[1][0]'],
    ['(d) steps not an array of steps', { op: 'addViewParallel', id: 'orderFlow', steps: ['a -> b'] }, 'mutations[0].steps[0]'],
    // (e) fields of updateView and addView
    ['(e) updateView title', { op: 'updateView', id: 'landscape', title: 1 }, 'mutations[0].title'],
    ['(e) updateView description', { op: 'updateView', id: 'landscape', description: [] }, 'mutations[0].description'],
    ['(e) updateView tags', { op: 'updateView', id: 'landscape', tags: ['beta', 1] }, 'mutations[0].tags[1]'],
    ['(e) updateView links', { op: 'updateView', id: 'landscape', links: ['https://example.com'] }, 'mutations[0].links[0]'],
    ['(e) updateView autoLayout', { op: 'updateView', id: 'landscape', autoLayout: 1 }, 'mutations[0].autoLayout'],
    ['(e) addView extends', { op: 'addView', id: 'x', type: 'element', extends: 1 }, 'mutations[0].extends'],
    ['(e) addView file', { op: 'addView', id: 'x', type: 'element', file: true }, 'mutations[0].file'],
    ['(e) addView description', { op: 'addView', id: 'x', type: 'element', description: 1 }, 'mutations[0].description'],
    ['(e) addView autoLayout', { op: 'addView', id: 'x', type: 'element', autoLayout: 1 }, 'mutations[0].autoLayout'],
    // (f) missing required fields
    ...['updateView', 'addViewRule', 'replaceViewRule', 'removeViewRule', 'removeView', 'addViewStep', 'updateViewStep', 'moveViewStep', 'removeViewStep', 'addViewParallel'].map(
      (op) => [`(f) id on ${op}`, { op }, 'mutations[0].id'] as const,
    ),
    ['(f) rule on addViewRule', { op: 'addViewRule', id: 'landscape' }, 'mutations[0].rule'],
    ['(f) rule on replaceViewRule', { op: 'replaceViewRule', id: 'landscape', address: { index: 0 } }, 'mutations[0].rule'],
    ['(f) address on replaceViewRule', { op: 'replaceViewRule', id: 'landscape', rule: RULE }, 'mutations[0].address'],
    ['(f) address on removeViewRule', { op: 'removeViewRule', id: 'landscape' }, 'mutations[0].address'],
    ['(f) address on updateViewStep', { op: 'updateViewStep', id: 'orderFlow', patch: { title: 'x' } }, 'mutations[0].address'],
    ['(f) address on removeViewStep', { op: 'removeViewStep', id: 'orderFlow' }, 'mutations[0].address'],
    ['(f) step on addViewStep', { op: 'addViewStep', id: 'orderFlow' }, 'mutations[0].step'],
    ['(f) patch on updateViewStep', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] } }, 'mutations[0].patch'],
    ['(f) from on moveViewStep', { op: 'moveViewStep', id: 'orderFlow', to: [0] }, 'mutations[0].from'],
    ['(f) to on moveViewStep', { op: 'moveViewStep', id: 'orderFlow', from: { path: [0] } }, 'mutations[0].to'],
    ['(f) statements or steps on addViewParallel', { op: 'addViewParallel', id: 'orderFlow' }, 'mutations[0].statements'],
    // (g) null where the library defines no removal
    ['(g) null id', { op: 'removeView', id: null }, 'mutations[0].id'],
    ['(g) null rule', { op: 'addViewRule', id: 'landscape', rule: null }, 'mutations[0].rule'],
    ['(g) null address', { op: 'removeViewStep', id: 'orderFlow', address: null }, 'mutations[0].address'],
    ['(g) null path', { op: 'addViewStep', id: 'orderFlow', step: STEP, path: null }, 'mutations[0].path'],
    ['(g) null tags', { op: 'updateView', id: 'landscape', tags: null }, 'mutations[0].tags'],
    ['(g) null links', { op: 'updateView', id: 'landscape', links: null }, 'mutations[0].links'],
    ['(g) null file', { op: 'addView', id: 'x', type: 'element', file: null }, 'mutations[0].file'],
    ['(g) null extends', { op: 'addView', id: 'x', type: 'element', extends: null }, 'mutations[0].extends'],
    // (h) nested classes
    ['(h) a step address without path', { op: 'updateViewStep', id: 'orderFlow', address: {}, patch: { title: 'x' } }, 'mutations[0].address.path'],
    ['(h) a step address path that is not an array', { op: 'removeViewStep', id: 'orderFlow', address: { path: 0 } }, 'mutations[0].address.path'],
    ['(h) an empty step address path', { op: 'removeViewStep', id: 'orderFlow', address: { path: [] } }, 'mutations[0].address.path'],
    ['(h) a negative step address element', { op: 'removeViewStep', id: 'orderFlow', address: { path: [0, -1] } }, 'mutations[0].address.path[1]'],
    ['(h) a non-integer step address element', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0.5] }, patch: { title: 'x' } }, 'mutations[0].address.path[0]'],
    ['(h) a string step address element', { op: 'removeViewStep', id: 'orderFlow', address: { path: ['0'] } }, 'mutations[0].address.path[0]'],
    ['(h) before.index negative', { op: 'addViewRule', id: 'landscape', rule: RULE, before: { index: -1 } }, 'mutations[0].before.index'],
    ['(h) before.index a string', { op: 'addViewRule', id: 'landscape', rule: RULE, before: { index: '0' } }, 'mutations[0].before.index'],
    ['(h) before.text not a string', { op: 'addViewRule', id: 'landscape', rule: RULE, before: { index: 0, text: 0 } }, 'mutations[0].before.text'],
    ['(h) before without index', { op: 'addViewRule', id: 'landscape', rule: RULE, before: { text: 'include *' } }, 'mutations[0].before.index'],
    ['(h) a rule without kind', { op: 'addViewRule', id: 'landscape', rule: { expression: '*' } }, 'mutations[0].rule.kind'],
    ['(h) a rule without expression', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include' } }, 'mutations[0].rule.expression'],
    ['(h) a step without source', { op: 'addViewStep', id: 'orderFlow', step: { target: 'shop.orders' } }, 'mutations[0].step.source'],
    ['(h) a step without target', { op: 'addViewStep', id: 'orderFlow', step: { source: 'customer' } }, 'mutations[0].step.target'],
    ['(h) a new step of addViewParallel without source', { op: 'addViewParallel', id: 'orderFlow', steps: [{ target: 'shop.orders' }] }, 'mutations[0].steps[0].source'],
    ['(h) a rule address without index', { op: 'removeViewRule', id: 'landscape', address: { text: 'include *' } }, 'mutations[0].address.index'],
    ['(h) patch.direction', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: { direction: 'up' } }, 'mutations[0].patch.direction'],
    ['(h) patch.kindForm', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0] }, patch: { kindForm: 'arrow' } }, 'mutations[0].patch.kindForm'],
  ] as Array<readonly [string, unknown, string]>)('%s → %s', (_, mutation, path) => {
    // The second mutation is the rejected one, so the path names its index.
    expectRejectedRun([{ op: 'removeView', id: 'draft' }, mutation], path.replace('mutations[0]', 'mutations[1]'));
  });

  it('accepts the valid types and the null forms where the library removes a value', async () => {
    const { m, after } = await expectAcceptedRun([
      { op: 'updateView', id: 'landscape', title: null, description: null, autoLayout: null, tags: [], links: [] },
      { op: 'updateViewStep', id: 'orderFlow', address: { path: [0], text: "customer -> shop.storefront 'opens'" }, patch: { title: null, kind: null, navigateTo: null, color: null, technology: null } },
      { op: 'updateViewStep', id: 'orderFlow', address: { path: [1], segment: undefined }, patch: { kindForm: 'dot', direction: 'forward', technology: 'http', notes: 'n' } },
      { op: 'addViewRule', id: 'shopView', rule: { kind: 'exclude', expression: 'partner' }, before: { index: 0, text: 'include *, customer,' } },
      { op: 'addViewStep', id: 'orderFlow', step: { source: 'shop.orders', target: 'customer', direction: 'backward', kindForm: 'bracket', title: 't' }, path: [2] },
      { op: 'addViewParallel', id: 'orderFlow', statements: [[0]], steps: [{ source: 'partner', target: 'shop.orders' }], path: [0] },
    ]);
    const landscape = m.getView('landscape')!;
    expect(landscape).toMatchObject({ rules: [{ text: 'include *' }, { text: 'exclude partner' }] });
    for (const key of ['title', 'description', 'tags', 'links'] as const) expect(landscape[key]).toBeUndefined();
    expect(m.getView('shopView')!.rules[0]).toMatchObject({ kind: 'exclude', text: 'exclude partner' });
    // The texts the batch writes, by hand.
    const expectedFlow =
      "  dynamic view orderFlow {\n    title 'Order flow'\n    par {\n      customer -> shop.storefront\n      partner -> shop.orders\n    }\n" +
      "    shop.storefront .sync shop.orders {\n      technology 'http'\n      notes 'n'\n    }\n    customer <- shop.orders 't'\n    include partner\n    autoLayout LeftRight\n  }\n";
    expect(after[VIEWS]).toContain(expectedFlow);
    expect(after[VIEWS]).toContain('  view landscape {\n    include *\n    exclude partner\n  }\n');
    expect(after[VIEWS]).toContain("  view shopView of shop {\n    title 'Shop'\n    exclude partner\n    include *, customer,\n");
    // EFF (review W2): shopView with only its new rule, written by hand.
    await expectSameComputedView(after, edited("  view shopView of shop {\n    title 'Shop'\n", "  view shopView of shop {\n    title 'Shop'\n    exclude partner\n"), 'shopView');
    // SEQ of the step writes: LikeC4 titles a step without one after its relationship.
    await expectStepSequence(BASE, after, 'orderFlow', (g) => [
      {
        parallel: true,
        steps: [
          { source: 'customer', target: 'shop.storefront', title: 'browses', backward: false },
          { source: 'partner', target: 'shop.orders', title: 'confirms', backward: false },
        ],
      },
      g[1]!,
      { parallel: false, steps: [{ source: 'shop.orders', target: 'customer', title: 't', backward: true }] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Row 91: library rejections through apply are atomic
// ---------------------------------------------------------------------------

describe('library rejections through apply are atomic (row 91)', SLOW, () => {
  const FIRST = { op: 'updateView', id: 'landscape', title: 'Changed' };

  it.each([
    ['D35 through addView', { op: 'addView', id: 'x', type: 'dynamic', includes: ['customer', 'customer -> shop.orders'] }, 'mutations[1].includes[1]'],
    ['an unresolved reference through addViewRule', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'nope' } }, 'mutations[1].rule.expression'],
    ['an undeclared custom color through addView', { op: 'addView', id: 'x', type: 'element', includes: ['customer with { color nocolor }'] }, 'mutations[1].includes[0]'],
    ['a library icon that does not exist through addViewRule', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'customer with { icon tech:no-such-icon }' } }, 'mutations[1].rule.expression'],
    ['an undeclared custom color on a relation through replaceViewRule', { op: 'replaceViewRule', id: 'landscape', address: { index: 0 }, rule: { kind: 'include', expression: 'customer -> shop.storefront with { color nocolor }' } }, 'mutations[1].rule.expression'],
    ['a guard mismatch through updateViewStep', { op: 'updateViewStep', id: 'orderFlow', address: { path: [0], text: 'x' }, patch: { title: 'x' } }, 'mutations[1].address.text'],
    // Review C1: an icon given twice in one with body.
    ['an icon given twice through addViewRule', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'customer with { icon tech:react icon https://example.com/b.svg }' } }, 'mutations[1].rule.expression'],
    ['an icon given twice through addView', { op: 'addView', id: 'x', type: 'element', includes: ['customer with { icon tech:react icon tech:vue }'] }, 'mutations[1].includes[0]'],
    // Review C2: an expression that leaves its rule for a block-level style.
    ['an include escaping into a block-level style through addView', { op: 'addView', id: 'x', type: 'element', includes: ['customer\n}\nstyle * {\ncolor red'] }, 'mutations[1].includes[0]'],
    ['an expression escaping into a block-level style through addViewRule', { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'customer\n}\nstyle * {\ncolor red' } }, 'mutations[1].rule.expression'],
    ['an expression escaping into a global block through replaceViewRule', { op: 'replaceViewRule', id: 'landscape', address: { index: 0 }, rule: { kind: 'include', expression: 'customer\n}\n}\nglobal {\nstyle loud * {\ncolor red\n}' } }, 'mutations[1].rule.expression'],
  ] as Array<[string, unknown, string]>)('%s → %s', (_, mutation, path) => {
    expectRejectedRun([FIRST, mutation], path);
  });

  it('an edit the broken file cannot take → mutations[1].id (D42, review W1)', () => {
    const files = { ...BASE, 'broken.c4': "views {\n  view broken {\n    include *\n  }\n}\nmodel {\n  x = system 'unclosed\n}\n" };
    expectRejectedRun([FIRST, { op: 'updateView', id: 'broken', tags: ['beta'] }], 'mutations[1].id', files);
  });

  it.each([
    ['addViewStep', { op: 'addViewStep', id: 'landscape', step: { source: 'customer', target: 'shop' }, path: [0] }],
    ['updateViewStep', { op: 'updateViewStep', id: 'landscape', address: { path: [0] }, patch: { title: 'T' } }],
    ['moveViewStep', { op: 'moveViewStep', id: 'landscape', from: { path: [0] }, to: [1] }],
    ['removeViewStep', { op: 'removeViewStep', id: 'landscape', address: { path: [0] } }],
    ['addViewParallel', { op: 'addViewParallel', id: 'landscape', steps: [{ source: 'customer', target: 'shop' }] }],
  ])('%s on an element view → mutations[1].id (D52)', (_name, op) => {
    expectRejectedRun([FIRST, op], 'mutations[1].id');
  });

  it('the D40 block case → mutations[1].from', () => {
    const files = edited(ORDER_FLOW, "  dynamic view orderFlow {\n    par {\n      customer -> shop.storefront\n      opt { }\n    }\n    include partner\n  }\n");
    expectRejectedRun([FIRST, { op: 'moveViewStep', id: 'orderFlow', from: { path: [0, 0] }, to: [1] }], 'mutations[1].from', files);
  });

  it('applies Wv and EFF to each prefix of the accepted batch (review W2)', async () => {
    // Without a file, x goes to the first file in LikeC4's document order with a views block: operations.c4 (CRLF).
    const X = '  view x {\r\n    include customer with { color brand }\r\n  }\r\n';
    const withX = (files: Record<string, string>) => ({ ...files, 'operations.c4': files['operations.c4']!.replace(/}\r\n$/, `${X}}\r\n`) });
    const ICON = '    autoLayout LeftRight\n    include customer with { icon tech:react }\n    autoLayout TopBottom 120 60\n';
    const mutations = [
      { op: 'addView', id: 'x', type: 'element', includes: ['customer with { color brand }'], autoLayout: '' },
      { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'customer with { icon tech:react }' } },
      { op: 'replaceViewRule', id: 'landscape', address: { index: 1 }, rule: { kind: 'exclude', expression: 'partner' } },
    ];
    const one = withX(BASE);
    const two = withX(edited('    autoLayout LeftRight\n    autoLayout TopBottom 120 60\n', ICON));
    const prefixes = [
      { length: 1, expected: one, views: ['x'] },
      { length: 2, expected: two, views: ['x', 'landscape'] },
      { length: 3, expected: two, views: ['x', 'landscape'] },
    ];
    for (const { length, expected, views } of prefixes) {
      const { after } = await expectAcceptedRun(mutations.slice(0, length), BASE, true);
      // The third op replaces `exclude partner` with itself: the text stays that of the second prefix.
      expect(after).toEqual(expected);
      for (const id of views) await expectSameComputedView(after, expected, id);
    }
  });

  it('accepts a declared custom color and a library icon through addView, addViewRule and replaceViewRule', async () => {
    const { after } = await expectAcceptedRun(
      [
        { op: 'addView', id: 'x', type: 'element', includes: ['customer with { color brand }'], autoLayout: '' },
        { op: 'addViewRule', id: 'landscape', rule: { kind: 'include', expression: 'customer with { icon tech:react }' } },
        { op: 'replaceViewRule', id: 'landscape', address: { index: 1 }, rule: { kind: 'exclude', expression: 'partner' } },
      ],
      BASE,
      true,
    );
    const expected = edited('    autoLayout LeftRight\n    autoLayout TopBottom 120 60\n', '    autoLayout LeftRight\n    include customer with { icon tech:react }\n    autoLayout TopBottom 120 60\n');
    await expectSameComputedView(after, { ...expected, [VIEWS]: expected[VIEWS]!.replace(/\n}\n$/, '\n  view x {\n    include customer with { color brand }\n  }\n}\n') }, 'landscape');
    await expectSameComputedView(after, { ...expected, [VIEWS]: expected[VIEWS]!.replace(/\n}\n$/, '\n  view x {\n    include customer with { color brand }\n  }\n}\n') }, 'x');
  });
});

// ---------------------------------------------------------------------------
// Row 92: addView autoLayout
// ---------------------------------------------------------------------------

describe('addView autoLayout through apply (row 92)', SLOW, () => {
  it('rejects an invalid direction on autoLayout', () => {
    expectRejectedRun([{ op: 'addView', id: 'x', type: 'element', autoLayout: 'Sideways' }], 'mutations[0].autoLayout');
  });

  it('writes a valid one, which reads back', async () => {
    const { m } = await expectAcceptedRun([{ op: 'addView', id: 'x', type: 'element', autoLayout: 'RightLeft 80 40' }]);
    expect(m.getView('x')!.rules.at(-1)).toMatchObject({ kind: 'autoLayout', autoLayout: { direction: 'RightLeft', rankSep: 80, nodeSep: 40 } });
  });
});

// ---------------------------------------------------------------------------
// Row 1 of the lc4m-15.31 test matrix (D145, INV-6): the cascade and
// emptied-`par` lines `apply` prints stay exactly as they are once the
// dispatch runs through the shared operation runner.  The line formats are
// the ones `apply` has printed since its view writes (lc4m-35.1, emptied
// `par`) and its cascade (lc4m-48.7); the positions are the 1-based
// positions of each reference in the literal models below, counted by hand.
// ---------------------------------------------------------------------------

/** Model A: `base` is referred to by `navigateTo base` of view `nav` (line 15, `base` at column 18). */
const MODEL_A = [
  'specification {',
  '  element system',
  '}',
  'model {',
  '  app = system',
  '  other = system',
  '  app -> other',
  '}',
  'views {',
  '  view base {',
  '    include app, other',
  '  }',
  '  view nav {',
  '    include app with {',
  '      navigateTo base',
  '    }',
  '  }',
  '  dynamic view flow {',
  '    parallel {',
  '      app -> other',
  '    }',
  '    app -> other',
  '  }',
  '}',
  '',
].join('\n');

/** Model B: model A without view `nav`; the first `parallel` of `flow` holds one step. */
const MODEL_B = MODEL_A.replace('  view nav {\n    include app with {\n      navigateTo base\n    }\n  }\n', '');

/** Model C: `other` is an item of `include app, other` (line 10, `other` at column 18). */
const MODEL_C = [
  'specification {',
  '  element system',
  '}',
  'model {',
  '  app = system',
  '  other = system',
  '}',
  'views {',
  '  view base {',
  '    include app, other',
  '  }',
  '}',
  '',
].join('\n');

describe('cascade and emptied-par lines of apply (lc4m-15.31 row 1)', SLOW, () => {
  it.each([
    {
      name: 'removeView with cascade',
      model: MODEL_A,
      mutation: { op: 'removeView', id: 'base', cascade: true },
      lines: ["  removeView: removed 'base'", '  removeView: cascade removed model.c4:15:18 (navigate-to)'],
    },
    {
      name: 'removeElement with cascade',
      model: MODEL_C,
      mutation: { op: 'removeElement', fqn: 'other', cascade: true },
      lines: ["  removeElement: removed 'other'", '  removeElement: cascade removed model.c4:10:18 (predicate-item)'],
    },
    {
      name: 'removeViewStep emptying a parallel block',
      model: MODEL_B,
      mutation: { op: 'removeViewStep', id: 'flow', address: { path: [0, 0] } },
      lines: ['  removeViewStep: removed the emptied par block(s) [0]'],
    },
  ])('$name', ({ model, mutation, lines }) => {
    const run = runApply([mutation], { 'model.c4': model });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.split('\n')).toEqual([...lines, 'Applied 1 mutation(s) successfully', '']);
  });
});
