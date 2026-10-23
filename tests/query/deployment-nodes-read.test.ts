/**
 * Deployment nodes through `getDeploymentNode` / `listDeploymentNodes`
 * (US-2): effective values, provenance, structure, filters, style and the
 * written form of opacity and icons (D18).
 *
 * Expected values come from the model LikeC4 1.60.0 builds from the same
 * files, from literals observed in that model by the reconnaissance spikes
 * (spike 02 and 06), and from the input text itself (positions,
 * declarations, written style values).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectDeploymentNodesAgreeWithLikeC4, expectValidLikeC4 } from '../helpers/likec4-model.js';

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

/** Offset of the first occurrence of `text` in `source` at or after `from`; the text must occur. */
function offsetOf(source: string, text: string, from = 0): number {
  const offset = source.indexOf(text, from);
  expect(offset, text).toBeGreaterThanOrEqual(0);
  return offset;
}

/** The node with `id`; it must exist. */
function node(mutator: LikeC4Mutator, id: string) {
  const found = mutator.getDeploymentNode(id);
  expect(found, id).not.toBeNull();
  return found!;
}

const FIXTURE_NAMES = ['deployment-zones', 'deployment-clusters'] as const;

describe('nodes of both fixtures equal LikeC4 (US-2, SC-002)', () => {
  // For each fixture, a node with tags of its own whose kind declares a tag:
  // LikeC4's getter appends the kind tag, its `$data` layer does not.
  const KIND_TAG_NODE = {
    'deployment-zones': { id: 'prod', kindTag: 'edge' },
    'deployment-clusters': { id: 'main.k8s', kindTag: 'managed' },
  } as const;

  it.each(FIXTURE_NAMES)('%s', async (fixture) => {
    const files = readWorkspace(fixture);
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files, { inferTechnologyFromIcon: false });
    const nodeIds = Object.values(deployments.elements).filter((e) => e.element === undefined);
    expect(nodeIds.length).toBeGreaterThan(0);

    // OP: the comparison uses the getter layer for tags.
    const { id, kindTag } = KIND_TAG_NODE[fixture];
    expect(deployments.getters[id]!.tags.at(-1)).toBe(kindTag);
    expect(deployments.elements[id]!.tags).not.toContain(kindTag);

    const mutator = LikeC4Mutator.fromFiles(files);
    await expectDeploymentNodesAgreeWithLikeC4(files, mutator.listDeploymentNodes());
    for (const listed of mutator.listDeploymentNodes()) expect(mutator.getDeploymentNode(listed.id)).toEqual(listed);
  });
});

