import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { generateElement } from '../../src/index.js';

/**
 * Metadata values in the LikeC4 grammar:
 *   MetadataAttribute: key=Id ':'? (value=MetadataValue | boolValue=BOOLEAN) ';'?
 *   MetadataValue:     MarkdownOrString | MetadataArray
 *   MarkdownOrString:  markdown=MarkdownString | text=String
 * LikeC4 itself exposes a boolean as 'true' / 'false' and a markdown string as
 * its content.
 */

function elementSource(literal: string): string {
  return `specification {
  element service
}
model {
  a = service {
    metadata {
      test ${literal}
      owner 'original'
    }
  }
  b = service
  a -> b 'uses' {
    metadata {
      test ${literal}
      owner 'original'
    }
  }
}
`;
}

const valueForms: Array<{ name: string; literal: string; read: string | string[] }> = [
  { name: 'boolean true', literal: 'true', read: 'true' },
  { name: 'boolean false', literal: 'false', read: 'false' },
  { name: "markdown '''", literal: "'''md **content**'''", read: 'md **content**' },
  { name: 'markdown """', literal: '"""md **content**"""', read: 'md **content**' },
  { name: 'array with a markdown item', literal: "['''md item''', 'plain']", read: ['md item', 'plain'] },
];

describe('metadata values beyond plain strings', () => {
  it.each(valueForms)('$name: getElement / getRelationships read the value', ({ literal, read }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': elementSource(literal) });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')?.metadata?.test).toEqual(read);
    expect(m.getRelationships({ sourceFqn: 'a' })[0]?.metadata?.test).toEqual(read);
  });

  it.each(valueForms)(
    '$name: updateElement merging another key keeps the attribute verbatim',
    ({ literal, read }) => {
      const m = LikeC4Mutator.fromFiles({ 'm.c4': elementSource(literal) });
      m.updateElement('a', { metadata: { owner: 'new' } });
      const out = m.serialize()['m.c4'];
      const elementPart = out.slice(0, out.indexOf('a -> b'));
      expect(elementPart).toContain(`test ${literal}`);
      expect(m.validate()).toEqual([]);
      expect(m.getElement('a')?.metadata).toEqual({ test: read, owner: 'new' });
    },
  );

  it.each(valueForms)(
    '$name: updateRelationship merging another key keeps the attribute verbatim',
    ({ literal, read }) => {
      const m = LikeC4Mutator.fromFiles({ 'm.c4': elementSource(literal) });
      m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { owner: 'new' } });
      const out = m.serialize()['m.c4'];
      const relationPart = out.slice(out.indexOf('a -> b'));
      expect(relationPart).toContain(`test ${literal}`);
      expect(m.validate()).toEqual([]);
      expect(m.getRelationships({ sourceFqn: 'a' })[0]?.metadata).toEqual({
        test: read,
        owner: 'new',
      });
    },
  );

  it('null in the patch deletes a boolean-valued key', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': elementSource('true') });
    m.updateElement('a', { metadata: { test: null } });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')?.metadata).toEqual({ owner: 'original' });
  });

  it('upserting a boolean-valued key replaces it in place', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': elementSource('true') });
    m.updateElement('a', { metadata: { test: 'replaced' } });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('a')?.metadata).toEqual({ test: 'replaced', owner: 'original' });
  });
});

