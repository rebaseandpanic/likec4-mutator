/**
 * Adding and removing `extend <node>` blocks (US-11, US-12 / INV-8 for
 * their removal).
 *
 *  - Addition: contributions in the chosen file (row 71), rejection classes
 *    (row 72).
 *  - Removal: selection by node, file and occurrence, children with their
 *    references (row 73), multiplicity and re-targeting of survivors
 *    (row 74).
 *  - Unsafe node and file input (row 90).
 *  - Equal reference texts in different extend scopes (row 93).
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
import type { AddDeploymentExtendOpts } from '../../src/mutator/deployment-ops.js';
import type { DeploymentEndpoint } from '../../src/query/types.js';
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

/** 1-based lines of `text` that start (after indentation) with `prefix`. */
function linesStartingWith(text: string, prefix: string): number[] {
  return text.split('\n').flatMap((line, i) => (line.trimStart().startsWith(prefix) ? [i + 1] : []));
}

/** True when deployment id `id` is `root` or below it. */
const inSubtree = (id: string, root: string): boolean => id === root || id.startsWith(root + '.');

/** LikeC4's deployment relations of `files` as `{ source, target, title }`, keyed by title. */
async function likec4Relations(files: Record<string, string>): Promise<Map<string, { source: DeploymentEndpoint; target: DeploymentEndpoint }>> {
  const { deployments } = await buildLikeC4Model(files);
  const endpoint = (e: { deployment: string; element?: string }): DeploymentEndpoint =>
    e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
  return new Map(
    deployments.relations.map((r) => [deployments.relationGetters[r.id]!.title ?? '', { source: endpoint(r.source), target: endpoint(r.target) }]),
  );
}

const SPEC = `specification {
  element service
  deploymentNode zone
  deploymentNode vm
  tag t
}
model {
  app = service {
    api = service
    db = service
  }
}
`;

describe('US-11 addition (row 71)', () => {
  // Per fixture: a node with extend blocks in other files, a file that has
  // a deployment block, and a declared tag.  `extra.c4` has no deployment
  // block while the others do.
  const CASES: Array<{ fixture: string; node: string; file: string; tag: string }> = [
    { fixture: 'deployment-zones', node: 'prod.eu.vm1', file: 'ext/eu.c4', tag: 'public' },
    { fixture: 'deployment-zones', node: 'prod.eu', file: 'extra.c4', tag: 'replica' },
    { fixture: 'deployment-clusters', node: 'main.k8s', file: 'ext/apps.c4', tag: 'beta' },
    { fixture: 'deployment-clusters', node: 'main.k8s.apps', file: 'extra.c4', tag: 'managed' },
  ];

  it.each(CASES)('$fixture: $node in $file', async ({ fixture, node, file, tag }) => {
    const files: Record<string, string> = { ...readWorkspace(fixture), 'extra.c4': 'model {\n}\n' };
    // P: the input is valid, LikeC4 has the node, and only the other files
    // have deployment blocks when the file is extra.c4.
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.elements[node]?.kind).toBeDefined();
    expect(files['extra.c4']).not.toContain('deployment');

    const opts: AddDeploymentExtendOpts = {
      file,
      tags: [tag],
      links: [{ url: 'https://example.com/extended', label: 'Extended' }],
      metadata: { added: 'yes', list: ['a', 'b'] },
    };
    const m = LikeC4Mutator.fromFiles(files);
    const before = m.getDeploymentNode(node)!;
    m.addDeploymentExtend(node, opts);

    // Only the chosen file changed; its text before stays in place.
    const after = m.serialize();
    for (const other of Object.keys(files).filter((f) => f !== file)) expect(after[other]).toBe(files[other]);
    expect(after[file]!.length).toBeGreaterThan(files[file]!.length);

    // Provenance: one more block, in the chosen file at the line LikeC4
    // links an extend of the node from, contributing the request.
    const linked = (await linkedReferences(after)).filter((r) => r.role === 'extend' && r.text === node);
    const read = m.getDeploymentNode(node)!;
    expect(read.extendedBy).toHaveLength((before.extendedBy ?? []).length + 1);
    expect(read.extendedBy!.map((e) => `${e.file}:${e.sourceRange.line + 1}`).sort()).toEqual(linked.map((r) => r.at).sort());
    expect(linked.every((r) => r.target !== null && 'deployment' in r.target && r.target.deployment === node)).toBe(true);
    expect(read.extendedBy!.filter((e) => e.file === file).at(-1)).toMatchObject({
      tags: opts.tags,
      links: opts.links,
      metadata: opts.metadata,
    });
    await expectValidWrite(m);
  });
});

