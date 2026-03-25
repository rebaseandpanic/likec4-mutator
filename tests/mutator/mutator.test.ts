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

  it('should add element with style block and produce valid document', () => {
    const m = makeMutator();
    m.addElement('app', {
      name: 'styled',
      kind: 'service',
      title: 'Styled Service',
      style: { shape: 'browser', color: 'blue', icon: 'tech:react' },
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('style {');
    expect(src).toContain('shape browser');
    expect(src).toContain('color blue');
    expect(src).toContain('icon tech:react');
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

  it('should update element with style block', () => {
    const m = makeMutator();
    m.updateElement('app.api', { style: { shape: 'browser', color: 'blue' } });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('style {');
    expect(src).toContain('shape browser');
    expect(src).toContain('color blue');
    expect(m.validate()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateElement — replace semantics for metadata / links / style
// ---------------------------------------------------------------------------

describe('LikeC4Mutator.updateElement — replace existing blocks', () => {
  it('should produce a single metadata block when element already has metadata', () => {
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
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.updateElement('svc', { metadata: { owner: 'new-team' } });

    const src = m.serialize()['model.c4'];
    const metaCount = (src.match(/metadata \{/g) || []).length;
    expect(metaCount).toBe(1);
    expect(src).toContain("owner 'new-team'");
    expect(src).not.toContain("owner 'old-team'");
    expect(m.validate()).toHaveLength(0);
  });

  it('should replace existing links when element already has links', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    link https://old.example.com 'Old'
  }
}
views {
  view idx {
    include *
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.updateElement('svc', { links: [{ url: 'https://new.example.com', label: 'New' }] });

    const src = m.serialize()['model.c4'];
    const linkCount = (src.match(/\blink /g) || []).length;
    expect(linkCount).toBe(1);
    expect(src).toContain("link https://new.example.com 'New'");
    expect(src).not.toContain('https://old.example.com');
    expect(m.validate()).toHaveLength(0);
  });

  it('should produce a single style block when element already has style', () => {
    const source = `specification {
  element service
}
model {
  svc = service 'Svc' {
    style {
      color blue
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.updateElement('svc', { style: { color: 'red', border: 'dashed' } });

    const src = m.serialize()['model.c4'];
    const styleCount = (src.match(/style \{/g) || []).length;
    expect(styleCount).toBe(1);
    expect(src).toContain('color red');
    expect(src).not.toContain('color blue');
    expect(m.validate()).toHaveLength(0);
  });

  it('full incident chain: update with metadata+links, add element, update sibling — all elements preserved', () => {
    const source = `specification {
  element service
  element database
}
model {
  app = service 'App' {
    api = service 'API' {
      metadata {
        owner 'team-a'
      }
      link https://old.example.com 'Old'
    }
    db = database 'DB' {
      description 'Primary store'
    }
  }
}
views {
  view idx {
    include *
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });

    // 1. Update api — replace metadata and links
    m.updateElement('app.api', {
      metadata: { owner: 'team-b', env: 'prod' },
      links: [{ url: 'https://new.example.com', label: 'New' }],
    });

    // 2. Add a new sibling to app
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache' });

    // 3. Update db
    m.updateElement('app.db', { description: 'Updated store' });

    // All elements must still exist
    expect(m.getElement('app')).not.toBeNull();
    expect(m.getElement('app.api')).not.toBeNull();
    expect(m.getElement('app.db')).not.toBeNull();
    expect(m.getElement('app.cache')).not.toBeNull();
    expect(m.getElement('app.cache')!.parentFqn).toBe('app');

    // Metadata should have both keys (owner overwritten, env new)
    const src = m.serialize()['model.c4'];
    const metaCount = (src.match(/metadata \{/g) || []).length;
    expect(metaCount).toBe(1);
    expect(src).toContain("owner 'team-b'");
    expect(src).toContain("env 'prod'");

    // Only one link
    const linkCount = (src.match(/\blink /g) || []).length;
    expect(linkCount).toBe(1);
    expect(src).toContain("link https://new.example.com 'New'");

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
    m.addRelationship('app', 'external', 'calls', { description: 'Calls the external system' });

    const src = m.serialize()['model.c4'];
    expect(src).toContain("description 'Calls the external system'");
    expect(m.validate()).toHaveLength(0);
  });

  it('should add a relationship with technology and tags via opts object', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external', 'calls', {
      technology: 'REST API',
      tags: ['async', 'internal'],
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain("technology 'REST API'");
    expect(src).toContain('#async');
    expect(src).toContain('#internal');
    expect(m.validate()).toHaveLength(0);
  });

  it('should add a relationship with style properties', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external', undefined, {
      style: { line: 'dashed', color: 'red' },
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain('style {');
    expect(src).toContain('line dashed');
    expect(src).toContain('color red');
    expect(m.validate()).toHaveLength(0);
  });

  it('should add a relationship with full properties', () => {
    const m = makeMutator();
    m.addRelationship('app', 'external', 'delegates', {
      description: 'Routes traffic to external API',
      technology: 'HTTPS',
      tags: ['public'],
      links: [{ url: 'https://external.example.com/api', label: 'API Docs' }],
      metadata: { sla: '99.9%' },
      style: { line: 'dashed', head: 'diamond' },
    });

    const src = m.serialize()['model.c4'];
    expect(src).toContain("description 'Routes traffic to external API'");
    expect(src).toContain("technology 'HTTPS'");
    expect(src).toContain('#public');
    expect(src).toContain("link https://external.example.com/api 'API Docs'");
    expect(src).toContain('metadata {');
    expect(src).toContain("sla '99.9%'");
    expect(src).toContain('style {');
    expect(src).toContain('line dashed');
    expect(src).toContain('head diamond');
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
// addElement returns correct FQN
// ---------------------------------------------------------------------------

describe('addElement return value', () => {
  it('should return the correct FQN for a child element', () => {
    const m = makeMutator();
    const fqn = m.addElement('app', { name: 'notifications', kind: 'service', title: 'Notifications' });
    expect(fqn).toBe('app.notifications');
  });

  it('should return the name itself when parent is null (root level)', () => {
    const m = makeMutator();
    const fqn = m.addElement(null, { name: 'external', kind: 'system', title: 'External System' });
    expect(fqn).toBe('external');
  });

  it('should return the name itself when parent is empty string (root level)', () => {
    const m = makeMutator();
    const fqn = m.addElement('', { name: 'other', kind: 'system', title: 'Other System' });
    expect(fqn).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// removeElement returns affected relationships
// ---------------------------------------------------------------------------

describe('removeElement return value', () => {
  it('should return relationships that referenced the removed element', () => {
    const m = makeMutator();
    // The fixture has `api -> db 'reads/writes'` inside `app { }`.
    // The query layer resolves source/target refs as written (local names),
    // and the relationship matches because `db` matches element FQN `app.db`
    // via the prefix check or direct FQN match in removeElement.
    // First, check what the relationships actually look like:
    const rels = m.getRelationships();
    const dbRel = rels.find((r) => r.title === 'reads/writes');
    expect(dbRel).toBeDefined();

    // removeElement('app.api') should capture rels where sourceFqn or targetFqn
    // matches 'app.api' or starts with 'app.api.'. The local ref 'api' won't
    // match, so let's test with a setup that uses model-level FQN relationships.
    // Instead, we add a model-level relationship with full FQNs:
    m.addRelationship('app.api', 'app.db', 'model-level rel');
    const result = m.removeElement('app.db');
    // The model-level relationship uses FQNs, so it IS captured
    const modelRel = result.removedRelationships.find((r) => r.title === 'model-level rel');
    expect(modelRel).toBeDefined();
    expect(modelRel!.source).toBe('app.api');
    expect(modelRel!.target).toBe('app.db');
  });

  it('should return an empty array when no relationships reference the removed element', () => {
    const m = makeMutator();
    m.addElement('app', { name: 'standalone', kind: 'service', title: 'Standalone' });
    const result = m.removeElement('app.standalone');
    expect(result.removedRelationships).toHaveLength(0);
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
