/**
 * `renameElement` (lc4m-15.30 US-3; FR-004, FR-010, FR-011, D58, D76, D93,
 * D97, D110; rows 78–93 of the test matrix): the declaration and every
 * reference whose target σ changes are rewritten, in the shortest written
 * form that resolves; other references keep their targets; what cannot be
 * rewritten or would collide rejects the rename with nothing changed.
 *
 * Expected values come from the spec and the inputs: σ is a literal per
 * test, expected texts are the inputs with literal replacements, and the
 * targets LikeC4 links are read with its own linker
 * (`linkedCatalogueReferences`) and model builder (`expectSigmaImage`).
 *
 * Abbreviations of the matrix: SIG (`expectSigmaImage` with a literal σ),
 * AWB (the accepted-write bundle), BI (an `InvalidWriteError` on the named
 * field, sources and reads unchanged), OR (`linkedCatalogueReferences`),
 * STAB (every reference LikeC4 resolved before resolves to σ of its target
 * after), P (a precondition asserted first).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  expectAcceptedWrite,
  expectSigmaImage,
  expectValidLikeC4,
  linkedCatalogueReferences,
  type LinkedCatalogueReference,
} from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;

/** The files of a fixture, in byte order of their names. */
function readFixture(name: string): Files {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  return Object.fromEntries(readdirSync(root).sort().map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

/** `text` with each `[from, to]` replaced; every `from` must occur in it, all its occurrences are replaced. */
function replaced(text: string, replacements: ReadonlyArray<readonly [string, string]>): string {
  return replacements.reduce((current, [from, to]) => {
    if (!current.includes(from)) throw new Error(`test input: '${from}' not found`);
    return current.split(from).join(to);
  }, text);
}

/** Every read the mutator offers, for BI. */
function reads(mutator: LikeC4Mutator): string {
  return JSON.stringify([
    mutator.listElements(),
    mutator.getRelationships(),
    mutator.listDeploymentNodes(),
    mutator.listDeploymentInstances(),
    mutator.listDeploymentRelationships(),
    mutator.listViews(),
  ]);
}

/** BI: `write` throws an `InvalidWriteError` on `field`; the sources and the reads are unchanged. */
function expectRejected(mutator: LikeC4Mutator, write: () => unknown, field: string): InvalidWriteError {
  const sources = mutator.serialize();
  const before = reads(mutator);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(mutator.serialize()).toEqual(sources);
  expect(reads(mutator)).toBe(before);
  return error as InvalidWriteError;
}

/** The ids of a target as σ maps them. */
function mapTarget(target: LinkedCatalogueReference['target'], sigma: Record<string, string>): LinkedCatalogueReference['target'] {
  if (target === null || 'view' in target) return target;
  const s = (id: string): string => sigma[id] ?? id;
  if ('model' in target) return { model: s(target.model) };
  return 'element' in target ? { deployment: s(target.deployment), element: s(target.element) } : { deployment: s(target.deployment) };
}

/** STAB: the targets LikeC4 links after the write are σ of those before, reference for reference (a multiset of resolved targets). */
async function expectStable(before: Files, after: Files, sigma: Record<string, string>): Promise<void> {
  const targets = (references: LinkedCatalogueReference[]): string[] =>
    references.filter((r) => r.target !== null).map((r) => JSON.stringify(r.target)).sort();
  const was = (await linkedCatalogueReferences(before)).filter((r) => r.target !== null).map((r) => ({ ...r, target: mapTarget(r.target, sigma) }));
  expect(was.length).toBeGreaterThan(0);
  expect(targets(await linkedCatalogueReferences(after))).toEqual(targets(was));
}

/** The target LikeC4 links the reference written as `text` on the line holding `marker` in `file` to. */
async function linkedAt(files: Files, file: string, marker: string, text: string): Promise<LinkedCatalogueReference['target']> {
  const line = files[file]!.split('\n').findIndex((l) => l.includes(marker)) + 1;
  expect(line, marker).toBeGreaterThan(0);
  const found = (await linkedCatalogueReferences(files)).filter((r) => r.file === file && r.line === line && r.text === text);
  expect(found.length, `${file}:${line} ${text}`).toBe(1);
  return found[0]!.target;
}

// ---------------------------------------------------------------------------

const SPEC = `specification {
  element system
  element service
  deploymentNode vm
}
`;

/** Every FR-001 reference kind that a rename rewrites, into `app.api` and below it, across two files. */
const KINDS: Files = {
  'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
      handler -> db 'loads'
      -> web 'notifies'
    }
    db = service 'DB'
    web = service 'Web'
    web -> api 'calls'
  }
  other = system 'Other'
  other -> app.api 'uses'
  app.api -> app.db 'stores'
}
deployment {
  vm prod {
    gw = instanceOf app.api
    instanceOf app.db
    gw -> db 'writes'
  }
  vm edge {
    instanceOf app.web
  }
  prod.gw.handler -> prod.db 'queries'
  edge.web -> prod.gw 'routes'
}
`,
  'b.c4': `model {
  extend app.api {
    worker = service 'Worker'
    worker -> handler 'feeds'
  }
  extend app.api -> app.db 'stores' {
    link https://example.com/stores
  }
  app.api.worker -> other 'reports'
}
views {
  style app.api, other {
    color amber
  }
  view index {
    include *
    include app.api, app.api.*
    group 'Inner' {
      include app.api.handler
    }
    style app.api {
      color green
    }
    rank same {
      app.api, app.db
    }
  }
  view apiView of app.api {
    include *, handler
  }
  dynamic view flow {
    include app.api
    other -> app.api 'asks'
    app.web -> app.api -> app.db
    par {
      app.api -> app.db
    }
  }
  deployment view deployed {
    include prod.**
    include prod.gw
  }
}
`,
};
const KINDS_SIGMA = { 'app.api': 'app.gateway', 'app.api.handler': 'app.gateway.handler', 'app.api.worker': 'app.gateway.worker' };

describe('σ-equality over every reference kind (row 78)', () => {
  it('renames app.api referenced through every rewritable FR-001 kind in two files', SLOW, async () => {
    // P: valid input with every rewritable role into the subtree, in both files.
    await expectValidLikeC4(KINDS);
    const into = (await linkedCatalogueReferences(KINDS)).filter((r) => {
      const t = r.target;
      return t !== null && !('view' in t) && ('model' in t ? t.model : (t.element ?? '')).startsWith('app.api');
    });
    const roles = new Set(into.map((r) => r.role));
    for (const role of [
      'relationship-endpoint',
      'extend-element-target',
      'extend-relationship-endpoint',
      'deployment-relationship-endpoint',
      'instance-of',
      'view-of',
      'predicate-item',
      'step-endpoint',
      'style-target',
      'rank-target',
    ]) {
      expect(roles.has(role as LinkedCatalogueReference['role']), role).toBe(true);
    }
    expect(new Set(into.map((r) => r.file))).toEqual(new Set(['a.c4', 'b.c4']));

    const mutator = LikeC4Mutator.fromFiles(KINDS);
    expect(mutator.renameElement('app.api', 'gateway')).toEqual({ fqn: 'app.gateway', changedFiles: ['a.c4', 'b.c4'] });
    const after = mutator.serialize();
    await expectSigmaImage(KINDS, after, KINDS_SIGMA);
    await expectAcceptedWrite(KINDS, after);
  });
});

describe('the written form (row 79)', () => {
  it('keeps resolving texts, replaces the renamed segment with its suffix, and rewrites chain segments in place', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(KINDS);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    // `handler`, `worker` and `include *, handler` still resolve where they are written: byte-equal.
    expect(after['a.c4']).toBe(
      replaced(KINDS['a.c4']!, [
        ["    api = service 'API' {", "    gateway = service 'API' {"],
        ["web -> api 'calls'", "web -> gateway 'calls'"],
        ['app.api', 'app.gateway'],
      ]),
    );
    expect(after['b.c4']).toBe(replaced(KINDS['b.c4']!, [['app.api', 'app.gateway']]));
    // The selector suffix and the chain are kept around the replaced segment.
    expect(after['b.c4']).toContain('include app.gateway, app.gateway.*\n');
    expect(after['b.c4']).toContain('app.web -> app.gateway -> app.db\n');
    expect(after['b.c4']).toContain('include *, handler\n');
    await expectAcceptedWrite(KINDS, after);
  });
});

/**
 * Row 80 and row 91 (RES-T3, reachable in LikeC4 1.59.4): a reference `b`
 * to `a.b` in the body of `a.y`.  Renamed to `foo`, `b` links to `z.b` and
 * `foo` to `a.y.foo`; `a.foo` links to the renamed element, unless `a.y`
 * has a child `a` (row 91), which `a.foo` then starts from.
 */
const ORDER = (extra: string): Files => ({
  'm.c4': `${SPEC}model {
  a = system 'A' {
    b = service 'B'
    y = system 'Y' {
${extra}      foo = service 'Foo'
      -> b 'needs'
    }
    w = system 'W' {
      -> b 'uses'
    }
  }
  z = system 'Z' {
    b = service 'ZB'
  }
}
`,
});

describe('FR-011 order (row 80)', () => {
  it('(a) writes the full FQN where the kept text and the replaced segment link elsewhere', SLOW, async () => {
    const before = ORDER('');
    await expectValidLikeC4(before);
    expect(await linkedAt(before, 'm.c4', "-> b 'needs'", 'b')).toEqual({ model: 'a.b' });
    // P: written by hand after the rename, the earlier choices link elsewhere and the full FQN links to σ(a.b).
    const renamed = (text: string): Files => ({
      'm.c4': replaced(before['m.c4']!, [
        ["    b = service 'B'", "    foo = service 'B'"],
        ["-> b 'needs'", `-> ${text} 'needs'`],
        ["-> b 'uses'", "-> foo 'uses'"],
      ]),
    });
    expect(await linkedAt(renamed('b'), 'm.c4', "'needs'", 'b')).toEqual({ model: 'z.b' });
    expect(await linkedAt(renamed('foo'), 'm.c4', "'needs'", 'foo')).toEqual({ model: 'a.y.foo' });
    expect(await linkedAt(renamed('a.foo'), 'm.c4', "'needs'", 'a.foo')).toEqual({ model: 'a.foo' });

    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('a.b', 'foo');
    const after = mutator.serialize();
    expect(after).toEqual(renamed('a.foo'));
    await expectSigmaImage(before, after, { 'a.b': 'a.foo' });
    await expectAcceptedWrite(before, after);
  });

  it('(b) writes the replaced segment, not the full FQN, where that suffices', SLOW, async () => {
    const before = ORDER('');
    // P: in `a.w`, the replaced segment `foo` links to the renamed element.
    const handWritten = {
      'm.c4': replaced(before['m.c4']!, [
        ["    b = service 'B'", "    foo = service 'B'"],
        ["-> b 'needs'", "-> a.foo 'needs'"],
        ["-> b 'uses'", "-> foo 'uses'"],
      ]),
    };
    expect(await linkedAt(handWritten, 'm.c4', "'uses'", 'foo')).toEqual({ model: 'a.foo' });

    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('a.b', 'foo');
    const after = mutator.serialize();
    expect(after['m.c4']).toContain("      -> foo 'uses'\n");
    expect(after).toEqual(handWritten);
    await expectSigmaImage(before, after, { 'a.b': 'a.foo' });
    await expectAcceptedWrite(before, after);
  });
});

describe('two rewritten texts on one prefix (row 81)', () => {
  it('pairs `b` and `a.b`, both written as `a.foo` in one body', SLOW, async () => {
    const before = {
      'm.c4': replaced(ORDER('')['m.c4']!, [["      -> b 'needs'\n", "      -> b 'needs'\n      -> a.b 'wants'\n"]]),
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('a.b', 'foo');
    const after = mutator.serialize();
    expect(after['m.c4']).toContain("      -> a.foo 'needs'\n      -> a.foo 'wants'\n");
    await expectSigmaImage(before, after, { 'a.b': 'a.foo' });
  });
});

describe('titles derived from the name (row 82)', () => {
  const FILES: Files = {
    'm.c4': `specification {
  element system
  element service
  element tool {
    title 'Tool'
  }
}
model {
  app = system 'App' {
    api = service
    util = tool
    api -> util 'uses'
  }
}
`,
  };

  it.each([
    ['a title-less element shows the new name', 'app.api', 'gateway', { 'app.api': 'app.gateway' }, 'gateway'],
    ['an element with a kind title keeps it', 'app.util', 'helper', { 'app.util': 'app.helper' }, 'Tool'],
  ] as const)('%s', SLOW, async (_, fqn, newName, sigma, title) => {
    await expectValidLikeC4(FILES);
    const mutator = LikeC4Mutator.fromFiles(FILES);
    mutator.renameElement(fqn, newName);
    expect(mutator.getElement(sigma[fqn as keyof typeof sigma]!)?.title).toBe(title);
    await expectSigmaImage(FILES, mutator.serialize(), sigma);
  });
});

describe('a title equal to the old name (row 82)', () => {
  it('keeps a kind title that equals the renamed element’s old name', SLOW, async () => {
    const before: Files = {
      'm.c4': `specification {
  element system
  element tool {
    title 'util'
  }
}
model {
  app = system 'App' {
    util = tool
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('app.util', 'helper');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(before['m.c4']!, [['    util = tool\n', '    helper = tool\n']]));
    expect(mutator.getElement('app.helper')?.title).toBe('util');
    await expectSigmaImage(before, after, { 'app.util': 'app.helper' });
    await expectAcceptedWrite(before, after);
  });
});