describe('the US-2 rules (expected values: spike 02 and 06 literals)', () => {
  // Spike 02: a kind with defaults, own values, and two extend blocks whose
  // document order (a/z.c4, then b.c4) differs from the load order.
  const SPIKE_02 = {
    'a.c4': `specification {
  deploymentNode zone {
    #zonekind
    title 'Zone kind title'
    summary 'Zone kind summary'
    description 'Zone kind description'
    technology 'Zone kind tech'
    link https://example.com/zone-kind
    style { color green }
  }
  tag zonekind
  tag own
  tag ext1
  tag ext2
}
deployment {
  zone prod
  zone staging 'Staging' {
    #own
    link https://example.com/staging
    metadata { owner 'ops' }
  }
}
`,
    'b.c4': `deployment {
  extend staging {
    #ext1
    link https://example.com/ext-b
    metadata { owner 'ext-b'; extra 'x' }
  }
}
`,
    'a/z.c4': `deployment {
  extend staging {
    #ext2
    metadata { owner 'ext-az' }
  }
}
`,
  };
  // Spike 06: empty and self-named titles, own tags, own style, two metadata blocks.
  const SPIKE_06 = {
    'm.c4': `specification {
  deploymentNode zone {
    #k1, #k2
    title 'Kind title'
    style { color green; shape cylinder }
  }
  tag k1
  tag k2
  tag own
}
deployment {
  zone emptyInline ''
  zone emptyBody {
    title ''
  }
  zone selfNamed 'selfNamed'
  zone ownTags {
    #k2, #own
    style { shape queue }
    metadata { a '1' }
    metadata { b '2' }
  }
}
`,
  };

  const CASES: Array<[string, Record<string, string>, string, keyof ReturnType<typeof node>, unknown]> = [
    ['own values override kind defaults: own title', SPIKE_02, 'staging', 'title', 'Staging'],
    ['kind defaults apply where the node has none: summary', SPIKE_02, 'prod', 'summary', 'Zone kind summary'],
    ['kind defaults apply where the node has none: technology', SPIKE_02, 'prod', 'technology', 'Zone kind tech'],
    ['the kind title replaces a missing title', SPIKE_02, 'prod', 'title', 'Zone kind title'],
    [
      'own links replace kind links; extend links follow',
      SPIKE_02,
      'staging',
      'links',
      [{ url: 'https://example.com/staging' }, { url: 'https://example.com/ext-b' }],
    ],
    ['a node without links gets the kind links', SPIKE_02, 'prod', 'links', [{ url: 'https://example.com/zone-kind' }]],
    [
      'tags: own, then extend blocks in document order (a/z.c4 before b.c4), then the kind tags',
      SPIKE_02,
      'staging',
      'tags',
      ['own', 'ext2', 'ext1', 'zonekind'],
    ],
    [
      'metadata: own, then extend blocks in document order',
      SPIKE_02,
      'staging',
      'metadata',
      { owner: ['ops', 'ext-az', 'ext-b'], extra: 'x' },
    ],
    ["an inline '' title stays ''", SPIKE_06, 'emptyInline', 'title', ''],
    ["a body '' title stays ''", SPIKE_06, 'emptyBody', 'title', ''],
    ['a title equal to the node name becomes the kind title', SPIKE_06, 'selfNamed', 'title', 'Kind title'],
    ['tags: own tags, then the kind tags appended without duplicates', SPIKE_06, 'ownTags', 'tags', ['own', 'k2', 'k1']],
    ['tags: the kind tags when the node has none', SPIKE_06, 'emptyInline', 'tags', ['k2', 'k1']],
    ['style: kind style overridden per field by own style', SPIKE_06, 'ownTags', 'style', { color: 'green', shape: 'queue' }],
    ['only the first metadata block counts', SPIKE_06, 'ownTags', 'metadata', { a: '1' }],
  ];

  it.each(CASES)('%s', (_rule, files, id, field, expected) => {
    expect(node(LikeC4Mutator.fromFiles(files), id)[field]).toEqual(expected);
  });
});

