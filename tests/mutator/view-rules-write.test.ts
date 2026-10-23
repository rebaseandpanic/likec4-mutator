/**
 * `addViewRule`, `replaceViewRule` and `removeViewRule` (US-7, D22, D23,
 * D30, D34; rows 66–72 of the lc4m-15.29 test matrix): positions, replace
 * and remove of every rule kind, addresses, the rule form, the reference
 * and structure checks at the insertion place, and view addressing.
 *
 * Expected texts are written by hand from the request and the input;
 * expected view contents are what LikeC4 1.60.0 computes for those texts
 * (CMP, and SEQ for dynamic views); every accepted write passes the
 * conventions of `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError, type ViewRuleText } from '../../src/mutator/write-checks.js';
import { buildLikeC4Model, computedViews, expectValidLikeC4 } from '../helpers/likec4-model.js';
import { expectSameComputedView, expectSameStepSequence, expectValidViewWrite } from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

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
  tag next
  relationship async
  color brand #3366ff
  deploymentNode env
}
model {
  app = system {
    api = service {
      #next
    }
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
    vm2 = env {
      instanceOf app.api
    }
  }
}
global {
  predicateGroup coreServices {
    include element.kind = service
  }
  style faded * {
    opacity 40%
  }
}
`;

/** The views of the workspace, each declaration exactly as written. */
const VIEWS: Record<string, string> = {
  index: '  view index {\n    include *\n  }\n',
  main: '  view main of app {\n    include app.api\n    autoLayout LeftRight\n  }\n',
  plain: '  view plain {\n    include app.db\n  }\n',
  base: '  view base of app {\n    include *\n  }\n',
  child: '  view child extends base {\n    include app.db\n  }\n',
  wide: '  view wide of app {\n    include *\n    exclude app.db\n  }\n',
  styled:
    "  view styled {\n    include *\n    style app.api {\n      color brand\n    }\n    group 'Core' {\n      include app.db\n    }\n    rank same {\n      app.api, app.db\n    }\n    global predicate coreServices\n    global style faded\n  }\n",
  tc: '  view tc {\n    include app.api, app.db,\n    autoLayout LeftRight\n  }\n',
  flow: '  dynamic view flow {\n    include app.api\n    app.api -> app.db\n    autoLayout TopBottom\n  }\n',
  dep: '  deployment view dep {\n    include prod.vm1\n    includeAncestors true\n    autoLayout TopBottom\n  }\n',
  bare: '  view bare\n',
};
const OTHER = 'model {\n  ext = system {\n    deep = service\n  }\n}\n';

/** The workspace with `changes` replacing the named declarations. */
function workspace(changes: Record<string, string> = {}): Record<string, string> {
  const views = Object.entries(VIEWS)
    .map(([id, text]) => changes[id] ?? text)
    .join('');
  return { 'm.c4': `${MODEL}views {\n${views}}\n`, 'n.c4': OTHER };
}
const BASE = workspace();

/**
 * The 1-based lines of `m.c4` the write replaced: those outside the common
 * leading and trailing lines of the text before and after it.
 */
function editedLines(before: string, after: string): { before: [number, number]; after: [number, number] } {
  const a = before.split('\n');
  const b = after.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return { before: [prefix + 1, a.length - suffix], after: [prefix + 1, b.length - suffix] };
}

/** Whether the reference at `at` (`<file>:<line>`) lies in `m.c4` within `lines`. */
const within = (at: string, [first, last]: [number, number]): boolean => {
  const [file, line] = at.split(':');
  return file === 'm.c4' && Number(line) >= first && Number(line) <= last;
};

/** The accepted write, its expected text and its computed effect (Wv + EFF). */
async function expectAccepted(m: LikeC4Mutator, id: string, changes: Record<string, string>): Promise<Record<string, string>> {
  const after = m.serialize();
  const expected = workspace(changes);
  expect(after).toEqual(expected);
  const edited = editedLines(BASE['m.c4']!, after['m.c4']!);
  await expectValidViewWrite(m, BASE, {
    editedBefore: (r) => within(r.at, edited.before),
    insertedAfter: (r) => within(r.at, edited.after),
  });
  await expectSameComputedView(after, expected, id);
  // SEQ: a rule write leaves the step sequence as it was.
  if (m.getView(id)!.type === 'dynamic') await expectSameStepSequence(BASE, after, id);
  return after;
}

