/**
 * Updating and removing deployment nodes (US-7, US-8, US-12 / INV-8 for
 * node removals).
 *
 *  - Updates: strings of both declaration forms (row 47), collections with
 *    the `extend <node>` strip (row 48), a body-level `icon` (row 49), the
 *    syntax-error guard (row 50).
 *  - Selectors of both operations (row 51).
 *  - Removal: the cascade (row 52), deployment views that refer to the
 *    subtree (row 53), children declared in `extend` bodies (row 54), and
 *    surviving references (row 55).
 *
 * Expected values come from the request itself, the input text, and the
 * model LikeC4 1.59.4 builds from the same files (`buildLikeC4Model`,
 * `linkedReferences`, `validateLikeC4` and the deployment agreement
 * helpers).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type { UpdateDeploymentNodePatch } from '../../src/mutator/deployment-ops.js';
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

/** BI: run `write`, expect an InvalidWriteError on `field`, no file changed and node `id` read as before. */
function expectRejected(m: LikeC4Mutator, field: string, id: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  const read = m.getDeploymentNode(id);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before);
  expect(m.getDeploymentNode(id)).toEqual(read);
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

/** The node with `id`; it must exist. */
function node(m: LikeC4Mutator, id: string) {
  const found = m.getDeploymentNode(id);
  expect(found, id).not.toBeNull();
  return found!;
}

/** LikeC4's errors as a sorted list with line numbers dropped (a write moves lines). */
async function errorSet(files: Record<string, string>): Promise<string[]> {
  return (await validateLikeC4(files)).map((e) => e.replace(/:\d+:/, ':')).sort();
}

/** True when deployment id `id` is `root` or below it. */
const inSubtree = (id: string, root: string): boolean => id === root || id.startsWith(root + '.');

describe('US-7 strings (row 47)', () => {
  /**
   * Where a declaration is in the input text: its first line, and its last
   * line (`close`) as the start of `after`, the text that follows it.
   */
  interface Declaration {
    id: string;
    first: string;
    close: string;
    after: string;
  }

  // Per fixture: a node in the `kind name` form and one in the `name = kind`
  // form.  One of them gets a body title next to its inline title, the
  // `kind name` node of the clusters has no inline title (the new one goes
  // after its name).
  const CASES: Array<{ fixture: string; file: string; prepare: (files: Record<string, string>) => Record<string, string>; kindName: Declaration; nameKind: Declaration }> = [
    {
      fixture: 'deployment-zones',
      file: 'deployment.c4',
      prepare: (files) =>
        edited(files, 'deployment.c4', "environment prod 'Production' {\n    #primary\n", "environment prod 'Production' {\n    #primary\n    title 'Body title'\n"),
      kindName: { id: 'prod', first: "  environment prod 'Production' {\n", close: '  }\n', after: '  }\n\n  prod.eu.vm1.api -[calls]->' },
      nameKind: { id: 'prod.eu.vm1', first: "      vm1 = host 'VM 1' {\n", close: '      }\n', after: '      }\n\n      host vm2 {' },
    },
    {
      fixture: 'deployment-clusters',
      file: 'deployment.c4',
      prepare: (files) =>
        edited(files, 'deployment.c4', "k8s = cluster 'Main cluster' {\n      #critical\n", "k8s = cluster 'Main cluster' {\n      #critical\n      title 'Body title'\n"),
      kindName: { id: 'main.k8s.apps', first: '      namespace apps {\n', close: '      }\n', after: '      }\n\n      namespace data {' },
      nameKind: { id: 'main.k8s', first: "    k8s = cluster 'Main cluster' {\n", close: '    }\n', after: '    }\n  }\n\n  main.k8s.apps.ui ->' },
    },
  ];

  it.each(CASES.flatMap((c) => [
    { ...c, form: 'kind name', declaration: c.kindName },
    { ...c, form: 'name = kind', declaration: c.nameKind },
  ]))('$fixture: $form ($declaration.id)', async ({ fixture, file, prepare, declaration }) => {
    const { id, first, close, after: following } = declaration;
    // Comments right before and right after the declaration mark the text
    // that must stay as it is.
    const indent = /^ */.exec(first)![0];
    const beforeMark = `${indent}// before ${id}\n`;
    const afterMark = `${indent}// after ${id}\n`;
    let files = prepare(readWorkspace(fixture));
    files = edited(files, file, first, beforeMark + first);
    files = edited(files, file, following, close + afterMark + following.slice(close.length));
    // P: the input is valid and LikeC4 has the node.
    await expectValidLikeC4(files);
    expect((await buildLikeC4Model(files)).deployments.elements[id]).toBeDefined();

    const m = LikeC4Mutator.fromFiles(files);
    const patch = { title: 'New title', summary: 'New summary', description: 'New description', technology: 'New technology' };
    expect(m.updateDeploymentNode(id, patch)).toEqual({ changedFiles: [file] });

    const updated = node(m, id);
    expect([updated.title, updated.summary, updated.description, updated.technology]).toEqual([
      patch.title,
      patch.summary,
      patch.description,
      patch.technology,
    ]);
    // Only the declaration's text changed: everything up to the comment
    // before it and from the comment after it is byte-equal.
    const before = files[file]!;
    const after = m.serialize()[file]!;
    const head = before.indexOf(beforeMark) + beforeMark.length;
    expect(after.slice(0, head)).toBe(before.slice(0, head));
    expect(after).toContain(afterMark);
    expect(after.slice(after.indexOf(afterMark))).toBe(before.slice(before.indexOf(afterMark)));
    await expectValidWrite(m);
  });
});

