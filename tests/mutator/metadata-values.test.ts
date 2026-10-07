import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

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
