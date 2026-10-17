/**
 * `apply` with `cascade` on the four remove ops (lc4m-15.30 US-1, US-2,
 * US-12; rows 73–75 of the test matrix): each op in both modes, atomicity
 * across mutations, and the validation of the new field.
 *
 * Expected values come from the spec and the inputs: a rejection exits 1 on
 * `mutations[i].fqn` / `id` and writes nothing; an accepted output is the
 * input with the cascaded constructs taken out, valid LikeC4 (the
 * accepted-write bundle) whose linked references are those before minus the
 * removed ones (`linkedCatalogueReferences`).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectAcceptedWrite, expectValidLikeC4, linkedCatalogueReferences } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Each accepted output is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

const MODEL = `specification {
  element system
  element service
  deploymentNode vm
}
model {
  app = system {
    api = service
    db = service
  }
  other = system
}
deployment {
  vm prod {
    vm inner {
      a = instanceOf app.db
    }
  }
}
views {
  view v {
    include other, app.api
  }
  dynamic view flow {
    other -> app.db
  }
  view w {
    include app.db with {
      navigateTo flow
    }
  }
  deployment view dv {
    include prod
    include prod.inner.a
  }
}
`;

/** Run `apply --in-place` on a copy of `MODEL`; exit status, output and the model text after. */
function runApply(mutations: unknown[]): { status: number | null; stdout: string; stderr: string; model: string } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-references-'));
  writeFileSync(join(dir, 'model.c4'), MODEL, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, model: readFileSync(join(dir, 'model.c4'), 'utf-8') };
}

/** GONE: the linker's references after are those before minus `gone` ([role, text]), with the same targets. */
async function expectGone(after: string, gone: ReadonlyArray<[string, string]>): Promise<void> {
  const key = (r: { role: string; text: string; target: unknown }) => JSON.stringify([r.role, r.text, r.target]);
  const was = (await linkedCatalogueReferences({ 'model.c4': MODEL })).map(key);
  for (const [role, text] of gone) {
    const i = was.findIndex((k) => {
      const [r, t] = JSON.parse(k) as [string, string];
      return r === role && t === text;
    });
    expect(i, `the reference ${role} '${text}' exists before`).toBeGreaterThanOrEqual(0);
    was.splice(i, 1);
  }
  expect((await linkedCatalogueReferences({ 'model.c4': after })).map(key).sort()).toEqual(was.sort());
}

describe('the four remove ops with and without cascade (row 73)', SLOW, () => {
  const CASES: Array<{ name: string; mutation: Record<string, unknown>; field: string; after: string; gone: Array<[string, string]>; removedViewId?: string }> = [
    {
      name: 'removeElement',
      mutation: { op: 'removeElement', fqn: 'app.api' },
      field: 'fqn',
      after: MODEL.replace('    api = service\n', '').replace('include other, app.api', 'include other'),
      gone: [['predicate-item', 'app.api']],
    },
    {
      name: 'removeDeploymentNode',
      mutation: { op: 'removeDeploymentNode', id: 'prod.inner' },
      field: 'id',
      after: MODEL.replace('    vm inner {\n      a = instanceOf app.db\n    }\n', '').replace('    include prod.inner.a\n', ''),
      gone: [
        ['instance-of', 'app.db'],
        ['predicate-item', 'prod.inner.a'],
      ],
    },
    {
      name: 'removeDeploymentInstance',
      mutation: { op: 'removeDeploymentInstance', id: 'prod.inner.a' },
      field: 'id',
      after: MODEL.replace('      a = instanceOf app.db\n', '').replace('    include prod.inner.a\n', ''),
      gone: [
        ['instance-of', 'app.db'],
        ['predicate-item', 'prod.inner.a'],
      ],
    },
    {
      name: 'removeView',
      mutation: { op: 'removeView', id: 'flow' },
      field: 'id',
      after: MODEL.replace('  dynamic view flow {\n    other -> app.db\n  }\n', '').replace('include app.db with {\n      navigateTo flow\n    }', 'include app.db'),
      gone: [
        ['step-endpoint', 'other'],
        ['step-endpoint', 'app.db'],
        ['navigate-to', 'flow'],
      ],
      removedViewId: 'flow',
    },
  ];

  it.each(CASES)('$name without cascade exits 1 on its field and writes nothing', async ({ mutation, field }) => {
    await expectValidLikeC4({ 'model.c4': MODEL });
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`mutations[0].${field}:`);
    expect(result.model).toBe(MODEL);
  });

  it.each(CASES)('$name with cascade removes the referring constructs', async ({ mutation, after, gone, removedViewId }) => {
    const result = runApply([{ ...mutation, cascade: true }]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.model).toBe(after);
    await expectGone(result.model, gone);
    await expectAcceptedWrite({ 'model.c4': MODEL }, { 'model.c4': result.model }, removedViewId !== undefined ? { removedViewId } : {});
  });
});

describe('a cascade batch is atomic (row 74)', () => {
  it('writes nothing when a later removal is rejected under cascade', () => {
    // app.db is the only step of the dynamic view flow: removing it would empty that view (D77).
    const result = runApply([
      { op: 'removeElement', fqn: 'app.api', cascade: true },
      { op: 'removeElement', fqn: 'app.db', cascade: true },
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutations[1].fqn:');
    expect(result.model).toBe(MODEL);
  });
});

describe('cascade validation (row 75)', () => {
  it.each([
    { name: 'a non-boolean cascade', mutation: { op: 'removeElement', fqn: 'app.api', cascade: 'yes' }, path: 'mutations[0].cascade' },
    { name: 'a non-boolean cascade on removeView', mutation: { op: 'removeView', id: 'flow', cascade: 1 }, path: 'mutations[0].cascade' },
    { name: 'an unknown field', mutation: { op: 'removeDeploymentNode', id: 'prod.inner', cascading: true }, path: 'cascading' },
  ])('$name is rejected', ({ mutation, path }) => {
    const result = runApply([mutation]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.model).toBe(MODEL);
  });
});
