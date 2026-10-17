/**
 * The reference policy of `removeElement` (lc4m-15.30 US-1; FR-001, FR-003,
 * FR-004; rows 32–56 of the test matrix): owned constructs go in both
 * modes, other references reject the removal by default and are cascaded
 * with `cascade: true`, and what a cascade cannot edit rejects it in both
 * modes.
 *
 * Expected values come from the spec (FR-001 roles and policy, D55, D56,
 * D61, D77, D92, D104, D108, D111–D113) and from the inputs: positions are
 * found in the test's own literals, expected texts are the inputs with the
 * removed constructs taken out, and the references before and after a write
 * are what LikeC4's linker reports (`linkedCatalogueReferences`).
 *
 * Abbreviations of the matrix: RRE (a `ReferencedRemovalError` on `fqn`,
 * nothing changed), REFS (`error.references`), CASC (`result.cascaded`),
 * GONE (the linker's references after = before minus a literal list), STAB
 * (every other reference keeps its target; part of GONE, which compares
 * targets), AWB (the accepted-write bundle).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, type RemoveElementResult } from '../../src/mutator/mutator.js';
import { InvalidWriteError, ReferencedRemovalError, type RemovalReference } from '../../src/mutator/write-checks.js';
import { ReferencedRemovalError as ExportedError } from '../../src/index.js';
import {
  computedViews,
  expectAcceptedWrite,
  expectValidLikeC4,
  linkedCatalogueReferences,
  type LinkedCatalogueReference,
} from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

const SPEC = `specification {
  element system
  element service
  deploymentNode vm
  tag t
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
  const line = before.split('\n').length;
  return { file, line, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

/** A REFS entry at the `occurrence`-th `needle`. */
function ref(
  files: Files,
  file: string,
  needle: string,
  role: RemovalReference['role'],
  cascadable: boolean,
  view?: string,
  occurrence = 0,
): RemovalReference {
  return { ...at(files, file, needle, occurrence), role, cascadable, ...(view !== undefined && { view }) };
}

/** A CASC entry at the `occurrence`-th `needle`. */
function casc(files: Files, file: string, needle: string, role: RemovalReference['role'], occurrence = 0): NonNullable<RemoveElementResult['cascaded']>[number] {
  return { ...at(files, file, needle, occurrence), role: role as NonNullable<RemoveElementResult['cascaded']>[number]['role'] };
}

/** RRE: the removal throws a `ReferencedRemovalError` on `fqn` and changes nothing. */
function expectRRE(files: Files, fqn: string, cascade: boolean): ReferencedRemovalError {
  const m = LikeC4Mutator.fromFiles(files);
  const elements = m.listElements();
  const views = m.listViews();
  let error: unknown;
  try {
    m.removeElement(fqn, { cascade });
  } catch (err) {
    error = err;
  }
  expect(error, 'the removal is rejected').toBeInstanceOf(ReferencedRemovalError);
  expect((error as ReferencedRemovalError).field).toBe('fqn');
  expect(m.serialize()).toEqual(files);
  expect(m.listElements()).toEqual(elements);
  expect(m.listViews()).toEqual(views);
  return error as ReferencedRemovalError;
}

/** The removal on a fresh mutator: its result and the files after it. */
function remove(files: Files, fqn: string, cascade: boolean): { m: LikeC4Mutator; result: RemoveElementResult; after: Files } {
  const m = LikeC4Mutator.fromFiles(files);
  const result = m.removeElement(fqn, { cascade });
  return { m, result, after: m.serialize() };
}

/** The comparable form of a linked reference: what it is and where it links. */
function key(reference: LinkedCatalogueReference): string {
  return JSON.stringify([reference.file, reference.role, reference.text, reference.target]);
}

/**
 * GONE (and STAB): the linker's references after the write are those
 * before it minus `gone` — one reference per `[file, role, text]` — with
 * the same targets.
 */
async function expectGone(before: Files, after: Files, gone: ReadonlyArray<[string, string, string]>): Promise<void> {
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

/** The fixture `name` under `tests/fixtures`, by relative path. */
function readFixture(name: string): Files {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const files: Files = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(root, path).split(sep).join('/')] = readFileSync(path, 'utf-8');
    }
  };
  walk(root);
  return files;
}

describe('ReferencedRemovalError', () => {
  it('is an InvalidWriteError exported from the package entry', () => {
    expect(ExportedError).toBe(ReferencedRemovalError);
    expect(new ReferencedRemovalError('fqn', 'x', [])).toBeInstanceOf(InvalidWriteError);
  });
});

// ---------------------------------------------------------------------------
// Row 32: owned constructs, both modes
// ---------------------------------------------------------------------------

