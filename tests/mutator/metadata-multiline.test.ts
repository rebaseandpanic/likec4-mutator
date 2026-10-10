/**
 * Metadata values with line breaks (lc4m-15.27, part C item 1): written so
 * that LikeC4 reads back the same lines — as a Markdown string — instead of
 * being flattened to one line.  The value read by the library and the value
 * LikeC4's model builder computes must both equal the value written;
 * single-line values keep the single-quoted form.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model, expectAgreesWithLikeC4, expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
}
`;

const MODEL = `model {
  a = service {
    metadata {
      owner 'team'
    }
  }
  b = service
}
`;

const VALUES = {
  yaml: 'apiVersion: v1\nkind: Deployment\nspec:\n  replicas: 2',
  'json with quotes, an empty line and a backslash': '{\n  "path": "C:\\\\data",\n\n  "note": \'it\'\'\'s\'\n}',
  'text ending with quotes': "first line\nends with ''",
} as const;

function fresh(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': MODEL });
}

async function expectReadBack(m: LikeC4Mutator, fqn: string, key: string, value: string | string[]): Promise<void> {
  const files = m.serialize();
  await expectValidLikeC4(files);
  const element = m.getElement(fqn)!;
  expect(element.metadata?.[key]).toEqual(value);
  await expectAgreesWithLikeC4(files, fqn, element);
}

describe('multi-line metadata values round-trip through LikeC4', () => {
  it.each(Object.entries(VALUES))('updateElement adds a key: %s', async (_, value) => {
    const m = fresh();
    m.updateElement('a', { metadata: { manifest: value } });
    await expectReadBack(m, 'a', 'manifest', value);
  });

  it.each(Object.entries(VALUES))('updateElement replaces a key: %s', async (_, value) => {
    const m = fresh();
    m.updateElement('a', { metadata: { owner: value } });
    await expectReadBack(m, 'a', 'owner', value);
  });

  it.each(Object.entries(VALUES))('updateElement creates the block: %s', async (_, value) => {
    const m = fresh();
    m.updateElement('b', { metadata: { manifest: value } });
    await expectReadBack(m, 'b', 'manifest', value);
  });

  it.each(Object.entries(VALUES))('addElement writes it: %s', async (_, value) => {
    const m = fresh();
    m.addElement('a', { name: 'c', kind: 'service', metadata: { manifest: value } });
    await expectReadBack(m, 'a.c', 'manifest', value);
  });

  it('as items of an array value', async () => {
    const m = fresh();
    const items = [VALUES.yaml, 'single line'];
    m.updateElement('a', { metadata: { manifests: items } });
    await expectReadBack(m, 'a', 'manifests', items);
  });

  it('on a relationship', async () => {
    const m = fresh();
    m.addRelationship('a', 'b', 'uses', { metadata: { manifest: VALUES.yaml } });
    const files = m.serialize();
    await expectValidLikeC4(files);
    const [rel] = m.getRelationships({ sourceFqn: 'a', targetFqn: 'b' });
    expect(rel?.metadata?.['manifest']).toBe(VALUES.yaml);
    const [computed] = (await buildLikeC4Model(files)).relations;
    expect(computed?.metadata?.['manifest']).toBe(VALUES.yaml);
  });

  it('writes the lines one level deeper than the key, between lines holding the quotes', async () => {
    const m = fresh();
    m.updateElement('a', { metadata: { manifest: 'apiVersion: v1\n\nkind: X' } });
    const lines = m.serialize()['model.c4']!.split('\n');
    const at = lines.indexOf("      manifest '''");
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at, at + 5)).toEqual([
      "      manifest '''",
      '        apiVersion: v1',
      '',
      '        kind: X',
      "      '''",
    ]);
  });

  it('reads `\\r\\n` line breaks of a value back as `\\n` in a file with LF line endings', async () => {
    const m = fresh();
    m.updateElement('a', { metadata: { manifest: 'a: 1\r\nb: 2' } });
    expect(m.serialize()['model.c4']).not.toContain('\r');
    await expectReadBack(m, 'a', 'manifest', 'a: 1\nb: 2');
  });

  it('keeps a single-line value single-quoted', () => {
    const m = fresh();
    m.updateElement('a', { metadata: { owner: "it's" } });
    expect(m.serialize()['model.c4']!.split('\n')).toContain("      owner 'it\\'s'");
  });
});
