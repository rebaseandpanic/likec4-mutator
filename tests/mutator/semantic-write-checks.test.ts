import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError, checkKind } from '../../src/mutator/write-checks.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import { C4Parser } from '../../src/parser/parser.js';
import { expectValidLikeC4, validateLikeC4 } from '../helpers/likec4-model.js';

/**
 * Writes LikeC4 would reject semantically are refused before anything is
 * written: unresolved endpoints (resolved as LikeC4 links them), self and
 * parent-child relationships, undeclared tags and element kinds.  Only the
 * values the call introduces are checked, so a workspace with unrelated
 * errors still accepts valid edits.
 */

const SPEC = `specification {
  element service
  relationship calls
  tag internal
}
`;

const MODEL = `${SPEC}model {
  app = service 'App' {
    api = service 'API'
    db = service 'DB'
    gateway = service 'Gateway' {
      cache = service 'Cache'
    }
  }
  app.api -> app.db 'reads'
}
views {
  view index {
    include *
  }
}
`;

function mutator(files: Record<string, string> = { 'model.c4': MODEL }): LikeC4Mutator {
  return LikeC4Mutator.fromFiles(files);
}

function expectRejected(m: LikeC4Mutator, field: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before);
  return error as InvalidWriteError;
}

describe('calls LikeC4 rejects on a valid model are refused', () => {
  it('the input is valid LikeC4', async () => {
    await expectValidLikeC4({ 'model.c4': MODEL });
  });

  it.each([
    { name: 'a parent-child relationship', field: 'target', write: (m: LikeC4Mutator) => m.addRelationship('app', 'app.api', 'calls') },
    { name: 'a child-parent relationship', field: 'target', write: (m: LikeC4Mutator) => m.addRelationship('app.gateway.cache', 'app') },
    { name: 'a self relationship', field: 'target', write: (m: LikeC4Mutator) => m.addRelationship('app.api', 'app.api', 'self') },
    { name: 'an unresolved target', field: 'target', write: (m: LikeC4Mutator) => m.addRelationship('app.api', 'missing', 'x') },
    { name: 'an unresolved source', field: 'source', write: (m: LikeC4Mutator) => m.addRelationship('app.missing', 'app.api') },
    {
      name: 'this at model level',
      field: 'source',
      write: (m: LikeC4Mutator) => m.addRelationship('this', 'app.api'),
    },
    {
      name: 'an undeclared tag on a new element',
      field: 'tags[0]',
      write: (m: LikeC4Mutator) => m.addElement('app', { name: 'x', kind: 'service', title: 'X', tags: ['undeclared'] }),
    },
    {
      name: 'an undeclared tag on an element update',
      field: 'tags[1]',
      write: (m: LikeC4Mutator) => m.updateElement('app.db', { tags: ['internal', '#undeclared'] }),
    },
    {
      name: 'an undeclared tag on a new relationship',
      field: 'tags[0]',
      write: (m: LikeC4Mutator) => m.addRelationship('app.db', 'app.api', 'x', { tags: ['undeclared'] }),
    },
    {
      name: 'an undeclared tag on a relationship update',
      field: 'tags[0]',
      write: (m: LikeC4Mutator) => m.updateRelationship({ source: 'app.api', target: 'app.db' }, { tags: ['undeclared'] }),
    },
    {
      name: 'an undeclared element kind',
      field: 'kind',
      write: (m: LikeC4Mutator) => m.addElement('app', { name: 'y', kind: 'nosuchkind', title: 'Y' }),
    },
    {
      name: 'a relationship kind used as an element kind',
      field: 'kind',
      write: (m: LikeC4Mutator) => m.addElement('app', { name: 'y', kind: 'calls', title: 'Y' }),
    },
    {
      name: 'a view of an unresolved element',
      field: 'target',
      write: (m: LikeC4Mutator) => m.addView({ id: 'v', type: 'element', target: 'app.missing' }),
    },
  ])('rejects $name', ({ field, write }) => {
    const m = mutator();
    const error = expectRejected(m, field, () => write(m));
    // A rejection that names no other construct carries no `related` key.
    expect(Object.hasOwn(error, 'related')).toBe(false);
  });

  it('writes the valid counterparts, which LikeC4 accepts', async () => {
    const m = mutator();
    m.addRelationship('app.db', 'app.api', 'replies', { tags: ['internal'] });
    m.addElement('app', { name: 'x', kind: 'service', title: 'X', tags: ['#internal'] });
    m.updateElement('app.db', { tags: ['internal'] });
    m.updateRelationship({ source: 'app.api', target: 'app.db' }, { tags: ['internal'] });
    m.addView({ id: 'gatewayView', type: 'element', target: 'app.gateway' });
    await expectValidLikeC4(m.serialize());
  });
});

