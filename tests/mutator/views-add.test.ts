/**
 * `addView` with `description`, `extends` and `file` (US-5; rows 48–56 of
 * the lc4m-15.29 test matrix): placement (D27, D41), new fields, header and
 * `extends` rejections, the rule checks of `includes` (D35, D34) and the
 * snapshot guard.
 *
 * Expected placement and text come from D27 / D41 and the input; expected
 * view contents from hand-written texts computed by LikeC4 1.59.4 (CMP,
 * SEQ); every accepted write passes the conventions of `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, type AddViewOpts } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  buildLikeC4Model,
  computedViews,
  expectValidLikeC4,
  linkedViewReferences,
  validateLikeC4,
} from '../helpers/likec4-model.js';
import {
  errorMultiset,
  expectSameComputedView,
  expectValidViewWrite,
  expectViewWriteOnInvalidInput,
} from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

/** The write is rejected on `field` and changes nothing (BI). */
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

/** `addView` on `files`; the files after it. */
function added(files: Record<string, string>, opts: AddViewOpts): { m: LikeC4Mutator; after: Record<string, string> } {
  const m = LikeC4Mutator.fromFiles(files);
  m.addView(opts);
  return { m, after: m.serialize() };
}

/** The names of the files whose text differs between `a` and `b`. */
function changed(a: Record<string, string>, b: Record<string, string>): string[] {
  return Object.keys(b).filter((file) => a[file] !== b[file]);
}

const SPEC = `specification {
  element system
  element service
  tag next
  relationship async
  color brand #3366ff
  deploymentNode env
}
`;

/** One file holding `views` in its last block (the text up to its closing brace). */
const MODEL = `${SPEC}model {
  app = system {
    api = service
    db = service
  }
  other = system {
    api = service
  }
  app.api -[async]-> app.db
}
deployment {
  prod = env {
    vm1 = env {
      instanceOf app.db
    }
  }
}
`;
const VIEWS = `views {
  view index {
    include *
  }
  view base of app {
    include app.api
  }
  dynamic view flow {
    app.api -> app.db
  }
  deployment view dep {
    include prod.**
  }
}
`;
const BASE = { 'm.c4': MODEL + VIEWS };

/** `BASE` with the hand-written view `text` appended to its `views` block. */
function withView(text: string): Record<string, string> {
  return { 'm.c4': MODEL + VIEWS.replace(/}\n$/, `${text}}\n`) };
}

// ---------------------------------------------------------------------------
// Row 48: placement
// ---------------------------------------------------------------------------

describe('placement (row 48)', SLOW, () => {
  const VIEW = '  view v {\n    include *\n    autoLayout TopBottom\n  }\n';
  const spec = `${SPEC}`;
  const model = (name: string) => `model {\n  ${name} = system\n}\n`;
  const views = (name: string) => `views {\n  view ${name} {\n    include *\n  }\n}\n`;
  /** `text` with the new view appended to its first `views` block (closing at `}\n` after `last`). */
  const intoBlock = (text: string, last: string) => text.replace(`  view ${last} {\n    include *\n  }\n}\n`, `  view ${last} {\n    include *\n  }\n${VIEW}}\n`);
  const newBlock = (text: string) => `${text}\nviews {\n${VIEW}}\n`;

  it.each([
    {
      name: '(a) an explicit file that has a block and is not first in document order → its first block',
      files: { 'spec.c4': spec + model('x'), 'b.c4': views('b1') + views('b2'), 'a/z.c4': views('z1') },
      file: 'b.c4' as string | undefined,
      expected: (files: Record<string, string>) => ({ 'b.c4': intoBlock(views('b1'), 'b1') + views('b2') }),
    },
    {
      name: '(b) an explicit blockless file while other files have blocks → a new block at its end',
      files: { 'spec.c4': spec + model('x'), 'b.c4': views('b1'), 'c.c4': model('y') },
      file: 'c.c4',
      expected: () => ({ 'c.c4': newBlock(model('y')) }),
    },
    {
      name: '(c) no file, b.c4 and a/z.c4 loaded in that order, both with blocks → a/z.c4 (document order)',
      files: { 'spec.c4': spec + model('x'), 'b.c4': views('b1'), 'a/z.c4': views('z1') },
      file: undefined,
      expected: () => ({ 'a/z.c4': intoBlock(views('z1'), 'z1') }),
    },
    {
      name: '(d) no block anywhere → the first file in document order with a model block',
      files: { 'c.c4': model('c'), 'b.c4': model('b'), 'a/spec.c4': spec },
      file: undefined,
      expected: () => ({ 'b.c4': newBlock(model('b')) }),
    },
    {
      name: '(e) no model block → the first file in document order',
      files: { 'b.c4': '// b\n', 'a.c4': spec },
      file: undefined,
      expected: () => ({ 'a.c4': newBlock(spec) }),
    },
  ])('$name', async ({ files, file, expected }) => {
    await expectValidLikeC4(files);
    const { m, after } = added(files, { id: 'v', type: 'element', ...(file !== undefined && { file }) });
    const want = expected(files);
    expect(changed(files, after)).toEqual(Object.keys(want));
    for (const [name, text] of Object.entries(want)) expect(after[name]).toBe(text);
    expect(m.getView('v')?.file).toBe(Object.keys(want)[0]);
    await expectValidViewWrite(m, files);
  });

  it('(f) an unknown or unloaded file → `file`, nothing changed and no file created', () => {
    const files = { 'spec.c4': spec + model('x'), 'b.c4': views('b1') };
    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, () => m.addView({ id: 'v', type: 'element', file: 'new.c4' }), 'file');
    expect(Object.keys(m.serialize())).toEqual(Object.keys(files));
  });
});

