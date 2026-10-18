/**
 * Additions keep references stable (lc4m-15.30, US-4, INV-3, FR-004):
 * `addElement`, `addView`, `addDeploymentNode` and `addDeploymentInstance`
 * are rejected when they would re-target a reference of any FR-001 kind, or
 * when a construct the library does not resolve names the new name as a
 * bare identifier or the leading segment of a dotted name (new mode, D101,
 * D107); additions that do neither are accepted.  Rows 8 and 10–20.
 *
 * Expected values come from LikeC4: the targets its linker binds
 * (`linkedCatalogueReferences`) before the write and in the text the write
 * would produce, its parse tree for unrecovered tokens, and the
 * accepted-write bundle for acceptances.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { CstUtils } from 'langium';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  expectAcceptedWrite,
  expectValidLikeC4,
  linkedCatalogueReferences,
  validateLikeC4,
  type LinkedCatalogueReference,
} from '../helpers/likec4-model.js';

const SPEC = 'specification {\n  element service\n  deploymentNode vm\n}\n';

/** The files of a fixture, keyed by `/`-separated path. */
function readFixture(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const paths: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else paths.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  expect(paths.length, name).toBeGreaterThan(0);
  return Object.fromEntries(paths.sort().map((path) => [path, readFileSync(join(root, ...path.split('/')), 'utf8')]));
}

/** Run `write` and expect BI: an `InvalidWriteError` on `field`, with the sources and the reads unchanged. */
function expectRejected(m: LikeC4Mutator, field: string, write: (m: LikeC4Mutator) => unknown): void {
  const before = { files: m.serialize(), elements: m.listElements(), views: m.listViews() };
  let error: unknown;
  try {
    write(m);
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before.files);
  expect(m.listElements()).toEqual(before.elements);
  expect(m.listViews()).toEqual(before.views);
}

/** The one oracle reference of `role` and `text` in `files`. */
async function linked(files: Record<string, string>, role: string, text: string, options: { projects?: readonly string[] } = {}): Promise<LinkedCatalogueReference> {
  const found = (await linkedCatalogueReferences(files, options)).filter((r) => r.role === role && r.text === text);
  expect(found, `${role} ${text}`).toHaveLength(1);
  return found[0]!;
}

/**
 * STAB for an addition (σ is the identity): every reference that resolved
 * before the write is found after it in the same file, with the same role,
 * text and target.
 */
async function expectStable(before: Record<string, string>, after: Record<string, string>): Promise<void> {
  const key = (r: LinkedCatalogueReference): string => JSON.stringify([r.file, r.role, r.text, r.target]);
  const was = (await linkedCatalogueReferences(before)).filter((r) => r.target !== null);
  expect(was.length).toBeGreaterThan(0);
  const pool = new Map<string, number>();
  for (const r of await linkedCatalogueReferences(after)) pool.set(key(r), (pool.get(key(r)) ?? 0) + 1);
  const lost: string[] = [];
  for (const r of was) {
    const left = pool.get(key(r)) ?? 0;
    if (left === 0) lost.push(`${r.file}:${r.line} ${r.role} ${r.text}`);
    else pool.set(key(r), left - 1);
  }
  expect(lost, 'references whose target the addition changed').toEqual([]);
}

/** LikeC4's own view of `source`: its parse errors, and whether a token at `offset` lies in no CST leaf. */
function likec4Parse(source: string): { parserErrors: number; uncovered: (image: string) => boolean; inError: (image: string) => boolean } {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
  const parsed = services.parser.LangiumParser.parse(source);
  const leaves = [...CstUtils.streamCst(parsed.value.$cstNode!)].filter((node) => !('content' in node));
  const tokens = services.parser.Lexer.tokenize(source).tokens;
  const token = (image: string) => {
    const found = tokens.find((t) => t.image === image);
    expect(found, image).toBeDefined();
    return found!;
  };
  return {
    parserErrors: parsed.parserErrors.length,
    uncovered: (image) => !leaves.some((leaf) => leaf.offset <= token(image).startOffset && token(image).startOffset < leaf.end),
    /** Whether the token lies in the range of a token a parser error is reported at. */
    inError: (image) =>
      parsed.parserErrors.some((e) => e.token.startOffset <= token(image).startOffset && token(image).startOffset <= (e.token.endOffset ?? e.token.startOffset)),
  };
}