describe('rejections of an addition (row 72)', () => {
  it.each<{ name: string; node: string; opts: AddDeploymentExtendOpts; field: string }>([
    { name: 'an instance target', node: 'prod.eu.vm1.api', opts: { file: 'deployment.c4', tags: ['public'] }, field: 'node' },
    { name: 'a missing node', node: 'prod.eu.nosuch', opts: { file: 'deployment.c4', tags: ['public'] }, field: 'node' },
    { name: 'an unknown file', node: 'prod.eu', opts: { file: 'nosuch.c4', tags: ['public'] }, field: 'file' },
    { name: 'no contribution', node: 'prod.eu', opts: { file: 'deployment.c4' }, field: 'tags' },
    { name: 'empty contributions', node: 'prod.eu', opts: { file: 'deployment.c4', tags: [], links: [], metadata: {} }, field: 'tags' },
    { name: 'an undeclared tag', node: 'prod.eu', opts: { file: 'deployment.c4', tags: ['nosuch'] }, field: 'tags[0]' },
    { name: 'an empty metadata list', node: 'prod.eu', opts: { file: 'deployment.c4', metadata: { k: [] } }, field: 'metadata.k' },
  ])(
    'rejects $name on $field',
    ({ node, opts, field }) => {
      const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
      expectRejected(m, field, () => m.addDeploymentExtend(node, opts));
    },
  );

  it('LikeC4 reports an extend of an instance', async () => {
    const files = readWorkspace('deployment-zones');
    const byHand = { ...files, 'extra.c4': 'deployment {\n  extend prod.eu.vm1.api {\n    #public\n  }\n}\n' };
    expect(await validateLikeC4(byHand)).not.toEqual([]);
  });
});

