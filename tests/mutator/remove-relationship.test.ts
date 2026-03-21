/**
 * Tests for removeRelationship at the mutator level (Task 5) and
 * addRelationshipEdit / removeRelationshipEdit at the edit level (Task 6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';
import { applyEdits } from '../../src/mutator/text-edit.js';
import { addRelationshipEdit, removeRelationshipEdit } from '../../src/mutator/relationship-ops.js';

const parser = new C4Parser();

function readFixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', 'fixtures', 'minimal', name), 'utf-8');
}

function parseAndVerify(source: string) {
  const doc = parser.parse(source);
  expect(doc.errors, `parse errors: ${doc.errors.map((e) => e.message).join(', ')}`).toHaveLength(0);
  return doc;
}

function makeMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'model.c4': readFixture('model.c4') });
}

// ---------------------------------------------------------------------------
// Task 5: removeRelationship at the mutator facade level
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.removeRelationship', () => {
  it('should remove an existing relationship so it is no longer queryable', () => {
    const m = makeMutator();

    // The fixture has api -> db nested inside app — the source FQN as stored
    // by the parser is the $refText of the FqnRef, which is 'api' (not 'app.api').
    // The target is 'db' (not 'app.db').
    m.removeRelationship('api', 'db');

    const rels = m.getRelationships();
    const removed = rels.find((r) => r.sourceFqn === 'api' && r.targetFqn === 'db');
    expect(removed).toBeUndefined();
  });

  it('should throw for a non-existent relationship', () => {
    const m = makeMutator();
    expect(() => m.removeRelationship('nonexistent', 'also.nonexistent')).toThrow();
  });

  it('should leave existing elements intact after removing a relationship', () => {
    const m = makeMutator();
    m.removeRelationship('api', 'db');

    expect(m.getElement('app')).not.toBeNull();
    expect(m.getElement('app.api')).not.toBeNull();
    expect(m.getElement('app.db')).not.toBeNull();
  });

  it('should produce a parse-error-free document after removing a relationship', () => {
    const m = makeMutator();
    m.removeRelationship('api', 'db');

    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 6: addRelationshipEdit and removeRelationshipEdit at edit level
// ---------------------------------------------------------------------------

describe('addRelationshipEdit', () => {
  it('should insert a relationship at model level that is queryable after apply', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addRelationshipEdit(doc, 'app', 'external');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const rels = query.getRelationships();
    const added = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'external');
    expect(added).toBeDefined();
  });

  it('should insert a relationship with a label', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addRelationshipEdit(doc, 'app', 'external', 'depends on');
    const updated = applyEdits(source, [edit]);

    expect(updated).toContain("app -> external 'depends on'");
  });

  it('should produce a parse-error-free document after adding a relationship', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addRelationshipEdit(doc, 'app', 'external');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parser.parse(updated);
    expect(updatedDoc.errors).toHaveLength(0);
  });

  it('should throw when the document has no model block', () => {
    const source = `specification {
  element system
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parser.parse(source);
    expect(() => addRelationshipEdit(doc, 'a', 'b')).toThrow('No model block found');
  });
});

describe('removeRelationshipEdit', () => {
  it('should remove the targeted relationship and no other', () => {
    // Build a source that has two relationships at model level so we can
    // confirm only the intended one is removed.
    const source = `specification {
  element system
  element service
}
model {
  app = system 'App'
  ext = system 'External'
  backup = system 'Backup'
  app -> ext 'uses'
  app -> backup 'syncs'
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    const edit = removeRelationshipEdit(doc, 'app', 'ext');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const rels = query.getRelationships();
    const removed = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'ext');
    const kept = rels.find((r) => r.sourceFqn === 'app' && r.targetFqn === 'backup');

    expect(removed).toBeUndefined();
    expect(kept).toBeDefined();
  });

  it('should use exact matching — partial suffix must not match a different relationship', () => {
    // 'backup.api -> backup.db' must not be removed when we ask for 'api -> db'
    const source = `specification {
  element system
  element service
  element database
}
model {
  backup = system 'Backup' {
    api = service 'API'
    db = database 'DB'
    api -> db 'internal'
  }
  app = system 'App' {
    api = service 'API'
    db = database 'DB'
    api -> db 'reads/writes'
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    // Remove the api -> db relationship.  Both elements have one, so after the
    // edit exactly one should remain (the first match is consumed).
    const edit = removeRelationshipEdit(doc, 'api', 'db');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const rels = query.getRelationships();
    // One of the two 'api -> db' relationships has been removed; one survives
    const remaining = rels.filter((r) => r.sourceFqn === 'api' && r.targetFqn === 'db');
    expect(remaining).toHaveLength(1);
  });

  it('should throw when the relationship does not exist', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    expect(() => removeRelationshipEdit(doc, 'ghost', 'phantom')).toThrow(
      "Relationship 'ghost -> phantom' not found",
    );
  });

  it('should produce a parse-error-free document after removal', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = removeRelationshipEdit(doc, 'api', 'db');
    const updated = applyEdits(source, [edit]);
    expect(parser.parse(updated).errors).toHaveLength(0);
  });
});
