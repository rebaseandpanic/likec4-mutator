/**
 * `apply` with `renameElement` and `moveElement` (lc4m-15.30 US-3, US-12;
 * rows 107–108 of the test matrix): an accepted op writes what the library
 * writes — valid LikeC4 (the accepted-write bundle), across files for a
 * cross-file move — and a rejected one exits 1 on `mutations[i].<field>`
 * and writes nothing.
 *
 * Expected values come from the spec and the inputs: the element's new
 * declaration is the input's text at its new place, and the fields are
 * those the library names (`newName`, `parent`, `file`).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectAcceptedWrite } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Each accepted output is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

const FILES: Record<string, string> = {
  'a.c4': `specification {
  element system
  element service
}
model {
  app = system 'App' {
    api = service 'API'
    db = service 'DB'
    api -> db 'reads'
  }
  other = system 'Other'
  other -> app.api 'calls'
}
`,
  'b.c4': `model {
  core = system 'Core'
}
views {
  view index {
    include app.api, core
  }
}
`,
};

/** Run `apply --in-place` on a copy of `FILES`; exit status, output and the files after. */
function runApply(mutations: unknown[]): { status: number | null; stdout: string; stderr: string; files: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-rename-move-'));
  for (const [file, text] of Object.entries(FILES)) writeFileSync(join(dir, file), text, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  const files = Object.fromEntries(Object.keys(FILES).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, files };
}

describe('accepted ops (row 107)', SLOW, () => {
  it('renames app.api and rewrites the references in both files', async () => {
    const result = runApply([{ op: 'renameElement', fqn: 'app.api', newName: 'gateway' }]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files['a.c4']).toBe(
      FILES['a.c4']!.replace("    api = service 'API'", "    gateway = service 'API'")
        .replace("    api -> db 'reads'", "    gateway -> db 'reads'")
        .replace("other -> app.api 'calls'", "other -> app.gateway 'calls'"),
    );
    expect(result.files['b.c4']).toBe(FILES['b.c4']!.replace('include app.api, core', 'include app.gateway, core'));
    await expectAcceptedWrite(FILES, result.files);
  });

  it('moves app.api under core in another file, writing both files', async () => {
    const result = runApply([{ op: 'moveElement', fqn: 'app.api', parent: 'core' }]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files['a.c4']).not.toBe(FILES['a.c4']);
    expect(result.files['a.c4']).not.toContain("api = service 'API'");
    expect(result.files['b.c4']).toContain("  core = system 'Core' {\n    api = service 'API'\n  }\n");
    expect(result.files['b.c4']).toContain('include core.api, core');
    await expectAcceptedWrite(FILES, result.files);
  });

  it('moves app.api to the top level of a chosen file', async () => {
    const result = runApply([{ op: 'moveElement', fqn: 'app.api', parent: null, file: 'b.c4' }]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files['b.c4']).toContain("  core = system 'Core'\n  api = service 'API'\n}\n");
    await expectAcceptedWrite(FILES, result.files);
  });
});

describe('rejected ops (row 108)', () => {
  it.each([
    ['a taken new name', { op: 'renameElement', fqn: 'app.api', newName: 'db' }, 'mutations[0].newName:'],
    ['an invalid new name', { op: 'renameElement', fqn: 'app.api', newName: 'a.b' }, 'mutations[0].newName:'],
    ['an unknown fqn', { op: 'renameElement', fqn: 'app.nope', newName: 'x' }, 'mutations[0].fqn:'],
    ['a parent inside the subtree', { op: 'moveElement', fqn: 'app', parent: 'app.api' }, 'mutations[0].parent:'],
    ['a move that changes nothing', { op: 'moveElement', fqn: 'app.api', parent: 'app' }, 'mutations[0].parent:'],
    ['file with a parent', { op: 'moveElement', fqn: 'app.api', parent: 'core', file: 'b.c4' }, 'mutations[0].file:'],
    ['a file that is not loaded', { op: 'moveElement', fqn: 'app.api', parent: null, file: 'z.c4' }, 'mutations[0].file:'],
    ['a missing parent', { op: 'moveElement', fqn: 'app.api' }, 'mutations[0].parent'],
    ['an unknown field', { op: 'renameElement', fqn: 'app.api', newname: 'gateway' }, 'mutations[0].newname'],
  ])('rejects %s and writes nothing', (_, mutation, path) => {
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.files).toEqual(FILES);
  });

  it('writes nothing when a later op of the batch is rejected', () => {
    const result = runApply([
      { op: 'renameElement', fqn: 'app.api', newName: 'gateway' },
      { op: 'moveElement', fqn: 'app.gateway', parent: 'app' },
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutations[1].parent:');
    expect(result.files).toEqual(FILES);
  });
});
