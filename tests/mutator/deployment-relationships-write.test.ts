/**
 * Adding, updating and removing deployment relationships (US-10).
 *
 *  - Addition: every connector with all options (row 64), endpoints and
 *    rejection classes (row 65), an explicit file without a `deployment`
 *    block (row 66).
 *  - Update by selector (row 67), selector misses and ambiguity (row 68),
 *    removal (row 69), the syntax-error guard (row 70).
 *  - Unsafe endpoint input (row 89).
 *
 * Expected values come from the request itself, the input text, and the
 * model LikeC4 1.59.4 builds from the same files (`buildLikeC4Model`,
 * `validateLikeC4` and the deployment agreement helpers).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type {
  AddDeploymentRelationshipOpts,
  DeploymentRelationshipSelector,
  UpdateDeploymentRelationshipPatch,
} from '../../src/mutator/deployment-ops.js';
import type { DeploymentEndpoint } from '../../src/query/types.js';
import {
  buildLikeC4Model,
  expectDeploymentInstancesAgreeWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectDeploymentRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
  validateLikeC4,
} from '../helpers/likec4-model.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

/** Every `.c4` file of a fixture workspace, keyed by its path relative to the workspace. */
function readWorkspace(name: string): Record<string, string> {
  const root = join(FIXTURES, name);
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.c4')) files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

/** `files` with `search` in `file` replaced by `replacement`; the text must occur. */
function edited(files: Record<string, string>, file: string, search: string, replacement: string): Record<string, string> {
  expect(files[file], `${file} contains ${search}`).toContain(search);
  return { ...files, [file]: files[file]!.replace(search, replacement) };
}

/** BI: run `write`, expect an InvalidWriteError on `field`, no file changed and every deployment read as before. */
function expectRejected(m: LikeC4Mutator, field: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  const nodes = m.listDeploymentNodes();
  const instances = m.listDeploymentInstances();
  const relationships = m.listDeploymentRelationships();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before);
  expect(m.listDeploymentNodes()).toEqual(nodes);
  expect(m.listDeploymentInstances()).toEqual(instances);
  expect(m.listDeploymentRelationships()).toEqual(relationships);
  return error as InvalidWriteError;
}

/** Wv: the output is valid and every deployment read agrees with LikeC4. */
async function expectValidWrite(m: LikeC4Mutator): Promise<void> {
  const files = m.serialize();
  await expectValidLikeC4(files);
  await expectDeploymentNodesAgreeWithLikeC4(files, m.listDeploymentNodes());
  await expectDeploymentInstancesAgreeWithLikeC4(files, m.listDeploymentInstances());
  await expectDeploymentRelationshipsAgreeWithLikeC4(files, m.listDeploymentRelationships());
}

/** LikeC4's errors as a sorted list with line numbers dropped (a write moves lines). */
async function errorSet(files: Record<string, string>): Promise<string[]> {
  return (await validateLikeC4(files)).map((e) => e.replace(/:\d+:/, ':')).sort();
}

/** A deployment relation of LikeC4's model with its getter values, endpoints in the library's form. */
interface LikeC4Relation {
  source: DeploymentEndpoint;
  target: DeploymentEndpoint;
  kind?: string;
  bidirectional: boolean;
  title?: string;
  description?: string;
  technology?: string;
  tags: readonly string[];
  links: Array<{ url: string; label?: string }>;
  metadata: Record<string, string | string[]>;
  line?: string;
  color?: string;
}

/** The deployment relations of LikeC4's model of `files`, in model order. */
async function likec4Relations(files: Record<string, string>): Promise<LikeC4Relation[]> {
  const { deployments } = await buildLikeC4Model(files);
  const endpoint = (e: { deployment: string; element?: string }): DeploymentEndpoint =>
    e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
  return deployments.relations.map((r) => {
    const getters = deployments.relationGetters[r.id]!;
    return {
      source: endpoint(r.source),
      target: endpoint(r.target),
      ...(r.kind !== undefined && { kind: r.kind }),
      bidirectional: r.isBidirectional === true,
      ...(getters.title !== undefined && { title: getters.title }),
      ...(getters.description !== undefined && { description: getters.description }),
      ...(getters.technology !== undefined && { technology: getters.technology }),
      tags: getters.tags,
      links: getters.links.map(({ url, title }) => (title === undefined ? { url } : { url, label: title })),
      metadata: getters.metadata,
      ...(r.line !== undefined && { line: r.line }),
      ...(r.color !== undefined && { color: r.color }),
    };
  });
}

