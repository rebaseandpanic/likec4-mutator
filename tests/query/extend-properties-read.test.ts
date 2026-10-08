import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';
import { expectAgreesWithLikeC4 } from '../helpers/likec4-model.js';

/**
 * `extend X { ... }` blocks add tags, links and metadata to X.  The element
 * read API reports the effective values LikeC4 1.59.4 computes (body first,
 * then extend blocks in document order — documents sorted by path with
 * LikeC4's natural hierarchical comparator — then source order), plus where
 * each value came from.
 *
 * Expected literals are the model LikeC4's own ModelBuilder produced for the
 * same sources (see docs/research in the project workspace).
 */

const SPEC = `specification {
  element system
  element service
  tag a
  tag b
  tag c
  tag d
}
`;

const BASE = `${SPEC}model {
  app = system 'App' {
    #a #b
    description 'base desc'
    link https://base.example.com 'Base'
    metadata {
      owner 'team-a'
      port '8080'
      same 'x'
      arr ['v1', 'v2']
    }
  }
}
`;

const EXT1 = `model {
  extend app {
    #b #c
    link https://base.example.com 'Base'
    link https://ext1.example.com
    metadata {
      port '9090'
      same 'x'
      arr ['v2', 'v3']
      region 'eu'
    }
  }
}
`;

const EXT2 = `model {
  extend app {
    #d
    metadata {
      port '8080'
      region 'us'
    }
  }
}
`;

const FILES = { 'base.c4': BASE, 'ext1.c4': EXT1, 'ext2.c4': EXT2 };

describe('effective tags / links / metadata merged from extend blocks', () => {
  it('merges body and every extend block the way LikeC4 does', () => {
    const el = LikeC4Mutator.fromFiles(FILES).getElement('app')!;
    expect(el.tags).toEqual(['a', 'b', 'c', 'd']);
    expect(el.links).toEqual([
      { url: 'https://base.example.com', label: 'Base' },
      { url: 'https://base.example.com', label: 'Base' },
      { url: 'https://ext1.example.com' },
    ]);
    expect(el.metadata).toEqual({
      owner: 'team-a',
      port: ['8080', '9090'],
      same: 'x',
      arr: ['v1', 'v2', 'v3'],
      region: ['eu', 'us'],
    });
  });

  it('lists the effective metadata keys body first, then in order of first contribution', () => {
    const el = LikeC4Mutator.fromFiles(FILES).getElement('app')!;
    expect(Object.keys(el.metadata!)).toEqual(['owner', 'port', 'same', 'arr', 'region']);
  });

  it('reports the declaration body and each extend block as provenance', () => {
    const el = LikeC4Mutator.fromFiles(FILES).getElement('app')!;
    expect(el.declared).toEqual({
      tags: ['a', 'b'],
      links: [{ url: 'https://base.example.com', label: 'Base' }],
      metadata: { owner: 'team-a', port: '8080', same: 'x', arr: ['v1', 'v2'] },
    });
    expect(el.extendedBy.map((e) => e.file)).toEqual(['ext1.c4', 'ext2.c4']);
    expect(el.extendedBy[0]).toMatchObject({
      tags: ['b', 'c'],
      links: [{ url: 'https://base.example.com', label: 'Base' }, { url: 'https://ext1.example.com' }],
      metadata: { port: '9090', same: 'x', arr: ['v2', 'v3'], region: 'eu' },
    });
    expect(el.extendedBy[1]).toMatchObject({ tags: ['d'], metadata: { port: '8080', region: 'us' } });
    expect(el.extendedBy[1].links).toBeUndefined();
  });

  it('points each extend contribution at the block in its file', () => {
    const el = LikeC4Mutator.fromFiles(FILES).getElement('app')!;
    const range = el.extendedBy[1].sourceRange;
    expect(EXT2.slice(range.offset, range.end)).toMatch(/^extend app \{[\s\S]*\}$/);
    expect(range.line).toBe(1);
    expect(range.column).toBe(2);
  });

  it('reports an element without extend blocks with an empty extendedBy', () => {
    const el = LikeC4Mutator.fromFiles({ 'base.c4': BASE }).getElement('app')!;
    expect(el.extendedBy).toEqual([]);
    expect(el.tags).toEqual(['a', 'b']);
  });

  it('includes extend blocks that contribute only nested elements or nothing', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': BASE,
      'ext.c4': `model {\n  extend app {\n  }\n  extend app {\n    cache = service 'Cache'\n  }\n}\n`,
    });
    const el = m.getElement('app')!;
    expect(el.extendedBy).toHaveLength(2);
    expect(el.extendedBy[0]).toEqual({ file: 'ext.c4', sourceRange: expect.any(Object) });
    expect(el.tags).toEqual(['a', 'b']);
  });

  it('listElements reports the same effective values', () => {
    const [app] = LikeC4Mutator.fromFiles(FILES).listElements({ kind: 'system' });
    expect(app.tags).toEqual(['a', 'b', 'c', 'd']);
    expect(app.extendedBy).toHaveLength(2);
  });
});

