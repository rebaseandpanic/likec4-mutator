import { describe, expect, test } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { C4Parser } from '../../src/parser/parser.js';

const SPEC = `specification {
  element service
  element database
  tag internal
}
`;

function parses(c4: string): boolean {
  const r = new C4Parser().parse(c4);
  return r.errors.length === 0;
}

function makeModel(body: string): string {
  return `model {\n  s = service 'S' {\n${body}\n  }\n}\n`;
}

describe('updateElement: insert property block before children', () => {
  test('metadata inserted before child element', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'desc'
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { metadata: { foo: 'bar' } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain('metadata {');
    expect(out).toContain('child = database');
    expect(out.indexOf('metadata {')).toBeLessThan(out.indexOf('child = database'));
  });

  test('links (first time) inserted before child element', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'desc'
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { links: [{ url: 'https://example.com', label: 'Repo' }] });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain('link https://example.com');
    expect(out).toContain('child = database');
    expect(out.indexOf('link https://example.com')).toBeLessThan(out.indexOf('child = database'));
  });

  test('style (first time) inserted before child element', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'desc'
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { style: { color: 'red' } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain('style {');
    expect(out).toContain('child = database');
    expect(out.indexOf('style {')).toBeLessThan(out.indexOf('child = database'));
  });

  test('description (first time, line-form) inserted before child element', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { description: 'new desc' });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain("description 'new desc'");
    expect(out).toContain('child = database');
    expect(out.indexOf("description 'new desc'")).toBeLessThan(out.indexOf('child = database'));
  });

  test('technology (first time, line-form) inserted before child element', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'desc'
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { technology: 'Go' });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain("technology 'Go'");
    expect(out).toContain('child = database');
    expect(out.indexOf("technology 'Go'")).toBeLessThan(out.indexOf('child = database'));
  });

  test('regression: metadata inserted at body end when no children present', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'desc'`),
    });
    m.updateElement('s', { metadata: { foo: 'bar' } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain("description 'desc'");
    expect(out).toContain('metadata {');
    expect(out).toContain("foo 'bar'");
  });

  test('regression: metadata MERGE preserved (existing block, single key added)', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    metadata {
      existing 'value'
    }
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { metadata: { added: 'new' } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect((out.match(/metadata \{/g) ?? []).length).toBe(1);
    expect(out).toContain("existing 'value'");
    expect(out).toContain("added 'new'");
  });

  test('edge: insert metadata in element with children but NO existing properties', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    childA = database 'A' { }
    childB = database 'B' { }`),
    });
    m.updateElement('s', { metadata: { foo: 'bar' } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain('metadata {');
    expect(out).toContain('childA = database');
    expect(out.indexOf('metadata {')).toBeLessThan(out.indexOf('childA = database'));
  });

  test.each([
    { name: 'description', patch: { description: 'new' }, marker: "description 'new'" },
    { name: 'metadata', patch: { metadata: { owner: 'new' } }, marker: 'metadata {' },
    { name: 'style', patch: { style: { color: 'red' as const } }, marker: 'style {' },
    { name: 'links', patch: { links: [{ url: 'https://example.com' }] }, marker: 'link https://example.com' },
  ])('$name inserted before a child declared on the same line as the opening brace', ({ patch, marker }) => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': 'model { app = service { child = service } }\n',
    });
    m.updateElement('app', patch);
    const out = m.serialize()['model.c4'];
    expect(m.validate()).toEqual([]);
    expect(m.getElement('app.child')).not.toBeNull();
    expect(out.indexOf(marker)).toBeGreaterThan(-1);
    expect(out.indexOf(marker)).toBeLessThan(out.indexOf('child = service'));
  });

  test.each([
    { name: 'with whitespace', model: 'model { app = service { child = service } }\n' },
    { name: 'without whitespace', model: 'model { app = service {child = service} }\n' },
  ])('several properties at once before a child on the brace line ($name)', ({ model }) => {
    const m = LikeC4Mutator.fromFiles({ '_spec.c4': SPEC, 'model.c4': model });
    m.updateElement('app', {
      description: 'd',
      technology: 't',
      metadata: { owner: 'o' },
      style: { color: 'red' },
    });
    expect(m.validate()).toEqual([]);
    const app = m.getElement('app');
    expect(app?.description).toBe('d');
    expect(app?.technology).toBe('t');
    expect(app?.metadata).toEqual({ owner: 'o' });
    expect(m.getElement('app.child')).not.toBeNull();
  });
});

describe('updateElement: empty metadata block cleanup after null-deletion', () => {
  test('null-deletion of the only scalar metadata key removes the entire block', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    metadata {
      onlyKey 'v'
    }`),
    });
    m.updateElement('s', { metadata: { onlyKey: null } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).not.toMatch(/metadata\s*\{/);
    expect(out).not.toContain('onlyKey');
  });

  test('null-deletion of the only array metadata key removes the entire block', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    metadata {
      onlyKey ['a', 'b']
    }`),
    });
    m.updateElement('s', { metadata: { onlyKey: null } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).not.toMatch(/metadata\s*\{/);
    expect(out).not.toContain('onlyKey');
  });

  test('null-deletion of last metadata key keeps surrounding body well-formed', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    description 'd'
    metadata {
      onlyKey 'v'
    }`),
    });
    m.updateElement('s', { metadata: { onlyKey: null } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).toContain("description 'd'");
    // description must end on its own line; the previous bug squashed the
    // closing `}` of the body onto the same line as the description.
    expect(out).toMatch(/description 'd'\n/);
  });

  test('null-deletion of last metadata key in element with children keeps body valid', () => {
    const m = LikeC4Mutator.fromFiles({
      '_spec.c4': SPEC,
      'model.c4': makeModel(`    metadata {
      onlyKey 'v'
    }
    child = database 'D' { description 'd' }`),
    });
    m.updateElement('s', { metadata: { onlyKey: null } });
    const out = m.serialize()['model.c4'];
    expect(parses(out)).toBe(true);
    expect(m.validate()).toEqual([]);
    expect(out).not.toContain('onlyKey');
    expect(out).toContain('child = database');
  });
});
