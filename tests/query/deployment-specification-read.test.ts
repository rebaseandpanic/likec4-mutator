/**
 * Deployment node kinds through `getSpecification()` and
 * `getDeploymentNodeKind()` (US-1), and the guard that the deployment model
 * does not leak into the existing logical reads (INV-7).
 *
 * Expected values come from the model LikeC4 1.60.0 builds from the same
 * files (`$data.specification.deployments`, elements and relations), from
 * the positions of declarations in the input text, and from the names the
 * fixtures' specifications declare.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import {
  buildLikeC4Model,
  expectRelationshipsAgreeWithLikeC4,
  expectSameValues,
  expectValidLikeC4,
  plainText,
  type LikeC4DeploymentKind,
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

/** A kind of LikeC4's computed specification in the shape `getDeploymentNodeKind` reports (opacity `N` is `'N%'`). */
function expectedKind(kind: LikeC4DeploymentKind) {
  const style = Object.fromEntries(
    Object.entries(kind.style ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, k === 'opacity' && typeof v === 'number' ? `${v}%` : v]),
  );
  return {
    title: kind.title,
    summary: plainText(kind.summary),
    description: plainText(kind.description),
    technology: kind.technology,
    tags: kind.tags && kind.tags.length > 0 ? [...kind.tags] : undefined,
    links: kind.links?.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, label: l.title })),
    style: Object.keys(style).length > 0 ? style : undefined,
  };
}

/** The defaults `getDeploymentNodeKind` reports, without provenance. */
function reportedKind(mutator: LikeC4Mutator, kind: string) {
  const reported = mutator.getDeploymentNodeKind(kind);
  expect(reported, kind).not.toBeNull();
  const { title, summary, description, technology, tags, links, style } = reported!;
  return { title, summary, description, technology, tags, links, style };
}

/** Offset of the first occurrence of `text` in `source`; the text must occur. */
function offsetOf(source: string, text: string, from = 0): number {
  const offset = source.indexOf(text, from);
  expect(offset, text).toBeGreaterThanOrEqual(0);
  return offset;
}

describe('deployment node kinds (US-1)', () => {
  it('lists every kind and reports its defaults as LikeC4 does; a repeated kind is taken from the last declaration of the last file in document order', async () => {
    // Load order: b.c4, then a/z.c4.  LikeC4's document order: a/z.c4, then
    // b.c4.  The last file in document order is b.c4; the last one loaded is
    // a/z.c4.
    const b = `specification {
  element service
  deploymentNode zone {
    #first
    title 'Zone B first'
  }
  deploymentNode zone {
    #second
    title 'Zone B second'
    summary 'Second summary'
    description 'Second description'
    technology 'Second technology'
    link https://example.com/zone 'Zone guide'
    style {
      color green
      opacity 40%
    }
  }
  deploymentNode vm
  tag first
  tag second
  tag third
}
`;
    const az = `specification {
  deploymentNode zone {
    #third
    title 'Zone A'
    technology 'First technology'
  }
}
`;
    const files = { 'b.c4': b, 'a/z.c4': az };
    const mutator = LikeC4Mutator.fromFiles(files);
    const { deployments, errors } = await buildLikeC4Model(files);
    // OP: LikeC4 takes the second declaration of b.c4.
    expect(deployments.specification['zone']?.title).toBe('Zone B second');

    expect(mutator.getSpecification()?.deploymentNodeKinds?.slice().sort()).toEqual(
      Object.keys(deployments.specification).sort(),
    );
    for (const kind of Object.keys(deployments.specification)) {
      expect(reportedKind(mutator, kind), kind).toEqual(expectedKind(deployments.specification[kind]!));
    }
    // Duplicate kinds are a LikeC4 error; the model is still built from them.
    expect(errors.length).toBeGreaterThan(0);

    const zone = mutator.getDeploymentNodeKind('zone')!;
    const second = offsetOf(b, 'deploymentNode zone', offsetOf(b, 'deploymentNode zone') + 1);
    expect(zone.file).toBe('b.c4');
    expect(zone.sourceRange.offset).toBe(second);
    expect(zone.sourceRange.line).toBe(b.slice(0, second).split('\n').length - 1);
    expect(zone.tags).toEqual(['second']);
    expect(mutator.getDeploymentNodeKind('vm')).toMatchObject({ kind: 'vm', file: 'b.c4' });
  });

  it('reports tags and links as LikeC4 computes them: comma groups in its order, no duplicates, one-line labels', async () => {
    const files = {
      'spec.c4': `specification {
  deploymentNode zone {
    #a, #b
    #c #a
    link https://example.com/guide '  Zone
      guide  '
    link https://example.com/plain
  }
  tag a
  tag b
  tag c
}
`,
    };
    const { deployments } = await buildLikeC4Model(files);
    const lc4 = deployments.specification['zone']!;
    // OP: the comma splits `#a` from `#b #c #a`; LikeC4 takes the last group
    // first, drops the repeated tag (not source order a, b, c, a) and reads
    // the label as one line: dedented, trimmed, lines joined with a space.
    expect(lc4.tags).toEqual(['b', 'c', 'a']);
    expect(lc4.links?.[0]?.title).toBe('Zone     guide');

    const mutator = LikeC4Mutator.fromFiles(files);
    expect(reportedKind(mutator, 'zone')).toEqual(expectedKind(lc4));
  });

  it.each(['deployment-zones', 'deployment-clusters'])(
    'reports every kind of the %s fixture as LikeC4 does, with the file and range of its declaration',
    async (fixture) => {
      const files = readWorkspace(fixture);
      await expectValidLikeC4(files);
      const { deployments } = await buildLikeC4Model(files);
      const kinds = Object.keys(deployments.specification);
      expect(kinds.length).toBeGreaterThan(0);
      const mutator = LikeC4Mutator.fromFiles(files);
      expect(mutator.getSpecification()?.deploymentNodeKinds?.slice().sort()).toEqual(kinds.slice().sort());
      for (const kind of kinds) {
        expect(reportedKind(mutator, kind), kind).toEqual(expectedKind(deployments.specification[kind]!));
        const declared = mutator.getDeploymentNodeKind(kind)!;
        expect(declared.file).toBe('spec.c4');
        expect(declared.sourceRange.offset).toBe(offsetOf(files['spec.c4']!, `deploymentNode ${kind}`));
      }
      expect(mutator.getDeploymentNodeKind('undeclared')).toBeNull();
    },
  );
});

