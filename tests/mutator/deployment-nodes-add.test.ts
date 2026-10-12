/**
 * Adding deployment nodes (US-5, US-6, US-12 / D13 for node additions).
 *
 *  - Values: a root and a child node with every property read back as
 *    requested and as LikeC4 computes them, on both fixtures; a parent
 *    without a body gets one (row 39); title escaping (row 43).
 *  - Placement of a root node: LikeC4 document order, the `file` option,
 *    new `deployment` blocks (rows 40, 41).
 *  - Rejections: every value and selector class, sources unchanged
 *    (rows 41, 42, 91).
 *  - References: a new node that would re-target, or make ambiguous, an
 *    existing deployment relationship endpoint or deployment view reference
 *    is rejected on `name` (row 44); strict `extend <node>` paths are kept by
 *    the duplicate-id check (row 45).
 *
 * Expected values come from the request itself, the input text, and the
 * model LikeC4 1.59.4 builds from the same files (`buildLikeC4Model`,
 * `linkedReferences`, `expectValidLikeC4` and the deployment agreement
 * helpers).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import type { AddDeploymentNodeOpts } from '../../src/mutator/deployment-ops.js';
import {
  buildLikeC4Model,
  expectDeploymentInstancesAgreeWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectDeploymentRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
  linkedReferences,
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

/**
 * BI: run `write`, expect an InvalidWriteError on `field` (any field when
 * undefined), no file changed and `id` still unread.
 */
function expectRejected(m: LikeC4Mutator, field: string | undefined, id: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  const read = m.getDeploymentNode(id);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  if (field !== undefined) expect((error as InvalidWriteError).field).toBe(field);
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

/** The files whose text differs between two serializations. */
function changedFiles(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after).filter((file) => before[file] !== after[file]);
}

/** Expect the node `id` to read back the values `opts` requested (own values override the kind's). */
function expectRequested(m: LikeC4Mutator, id: string, opts: AddDeploymentNodeOpts): void {
  const node = m.getDeploymentNode(id);
  expect(node, id).not.toBeNull();
  expect(node!.kind).toBe(opts.kind);
  expect(node!.title).toBe(opts.title);
  expect(node!.summary).toBe(opts.summary);
  expect(node!.description).toBe(opts.description);
  expect(node!.technology).toBe(opts.technology);
  expect(node!.tags).toEqual(expect.arrayContaining(opts.tags ?? []));
  expect(node!.links).toEqual(opts.links);
  expect(node!.metadata).toEqual(opts.metadata);
  expect(node!.style).toMatchObject(opts.style ?? {});
}

/** Per fixture: a parent node, kinds and declared tags, and a metadata key of the fixture's own vocabulary. */
const FIXTURE_CASES = [
  {
    fixture: 'deployment-zones',
    parent: 'prod.eu',
    childKind: 'host',
    rootKind: 'environment',
    tag: 'internal',
    metadataKey: 'owner',
  },
  {
    fixture: 'deployment-clusters',
    parent: 'main.k8s',
    childKind: 'namespace',
    rootKind: 'cloud',
    tag: 'spot',
    metadataKey: 'costCenter',
  },
] as const;

/** Every property of a node; the strings differ from every kind default of both fixtures. */
function allProperties(name: string, kind: string, tag: string, metadataKey: string): AddDeploymentNodeOpts {
  return {
    name,
    kind,
    title: `Title of ${name}`,
    summary: `Summary of ${name}`,
    description: `Description of ${name}`,
    technology: `Technology of ${name}`,
    tags: [tag],
    links: [{ url: `https://example.com/${name}`, label: `Link of ${name}` }],
    metadata: { [metadataKey]: `value of ${name}`, list: ['one', 'two'] },
    style: { color: 'amber', icon: 'tech:go', border: 'dashed' },
  };
}