// ---------------------------------------------------------------------------
// Row 49: line endings of a new block
// ---------------------------------------------------------------------------

describe('a new views block keeps the line ending (row 49)', SLOW, () => {
  it('writes CRLF into a CRLF file', async () => {
    const input = `${SPEC}model {\n  app = system\n}\n`.replace(/\n/g, '\r\n');
    const files = { 'm.c4': input };
    await expectValidLikeC4(files);
    const { m, after } = added(files, { id: 'v', type: 'element', target: 'app' });
    expect(after['m.c4']!.startsWith(input)).toBe(true);
    const inserted = after['m.c4']!.slice(input.length);
    expect(inserted).toBe('\r\nviews {\r\n  view v of app {\r\n    include *\r\n    autoLayout TopBottom\r\n  }\r\n}\r\n');
    expect(/(?<!\r)\n/.test(after['m.c4']!)).toBe(false);
    await expectValidViewWrite(m, files);
  });

  it('writes LF into an LF file whose last line has no newline', async () => {
    const input = `${SPEC}model {\n  app = system\n}`;
    const files = { 'm.c4': input };
    await expectValidLikeC4(files);
    const { m, after } = added(files, { id: 'v', type: 'element', target: 'app' });
    expect(after['m.c4']!.startsWith(input)).toBe(true);
    expect(after['m.c4']!.slice(input.length)).toBe('\n\nviews {\n  view v of app {\n    include *\n    autoLayout TopBottom\n  }\n}\n');
    expect(after['m.c4']!.includes('\r')).toBe(false);
    await expectValidViewWrite(m, files);
  });
});

// ---------------------------------------------------------------------------
// Row 50: new fields read back
// ---------------------------------------------------------------------------

