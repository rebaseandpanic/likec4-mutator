/**
 * The test oracle `validateLikeC4` / `expectValidLikeC4` (tests/helpers)
 * must reject exactly what `likec4 validate` of LikeC4 1.59.4 rejects, so
 * that a mutation result checked with it is known to pass the command.
 *
 * Each case is a small project.  The expected `<file>:<line>` location (1-based)
 * of every error, one entry per error, was taken from running
 * `likec4 validate --json` of the `likec4@1.59.4` npm package (layout
 * validation on) on the same sources; an empty list means the command exited
 * with 0.  A line with two errors is listed twice, so losing one of them
 * fails.  The messages are not compared (LikeC4's wording is not a contract
 * of this library).  The locations are a snapshot of 1.59.4: when the
 * `@likec4/language-server` dependency moves, re-run the command of the new
 * version on these sources and update them.  Cases cover valid sources,
 * warnings only, syntax errors, unresolved references, duplicates, view
 * predicates and `navigateTo`, dynamic and deployment views.
 *
 * The same samples and literals gate the library's `validateModel`
 * (lc4m-15.31 rows 32–38), with its record mapping, view step, call-time
 * snapshot and file names.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../src/index.js';
import { expectValidLikeC4, validateLikeC4 } from './helpers/likec4-model.js';

const spec = `specification {
  element actor
  element service
  element database
  deploymentNode node
  deploymentNode zone
  relationship async
  tag internal
}
`;

const model = `model {
  user = actor 'User'
  app = service 'App' {
    api = service 'API'
    db = database 'DB'
  }
  user -> app.api 'uses'
  app.api -> app.db 'reads'
}
`;

const base = (extra: string): Record<string, string> => ({ 'model.c4': spec + model + extra });

const samples: Record<string, Record<string, string>> = {
  'valid': base(`views {
  view index {
    include *
  }
}
`),
  'empty-file': { 'model.c4': '' },
  'syntax-error': base(`model {
  x =
}
`),
  'unresolved-relation-target': base(`model {
  user -> missing 'x'
}
`),
  'duplicate-element-name': base(`model {
  user = actor 'User again'
}
`),
  'duplicate-element-name-two-files': {
    'a.c4': spec + model,
    'b.c4': `model {
  user = actor 'Dup'
}
`,
  },
  'unknown-element-kind': base(`model {
  x = unknownkind 'X'
}
`),
  'unknown-tag': base(`model {
  y = service 'Y' {
    #undeclared
  }
}
`),
  'unknown-relationship-kind': base(`model {
  user -[nosuchkind]-> app 'x'
}
`),
  'self-relation': base(`model {
  user -> user 'self'
}
`),
  'parent-child-relation': base(`model {
  app -> app.api 'inner'
}
`),
  'duplicate-spec-kind': {
    'model.c4': spec + `specification {
  element service
}
` + model,
  },
  'extend-unknown-element': base(`model {
  extend missing {
    #internal
  }
}
`),
  'duplicate-view-id': base(`views {
  view index {
    include *
  }
  view index {
    include *
  }
}
`),
  'view-of-unknown-element': base(`views {
  view v of missing {
    include *
  }
}
`),
  'view-predicate-unknown-element': base(`views {
  view v {
    include missing.*
  }
}
`),
  'view-predicate-unknown-relation-endpoint': base(`views {
  view v {
    include user -> missing
  }
}
`),
  'navigate-to-unknown-view': base(`views {
  view v {
    include app with {
      navigateTo nosuchview
    }
  }
}
`),
  'navigate-to-existing-view': base(`views {
  view index {
    include *
  }
  view v {
    include app with {
      navigateTo index
    }
  }
}
`),
  'dynamic-view-valid': base(`views {
  dynamic view d {
    user -> app.api 'call'
    app.api -> app.db 'query'
  }
}
`),
  'dynamic-view-unknown-element': base(`views {
  dynamic view d {
    user -> missing 'call'
  }
}
`),
  'dynamic-view-step-without-model-relation': base(`views {
  dynamic view d {
    app.db -> user 'notify'
  }
}
`),
  'dynamic-view-parent-child-step': base(`views {
  dynamic view d {
    app -> app.api 'inner'
  }
}
`),
  'deployment-valid': base(`deployment {
  node prod {
    a = instanceOf app.api
    b = instanceOf app.db
  }
}
views {
  deployment view dv {
    include prod.**
  }
}
`),
  'deployment-two-unnamed-instances-same-element': base(`deployment {
  node prod {
    instanceOf app.api
    instanceOf app.api
  }
}
`),
  'deployment-two-named-instances-same-element': base(`deployment {
  node prod {
    a1 = instanceOf app.api
    a2 = instanceOf app.api
  }
}
`),
  'deployment-instance-of-unknown': base(`deployment {
  node prod {
    instanceOf missing
  }
}
`),
  'deployment-unknown-node-kind': base(`deployment {
  nosuchnode prod {
  }
}
`),
  'deployment-duplicate-node-name': base(`deployment {
  node prod
  node prod
}
`),
  'deployment-view-includes-model-element-ref': base(`deployment {
  node prod {
    a = instanceOf app.api
  }
}
views {
  deployment view dv {
    include missing
  }
}
`),
  'deployment-relation-unknown': base(`deployment {
  node prod {
    a = instanceOf app.api
  }
  prod.a -> prod.missing 'x'
}
`),
  'element-style-unknown-color': base(`model {
  z = service 'Z' {
    style {
      color nosuchcolor
    }
  }
}
`),
  'relation-in-view-predicate-with-unknown-tag': base(`views {
  view v {
    include * where tag is #nosuchtag
  }
}
`),
  'metadata-duplicate-key': base(`model {
  m = service 'M' {
    metadata {
      k 'a'
      k 'b'
    }
  }
}
`),
  'extend-relation-kind-title-warning': {
    'model.c4': `specification {
  element service
  relationship async {
    title 'Asynchronous'
  }
  tag t
}
model {
  a = service 'A'
  b = service 'B'
  a -[async]-> b
  extend a -[async]-> b 'Asynchronous' {
    #t
  }
}
`,
  },
};

/** Error locations `likec4 validate --json` reported per sample, one per error (lines converted to 1-based). */
const cliErrorLocations: Record<string, readonly string[]> = {
  'valid': [],
  'empty-file': [],
  'syntax-error': ['model.c4:21'],
  'unresolved-relation-target': ['model.c4:20', 'model.c4:20'],
  'duplicate-element-name': ['model.c4:11', 'model.c4:20'],
  'duplicate-element-name-two-files': ['a.c4:11', 'b.c4:2'],
  'unknown-element-kind': ['model.c4:20'],
  'unknown-tag': ['model.c4:21'],
  'unknown-relationship-kind': ['model.c4:20'],
  'self-relation': ['model.c4:20'],
  'parent-child-relation': ['model.c4:20'],
  'duplicate-spec-kind': ['model.c4:3', 'model.c4:11'],
  'extend-unknown-element': ['model.c4:20'],
  'duplicate-view-id': ['model.c4:20', 'model.c4:23'],
  'view-of-unknown-element': ['model.c4:20'],
  'view-predicate-unknown-element': ['model.c4:21', 'model.c4:21'],
  'view-predicate-unknown-relation-endpoint': ['model.c4:21', 'model.c4:21'],
  'navigate-to-unknown-view': ['model.c4:22'],
  'navigate-to-existing-view': [],
  'dynamic-view-valid': [],
  'dynamic-view-unknown-element': ['model.c4:21', 'model.c4:21'],
  'dynamic-view-step-without-model-relation': [],
  'dynamic-view-parent-child-step': ['model.c4:21'],
  'deployment-valid': [],
  'deployment-two-unnamed-instances-same-element': ['model.c4:21', 'model.c4:22'],
  'deployment-two-named-instances-same-element': [],
  'deployment-instance-of-unknown': ['model.c4:21'],
  'deployment-unknown-node-kind': ['model.c4:20'],
  'deployment-duplicate-node-name': ['model.c4:20', 'model.c4:21'],
  'deployment-view-includes-model-element-ref': ['model.c4:26', 'model.c4:26'],
  'deployment-relation-unknown': ['model.c4:23', 'model.c4:23'],
  'element-style-unknown-color': ['model.c4:22'],
  'relation-in-view-predicate-with-unknown-tag': ['model.c4:21'],
  'metadata-duplicate-key': [],
  'extend-relation-kind-title-warning': [],
};

