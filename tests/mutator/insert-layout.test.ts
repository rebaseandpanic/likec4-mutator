/**
 * Layout of text inserted into an existing braced block (lc4m-15.27, part C
 * item 3): every inserted construct on its own line, one level deeper than
 * the block's owner; the closing `}` on its own line at the owner's
 * indentation; a block written on one line is spread over several; no blank
 * line after inserted tags.  Expected lines are written by hand from that
 * rule; every result must pass `likec4 validate`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  tag t
  tag u
}
`;

/** The lines of `file` from the line starting with `first` through the next line that is exactly `last`. */
function block(text: string, first: string, last: string): string[] {
  const lines = text.split('\n');
  const from = lines.findIndex((l) => l.startsWith(first));
  expect(from).toBeGreaterThanOrEqual(0);
  const to = lines.findIndex((l, i) => i > from && l === last);
  expect(to).toBeGreaterThan(from);
  return lines.slice(from, to + 1);
}

async function run(model: string, mutate: (m: LikeC4Mutator) => void): Promise<string> {
  const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': model });
  mutate(m);
  const files = m.serialize();
  await expectValidLikeC4(files);
  return files['model.c4']!;
}

describe('insertions into an element or relation body', () => {
  it.each([
    {
      name: 'a property into a body written over several lines',
      model: `model {\n  a = service {\n    description 'x'\n  }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { technology: 'y' }),
      expected: ['  a = service {', "    description 'x'", "    technology 'y'", '  }'],
    },
    {
      name: 'a property into a one-line body',
      model: `model {\n  a = service { description 'x' }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { technology: 'y' }),
      expected: ['  a = service {', "    description 'x'", "    technology 'y'", '  }'],
    },
    {
      name: 'a property into an empty one-line body',
      model: `model {\n  a = service { }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { technology: 'y' }),
      expected: ['  a = service {', "    technology 'y'", '  }'],
    },
    {
      name: 'tags into a body written over several lines (no blank line after them)',
      model: `model {\n  a = service {\n    description 'x'\n  }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { tags: ['t', 'u'] }),
      expected: ['  a = service {', '    #t', '    #u', "    description 'x'", '  }'],
    },
    {
      name: 'tags into a body whose `{` line ends with a comment',
      model: `model {\n  a = service { // note\n    description 'x'\n  }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { tags: ['t'] }),
      expected: ['  a = service { // note', '    #t', "    description 'x'", '  }'],
    },
    {
      name: 'tags into a one-line body',
      model: `model {\n  a = service { description 'x' }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { tags: ['t'] }),
      expected: ['  a = service {', '    #t', "    description 'x'", '  }'],
    },
    {
      name: 'a property before a child written on the `{` line',
      model: `model {\n  a = service { b = service }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateElement('a', { description: 'd' }),
      expected: ['  a = service {', "    description 'd'", '    b = service', '  }'],
    },
    {
      name: 'several fields into a one-line body whose property is replaced in the same update',
      model: `model {\n  a = service { description 'x' }\n}\n`,
      mutate: (m: LikeC4Mutator) =>
        m.updateElement('a', {
          description: 'z',
          tags: ['t'],
          technology: 'y',
          links: [{ url: 'https://example.com' }],
          metadata: { k: 'v' },
        }),
      expected: [
        '  a = service {',
        '    #t',
        "    description 'z'",
        "    technology 'y'",
        '    link https://example.com',
        '    metadata {',
        "      k 'v'",
        '    }',
        '  }',
      ],
    },
    {
      name: 'a property into a one-line relation body',
      model: `model {\n  a = service\n  b = service\n  a -> b { description 'x' }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateRelationship({ source: 'a', target: 'b' }, { technology: 'y' }),
      expected: ['  a -> b {', "    description 'x'", "    technology 'y'", '  }'],
    },
    {
      name: 'tags into a relation body written over several lines',
      model: `model {\n  a = service\n  b = service\n  a -> b {\n    description 'x'\n  }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.updateRelationship({ source: 'a', target: 'b' }, { tags: ['t'] }),
      expected: ['  a -> b {', '    #t', "    description 'x'", '  }'],
    },
  ])('$name', async ({ model, mutate, expected }) => {
    const out = await run(model, mutate);
    expect(block(out, expected[0]!, expected[expected.length - 1]!)).toEqual(expected);
  });
});

describe('new declarations at the end of a block', () => {
  it.each([
    {
      name: 'an element into a one-line parent body',
      model: `model {\n  a = service { b = service }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.addElement('a', { name: 'c', kind: 'service' }),
      expected: ['  a = service {', '    b = service', '    c = service', '  }'],
    },
    {
      name: 'an element into an empty one-line parent body',
      model: `model {\n  a = service { }\n}\n`,
      mutate: (m: LikeC4Mutator) => m.addElement('a', { name: 'c', kind: 'service' }),
      expected: ['  a = service {', '    c = service', '  }'],
    },
    {
      name: 'a root element into a one-line model block',
      model: `model { a = service }\n`,
      mutate: (m: LikeC4Mutator) => m.addElement(null, { name: 'c', kind: 'service' }),
      expected: ['model {', '  a = service', '  c = service', '}'],
    },
    {
      name: 'a relationship into a model block closed on the line of its last element',
      model: `model { a = service\n  b = service }\n`,
      mutate: (m: LikeC4Mutator) => m.addRelationship('a', 'b', 'x'),
      expected: ['model {', '  a = service', '  b = service', "  a -> b 'x'", '}'],
    },
    {
      name: 'a view into an empty one-line views block',
      model: `model {\n  a = service\n}\nviews { }\n`,
      mutate: (m: LikeC4Mutator) => m.addView({ id: 'v', type: 'element', target: 'a', autoLayout: '' }),
      expected: ['views {', '  view v of a {', '    include *', '  }', '}'],
    },
  ])('$name', async ({ model, mutate, expected }) => {
    const out = await run(model, mutate);
    expect(block(out, expected[0]!, expected[expected.length - 1]!)).toEqual(expected);
  });
});
