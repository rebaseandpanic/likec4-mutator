/**
 * The CLI program builder and its directory loader / writer (rows 2, 3, 5,
 * 6 and 7 of the lc4m-15.31 test matrix): the three LikeC4 file extensions
 * form one model, commander's own rejections exit 1 and write nothing,
 * `--version` prints the given version, `apply` rejects a mutation without
 * a known op at its path and passes a library rejection that names no field
 * through unchanged, the "no files found" failure names the extensions, and the output writer keeps
 * its path-traversal guard.
 *
 * The program runs in process through `buildProgram` with collecting
 * writers.  Expected sides come from the spec (US-7, INV-1, INV-6 exception
 * 2, INV-7, Edge cases, Constraints); written models are also checked with
 * the LikeC4 oracle.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';
import { writeOutput } from '../../src/cli/files.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

const SLOW = { timeout: 120_000 };

/** Run the program on `args`; its exit code and what it wrote to each stream. */
async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const program = buildProgram({
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
  });
  const code = await program.run(args);
  return { code, stdout, stderr };
}

/** A new temporary directory holding `files` (relative name → text). */
function tempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-program-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf-8');
  return dir;
}

/** Every file of `dir` (flat) by name. */
function readDir(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) files[name] = readFileSync(join(dir, name), 'utf-8');
  return files;
}

/** The LikeC4 files of a directory read back, for the oracle. */
function modelFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'notes.txt'));
}

// One file per extension: the kind is declared in `a.c4`, elements live in
// all three, and `c.like-c4` holds a relationship between elements of the
// other two files.
const MIXED = {
  'a.c4': 'specification {\n  element system\n}\nmodel {\n  app = system\n}\n',
  'b.likec4': 'model {\n  api = system\n}\n',
  'c.like-c4': 'model {\n  db = system\n  app -> api\n}\n',
  'notes.txt': 'not a LikeC4 file {\n',
};

describe('one model across .c4, .likec4 and .like-c4 (row 2)', SLOW, () => {
  it('a read command lists the elements of all three files and validate counts them', async () => {
    const dir = tempDir(MIXED);
    const list = await run('list-elements', '--dir', dir, '--json');
    expect(list.code, list.stderr).toBe(0);
    expect((JSON.parse(list.stdout) as Array<{ fqn: string }>).map((e) => e.fqn).sort()).toEqual(['api', 'app', 'db']);
    const validate = await run('validate', '--dir', dir);
    expect(validate.code, validate.stderr).toBe(0);
    expect(validate.stdout).toBe('All files are valid (3 file(s) checked)\n');
  });

  it('a write command and apply write the same files under their own names; notes.txt is untouched', async () => {
    const byCommand = tempDir(MIXED);
    const byApply = tempDir(MIXED);
    const notesBefore = [statSync(join(byCommand, 'notes.txt')).mtimeMs, statSync(join(byApply, 'notes.txt')).mtimeMs];

    const command = await run('add-relationship', '--dir', byCommand, '--source', 'api', '--target', 'db');
    expect(command.code, command.stderr).toBe(0);
    const mutationsDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-program-mutations-'));
    const mutations = join(mutationsDir, 'mutations.json');
    writeFileSync(mutations, JSON.stringify({ mutations: [{ op: 'addRelationship', source: 'api', target: 'db' }] }), 'utf-8');
    const apply = await run('apply', '--dir', byApply, '--mutations', mutations, '--in-place');
    expect(apply.code, apply.stderr).toBe(0);

    const afterCommand = readDir(byCommand);
    expect(readDir(byApply)).toEqual(afterCommand);
    expect(Object.keys(afterCommand)).toEqual(Object.keys(MIXED).sort());
    const changed = Object.keys(MIXED).filter((name) => afterCommand[name] !== MIXED[name as keyof typeof MIXED]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).not.toBe('notes.txt');
    expect([statSync(join(byCommand, 'notes.txt')).mtimeMs, statSync(join(byApply, 'notes.txt')).mtimeMs]).toEqual(notesBefore);
    await expectValidLikeC4(modelFiles(afterCommand));
  });
});

describe('two files whose names differ only by extension (row 3)', SLOW, () => {
  const SAME_BASE = {
    'a.c4': 'specification {\n  element system\n}\nmodel {\n  x = system\n}\n',
    'a.likec4': 'model {\n  y = system\n  x -> y\n}\n',
  };

  it('are two files of one model; a write to one leaves the other byte-identical', async () => {
    const dir = tempDir(SAME_BASE);
    for (const fqn of ['x', 'y']) {
      const get = await run('get-element', '--dir', dir, '--fqn', fqn, '--json');
      expect(get.code, get.stderr).toBe(0);
      expect((JSON.parse(get.stdout) as { fqn: string }).fqn).toBe(fqn);
    }
    const update = await run('update-element', '--dir', dir, '--fqn', 'y', '--title', 'Y');
    expect(update.code, update.stderr).toBe(0);
    const after = readDir(dir);
    expect(Object.keys(after)).toEqual(['a.c4', 'a.likec4']);
    expect(after['a.c4']).toBe(SAME_BASE['a.c4']);
    expect(after['a.likec4']).not.toBe(SAME_BASE['a.likec4']);
    await expectValidLikeC4(after);
  });
});

