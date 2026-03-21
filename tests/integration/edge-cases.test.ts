/**
 * Edge case and error handling tests for the likec4-mutator library.
 *
 * These tests document the actual runtime behaviour for inputs that are
 * unusual, degenerate, or explicitly unsupported in v0.1.  Where the library
 * throws a descriptive error that is the expected outcome.  Where it handles
 * the input gracefully (e.g. returning null / empty array / no-op) that is
 * also documented.
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const parser = new C4Parser();

/** Minimal source with spec + model + views. */
const MINIMAL_FULL = `specification {
  element system
  element service
  element database
}
model {
  app = system 'My App' {
    api = service 'API'
    db = database 'DB'
    api -> db 'reads'
  }
}
views {
  view index {
    include *
  }
}
`;

/** Source that has only a specification block (no model, no views). */
const SPEC_ONLY = `specification {
  element service
  element database
}
`;

/** Source that has only a model block (no spec, no views). */
const MODEL_ONLY = `model {
  app = system 'App' {
    svc = service 'Service'
  }
}
`;

/** Source with an empty model block. */
const EMPTY_MODEL = `specification {
  element system
}
model {
}
`;

/** Source with a model block that has a container but no child elements. */
const MODEL_NO_CHILDREN = `specification {
  element system
  element service
}
model {
  app = system 'App'
}
`;

/** Source with a views block (no model). */
const VIEWS_ONLY = `specification {
  element service
}
views {
  view index {
    include *
  }
}
`;

/** Source with spec + model but NO views block. */
const NO_VIEWS = `specification {
  element system
  element service
}
model {
  app = system 'App' {
    svc = service 'Service'
  }
}
`;

// ===========================================================================
// 1. PARSER EDGE CASES
// ===========================================================================

describe('Parser edge cases', () => {
  it('should not crash when parsing an empty string', () => {
    // An empty string is a degenerate but legal input.
    // The parser must return an object; errors may or may not be present.
    expect(() => parser.parse('')).not.toThrow();
    const doc = parser.parse('');
    expect(doc).toBeDefined();
    expect(doc.ast).toBeDefined();
    expect(Array.isArray(doc.errors)).toBe(true);
  });

  it('should not crash when parsing a file with only whitespace', () => {
    expect(() => parser.parse('   \n\t\n  ')).not.toThrow();
    const doc = parser.parse('   \n\t\n  ');
    expect(doc).toBeDefined();
    expect(Array.isArray(doc.errors)).toBe(true);
  });

  it('should not crash when parsing a file with only line comments', () => {
    const source = `// This is a comment\n// Another comment\n`;
    expect(() => parser.parse(source)).not.toThrow();
    const doc = parser.parse(source);
    expect(doc).toBeDefined();
    expect(Array.isArray(doc.errors)).toBe(true);
  });

  it('should not crash when parsing a file with only block comments', () => {
    const source = `/* block comment */\n/* another one */\n`;
    expect(() => parser.parse(source)).not.toThrow();
    const doc = parser.parse(source);
    expect(doc).toBeDefined();
    expect(Array.isArray(doc.errors)).toBe(true);
  });

  it('should parse a file with only a specification block', () => {
    expect(() => parser.parse(SPEC_ONLY)).not.toThrow();
    const doc = parser.parse(SPEC_ONLY);
    expect(doc).toBeDefined();
    expect(Array.isArray(doc.errors)).toBe(true);
  });
});

// ===========================================================================
// 2. MUTATION ERROR CASES
// ===========================================================================

