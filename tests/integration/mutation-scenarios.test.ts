import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

function readFixture(...parts: string[]): string {
  return readFileSync(join(fixturesDir, ...parts), 'utf-8');
}

function minimalMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'model.c4': readFixture('minimal', 'model.c4') });
}

const parser = new C4Parser();

// ---------------------------------------------------------------------------
// Scenario 1: Add a complete service with database, relationship, and view
// ---------------------------------------------------------------------------

describe('Scenario 1: Add a complete service', () => {
  it('should add service, database, relationship and view with 0 errors', () => {
    const mutator = minimalMutator();

    // 1. Add a new service under `app` — include a description so that codegen
    //    emits a body block, allowing a child to be nested inside it next.
    mutator.addElement('app', {
      name: 'gateway',
      kind: 'service',
      title: 'API Gateway',
      description: 'Handles incoming HTTP traffic',
    });

    // 2. Add a database under the new service (gateway now has a body block)
    mutator.addElement('app.gateway', {
      name: 'cache',
      kind: 'database',
      title: 'Gateway Cache',
      description: 'Caches gateway responses',
      technology: 'Redis',
    });

    // 3. Add a relationship: new service -> new database
    mutator.addRelationship('app.gateway', 'app.cache', 'reads and writes');

    // 4. Add a view for the new service
    mutator.addView({ id: 'gatewayView', type: 'element', target: 'app.gateway', title: 'Gateway View' });

    // 5. Validate — must have 0 errors
    const errors = mutator.validate();
    expect(errors).toHaveLength(0);

    // 6. Verify all new elements exist via query
    const gateway = mutator.getElement('app.gateway');
    expect(gateway).not.toBeNull();
    expect(gateway!.kind).toBe('service');
    expect(gateway!.title).toBe('API Gateway');

    const cache = mutator.getElement('app.gateway.cache');
    expect(cache).not.toBeNull();
    expect(cache!.kind).toBe('database');
    expect(cache!.technology).toBe('Redis');

    // 7. Verify original elements still exist
    expect(mutator.getElement('app')).not.toBeNull();
    expect(mutator.getElement('app.api')).not.toBeNull();
    expect(mutator.getElement('app.db')).not.toBeNull();

    // 8. Verify the new relationship exists
    const rels = mutator.getRelationships({ sourceFqn: 'app.gateway', targetFqn: 'app.cache' });
    expect(rels.length).toBeGreaterThan(0);

    // 9. Verify view appears in serialized output
    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('view gatewayView');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Multiple sequential mutations
// ---------------------------------------------------------------------------

describe('Scenario 2: Multiple sequential mutations', () => {
  it('should add 5 services and relationships with 0 errors after each mutation', () => {
    const mutator = minimalMutator();

    const originalCount = mutator.listElements().length;

    // Add 5 services in a loop, validate after each
    for (let i = 1; i <= 5; i++) {
      mutator.addElement('app', {
        name: `service${i}`,
        kind: 'service',
        title: `Service ${i}`,
        description: `Auto-generated service number ${i}`,
      });

      const errors = mutator.validate();
      expect(errors).toHaveLength(0);
    }

    // Add relationships between consecutive services
    for (let i = 1; i < 5; i++) {
      mutator.addRelationship(`app.service${i}`, `app.service${i + 1}`, `calls service ${i + 1}`);

      const errors = mutator.validate();
      expect(errors).toHaveLength(0);
    }

    // Verify element count increased by exactly 5
    const currentCount = mutator.listElements().length;
    expect(currentCount).toBe(originalCount + 5);

    // Verify all 5 services exist
    for (let i = 1; i <= 5; i++) {
      const el = mutator.getElement(`app.service${i}`);
      expect(el).not.toBeNull();
      expect(el!.name).toBe(`service${i}`);
      expect(el!.kind).toBe('service');
    }

    // Verify chain relationships exist
    for (let i = 1; i < 5; i++) {
      const rels = mutator.getRelationships({
        sourceFqn: `app.service${i}`,
        targetFqn: `app.service${i + 1}`,
      });
      expect(rels.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Update existing elements
// ---------------------------------------------------------------------------

describe('Scenario 3: Update existing elements', () => {
  it('should update description and technology, leaving other properties intact', () => {
    const mutator = minimalMutator();

    // Capture original values
    const originalApi = mutator.getElement('app.api')!;
    const originalDb = mutator.getElement('app.db')!;
    expect(originalApi).not.toBeNull();
    expect(originalDb).not.toBeNull();

    // Update app.api description
    mutator.updateElement('app.api', { description: 'Updated API description via integration test' });

    // Update app.db technology
    mutator.updateElement('app.db', { technology: 'PostgreSQL 17' });

    // Verify updates took effect
    const updatedApi = mutator.getElement('app.api')!;
    expect(updatedApi.description).toBe('Updated API description via integration test');

    const updatedDb = mutator.getElement('app.db')!;
    expect(updatedDb.technology).toBe('PostgreSQL 17');

    // Verify other properties are unchanged
    expect(updatedApi.kind).toBe(originalApi.kind);
    expect(updatedApi.name).toBe(originalApi.name);
    expect(updatedApi.fqn).toBe(originalApi.fqn);

    expect(updatedDb.kind).toBe(originalDb.kind);
    expect(updatedDb.name).toBe(originalDb.name);

    // Verify unchanged elements are still intact
    const app = mutator.getElement('app')!;
    expect(app).not.toBeNull();
    expect(app.kind).toBe('system');

    // Validate: 0 errors
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should support sequential updates to the same element', () => {
    const mutator = minimalMutator();

    mutator.updateElement('app.api', { description: 'First update' });
    mutator.updateElement('app.api', { description: 'Second update' });
    mutator.updateElement('app.api', { technology: 'Python / FastAPI' });

    const el = mutator.getElement('app.api')!;
    expect(el.description).toBe('Second update');
    expect(el.technology).toBe('Python / FastAPI');

    expect(mutator.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Remove and verify
// ---------------------------------------------------------------------------

describe('Scenario 4: Remove element and verify', () => {
  it('should remove app.db while preserving app.api', () => {
    const mutator = minimalMutator();

    mutator.removeElement('app.db');

    // app.db must be gone
    expect(mutator.getElement('app.db')).toBeNull();

    // app.api must still exist
    const api = mutator.getElement('app.api');
    expect(api).not.toBeNull();
    expect(api!.kind).toBe('service');

    // app must still exist
    expect(mutator.getElement('app')).not.toBeNull();
  });

  it('should produce 0 parser/lexer errors after removing app.db', () => {
    const mutator = minimalMutator();
    mutator.removeElement('app.db');

    // The parser itself should not emit errors — unresolved references
    // are semantic (not syntactic) issues.
    const errors = mutator.validate();
    expect(errors).toHaveLength(0);
  });

  it('should serialize cleanly after removal, with db text absent', () => {
    const mutator = minimalMutator();
    mutator.removeElement('app.db');

    const serialized = mutator.serialize()['model.c4'];
    // The database element definition must be gone from the output
    expect(serialized).not.toContain("db = database 'PostgreSQL'");
    // The API element must still be present
    expect(serialized).toContain("api = service");
  });

  it('should allow adding a new element after removal', () => {
    const mutator = minimalMutator();
    mutator.removeElement('app.db');

    // Should be able to add a replacement
    mutator.addElement('app', { name: 'newDb', kind: 'database', title: 'New Database' });

    expect(mutator.getElement('app.newDb')).not.toBeNull();
    expect(mutator.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Round-trip on complex fixtures (cloud-system, multi-file)
// ---------------------------------------------------------------------------

describe('Scenario 5: Round-trip on complex fixtures', () => {
  it('should parse cloud-system spec + model together, mutate, reparse with 0 errors', () => {
    const specSource = readFixture('cloud-system', 'spec.c4');
    const modelSource = readFixture('cloud-system', 'model.c4');

    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': specSource,
      'model.c4': modelSource,
    });

    // Initial validation must be clean
    expect(mutator.validate()).toHaveLength(0);

    // Add an element to the model
    mutator.addElement('cloud', {
      name: 'monitoring',
      kind: 'container',
      title: 'Monitoring',
      description: 'Observability platform',
    });

    // Validate after mutation
    expect(mutator.validate()).toHaveLength(0);

    // Serialize
    const serialized = mutator.serialize();
    expect(serialized['spec.c4']).toBeTruthy();
    expect(serialized['model.c4']).toBeTruthy();

    // Reparse model
    const reparsed = parser.parse(serialized['model.c4']);
    expect(reparsed.errors).toHaveLength(0);

    // Verify new element in reparsed AST
    const query = new C4Query(reparsed.ast);
    const monitoring = query.getElement('cloud.monitoring');
    expect(monitoring).not.toBeNull();
    expect(monitoring!.kind).toBe('container');

    // Verify original elements still exist in reparsed AST
    expect(query.getElement('cloud')).not.toBeNull();
    expect(query.getElement('cloud.ui')).not.toBeNull();
  });

  it('should parse boutique spec + model together, mutate, reparse with 0 errors', () => {
    const specSource = readFixture('boutique', 'spec.c4');
    const modelSource = readFixture('boutique', 'model.c4');

    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': specSource,
      'model.c4': modelSource,
    });

    expect(mutator.validate()).toHaveLength(0);

    // Add a service element under boutique
    mutator.addElement('boutique', {
      name: 'notifier',
      kind: 'service',
      title: 'Notification Service',
      technology: 'Node.js',
    });

    expect(mutator.validate()).toHaveLength(0);

    const serialized = mutator.serialize();
    const reparsed = parser.parse(serialized['model.c4']);
    expect(reparsed.errors).toHaveLength(0);

    const query = new C4Query(reparsed.ast);
    const notifier = query.getElement('boutique.notifier');
    expect(notifier).not.toBeNull();
    expect(notifier!.technology).toBe('Node.js');

    // Originals intact
    expect(query.getElement('boutique')).not.toBeNull();
    expect(query.getElement('boutique.checkout')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Batch apply JSON mutations programmatically
// ---------------------------------------------------------------------------

describe('Scenario 6: Batch apply JSON mutations', () => {
  it('should apply a batch of add-element mutations and verify all results', () => {
    const mutator = minimalMutator();

    // Define a mutations array programmatically
    const mutations: Array<{
      type: 'addElement';
      parentFqn: string | null;
      opts: { name: string; kind: string; title: string; description?: string };
    }> = [
      {
        type: 'addElement',
        parentFqn: 'app',
        opts: { name: 'authService', kind: 'service', title: 'Auth Service', description: 'Handles authentication' },
      },
      {
        type: 'addElement',
        parentFqn: 'app',
        opts: { name: 'emailService', kind: 'service', title: 'Email Service', description: 'Sends emails' },
      },
      {
        type: 'addElement',
        parentFqn: 'app',
        opts: { name: 'reportService', kind: 'service', title: 'Report Service' },
      },
    ];

    // Apply all mutations
    for (const mutation of mutations) {
      mutator.addElement(mutation.parentFqn, mutation.opts);
    }

    // Verify results
    expect(mutator.validate()).toHaveLength(0);

    for (const mutation of mutations) {
      const fqn = mutation.parentFqn ? `${mutation.parentFqn}.${mutation.opts.name}` : mutation.opts.name;
      const el = mutator.getElement(fqn);
      expect(el).not.toBeNull();
      expect(el!.name).toBe(mutation.opts.name);
      expect(el!.kind).toBe(mutation.opts.kind);
    }

    // Verify original elements still present
    expect(mutator.getElement('app')).not.toBeNull();
    expect(mutator.getElement('app.api')).not.toBeNull();
    expect(mutator.getElement('app.db')).not.toBeNull();
  });

  it('should apply a batch of mixed mutation types and verify all results', () => {
    const mutator = minimalMutator();

    // Mixed batch: add elements, update, add relationships, add view
    mutator.addElement('app', { name: 'search', kind: 'service', title: 'Search Service' });
    mutator.addElement('app', { name: 'indexDb', kind: 'database', title: 'Search Index', technology: 'Elasticsearch' });
    mutator.updateElement('app.api', { description: 'Batch-updated description', technology: 'Go' });
    mutator.addRelationship('app.search', 'app.indexDb', 'indexes');
    mutator.addRelationship('app.api', 'app.search', 'delegates search');
    mutator.addView({ id: 'searchView', type: 'element', target: 'app.search', title: 'Search Architecture' });

    // Validate the whole batch
    expect(mutator.validate()).toHaveLength(0);

    // Verify added elements
    expect(mutator.getElement('app.search')).not.toBeNull();
    expect(mutator.getElement('app.indexDb')).not.toBeNull();

    // Verify update
    expect(mutator.getElement('app.api')!.description).toBe('Batch-updated description');
    expect(mutator.getElement('app.api')!.technology).toBe('Go');

    // Verify relationships
    const searchToIndex = mutator.getRelationships({ sourceFqn: 'app.search', targetFqn: 'app.indexDb' });
    expect(searchToIndex.length).toBeGreaterThan(0);

    const apiToSearch = mutator.getRelationships({ sourceFqn: 'app.api', targetFqn: 'app.search' });
    expect(apiToSearch.length).toBeGreaterThan(0);

    // Verify view
    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('view searchView');

    // Final serialize → reparse: must still have 0 errors
    const reparsed = parser.parse(serialized);
    expect(reparsed.errors).toHaveLength(0);
  });

  it('should handle batch mutations on multi-file setup', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': readFixture('minimal', 'spec.c4'),
      'model.c4': readFixture('minimal', 'model.c4'),
    });

    // Apply mutations to model file (which contains the model block)
    const batch = [
      { name: 'svc1', kind: 'service', title: 'Service One' },
      { name: 'svc2', kind: 'service', title: 'Service Two' },
      { name: 'svc3', kind: 'database', title: 'Service Three DB' },
    ];

    for (const item of batch) {
      mutator.addElement('app', item);
    }

    expect(mutator.validate()).toHaveLength(0);

    const serialized = mutator.serialize();
    // Both files must be present in serialized output
    expect(serialized['spec.c4']).toBeTruthy();
    expect(serialized['model.c4']).toBeTruthy();

    // Spec file should be unchanged
    expect(serialized['spec.c4']).toBe(readFixture('minimal', 'spec.c4'));

    // All batch elements must exist
    for (const item of batch) {
      expect(mutator.getElement(`app.${item.name}`)).not.toBeNull();
    }
  });
});
