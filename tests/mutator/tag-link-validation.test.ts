import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

/**
 * Tags and link URLs are emitted as bare tokens, so a value that is not a
 * single token of the LikeC4 grammar must be rejected — otherwise its tail
 * becomes part of the model (e.g. a smuggled element).
 *
 *   TagRef:  '#' Id          Id ≈ IdTerminal /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]* /
 *   Uri:     URI_WITH_SCHEMA /\w+:\/{2}\S+/
 *          | URI_RELATIVE    /\.{0,2}\/[^\/]\S+/
 *          | URI_ALIAS       /@[a-zA-Z0-9_-]*\/[^\s]+/
 */
const source = `specification {
  element service
  element actor
  tag ok
}
model {
  withBody = service {
    description 'd'
  }
  bare = service
  withBody -> bare 'with body' {
    description 'd'
  }
  bare -> withBody
}
`;

function fresh(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'm.c4': source });
}

type Operation = { name: string; run: (m: LikeC4Mutator, tags: string[]) => void };

const tagOperations: Operation[] = [
  { name: 'addElement', run: (m, tags) => void m.addElement('withBody', { name: 'child', kind: 'service', tags }) },
  { name: 'updateElement (existing body)', run: (m, tags) => m.updateElement('withBody', { tags }) },
  { name: 'updateElement (no body)', run: (m, tags) => m.updateElement('bare', { tags }) },
  { name: 'addRelationship', run: (m, tags) => m.addRelationship('bare', 'withBody', 'new', { tags }) },
  {
    name: 'updateRelationship (existing body)',
    run: (m, tags) => m.updateRelationship({ source: 'withBody', target: 'bare' }, { tags }),
  },
  {
    name: 'updateRelationship (no body)',
    run: (m, tags) => m.updateRelationship({ source: 'bare', target: 'withBody' }, { tags }),
  },
];

describe('tag names are validated against LikeC4 tag syntax', () => {
  it.each(tagOperations)('$name rejects a tag carrying a newline and DSL code', ({ run }) => {
    const m = fresh();
    expect(() => run(m, ['ok\n  evil = actor'])).toThrow();
    expect(m.serialize()['m.c4']).toBe(source);
    expect(m.getElement('withBody.evil')).toBeNull();
  });

  it.each(['a b', '1a', '-a', 'a.b', '', '#', '_', 'épique', 'a}'])(
    'updateElement rejects the invalid tag name %j',
    (tag) => {
      const m = fresh();
      expect(() => m.updateElement('withBody', { tags: [tag] })).toThrow();
      expect(m.serialize()['m.c4']).toBe(source);
    },
  );

  it.each(tagOperations)('$name accepts valid tag names (with or without a leading #)', ({ run }) => {
    const m = fresh();
    run(m, ['a-b', '_1', 'element', '#ok']);
    expect(m.validate()).toEqual([]);
  });
});
