/**
 * Element kind defaults: LikeC4 1.59.4 (`MergedSpecification.toModelElement`)
 * fills an element's title, summary, description, technology, tags and links
 * from the `specification { element <kind> { ... } }` declaration of its kind
 * before the `extend` blocks are merged.  Expected values come from the model
 * LikeC4 builds from the same files, and from fixed literals observed in that
 * model.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectAgreesWithLikeC4, plainText } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service {
    #kindtag #shared
    title 'Default Service Title'
    technology 'Node'
    description 'Kind description'
    summary 'Kind summary'
    link https://kind.example.com 'Kind docs'
  }
  element database
  tag kindtag
  tag shared
  tag own
}
`;

const MODEL = `model {
  a = service
  b = service 'B' {
    #shared #own
    link https://own.example.com
  }
  c = service '' {
    description ''
    summary '''   '''
  }
  d = database
  f = service 'F' 'own summary' 'own tech' {
    description 'own desc'
    metadata { k 'v' }
  }
  g = service 'G' '' ''
  h = service {
    title '''   '''
  }
  i = service {
    title ''
  }
}
`;

const EXT = `model {
  extend a {
    #own
    link https://ext.example.com
  }
  extend b {
    #kindtag
    link https://kind.example.com 'Kind docs'
  }
}
`;

const FILES = { 'spec.c4': SPEC, 'model.c4': MODEL, 'ext.c4': EXT };
const KIND_LINK = { url: 'https://kind.example.com', label: 'Kind docs' };

describe('element kind defaults agree with LikeC4', () => {
  // `g` is left out: its `technology ''` reads as '' in the library, while
  // LikeC4 replaces an empty technology by one derived from the icon (none
  // here, so it drops the value) — see the dedicated test below.
  it.each(['a', 'b', 'c', 'd', 'f', 'h', 'i'])('getElement(%s) equals the LikeC4 element', async (fqn) => {
    await expectAgreesWithLikeC4(FILES, fqn, LikeC4Mutator.fromFiles(FILES).getElement(fqn)!);
  });

  it('listElements reports the same effective values as getElement', () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    for (const el of m.listElements()) expect(el).toEqual(m.getElement(el.fqn));
  });
});

describe('element kind defaults: fixed values observed in LikeC4', () => {
  const m = LikeC4Mutator.fromFiles(FILES);

  it('an element without own values takes every default of its kind; extend blocks come after', () => {
    const a = m.getElement('a')!;
    expect(a.title).toBe('Default Service Title');
    expect(a.summary).toBe('Kind summary');
    expect(a.description).toBe('Kind description');
    expect(a.technology).toBe('Node');
    expect(a.tags).toEqual(['kindtag', 'shared', 'own']);
    expect(a.links).toEqual([KIND_LINK, { url: 'https://ext.example.com' }]);
  });

  it('kind tags come first; own links replace the kind links, extend links are appended', () => {
    const b = m.getElement('b')!;
    expect(b.title).toBe('B');
    expect(b.tags).toEqual(['kindtag', 'shared', 'own']);
    expect(b.links).toEqual([{ url: 'https://own.example.com' }, KIND_LINK]);
  });

  it('own summary, description and technology win; kind tags and links still apply', () => {
    const f = m.getElement('f')!;
    expect(f).toMatchObject({ title: 'F', summary: 'own summary', description: 'own desc', technology: 'own tech' });
    expect(f.tags).toEqual(['kindtag', 'shared']);
    expect(f.links).toEqual([KIND_LINK]);
  });

  it.each([
    ['c', "inline ''"],
    ['h', "body '''   '''"],
    ['i', "body ''"],
  ])('an empty title (%s, %s) is the kind title', (fqn) => {
    expect(m.getElement(fqn)?.title).toBe('Default Service Title');
  });

  it("body summary and description '' are kept, not replaced by the kind's", () => {
    const c = m.getElement('c')!;
    expect(c.summary).toBe('');
    expect(c.description).toBe('');
  });

  it("an inline '' summary is no summary: the kind summary applies", () => {
    expect(m.getElement('g')?.summary).toBe('Kind summary');
    expect(m.getElement('g')?.description).toBe('Kind description');
  });

  it("an empty own technology is reported as written ('') and keeps the kind technology out", async () => {
    // LikeC4 replaces it by a technology derived from the element icon
    // (project setting `inferTechnologyFromIcon`, not read by the library);
    // without an icon its model has no technology at all.
    expect(m.getElement('g')?.technology).toBe('');
    const reference = await buildLikeC4Model(FILES);
    expect(reference.elements['g']?.technology).toBeUndefined();
  });

  it('without a title of its own or of its kind, the title is the element name', () => {
    expect(m.getElement('d')?.title).toBe('d');
  });

  it('declared still holds only what the declaration body writes', () => {
    expect(m.getElement('a')?.declared).toEqual({});
    expect(m.getElement('b')?.declared).toEqual({ tags: ['shared', 'own'], links: [{ url: 'https://own.example.com' }] });
  });
});

describe('fromSpecification', () => {
  const m = LikeC4Mutator.fromFiles(FILES);

  it('reports the kind declaration and the defaults it writes', () => {
    const offset = SPEC.indexOf('element service');
    expect(m.getElement('a')?.fromSpecification).toEqual({
      kind: 'service',
      file: 'spec.c4',
      sourceRange: { offset, end: SPEC.indexOf('  element database') - 1, line: 1, column: 2 },
      title: 'Default Service Title',
      summary: 'Kind summary',
      description: 'Kind description',
      technology: 'Node',
      tags: ['kindtag', 'shared'],
      links: [KIND_LINK],
    });
  });

  it('is present without defaults for a kind declared without a body', () => {
    const offset = SPEC.indexOf('element database');
    expect(m.getElement('d')?.fromSpecification).toEqual({
      kind: 'database',
      file: 'spec.c4',
      sourceRange: { offset, end: offset + 'element database'.length, line: 9, column: 2 },
    });
  });

  it('is absent, and the title is the name, for a kind no specification declares', () => {
    const u = LikeC4Mutator.fromFiles({ 'm.c4': `specification { element s }\nmodel { x = unknown }\n` });
    const x = u.getElement('x')!;
    expect(x.fromSpecification).toBeUndefined();
    expect(x.title).toBe('x');
  });

  it('normalizes strings as LikeC4 and keeps tags and links as written', () => {
    const src = `specification {
  element s {
    #t2, #t1
    title '''
       **Md** title
    '''
    description '  padded  '
    link https://x.example.com '  multi
       line  '
  }
  tag t1
  tag t2
}
model {
  x = s
}
`;
    const x = LikeC4Mutator.fromFiles({ 'm.c4': src }).getElement('x')!;
    expect(x.fromSpecification).toMatchObject({
      title: '**Md** title',
      description: 'padded',
      tags: ['t2', 't1'],
      links: [{ url: 'https://x.example.com', label: '  multi\n       line  ' }],
    });
  });
});

describe('kind declared more than once', () => {
  const kindTitle = async (files: Record<string, string>): Promise<string | undefined> =>
    plainText((await buildLikeC4Model(files)).elements['x']?.title);

  it.each([
    [
      'later file by path wins',
      { 'b.c4': `specification { element s { title 'B' } }\n`, 'a.c4': `specification { element s { title 'A' } }\nmodel { x = s }\n` },
      'B',
      'b.c4',
    ],
    [
      'later file by path wins, whatever the order given',
      { 'z.c4': `specification { element s { title 'Z' } }\n`, 'm.c4': `specification { element s { title 'M' } }\nmodel { x = s }\n` },
      'Z',
      'z.c4',
    ],
    [
      'within a file the last declaration wins',
      { 'm.c4': `specification {\n  element s { title 'First' }\n  element s { title 'Second' }\n}\nmodel { x = s }\n` },
      'Second',
      'm.c4',
    ],
  ])('%s, as in LikeC4', async (_name, files, title, file) => {
    // Duplicate kinds are a validation error in LikeC4; its model builder
    // still applies one declaration, which is the reference here.
    expect(await kindTitle(files)).toBe(title);
    const x = LikeC4Mutator.fromFiles(files).getElement('x')!;
    expect(x.title).toBe(title);
    expect(x.fromSpecification?.file).toBe(file);
  });
});

// An element `extend` link that repeats a kind link is kept (LikeC4
// `MergedExtends.applyExtended` concatenates element links), unlike a
// relationship, where the duplicate is dropped.
describe('element extend link repeating a kind link', () => {
  const files = {
    'spec.c4': `specification {
  element service {
    link https://example.com/kind 'Kind'
  }
}
`,
    'model.c4': `model {
  s = service
}
`,
    'ext.c4': `model {
  extend s {
    link https://example.com/kind 'Kind'
  }
}
`,
  };

  it('keeps both the kind link and the repeated extend link', async () => {
    const info = LikeC4Mutator.fromFiles(files).getElement('s')!;
    expect(info.links).toEqual([
      { url: 'https://example.com/kind', label: 'Kind' },
      { url: 'https://example.com/kind', label: 'Kind' },
    ]);
    await expectAgreesWithLikeC4(files, 's', info);
  });
});