describe('node provenance and structure', () => {
  const SPEC = `specification {
  element service
  deploymentNode zone {
    #k
    title 'Zone'
  }
  deploymentNode vm
  tag k
  tag own
  tag ext
}
model {
  app = service {
    api = service
  }
}
`;
  const A = `deployment {
  zone prod {
    #own
    link https://example.com/prod 'Prod'
    metadata {
      owner 'ops'
    }
    eu = zone {
      vm vm1 {
        instanceOf app.api
      }
    }
  }
}
`;
  // Load order: b.c4, then a/c.c4; document order: a/c.c4, then b.c4.
  const B = `deployment {
  extend prod.eu {
    #ext
    metadata {
      tier 'gold'
    }
  }
}
`;
  const C = `deployment {
  extend prod.eu {
    vm vm2
  }
}
`;
  const files = { 'spec.c4': SPEC, 'a.c4': A, 'b.c4': B, 'a/c.c4': C };

  it('reports declaration, extend blocks, kind, children and instances with files and ranges from the input', async () => {
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);

    const prod = node(mutator, 'prod');
    expect(prod).toMatchObject({ id: 'prod', name: 'prod', kind: 'zone', file: 'a.c4', children: ['prod.eu'], instances: [] });
    expect(prod.parentId).toBeUndefined();
    expect(prod.declared).toEqual({
      tags: ['own'],
      links: [{ url: 'https://example.com/prod', label: 'Prod' }],
      metadata: { owner: 'ops' },
    });
    expect(prod.sourceRange.offset).toBe(offsetOf(A, 'zone prod'));
    expect(prod.fromSpecification).toEqual({
      kind: 'zone',
      file: 'spec.c4',
      sourceRange: expect.objectContaining({ offset: offsetOf(SPEC, 'deploymentNode zone') }),
      title: 'Zone',
      tags: ['k'],
    });

    // `name = kind` form, one level down; extended twice, once with children only.
    const eu = node(mutator, 'prod.eu');
    expect(eu).toMatchObject({ name: 'eu', kind: 'zone', parentId: 'prod', file: 'a.c4', declared: {} });
    expect(eu.sourceRange.offset).toBe(offsetOf(A, 'eu = zone'));
    expect(eu.extendedBy).toEqual([
      { file: 'a/c.c4', sourceRange: expect.objectContaining({ offset: offsetOf(C, 'extend prod.eu') }) },
      {
        file: 'b.c4',
        sourceRange: expect.objectContaining({ offset: offsetOf(B, 'extend prod.eu') }),
        tags: ['ext'],
        metadata: { tier: 'gold' },
      },
    ]);
    expect([...eu.children].sort()).toEqual(['prod.eu.vm1', 'prod.eu.vm2']);
    expect(eu.instances).toEqual([]);

    // `kind name` form, three levels deep.
    const vm1 = node(mutator, 'prod.eu.vm1');
    expect(vm1).toMatchObject({ name: 'vm1', kind: 'vm', parentId: 'prod.eu', file: 'a.c4', instances: ['prod.eu.vm1.api'], children: [] });
    expect(vm1.sourceRange.offset).toBe(offsetOf(A, 'vm vm1'));
    expect(vm1.fromSpecification).toMatchObject({ kind: 'vm', file: 'spec.c4' });

    // Declared in a child-only extend block: a child of the extended node.
    const vm2 = node(mutator, 'prod.eu.vm2');
    expect(vm2).toMatchObject({ name: 'vm2', kind: 'vm', parentId: 'prod.eu', file: 'a/c.c4' });
    expect(vm2.sourceRange.offset).toBe(offsetOf(C, 'vm vm2'));

    await expectDeploymentNodesAgreeWithLikeC4(files, mutator.listDeploymentNodes());
  });
});

describe('filters', () => {
  it.each(FIXTURE_NAMES)('%s: by kind and by direct parent, as LikeC4 places the nodes', async (fixture) => {
    const files = readWorkspace(fixture);
    const { deployments } = await buildLikeC4Model(files);
    const nodes = Object.values(deployments.elements).filter((e) => e.element === undefined);
    const kinds = [...new Set(nodes.map((n) => n.kind!))];
    expect(kinds.length).toBeGreaterThan(1);
    // Some node has a grandchild node, so a descendant filter would differ from a parent filter.
    expect(nodes.some((n) => n.id.split('.').length >= 3)).toBe(true);

    const mutator = LikeC4Mutator.fromFiles(files);
    const ids = (list: Array<{ id: string }>) => list.map((n) => n.id).sort();
    for (const kind of kinds) {
      expect(ids(mutator.listDeploymentNodes({ kind })), kind).toEqual(ids(nodes.filter((n) => n.kind === kind)));
    }
    for (const parent of nodes) {
      const children = nodes.filter((n) => n.id.startsWith(`${parent.id}.`) && !n.id.slice(parent.id.length + 1).includes('.'));
      expect(ids(mutator.listDeploymentNodes({ parentId: parent.id })), parent.id).toEqual(ids(children));
    }
  });
});

