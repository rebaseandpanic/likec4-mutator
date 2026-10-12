/**
 * Deployment relationships through `listDeploymentRelationships` (US-4):
 * effective values, connector forms and positions, filters, endpoint
 * resolution through the public read, and provenance.
 *
 * Expected values come from the model LikeC4 1.59.4 builds from the same
 * files (`$data.deployments.relations` and the relation getters), from
 * literals observed in that model by the reconnaissance spikes (02, 04 and
 * 06), and from the input text itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { DeploymentRelationshipInfo } from '../../src/query/types.js';
import {
  buildLikeC4Model,
  expectDeploymentRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
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

/** Offset of the first occurrence of `text` in `source`; the text must occur. */
function offsetOf(source: string, text: string): number {
  const offset = source.indexOf(text);
  expect(offset, text).toBeGreaterThanOrEqual(0);
  return offset;
}

/** The only relationship with `title`; it must exist once. */
function titled(relations: DeploymentRelationshipInfo[], title: string): DeploymentRelationshipInfo {
  const found = relations.filter((r) => r.title === title);
  expect(found, title).toHaveLength(1);
  return found[0]!;
}

describe('relationships of both fixtures equal LikeC4 (US-4, SC-002)', () => {
  // The relationship kinds each fixture's specification declares (spec.c4),
  // with the defaults written there.
  const KINDS = {
    'deployment-zones': {
      calls: {},
      syncs: { title: 'Synchronizes', technology: 'TCP', style: { color: 'green' } },
    },
    'deployment-clusters': {
      publishes: { technology: 'HTTPS' },
      streams: {},
    },
  } as const;

  it.each(Object.keys(KINDS) as Array<keyof typeof KINDS>)('%s', async (fixture) => {
    const files = readWorkspace(fixture);
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(deployments.relations.length).toBeGreaterThan(0);

    const relations = LikeC4Mutator.fromFiles(files).listDeploymentRelationships();
    expect(relations).toHaveLength(deployments.relations.length);
    await expectDeploymentRelationshipsAgreeWithLikeC4(files, relations);

    // fromSpecification: the kind's declaration, as written in spec.c4.
    const kinds: Record<string, object> = KINDS[fixture];
    expect(relations.some((r) => r.kind !== undefined)).toBe(true);
    for (const relation of relations) {
      if (relation.kind === undefined) {
        expect(relation.fromSpecification, relation.title).toBeUndefined();
        continue;
      }
      expect(relation.fromSpecification, relation.title).toEqual({
        kind: relation.kind,
        file: 'spec.c4',
        sourceRange: expect.objectContaining({ offset: offsetOf(files['spec.c4']!, `relationship ${relation.kind}`) }),
        ...kinds[relation.kind],
      });
    }
  });
});