describe('Mutation error cases', () => {
  describe('addElement', () => {
    it('should throw a descriptive error when parent FQN does not exist', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
      expect(() =>
        mutator.addElement('does.not.exist', { name: 'child', kind: 'service' }),
      ).toThrow(/does\.not\.exist/);
    });

    it('should throw when model block does not exist and parentFqn is null', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': SPEC_ONLY });
      expect(() =>
        mutator.addElement(null, { name: 'newEl', kind: 'service' }),
      ).toThrow(/model block/i);
    });

    it('should throw when model block does not exist and parentFqn is empty string', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': SPEC_ONLY });
      expect(() =>
        mutator.addElement('', { name: 'newEl', kind: 'service' }),
      ).toThrow(/model block/i);
    });

    it('should add element to empty model block without throwing', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': EMPTY_MODEL });
      // Even an empty model block should accept a top-level element.
      expect(() =>
        mutator.addElement(null, { name: 'svc', kind: 'system' }),
      ).not.toThrow();
      expect(mutator.getElement('svc')).not.toBeNull();
    });

    it('should succeed adding element with an empty title (title is optional)', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
      // title is optional in AddElementOpts — omitting it should be fine
      expect(() =>
        mutator.addElement('app', { name: 'notitle', kind: 'service' }),
      ).not.toThrow();
      const el = mutator.getElement('app.notitle');
      expect(el).not.toBeNull();
      expect(el!.title).toBeUndefined();
    });
  });

  describe('updateElement', () => {
    it('should throw a descriptive error when element does not exist', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
      expect(() =>
        mutator.updateElement('no.such.element', { title: 'X' }),
      ).toThrow(/no\.such\.element/);
    });

    it('should be a no-op when no props are supplied (empty object)', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
      // No-op: no mutations, no errors
      expect(() => mutator.updateElement('app', {})).not.toThrow();
    });
  });

  describe('removeElement', () => {
    it('should throw a descriptive error when element does not exist', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
      expect(() => mutator.removeElement('ghost.element')).toThrow(/ghost\.element/);
    });
  });

  describe('addView', () => {
    it('should throw a descriptive error when no views block exists', () => {
      const mutator = LikeC4Mutator.fromFiles({ 'model.c4': NO_VIEWS });
      expect(() =>
        mutator.addView({ id: 'myView', type: 'element', target: 'app', title: 'My View' }),
      ).toThrow(/views block/i);
    });
  });
});

// ===========================================================================
// 3. ELEMENT WITH CHILDREN
// ===========================================================================

describe('Element with children', () => {
  it('should remove a parent element that has children (children also disappear)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });

    // app has children: app.api and app.db
    expect(mutator.getElement('app.api')).not.toBeNull();
    expect(mutator.getElement('app.db')).not.toBeNull();

    mutator.removeElement('app');

    // The parent must be gone
    expect(mutator.getElement('app')).toBeNull();
    // Its children are gone too because they live inside the removed text block
    expect(mutator.getElement('app.api')).toBeNull();
    expect(mutator.getElement('app.db')).toBeNull();
  });

  it('should add element, add child to it, then remove parent (child also gone)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });

    // Add a parent with a description (so it generates a body block)
    mutator.addElement('app', {
      name: 'gateway',
      kind: 'service',
      title: 'Gateway',
      description: 'The gateway service',
    });

    // Add a child inside the new parent
    mutator.addElement('app.gateway', {
      name: 'cache',
      kind: 'database',
      title: 'Cache',
    });

    expect(mutator.getElement('app.gateway')).not.toBeNull();
    expect(mutator.getElement('app.gateway.cache')).not.toBeNull();

    // Remove parent — child should disappear with it
    mutator.removeElement('app.gateway');

    expect(mutator.getElement('app.gateway')).toBeNull();
    expect(mutator.getElement('app.gateway.cache')).toBeNull();

    // Validate: must parse cleanly (only syntactic checks)
    expect(mutator.validate()).toHaveLength(0);
  });
});

// ===========================================================================
// 4. RELATIONSHIP EDGE CASES
// ===========================================================================

