import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';

const parser = new C4Parser();

function readFixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', 'fixtures', 'minimal', name), 'utf-8');
}

function makeMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'model.c4': readFixture('model.c4') });
}

// ---------------------------------------------------------------------------
// Construction & query API
// ---------------------------------------------------------------------------

describe('LikeC4Mutator — construction', () => {
  it('should create from files record', () => {
    const m = makeMutator();
    expect(m).toBeInstanceOf(LikeC4Mutator);
  });

  it('should expose existing elements via getElement', () => {
    const m = makeMutator();
    const el = m.getElement('app');
    expect(el).not.toBeNull();
    expect(el!.kind).toBe('system');
    expect(el!.title).toBe('My Application');
  });

  it('should list all elements', () => {
    const m = makeMutator();
    const elements = m.listElements();
    expect(elements.length).toBeGreaterThanOrEqual(3);
    const fqns = elements.map((e) => e.fqn);
    expect(fqns).toContain('app');
    expect(fqns).toContain('app.api');
    expect(fqns).toContain('app.db');
  });

  it('should return null for non-existent element', () => {
    const m = makeMutator();
    expect(m.getElement('ghost')).toBeNull();
  });

  it('should return existing relationships', () => {
    const m = makeMutator();
    const rels = m.getRelationships();
    expect(rels.length).toBeGreaterThan(0);
  });

  it('should return element source text', () => {
    const m = makeMutator();
    const src = m.getElementSource('app.api');
    expect(src).toBeTruthy();
    expect(src).toContain('REST API');
  });
});

