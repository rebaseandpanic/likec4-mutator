/**
 * `apply` with `addElementExtend` and `addRelationshipExtend` (lc4m-15.30
 * US-10, US-12; rows 158–159 of the test matrix): accepted ops write what
 * the library writes — valid LikeC4 (the accepted-write bundle) — the
 * relationship op selects with the selector fields of `updateRelationship`,
 * and a rejected op exits 1 on `mutations[i].<field>` and writes nothing.
 *
 * Expected values come from LikeC4: the decorated relationship and its
 * competitors read as LikeC4's model builder computes them
 * (`expectRelationshipsAgreeWithLikeC4`).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectAcceptedWrite, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Each accepted output is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

const FILES: Record<string, string> = {
  'model.c4': `specification {
  element system
  relationship calls
  tag core
}
model {
  a = system 'A'
  b = system 'B'
  a -[calls]-> b 'x'
  a -> b 'x'
  a -[calls]-> b 'y'
  a -> b 'same' a -> b 'same'
}
`,
  'ext.c4': `views {
  view index {
    include *
  }
}
`,
};

/** Run `apply --in-place` on a copy of `FILES`; exit status, output and the files after. */
function runApply(mutations: unknown[]): { status: number | null; stderr: string; files: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-extend-'));
  for (const [file, text] of Object.entries(FILES)) writeFileSync(join(dir, file), text, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  const files = Object.fromEntries(Object.keys(FILES).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
  return { status: result.status, stderr: result.stderr, files };
}

/** The relationships of `files` that carry the tag `core`, with their titles. */
function tagged(files: Record<string, string>): Array<{ kind?: string; title?: string }> {
  return LikeC4Mutator.fromFiles(files)
    .getRelationships()
    .filter((r) => r.tags?.includes('core'))
    .map((r) => ({ ...(r.kind !== undefined && { kind: r.kind }), ...(r.title !== undefined && { title: r.title }) }));
}

describe('accepted ops (row 158)', SLOW, () => {
  it('extends an element in a file without a model block and merges a second op into that block', async () => {
    const result = runApply([
      { op: 'addElementExtend', fqn: 'a', file: 'ext.c4', tags: ['core'] },
      { op: 'addElementExtend', fqn: 'a', file: 'ext.c4', links: [{ url: 'https://example.com/a' }], metadata: { owner: 'team' } },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files['ext.c4']).toContain('extend a {\n    #core\n');
    expect(result.files['ext.c4'].match(/extend a \{/g)).toHaveLength(1);
    expect(LikeC4Mutator.fromFiles(result.files).getElement('a')).toMatchObject({
      tags: ['core'],
      links: [{ url: 'https://example.com/a' }],
      metadata: { owner: 'team' },
    });
    await expectAcceptedWrite(FILES, result.files);
  });
});

describe('the selector fields (row 159)', SLOW, () => {
  it.each([
    ['matchKind', { matchKind: 'calls', matchTitle: 'x' }, [{ kind: 'calls', title: 'x' }]],
    ['matchTitle', { matchTitle: 'y' }, [{ kind: 'calls', title: 'y' }]],
    ['position with shared', { position: { file: 'model.c4', line: 12, column: 17 }, shared: true }, [{ title: 'same' }, { title: 'same' }]],
  ] as const)('decorates the relationship selected by %s, and no competitor', async (_, fields, expected) => {
    const result = runApply([{ op: 'addRelationshipExtend', source: 'a', target: 'b', file: 'ext.c4', tags: ['core'], ...fields }]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(tagged(result.files)).toEqual(expected);
    await expectAcceptedWrite(FILES, result.files);
    await expectRelationshipsAgreeWithLikeC4(result.files, LikeC4Mutator.fromFiles(result.files).getRelationships());
  });
});

describe('a typed bidirectional relationship (row 159)', SLOW, () => {
  it('decorates the typed relationship selected by matchKind, and not the untyped one', async () => {
    const files = {
      ...FILES,
      'model.c4': FILES['model.c4']!.replace("  a -> b 'same' a -> b 'same'\n", "  a -> b 'same' a -> b 'same'\n  a -[calls]<-> b 'both'\n  a <-> b 'both'\n"),
    };
    const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-extend-'));
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text, 'utf-8');
    const mutationsPath = join(dir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({ mutations: [{ op: 'addRelationshipExtend', source: 'a', target: 'b', matchKind: 'calls', matchBidirectional: true, file: 'ext.c4', tags: ['core'] }] }),
      'utf-8',
    );
    const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const after = Object.fromEntries(Object.keys(files).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
    expect(tagged(after)).toEqual([{ kind: 'calls', title: 'both' }]);
    await expectAcceptedWrite(files, after);
    await expectRelationshipsAgreeWithLikeC4(after, LikeC4Mutator.fromFiles(after).getRelationships());
  });
});

describe('rejected ops (rows 158, 159)', () => {
  it.each([
    ['an unresolved element', { op: 'addElementExtend', fqn: 'nope', file: 'ext.c4', tags: ['core'] }, 'mutations[0].fqn:'],
    ['a missing file', { op: 'addElementExtend', fqn: 'a', tags: ['core'] }, 'mutations[0].file'],
    ['nothing to add', { op: 'addElementExtend', fqn: 'a', file: 'ext.c4' }, 'mutations[0].tags:'],
    ['an undeclared tag', { op: 'addRelationshipExtend', source: 'a', target: 'b', matchTitle: 'y', file: 'ext.c4', tags: ['nope'] }, 'mutations[0].tags[0]:'],
    ['a wrong-typed matchBidirectional', { op: 'addRelationshipExtend', source: 'a', target: 'b', matchBidirectional: 'yes', file: 'ext.c4', tags: ['core'] }, 'mutations[0].matchBidirectional'],
    ['a wrong-typed position', { op: 'addRelationshipExtend', source: 'a', target: 'b', position: { file: 'model.c4', line: 'x', column: 1 }, file: 'ext.c4', tags: ['core'] }, 'mutations[0].position.line'],
    ['an ambiguous selector', { op: 'addRelationshipExtend', source: 'a', target: 'b', file: 'ext.c4', tags: ['core'] }, 'mutations[0].source:'],
    ['a shared identity without shared', { op: 'addRelationshipExtend', source: 'a', target: 'b', position: { file: 'model.c4', line: 12, column: 17 }, file: 'ext.c4', tags: ['core'] }, 'mutations[0].shared:'],
    ['an unknown field', { op: 'addElementExtend', fqn: 'a', file: 'ext.c4', tags: ['core'], title: 'x' }, 'mutations[0].title'],
  ])('rejects %s and writes nothing', (_, mutation, path) => {
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.files).toEqual(FILES);
  });
});
