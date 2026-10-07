/**
 * Regression tests for CST/text-level editing: edits must change only the
 * targeted construct and must never merge neighbouring lines, swallow
 * siblings into comments, or drop unrelated properties.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const SPEC = 'specification {\n  element service\n}\n';

function lines(m: LikeC4Mutator): string[] {
  return m.serialize()['m.c4'].split('\n').map((l) => l.trim());
}

// ===========================================================================
// Removal keeps neighbouring lines separate
// ===========================================================================

describe('removal keeps neighbouring lines intact', () => {
  it.each([
    {
      name: 'removeElement after a line ending in a // comment',
      model: 'model {\n  a = service // keep comment\n  b = service\n  c = service\n}\n',
      remove: (m: LikeC4Mutator) => m.removeElement('b'),
      commentLine: 'a = service // keep comment',
    },
    {
      name: 'removeRelationship after a line ending in a // comment',
      model: 'model {\n  a = service\n  b = service\n  a -> b // keep comment\n  b -> a\n  c = service\n}\n',
      remove: (m: LikeC4Mutator) => m.removeRelationship('b', 'a'),
      commentLine: 'a -> b // keep comment',
    },
  ])('$name: the next sibling survives and the comment is untouched', ({ model, remove, commentLine }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    remove(m);
    expect(m.validate()).toEqual([]);
    expect(m.getElement('c')).not.toBeNull();
    expect(lines(m)).toContain(commentLine);
    expect(lines(m)).toContain('c = service');
  });

  it('removeElement between two code lines does not join them', () => {
    const m = LikeC4Mutator.fromFiles({
      'm.c4': SPEC + 'model { a = service\n b = service\n c = service\n a -> c }\n',
    });
    m.removeElement('b');
    const out = m.serialize()['m.c4'];
    expect(out).not.toContain('a = service c = service');
    expect(m.getElement('a')).not.toBeNull();
    expect(m.getElement('b')).toBeNull();
    expect(m.getElement('c')).not.toBeNull();
    expect(m.getRelationships({ sourceFqn: 'a' })).toHaveLength(1);
  });

  it('removeElement sharing a line with the opening brace keeps the rest of the block', () => {
    const m = LikeC4Mutator.fromFiles({
      'm.c4': SPEC + 'model { a = service\n  b = service\n}\n',
    });
    m.removeElement('a');
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')).toBeNull();
    expect(m.getElement('b')).not.toBeNull();
  });

  it('removeElement of an inline sibling keeps the other sibling on the same line', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + 'model { a = service b = service }\n' });
    m.removeElement('a');
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')).toBeNull();
    expect(m.getElement('b')).not.toBeNull();
  });

  it.each([
    {
      name: 'element',
      model: "model {\n  a = service { // keep comment\n    #t1 #t2\n    technology 'x'\n  }\n  b = service\n}\n",
      clear: (m: LikeC4Mutator) => m.updateElement('a', { tags: [] }),
      check: (m: LikeC4Mutator) => {
        expect(lines(m)).toContain('a = service { // keep comment');
        expect(m.getElement('a')?.technology).toBe('x');
        expect(m.getElement('a')?.tags ?? []).toEqual([]);
      },
    },
    {
      name: 'relationship',
      model: "model {\n  a = service\n  b = service\n  a -> b { // keep comment\n    #t1 #t2\n    technology 'x'\n  }\n}\n",
      clear: (m: LikeC4Mutator) => m.updateRelationship({ source: 'a', target: 'b' }, { tags: [] }),
      check: (m: LikeC4Mutator) => {
        const [rel] = m.getRelationships({ sourceFqn: 'a' });
        expect(lines(m)).toContain('a -> b { // keep comment');
        expect(rel.technology).toBe('x');
        expect(rel.tags ?? []).toEqual([]);
      },
    },
  ])('clearing tags on a $name keeps the property after a // comment', ({ model, clear, check }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    clear(m);
    expect(m.validate()).toEqual([]);
    check(m);
  });
});

// ===========================================================================
// Replacing links keeps properties declared between them
// ===========================================================================

describe('replacing links keeps properties declared between them', () => {
  const MODEL =
    'model {\n' +
    '  a = service {\n' +
    '    link https://one.example\n' +
    "    description 'keep element'\n" +
    "    technology 'tech' // keep comment\n" +
    '    link https://two.example\n' +
    '  }\n' +
    '  b = service\n' +
    '  a -> b {\n' +
    '    link https://one.example\n' +
    "    description 'keep relation'\n" +
    '    link https://two.example\n' +
    '  }\n' +
    '}\n';

  it.each([
    { name: 'new set', links: [{ url: 'https://new.example', label: 'New' }] },
    { name: 'empty set', links: [] },
  ])('updateElement with a $name of links', ({ links }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + MODEL });
    m.updateElement('a', { links });
    expect(m.validate()).toEqual([]);
    const el = m.getElement('a');
    expect(el?.description).toBe('keep element');
    expect(el?.technology).toBe('tech');
    expect(el?.links ?? []).toEqual(links);
    expect(lines(m)).toContain("technology 'tech' // keep comment");
  });

  it.each([
    { name: 'new set', links: [{ url: 'https://new.example' }] },
    { name: 'empty set', links: [] },
  ])('updateRelationship with a $name of links', ({ links }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + MODEL });
    m.updateRelationship({ source: 'a', target: 'b' }, { links });
    expect(m.validate()).toEqual([]);
    const [rel] = m.getRelationships({ sourceFqn: 'a' });
    expect(rel.description).toBe('keep relation');
    expect(rel.links ?? []).toEqual(links);
  });

  it('replaces links declared inline on the same line as other properties', () => {
    const m = LikeC4Mutator.fromFiles({
      'm.c4':
        SPEC +
        "model {\n  a = service { link ./one.md description 'keep' link ./two.md }\n}\n",
    });
    m.updateElement('a', { links: [{ url: './new.md' }] });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')?.description).toBe('keep');
    expect(m.getElement('a')?.links).toEqual([{ url: './new.md' }]);
  });
});

// ===========================================================================
// Updating the title changes the effective title
// ===========================================================================

describe('updateElement title changes the title declared in the body', () => {
  it.each([
    { name: 'body title only', model: "model {\n  a = service {\n    title 'Existing'\n  }\n}\n" },
    {
      name: 'inline and body title',
      model: "model {\n  a = service 'Existing' {\n    title 'Existing'\n  }\n}\n",
    },
    { name: 'body title on the brace line', model: "model { a = service { title 'Existing' } }\n" },
  ])('$name', ({ model }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    m.updateElement('a', { title: 'Changed' });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')?.title).toBe('Changed');
    expect(m.serialize()['m.c4']).not.toContain('Existing');
  });

  it('does not add a second, inline title when the title lives in the body', () => {
    const m = LikeC4Mutator.fromFiles({
      'm.c4': SPEC + "model {\n  a = service {\n    title 'Existing'\n  }\n}\n",
    });
    m.updateElement('a', { title: 'Changed' });
    expect(lines(m)).toContain('a = service {');
    expect(lines(m)).toContain("title 'Changed'");
  });
});

// ===========================================================================
// Braces inside comments, strings and URIs are not structure
// ===========================================================================

describe('braces inside comments, strings and URIs are not structure', () => {
  const CASES = [
    { name: 'block comment with "} {"', model: 'model { app = service { /* } { */ } }\n' },
    { name: 'block comment with "}"', model: 'model { app = service { /* } */ } }\n' },
    { name: 'block comment spanning lines', model: 'model {\n  app = service {\n    /*\n    }\n    */\n  }\n}\n' },
    { name: 'unquoted URL with //', model: 'model { app = service { link https://example.com } }\n' },
    { name: 'markdown string with "}" and a quote', model: "model { app = service { description '''it's }''' } }\n" },
    { name: 'line comment with "}"', model: 'model {\n  app = service { // }\n  }\n}\n' },
  ];

  it.each(CASES)('$name: validate() reports no error', ({ model }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    expect(m.validate()).toEqual([]);
  });

  it.each(CASES)('$name: addElement puts the child inside the body', ({ model }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    const fqn = m.addElement('app', { name: 'child', kind: 'service' });
    expect(m.validate()).toEqual([]);
    expect(m.getElement(fqn)).not.toBeNull();
    expect(m.getElement('app')?.children).toContain('app.child');
  });

  it.each(CASES)('$name: updateElement adds a property', ({ model }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + model });
    m.updateElement('app', { technology: 'Go' });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('app')?.technology).toBe('Go');
  });

  it('addRelationship and addView work with braces inside comments of the model and views blocks', () => {
    const m = LikeC4Mutator.fromFiles({
      'm.c4':
        SPEC +
        'model {\n  a = service\n  b = service /* } */\n}\nviews {\n  view index {\n    include *\n  } // }\n}\n',
    });
    m.addRelationship('a', 'b', 'uses');
    m.addView({ id: 'second', type: 'element', target: 'a', includes: ['*'] });
    expect(m.validate()).toEqual([]);
    expect(m.getRelationships({ sourceFqn: 'a' })).toHaveLength(1);
    expect(m.serialize()['m.c4']).toContain('view second of a');
  });
});