/** The one relation of LikeC4's model of `files` with this title. */
async function likec4Relation(files: Record<string, string>, title: string): Promise<LikeC4Relation> {
  const found = (await likec4Relations(files)).filter((r) => r.title === title);
  expect(found, `LikeC4 relations titled '${title}'`).toHaveLength(1);
  return found[0]!;
}

/** `[source, target, title]` keys of relations, sorted, to compare relation sets. */
const keys = (relations: ReadonlyArray<{ source: DeploymentEndpoint; target: DeploymentEndpoint; title?: string }>): string[] =>
  relations.map((r) => JSON.stringify([r.source, r.target, r.title ?? null])).sort();

describe('US-10 addition, every connector (row 64)', () => {
  // Per fixture: two endpoints that are not in one hierarchy, a declared
  // relationship kind without defaults and a declared tag.  The fixture's
  // deployment.c4 ends its `deployment` block right before `views`.
  const CASES: Array<{ fixture: string; source: DeploymentEndpoint; target: DeploymentEndpoint; kind: string; tag: string }> = [
    { fixture: 'deployment-zones', source: { id: 'prod.eu.vm2.web' }, target: { id: 'prod.eu.vm1.db' }, kind: 'calls', tag: 'public' },
    { fixture: 'deployment-clusters', source: { id: 'main.k8s.data.storage' }, target: { id: 'main.k8s.apps.ui' }, kind: 'streams', tag: 'spot' },
  ];
  const CONNECTORS = (kind: string): Array<{ title: string; opts: AddDeploymentRelationshipOpts; connector: string }> => [
    { title: 'Plain', opts: {}, connector: '->' },
    { title: 'Both ways', opts: { bidirectional: true }, connector: '<->' },
    { title: 'Of kind', opts: { kind }, connector: `-[${kind}]->` },
    { title: 'Of kind both ways', opts: { kind, bidirectional: true }, connector: `-[${kind}]<->` },
  ];

  it.each(CASES)('$fixture', async ({ fixture, source, target, kind, tag }) => {
    const files = readWorkspace(fixture);
    // P: the input is valid and LikeC4 has deployment relations and both endpoints.
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.relations.length).toBeGreaterThan(0);
    expect(deployments.elements[source.id]).toBeDefined();
    expect(deployments.elements[target.id]).toBeDefined();

    const m = LikeC4Mutator.fromFiles(files);
    const connectors = CONNECTORS(kind);
    for (const { title, opts } of connectors) {
      m.addDeploymentRelationship(source, target, {
        ...opts,
        title,
        description: `${title}: description`,
        technology: `${title}: technology`,
        tags: [tag],
        links: [{ url: 'https://example.com/rel', label: 'Rel' }],
        metadata: { owner: 'team', zones: ['a', 'b'] },
        style: { line: 'dashed', color: 'red' },
      });
    }

    // Placement: at the top level of the first deployment block, after what
    // was there; no other file changed.
    const text = files['deployment.c4']!;
    const blockEnd = text.indexOf('\n}\n\nviews {');
    expect(blockEnd).toBeGreaterThan(0);
    const after = m.serialize();
    expect(after['deployment.c4']!.startsWith(text.slice(0, blockEnd))).toBe(true);
    expect(after['deployment.c4']!.endsWith(text.slice(blockEnd))).toBe(true);
    const inserted = after['deployment.c4']!.slice(blockEnd, after['deployment.c4']!.length - (text.length - blockEnd));
    for (const { title, connector } of connectors) {
      expect(inserted).toContain(`\n  ${source.id} ${connector} ${target.id} '${title}'`);
    }
    for (const file of Object.keys(files).filter((f) => f !== 'deployment.c4')) expect(after[file]).toBe(files[file]);

    // Values as LikeC4 reads them: the request (an inline description or
    // technology would read as none).
    for (const { title, opts } of connectors) {
      expect(await likec4Relation(after, title)).toEqual({
        source,
        target,
        ...(opts.kind !== undefined && { kind: opts.kind }),
        bidirectional: opts.bidirectional === true,
        title,
        description: `${title}: description`,
        technology: `${title}: technology`,
        tags: [tag],
        links: [{ url: 'https://example.com/rel', label: 'Rel' }],
        metadata: { owner: 'team', zones: ['a', 'b'] },
        line: 'dashed',
        color: 'red',
      });
    }
    await expectValidWrite(m);
  });
});

