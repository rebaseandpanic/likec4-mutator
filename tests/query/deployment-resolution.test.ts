/**
 * Deployment references resolve to the targets LikeC4 1.59.4 links them to:
 * relationship endpoints, `instanceOf` targets, `extend <node>` targets and
 * references in deployment view rules.
 *
 * Every expected target is LikeC4's own observation of the same sources,
 * never the library's code: the endpoints of `$data.deployments.relations`
 * and the `element` of `$data.deployments.elements` (`buildLikeC4Model`), and
 * the targets LikeC4's linker bound (`linkedReferences`).  A reference LikeC4
 * leaves unresolved — an ambiguous name included — must resolve to nothing.
 */
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { DeploymentResolver, type LinkedTarget } from '../../src/query/deployment-resolver.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import { buildLikeC4Model, linkedReferences, type LinkedReference } from '../helpers/likec4-model.js';

const SPEC = `
specification {
  element service
  deploymentNode zone
  deploymentNode vm
  relationship calls
  tag t1
}
model {
  app = service {
    api = service {
      sub = service
    }
    db = service
    cache = service
  }
  other = service {
    cache = service
  }
}
`;

const one = (deployment: string): Record<string, string> => ({ 'm.c4': `${SPEC}deployment {\n${deployment}\n}\n` });

/** The library side: every document parsed standalone, indexed and resolved. */
function library(files: Record<string, string>) {
  const documents = Object.entries(files).map(([file, source]) => ({ file, ast: new C4Parser().parse(source).ast }));
  const index = new DeploymentIndex(documents);
  return { index, resolver: new DeploymentResolver(index, new WorkspaceIndex(documents)) };
}

interface CstLike {
  text: string;
  range: { start: { line: number } };
}

/** `<file>:<line>` (1-based) and the text of a written reference, as `linkedReferences` reports it. */
function written(file: string | undefined, node: unknown): string {
  const cst = (node as { $cstNode: CstLike }).$cstNode;
  return `${file}:${cst.range.start.line + 1} ${cst.text}`;
}

/**
 * LikeC4's linked references of one role, keyed as {@link written}.  OP: a
 * `null` target has LikeC4's `Could not resolve reference` diagnostic at its
 * line, a resolved one has none.
 */
async function linked(files: Record<string, string>, role: LinkedReference['role']): Promise<Map<string, LinkedTarget | null>> {
  const { diagnostics } = await buildLikeC4Model(files);
  const out = new Map<string, LinkedTarget | null>();
  for (const ref of await linkedReferences(files)) {
    if (ref.role !== role) continue;
    const unresolved = diagnostics.some((d) => d.startsWith(`${ref.at}: Could not resolve reference`));
    expect(unresolved, `${ref.at} ${ref.text}: diagnostic agrees with the linked target`).toBe(ref.target === null);
    out.set(`${ref.at} ${ref.text}`, ref.target);
  }
  return out;
}