describe('style reading', () => {
  it('reads the first style block, the last value of a repeated field, a body icon over style.icon, opacity as written, no theme defaults', async () => {
    const files = {
      'm.c4': `specification {
  deploymentNode zone
}
deployment {
  zone firstBlock {
    style {
      color red
      shape queue
    }
    style {
      color blue
    }
  }
  zone repeated {
    style {
      color red
      color green
    }
  }
  zone bodyIcon {
    icon tech:go
    style {
      icon tech:rust
    }
  }
  zone styleIcon {
    style {
      icon tech:rust
    }
  }
  zone translucent {
    style {
      opacity 30%
    }
  }
  zone plain
}
`,
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    expect(node(mutator, 'firstBlock').style).toEqual({ color: 'red', shape: 'queue' });
    expect(node(mutator, 'repeated').style).toEqual({ color: 'green' });
    expect(node(mutator, 'bodyIcon').style).toEqual({ icon: 'tech:go' });
    expect(node(mutator, 'styleIcon').style).toEqual({ icon: 'tech:rust' });
    expect(node(mutator, 'translucent').style).toEqual({ opacity: '30%' });
    expect(node(mutator, 'plain').style).toBeUndefined();
    await expectDeploymentNodesAgreeWithLikeC4(files, mutator.listDeploymentNodes());
  });
});

describe('style values in written form (D18)', () => {
  // LikeC4 resolves relative and root-relative icon paths and image aliases
  // to URLs and stores opacity as a clamped number; the library reports the
  // values as written.  (Opacity '040%' stands for a spelling that differs
  // from the number: LikeC4 1.60.0 accepts integer percents only, so a
  // decimal such as '40.0%' is a syntax error.)
  const KINDS = `specification {
  element service
  deploymentNode zone {
    style {
      icon ./img/kind.svg
    }
  }
  deploymentNode vm
}
`;
  const DEPLOYMENT = `deployment {
  vm relative {
    style {
      icon ./img/a.svg
    }
  }
  vm rootRelative {
    style {
      icon /img/a.svg
    }
  }
  vm alias {
    style {
      icon @/a.svg
    }
  }
  vm leadingZero {
    style {
      opacity 040%
    }
  }
  vm aboveMaximum {
    style {
      opacity 150%
    }
  }
  zone inherited
}
`;
  const files = { 'specs/kinds.c4': KINDS, 'model/deployment.c4': DEPLOYMENT };

  const CASES: Array<[string, string, 'icon' | 'opacity', (computed: unknown) => void, string]> = [
    ['a relative icon path', 'relative', 'icon', (c) => expect(c).toMatch(/^file:.*\/model\/img\/a\.svg$/), './img/a.svg'],
    ['a root-relative icon path', 'rootRelative', 'icon', (c) => expect(c).toMatch(/^file:.*\/img\/a\.svg$/), '/img/a.svg'],
    ['the default image alias', 'alias', 'icon', (c) => expect(c).toMatch(/^file:.*\/images\/a\.svg$/), '@/a.svg'],
    ['an opacity with a leading zero', 'leadingZero', 'opacity', (c) => expect(c).toBe(40), '040%'],
    ['an opacity above 100%', 'aboveMaximum', 'opacity', (c) => expect(c).toBe(100), '150%'],
    [
      "a kind's relative icon declared in another file",
      'inherited',
      'icon',
      (c) => expect(c).toMatch(/^file:.*\/specs\/img\/kind\.svg$/),
      './img/kind.svg',
    ],
  ];

  it.each(CASES)('%s: LikeC4 computes another value, the library reports the written one', async (_case, id, field, computed, written) => {
    const { deployments, errors } = await buildLikeC4Model(files);
    expect(errors).toEqual([]);
    computed(deployments.elements[id]!.style?.[field]);
    expect(node(LikeC4Mutator.fromFiles(files), id).style?.[field]).toBe(written);
  });

  it('the oracle comparison accepts the written forms', async () => {
    const mutator = LikeC4Mutator.fromFiles(files);
    await expectDeploymentNodesAgreeWithLikeC4(files, mutator.listDeploymentNodes());
  });
});

describe('strict extend targets', () => {
  it('an extend block applies only to the node its written path names', async () => {
    const files = {
      'm.c4': `specification {
  deploymentNode zone
  deploymentNode vm
  tag t
  tag u
}
deployment {
  zone prod {
    vm vm1 {
      vm inner
    }
  }
  extend prod.vm1.inner {
    #t
  }
  extend prod.inner {
    #u
  }
}
`,
    };
    const { deployments } = await buildLikeC4Model(files);
    // OP: LikeC4 applies only the first block.
    expect(deployments.getters['prod.vm1.inner']!.tags).toEqual(['t']);

    const inner = node(LikeC4Mutator.fromFiles(files), 'prod.vm1.inner');
    expect(inner.tags).toEqual(deployments.getters['prod.vm1.inner']!.tags);
    expect(inner.extendedBy).toEqual([
      { file: 'm.c4', sourceRange: expect.objectContaining({ offset: offsetOf(files['m.c4'], 'extend prod.vm1.inner') }), tags: ['t'] },
    ]);
  });
});

describe('read edge cases', () => {
  const SPEC = `specification {
  deploymentNode zone
  deploymentNode vm
  tag t
}
`;

  it('an extend block of a missing node contributes to no node', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'a.c4': `${SPEC}deployment {\n  zone prod {\n    vm vm1\n  }\n}\n`,
      'b.c4': `deployment {\n  extend nosuch {\n    #t\n    vm orphan\n  }\n}\n`,
    });
    const nodes = mutator.listDeploymentNodes();
    expect(nodes.map((n) => n.id)).toEqual(['prod', 'prod.vm1']);
    expect(nodes.every((n) => n.tags === undefined && n.extendedBy.length === 0)).toBe(true);
    expect(mutator.getDeploymentNode('nosuch')).toBeNull();
    expect(mutator.getDeploymentNode('nosuch.orphan')).toBeNull();
  });

  it('a node of an undeclared kind is left out with everything below it and its relationships, as LikeC4 leaves them out', async () => {
    const files = {
      'm.c4': `specification {
  element service
  deploymentNode vm
}
model {
  app = service
}
deployment {
  vm valid {
    instanceOf app
  }
  unknown ghost {
    vm child {
      instanceOf app
    }
    instanceOf app
  }
  ghost -> valid 'from ghost'
  valid.app -> ghost.child.app 'into ghost'
  valid -> valid.app 'kept'
}
`,
    };
    const { deployments, errors } = await buildLikeC4Model(files);
    // OP: LikeC4 reports the kind and keeps neither ghost nor anything below it.
    expect(errors.some((e) => e.includes("named 'unknown'"))).toBe(true);
    const lc4Ids = Object.keys(deployments.elements).sort();
    expect(lc4Ids).toEqual(['valid', 'valid.app']);
    expect(deployments.relations.map((r) => r.title)).toEqual(['kept']);

    const mutator = LikeC4Mutator.fromFiles(files);
    const reported = [
      ...mutator.listDeploymentNodes().map((n) => n.id),
      ...mutator.listDeploymentInstances().map((i) => i.id),
    ].sort();
    expect(reported).toEqual(lc4Ids);
    expect(mutator.listDeploymentRelationships().map((r) => r.title)).toEqual(['kept']);
    for (const id of ['ghost', 'ghost.child']) expect(mutator.getDeploymentNode(id), id).toBeNull();
    for (const id of ['ghost.app', 'ghost.child.app']) expect(mutator.getDeploymentInstance(id), id).toBeNull();
    expect(mutator.listDeploymentNodes({ kind: 'unknown' })).toEqual([]);
  });

  it('a root node declared in two files is listed once per declaration', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'a.c4': `${SPEC}deployment {\n  zone prod 'A'\n}\n`,
      'b.c4': `deployment {\n  zone prod 'B'\n}\n`,
    });
    const prod = mutator.listDeploymentNodes().filter((n) => n.id === 'prod');
    expect(prod.map((n) => [n.file, n.title])).toEqual([
      ['a.c4', 'A'],
      ['b.c4', 'B'],
    ]);
    expect(mutator.getDeploymentNode('prod')?.file).toBe('a.c4');
  });

  it('reads the nodes the parser recovers from a file with a syntax error', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'a.c4': `${SPEC}deployment {\n  zone ok\n}\n`,
      'b.c4': `deployment {\n  zone r1 {\n    title 'R1'\n  }\n  zone r2 {\n    title\n  }\n  zone r3\n}\n`,
    });
    expect(mutator.validate()).toHaveLength(1);
    expect(mutator.listDeploymentNodes().map((n) => [n.id, n.title, n.file])).toEqual([
      ['ok', 'ok', 'a.c4'],
      ['r1', 'R1', 'b.c4'],
      ['r2', 'r2', 'b.c4'],
      ['r3', 'r3', 'b.c4'],
    ]);
  });
});
