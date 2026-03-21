import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const parser = new C4Parser();
const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const minimalSource = readFileSync(join(fixturesDir, 'minimal', 'model.c4'), 'utf-8');

function findC4Files(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findC4Files(full));
    } else if (extname(entry) === '.c4') {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Round-trip: parse → get fullText → reparse → verify structure preserved
// ---------------------------------------------------------------------------

describe('Round-trip: parse → fullText → reparse', () => {
  const files = findC4Files(fixturesDir);

  for (const file of files) {
    const relPath = file.replace(fixturesDir + '/', '');

    it(`${relPath}: element count and names should be preserved`, () => {
      const source = readFileSync(file, 'utf-8');

      // First parse
      const doc1 = parser.parse(source);
      expect(doc1.errors).toHaveLength(0);

      const fullText = doc1.fullText;

      // Reparse using the fullText extracted from the CST
      const doc2 = parser.parse(fullText);
      expect(doc2.errors).toHaveLength(0);

      const query1 = new C4Query(doc1.ast);
      const query2 = new C4Query(doc2.ast);

      const elements1 = query1.listElements();
      const elements2 = query2.listElements();

      // Same number of elements
      expect(elements2.length).toBe(elements1.length);

      // Same element FQNs
      const fqns1 = elements1.map((e) => e.fqn).sort();
      const fqns2 = elements2.map((e) => e.fqn).sort();
      expect(fqns2).toEqual(fqns1);

      // Same relationship count
      const rels1 = query1.getRelationships();
      const rels2 = query2.getRelationships();
      expect(rels2.length).toBe(rels1.length);
    });
  }
});

// ---------------------------------------------------------------------------
// Round-trip after mutations: add → serialize → reparse → verify
// ---------------------------------------------------------------------------

describe('Round-trip after mutations', () => {
  it('should preserve original elements after add and reparse', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': minimalSource });

    // Mutate: add a new element
    mutator.addElement('app', { name: 'worker', kind: 'service', title: 'Background Worker' });

    // Serialize
    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toBeTruthy();

    // Reparse the serialized output
    const reparsed = parser.parse(serialized);
    expect(reparsed.errors).toHaveLength(0);

    const query = new C4Query(reparsed.ast);

    // New element must be present
    const newEl = query.getElement('app.worker');
    expect(newEl).not.toBeNull();
    expect(newEl!.name).toBe('worker');

    // Original elements must still be present
    expect(query.getElement('app')).not.toBeNull();
    expect(query.getElement('app.api')).not.toBeNull();
    expect(query.getElement('app.db')).not.toBeNull();
  });

  it('should preserve element count: original + 1 after add', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': minimalSource });

    const originalQuery = new C4Query(parser.parse(minimalSource).ast);
    const originalCount = originalQuery.listElements().length;

    mutator.addElement('app', { name: 'queue', kind: 'service', title: 'Message Queue' });

    const serialized = mutator.serialize()['model.c4'];
    const reparsed = parser.parse(serialized);
    expect(reparsed.errors).toHaveLength(0);

    const newQuery = new C4Query(reparsed.ast);
    expect(newQuery.listElements().length).toBe(originalCount + 1);
  });

  it('should reflect all mutations in reparsed AST', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': minimalSource });

    mutator.addElement('app', { name: 'cache', kind: 'service', title: 'Cache Layer' });
    mutator.updateElement('app.api', { description: 'Updated after round-trip' });
    mutator.addRelationship('app.cache', 'app.db', 'persists to');

    const serialized = mutator.serialize()['model.c4'];
    const reparsed = parser.parse(serialized);
    expect(reparsed.errors).toHaveLength(0);

    const query = new C4Query(reparsed.ast);

    // New element present
    expect(query.getElement('app.cache')).not.toBeNull();

    // Updated description present
    const api = query.getElement('app.api');
    expect(api).not.toBeNull();
    expect(api!.description).toBe('Updated after round-trip');

    // New relationship present
    const rels = query.getRelationships({ sourceFqn: 'app.cache', targetFqn: 'app.db' });
    expect(rels.length).toBeGreaterThan(0);
  });
});