describe('endpoints of an addition (row 65)', () => {
  it('writes a node, an instance and an element part as given', async () => {
    const files = readWorkspace('deployment-zones');
    const m = LikeC4Mutator.fromFiles(files);
    // `vm2` is unique below the block; the element part is the FQN, written
    // as the path from the instance's element.
    m.addDeploymentRelationship({ id: 'vm2' }, { id: 'prod.eu.vm1.api', element: 'shop.api.handler' }, { title: 'Into handler' });
    // The element parts are parent and child in the logical model, the
    // deployment parts are siblings: LikeC4 accepts it.
    m.addDeploymentRelationship({ id: 'prod.eu.vm1.api' }, { id: 'prod.eu.vm1.api2', element: 'shop.api.handler' }, { title: 'Across' });

    const after = m.serialize()['deployment.c4']!;
    expect(after).toContain("\n  vm2 -> prod.eu.vm1.api.handler 'Into handler'");
    expect(after).toContain("\n  prod.eu.vm1.api -> prod.eu.vm1.api2.handler 'Across'");
    expect(await likec4Relation(m.serialize(), 'Into handler')).toMatchObject({
      source: { id: 'prod.eu.vm2' },
      target: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' },
    });
    expect(await likec4Relation(m.serialize(), 'Across')).toMatchObject({
      source: { id: 'prod.eu.vm1.api' },
      target: { id: 'prod.eu.vm1.api2', element: 'shop.api.handler' },
    });
    await expectValidWrite(m);
  });

  const REJECTED: Array<{ name: string; source: DeploymentEndpoint; target: DeploymentEndpoint; opts?: AddDeploymentRelationshipOpts; field: string }> = [
    { name: 'an unresolved source', source: { id: 'nosuch' }, target: { id: 'prod.eu.vm1' }, field: 'source.id' },
    { name: 'an unresolved target', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.nosuch' }, field: 'target.id' },
    { name: 'a model-only FQN', source: { id: 'prod.eu.vm2' }, target: { id: 'shop.api' }, field: 'target.id' },
    { name: 'an id that steps into an element', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1.api.handler' }, field: 'target.id' },
    { name: 'an unresolved element part', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1.api', element: 'shop.api.nosuch' }, field: 'target.element' },
    { name: 'an element outside the instance', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1.api', element: 'shop.db' }, field: 'target.element' },
    { name: 'an element part of a node', source: { id: 'prod.eu.vm2', element: 'shop.web' }, target: { id: 'prod.eu.vm1' }, field: 'source.element' },
    { name: 'self', source: { id: 'prod.eu.vm1' }, target: { id: 'prod.eu.vm1' }, field: 'target' },
    { name: 'a parent and its child', source: { id: 'prod.eu' }, target: { id: 'prod.eu.vm1.api' }, field: 'target' },
    { name: 'a child and its parent', source: { id: 'prod.eu.vm1.db' }, target: { id: 'prod.eu.vm1' }, field: 'target' },
    {
      name: 'two elements of one instance',
      source: { id: 'prod.eu.vm1.api' },
      target: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' },
      field: 'target',
    },
    { name: 'an undeclared kind', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, opts: { kind: 'nokind' }, field: 'kind' },
    { name: 'an undeclared tag', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, opts: { tags: ['nosuch'] }, field: 'tags[0]' },
    { name: 'an invalid style', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, opts: { style: { line: 'wavy' as 'solid' } }, field: 'style.line' },
    { name: 'an empty metadata list', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, opts: { metadata: { k: [] } }, field: 'metadata.k' },
    { name: 'a file not loaded', source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, opts: { file: 'nosuch.c4' }, field: 'file' },
  ];

  it.each(REJECTED)('rejects $name on $field', ({ source, target, opts, field }) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, field, () => m.addDeploymentRelationship(source, target, opts));
  });

  it('LikeC4 reports the refused endpoints when they are written by hand', async () => {
    const files = readWorkspace('deployment-zones');
    const written = (line: string) => edited(files, 'deployment.c4', '\n}\n\nviews {', `\n  ${line}\n}\n\nviews {`);
    for (const line of [
      'nosuch -> prod.eu.vm1',
      'prod.eu.vm2 -> shop.api',
      'prod.eu.vm2 -> prod.eu.vm1.api.nosuch',
      'prod.eu.vm1 -> prod.eu.vm1',
      'prod.eu -> prod.eu.vm1.api',
      'prod.eu.vm1.api -> prod.eu.vm1.api.handler',
    ]) {
      expect(await validateLikeC4(written(line)), line).not.toEqual([]);
    }
  });
});

describe('explicit file without a deployment block (row 66)', () => {
  const files: Record<string, string> = { ...readWorkspace('deployment-zones'), 'extra.c4': 'model {\n}\n' };

  it('writes into a new block of that file and resolves the endpoints from there', async () => {
    // P: the input is valid and only other files have deployment blocks.
    await expectValidLikeC4(files);
    expect(files['extra.c4']).not.toContain('deployment');

    const m = LikeC4Mutator.fromFiles(files);
    // `prod` is a project root node: it resolves from any file.
    m.addDeploymentRelationship({ id: 'prod.eu.vm2' }, { id: 'prod.eu.vm1' }, { title: 'From extra', file: 'extra.c4' });
    const after = m.serialize();
    expect(after['extra.c4']!.startsWith(files['extra.c4']!)).toBe(true);
    expect(after['extra.c4']).toContain("\n  prod.eu.vm2 -> prod.eu.vm1 'From extra'\n");
    for (const file of Object.keys(files).filter((f) => f !== 'extra.c4')) expect(after[file]).toBe(files[file]);
    expect(await likec4Relation(after, 'From extra')).toMatchObject({ source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' } });
    await expectValidWrite(m);
  });

  it('rejects a name that is unique only in another file’s deployment blocks', async () => {
    // OP: LikeC4 does not resolve `vm2` from a block of extra.c4, but does
    // from the first block of deployment.c4.
    const byHand = { ...files, 'extra.c4': `${files['extra.c4']}\ndeployment {\n  vm2 -> prod.eu.vm1\n}\n` };
    expect(await validateLikeC4(byHand)).not.toEqual([]);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'source.id', () =>
      m.addDeploymentRelationship({ id: 'vm2' }, { id: 'prod.eu.vm1' }, { title: 'Short', file: 'extra.c4' }),
    );
    m.addDeploymentRelationship({ id: 'vm2' }, { id: 'prod.eu.vm1' }, { title: 'Short' });
    expect(m.serialize()['deployment.c4']).toContain("\n  vm2 -> prod.eu.vm1 'Short'\n");
    await expectValidWrite(m);
  });
});

describe('US-10 update by selector (row 67)', () => {
  const INLINE = "'replicates' 'inline description' 'inline technology'";
  const CASES: Array<{
    fixture: string;
    files: () => Record<string, string>;
    updates: Array<{ selector: DeploymentRelationshipSelector; patch: UpdateDeploymentRelationshipPatch; expected: Partial<LikeC4Relation> & { title: string } }>;
    kept?: string;
  }> = [
    {
      fixture: 'deployment-zones',
      // A relation with a description and a technology on its line, which
      // LikeC4 ignores.
      files: () => edited(readWorkspace('deployment-zones'), 'deployment.c4', "'replicates'", INLINE),
      kept: "'inline description' 'inline technology'",
      updates: [
        {
          // Bidirectional, selected in the other order; its tag is on the line.
          selector: { source: { id: 'prod.eu.vm1' }, target: { id: 'prod.eu.vm2' }, title: 'mirrors' },
          patch: {
            title: 'Mirrors',
            description: 'Copies data',
            technology: 'rsync',
            tags: ['public'],
            links: [{ url: 'https://example.com/mirror' }],
            metadata: { owner: 'ops' },
            style: { color: 'red' },
          },
          expected: {
            source: { id: 'prod.eu.vm2' },
            target: { id: 'prod.eu.vm1' },
            title: 'Mirrors',
            description: 'Copies data',
            technology: 'rsync',
            tags: ['public'],
            links: [{ url: 'https://example.com/mirror' }],
            metadata: { owner: 'ops' },
            color: 'red',
          },
        },
        {
          // Metadata merges with null, style merges, links are cleared.
          selector: { source: { id: 'prod.eu.vm1.api' }, target: { id: 'prod.eu.vm1.api2' }, kind: 'calls' },
          patch: { metadata: { owner: null, region: 'eu' }, style: { color: 'green' }, links: [] },
          expected: { title: 'fails over', metadata: { region: 'eu' }, line: 'dotted', color: 'green', links: [] },
        },
        {
          selector: { source: { id: 'prod.eu.vm1.api2' }, target: { id: 'prod.eu.vm1.db' } },
          patch: { description: 'Body description', technology: 'Body technology' },
          expected: { title: 'replicates', description: 'Body description', technology: 'Body technology' },
        },
      ],
    },
    {
      fixture: 'deployment-clusters',
      files: () => readWorkspace('deployment-clusters'),
      updates: [
        {
          // An element-part target.
          selector: {
            source: { id: 'main.k8s.apps.backendB' },
            target: { id: 'main.k8s.apps.backendA', element: 'portal.backend.jobs.broker' },
          },
          patch: { title: 'Queues', tags: ['spot'] },
          expected: { target: { id: 'main.k8s.apps.backendA', element: 'portal.backend.jobs.broker' }, title: 'Queues', tags: ['spot'] },
        },
        {
          // A tag on the line of a `.kind` relation.
          selector: { source: { id: 'main.k8s.data.storage' }, target: { id: 'main.k8s.apps.backendB' }, kind: 'publishes' },
          patch: { tags: ['critical'], technology: 'gRPC' },
          expected: { title: 'pushes', tags: ['critical'], technology: 'gRPC' },
        },
        {
          // Bidirectional, selected in the other order.
          selector: { source: { id: 'main.k8s.data' }, target: { id: 'main.k8s.apps' } },
          patch: { metadata: { costCenter: null, owner: 'data' }, style: { line: 'dotted' } },
          expected: { title: 'replicates', metadata: { owner: 'data' }, line: 'dotted', color: 'red' },
        },
      ],
    },
  ];

  it.each(CASES)('$fixture', async ({ files: input, updates, kept }) => {
    const files = input();
    // P: the input is valid and LikeC4 has the relations the selectors name.
    await expectValidLikeC4(files);
    const before = await likec4Relations(files);
    for (const { selector } of updates) {
      expect(before.some((r) => r.title === (selector.title ?? r.title) && r.kind === (selector.kind ?? r.kind))).toBe(true);
    }

    const m = LikeC4Mutator.fromFiles(files);
    for (const { selector, patch } of updates) {
      expect(m.updateDeploymentRelationship(selector, patch)).toEqual({ changedFiles: ['deployment.c4'] });
    }
    const after = m.serialize();
    for (const { expected } of updates) expect(await likec4Relation(after, expected.title)).toMatchObject(expected);
    if (kept !== undefined) expect(after['deployment.c4']).toContain(kept);
    await expectValidWrite(m);
  });

  it('reports no changed file when the patch changes nothing', () => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expect(
      m.updateDeploymentRelationship({ source: { id: 'prod.eu.vm1.api' }, target: { id: 'prod.eu.vm1.db' } }, { tags: [] }),
    ).toEqual({ changedFiles: [] });
  });
});

describe('selector misses and ambiguity (row 68)', () => {
  const files = readWorkspace('deployment-zones');
  const BOTH = { source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' } };

  it('rejects a selector that matches several relationships, naming them, and accepts it narrowed', async () => {
    // OP: LikeC4 has two relations from vm2 to vm1, told apart by title.
    const titles = (await likec4Relations(files))
      .filter((r) => r.source.id === 'prod.eu.vm2' && r.target.id === 'prod.eu.vm1')
      .map((r) => r.title)
      .sort();
    expect(titles).toEqual(['Synchronizes', 'mirrors']);

    const m = LikeC4Mutator.fromFiles(files);
    for (const error of [
      expectRejected(m, 'source', () => m.updateDeploymentRelationship(BOTH, { technology: 'X' })),
      expectRejected(m, 'source', () => m.removeDeploymentRelationship(BOTH)),
    ]) {
      for (const title of titles) expect(error.detail).toContain(title!);
    }

    m.updateDeploymentRelationship({ ...BOTH, title: 'Synchronizes' }, { technology: 'UDP' });
    expect((await likec4Relation(m.serialize(), 'Synchronizes')).technology).toBe('UDP');
    expect((await likec4Relation(m.serialize(), 'mirrors')).technology).toBe('TCP');
    await expectValidWrite(m);
  });

  it('rejects a selector that matches nothing', () => {
    const m = LikeC4Mutator.fromFiles(files);
    const misses: DeploymentRelationshipSelector[] = [
      { source: { id: 'prod.eu.vm1' }, target: { id: 'prod.eu.vm2.web' } },
      // A one-way relationship does not match in the other order.
      { source: { id: 'prod.eu.vm1.api2' }, target: { id: 'prod.eu.vm1.api' } },
      { ...BOTH, kind: 'calls' },
      { ...BOTH, title: 'nosuch' },
      // The element part is part of the endpoint.
      { source: { id: 'prod.eu.vm2.web' }, target: { id: 'prod.eu.vm1.api', element: 'shop.api' } },
    ];
    for (const selector of misses) {
      expectRejected(m, 'source', () => m.updateDeploymentRelationship(selector, { technology: 'X' }));
      expectRejected(m, 'source', () => m.removeDeploymentRelationship(selector));
    }
  });

  it('rejects relationships the selector cannot tell apart', async () => {
    const twice = edited(
      files,
      'deployment.c4',
      "  prod.eu.vm1.api2 <-> prod.eu.vm1.db 'replicates'\n",
      "  prod.eu.vm1.api2 <-> prod.eu.vm1.db 'replicates'\n  prod.eu.vm1.api2 <-> prod.eu.vm1.db 'replicates'\n",
    );
    expect((await likec4Relations(twice)).filter((r) => r.title === 'replicates')).toHaveLength(2);

    const m = LikeC4Mutator.fromFiles(twice);
    const selector = { source: { id: 'prod.eu.vm1.api2' }, target: { id: 'prod.eu.vm1.db' }, title: 'replicates' };
    expectRejected(m, 'source', () => m.updateDeploymentRelationship(selector, { technology: 'X' }));
    expectRejected(m, 'source', () => m.removeDeploymentRelationship(selector));
  });
});

describe('US-10 removal (row 69)', () => {
  const CASES: Array<{ fixture: string; selector: DeploymentRelationshipSelector; removed: { source: DeploymentEndpoint; target: DeploymentEndpoint; title: string } }> = [
    {
      fixture: 'deployment-zones',
      selector: { source: { id: 'prod.eu.vm1.api' }, target: { id: 'prod.eu.vm1.db' } },
      removed: { source: { id: 'prod.eu.vm1.api' }, target: { id: 'prod.eu.vm1.db' }, title: 'queries' },
    },
    {
      fixture: 'deployment-zones',
      selector: { source: { id: 'prod.eu.vm1' }, target: { id: 'prod.eu.vm2' }, title: 'mirrors' },
      removed: { source: { id: 'prod.eu.vm2' }, target: { id: 'prod.eu.vm1' }, title: 'mirrors' },
    },
    {
      fixture: 'deployment-zones',
      selector: { source: { id: 'prod.eu.vm2.web' }, target: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' } },
      removed: { source: { id: 'prod.eu.vm2.web' }, target: { id: 'prod.eu.vm1.api', element: 'shop.api.handler' }, title: 'dispatches' },
    },
    {
      fixture: 'deployment-zones',
      selector: { source: { id: 'prod.eu.vm3.web' }, target: { id: 'prod.eu.vm1.api' } },
      removed: { source: { id: 'prod.eu.vm3.web' }, target: { id: 'prod.eu.vm1.api' }, title: 'proxies' },
    },
    {
      fixture: 'deployment-clusters',
      selector: { source: { id: 'main.k8s.apps.backendB' }, target: { id: 'main.k8s.apps.ui' } },
      removed: { source: { id: 'main.k8s.apps.backendB' }, target: { id: 'main.k8s.apps.ui' }, title: 'notifies' },
    },
    {
      fixture: 'deployment-clusters',
      // `backendB <-> storage 'syncs'` matches these endpoints too.
      selector: { source: { id: 'main.k8s.data.storage' }, target: { id: 'main.k8s.apps.backendB' }, kind: 'publishes' },
      removed: { source: { id: 'main.k8s.data.storage' }, target: { id: 'main.k8s.apps.backendB' }, title: 'pushes' },
    },
    {
      fixture: 'deployment-clusters',
      selector: { source: { id: 'main.k8s.apps.workers.backend' }, target: { id: 'main.k8s.apps.backendA' } },
      removed: { source: { id: 'main.k8s.apps.workers.backend' }, target: { id: 'main.k8s.apps.backendA' }, title: 'drains' },
    },
    {
      fixture: 'deployment-clusters',
      selector: { source: { id: 'main.k8s.apps.backendB' }, target: { id: 'main.k8s.apps.backendA', element: 'portal.backend.jobs.broker' } },
      removed: {
        source: { id: 'main.k8s.apps.backendB' },
        target: { id: 'main.k8s.apps.backendA', element: 'portal.backend.jobs.broker' },
        title: 'enqueues',
      },
    },
  ];

  it.each(CASES)('$fixture: $removed.title', async ({ fixture, selector, removed }) => {
    const files = readWorkspace(fixture);
    // P: the input is valid and LikeC4 has the relation.
    await expectValidLikeC4(files);
    const before = await likec4Relations(files);
    expect(keys(before)).toContain(keys([removed])[0]);

    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentRelationship(selector)).toEqual({ removedRelationships: [removed] });

    // The others survive as LikeC4 read them before.
    const expected = [...keys(before)];
    expected.splice(expected.indexOf(keys([removed])[0]!), 1);
    expect(keys(await likec4Relations(m.serialize()))).toEqual(expected);
    await expectValidWrite(m);
  });
});

describe('syntax errors (row 70)', () => {
  it('rejects tags, links and metadata of a relationship while a file does not parse, and accepts a title and description', async () => {
    const files = { ...readWorkspace('deployment-zones'), 'broken.c4': 'model {\n  x = \n' };
    const errorsBefore = await errorSet(files);
    expect(errorsBefore.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    const selector = { source: { id: 'prod.eu.vm1.api' }, target: { id: 'prod.eu.vm1.api2' } };
    expectRejected(m, 'tags', () => m.updateDeploymentRelationship(selector, { tags: ['public'] }));
    expectRejected(m, 'links', () => m.updateDeploymentRelationship(selector, { links: [{ url: 'https://example.com' }] }));
    expectRejected(m, 'metadata', () => m.updateDeploymentRelationship(selector, { metadata: { key: 'value' } }));

    // Wi: the values read back and LikeC4's errors are the same.
    expect(m.updateDeploymentRelationship(selector, { title: 'New title', description: 'New description' })).toEqual({
      changedFiles: ['deployment.c4'],
    });
    expect(m.listDeploymentRelationships({ source: 'prod.eu.vm1.api', kind: 'calls' })).toMatchObject([
      { title: 'New title', description: 'New description' },
    ]);
    expect(await errorSet(m.serialize())).toEqual(errorsBefore);
  });
});

describe('unsafe endpoint input (row 89)', () => {
  const VALID = { id: 'prod.eu.vm1' };
  const UNSAFE: Array<{ endpoint: DeploymentEndpoint; part: 'id' | 'element' }> = [
    { endpoint: { id: 'prod }' }, part: 'id' },
    { endpoint: { id: "prod'" }, part: 'id' },
    { endpoint: { id: 'a b' }, part: 'id' },
    { endpoint: { id: '' }, part: 'id' },
    { endpoint: { id: 'prod.eu.vm1.api', element: "sub'" }, part: 'element' },
    { endpoint: { id: 'prod.eu.vm1.api', element: 'app.api.sub }' }, part: 'element' },
  ];

  it.each(UNSAFE)('refuses $endpoint on its $part, as source and as target', ({ endpoint, part }) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, `source.${part}`, () => m.addDeploymentRelationship(endpoint, VALID));
    expectRejected(m, `target.${part}`, () => m.addDeploymentRelationship({ id: 'prod.eu.vm2' }, endpoint));
    expectRejected(m, `source.${part}`, () => m.updateDeploymentRelationship({ source: endpoint, target: VALID }, { title: 'x' }));
    expectRejected(m, `target.${part}`, () => m.updateDeploymentRelationship({ source: VALID, target: endpoint }, { title: 'x' }));
    expectRejected(m, `source.${part}`, () => m.removeDeploymentRelationship({ source: endpoint, target: VALID }));
    expectRejected(m, `target.${part}`, () => m.removeDeploymentRelationship({ source: VALID, target: endpoint }));
  });
});
