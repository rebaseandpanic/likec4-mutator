import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model } from '../helpers/likec4-model.js';

/**
 * A relationship may carry description and technology as positional strings
 * after the title: `x -> y 'title' 'description' 'technology'`.  LikeC4 1.59.4
 * (`parseRelation` → `parseBaseProps`) uses them in preference to the body's
 * `description` / `technology`: a description when it is non-empty, a
 * technology whenever it is written (an empty one included).
 *
 * Expected values are those LikeC4's ModelBuilder computes for the same
 * sources (probe output; the oracle is consulted in each test too).
 */

const SPEC = `specification {\n  element service\n}\n`;
const BODY = `{\n    description 'BD'\n    technology 'BT'\n  }`;

function files(relation: string): Record<string, string> {
  return { 'model.c4': `${SPEC}model {\n  x = service\n  y = service\n  ${relation}\n}\n` };
}

/** LikeC4's description and technology of the only relation of `f`. */
async function likec4(f: Record<string, string>) {
  const reference = await buildLikeC4Model(f);
  expect(reference.errors).toEqual([]);
  const rel = reference.relations[0] as unknown as { description?: { txt?: string }; technology?: string };
  return { description: rel.description?.txt, technology: rel.technology };
}

const MATCH = { source: 'x', target: 'y' };

describe('reading inline description / technology', () => {
  it.each([
    [`x -> y 'T' 'D' 'Tech' ${BODY}`, { description: 'D', technology: 'Tech' }],
    [`x -> y 'T' '' '' ${BODY}`, { description: 'BD', technology: '' }],
    [`x -> y 'T' 'D'`, { description: 'D', technology: undefined }],
    [`x -> y 'T' 'D' ${BODY}`, { description: 'D', technology: 'BT' }],
  ])('`%s` reads as LikeC4 does', async (relation, expected) => {
    const f = files(relation);
    const [rel] = LikeC4Mutator.fromFiles(f).getRelationships();
    expect({ description: rel.description, technology: rel.technology }).toEqual(expected);
    expect(await likec4(f)).toEqual(expected);
  });
});

describe('updateRelationship description / technology with inline values', () => {
  it.each([
    [
      'replaces an inline description, the body is not read',
      `x -> y 'T' 'D' 'Tech' ${BODY}`,
      { description: 'N' },
      `x -> y 'T' 'N' 'Tech' ${BODY}`,
      { description: 'N', technology: 'Tech' },
    ],
    [
      'replaces an inline technology, the body is not read',
      `x -> y 'T' 'D' 'Tech' ${BODY}`,
      { technology: 'gRPC' },
      `x -> y 'T' 'D' 'gRPC' ${BODY}`,
      { description: 'D', technology: 'gRPC' },
    ],
    [
      'replaces an empty inline technology (it overrides the body as well)',
      `x -> y 'T' '' '' ${BODY}`,
      { technology: 'gRPC' },
      `x -> y 'T' '' 'gRPC' ${BODY}`,
      { description: 'BD', technology: 'gRPC' },
    ],
    [
      'writes the body when the inline description is empty (it does not override)',
      `x -> y 'T' '' '' ${BODY}`,
      { description: 'N' },
      `x -> y 'T' '' '' {\n    description 'N'\n    technology 'BT'\n  }`,
      { description: 'N', technology: '' },
    ],
    [
      'replaces an inline description without a body',
      `x -> y 'T' 'D'`,
      { description: 'N', technology: 'gRPC' },
      `x -> y 'T' 'N' {\n    technology 'gRPC'\n  }`,
      { description: 'N', technology: 'gRPC' },
    ],
  ])('%s', async (_name, relation, patch, expectedRelation, expected) => {
    const m = LikeC4Mutator.fromFiles(files(relation));
    m.updateRelationship(MATCH, patch);
    expect(m.serialize()).toEqual(files(expectedRelation));
    const [rel] = m.getRelationships();
    expect({ description: rel.description, technology: rel.technology }).toEqual(expected);
    expect(await likec4(m.serialize())).toEqual(expected);
  });

  it('an empty description clears the inline one and the body one, so neither is read', async () => {
    const m = LikeC4Mutator.fromFiles(files(`x -> y 'T' 'D' 'Tech' ${BODY}`));
    m.updateRelationship(MATCH, { description: '' });
    expect(m.serialize()).toEqual(files(`x -> y 'T' '' 'Tech' {\n    description ''\n    technology 'BT'\n  }`));
    expect(m.getRelationships()[0].description).toBe('');
    expect(await likec4(m.serialize())).toEqual({ description: '', technology: 'Tech' });
  });
});
