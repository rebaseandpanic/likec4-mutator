import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

/**
 * Two relationship forms LikeC4 1.59.4 accepts and reads (language-server
 * `parseRelation`):
 *  - the kind written as `.kind` (`dotKind`) instead of `-[kind]->`;
 *  - tags written after the title on the relation line (header tags).  LikeC4
 *    reads `parseTags(relation) ?? parseTags(body)`, and reports tags in both
 *    places as an error.
 */

const SPEC = `specification {
  element service
  relationship calls
  tag a
  tag b
  tag c
}
`;

function files(model: string): Record<string, string> {
  return { 'model.c4': `${SPEC}model {\n  x = service\n  y = service\n${model}}\n` };
}

describe('relationship kind written as .kind', () => {
  const FILES = files(`  x .calls y 'dotted'\n`);

  it('reports the kind', () => {
    expect(LikeC4Mutator.fromFiles(FILES).getRelationships()[0].kind).toBe('calls');
  });

  it('agrees with LikeC4', async () => {
    await expectRelationshipsAgreeWithLikeC4(FILES, LikeC4Mutator.fromFiles(FILES).getRelationships());
  });

  it('is found by matchKind', () => {
    const m = LikeC4Mutator.fromFiles(files(`  x .calls y 'dotted'\n  x -> y 'dotted'\n`));
    m.updateRelationship({ source: 'x', target: 'y', matchKind: 'calls' }, { technology: 'gRPC' });
    expect(m.serialize()['model.c4']).toContain("x .calls y 'dotted' {\n    technology 'gRPC'\n  }\n  x -> y 'dotted'\n");
  });
});

describe('relationship tags written on the relation line', () => {
  it.each([
    ['x -> y #a #b', ['a', 'b']],
    ["x -> y 'T' #a {\n    description 'd'\n  }", ['a']],
  ])('reads the tags of `%s` as LikeC4 does', async (line, expected) => {
    const f = files(`  ${line}\n`);
    const [rel] = LikeC4Mutator.fromFiles(f).getRelationships();
    expect(rel.tags).toEqual(expected);
    await expectRelationshipsAgreeWithLikeC4(f, [rel]);
  });

  it.each([
    ["x -> y 'T' #a #b", ['c'], "  x -> y 'T' #c\n"],
    ["x -> y 'T' #a #b", [], "  x -> y 'T'\n"],
    ["x -> y 'T' #a {\n    description 'd'\n  }", ['b', 'c'], "  x -> y 'T' #b #c {\n    description 'd'\n  }\n"],
    ["x -> y 'T' #a {\n    description 'd'\n  }", [], "  x -> y 'T' {\n    description 'd'\n  }\n"],
  ])('REPLACE tags of `%s` with %j in place', async (line, tags, expectedLine) => {
    const m = LikeC4Mutator.fromFiles(files(`  ${line}\n`));
    m.updateRelationship({ source: 'x', target: 'y' }, { tags });
    const text = m.serialize()['model.c4'];
    expect(text).toBe(files(expectedLine)['model.c4']);
    const reference = await buildLikeC4Model(m.serialize());
    expect(reference.diagnostics).toEqual([]);
    expect(reference.relations[0].tags ?? []).toEqual(tags);
  });
});
