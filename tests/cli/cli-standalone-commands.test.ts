/**
 * Tests for the three new standalone CLI commands added in Task 1 and the
 * --summary / --tags flags added to add-element in Task 2; and, from
 * lc4m-15.31 (rows 4, 17–26), the five commands older than the operation
 * table generated from it with their kept interface.
 */
import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildProgram } from '../../src/cli/program.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { Mutation } from '../../src/mutations-file.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_DIR = resolve(import.meta.dirname, '..', 'fixtures', 'minimal');

function runCli(args: string): string {
  return execSync(`npx tsx src/cli.ts ${args}`, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// update-element standalone command
// ---------------------------------------------------------------------------

describe('CLI update-element', () => {
  it('should update element description via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const stdout = runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --description 'Updated via CLI' --output ${tmpDir}`,
    );

    expect(stdout).toContain('updated successfully');
    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Updated via CLI');
  });

  it('should update element title via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app --title 'Renamed App' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Renamed App');
  });

  it('should update element technology via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --technology Go --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Go');
  });

  it('should update element summary via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --summary 'Quick overview' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Quick overview');
  });

  it('should add tags to element via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --tags deprecated,legacy --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#deprecated');
    expect(content).toContain('#legacy');
  });

  it('should exit with error when element FQN does not exist', () => {
    expect(() =>
      runCli(`update-element --dir ${FIXTURE_DIR} --fqn does.not.exist --title 'X'`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// remove-element standalone command
// ---------------------------------------------------------------------------

describe('CLI remove-element', () => {
  it('should remove an element via standalone command and verify it is absent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    // Copy fixture so we don't modify the original
    const originalContent = readFileSync(resolve(FIXTURE_DIR, 'model.c4'), 'utf-8');
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const outDir = join(tmpDir, 'out');
    const stdout = runCli(
      `remove-element --dir ${tmpDir} --fqn app.db --output ${outDir}`,
    );

    expect(stdout).toContain("Removed element 'app.db'");
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).not.toContain("db = database 'PostgreSQL'");
    // Other elements must remain
    expect(content).toContain('api = service');
  });

  it('should exit with error when element FQN does not exist', () => {
    expect(() =>
      runCli(`remove-element --dir ${FIXTURE_DIR} --fqn does.not.exist`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// remove-relationship standalone command
// ---------------------------------------------------------------------------

describe('CLI remove-relationship', () => {
  it('should remove a relationship via standalone command and verify it is absent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync(resolve(FIXTURE_DIR, 'model.c4'), 'utf-8');
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const outDir = join(tmpDir, 'out');
    const stdout = runCli(
      `remove-relationship --dir ${tmpDir} --source api --target db --output ${outDir}`,
    );

    expect(stdout).toContain('removed successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).not.toContain('api -> db');
  });

  it('should exit with error when relationship does not exist', () => {
    expect(() =>
      runCli(`remove-relationship --dir ${FIXTURE_DIR} --source ghost --target phantom`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// add-element with --summary and --tags flags (Task 2)
// ---------------------------------------------------------------------------

describe('CLI add-element with --summary and --tags', () => {
  it('should pass --summary flag through to the generated DSL', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id summarySvc --title 'Summary Service' --summary 'Quick overview text' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain("summary 'Quick overview text'");
  });

  it('should pass --tags flag (comma-separated) through to the generated DSL', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id taggedSvc --title 'Tagged Service' --tags internal,backend --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#internal');
    expect(content).toContain('#backend');
  });

  it('should pass both --summary and --tags together', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id fullSvc --title 'Full Service' --summary 'A summary' --tags critical,monitored --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain("summary 'A summary'");
    expect(content).toContain('#critical');
    expect(content).toContain('#monitored');
  });

  it('should handle a single tag without a comma', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id singleTagSvc --title 'Single Tag' --tags internal --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#internal');
  });
});

describe('CLI commands reject values LikeC4 would not accept', () => {
  it.each([
    ['add-element', `--parent app --kind service --id 1api --title 'X'`, '--id'],
    ['add-element', `--parent app --kind 'service x' --id ok --title 'X'`, '--kind'],
    ['add-element', `--parent app --kind service --id api --title 'X'`, '--id'],
    ['add-relationship', `--source 'app.api {' --target app.db`, '--source'],
    // apply's path mutations[0].tags[1] with the flag in place of mutations[0].tags (lc4m-15.31 row 17)
    ['update-element', `--fqn app.api --tags 'deprecated,not ok'`, '--tags[1]'],
    ['update-element', `--fqn app.api --tags 'deprecated,undeclared'`, '--tags[1]'],
  ])('%s %s exits with code 1 naming %s and writes nothing', (command, args, option) => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    writeFileSync(join(tmpDir, 'model.c4'), readFileSync(join(FIXTURE_DIR, 'model.c4'), 'utf-8'), 'utf-8');
    const before = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    let stderr = '';
    let status = 0;
    try {
      runCli(`${command} --dir ${tmpDir} ${args}`);
    } catch (err) {
      const failure = err as { status: number; stderr: string };
      status = failure.status;
      stderr = failure.stderr;
    }
    expect(status).toBe(1);
    expect(stderr).toContain(`${option}:`);
    expect(readFileSync(join(tmpDir, 'model.c4'), 'utf-8')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// remove-element and the reference policy (lc4m-15.30 row 76, D84)
// ---------------------------------------------------------------------------

describe('CLI remove-element applies the reference policy', () => {
  it('exits 1 and writes nothing when a view rule refers to the element', () => {
    const model = `specification {
  element system
}
model {
  app = system
  other = system
}
views {
  view v {
    include app, other
  }
}
`;
    const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const out = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-out-'));
    writeFileSync(join(dir, 'model.c4'), model, 'utf-8');
    const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'remove-element', '--dir', dir, '--fqn', 'app', '--output', out], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(result.status).toBe(1);
    expect(readFileSync(join(dir, 'model.c4'), 'utf-8')).toBe(model);
    expect(readdirSync(out)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// lc4m-15.31: the five commands generated from the operation table
// (rows 4, 18–26).  In process through `buildProgram`; each case runs on its
// own copies of one model, the command on one, `apply` with the same single
// mutation on another, and files are compared byte for byte.
// ---------------------------------------------------------------------------

const SLOW = { timeout: 300_000 };
const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');

/** Model C of row 1: `other` is an item of `include app, other` (line 10, `other` at column 18). */
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

/** The models of the cases, by name: a fixture directory, or files given here. */
const MODELS = {
  minimal: 'minimal',
  zones: 'deployment-zones',
  flows: 'views-flows',
  /** `a -> b` next to `a <-> b` */
  bidi: { 'model.c4': 'specification {\n  element system\n}\nmodel {\n  a = system\n  b = system\n  a -> b\n  a <-> b\n}\n' },
  modelC: { 'model.c4': MODEL_C },
  /** One model block per extension; the kind is declared in the `.likec4` file */
  mixed: {
    'a.likec4': 'specification {\n  element system\n}\nmodel {\n  app = system\n}\n',
    'b.c4': 'model {\n  api = system\n}\n',
    'c.like-c4': 'model {\n  db = system\n}\n',
  },
} as const satisfies Record<string, string | Record<string, string>>;

type Model = keyof typeof MODELS;

/** Every file under `dir`, by path relative to `dir`. */
function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).split('\\').join('/')] = readFileSync(path, 'utf-8');
    }
  };
  walk(dir);
  return files;
}

function modelFiles(model: Model): Record<string, string> {
  const source = MODELS[model];
  return typeof source === 'string' ? readTree(join(FIXTURES, source)) : { ...source };
}

/** A new temporary directory holding a copy of `model`. */
function workspace(model: Model): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-kept-commands-'));
  const source = MODELS[model];
  if (typeof source === 'string') {
    cpSync(join(FIXTURES, source), dir, { recursive: true });
  } else {
    for (const [name, text] of Object.entries(source)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text, 'utf-8');
    }
  }
  return dir;
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: readonly string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const program = buildProgram({
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
  });
  const code = await program.run(args);
  return { code, stdout, stderr };
}

/** A command run on a fresh copy of `model` (`--dir` added), and the files after it. */
async function runCommand(model: Model, args: readonly string[]): Promise<Run & { files: Record<string, string> }> {
  const dir = workspace(model);
  const [command, ...flags] = args;
  const result = await run([command, '--dir', dir, ...flags]);
  return { ...result, files: readTree(dir) };
}

/** `apply` with the single `mutation` on a fresh copy of `model`, in place, and the files after it. */
async function runApply(model: Model, mutation: object): Promise<Run & { files: Record<string, string> }> {
  const dir = workspace(model);
  const mutations = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-kept-mutations-')), 'mutations.json');
  writeFileSync(mutations, JSON.stringify({ mutations: [mutation] }), 'utf-8');
  const result = await run(['apply', '--dir', dir, '--mutations', mutations, '--in-place']);
  return { ...result, files: readTree(dir) };
}

/**
 * `apply`'s rejection line with `--<flag>` in place of the mutation path
 * `mutations[0].<field>`.
 */
function translated(applyStderr: string, field: string, flag: string): string {
  const prefix = `Error: mutations[0].${field}`;
  expect(applyStderr.startsWith(prefix), applyStderr).toBe(true);
  expect(/^[.[:]/.test(applyStderr.slice(prefix.length)), applyStderr).toBe(true);
  return `Error: --${flag}${applyStderr.slice(prefix.length)}`;
}

/**
 * The command `args` ends as `apply` with `mutation` does on `model`: when
 * `apply` succeeds, exit 0 and the same files, which pass the LikeC4 check;
 * when it rejects, exit 1, nothing on stdout, the files unchanged and
 * `apply`'s line with the flag (`rejectedAt`: the field and its flag).
 */
async function expectSameAsApply(
  model: Model,
  args: readonly string[],
  mutation: object,
  rejectedAt?: { field: string; flag: string },
): Promise<{ command: Run & { files: Record<string, string> }; apply: Run }> {
  const apply = await runApply(model, mutation);
  const command = await runCommand(model, args);
  if (apply.code === 0) {
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    expect(command.files).toEqual(apply.files);
    await expectValidLikeC4(command.files);
  } else {
    expect(apply.code).toBe(1);
    expect(rejectedAt, apply.stderr).toBeDefined();
    expect(command.code).toBe(1);
    expect(command.stdout).toBe('');
    expect(command.files).toEqual(modelFiles(model));
    expect(command.stderr).toBe(translated(apply.stderr, rejectedAt!.field, rejectedAt!.flag));
  }
  return { command, apply };
}

/** A command, the same fields as an `apply` mutation, and the model it runs on. */
interface Case {
  model: Model;
  args: string[];
  mutation: { op: Mutation['op'] } & Record<string, unknown>;
}

const LINKS = [{ url: 'https://example.com/docs', label: 'Docs' }];
const LINKS_JSON = '[{"url":"https://example.com/docs","label":"Docs"}]';
const RS = { file: 'model.c4', line: 25, column: 3 };
const RS_JSON = '{"file":"model.c4","line":25,"column":3}';

describe('row 4: add-element without --parent and --file writes to the default file across extensions', SLOW, () => {
  it('the element lands where the library puts it for the same three files', async () => {
    const command = await runCommand('mixed', ['add-element', '--kind', 'system', '--id', 'x']);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    const library = LikeC4Mutator.fromFiles(modelFiles('mixed'));
    library.addElement(null, { name: 'x', kind: 'system' });
    expect(command.files).toEqual(library.serialize());
    const changed = Object.keys(command.files).filter((name) => command.files[name] !== modelFiles('mixed')[name]);
    expect(changed).toHaveLength(1);
  });
});

/** Every field of each kept command's operation, the old flags included (row 18). */
const PARITY: Case[] = [
  {
    model: 'minimal',
    args: [
      'add-element', '--parent', 'app', '--kind', 'service', '--id', 'cache', '--title', 'Cache', '--summary', 'Fast store',
      '--description', 'Caches reads', '--technology', 'Redis', '--tags', 'internal', '--links', LINKS_JSON,
      '--style', '{"color":"green"}', '--metadata', '{"owner":"ops"}',
    ],
    mutation: {
      op: 'addElement', parent: 'app', kind: 'service', id: 'cache', title: 'Cache', summary: 'Fast store', description: 'Caches reads',
      technology: 'Redis', tags: ['internal'], links: LINKS, style: { color: 'green' }, metadata: { owner: 'ops' },
    },
  },
  {
    model: 'minimal',
    args: ['add-element', '--kind', 'system', '--id', 'extra', '--file', 'model.c4'],
    mutation: { op: 'addElement', kind: 'system', id: 'extra', file: 'model.c4' },
  },
  {
    model: 'zones',
    args: [
      'add-relationship', '--source', 'shop.web', '--target', 'shop.db', '--label', 'caches', '--description', 'Session cache',
      '--technology', 'Redis', '--tags', 'internal', '--links', LINKS_JSON, '--metadata', '{"owner":"team-b"}', '--style', '{"line":"dotted"}',
      '--kind', 'calls', '--kind-form', 'dot', '--file', 'model.c4',
    ],
    mutation: {
      op: 'addRelationship', source: 'shop.web', target: 'shop.db', label: 'caches', description: 'Session cache', technology: 'Redis',
      tags: ['internal'], links: LINKS, metadata: { owner: 'team-b' }, style: { line: 'dotted' }, kind: 'calls', kindForm: 'dot', file: 'model.c4',
    },
  },
  {
    model: 'zones',
    args: ['add-relationship', '--source', 'shop.api', '--target', 'shop.web', '--kind', 'syncs', '--bidirectional', '--placement', 'nested', '--shared'],
    mutation: { op: 'addRelationship', source: 'shop.api', target: 'shop.web', kind: 'syncs', bidirectional: true, placement: 'nested', shared: true },
  },
  {
    model: 'minimal',
    args: [
      'update-element', '--fqn', 'app.api', '--title', 'API', '--summary', 'Entry', '--description', 'Serves', '--technology', 'Go',
      '--tags', 'backend', '--links', LINKS_JSON, '--style', '{"color":"red"}', '--metadata', '{"owner":"ops"}',
    ],
    mutation: {
      op: 'updateElement', fqn: 'app.api', title: 'API', summary: 'Entry', description: 'Serves', technology: 'Go', tags: ['backend'],
      links: LINKS, style: { color: 'red' }, metadata: { owner: 'ops' },
    },
  },
  {
    model: 'modelC',
    args: ['remove-element', '--fqn', 'other', '--cascade'],
    mutation: { op: 'removeElement', fqn: 'other', cascade: true },
  },
  {
    model: 'flows',
    args: ['remove-relationship', '--source', 'portal.web', '--target', 'portal.gateway', '--match-kind', 'call'],
    mutation: { op: 'removeRelationship', source: 'portal.web', target: 'portal.gateway', matchKind: 'call' },
  },
  {
    model: 'zones',
    args: ['remove-relationship', '--source', 'shop.web', '--target', 'shop.api', '--match-title', 'calls'],
    mutation: { op: 'removeRelationship', source: 'shop.web', target: 'shop.api', matchTitle: 'calls' },
  },
  {
    model: 'bidi',
    args: ['remove-relationship', '--source', 'a', '--target', 'b', '--match-bidirectional', 'false'],
    mutation: { op: 'removeRelationship', source: 'a', target: 'b', matchBidirectional: false },
  },
  {
    model: 'zones',
    args: ['remove-relationship', '--source', 'shop.api', '--target', 'shop.db', '--position', RS_JSON],
    mutation: { op: 'removeRelationship', source: 'shop.api', target: 'shop.db', position: RS },
  },
];

describe('row 18: every field of the five kept commands writes what apply writes', SLOW, () => {
  it.each(PARITY.map((c) => [c.args.join(' '), c] as const))('%s', async (_, c) => {
    const { command } = await expectSameAsApply(c.model, c.args, c.mutation);
    expect(command.code).toBe(0);
    expect(command.files).not.toEqual(modelFiles(c.model));
  });
});

describe('row 19: with --json a kept command prints only {"operation", "result"}', SLOW, () => {
  it.each([
    {
      args: ['add-element', '--parent', 'app', '--kind', 'service', '--id', 'newSvc', '--title', 'New Service'],
      operation: 'addElement',
      call: (m: LikeC4Mutator) => m.addElement('app', { name: 'newSvc', kind: 'service', title: 'New Service' }),
    },
    {
      args: ['add-relationship', '--source', 'app.api', '--target', 'app.db', '--label', 'syncs'],
      operation: 'addRelationship',
      call: (m: LikeC4Mutator) => m.addRelationship('app.api', 'app.db', 'syncs'),
    },
    {
      args: ['update-element', '--fqn', 'app.api', '--description', 'Updated'],
      operation: 'updateElement',
      call: (m: LikeC4Mutator) => m.updateElement('app.api', { description: 'Updated' }),
    },
    {
      args: ['remove-element', '--fqn', 'app.db'],
      operation: 'removeElement',
      call: (m: LikeC4Mutator) => m.removeElement('app.db'),
    },
    {
      args: ['remove-relationship', '--source', 'api', '--target', 'db'],
      operation: 'removeRelationship',
      call: (m: LikeC4Mutator) => m.removeRelationship({ source: 'api', target: 'db' }),
    },
  ])('$args.0 --json', async ({ args, operation, call }) => {
    const command = await runCommand('minimal', [...args, '--json']);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    const value = call(LikeC4Mutator.fromFiles(modelFiles('minimal')));
    const result = value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown);
    expect(JSON.parse(command.stdout)).toStrictEqual({ operation, result });
    expect(command.files).not.toEqual(modelFiles('minimal'));
  });
});

describe("row 20: a rejected kept command names the flag with apply's detail and writes nothing", SLOW, () => {
  it.each(
    [
      {
        args: ['add-element', '--parent', 'app', '--kind', 'service', '--id', 'x', '--style', '{"color":"nocolor"}'],
        mutation: { op: 'addElement', parent: 'app', kind: 'service', id: 'x', style: { color: 'nocolor' } },
        field: 'style',
        flag: 'style',
      },
      {
        args: ['add-relationship', '--source', 'app.api', '--target', 'app.db', '--kind', 'nokind'],
        mutation: { op: 'addRelationship', source: 'app.api', target: 'app.db', kind: 'nokind' },
        field: 'kind',
        flag: 'kind',
      },
      {
        args: ['update-element', '--fqn', 'app.api', '--metadata', '{"owner":1}'],
        mutation: { op: 'updateElement', fqn: 'app.api', metadata: { owner: 1 } },
        field: 'metadata',
        flag: 'metadata',
      },
      {
        args: ['remove-relationship', '--source', 'app.api', '--target', 'app.db', '--position', '{"file":"model.c4"}'],
        mutation: { op: 'removeRelationship', source: 'app.api', target: 'app.db', position: { file: 'model.c4' } },
        field: 'position',
        flag: 'position',
      },
      {
        args: ['remove-element', '--fqn', 'does.not.exist'],
        mutation: { op: 'removeElement', fqn: 'does.not.exist' },
        field: 'fqn',
        flag: 'fqn',
      },
      {
        args: ['remove-relationship', '--source', 'ghost', '--target', 'phantom'],
        mutation: { op: 'removeRelationship', source: 'ghost', target: 'phantom' },
        field: 'source',
        flag: 'source',
      },
    ].flatMap((r) => [false, true].map((json) => [`${r.args.join(' ')}${json ? ' --json' : ''}`, r, json] as const)),
  )('%s', async (_, r, json) => {
    const apply = await runApply('minimal', r.mutation);
    expect(apply.code).toBe(1);
    const command = await runCommand('minimal', json ? [...r.args, '--json'] : r.args);
    expect(command.code).toBe(1);
    expect(command.stdout).toBe('');
    expect(command.files).toEqual(modelFiles('minimal'));
    expect(command.stderr).toBe(translated(apply.stderr, r.field, r.flag));
    expect(command.stderr.split('\n')).toHaveLength(2);
    expect(command.stderr.startsWith(`Error: --${r.flag}`)).toBe(true);
  });
});

describe('row 21: --parent and --title of add-element are optional', SLOW, () => {
  it.each([
    ['neither', ['--kind', 'service', '--id', 'x'], { op: 'addElement', kind: 'service', id: 'x' }, 'x'],
    ['--title without --parent', ['--kind', 'service', '--id', 'x', '--title', 'T'], { op: 'addElement', kind: 'service', id: 'x', title: 'T' }, 'x'],
    ['--parent without --title', ['--parent', 'app', '--kind', 'service', '--id', 'x'], { op: 'addElement', parent: 'app', kind: 'service', id: 'x' }, 'app.x'],
  ] as const)('%s', async (_, flags, mutation, fqn) => {
    const { command } = await expectSameAsApply('minimal', ['add-element', ...flags], mutation);
    expect(command.code).toBe(0);
    expect(command.stdout).toBe(`Created element '${fqn}'\n`);
  });
});

describe('row 22: remove-element --cascade lists the cascade after the kept line', SLOW, () => {
  it('on model C', async () => {
    const { command, apply } = await expectSameAsApply('modelC', ['remove-element', '--fqn', 'other', '--cascade'], {
      op: 'removeElement', fqn: 'other', cascade: true,
    });
    // apply prints its removal line, then the cascade lines, then its summary.
    const applyLines = apply.stdout.split('\n');
    expect(applyLines.slice(-2)).toEqual(['Applied 1 mutation(s) successfully', '']);
    const cascade = applyLines.slice(1, -2);
    expect(cascade.length).toBeGreaterThan(0);
    expect(command.stdout.split('\n')).toEqual(["Removed element 'other'", ...cascade, '']);
  });
});

describe('row 23: --tags of a kept command (D156)', SLOW, () => {
  const ARGS = ['update-element', '--fqn', 'app.api', '--title', 'T', '--tags'];
  it.each([
    ["''", '', {}],
    ["'[]'", '[]', { tags: [] }],
    ['a JSON array', '["backend","internal"]', { tags: ['backend', 'internal'] }],
    ['a comma list', 'backend, internal,,critical', { tags: ['backend', 'internal', 'critical'] }],
  ] as const)('%s', async (_, value, fields) => {
    const { command } = await expectSameAsApply('minimal', [...ARGS, value], { op: 'updateElement', fqn: 'app.api', title: 'T', ...fields });
    expect(command.code).toBe(0);
  });

  it("'[1]' is the comma list [\"[1]\"] and is rejected at --tags[0]", async () => {
    const { command } = await expectSameAsApply('minimal', [...ARGS, '[1]'], { op: 'updateElement', fqn: 'app.api', title: 'T', tags: ['[1]'] }, {
      field: 'tags',
      flag: 'tags',
    });
    expect(command.code).toBe(1);
    expect(command.stderr.startsWith('Error: --tags[0]: ')).toBe(true);
  });
});

describe('row 24: the kept commands decode their flags as the generated ones do', SLOW, () => {
  it.each([
    ['--title null is the text', ['update-element', '--fqn', 'app.api', '--title', 'null'], { op: 'updateElement', fqn: 'app.api', title: 'null' }],
    ["--title '' is the empty text", ['update-element', '--fqn', 'app.api', '--title', ''], { op: 'updateElement', fqn: 'app.api', title: '' }],
    [
      '--match-bidirectional false',
      ['remove-relationship', '--source', 'app.api', '--target', 'app.db', '--match-bidirectional', 'false'],
      { op: 'removeRelationship', source: 'app.api', target: 'app.db', matchBidirectional: false },
    ],
  ] as const)('%s', async (_, args, mutation) => {
    await expectSameAsApply('minimal', args, mutation, { field: 'title', flag: 'title' });
  });

  it('--match-bidirectional true removes the bidirectional relationship, as in apply', async () => {
    const mutation = { op: 'removeRelationship', source: 'a', target: 'b' };
    const { command } = await expectSameAsApply('bidi', ['remove-relationship', '--source', 'a', '--target', 'b', '--match-bidirectional', 'true'], {
      ...mutation,
      matchBidirectional: true,
    });
    expect(command.code).toBe(0);
    expect(command.stdout).toBe("Relationship 'a' -> 'b' removed successfully\n");
    // The other value of the flag removes the other relationship: different files.
    const other = await runApply('bidi', { ...mutation, matchBidirectional: false });
    expect(other.code).toBe(0);
    expect(command.files).not.toEqual(other.files);
  });

  it.each(
    (
      [
        [['remove-relationship', '--source', 'app.api', '--target', 'app.db', '--match-bidirectional', 'yes'], 'match-bidirectional'],
        [['update-element', '--fqn', 'app.api', '--style', '{'], 'style'],
        [['update-element', '--fqn', 'app.api', '--links', '{'], 'links'],
        [['update-element', '--fqn', 'app.api', '--metadata', '{'], 'metadata'],
        [['update-element', '--fqn', 'app.api', '--links', '{}'], 'links'],
        [['update-element', '--fqn', 'app.api', '--style', '[]'], 'style'],
      ] as const
    ).flatMap(([args, flag]) => [false, true].map((json) => [`${args.join(' ')}${json ? ' --json' : ''}`, args, flag, json] as const)),
  )('%s is rejected naming the flag', async (_, args, flag, json) => {
    const command = await runCommand('minimal', json ? [...args, '--json'] : args);
    expect(command.code).toBe(1);
    expect(command.stdout).toBe('');
    expect(command.files).toEqual(modelFiles('minimal'));
    expect(command.stderr).toMatch(new RegExp(`^Error: --${flag}[:.[]`));
  });
});

describe('row 25: a kept flag given twice takes its second value', SLOW, () => {
  it.each([
    ['string', 'minimal', ['update-element', '--fqn', 'app.api', '--title', 'a', '--title', 'b'], { op: 'updateElement', fqn: 'app.api', title: 'b' }],
    ['tags', 'minimal', ['update-element', '--fqn', 'app.api', '--tags', 'backend', '--tags', 'internal'], { op: 'updateElement', fqn: 'app.api', tags: ['internal'] }],
    [
      'JSON',
      'minimal',
      ['update-element', '--fqn', 'app.api', '--style', '{"color":"red"}', '--style', '{"color":"green"}'],
      { op: 'updateElement', fqn: 'app.api', style: { color: 'green' } },
    ],
    [
      'value boolean',
      'bidi',
      ['remove-relationship', '--source', 'a', '--target', 'b', '--match-bidirectional', 'true', '--match-bidirectional', 'false'],
      { op: 'removeRelationship', source: 'a', target: 'b', matchBidirectional: false },
    ],
  ] as const)('%s', async (_, model, args, mutation) => {
    const { command } = await expectSameAsApply(model, args, mutation);
    expect(command.code).toBe(0);
  });
});

describe('row 26: the existing invocations of the five print their kept lines', SLOW, () => {
  it.each([
    {
      args: ['add-element', '--parent', 'app', '--kind', 'service', '--id', 'newSvc', '--title', 'New Service'],
      mutation: { op: 'addElement', parent: 'app', kind: 'service', id: 'newSvc', title: 'New Service' },
      lines: ["Created element 'app.newSvc'"],
      applyLines: ["  addElement: created 'app.newSvc'"],
    },
    {
      args: ['add-relationship', '--source', 'app.api', '--target', 'app.db', '--label', 'syncs'],
      mutation: { op: 'addRelationship', source: 'app.api', target: 'app.db', label: 'syncs' },
      lines: ["Relationship 'app.api' -> 'app.db' added successfully"],
      applyLines: [],
    },
    {
      args: ['update-element', '--fqn', 'app.api', '--description', 'Updated via CLI'],
      mutation: { op: 'updateElement', fqn: 'app.api', description: 'Updated via CLI' },
      lines: ["Element 'app.api' updated successfully"],
      applyLines: [],
    },
    {
      args: ['remove-element', '--fqn', 'app.db'],
      mutation: { op: 'removeElement', fqn: 'app.db' },
      lines: ["Removed element 'app.db'", 'Also removed 1 relationship(s):', "  app.api -> app.db 'reads/writes'"],
      applyLines: ["  removeElement: removed 'app.db' (1 relationship(s) also removed)"],
    },
    {
      args: ['remove-relationship', '--source', 'api', '--target', 'db'],
      mutation: { op: 'removeRelationship', source: 'api', target: 'db' },
      lines: ["Relationship 'api' -> 'db' removed successfully"],
      applyLines: [],
    },
  ])('$args.0', async ({ args, mutation, lines, applyLines }) => {
    const { command, apply } = await expectSameAsApply('minimal', args, mutation);
    expect(command.code).toBe(0);
    expect(command.stdout.split('\n')).toEqual([...lines, '']);
    // apply keeps its own lines for the same mutation (INV-6, its format from before lc4m-15.31).
    expect(apply.stdout.split('\n')).toEqual([...applyLines, 'Applied 1 mutation(s) successfully', '']);
  });
});
