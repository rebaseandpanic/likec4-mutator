/**
 * The reference policy of `removeDeploymentNode` / `removeDeploymentInstance`
 * (lc4m-15.30 US-1; FR-001, FR-004; rows 59–64 of the test matrix): owned
 * deployment constructs go in both modes, deployment-view items reject by
 * default and are cascaded with `cascade: true`, and unmodelled places and
 * unrecovered text reject in both modes.
 *
 * Expected values come from the spec (FR-001, D57, D77, D92, D104,
 * D111–D113) and the inputs: positions are found in the test's own
 * literals, expected texts are the inputs with the removed constructs taken
 * out, references before and after are LikeC4's (`linkedCatalogueReferences`).
 * Abbreviations as in `remove-element-references.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, type RemoveDeploymentNodeResult } from '../../src/mutator/mutator.js';
import { InvalidWriteError, ReferencedRemovalError, type RemovalReference } from '../../src/mutator/write-checks.js';
import { expectAcceptedWrite, expectValidLikeC4, linkedCatalogueReferences, validateLikeC4 } from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;
type Api = 'node' | 'instance';

const SPEC = `specification {
  element system
  element service
  deploymentNode vm
}
`;

const MODEL = `model {
  app = system {
    api = service
    db = service
  }
  other = system
}
`;

const DEPLOYMENT = `deployment {
  vm prod {
    vm inner {
      a = instanceOf app.api
    }
  }
  vm keep {
    b = instanceOf other
  }
}
`;

/** What each API removes in the fixture, and the text that goes. */
const REMOVED: Record<Api, { id: string; text: string }> = {
  node: { id: 'prod.inner', text: '    vm inner {\n      a = instanceOf app.api\n    }\n' },
  instance: { id: 'prod.inner.a', text: '      a = instanceOf app.api\n' },
};

/** The removal through `api`. */
function removal(m: LikeC4Mutator, api: Api, id: string, cascade: boolean): RemoveDeploymentNodeResult {
  return api === 'node' ? m.removeDeploymentNode(id, { cascade }) : m.removeDeploymentInstance(id, { cascade });
}

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

/** RRE: the removal throws a `ReferencedRemovalError` on `id` and changes nothing. */
function expectRRE(files: Files, api: Api, id: string, cascade: boolean): ReferencedRemovalError {
  const m = LikeC4Mutator.fromFiles(files);
  const nodes = m.listDeploymentNodes();
  const views = m.listViews();
  let error: unknown;
  try {
    removal(m, api, id, cascade);
  } catch (err) {
    error = err;
  }
  expect(error, 'the removal is rejected').toBeInstanceOf(ReferencedRemovalError);
  expect((error as ReferencedRemovalError).field).toBe('id');
  expect(m.serialize()).toEqual(files);
  expect(m.listDeploymentNodes()).toEqual(nodes);
  expect(m.listViews()).toEqual(views);
  return error as ReferencedRemovalError;
}

/** GONE: the linker's references after are those before minus `gone`, with the same targets. */
async function expectGone(before: Files, after: Files, gone: ReadonlyArray<[string, string, string]>): Promise<void> {
  const key = (r: { file: string; role: string; text: string; target: unknown }) => JSON.stringify([r.file, r.role, r.text, r.target]);
  const was = (await linkedCatalogueReferences(before)).map(key);
  for (const [file, role, text] of gone) {
    const i = was.findIndex((k) => {
      const [f, r, t] = JSON.parse(k) as [string, string, string];
      return f === file && r === role && t === text;
    });
    expect(i, `the reference ${role} '${text}' in ${file} exists before the write`).toBeGreaterThanOrEqual(0);
    was.splice(i, 1);
  }
  expect((await linkedCatalogueReferences(after)).map(key).sort()).toEqual(was.sort());
}

// ---------------------------------------------------------------------------
// Row 59: deployment-view items
// ---------------------------------------------------------------------------