// ---------------------------------------------------------------------------
// addElement
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.addElement', () => {
  it('should add a child element and make it queryable', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Redis Cache' });

    const el = m.getElement('app.cache');
    expect(el).not.toBeNull();
    expect(el!.name).toBe('cache');
    expect(el!.kind).toBe('service');
    expect(el!.parentFqn).toBe('app');
  });

  it('should add a root-level element when parentFqn is null', () => {
    const m = makeMutator();
    m.addElement(null, { name: 'gateway', kind: 'system', title: 'API Gateway' });

    const el = m.getElement('gateway');
    expect(el).not.toBeNull();
    expect(el!.parentFqn).toBeUndefined();
  });

  it('should preserve existing elements after add', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'cache', kind: 'service' });

    expect(m.getElement('app.api')).not.toBeNull();
    expect(m.getElement('app.db')).not.toBeNull();
    expect(m.getElement('app.cache')).not.toBeNull();
  });

  it('should serialise a valid (parse-error-free) document', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache' });

    const errors = m.validate();
    expect(errors).toHaveLength(0);
  });

  it('should throw when parent FQN does not exist', () => {
    const m = makeMutator();
    expect(() => m.addElement('ghost', { name: 'x', kind: 'service' })).toThrow();
  });

  it('should add element with tags and produce valid document', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'tagged', kind: 'service', tags: ['internal', 'backend'] });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('#internal');
    expect(src).toContain('#backend');
    expect(m.validate()).toHaveLength(0);
  });

  it('should add element with links and produce valid document', () => {
    const m = makeMutator();
    m.addElement('app', {
      name: 'linked',
      kind: 'service',
      links: [{ url: 'https://linked.example.com', label: 'Home' }],
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain("link https://linked.example.com 'Home'");
    expect(m.validate()).toHaveLength(0);
  });

  it('should add element with metadata and produce valid document', () => {
    const m = makeMutator();
    m.addElement('app', {
      name: 'meta',
      kind: 'service',
      metadata: { team: 'platform', region: 'eu-west-1' },
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('metadata {');
    expect(src).toContain("team 'platform'");
    expect(src).toContain("region 'eu-west-1'");
    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateElement
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.updateElement', () => {
  it('should update description on existing element', () => {
    const m = makeMutator();
    m.updateElement('app.api', { description: 'New description' });

    expect(m.getElement('app.api')!.description).toBe('New description');
  });

  it('should update technology on existing element', () => {
    const m = makeMutator();
    m.updateElement('app.api', { technology: 'Rust' });

    expect(m.getElement('app.api')!.technology).toBe('Rust');
  });

  it('should update title on existing element', () => {
    const m = makeMutator();
    m.updateElement('app', { title: 'Rebranded App' });

    expect(m.getElement('app')!.title).toBe('Rebranded App');
  });

  it('should produce parse-error-free document after update', () => {
    const m = makeMutator();
    m.updateElement('app.api', { description: 'Updated' });

    expect(m.validate()).toHaveLength(0);
  });

  it('should throw when FQN does not exist', () => {
    const m = makeMutator();
    expect(() => m.updateElement('ghost', { title: 'x' })).toThrow();
  });

  it('should update element with tags', () => {
    const m = makeMutator();
    m.updateElement('app.api', { tags: ['deprecated'] });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('#deprecated');
    expect(m.validate()).toHaveLength(0);
  });

  it('should update element with links', () => {
    const m = makeMutator();
    m.updateElement('app.api', { links: [{ url: 'https://api.example.com', label: 'Docs' }] });

    const src = m.serialize()['model.c4'];
    expect(src).toContain("link https://api.example.com 'Docs'");
    expect(m.validate()).toHaveLength(0);
  });

  it('should update element with metadata', () => {
    const m = makeMutator();
    m.updateElement('app.api', { metadata: { owner: 'team-api', version: 'v2' } });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('metadata {');
    expect(src).toContain("owner 'team-api'");
    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// removeElement
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.removeElement', () => {
  it('should remove a leaf element', () => {
    const m = makeMutator();
    m.removeElement('app.api');

    expect(m.getElement('app.api')).toBeNull();
  });

  it('should keep sibling elements after remove', () => {
    const m = makeMutator();
    m.removeElement('app.api');

    expect(m.getElement('app.db')).not.toBeNull();
    expect(m.getElement('app')).not.toBeNull();
  });

  it('should produce parse-error-free document after removal', () => {
    const m = makeMutator();
    m.removeElement('app.db');

    expect(m.validate()).toHaveLength(0);
  });

  it('should throw when FQN does not exist', () => {
    const m = makeMutator();
    expect(() => m.removeElement('ghost')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// addRelationship
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.addRelationship', () => {
  it('should add a relationship and make it queryable', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external', 'calls');

    const rels = m.getRelationships();
    const added = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'external');
    expect(added).toBeDefined();
    expect(added!.title).toBe('calls');
  });

  it('should add a relationship without a label', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external');

    const rels = m.getRelationships();
    const added = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'external');
    expect(added).toBeDefined();
  });

  it('should produce a parse-error-free document after adding relationship', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external');

    expect(m.validate()).toHaveLength(0);
  });

  it('should add a relationship with a description', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external', 'calls', 'Calls the external system');

    const src = m.serialize()['model.c4'];
    expect(src).toContain("description 'Calls the external system'");
    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addView
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.addView', () => {
  it('should add a plain view', () => {
    const m = makeMutator();
    m.addView({ id: 'newView', type: 'element' });

    const errors = m.validate();
    expect(errors).toHaveLength(0);

    const src = m.serialize()['model.c4'];
    expect(src).toContain('view newView');
  });

  it('should add a scoped element view', () => {
    const m = makeMutator();
    m.addView({ id: 'apiView', type: 'element', target: 'app.api', title: 'API View' });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('view apiView of app.api');
    expect(src).toContain("'API View'");
  });

  it('should add a dynamic view', () => {
    const m = makeMutator();
    m.addView({ id: 'flow1', type: 'dynamic', title: 'Flow' });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('dynamic view flow1');
  });

  it('should produce a parse-error-free document after adding view', () => {
    const m = makeMutator();
    m.addView({ id: 'extraView', type: 'element', includes: ['*'] });

    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// serialize & validate
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.serialize', () => {
  it('should return record keyed by filename', () => {
    const m = makeMutator();
    const files = m.serialize();
    expect(files).toHaveProperty('model.c4');
    expect(typeof files['model.c4']).toBe('string');
  });

  it('should reflect mutations in serialized output', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache' });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('cache = service');
    expect(src).toContain("'Cache'");
  });
});

describe('LikeC4Mutator.validate', () => {
  it('should return empty array for unmodified valid document', () => {
    const m = makeMutator();
    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trip test
// ---------------------------------------------------------------------------

describe('Round-trip: serialize → parse → verify', () => {
  it('should produce structurally identical output after multiple mutations', () => {
    const m = makeMutator();

    // Apply several mutations
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache' });
    m.updateElement('app.api', { description: 'Updated API description' });
    m.addView({ id: 'cacheView', type: 'element', target: 'app.cache', title: 'Cache View' });

    // Serialize and re-parse from scratch
    const files = m.serialize();
    const doc = parser.parse(files['model.c4']);

    expect(doc.errors).toHaveLength(0);

    const query = new C4Query(doc.ast);
    expect(query.getElement('app.cache')).not.toBeNull();
    expect(query.getElement('app.api')!.description).toBe('Updated API description');
  });
});