describe('the same text in two views (row 81)', () => {
  it('rewrites the reference of the view whose target is renamed and keeps the other view byte-equal', SLOW, async () => {
    const MODEL = `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  other = system 'Other' {
    api = service 'Other API'
  }
}
`;
    const before: Files = { 'm.c4': `${MODEL}views {\n  view a of app {\n    include api\n  }\n  view b of other {\n    include api\n  }\n}\n` };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(before['m.c4']!, [
        ["    api = service 'API'\n", "    gateway = service 'API'\n"],
        ['  view a of app {\n    include api\n', '  view a of app {\n    include gateway\n'],
      ]),
    );
    await expectSigmaImage(before, after, { 'app.api': 'app.gateway' });
    await expectAcceptedWrite(before, after);
  });
});

describe('an instance named after the element (row 83)', () => {
  const FILES: Files = {
    'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
    }
    web = service 'Web'
  }
}
deployment {
  vm prod {
    instanceOf app.api
  }
  vm edge {
    instanceOf app.web
  }
  edge.web -> prod.api 'routes'
  edge.web -> prod.api.handler 'reaches'
}
`,
    'b.c4': `views {
  deployment view deployed {
    include prod.api
    include edge.web -> prod.api
  }
}
`,
  };

  it('renames the instance id, its deployment-view references and the relationships to it and through it', SLOW, async () => {
    await expectValidLikeC4(FILES);
    expect(await linkedAt(FILES, 'a.c4', "'reaches'", 'prod.api.handler')).toEqual({ deployment: 'prod.api', element: 'app.api.handler' });
    const mutator = LikeC4Mutator.fromFiles(FILES);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(mutator.getDeploymentInstance('prod.gateway')).not.toBeNull();
    expect(after['b.c4']).toBe(replaced(FILES['b.c4']!, [['prod.api', 'prod.gateway']]));
    await expectSigmaImage(FILES, after, {
      'app.api': 'app.gateway',
      'app.api.handler': 'app.gateway.handler',
      'prod.api': 'prod.gateway',
    });
    await expectAcceptedWrite(FILES, after);
  });
});

describe('extend blocks and the kind-first form (row 84)', () => {
  it('rewrites extend targets in another file and keeps the kind token of `service api`', SLOW, async () => {
    const before: Files = {
      'a.c4': `${SPEC}model {
  app = system 'App' {
    service api 'API'
  }
}
`,
      'b.c4': `model {
  extend app.api {
    link https://example.com/api
  }
}
`,
      'c.c4': `model {
  extend app.api {
    worker = service 'Worker'
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(after).toEqual({
      'a.c4': replaced(before['a.c4']!, [["    service api 'API'", "    service gateway 'API'"]]),
      'b.c4': replaced(before['b.c4']!, [['extend app.api', 'extend app.gateway']]),
      'c.c4': replaced(before['c.c4']!, [['extend app.api', 'extend app.gateway']]),
    });
    await expectSigmaImage(before, after, { 'app.api': 'app.gateway', 'app.api.worker': 'app.gateway.worker' });
    await expectAcceptedWrite(before, after);
  });
});

