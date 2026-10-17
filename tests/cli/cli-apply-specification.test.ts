/**
 * `apply` with the specification writes (lc4m-15.30 US-6, US-7, US-12;
 * rows 116 and 128 of the test matrix): `addKind`, `updateKind`, `addTag`,
 * `renameKind`, `removeKind`, `renameTag` and `removeTag` write what the
 * library writes — valid LikeC4 (the accepted-write bundle) — and a
 * rejected op exits 1 on `mutations[i].<field>` and writes nothing.
 *
 * Expected values come from the spec and the inputs: the new declarations
 * are those the ops name, and the fields are those the library names.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectAcceptedWrite } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Each accepted output is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

const FILES: Record<string, string> = {
  'spec.c4': `specification {
  element system
  relationship calls {
    technology 'HTTP'
  }
  tag core
}
`,
  'model.c4': `model {
  a = system 'A'
  b = system 'B'
  a -[calls]-> b
}
`,
};

/** Run `apply --in-place` on a copy of `FILES`; exit status, output and the files after. */
function runApply(mutations: unknown[]): { status: number | null; stderr: string; files: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-specification-'));
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

describe('accepted ops (row 116)', SLOW, () => {
  it('declares a tag and the three kind types and updates a kind', async () => {
    const result = runApply([
      { op: 'addTag', name: 'edge' },
      { op: 'addKind', type: 'element', name: 'service', title: 'Service', summary: 'Runs code', tags: ['edge'] },
      { op: 'addKind', type: 'relationship', name: 'reads', technology: 'SQL', links: [{ url: 'https://example.com/reads' }] },
      { op: 'addKind', type: 'deploymentNode', name: 'pod', file: 'model.c4' },
      { op: 'updateKind', type: 'relationship', name: 'calls', technology: null, description: 'Calls' },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const spec = LikeC4Mutator.fromFiles(result.files).getSpecification()!;
    expect(spec.tags).toEqual(['core', 'edge']);
    expect(spec.elementKinds).toEqual(['system', 'service']);
    expect(spec.relationshipKinds).toEqual(['calls', 'reads']);
    expect(spec.deploymentNodeKinds).toEqual(['pod']);
    expect(result.files['spec.c4']).toContain("  relationship calls {\n    description 'Calls'\n  }\n");
    expect(result.files['model.c4']).toContain('specification {\n  deploymentNode pod\n}\n');
    await expectAcceptedWrite(FILES, result.files);
  });
});

describe('rejected ops (row 116)', () => {
  it.each([
    ['an unknown kind type', { op: 'addKind', type: 'node', name: 'service' }, 'mutations[0].type'],
    ['a name the grammar does not accept', { op: 'addKind', type: 'element', name: 'view' }, 'mutations[0].name:'],
    ['a name declared already', { op: 'addTag', name: 'core' }, 'mutations[0].name:'],
    ['a relationship kind summary', { op: 'addKind', type: 'relationship', name: 'reads', summary: 'x' }, 'mutations[0].summary:'],
    ['an undeclared tag', { op: 'addKind', type: 'element', name: 'service', tags: ['nope'] }, 'mutations[0].tags[0]:'],
    ['an update of an undeclared kind', { op: 'updateKind', type: 'element', name: 'nope', title: 'x' }, 'mutations[0].name:'],
    ['an empty update', { op: 'updateKind', type: 'element', name: 'system' }, 'mutations[0]'],
    ['a file that is not loaded', { op: 'addTag', name: 'edge', file: 'z.c4' }, 'mutations[0].file:'],
    ['a reserved element kind name', { op: 'addKind', type: 'element', name: 'self' }, 'mutations[0].name:'],
    ['a reserved relationship kind name', { op: 'addKind', type: 'relationship', name: 'self' }, 'mutations[0].name:'],
    ['a reserved deployment node kind name', { op: 'addKind', type: 'deploymentNode', name: 'self' }, 'mutations[0].name:'],
    ['an unknown field', { op: 'addTag', name: 'edge', color: 'red' }, 'mutations[0].color'],
  ])('rejects %s and writes nothing', (_, mutation, path) => {
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.files).toEqual(FILES);
  });
});

describe('rename and remove ops (row 128)', SLOW, () => {
  it('renames a kind and a tag and removes an unused kind and tag', async () => {
    const result = runApply([
      { op: 'addTag', name: 'spare' },
      { op: 'addKind', type: 'deploymentNode', name: 'pod' },
      { op: 'renameKind', type: 'element', name: 'system', newName: 'unit' },
      { op: 'renameKind', type: 'relationship', name: 'calls', newName: 'invokes' },
      { op: 'renameTag', name: 'core', newName: 'main' },
      { op: 'removeKind', type: 'deploymentNode', name: 'pod' },
      { op: 'removeTag', name: 'spare' },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files).toEqual({
      'spec.c4': `specification {
  element unit
  relationship invokes {
    technology 'HTTP'
  }
  tag main
}
`,
      'model.c4': `model {
  a = unit 'A'
  b = unit 'B'
  a -[invokes]-> b
}
`,
    });
    await expectAcceptedWrite(FILES, result.files);
  });

  it.each([
    ['a removal of a used kind', { op: 'removeKind', type: 'element', name: 'system' }, 'mutations[0].name:'],
    ['a removal of an undeclared tag', { op: 'removeTag', name: 'nope' }, 'mutations[0].name:'],
    ['a rename into a declared tag', { op: 'renameTag', name: 'core', newName: 'core' }, 'mutations[0].newName:'],
    ['an invalid new kind name', { op: 'renameKind', type: 'relationship', name: 'calls', newName: 'a.b' }, 'mutations[0].newName:'],
    ['an unknown kind type', { op: 'removeKind', type: 'node', name: 'system' }, 'mutations[0].type'],
    ['a missing newName', { op: 'renameTag', name: 'core' }, 'mutations[0].newName'],
    ['an unknown field of renameKind', { op: 'renameKind', type: 'element', name: 'system', newName: 'unit', file: 'spec.c4' }, 'mutations[0].file'],
    ['an unknown field of removeTag', { op: 'removeTag', name: 'core', cascade: true }, 'mutations[0].cascade'],
  ])('rejects %s and writes nothing', (_, mutation, path) => {
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.files).toEqual(FILES);
  });

  it('writes nothing when a later op is rejected', () => {
    const result = runApply([
      { op: 'renameTag', name: 'core', newName: 'main' },
      { op: 'removeKind', type: 'element', name: 'system' },
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutations[1].name:');
    expect(result.files).toEqual(FILES);
  });
});