describe('the lc4m-17 repro (row 8)', () => {
  const MODEL = `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
}
`;
  const STEPS = {
    'a top-level step': '    api -> other\n',
    'a step in opt': '    opt {\n      api -> other\n    }\n',
    'a step in an alt branch': "    alt {\n      if 'ok' {\n        api -> other\n      }\n    }\n",
  };
  const cases = Object.entries(STEPS).flatMap(([where, step]) => [
    [`${where}, with include api`, where, `${MODEL}views {\n  view index {\n    include api\n  }\n  dynamic view d {\n${step}  }\n}\n`],
    [`${where}, the step alone`, where, `${MODEL}views {\n  view index {\n    include other\n  }\n  dynamic view d {\n${step}  }\n}\n`],
  ]);

  it.each(cases)('rejects addElement(other, api) with %s', async (_, where, source) => {
    const files = { 'm.c4': source };
    // P: valid input whose step endpoint `api` LikeC4 links to `app.api`.
    await expectValidLikeC4(files);
    const role = where === 'a top-level step' ? 'step-endpoint' : 'opaque-flow';
    expect((await linkedCatalogueReferences(files)).filter((r) => r.role === role && r.text === 'api').map((r) => r.target)).toEqual([
      { model: 'app.api' },
    ]);
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement('other', { name: 'api', kind: 'service' }));
  });
});

describe('newly covered reference kinds (row 10)', () => {
  const MODEL = `${SPEC}model {
  app = service {
    inner = service {
      api = service
    }
  }
  other = service
}
`;
  const ADDED = '    api = service\n';
  const KINDS: Array<[string, string, string]> = [
    ['rule item', 'predicate-item', '  view v {\n    include api\n  }\n'],
    ['step', 'step-endpoint', '  dynamic view d {\n    api -> other\n  }\n'],
    ['dynamic include', 'predicate-item', '  dynamic view d {\n    include api\n  }\n'],
    ['element with navigateTo', 'predicate-item', '  view v {\n    include api with {\n      navigateTo w\n    }\n  }\n  view w {\n    include *\n  }\n'],
    ['of scope of an extends view', 'predicate-item', '  view base of app {\n    include *\n  }\n  view child extends base {\n    include api\n  }\n'],
    ['style target', 'style-target', '  view v {\n    include *\n    style api {\n      color red\n    }\n  }\n'],
    ['rank target', 'rank-target', '  view v {\n    include *\n    rank same {\n      api, other\n    }\n  }\n'],
    ['views-block style', 'style-target', '  style api {\n    color red\n  }\n  view v {\n    include *\n  }\n'],
  ];

  it.each(KINDS)('rejects addElement that re-targets a %s', async (_, role, views) => {
    const files = { 'm.c4': `${MODEL}views {\n${views}}\n` };
    const written = { 'm.c4': files['m.c4'].replace('  app = service {\n', `  app = service {\n${ADDED}`) };
    // P: LikeC4 links the reference to `app.inner.api`, and elsewhere in the text the write would produce.
    await expectValidLikeC4(files);
    expect((await linked(files, role, 'api')).target).toEqual({ model: 'app.inner.api' });
    expect((await linked(written, role, 'api')).target).not.toEqual({ model: 'app.inner.api' });
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement('app', { name: 'api', kind: 'service' }));
  });
});