describe('metadata keys that collide with Object.prototype members', () => {
  // `__proto__` and `constructor` are valid LikeC4 identifiers; they must be
  // kept as plain data keys, never interpreted as JavaScript object members.
  const source = `specification {
  element service
}
model {
  a = service {
    metadata {
      __proto__ ['one']
      constructor 'ctor'
      owner 'original'
    }
  }
  b = service
}
`;

  it('getElement exposes them as own keys', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    expect(Object.entries(m.getElement('a')?.metadata ?? {})).toEqual([
      ['__proto__', ['one']],
      ['constructor', 'ctor'],
      ['owner', 'original'],
    ]);
  });

  it('merging an unrelated key keeps them in the source and on read', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    m.updateElement('a', { metadata: { owner: 'new' } });
    const out = m.serialize()['m.c4'];
    expect(out).toContain("__proto__ ['one']");
    expect(out).toContain("constructor 'ctor'");
    expect(m.validate()).toEqual([]);
    expect(Object.entries(m.getElement('a')?.metadata ?? {})).toEqual([
      ['__proto__', ['one']],
      ['constructor', 'ctor'],
      ['owner', 'new'],
    ]);
  });

  it.each([
    { name: 'into an existing block', fqn: 'a' },
    { name: 'into a new block', fqn: 'b' },
  ])('a patch parsed from JSON can upsert __proto__ $name', ({ fqn }) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    const patch = JSON.parse('{"__proto__": "patched"}') as Record<string, string>;
    m.updateElement(fqn, { metadata: patch });
    expect(m.validate()).toEqual([]);
    const metadata = m.getElement(fqn)?.metadata ?? {};
    expect(Object.getOwnPropertyDescriptor(metadata, '__proto__')?.value).toBe('patched');
  });

  it('a patch parsed from JSON can null-delete __proto__', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    const patch = JSON.parse('{"__proto__": null}') as Record<string, null>;
    m.updateElement('a', { metadata: patch });
    expect(m.validate()).toEqual([]);
    expect(Object.keys(m.getElement('a')?.metadata ?? {})).toEqual(['constructor', 'owner']);
  });
});

describe('metadata keys must form a LikeC4 metadata attribute key', () => {
  // MetadataAttribute: key=Id.  Id is IdTerminal /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/
  // or one of the keywords the Id rule lists (e.g. `element`, `model`).  Other
  // keywords (`title`, `link`, `metadata`, ...) are lexed as keywords and are
  // not an Id; BOOLEAN /\b(true|false)\b/ wins over IdTerminal.
  const source = `specification {
  element service
}
model {
  a = service {
    metadata {
      owner 'original'
    }
  }
  b = service
  a -> b 'uses'
}
`;

  const rejected = ['1abc', '-x', '_', '_-', 'title', 'link', 'metadata', 'style', 'true', 'false', 'true-x', 'a b', 'a.b'];
  const accepted = ['team', 'Team1', '_a', '__1', 'a-b', 'x-', 'a_b', 'element', 'model', 'true1', 'false_x', 'version'];

  type Apply = (m: LikeC4Mutator, metadata: Record<string, string>) => void;
  const operations: Array<{ op: string; apply: Apply }> = [
    { op: 'updateElement (existing block)', apply: (m, metadata) => m.updateElement('a', { metadata }) },
    { op: 'updateElement (new block)', apply: (m, metadata) => m.updateElement('b', { metadata }) },
    {
      op: 'addElement',
      apply: (m, metadata) => m.addElement('a', { name: 'c', kind: 'service', title: 'C', metadata }),
    },
    { op: 'addRelationship', apply: (m, metadata) => m.addRelationship('b', 'a', 'calls', { metadata }) },
    {
      op: 'updateRelationship',
      apply: (m, metadata) => m.updateRelationship({ source: 'a', target: 'b' }, { metadata }),
    },
  ];
  const cases = <T>(keys: string[], f: (key: string, op: string, apply: Apply) => T) =>
    keys.flatMap((key) => operations.map(({ op, apply }) => f(key, op, apply)));

  it.each(cases(rejected, (key, op, apply) => ({ key, op, apply })))(
    'rejects key $key in $op and leaves the source unchanged',
    ({ key, apply }) => {
      const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
      expect(() => apply(m, { [key]: 'v' })).toThrow();
      expect(m.serialize()['m.c4']).toBe(source);
    },
  );

  it.each(cases(accepted, (key, op, apply) => ({ key, op, apply })))(
    'accepts key $key in $op',
    ({ key, apply }) => {
      const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
      apply(m, { [key]: 'v' });
      expect(m.validate()).toEqual([]);
      const out = m.serialize()['m.c4'];
      const reparsed = LikeC4Mutator.fromFiles({ 'm.c4': out });
      expect(reparsed.validate()).toEqual([]);
      expect(out).toContain(`${key} 'v'`);
    },
  );

  it.each(rejected)('generateElement rejects key %s', (key) => {
    expect(() =>
      generateElement({ indent: '', name: 'c', kind: 'service', metadata: { [key]: 'v' } }),
    ).toThrow();
  });
});
