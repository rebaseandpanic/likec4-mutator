/**
 * Relationship kind defaults: LikeC4 1.59.4 (`MergedSpecification.toModelRelation`)
 * fills a relationship's title, description, technology, tags and links from
 * the `specification { relationship <kind> { ... } }` declaration of its kind
 * before `extend a -> b` blocks apply.  Expected values come from the model
 * LikeC4 builds from the same files, and from fixed literals observed in it.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { RelationshipInfo } from '../../src/query/types.js';
import { buildLikeC4Model, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element node
  relationship async {
    #tcp #shared
    title 'Asynchronous'
    description 'Kind desc'
    technology 'Kafka'
    link https://kind.example.com/async 'Kind link'
  }
  relationship plain
  tag tcp
  tag shared
  tag own
  tag ext
}
`;

const MODEL = `model {
  a = node
  b = node
  c = node
  a -[async]-> b
  a -[async]-> c 'reads' {
    #own #shared
    description 'own desc'
    link https://own.example.com
    link https://kind.example.com/async 'Kind link'
  }
  b -[async]-> c ''
  a -[plain]-> c
  b -> a
  c -[async]-> a 'T' 'D' ''
  c -[async]-> b {
    technology ''
    title ''
  }
  b .async a {
    description ''
  }
}
`;

const EXT = `model {
  extend a -[async]-> b 'Asynchronous' {
    #ext #tcp
    link https://ext.example.com
    link https://kind.example.com/async 'Kind link'
  }
}
`;

const FILES = { 'spec.c4': SPEC, 'model.c4': MODEL, 'ext.c4': EXT };
const KIND_LINK = { url: 'https://kind.example.com/async', label: 'Kind link' };

function relation(m: LikeC4Mutator, source: string, target: string, kind?: string): RelationshipInfo {
  const found = m.getRelationships({ sourceFqn: source, targetFqn: target }).filter((r) => r.kind === kind);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('relationship kind defaults agree with LikeC4', () => {
  it('getRelationships reports every relationship as LikeC4 builds it', async () => {
    await expectRelationshipsAgreeWithLikeC4(FILES, LikeC4Mutator.fromFiles(FILES).getRelationships());
  });

  it('a relationship without a title of its own or of its kind has none ("" in LikeC4)', async () => {
    const reference = await buildLikeC4Model(FILES);
    expect(reference.relations.find((r) => r.kind === 'plain')?.title).toBe('');
    expect(relation(LikeC4Mutator.fromFiles(FILES), 'a', 'c', 'plain').title).toBeUndefined();
  });
});

describe('relationship kind defaults: fixed values observed in LikeC4', () => {
  const m = LikeC4Mutator.fromFiles(FILES);

  it('takes every default of its kind; an extend link equal to a kind link is skipped', () => {
    const r = relation(m, 'a', 'b', 'async');
    expect(r).toMatchObject({ title: 'Asynchronous', description: 'Kind desc', technology: 'Kafka' });
    expect(r.tags).toEqual(['tcp', 'shared', 'ext']);
    expect(r.links).toEqual([KIND_LINK, { url: 'https://ext.example.com' }]);
    expect(r.extendedBy.map((e) => e.file)).toEqual(['ext.c4']);
  });

  it('own values win; own links replace the kind links; kind tags come first', () => {
    const r = relation(m, 'a', 'c', 'async');
    expect(r).toMatchObject({ title: 'reads', description: 'own desc', technology: 'Kafka' });
    expect(r.tags).toEqual(['tcp', 'shared', 'own']);
    expect(r.links).toEqual([{ url: 'https://own.example.com' }, KIND_LINK]);
  });

  it.each([
    ['b', 'c', "inline ''"],
    ['c', 'b', "body title ''"],
  ])('an empty title (%s -> %s, %s) is the kind title', (source, target) => {
    expect(relation(m, source, target, 'async').title).toBe('Asynchronous');
  });

  it("an empty own technology ('' inline or in the body) overrides the kind technology", () => {
    expect(relation(m, 'c', 'a', 'async')).toMatchObject({ title: 'T', description: 'D', technology: '' });
    expect(relation(m, 'c', 'b', 'async').technology).toBe('');
  });

  it("a body description '' overrides the kind description (kind written as .async)", () => {
    expect(relation(m, 'b', 'a', 'async').description).toBe('');
  });

  it('a relationship without a kind gets no defaults', () => {
    const r = relation(m, 'b', 'a');
    expect(r.title).toBeUndefined();
    expect(r.tags).toBeUndefined();
    expect(r.fromSpecification).toBeUndefined();
  });

  it('declared still holds only what the relationship writes', () => {
    expect(relation(m, 'a', 'b', 'async').declared).toEqual({});
  });
});

describe('fromSpecification', () => {
  const m = LikeC4Mutator.fromFiles(FILES);

  it('reports the kind declaration and the defaults it writes', () => {
    const offset = SPEC.indexOf('relationship async');
    expect(relation(m, 'a', 'b', 'async').fromSpecification).toEqual({
      kind: 'async',
      file: 'spec.c4',
      sourceRange: { offset, end: SPEC.indexOf('  relationship plain') - 1, line: 2, column: 2 },
      title: 'Asynchronous',
      description: 'Kind desc',
      technology: 'Kafka',
      tags: ['tcp', 'shared'],
      links: [KIND_LINK],
    });
  });

  it('is present without defaults for a kind declared without a body', () => {
    const offset = SPEC.indexOf('relationship plain');
    expect(relation(m, 'a', 'c', 'plain').fromSpecification).toEqual({
      kind: 'plain',
      file: 'spec.c4',
      sourceRange: { offset, end: offset + 'relationship plain'.length, line: 9, column: 2 },
    });
  });

  it('is absent for a kind no specification declares', () => {
    const u = LikeC4Mutator.fromFiles({ 'm.c4': `specification { element s }\nmodel {\n  a = s\n  b = s\n  a -[nope]-> b\n}\n` });
    expect(u.getRelationships()[0]?.fromSpecification).toBeUndefined();
  });
});

describe('relationship kind declared more than once', () => {
  const model = `specification { element s }\nmodel {\n  a = s\n  b = s\n  a -[r]-> b\n}\n`;

  it.each([
    [
      'later file by path wins',
      { 'b.c4': `specification { relationship r { title 'B' } }\n`, 'a.c4': `specification { relationship r { title 'A' } }\n`, 'm.c4': model },
      'B',
      'b.c4',
    ],
    [
      'within a file the first declaration wins',
      { 'm.c4': `specification {\n  relationship r { title 'First' }\n  relationship r { title 'Second' }\n}\n`, 'n.c4': model },
      'First',
      'm.c4',
    ],
  ])('%s, as in LikeC4', async (_name, files, title, file) => {
    // Duplicate kinds are a validation error in LikeC4; its model builder
    // still applies one declaration, which is the reference here.
    expect((await buildLikeC4Model(files)).relations[0]?.title).toBe(title);
    const [r] = LikeC4Mutator.fromFiles(files).getRelationships();
    expect(r?.title).toBe(title);
    expect(r?.fromSpecification?.file).toBe(file);
  });
});
