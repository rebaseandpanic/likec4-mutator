/**
 * The direction of model relationships (lc4m-15.30 US-9, D69; rows 143 and
 * 144 of the test matrix): every reported relationship carries
 * `bidirectional`, equal to LikeC4's `isBidirectional`, and the `extend`
 * block of a relationship reports its direction, which is part of the
 * identity it applies by.
 *
 * Expected values come from LikeC4's computed model
 * (`expectRelationshipsAgreeWithLikeC4`, which compares direction) and from
 * the inputs.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const SLOW = { timeout: 120_000 };

describe('direction read (row 143)', SLOW, () => {
  const FILES = {
    'spec.c4': 'specification {\n  element sys\n  relationship sync\n  tag t\n}\n',
    'model.c4': `model {
  a = sys 'A'
  b = sys 'B'
  c = sys 'C'
  a -> b 'one way'
  a <-> c 'both ways'
  b -[sync]<-> c 'typed both ways'
  c .sync a 'dotted'
  b -[sync]-> a 'typed one way'
}
`,
  };

  it('reports ->, <->, -[k]<->, .k and -[k]-> with LikeC4’s direction', async () => {
    // P: LikeC4 computes both directions for the fixture.
    const model = await buildLikeC4Model(FILES);
    expect(model.relations.map((r) => r.isBidirectional === true).sort()).toEqual([false, false, false, true, true]);

    const relationships = LikeC4Mutator.fromFiles(FILES).getRelationships();
    expect(relationships.map((r) => [r.title, r.bidirectional])).toEqual([
      ['one way', false],
      ['both ways', true],
      ['typed both ways', true],
      ['dotted', false],
      ['typed one way', false],
    ]);
    await expectRelationshipsAgreeWithLikeC4(FILES, relationships);
  });
});

describe('the direction of an extend block (row 144)', SLOW, () => {
  const FILES = {
    'spec.c4': 'specification {\n  element sys\n  tag both\n  tag one\n}\n',
    'model.c4': `model {
  a = sys 'A'
  b = sys 'B'
  b <-> a 'link'
  a -> b 'link'
}
`,
    'ext.c4': `model {
  extend a <-> b 'link' {
    #both
  }
  extend a -> b 'link' {
    #one
  }
}
`,
  };

  it('reports the block as bidirectional and applies it to a <-> b written in reverse order only', async () => {
    const [reverse, oneWay] = LikeC4Mutator.fromFiles(FILES).getRelationships();
    expect([reverse!.sourceFqn, reverse!.targetFqn, reverse!.bidirectional]).toEqual(['b', 'a', true]);
    expect(reverse!.extendedBy.map((block) => [block.file, block.bidirectional, block.tags])).toEqual([['ext.c4', true, ['both']]]);
    expect(reverse!.tags).toEqual(['both']);
    expect([oneWay!.sourceFqn, oneWay!.targetFqn, oneWay!.bidirectional]).toEqual(['a', 'b', false]);
    expect(oneWay!.extendedBy.map((block) => [block.file, block.bidirectional, block.tags])).toEqual([['ext.c4', false, ['one']]]);
    await expectRelationshipsAgreeWithLikeC4(FILES, [reverse!, oneWay!]);
  });

  it('reports no direction on an element’s block', () => {
    const files = { 'm.c4': "specification {\n  element sys\n  tag t\n}\nmodel {\n  a = sys 'A'\n  extend a {\n    #t\n  }\n}\n" };
    const [block] = LikeC4Mutator.fromFiles(files).getElement('a')!.extendedBy;
    expect(block).toBeDefined();
    expect(block).not.toHaveProperty('bidirectional');
  });
});