describe('US-7 collections and the extend strip (row 48)', () => {
  interface CollectionCase {
    fixture: string;
    id: string;
    declarationFile: string;
    extendFiles: string[];
    descendantExtend: string;
    patch: UpdateDeploymentNodePatch & { metadata: MetadataPatch };
    /** The node's metadata after the patch: its declaration has none of its own */
    metadata: Record<string, string>;
  }

  // Per fixture: a node extended in two files, and an extend block of one of
  // its descendants (added in a file of its own) that must stay as written.
  const CASES: CollectionCase[] = [
    {
      fixture: 'deployment-zones',
      id: 'prod.eu',
      declarationFile: 'deployment.c4',
      extendFiles: ['ext/eu-extra.c4', 'ext/eu.c4'],
      descendantExtend: "deployment {\n  extend prod.eu.vm1 {\n    #edge\n    link https://example.com/vm1 'VM 1'\n    metadata {\n      tier 'bronze'\n    }\n  }\n}\n",
      patch: { tags: ['public'], links: [{ url: 'https://example.com/eu', label: 'EU' }], metadata: { tier: 'top', owner: null }, style: { color: 'red' } },
      metadata: { tier: 'top' },
    },
    {
      fixture: 'deployment-clusters',
      id: 'main.k8s.apps',
      declarationFile: 'deployment.c4',
      extendFiles: ['ext/apps-more.c4', 'ext/apps.c4'],
      descendantExtend: "deployment {\n  extend main.k8s.apps.workers {\n    #critical\n    link https://example.com/workers 'Workers'\n    metadata {\n      region 'south'\n    }\n  }\n}\n",
      patch: { tags: ['beta'], links: [{ url: 'https://example.com/apps2' }], metadata: { region: 'north', costCenter: null }, style: { color: 'green' } },
      metadata: { region: 'north' },
    },
  ];

  it.each(CASES)('$fixture: $id', async ({ fixture, id, declarationFile, extendFiles, descendantExtend, patch, metadata }) => {
    const files = { ...readWorkspace(fixture), 'ext/zz-descendant.c4': descendantExtend };
    // P: the input is valid; LikeC4 links an extend block of `id` in each
    // extend file, and the descendant's block.
    await expectValidLikeC4(files);
    const extendsBefore = (await linkedReferences(files)).filter((r) => r.role === 'extend');
    expect(extendsBefore.filter((r) => r.text === id && r.target !== null)).toHaveLength(extendFiles.length);
    expect(extendsBefore.filter((r) => r.text !== id && r.target !== null)).toHaveLength(1);

    const m = LikeC4Mutator.fromFiles(files);
    const descendant = extendsBefore.find((r) => r.text !== id)!.text;
    const decorations = (n: ReturnType<typeof node>) => ({ tags: n.tags, links: n.links, metadata: n.metadata });
    const descendantBefore = decorations(node(m, descendant));
    expect(m.updateDeploymentNode(id, patch)).toEqual({ changedFiles: [declarationFile, ...extendFiles] });

    const updated = node(m, id);
    expect(updated.tags).toEqual(patch.tags);
    expect(updated.links).toEqual(patch.links);
    expect(updated.metadata).toEqual(metadata);
    expect(updated.style).toMatchObject(patch.style!);
    // The extend blocks of `id` contribute nothing patched any more; that of
    // the descendant is unchanged.
    expect(updated.extendedBy.map((c) => c.file).sort()).toEqual([...extendFiles].sort());
    for (const contribution of updated.extendedBy) {
      expect(contribution.tags).toBeUndefined();
      expect(contribution.links).toBeUndefined();
      expect(Object.keys(contribution.metadata ?? {}).filter((key) => key in patch.metadata)).toEqual([]);
    }
    expect(m.serialize()['ext/zz-descendant.c4']).toBe(descendantExtend);
    expect(decorations(node(m, descendant))).toEqual(descendantBefore);
    await expectValidWrite(m);
  });
});