describe('order of contributions', () => {
  it('takes the body first even when an extend file sorts before the declaration file', () => {
    // fromFiles order deliberately differs from the sorted order.
    const m = LikeC4Mutator.fromFiles({
      '1-base.c4': `${SPEC}model {\n  app = system 'App' {\n    #a\n    metadata { k 'from-base' }\n  }\n}\n`,
      '0-ext.c4': `model {\n  extend app {\n    #c\n    metadata { k 'from-0-ext' }\n  }\n  extend app {\n    #d\n    metadata { k 'from-0-ext-second' }\n  }\n}\n`,
    });
    const el = m.getElement('app')!;
    expect(el.tags).toEqual(['a', 'c', 'd']);
    expect(el.metadata).toEqual({ k: ['from-base', 'from-0-ext', 'from-0-ext-second'] });
  });

  it('takes the body first when an extend block precedes the declaration in the same file', () => {
    const el = LikeC4Mutator.fromFiles({
      'one.c4': `${SPEC}model {\n  extend app {\n    #b\n    metadata { k 'ext' }\n  }\n  app = system 'App' {\n    #a\n    metadata { k 'body' }\n  }\n}\n`,
    }).getElement('app')!;
    expect(el.tags).toEqual(['a', 'b']);
    expect(el.metadata).toEqual({ k: ['body', 'ext'] });
  });

  it.each([
    // natural order: ext9 before ext10, regardless of load order
    [['ext10.c4', 'ext9.c4'], ['ext9', 'ext10']],
    // hierarchical: the directory `ext` sorts before `ext9.c4`
    [['ext9.c4', 'ext/zz.c4'], ['ext/zz', 'ext9']],
    // Windows-style separators are paths too
    [['ext9.c4', 'ext\\zz.c4'], ['ext/zz', 'ext9']],
  ])('orders extend files %j by path as LikeC4 does', (names, expected) => {
    const files: Record<string, string> = { 'base.c4': `${SPEC}model {\n  app = system 'App'\n}\n` };
    for (const name of names) {
      files[name] = `model {\n  extend app {\n    metadata { k '${name.replace('\\', '/').replace('.c4', '')}' }\n  }\n}\n`;
    }
    expect(LikeC4Mutator.fromFiles(files).getElement('app')!.metadata).toEqual({ k: expected });
  });

  it('rejects two file names that denote the same path', () => {
    expect(() =>
      LikeC4Mutator.fromFiles({ 'a.c4': 'model {\n}\n', './a.c4': 'model {\n}\n' }),
    ).toThrow(/'a\.c4' and '\.\/a\.c4'/);
  });
});