describe('US-11 removal (row 73)', () => {
  // Per fixture: an extend block with a node declared in it, which has
  // relationships into it.
  const CASES: Array<{ fixture: string; node: string; file: string; child: string }> = [
    { fixture: 'deployment-zones', node: 'prod.eu', file: 'ext/eu.c4', child: 'prod.eu.vm3' },
    { fixture: 'deployment-clusters', node: 'main.k8s.apps', file: 'ext/apps.c4', child: 'main.k8s.apps.workers' },
  ];

  it.each(CASES)('$fixture: the block in $file with $child', async ({ fixture, node, file, child }) => {
    const files = readWorkspace(fixture);
    // P: the input is valid; LikeC4 has the child and relations into it.
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.elements[child]).toBeDefined();
    const endpoint = (e: { deployment: string; element?: string }): DeploymentEndpoint =>
      e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
    const into = deployments.relations
      .filter((r) => inSubtree(r.source.deployment, child) || inSubtree(r.target.deployment, child))
      .map((r) => {
        const title = deployments.relationGetters[r.id]!.title;
        return { source: endpoint(r.source), target: endpoint(r.target), ...(title && { title }) };
      });
    expect(into.length).toBeGreaterThan(0);

    const m = LikeC4Mutator.fromFiles(files);
    const { removedRelationships } = m.removeDeploymentExtend({ node, file });
    expect(removedRelationships).toEqual(expect.arrayContaining(into));
    expect(removedRelationships).toHaveLength(into.length);

    // Nothing of the child is left; the node and its other blocks remain.
    const after = await buildLikeC4Model(m.serialize());
    expect(Object.keys(after.deployments.elements).filter((id) => inSubtree(id, child))).toEqual([]);
    expect(after.deployments.elements[node]).toBeDefined();
    for (const other of Object.keys(files).filter((f) => f !== file)) expect(m.serialize()[other]).toBe(files[other]);
    await expectValidWrite(m);
  });

  describe('occurrence', () => {
    const files = readWorkspace('deployment-zones');
    const second = '  extend prod.eu {\n    #public\n    vm4 = host\n  }\n';
    const twice = { ...files, 'ext/eu.c4': files['ext/eu.c4']!.replace(/\n}\n$/, `\n${second}}\n`) };

    it('rejects several blocks without an occurrence, naming them', async () => {
      await expectValidLikeC4(twice);
      const lines = linesStartingWith(twice['ext/eu.c4']!, 'extend prod.eu');
      expect(lines).toHaveLength(2);
      const m = LikeC4Mutator.fromFiles(twice);
      const error = expectRejected(m, 'occurrence', () => m.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4' }));
      for (const line of lines) expect(error.detail).toContain(String(line));
    });

    it('counts from 1 in source order', async () => {
      const m = LikeC4Mutator.fromFiles(twice);
      m.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4', occurrence: 2 });
      expect(m.serialize()['ext/eu.c4']).toBe(files['ext/eu.c4']);
      await expectValidWrite(m);

      const first = LikeC4Mutator.fromFiles(twice);
      first.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4', occurrence: 1 });
      expect(first.serialize()['ext/eu.c4']).toContain(second);
      expect(first.getDeploymentNode('prod.eu.vm4')).not.toBeNull();
      expect(first.getDeploymentNode('prod.eu.vm3')).toBeNull();
      await expectValidWrite(first);
    });

    it.each([0, 3, 1.5])('rejects occurrence %s', (occurrence) => {
      const m = LikeC4Mutator.fromFiles(twice);
      expectRejected(m, 'occurrence', () => m.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4', occurrence }));
    });

    it('rejects a file without a block of the node', () => {
      const m = LikeC4Mutator.fromFiles(files);
      expectRejected(m, 'node', () => m.removeDeploymentExtend({ node: 'prod.eu', file: 'deployment.c4' }));
      expectRejected(m, 'node', () => m.removeDeploymentExtend({ node: 'prod.eu.vm1', file: 'ext/eu.c4' }));
    });
  });

  it('rejects the removal while a deployment view refers to what is declared in the block', async () => {
    const files = readWorkspace('deployment-zones');
    const viewed = {
      ...files,
      'deployment.c4': files['deployment.c4']!.replace('    style prod.eu.vm2.web {', '    style prod.eu.vm3 {\n      color red\n    }\n    style prod.eu.vm2.web {'),
    };
    // OP: LikeC4 links the view rule to the node declared in the block.
    const rule = (await linkedReferences(viewed)).find((r) => r.role === 'deploymentView' && r.text === 'prod.eu.vm3');
    expect(rule?.target).toEqual({ deployment: 'prod.eu.vm3' });

    const m = LikeC4Mutator.fromFiles(viewed);
    expectRejected(m, 'node', () => m.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4' }));
  });
});

describe('removal vs survivors (row 74)', () => {
  it('removing the first of two blocks with equal body references keeps the second block matched', async () => {
    const files = {
      'a.c4': `${SPEC}deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
    vm vm2
  }
  extend prod {
    vm a {
      instanceOf app.db
    }
    vm1.api -> vm2 'first'
  }
  extend prod {
    vm b {
      instanceOf app.db
    }
    vm1.api -> vm2 'second'
  }
}
`,
    };
    await expectValidLikeC4(files);
    const survivors = async (input: Record<string, string>) => {
      const from = linesStartingWith(input['a.c4']!, 'extend prod').at(-1)!;
      return (await linkedReferences(input))
        .filter((r) => Number(r.at.split(':')[1]) >= from)
        .map(({ role, text, target }) => ({ role, text, target }));
    };
    const before = await survivors(files);
    expect(before.map((r) => r.role)).toEqual(['extend', 'instanceOf']);
    const second = (await likec4Relations(files)).get('second');
    expect(second).toBeDefined();

    const m = LikeC4Mutator.fromFiles(files);
    m.removeDeploymentExtend({ node: 'prod', file: 'a.c4', occurrence: 1 });
    expect(await survivors(m.serialize())).toEqual(before);
    expect((await likec4Relations(m.serialize())).get('second')).toEqual(second);
    expect(m.getDeploymentNode('prod.a')).toBeNull();
    await expectValidWrite(m);
  });

  it('rejects removing a block whose child makes a surviving endpoint resolve elsewhere', async () => {
    const block = '  extend outer.prod {\n    zone b {\n      vm n\n    }\n  }\n';
    const files = {
      'a.c4': `${SPEC}deployment {
  zone outer {
    zone prod {
      zone a {
        vm n
      }
    }
  }
${block}  extend outer.prod {
    zone c {
      -> n 'R'
    }
  }
}
`,
      'b.c4': 'deployment {\n  zone n\n}\n',
    };
    // OP: with both `n` below `outer.prod`, LikeC4 links `-> n` to the root
    // node `n`; without the block's `n`, to `outer.prod.a.n`.
    await expectValidLikeC4(files);
    expect((await likec4Relations(files)).get('R')?.target).toEqual({ id: 'n' });
    const byHand = { ...files, 'a.c4': files['a.c4'].replace(block, '') };
    expect((await likec4Relations(byHand)).get('R')?.target).toEqual({ id: 'outer.prod.a.n' });

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'node', () => m.removeDeploymentExtend({ node: 'outer.prod', file: 'a.c4', occurrence: 1 }));
  });
});