describe('relation rules', () => {
  const files = {
    'm.c4': `specification {
  element service
  deploymentNode vm
  relationship calls {
    #relkind
    title 'Kind rel title'
    description 'Kind rel description'
    technology 'Kind tech'
  }
  tag relkind
  tag lineTag
  tag bodyTag
}
model {
  app = service {
    api = service
    db = service
  }
}
deployment {
  vm host {
    i1 = instanceOf app.api
    i2 = instanceOf app.db
    i3 = instanceOf app.db
    i4 = instanceOf app.db
  }
  host.i1 -> host.i2 'reads' 'inline description' 'inline technology'
  host.i1 -> host.i3 'tagged' #lineTag {
    #bodyTag
  }
  host.i1 -[calls]-> host.i4
  host.i2 -[calls]-> host.i1 'Own title' #lineTag {
    technology ''
  }
  host.i3 -[calls]-> host.i1 ''
  host.i4 -> host.i1 ''
}
`,
  };
  const between = (relations: DeploymentRelationshipInfo[], source: string, target: string) => {
    const found = relations.filter((r) => r.source.id === source && r.target.id === target);
    expect(found, `${source} -> ${target}`).toHaveLength(1);
    return found[0]!;
  };

  // [rule, source, target, field, expected]: spike 02 ('reads'), spike 06
  // (kind defaults, empty own strings) and the line / body tag rule.
  const CASES: Array<[string, string, string, keyof DeploymentRelationshipInfo, unknown]> = [
    ['a description written on the relation line is ignored', 'host.i1', 'host.i2', 'description', undefined],
    ['a technology written on the relation line is ignored', 'host.i1', 'host.i2', 'technology', undefined],
    ['line tags win over body tags', 'host.i1', 'host.i3', 'tags', ['lineTag']],
    ['the kind title applies when there is no own title', 'host.i1', 'host.i4', 'title', 'Kind rel title'],
    ['the kind description applies when there is no own description', 'host.i1', 'host.i4', 'description', 'Kind rel description'],
    ['the kind technology applies when there is no own technology', 'host.i1', 'host.i4', 'technology', 'Kind tech'],
    ['the kind tags are prepended to the own tags', 'host.i2', 'host.i1', 'tags', ['relkind', 'lineTag']],
    ["an own '' technology reads as the kind technology", 'host.i2', 'host.i1', 'technology', 'Kind tech'],
    ["an own '' title is no title, also with a kind title", 'host.i3', 'host.i1', 'title', undefined],
    ["an own '' title is no title", 'host.i4', 'host.i1', 'title', undefined],
  ];

  it.each(CASES)('%s', (_rule, source, target, field, expected) => {
    expect(between(LikeC4Mutator.fromFiles(files).listDeploymentRelationships(), source, target)[field]).toEqual(expected);
  });

  it('the same workspace agrees with LikeC4', async () => {
    await expectValidLikeC4(files);
    await expectDeploymentRelationshipsAgreeWithLikeC4(files, LikeC4Mutator.fromFiles(files).listDeploymentRelationships());
  });
});

