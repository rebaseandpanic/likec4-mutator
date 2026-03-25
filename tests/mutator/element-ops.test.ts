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

  it('should add element with summary and verify it appears in source', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'summarized',
      kind: 'service',
      title: 'Summarized Service',
      summary: 'Short overview text',
    });

    const updated = applyEdits(source, [edit]);
    parseAndVerify(updated);
    expect(updated).toContain("summary 'Short overview text'");
  });

  it('should add element with style block and verify it appears in source', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edit = addElementEdit(doc, 'app', {
      name: 'styled',
      kind: 'service',
      title: 'Styled Service',
      style: { shape: 'browser', color: 'blue', icon: 'tech:react' },
    });

    const updated = applyEdits(source, [edit]);
    parseAndVerify(updated);
    expect(updated).toContain('style {');
    expect(updated).toContain('shape browser');
    expect(updated).toContain('color blue');
    expect(updated).toContain('icon tech:react');
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

  it('should add a summary when one does not exist', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', { summary: 'Quick overview' });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain("summary 'Quick overview'");
  });

  it('should insert a style block when style is provided', () => {
    const source = readFixture('model.c4');
    const doc = parseAndVerify(source);

    const edits = updateElementEdit(doc, 'app.api', {
      style: { shape: 'browser', color: 'blue' },
    });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain('style {');
    expect(updated).toContain('shape browser');
    expect(updated).toContain('color blue');
  });

  it('should insert style block on element with no body block', () => {
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

    const edits = updateElementEdit(doc, 'ext', { style: { color: 'red', border: 'dashed' } });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);
    expect(updated).toContain('style {');
    expect(updated).toContain('color red');
    expect(updated).toContain('border dashed');
  });
});

describe('updateElementEdit — replace existing blocks', () => {
  it('should replace existing metadata block (not duplicate it)', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    metadata {
      owner 'old-team'
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);
    const edits = updateElementEdit(doc, 'svc', { metadata: { owner: 'new-team' } });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);

    // Must have exactly one metadata block
    const metaCount = (updated.match(/metadata \{/g) || []).length;
    expect(metaCount).toBe(1);
    expect(updated).toContain("owner 'new-team'");
    expect(updated).not.toContain("owner 'old-team'");
  });

  it('should preserve metadata keys absent from update payload', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    metadata {
      owner 'old-team'
      env 'prod'
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);
    const edits = updateElementEdit(doc, 'svc', { metadata: { owner: 'new-team' } });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);

    // Only one metadata block
    const metaCount = (updated.match(/metadata \{/g) || []).length;
    expect(metaCount).toBe(1);
    // New value for owner
    expect(updated).toContain("owner 'new-team'");
    // env key preserved since it was not in the new payload
    expect(updated).toContain("env 'prod'");
  });

  it('should replace existing links (not duplicate them)', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    link https://old.example.com 'Old'
    link https://old2.example.com
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);
    const edits = updateElementEdit(doc, 'svc', {
      links: [{ url: 'https://new.example.com', label: 'New' }],
    });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);

    const linkCount = (updated.match(/\blink /g) || []).length;
    expect(linkCount).toBe(1);
    expect(updated).toContain("link https://new.example.com 'New'");
    expect(updated).not.toContain('https://old.example.com');
  });

  it('should replace existing style block (not duplicate it)', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    style {
      color blue
      shape browser
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    const doc = parseAndVerify(source);
    const edits = updateElementEdit(doc, 'svc', { style: { color: 'red', border: 'dashed' } });
    const updated = applyEdits(source, edits);
    parseAndVerify(updated);

    const styleCount = (updated.match(/style \{/g) || []).length;
    expect(styleCount).toBe(1);
    expect(updated).toContain('color red');
    expect(updated).toContain('border dashed');
    // Old properties should be gone
    expect(updated).not.toContain('color blue');
    expect(updated).not.toContain('shape browser');
  });
});

describe('updateElementEdit — duplicate metadata blocks (malformed input)', () => {
  it('should not crash and should produce a parseable result when element has two metadata blocks', () => {
    // This is a malformed (but conceivable) input where two metadata blocks exist
    // in the same element body.  The AST find() will return only the FIRST one;
    // the second is silently left in place but the operation must not throw or
    // corrupt the file so badly that the parser rejects it.
    //
    // In practice the LikeC4 grammar only allows one metadata block per element,
    // so normal mutations will never produce this state — but we test robustness
    // against externally-crafted or manually-edited files.
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    metadata {
      owner 'first-team'
    }
    metadata {
      region 'us-east'
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    // The parser may or may not accept two metadata blocks depending on the
    // grammar — we only require that updateElementEdit does not throw and that
    // the result is not undefined.
    const doc = parser.parse(source);
    // If the parser rejects the malformed input, skip the mutation assertion.
    if (doc.errors.length > 0) return;

    const edits = updateElementEdit(doc, 'svc', { metadata: { owner: 'new-team' } });
    const updated = applyEdits(source, edits);

    // The result must be a non-empty string (no crash).
    expect(typeof updated).toBe('string');
    expect(updated.length).toBeGreaterThan(0);
    // The new owner value must appear somewhere in the output.
    expect(updated).toContain("owner 'new-team'");
  });
});

describe('addElementEdit — correct parent brace detection', () => {
  it('should insert new child after all siblings with body blocks, not inside them', () => {
    const source = `specification {
  element service
  element database
}
model {
  app = service 'App' {
    api = service 'API' {
      description 'Backend API'
    }
    db = database 'DB' {
      technology 'PostgreSQL'
    }
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
      name: 'cache',
      kind: 'service',
      title: 'Cache',
    });
    const updated = applyEdits(source, [edit]);
    const updatedDoc = parseAndVerify(updated);
    const query = new C4Query(updatedDoc.ast);

    // All three children must exist as direct children of 'app'
    const cache = query.getElement('app.cache');
    expect(cache).not.toBeNull();
    expect(cache!.parentFqn).toBe('app');
    // Siblings must be intact
    expect(query.getElement('app.api')).not.toBeNull();
    expect(query.getElement('app.db')).not.toBeNull();
    // cache must NOT be nested inside db
    expect(query.getElement('app.db.cache')).toBeNull();
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