describe('unsafe node and file input (row 90)', () => {
  it.each(['prod }', 'prod.vm1 {', "prod'"])('refuses node %j', (node) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, 'node', () => m.addDeploymentExtend(node, { file: 'deployment.c4', tags: ['public'] }));
    expectRejected(m, 'node', () => m.removeDeploymentExtend({ node, file: 'ext/eu.c4' }));
  });

  it.each(['', '../a.c4'])('refuses file %j', (file) => {
    const m = LikeC4Mutator.fromFiles(readWorkspace('deployment-zones'));
    expectRejected(m, 'file', () => m.addDeploymentExtend('prod.eu', { file, tags: ['public'] }));
    expectRejected(m, 'file', () => m.removeDeploymentExtend({ node: 'prod.eu', file }));
  });
});

describe('equal references in different extend scopes (row 93)', () => {
  // `vm1.api -> db` is written in `extend p` and in `extend q`; each links
  // inside its own extended node.
  const files = {
    'a.c4': `${SPEC}deployment {
  zone p {
    vm vm1 {
      instanceOf app.api
    }
    vm vmx {
      instanceOf app.db
    }
  }
  zone q {
    vm vm1 {
      instanceOf app.api
    }
    vm vmy {
      instanceOf app.db
    }
  }
  extend p {
    vm1.api -> db 'P'
  }
  extend q {
    vm1.api -> db 'Q'
  }
}
`,
  };
  const P = { source: { id: 'p.vm1.api' }, target: { id: 'p.vmx.db' } };
  const Q = { source: { id: 'q.vm1.api' }, target: { id: 'q.vmy.db' } };

  it('rejects an addition that changes only the reference in q', async () => {
    // OP: LikeC4 links each reference in its own scope; a node `db` in q
    // re-targets only q's.
    await expectValidLikeC4(files);
    const relations = await likec4Relations(files);
    expect([relations.get('P'), relations.get('Q')]).toEqual([P, Q]);
    const byHand = await likec4Relations({ 'a.c4': files['a.c4'].replace('  zone q {\n', '  zone q {\n    vm db\n') });
    expect([byHand.get('P'), byHand.get('Q')]).toEqual([P, { ...Q, target: { id: 'q.db' } }]);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, 'name', () => m.addDeploymentNode('q', { name: 'db', kind: 'vm' }));
  });

  it('accepts an addition that changes neither', async () => {
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.addDeploymentNode('q', { name: 'vm2', kind: 'vm' })).toBe('q.vm2');
    const relations = await likec4Relations(m.serialize());
    expect([relations.get('P'), relations.get('Q')]).toEqual([P, Q]);
    await expectValidWrite(m);
  });

  it('removing p’s block keeps q’s reference matched', async () => {
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentExtend({ node: 'p', file: 'a.c4' })).toEqual({ removedRelationships: [{ ...P, title: 'P' }] });
    const relations = await likec4Relations(m.serialize());
    expect([...relations.keys()]).toEqual(['Q']);
    expect(relations.get('Q')).toEqual(Q);
    await expectValidWrite(m);
  });
});

describe('what a removed block takes with it outside itself (row 73)', () => {
  it('removes a relationship written outside the block and the extend block of the declared node in another file', async () => {
    const files = {
      'a.c4': `${SPEC}deployment {\n  zone prod {\n    vm vm1\n  }\n  extend prod {\n    vm extra\n  }\n  prod.vm1 -> prod.extra 'calls'\n}\n`,
      'b.c4': "deployment {\n  extend prod.extra {\n    #t\n  }\n}\n",
    };
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.removeDeploymentExtend({ node: 'prod', file: 'a.c4' })).toEqual({
      removedRelationships: [{ source: { id: 'prod.vm1' }, target: { id: 'prod.extra' }, title: 'calls' }],
    });
    expect(m.serialize()).toEqual({
      'a.c4': `${SPEC}deployment {\n  zone prod {\n    vm vm1\n  }\n}\n`,
      'b.c4': 'deployment {\n}\n',
    });
    await expectValidWrite(m);
  });
});