describe('references that did not resolve (row 85)', () => {
  it('leaves a reference with the old name that was ambiguous before byte-equal (D93)', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  other = system 'Other' {
    api = service 'Other API'
  }
  client = system 'Client'
  client -> api 'calls'
}
`,
    };
    // P: LikeC4 leaves `api` unresolved (ambiguous).
    expect(await linkedAt(before, 'm.c4', "'calls'", 'api')).toBeNull();
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('app.api', 'gateway');
    expect(mutator.serialize()['m.c4']).toBe(replaced(before['m.c4']!, [["    api = service 'API'", "    gateway = service 'API'"]]));
  });
});

describe('rename rejections (row 86)', () => {
  const FILES: Files = { 'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n    db = service 'DB'\n  }\n}\n` };
  it.each([
    ['an invalid newName', 'app.api', '9api', 'newName'],
    ['a dotted newName', 'app.api', 'x.y', 'newName'],
    ['a reserved newName', 'app.api', 'this', 'newName'],
    ['a sibling of that name', 'app.api', 'db', 'newName'],
    ['an unknown fqn', 'app.nope', 'gateway', 'fqn'],
  ] as const)('rejects %s', (_, fqn, newName, field) => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expectRejected(mutator, () => mutator.renameElement(fqn, newName), field);
  });
});

