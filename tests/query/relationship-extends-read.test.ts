import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';
import type { RelationshipInfo } from '../../src/query/types.js';
import { buildLikeC4Model, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

/**
 * `extend a -> b { ... }` blocks add tags, links and metadata to existing
 * relationships.  LikeC4 1.59.4 (language-server `buildModelData`,
 * `relationFingerprint`) applies a block to every relation with the same
 * source, target, kind (`default` when none), title and direction —
 * bidirectional endpoints in either order — and merges the relation's own
 * values first, then the blocks in document order: tags as a union, metadata
 * per key without duplicate values, links appended unless a link with the
 * same url and label is already there.
 *
 * Expected literals are the relations LikeC4's ModelBuilder computed for the
 * same sources (probe outputs); the oracle tests compare against it directly.
 */

const SPEC = `specification {
  element service
  relationship calls
  relationship titled {
    title 'Spec title'
  }
  tag a
  tag b
  tag c
  tag d
}
`;

const BASE = `${SPEC}model {
  x = service
  y = service
  x -> y 'reads' {
    #a
    link https://base.example.com 'Base'
    metadata {
      owner 'team-a'
      port '8080'
    }
  }
}
`;

const EXT1 = `model {
  extend x -> y 'reads' {
    #b, #a
    link https://base.example.com 'Base'
    link https://ext1.example.com
    link https://ext1.example.com
    metadata {
      port '9090'
      region 'eu'
    }
  }
}
`;

const EXT2 = `model {
  extend x -> y 'reads' {
    #c
    link https://base.example.com
    metadata {
      port '8080'
      region ['us']
    }
  }
}
`;

const FILES = { 'base.c4': BASE, 'ext10.c4': EXT2, 'ext9.c4': EXT1 };

function rel(files: Record<string, string>, i = 0): RelationshipInfo {
  return LikeC4Mutator.fromFiles(files).getRelationships()[i]!;
}

describe('effective tags / links / metadata of a relationship', () => {
  it('merges the relationship and its extend blocks the way LikeC4 does', () => {
    const r = rel(FILES);
    expect(r.tags).toEqual(['a', 'b', 'c']);
    expect(r.links).toEqual([
      { url: 'https://base.example.com', label: 'Base' },
      { url: 'https://ext1.example.com' },
      { url: 'https://base.example.com' },
    ]);
    expect(r.metadata).toEqual({ owner: 'team-a', port: ['8080', '9090'], region: ['eu', 'us'] });
  });

  it('agrees with LikeC4', async () => {
    await expectRelationshipsAgreeWithLikeC4(FILES, LikeC4Mutator.fromFiles(FILES).getRelationships());
  });

  it('reports the declaration and each extend block in merge order as provenance', () => {
    const r = rel(FILES);
    expect(r.declared).toEqual({
      tags: ['a'],
      links: [{ url: 'https://base.example.com', label: 'Base' }],
      metadata: { owner: 'team-a', port: '8080' },
    });
    expect(r.extendedBy.map((e) => e.file)).toEqual(['ext9.c4', 'ext10.c4']);
    expect(r.extendedBy[0]).toMatchObject({
      tags: ['b', 'a'],
      links: [
        { url: 'https://base.example.com', label: 'Base' },
        { url: 'https://ext1.example.com' },
        { url: 'https://ext1.example.com' },
      ],
      metadata: { port: '9090', region: 'eu' },
    });
    expect(r.extendedBy[1].metadata).toEqual({ port: '8080', region: ['us'] });
  });

  it('points each extend contribution at its block', () => {
    const r = rel(FILES);
    const { offset, end, line, column } = r.extendedBy[0].sourceRange;
    expect(EXT1.slice(offset, end)).toMatch(/^extend x -> y 'reads' \{[\s\S]*\n {2}\}$/);
    expect([line, column]).toEqual([1, 2]);
  });

  it('reports a relationship without extend blocks with an empty extendedBy', () => {
    const r = rel({ 'base.c4': BASE });
    expect(r.extendedBy).toEqual([]);
    expect(r.tags).toEqual(['a']);
  });

  it('reads comma-separated tag groups in the order LikeC4 merges them', () => {
    const files = {
      'base.c4': `${SPEC}model {\n  x = service\n  y = service\n  x -> y {\n    #a, #b #c\n  }\n  extend x -> y {\n    #d, #b\n  }\n}\n`,
    };
    const r = rel(files);
    expect(r.tags).toEqual(['b', 'c', 'a', 'd']);
    expect(r.declared.tags).toEqual(['a', 'b', 'c']);
    expect(r.extendedBy[0].tags).toEqual(['d', 'b']);
  });
});

/** A workspace with relation `line` (declared in `base.c4`) and extend blocks `exts` (in `ext.c4`). */
function workspace(line: string, exts: string[], elements = '  x = service\n  y = service\n'): Record<string, string> {
  return {
    'base.c4': `${SPEC}model {\n${elements}  ${line}\n}\n`,
    'ext.c4': `model {\n${exts.map((e) => `  ${e}\n`).join('')}}\n`,
  };
}

describe('which relationships an extend block applies to', () => {
  it.each<[string, string, string[], string[] | undefined]>([
    ['untitled, unkinded', 'x -> y', ['extend x -> y { #a }', "extend x -> y 'T' { #b }"], ['a']],
    ['title', "x -> y 'T'", ['extend x -> y { #a }', "extend x -> y 'T' { #b }"], ['b']],
    ['title in the body', "x -> y {\n    title 'T'\n  }", ["extend x -> y 'T' { #b }"], ['b']],
    ['title compared dedented and trimmed', "x -> y ' T '", ["extend x -> y 'T' { #a }", "extend x -> y ' T ' { #b }"], ['a', 'b']],
    ['kind', 'x -[calls]-> y', ['extend x -> y { #a }', 'extend x -[calls]-> y { #b }'], ['b']],
    ['kind written as .kind', 'x .calls y', ['extend x -[calls]-> y { #a }', 'extend x .calls y { #b }'], ['a', 'b']],
    ['title of the kind specification', 'x -[titled]-> y', ['extend x -[titled]-> y { #a }', "extend x -[titled]-> y 'Spec title' { #b }"], ['b']],
    ['bidirectional, endpoints in either order', 'x <-> y', ['extend x -> y { #a }', 'extend y <-> x { #b }', 'extend x <-> y { #c }'], ['b', 'c']],
    ['direction', 'x -> y', ['extend y -> x { #a }', 'extend x <-> y { #b }'], undefined],
  ])('matches by %s', async (_name, line, exts, expected) => {
    const files = workspace(line, exts);
    const r = rel(files);
    expect(r.tags).toEqual(expected);
    expect(r.extendedBy).toHaveLength(expected?.length ?? 0);
    // LikeC4 warns about an extend block that matches nothing; compare only
    // the matching ones with the model builder.
    const matching = exts.filter((_e, i) => r.extendedBy.some((b) => b.sourceRange.line === i + 1));
    const agreeing = workspace(line, matching);
    await expectRelationshipsAgreeWithLikeC4(agreeing, LikeC4Mutator.fromFiles(agreeing).getRelationships());
  });

  it('resolves endpoints of nested and sourceless relationships to FQNs', async () => {
    const files = workspace(
      '',
      ['extend app.api -> app.db { #a }', "extend app.api -> db { #b }", "extend app.api -> app.db 'own' { #c }"],
      "  db = service\n  app = service {\n    api = service\n    db = service\n    api -> db\n    api -> app.db 'own'\n  }\n  app.api -> db\n",
    );
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.getRelationships().map((r) => [r.sourceFqn, r.targetFqn, r.tags])).toEqual([
      ['app.api', 'app.db', ['a']],
      ['app.api', 'app.db', ['c']],
      ['app.api', 'db', ['b']],
    ]);
    await expectRelationshipsAgreeWithLikeC4(files, m.getRelationships());
  });

  it('applies a block to every relationship it matches; an extend link already present is dropped', async () => {
    const files = workspace("x -> y {\n    link https://a.example.com\n  }\n  x -> y {\n    link https://a.example.com\n    link https://a.example.com\n  }", [
      'extend x -> y {\n    link https://a.example.com\n    link https://b.example.com\n    link https://b.example.com\n  }',
    ]);
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.getRelationships().map((r) => r.links)).toEqual([
      [{ url: 'https://a.example.com' }, { url: 'https://b.example.com' }],
      [{ url: 'https://a.example.com' }, { url: 'https://a.example.com' }, { url: 'https://b.example.com' }],
    ]);
    expect(m.getRelationships().map((r) => r.extendedBy.length)).toEqual([1, 1]);
    await expectRelationshipsAgreeWithLikeC4(files, m.getRelationships());
  });

  it('does not apply a block whose endpoint does not resolve', () => {
    const r = rel(workspace('x -> y', ['extend x -> nope { #a }']));
    expect(r.tags).toBeUndefined();
    expect(r.extendedBy).toEqual([]);
  });
});