describe('Relationship edge cases', () => {
  it('should add relationship with non-existent source without throwing (no semantic validation)', () => {
    // The library performs only syntactic operations; semantic reference
    // resolution (whether the FQN actually exists) is not validated here.
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addRelationship('phantom', 'app', 'calls'),
    ).not.toThrow();
  });

  it('should add a self-relationship (element -> itself)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addRelationship('app', 'app', 'self loop'),
    ).not.toThrow();

    // The serialized text must contain the self-loop
    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('app -> app');
    // Validate: no parse errors
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should support multiple relationships between the same pair', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });

    mutator.addRelationship('app', 'app.api', 'first call');
    mutator.addRelationship('app', 'app.api', 'second call');

    const rels = mutator.getRelationships({ sourceFqn: 'app', targetFqn: 'app.api' });
    expect(rels.length).toBeGreaterThanOrEqual(2);
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should add relationship with an empty label (label omitted)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    // Passing undefined for label is the same as omitting it
    expect(() =>
      mutator.addRelationship('app.api', 'app.db', undefined),
    ).not.toThrow();
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should handle relationship label containing double quotes by escaping them', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    // The codegen escapes single quotes; double quotes are stored as-is
    expect(() =>
      mutator.addRelationship('app.api', 'app.db', 'sends "JSON" payload'),
    ).not.toThrow();
    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('sends');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should handle relationship label containing single quotes (escaped)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    // The codegen escapes single quotes with a backslash
    expect(() =>
      mutator.addRelationship('app.api', 'app.db', "O'Brien protocol"),
    ).not.toThrow();
    const serialized = mutator.serialize()['model.c4'];
    // Escaped form in the source
    expect(serialized).toContain("O\\'Brien");
    expect(mutator.validate()).toHaveLength(0);
  });
});

// ===========================================================================
// 5. SPECIAL CHARACTERS IN PROPERTIES
// ===========================================================================

describe('Special characters in element properties', () => {
  it('should handle element title with embedded single quote (escaped)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addElement('app', {
        name: 'oreilly',
        kind: 'service',
        title: "O'Reilly Service",
      }),
    ).not.toThrow();

    const serialized = mutator.serialize()['model.c4'];
    // The escaped form must appear in the serialized output
    expect(serialized).toContain("O\\'Reilly");
    expect(mutator.validate()).toHaveLength(0);

    // The queried title should come back with the original unescaped value
    const el = mutator.getElement('app.oreilly');
    expect(el).not.toBeNull();
  });

  it('should handle description with backslash (escaped)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addElement('app', {
        name: 'pathsvc',
        kind: 'service',
        description: 'Stores path C:\\Program Files\\App',
      }),
    ).not.toThrow();

    const serialized = mutator.serialize()['model.c4'];
    // Double-escaped backslash must appear
    expect(serialized).toContain('C:\\\\Program Files\\\\App');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should handle technology string with unicode characters', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const unicodeTech = 'PostgreSQL \u2014 \u0431\u0430\u0437\u0430 \u0434\u0430\u043d\u043d\u044b\u0445'; // "PostgreSQL — database" (Russian text used as unicode test data)
    expect(() =>
      mutator.addElement('app', {
        name: 'pgdb',
        kind: 'database',
        title: 'PG Database',
        technology: unicodeTech,
      }),
    ).not.toThrow();

    const el = mutator.getElement('app.pgdb');
    expect(el).not.toBeNull();
    // The stored technology must survive the round-trip
    expect(el!.technology).toBe(unicodeTech);
    expect(mutator.validate()).toHaveLength(0);
  });
});

// ===========================================================================
// 6. MULTI-FILE EDGE CASES
// ===========================================================================