describe('instance-id collisions (row 87)', () => {
  const SPIKE_SPEC = `specification { element e\ndeploymentNode node }\n`;
  it.each([
    [
      'a sibling node',
      { 'a.c4': `${SPIKE_SPEC}model { app = e 'App' { old = e 'S' } }\ndeployment { node prod { node svc\ninstanceOf app.old } }` },
    ],
    [
      'a named instance',
      { 'a.c4': `${SPIKE_SPEC}model { app = e 'App' { old = e 'S'\nx = e 'X' } }\ndeployment { node prod { svc = instanceOf app.x\ninstanceOf app.old } }` },
    ],
    [
      'an instance named after another element',
      { 'a.c4': `${SPIKE_SPEC}model { a = e 'A' { svc = e 'S1' }\napp = e 'B' { old = e 'S2' } }\ndeployment { node prod { instanceOf a.svc\ninstanceOf app.old } }` },
    ],
    [
      'an instance declared in an extend block of the node in another file',
      {
        'a.c4': `${SPIKE_SPEC}model { app = e 'App' { old = e 'S'\nx = e 'X' } }\ndeployment { node prod { instanceOf app.old } }`,
        'b.c4': `deployment { extend prod { svc = instanceOf app.x } }`,
      },
    ],
  ] as const)('rejects a rename that gives an unnamed instance the id of %s', async (_, files) => {
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.renameElement('app.old', 'svc'), 'newName');
  });
});