describe('connector forms, positions and filters', () => {
  const MAIN = `specification {
  element service
  deploymentNode zone
  deploymentNode vm
  relationship calls
  tag t
}
model {
  app = service {
    api = service {
      handler = service
    }
    db = service
  }
}
deployment {
  zone prod {
    vm vm1 {
      api = instanceOf app.api {
        -> db 'from instance'
      }
      db = instanceOf app.db
    }
    vm vm2
    -> dr 'from node'
  }
  zone dr
  prod.vm1.api -> prod.vm1.db 'plain'
  prod.vm1.api <-> prod.vm1.db 'both ways'
  prod.vm1.api -[calls]-> prod.vm1.db 'kind'
  prod.vm1.api -[calls]<-> prod.vm1.db 'kind both ways'
  prod.vm1.api .calls prod.vm1.db 'dot kind'
  prod.vm1.db -> prod.vm1.api.handler 'into element'
}
`;
  const EXTEND = `deployment {
  extend prod {
    vm2 -> vm1 'in extend'
  }
}
`;
  const files = { 'main.c4': MAIN, 'ext.c4': EXTEND };
  const endpoints = (r: DeploymentRelationshipInfo) => [r.source, r.target, r.kind, r.bidirectional];

  it('reads every connector form and position as LikeC4 does', async () => {
    await expectValidLikeC4(files);
    const relations = LikeC4Mutator.fromFiles(files).listDeploymentRelationships();
    const api = { id: 'prod.vm1.api' };
    const db = { id: 'prod.vm1.db' };
    expect(endpoints(titled(relations, 'plain'))).toEqual([api, db, undefined, false]);
    expect(endpoints(titled(relations, 'both ways'))).toEqual([api, db, undefined, true]);
    expect(endpoints(titled(relations, 'kind'))).toEqual([api, db, 'calls', false]);
    expect(endpoints(titled(relations, 'kind both ways'))).toEqual([api, db, 'calls', true]);
    expect(endpoints(titled(relations, 'dot kind'))).toEqual([api, db, 'calls', false]);
    expect(endpoints(titled(relations, 'from instance'))).toEqual([api, db, undefined, false]);
    expect(endpoints(titled(relations, 'from node'))).toEqual([{ id: 'prod' }, { id: 'dr' }, undefined, false]);
    expect(endpoints(titled(relations, 'into element'))).toEqual([
      db,
      { id: 'prod.vm1.api', element: 'app.api.handler' },
      undefined,
      false,
    ]);
    expect(endpoints(titled(relations, 'in extend'))).toEqual([{ id: 'prod.vm2' }, { id: 'prod.vm1' }, undefined, false]);
    await expectDeploymentRelationshipsAgreeWithLikeC4(files, relations);
  });

  it('skips a relationship whose endpoint does not resolve, as LikeC4 drops it', async () => {
    const broken = { ...files, 'broken.c4': `deployment {\n  prod.vm1.nosuch -> dr 'unresolved'\n}\n` };
    const { deployments, errors } = await buildLikeC4Model(broken);
    // OP: LikeC4 reports the reference and leaves the relation out.
    expect(errors.some((e) => e.startsWith('broken.c4:2: Could not resolve reference'))).toBe(true);
    expect(deployments.relations.some((r) => r.title === 'unresolved')).toBe(false);

    const relations = LikeC4Mutator.fromFiles(broken).listDeploymentRelationships();
    expect(relations.some((r) => r.title === 'unresolved')).toBe(false);
    expect(relations).toHaveLength(deployments.relations.length);
  });

  it('filters by source, target and kind; an instance id also matches endpoints inside its element', () => {
    const mutator = LikeC4Mutator.fromFiles(files);
    const titles = (opts: Parameters<LikeC4Mutator['listDeploymentRelationships']>[0]) =>
      mutator.listDeploymentRelationships(opts).map((r) => r.title).sort();
    expect(titles({ source: 'prod.vm1.db' })).toEqual(['into element']);
    expect(titles({ target: 'prod.vm1.api' })).toEqual(['into element']);
    expect(titles({ source: 'prod' })).toEqual(['from node']);
    expect(titles({ target: 'prod.vm1.db' })).toEqual(['both ways', 'dot kind', 'from instance', 'kind', 'kind both ways', 'plain']);
    expect(titles({ kind: 'calls' })).toEqual(['dot kind', 'kind', 'kind both ways']);
    expect(titles({ source: 'prod.vm1.api', kind: 'calls' })).toEqual(['dot kind', 'kind', 'kind both ways']);
    expect(titles({ source: 'prod.vm1' })).toEqual([]);
  });
});