describe('kind defaults after an update (US-7 with US-2)', () => {
  const files = {
    'a.c4': `specification {
  deploymentNode vm {
    #kindtag
    title 'Kind title'
    link https://example.com/kind 'Kind link'
  }
  tag kindtag
  tag own
}
deployment {
  vm a 'A' {
    #own
    link https://example.com/own 'Own link'
  }
  vm b 'B'
  vm c 'C'
}
`,
    'b.c4': `deployment {
  extend a {
    #own
    link https://example.com/extend 'Extend link'
  }
}
`,
  };

  it('empty tags and links clear own and extend values; the kind defaults apply as LikeC4 reads them', async () => {
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.updateDeploymentNode('a', { tags: [], links: [] })).toEqual({ changedFiles: ['a.c4', 'b.c4'] });

    const { deployments } = await buildLikeC4Model(m.serialize());
    const getters = deployments.getters['a']!;
    // LikeC4 keeps the kind tag and brings the kind link back.
    expect([...getters.tags]).toEqual(['kindtag']);
    expect(getters.links.map((l) => l.url)).toEqual(['https://example.com/kind']);
    expect(node(m, 'a').tags).toEqual([...getters.tags]);
    expect(node(m, 'a').links?.map((l) => l.url)).toEqual(getters.links.map((l) => l.url));
    await expectValidWrite(m);
  });

  it('a title equal to the node name reads as the kind title; an empty title stays empty', async () => {
    const m = LikeC4Mutator.fromFiles(files);
    m.updateDeploymentNode('b', { title: 'b' });
    m.updateDeploymentNode('c', { title: '' });

    const { deployments } = await buildLikeC4Model(m.serialize());
    expect(deployments.getters['b']!.title).toBe('Kind title');
    expect(deployments.getters['c']!.title).toBe('');
    expect(node(m, 'b').title).toBe(deployments.getters['b']!.title);
    expect(node(m, 'c').title).toBe(deployments.getters['c']!.title);
    await expectValidWrite(m);
  });
});

describe('style.icon with a body icon (row 49)', () => {
  it('writes the icon where LikeC4 reads it', async () => {
    const files = {
      'a.c4': `specification {
  deploymentNode vm
}
deployment {
  vm a {
    icon tech:go
    style {
      icon tech:java
      color red
    }
  }
}
`,
    };
    await expectValidLikeC4(files);
    // OP: LikeC4 reads the body icon, not the style block's.
    expect((await buildLikeC4Model(files)).deployments.elements['a']!.style?.icon).toBe('tech:go');

    const m = LikeC4Mutator.fromFiles(files);
    m.updateDeploymentNode('a', { style: { icon: 'tech:rust' } });
    expect(node(m, 'a').style).toEqual({ icon: 'tech:rust', color: 'red' });
    expect((await buildLikeC4Model(m.serialize())).deployments.elements['a']!.style?.icon).toBe('tech:rust');
    await expectValidWrite(m);
  });
});