/** `other.foo` and a dynamic view whose opaque block is `body`. */
const OPAQUE = (body: string): Files => ({
  'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
    apiGateway = service 'Gateway'
  }
  other = system 'Other' {
    foo = service 'Foo'
  }
}
views {
  dynamic view d {
    app.api -> other
    opt {
      ${body}
    }
  }
}
`,
});

describe('the new name at unmodelled places (rows 88, 89)', () => {
  it('rejects renaming other.foo to api while `opt { api -> other }` exists (row 88)', async () => {
    const files = OPAQUE('api -> other');
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.renameElement('other.foo', 'api'), 'newName');
  });

  it.each([
    ['a later dotted segment', 'app.api -> other'],
    ['part of a longer identifier', 'apiGateway -> other'],
  ])('accepts the new name as %s in an opaque block (row 89)', SLOW, async (_, body) => {
    const files = OPAQUE(body);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('other.foo', 'api');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["    foo = service 'Foo'", "    api = service 'Foo'"]]));
    await expectAcceptedWrite(files, after);
  });
});

describe('the old name at unmodelled places (row 90)', () => {
  /** `app.api`, with `other.api` beside it when the old name is written as a later segment; `place` holds `text`. */
  const FILES = (place: 'opaque' | 'global', text: string, otherApi: boolean): Files => ({
    'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  other = system 'Other' {
${otherApi ? "    api = service 'Other API'\n" : ''}  }
  ext = system 'Ext'
}
${place === 'global' ? `global {\n  predicateGroup g {\n    include ${text}\n  }\n}\n` : ''}views {
  dynamic view d {
    app.api -> other
${place === 'opaque' ? `    opt {\n      ${text} -> ext\n    }\n` : ''}  }
}
`,
  });
  it.each([
    ['a whole identifier in an opaque block', FILES('opaque', 'api', false)],
    ['a later dotted segment in an opaque block', FILES('opaque', 'other.api', true)],
    ['a whole identifier in a global predicate', FILES('global', 'api', false)],
    ['a later dotted segment in a global predicate', FILES('global', 'other.api', true)],
  ] as const)('rejects renaming app.api while the old name is %s', async (_, files) => {
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.renameElement('app.api', 'gateway'), 'fqn');
  });
});

