import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

/**
 * A metadata patch edits the first `metadata { ... }` block of a body
 * attribute by attribute: a patched attribute is replaced in place or
 * removed, a new key is added after the last attribute.  Everything else in
 * the block — comments, untouched attributes with their exact punctuation
 * and spacing — keeps its text.
 */

const SPEC = `specification {
  element service
}
`;

const BLOCK = `metadata {
      // owner documentation
      owner true
      k 'old' // trailing note
      /* block comment */
      keep ['a',  'b'];
    }`;

type Owner = 'element' | 'relationship' | 'extend';

/** A file whose first metadata block (of an element, a relationship or an extend block) is `block`. */
function source(owner: Owner, block: string): string {
  const body = `{\n    ${block}\n  }`;
  switch (owner) {
    case 'element':
      return `${SPEC}model {\n  x = service ${body}\n  y = service\n}\n`;
    case 'relationship':
      return `${SPEC}model {\n  x = service\n  y = service\n  x -> y ${body}\n}\n`;
    case 'extend':
      return `${SPEC}model {\n  x = service\n  y = service\n  extend x ${body}\n}\n`;
  }
}

function update(owner: Owner, block: string, metadata: Record<string, string | string[] | null>): string {
  const m = LikeC4Mutator.fromFiles({ 'model.c4': source(owner, block) });
  if (owner === 'relationship') m.updateRelationship({ source: 'x', target: 'y' }, { metadata });
  else m.updateElement('x', { metadata });
  expect(m.validate()).toEqual([]);
  return m.serialize()['model.c4']!;
}

const OWNERS: Owner[] = ['element', 'relationship'];

describe.each(OWNERS)('first metadata block of an %s', (owner) => {
  it.each<[string, Record<string, string | string[] | null>, string]>([
    ['upsert in place', { k: 'new' }, BLOCK.replace("k 'old'", "k 'new'")],
    [
      'upsert an array in place',
      { k: ['a', 'b'] },
      BLOCK.replace("k 'old'", "k [\n        'a',\n        'b'\n      ]"),
    ],
    ['null removes the attribute line', { k: null }, BLOCK.replace("      k 'old' // trailing note\n", '')],
    ['a new key goes after the last attribute', { added: 'x' }, BLOCK.replace("'b'];", "'b'];\n      added 'x'")],
    [
      'mixed patch',
      { owner: null, k: 'new', added: 'x' },
      BLOCK.replace('      owner true\n', '').replace("k 'old'", "k 'new'").replace("'b'];", "'b'];\n      added 'x'"),
    ],
  ])('%s keeps comments and untouched attributes byte-for-byte', (_name, patch, expectedBlock) => {
    expect(update(owner, BLOCK, patch)).toBe(source(owner, expectedBlock));
  });

  it('replaces the first occurrence of a repeated key and removes the others', () => {
    const block = `metadata {\n      k 'one'\n      // between\n      k 'two'\n    }`;
    expect(update(owner, block, { k: 'new' })).toBe(source(owner, `metadata {\n      k 'new'\n      // between\n    }`));
  });

  it('adds a key to a block that only holds a comment', () => {
    const block = `metadata {\n      // nothing yet\n    }`;
    expect(update(owner, block, { k: 'v' })).toBe(source(owner, `metadata {\n      // nothing yet\n      k 'v'\n    }`));
  });

  it.each([
    ["metadata { k 'v' }", { added: 'x' }, "metadata { k 'v' added 'x' }"],
    ["metadata { k 'v' }", { k: 'w' }, "metadata { k 'w' }"],
    ['metadata { }', { k: 'v' }, "metadata { k 'v' }"],
  ])('edits the one-line block `%s` on its line', (block, patch, expectedBlock) => {
    expect(update(owner, block, patch)).toBe(source(owner, expectedBlock));
  });
});

describe('first metadata block of an extend block', () => {
  it('removes a patched key and keeps comments and other attributes byte-for-byte', () => {
    expect(update('extend', BLOCK, { k: 'new' })).toBe(
      source('extend', BLOCK.replace("      k 'old' // trailing note\n", '')).replace(
        '  x = service\n',
        "  x = service {\n    metadata {\n      k 'new'\n    }\n  }\n",
      ),
    );
  });
});