describe('endpoints resolve the way LikeC4 links them', () => {
  it('rejects app.cache when LikeC4 links it to the unique descendant app.gateway.cache', () => {
    // `app.cache` is not a child of `app`, but `cache` is the only element of
    // that name below it, so LikeC4 links the reference to
    // `app.gateway.cache`: a parent-child relationship with the source.
    const m = mutator();
    const error = expectRejected(m, 'target', () => m.addRelationship('app.gateway', 'app.cache', 'reads'));
    expect(error.detail).toContain('app.gateway.cache');
  });

  it('writes app.cache once a direct child of that name exists', async () => {
    const m = mutator();
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Shared cache' });
    m.addRelationship('app.gateway', 'app.cache', 'reads');
    expect(m.getRelationships({ sourceFqn: 'app.gateway', targetFqn: 'app.cache' })).toHaveLength(1);
    await expectValidLikeC4(m.serialize());
  });

  it('writes names that resolve from the model block as unique descendants', async () => {
    const m = mutator();
    m.addRelationship('gateway', 'db', 'stores');
    expect(m.getRelationships({ sourceFqn: 'app.gateway', targetFqn: 'app.db' })).toHaveLength(1);
    await expectValidLikeC4(m.serialize());
  });

  it('rejects a name that is not unique below the model block', () => {
    const m = mutator({
      'model.c4': `${SPEC}model {\n  a = service {\n    api = service\n  }\n  b = service {\n    api = service\n  }\n}\n`,
    });
    expectRejected(m, 'source', () => m.addRelationship('api', 'b'));
  });

  it('resolves an endpoint declared in another loaded file', async () => {
    const files = { 'model.c4': MODEL, 'ext.c4': 'model {\n  partner = service \'Partner\'\n}\n' };
    const m = mutator(files);
    m.addRelationship('app.api', 'partner', 'calls');
    await expectValidLikeC4(m.serialize());
  });
});

describe('only problems the call introduces are rejected', () => {
  const BROKEN = `${SPEC}model {
  app = service 'App' {
    #undeclaredOld
    api = service 'API'
    db = service 'DB'
  }
  legacy = oldkind 'Legacy'
  app.api -> nowhere 'dangling'
}
views {
  view index {
    include *
  }
}
`;

  it('accepts valid writes into a workspace with unrelated LikeC4 errors and adds no error', async () => {
    const before = await validateLikeC4({ 'model.c4': BROKEN });
    expect(before.length).toBeGreaterThan(0);
    const m = mutator({ 'model.c4': BROKEN });
    m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache', tags: ['internal'] });
    m.addRelationship('app.api', 'app.cache', 'reads');
    m.updateElement('app.db', { tags: ['internal'] });
    m.addView({ id: 'appView', type: 'element', target: 'app' });
    const after = await validateLikeC4(m.serialize());
    const withoutLine = (errors: string[]): string[] => errors.map((e) => e.replace(/:\d+:/, ':')).sort();
    expect(withoutLine(after)).toEqual(withoutLine(before));
  });

  it('rejects a kind declared only in a file that is not loaded', () => {
    // A partially loaded project: the specification is in a file that was not
    // passed.  The library cannot know the kind exists, and rejects it.
    const m = mutator({ 'model.c4': "model {\n  app = service 'App' {\n    api = service 'API'\n  }\n}\n" });
    expectRejected(m, 'kind', () => m.addElement('app', { name: 'db', kind: 'service', title: 'DB' }));
  });

  it('accepts a relationship between loaded elements of a partially loaded project', () => {
    const m = mutator({ 'model.c4': "model {\n  app = service 'App' {\n    api = service 'API'\n    db = service 'DB'\n  }\n}\n" });
    m.addRelationship('app.api', 'app.db', 'reads');
    expect(m.getRelationships({ sourceFqn: 'app.api', targetFqn: 'app.db' })).toHaveLength(1);
  });
});

describe('the kind check is shared by relationship kinds', () => {
  const index = new WorkspaceIndex([new C4Parser().parse(MODEL).ast]);

  it('accepts a declared relationship kind', () => {
    expect(() => checkKind('calls', 'relationship', index)).not.toThrow();
  });

  it.each(['service', 'nosuchkind'])('rejects %s, which is not a declared relationship kind', (kind) => {
    expect(() => checkKind(kind, 'relationship', index)).toThrow(InvalidWriteError);
  });
});