describe('C4Query without a workspace', () => {
  it('merges only the extend blocks of its own document and reports no file name', () => {
    const doc = new C4Parser().parse(
      `${SPEC}model {\n  x = service\n  y = service\n  x -> y { #a }\n  extend x -> y { #b }\n}\n`,
    );
    const [r] = new C4Query(doc.ast).getRelationships();
    expect(r.tags).toEqual(['a', 'b']);
    expect(r.extendedBy).toHaveLength(1);
    expect(r.extendedBy[0].file).toBeUndefined();
  });
});

describe('title written as an empty string after the target', () => {
  // LikeC4 `parseBaseProps`: `override.title ?? bodyTitle` — an empty title
  // after the target is the title; the body `title` is not read.
  const FILES = {
    'model.c4': `${SPEC}model {
  x = service
  y = service
  x -> y '' {
    title 'Body'
  }
  extend x -> y 'Body' { #a }
  extend x -> y '' { #b }
}
`,
  };

  it('is reported as the title, consistently with the extend blocks that apply', async () => {
    const [rel] = LikeC4Mutator.fromFiles(FILES).getRelationships();
    expect(rel.title).toBe('');
    expect(rel.tags).toEqual(['b']);
    const reference = await buildLikeC4Model(FILES);
    expect(reference.relations.map((r) => r.title)).toEqual(['']);
    await expectRelationshipsAgreeWithLikeC4(FILES, [rel]);
  });
});