describe('validateLikeC4 agrees with likec4 validate', () => {
  it.each(Object.entries(cliErrorLocations))('%s', async (name, locations) => {
    const errors = await validateLikeC4(samples[name]!);
    // An error without a `<file>:<line>` prefix (a layout error) is kept whole, so it fails the comparison.
    const reported = errors.map((e) => /^[^:]*:\d+(?=: )/.exec(e)?.[0] ?? e);
    expect([...reported].sort()).toEqual([...locations].sort());
  });

  it('expectValidLikeC4 passes valid sources and fails invalid ones', async () => {
    await expect(expectValidLikeC4(samples['extend-relation-kind-title-warning']!)).resolves.toBeUndefined();
    await expect(expectValidLikeC4(samples['self-relation']!)).rejects.toThrow();
  });
});

/** Every `.c4` file of a fixture workspace, keyed by its `/`-separated path relative to the workspace, in lexical walk order. */
function readWorkspace(name: string): Record<string, string> {
  const root = join(import.meta.dirname, 'fixtures', name);
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.c4')) files[relative(root, path).split(sep).join('/')] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

// Precondition of every test built on the reference fixtures: they are valid
// LikeC4, so a write checked against them starts from a clean state.
// `refs-import` holds two projects, `main` importing from `other` (D116).
describe('reference fixtures pass likec4 validate', () => {
  it.each(['refs-catalog', 'refs-flows'])('%s', async (fixture) => {
    const files = readWorkspace(fixture);
    expect(Object.keys(files).length, `.c4 files of ${fixture}`).toBeGreaterThan(0);
    await expectValidLikeC4(files);
  });

  it('refs-import, with its folders as projects', async () => {
    const files = readWorkspace('refs-import');
    expect(Object.keys(files).length, '.c4 files of refs-import').toBeGreaterThan(0);
    await expectValidLikeC4(files, { projects: ['main', 'other'] });
  });
});

// ---------------------------------------------------------------------------
// LikeC4Mutator.validateModel (lc4m-15.31 rows 32–38)
// ---------------------------------------------------------------------------

/** `<file>:<line>` of each record, sorted. */
function locations(records: ReadonlyArray<{ file?: string; line?: number }>): string[] {
  return records.map((r) => `${r.file}:${r.line}`).sort();
}

/** `a -> ghost` on line 4; `ghost` starts at the 1-based column 8. */
const GHOST = 'specification { element service }\nmodel {\n  a = service\n  a -> ghost\n}\n';

/**
 * A sequence view stepping from a nested actor: LikeC4 lays it out and its
 * sequence layout writes `Sequence view does not support nested actors`
 * with `console.error`; no diagnostic is an error.
 */
const NESTED_ACTOR = `specification { element actor
 element service }
model { u = actor { v = actor }
 s = service
 u.v -> s }
views { dynamic view d { variant sequence
 u.v -> s
 u -> s } }
`;

describe('validateModel reports what likec4 validate reports (row 32)', () => {
  it.each(Object.entries(cliErrorLocations))('%s', async (name, expected) => {
    const records = await LikeC4Mutator.fromFiles(samples[name]!).validateModel();
    expect(locations(records)).toEqual([...expected].sort());
    for (const record of records) {
      expect(record.origin).toBe('language-services');
      expect(Number.isInteger(record.line) && record.line! > 0, JSON.stringify(record)).toBe(true);
      expect(Number.isInteger(record.column) && record.column! > 0, JSON.stringify(record)).toBe(true);
      expect(typeof record.message).toBe('string');
    }
  });
});

describe('validateModel locates a record at the 1-based start of the diagnostic (row 33)', () => {
  it('both diagnostics of an unresolved target are at model.c4:4:8', async () => {
    const records = await LikeC4Mutator.fromFiles({ 'model.c4': GHOST }).validateModel();
    expect(records.map((r) => [r.file, r.line, r.column])).toEqual([
      ['model.c4', 4, 8],
      ['model.c4', 4, 8],
    ]);
  });
});

describe('console output of the view step is not a record (row 34)', () => {
  it.each([{}, { layout: false }])('validateModel(%j) of the nested-actor sample is empty', async (options) => {
    await expect(LikeC4Mutator.fromFiles({ 'model.c4': NESTED_ACTOR }).validateModel(options)).resolves.toEqual([]);
  });
});

describe('validateModel checks the sources of its call; calls are independent (row 35)', () => {
  it('(a) a mutation made while the check runs does not change its result', async () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': GHOST });
    const pending = m.validateModel();
    m.removeRelationship({ source: 'a', target: 'ghost' });
    expect(m.serialize()['model.c4']).not.toContain('ghost');
    expect((await pending).map((r) => [r.file, r.line, r.column])).toEqual([
      ['model.c4', 4, 8],
      ['model.c4', 4, 8],
    ]);
  });

  it('(b) a call after the fix reports nothing while the earlier one still reports the errors', async () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': GHOST });
    const before = m.validateModel();
    m.removeRelationship({ source: 'a', target: 'ghost' });
    const after = m.validateModel();
    const [early, late] = await Promise.all([before, after]);
    expect(locations(early)).toEqual(['model.c4:4', 'model.c4:4']);
    expect(late).toEqual([]);
  });

  it('(c) two instances validated concurrently report their own records', async () => {
    const other = 'specification { element service }\nmodel {\n  b = service\n\n\n  b -> nowhere\n}\n';
    const [first, second] = await Promise.all([
      LikeC4Mutator.fromFiles({ 'model.c4': GHOST }).validateModel(),
      LikeC4Mutator.fromFiles({ 'other.c4': other }).validateModel(),
    ]);
    expect(locations(first)).toEqual(['model.c4:4', 'model.c4:4']);
    expect(locations(second)).toEqual(['other.c4:6', 'other.c4:6']);
  });
});