describe('syntax errors (row 50)', () => {
  it('rejects tags, links and metadata while a file does not parse, and accepts a title', async () => {
    const files = {
      'a.c4': `specification {
  deploymentNode vm
  tag t
}
deployment {
  vm a 'Old'
}
`,
      'b.c4': 'model {\n  x = \n',
    };
    const errorsBefore = await errorSet(files);
    expect(errorsBefore.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'tags', 'a', () => m.updateDeploymentNode('a', { tags: ['t'] }));
    expectRejected(m, 'links', 'a', () => m.updateDeploymentNode('a', { links: [{ url: 'https://example.com' }] }));
    expectRejected(m, 'metadata', 'a', () => m.updateDeploymentNode('a', { metadata: { key: 'value' } }));

    // Wi: the title reads back and LikeC4's errors are the same.
    expect(m.updateDeploymentNode('a', { title: 'New' })).toEqual({ changedFiles: ['a.c4'] });
    expect(node(m, 'a').title).toBe('New');
    expect(await errorSet(m.serialize())).toEqual(errorsBefore);
  });
});

describe('node selectors of update and remove (row 51)', () => {
  const TWICE = {
    'a.c4': 'specification {\n  deploymentNode vm\n}\ndeployment {\n  vm prod\n}\n',
    'b.c4': 'deployment {\n  vm prod\n}\n',
  };

  it.each([
    { op: 'updateDeploymentNode', write: (m: LikeC4Mutator, id: string) => m.updateDeploymentNode(id, { title: 'T' }) },
    { op: 'removeDeploymentNode', write: (m: LikeC4Mutator, id: string) => m.removeDeploymentNode(id) },
  ])('$op', ({ write }) => {
    const unknown = LikeC4Mutator.fromFiles(TWICE);
    expectRejected(unknown, 'id', 'stage', () => write(unknown, 'stage'));

    const twice = LikeC4Mutator.fromFiles(TWICE);
    const error = expectRejected(twice, 'id', 'prod', () => write(twice, 'prod'));
    expect(error.detail).toContain("'a.c4'");
    expect(error.detail).toContain("'b.c4'");
  });
});

/** A removed relationship as `removeDeploymentNode` reports it, built from LikeC4's relation. */
type RemovedRelationship = { source: { id: string; element?: string }; target: { id: string; element?: string }; title?: string };

/** LikeC4's relations with an endpoint in the subtree of `root`, as removed relationships, sorted. */
async function relationsInto(files: Record<string, string>, root: string): Promise<string[]> {
  const { deployments } = await buildLikeC4Model(files);
  const endpoint = (e: { deployment: string; element?: string }) =>
    e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
  return deployments.relations
    .filter((r) => inSubtree(r.source.deployment, root) || inSubtree(r.target.deployment, root))
    .map((r) => {
      const title = deployments.relationGetters[r.id]!.title;
      const removed: RemovedRelationship = { source: endpoint(r.source), target: endpoint(r.target), ...(title && { title }) };
      return JSON.stringify(removed);
    })
    .sort();
}

