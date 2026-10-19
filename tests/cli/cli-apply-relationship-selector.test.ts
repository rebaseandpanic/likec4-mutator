/**
 * The relationship selector through the CLI (lc4m-15.30, US-9, US-12, D84,
 * D102, D106; rows 140–142): an `apply` ambiguity names its mutation and
 * prints candidate positions in the sources after the preceding mutations,
 * and one of them passed back unchanged selects that candidate; the new
 * selector fields are validated on their JSON paths; the standalone
 * `remove-relationship` rejects an ambiguity without writing.
 *
 * The printed `file:line:column` of each candidate is the contract form
 * (D106), so it is read from stderr; everything else is the exit code, the
 * JSON path and the files on disk.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectAcceptedWrite, expectValidLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
// Two CLI subprocesses and the LikeC4 oracle per case; the 10 s default is too short on CI runners.
const SLOW = { timeout: 120_000 };

const MODEL = `specification {
  element service
}
model {
  p = service {
  }
  a = service
  b = service
  a -> b 'same'
  a -> b 'same' a -> b 'same'
}
views {
  view index {
    include *
  }
}
`;

/** A fresh directory holding `model.c4` = `source`. */
function workspace(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-relationship-selector-'));
  writeFileSync(join(dir, 'model.c4'), source, 'utf-8');
  return dir;
}

/** Run the CLI with `args` in `dir`; return exit status, stderr and `model.c4` afterwards. */
function run(dir: string, args: string[]): { status: number | null; stderr: string; model: string } {
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', ...args], { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 });
  return { status: result.status, stderr: result.stderr, model: readFileSync(join(dir, 'model.c4'), 'utf-8') };
}

/** Run `apply --in-place` with `mutations` on `dir`. */
function apply(dir: string, mutations: unknown[]): { status: number | null; stderr: string; model: string } {
  const path = join(dir, 'mutations.json');
  writeFileSync(path, JSON.stringify({ mutations }), 'utf-8');
  return run(dir, ['apply', '--dir', dir, '--mutations', path, '--in-place']);
}

/** The `file:line:column` positions printed in `text`. */
function printedPositions(text: string): Array<{ file: string; line: number; column: number }> {
  return [...text.matchAll(/([\w./-]+\.c4):(\d+):(\d+)/g)].map((m) => ({ file: m[1]!, line: Number(m[2]), column: Number(m[3]) }));
}

const SHIFT = { op: 'addElement', parent: 'p', kind: 'service', id: 'c', title: 'C' };

describe('apply round trip of an ambiguity (row 140, D102, D106)', SLOW, () => {
  it.each([0, 1, 2])('names mutations[1], prints positions after mutations[0], and candidate %i passed back selects it', async (index) => {
    // P: LikeC4 accepts the three identical relationships.
    await expectValidLikeC4({ 'model.c4': MODEL });
    const first = apply(workspace(MODEL), [SHIFT, { op: 'removeRelationship', source: 'a', target: 'b' }]);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('mutations[1].source:');
    expect(first.model).toBe(MODEL);
    // mutations[0] adds one line inside `p`: the declarations at lines 9 and 10 of MODEL start one line lower.
    const positions = printedPositions(first.stderr);
    expect(positions).toEqual([
      { file: 'model.c4', line: 10, column: 3 },
      { file: 'model.c4', line: 11, column: 3 },
      { file: 'model.c4', line: 11, column: 17 },
    ]);

    const dir = workspace(MODEL);
    const second = apply(dir, [SHIFT, { op: 'removeRelationship', source: 'a', target: 'b', position: positions[index] }]);
    expect(second.status, second.stderr).toBe(0);
    // Only the selected declaration is gone (up to the whitespace it takes with it); the shift is written too.
    const shifted = MODEL.replace('  p = service {\n', "  p = service {\n    c = service 'C'\n");
    const lines = shifted.split('\n');
    const at = positions[index]!;
    const start = lines.slice(0, at.line - 1).join('\n').length + 1 + at.column - 1;
    const expected = shifted.slice(0, start) + shifted.slice(start + "a -> b 'same'".length);
    const words = (text: string): string => text.replace(/\s+/g, ' ');
    expect(words(second.model)).toBe(words(expected));
    await expectAcceptedWrite({ 'model.c4': MODEL }, { 'model.c4': second.model });
  });
});

describe('apply validates the new selector fields (row 141)', () => {
  it.each([
    { name: 'a non-boolean matchBidirectional', fields: { matchBidirectional: 'yes' }, path: 'mutations[0].matchBidirectional' },
    { name: 'a position that is not an object', fields: { position: 'model.c4:10:3' }, path: 'mutations[0].position' },
    { name: 'a position without file', fields: { position: { line: 10, column: 3 } }, path: 'mutations[0].position.file' },
    { name: 'a 0-based line', fields: { position: { file: 'model.c4', line: 0, column: 3 } }, path: 'mutations[0].position.line' },
    { name: 'a fractional column', fields: { position: { file: 'model.c4', line: 10, column: 2.5 } }, path: 'mutations[0].position.column' },
    { name: 'an unknown position field', fields: { position: { file: 'model.c4', line: 10, column: 3, offset: 120 } }, path: 'mutations[0].position.offset' },
  ])('rejects $name on updateRelationship and removeRelationship, naming $path', ({ fields, path }) => {
    for (const mutation of [
      { op: 'removeRelationship', source: 'a', target: 'b', ...fields },
      { op: 'updateRelationship', source: 'a', target: 'b', technology: 'HTTP', ...fields },
    ]) {
      const { status, stderr, model } = apply(workspace(MODEL), [mutation]);
      expect(status, mutation.op).toBe(1);
      expect(stderr, mutation.op).toContain(`${path}:`);
      expect(model, mutation.op).toBe(MODEL);
    }
  });
});

describe('the standalone remove-relationship (row 142, D84)', () => {
  it('exits 1 on two identical relationships and writes nothing', () => {
    const source = MODEL.replace("  a -> b 'same' a -> b 'same'\n", "  a -> b 'same'\n");
    const dir = workspace(source);
    const { status, model } = run(dir, ['remove-relationship', '--dir', dir, '--source', 'a', '--target', 'b']);
    expect(status).toBe(1);
    expect(model).toBe(source);
  });
});
