/**
 * `title`, `summary`, `description` and `technology` are reported as LikeC4
 * reads them (language-server `parseBaseProps`): indentation removed and
 * trimmed, an inline technology joined into one line, the content of a
 * Markdown string as plain text.  Expected values come from the model LikeC4
 * builds from the same source.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, type LikeC4ModelResult } from '../helpers/likec4-model.js';

const SOURCE = `specification { element service }
model {
  a = service '
      Indented title
    ' {
    summary '''
      **S** line1
        nested
    '''
    description '''
      # D
    '''
    technology """
       tech md
    """
  }
  b = service 'B' '   inline
     summary  ' '  multi
     line tech  ' {
    description '  padded  '
  }
  c = service {
    title '  body title  '
    summary '
        body
          summary
      '
  }
  e = service {
    summary '''   '''
    description """
    """
  }
  g = service {
    technology 'x'
    technology """"""
  }
  h = service {
    title 'x'
    title """"""
  }
  a -> b '  rel
    title ' '   rel desc
     x ' '  rel
     tech '
  b -> c {
    title '''
       md rel title
    '''
    description '''
        line1
          line2
    '''
    technology '  t  '
  }
  c -> e {
    title '''   '''
    description """   """
    technology 'y'
    technology """"""
  }
}
`;

type StringKey = 'title' | 'summary' | 'description' | 'technology';
type ModelValue = string | { md?: string; txt?: string } | undefined;

/** The plain text of a LikeC4 model value (`{ md }` / `{ txt }` or a string). */
const plain = (v: ModelValue): string | undefined => (typeof v === 'object' ? (v.md ?? v.txt) : v);

let reference: Promise<LikeC4ModelResult> | undefined;
async function model(): Promise<LikeC4ModelResult> {
  reference ??= buildLikeC4Model({ 'm.c4': SOURCE });
  const result = await reference;
  expect(result.diagnostics).toEqual([]);
  return result;
}

describe('element string values', () => {
  it.each([
    ['a', 'title'],
    ['a', 'summary'],
    ['a', 'description'],
    ['a', 'technology'],
    ['b', 'summary'],
    ['b', 'description'],
    ['b', 'technology'],
    ['c', 'title'],
    ['c', 'summary'],
    ['e', 'summary'],
    ['e', 'description'],
    // The last declaration is an empty Markdown string: parseBaseProps reads
    // a body technology as `markdown || text`, so there is no technology.
    ['g', 'technology'],
  ] as Array<[string, StringKey]>)('getElement(%s).%s equals the LikeC4 value', async (fqn, key) => {
    const expected = plain((((await model()).elements[fqn] ?? {}) as Record<string, ModelValue>)[key]);
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expect(m.getElement(fqn)?.[key]).toBe(expected);
    expect(m.listElements().find((el) => el.fqn === fqn)?.[key]).toBe(expected);
  });

  it('a whitespace-only Markdown description is the empty string, as in LikeC4', async () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expect(plain(((await model()).elements['e'] as Record<string, ModelValue>)['description'])).toBe('');
    expect(m.getElement('e')?.description).toBe('');
  });

  it('an empty Markdown title after another one is no title: the title is the element name, as in LikeC4', async () => {
    // parseBaseProps reads a body title as `markdown || text`, so the last
    // declaration gives no title; LikeC4's model then falls back to the
    // element name (the kind declares no title).
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expect(((await model()).elements['h'] as Record<string, ModelValue>)['title']).toBe('h');
    expect(m.getElement('h')?.title).toBe('h');
  });
});

describe('relationship string values', () => {
  it.each([
    ['a', 'b', 'title'],
    ['a', 'b', 'description'],
    ['a', 'b', 'technology'],
    ['b', 'c', 'title'],
    ['b', 'c', 'description'],
    ['b', 'c', 'technology'],
    ['c', 'e', 'title'],
    ['c', 'e', 'description'],
    ['c', 'e', 'technology'],
  ] as Array<[string, string, Exclude<StringKey, 'summary'>]>)(
    'getRelationships(%s -> %s).%s equals the LikeC4 value',
    async (source, target, key) => {
      const relation = (await model()).relations.find(
        (r) => r.source.model === source && r.target.model === target,
      );
      expect(relation).toBeDefined();
      const expected = plain((relation as unknown as Record<string, ModelValue>)[key]);
      const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
      const reported = m.getRelationships({ sourceFqn: source, targetFqn: target });
      expect(reported).toHaveLength(1);
      expect(reported[0]?.[key]).toBe(expected);
    },
  );

  it('whitespace-only Markdown title and description are empty strings, as in LikeC4', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    const [rel] = m.getRelationships({ sourceFqn: 'c', targetFqn: 'e' });
    expect(rel?.title).toBe('');
    expect(rel?.description).toBe('');
    expect(rel?.technology).toBeUndefined();
  });
});