describe('validateModel({ layout: false }) still reports the language-service errors (row 36)', () => {
  it.each(Object.entries(cliErrorLocations))('%s', async (name, expected) => {
    const records = await LikeC4Mutator.fromFiles(samples[name]!).validateModel({ layout: false });
    expect(locations(records)).toEqual([...expected].sort());
  });
});

describe('overlapping validateModel calls keep LikeC4 console output off the process streams (row 37)', () => {
  it('three overlapping calls on the nested-actor sample, then the caller writes to stderr', () => {
    const root = resolve(import.meta.dirname, '..');
    const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-overlap-'));
    const script = join(dir, 'overlap.mts');
    writeFileSync(
      script,
      [
        `import { LikeC4Mutator } from ${JSON.stringify(join(root, 'src', 'index.ts'))};`,
        `const files = { 'model.c4': ${JSON.stringify(NESTED_ACTOR)} };`,
        'const first = LikeC4Mutator.fromFiles(files);',
        'const second = LikeC4Mutator.fromFiles(files);',
        'const calls = [first.validateModel(), first.validateModel(), second.validateModel()];',
        'const results = await Promise.all(calls);',
        "console.error('AFTER');",
        'process.stdout.write(JSON.stringify(results));',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = spawnSync('npx', ['tsx', script], { cwd: root, encoding: 'utf-8', timeout: 120_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([[], [], []]);
    expect(result.stderr).toBe('AFTER\n');
  }, 150_000);
});

describe('validateModel names each record by its file as loaded (row 38)', () => {
  it('seven awkward keys are returned verbatim, none collapsed', async () => {
    // `dir\b.c4`, not `dir\a.c4`: the mutator itself refuses two keys that
    // denote one path (`dir/a.c4` and `dir\a.c4`) before any check runs.
    // `x\u{1F600}.c4` holds a character outside the Basic Multilingual Plane.
    const keys = ['dir/a.c4', 'dir\\b.c4', 'my model.c4', 'a b.c4', 'a%20b.c4', 'caf\u00e9.c4', 'x\u{1F600}.c4'];
    const files: Record<string, string> = { 'spec.c4': 'specification {\n  element system\n}\n' };
    keys.forEach((key, i) => {
      files[key] = `model {\n  e${i} = nokind\n}\n`;
    });
    const records = await LikeC4Mutator.fromFiles(files).validateModel();
    expect(records.map((r) => `${r.file}:${r.line}`).sort()).toEqual(keys.map((key) => `${key}:2`).sort());
  });
});
