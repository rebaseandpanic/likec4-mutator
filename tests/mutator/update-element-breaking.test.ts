import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

describe('updateElement — v0.4.0 BREAKING semantics', () => {
  it('tags REPLACE: existing tags are removed and patched tags are written', () => {
    const source = `specification {
  element service
  tag internal
  tag deprecated
}
model {
  app = service 'App' {
    #internal
    description 'has tag'
  }
}
views {
  view idx {
    include *
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.updateElement('app', { tags: ['deprecated'] });
    const src = m.serialize()['model.c4'];
    expect(src).toContain('#deprecated');
    expect(src).not.toContain('#internal');
    expect(m.validate()).toHaveLength(0);
  });

  it('style MERGE per-field: untouched fields are preserved', () => {
    const source = `specification {
  element service
}
model {
  app = service 'App' {
    style {
      color blue
      shape browser
      border solid
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
    m.updateElement('app', { style: { color: 'red' } });
    const src = m.serialize()['model.c4'];
    // Patched
    expect(src).toContain('color red');
    expect(src).not.toContain('color blue');
    // Preserved
    expect(src).toContain('shape browser');
    expect(src).toContain('border solid');
    expect(m.validate()).toHaveLength(0);
  });

  it('metadata null-deletion removes a key, others are preserved', () => {
    const source = `specification {
  element service
}
model {
  app = service 'App' {
    metadata {
      owner 'alpha'
      env 'prod'
      version 'v1'
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
    m.updateElement('app', { metadata: { env: null } });
    const src = m.serialize()['model.c4'];
    expect(src).toContain("owner 'alpha'");
    expect(src).toContain("version 'v1'");
    expect(src).not.toContain("env 'prod'");
    expect(m.validate()).toHaveLength(0);
  });

  it('combines body-creation edits when element has no body and patch touches multiple fields', () => {
    // Element `bare = service` has no body block.  Patch contains description,
    // technology, tags, metadata — four body-targeting fields.  Each was
    // previously emitting its own ` { ... } ` body-creation edit at cst.end,
    // producing multiple adjacent body blocks that the parser would reject.
    // The combined-insert path must emit exactly ONE body block.
    const source = `specification {
  element service
  tag t1
}
model {
  bare = service 'Bare'
}
views {
  view idx {
    include *
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.updateElement('bare', {
      description: 'd',
      technology: 't',
      tags: ['t1'],
      metadata: { owner: 'team' },
    });
    const src = m.serialize()['model.c4'];
    // Exactly one body block right after `bare = service 'Bare'`.
    const bodyMatches = src.match(/bare\s*=\s*service\s*'Bare'\s*\{/g) ?? [];
    expect(bodyMatches).toHaveLength(1);
    // All patched fields landed inside that single block.
    expect(src).toContain('#t1');
    expect(src).toContain("description 'd'");
    expect(src).toContain("technology 't'");
    expect(src).toContain("owner 'team'");
    // No corruption.
    expect(m.validate()).toHaveLength(0);
  });
});