describe("commander's own rejections exit 1 and write nothing (row 5)", SLOW, () => {
  const MODEL = { 'model.c4': 'specification {\n  element system\n}\nmodel {\n  app = system\n}\n' };

  it.each([
    { name: 'an unknown option', args: (dir: string) => ['--dir', dir, '--parent', 'app', '--kind', 'system', '--id', 'n', '--title', 'N', '--no-such-flag', 'x'] },
    { name: 'a missing required --kind', args: (dir: string) => ['--dir', dir, '--parent', 'app', '--id', 'n', '--title', 'N'] },
    { name: 'a missing required --dir', args: () => ['--parent', 'app', '--kind', 'system', '--id', 'n', '--title', 'N'] },
    // Only a field that accepts null has --unset-<field>; addElement's title does not.
    {
      name: 'an --unset- flag of a field that does not accept null',
      args: (dir: string) => ['--dir', dir, '--parent', 'app', '--kind', 'system', '--id', 'n', '--title', 'N', '--unset-title'],
    },
  ])('add-element with $name', async ({ args }) => {
    const dir = tempDir(MODEL);
    const result = await run('add-element', ...args(dir));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
    expect(readDir(dir)).toEqual(MODEL);
  });
});

describe('--version prints the version the program was built with', () => {
  it('exits 0 with the version on stdout', async () => {
    let stdout = '';
    let stderr = '';
    const program = buildProgram(
      { stdout: { write: (s: string) => (stdout += s) }, stderr: { write: (s: string) => (stderr += s) } },
      { version: '9.8.7' },
    );
    expect(await program.run(['--version'])).toBe(0);
    expect(stdout).toBe('9.8.7\n');
    expect(stderr).toBe('');
  });
});

describe('apply rejects a mutation without a known op at mutations[i].op', SLOW, () => {
  const MODEL = { 'model.c4': 'specification {\n  element system\n}\nmodel {\n  app = system\n}\n' };

  it.each([
    { name: 'an unknown op', mutation: { op: 'noSuchOp' } },
    { name: 'no op', mutation: { kind: 'system' } },
  ])('$name', async ({ mutation }) => {
    const dir = tempDir(MODEL);
    const mutations = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-program-mutations-')), 'mutations.json');
    writeFileSync(mutations, JSON.stringify({ mutations: [mutation] }), 'utf-8');
    const result = await run('apply', '--dir', dir, '--mutations', mutations, '--in-place');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('Error: mutations[0].op'), result.stderr).toBe(true);
    expect(readDir(dir)).toEqual(MODEL);
  });
});

describe('apply passes a library rejection that names no field through unchanged', SLOW, () => {
  // A new label would move the 'T' extend block onto the other x -> y, which
  // already takes the kind's title 'U': the library refuses with a plain error.
  const MODEL = {
    'model.c4':
      "specification {\n  element service\n  relationship titled {\n    title 'U'\n  }\n  tag a\n  tag b\n}\n" +
      "model {\n  x = service\n  y = service\n  x -[titled]-> y 'T'\n  x -[titled]-> y\n  extend x -[titled]-> y 'T' { #a }\n}\n",
  };
  const MUTATION = { op: 'updateRelationship', source: 'x', target: 'y', matchTitle: 'T', label: '' };

  it("prints 'Error: <the library's message>', exits 1 and writes nothing", async () => {
    let rejection: unknown;
    try {
      LikeC4Mutator.fromFiles(MODEL).updateRelationship({ source: 'x', target: 'y', matchTitle: 'T' }, { label: '' });
    } catch (err) {
      rejection = err;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(InvalidWriteError);

    const dir = tempDir(MODEL);
    const mutations = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-program-mutations-')), 'mutations.json');
    writeFileSync(mutations, JSON.stringify({ mutations: [MUTATION] }), 'utf-8');
    const result = await run('apply', '--dir', dir, '--mutations', mutations, '--in-place');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Error: ${(rejection as Error).message}\n`);
    expect(readDir(dir)).toEqual(MODEL);
  });
});

describe('a directory with no LikeC4 files (row 6)', SLOW, () => {
  it('fails validate naming the three extensions', async () => {
    const dir = tempDir({ 'notes.txt': 'model {\n}\n' });
    const result = await run('validate', '--dir', dir);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    for (const extension of ['.c4', '.likec4', '.like-c4']) expect(result.stderr).toContain(extension);
  });
});

describe('the path-traversal guard of output writing (row 7)', () => {
  it('rejects a file name resolving outside the output directory and writes nothing outside it', () => {
    const root = mkdtempSync(join(tmpdir(), 'likec4-mutator-program-traversal-'));
    const out = join(root, 'out');
    mkdirSync(out);
    const mutator = LikeC4Mutator.fromFiles({ '../outside.c4': 'model {\n}\n' });
    expect(() => writeOutput(mutator, out)).toThrow();
    expect(existsSync(join(root, 'outside.c4'))).toBe(false);
  });
});