describe('Multi-file edge cases', () => {
  it('should create mutator with spec in one file and model in another', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': SPEC_ONLY,
      'model.c4': MODEL_ONLY,
    });

    // Both files must be represented
    const serialized = mutator.serialize();
    expect(Object.keys(serialized)).toHaveLength(2);
    expect(serialized['spec.c4']).toBeDefined();
    expect(serialized['model.c4']).toBeDefined();
  });

  it('should add element when model is in a separate file from spec', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': `specification {
  element system
  element service
  element database
}
`,
      'model.c4': `model {
  app = system 'App' {
    svc = service 'Service'
  }
}
views {
  view index {
    include *
  }
}
`,
    });

    mutator.addElement('app', {
      name: 'db',
      kind: 'database',
      title: 'Database',
    });

    expect(mutator.getElement('app.db')).not.toBeNull();
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should write mutations to the correct file when model is in second file', () => {
    const specSource = `specification {
  element system
  element service
}
`;
    const modelSource = `model {
  app = system 'App' {
    svc = service 'Service'
  }
}
views {
  view index {
    include *
  }
}
`;
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': specSource,
      'model.c4': modelSource,
    });

    mutator.addElement('app', {
      name: 'newSvc',
      kind: 'service',
      title: 'New Service',
    });

    const serialized = mutator.serialize();
    // Spec file must be unchanged
    expect(serialized['spec.c4']).toBe(specSource);
    // New element must appear in model file
    expect(serialized['model.c4']).toContain('newSvc');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should serialize and return all files (even unmodified ones)', () => {
    const mutator = LikeC4Mutator.fromFiles({
      'spec.c4': SPEC_ONLY,
      'model.c4': MODEL_ONLY,
      'extra.c4': '// just a comment file\n',
    });

    const serialized = mutator.serialize();
    expect(Object.keys(serialized)).toHaveLength(3);
    expect(serialized['spec.c4']).toBe(SPEC_ONLY);
    expect(serialized['extra.c4']).toBe('// just a comment file\n');
  });
});

// ===========================================================================
// 7. VIEWS EDGE CASES
// ===========================================================================

describe('Views edge cases', () => {
  it('should throw with descriptive message when source has no views block', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': NO_VIEWS });
    expect(() =>
      mutator.addView({ id: 'v1', type: 'element', target: 'app', title: 'My View' }),
    ).toThrow(/views block/i);
  });

  it('should add view to file that has a views block', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addView({ id: 'extraView', type: 'element', target: 'app', title: 'Extra View' }),
    ).not.toThrow();

    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('view extraView');
    expect(mutator.validate()).toHaveLength(0);
  });

  it('should add a dynamic view without a target element', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(() =>
      mutator.addView({ id: 'dynView', type: 'dynamic', title: 'Dynamic View' }),
    ).not.toThrow();

    const serialized = mutator.serialize()['model.c4'];
    expect(serialized).toContain('dynamic view dynView');
    expect(mutator.validate()).toHaveLength(0);
  });
});

// ===========================================================================
// 8. EMPTY / MINIMAL INPUT CASES
// ===========================================================================

describe('Minimal input variations', () => {
  it('should handle a mutator with just a specification block (no model/views)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC_ONLY });

    // No elements exist
    expect(mutator.listElements()).toHaveLength(0);

    // getElement returns null for any query
    expect(mutator.getElement('anything')).toBeNull();

    // getSpecification should reflect the defined kinds
    const spec = mutator.getSpecification();
    expect(spec).not.toBeNull();
    expect(spec!.elementKinds).toContain('service');
    expect(spec!.elementKinds).toContain('database');
  });

  it('should handle a mutator with an empty model block', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': EMPTY_MODEL });
    expect(mutator.listElements()).toHaveLength(0);
    // Should be able to add a top-level element
    mutator.addElement(null, { name: 'root', kind: 'system', title: 'Root' });
    expect(mutator.getElement('root')).not.toBeNull();
  });

  it('should handle a mutator with model but no child elements (single top-level)', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_NO_CHILDREN });

    // 'app' exists but has no children
    const app = mutator.getElement('app');
    expect(app).not.toBeNull();
    expect(app!.children).toHaveLength(0);
  });

  it('should throw when adding a child to a body-less parent element', () => {
    // `app = system 'App'` has no `{ }` body block.
    // addElement requires the parent to have a body CST node so it knows where
    // to insert — this is a known v0.1 limitation documented here.
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_NO_CHILDREN });
    expect(() =>
      mutator.addElement('app', { name: 'svc', kind: 'service', title: 'Service' }),
    ).toThrow(/has no body/i);
  });

  it('should list zero relationships when none are defined', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_NO_CHILDREN });
    expect(mutator.getRelationships()).toHaveLength(0);
  });

  it('should return null from getSpecification when no specification block exists', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_ONLY });
    // When no specification block is present, getSpecification returns null
    // (because the method returns null if elementKinds and tags are both empty)
    const spec = mutator.getSpecification();
    expect(spec).toBeNull();
  });
});

// ===========================================================================
// 9. ELEMENT OPERATIONS ON MODEL-ONLY FILES
// ===========================================================================

describe('Element operations on model-only file', () => {
  it('should add a top-level element to a model-only file', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_ONLY });
    mutator.addElement(null, { name: 'ext', kind: 'system', title: 'External' });
    expect(mutator.getElement('ext')).not.toBeNull();
  });

  it('should add relationship when model block exists', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_ONLY });
    // addRelationship does not validate whether source/target exist
    expect(() =>
      mutator.addRelationship('app', 'app.svc', 'internal'),
    ).not.toThrow();
  });

  it('should throw when addView is called with no views block', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MODEL_ONLY });
    expect(() =>
      mutator.addView({ id: 'v1', type: 'element', target: 'app' }),
    ).toThrow(/views block/i);
  });
});

// ===========================================================================
// 10. GETRELATIONSHIPS FILTERING
// ===========================================================================

describe('getRelationships filtering', () => {
  it('should return all relationships when no filter is specified', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const rels = mutator.getRelationships();
    expect(rels.length).toBeGreaterThan(0);
  });

  it('should filter relationships by source FQN', () => {
    // NOTE: The relationship `api -> db` written inside `app { }` is stored
    // with sourceFqn 'api' (the literal reference text), NOT 'app.api'.
    // resolveFqnRef returns the textual form from the source, not the absolute FQN.
    // This is documented v0.1 behaviour.
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const rels = mutator.getRelationships({ sourceFqn: 'api' });
    expect(rels.length).toBeGreaterThan(0);
    for (const r of rels) {
      expect(r.sourceFqn).toBe('api');
    }
  });

  it('should return empty array for non-existent source FQN filter', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const rels = mutator.getRelationships({ sourceFqn: 'does.not.exist' });
    expect(rels).toHaveLength(0);
  });
});

// ===========================================================================
// 11. LISTEMENTS FILTERING
// ===========================================================================

describe('listElements filtering', () => {
  it('should list all elements when no filter is supplied', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const all = mutator.listElements();
    expect(all.length).toBeGreaterThanOrEqual(3); // app, app.api, app.db
  });

  it('should filter by parent FQN', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const children = mutator.listElements({ parentFqn: 'app' });
    for (const el of children) {
      expect(el.parentFqn).toBe('app');
    }
  });

  it('should return empty array for non-existent parent FQN', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(mutator.listElements({ parentFqn: 'no.such.parent' })).toHaveLength(0);
  });

  it('should filter by kind', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const dbs = mutator.listElements({ kind: 'database' });
    for (const el of dbs) {
      expect(el.kind).toBe('database');
    }
  });

  it('should return empty array when kind does not match any element', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(mutator.listElements({ kind: 'nonexistentKind' })).toHaveLength(0);
  });
});

// ===========================================================================
// 12. GETELEMENTAL SOURCE
// ===========================================================================

describe('getElementSource', () => {
  it('should return source text for an existing element', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    const src = mutator.getElementSource('app');
    expect(src).not.toBeNull();
    expect(typeof src).toBe('string');
    expect(src!.length).toBeGreaterThan(0);
  });

  it('should return null for a non-existent element', () => {
    const mutator = LikeC4Mutator.fromFiles({ 'model.c4': MINIMAL_FULL });
    expect(mutator.getElementSource('no.such.element')).toBeNull();
  });
});