describe('non-colliding additions on FX (row 11)', () => {
  const ADDITIONS: Array<[string, string, (m: LikeC4Mutator) => unknown]> = [
    ['refs-catalog', 'addElement', (m) => m.addElement('shop', { name: 'cache', kind: 'store' })],
    ['refs-catalog', 'addView', (m) => m.addView({ id: 'extraView', type: 'element' })],
    ['refs-catalog', 'addDeploymentNode', (m) => m.addDeploymentNode('prod', { name: 'tertiary', kind: 'host' })],
    ['refs-catalog', 'addDeploymentInstance', (m) => m.addDeploymentInstance('prod.secondary', { element: 'shop.db', name: 'replica' })],
    ['refs-flows', 'addElement', (m) => m.addElement('platform', { name: 'queue', kind: 'component' })],
    ['refs-flows', 'addView', (m) => m.addView({ id: 'extraView', type: 'element' })],
    ['refs-flows', 'addDeploymentNode', (m) => m.addDeploymentNode('main', { name: 'side', kind: 'pod' })],
    ['refs-flows', 'addDeploymentInstance', (m) => m.addDeploymentInstance('main.front', { element: 'client', name: 'probe' })],
  ];

  it.each(ADDITIONS)('%s: %s passes the accepted-write bundle and keeps every reference', async (fixture, _, write) => {
    const before = readFixture(fixture);
    const m = LikeC4Mutator.fromFiles(before);
    write(m);
    const after = m.serialize();
    expect(after).not.toEqual(before);
    await expectAcceptedWrite(before, after);
    await expectStable(before, after);
  });
});

describe('new mode, element class (row 12)', () => {
  const MODEL = `${SPEC}model {\n  app = service {\n  }\n  other = service\n}\n`;
  const PLACES: Array<[string, string, string]> = [
    ['an opt block', 'opaque-flow', `${MODEL}views {\n  dynamic view d {\n    app -> other\n    opt {\n      ghost -> other\n    }\n  }\n}\n`],
    ['a global predicate', 'global-or-import', `${MODEL}global {\n  predicateGroup g {\n    include ghost\n  }\n}\n`],
  ];

  it.each(PLACES)('rejects addElement named as a bare reference in %s', async (_, role, source) => {
    const files = { 'm.c4': source };
    // P: the reference does not resolve before the write, so no stability check covers it (D93).
    expect((await linked(files, role, 'ghost')).target).toBeNull();
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement('app', { name: 'ghost', kind: 'service' }));
  });
});

describe('new mode, deployment additions (row 13)', () => {
  const FILES = {
    'm.c4': `${SPEC}model {
  app = service {
    ghost = service
  }
  other = service
}
deployment {
  vm n {
  }
}
views {
  dynamic view d {
    other -> app
    opt {
      ghost -> other
    }
  }
}
`,
  };
  const WRITES: Array<[string, (m: LikeC4Mutator) => unknown]> = [
    ['addDeploymentNode', (m) => m.addDeploymentNode(null, { name: 'ghost', kind: 'vm' })],
    ['a named addDeploymentInstance', (m) => m.addDeploymentInstance('n', { element: 'other', name: 'ghost' })],
    ['an addDeploymentInstance whose id is taken from the element', (m) => m.addDeploymentInstance('n', { element: 'app.ghost' })],
  ];

  it.each(WRITES)('rejects %s named as a bare name in an opaque step', async (_, write) => {
    // P: valid input; the opaque step names `ghost`, which LikeC4 links to an element no deployment addition can shadow.
    await expectValidLikeC4(FILES);
    expect((await linked(FILES, 'opaque-flow', 'ghost')).target).toEqual({ model: 'app.ghost' });
    expectRejected(LikeC4Mutator.fromFiles(FILES), 'name', write);
  });
});