describe('elements whose properties come only from extend blocks', () => {
  it('reports extend contributions of an element declared without a body', () => {
    const el = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = system 'App'\n}\n`,
      'ext.c4': `model {\n  extend app {\n    #c\n    metadata { k 'v' }\n    link https://x.example.com\n  }\n}\n`,
    }).getElement('app')!;
    expect(el.tags).toEqual(['c']);
    expect(el.links).toEqual([{ url: 'https://x.example.com' }]);
    expect(el.metadata).toEqual({ k: 'v' });
    expect(el.declared).toEqual({});
  });

  it('merges extend blocks of an element declared inside another extend block', () => {
    const el = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = system 'App'\n}\n`,
      'ext.c4': `model {\n  extend app {\n    cache = service 'Cache' { #a }\n  }\n}\n`,
      'ext2.c4': `model {\n  extend app.cache {\n    #b\n    metadata { k 'v' }\n  }\n}\n`,
    }).getElement('app.cache')!;
    expect(el.tags).toEqual(['a', 'b']);
    expect(el.metadata).toEqual({ k: 'v' });
    expect(el.extendedBy.map((e) => e.file)).toEqual(['ext2.c4']);
  });

  it('does not attribute extend blocks of a descendant to its ancestor', () => {
    const el = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n  }\n}\n`,
      'ext.c4': `model {\n  extend app.api {\n    #b\n  }\n}\n`,
    }).getElement('app')!;
    expect(el.tags).toBeUndefined();
    expect(el.extendedBy).toEqual([]);
  });
});

describe('effective metadata values', () => {
  function metadataOf(body: string, extend?: string) {
    const files: Record<string, string> = {
      'base.c4': `${SPEC}model {\n  app = system 'App' {\n${body}\n  }\n}\n`,
    };
    if (extend) files['ext.c4'] = `model {\n  extend app {\n${extend}\n  }\n}\n`;
    return LikeC4Mutator.fromFiles(files).getElement('app')!;
  }

  it.each([
    ['an array and a string with the same value collapse to a string', `metadata { k ['v1'] }`, `metadata { k 'v1' }`, { k: 'v1' }],
    ['a single-element array reads as a string', `metadata { k ['v1'] }`, undefined, { k: 'v1' }],
    ['duplicates inside one array are kept when no extend touches the key', `metadata { k ['v1', 'v1'] }`, `metadata { other 'x' }`, { k: ['v1', 'v1'], other: 'x' }],
    ['a key repeated inside one block is grouped', `metadata {\n  k 'b1'\n  k 'b2'\n}`, undefined, { k: ['b1', 'b2'] }],
    ['booleans read as strings', `metadata { flag true }`, `metadata { flag false }`, { flag: ['true', 'false'] }],
  ])('%s', (_name, body, extend, expected) => {
    expect(metadataOf(body, extend).metadata).toEqual(expected);
  });

  it('keeps the declarative form in declared', () => {
    expect(metadataOf(`metadata { k ['v1'] }`).declared.metadata).toEqual({ k: ['v1'] });
  });
});

describe('several metadata blocks in one body', () => {
  // LikeC4 reads only the first `metadata { ... }` block of a body
  // (`getMetadata(body.props.find(isMetadataProperty))`).
  const TWO_BLOCKS = `metadata { k 'first' }\n    metadata { k 'second' other 'x' }`;
  const files = {
    'base.c4': `${SPEC}model {\n  app = service {\n    ${TWO_BLOCKS}\n  }\n}\n`,
    'ext.c4': `model {\n  extend app {\n    metadata { e 'first' }\n    metadata { e 'second' }\n  }\n}\n`,
  };

  it('reads the first block of each body as effective metadata', () => {
    expect(LikeC4Mutator.fromFiles(files).getElement('app')!.metadata).toEqual({ k: 'first', e: 'first' });
  });

  it('reports the first block of each body as declared', () => {
    const el = LikeC4Mutator.fromFiles(files).getElement('app')!;
    expect(el.declared.metadata).toEqual({ k: 'first' });
    expect(el.extendedBy[0].metadata).toEqual({ e: 'first' });
  });

  it('reports the first block of a relationship', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = service\n  db = service\n  app -> db {\n    ${TWO_BLOCKS}\n  }\n}\n`,
    });
    expect(m.getRelationships({ sourceFqn: 'app' })[0].metadata).toEqual({ k: 'first' });
  });
});

describe('comma-separated tags', () => {
  // LikeC4 grammar: `Tags: (values+=TagRef)+ (',' (values+=TagRef)*)*`; each
  // comma starts a new group chained through `prev`.  LikeC4 reads the last
  // group first, then the earlier ones (`parseTags`), without duplicates.
  const COMMA_FILES = {
    'base.c4': `${SPEC}model {\n  app = service {\n    #a, #b #c\n  }\n}\n`,
    'ext.c4': `model {\n  extend app {\n    #d, #b\n  }\n}\n`,
  };

  it('reads every comma group in the order LikeC4 merges them', () => {
    expect(LikeC4Mutator.fromFiles(COMMA_FILES).getElement('app')!.tags).toEqual(['b', 'c', 'a', 'd']);
  });

  it.each([
    ['#a, #b, #c #d', ['c', 'd', 'b', 'a']],
    ['#a, #b,', ['b', 'a']],
  ])('reads %s as LikeC4 does', (tags, expected) => {
    const el = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = service {\n    ${tags}\n  }\n}\n`,
    }).getElement('app')!;
    expect(el.tags).toEqual(expected);
  });

  it('reports declared and extend tags in source order', () => {
    const el = LikeC4Mutator.fromFiles(COMMA_FILES).getElement('app')!;
    expect(el.declared.tags).toEqual(['a', 'b', 'c']);
    expect(el.extendedBy[0].tags).toEqual(['d', 'b']);
  });

  it('reads every comma group of a relationship in source order', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = service\n  db = service\n  app -> db {\n    #a, #b #c\n  }\n}\n`,
    });
    expect(m.getRelationships({ sourceFqn: 'app' })[0].tags).toEqual(['a', 'b', 'c']);
  });
});

