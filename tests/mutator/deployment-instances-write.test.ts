/**
 * Adding, updating and removing deployed instances (US-9, US-12 / INV-8 for
 * instance additions and removals).
 *
 *  - Addition: values and placement (row 56), the implicit name (row 57),
 *    rejection classes (row 58), the implicit name taken from the written
 *    reference (row 86), unsafe reference input (row 88).
 *  - Update: own values (row 59), metadata on the effective map (row 60),
 *    the syntax-error guard (row 63).
 *  - Removal: the cascade and deployment views (row 61).
 *  - Selectors of update and removal (row 87).
 *  - Additions and removals against existing references (row 62).
 *
 * Expected values come from the request itself, the input text, and the
 * model LikeC4 1.60.0 builds from the same files (`buildLikeC4Model`,
 * `linkedReferences`, `validateLikeC4` and the deployment agreement
 * helpers).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type { AddDeploymentInstanceOpts } from '../../src/mutator/deployment-ops.js';
import type { MetadataPatch } from '../../src/mutator/metadata-ops.js';
import {
  buildLikeC4Model,
  expectDeploymentInstancesAgreeWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectDeploymentRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
  linkedReferences,
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

/** `files` without the `views { ... }` block that ends `file`. */
function withoutViews(files: Record<string, string>, file: string): Record<string, string> {
  const text = files[file]!;
  expect(text).toContain('views {');
  return { ...files, [file]: text.slice(0, text.indexOf('views {')) };
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

/** The instance with `id`; it must exist. */
function instance(m: LikeC4Mutator, id: string) {
  const found = m.getDeploymentInstance(id);
  expect(found, id).not.toBeNull();
  return found!;
}

/** LikeC4's errors as a sorted list with line numbers dropped (a write moves lines). */
async function errorSet(files: Record<string, string>): Promise<string[]> {
  return (await validateLikeC4(files)).map((e) => e.replace(/:\d+:/, ':')).sort();
}

/** True when `sub` is a sub-multiset of `all` (both sorted lists). */
function isSubMultiset(sub: readonly string[], all: readonly string[]): boolean {
  const left = [...all];
  return sub.every((item) => {
    const i = left.indexOf(item);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

/** True when deployment id `id` is `root` or below it. */
const inSubtree = (id: string, root: string): boolean => id === root || id.startsWith(root + '.');

/** Links of LikeC4's model as the library reports them. */
const reportedLinks = (links: ReadonlyArray<{ url: string; title?: string }> | null | undefined) =>
  (links ?? []).map(({ url, title }) => (title === undefined ? { url } : { url, label: title }));

const SPEC = `specification {
  element service
  deploymentNode vm
  tag t
}
`;

describe('US-9 addition (row 56)', () => {
  // Per fixture: a node declared in deployment.c4 with `extend` blocks in
  // other files.  Comments right before and right after its declaration
  // mark the text that must stay as it is: the instance goes into the
  // declaration's body, not into an extend block and not into another node.
  const CASES: Array<{
    fixture: string;
    node: string;
    first: string;
    close: string;
    named: AddDeploymentInstanceOpts & { name: string };
    unnamed: AddDeploymentInstanceOpts;
    unnamedName: string;
  }> = [
    {
      fixture: 'deployment-zones',
      node: 'prod.eu',
      first: '    zone eu {\n',
      close: "      vm2.web -> vm1.api.handler 'dispatches'\n    }\n",
      named: {
        name: 'api3',
        element: 'shop.api',
        title: 'API 3',
        summary: 'Third replica',
        description: 'Serves reads',
        technology: 'Go 1.22',
        tags: ['replica'],
        links: [{ url: 'https://example.com/api3', label: 'API 3 docs' }],
        metadata: { tier: 'bronze', zones: ['a', 'b'] },
        style: { color: 'green', shape: 'cylinder' },
      },
      unnamed: { element: 'shop.web' },
      unnamedName: 'web',
    },
    {
      fixture: 'deployment-clusters',
      node: 'main.k8s.apps',
      first: '      namespace apps {\n',
      close: "        backendA -> backendB 'balances' {\n          #critical\n        }\n      }\n",
      named: {
        name: 'ui2',
        element: 'portal.ui',
        title: 'UI 2',
        summary: 'Second UI',
        description: 'Canary',
        technology: 'Vue',
        tags: ['spot'],
        links: [{ url: 'https://example.com/ui2' }],
        metadata: { owner: 'web' },
        style: { color: 'red' },
      },
      unnamed: { element: 'portal.storage' },
      unnamedName: 'storage',
    },
  ];

  it.each(CASES)('$fixture: into $node', async ({ fixture, node, first, close, named, unnamed, unnamedName }) => {
    const marked = edited(
      edited(readWorkspace(fixture), 'deployment.c4', first, `    // before node\n${first}`),
      'deployment.c4',
      close,
      `${close}    // after node\n`,
    );
    // P: the input is valid, LikeC4 has the node and extend blocks of it in
    // other files.
    await expectValidLikeC4(marked);
    const { deployments, elements } = await buildLikeC4Model(marked);
    expect(deployments.elements[node]?.kind).toBeDefined();
    expect((await linkedReferences(marked)).filter((r) => r.role === 'extend' && r.text === node).length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(marked);
    expect(m.addDeploymentInstance(node, named)).toBe(`${node}.${named.name}`);
    expect(m.addDeploymentInstance(node, unnamed)).toBe(`${node}.${unnamedName}`);

    // Placement: only the declaration's text changed.
    const after = m.serialize();
    const text = marked['deployment.c4']!;
    const head = text.slice(0, text.indexOf('    // before node\n'));
    const tail = text.slice(text.indexOf('    // after node\n'));
    expect(after['deployment.c4']!.startsWith(head)).toBe(true);
    expect(after['deployment.c4']!.endsWith(tail)).toBe(true);
    for (const file of Object.keys(marked).filter((f) => f !== 'deployment.c4')) expect(after[file]).toBe(marked[file]);

    // Values: the request, and the element's tags after the own ones.
    const read = instance(m, `${node}.${named.name}`);
    expect(read).toMatchObject({
      name: named.name,
      parentId: node,
      element: named.element,
      title: named.title,
      summary: named.summary,
      description: named.description,
      technology: named.technology,
      links: named.links,
      metadata: named.metadata,
      style: named.style,
      tags: [...named.tags!, ...(elements[named.element]!.tags ?? [])],
    });
    expect(instance(m, `${node}.${unnamedName}`)).toMatchObject({ name: unnamedName, parentId: node, element: unnamed.element });
    await expectValidWrite(m);
  });
});

describe('implicit name (row 57)', () => {
  it.each([
    { fixture: 'deployment-zones', node: 'prod.eu.vm1', element: 'shop.api' },
    { fixture: 'deployment-clusters', node: 'main.k8s.apps.workers', element: 'portal.backend' },
  ])('$fixture: an unnamed $element in $node needs a name', async ({ fixture, node, element }) => {
    const files = readWorkspace(fixture);
    const id = `${node}.${element.slice(element.lastIndexOf('.') + 1)}`;
    const m = LikeC4Mutator.fromFiles(files);
    // P: the implicit id is already taken.
    expect(m.getDeploymentInstance(id)).not.toBeNull();
    expect(Object.keys((await buildLikeC4Model(files)).deployments.elements)).toContain(id);

    expectRejected(m, 'name', () => m.addDeploymentInstance(node, { element }));
    expect(m.addDeploymentInstance(node, { element, name: 'second' })).toBe(`${node}.second`);
    await expectValidWrite(m);
  });

  it('LikeC4 reports the unnamed duplicate the call refuses', async () => {
    const files = { 'a.c4': `${SPEC}model {\n  app = service {\n    api = service\n  }\n}\ndeployment {\n  vm prod {\n    instanceOf app.api\n  }\n}\n` };
    await expectValidLikeC4(files);
    const handWritten = edited(files, 'a.c4', '    instanceOf app.api\n', '    instanceOf app.api\n    instanceOf app.api\n');
    expect((await validateLikeC4(handWritten)).length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', () => m.addDeploymentInstance('prod', { element: 'app.api' }));
  });
});

describe('rejection classes of an addition (row 58)', () => {
  const zones = readWorkspace('deployment-zones');
  const AMBIGUOUS = {
    'a.c4': `${SPEC}model {\n  a = service {\n    api = service\n  }\n  b = service {\n    api = service\n  }\n}\ndeployment {\n  vm prod\n}\n`,
  };

  it.each<{ label: string; files: Record<string, string>; node: string; opts: AddDeploymentInstanceOpts; field: string }>([
    { label: 'unresolved element', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.nope' }, field: 'element' },
    { label: 'a node as element', files: zones, node: 'prod.eu.vm2', opts: { element: 'prod' }, field: 'element' },
    { label: 'ambiguous element', files: AMBIGUOUS, node: 'prod', opts: { element: 'api' }, field: 'element' },
    { label: 'id of an instance', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.api', name: 'web' }, field: 'name' },
    { label: 'id of a sibling node', files: zones, node: 'prod.eu', opts: { element: 'shop.api', name: 'vm1' }, field: 'name' },
    { label: 'name with a dot', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.api', name: 'a.b' }, field: 'name' },
    { label: 'reserved name', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.api', name: 'this' }, field: 'name' },
    { label: 'undeclared tag', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', tags: ['public', 'undeclared'] }, field: 'tags[1]' },
    { label: 'invalid style', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', style: { color: 'nocolor' } }, field: 'style.color' },
    { label: 'empty metadata list', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', metadata: { key: [] } }, field: 'metadata.key' },
    { label: 'metadata key with a space', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', metadata: { 'bad key': 'v' } }, field: 'metadata.bad key' },
    { label: 'keyword as metadata key', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', metadata: { title: 'v' } }, field: 'metadata.title' },
    { label: 'node is an instance', files: zones, node: 'prod.eu.vm1.api', opts: { element: 'shop.db' }, field: 'node' },
    { label: 'node is not declared', files: zones, node: 'prod.nowhere', opts: { element: 'shop.db' }, field: 'node' },
    { label: 'file', files: zones, node: 'prod.eu.vm2', opts: { element: 'shop.db', file: 'deployment.c4' } as unknown as AddDeploymentInstanceOpts, field: 'file' },
  ])('$label → $field', ({ files, node, opts, field }) => {
    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, field, () => m.addDeploymentInstance(node, opts));
  });

  it('LikeC4 does not resolve the refused elements from the node', async () => {
    // OP: written by hand into the node, each of them is an unresolved
    // reference: `instanceOf` looks among elements only.
    const cases = [
      { files: zones, file: 'deployment.c4', anchor: '        -[syncs]-> vm1\n', element: 'shop.nope' },
      { files: zones, file: 'deployment.c4', anchor: '        -[syncs]-> vm1\n', element: 'prod' },
      { files: AMBIGUOUS, file: 'a.c4', anchor: '  vm prod\n', element: 'api' },
    ];
    for (const { files, file, anchor, element } of cases) {
      await expectValidLikeC4(files);
      const replacement = anchor === '  vm prod\n' ? `  vm prod {\n    instanceOf ${element}\n  }\n` : `${anchor}        x = instanceOf ${element}\n`;
      expect((await validateLikeC4(edited(files, file, anchor, replacement))).length, element).toBeGreaterThan(0);
    }
  });
});

describe('implicit name from the written reference (row 86)', () => {
  it('a node named like an instance whose element does not resolve is a duplicate', async () => {
    const files = { 'a.c4': `${SPEC}model {\n  app = service\n}\ndeployment {\n  vm prod {\n    instanceOf missing\n  }\n}\n` };
    // OP: the hand-written node adds an error to the one already there.
    const handWritten = edited(files, 'a.c4', '    instanceOf missing\n', '    instanceOf missing\n    vm missing\n');
    const before = await errorSet(files);
    const after = await errorSet(handWritten);
    expect(after.length).toBeGreaterThan(before.length);
    expect(isSubMultiset(before, after)).toBe(true);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', () => m.addDeploymentNode('prod', { name: 'missing', kind: 'vm' }));
  });
});

describe('unsafe reference input (row 88)', () => {
  const zones = readWorkspace('deployment-zones');

  it.each([
    { field: 'element', node: 'prod.eu.vm2', element: "shop.api'" },
    { field: 'element', node: 'prod.eu.vm2', element: 'shop.api }' },
    { field: 'element', node: 'prod.eu.vm2', element: 'shop api' },
    { field: 'element', node: 'prod.eu.vm2', element: 'shop..api' },
    { field: 'element', node: 'prod.eu.vm2', element: '' },
    { field: 'element', node: 'prod.eu.vm2', element: 'shop.api\n  x = vm' },
    { field: 'node', node: 'prod }', element: 'shop.db' },
    { field: 'node', node: "prod'", element: 'shop.db' },
  ])('$field: $element in $node', ({ field, node, element }) => {
    const m = LikeC4Mutator.fromFiles(zones);
    expectRejected(m, field, () => m.addDeploymentInstance(node, { element }));
  });
});

describe('D9 own values (row 59)', () => {
  // Per fixture: an instance whose element has tags and — after `prepare`,
  // which edits the model file only — links.
  const CASES = [
    {
      fixture: 'deployment-zones',
      prepare: (files: Record<string, string>) =>
        edited(files, 'model.c4', "      description 'Storefront'\n", "      description 'Storefront'\n      link https://example.com/web 'Web docs'\n"),
      id: 'prod.eu.vm2.web',
      tag: 'replica',
    },
    {
      fixture: 'deployment-clusters',
      prepare: (files: Record<string, string>) =>
        edited(files, 'model.c4', "    backend = component 'Backend' {\n", "    backend = component 'Backend' {\n      #managed\n      link https://example.com/backend 'Backend docs'\n"),
      id: 'main.k8s.apps.backendB',
      tag: 'critical',
    },
  ];

  it.each(CASES)('$fixture: $id', async ({ fixture, prepare, id, tag }) => {
    const files = prepare(readWorkspace(fixture));
    // P: the input is valid; LikeC4 gives the element tags and links.
    await expectValidLikeC4(files);
    const { deployments, elements } = await buildLikeC4Model(files);
    const fqn = deployments.elements[id]!.element!;
    const element = elements[fqn]!;
    expect(element.tags?.length).toBeGreaterThan(0);
    expect(element.links?.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    const patch = {
      title: 'New title',
      summary: 'New summary',
      description: 'New description',
      technology: 'New technology',
      tags: [tag],
      links: [{ url: 'https://example.com/own', label: 'Own' }],
      style: { color: 'sky' as const },
    };
    expect(m.updateDeploymentInstance(id, patch)).toEqual({ changedFiles: ['deployment.c4'] });
    expect(instance(m, id)).toMatchObject({
      element: fqn,
      title: patch.title,
      summary: patch.summary,
      description: patch.description,
      technology: patch.technology,
      tags: [tag, ...element.tags!],
      links: patch.links,
      style: patch.style,
    });
    expect(m.serialize()['model.c4']).toBe(files['model.c4']);
    await expectValidWrite(m);

    // Without own links the element's apply again.
    m.updateDeploymentInstance(id, { links: [] });
    expect(instance(m, id).links).toEqual(reportedLinks(element.links));
    expect(m.serialize()['model.c4']).toBe(files['model.c4']);
    await expectValidWrite(m);
  });
});

describe('D9 / D14 metadata (row 60)', () => {
  // Element app.db has { region }; instance prod.db has its own { tier },
  // prod.other has no own map.
  const EXAMPLE = {
    'a.c4': `${SPEC}model {
  app = service {
    db = service {
      metadata {
        region 'eu'
      }
    }
  }
}
`,
    'b.c4': `deployment {
  vm prod {
    db = instanceOf app.db {
      metadata {
        tier 'gold'
      }
    }
    other = instanceOf app.db
  }
}
`,
  };

  it('patches the effective map and rejects a patched key that would not read as requested', async () => {
    // Without an own map the element's keys are copied first.
    const zones = readWorkspace('deployment-zones');
    const before = await buildLikeC4Model(zones);
    const inherited = before.deployments.getters['prod.eu.vm1.api']!.metadata;
    // P: LikeC4 has no own map for the instance and gives it the element's.
    expect(before.deployments.elements['prod.eu.vm1.api']!.metadata ?? {}).toEqual({});
    expect(Object.keys(inherited).length).toBeGreaterThan(1);
    const copied = LikeC4Mutator.fromFiles(zones);
    copied.updateDeploymentInstance('prod.eu.vm1.api', { metadata: { tier: 'platinum' } });
    const expected = { ...inherited, tier: 'platinum' };
    expect(instance(copied, 'prod.eu.vm1.api').metadata).toEqual(expected);
    expect((await buildLikeC4Model(copied.serialize())).deployments.elements['prod.eu.vm1.api']!.metadata).toEqual(expected);
    await expectValidWrite(copied);

    // Deleting the last own key: the emptied block goes, the element's map applies.
    await expectValidLikeC4(EXAMPLE);
    const emptied = LikeC4Mutator.fromFiles(EXAMPLE);
    expect(emptied.updateDeploymentInstance('prod.db', { metadata: { tier: null } })).toEqual({ changedFiles: ['b.c4'] });
    expect(instance(emptied, 'prod.db').metadata).toEqual({ region: 'eu' });
    expect(emptied.serialize()['b.c4']).not.toContain('metadata');
    expect((await buildLikeC4Model(emptied.serialize())).deployments.elements['prod.db']!.metadata ?? {}).toEqual({});
    await expectValidWrite(emptied);

    // A deletion LikeC4 cannot express: the element's map would come back with the key.
    const inheritedOnly = LikeC4Mutator.fromFiles(EXAMPLE);
    expectRejected(inheritedOnly, 'metadata.region', () => inheritedOnly.updateDeploymentInstance('prod.other', { metadata: { region: null } }));

    // Upserts whose values are empty after trimming, with and without an own map.
    const cases: Array<{ files: Record<string, string>; id: string; patch: MetadataPatch; field: string }> = [
      { files: zones, id: 'prod.eu.vm1.api', patch: { tier: '   ' }, field: 'metadata.tier' },
      { files: zones, id: 'prod.eu.vm1.api2', patch: { tier: ['', ' '] }, field: 'metadata.tier' },
      { files: EXAMPLE, id: 'prod.db', patch: { tier: '' }, field: 'metadata.tier' },
    ];
    for (const { files, id, patch, field } of cases) {
      const m = LikeC4Mutator.fromFiles(files);
      expectRejected(m, field, () => m.updateDeploymentInstance(id, { metadata: patch }));
    }
  });
});

describe('metadata LikeC4 cannot hold, in an update', () => {
  // An empty list has no LikeC4 syntax, and a key must be an identifier; with
  // and without an own map of the instance.
  it.each<{ label: string; id: string; metadata: MetadataPatch; field: string }>([
    { label: 'an empty list', id: 'prod.eu.vm1.api2', metadata: { key: [] }, field: 'metadata.key' },
    { label: 'an empty list, no own map', id: 'prod.eu.vm1.api', metadata: { key: [] }, field: 'metadata.key' },
    { label: 'a key with a space', id: 'prod.eu.vm1.api2', metadata: { 'bad key': 'v' }, field: 'metadata.bad key' },
    { label: 'a keyword as key', id: 'prod.eu.vm1.api', metadata: { title: 'v' }, field: 'metadata.title' },
  ])('$label → $field', ({ id, metadata, field }) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, field, () => m.updateDeploymentInstance(id, { metadata }));
  });
});

describe('syntax errors (row 63)', () => {
  it('rejects tags, links and metadata of an instance while a file does not parse, and accepts a title and technology', async () => {
    const files = {
      'a.c4': `${SPEC}model {\n  app = service\n}\ndeployment {\n  vm prod {\n    web = instanceOf app 'Old'\n  }\n}\n`,
      'b.c4': 'model {\n  x = \n',
    };
    const errorsBefore = await errorSet(files);
    expect(errorsBefore.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'tags', () => m.updateDeploymentInstance('prod.web', { tags: ['t'] }));
    expectRejected(m, 'links', () => m.updateDeploymentInstance('prod.web', { links: [{ url: 'https://example.com' }] }));
    expectRejected(m, 'metadata', () => m.updateDeploymentInstance('prod.web', { metadata: { key: 'value' } }));

    // Wi: the values read back and LikeC4's errors are the same.
    expect(m.updateDeploymentInstance('prod.web', { title: 'New', technology: 'Tech' })).toEqual({ changedFiles: ['a.c4'] });
    expect(instance(m, 'prod.web')).toMatchObject({ title: 'New', technology: 'Tech' });
    expect(await errorSet(m.serialize())).toEqual(errorsBefore);
  });
});

/** A removed relationship as `removeDeploymentInstance` reports it, built from LikeC4's relation. */
type RemovedRelationship = { source: { id: string; element?: string }; target: { id: string; element?: string }; title?: string };

/** LikeC4's relations with an endpoint at `id` or below it, as removed relationships, sorted. */
async function relationsInto(files: Record<string, string>, id: string): Promise<string[]> {
  const { deployments } = await buildLikeC4Model(files);
  const endpoint = (e: { deployment: string; element?: string }) =>
    e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
  return deployments.relations
    .filter((r) => inSubtree(r.source.deployment, id) || inSubtree(r.target.deployment, id))
    .map((r) => {
      const title = deployments.relationGetters[r.id]!.title;
      const removed: RemovedRelationship = { source: endpoint(r.source), target: endpoint(r.target), ...(title && { title }) };
      return JSON.stringify(removed);
    })
    .sort();
}

describe('removal (row 61)', () => {
  // Per fixture, with the views left out: an instance with relationships in
  // its body or in other nodes, and one whose element is stepped into by an
  // endpoint (`<instance>.<element>`).
  it.each([
    { fixture: 'deployment-zones', id: 'prod.eu.vm2.web' },
    { fixture: 'deployment-zones', id: 'prod.eu.vm1.api' },
    { fixture: 'deployment-clusters', id: 'main.k8s.apps.backendB' },
    { fixture: 'deployment-clusters', id: 'main.k8s.apps.backendA' },
  ])('$fixture: $id', async ({ fixture, id }) => {
    const files = withoutViews(readWorkspace(fixture), 'deployment.c4');
    // P: the input is valid and LikeC4 has relations at the instance.
    await expectValidLikeC4(files);
    const expected = await relationsInto(files, id);
    expect(expected.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    const { removedRelationships } = m.removeDeploymentInstance(id);
    expect(removedRelationships.map((r) => JSON.stringify(r)).sort()).toEqual(expected);
    expect(m.getDeploymentInstance(id)).toBeNull();
    expect(await relationsInto(m.serialize(), id)).toEqual([]);
    expect(m.serialize()['model.c4']).toBe(files['model.c4']);
    await expectValidWrite(m);
  });

  it('removes the relationships declared in its body even when both endpoints survive', async () => {
    const files = {
      'a.c4': `${SPEC}model {\n  app = service\n}\ndeployment {\n  vm a\n  vm b\n  vm host {\n    gone = instanceOf app {\n      a -> b 'in body'\n    }\n  }\n  a -> b 'outside'\n}\n`,
    };
    await expectValidLikeC4(files);
    // OP: LikeC4 links both between the root nodes `a` and `b`.
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.relations.map((r) => [r.source, r.target, deployments.relationGetters[r.id]!.title]).sort()).toEqual([
      [{ deployment: 'a' }, { deployment: 'b' }, 'in body'],
      [{ deployment: 'a' }, { deployment: 'b' }, 'outside'],
    ]);

    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentInstance('host.gone')).toEqual({
      removedRelationships: [{ source: { id: 'a' }, target: { id: 'b' }, title: 'in body' }],
    });
    const after = await buildLikeC4Model(m.serialize());
    expect(after.deployments.relations.map((r) => [r.source, r.target, after.deployments.relationGetters[r.id]!.title])).toEqual([
      [{ deployment: 'a' }, { deployment: 'b' }, 'outside'],
    ]);
    await expectValidWrite(m);
  });

  it.each([
    { fixture: 'deployment-zones', id: 'prod.eu.vm1.api' },
    { fixture: 'deployment-zones', id: 'prod.eu.vm1.api2' },
    { fixture: 'deployment-clusters', id: 'main.k8s.apps.backendA' },
  ])('$fixture: a deployment view refers to $id', async ({ fixture, id }) => {
    const files = readWorkspace(fixture);
    // OP: LikeC4 links a view rule to the instance or into its element.
    const refs = await linkedReferences(files);
    expect(refs.some((r) => r.role === 'deploymentView' && r.target !== null && 'deployment' in r.target && r.target.deployment === id)).toBe(true);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'id', () => m.removeDeploymentInstance(id));
  });
});

describe('instance selectors of update and remove (row 87)', () => {
  const TWICE = { 'a.c4': `${SPEC}model {\n  app = service {\n    api = service\n  }\n}\ndeployment {\n  vm prod {\n    instanceOf app.api\n    instanceOf app.api\n  }\n}\n` };
  /** 1-based lines of the two declarations in the input. */
  const lines = TWICE['a.c4'].split('\n').flatMap((line, i) => (line.trim() === 'instanceOf app.api' ? [i + 1] : []));

  it.each([
    { op: 'updateDeploymentInstance', write: (m: LikeC4Mutator, id: string) => m.updateDeploymentInstance(id, { title: 'T' }) },
    { op: 'removeDeploymentInstance', write: (m: LikeC4Mutator, id: string) => m.removeDeploymentInstance(id) },
  ])('$op', async ({ write }) => {
    // OP: LikeC4 reports the duplicate id.
    expect((await validateLikeC4(TWICE)).length).toBeGreaterThan(0);
    expect(lines).toHaveLength(2);

    const m = LikeC4Mutator.fromFiles(TWICE);
    expectRejected(m, 'id', () => write(m, 'prod.web'));
    expectRejected(m, 'id', () => write(m, 'prod'));
    const error = expectRejected(m, 'id', () => write(m, 'prod.api'));
    for (const line of lines) expect(error.detail).toContain(`line ${line}`);
  });
});

describe('additions and removals vs existing references (row 62)', () => {
  it('(a) a second instance that makes a view rule ambiguous is rejected; a named one is accepted', async () => {
    const files = {
      'a.c4': `${SPEC}model {\n  db = service\n}\ndeployment {\n  vm n1 {\n    instanceOf db\n  }\n  vm n2\n}\nviews {\n  deployment view v {\n    include db\n  }\n}\n`,
    };
    await expectValidLikeC4(files);
    // OP: `db` links to the instance n1.db; with a second instance `db` it
    // links to something else.
    const ruleTarget = async (f: Record<string, string>) => (await linkedReferences(f)).find((r) => r.role === 'deploymentView' && r.text === 'db')?.target;
    expect(await ruleTarget(files)).toEqual({ deployment: 'n1.db' });
    expect(await ruleTarget(edited(files, 'a.c4', '  vm n2\n', '  vm n2 {\n    instanceOf db\n  }\n'))).not.toEqual({ deployment: 'n1.db' });

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', () => m.addDeploymentInstance('n2', { element: 'db' }));
    expect(m.addDeploymentInstance('n2', { element: 'db', name: 'db2' })).toBe('n2.db2');
    expect(await ruleTarget(m.serialize())).toEqual({ deployment: 'n1.db' });
    await expectValidWrite(m);
  });

  it('(b) an unnamed second instance that makes an endpoint unresolved is rejected; a named one is accepted', async () => {
    const files = {
      'a.c4': `${SPEC}model {\n  app = service {\n    db = service\n    web = service\n  }\n}\ndeployment {\n  vm n1 {\n    instanceOf app.db\n  }\n  vm n2 {\n    instanceOf app.web\n  }\n  vm n3\n  n2.web -> db\n}\n`,
    };
    await expectValidLikeC4(files);
    // OP: the endpoint `db` links to n1.db; written by hand, the unnamed
    // second instance leaves it unresolved.
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.relations.map((r) => r.target)).toEqual([{ deployment: 'n1.db' }]);
    expect((await validateLikeC4(edited(files, 'a.c4', '  vm n3\n', '  vm n3 {\n    instanceOf app.db\n  }\n'))).length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', () => m.addDeploymentInstance('n3', { element: 'app.db' }));
    expect(m.addDeploymentInstance('n3', { element: 'app.db', name: 'db2' })).toBe('n3.db2');
    const after = await buildLikeC4Model(m.serialize());
    expect(after.deployments.relations.map((r) => r.target)).toEqual([{ deployment: 'n1.db' }]);
    await expectValidWrite(m);
  });

  it('(c) a removal that lets an ambiguous reference resolve is accepted (Wi)', async () => {
    const files = {
      'a.c4': `${SPEC}model {\n  app = service {\n    db = service\n    web = service\n  }\n}\ndeployment {\n  vm n1 {\n    instanceOf app.db\n  }\n  vm n2 {\n    instanceOf app.db\n  }\n  vm n3 {\n    instanceOf app.web\n  }\n  n3.web -> db\n}\n`,
    };
    const errorsBefore = await errorSet(files);
    expect(errorsBefore.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    m.removeDeploymentInstance('n2.db');
    expect(m.getDeploymentInstance('n2.db')).toBeNull();
    expect(m.getDeploymentInstance('n1.db')).not.toBeNull();
    expect(isSubMultiset(await errorSet(m.serialize()), errorsBefore)).toBe(true);
  });

  it('(d) a removal that re-targets a resolved reference is rejected', async () => {
    const files = {
      'a.c4': `${SPEC}model {
  app = service {
    db = service
  }
}
deployment {
  vm outer {
    n = instanceOf app.db
    vm prod {
      vm a {
        n = instanceOf app.db
      }
      vm b {
        n = instanceOf app.db
      }
      vm c {
        -> n
      }
    }
  }
}
`,
    };
    await expectValidLikeC4(files);
    // OP: `-> n` links to outer.n while `n` is ambiguous below prod; without
    // prod.b.n it links to prod.a.n.
    const targets = async (f: Record<string, string>) => (await buildLikeC4Model(f)).deployments.relations.map((r) => r.target);
    expect(await targets(files)).toEqual([{ deployment: 'outer.n' }]);
    expect(await targets(edited(files, 'a.c4', '      vm b {\n        n = instanceOf app.db\n      }\n', '      vm b {\n      }\n'))).toEqual([
      { deployment: 'outer.prod.a.n' },
    ]);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'id', () => m.removeDeploymentInstance('outer.prod.b.n'));
  });
});
