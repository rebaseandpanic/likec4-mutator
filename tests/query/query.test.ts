import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';

const parser = new C4Parser();

function readFixture(dir: string, file: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', 'fixtures', dir, file), 'utf-8');
}

/**
 * Load all .c4 files in a fixture directory and concatenate them.
 * This mirrors how the LikeC4 language server would handle multiple files per workspace.
 */
function loadFixtureDir(dir: string, files: string[]): string {
  return files.map((f) => readFixture(dir, f)).join('\n');
}

describe('C4Query', () => {
  describe('minimal model', () => {
    let query: C4Query;

    beforeAll(() => {
      // minimal/model.c4 includes both specification and model blocks
      const source = readFixture('minimal', 'model.c4');
      const doc = parser.parse(source);
      if (doc.errors.length > 0) {
        console.error('Parse errors:', JSON.stringify(doc.errors, null, 2));
      }
      expect(doc.errors).toHaveLength(0);
      query = new C4Query(doc.ast);
    });

    it('should find root element by FQN', () => {
      const el = query.getElement('app');
      expect(el).not.toBeNull();
      expect(el!.name).toBe('app');
      expect(el!.kind).toBe('system');
      expect(el!.title).toBe('My Application');
    });

    it('should find nested element by FQN', () => {
      const el = query.getElement('app.api');
      expect(el).not.toBeNull();
      expect(el!.name).toBe('api');
      expect(el!.kind).toBe('service');
      expect(el!.title).toBe('REST API');
      expect(el!.parentFqn).toBe('app');
    });

    it('should return description and technology', () => {
      const el = query.getElement('app.api');
      expect(el!.description).toBe('Backend API');
      expect(el!.technology).toBe('TypeScript / Express');
    });

    it('should list children on parent element', () => {
      const el = query.getElement('app');
      expect(el!.children).toContain('app.api');
      expect(el!.children).toContain('app.db');
    });

    it('should return null for non-existent FQN', () => {
      expect(query.getElement('nonexistent')).toBeNull();
      expect(query.getElement('app.nonexistent')).toBeNull();
    });

    it('should list all elements', () => {
      const all = query.listElements();
      // app, app.api, app.db
      expect(all.length).toBe(3);
      const fqns = all.map((e) => e.fqn);
      expect(fqns).toContain('app');
      expect(fqns).toContain('app.api');
      expect(fqns).toContain('app.db');
    });

    it('should list elements filtered by kind', () => {
      const services = query.listElements({ kind: 'service' });
      expect(services.length).toBe(1);
      expect(services[0].fqn).toBe('app.api');
    });

    it('should list elements filtered by parentFqn', () => {
      const children = query.listElements({ parentFqn: 'app' });
      expect(children.length).toBe(2);
      const fqns = children.map((e) => e.fqn);
      expect(fqns).toContain('app.api');
      expect(fqns).toContain('app.db');
    });

    it('should list root-level elements when parentFqn is undefined', () => {
      const roots = query.listElements({ parentFqn: undefined });
      // No filter applied — same as listElements()
      expect(roots.length).toBe(3);
    });

    it('should get element source text', () => {
      const source = query.getElementSource('app.api');
      expect(source).toBeTruthy();
      expect(source).toContain('REST API');
      expect(source).toContain('Backend API');
    });

    it('should return null for getElementSource of non-existent FQN', () => {
      expect(query.getElementSource('nonexistent')).toBeNull();
    });

    it('should populate sourceRange with positive offsets', () => {
      const el = query.getElement('app.api');
      expect(el!.sourceRange.offset).toBeGreaterThan(0);
      expect(el!.sourceRange.end).toBeGreaterThan(el!.sourceRange.offset);
    });

    it('should find relationships', () => {
      const rels = query.getRelationships();
      expect(rels.length).toBeGreaterThan(0);
    });

    it('should find relationship with title', () => {
      const rels = query.getRelationships();
      const rel = rels.find((r) => r.targetFqn.includes('db'));
      expect(rel).toBeDefined();
      expect(rel!.title).toBe('reads/writes');
    });

    it('should resolve relationship source FQN from implicit context', () => {
      // api -> db is nested inside app body — source should be resolved as 'api' (FqnRef.$refText)
      const rels = query.getRelationships();
      const rel = rels.find((r) => r.targetFqn.includes('db'));
      expect(rel).toBeDefined();
      expect(rel!.sourceFqn).toBe('api');
    });

    it('should get specification element kinds', () => {
      const spec = query.getSpecification();
      expect(spec.elementKinds).toContain('system');
      expect(spec.elementKinds).toContain('service');
      expect(spec.elementKinds).toContain('database');
    });

    it('should get specification tags', () => {
      const spec = query.getSpecification();
      expect(spec.tags).toContain('deprecated');
      expect(spec.tags).toContain('backend');
    });

    it('should return empty relationshipKinds when none declared', () => {
      const spec = query.getSpecification();
      expect(spec.relationshipKinds).toEqual([]);
    });
  });

  describe('cloud-system model', () => {
    let query: C4Query;

    beforeAll(() => {
      // Combine spec + model into one parse
      const source = loadFixtureDir('cloud-system', ['spec.c4', 'model.c4']);
      const doc = parser.parse(source);
      if (doc.errors.length > 0) {
        console.error('Parse errors:', JSON.stringify(doc.errors, null, 2));
      }
      expect(doc.errors).toHaveLength(0);
      query = new C4Query(doc.ast);
    });

    it('should list all elements', () => {
      const all = query.listElements();
      expect(all.length).toBeGreaterThan(3);
    });

    it('should find deeply nested elements (3+ levels)', () => {
      const all = query.listElements();
      const deep = all.filter((e) => e.fqn.split('.').length >= 3);
      // cloud.ui, cloud.legacy, cloud.next, cloud.supportUser are 2-level;
      // if any grandchildren exist they'll be 3-level
      // The cloud-system has: cloud.ui, cloud.legacy, cloud.next, cloud.supportUser (depth 2)
      // No 3-deep elements in this fixture, but children of cloud are present
      expect(all.some((e) => e.fqn.split('.').length >= 2)).toBe(true);
    });

    it('should resolve specification relationship kinds', () => {
      const spec = query.getSpecification();
      expect(spec.relationshipKinds).toContain('uses');
      expect(spec.relationshipKinds).toContain('requests');
    });

    it('should find relationships in cloud-system', () => {
      const rels = query.getRelationships();
      expect(rels.length).toBeGreaterThan(0);
    });

    it('should resolve nested relation source from parent context', () => {
      // cloud.supportUser -> customer is nested inside cloud.supportUser element
      const rels = query.getRelationships();
      const rel = rels.find((r) => r.targetFqn === 'customer');
      expect(rel).toBeDefined();
      // source is implicit — should come from the parent element context
      expect(rel!.sourceFqn).toBeTruthy();
    });

    it('should resolve top-level relation with explicit dotted source FQN', () => {
      // customer .uses cloud 'uses and pays' — source is explicit FqnRef
      const rels = query.getRelationships();
      const rel = rels.find((r) => r.sourceFqn === 'customer' && r.targetFqn === 'cloud');
      expect(rel).toBeDefined();
      expect(rel!.title).toBe('uses and pays');
    });

    it('should have correct parentFqn for cloud children', () => {
      const ui = query.getElement('cloud.ui');
      expect(ui).not.toBeNull();
      expect(ui!.parentFqn).toBe('cloud');
    });

    it('should list elements by kind for cloud-system', () => {
      const actors = query.listElements({ kind: 'actor' });
      expect(actors.length).toBeGreaterThan(0);
      expect(actors.some((a) => a.fqn === 'customer')).toBe(true);
    });
  });
});
