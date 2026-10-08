import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { generateElement } from '../../src/index.js';

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

  // `true` / `false` match the identifier pattern but the LikeC4 lexer emits
  // them as BOOLEAN tokens, so `#true` is not a tag.
  it.each(['true', 'false', '#true', 'true-x'])('generateElement rejects the boolean keyword %j as a tag name', (tag) => {
    expect(() => generateElement({ indent: '', name: 'x', kind: 'service', tags: [tag] })).toThrow();
  });

  // TagRef is `#` + Id: keywords the Id rule does not list are their own
  // tokens, so `#title` or `#with` is not a tag.
  it.each(['title', 'with', 'summary', 'technology', 'metadata', '#style'])(
    'generateElement rejects the keyword %j as a tag name',
    (tag) => {
      expect(() => generateElement({ indent: '', name: 'x', kind: 'service', tags: [tag] })).toThrow();
    },
  );

  it.each(tagOperations)('$name accepts valid tag names (with or without a leading #)', ({ run }) => {
    const m = fresh();
    run(m, ['a-b', '_1', 'element', '#ok', 'trueish', 'false_x']);
    expect(m.validate()).toEqual([]);
  });
});

type LinkOperation = {
  name: string;
  run: (m: LikeC4Mutator, url: string) => void;
  read: (m: LikeC4Mutator) => Array<{ url: string; label?: string }> | undefined;
};

const relationFrom = (m: LikeC4Mutator, source: string, title?: string) =>
  m.getRelationships({ sourceFqn: source }).find((r) => r.title === title);

const linkOperations: LinkOperation[] = [
  {
    name: 'addElement',
    run: (m, url) => void m.addElement('withBody', { name: 'child', kind: 'service', links: [{ url }] }),
    read: (m) => m.getElement('withBody.child')?.links,
  },
  {
    name: 'updateElement (existing body)',
    run: (m, url) => m.updateElement('withBody', { links: [{ url, label: 'L' }] }),
    read: (m) => m.getElement('withBody')?.links,
  },
  {
    name: 'updateElement (no body)',
    run: (m, url) => m.updateElement('bare', { links: [{ url }] }),
    read: (m) => m.getElement('bare')?.links,
  },
  {
    name: 'addRelationship',
    run: (m, url) => m.addRelationship('bare', 'withBody', 'new', { links: [{ url }] }),
    read: (m) => relationFrom(m, 'bare', 'new')?.links,
  },
  {
    name: 'updateRelationship (existing body)',
    run: (m, url) =>
      m.updateRelationship({ source: 'withBody', target: 'bare' }, { links: [{ url }] }),
    read: (m) => relationFrom(m, 'withBody', 'with body')?.links,
  },
  {
    name: 'updateRelationship (no body)',
    run: (m, url) =>
      m.updateRelationship({ source: 'bare', target: 'withBody' }, { links: [{ url }] }),
    read: (m) => relationFrom(m, 'bare')?.links,
  },
];

describe('link URLs are validated against the LikeC4 URI terminals', () => {
  it.each(linkOperations)('$name rejects a URL carrying a newline and DSL code', ({ run }) => {
    const m = fresh();
    expect(() => run(m, 'https://example.com\n evil = actor')).toThrow();
    expect(m.serialize()['m.c4']).toBe(source);
  });

  it.each([
    'https://example.com/a b',
    'https://example.com/\tx',
    '',
    'example.com',
    './a',
    'mailto:me@example.com',
  ])('updateElement rejects the URL %j', (url) => {
    const m = fresh();
    expect(() => m.updateElement('withBody', { links: [{ url }] })).toThrow();
    expect(m.serialize()['m.c4']).toBe(source);
  });

  const validUrls = [
    "https://example.com/it's",
    'ssh://host.example.com',
    '../src/index.ts#L1-L10',
    '/docs/readme.md',
    '@alias/path/file.md',
  ];

  it.each(linkOperations.flatMap((op) => validUrls.map((url) => ({ ...op, url }))))(
    '$name writes the valid URL $url unchanged',
    ({ run, read, url }) => {
      const m = fresh();
      run(m, url);
      expect(m.validate()).toEqual([]);
      expect(read(m)?.map((l) => l.url)).toEqual([url]);
    },
  );
});