describe('new mode, view class (row 14)', () => {
  const MODEL = `${SPEC}model {\n  app = service\n  other = service\n}\n`;
  const PLACES: Array<[string, 'element' | 'dynamic', string]> = [
    ["an opaque step's navigateTo", 'dynamic', `${MODEL}views {\n  dynamic view d {\n    app -> other\n    opt {\n      app -> other {\n        navigateTo later\n      }\n    }\n  }\n}\n`],
    ["a global predicate's with { navigateTo }", 'element', `${MODEL}global {\n  predicateGroup g {\n    include app with {\n      navigateTo later\n    }\n  }\n}\n`],
  ];

  it.each(PLACES)('rejects addView with the id of a view reference in %s', async (_, type, source) => {
    const files = { 'm.c4': source };
    // P: the view reference does not resolve before the write.
    const references = (await linkedCatalogueReferences(files)).filter((r) => r.text === 'later');
    expect(references.map((r) => [r.unmodelled, r.target])).toEqual([[true, null]]);
    expectRejected(LikeC4Mutator.fromFiles(files), 'id', (m) => m.addView({ id: 'later', type }));
  });
});

describe('new mode, imported names (row 15)', () => {
  it('rejects addElement named as an imported name', async () => {
    const files = readFixture('refs-import');
    // P: LikeC4 links the imported `solo` (projects main and other, D116); the new `shared.solo` changes no reference the library resolves.
    expect((await linked(files, 'global-or-import', 'solo', { projects: ['main', 'other'] })).target).toEqual({ model: 'solo' });
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement('shared', { name: 'solo', kind: 'unit' }));
  });
});

describe('new mode, unrecovered text (row 16)', () => {
  const MODEL = `${SPEC}model {\n  app = service {\n  }\n}\n`;
  const BROKEN = "model {\n  a -> -> zork.zap 'quux' // quux\n}\n";

  it('rejects a name among unparsed tokens and accepts one only in a comment or a string there', () => {
    // P: LikeC4 fails on the file; its parse tree covers neither `zork` nor the string, and the comment is no token.
    const parse = likec4Parse(BROKEN);
    expect(parse.parserErrors).toBeGreaterThan(0);
    expect(parse.uncovered('zork')).toBe(true);
    expect(parse.uncovered("'quux'")).toBe(true);

    const files = { 'm.c4': MODEL, 'b.c4': BROKEN };
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement('app', { name: 'zork', kind: 'service' }));
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.addElement('app', { name: 'quux', kind: 'service' })).toBe('app.quux');
    expect(m.getElement('app.quux')).not.toBeNull();
  });
});

describe('a global style with a library icon (row 17)', () => {
  it('accepts an addition with the accepted-write bundle', async () => {
    const before = readFixture('refs-flows');
    // P: the fixture's global block styles with a library icon.
    expect(before['specification.c4']).toContain('icon tech:go');
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.addElement('platform', { name: 'cache', kind: 'database' })).toBe('platform.cache');
    await expectAcceptedWrite(before, m.serialize());
  });
});

describe('new-mode positions (row 18)', () => {
  const global = (model: string, item: string): Record<string, string> => ({
    'm.c4': `${SPEC}model {\n${model}}\nglobal {\n  predicateGroup g {\n    include ${item}\n  }\n}\n`,
  });

  it.each([
    ['a bare name', global('  app = service\n', 'zz')],
    ['a leading dotted segment', global('  app = service\n', 'zz.part')],
  ])('rejects %s equal to the new name', async (_, files) => {
    // P: the reference does not resolve before the write (D93).
    expect((await linkedCatalogueReferences(files)).filter((r) => r.role === 'global-or-import').map((r) => r.target)).toEqual([null]);
    expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement(null, { name: 'zz', kind: 'service' }));
  });

  it.each([
    ['a later dotted segment', global('  app = service {\n    zz = service\n  }\n', 'app.zz')],
    ['a longer identifier', global('  zzz = service\n', 'zzz')],
  ])('accepts %s equal to or containing the new name', async (_, before) => {
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.addElement(null, { name: 'zz', kind: 'service' })).toBe('zz');
    await expectAcceptedWrite(before, m.serialize());
  });
});