describe('a reference with no rewritable text (row 91)', () => {
  it('rejects the rename when the kept text, the replaced segment and the full FQN all link elsewhere', async () => {
    const before = ORDER("      a = service 'Inner A'\n");
    await expectValidLikeC4(before);
    expect(await linkedAt(before, 'm.c4', "-> b 'needs'", 'b')).toEqual({ model: 'a.b' });
    // P: written by hand after the rename, none of the three texts links to σ(a.b) = a.foo.
    const renamed = (text: string): Files => ({
      'm.c4': replaced(before['m.c4']!, [
        ["    b = service 'B'", "    foo = service 'B'"],
        ["-> b 'needs'", `-> ${text} 'needs'`],
        ["-> b 'uses'", "-> foo 'uses'"],
      ]),
    });
    expect(await linkedAt(renamed('b'), 'm.c4', "'needs'", 'b')).toEqual({ model: 'z.b' });
    expect(await linkedAt(renamed('foo'), 'm.c4', "'needs'", 'foo')).toEqual({ model: 'a.y.foo' });
    expect(await linkedAt(renamed('a.foo'), 'm.c4', "'needs'", 'a.foo')).toBeNull();

    const mutator = LikeC4Mutator.fromFiles(before);
    expectRejected(mutator, () => mutator.renameElement('a.b', 'foo'), 'newName');
  });
});

describe('line endings (row 92)', () => {
  it('keeps CRLF in the CRLF file of FX and changes nothing but the rewritten tokens', SLOW, async () => {
    const before = readFixture('refs-catalog');
    // P: extensions.c4 is the CRLF file and references the renamed subtree.
    expect(before['extensions.c4']).toContain('\r\n');
    expect(before['extensions.c4']!.replace(/\r\n/g, '')).not.toContain('\n');
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.renameElement('shop.api', 'gateway');
    const after = mutator.serialize();
    expect(after['extensions.c4']).toBe(replaced(before['extensions.c4']!, [['instanceOf shop.api.', 'instanceOf shop.gateway.']]));
    await expectAcceptedWrite(before, after);
  });
});

describe('continuation after a rejected write (row 93)', () => {
  it('renames on the restored state after the lc4m-17 repro was rejected', SLOW, async () => {
    const fixture = readFixture('refs-catalog');
    // A bare step endpoint resolves through the scope of its document's model blocks.
    const before: Files = { ...fixture, 'model9.c4': `${fixture['model9.c4']}\nviews {\n  dynamic view flow {\n    handler -> customer\n  }\n}\n` };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    // Warm the reads, so that the indices and the catalogue of this generation exist.
    const warm = reads(mutator);
    expect(mutator.getElement('shop.api.handler')).not.toBeNull();
    // The lc4m-17 repro: a second `handler` makes the step endpoint `handler` ambiguous.
    expectRejected(mutator, () => mutator.addElement('customer', { name: 'handler', kind: 'service' }), 'name');
    expect(reads(mutator)).toBe(warm);

    const sigma = { 'shop.api': 'shop.gateway', 'shop.api.handler': 'shop.gateway.handler', 'shop.api.worker': 'shop.gateway.worker' };
    mutator.renameElement('shop.api', 'gateway');
    const after = mutator.serialize();
    expect(after).toEqual({
      ...before,
      'deployment.c4': replaced(before['deployment.c4']!, [['instanceOf shop.api {', 'instanceOf shop.gateway {']]),
      'extensions.c4': replaced(before['extensions.c4']!, [['instanceOf shop.api.', 'instanceOf shop.gateway.']]),
      'model10.c4': replaced(before['model10.c4']!, [['shop.api', 'shop.gateway']]),
      'model9.c4': replaced(before['model9.c4']!, [
        ["    api = service 'API' {", "    gateway = service 'API' {"],
        ["web -> api 'calls'", "web -> gateway 'calls'"],
        ["web -[sync]<-> api 'syncs'", "web -[sync]<-> gateway 'syncs'"],
        ['shop.api', 'shop.gateway'],
      ]),
      'views.c4': replaced(before['views.c4']!, [
        ['shop.api', 'shop.gateway'],
        ['    include api.handler', '    include gateway.handler'],
      ]),
    });
    await expectSigmaImage(before, after, sigma);
    await expectStable(before, after, sigma);
    await expectAcceptedWrite(before, after);
  });
});

describe('a top-level element (rows 78, 86)', () => {
  const FILES: Files = {
    'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n  }\n  ext = system 'Ext'\n  ext -> app.api 'calls'\n  other = system 'Other'\n}\nviews {\n  view v of app {\n    include *\n  }\n}\n`,
  };

  it('renames a top-level element and its references', SLOW, async () => {
    await expectValidLikeC4(FILES);
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expect(mutator.renameElement('app', 'shop')).toEqual({ fqn: 'shop', changedFiles: ['m.c4'] });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(FILES['m.c4']!, [["  app = system 'App'", "  shop = system 'App'"], ['ext -> app.api', 'ext -> shop.api'], ['view v of app', 'view v of shop']]));
    expect(mutator.getElement('shop.api')).not.toBeNull();
    await expectSigmaImage(FILES, after, { app: 'shop', 'app.api': 'shop.api' });
    await expectAcceptedWrite(FILES, after);
  });

  it('rejects the name of another top-level element', () => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expectRejected(mutator, () => mutator.renameElement('app', 'other'), 'newName');
  });
});

