/**
 * A body may declare `summary`, `description` or `technology` more than once.
 * LikeC4 uses the LAST declaration (the body properties are folded into an
 * object, so a later key overwrites an earlier one).  An update must therefore
 * change what LikeC4 reads, whichever declaration that is.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model } from '../helpers/likec4-model.js';

type Txt = { txt?: string } | string | undefined;
const text = (v: Txt): string | undefined => (typeof v === 'object' ? v?.txt : v);

const SOURCE = `specification { element service }
model {
  x = service
  y = service
  x -> y 'T' {
    description 'first'
    description 'second'
    technology 'tA'
    technology 'tB'
  }
  a = service {
    summary 's1'
    summary 's2'
    description 'e1'
    description 'e2'
    technology 'k1'
    technology 'k2'
  }
}
`;

describe('updates change the repeated string property LikeC4 reads', () => {
  it.each(['summary', 'description', 'technology'] as const)('updateElement %s', async (key) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    m.updateElement('a', { [key]: 'NEW' });

    expect(m.getElement('a')?.[key]).toBe('NEW');
    const model = await buildLikeC4Model(m.serialize());
    expect(model.errors).toEqual([]);
    const a = model.elements['a'] as unknown as Record<string, Txt>;
    expect(text(a[key])).toBe('NEW');
  });

  it.each(['description', 'technology'] as const)('updateRelationship %s', async (key) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    m.updateRelationship({ source: 'x', target: 'y' }, { [key]: 'NEW' });

    expect(m.getRelationships({ sourceFqn: 'x' })[0]?.[key]).toBe('NEW');
    const model = await buildLikeC4Model(m.serialize());
    expect(model.errors).toEqual([]);
    const rel = model.relations[0] as unknown as Record<string, Txt>;
    expect(text(rel[key])).toBe('NEW');
  });
});

/**
 * An element may carry its summary and technology as positional strings after
 * the title (`a = service 'title' 'summary' 'technology'`).  LikeC4
 * (`parseBaseProps`) prefers them over the body: a summary when non-empty, a
 * technology whenever written (an empty one leaves the element without
 * technology).  The library reports the empty inline technology as written.
 */
const INLINE = `specification { element service }
model {
  a = service 'T' 'S' 'K' {
    summary 'bs'
    technology 'bt'
  }
  b = service 'T' '' 'K' {
    summary 'bs1'
    summary 'bs2'
  }
  c = service 'T' 'S'
  d = service 'T' 'S' '' {
    technology 'bt'
  }
  e = service 'T' 'S' 'K'
}
`;

describe('inline element summary and technology', () => {
  it.each([
    ['a', 'summary', 'S'],
    ['a', 'technology', 'K'],
    ['b', 'summary', 'bs2'],
    ['b', 'technology', 'K'],
    ['c', 'summary', 'S'],
    ['d', 'technology', ''],
    ['e', 'summary', 'S'],
    ['e', 'technology', 'K'],
  ] as const)('getElement(%s).%s reads what LikeC4 uses', async (fqn, key, expected) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': INLINE });
    expect(m.getElement(fqn)?.[key]).toBe(expected);
    const model = await buildLikeC4Model(m.serialize());
    expect(model.errors).toEqual([]);
    const el = model.elements[fqn] as unknown as Record<string, Txt>;
    // LikeC4 drops an empty value from the computed model.
    expect(text(el[key]) ?? '').toBe(expected);
  });

  it.each([
    ['a', { summary: 'NEW' }],
    ['a', { technology: 'NEW' }],
    ['a', { summary: 'NS', technology: 'NT', description: 'ND' }],
    ['b', { summary: 'NEW' }],
    ['c', { summary: 'NEW' }],
    ['c', { technology: 'NEW' }],
    ['d', { technology: 'NEW' }],
    ['e', { summary: 'NS', technology: 'NT' }],
    ['a', { summary: '' }],
    ['a', { technology: '' }],
    ['e', { summary: '' }],
  ] as const)('updateElement(%s, %o) changes what LikeC4 reads', async (fqn, patch) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': INLINE });
    m.updateElement(fqn, patch);

    const info = m.getElement(fqn) as unknown as Record<string, string | undefined>;
    const model = await buildLikeC4Model(m.serialize());
    expect(model.errors).toEqual([]);
    const el = model.elements[fqn] as unknown as Record<string, Txt>;
    for (const [key, value] of Object.entries(patch)) {
      expect(info[key]).toBe(value);
      expect(text(el[key]) ?? '').toBe(value);
    }
    expect(text(el['title'])).toBe('T');
  });
});