describe('comments and string values (row 19)', () => {
  const MODEL = `${SPEC}model {\n  app = service\n  other = service\n}\n`;

  it.each([
    ['a comment', `${MODEL}global {\n  predicateGroup g {\n    // zz\n    include app\n  }\n}\n`],
    ['a string value', `${MODEL}views {\n  dynamic view d {\n    app -> other\n    opt 'zz' {\n      app -> other 'zz'\n    }\n  }\n}\n`],
  ])('accepts a name found only in %s', async (_, source) => {
    const before = { 'm.c4': source };
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.addElement(null, { name: 'zz', kind: 'service' })).toBe('zz');
    await expectAcceptedWrite(before, m.serialize());
  });
});

describe('references unresolved before the write (row 20, D93)', () => {
  const FILES = {
    'm.c4': `${SPEC}model {
  a = service {
    x = service
  }
  b = service {
    x = service
  }
}
views {
  view v {
    include x
  }
}
`,
  };

  it('accepts an addition that makes an ambiguous name resolve, without checking or rewriting it', async () => {
    // P: LikeC4 leaves the ambiguous `x` unresolved — so the input is invalid and the full bundle,
    // which requires a valid input, cannot apply; the result is checked with expectValidLikeC4.
    expect((await linked(FILES, 'predicate-item', 'x')).target).toBeNull();
    expect(await validateLikeC4(FILES)).not.toEqual([]);

    const m = LikeC4Mutator.fromFiles(FILES);
    expect(m.addElement(null, { name: 'x', kind: 'service' })).toBe('x');
    const after = m.serialize();
    expect(after['m.c4']).toContain('  view v {\n    include x\n  }\n');
    expect((await linked(after, 'predicate-item', 'x')).target).toEqual({ model: 'x' });
    await expectValidLikeC4(after);
  });
});

describe('views-block and global references, as LikeC4 links them (review fix of row 10)', () => {
  const NESTED = `${SPEC}model {
  app = service {
    api = service {
      leaf = service
    }
  }
}
`;

  it.each(['api. leaf', 'api./* note */leaf'])(
    "rejects a root addElement 'api' that re-targets the views-block style target '%s'",
    async (text) => {
      const files = { 'm.c4': `${NESTED}views {\n  style ${text} {\n    color red\n  }\n  view v {\n    include *\n  }\n}\n` };
      const written = { 'm.c4': files['m.c4'].replace('model {\n', 'model {\n  api = service\n') };
      // P: LikeC4 links the dotted name by its segments to `app.api.leaf`, and elsewhere in the text the write would produce.
      await expectValidLikeC4(files);
      expect((await linked(files, 'style-target', text)).target).toEqual({ model: 'app.api.leaf' });
      expect((await linked(written, 'style-target', text)).target).not.toEqual({ model: 'app.api.leaf' });
      expectRejected(LikeC4Mutator.fromFiles(files), 'name', (m) => m.addElement(null, { name: 'api', kind: 'service' }));
    },
  );

  const DEPLOYED = `${SPEC}model {
  app = service
}
deployment {
  vm prod {
    vm edge
  }
}
`;

  it.each([
    ['a views-block style', 'style-target', 'views {\n  style edge {\n    color red\n  }\n  view v {\n    include *\n  }\n}\n'],
    ['a global predicate', 'global-or-import', 'global {\n  predicateGroup g {\n    include edge\n  }\n}\nviews {\n  view v {\n    include *\n  }\n}\n'],
  ])('rejects removeDeploymentNode of a node that %s outside deployment views names', async (_, role, rest) => {
    const files = { 'm.c4': `${DEPLOYED}${rest}` };
    // P: LikeC4 links the name, which exists only in the deployment model, to the node.
    await expectValidLikeC4(files);
    expect((await linked(files, role, 'edge')).target).toEqual({ deployment: 'prod.edge' });
    expectRejected(LikeC4Mutator.fromFiles(files), 'id', (m) => m.removeDeploymentNode('prod.edge'));
  });
});