describe('C4Query without a workspace', () => {
  it('merges only the extend blocks of its own document and reports no file name', () => {
    const doc = new C4Parser().parse(
      `${SPEC}model {\n  app = system 'App' {\n    #a\n  }\n  extend app {\n    #b\n  }\n}\n`,
    );
    const el = new C4Query(doc.ast).getElement('app')!;
    expect(el.tags).toEqual(['a', 'b']);
    expect(el.extendedBy).toHaveLength(1);
    expect(el.extendedBy[0].file).toBeUndefined();
  });
});

/** Assert that the effective tags, links and metadata of `fqn` equal LikeC4's model. */
async function expectAgreement(files: Record<string, string>, fqn = 'app'): Promise<void> {
  await expectAgreesWithLikeC4(files, fqn, LikeC4Mutator.fromFiles(files).getElement(fqn)!);
}

const EDGE_CASES: Array<[string, Record<string, string>]> = [
  [
    'several metadata blocks in one body',
    {
      'base.c4': `${SPEC}model {\n  app = service {\n    metadata { k 'first' }\n    metadata { k 'second' other 'x' }\n  }\n}\n`,
      'ext.c4': `model {\n  extend app {\n    metadata { }\n    metadata { e 'hidden' }\n  }\n  extend app {\n    metadata { e 'first' }\n    metadata { e 'second' }\n  }\n}\n`,
    },
  ],
  [
    'comma-separated tags',
    {
      'base.c4': `${SPEC}model {\n  app = service {\n    #a, #b #c\n  }\n}\n`,
      'ext.c4': `model {\n  extend app {\n    #d, #b\n  }\n}\n`,
    },
  ],
];

describe('agreement with the LikeC4 model builder', () => {
  it.each(EDGE_CASES)('agrees on %s', async (_name, files) => {
    await expectAgreement(files);
  });

  it('reports the tags, links and metadata LikeC4 computes for the same sources', async () => {
    const files: Record<string, string> = {
      'base.c4': BASE.replace("tag d\n", 'tag d\n  tag e\n'),
      'ext1.c4': EXT1,
      'ext2.c4': EXT2,
      'ext10.c4': `model {\n  extend app {\n    #e\n    link https://ten.example.com 'Ten'\n    metadata {\n      region 'ten'\n      arr ['v1']\n    }\n  }\n}\n`,
      'ext/sub.c4': `model {\n  extend app {\n    #c\n    link https://sub.example.com\n    metadata { owner 'team-b' }\n  }\n}\n`,
      'a/x.c4': `model {\n  extend app {\n    metadata { flag true }\n  }\n}\n`,
      'a.c4': `model {\n  extend app {\n    metadata { flag false }\n  }\n}\n`,
    };
    await expectAgreement(files);
  });
});