describe('deployment reference resolution', () => {
  // Each relationship carries a distinct title; LikeC4's endpoints are read
  // from the relation with that title, and a relation LikeC4 drops (an
  // unresolved endpoint) must resolve to nothing.
  const RELATIONS: Array<[string, Record<string, string>]> = [
    [
      'A: a root node beats a closer instance',
      one(`zone api\nzone prod {\n  instanceOf app.api\n  instanceOf app.db\n  api -> db 'A1'\n}`),
    ],
    [
      'B: a qualified name through a unique descendant',
      one(`zone prod {\n  vm vm1 {\n    instanceOf app.api\n  }\n  instanceOf app.db\n}\nprod.api -> prod.db 'B1'`),
    ],
    [
      'C: an ambiguous descendant name is unresolved',
      one(
        `zone prod {\n  vm vm1 {\n    instanceOf app.api\n  }\n  vm vm2 {\n    instanceOf app.api\n  }\n  instanceOf app.db\n}\nprod.api -> prod.db 'C1'`,
      ),
    ],
    [
      'D: root nodes and document scope across files',
      {
        'a.c4': `${SPEC}deployment {\n  zone prod {\n    instanceOf app.api\n  }\n  zone dr {\n    instanceOf app.db\n    db -> prod 'D1'\n    db -> api 'D2'\n  }\n}\n`,
        'b.c4': `deployment {\n  zone edge {\n    instanceOf app.cache\n  }\n  edge.cache -> prod.api 'D3'\n}\n`,
      },
    ],
    [
      'E: source-less relationships and `it` in node and instance bodies',
      one(
        `zone prod {\n  instanceOf app.db\n  instanceOf app.api {\n    -> db 'E1'\n    it -> db 'E2'\n  }\n  -> dr 'E3'\n}\nzone dr`,
      ),
    ],
    [
      'F: an endpoint inside the element of an instance',
      one(`zone prod {\n  instanceOf app.api\n  instanceOf app.db\n}\nprod.db -> prod.api.sub 'F1'`),
    ],
    [
      'G: an extend body sees the extended node and its descendants',
      {
        'a.c4': `${SPEC}deployment {\n  zone prod {\n    vm vm1 {\n      instanceOf app.api\n    }\n  }\n}\n`,
        'b.c4': `deployment {\n  extend prod {\n    instanceOf app.db\n    api -> db 'G1'\n    prod -> dr 'G2'\n  }\n  zone dr\n}\n`,
      },
    ],
    [
      'H: short names unique in the document',
      one(`zone prod {\n  vm vm1 {\n    instanceOf app.api\n  }\n}\nzone dr {\n  instanceOf app.db\n}\napi -> db 'H1'`),
    ],
    ['#12: a model FQN is not a deployment endpoint', one(`zone prod {\n  instanceOf app.api\n}\nprod.api -> app.db 'S12'`)],
    ['#13: a node and its own instance', one(`zone prod {\n  instanceOf app.api\n}\nprod -> prod.api 'S13'`)],
    ['#14: an instance and itself', one(`zone prod {\n  instanceOf app.api\n}\nprod.api -> prod.api 'S14'`)],
    ['#15: an element nested in an instance', one(`zone prod {\n  instanceOf app.api\n  instanceOf app.db\n}\nprod.db -> prod.api.sub 'S15'`)],
    [
      '#23: instances in different nodes',
      one(`zone prod {\n  instanceOf app.api\n}\nzone dr {\n  instanceOf app.db\n}\nprod.api -> dr.db 'S23'`),
    ],
    [
      '#24: an instance and an ancestor node',
      one(`zone prod {\n  vm vm1 {\n    instanceOf app.api\n  }\n}\nprod.vm1.api -> prod 'S24'`),
    ],
    [
      '#37: an instance declared in an extend body',
      one(`zone prod {\n  vm vm1\n}\nextend prod.vm1 {\n  instanceOf app.api\n}\nprod.vm1.api -> prod 'S37'`),
    ],
  ];

  it.each(RELATIONS)('relationship endpoints equal LikeC4: %s', async (_case, files) => {
    const { index, resolver } = library(files);
    const { deployments } = await buildLikeC4Model(files);
    const relations = index.relations();
    const titles = relations.map((r) => r.node['title'] as string);
    expect(relations.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
    expect(deployments.relations.every((r) => titles.includes(r.title!))).toBe(true);

    for (const relation of relations) {
      const title = relation.node['title'] as string;
      const expected = deployments.relations.find((r) => r.title === title);
      expect(resolver.relationEndpoints(relation), title).toEqual(
        expected && { source: expected.source, target: expected.target },
      );
    }
  });

  it('instanceOf targets equal LikeC4: element scope in node, nested and extend bodies', async () => {
    const files = one(`zone prod {
  instanceOf api
  instanceOf sub
  vm vm1 {
    instanceOf app.db
  }
}
extend prod.vm1 {
  inner = instanceOf db
  deep = instanceOf app.api.sub
}
zone dr {
  instanceOf prod
  instanceOf cache
  instanceOf app.missing
}`);
    const { index, resolver } = library(files);
    const { deployments } = await buildLikeC4Model(files);
    const expected = await linked(files, 'instanceOf');
    const instances = index.ids().flatMap((id) => index.declarations(id)).filter((d) => d.type === 'instance');
    expect(instances).toHaveLength(8);
    expect([...expected.values()].filter((t) => t === null)).toHaveLength(3);

    for (const instance of instances) {
      const key = written(instance.file, instance.node['target']);
      expect(expected.has(key), key).toBe(true);
      const target = expected.get(key)!;
      const ours = resolver.instanceElement(instance.node);
      expect(ours ?? null, key).toEqual(target && 'model' in target ? target.model : null);
      expect(ours, `${key} vs $data`).toBe(deployments.elements[instance.id]?.element);
    }
  });

  it('extend <node> targets equal LikeC4: strict paths only', async () => {
    const files = one(`zone prod {
  instanceOf app.api
  vm vm1 {
    vm vm2
  }
}
extend prod {
  #t1
}
extend prod.vm1 {
  #t1
}
extend prod.vm1.vm2 {
  #t1
}
extend prod.api {
  #t1
}
extend nosuch {
  #t1
}
extend prod.vm2 {
  #t1
}`);
    const { index, resolver } = library(files);
    const expected = await linked(files, 'extend');
    const extendBlocks = index.allExtendBlocks();
    expect(extendBlocks).toHaveLength(6);
    expect([...expected.values()].filter((t) => t === null)).toHaveLength(3);

    for (const block of extendBlocks) {
      const key = written(block.file, block.node['deploymentNode']);
      expect(expected.has(key), key).toBe(true);
      const target = resolver.extendTarget(block);
      expect(target === undefined ? null : { deployment: target }, key).toEqual(expected.get(key));
    }
  });

  it('deployment view references equal LikeC4: nodes, instances, element parts and elements', async () => {
    const files = {
      'm.c4': `${SPEC}deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
    instanceOf app.db
  }
  zone app {
    c1 = instanceOf app.cache
  }
  zone dr {
    c2 = instanceOf other.cache
    cache = instanceOf app.db
  }
  zone edge {
    cache = instanceOf app.cache
  }
}
views {
  deployment view main {
    include prod
    include prod.vm1.api
    include db
    include app
    style prod.vm1.api.sub {
      color red
    }
    style other {
      color red
    }
    style cache {
      color red
    }
  }
}
`,
    };
    const { index, resolver } = library(files);
    const expected = await linked(files, 'deploymentView');
    const references = index.documents.flatMap((_, document) => resolver.viewReferences(document));
    expect(references).toHaveLength(7);
    expect(expected.size).toBe(7);
    // A node, an instance, an instance by its unique short name, a node that
    // shadows the element `app`, an element part, a logical element, and a
    // name two instances share.
    expect([...expected.values()]).toEqual([
      { deployment: 'prod' },
      { deployment: 'prod.vm1.api' },
      { deployment: 'prod.db' },
      { deployment: 'app' },
      { deployment: 'prod.vm1.api', element: 'app.api.sub' },
      { model: 'other' },
      null,
    ]);

    for (const reference of references) {
      const key = written('m.c4', reference.node);
      expect(expected.has(key), key).toBe(true);
      expect(reference.target ?? null, key).toEqual(expected.get(key));
    }
  });
});