// ---------------------------------------------------------------------------
// Row 66: addViewRule positions
// ---------------------------------------------------------------------------

describe('addViewRule positions (row 66)', SLOW, () => {
  it.each([
    {
      name: 'element view: before a trailing autoLayout',
      id: 'main',
      rule: { kind: 'include', expression: 'app.db' },
      before: undefined,
      index: 1,
      text: '  view main of app {\n    include app.api\n    include app.db\n    autoLayout LeftRight\n  }\n',
    },
    {
      name: 'element view without autoLayout: after the last rule, with navigateTo',
      id: 'plain',
      rule: { kind: 'include', expression: 'app.api with { navigateTo flow }' },
      before: undefined,
      index: 1,
      text: '  view plain {\n    include app.db\n    include app.api with { navigateTo flow }\n  }\n',
    },
    {
      name: 'element view: a where filter',
      id: 'plain',
      rule: { kind: 'include', expression: 'app.* where tag is #next' },
      before: undefined,
      index: 1,
      text: '  view plain {\n    include app.db\n    include app.* where tag is #next\n  }\n',
    },
    {
      name: 'dynamic view: after the last step, before a trailing autoLayout',
      id: 'flow',
      rule: { kind: 'include', expression: 'app.db' },
      before: undefined,
      index: 1,
      text: '  dynamic view flow {\n    include app.api\n    app.api -> app.db\n    include app.db\n    autoLayout TopBottom\n  }\n',
    },
    {
      name: 'deployment view: before a trailing autoLayout',
      id: 'dep',
      rule: { kind: 'include', expression: 'prod.vm2' },
      before: undefined,
      index: 2,
      text: '  deployment view dep {\n    include prod.vm1\n    includeAncestors true\n    include prod.vm2\n    autoLayout TopBottom\n  }\n',
    },
    {
      // The new rule names the same element as the one after it: the
      // survivor must still be matched across the write.
      name: 'before: { index: 0 }, naming what the next rule names',
      id: 'main',
      rule: { kind: 'exclude', expression: 'app.api' },
      before: { index: 0 },
      index: 0,
      text: '  view main of app {\n    exclude app.api\n    include app.api\n    autoLayout LeftRight\n  }\n',
    },
    {
      name: 'a bodyless view gets a body',
      id: 'bare',
      rule: { kind: 'include', expression: '*' },
      before: undefined,
      index: 0,
      text: '  view bare {\n    include *\n  }\n',
    },
  ] as Array<{ name: string; id: string; rule: ViewRuleText; before?: { index: number }; index: number; text: string }>)(
    '$name',
    async ({ id, rule, before, index, text }) => {
      await expectValidLikeC4(BASE);
      const m = LikeC4Mutator.fromFiles(BASE);
      const old = m.getView(id)!.rules.map((r) => r.text);
      expect(m.addViewRule(id, rule, before ? { before } : {})).toEqual({ changedFiles: ['m.c4'] });
      const rules = m.getView(id)!.rules.map((r) => r.text);
      expect(rules[index]).toBe(`${rule.kind} ${rule.expression}`);
      expect(rules.filter((_, i) => i !== index)).toEqual(old);
      const after = await expectAccepted(m, id, { [id]: text });
      if (id === 'plain' && rule.expression.includes('navigateTo')) {
        // OP: LikeC4's computed node navigates to the view.
        expect((await computedViews(after)).plain!.navigateTo).toEqual({ 'app.api': 'flow' });
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Row 67: replace and remove
// ---------------------------------------------------------------------------

describe('replace and remove (row 67)', SLOW, () => {
  it('replaces the kind and the expression at an index', async () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    m.replaceViewRule('wide', { index: 1 }, { kind: 'include', expression: 'other' });
    expect(m.getView('wide')!.rules.map((r) => r.text)).toEqual(['include *', 'include other']);
    await expectAccepted(m, 'wide', { wide: '  view wide of app {\n    include *\n    include other\n  }\n' });
  });

  it('replaces a rule of a dynamic view, the steps unchanged', async () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    m.replaceViewRule('flow', { index: 0 }, { kind: 'include', expression: 'app.db' });
    await expectAccepted(m, 'flow', { flow: '  dynamic view flow {\n    include app.db\n    app.api -> app.db\n    autoLayout TopBottom\n  }\n' });
  });

  it('removes an exclude, and the element reappears', async () => {
    // OP: LikeC4 computes app.db only without the exclude.
    expect((await computedViews(BASE)).wide!.nodes).not.toContain('app.db');
    const m = LikeC4Mutator.fromFiles(BASE);
    m.removeViewRule('wide', { index: 1, text: 'exclude app.db' });
    const after = await expectAccepted(m, 'wide', { wide: '  view wide of app {\n    include *\n  }\n' });
    expect((await computedViews(after)).wide!.nodes).toContain('app.db');
  });

  it.each([
    { name: 'an include', id: 'main', index: 0, text: '  view main of app {\n    autoLayout LeftRight\n  }\n' },
    { name: 'autoLayout', id: 'main', index: 1, text: '  view main of app {\n    include app.api\n  }\n' },
    {
      name: 'a style rule',
      id: 'styled',
      index: 1,
      text: "  view styled {\n    include *\n    group 'Core' {\n      include app.db\n    }\n    rank same {\n      app.api, app.db\n    }\n    global predicate coreServices\n    global style faded\n  }\n",
    },
    {
      name: 'a group',
      id: 'styled',
      index: 2,
      text: '  view styled {\n    include *\n    style app.api {\n      color brand\n    }\n    rank same {\n      app.api, app.db\n    }\n    global predicate coreServices\n    global style faded\n  }\n',
    },
    {
      name: 'a rank',
      id: 'styled',
      index: 3,
      text: "  view styled {\n    include *\n    style app.api {\n      color brand\n    }\n    group 'Core' {\n      include app.db\n    }\n    global predicate coreServices\n    global style faded\n  }\n",
    },
    {
      name: 'a global predicate',
      id: 'styled',
      index: 4,
      text: "  view styled {\n    include *\n    style app.api {\n      color brand\n    }\n    group 'Core' {\n      include app.db\n    }\n    rank same {\n      app.api, app.db\n    }\n    global style faded\n  }\n",
    },
    {
      name: 'a global style',
      id: 'styled',
      index: 5,
      text: "  view styled {\n    include *\n    style app.api {\n      color brand\n    }\n    group 'Core' {\n      include app.db\n    }\n    rank same {\n      app.api, app.db\n    }\n    global predicate coreServices\n  }\n",
    },
    { name: 'includeAncestors', id: 'dep', index: 1, text: '  deployment view dep {\n    include prod.vm1\n    autoLayout TopBottom\n  }\n' },
    { name: 'a rule of a dynamic view', id: 'flow', index: 0, text: '  dynamic view flow {\n    app.api -> app.db\n    autoLayout TopBottom\n  }\n' },
    { name: 'a rule with a trailing comma, with its separator', id: 'tc', index: 0, text: '  view tc {\n    autoLayout LeftRight\n  }\n' },
  ])('removes $name', async ({ id, index, text }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    const old = m.getView(id)!.rules.map((r) => r.text);
    expect(m.removeViewRule(id, { index })).toEqual({ changedFiles: ['m.c4'] });
    expect(m.getView(id)!.rules.map((r) => r.text)).toEqual(old.filter((_, i) => i !== index));
    await expectAccepted(m, id, { [id]: text });
  });
});

// ---------------------------------------------------------------------------
// Row 68: rule addresses
// ---------------------------------------------------------------------------

describe('rule addresses (row 68)', SLOW, () => {
  it('rejects a text guard that does not match on address.text', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.removeViewRule('main', { index: 0, text: 'include app.db' }), 'address.text');
  });

  it('rejects an index out of range on address.index', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.replaceViewRule('main', { index: 2 }, { kind: 'include', expression: 'app.db' }), 'address.index');
  });

  it('rejects a before.text mismatch on before.text', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(
      m,
      () => m.addViewRule('main', { kind: 'include', expression: 'app.db' }, { before: { index: 0, text: 'include *' } }),
      'before.text',
    );
  });

  it('accepts a matching guard', async () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    m.replaceViewRule('main', { index: 0, text: 'include app.api' }, { kind: 'include', expression: 'app.db' });
    await expectAccepted(m, 'main', { main: '  view main of app {\n    include app.db\n    autoLayout LeftRight\n  }\n' });
  });
});

