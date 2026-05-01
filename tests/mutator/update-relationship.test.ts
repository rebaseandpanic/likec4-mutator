import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const baseSource = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  c = service 'C'
  a -> b 'calls' {
    description 'old desc'
    technology 'HTTP'
    metadata {
      owner 'alpha'
    }
  }
}
views {
  view idx {
    include *
  }
}
`;

function newMutator(src: string = baseSource): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'model.c4': src });
}

describe('LikeC4Mutator.updateRelationship', () => {
  it('updates a single metadata key (merge upsert)', () => {
    const m = newMutator();
    m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { owner: 'beta' } });
    const src = m.serialize()['model.c4'];
    expect(src).toContain("owner 'beta'");
    expect(src).not.toContain("owner 'alpha'");
    expect(m.validate()).toHaveLength(0);
  });

  it('merge metadata: preserves keys not in patch', () => {
    const m = newMutator();
    m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { region: 'eu' } });
    const src = m.serialize()['model.c4'];
    expect(src).toContain("owner 'alpha'");
    expect(src).toContain("region 'eu'");
    expect(m.validate()).toHaveLength(0);
  });

  it('null-deletion removes a metadata key', () => {
    const m = newMutator();
    m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { owner: null } });
    const src = m.serialize()['model.c4'];
    expect(src).not.toContain("owner 'alpha'");
    // Block should be removed entirely once empty.
    expect(src).not.toMatch(/metadata\s*\{\s*\}/);
    expect(m.validate()).toHaveLength(0);
  });

  it('throws when no relationship matches', () => {
    const m = newMutator();
    expect(() =>
      m.updateRelationship({ source: 'a', target: 'c' }, { description: 'x' }),
    ).toThrow(/Relationship not found.*source=a.*target=c/);
  });

  it('throws when multiple relationships match without disambiguators', () => {
    const ambiguous = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'first'
  a -> b 'second'
}
views {
  view idx {
    include *
  }
}
`;
    const m = newMutator(ambiguous);
    expect(() => m.updateRelationship({ source: 'a', target: 'b' }, { description: 'x' })).toThrow(
      /Multiple relationships match/,
    );
  });

  it('disambiguates via matchTitle', () => {
    const ambiguous = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'first'
  a -> b 'second'
}
views {
  view idx {
    include *
  }
}
`;
    const m = newMutator(ambiguous);
    m.updateRelationship(
      { source: 'a', target: 'b', matchTitle: 'first' },
      { technology: 'HTTPS' },
    );
    const src = m.serialize()['model.c4'];
    // Only the first relation should have technology.
    expect(src).toContain("technology 'HTTPS'");
    expect(m.validate()).toHaveLength(0);
  });

  it('disambiguates via matchKind when supplied (matcher passes through to compared kind)', () => {
    // Without spec relationship-kind support exercised in standalone parser,
    // we verify that supplying matchKind on a relation without a kind fails
    // (no relation matches), and not supplying it succeeds.
    const m = newMutator();
    expect(() =>
      m.updateRelationship(
        { source: 'a', target: 'b', matchKind: 'nonexistent' },
        { description: 'x' },
      ),
    ).toThrow(/Relationship not found.*kind=nonexistent/);
  });

  it('replaces label, description, technology', () => {
    const m = newMutator();
    m.updateRelationship(
      { source: 'a', target: 'b' },
      { label: 'invokes', description: 'new desc', technology: 'gRPC' },
    );
    const src = m.serialize()['model.c4'];
    expect(src).toContain("'invokes'");
    expect(src).toContain("description 'new desc'");
    expect(src).toContain("technology 'gRPC'");
    expect(src).not.toContain("'calls'");
    expect(src).not.toContain("description 'old desc'");
    expect(src).not.toContain("technology 'HTTP'");
    expect(m.validate()).toHaveLength(0);
  });

  it('tags REPLACE: writes patched tags', () => {
    const sourceWithTag = `specification {
  element service
  tag internal
  tag deprecated
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'calls' {
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
    const m = newMutator(sourceWithTag);
    m.updateRelationship({ source: 'a', target: 'b' }, { tags: ['deprecated'] });
    const src = m.serialize()['model.c4'];
    expect(src).toContain('#deprecated');
    expect(src).not.toContain('#internal');
    expect(m.validate()).toHaveLength(0);
  });

  it('tags=[] clears all tags', () => {
    const sourceWithTag = `specification {
  element service
  tag internal
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'calls' {
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
    const m = newMutator(sourceWithTag);
    m.updateRelationship({ source: 'a', target: 'b' }, { tags: [] });
    const src = m.serialize()['model.c4'];
    expect(src).not.toContain('#internal');
    expect(m.validate()).toHaveLength(0);
  });

  it('links REPLACE and links=[] clears all links', () => {
    const sourceWithLinks = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'calls' {
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
    const m = newMutator(sourceWithLinks);
    m.updateRelationship(
      { source: 'a', target: 'b' },
      { links: [{ url: 'https://new.example.com', label: 'New' }] },
    );
    let src = m.serialize()['model.c4'];
    expect(src).toContain("link https://new.example.com 'New'");
    expect(src).not.toContain('https://old.example.com');
    expect(src).not.toContain('https://old2.example.com');
    expect(m.validate()).toHaveLength(0);

    // Empty array clears.
    m.updateRelationship({ source: 'a', target: 'b' }, { links: [] });
    src = m.serialize()['model.c4'];
    const linkCount = (src.match(/\blink /g) || []).length;
    expect(linkCount).toBe(0);
    expect(m.validate()).toHaveLength(0);
  });

  it('throws on empty patch', () => {
    const m = newMutator();
    expect(() => m.updateRelationship({ source: 'a', target: 'b' }, {})).toThrow(
      /nothing to update/,
    );
  });

  it('throws on empty array in metadata patch', () => {
    const simple = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  a -> b 'calls'
}
views {
  view idx { include * }
}
`;
    const m = newMutator(simple);
    expect(() =>
      m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { x: [] } }),
    ).toThrow(/empty array not allowed/);
  });

  it('combines body-creation edits when relation has no body', () => {
    const noBody = `specification {
  element service
}
model {
  a = service 'A'
  b = service 'B'
  a -> b
}
views {
  view idx { include * }
}
`;
    const m = newMutator(noBody);
    m.updateRelationship(
      { source: 'a', target: 'b' },
      {
        description: 'd1',
        technology: 't1',
        tags: ['internal'],
        metadata: { owner: 'team' },
      },
    );
    const src = m.serialize()['model.c4'];
    // Exactly one body block must be created on the relation.
    const bodyOpenCount = (src.match(/a -> b\s*\{/g) || []).length;
    expect(bodyOpenCount).toBe(1);
    expect(src).toContain("description 'd1'");
    expect(src).toContain("technology 't1'");
    expect(src).toContain('#internal');
    expect(src).toContain("owner 'team'");
    expect(m.validate()).toHaveLength(0);
  });

  it('updates label on a kinded relationship', () => {
    const kindedSrc = `specification {
  element service
  relationship sync
}
model {
  a = service 'A'
  b = service 'B'
  a -[sync]-> b 'old'
}
views {
  view idx { include * }
}
`;
    const m = newMutator(kindedSrc);
    m.updateRelationship({ source: 'a', target: 'b', matchKind: 'sync' }, { label: 'new' });
    const src = m.serialize()['model.c4'];
    expect(src).toContain("'new'");
    expect(src).not.toContain("'old'");
    expect(m.validate()).toHaveLength(0);
  });
});