describe('US-6 values (row 39)', () => {
  it.each(FIXTURE_CASES)('$fixture: a child and a root node with every property', async ({ fixture, parent, childKind, rootKind, tag, metadataKey }) => {
    const files = readWorkspace(fixture);
    // P: the fixture is valid and LikeC4 has the parent node.
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.elements[parent]).toBeDefined();

    const m = LikeC4Mutator.fromFiles(files);
    const child = allProperties('added', childKind, tag, metadataKey);
    const root = allProperties('extra', rootKind, tag, metadataKey);
    expect(m.addDeploymentNode(parent, child)).toBe(`${parent}.added`);
    expect(m.addDeploymentNode(null, root)).toBe('extra');

    expectRequested(m, `${parent}.added`, child);
    expectRequested(m, 'extra', root);
    expect(m.getDeploymentNode(`${parent}.added`)!.parentId).toBe(parent);
    await expectValidWrite(m);
  });

  it('a parent without a body gets one holding the child', async () => {
    const files = {
      'a.c4': `specification {
  deploymentNode vm
  tag t
}
deployment {
  vm prod 'Production'
  vm other
}
`,
    };
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const child = allProperties('inner', 'vm', 't', 'owner');
    expect(m.addDeploymentNode('prod', child)).toBe('prod.inner');

    expectRequested(m, 'prod.inner', child);
    expect(m.getDeploymentNode('prod')!.title).toBe('Production');
    await expectValidWrite(m);
    const { deployments } = await buildLikeC4Model(m.serialize());
    expect(Object.keys(deployments.elements).sort()).toEqual(['other', 'prod', 'prod.inner']);
  });
});

describe('US-5 placement of a root node (row 40)', () => {
  const SPEC = `specification {
  deploymentNode vm
}
`;
  const MODEL = `model {
}
`;

  it('LikeC4 orders documents by path, not by load order (OP)', async () => {
    // Loaded b.c4 first; LikeC4 lists the root node of a.c4 first.
    const { deployments } = await buildLikeC4Model({
      'b.c4': 'deployment {\n  vm second\n}\n',
      'a.c4': `${SPEC}deployment {\n  vm first\n}\n`,
    });
    expect(Object.keys(deployments.elements)).toEqual(['first', 'second']);
  });

  interface PlacementCase {
    name: string;
    files: Record<string, string>;
    file: string | undefined;
    expected: string;
  }

  it.each<PlacementCase>([
    {
      name: '(a) no block anywhere: the first file in document order with a model block',
      files: { 'c.c4': MODEL, 'b.c4': MODEL, 'a.c4': SPEC },
      file: undefined,
      expected: 'b.c4',
    },
    {
      name: '(b) no model block: the first file in document order',
      files: { 'b.c4': SPEC, 'a.c4': '// notes\n' },
      file: undefined,
      expected: 'a.c4',
    },
    {
      name: '(c) an existing block: the first file in document order that has one',
      files: { 'c.c4': `${SPEC}${MODEL}deployment {\n  vm p\n}\n`, 'b.c4': 'deployment {\n  vm q\n}\n', 'a.c4': MODEL },
      file: undefined,
      expected: 'b.c4',
    },
    {
      name: '(d) an explicit blockless file while other files have blocks',
      files: { 'c.c4': `${SPEC}deployment {\n  vm p\n}\n`, 'b.c4': 'deployment {\n  vm q\n}\n', 'a.c4': MODEL },
      file: 'a.c4',
      expected: 'a.c4',
    },
  ])('$name', async ({ files, file, expected }) => {
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const blocksBefore = files[expected]!.split('deployment {').length - 1;
    expect(m.addDeploymentNode(null, { name: 'added', kind: 'vm', ...(file !== undefined && { file }) })).toBe('added');

    const after = m.serialize();
    expect(changedFiles(files, after)).toEqual([expected]);
    // A new block only where the file had none.
    expect(after[expected]!.split('deployment {').length - 1).toBe(Math.max(blocksBefore, 1));
    expect(m.getDeploymentNode('added')).not.toBeNull();
    await expectValidWrite(m);
  });

  it('(e) no loaded file: rejected', () => {
    const m = LikeC4Mutator.fromFiles({});
    expectRejected(m, undefined, 'added', () => m.addDeploymentNode(null, { name: 'added', kind: 'vm' }));
    expect(m.serialize()).toEqual({});
  });
});

describe('the file option (row 41, D11)', () => {
  it.each([
    { name: 'an unknown file', parent: null, file: 'missing.c4', id: 'added' },
    { name: 'a file for a child node', parent: 'prod.eu', file: 'deployment.c4', id: 'prod.eu.added' },
  ])('$name is rejected on file', ({ parent, file, id }) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, 'file', id, () => m.addDeploymentNode(parent, { name: 'added', kind: 'host', file }));
  });
});