describe('new mode respects the name class (row 14)', () => {
  it('accepts an element named like a view an opaque step navigates to', async () => {
    const before = {
      'm.c4': `${SPEC}model {\n  app = service\n  other = service\n}\nviews {\n  dynamic view d {\n    app -> other\n    opt {\n      app -> other {\n        navigateTo later\n      }\n    }\n  }\n  dynamic view later {\n    app -> other\n  }\n}\n`,
    };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.addElement(null, { name: 'later', kind: 'service' })).toBe('later');
    await expectAcceptedWrite(before, m.serialize());
  });
});

describe('a custom color in a global style (row 17)', () => {
  it('accepts an addition with the accepted-write bundle', async () => {
    const before = {
      'm.c4': "specification {\n  element service\n  color brand #3366ff\n}\nmodel {\n  app = service\n}\nglobal {\n  style gs * {\n    color brand\n  }\n}\n",
    };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.addElement('app', { name: 'cache', kind: 'service' })).toBe('app.cache');
    await expectAcceptedWrite(before, m.serialize());
  });
});

describe('unrecovered text, token by token (row 16)', () => {
  const MODEL = `${SPEC}model {\n  app = service {\n  }\n}\n`;

  it('lets a parsed identifier of a broken file through', () => {
    const broken = "model {\n  keep = service\n  a -> -> zork\n}\n";
    // P: the file does not parse, and `keep` is part of its parse tree.
    const parse = likec4Parse(broken);
    expect(parse.parserErrors).toBeGreaterThan(0);
    expect(parse.uncovered('keep')).toBe(false);
    expect(parse.inError('keep')).toBe(false);
    const m = LikeC4Mutator.fromFiles({ 'm.c4': MODEL, 'b.c4': broken });
    expect(m.addElement('app', { name: 'keep', kind: 'service' })).toBe('app.keep');
  });

  it.each([
    ['the first token of a file', 'zork\nmodel {\n}\n', 'zork'],
    ['the last tokens of a file without a closing brace', 'model {\n  a -> -> zork', 'zork'],
    ['an identifier after another, with an arrow between', 'model {\n  a -> -> zork -> zap\n}\n', 'zap'],
    ['an identifier after another, without a dot between', 'model {\n  a -> -> zork zap\n}\n', 'zap'],
    ['a name after a string and a dot', "model {\n  a -> -> 's'.zork\n}\n", 'zork'],
    ['a name after a library icon and a dot', 'model {\n  a -> -> tech:go.zork\n}\n', 'zork'],
  ] as const)('rejects a name that is %s', (_, broken, name) => {
    // P: the name is not part of the parse tree of the broken file.
    const parse = likec4Parse(broken);
    expect(parse.parserErrors).toBeGreaterThan(0);
    expect(parse.uncovered(name)).toBe(true);
    expectRejected(LikeC4Mutator.fromFiles({ 'm.c4': MODEL, 'b.c4': broken }), 'name', (m) => m.addElement('app', { name, kind: 'service' }));
  });

  it('rejects an unparsed name outside every parser error', () => {
    const broken = 'model {\n  a -> -> zork zap\n}\n';
    // P: `zork` is not in the parse tree, and no parser error is reported at it.
    const parse = likec4Parse(broken);
    expect(parse.uncovered('zork')).toBe(true);
    expect(parse.inError('zork')).toBe(false);
    expectRejected(LikeC4Mutator.fromFiles({ 'm.c4': MODEL, 'b.c4': broken }), 'name', (m) => m.addElement('app', { name: 'zork', kind: 'service' }));
  });

  it('rejects a name of the parse tree at which a parser error is reported', () => {
    const broken = 'model {\n  x = service {\n    link zork.zap\n  }\n}\n';
    // P: `zork` is a leaf of the parse tree, and the parser error is reported at it.
    const parse = likec4Parse(broken);
    expect(parse.uncovered('zork')).toBe(false);
    expect(parse.inError('zork')).toBe(true);
    expectRejected(LikeC4Mutator.fromFiles({ 'm.c4': MODEL, 'b.c4': broken }), 'name', (m) => m.addElement('app', { name: 'zork', kind: 'service' }));
  });
});