describe('new fields read back (row 50)', SLOW, () => {
  it('writes description and extends with title, includes and autoLayout', async () => {
    await expectValidLikeC4(BASE);
    // OP: LikeC4 applies a parent's rules before the child's own (spike 02):
    // the child's `exclude` removes the node the parent's `include` added.
    const order = await computedViews(withView('  view probe extends base {\n    exclude app.api\n  }\n'));
    expect(order.base!.nodes).toContain('app.api');
    expect(order.probe!.nodes).not.toContain('app.api');

    const { m, after } = added(BASE, {
      id: 'child',
      type: 'element',
      extends: 'base',
      title: 'Child',
      description: 'The child view',
      includes: ['app.db'],
      autoLayout: 'LeftRight',
    });
    expect(m.getView('child')).toMatchObject({
      id: 'child',
      type: 'element',
      extends: { text: 'base', target: 'base' },
      title: 'Child',
      description: { txt: 'The child view' },
      rules: [
        { index: 0, kind: 'include', text: 'include app.db' },
        { index: 1, kind: 'autoLayout', text: 'autoLayout LeftRight' },
      ],
    });
    expect(m.getView('child')!.of).toBeUndefined();
    await expectValidViewWrite(m, BASE);
    const expected = withView(
      "  view child extends base {\n    title 'Child'\n    description 'The child view'\n    include app.db\n    autoLayout LeftRight\n  }\n",
    );
    expect(after).toEqual(expected);
    await expectSameComputedView(after, expected, 'child');
    // The parent's include and the child's own both apply.
    expect((await computedViews(after)).child!.nodes).toEqual(expect.arrayContaining(['app.api', 'app.db']));
  });

  it('writes the description of a dynamic view with its includes (CMP and SEQ)', async () => {
    const { m, after } = added(BASE, { id: 'd2', type: 'dynamic', description: 'Calls', includes: ['app.api'] });
    expect(m.getView('d2')).toMatchObject({ type: 'dynamic', description: { txt: 'Calls' }, steps: [] });
    await expectValidViewWrite(m, BASE);
    await expectSameComputedView(
      after,
      withView("  dynamic view d2 {\n    description 'Calls'\n    include app.api\n    autoLayout TopBottom\n  }\n"),
      'd2',
    );
  });
});

// ---------------------------------------------------------------------------
// Row 51: header form rejections
// ---------------------------------------------------------------------------

describe('header form rejections (row 51)', () => {
  it.each([
    { name: '`of` together with `extends`', opts: { id: 'v', type: 'element', target: 'app', extends: 'base' } },
    { name: '`extends` on a dynamic view', opts: { id: 'v', type: 'dynamic', extends: 'base' } },
    { name: '`extends` on a deployment view', opts: { id: 'v', type: 'deployment', extends: 'base' } },
  ] as Array<{ name: string; opts: AddViewOpts }>)('$name → extends', ({ opts }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addView(opts), 'extends');
  });
});

// ---------------------------------------------------------------------------
// Row 52: the `extends` parent
// ---------------------------------------------------------------------------

describe('the extends parent (row 52)', SLOW, () => {
  const PARENTS = `${MODEL}views {
  view base of app {
    include app.api
  }
  dynamic view flow {
    app.api -> app.db
  }
  deployment view dep {
    include prod.**
  }
  view bare
  view p extends newV {
  }
}
`;
  const FILES = { 'm.c4': PARENTS };
  const child = (parent: string) => `  view newV extends ${parent} {\n    include *\n    autoLayout TopBottom\n  }\n`;
  const written = (parent: string) => ({ 'm.c4': PARENTS.replace(/}\n$/, `${child(parent)}}\n`) });

  it.each([
    { name: 'an unknown id', parent: 'nope', dropped: ['newV'] },
    { name: 'a dynamic view', parent: 'flow', dropped: ['newV'] },
    { name: 'a deployment view', parent: 'dep', dropped: ['newV'] },
    { name: 'a bodyless view', parent: 'bare', dropped: ['newV'] },
    { name: 'a cycle through `view p extends newV`', parent: 'p', dropped: ['newV', 'p'] },
  ])('rejects $name on extends', async ({ parent, dropped }) => {
    // OP: in the text the write would produce, LikeC4 does not compute the dropped views.
    const computed = await computedViews(written(parent));
    expect(dropped.filter((id) => id in computed)).toEqual([]);
    if (parent === 'p') {
      // OP: validate() is silent about the cycle (RECON S4); the input's own
      // unresolved `extends newV` is the only error, and it disappears.
      expect(await validateLikeC4(written(parent))).toEqual([]);
    }
    const m = LikeC4Mutator.fromFiles(FILES);
    expectRejected(m, () => m.addView({ id: 'newV', type: 'element', extends: parent }), 'extends');
  });

  it('accepts a named element view with a body; the child is computed', async () => {
    const files = withView('');
    await expectValidLikeC4(files);
    const { m, after } = added(files, { id: 'newV', type: 'element', extends: 'base' });
    expect(after).toEqual(withView(child('base')));
    expect(Object.keys(await computedViews(after))).toContain('newV');
    await expectValidViewWrite(m, files);
  });
});

