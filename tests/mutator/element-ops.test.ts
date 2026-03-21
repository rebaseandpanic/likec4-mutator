import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { C4Parser } from '../../src/parser/parser.js';
import { C4Query } from '../../src/query/query.js';
import { applyEdits } from '../../src/mutator/text-edit.js';
import { addElementEdit, updateElementEdit, removeElementEdit } from '../../src/mutator/element-ops.js';

const parser = new C4Parser();

function readFixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', 'fixtures', 'minimal', name), 'utf-8');
}

function parseAndVerify(source: string) {
  const doc = parser.parse(source);
  expect(doc.errors, `parse errors: ${doc.errors.map((e) => e.message).join(', ')}`).toHaveLength(0);
  return doc;
}

describe('addElementEdit', () => {
  it('should add an element to a parent with existing children', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'cache',
      kind: 'service',
      title: 'Redis Cache',
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('app.cache');
    expect(el).not.toBeNull();
    expect(el!.name).toBe('cache');
    expect(el!.kind).toBe('service');
    expect(el!.title).toBe('Redis Cache');
    expect(el!.parentFqn).toBe('app');
  });

  it('should add a root-level element (model level) when parentFqn is null', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, null, {
      name: 'external',
      kind: 'system',
      title: 'External System',
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('external');
    expect(el).not.toBeNull();
    expect(el!.name).toBe('external');
    expect(el!.kind).toBe('system');
    expect(el!.parentFqn).toBeUndefined();
  });

  it('should add element with description and technology', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'worker',
      kind: 'service',
      title: 'Background Worker',
      description: 'Processes async jobs',
      technology: 'Node.js',
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('app.worker');
    expect(el).not.toBeNull();
    expect(el!.description).toBe('Processes async jobs');
    expect(el!.technology).toBe('Node.js');
  });

  it('should add an element to an initially empty parent body', () => {
    const source = `specification {
  element system
  element service
}
model {
  app = system 'App' {
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'svc',
      kind: 'service',
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('app.svc');
    expect(el).not.toBeNull();
    expect(el!.parentFqn).toBe('app');
  });

  it('should preserve existing children after adding a new one', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'cache',
      kind: 'service',
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    // Original children must still exist
    expect(query.getElement('app.api')).not.toBeNull();
    expect(query.getElement('app.db')).not.toBeNull();
    expect(query.getElement('app.cache')).not.toBeNull();
  });

  it('should throw for non-existent parent FQN', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    expect(() => addElementEdit(doc, 'nonexistent', { name: 'x', kind: 'service' })).toThrow();
  });

  it('should add element with tags and verify they appear in source', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'gateway',
      kind: 'service',
      title: 'API Gateway',
      tags: ['internal', 'backend'],
    });

    const updated = applyEdits(source, [edit]);
    parseAndVerify(updated);
    expect(updated).toContain('#internal');
    expect(updated).toContain('#backend');
  });

  it('should add element with links and verify they appear in source', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'queue',
      kind: 'service',
      links: [
        { url: 'https://example.com/docs', label: 'Docs' },
        { url: 'https://example.com/repo' },
      ],
    });

    const updated = applyEdits(source, [edit]);
    parseAndVerify(updated);
    expect(updated).toContain("link https://example.com/docs 'Docs'");
    expect(updated).toContain('link https://example.com/repo');
  });

  it('should add element with metadata and verify block appears in source', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'store',
      kind: 'service',
      metadata: { owner: 'platform-team', env: 'prod' },
    });

    const updated = applyEdits(source, [edit]);
    parseAndVerify(updated);
    expect(updated).toContain('metadata {');
    expect(updated).toContain("owner 'platform-team'");
    expect(updated).toContain("env 'prod'");
  });

  it('should add element with all extended fields and produce a valid document', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'full',
      kind: 'service',
      title: 'Full Service',
      description: 'Has everything',
      technology: 'Node.js',
      tags: ['internal'],
      links: [{ url: 'https://full.example.com', label: 'Home' }],
      metadata: { team: 'alpha' },
    });

    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('app.full');
    expect(el).not.toBeNull();
    expect(el!.description).toBe('Has everything');
    expect(el!.technology).toBe('Node.js');
    expect(updated).toContain('#internal');
    expect(updated).toContain("link https://full.example.com 'Home'");
    expect(updated).toContain('metadata {');
    expect(updated).toContain("team 'alpha'");
  });
});

describe('updateElementEdit', () => {
  it('should update an existing description in-place', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', { description: 'Updated description' });
    const updated = applyEdits(source, edits);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    const el = query.getElement('app.api');
    expect(el!.description).toBe('Updated description');
  });

  it('should update an existing technology in-place', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', { technology: 'Go' });
    const updated = applyEdits(source, edits);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('app.api')!.technology).toBe('Go');
  });

  it('should add a description when one does not exist', () => {
    const source = `specification {
  element system
}
model {
  ext = system 'External'
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'ext', { description: 'An external system' });
    const updated = applyEdits(source, edits);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('ext')!.description).toBe('An external system');
  });

  it('should update the element title', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app', { title: 'New Title' });
    const updated = applyEdits(source, edits);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('app')!.title).toBe('New Title');
  });

  it('should return empty edits array when no props provided', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', {});
    expect(edits).toHaveLength(0);
  });

  it('should throw for non-existent FQN', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    expect(() => updateElementEdit(doc, 'ghost', { title: 'x' })).toThrow();
  });

  it('should insert tags when tags are provided', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', { tags: ['deprecated', 'backend'] });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain('#deprecated');
    expect(updated).toContain('#backend');
  });

  it('should insert links when links are provided', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', {
      links: [{ url: 'https://api.example.com', label: 'API Docs' }],
    });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain("link https://api.example.com 'API Docs'");
  });

  it('should insert metadata block when metadata is provided', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', {
      metadata: { team: 'backend', sla: '99.9%' },
    });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain('metadata {');
    expect(updated).toContain("team 'backend'");
    expect(updated).toContain("sla '99.9%'");
  });

  it('should insert tags on element with no body block', () => {
    const source = `specification {
  element system
}
model {
  ext = system 'External'
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'ext', { tags: ['external'] });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain('#external');
  });
});

describe('removeElementEdit', () => {
  it('should remove a leaf element', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = removeElementEdit(doc, 'app.api');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('app.api')).toBeNull();
  });

  it('should keep sibling elements after removal', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = removeElementEdit(doc, 'app.api');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('app.db')).not.toBeNull();
    expect(query.getElement('app')).not.toBeNull();
  });

  it('should remove a root-level element', () => {
    const source = `specification {
  element system
}
model {
  ext = system 'External'
  app = system 'App'
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);

    const edit = removeElementEdit(doc, 'ext');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    expect(query.getElement('ext')).toBeNull();
    expect(query.getElement('app')).not.toBeNull();
  });

  it('should throw for non-existent FQN', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    expect(() => removeElementEdit(doc, 'ghost')).toThrow();
  });

  it('should produce valid parse output after removal', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = removeElementEdit(doc, 'app.db');
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parser.parse(updated);
    expect(updatedDoc.errors).toHaveLength(0);
  });
});
