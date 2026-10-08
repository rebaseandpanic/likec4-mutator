import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model } from '../helpers/likec4-model.js';

/**
 * An `extend a -> b { ... }` block only decorates relationships.  When the
 * last relationship it applies to is removed, LikeC4 warns that it "does not
 * match any relation"; when an endpoint element is removed, its reference no
 * longer resolves (an error).  Removing relationships or elements removes
 * such blocks too.
 */

const SPEC = `specification {
  element service
  tag a
  tag b
}
`;

const BASE = `${SPEC}model {
  x = service
  y = service
  x -> y 'reads'
  app = service {
    api = service
    x -> y 'inner'
  }
  y -> x
  app.api -> x
}
`;

const EXT = `model {
  extend x -> y 'reads' {
    #a
  }
  extend y -> x {
    #b
  }
  // stale: matched nothing before
  extend x -> y 'stale' {
    #a
  }
  extend x -> y 'inner' {
    #b
  }
  extend app.api -> x {
    #a
  }
}
`;

const FILES = { 'base.c4': BASE, 'ext.c4': EXT };

/** EXT without the block that starts with `head`. */
function without(text: string, ...heads: string[]): string {
  let out = text;
  for (const head of heads) {
    const start = out.indexOf(`  ${head} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = out.indexOf('  }\n', start) + 4;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

/** LikeC4 diagnostics other than the warning about the pre-existing stale block. */
async function diagnostics(files: Record<string, string>): Promise<string[]> {
  const { diagnostics } = await buildLikeC4Model(files);
  const staleLine = files['ext.c4']!.split('\n').findIndex((l) => l.includes("'stale'")) + 1;
  return diagnostics.filter((d) => !d.startsWith(`ext.c4:${staleLine}:`));
}

describe('removeRelationship removes the extend blocks of the relationship', () => {
  it('removes the blocks that applied only to the removed relationship', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    expect(await diagnostics(FILES)).toEqual([]);
    m.removeRelationship('x', 'y');
    expect(m.serialize()['ext.c4']).toBe(without(EXT, "extend x -> y 'reads'"));
    expect(await diagnostics(m.serialize())).toEqual([]);
  });

  it('keeps blocks that still apply to another relationship', () => {
    const files = {
      'base.c4': `${SPEC}model {\n  x = service\n  y = service\n  x -> y\n  x -> y\n}\n`,
      'ext.c4': 'model {\n  extend x -> y {\n    #a\n  }\n}\n',
    };
    const m = LikeC4Mutator.fromFiles(files);
    m.removeRelationship('x', 'y');
    expect(m.serialize()['ext.c4']).toBe(files['ext.c4']);
    expect(m.getRelationships()[0].tags).toEqual(['a']);
  });
});

describe('removeElement removes extend blocks of relationships that go with it', () => {
  it('removes blocks with an endpoint in the subtree and blocks of relationships removed with the body', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.removeElement('app');
    expect(m.serialize()['ext.c4']).toBe(without(EXT, "extend x -> y 'inner'", 'extend app.api -> x'));
    expect(await diagnostics(m.serialize())).toEqual([]);
  });

  it('removes blocks of relationships whose endpoint is removed', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.removeElement('y');
    expect(m.serialize()['ext.c4']).toBe(
      without(EXT, "extend x -> y 'reads'", 'extend y -> x', "extend x -> y 'stale'", "extend x -> y 'inner'"),
    );
    expect(await buildLikeC4Model(m.serialize()).then((r) => r.errors)).toEqual([]);
  });
});