// ---------------------------------------------------------------------------
// Row 69: rule form
// ---------------------------------------------------------------------------

describe('rule form (row 69)', () => {
  it.each([
    { name: 'an exclude in a dynamic view', id: 'flow', rule: { kind: 'exclude', expression: 'app.api' }, field: 'rule.kind' },
    { name: 'an expression forming no rule', id: 'plain', rule: { kind: 'include', expression: '' }, field: 'rule.expression' },
    { name: 'an expression forming two rules', id: 'plain', rule: { kind: 'include', expression: 'app.api\n    exclude app.db' }, field: 'rule.expression' },
    { name: 'an expression adding a property', id: 'plain', rule: { kind: 'include', expression: "app.api\n    title 'x'" }, field: 'rule.expression' },
    { name: 'an expression closing the view', id: 'plain', rule: { kind: 'include', expression: 'app.api }\n  view x {' }, field: 'rule.expression' },
    { name: 'with in a deployment view', id: 'dep', rule: { kind: 'include', expression: 'prod.vm2 with { color red }' }, field: 'rule.expression' },
  ] as Array<{ name: string; id: string; rule: ViewRuleText; field: string }>)('rejects $name on $field', ({ id, rule, field }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addViewRule(id, rule), field);
  });
});

// ---------------------------------------------------------------------------
// Rows 70 and 71: checks at the insertion place, through both writers
// ---------------------------------------------------------------------------