describe('US-8 cascade (row 52)', () => {
  // Per fixture: a node no deployment view refers to, with nested
  // relationships, relationships elsewhere into its subtree, and an extend
  // block of a subtree node in a file of its own.  The views of the zones
  // fixture refer to every node, so they are left out there.
  const CASES = [
    {
      fixture: 'deployment-zones',
      prepare: (files: Record<string, string>) => ({
        ...files,
        'deployment.c4': files['deployment.c4']!.slice(0, files['deployment.c4']!.indexOf('views {')),
        'ext/zz-subtree.c4': 'deployment {\n  extend prod.eu.vm1 {\n    #edge\n  }\n}\n',
      }),
      id: 'prod.eu.vm1',
    },
    {
      fixture: 'deployment-clusters',
      prepare: (files: Record<string, string>) => ({
        ...files,
        'ext/zz-subtree.c4': 'deployment {\n  extend main.k8s.apps.workers {\n    #beta\n  }\n}\n',
      }),
      id: 'main.k8s.apps.workers',
    },
  ];

  it.each(CASES)('$fixture: $id', async ({ fixture, prepare, id }) => {
    const files = prepare(readWorkspace(fixture));
    // P: the input is valid, LikeC4 has relations into the subtree and links
    // the subtree's extend block.
    await expectValidLikeC4(files);
    const expected = await relationsInto(files, id);
    expect(expected.length).toBeGreaterThan(0);
    expect((await linkedReferences(files)).some((r) => r.role === 'extend' && inSubtree(r.text, id) && r.target !== null)).toBe(true);

    const m = LikeC4Mutator.fromFiles(files);
    const { removedRelationships } = m.removeDeploymentNode(id);
    expect(removedRelationships.map((r) => JSON.stringify(r)).sort()).toEqual(expected);

    const after = m.serialize();
    expect(m.listDeploymentNodes().filter((n) => inSubtree(n.id, id))).toEqual([]);
    expect(m.listDeploymentInstances().filter((i) => inSubtree(i.id, id))).toEqual([]);
    expect(await relationsInto(after, id)).toEqual([]);
    expect((await linkedReferences(after)).filter((r) => r.role === 'extend' && inSubtree(r.text, id))).toEqual([]);
    await expectValidWrite(m);
  });

  it('removes the relationships declared in the removed text even when both endpoints survive', async () => {
    // Three relationships between the surviving root nodes `a` and `b`: one
    // written in the body of `gone`, one in its extend block (both removed
    // with their text), one at the top level (it stays).
    const files = {
      'a.c4': `specification {
  deploymentNode vm
}
deployment {
  vm a
  vm b
  vm gone {
    a -> b 'in body'
  }
  a -> b 'outside'
}
`,
      'b.c4': `deployment {
  extend gone {
    a -> b 'in extend'
  }
}
`,
    };
    await expectValidLikeC4(files);
    // OP: LikeC4 links all three between the root nodes `a` and `b`.
    const { deployments } = await buildLikeC4Model(files);
    const byTitle = (title: string) => deployments.relations.filter((r) => deployments.relationGetters[r.id]!.title === title);
    for (const title of ['in body', 'in extend', 'outside']) {
      expect(byTitle(title).map((r) => [r.source, r.target])).toEqual([[{ deployment: 'a' }, { deployment: 'b' }]]);
    }

    const m = LikeC4Mutator.fromFiles(files);
    const { removedRelationships } = m.removeDeploymentNode('gone');
    expect(removedRelationships.map((r) => JSON.stringify(r)).sort()).toEqual(
      [
        { source: { id: 'a' }, target: { id: 'b' }, title: 'in body' },
        { source: { id: 'a' }, target: { id: 'b' }, title: 'in extend' },
      ]
        .map((r) => JSON.stringify(r))
        .sort(),
    );
    const after = await buildLikeC4Model(m.serialize());
    expect(after.deployments.relations.map((r) => [r.source, r.target, after.deployments.relationGetters[r.id]!.title])).toEqual([
      [{ deployment: 'a' }, { deployment: 'b' }, 'outside'],
    ]);
    expect(m.getDeploymentNode('a')).not.toBeNull();
    expect(m.getDeploymentNode('b')).not.toBeNull();
    await expectValidWrite(m);
  });
});

describe('D5: deployment views that refer to the subtree (row 53)', () => {
  const input = (rules: string) => `specification {
  element service
  deploymentNode vm
}
model {
  app = service
}
deployment {
  vm prod {
    vm inner {
      a = instanceOf app
    }
  }
  vm other {
    b = instanceOf app
  }
  prod.inner.a -> other.b 'R'
}
views {
  deployment view dv {
${rules}
  }
}
`;

  it.each([
    { name: 'include', rules: '    include prod.inner.a', reference: 'prod.inner.a' },
    { name: 'exclude', rules: '    include other\n    exclude prod.inner', reference: 'prod.inner' },
    { name: 'a relationship predicate', rules: '    include other.b\n    include prod.inner.a -> other.b', reference: 'prod.inner.a' },
    { name: 'style', rules: '    include other\n    style prod.inner.a {\n      color red\n    }', reference: 'prod.inner.a' },
  ])('a reference to a subtree member through $name rejects the removal', async ({ rules, reference }) => {
    const files = { 'm.c4': input(rules) };
    await expectValidLikeC4(files);
    // OP: LikeC4 links the view reference into the subtree.
    const linked = (await linkedReferences(files)).find((r) => r.role === 'deploymentView' && r.text === reference);
    expect(linked?.target).toEqual({ deployment: reference });

    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, 'id', 'prod', () => m.removeDeploymentNode('prod'));
    expect(error.detail).toContain(`'${reference}'`);
  });

  it('a removal no view refers to is accepted', async () => {
    const files = { 'm.c4': input('    include other') };
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentNode('prod')).toEqual({
      removedRelationships: [{ source: { id: 'prod.inner.a' }, target: { id: 'other.b' }, title: 'R' }],
    });
    expect(m.getDeploymentNode('prod')).toBeNull();
    await expectValidWrite(m);
  });
});