describe('rejection classes (rows 42, 91)', () => {
  const ZONES = readWorkspace('deployment-zones');

  it.each([
    { name: 'an undeclared kind', parent: 'prod.eu', opts: { name: 'added', kind: 'server' }, field: 'kind' },
    { name: 'a name with a dot', parent: 'prod.eu', opts: { name: 'a.b', kind: 'host' }, field: 'name' },
    { name: 'a reserved name', parent: 'prod.eu', opts: { name: 'this', kind: 'host' }, field: 'name' },
    { name: 'a keyword as name', parent: 'prod.eu', opts: { name: 'title', kind: 'host' }, field: 'name' },
    { name: 'the id of a node declared in an extend body', parent: 'prod.eu', opts: { name: 'vm3', kind: 'host' }, field: 'name' },
    { name: 'the id of an instance declared in an extend body', parent: 'prod.eu', opts: { name: 'cache', kind: 'host' }, field: 'name' },
    { name: 'the id of an instance', parent: 'prod.eu.vm1', opts: { name: 'api', kind: 'host' }, field: 'name' },
    { name: 'the id of a node', parent: null, opts: { name: 'prod', kind: 'environment' }, field: 'name' },
    { name: 'an undeclared tag', parent: 'prod.eu', opts: { name: 'added', kind: 'host', tags: ['unknown'] }, field: 'tags[0]' },
    { name: 'an invalid style value', parent: 'prod.eu', opts: { name: 'added', kind: 'host', style: { color: 'unknown' } }, field: 'style.color' },
    { name: 'a parent that is an instance', parent: 'prod.eu.vm1.api', opts: { name: 'added', kind: 'host' }, field: 'parent' },
    { name: 'a missing parent', parent: 'prod.us', opts: { name: 'added', kind: 'host' }, field: 'parent' },
    // Row 91: unsafe parent input.
    { name: "parent 'prod }'", parent: 'prod }', opts: { name: 'added', kind: 'host' }, field: 'parent' },
    { name: "parent 'prod''", parent: "prod'", opts: { name: 'added', kind: 'host' }, field: 'parent' },
    { name: "parent ''", parent: '', opts: { name: 'added', kind: 'host' }, field: 'parent' },
  ])('$name → $field', ({ parent, opts, field }) => {
    const m = LikeC4Mutator.fromFiles(ZONES);
    const id = parent === null ? opts.name : `${parent}.${opts.name}`;
    expectRejected(m, field, id, () => m.addDeploymentNode(parent, opts));
  });

  it('a parent declared twice is ambiguous, naming both declarations', () => {
    const m = LikeC4Mutator.fromFiles({
      'a.c4': 'specification {\n  deploymentNode vm\n}\ndeployment {\n  vm prod\n}\n',
      'b.c4': 'deployment {\n  vm prod\n}\n',
    });
    const error = expectRejected(m, 'parent', 'prod.added', () => m.addDeploymentNode('prod', { name: 'added', kind: 'vm' }));
    expect(error.detail).toContain("'a.c4'");
    expect(error.detail).toContain("'b.c4'");
  });
});

describe('title escaping (row 43)', () => {
  it.each([`It's mine`, 'back\\slash', 'a/b', 'escaped \\/ slash'])('%s reads back as written', async (title) => {
    const files = { 'a.c4': 'specification {\n  deploymentNode vm\n}\ndeployment {\n  vm prod\n}\n' };
    const m = LikeC4Mutator.fromFiles(files);
    m.addDeploymentNode('prod', { name: 'added', kind: 'vm', title });
    expect(m.getDeploymentNode('prod.added')!.title).toBe(title);
    const { deployments } = await buildLikeC4Model(m.serialize());
    expect(deployments.getters['prod.added']!.title).toBe(title);
    await expectValidWrite(m);
  });
});

