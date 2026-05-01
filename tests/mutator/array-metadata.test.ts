import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const baseSource = `specification {
  element service
  element database
}
model {
  app = service 'App' {
    description 'has body'
  }
  store = database 'Store'
  app -> store 'reads'
}
views {
  view idx {
    include *
  }
}
`;

function newMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'model.c4': baseSource });
}

function readWithArrays(): string {
  return readFileSync(
    resolve(import.meta.dirname, '..', 'fixtures', 'minimal', 'with-arrays.c4'),
    'utf-8',
  );
}

describe('array metadata — addRelationship / updateRelationship', () => {
  it('addRelationship writes a string-array metadata value', () => {
    const m = newMutator();
    m.addRelationship('app', 'store', 'writes', {
      metadata: { aliases: ['primary', 'fallback'] },
    });
    const src = m.serialize()['model.c4'];
    expect(src).toMatch(/aliases\s*\[\s*'primary'\s*,\s*'fallback'\s*\]/);
    expect(m.validate()).toHaveLength(0);
  });

  it('updateRelationship replaces an array metadata value', () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': readWithArrays() });
    m.updateRelationship(
      { source: 'app', target: 'store' },
      { metadata: { aliases: ['only'] } },
    );
    const src = m.serialize()['model.c4'];
    expect(src).toMatch(/aliases\s*\['only'\]/);
    expect(src).not.toContain("'primary'");
    expect(m.validate()).toHaveLength(0);
  });

  it('updateRelationship null-deletes an array metadata value', () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': readWithArrays() });
    m.updateRelationship(
      { source: 'app', target: 'store' },
      { metadata: { aliases: null } },
    );
    const src = m.serialize()['model.c4'];
    expect(src).not.toContain('aliases');
    // The other key should still be there.
    expect(src).toContain("scalar 'one-value'");
    expect(m.validate()).toHaveLength(0);
  });

  it('addElement writes a string-array metadata value', () => {
    const m = newMutator();
    m.addElement('app', {
      name: 'gateway',
      kind: 'service',
      title: 'Gateway',
      metadata: { keywords: ['internal', 'critical'] },
    });
    const src = m.serialize()['model.c4'];
    expect(src).toMatch(/keywords\s*\[\s*'internal'\s*,\s*'critical'\s*\]/);
    expect(m.validate()).toHaveLength(0);
  });

  it('updateElement replaces an array metadata value', () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': readWithArrays() });
    m.updateElement('app', { metadata: { owners: ['carol'] } });
    const src = m.serialize()['model.c4'];
    expect(src).toMatch(/owners\s*\['carol'\]/);
    expect(src).not.toContain("'alice'");
    expect(m.validate()).toHaveLength(0);
  });

  it('empty array throws at write time', () => {
    const m = newMutator();
    expect(() =>
      m.addElement('app', {
        name: 'broken',
        kind: 'service',
        metadata: { aliases: [] },
      }),
    ).toThrow(/empty array not allowed/);
  });

  it('parsing existing .c4 with array metadata reads back as string[]', () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': readWithArrays() });
    const el = m.getElement('app');
    expect(el).not.toBeNull();
    expect(el!.metadata).toBeDefined();
    expect(el!.metadata!.single).toBe('plain');
    expect(el!.metadata!.owners).toEqual(['alice', 'bob']);
    expect(el!.metadata!.keywords).toEqual(['first', 'second', 'third']);

    const rels = m.getRelationships();
    const rel = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'store');
    expect(rel).toBeDefined();
    expect(rel!.metadata).toBeDefined();
    expect(rel!.metadata!.aliases).toEqual(['primary', 'fallback']);
    expect(rel!.metadata!.scalar).toBe('one-value');
  });
});