describe('children declared in extend bodies (row 54)', () => {
  it.each([
    { fixture: 'deployment-zones', id: 'prod.eu.vm3' },
    { fixture: 'deployment-clusters', id: 'main.k8s.apps.workers' },
  ])('$fixture: $id is updated and removed by its id', async ({ fixture, id }) => {
    const files = readWorkspace(fixture);
    // P: the input is valid and the node is declared in an extend body.
    await expectValidLikeC4(files);
    expect((await buildLikeC4Model(files)).deployments.elements[id]).toBeDefined();
    const m = LikeC4Mutator.fromFiles(files);
    const file = node(m, id).file!;
    expect(files[file]).toContain('extend ');

    expect(m.updateDeploymentNode(id, { title: 'Updated', technology: 'Updated technology' })).toEqual({ changedFiles: [file] });
    expect([node(m, id).title, node(m, id).technology]).toEqual(['Updated', 'Updated technology']);
    await expectValidWrite(m);

    m.removeDeploymentNode(id);
    expect(m.getDeploymentNode(id)).toBeNull();
    await expectValidWrite(m);
  });
});

describe('removal vs surviving references (row 55)', () => {
  const SPEC = `specification {
  element service
  deploymentNode vm
  tag t
}
`;

  it('rejects a removal that makes a surviving name unique and re-targets it', async () => {
    const input = `${SPEC}deployment {
  vm n
  vm prod {
    vm a {
      vm n
    }
    vm b {
      vm n
    }
    vm c {
      -> n 'R'
    }
  }
}
`;
    const files = { 'm.c4': input };
    await expectValidLikeC4(files);
    // OP: `n` links to the root node while two `n` are below `prod`, and to
    // `prod.a.n` once `prod.b` is gone.
    const target = async (f: Record<string, string>) =>
      (await buildLikeC4Model(f)).deployments.relations.find((r) => r.title === 'R')?.target;
    expect(await target(files)).toEqual({ deployment: 'n' });
    expect(await target({ 'm.c4': input.replace('    vm b {\n      vm n\n    }\n', '') })).toEqual({ deployment: 'prod.a.n' });

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'id', 'prod.b', () => m.removeDeploymentNode('prod.b'));
  });

  it('keeps the two same-target extend blocks of a surviving node matched', async () => {
    const files = {
      'a.c4': `${SPEC}deployment {
  vm x
  vm y {
    vm z
    vm w
  }
  x -> y 'X'
}
`,
      'b.c4': `deployment {
  extend y {
    z -> w 'A'
  }
  extend x {
    #t
  }
  extend y {
    z -> w 'A'
  }
}
`,
    };
    await expectValidLikeC4(files);
    // The survivors: the two `extend y` targets and the relation in each block.
    const survivors = async (f: Record<string, string>) => ({
      extends: (await linkedReferences(f)).filter((r) => r.role === 'extend' && r.text === 'y').map((r) => r.target),
      relations: (await buildLikeC4Model(f)).deployments.relations.filter((r) => r.title === 'A').map((r) => [r.source, r.target]),
    });
    const before = await survivors(files);
    expect(before.extends).toEqual([{ deployment: 'y' }, { deployment: 'y' }]);
    expect(before.relations).toHaveLength(2);

    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentNode('x')).toEqual({
      removedRelationships: [{ source: { id: 'x' }, target: { id: 'y' }, title: 'X' }],
    });
    expect(await survivors(m.serialize())).toEqual(before);
    expect((await linkedReferences(m.serialize())).filter((r) => r.role === 'extend' && r.text === 'x')).toEqual([]);
    await expectValidWrite(m);
  });
});