describe('the new name at unmodelled places, unresolved there (row 88)', () => {
  it('rejects renaming other.foo to a name an opaque step writes and that resolves nowhere', () => {
    const mutator = LikeC4Mutator.fromFiles(OPAQUE('ghost -> other'));
    expectRejected(mutator, () => mutator.renameElement('other.foo', 'ghost'), 'newName');
  });
});

describe('a new name that re-targets an unchanged short reference (row 91)', () => {
  it('rejects renaming app.foo to bar while `bar` names other.bar alone', async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    foo = service 'Foo'\n  }\n  other = system 'Other' {\n    bar = service 'Bar'\n  }\n  client = system 'Client'\n  client -> bar 'uses'\n}\n`,
    };
    // P: LikeC4 links `bar` to the only element of that name.
    expect(await linkedAt(files, 'm.c4', "'uses'", 'bar')).toEqual({ model: 'other.bar' });
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.renameElement('app.foo', 'bar'), 'newName');
    expect(mutator.serialize()).toEqual(files);
  });
});

describe('deployment references and unresolved ones (rows 83, 85)', () => {
  it('keeps an instanceOf that did not resolve byte-equal', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n  }\n}\ndeployment {\n  vm p {\n    instanceOf app.ghost\n  }\n}\n`,
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api', 'gateway');
    expect(mutator.serialize()['m.c4']).toBe(replaced(files['m.c4']!, [["    api = service 'API'", "    gateway = service 'API'"]]));
  });

  it('renames an unnamed instance whose body holds a relationship', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n    db = service 'DB'\n  }\n}\ndeployment {\n  vm prod {\n    instanceOf app.api {\n      -> prod.db 'queries'\n    }\n    instanceOf app.db\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["    api = service 'API'", "    gateway = service 'API'"], ['instanceOf app.api {', 'instanceOf app.gateway {']]));
    expect(mutator.getDeploymentInstance('prod.gateway')).not.toBeNull();
    await expectSigmaImage(files, after, { 'app.api': 'app.gateway', 'prod.api': 'prod.gateway' });
    await expectAcceptedWrite(files, after);
  });

  it('rewrites a relative instance reference inside its node to the new short name', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n    db = service 'DB'\n  }\n}\ndeployment {\n  vm prod {\n    instanceOf app.api\n    instanceOf app.db\n    api -> db 'reads'\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(files['m.c4']!, [["    api = service 'API'", "    gateway = service 'API'"], ['instanceOf app.api\n', 'instanceOf app.gateway\n'], ["api -> db 'reads'", "gateway -> db 'reads'"]]),
    );
    await expectSigmaImage(files, after, { 'app.api': 'app.gateway', 'prod.api': 'prod.gateway' });
    await expectAcceptedWrite(files, after);
  });

  it('rewrites the element segment of a relative path through a named instance', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API' {\n      handler = service 'Handler'\n    }\n    db = service 'DB'\n  }\n}\ndeployment {\n  vm prod {\n    gw = instanceOf app.api\n    instanceOf app.db\n    gw.handler -> db 'queries'\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api.handler', 'worker');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["      handler = service 'Handler'", "      worker = service 'Handler'"], ['gw.handler -> db', 'gw.worker -> db']]));
    await expectSigmaImage(files, after, { 'app.api.handler': 'app.api.worker' });
    await expectAcceptedWrite(files, after);
  });
});

describe('written forms in views and in one file in any order (rows 79, 80)', () => {
  it('rewrites the later segment of a relative chain in a scoped view', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API' {\n      handler = service 'Handler'\n    }\n  }\n}\nviews {\n  view v of app {\n    include api.handler\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api.handler', 'worker');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["      handler = service 'Handler'", "      worker = service 'Handler'"], ['include api.handler', 'include api.worker']]));
    await expectSigmaImage(files, after, { 'app.api.handler': 'app.api.worker' });
    await expectAcceptedWrite(files, after);
  });

  it('rewrites a view, a relationship, the declaration and an extend block written in that order', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}views {\n  view v of app.api {\n    include *\n  }\n}\nmodel {\n  ext = system 'Ext'\n  ext -> app.api 'calls'\n  app = system 'App' {\n    api = service 'API'\n  }\n  extend app.api {\n    link https://example.com/api\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.api', 'gateway');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(files['m.c4']!, [
        ['view v of app.api', 'view v of app.gateway'],
        ['ext -> app.api', 'ext -> app.gateway'],
        ["    api = service 'API'", "    gateway = service 'API'"],
        ['extend app.api', 'extend app.gateway'],
      ]),
    );
    await expectSigmaImage(files, after, { 'app.api': 'app.gateway' });
    await expectAcceptedWrite(files, after);
  });
});