describe('getSpecification() shape', () => {
  it('a specification of deployment node kinds only is no longer null', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': 'specification {\n  deploymentNode zone\n  deploymentNode vm\n}\n',
    });
    expect(mutator.getSpecification()).toEqual({
      elementKinds: [],
      tags: [],
      relationshipKinds: [],
      deploymentNodeKinds: ['zone', 'vm'],
    });
  });

  it('has no deploymentNodeKinds key when no deployment node kind is declared', () => {
    const spec = LikeC4Mutator.fromFiles({
      'spec.c4': 'specification {\n  element service\n  relationship calls\n  tag t\n}\n',
    }).getSpecification();
    expect(spec).toEqual({ elementKinds: ['service'], tags: ['t'], relationshipKinds: ['calls'] });
    expect(spec).not.toHaveProperty('deploymentNodeKinds');
  });
});

describe('logical reads are unchanged by the deployment model (INV-7)', () => {
  // The names each fixture's specification declares (spec.c4).
  const DECLARED = {
    'deployment-zones': {
      elementKinds: ['system', 'service', 'store', 'worker'],
      relationshipKinds: ['calls', 'syncs'],
      tags: ['public', 'internal', 'edge', 'primary', 'replica'],
      deploymentNodeKinds: ['environment', 'zone', 'host'],
    },
    'deployment-clusters': {
      elementKinds: ['platform', 'component', 'queue', 'frontend'],
      relationshipKinds: ['publishes', 'streams'],
      tags: ['managed', 'spot', 'critical', 'beta'],
      deploymentNodeKinds: ['cloud', 'cluster', 'namespace'],
    },
  } as const;

  it.each(Object.keys(DECLARED) as Array<keyof typeof DECLARED>)(
    '%s: elements and relationships agree with LikeC4, with and without the deployment part',
    async (fixture) => {
      const files = readWorkspace(fixture);
      // The logical part: the files without a deployment block.
      const logical = { 'spec.c4': files['spec.c4']!, 'model.c4': files['model.c4']! };
      await expectValidLikeC4(files);
      // The library derives no technology from an icon (README
      // "Specification defaults"), and the fixtures hold icon-only elements:
      // the references are built without LikeC4's icon inference.
      const full = await buildLikeC4Model(files, { inferTechnologyFromIcon: false });
      const alone = await buildLikeC4Model(logical, { inferTechnologyFromIcon: false });
      expect(full.diagnostics).toEqual([]);
      expect(alone.diagnostics).toEqual([]);
      expect(Object.keys(full.deployments.elements).length).toBeGreaterThan(0);
      expect(full.deployments.relations.length).toBeGreaterThan(0);
      expect(full.relations.length).toBeGreaterThan(0);

      const mutator = LikeC4Mutator.fromFiles(files);
      const elements = mutator.listElements();
      expect(elements.map((e) => e.fqn).sort()).toEqual(Object.keys(full.elements).sort());
      expect(elements.map((e) => e.fqn).sort()).toEqual(Object.keys(alone.elements).sort());
      for (const element of elements) {
        expect(mutator.getElement(element.fqn)).toEqual(element);
        expectSameValues(element, full.elements[element.fqn]!);
        expectSameValues(element, alone.elements[element.fqn]!);
      }

      const relationships = mutator.getRelationships();
      expect(relationships).toHaveLength(full.relations.length);
      await expectRelationshipsAgreeWithLikeC4(files, relationships);
      await expectRelationshipsAgreeWithLikeC4(logical, relationships);

      const spec = mutator.getSpecification()!;
      const declared = DECLARED[fixture];
      expect(spec.elementKinds).toEqual(declared.elementKinds);
      expect(spec.relationshipKinds).toEqual(declared.relationshipKinds);
      expect(spec.tags).toEqual(declared.tags);
      expect(spec.deploymentNodeKinds).toEqual(declared.deploymentNodeKinds);
      expect(spec.elementKinds.filter((k) => (declared.deploymentNodeKinds as readonly string[]).includes(k))).toEqual([]);
    },
  );
});