describe('deployment-view references into the subtree (row 59)', SLOW, () => {
  const RULES: Array<{ name: string; rule: string; needle: string; role: RemovalReference['role']; gone: Array<[string, string]> }> = [
    { name: 'an include item', rule: '    include prod.inner.a\n', needle: 'prod.inner.a\n', role: 'predicate-item', gone: [['predicate-item', 'prod.inner.a']] },
    { name: 'an exclude item', rule: '    exclude prod.inner.a\n', needle: 'prod.inner.a\n', role: 'predicate-item', gone: [['predicate-item', 'prod.inner.a']] },
    {
      name: 'a relation predicate',
      rule: '    include keep.b -> prod.inner.a\n',
      needle: 'prod.inner.a\n',
      role: 'predicate-item',
      gone: [
        ['predicate-item', 'keep.b'],
        ['predicate-item', 'prod.inner.a'],
      ],
    },
    { name: 'a style target', rule: '    style prod.inner.a {\n      color red\n    }\n', needle: 'prod.inner.a {', role: 'style-target', gone: [['style-target', 'prod.inner.a']] },
  ];

  describe.each(['node', 'instance'] as const)('%s removal', (api) => {
    describe.each(RULES)('$name', ({ rule, needle, role, gone }) => {
      const views = `views {\n  deployment view dv {\n    include keep\n${rule}  }\n}\n`;
      const files: Files = { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}${views}` };
      const { id, text } = REMOVED[api];

      it('is RRE by default, the reference cascadable', async () => {
        await expectValidLikeC4(files);
        expect(expectRRE(files, api, id, false).references).toEqual([{ ...at(files, 'm.c4', needle), role, cascadable: true, view: 'dv' }]);
      });

      it('with cascade removes the item', async () => {
        const m = LikeC4Mutator.fromFiles(files);
        const result = removal(m, api, id, true);
        expect(result.cascaded).toEqual([{ ...at(files, 'm.c4', needle), role }]);
        const after = m.serialize();
        expect(after['m.c4']).toBe(files['m.c4']!.replace(text, '').replace(rule, ''));
        // Both removals take the instance `a` away with its instanceOf.
        await expectGone(files, after, [['m.c4', 'instance-of', 'app.api'], ...gone.map(([r, t]) => ['m.c4', r, t] as [string, string, string])]);
        await expectAcceptedWrite(files, after);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Row 60: owned constructs
// ---------------------------------------------------------------------------

describe('owned constructs of a deployment removal (row 60)', SLOW, () => {
  const files: Files = {
    'm.c4': `${SPEC}${MODEL}${DEPLOYMENT.replace('  vm keep {', "  keep.b -> prod.inner.a 'R'\n  vm keep {")}`,
    'x.c4': 'deployment {\n  extend prod.inner {\n    c = instanceOf app.db\n  }\n}\n',
  };

  it.each([false, true])('node removal, cascade %s: the relationship and the extend block in another file go', async (cascade) => {
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const result = m.removeDeploymentNode('prod.inner', { cascade });
    expect(result).toEqual({
      removedRelationships: [{ source: { id: 'keep.b' }, target: { id: 'prod.inner.a' }, title: 'R' }],
      ...(cascade && { cascaded: [] }),
    });
    const after = m.serialize();
    expect(after['m.c4']).toBe(files['m.c4']!.replace(REMOVED.node.text, '').replace("  keep.b -> prod.inner.a 'R'\n", ''));
    expect(after['x.c4']).toBe('deployment {\n}\n');
    await expectAcceptedWrite(files, after);
  });

  it.each([false, true])('instance removal, cascade %s: the relationship goes', async (cascade) => {
    const m = LikeC4Mutator.fromFiles(files);
    const result = m.removeDeploymentInstance('prod.inner.a', { cascade });
    expect(result).toEqual({
      removedRelationships: [{ source: { id: 'keep.b' }, target: { id: 'prod.inner.a' }, title: 'R' }],
      ...(cascade && { cascaded: [] }),
    });
    const after = m.serialize();
    expect(after['m.c4']).toBe(files['m.c4']!.replace(REMOVED.instance.text, '').replace("  keep.b -> prod.inner.a 'R'\n", ''));
    expect(after['x.c4']).toBe(files['x.c4']);
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Row 61: D77 on a deployment view
// ---------------------------------------------------------------------------

describe('a cascade that removes a deployment view\'s only include (row 61)', () => {
  const files: Files = { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}views {\n  deployment view dv {\n    include prod.inner.a\n  }\n}\n` };

  it.each(['node', 'instance'] as const)('%s removal is RRE', async (api) => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, api, REMOVED[api].id, true).references).toEqual([
      { ...at(files, 'm.c4', 'prod.inner.a\n'), role: 'predicate-item', cascadable: true, view: 'dv' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rows 62, 63: affected mode
// ---------------------------------------------------------------------------

describe('a removed id in unrecovered text (row 62)', () => {
  it.each([
    ['node', 'prod.inner', 'prod.inner'],
    ['instance', 'prod.inner.a', 'prod.inner.a'],
  ] as const)('%s removal is RRE in both modes', (api, id, written) => {
    const files: Files = { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}`, 'b.c4': `model {\n  x -> -> ${written} 'q'\n}\n` };
    for (const cascade of [false, true]) {
      expect(expectRRE(files, api, id, cascade).references).toEqual([{ ...at(files, 'b.c4', written), role: 'unrecovered', cascadable: false }]);
    }
  });
});

describe('a removed id at recovered unmodelled places (row 63)', () => {
  // `keep` is a root node (a whole name); `prod.inner` and `keep.b` name the
  // removed id as a later dotted segment.
  const PLACES: Array<{ name: string; api: Api; id: string; text: (written: string) => string; written: string; role: RemovalReference['role']; view?: string }> = [
    { name: 'node, a whole name in a global predicate', api: 'node', id: 'keep', written: 'keep', role: 'global-or-import', text: (w) => `global {\n  predicateGroup g {\n    include ${w}\n  }\n}\n` },
    { name: 'node, a later segment in a global predicate', api: 'node', id: 'prod.inner', written: 'prod.inner', role: 'global-or-import', text: (w) => `global {\n  predicateGroup g {\n    include ${w}\n  }\n}\n` },
    { name: 'instance, a later segment in a global predicate', api: 'instance', id: 'keep.b', written: 'keep.b', role: 'global-or-import', text: (w) => `global {\n  predicateGroup g {\n    include ${w}\n  }\n}\n` },
    { name: 'node, a whole name in a global style', api: 'node', id: 'keep', written: 'keep', role: 'global-or-import', text: (w) => `global {\n  style gs ${w} {\n    color red\n  }\n}\n` },
    { name: 'instance, a later segment in a global style', api: 'instance', id: 'keep.b', written: 'keep.b', role: 'global-or-import', text: (w) => `global {\n  style gs ${w} {\n    color red\n  }\n}\n` },
  ];

  it.each(PLACES)('$name is RRE in both modes', async ({ api, id, text, written, role, view }) => {
    const files: Files = { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}${text(written)}` };
    // P: LikeC4 accepts the input (RES-T7).
    await expectValidLikeC4(files);
    // The reference is the one in the global block, after the deployment model.
    const needle = `${written}${text(written).includes('style') ? ' {' : '\n'}`;
    const earlier = `${SPEC}${MODEL}${DEPLOYMENT}`.split(needle).length - 1;
    for (const cascade of [false, true]) {
      expect(expectRRE(files, api, id, cascade).references).toEqual([
        { ...at(files, 'm.c4', needle, earlier), role, cascadable: false, ...(view !== undefined && { view }) },
      ]);
    }
  });

  it('LikeC4 rejects a deployment id in a dynamic step, opaque or not (RES-T7: not tested there)', async () => {
    const files: Files = {
      'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}views {\n  dynamic view d {\n    app.api -> other\n    opt {\n      keep -> other\n    }\n  }\n}\n`,
    };
    expect(await validateLikeC4(files)).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Row 64: D104
// ---------------------------------------------------------------------------

describe('an unknown id and a refused edit are plain InvalidWriteError (row 64, D104, D113)', () => {
  it.each([
    ['node', 'an unknown id', { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}` }, 'nope'],
    ['instance', 'an unknown id', { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}` }, 'keep.nope'],
    ['node', 'a file with a stray }', { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}}\n` }, 'keep'],
    ['instance', 'a file with a stray }', { 'm.c4': `${SPEC}${MODEL}${DEPLOYMENT}}\n` }, 'keep.b'],
  ] as const)('%s removal, %s', (api, _, files: Files, id) => {
    const m = LikeC4Mutator.fromFiles(files);
    const nodes = m.listDeploymentNodes();
    let error: unknown;
    try {
      removal(m, api, id, false);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(InvalidWriteError);
    expect(error).not.toBeInstanceOf(ReferencedRemovalError);
    expect((error as InvalidWriteError).field).toBe('id');
    expect(m.serialize()).toEqual(files);
    expect(m.listDeploymentNodes()).toEqual(nodes);
  });
});
