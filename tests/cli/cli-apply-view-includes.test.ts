import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildLikeC4Model } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

const source = `specification {
  element service
}
model {
  app = service {
    api = service
    db = service
  }
  app.api -> app.db 'reads'
}
views {
}
`;

/** Run `apply --in-place` on a fresh copy of `source`; return status, stderr and the model text. */
function runApply(mutationsFile: unknown): { status: number | null; stderr: string; model: string } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-view-includes-'));
  writeFileSync(join(dir, 'model.c4'), source, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify(mutationsFile), 'utf-8');
  const result = spawnSync(
    'npx',
    ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'],
    { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 },
  );
  return { status: result.status, stderr: result.stderr, model: readFileSync(join(dir, 'model.c4'), 'utf-8') };
}

/** The rule lines (`include ...`) of view `id` in `model`, trimmed. */
function includeLines(model: string, id: string): string[] {
  const start = model.indexOf(`view ${id} `);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = model.slice(start, model.indexOf('}', start));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('include'));
}

const view = { op: 'addView', id: 'appView', type: 'element', target: 'app' };

describe('CLI apply: addView includes', () => {
  it.each([
    { name: 'plain expressions', includes: ['*', 'app.api'], expected: ['include *', 'include app.api'] },
    {
      name: 'items with a leading include keyword',
      includes: ['include *', '  include   app.api  '],
      expected: ['include *', 'include app.api'],
    },
    {
      name: 'comma-separated expressions in one item',
      includes: ['*, app.api -> app.db'],
      expected: ['include *, app.api -> app.db'],
    },
  ])('writes one include rule per item for $name, valid for LikeC4', async ({ includes, expected }) => {
    const { status, stderr, model } = runApply({ mutations: [{ ...view, includes }] });
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(includeLines(model, 'appView')).toEqual(expected);
    expect((await buildLikeC4Model({ 'model.c4': model })).errors).toEqual([]);
  });

  it('keeps the default include * for an element view without includes', () => {
    const { status, model } = runApply({ mutations: [view] });
    expect(status).toBe(0);
    expect(includeLines(model, 'appView')).toEqual(['include *']);
  });

  it.each([
    { name: 'a string', includes: '*', path: 'mutations[1].includes' },
    { name: 'null', includes: null, path: 'mutations[1].includes' },
    { name: 'a non-string item', includes: ['*', 5], path: 'mutations[1].includes[1]' },
    { name: 'an empty item', includes: [''], path: 'mutations[1].includes[0]' },
    { name: 'a whitespace-only item', includes: ['*', '   '], path: 'mutations[1].includes[1]' },
    { name: 'a bare include keyword', includes: ['include'], path: 'mutations[1].includes[0]' },
    { name: 'an include keyword with trailing spaces', includes: ['include   '], path: 'mutations[1].includes[0]' },
  ])('rejects includes that is $name before touching any file', ({ includes, path }) => {
    const { status, stderr, model } = runApply({
      mutations: [{ op: 'addView', id: 'first', type: 'element', target: 'app' }, { ...view, includes }],
    });
    expect(status).toBe(1);
    expect(stderr).toContain(`${path}:`);
    expect(model).toBe(source);
  });
});
