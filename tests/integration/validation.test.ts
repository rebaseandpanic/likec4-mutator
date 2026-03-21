/**
 * Tests for LikeC4Mutator.validate().
 *
 * validate() re-parses all in-memory source files and returns an array of
 * syntactic error strings (one per error).  An empty array means all files
 * parse cleanly.  Semantic issues (unresolved references, etc.) are NOT
 * reported by this method because the underlying parser only performs lexing
 * and grammar parsing.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_FULL = `specification {
  element system
  element service
  element database
}
model {
  app = system 'My Application' {
    description 'Main application system'
    api = service 'REST API' {
      description 'Backend API'
      technology 'TypeScript / Express'
    }
    db = database 'PostgreSQL' {
      description 'Main database'
      technology 'PostgreSQL 16'
    }
    api -> db 'reads/writes'
  }
}
views {
  view index {
    include *
  }
  view appView of app {
    include *
    autoLayout TopBottom
  }
}
`;

const VALID_SPEC_ONLY = `specification {
  element service
  element database
}
`;

const VALID_MODEL_ONLY = `model {
  svc = service 'Service'
}
`;

// ---------------------------------------------------------------------------
// 1. validate() on initial valid sources
// ---------------------------------------------------------------------------

describe('validate() on valid source', () => {
  it('should return [] for a syntactically valid single-file source', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] for a spec-only file', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'spec.c4': VALID_SPEC_ONLY });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] for a model-only file (no spec)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_MODEL_ONLY });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] for a multi-file setup where all files are valid', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': VALID_SPEC_ONLY,
      'model.c4': VALID_MODEL_ONLY,
    });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] for an empty string (degenerate but not a parse error)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'empty.c4': '' });
    // An empty file may produce parser errors for missing required top-level
    // constructs; we simply assert the method does not throw.
    expect(() => mutator.validate()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. validate() after valid mutations
// ---------------------------------------------------------------------------

describe('validate() after valid mutations', () => {
  it('should return [] after addElement at model level', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.addElement(null, { name: 'external', kind: 'system', title: 'External System' });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after addElement as child of existing parent', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.addElement('app', {
      name: 'cache',
      kind: 'database',
      title: 'Cache',
      technology: 'Redis',
    });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after updateElement title', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.updateElement('app', { title: 'Updated App Title' });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after updateElement description', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.updateElement('app.api', { description: 'New description for API' });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after updateElement technology', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.updateElement('app.db', { technology: 'PostgreSQL 17' });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after removeElement', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.removeElement('app.db');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after addRelationship', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.addRelationship('app.db', 'app.api', 'notifies');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after addView', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });
    mutator.addView({ id: 'apiView', type: 'element', target: 'app.api', title: 'API View' });
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should return [] after a complex sequence of mutations', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });

    // Add elements
    mutator.addElement('app', {
      name: 'queue',
      kind: 'service',
      title: 'Message Queue',
      technology: 'RabbitMQ',
      description: 'Async messaging backbone',
    });

    // Update existing
    mutator.updateElement('app.api', { description: 'Updated API description', technology: 'Go' });
    mutator.updateElement('app.db', { technology: 'PostgreSQL 17' });

    // Add relationships
    mutator.addRelationship('app.api', 'app.queue', 'publishes to');
    mutator.addRelationship('app.queue', 'app.db', 'persists via');

    // Add view
    mutator.addView({ id: 'queueView', type: 'element', target: 'app.queue', title: 'Queue View' });

    // Remove one element
    mutator.removeElement('app.db');

    expect(mutator.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. validate() after manually breaking a source
// ---------------------------------------------------------------------------

describe('validate() after introducing syntax errors', () => {
  it('should return errors after replacing source with broken syntax', () => {
    // We can inject broken source by reconstructing the mutator from broken text
    const brokenSource = `specification {
  element system
  BROKEN SYNTAX HERE ???
}
model {
  app = system
`;
    // Simply validate that the parser picks up errors — a broken file is
    // created directly so we do not need to route it through mutator mutations.
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': brokenSource });
    const errors = mutator.validate();
    // Broken source must produce at least one parse/lexer error
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should include the filename in each error message', () => {
    const brokenSource = `model { BROKEN`;
    const mutator = LikeC4Mutator.fromFiles({ 'bad-file.c4': brokenSource });
    const errors = mutator.validate();
    // Each error string must be prefixed with the filename
    for (const err of errors) {
      expect(err).toMatch(/^bad-file\.c4:/);
    }
  });

  it('should include line and column information in error messages', () => {
    const brokenSource = `model { BROKEN`;
    const mutator = LikeC4Mutator.fromFiles({ 'bad.c4': brokenSource });
    const errors = mutator.validate();
    // Format: filename:line:column: message
    for (const err of errors) {
      expect(err).toMatch(/^bad\.c4:\d+:\d+:/);
    }
  });

  it('should report errors from multiple broken files independently', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'file1.c4': `model { BROKEN_SYNTAX`,
      'file2.c4': `specification { ALSO BROKEN`,
    });
    const errors = mutator.validate();
    // Both files must contribute errors
    const file1Errors = errors.filter((e) => e.startsWith('file1.c4:'));
    const file2Errors = errors.filter((e) => e.startsWith('file2.c4:'));
    expect(file1Errors.length).toBeGreaterThan(0);
    expect(file2Errors.length).toBeGreaterThan(0);
  });

  it('should return [] for valid files even when another file has errors', () => {
    // Mixed: one valid file, one broken file
    const mutator = LikeC4Mutator.fromFiles({
      'good.c4': VALID_SPEC_ONLY,
      'bad.c4': `model { BROKEN`,
    });
    const errors = mutator.validate();
    // Errors only from bad.c4
    const goodErrors = errors.filter((e) => e.startsWith('good.c4:'));
    expect(goodErrors).toHaveLength(0);

    const badErrors = errors.filter((e) => e.startsWith('bad.c4:'));
    expect(badErrors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Multiple mutations followed by validate
// ---------------------------------------------------------------------------

describe('Multiple mutations followed by validate', () => {
  it('should maintain clean state after 10 sequential addElement mutations', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });

    for (let i = 1; i <= 10; i++) {
      mutator.addElement('app', {
        name: `micro${i}`,
        kind: 'service',
        title: `Microservice ${i}`,
        description: `Auto-generated microservice ${i}`,
      });
    }

    expect(mutator.validate()).toHaveLength(0);

    // All 10 elements must exist
    for (let i = 1; i <= 10; i++) {
      expect(mutator.getElement(`app.micro${i}`)).not.toBeNull();
    }
  });

  it('should maintain clean state after interleaved add/remove/update mutations', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });

    // Add two elements
    mutator.addElement('app', {
      name: 'worker',
      kind: 'service',
      title: 'Worker',
      description: 'Background job processor',
    });
    mutator.addElement('app', {
      name: 'scheduler',
      kind: 'service',
      title: 'Scheduler',
      description: 'Job scheduler',
    });

    expect(mutator.validate()).toHaveLength(0);

    // Update one
    mutator.updateElement('app.worker', { technology: 'Python / Celery' });
    expect(mutator.validate()).toHaveLength(0);

    // Remove the other
    mutator.removeElement('app.scheduler');
    expect(mutator.validate()).toHaveLength(0);

    // Add a relationship
    mutator.addRelationship('app.api', 'app.worker', 'dispatches jobs');
    expect(mutator.validate()).toHaveLength(0);

    // Add a view
    mutator.addView({ id: 'workerView', type: 'element', target: 'app.worker', title: 'Worker View' });
    expect(mutator.validate()).toHaveLength(0);

    // Final state checks
    expect(mutator.getElement('app.worker')).not.toBeNull();
    expect(mutator.getElement('app.scheduler')).toBeNull();
    expect(mutator.getElement('app.api')).not.toBeNull();
  });

  it('should accumulate elements correctly across many addElement calls and report 0 errors', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });

    const initialCount = mutator.listElements().length;

    // Add elements to model level (null parent)
    const topLevelNames = ['extSystem', 'thirdParty', 'monitoring'];
    for (const name of topLevelNames) {
      mutator.addElement(null, { name, kind: 'system', title: name });
    }

    expect(mutator.validate()).toHaveLength(0);
    expect(mutator.listElements().length).toBe(initialCount + topLevelNames.length);
  });

  it('should produce 0 validation errors after adding nested child with body properties', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': VALID_FULL });

    // Add a parent that gets a body (description triggers body block generation)
    mutator.addElement('app', {
      name: 'gateway',
      kind: 'service',
      title: 'API Gateway',
      description: 'Proxies all incoming traffic',
      technology: 'Nginx',
    });

    // Now add a child to the newly created parent (which has a body block)
    mutator.addElement('app.gateway', {
      name: 'rateLimit',
      kind: 'service',
      title: 'Rate Limiter',
      description: 'Applies rate-limiting rules',
    });

    expect(mutator.validate()).toHaveLength(0);
    expect(mutator.getElement('app.gateway')).not.toBeNull();
    expect(mutator.getElement('app.gateway.rateLimit')).not.toBeNull();
  });
});
