/**
 * Kind defaults are read-only: `updateElement` / `updateRelationship` edit the
 * declaration and its `extend` blocks, never the specification.  After an
 * update the effective value follows LikeC4's rule applied to the patch and
 * the kind defaults (`tags: T` → kind tags then T; `links: []` → the kind
 * links; an empty title → the kind title, else the element name; an empty
 * summary / description written in the body → '').  Each case is checked
 * against the model LikeC4 builds from the serialized files.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectAgreesWithLikeC4, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

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
  relationship async {
    #tcp #shared
    title 'Asynchronous'
    description 'Kind desc'
    technology 'Kafka'
    link https://kind.example.com/async 'Kind link'
  }
  tag kindtag
  tag shared
  tag own
  tag ext
  tag tcp
}
`;

const MODEL = `model {
  a = service 'A' 'own summary' {
    #own
    description 'own desc'
    link https://own.example.com
  }
  b = service 'B'
  d = database 'D'
  a -[async]-> b 'reads' {
    #own
    description 'own'
    technology 'HTTP'
    link https://own.example.com
  }
}
`;

const EXT = `model {
  extend a {
    #ext
    link https://ext.example.com
  }
  extend a -[async]-> b 'reads' {
    #ext
    link https://ext.example.com
  }
}
`;

const FILES = { 'spec.c4': SPEC, 'model.c4': MODEL, 'ext.c4': EXT };
const KIND_LINK = { url: 'https://kind.example.com', label: 'Kind docs' };
const REL_KIND_LINK = { url: 'https://kind.example.com/async', label: 'Kind link' };

describe('updateElement with kind defaults', () => {
  it.each([
    ['tags: [] leaves the kind tags', 'a', { tags: [] }, { tags: ['kindtag', 'shared'] }],
    ['tags: T is kind tags then T, without duplicates', 'a', { tags: ['kindtag', 'own'] }, { tags: ['kindtag', 'shared', 'own'] }],
    ['links: [] brings back the kind links', 'a', { links: [] }, { links: [KIND_LINK] }],
    ['non-empty links replace the kind links', 'b', { links: [{ url: 'https://n.example.com' }] }, { links: [{ url: 'https://n.example.com' }] }],
    ["title '' is the kind title", 'a', { title: '' }, { title: 'Default Service Title' }],
    ["title '' without a kind title is the element name", 'd', { title: '' }, { title: 'd' }],
    ["summary '' and description '' read as ''", 'b', { summary: '', description: '' }, { summary: '', description: '' }],
    ['technology replaces the kind technology', 'b', { technology: 'Deno' }, { technology: 'Deno' }],
  ] as const)('%s', async (_name, fqn, patch, expected) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    const { changedFiles } = m.updateElement(fqn, patch as Parameters<LikeC4Mutator['updateElement']>[1]);
    expect(changedFiles).not.toContain('spec.c4');
    const out = m.serialize();
    expect(out['spec.c4']).toBe(SPEC);
    const el = m.getElement(fqn)!;
    expect(el).toMatchObject(expected);
    await expectAgreesWithLikeC4(out, fqn, el);
  });

  it('tags: [] and links: [] remove own and extend values only; the kind keeps its defaults', () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.updateElement('a', { tags: [], links: [] });
    const a = m.getElement('a')!;
    expect(a.declared).toEqual({});
    expect(a.extendedBy.map((e) => [e.tags, e.links])).toEqual([[undefined, undefined]]);
    expect(a.fromSpecification).toMatchObject({ tags: ['kindtag', 'shared'], links: [KIND_LINK] });
  });
});

describe('updateRelationship with kind defaults', () => {
  const matcher = { source: 'a', target: 'b', matchTitle: 'reads' };

  it.each([
    ['tags: [] leaves the kind tags', { tags: [] }, { tags: ['tcp', 'shared'] }],
    ['links: [] brings back the kind links', { links: [] }, { links: [REL_KIND_LINK] }],
    ["label '' is the kind title", { label: '' }, { title: 'Asynchronous' }],
    ["description '' and technology '' read as ''", { description: '', technology: '' }, { description: '', technology: '' }],
  ] as const)('%s', async (_name, patch, expected) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    const { changedFiles } = m.updateRelationship(matcher, patch as Parameters<LikeC4Mutator['updateRelationship']>[1]);
    expect(changedFiles).not.toContain('spec.c4');
    const out = m.serialize();
    expect(out['spec.c4']).toBe(SPEC);
    const [rel] = m.getRelationships({ sourceFqn: 'a', targetFqn: 'b' });
    expect(rel).toMatchObject(expected);
    await expectRelationshipsAgreeWithLikeC4(out, m.getRelationships());
  });

  it("tags: [], links: [] and label '' together leave every kind default", async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.updateRelationship(matcher, { tags: [], links: [], label: '' });
    const [rel] = m.getRelationships({ sourceFqn: 'a', targetFqn: 'b' });
    expect(rel).toMatchObject({ title: 'Asynchronous', tags: ['tcp', 'shared'], links: [REL_KIND_LINK] });
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });
});