describe('node additions keep existing references (row 44)', () => {
  const SPEC = `specification {
  element service
  deploymentNode vm
}
`;

  interface ReferenceCase {
    name: string;
    input: string;
    parent: string | null;
    added: string;
    /** The text the rejected call would write: `input` with the node declared */
    written: (input: string) => string;
    /** LikeC4's target of the guarded reference in `files`, null when unresolved or dropped */
    observe: (files: Record<string, string>) => Promise<unknown>;
    /** What the guarded reference links to before the write */
    before: unknown;
  }

  /** The source of LikeC4's deployment relation titled 'R'; null when LikeC4 dropped it. */
  const relationSource = async (files: Record<string, string>) =>
    (await buildLikeC4Model(files)).deployments.relations.find((r) => r.title === 'R')?.source ?? null;
  /** LikeC4's target of the deployment view reference written as `text`; it must be listed once. */
  const viewTarget = (text: string) => async (files: Record<string, string>) => {
    const found = (await linkedReferences(files)).filter((r) => r.role === 'deploymentView' && r.text === text);
    expect(found).toHaveLength(1);
    return found[0]!.target;
  };

  const CASES: ReferenceCase[] = [
    {
      name: '(a) a second unique-descendant name makes an endpoint ambiguous',
      input: `${SPEC}deployment {
  vm prod {
    vm inner {
      vm x
    }
    vm y {
    }
  }
  prod.x -> prod.y 'R'
}
`,
      parent: 'prod.y',
      added: 'x',
      written: (input) => input.replace('    vm y {\n', '    vm y {\n      vm x\n'),
      observe: relationSource,
      before: { deployment: 'prod.inner.x' },
    },
    {
      name: '(b) a root node takes a parentless name ahead of an instance used by an endpoint',
      input: `${SPEC}model {
  app = service
}
deployment {
  vm prod {
    api = instanceOf app
  }
  vm other
  api -> other 'R'
}
`,
      parent: null,
      added: 'api',
      written: (input) => input.replace('  vm other\n', '  vm other\n  vm api\n'),
      observe: relationSource,
      before: { deployment: 'prod.api' },
    },
    {
      name: '(b) a root node takes a parentless name ahead of an instance used by a view rule',
      input: `${SPEC}model {
  app = service
}
deployment {
  vm prod {
    api = instanceOf app
  }
}
views {
  deployment view dv {
    include api
  }
}
`,
      parent: null,
      added: 'api',
      written: (input) => input.replace('deployment {\n', 'deployment {\n  vm api\n'),
      observe: viewTarget('api'),
      before: { deployment: 'prod.api' },
    },
    {
      name: '(c) a root node takes a parentless name ahead of a logical element in a style rule',
      input: `${SPEC}model {
  app = service {
    api = service
  }
}
deployment {
  vm prod {
    a = instanceOf app.api
  }
}
views {
  deployment view dv {
    include prod.**
    style api {
      color red
    }
  }
}
`,
      parent: null,
      added: 'api',
      written: (input) => input.replace('deployment {\n', 'deployment {\n  vm api\n'),
      observe: viewTarget('api'),
      before: { model: 'app.api' },
    },
  ];

  it.each(CASES)('$name: rejected on name', async ({ input, parent, added, written, observe, before }) => {
    const files = { 'm.c4': input };
    await expectValidLikeC4(files);
    // OP: LikeC4 links the guarded reference before the write and links it
    // elsewhere (or not at all) in the text the rejected call would write.
    expect(await observe(files)).toEqual(before);
    const writtenFiles = { 'm.c4': written(input) };
    expect(writtenFiles['m.c4']).not.toBe(input);
    expect(await observe(writtenFiles)).not.toEqual(before);

    const m = LikeC4Mutator.fromFiles(files);
    const id = parent === null ? added : `${parent}.${added}`;
    expectRejected(m, 'name', id, () => m.addDeploymentNode(parent, { name: added, kind: 'vm' }));
  });

  it('a node with another name in the same container is accepted', async () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': CASES[0]!.input });
    expect(m.addDeploymentNode('prod.y', { name: 'w', kind: 'vm' })).toBe('prod.y.w');
    expect(m.listDeploymentRelationships()[0]!.source).toEqual({ id: 'prod.inner.x' });
    await expectValidWrite(m);
  });
});

describe('strict extend paths (row 45)', () => {
  it.each([
    { fixture: 'deployment-zones', parent: 'prod', target: 'eu', targetKind: 'zone', extendChild: 'vm3', kind: 'host' },
    { fixture: 'deployment-clusters', parent: 'main.k8s', target: 'apps', targetKind: 'namespace', extendChild: 'workers', kind: 'namespace' },
  ])('$fixture', async ({ fixture, parent, target, targetKind, extendChild, kind }) => {
    const files = readWorkspace(fixture);
    const extendTarget = `${parent}.${target}`;
    // P: the fixture is valid and extends `extendTarget`, whose extend body declares `extendChild`.
    await expectValidLikeC4(files);
    const extendsBefore = (await linkedReferences(files)).filter((r) => r.role === 'extend');
    expect(extendsBefore.length).toBeGreaterThan(0);
    expect(extendsBefore.every((r) => r.text === extendTarget && r.target !== null)).toBe(true);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.elements[`${extendTarget}.${extendChild}`]).toBeDefined();

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', extendTarget, () => m.addDeploymentNode(parent, { name: target, kind: targetKind }));
    expectRejected(m, 'name', `${extendTarget}.${extendChild}`, () =>
      m.addDeploymentNode(extendTarget, { name: extendChild, kind }),
    );

    expect(m.addDeploymentNode(extendTarget, { name: 'added', kind })).toBe(`${extendTarget}.added`);
    expect((await linkedReferences(m.serialize())).filter((r) => r.role === 'extend').map((r) => [r.text, r.target])).toEqual(
      extendsBefore.map((r) => [r.text, r.target]),
    );
    await expectValidWrite(m);
  });
});