describe('short forms in nested scopes (row 79)', () => {
  it('keeps the short form of a name unique in its model block, though repeated in another block of the file', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  a = system 'A' {\n    x = service 'X' {\n      leaf = service 'Leaf'\n    }\n    y = service 'Y'\n    y -> leaf 'uses'\n  }\n}\nmodel {\n  b = system 'B' {\n    leaf = service 'Other leaf'\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    // P: LikeC4 links the short name to the element of its own block.
    expect(await linkedAt(files, 'm.c4', "'uses'", 'leaf')).toEqual({ model: 'a.x.leaf' });
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('a.x.leaf', 'sheet');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["      leaf = service 'Leaf'", "      sheet = service 'Leaf'"], ["y -> leaf 'uses'", "y -> sheet 'uses'"]]));
    await expectSigmaImage(files, after, { 'a.x.leaf': 'a.x.sheet' });
    await expectAcceptedWrite(files, after);
  });

  it('keeps the short form of a name unique in an extend body, though repeated below its target', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    p = service 'P' {\n      node = service 'N1'\n    }\n    q = service 'Q' {\n      node = service 'N2'\n    }\n  }\n  extend app.p {\n    w = service 'W'\n    w -> node 'uses'\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    // P: LikeC4 links the short name in the extend body to the descendant of its target.
    expect(await linkedAt(files, 'm.c4', "'uses'", 'node')).toEqual({ model: 'app.p.node' });
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.p.node', 'knot');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["      node = service 'N1'", "      knot = service 'N1'"], ["w -> node 'uses'", "w -> knot 'uses'"]]));
    await expectSigmaImage(files, after, { 'app.p.node': 'app.p.knot' });
    await expectAcceptedWrite(files, after);
  });

  it('keeps the short form of a name declared below an element of an extend body', SLOW, async () => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App'\n  extend app {\n    child = service 'C' {\n      leaf = service 'L'\n      peer = service 'P'\n      peer -> leaf 'reads'\n    }\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    expect(await linkedAt(files, 'm.c4', "'reads'", 'leaf')).toEqual({ model: 'app.child.leaf' });
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.renameElement('app.child.leaf', 'sheet');
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(files['m.c4']!, [["      leaf = service 'L'", "      sheet = service 'L'"], ["peer -> leaf 'reads'", "peer -> sheet 'reads'"]]));
    await expectSigmaImage(files, after, { 'app.child.leaf': 'app.child.sheet' });
    await expectAcceptedWrite(files, after);
  });
});

describe('a reference into the subtree without the renamed segment (row 90)', () => {
  it.each([
    ['a global predicate', "global {\n  predicateGroup g {\n    include handler\n  }\n}\n", '', 'global-or-import'],
    ['an opaque block', '', '    opt {\n      handler -> ext\n    }\n', 'opaque-flow'],
  ] as const)('rejects the rename while %s names an element below it by its own name', async (_, global, opaque, role) => {
    const files: Files = {
      'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API' {\n      handler = service 'Handler'\n    }\n  }\n  ext = system 'Ext'\n}\n${global}views {\n  dynamic view d {\n    ext -> app\n${opaque}  }\n}\n`,
    };
    await expectValidLikeC4(files);
    // P: LikeC4 links `handler` there into the renamed subtree.
    expect((await linkedCatalogueReferences(files)).filter((r) => r.text === 'handler').map((r) => [r.role, r.target])).toEqual([[role, { model: 'app.api.handler' }]]);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.renameElement('app.api', 'gateway'), 'fqn');
  });
});

describe('an edit the file would not parse after (row 86)', () => {
  it('refuses the rename on newName', () => {
    const files: Files = { 'm.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n  }\n}\n}\n` };
    const mutator = LikeC4Mutator.fromFiles(files);
    // P: the loaded file does not parse.
    expect(mutator.validate().length).toBeGreaterThan(0);
    expectRejected(mutator, () => mutator.renameElement('app.api', 'gateway'), 'newName');
  });
});
