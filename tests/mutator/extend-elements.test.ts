import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

/**
 * Elements declared inside `extend X { ... }` bodies are children of X
 * (LikeC4 FqnIndex: `extend app { cache = service }` declares `app.cache`),
 * wherever the extend block lives.  The element API must address them like
 * any other element.
 */

const SPEC = `specification {
  element system
  element service
  element database
}
`;

const BASE = `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  ext = system 'External'
}
`;

const EXTENSION = `model {
  extend app {
    cache = service 'Cache' {
      description 'Hot data'
      store = database 'Store'
    }
    cache -> api 'reads'
  }
}
`;

function makeMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'base.c4': BASE, 'extension.c4': EXTENSION });
}

describe('elements declared in extend blocks — query', () => {
  it('getElement finds an element declared in an extend body', () => {
    const el = makeMutator().getElement('app.cache');
    expect(el).not.toBeNull();
    expect(el!.name).toBe('cache');
    expect(el!.kind).toBe('service');
    expect(el!.title).toBe('Cache');
    expect(el!.description).toBe('Hot data');
    expect(el!.parentFqn).toBe('app');
    expect(el!.children).toEqual(['app.cache.store']);
  });

  it('getElement finds an element nested below an extend-declared element', () => {
    const el = makeMutator().getElement('app.cache.store');
    expect(el).not.toBeNull();
    expect(el!.parentFqn).toBe('app.cache');
  });

  it('the extended element lists children declared in other files', () => {
    expect(makeMutator().getElement('app')!.children).toEqual(['app.api', 'app.cache']);
  });

  it('listElements filters extend-declared elements by parent and kind', () => {
    const m = makeMutator();
    expect(m.listElements({ parentFqn: 'app' }).map((e) => e.fqn)).toEqual(['app.api', 'app.cache']);
    expect(m.listElements({ kind: 'database' }).map((e) => e.fqn)).toEqual(['app.cache.store']);
    expect(m.listElements().map((e) => e.fqn)).toContain('app.cache');
  });

  it('getElementSource returns the declaration inside the extend body', () => {
    const src = makeMutator().getElementSource('app.cache.store');
    expect(src).toBe(`store = database 'Store'`);
  });
});

describe('elements declared in extend blocks — mutation', () => {
  it('updateElement edits the declaration in the extending file', () => {
    const m = makeMutator();
    m.updateElement('app.cache', { title: 'Redis', technology: 'Redis 7' });
    const files = m.serialize();
    expect(files['base.c4']).toBe(BASE);
    expect(files['extension.c4']).toContain(`cache = service 'Redis' {`);
    expect(m.getElement('app.cache')!.technology).toBe('Redis 7');
    expect(m.validate()).toEqual([]);
  });

  it('addElement accepts a parent declared in an extend body', () => {
    const m = makeMutator();
    const fqn = m.addElement('app.cache', { name: 'replica', kind: 'database', title: 'Replica' });
    expect(fqn).toBe('app.cache.replica');
    expect(m.getElement('app.cache.replica')!.parentFqn).toBe('app.cache');
    expect(m.serialize()['base.c4']).toBe(BASE);
    expect(m.validate()).toEqual([]);
  });

  it('removeElement removes an extend-declared element with its relationships', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  api2 = service 'API 2'
  api2 -> app.cache 'uses'
}
`,
      'extension.c4': EXTENSION,
    });
    const result = m.removeElement('app.cache');
    expect(result.removedRelationships).toEqual([
      { source: 'api2', target: 'app.cache', title: 'uses' },
      { source: 'app.cache', target: 'app.api', title: 'reads' },
    ]);
    expect(m.getElement('app.cache')).toBeNull();
    expect(m.getElement('app.cache.store')).toBeNull();
    expect(m.getRelationships()).toEqual([]);
    expect(m.serialize()['extension.c4']).toBe(`model {
  extend app {
  }
}
`);
    expect(m.validate()).toEqual([]);
  });

  it('removeElement of the extended element removes the extend blocks targeting its subtree', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': BASE,
      'extension.c4': EXTENSION,
      'more.c4': `model {
  extend app.api {
    worker = service 'Worker'
  }
  ext -> app.api.worker 'calls'
  extend ext {
    proxy = service 'Proxy'
  }
}
`,
    });
    const result = m.removeElement('app');
    expect(result.removedRelationships).toHaveLength(2);
    expect(result.removedRelationships).toContainEqual({ source: 'app.cache', target: 'app.api', title: 'reads' });
    expect(result.removedRelationships).toContainEqual({ source: 'ext', target: 'app.api.worker', title: 'calls' });
    const files = m.serialize();
    expect(files['extension.c4']).toBe(`model {
}
`);
    expect(files['more.c4']).toBe(`model {
  extend ext {
    proxy = service 'Proxy'
  }
}
`);
    expect(m.listElements().map((e) => e.fqn)).toEqual(['ext', 'ext.proxy']);
    expect(m.validate()).toEqual([]);
  });
});