describe('endpoint resolution through the public read (spike 04 A, C, F, G)', () => {
  const SPEC = `specification {
  element service
  deploymentNode zone
  deploymentNode vm
}
model {
  app = service {
    api = service {
      sub = service
    }
    db = service
    cache = service
  }
}
`;
  const ROOT_API = '  zone api\n';
  const MAIN = `deployment {
${ROOT_API}  zone prod {
    instanceOf app.api
    instanceOf app.db
    api -> db 'A1'
  }
  prod.db -> prod.api.sub 'F1'
  zone amb {
    vm vm1 {
      instanceOf app.api
    }
    vm vm2 {
      instanceOf app.api
    }
    instanceOf app.db
  }
  amb.api -> amb.db 'C1'
  zone edge {
    vm e1 {
      instanceOf app.cache
    }
  }
  zone dr
}
`;
  const EXTEND = `deployment {
  extend edge {
    instanceOf app.db
    cache -> db 'G1'
    edge -> dr 'G2'
  }
}
`;
  const workspace = (main: string) => ({ 'spec.c4': SPEC, 'main.c4': main, 'ext.c4': EXTEND });

  /** Endpoints of every relation LikeC4 keeps, by title. */
  async function oracleEndpoints(files: Record<string, string>) {
    const { deployments } = await buildLikeC4Model(files);
    return new Map(
      deployments.relations.map((r) => [
        r.title!,
        {
          source: r.source.element === undefined ? { id: r.source.deployment } : { id: r.source.deployment, element: r.source.element },
          target: r.target.element === undefined ? { id: r.target.deployment } : { id: r.target.deployment, element: r.target.element },
        },
      ]),
    );
  }

  it.each([
    ['with the root node api', workspace(MAIN), { id: 'api' }],
    ['after the root node api is deleted', workspace(MAIN.replace(ROOT_API, '')), { id: 'prod.api' }],
  ])('%s', async (_case, files, a1Source) => {
    const expected = await oracleEndpoints(files);
    // OP: LikeC4 links A1 to the root node while it exists, to the instance
    // once it is gone, and drops the ambiguous C1.
    expect(expected.get('A1')?.source).toEqual(a1Source);
    expect(expected.has('C1')).toBe(false);
    expect([...expected.keys()].sort()).toEqual(['A1', 'F1', 'G1', 'G2']);

    const relations = LikeC4Mutator.fromFiles(files).listDeploymentRelationships();
    expect(relations.map((r) => r.title).sort()).toEqual([...expected.keys()].sort());
    for (const relation of relations) {
      expect({ source: relation.source, target: relation.target }, relation.title).toEqual(expected.get(relation.title!));
    }
  });
});

describe('relationship provenance', () => {
  const MAIN = `specification {
  element service
  deploymentNode zone
  tag lineTag
  tag bodyTag
}
model {
  app = service {
    api = service
    db = service
  }
}
deployment {
  zone prod {
    instanceOf app.api {
      -> db 'sourceless' {
        #bodyTag
      }
    }
    instanceOf app.db
    api -> db 'nested' {
      #bodyTag
      link https://example.com/nested
      metadata {
        owner 'ops'
      }
    }
  }
  prod.api -> prod.db 'top' #lineTag {
    #bodyTag
  }
}
`;
  const EXTEND = `deployment {
  extend prod {
    api -> db 'in extend' {
      metadata {
        tier 'gold'
      }
    }
  }
}
`;
  const files = { 'main.c4': MAIN, 'ext.c4': EXTEND };

  it('reports the declaration as written, with the file and range of the relationship itself', async () => {
    await expectValidLikeC4(files);
    const relations = LikeC4Mutator.fromFiles(files).listDeploymentRelationships();

    const top = titled(relations, 'top');
    expect(top.declared).toEqual({ tags: ['lineTag'] });
    expect(top).toMatchObject({ file: 'main.c4', sourceRange: { offset: offsetOf(MAIN, "prod.api -> prod.db 'top'") } });

    const nested = titled(relations, 'nested');
    expect(nested.declared).toEqual({
      tags: ['bodyTag'],
      links: [{ url: 'https://example.com/nested' }],
      metadata: { owner: 'ops' },
    });
    expect(nested).toMatchObject({ file: 'main.c4', sourceRange: { offset: offsetOf(MAIN, "api -> db 'nested'") } });

    const sourceless = titled(relations, 'sourceless');
    expect(sourceless.declared).toEqual({ tags: ['bodyTag'] });
    expect(sourceless.source).toEqual({ id: 'prod.api' });
    expect(sourceless).toMatchObject({ file: 'main.c4', sourceRange: { offset: offsetOf(MAIN, "-> db 'sourceless'") } });

    const extended = titled(relations, 'in extend');
    expect(extended.declared).toEqual({ metadata: { tier: 'gold' } });
    expect(extended).toMatchObject({ file: 'ext.c4', sourceRange: { offset: offsetOf(EXTEND, "api -> db 'in extend'") } });

    await expectDeploymentRelationshipsAgreeWithLikeC4(files, relations);
  });
});