// ---------------------------------------------------------------------------
// Row 53: D35 — includes get every rule check
// ---------------------------------------------------------------------------

describe('includes get every rule check (row 53)', SLOW, () => {
  interface Case {
    name: string;
    view: Omit<AddViewOpts, 'includes'>;
    /** The view the rejected item is given to, when not `view` */
    rejectedView?: Omit<AddViewOpts, 'includes'>;
    rejected: string;
    accepted: string;
    /** The hand-written accepted view */
    text: string;
    /**
     * D34: the rejected item, which LikeC4 drops silently: it computes no
     * node from it (`nodes`), or — for a wildcard — computes the nodes but
     * ignores the predicate's `with` (`ignored`); either way with no error
     */
    drops?: { item: string; effect: 'nodes' | 'ignored' };
  }
  const element = (id: string, header: string, include: string) =>
    `  ${header} {\n    include ${include}\n    autoLayout TopBottom\n  }\n`.replace('{id}', id);
  const cases: Case[] = [
    {
      name: 'an unresolved reference ↔ the qualified name',
      view: { id: 'v1', type: 'element' },
      rejected: 'nope',
      accepted: 'app.api',
      text: element('v1', 'view {id}', 'app.api'),
    },
    {
      name: 'an ambiguous document-scope name ↔ the same name under `of app`',
      view: { id: 'v2', type: 'element', target: 'app' },
      rejectedView: { id: 'v2', type: 'element' },
      rejected: 'api',
      accepted: 'api',
      text: element('v2', 'view {id} of app', 'api'),
    },
    {
      name: 'the same name under a view extending a parent `of app` ↔ extending a parent without `of`',
      view: { id: 'v3', type: 'element', extends: 'base' },
      rejectedView: { id: 'v3', type: 'element', extends: 'index' },
      rejected: 'api',
      accepted: 'api',
      text: element('v3', 'view {id} extends base', 'api'),
    },
    {
      name: 'an undeclared element kind ↔ a declared one',
      view: { id: 'v4', type: 'element' },
      rejected: 'element.kind = nokind',
      accepted: 'element.kind = service',
      text: element('v4', 'view {id}', 'element.kind = service'),
    },
    {
      name: 'an undeclared tag ↔ a declared one',
      view: { id: 'v5', type: 'element' },
      rejected: '* where tag is #nope',
      accepted: '* where tag is #next',
      text: element('v5', 'view {id}', '* where tag is #next'),
    },
    {
      name: 'an undeclared relationship kind ↔ a declared one',
      view: { id: 'v6', type: 'element' },
      rejected: 'app.api -[nokind]-> app.db',
      accepted: 'app.api -[async]-> app.db',
      text: element('v6', 'view {id}', 'app.api -[async]-> app.db'),
    },
    {
      name: 'an unknown navigateTo ↔ a declared view',
      view: { id: 'v7', type: 'element' },
      rejected: 'app.api with { navigateTo nope }',
      accepted: 'app.api with { navigateTo index }',
      text: element('v7', 'view {id}', 'app.api with { navigateTo index }'),
    },
    {
      name: 'a relation with navigateTo an element view ↔ a dynamic view',
      view: { id: 'v8', type: 'element' },
      rejected: 'app.api -> app.db with { navigateTo index }',
      accepted: 'app.api -> app.db with { navigateTo flow }',
      text: element('v8', 'view {id}', 'app.api -> app.db with { navigateTo flow }'),
    },
    {
      name: 'a model reference in a deployment include ↔ a deployment node',
      view: { id: 'v9', type: 'deployment' },
      rejected: 'app.api',
      accepted: 'prod.vm1',
      text: element('v9', 'deployment view {id}', 'prod.vm1'),
    },
    {
      name: 'D34: a relation predicate in a dynamic view ↔ an element with with',
      view: { id: 'v10', type: 'dynamic' },
      rejected: 'app.api -> app.db',
      accepted: 'app.api with { color red }',
      text: element('v10', 'dynamic view {id}', 'app.api with { color red }'),
      drops: { item: 'app.api -> app.db', effect: 'nodes' },
    },
    {
      name: 'D34: with on a wildcard in a dynamic view',
      view: { id: 'v11', type: 'dynamic' },
      rejected: '* with { color red }',
      accepted: 'app.api with { color red }',
      text: element('v11', 'dynamic view {id}', 'app.api with { color red }'),
      drops: { item: '* with { color red }', effect: 'ignored' },
    },
    {
      name: 'D34: with on element.tag in a dynamic view',
      view: { id: 'v12', type: 'dynamic' },
      rejected: 'element.tag = #next with { color red }',
      accepted: 'app.api with { color red }',
      text: element('v12', 'dynamic view {id}', 'app.api with { color red }'),
      drops: { item: 'element.tag = #next with { color red }', effect: 'nodes' },
    },
    {
      name: 'with on element.kind in an element view ↔ on an element reference',
      view: { id: 'v13', type: 'element' },
      rejected: 'element.kind = service with { color red }',
      accepted: 'app.api with { color red }',
      text: element('v13', 'view {id}', 'app.api with { color red }'),
    },
    {
      name: 'with on element.tag in an element view ↔ on an element reference',
      view: { id: 'v14', type: 'element' },
      rejected: 'element.tag = #next with { color red }',
      accepted: 'app.db with { color red }',
      text: element('v14', 'view {id}', 'app.db with { color red }'),
    },
  ];

  it.each(cases)('$name', async ({ view, rejectedView, rejected, accepted, text, drops }) => {
    await expectValidLikeC4(BASE);
    if (drops) {
      // OP: LikeC4 reports no error (probe R-3) and drops the item: no node
      // from it, or — for `* with` — the nodes of `*` with the `with` ignored,
      // which LikeC4 says in a warning only.
      const probe = withView(`  dynamic view probe {\n    include ${drops.item}\n  }\n`);
      expect(await validateLikeC4(probe)).toEqual([]);
      if (drops.effect === 'nodes') expect((await computedViews(probe)).probe!.nodes).toEqual([]);
      else {
        const { diagnostics } = await buildLikeC4Model(probe);
        expect(diagnostics.some((d) => d.endsWith('Predicate is ignored, as not supported in dynamic views'))).toBe(true);
      }
    }
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addView({ ...(rejectedView ?? view), includes: [rejected] }), 'includes[0]');

    m.addView({ ...view, includes: [accepted] });
    const after = m.serialize();
    expect(after).toEqual(withView(text));
    await expectValidViewWrite(m, BASE);
    await expectSameComputedView(after, withView(text), view.id);
  });
});