interface CheckCase {
  name: string;
  /** The view the rejected rule is written to */
  id: string;
  rejected: ViewRuleText;
  /** The view the accepted rule is written to, when not `id` */
  acceptedId?: string;
  accepted: ViewRuleText;
}

const PLACE_CASES: CheckCase[] = [
  { name: 'an ambiguous name ↔ the same name under of', id: 'plain', rejected: { kind: 'include', expression: 'api' }, acceptedId: 'main', accepted: { kind: 'include', expression: 'api' } },
  { name: 'an ambiguous name ↔ the same name under extends', id: 'plain', rejected: { kind: 'include', expression: 'api' }, acceptedId: 'child', accepted: { kind: 'include', expression: 'api' } },
  { name: 'the dynamic document scope: an other-file name ↔ qualified', id: 'flow', rejected: { kind: 'include', expression: 'deep' }, accepted: { kind: 'include', expression: 'ext.deep' } },
  { name: 'a model reference in a deployment include ↔ in an exclude relation', id: 'dep', rejected: { kind: 'include', expression: 'app.api' }, accepted: { kind: 'exclude', expression: 'app.api -> app.db' } },
  { name: 'with in an exclude ↔ in an include', id: 'plain', rejected: { kind: 'exclude', expression: 'app.api with { color red }' }, accepted: { kind: 'include', expression: 'app.api with { color red }' } },
  { name: 'with on element.kind ↔ on a reference', id: 'plain', rejected: { kind: 'include', expression: 'element.kind = service with { color red }' }, accepted: { kind: 'include', expression: 'app.api with { color red }' } },
  { name: 'with on element.tag ↔ on a reference', id: 'plain', rejected: { kind: 'include', expression: 'element.tag = #next with { color red }' }, accepted: { kind: 'include', expression: 'app.api with { color red }' } },
  { name: 'D34: a relation predicate in a dynamic view', id: 'flow', rejected: { kind: 'include', expression: 'app.api -> app.db' }, accepted: { kind: 'include', expression: 'app.db' } },
  { name: 'D34: with on a wildcard in a dynamic view', id: 'flow', rejected: { kind: 'include', expression: '* with { color red }' }, accepted: { kind: 'include', expression: 'app.db with { color red }' } },
  { name: 'D34: with on element.kind in a dynamic view', id: 'flow', rejected: { kind: 'include', expression: 'element.kind = service with { color red }' }, accepted: { kind: 'include', expression: 'app.db with { color red }' } },
  { name: 'navigateTo: unknown ↔ declared', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { navigateTo nope }' }, accepted: { kind: 'include', expression: 'app.api with { navigateTo main }' } },
  { name: 'navigateTo of a relation: an element view ↔ a dynamic view', id: 'plain', rejected: { kind: 'include', expression: 'app.api -> app.db with { navigateTo main }' }, accepted: { kind: 'include', expression: 'app.api -> app.db with { navigateTo flow }' } },
  { name: 'an undeclared element kind ↔ a declared one', id: 'plain', rejected: { kind: 'include', expression: 'element.kind = nokind' }, accepted: { kind: 'include', expression: 'element.kind = service' } },
  { name: 'an undeclared tag ↔ a declared one', id: 'plain', rejected: { kind: 'include', expression: '* where tag is #nope' }, accepted: { kind: 'include', expression: '* where tag is #next' } },
  { name: 'an undeclared relationship kind ↔ a declared one', id: 'plain', rejected: { kind: 'include', expression: 'app.api -[nokind]-> app.db' }, accepted: { kind: 'include', expression: 'app.api -[async]-> app.db' } },
];

const WITH_CASES: CheckCase[] = [
  { name: 'an undeclared custom color on an element with', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { color nocolor }' }, accepted: { kind: 'include', expression: 'app.api with { color brand }' } },
  { name: 'a non-existent library icon', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { icon tech:no-such-icon }' }, accepted: { kind: 'include', expression: 'app.api with { icon tech:postgresql }' } },
  { name: 'a file:// icon URI', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { icon file:///tmp/icon.svg }' }, accepted: { kind: 'include', expression: 'app.api with { icon https://example.com/icon.svg }' } },
  { name: 'an opacity of 150%', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { opacity 150% }' }, accepted: { kind: 'include', expression: 'app.api with { opacity 40% }' } },
  { name: 'an undeclared custom color on a relation with', id: 'plain', rejected: { kind: 'include', expression: 'app.api -> app.db with { color nocolor }' }, accepted: { kind: 'include', expression: 'app.api -> app.db with { color brand }' } },
  // Review C1: an icon given twice in one body, against one icon.
  { name: 'an icon given twice', id: 'plain', rejected: { kind: 'include', expression: 'app.api with { icon tech:react icon https://example.com/b.svg }' }, accepted: { kind: 'include', expression: 'app.api with { icon tech:react }' } },
];

/** The declaration of `id` with its first rule replaced by `rule`, or with `rule` added at the default place. */
function written(id: string, rule: ViewRuleText, how: 'add' | 'replace'): string {
  const line = `    ${rule.kind} ${rule.expression}\n`;
  const text = VIEWS[id]!;
  if (how === 'replace') return text.replace(/\n {4}[^\n]*\n/, `\n${line}`);
  if (/ {4}autoLayout [^\n]*\n {2}}\n$/.test(text)) return text.replace(/( {4}autoLayout [^\n]*\n {2}}\n)$/, `${line}$1`);
  return text.replace(/ {2}}\n$/, `${line}  }\n`);
}

describe.each([
  { row: 70, cases: PLACE_CASES },
  { row: 71, cases: WITH_CASES },
])('checks at the insertion place (row $row)', ({ cases }) => {
  describe.each(['add', 'replace'] as const)('%sViewRule', SLOW, (how) => {
    it.each(cases)('$name', async ({ id, rejected, acceptedId, accepted }) => {
      await expectValidLikeC4(BASE);
      const m = LikeC4Mutator.fromFiles(BASE);
      const write = (view: string, rule: ViewRuleText) =>
        how === 'add' ? m.addViewRule(view, rule) : m.replaceViewRule(view, { index: 0 }, rule);
      expectRejected(m, () => write(id, rejected), 'rule.expression');
      const target = acceptedId ?? id;
      write(target, accepted);
      await expectAccepted(m, target, { [target]: written(target, accepted, how) });
    });
  });
});

describe('the with values rejected in row 71 are what LikeC4 reports (OP)', () => {
  it.each([
    ['app.api with { color nocolor }', "Could not resolve reference to CustomColor named 'nocolor'."],
    ['app.api with { icon tech:no-such-icon }', "Could not resolve reference to LibIcon named 'tech:no-such-icon'."],
    ['app.api with { icon file:///tmp/icon.svg }', 'Icon URI must not start with file://'],
    ['app.api with { opacity 150% }', 'Value ignored, must be between 0% and 100%'],
    ['app.api -> app.db with { color nocolor }', "Could not resolve reference to CustomColor named 'nocolor'."],
    ['app.api with { icon tech:react icon https://example.com/b.svg }', 'Icon must be defined once'],
  ])('%s', async (item, diagnostic) => {
    const { diagnostics } = await buildLikeC4Model(workspace({ plain: `  view plain {\n    include ${item}\n  }\n` }));
    expect(diagnostics.some((d) => d.endsWith(diagnostic)), diagnostics.join('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 72: view addressing of the three operations
// ---------------------------------------------------------------------------

describe('the rule operations address one named view (row 72)', () => {
  const RULE: ViewRuleText = { kind: 'include', expression: '*' };
  const operations = [
    ['addViewRule', (m: LikeC4Mutator, id: string) => m.addViewRule(id, RULE)],
    ['replaceViewRule', (m: LikeC4Mutator, id: string) => m.replaceViewRule(id, { index: 0 }, RULE)],
    ['removeViewRule', (m: LikeC4Mutator, id: string) => m.removeViewRule(id, { index: 0 })],
  ] as const;

  it.each(operations)('%s rejects an unknown id', (_, write) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => write(m, 'nope'), 'id');
  });

  it.each(operations)('%s rejects an id declared in two files', (_, write) => {
    const m = LikeC4Mutator.fromFiles({ ...BASE, 'z.c4': 'views {\n  view plain {\n    include *\n  }\n}\n' });
    expectRejected(m, () => write(m, 'plain'), 'id');
  });

  it.each(operations)('%s rejects the id LikeC4 generates for an unnamed view', async (_, write) => {
    const files = { ...BASE, 'z.c4': 'views {\n  view of app {\n    include *\n  }\n}\n' };
    const generated = Object.keys(await computedViews(files)).filter((id) => !(id in VIEWS));
    expect(generated).toHaveLength(1);
    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, () => write(m, generated[0]!), 'id');
  });
});

// ---------------------------------------------------------------------------
// Review C2: an expression that leaves its rule
// ---------------------------------------------------------------------------

describe('an expression that leaves its rule is rejected (review C2)', () => {
  const ESCAPES = [
    { name: 'into a block-level style', expression: 'app.api\n}\nstyle * {\ncolor red' },
    { name: 'into a global style block', expression: 'app.api\n}\n}\nglobal {\nstyle loud * {\ncolor red\n}' },
    { name: 'into a global style rule', expression: 'app.api\n    global style faded' },
  ];

  it.each(ESCAPES)('addViewRule rejects escaping $name on rule.expression', ({ expression }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addViewRule('plain', { kind: 'include', expression }), 'rule.expression');
  });

  it.each(ESCAPES)('replaceViewRule rejects escaping $name on rule.expression', ({ expression }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.replaceViewRule('plain', { index: 0 }, { kind: 'include', expression }), 'rule.expression');
  });

  it.each(ESCAPES)('addView rejects an include escaping $name on includes[0]', ({ expression }) => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.addView({ id: 'fresh', type: 'element', includes: [expression] }), 'includes[0]');
  });

  it('updateView rejects an autoLayout escaping into a block-level style on autoLayout', () => {
    const m = LikeC4Mutator.fromFiles(BASE);
    expectRejected(m, () => m.updateView('main', { autoLayout: 'LeftRight\n}\nstyle * {\ncolor red' }), 'autoLayout');
  });
});

// ---------------------------------------------------------------------------
// D51: bare wildcard, kind and tag predicates in a dynamic view are accepted
// ---------------------------------------------------------------------------

describe('bare predicates in a dynamic include have a computed effect (D51)', SLOW, () => {
  const DYNAMIC = (include: string) => ({
    'm.c4': `specification {\n  element system\n  element store\n  tag lonely\n}\nmodel {\n  a = system\n  b = system\n  extra = store {\n    #lonely\n  }\n}\nviews {\n  dynamic view d {\n${include}    a -> b\n  }\n}\n`,
  });

  it.each(['*', 'element.kind = store', 'element.tag = #lonely'])('include %s adds an element that no step names', async (expression) => {
    const before = DYNAMIC('');
    await expectValidLikeC4(before);
    // OP: no step names `extra`, so LikeC4 computes it only through the include.
    expect((await computedViews(before)).d!.nodes).not.toContain('extra');
    const m = LikeC4Mutator.fromFiles(before);
    m.addViewRule('d', { kind: 'include', expression });
    const after = m.serialize();
    const written = { 'm.c4': before['m.c4']!.replace('    a -> b\n  }\n}\n', `    a -> b\n    include ${expression}\n  }\n}\n`) };
    expect(after).toEqual(written);
    await expectValidViewWrite(m, before);
    await expectSameComputedView(after, written, 'd');
    await expectSameStepSequence(before, after, 'd');
    expect((await computedViews(after)).d!.nodes).toContain('extra');
  });
});
