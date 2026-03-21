import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { C4Parser } from '../../src/parser/parser.js';

const parser = new C4Parser();
const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

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

describe('Parse all fixtures', () => {
  const files = findC4Files(fixturesDir);

  for (const file of files) {
    const relPath = file.replace(fixturesDir + '/', '');
    it(`should parse ${relPath} without errors`, () => {
      const source = readFileSync(file, 'utf-8');
      const doc = parser.parse(source);
      if (doc.errors.length > 0) {
        console.log(`Errors in ${relPath}:`, doc.errors.map((e) => e.message));
      }
      expect(doc.errors).toHaveLength(0);
    });
  }
});
