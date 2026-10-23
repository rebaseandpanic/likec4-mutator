/**
 * Deployment instances through `getDeploymentInstance` /
 * `listDeploymentInstances` (US-3): inheritance from the element, the D2
 * and D10 exceptions, names, element targets and filters.
 *
 * Expected values come from the model LikeC4 1.60.0 builds from the same
 * files, from literals observed in that model by the reconnaissance spikes
 * (spike 02 and 06), and from the input text itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectDeploymentInstancesAgreeWithLikeC4, expectValidLikeC4 } from '../helpers/likec4-model.js';

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

/** The instance with `id`; it must exist. */
function instance(mutator: LikeC4Mutator, id: string) {
  const found = mutator.getDeploymentInstance(id);
  expect(found, id).not.toBeNull();
  return found!;
}

describe('instances of both fixtures equal LikeC4 (US-3, SC-002)', () => {
  it.each(['deployment-zones', 'deployment-clusters'])('%s', async (fixture) => {
    const files = readWorkspace(fixture);
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    expect(Object.values(deployments.elements).filter((e) => e.element !== undefined).length).toBeGreaterThan(0);

    const mutator = LikeC4Mutator.fromFiles(files);
    const instances = mutator.listDeploymentInstances();
    await expectDeploymentInstancesAgreeWithLikeC4(files, instances);
    for (const listed of instances) {
      expect(listed.element, listed.id).toBe(deployments.elements[listed.id]!.element);
      expect(mutator.getDeploymentInstance(listed.id)).toEqual(listed);
    }
  });
});

// Spike 02: an element with kind defaults, two instances of it, one with own values.
const SPIKE_02 = {
  'a.c4': `specification {
  element service {
    #svc
    technology 'Go'
    link https://example.com/svc-kind 'svc kind'
  }
  deploymentNode vm
  tag svc
  tag own
  tag inst
}
model {
  app = service 'App' {
    api = service 'API' {
      #own
      summary 'api summary'
      description 'api description'
      link https://example.com/api
      metadata { owner 'team-a'; tier 'one' }
      style { shape browser; color red }
    }
    db = service 'DB'
  }
}
deployment {
  vm vm1 {
    instanceOf app.api
    api2 = instanceOf app.api 'API copy' {
      #inst
      technology 'Rust'
      metadata { region 'eu' }
      style { color blue }
    }
    instanceOf app.db
  }
}
`,
};

// Spike 06: an element with a kind style and an icon only, instances with
// empty titles, an own style, and an inline summary.
const SPIKE_06 = {
  'm.c4': `specification {
  element service {
    style { shape browser; color red }
  }
  deploymentNode vm
}
model {
  app = service 'App' {
    api = service 'API' {
      style { icon tech:go }
    }
  }
}
deployment {
  vm host {
    i1 = instanceOf app.api ''
    i2 = instanceOf app.api {
      title ''
      style { color amber }
    }
    i3 = instanceOf app.api 'Inline' 'inline summary' {
      summary 'body summary'
    }
  }
}
`,
};

describe('inheritance rules (expected values: spike 02 and 06 literals)', () => {
  const CASES: Array<[string, Record<string, string>, string, keyof ReturnType<typeof instance>, unknown]> = [
    ['title: the element title when the instance has none', SPIKE_02, 'vm1.api', 'title', 'API'],
    ['title: own', SPIKE_02, 'vm1.api2', 'title', 'API copy'],
    ["title: an inline '' stays ''", SPIKE_06, 'host.i1', 'title', ''],
    ["title: a body '' stays ''", SPIKE_06, 'host.i2', 'title', ''],
    ['technology: own', SPIKE_02, 'vm1.api2', 'technology', 'Rust'],
    ['technology: the element technology (from its kind) when the instance has none', SPIKE_02, 'vm1.db', 'technology', 'Go'],
    ['links: the element links when the instance has none', SPIKE_02, 'vm1.api', 'links', [{ url: 'https://example.com/api' }]],
    [
      'links: the element links include its kind links',
      SPIKE_02,
      'vm1.db',
      'links',
      [{ url: 'https://example.com/svc-kind', label: 'svc kind' }],
    ],
    ['metadata: the element map when the instance has none', SPIKE_02, 'vm1.api', 'metadata', { owner: 'team-a', tier: 'one' }],
    ["metadata: an own map replaces the element's whole map", SPIKE_02, 'vm1.api2', 'metadata', { region: 'eu' }],
    ['tags: the element tags when the instance has none', SPIKE_02, 'vm1.api', 'tags', ['svc', 'own']],
    ['tags: own, then the element tags, without duplicates', SPIKE_02, 'vm1.api2', 'tags', ['inst', 'svc', 'own']],
    ['summary: the element summary when the instance has none', SPIKE_02, 'vm1.api2', 'summary', 'api summary'],
    [
      'style: the element style overridden per field by the instance style',
      SPIKE_06,
      'host.i2',
      'style',
      { shape: 'browser', color: 'amber', icon: 'tech:go' },
    ],
    ['style: the element style when the instance has none', SPIKE_06, 'host.i1', 'style', { shape: 'browser', color: 'red', icon: 'tech:go' }],
  ];

  it.each(CASES)('%s', (_rule, files, id, field, expected) => {
    expect(instance(LikeC4Mutator.fromFiles(files), id)[field]).toEqual(expected);
  });
});