describe('relationship kind the specification does not declare', () => {
  // LikeC4 resolves the kind reference (`kind.ref?.name`): an undeclared kind
  // does not resolve (a linking error) and the relationship and block count as
  // without kind (`default`) when LikeC4 builds the model.
  const model = (body: string) => ({
    'model.c4': `${SPEC}model {\n  x = service\n  y = service\n${body}}\n`,
  });

  it.each([
    ['relationship with -[kind]->', `  x -[unknown]-> y 'T'\n  extend x -> y 'T' { #a }\n`],
    ['relationship with .kind', `  x .unknown y 'T'\n  extend x -> y 'T' { #a }\n`],
    ['extend block', `  x -> y 'T'\n  extend x -[unknown]-> y 'T' { #a }\n`],
    ['both', `  x -[unknown]-> y 'T'\n  extend x -[other]-> y 'T' { #a }\n`],
  ])('matches like no kind: %s', async (_name, body) => {
    const files = model(body);
    const [rel] = LikeC4Mutator.fromFiles(files).getRelationships();
    expect(rel.tags).toEqual(['a']);
    const reference = await buildLikeC4Model(files);
    expect(reference.errors.every((e) => /Could not resolve reference to RelationshipKind/.test(e))).toBe(true);
    expect(reference.relations.map((r) => r.tags)).toEqual([['a']]);
  });

  it('a kind declared in another file still matches only that kind', async () => {
    const files = {
      'model.c4': `${SPEC}model {\n  x = service\n  y = service\n  x -[extra]-> y 'T'\n  extend x -> y 'T' { #a }\n  extend x -[extra]-> y 'T' { #b }\n}\n`,
      'spec.c4': `specification {\n  relationship extra\n}\n`,
    };
    const rels = LikeC4Mutator.fromFiles(files).getRelationships();
    expect(rels.map((r) => r.tags)).toEqual([['b']]);
    await expectRelationshipsAgreeWithLikeC4(files, rels);
  });
});
