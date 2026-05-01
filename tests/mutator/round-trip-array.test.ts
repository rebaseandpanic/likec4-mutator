import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

describe('round-trip: array metadata formatting preservation', () => {
  it('preserves multi-line array formatting for keys not touched by the patch', () => {
    const source = `specification {
  element service
}
model {
  app = service 'App' {
    metadata {
      keywords [
        'first',
        'second',
        'third'
      ]
      owners ['alice', 'bob']
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
    // Patch only owners — keywords (multi-line) should be preserved verbatim.
    m.updateElement('app', { metadata: { owners: ['alice'] } });
    const updated = m.serialize()['model.c4'];
    expect(updated).toContain("'first'");
    expect(updated).toContain("'second'");
    expect(updated).toContain("'third'");
    // Keep multi-line formatting (newline-separated entries).
    expect(updated).toMatch(/keywords\s*\[\s*\n[\s\S]*'first'[\s\S]*'second'[\s\S]*'third'[\s\S]*\]/);
    expect(m.validate()).toHaveLength(0);
  });

  it('preserves inline-array formatting for keys not touched by the patch', () => {
    const source = `specification {
  element service
}
model {
  app = service 'App' {
    metadata {
      owners ['alice', 'bob']
      single 'plain'
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
    // Patch only single, leave owners untouched.  The inline `['alice', 'bob']`
    // form must be preserved verbatim.
    m.updateElement('app', { metadata: { single: 'updated' } });
    const updated = m.serialize()['model.c4'];
    expect(updated).toContain("owners ['alice', 'bob']");
    expect(updated).toContain("single 'updated'");
    expect(m.validate()).toHaveLength(0);
  });

  it("preserves escapes (' and backslash) on round-trip when key is preserved", () => {
    const source = `specification {
  element service
}
model {
  app = service 'App' {
    metadata {
      tricky ['has \\'quote', 'has\\\\backslash']
      other 'plain'
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
    // Verify read.
    const el = m.getElement('app');
    expect(el!.metadata!.tricky).toEqual(["has 'quote", 'has\\backslash']);

    // Patch only `other`; `tricky` array must be preserved verbatim from the
    // CST source so that escapes round-trip.
    m.updateElement('app', { metadata: { other: 'changed' } });
    const updated = m.serialize()['model.c4'];
    expect(updated).toContain("tricky ['has \\'quote', 'has\\\\backslash']");
    expect(updated).toContain("other 'changed'");
    expect(m.validate()).toHaveLength(0);
  });
});