// ---------------------------------------------------------------------------
// Row 54: `with` properties through includes
// ---------------------------------------------------------------------------

describe('with properties through includes (row 54)', SLOW, () => {
  it.each([
    { name: 'an undeclared custom color on an element', item: 'app.api with { color nocolor }', diagnostic: "Could not resolve reference to CustomColor named 'nocolor'." },
    { name: 'a non-existent library icon', item: 'app.api with { icon tech:no-such-icon }', diagnostic: "Could not resolve reference to LibIcon named 'tech:no-such-icon'." },
    { name: 'a file:// icon URI', item: 'app.api with { icon file:///tmp/icon.svg }', diagnostic: 'Icon URI must not start with file://' },
    { name: 'an opacity of 150%', item: 'app.api with { opacity 150% }', diagnostic: 'Value ignored, must be between 0% and 100%' },
    { name: 'an undeclared custom color on a relation', item: 'app.api -> app.db with { color nocolor }', diagnostic: "Could not resolve reference to CustomColor named 'nocolor'." },
    // Review C1: a body-level check of LikeC4, not one of a single value.
    { name: 'an icon given twice', item: 'app.api with {\n      icon tech:react\n      icon https://example.com/b.svg\n    }', diagnostic: 'Icon must be defined once' },
  ])('rejects $name on includes[0]', async ({ item, diagnostic }) => {
    // OP: LikeC4 reports the value on the literal text.
    const { diagnostics } = await buildLikeC4Model(withView(`  view probe {\n    include ${item}\n  }\n`));
    expect(diagnostics.some((d) => d.endsWith(diagnostic)), diagnostics.join('\n')).toBe(true);
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addView({ id: 'v', type: 'element', includes: [item] }), 'includes[0]');
  });

  it.each([
    { name: 'a declared custom color', item: 'app.api with { color brand }' },
    { name: 'an existing library icon', item: 'app.api with { icon tech:postgresql }' },
    { name: 'an https icon URI', item: 'app.api with { icon https://example.com/icon.svg }' },
  ])('accepts $name', async ({ item }) => {
    const { m, after } = added(BASE, { id: 'v', type: 'element', includes: [item] });
    const text = withView(`  view v {\n    include ${item}\n    autoLayout TopBottom\n  }\n`);
    expect(after).toEqual(text);
    await expectValidViewWrite(m, BASE);
    await expectSameComputedView(after, text, 'v');
  });
});