describe('owned constructs go in both modes (row 32)', SLOW, () => {
  const files: Files = {
    'm.c4': `${SPEC}model {
  app = system {
    api = service
    db = service
  }
  other = system {
    -> app.api 'nested'
  }
  app.api -> other 'top'
  app.db -> other 'stays'
  extend other {
    app.db -> app.api 'in extend'
  }
  extend app.api {
    #t
  }
  extend app.api -> other 'top' {
    #t
  }
}
`,
  };
  const expected = `${SPEC}model {
  app = system {
    db = service
  }
  other = system {
  }
  app.db -> other 'stays'
  extend other {
  }
}
`;

  it.each([false, true])('cascade %s: removed with the element; cascaded only with cascade', async (cascade) => {
    await expectValidLikeC4(files);
    const { result, after } = remove(files, 'app.api', cascade);
    const sorted = (list: RemoveElementResult['removedRelationships']) => [...list].map((r) => JSON.stringify(r)).sort();
    expect(sorted(result.removedRelationships)).toEqual(
      sorted([
        { source: 'other', target: 'app.api', title: 'nested' },
        { source: 'app.api', target: 'other', title: 'top' },
        { source: 'app.db', target: 'app.api', title: 'in extend' },
      ]),
    );
    if (cascade) expect(result.cascaded).toEqual([]);
    else expect('cascaded' in result).toBe(false);
    expect(after['m.c4']).toBe(expected);
    await expectGone(files, after, [
      ['m.c4', 'relationship-endpoint', 'app.api'],
      ['m.c4', 'relationship-endpoint', 'app.api'],
      ['m.c4', 'relationship-endpoint', 'other'],
      ['m.c4', 'relationship-endpoint', 'app.db'],
      ['m.c4', 'relationship-endpoint', 'app.api'],
      ['m.c4', 'extend-element-target', 'app.api'],
      ['m.c4', 'extend-relationship-endpoint', 'app.api'],
      ['m.c4', 'extend-relationship-endpoint', 'other'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Rows 33, 34: the deployment model
// ---------------------------------------------------------------------------

describe('instanceOf into the subtree (row 33)', SLOW, () => {
  const files: Files = {
    'm.c4': `${SPEC}${MODEL}deployment {
  vm prod {
    instanceOf app.api
    o = instanceOf other
  }
  prod.api -> prod.o 'calls'
}
`,
  };

  it('is RRE by default, listing the instanceOf as cascadable', async () => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', false).references).toEqual([ref(files, 'm.c4', 'app.api\n    o', 'instance-of', true)]);
  });

  it('with cascade removes the instance and its deployment relationships', async () => {
    const { result, after } = remove(files, 'app.api', true);
    // The instance's relationship is listed with the closure (D124).
    expect(result).toEqual({
      removedRelationships: [],
      removedDeploymentRelationships: [{ source: { id: 'prod.api' }, target: { id: 'prod.o' }, title: 'calls' }],
      cascaded: [casc(files, 'm.c4', 'app.api\n    o', 'instance-of')],
    });
    expect(after['m.c4']).toBe(`${SPEC}${MODEL.replace('    api = service\n', '')}deployment {
  vm prod {
    o = instanceOf other
  }
}
`);
    await expectGone(files, after, [
      ['m.c4', 'instance-of', 'app.api'],
      ['m.c4', 'deployment-relationship-endpoint', 'prod.api'],
      ['m.c4', 'deployment-relationship-endpoint', 'prod.o'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

describe('a deployment relationship through an instance into the subtree (row 34)', SLOW, () => {
  const files: Files = {
    'm.c4': `${SPEC}model {
  app = system {
    gw = service {
      sub = service
    }
  }
  other = system
}
deployment {
  vm prod {
    gw = instanceOf app.gw
    o = instanceOf other
  }
  prod.gw.sub -> prod.o 'R'
}
`,
  };

  it('is RRE by default, listing the endpoint as cascadable', async () => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.gw.sub', false).references).toEqual([
      ref(files, 'm.c4', 'prod.gw.sub', 'deployment-relationship-endpoint', true),
    ]);
  });

  it('with cascade removes the relationship', async () => {
    const { result, after } = remove(files, 'app.gw.sub', true);
    expect(result).toEqual({
      removedRelationships: [],
      removedDeploymentRelationships: [{ source: { id: 'prod.gw', element: 'app.gw.sub' }, target: { id: 'prod.o' }, title: 'R' }],
      cascaded: [casc(files, 'm.c4', 'prod.gw.sub', 'deployment-relationship-endpoint')],
    });
    expect(after['m.c4']).toBe(files['m.c4']!.replace("    gw = service {\n      sub = service\n    }\n", '    gw = service {\n    }\n').replace("  prod.gw.sub -> prod.o 'R'\n", ''));
    await expectGone(files, after, [
      ['m.c4', 'deployment-relationship-endpoint', 'prod.gw.sub'],
      ['m.c4', 'deployment-relationship-endpoint', 'prod.o'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Row 35: a view `of` blocks in both modes
// ---------------------------------------------------------------------------

describe('a view of the removed element (row 35)', () => {
  const files: Files = { 'm.c4': `${SPEC}${MODEL}views {\n  view v of app.api {\n    include *\n  }\n}\n` };

  it.each([false, true])('is RRE with cascade %s, the of not cascadable', async (cascade) => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', cascade).references).toEqual([ref(files, 'm.c4', 'app.api {', 'view-of', false, 'v')]);
  });
});

// ---------------------------------------------------------------------------
// Rows 36–42: view statements are cascaded
// ---------------------------------------------------------------------------

const DEPLOYED_MODEL = `model {
  app = system {
    api = service
    db = service
    gw = service {
      sub = service
    }
  }
  other = system
}
deployment {
  vm prod {
    gw = instanceOf app.gw
    o = instanceOf other
  }
}
`;

/** The files of `views` (the inside of a `views` block) over the deployed model. */
function withViews(views: string): Files {
  return { 'm.c4': `${SPEC}${DEPLOYED_MODEL}views {\n${views}}\n` };
}

interface StatementCase {
  name: string;
  fqn?: string;
  views: string;
  /** The text of `views` after the cascade */
  after: string;
  /** The needle of each reference into the subtree, with its role and view (REFS / CASC, in order) */
  refs: Array<[needle: string, role: RemovalReference['role'], view: string | undefined]>;
  /** GONE: the references removed with the statements */
  gone: Array<[role: string, text: string]>;
}

/** Rows 36–42: RRE by default with the cascadable references; with cascade the literal text, CASC, GONE and AWB. */
function statementCases(cases: StatementCase[]): void {
  describe.each(cases)('$name', ({ fqn = 'app.api', views, after, refs, gone }) => {
    const files = withViews(views);
    it('is RRE by default, every reference cascadable', async () => {
      await expectValidLikeC4(files);
      expect(expectRRE(files, fqn, false).references).toEqual(refs.map(([needle, role, view]) => ref(files, 'm.c4', needle, role, true, view)));
    });
    it('with cascade removes the statements', async () => {
      const removal = remove(files, fqn, true);
      expect(removal.result.cascaded).toEqual(refs.map(([needle, role]) => casc(files, 'm.c4', needle, role)));
      const removedElement = fqn === 'app.api' ? '    api = service\n' : '      sub = service\n';
      expect(removal.after['m.c4']).toBe(`${SPEC}${DEPLOYED_MODEL.replace(removedElement, '')}views {\n${after}}\n`);
      await expectGone(files, removal.after, gone.map(([role, text]) => ['m.c4', role, text] as [string, string, string]));
      await expectAcceptedWrite(files, removal.after);
    });
  });
}

describe('predicate items (row 36)', SLOW, () => {
  statementCases([
    {
      name: 'an include item',
      views: '  view v {\n    include app.api, other\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api, other', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'an exclude item',
      views: '  view v {\n    include *\n    exclude app.api\n  }\n',
      after: '  view v {\n    include *\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'x.*',
      views: '  view v {\n    include other, app.api.*\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api.*', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'x.**',
      views: '  view v {\n    include other, app.api.**\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api.**', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'x._',
      views: '  view v {\n    include other, app.api._\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api._', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'a relation predicate with the subtree as source',
      views: '  view v {\n    include other\n    include app.api -> other\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api -> other', 'predicate-item', 'v']],
      gone: [
        ['predicate-item', 'app.api'],
        ['predicate-item', 'other'],
      ],
    },
    {
      name: 'a relation predicate with the subtree as target',
      views: '  view v {\n    include other\n    include other -> app.api\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'v']],
      gone: [
        ['predicate-item', 'other'],
        ['predicate-item', 'app.api'],
      ],
    },
    {
      name: '* -> x',
      views: '  view v {\n    include other\n    include * -> app.api\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'a dynamic include',
      views: '  dynamic view d {\n    other -> app.db\n    include app.api\n  }\n',
      after: '  dynamic view d {\n    other -> app.db\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'd']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'an item inside nested groups',
      views: '  view v {\n    include other\n    group {\n      group {\n        include app.api, app.db\n      }\n    }\n  }\n',
      after: '  view v {\n    include other\n    group {\n      group {\n        include app.db\n      }\n    }\n  }\n',
      refs: [['app.api, app.db', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
  ]);
});

describe('predicate items: a deployment-view path to an instance of the subtree (row 36)', SLOW, () => {
  // LikeC4 accepts no path below an instance in a deployment-view predicate
  // ("Must reference deployment nodes or instances, but not internals"), so
  // the path names the instance the removal closure takes away.
  const files = withViews('  deployment view dv {\n    include prod.o\n    include prod.gw\n  }\n');

  it('is RRE by default: the instanceOf and the item, both cascadable', async () => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.gw', false).references).toEqual([
      ref(files, 'm.c4', 'app.gw\n', 'instance-of', true),
      ref(files, 'm.c4', 'prod.gw\n', 'predicate-item', true, 'dv'),
    ]);
  });

  it('with cascade removes the instance and the item', async () => {
    const { result, after } = remove(files, 'app.gw', true);
    expect(result.cascaded).toEqual([casc(files, 'm.c4', 'app.gw\n', 'instance-of'), casc(files, 'm.c4', 'prod.gw\n', 'predicate-item')]);
    expect(after['m.c4']).toBe(
      files['m.c4']!
        .replace('    gw = service {\n      sub = service\n    }\n', '')
        .replace('    gw = instanceOf app.gw\n', '')
        .replace('    include prod.gw\n', ''),
    );
    await expectGone(files, after, [
      ['m.c4', 'instance-of', 'app.gw'],
      ['m.c4', 'predicate-item', 'prod.gw'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

describe('with and where travel with their item (row 37)', SLOW, () => {
  it.each([
    {
      name: 'the cascaded item is the first',
      rule: '    include app.api with {\n      color red\n    }, other where tag is #t\n',
      expected: 'include other where tag is #t',
    },
    {
      name: 'the cascaded item is the last',
      rule: '    include other with {\n      color red\n    }, app.api where tag is #t\n',
      expected: 'include other with {\n      color red\n    }',
    },
  ])('$name', async ({ rule, expected }) => {
    const files = withViews(`  view v {\n${rule}  }\n`);
    await expectValidLikeC4(files);
    const { m, after } = remove(files, 'app.api', true);
    expect(m.getView('v')!.rules.map((r) => r.text)).toEqual([expected]);
    expect(after['m.c4']).toBe(files['m.c4']!.replace('    api = service\n', '').replace(rule, `    ${expected}\n`));
    await expectAcceptedWrite(files, after);
  });
});

describe('emptied containers (row 38)', SLOW, () => {
  statementCases([
    {
      name: 'the last include item removes the rule',
      views: '  view v {\n    include other\n    include app.api\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'an emptied nested group removes each emptied group',
      views: '  view v {\n    include other\n    group {\n      group {\n        include app.api\n      }\n    }\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [['app.api\n', 'predicate-item', 'v']],
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'the last style target',
      views: '  view v {\n    include *\n    style app.api {\n      color red\n    }\n  }\n',
      after: '  view v {\n    include *\n  }\n',
      refs: [['app.api {', 'style-target', 'v']],
      gone: [['style-target', 'app.api']],
    },
    {
      name: 'the last rank target',
      views: '  view v {\n    include *\n    rank same {\n      app.api\n    }\n  }\n',
      after: '  view v {\n    include *\n  }\n',
      refs: [['app.api\n    }', 'rank-target', 'v']],
      gone: [['rank-target', 'app.api']],
    },
    {
      name: 'an emptied par',
      views: '  dynamic view d {\n    other -> app.db\n    par {\n      app.api -> other\n    }\n  }\n',
      after: '  dynamic view d {\n    other -> app.db\n  }\n',
      refs: [['app.api -> other', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'other'],
      ],
    },
    {
      name: 'an emptied parallel',
      views: '  dynamic view d {\n    other -> app.db\n    parallel {\n      app.api -> other\n    }\n  }\n',
      after: '  dynamic view d {\n    other -> app.db\n  }\n',
      refs: [['app.api -> other', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'other'],
      ],
    },
  ]);

  it('computes no group node after the nested groups are removed', async () => {
    const files = withViews('  view v {\n    include other\n    group {\n      group {\n        include app.api\n      }\n    }\n  }\n');
    const { after } = remove(files, 'app.api', true);
    expect((await computedViews(after))['v']!.nodes.filter((id) => id.startsWith('@'))).toEqual([]);
  });
});

describe('one element several times in one rule (row 39)', SLOW, () => {
  statementCases([
    {
      name: 'include api, api.*, other',
      views: '  view v {\n    include app.api, app.api.*, other\n  }\n',
      after: '  view v {\n    include other\n  }\n',
      refs: [
        ['app.api, app.api.*', 'predicate-item', 'v'],
        ['app.api.*', 'predicate-item', 'v'],
      ],
      gone: [
        ['predicate-item', 'app.api'],
        ['predicate-item', 'app.api'],
      ],
    },
  ]);
});

describe('dynamic step endpoints (row 40)', SLOW, () => {
  const cases: Array<StatementCase & { steps: Array<[string, string]> }> = [
    {
      name: 'a single step',
      views: '  dynamic view d {\n    other -> app.db\n    app.api -> other\n  }\n',
      after: '  dynamic view d {\n    other -> app.db\n  }\n',
      refs: [['app.api -> other', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'other'],
      ],
      steps: [['app.api', 'other']],
    },
    {
      name: 'a chain segment (the whole chain goes)',
      views: '  dynamic view d {\n    other -> app.db\n    other -> app.api -> app.db\n  }\n',
      after: '  dynamic view d {\n    other -> app.db\n  }\n',
      refs: [['app.api -> app.db', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'other'],
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'app.db'],
      ],
      steps: [
        ['other', 'app.api'],
        ['app.api', 'app.db'],
      ],
    },
    {
      name: 'a step in par',
      views: '  dynamic view d {\n    par {\n      other -> app.db\n      app.api -> other\n    }\n  }\n',
      after: '  dynamic view d {\n    par {\n      other -> app.db\n    }\n  }\n',
      refs: [['app.api -> other', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'other'],
      ],
      steps: [['app.api', 'other']],
    },
    {
      name: 'a step in parallel',
      views: '  dynamic view d {\n    parallel {\n      other -> app.db\n      app.api -> other\n    }\n  }\n',
      after: '  dynamic view d {\n    parallel {\n      other -> app.db\n    }\n  }\n',
      refs: [['app.api -> other', 'step-endpoint', 'd']],
      gone: [
        ['step-endpoint', 'app.api'],
        ['step-endpoint', 'other'],
      ],
      steps: [['app.api', 'other']],
    },
  ];
  statementCases(cases);

  it.each(cases)('$name: the computed steps lose exactly the removed ones', async ({ views, steps }) => {
    const files = withViews(views);
    const { after } = remove(files, 'app.api', true);
    const pairs = async (f: Files) => (await computedViews(f))['d']!.steps.map((s) => [s.source, s.target]);
    const expected = await pairs(files);
    for (const step of steps) {
      const i = expected.findIndex(([s, t]) => s === step[0] && t === step[1]);
      expect(i, `the step ${step.join(' -> ')} is computed before the write`).toBeGreaterThanOrEqual(0);
      expected.splice(i, 1);
    }
    expect(await pairs(after)).toEqual(expected);
  });
});

describe('style targets (row 41)', SLOW, () => {
  statementCases([
    {
      name: 'in a view: the target goes, the rule stays',
      views: '  view v {\n    include *\n    style app.api, other {\n      color red\n    }\n  }\n',
      after: '  view v {\n    include *\n    style other {\n      color red\n    }\n  }\n',
      refs: [['app.api, other {', 'style-target', 'v']],
      gone: [['style-target', 'app.api']],
    },
    {
      name: 'in the views block: the last target removes the rule',
      views: '  style app.api {\n    color red\n  }\n  view v {\n    include *\n  }\n',
      after: '  view v {\n    include *\n  }\n',
      refs: [['app.api {', 'style-target', undefined]],
      gone: [['style-target', 'app.api']],
    },
  ]);
});

describe('rank targets (row 42)', SLOW, () => {
  statementCases([
    {
      name: 'the target goes, the rule keeps the others',
      views: '  view v {\n    include *\n    rank same {\n      app.api, app.db\n    }\n  }\n',
      after: '  view v {\n    include *\n    rank same {\n      app.db\n    }\n  }\n',
      refs: [['app.api, app.db\n', 'rank-target', 'v']],
      gone: [['rank-target', 'app.api']],
    },
  ]);
});

// ---------------------------------------------------------------------------
// Rows 43, 44: unmodelled places block in both modes
// ---------------------------------------------------------------------------

describe('references in opaque blocks (row 43)', () => {
  const BLOCKS: Array<[string, string]> = [
    ['opt', "    opt {\n      app.api -> other\n    }\n"],
    ['loop', "    loop {\n      app.api -> other\n    }\n"],
    ['alt / if', "    alt {\n      if 'a' {\n        app.api -> other\n      }\n    }\n"],
    ['alt / when', "    alt {\n      when 'w' {\n        app.api -> other\n      }\n    }\n"],
    ['alt / else', "    alt {\n      if 'a' {\n        other -> app.db\n      }\n      else {\n        app.api -> other\n      }\n    }\n"],
    ['try', "    try {\n      app.api -> other\n    }\n"],
    ['catch', "    try {\n      other -> app.db\n    } catch 'e' {\n      app.api -> other\n    }\n"],
    ['finally', "    try {\n      other -> app.db\n    } finally {\n      app.api -> other\n    }\n"],
    ['break', "    break 'stop' {\n      app.api -> other\n    }\n"],
  ];

  describe.each(BLOCKS)('%s', (_, block) => {
    const files: Files = { 'm.c4': `${SPEC}${MODEL}views {\n  dynamic view d {\n    other -> app.db\n${block}  }\n}\n` };
    it.each([false, true])('is RRE with cascade %s, opaque-flow not cascadable', async (cascade) => {
      await expectValidLikeC4(files);
      expect(expectRRE(files, 'app.api', cascade).references).toEqual([ref(files, 'm.c4', 'app.api -> other', 'opaque-flow', false, 'd')]);
    });
  });
});

describe('global constructs and imports (row 44)', () => {
  const GLOBALS: Array<[string, string, string]> = [
    ['a global predicate', '  predicateGroup g {\n    include app.api\n  }\n', 'app.api\n'],
    ['a global style', '  style gs app.api {\n    color red\n  }\n', 'app.api {'],
  ];

  describe.each(GLOBALS)('%s', (_, global, needle) => {
    const files: Files = { 'm.c4': `${SPEC}${MODEL}global {\n${global}}\n` };
    it.each([false, true])('is RRE with cascade %s, global-or-import not cascadable', async (cascade) => {
      await expectValidLikeC4(files);
      expect(expectRRE(files, 'app.api', cascade).references).toEqual([ref(files, 'm.c4', needle, 'global-or-import', false)]);
    });
  });

  describe('an import', () => {
    const files = readFixture('refs-import');
    it.each([false, true])('is RRE with cascade %s, the import not cascadable', async (cascade) => {
      await expectValidLikeC4(files, { projects: ['main', 'other'] });
      expect(expectRRE(files, 'solo', cascade).references).toEqual([
        ref(files, 'main/model10.c4', 'solo from', 'global-or-import', false),
        ref(files, 'main/model10.c4', 'solo\r\n  }', 'predicate-item', true, 'index'),
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Row 45: where conditions are no element references
// ---------------------------------------------------------------------------

describe('where conditions name kinds and tags, not elements (row 45)', SLOW, () => {
  const files: Files = {
    'm.c4': `${SPEC}model {
  service = system
  t = system
  other = system
}
views {
  view v {
    include * where kind is service
    include * where tag is #t
  }
}
`,
  };

  it.each(['service', 't'])('removes the element %s', async (fqn) => {
    await expectValidLikeC4(files);
    const { after } = remove(files, fqn, false);
    expect(after['m.c4']).toBe(files['m.c4']!.replace(`  ${fqn} = system\n`, ''));
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Rows 46–48: the a1 model, D77 and extends chains
// ---------------------------------------------------------------------------

describe('the a1 model (row 46)', () => {
  const files: Files = {
    'm.c4': `${SPEC}${MODEL}views {
  view a of app.api {
    include *
  }
  view b {
    include app.api
  }
  dynamic view c {
    app.api -> app.db
  }
}
`,
  };

  it.each([false, true])('is RRE with cascade %s: the of blocks, the include and the step are cascadable', async (cascade) => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', cascade).references).toEqual([
      ref(files, 'm.c4', 'app.api {\n    include *', 'view-of', false, 'a'),
      ref(files, 'm.c4', 'app.api\n  }\n  dynamic', 'predicate-item', true, 'b'),
      ref(files, 'm.c4', 'app.api -> app.db', 'step-endpoint', true, 'c'),
    ]);
  });
});

describe('a cascade that empties a view is RRE (row 47, D77, D108)', () => {
  const CASES: Array<[string, string, string, RemovalReference['role'], string]> = [
    ['a scoped view with a remaining exclude', '  view s of app {\n    include api\n    exclude other\n  }\n', 'api\n    exclude', 'predicate-item', 's'],
    ['an unscoped view with a remaining exclude', '  view u {\n    include app.api\n    exclude other\n  }\n', 'app.api\n    exclude', 'predicate-item', 'u'],
    ['a dynamic view whose only step names the element', '  dynamic view d {\n    app.api -> other\n  }\n', 'app.api -> other', 'step-endpoint', 'd'],
    [
      'a view whose only own include names the element, its content otherwise inherited',
      '  view base {\n    include other\n  }\n  view child extends base {\n    include app.api\n  }\n',
      'app.api\n  }',
      'predicate-item',
      'child',
    ],
  ];

  it.each(CASES)('%s', async (_, views, needle, role, view) => {
    const files: Files = { 'm.c4': `${SPEC}${MODEL}views {\n${views}}\n` };
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', true).references).toEqual([ref(files, 'm.c4', needle, role, true, view)]);
  });
});

describe('the of of a view another view extends (row 48, D113)', () => {
  const files: Files = {
    'm.c4': `${SPEC}${MODEL}views {
  view s of app.api {
    include *
  }
  view e extends s {
    include other
  }
}
`,
  };

  it.each([false, true])('is RRE with cascade %s, naming the of and the extends', async (cascade) => {
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', cascade).references).toEqual([
      ref(files, 'm.c4', 'app.api {', 'view-of', false, 's'),
      ref(files, 'm.c4', 's {\n    include other', 'view-extends', false, 'e'),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rows 49, 50: the deployment closure
// ---------------------------------------------------------------------------

describe('the removal closure into deployment views (rows 49, 50)', SLOW, () => {
  it('cascades the instance, its relationships and its view items when the view keeps content (row 49)', async () => {
    const files = withViews('  deployment view dv {\n    include prod.o\n    include prod.gw\n    style prod.gw {\n      color red\n    }\n  }\n');
    files['m.c4'] = files['m.c4']!.replace('    o = instanceOf other\n  }\n', "    o = instanceOf other\n  }\n  prod.gw -> prod.o 'R'\n");
    await expectValidLikeC4(files);
    const { result, after } = remove(files, 'app.gw', true);
    expect(result).toEqual({
      removedRelationships: [],
      removedDeploymentRelationships: [{ source: { id: 'prod.gw' }, target: { id: 'prod.o' }, title: 'R' }],
      cascaded: [
        casc(files, 'm.c4', 'app.gw\n', 'instance-of'),
        casc(files, 'm.c4', 'prod.gw\n', 'predicate-item'),
        casc(files, 'm.c4', 'prod.gw {', 'style-target'),
      ],
    });
    expect(after['m.c4']).toBe(
      files['m.c4']!
        .replace('    gw = service {\n      sub = service\n    }\n', '')
        .replace('    gw = instanceOf app.gw\n', '')
        .replace("  prod.gw -> prod.o 'R'\n", '')
        .replace('    include prod.gw\n    style prod.gw {\n      color red\n    }\n', ''),
    );
    await expectGone(files, after, [
      ['m.c4', 'instance-of', 'app.gw'],
      ['m.c4', 'deployment-relationship-endpoint', 'prod.gw'],
      ['m.c4', 'deployment-relationship-endpoint', 'prod.o'],
      ['m.c4', 'predicate-item', 'prod.gw'],
      ['m.c4', 'style-target', 'prod.gw'],
    ]);
    await expectAcceptedWrite(files, after);
  });

  it('is RRE under D77 when the instance was the deployment view\'s only content (row 50)', async () => {
    const files = withViews('  deployment view dv {\n    include prod.gw\n  }\n');
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.gw', true).references).toEqual([
      ref(files, 'm.c4', 'app.gw\n', 'instance-of', true),
      ref(files, 'm.c4', 'prod.gw\n', 'predicate-item', true, 'dv'),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rows 51, 52: affected mode (D92)
// ---------------------------------------------------------------------------

describe('affected mode: the names of the subtree at unmodelled places (row 51)', () => {
  /** A model with a second element named `api` that the removal does not touch. */
  const TWO = `${SPEC}model {
  app = system {
    api = service
    db = service
  }
  other = system {
    api = service
  }
}
`;
  const CASES: Array<[string, Files, string, string, RemovalReference['role'], string | undefined]> = [
    ['an element FqnRef in an opaque block', { 'm.c4': `${SPEC}${MODEL}views {\n  dynamic view d {\n    other -> app.db\n    opt {\n      api -> other\n    }\n  }\n}\n` }, 'm.c4', 'api -> other', 'opaque-flow', 'd'],
    ['a later dotted segment in an opaque block', { 'm.c4': `${TWO}views {\n  dynamic view d {\n    app.db -> other\n    opt {\n      other.api -> app.db\n    }\n  }\n}\n` }, 'm.c4', 'other.api -> app.db', 'opaque-flow', 'd'],
    ['an element FqnRef in a global predicate', { 'm.c4': `${SPEC}${MODEL}global {\n  predicateGroup g {\n    include api\n  }\n}\n` }, 'm.c4', 'api\n  }', 'global-or-import', undefined],
    ['a later dotted segment in a global predicate', { 'm.c4': `${TWO}global {\n  predicateGroup g {\n    include other.api\n  }\n}\n` }, 'm.c4', 'other.api', 'global-or-import', undefined],
    ['an element FqnRef in a global style', { 'm.c4': `${SPEC}${MODEL}global {\n  style gs api {\n    color red\n  }\n}\n` }, 'm.c4', 'api {', 'global-or-import', undefined],
    ['a later dotted segment in a global style', { 'm.c4': `${TWO}global {\n  style gs other.api {\n    color red\n  }\n}\n` }, 'm.c4', 'other.api {', 'global-or-import', undefined],
    ['unrecovered tokens', { 'm.c4': `${TWO}`, 'b.c4': "model {\n  a -> -> other.api 'q'\n}\n" }, 'b.c4', 'other.api', 'unrecovered', undefined],
  ];

  it.each(CASES)('%s', async (_, files, file, needle, role, view) => {
    // P: the input is valid LikeC4, except the case of text the parser cannot recover.
    if (role !== 'unrecovered') await expectValidLikeC4(files);
    for (const cascade of [false, true]) {
      expect(expectRRE(files, 'app.api', cascade).references).toEqual([ref(files, file, needle, role, false, view)]);
    }
  });

  it('an imported name', async () => {
    const files = readFixture('refs-import');
    await expectValidLikeC4(files, { projects: ['main', 'other'] });
    for (const cascade of [false, true]) {
      expect(expectRRE(files, 'peer', cascade).references).toEqual([ref(files, 'main/model9.c4', 'peer }', 'global-or-import', false)]);
    }
  });
});

describe('affected mode negatives (row 52)', SLOW, () => {
  it.each([
    ['a longer identifier', "    opt {\n      apis -> other\n    }\n"],
    ['a comment', "    opt {\n      // api\n      other -> app.db\n    }\n"],
    ['a string', "    opt {\n      other -> app.db 'api'\n    }\n"],
  ])('%s does not block', async (_, block) => {
    const files: Files = {
      'm.c4': `${SPEC}${MODEL.replace('  other = system\n', '  other = system\n  apis = system\n')}views {\n  dynamic view d {\n    other -> app.db\n${block}  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const { after } = remove(files, 'app.api', false);
    expect(after['m.c4']).toBe(files['m.c4']!.replace('    api = service\n', ''));
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Row 53: D104
// ---------------------------------------------------------------------------

describe('an unknown element and a refused edit are plain InvalidWriteError (row 53, D104, D113)', () => {
  it.each([
    ['an unknown FQN', { 'm.c4': `${SPEC}${MODEL}` }, 'app.nope'],
    ['a file with a stray }', { 'm.c4': `${SPEC}${MODEL}}\n` }, 'app.api'],
  ])('%s', (_, files: Files, fqn) => {
    const m = LikeC4Mutator.fromFiles(files);
    const elements = m.listElements();
    let error: unknown;
    try {
      m.removeElement(fqn);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(InvalidWriteError);
    expect(error).not.toBeInstanceOf(ReferencedRemovalError);
    expect((error as InvalidWriteError).field).toBe('fqn');
    expect(m.serialize()).toEqual(files);
    expect(m.listElements()).toEqual(elements);
  });
});

// ---------------------------------------------------------------------------
// Rows 54–56: the fixtures
// ---------------------------------------------------------------------------

describe('the default mode removes only owned references (row 54)', SLOW, () => {
  it('removing box from refs-catalog removes only its relationship', async () => {
    const files = readFixture('refs-catalog');
    const { result, after } = remove(files, 'box', false);
    expect(result).toEqual({ removedRelationships: [{ source: 'customer', target: 'box', title: 'owns' }] });
    expect(after['model9.c4']).toBe(files['model9.c4']!.replace("  box = host 'Box'\n", '').replace("  customer -> box 'owns'\n", ''));
    for (const file of Object.keys(files).filter((f) => f !== 'model9.c4')) expect(after[file]).toBe(files[file]);
    await expectGone(files, after, [
      ['model9.c4', 'relationship-endpoint', 'customer'],
      ['model9.c4', 'relationship-endpoint', 'box'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

describe('a cascade in a CRLF file (row 55)', SLOW, () => {
  it('keeps CRLF and every byte outside the removed ranges', async () => {
    const files = readFixture('refs-flows');
    // P: the views file is CRLF.
    expect(files['views10.c4']!.includes('\r\n')).toBe(true);
    const { result, after } = remove(files, 'rack', true);
    // LikeC4's document order sorts names naturally: views2.c4 before views10.c4.
    expect(result.cascaded).toEqual([
      casc(files, 'views2.c4', 'rack, platform.worker', 'predicate-item'),
      casc(files, 'views10.c4', 'rack, platform.worker', 'predicate-item'),
    ]);
    expect(after['views10.c4']).toBe(files['views10.c4']!.replace('client -[calls]-> rack, ', ''));
    expect(/(?<!\r)\n/.test(after['views10.c4']!)).toBe(false);
    expect(after['views2.c4']).toBe(files['views2.c4']!.replace('client -[calls]-> rack, ', ''));
    expect(after['model.c4']).toBe(files['model.c4']!.replace("  rack = cluster 'Rack'\n", '').replace("  client -[calls]-> rack 'monitors'\n", ''));
    await expectGone(files, after, [
      ['model.c4', 'relationship-endpoint', 'client'],
      ['model.c4', 'relationship-endpoint', 'rack'],
      ['views10.c4', 'predicate-item', 'client'],
      ['views10.c4', 'predicate-item', 'rack'],
      ['views2.c4', 'predicate-item', 'client'],
      ['views2.c4', 'predicate-item', 'rack'],
    ]);
    await expectAcceptedWrite(files, after);
  });
});

describe('a removal after a write that shifts positions (row 56)', SLOW, () => {
  it('reports the cascade at the positions of the state before the removal', async () => {
    const fx = readFixture('refs-flows');
    // One file holds the model and the views below it, so an element added to the model shifts the views.
    const files: Files = { ...fx, 'model.c4': `${fx['model.c4']}\n${fx['views10.c4']!.replace(/\r\n/g, '\n')}` };
    delete files['views10.c4'];
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    m.addElement('platform', { name: 'cache', kind: 'component' });
    const shifted = m.serialize();
    // P: the addition moved the referencing statement down.
    expect(at(shifted, 'model.c4', 'rack, platform.worker').line).toBeGreaterThan(at(files, 'model.c4', 'rack, platform.worker').line);
    const result = m.removeElement('rack', { cascade: true });
    expect(result.cascaded).toEqual([
      casc(shifted, 'model.c4', 'rack, platform.worker', 'predicate-item'),
      casc(shifted, 'views2.c4', 'rack, platform.worker', 'predicate-item'),
    ]);
    const after = m.serialize();
    await expectGone(shifted, after, [
      ['model.c4', 'relationship-endpoint', 'client'],
      ['model.c4', 'relationship-endpoint', 'rack'],
      ['model.c4', 'predicate-item', 'client'],
      ['model.c4', 'predicate-item', 'rack'],
      ['views2.c4', 'predicate-item', 'client'],
      ['views2.c4', 'predicate-item', 'rack'],
    ]);
    await expectAcceptedWrite(shifted, after);
  });
});

// ---------------------------------------------------------------------------
// Review fix (codex C1): neighbouring removed constructs on one line
// ---------------------------------------------------------------------------

describe('two removed rules on one line (review fix of row 38)', SLOW, () => {
  const VIEWS = '  view v {\n    include other\n    exclude app.api exclude app.api\n  }\n';

  it.each([
    ['LF', (text: string) => text],
    ['CRLF', (text: string) => text.replace(/\n/g, '\r\n')],
  ])('%s: the line goes, every other byte stays', async (_, eol) => {
    const files: Files = { 'm.c4': eol(`${SPEC}${MODEL}views {\n${VIEWS}}\n`) };
    await expectValidLikeC4(files);
    const { result, after } = remove(files, 'app.api', true);
    expect(result.cascaded).toEqual([
      casc(files, 'm.c4', 'app.api exclude', 'predicate-item'),
      casc(files, 'm.c4', 'app.api', 'predicate-item', 1),
    ]);
    expect(after['m.c4']).toBe(eol(`${SPEC}${MODEL.replace('    api = service\n', '')}views {\n  view v {\n    include other\n  }\n}\n`));
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Review fix (fable F1): a par block left with discarded statements only (D40)
// ---------------------------------------------------------------------------

describe('a cascade that leaves a par block of discarded statements is RRE (review fix of row 38, D40)', () => {
  it('lists the references like any other rejection', async () => {
    // An empty opt block contributes no step; LikeC4 would drop the par block.
    const files: Files = {
      'm.c4': `${SPEC}${MODEL}views {\n  dynamic view d {\n    other -> app.db\n    par {\n      app.api -> other\n      opt {\n      }\n    }\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    expect(expectRRE(files, 'app.api', true).references).toEqual([ref(files, 'm.c4', 'app.api -> other', 'step-endpoint', true, 'd')]);
  });
});
