/**
 * Multi-file integration tests (Task 3).
 *
 * Covers scenarios where the mutator is initialised with three separate .c4
 * files (spec, model, views) and mutations are directed to the correct file.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';

const parser = new C4Parser();

// ---------------------------------------------------------------------------
// Shared fixture: three-file setup
// ---------------------------------------------------------------------------

const SPEC_C4 = `specification {
  element system
  element service
  element database
  tag internal
  tag backend
}
`;

const MODEL_C4 = `model {
  app = system 'My Application' {
    api = service 'REST API' {
      description 'Handles HTTP requests'
      technology 'TypeScript'
    }
    db = database 'PostgreSQL' {
      description 'Main data store'
      technology 'PostgreSQL 16'
    }
    api -> db 'reads/writes'
  }
}
`;

const VIEWS_C4 = `views {
  view index {
    include *
    autoLayout TopBottom
  }
}
`;

function makeThreeFileMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({
    'spec.c4': SPEC_C4,
    'model.c4': MODEL_C4,
    'views.c4': VIEWS_C4,
  });
}

// ---------------------------------------------------------------------------
// Basic three-file construction
// ---------------------------------------------------------------------------

describe('Multi-file mutator construction', () => {
  it('should load three files and report zero parse errors', () => {
    const mutator = makeThreeFileMutator();
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should find elements defined in model.c4', () => {
    const mutator = makeThreeFileMutator();
    expect(mutator.getElement('app')).not.toBeNull();
    expect(mutator.getElement('app.api')).not.toBeNull();
    expect(mutator.getElement('app.db')).not.toBeNull();
  });

  it('should serialize all three files', () => {
    const mutator = makeThreeFileMutator();
    const files = mutator.serialize();
    expect(files['spec.c4']).toBeTruthy();
    expect(files['model.c4']).toBeTruthy();
    expect(files['views.c4']).toBeTruthy();
  });

  it('should leave spec.c4 and views.c4 unchanged when only the model is mutated', () => {
    const mutator = makeThreeFileMutator();
    mutator.addElement('app', { name: 'cache', kind: 'service', title: 'Redis Cache' });

    const files = mutator.serialize();
    expect(files['spec.c4']).toBe(SPEC_C4);
    expect(files['views.c4']).toBe(VIEWS_C4);
  });
});

// ---------------------------------------------------------------------------
// Add element to model file
// ---------------------------------------------------------------------------

describe('Multi-file: add element to model.c4', () => {
  it('should add an element and make it queryable', () => {
    const mutator = makeThreeFileMutator();
    mutator.addElement('app', {
      name: 'worker',
      kind: 'service',
      title: 'Background Worker',
      description: 'Processes async jobs',
      technology: 'Node.js',
    });

    const el = mutator.getElement('app.worker');
    expect(el).not.toBeNull();
    expect(el!.kind).toBe('service');
    expect(el!.technology).toBe('Node.js');
  });

  it('should write the new element to model.c4 only', () => {
    const mutator = makeThreeFileMutator();
    mutator.addElement('app', { name: 'mailer', kind: 'service', title: 'Mail Service' });

    const files = mutator.serialize();
    expect(files['model.c4']).toContain('mailer');
    expect(files['spec.c4']).not.toContain('mailer');
    expect(files['views.c4']).not.toContain('mailer');
  });

  it('should produce zero parse errors in model.c4 after adding an element', () => {
    const mutator = makeThreeFileMutator();
    mutator.addElement('app', { name: 'notifier', kind: 'service', title: 'Notifier' });

    const serialized = mutator.serialize();
    const reparsed = parser.parse(serialized['model.c4']);
    expect(reparsed.errors).toHaveLength(0);
  });

  it('should add multiple elements sequentially and validate after each', () => {
    const mutator = makeThreeFileMutator();
    const elements = [
      { name: 'svc1', kind: 'service', title: 'Service One' },
      { name: 'svc2', kind: 'service', title: 'Service Two' },
      { name: 'db2', kind: 'database', title: 'Secondary DB' },
    ];

    for (const opts of elements) {
      mutator.addElement('app', opts);
      expect(mutator.validate()).toHaveLength(0);
    }

    for (const opts of elements) {
      expect(mutator.getElement(`app.${opts.name}`)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Add view to views file
// ---------------------------------------------------------------------------

describe('Multi-file: add view to views.c4', () => {
  it('should add an element view and write it to views.c4', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'appView', type: 'element', target: 'app', title: 'App Overview' });

    const files = mutator.serialize();
    expect(files['views.c4']).toContain('view appView of app');
    // model and spec must be unchanged
    expect(files['model.c4']).toBe(MODEL_C4);
    expect(files['spec.c4']).toBe(SPEC_C4);
  });

  it('should add a dynamic view to views.c4', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'flow1', type: 'dynamic', title: 'Auth Flow' });

    const files = mutator.serialize();
    expect(files['views.c4']).toContain('dynamic view flow1');
  });

  it('should add a deployment view to views.c4', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'prodDeploy', type: 'deployment', title: 'Production' });

    const files = mutator.serialize();
    expect(files['views.c4']).toContain('deployment view prodDeploy');
  });

  it('should produce zero parse errors in views.c4 after adding a view', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'apiView', type: 'element', target: 'app.api' });

    const serialized = mutator.serialize();
    const reparsed = parser.parse(serialized['views.c4']);
    expect(reparsed.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Combined mutations across files
// ---------------------------------------------------------------------------

describe('Multi-file: combined mutations across model and views', () => {
  it('should apply element + view mutations and serialize each file correctly', () => {
    const mutator = makeThreeFileMutator();

    // Add element to model file
    mutator.addElement('app', {
      name: 'gateway',
      kind: 'service',
      title: 'API Gateway',
      description: 'Routes incoming traffic',
    });

    // Add view to views file
    mutator.addView({ id: 'gatewayView', type: 'element', target: 'app.gateway', title: 'Gateway' });

    // Validate whole setup
    expect(mutator.validate()).toHaveLength(0);

    const files = mutator.serialize();

    // model.c4 has the new element, views.c4 has the new view
    expect(files['model.c4']).toContain('gateway');
    expect(files['model.c4']).toContain('API Gateway');
    expect(files['views.c4']).toContain('view gatewayView of app.gateway');

    // spec.c4 is untouched
    expect(files['spec.c4']).toBe(SPEC_C4);
  });

  it('should update an existing element and verify model.c4 changes while others remain', () => {
    const mutator = makeThreeFileMutator();
    mutator.updateElement('app.api', {
      description: 'Updated REST API',
      technology: 'Go / Fiber',
    });

    expect(mutator.validate()).toHaveLength(0);
    const files = mutator.serialize();

    expect(files['model.c4']).toContain('Updated REST API');
    expect(files['model.c4']).toContain('Go / Fiber');
    expect(files['spec.c4']).toBe(SPEC_C4);
    expect(files['views.c4']).toBe(VIEWS_C4);
  });

  it('should remove an element from model.c4 while views.c4 stays unchanged', () => {
    const mutator = makeThreeFileMutator();
    mutator.removeElement('app.db');

    expect(mutator.validate()).toHaveLength(0);
    const files = mutator.serialize();

    expect(files['model.c4']).not.toContain("db = database 'PostgreSQL'");
    expect(files['views.c4']).toBe(VIEWS_C4);
    expect(files['spec.c4']).toBe(SPEC_C4);
  });
});

// ---------------------------------------------------------------------------
// Mutator edge cases: addView with dynamic/deployment types
// ---------------------------------------------------------------------------

describe('Mutator.addView type variants', () => {
  it('should add a dynamic view and produce valid DSL', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'dynView', type: 'dynamic' });

    const src = mutator.serialize()['views.c4'];
    expect(src).toContain('dynamic view dynView');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should add a deployment view and produce valid DSL', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'deployView', type: 'deployment' });

    const src = mutator.serialize()['views.c4'];
    expect(src).toContain('deployment view deployView');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should add an element view with includes and verify DSL output', () => {
    const mutator = makeThreeFileMutator();
    mutator.addView({ id: 'appView2', type: 'element', target: 'app', includes: ['app.*'] });

    const src = mutator.serialize()['views.c4'];
    expect(src).toContain('view appView2 of app');
    expect(src).toContain('include app.*');
  });
});

// ---------------------------------------------------------------------------
// Mutator edge cases: removeRelationship
// ---------------------------------------------------------------------------

describe('Mutator.removeRelationship via facade', () => {
  it('should remove an existing relationship so it is no longer in the serialized output', () => {
    const mutator = makeThreeFileMutator();
    mutator.removeRelationship('api', 'db');

    const src = mutator.serialize()['model.c4'];
    expect(src).not.toContain('api -> db');
  });

  it('should leave elements intact after removing a relationship', () => {
    const mutator = makeThreeFileMutator();
    mutator.removeRelationship('api', 'db');

    expect(mutator.getElement('app.api')).not.toBeNull();
    expect(mutator.getElement('app.db')).not.toBeNull();
  });

  it('should produce zero parse errors after removing a relationship', () => {
    const mutator = makeThreeFileMutator();
    mutator.removeRelationship('api', 'db');

    expect(mutator.validate()).toHaveLength(0);
  });

  it('should throw when the relationship does not exist', () => {
    const mutator = makeThreeFileMutator();
    expect(() => mutator.removeRelationship('ghost', 'phantom')).toThrow();
  });

  it('should allow adding a new relationship after removing one', () => {
    const mutator = makeThreeFileMutator();
    mutator.removeRelationship('api', 'db');
    mutator.addRelationship('app.api', 'app.db', 'new connection');

    expect(mutator.validate()).toHaveLength(0);
    const src = mutator.serialize()['model.c4'];
    expect(src).toContain('new connection');
  });
});

// ---------------------------------------------------------------------------
// Reparse verification: serialize → parse → query for multi-file setup
// ---------------------------------------------------------------------------

describe('Multi-file reparse round-trip', () => {
  it('should produce parseable model.c4 and views.c4 after a series of mutations', () => {
    const mutator = makeThreeFileMutator();

    mutator.addElement('app', {
      name: 'search',
      kind: 'service',
      title: 'Search Service',
      technology: 'Elasticsearch',
    });
    mutator.addView({ id: 'searchView', type: 'element', target: 'app.search', title: 'Search' });
    mutator.updateElement('app.api', { description: 'Revised description' });
    mutator.removeRelationship('api', 'db');

    const files = mutator.serialize();

    const modelDoc = parser.parse(files['model.c4']);
    expect(modelDoc.errors).toHaveLength(0);
    const modelQuery = new C4Query(modelDoc.ast);
    expect(modelQuery.getElement('app.search')).not.toBeNull();
    expect(modelQuery.getElement('app.api')!.description).toBe('Revised description');

    const viewsDoc = parser.parse(files['views.c4']);
    expect(viewsDoc.errors).toHaveLength(0);
  });
});
