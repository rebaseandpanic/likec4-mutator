/**
 * The CLI `validate` command on `LikeC4Mutator.validateModel` (rows 39–43
 * of the lc4m-15.31 test matrix): it reports exactly LikeC4's records for
 * the loaded files, `file:line:column: message` with 1-based columns on
 * stderr and exit 1, the success line and exit 0 for a valid model, only
 * the records with `--json`, and keeps LikeC4's console output off the
 * process streams (US-6, D146, INV-6 exceptions 1 and 2, US-8, D165).
 *
 * Rows 39–42 run in process through `buildProgram`; row 43 runs the bin
 * entry as a subprocess, because LikeC4's console output bypasses the
 * injected writers.  Expected sides: the spec's line form and literal
 * positions of the samples (row 39: `ghost` at line 4, column 8), and for
 * row 41 the records `validateModel` returns for the same files.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const SLOW = { timeout: 300_000 };
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

/** `a -> ghost` on line 4; `ghost` starts at the 1-based column 8. */
const GHOST = 'specification { element service }\nmodel {\n  a = service\n  a -> ghost\n}\n';

/** The nested-actor sequence sample: LikeC4 writes a warning with `console.error`; no error. */
const NESTED_ACTOR = `specification { element actor
 element service }
model { u = actor { v = actor }
 s = service
 u.v -> s }
views { dynamic view d { variant sequence
 u.v -> s
 u -> s } }
`;

// Four samples of tests/likec4-validate-oracle.test.ts, copied.
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
const ORACLE_SAMPLES: Record<string, Record<string, string>> = {
  'syntax-error': base('model {\n  x =\n}\n'),
  'duplicate-element-name-two-files': { 'a.c4': spec + model, 'b.c4': "model {\n  user = actor 'Dup'\n}\n" },
  'unknown-tag': base("model {\n  y = service 'Y' {\n    #undeclared\n  }\n}\n"),
  'valid': base('views {\n  view index {\n    include *\n  }\n}\n'),
};

/** A new temporary directory holding `files`. */
function directory(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-validate-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text, 'utf-8');
  }
  return dir;
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(...args: string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const program = buildProgram({
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
  });
  const code = await program.run(args);
  return { code, stdout, stderr };
}

/** The lines of a stream, without the final line end. */
function lines(text: string): string[] {
  expect(text.endsWith('\n'), JSON.stringify(text)).toBe(true);
  return text.slice(0, -1).split('\n');
}

describe('row 39: validate reports a semantic error at file:line:column (1-based)', SLOW, () => {
  it('the old syntax-only validate() accepts the model', () => {
    expect(LikeC4Mutator.fromFiles({ 'model.c4': GHOST }).validate()).toEqual([]);
  });

  it.each([[], ['--no-layout']])('text output %j', async (...flags) => {
    const result = await run('validate', '--dir', directory({ 'model.c4': GHOST }), ...flags);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    const errors = lines(result.stderr);
    expect(errors).toHaveLength(2);
    for (const line of errors) expect(line.startsWith('model.c4:4:8: '), line).toBe(true);
  });

  it.each([[], ['--no-layout']])('--json %j', async (...flags) => {
    const result = await run('validate', '--dir', directory({ 'model.c4': GHOST }), '--json', ...flags);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('');
    const records = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record).toMatchObject({ file: 'model.c4', line: 4, column: 8, origin: 'language-services' });
      expect(typeof record.message).toBe('string');
    }
  });
});

describe('row 40: validate of a valid model across .c4 and .likec4', SLOW, () => {
  const VALID = {
    'model.c4': 'specification {\n  element system\n}\nmodel {\n  app = system\n  db = system\n  app -> db\n}\n',
    'views.likec4': 'views {\n  view index {\n    include *\n  }\n}\n',
  };

  it('prints the success line counting both files', async () => {
    const result = await run('validate', '--dir', directory(VALID));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('All files are valid (2 file(s) checked)\n');
  });

  it('--json prints []', async () => {
    const result = await run('validate', '--dir', directory(VALID), '--json');
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});

describe("row 41: validate prints exactly LikeC4's records", SLOW, () => {
  it.each(Object.entries(ORACLE_SAMPLES))('%s', async (_, files) => {
    const mutator = LikeC4Mutator.fromFiles(files);
    const records = await mutator.validateModel();
    const result = await run('validate', '--dir', directory(files));
    expect(result.code).toBe(records.length > 0 ? 1 : 0);
    if (records.length === 0) {
      expect(result.stderr).toBe('');
      return;
    }
    expect(result.stdout).toBe('');
    // Whole text: a message of LikeC4's parser spans several lines.  Any line
    // of `validate()` or the brace-balance check would break the equality.
    expect(result.stderr).toBe(records.map((r) => `${r.file}:${r.line}:${r.column}: ${r.message}\n`).join(''));
    expect(result.stderr).not.toContain('Brace imbalance');
  });

  it('the samples include an invalid one with syntax-only validate() lines', () => {
    expect(LikeC4Mutator.fromFiles(ORACLE_SAMPLES['syntax-error']!).validate().length).toBeGreaterThan(0);
  });
});

describe('row 42: validate locates a syntax error at the end of a file', SLOW, () => {
  it('b.c4 ending inside an open block', async () => {
    const result = await run('validate', '--dir', directory({ 'b.c4': 'model {\n  x = service {\n' }));
    expect(result.code).toBe(1);
    const errors = lines(result.stderr);
    expect(errors.length).toBeGreaterThan(0);
    for (const line of errors) {
      expect(line).toMatch(/^b\.c4:\d+:\d+: /);
      expect(line).not.toContain('NaN');
    }
  });
});

describe('row 43: the bin entry keeps LikeC4 console output off the process streams', SLOW, () => {
  const cli = (...args: string[]) =>
    spawnSync('npx', ['tsx', 'src/cli.ts', ...args], { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 120_000 });

  it('(a) the nested-actor sample, text', () => {
    const result = cli('validate', '--dir', directory({ 'model.c4': NESTED_ACTOR }));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('All files are valid (1 file(s) checked)\n');
  });

  it('(a) the nested-actor sample, --json', () => {
    const result = cli('validate', '--dir', directory({ 'model.c4': NESTED_ACTOR }), '--json');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  it('(b) tests/fixtures/minimal, --json', () => {
    const result = cli('validate', '--dir', join(PROJECT_ROOT, 'tests', 'fixtures', 'minimal'), '--json');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  it('(c) the row-39 model, --json', () => {
    const result = cli('validate', '--dir', directory({ 'model.c4': GHOST }), '--json');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
    const records = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(records.map((r) => [r.file, r.line, r.column, r.origin])).toEqual([
      ['model.c4', 4, 8, 'language-services'],
      ['model.c4', 4, 8, 'language-services'],
    ]);
  });
});