// ---------------------------------------------------------------------------
// Row 55: the existing rejections on the new paths
// ---------------------------------------------------------------------------

describe('existing addView rejections on the new paths (row 55)', () => {
  const OTHER = `${SPEC}model {\n  app = system\n}\nviews {\n  view taken {\n    include *\n  }\n}\n`;
  const BLOCKLESS = { 'a.c4': `${SPEC}model {\n  app = system\n}\n`, 'b.c4': 'model {\n  web = system\n}\n' };
  const WITH_FILE = { 'a.c4': OTHER, 'b.c4': 'model {\n  web = system\n}\n' };

  it.each([
    { name: 'a duplicate id declared in another file', files: WITH_FILE, opts: { id: 'taken', type: 'element', file: 'b.c4' }, field: 'id' },
    { name: 'a bad id', files: WITH_FILE, opts: { id: '1x', type: 'element', file: 'b.c4' }, field: 'id' },
    { name: 'a bad target', files: WITH_FILE, opts: { id: 'v', type: 'element', target: 'a b', file: 'b.c4' }, field: 'target' },
    { name: 'a bad autoLayout', files: WITH_FILE, opts: { id: 'v', type: 'element', autoLayout: 'Sideways', file: 'b.c4' }, field: 'autoLayout' },
    { name: 'a bad id in a blockless workspace', files: BLOCKLESS, opts: { id: '1x', type: 'element' }, field: 'id' },
    { name: 'a bad target in a blockless workspace', files: BLOCKLESS, opts: { id: 'v', type: 'element', target: 'nope' }, field: 'target' },
    { name: 'a bad autoLayout in a blockless workspace', files: BLOCKLESS, opts: { id: 'v', type: 'element', autoLayout: 'Sideways' }, field: 'autoLayout' },
  ] as Array<{ name: string; files: Record<string, string>; opts: AddViewOpts; field: string }>)('$name → $field', ({ files, opts, field }) => {
    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, () => m.addView(opts), field);
  });
});

// ---------------------------------------------------------------------------
// Row 56: unresolved → resolved is not a change
// ---------------------------------------------------------------------------

describe('a reference that resolves only after the write is not a change (row 56)', SLOW, () => {
  it('accepts newV that two unresolved references name', async () => {
    const input = withView('  view c extends newV {\n  }\n  view w {\n    include app.api with { navigateTo newV }\n  }\n');
    const before = await errorMultiset(input);
    expect(before.length, 'the input has LikeC4 errors').toBeGreaterThan(0);
    const unresolved = (await linkedViewReferences(input)).filter((r) => r.text === 'newV');
    expect(unresolved.map((r) => [r.role, r.target])).toEqual([
      ['extends', null],
      ['elementWithNavigateTo', null],
    ]);

    const m = LikeC4Mutator.fromFiles(input);
    m.addView({ id: 'newV', type: 'element', includes: ['app.api'] });
    const after = m.serialize();
    const linked = (await linkedViewReferences(after)).filter((r) => r.text === 'newV');
    expect(linked.map((r) => [r.role, r.target])).toEqual([
      ['extends', { view: 'newV' }],
      ['elementWithNavigateTo', { view: 'newV' }],
    ]);
    // The errors that go are exactly those of the two unresolved references to newV.
    const resolved = before.filter((e) => e.includes('newV'));
    expect(resolved.length).toBeGreaterThan(0);
    await expectViewWriteOnInvalidInput(m, input, { resolved });
  });
});
