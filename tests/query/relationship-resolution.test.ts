/**
 * Relationship endpoints are reported and matched as absolute FQNs, resolved
 * the way LikeC4 links element references (relative names inside element
 * bodies, `this` / `it`, sourceless `-> x`, `extend` bodies, references to
 * elements declared in other files).
 *
 * Expected FQNs below were obtained independently of this library: the same
 * sources were linked by the LikeC4 language server (DocumentBuilder.build,
 * then FqnIndex.resolve on each Relation's source/target reference).
 */
import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

const NESTED = `specification { element service }
model {
  app = service {
    api = service
    db = service
    api -> db
  }
}
`;

describe('relationship endpoint resolution', () => {
  it('reports a nested relation with absolute FQNs and finds it by FQN filter', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': NESTED });

    const rels = m.getRelationships();
    expect(rels.map((r) => [r.sourceFqn, r.targetFqn])).toEqual([['app.api', 'app.db']]);
    expect(m.getRelationships({ sourceFqn: 'app.api', targetFqn: 'app.db' })).toHaveLength(1);
  });

  it('updates a nested relation addressed by absolute FQNs', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': NESTED });

    m.updateRelationship({ source: 'app.api', target: 'app.db' }, { label: 'persists' });

    expect(m.serialize()['m.c4']).toContain("api -> db 'persists'");
    expect(m.validate()).toEqual([]);
  });

  it('removes a nested relation addressed by absolute FQNs', () => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': NESTED });

    m.removeRelationship('app.api', 'app.db');

    expect(m.getRelationships()).toEqual([]);
    expect(m.serialize()['m.c4']).not.toContain('api -> db');
    expect(m.validate()).toEqual([]);
  });

  it('still matches a nested relation by its reference text as written', () => {
    // Backward compatibility: callers that addressed `api -> db` by the local
    // names written in the source keep working.
    const m = LikeC4Mutator.fromFiles({ 'm.c4': NESTED });

    m.removeRelationship('api', 'db');

    expect(m.getRelationships()).toEqual([]);
  });

  const SINGLE_FILE = `specification { element service }
model {
  app = service {
    api = service {
      -> db
      this -> db
      it -> app
      -> worker
    }
    db = service
    api -> db
    backend = service {
      worker = service
    }
  }
  extend app {
    cache = service
    -> cache
    api -> cache
    this -> worker
  }
  app.api -> app.db
  api -> worker
  app.worker -> db
}
`;

  it.each([
    ['-> db', 'app.api', 'app.db'],
    ['this -> db', 'app.api', 'app.db'],
    ['it -> app', 'app.api', 'app'],
    ['-> worker', 'app.api', 'app.backend.worker'],
    ['api -> db', 'app.api', 'app.db'],
    ['-> cache', 'app', 'app.cache'],
    ['api -> cache', 'app.api', 'app.cache'],
    ['this -> worker', 'app', 'app.backend.worker'],
    ['app.api -> app.db', 'app.api', 'app.db'],
    ['api -> worker', 'app.api', 'app.backend.worker'],
    ['app.worker -> db', 'app.backend.worker', 'app.db'],
  ])('resolves `%s` to %s -> %s', (written, source, target) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SINGLE_FILE });

    const rel = m
      .getRelationships()
      .find((r) => SINGLE_FILE.slice(r.sourceRange.offset, r.sourceRange.end) === written);

    expect(rel, `relation \`${written}\` not reported`).toBeDefined();
    expect([rel!.sourceFqn, rel!.targetFqn]).toEqual([source, target]);
  });

  const FILE_A = `specification { element service }
model {
  app = service {
    api = service
    backend = service {
      worker = service
    }
  }
}
`;
  const FILE_B = `model {
  extend app {
    cache = service
    worker -> cache
    -> api
  }
  ui = service {
    -> app.worker
    -> app
  }
}
`;

  it.each([
    ['worker -> cache', 'app.backend.worker', 'app.cache'],
    ['-> api', 'app', 'app.api'],
    ['-> app.worker', 'ui', 'app.backend.worker'],
    ['-> app', 'ui', 'app'],
  ])('resolves `%s` against elements declared in another file to %s -> %s', (written, source, target) => {
    const m = LikeC4Mutator.fromFiles({ 'a.c4': FILE_A, 'b.c4': FILE_B });

    const rel = m
      .getRelationships()
      .find((r) => FILE_B.slice(r.sourceRange.offset, r.sourceRange.end) === written);

    expect(rel, `relation \`${written}\` not reported`).toBeDefined();
    expect([rel!.sourceFqn, rel!.targetFqn]).toEqual([source, target]);
  });

  it('keeps the reference text when a name is ambiguous', () => {
    // LikeC4 reports `api` as unresolved here (two elements named api).
    const source = `specification { element service }
model {
  s1 = service {
    api = service
  }
  s2 = service {
    api = service
  }
  ui = service
  ui -> api
}
`;
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });

    expect(m.getRelationships().map((r) => [r.sourceFqn, r.targetFqn])).toEqual([['ui', 'api']]);
  });

  // LikeC4 registers `this` / `it` in an element body before that body's
  // children, so the alias wins over a child that happens to share its name.
  it.each(['this', 'it'])('binds `-> %s` to the body owner even when a child has that name', (alias) => {
    const source = `specification { element service }
model {
  app = service {
    ${alias} = service
    -> ${alias}
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });

    expect(m.getRelationships().map((r) => [r.sourceFqn, r.targetFqn])).toEqual([['app', 'app']]);
  });
});