describe('documented exceptions', () => {
  it('D2: summary and description are inherited field by field, without the getter fallback between them', async () => {
    const { deployments } = await buildLikeC4Model(SPIKE_06, { inferTechnologyFromIcon: false });
    // OP: LikeC4's getter shows the inline summary as the description; the
    // $data layer and the element have no description.
    expect(deployments.getters['host.i3']!.description).toBe('inline summary');
    expect(deployments.elements['host.i3']!.description).toBeUndefined();

    const i3 = instance(LikeC4Mutator.fromFiles(SPIKE_06), 'host.i3');
    expect(i3.summary).toBe('inline summary');
    expect(i3.description).toBeUndefined();
    await expectDeploymentInstancesAgreeWithLikeC4(SPIKE_06, LikeC4Mutator.fromFiles(SPIKE_06).listDeploymentInstances());
  });

  it('D10: an instance of an icon-only element has no technology', async () => {
    const inferred = await buildLikeC4Model(SPIKE_06);
    const plain = await buildLikeC4Model(SPIKE_06, { inferTechnologyFromIcon: false });
    // OP: LikeC4 derives the technology from the icon by default, and the
    // option reaches it.
    expect(inferred.deployments.getters['host.i1']!.technology).toBe('Go');
    expect(plain.deployments.getters['host.i1']!.technology).toBeUndefined();

    expect(instance(LikeC4Mutator.fromFiles(SPIKE_06), 'host.i1').technology).toBeUndefined();
  });
});

describe('names, element targets and filters', () => {
  const MODEL = `specification {
  element service
  deploymentNode zone
  deploymentNode vm
  tag t
}
model {
  app = service {
    api = service {
      sub = service
    }
    db = service
  }
}
`;
  const DEPLOYMENT = `deployment {
  zone prod {
    instanceOf app.sub
    a1 = instanceOf app.api
    a2 = instanceOf app.api {
      #t
      link https://example.com/a2
      metadata {
        role 'standby'
      }
    }
    vm vm1 {
      instanceOf sub
    }
  }
}
`;
  const EXTEND = `deployment {
  extend prod.vm1 {
    instanceOf app.db
  }
}
`;
  // `instanceOf sub` resolves through the document's own elements, so the
  // model and the deployment share a file.
  const MAIN = MODEL + DEPLOYMENT;
  const files = { 'main.c4': MAIN, 'more.c4': EXTEND };

  it('names an unnamed instance after the last written segment and targets the element LikeC4 links', async () => {
    await expectValidLikeC4(files);
    const { deployments } = await buildLikeC4Model(files);
    const mutator = LikeC4Mutator.fromFiles(files);

    const sub = instance(mutator, 'prod.sub');
    expect(sub).toMatchObject({ name: 'sub', parentId: 'prod', file: 'main.c4' });
    expect(sub.element).toBe(deployments.elements['prod.sub']!.element);
    expect(sub.element).toBe('app.api.sub');
    expect(sub.sourceRange.offset).toBe(offsetOf(MAIN, 'instanceOf app.sub'));

    const nested = instance(mutator, 'prod.vm1.sub');
    expect(nested.element).toBe(deployments.elements['prod.vm1.sub']!.element);
    expect(nested.element).toBe('app.api.sub');

    const a2 = instance(mutator, 'prod.a2');
    expect(a2).toMatchObject({ name: 'a2', parentId: 'prod', element: 'app.api' });
    expect(a2.declared).toEqual({ tags: ['t'], links: [{ url: 'https://example.com/a2' }], metadata: { role: 'standby' } });
    expect(a2.sourceRange.offset).toBe(offsetOf(MAIN, 'a2 = instanceOf'));
    expect(instance(mutator, 'prod.a1')).toMatchObject({ name: 'a1', element: 'app.api', declared: {} });

    const db = instance(mutator, 'prod.vm1.db');
    expect(db).toMatchObject({ name: 'db', parentId: 'prod.vm1', element: 'app.db', file: 'more.c4' });
    expect(db.sourceRange.offset).toBe(offsetOf(EXTEND, 'instanceOf app.db'));

    await expectDeploymentInstancesAgreeWithLikeC4(files, mutator.listDeploymentInstances());
  });

  it('filters by the node that holds the instances and by the resolved element', () => {
    const mutator = LikeC4Mutator.fromFiles(files);
    const ids = (opts: Parameters<LikeC4Mutator['listDeploymentInstances']>[0]) =>
      mutator.listDeploymentInstances(opts).map((i) => i.id).sort();
    expect(ids({ nodeId: 'prod' })).toEqual(['prod.a1', 'prod.a2', 'prod.sub']);
    expect(ids({ nodeId: 'prod.vm1' })).toEqual(['prod.vm1.db', 'prod.vm1.sub']);
    expect(ids({ element: 'app.api.sub' })).toEqual(['prod.sub', 'prod.vm1.sub']);
    expect(ids({ element: 'app.api' })).toEqual(['prod.a1', 'prod.a2']);
    expect(ids({ element: 'app.sub' })).toEqual([]);
    expect(ids({ nodeId: 'prod', element: 'app.api.sub' })).toEqual(['prod.sub']);
  });
});
