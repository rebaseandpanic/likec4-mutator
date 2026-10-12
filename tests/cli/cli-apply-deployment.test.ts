/**
 * The deployment ops of `apply` (US-13, tests.md rows 75–78): each op runs
 * through the CLI on a copy of a fixture; a malformed mutations file and a
 * write the library rejects exit 1 with the JSON path of the offending field
 * (`mutations[i].<path>`) and leave every source file byte-identical (INV-2).
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { LikeC4Mutator } from '../../src/index.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const ZONES = join(PROJECT_ROOT, 'tests', 'fixtures', 'deployment-zones');

/** Every `.c4` file under `dir`, by path relative to `dir` (as `apply` loads them). */
function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.c4')) files[relative(dir, path)] = readFileSync(path, 'utf-8');
    }
  };
  walk(dir);
  return files;
}

/** A fresh directory holding `files` (relative paths). */
function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-deployment-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text, 'utf-8');
  }
  return dir;
}

/** A fresh copy of the deployment-zones fixture. */
function zonesCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-deployment-'));
  cpSync(ZONES, dir, { recursive: true });
  return dir;
}

function runApply(
  dir: string,
  mutations: unknown[],
  target: { output: string } | 'in-place',
): { status: number | null; stdout: string; stderr: string } {
  const mutationsPath = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-mutations-')), 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const destination = target === 'in-place' ? ['--in-place'] : ['--output', target.output];
  const result = spawnSync(
    'npx',
    ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, ...destination],
    { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 60000 },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run `mutations` in place on `dir`; the command must fail on `path` and
 * leave every file of `dir` as it was.
 */
function expectRejectedAt(dir: string, mutations: unknown[], path: string): void {
  const before = readTree(dir);
  const result = runApply(dir, mutations, 'in-place');
  expect(result.status).toBe(1);
  // The path is the contract (INV-2); it ends at the colon, so a longer
  // path (`mutations[0].source.id` for `mutations[0].source`) does not match.
  expect(result.stderr).toContain(`Error: ${path}: `);
  expect(readTree(dir)).toEqual(before);
}

const WEB = { id: 'prod.eu.vm2.web' };
const API = { id: 'prod.eu.vm1.api' };
const DB = { id: 'prod.eu.vm1.db' };

describe('apply runs every deployment op (row 75)', () => {
  it.each<[string, unknown[], (m: LikeC4Mutator) => void]>([
    [
      'addDeploymentNode',
      [{ op: 'addDeploymentNode', parent: 'prod.eu', name: 'vm4', kind: 'host', title: 'VM 4' }],
      (m) => expect(m.getDeploymentNode('prod.eu.vm4')).toMatchObject({ kind: 'host', title: 'VM 4', parentId: 'prod.eu' }),
    ],
    [
      'addDeploymentNode as a root node in a chosen file',
      [{ op: 'addDeploymentNode', name: 'dr', kind: 'environment', title: 'DR', file: 'ext/eu.c4' }],
      (m) => {
        expect(m.getDeploymentNode('dr')).toMatchObject({ kind: 'environment', title: 'DR' });
        expect(m.getDeploymentNode('dr')?.parentId).toBeUndefined();
      },
    ],
    [
      'updateDeploymentNode',
      [{ op: 'updateDeploymentNode', id: 'prod.eu.vm2', technology: 'Xen' }],
      (m) => expect(m.getDeploymentNode('prod.eu.vm2')?.technology).toBe('Xen'),
    ],
    [
      'removeDeploymentNode',
      [{ op: 'removeDeploymentNode', id: 'prod.eu.vm3' }],
      (m) => {
        expect(m.getDeploymentNode('prod.eu.vm3')).toBeNull();
        expect(m.listDeploymentRelationships().some((r) => r.title === 'proxies')).toBe(false);
      },
    ],
    [
      'addDeploymentInstance',
      [{ op: 'addDeploymentInstance', node: 'prod.eu.vm2', element: 'shop.api', name: 'api3', title: 'API 3' }],
      (m) => expect(m.getDeploymentInstance('prod.eu.vm2.api3')).toMatchObject({ element: 'shop.api', title: 'API 3' }),
    ],
    [
      'updateDeploymentInstance',
      [{ op: 'updateDeploymentInstance', id: 'prod.eu.vm1.api', title: 'Primary API' }],
      (m) => expect(m.getDeploymentInstance('prod.eu.vm1.api')?.title).toBe('Primary API'),
    ],
    [
      'removeDeploymentInstance',
      [{ op: 'removeDeploymentInstance', id: 'prod.eu.cache' }],
      (m) => expect(m.getDeploymentInstance('prod.eu.cache')).toBeNull(),
    ],
    [
      'addDeploymentRelationship with an element part',
      [
        {
          op: 'addDeploymentRelationship',
          source: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' },
          target: { id: 'prod.eu.vm1.api2' },
          kind: 'calls',
          title: 'audits',
          technology: 'HTTP',
        },
      ],
      (m) =>
        expect(m.listDeploymentRelationships().filter((r) => r.title === 'audits')).toEqual([
          expect.objectContaining({
            source: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' },
            target: { id: 'prod.eu.vm1.api2' },
            kind: 'calls',
            technology: 'HTTP',
            bidirectional: false,
          }),
        ]),
    ],
    [
      'updateDeploymentRelationship selected by its title',
      [{ op: 'updateDeploymentRelationship', source: API, target: DB, matchTitle: 'queries', title: 'reads' }],
      (m) => {
        const titles = m
          .listDeploymentRelationships()
          .filter((r) => r.source.id === API.id && r.target.id === DB.id)
          .map((r) => r.title);
        expect(titles).toEqual(['reads']);
      },
    ],
    [
      'removeDeploymentRelationship selected by its kind',
      [{ op: 'removeDeploymentRelationship', source: WEB, target: { id: 'prod.eu.vm1.api2' }, matchKind: 'calls' }],
      (m) => expect(m.listDeploymentRelationships().some((r) => r.title === 'falls back')).toBe(false),
    ],
    [
      'addDeploymentExtend',
      [{ op: 'addDeploymentExtend', node: 'prod.eu.vm2', file: 'deployment.c4', tags: ['internal'], metadata: { owner: 'ops' } }],
      (m) => {
        expect(m.getDeploymentNode('prod.eu.vm2')?.tags).toContain('internal');
        expect(m.getDeploymentNode('prod.eu.vm2')?.metadata).toMatchObject({ owner: 'ops' });
      },
    ],
    [
      'removeDeploymentExtend',
      [{ op: 'removeDeploymentExtend', node: 'prod.eu', file: 'ext/eu.c4', occurrence: 1 }],
      (m) => {
        // The block contributed #internal and held node vm3 and its relationship.
        expect(m.getDeploymentNode('prod.eu')?.tags ?? []).not.toContain('internal');
        expect(m.getDeploymentNode('prod.eu.vm3')).toBeNull();
        expect(m.listDeploymentRelationships().some((r) => r.title === 'proxies')).toBe(false);
      },
    ],
  ])('%s', async (_, mutations, readBack) => {
    const source = zonesCopy();
    const output = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-deployment-out-'));
    const result = runApply(source, mutations, { output });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const out = readTree(output);
    expect(Object.keys(out).sort()).toEqual(Object.keys(readTree(ZONES)).sort());
    await expectValidLikeC4(out);
    readBack(LikeC4Mutator.fromFiles(out));
  });
});

/**
 * Between prod.eu.vm2 and prod.eu.vm1 the fixture declares two relationships
 * of kind `syncs` (spec: title 'Synchronizes', technology 'TCP'): one with
 * the kind's title, one titled 'mirrors'.  The batch first adds a third of
 * kind `calls`, so `matchKind` and `matchTitle` each have to narrow.
 */
describe('apply narrows a deployment relationship selector by matchKind and matchTitle (row 75)', () => {
  const VM2 = { id: 'prod.eu.vm2' };
  const VM1 = { id: 'prod.eu.vm1' };
  const ADD_CALLS = { op: 'addDeploymentRelationship', source: VM2, target: VM1, kind: 'calls', title: 'pings' };

  /** The relationships between vm2 and vm1, in either direction, by title (code-unit order). */
  function pair(m: LikeC4Mutator): Array<{ kind?: string; title?: string; technology?: string }> {
    return m
      .listDeploymentRelationships()
      .filter((r) => [r.source, r.target].every((e) => e.element === undefined && (e.id === VM1.id || e.id === VM2.id)))
      .filter((r) => r.source.id !== r.target.id)
      .map((r) => ({ kind: r.kind, title: r.title, technology: r.technology }))
      .sort((a, b) => ((a.title ?? '') < (b.title ?? '') ? -1 : 1));
  }

  it.each<[string, Record<string, unknown>, ReturnType<typeof pair>]>([
    [
      'update by matchKind',
      { op: 'updateDeploymentRelationship', source: VM2, target: VM1, matchKind: 'calls', technology: 'ICMP' },
      [
        { kind: 'syncs', title: 'Synchronizes', technology: 'TCP' },
        { kind: 'syncs', title: 'mirrors', technology: 'TCP' },
        { kind: 'calls', title: 'pings', technology: 'ICMP' },
      ],
    ],
    [
      'update by matchTitle',
      { op: 'updateDeploymentRelationship', source: VM2, target: VM1, matchTitle: 'mirrors', technology: 'rsync' },
      [
        { kind: 'syncs', title: 'Synchronizes', technology: 'TCP' },
        { kind: 'syncs', title: 'mirrors', technology: 'rsync' },
        { kind: 'calls', title: 'pings', technology: undefined },
      ],
    ],
    [
      'remove by matchKind',
      { op: 'removeDeploymentRelationship', source: VM2, target: VM1, matchKind: 'calls' },
      [
        { kind: 'syncs', title: 'Synchronizes', technology: 'TCP' },
        { kind: 'syncs', title: 'mirrors', technology: 'TCP' },
      ],
    ],
    [
      'remove by matchTitle',
      { op: 'removeDeploymentRelationship', source: VM2, target: VM1, matchTitle: 'Synchronizes' },
      [
        { kind: 'syncs', title: 'mirrors', technology: 'TCP' },
        { kind: 'calls', title: 'pings', technology: undefined },
      ],
    ],
  ])('%s touches only the selected relationship', async (_, mutation, expected) => {
    // Precondition: the two syncs relationships the selector has to tell apart.
    expect(pair(LikeC4Mutator.fromFiles(readTree(ZONES)))).toEqual([
      { kind: 'syncs', title: 'Synchronizes', technology: 'TCP' },
      { kind: 'syncs', title: 'mirrors', technology: 'TCP' },
    ]);
    const output = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-deployment-out-'));
    const result = runApply(zonesCopy(), [ADD_CALLS, mutation], { output });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const out = readTree(output);
    await expectValidLikeC4(out);
    expect(pair(LikeC4Mutator.fromFiles(out))).toEqual(expected);
  });
});

/** A valid mutation of each op on deployment-zones, to which a case adds a field. */
const VALID: Record<string, Record<string, unknown>> = {
  addDeploymentNode: { op: 'addDeploymentNode', parent: 'prod.eu', name: 'vm4', kind: 'host' },
  updateDeploymentNode: { op: 'updateDeploymentNode', id: 'prod.eu.vm2', technology: 'Xen' },
  removeDeploymentNode: { op: 'removeDeploymentNode', id: 'prod.eu.vm3' },
  addDeploymentInstance: { op: 'addDeploymentInstance', node: 'prod.eu.vm2', element: 'shop.api', name: 'api3' },
  updateDeploymentInstance: { op: 'updateDeploymentInstance', id: 'prod.eu.vm1.api', title: 'T' },
  removeDeploymentInstance: { op: 'removeDeploymentInstance', id: 'prod.eu.cache' },
  addDeploymentRelationship: { op: 'addDeploymentRelationship', source: WEB, target: DB },
  updateDeploymentRelationship: { op: 'updateDeploymentRelationship', source: API, target: DB, title: 'T' },
  removeDeploymentRelationship: { op: 'removeDeploymentRelationship', source: API, target: DB },
  addDeploymentExtend: { op: 'addDeploymentExtend', node: 'prod.eu.vm2', file: 'deployment.c4', tags: ['internal'] },
  removeDeploymentExtend: { op: 'removeDeploymentExtend', node: 'prod.eu', file: 'ext/eu.c4' },
};

function without(mutation: Record<string, unknown>, field: string): Record<string, unknown> {
  const { [field]: _, ...rest } = mutation;
  return rest;
}

describe('apply rejects a malformed deployment mutation before writing (row 76)', () => {
  it.each(Object.keys(VALID))('an unknown field of %s', (op) => {
    expectRejectedAt(zonesCopy(), [VALID.addDeploymentNode, { ...VALID[op], colour: 'red' }], 'mutations[1].colour');
  });

  it.each<[string, Record<string, unknown>, string]>([
    // Unknown fields inside nested objects, and a field one op has and another lacks.
    ['inside an endpoint', { ...VALID.addDeploymentRelationship, source: { ...WEB, x: 1 } }, 'mutations[0].source.x'],
    ['inside a selector endpoint', { ...VALID.removeDeploymentRelationship, target: { ...DB, kind: 'calls' } }, 'mutations[0].target.kind'],
    ['inside style', { ...VALID.updateDeploymentNode, style: { colour: 'red' } }, 'mutations[0].style.colour'],
    ['inside a relationship style', { ...VALID.addDeploymentRelationship, style: { shape: 'cylinder' } }, 'mutations[0].style.shape'],
    ['inside links', { ...VALID.addDeploymentExtend, links: [{ url: 'https://example.com', title: 'x' }] }, 'mutations[0].links[0].title'],
    ['file of an instance', { ...VALID.addDeploymentInstance, file: 'deployment.c4' }, 'mutations[0].file'],
    ['kind of a relationship selector', { ...VALID.removeDeploymentRelationship, kind: 'calls' }, 'mutations[0].kind'],
    // Wrong types.
    ['bidirectional as a string', { ...VALID.addDeploymentRelationship, bidirectional: 'yes' }, 'mutations[0].bidirectional'],
    ['occurrence 0', { ...VALID.removeDeploymentExtend, occurrence: 0 }, 'mutations[0].occurrence'],
    ['occurrence 1.5', { ...VALID.removeDeploymentExtend, occurrence: 1.5 }, 'mutations[0].occurrence'],
    ['occurrence as a string', { ...VALID.removeDeploymentExtend, occurrence: '1' }, 'mutations[0].occurrence'],
    ['parent as a number', { ...VALID.addDeploymentNode, parent: 5 }, 'mutations[0].parent'],
    ['an endpoint as a string', { ...VALID.addDeploymentRelationship, source: 'prod.eu.vm2.web' }, 'mutations[0].source'],
    ['a selector endpoint as an array', { ...VALID.updateDeploymentRelationship, target: [DB.id] }, 'mutations[0].target'],
    ['an endpoint id as a number', { ...VALID.addDeploymentRelationship, source: { id: 5 } }, 'mutations[0].source.id'],
    ['an element part as a number', { ...VALID.addDeploymentRelationship, target: { ...API, element: 7 } }, 'mutations[0].target.element'],
    ['matchTitle as a number', { ...VALID.updateDeploymentRelationship, matchTitle: 1 }, 'mutations[0].matchTitle'],
    ['metadata of an add as null', { ...VALID.addDeploymentNode, metadata: { owner: null } }, 'mutations[0].metadata.owner'],
    ['tags as a string', { ...VALID.updateDeploymentInstance, tags: 'internal' }, 'mutations[0].tags'],
    // Missing required fields.
    ['addDeploymentNode without kind', without(VALID.addDeploymentNode, 'kind'), 'mutations[0].kind'],
    ['addDeploymentNode without name', without(VALID.addDeploymentNode, 'name'), 'mutations[0].name'],
    ['updateDeploymentNode without id', without(VALID.updateDeploymentNode, 'id'), 'mutations[0].id'],
    ['removeDeploymentInstance without id', without(VALID.removeDeploymentInstance, 'id'), 'mutations[0].id'],
    ['addDeploymentInstance without element', without(VALID.addDeploymentInstance, 'element'), 'mutations[0].element'],
    ['addDeploymentInstance without node', without(VALID.addDeploymentInstance, 'node'), 'mutations[0].node'],
    ['addDeploymentRelationship without target', without(VALID.addDeploymentRelationship, 'target'), 'mutations[0].target'],
    ['removeDeploymentRelationship without source', without(VALID.removeDeploymentRelationship, 'source'), 'mutations[0].source'],
    ['an endpoint without id', { ...VALID.addDeploymentRelationship, source: { element: 'shop.api' } }, 'mutations[0].source.id'],
    ['addDeploymentExtend without file', without(VALID.addDeploymentExtend, 'file'), 'mutations[0].file'],
    ['removeDeploymentExtend without node', without(VALID.removeDeploymentExtend, 'node'), 'mutations[0].node'],
    // Nothing to change.
    ['updateDeploymentNode without a patch field', { op: 'updateDeploymentNode', id: 'prod.eu.vm2' }, 'mutations[0]'],
    ['updateDeploymentInstance without a patch field', { op: 'updateDeploymentInstance', id: 'prod.eu.vm1.api' }, 'mutations[0]'],
    [
      'updateDeploymentRelationship with a selector only',
      { op: 'updateDeploymentRelationship', source: API, target: DB, matchTitle: 'queries' },
      'mutations[0]',
    ],
    ['addDeploymentExtend contributing nothing', { ...VALID.addDeploymentExtend, tags: [] }, 'mutations[0]'],
  ])('%s', (_, mutation, path) => {
    expectRejectedAt(zonesCopy(), [mutation], path);
  });
});

describe('apply reports a deployment write the library rejects and writes no earlier mutation (row 77)', () => {
  it.each<[string, Record<string, unknown>, string]>([
    [
      // D14: the instance has no own metadata; deleting every key of its
      // element would leave an empty own map, and the element's keys apply again.
      'an instance metadata patch that cannot read back',
      { op: 'updateDeploymentInstance', id: 'prod.eu.vm1.api', metadata: { owner: null, tier: null } },
      'mutations[1].metadata.',
    ],
    ['a file that is not loaded', { op: 'addDeploymentNode', name: 'dr', kind: 'environment', file: 'missing.c4' }, 'mutations[1].file: '],
    ['a node id that is not declared', { op: 'updateDeploymentNode', id: 'prod.eu.vm9', technology: 'Xen' }, 'mutations[1].id: '],
    ['an instance into a node that is not declared', { ...VALID.addDeploymentInstance, node: 'prod.eu.vm9' }, 'mutations[1].node: '],
    [
      'an unresolved deployment part',
      { op: 'addDeploymentRelationship', source: { id: 'prod.eu.vm9' }, target: DB },
      'mutations[1].source.id: ',
    ],
    [
      'an unresolved element part',
      { op: 'addDeploymentRelationship', source: { ...API, element: 'shop.api.missing' }, target: DB },
      'mutations[1].source.element: ',
    ],
    [
      'endpoints in one hierarchy',
      { op: 'addDeploymentRelationship', source: { id: 'prod.eu.vm1' }, target: API },
      'mutations[1].target: ',
    ],
    [
      'an update selector that matches nothing',
      { op: 'updateDeploymentRelationship', source: API, target: DB, matchTitle: 'missing', title: 'T' },
      'mutations[1].source: ',
    ],
    ['an extend block that the file does not have', { ...VALID.removeDeploymentExtend, file: 'deployment.c4' }, 'mutations[1].node: '],
  ])('%s', (_, mutation, prefix) => {
    const dir = zonesCopy();
    const before = readTree(dir);
    // The first mutation succeeds in memory; the rejection must keep it unwritten.
    const result = runApply(dir, [VALID.addDeploymentNode, mutation], 'in-place');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Error: ${prefix}`);
    expect(readTree(dir)).toEqual(before);
  });
});

describe('the US-12 checks of addElement and removeElement through apply (row 78)', () => {
  const files = {
    'model.c4': `specification {
  element service
  deploymentNode node
}
model {
  app = service {
    api = service
  }
  other = service {
    db = service
  }
}
deployment {
  node n {
    instanceOf api
  }
}
`,
  };

  it.each<[string, Record<string, unknown>, string]>([
    // `instanceOf api` resolves to app.api as its unique descendant; a
    // second `api` would make it ambiguous.  apply names the element `id`.
    ['addElement that would re-target instanceOf', { op: 'addElement', parent: 'other', kind: 'service', id: 'api', title: 'API' }, 'mutations[0].id'],
    ['removeElement of a deployed element', { op: 'removeElement', fqn: 'app.api' }, 'mutations[0].fqn'],
  ])('%s', async (_, mutation, path) => {
    await expectValidLikeC4(files);
    expectRejectedAt(workspace(files), [mutation], path);
  });
});
