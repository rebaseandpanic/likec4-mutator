import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

/**
 * `updateElement` applies the documented semantics — `tags` / `links`
 * REPLACE, `metadata` MERGE with `null` deletion — to the element's
 * effective values, which include contributions of `extend X { ... }` blocks.
 * New values go into the declaration; the patched properties / keys are
 * removed from every `extend` block of exactly that element, in every file.
 */

const SPEC = `specification {
  element system
  element service
  tag a
  tag b
  tag c
  tag d
  tag z
}
`;

const BASE = `${SPEC}model {
  app = system 'App' {
    #a #b
    description 'base desc'
    link https://base.example.com 'Base'
    metadata {
      owner 'team-a'
      port '8080'
      same 'x'
      arr ['v1', 'v2']
    }
  }
}
`;

const EXT1 = `model {
  extend app {
    #b #c
    link https://base.example.com 'Base'
    link https://ext1.example.com
    metadata {
      port '9090'
      same 'x'
      arr ['v2', 'v3']
      region 'eu'
    }
  }
}
`;

const EXT2 = `model {
  extend app {
    #d
    metadata {
      port '8080'
      region 'us'
    }
  }
}
`;

function makeMutator(): LikeC4Mutator {
  return LikeC4Mutator.fromFiles({ 'base.c4': BASE, 'ext1.c4': EXT1, 'ext2.c4': EXT2 });
}

describe('updateElement tags / links through extend blocks', () => {
  it('REPLACE tags: new tags in the declaration, none left in extend blocks', () => {
    const m = makeMutator();
    const result = m.updateElement('app', { tags: ['a'] });
    const files = m.serialize();
    expect(files['base.c4']).toBe(BASE.replace('    #a #b\n', '    #a\n'));
    expect(files['ext1.c4']).toBe(EXT1.replace('    #b #c\n', ''));
    expect(files['ext2.c4']).toBe(EXT2.replace('    #d\n', ''));
    expect(m.getElement('app')!.tags).toEqual(['a']);
    expect(result).toEqual({ changedFiles: ['base.c4', 'ext1.c4', 'ext2.c4'] });
    expect(m.validate()).toEqual([]);
  });

  it('tags: [] clears the tags of the declaration and of every extend block', () => {
    const m = makeMutator();
    m.updateElement('app', { tags: [] });
    const files = m.serialize();
    expect(files['base.c4']).toBe(BASE.replace('    #a #b\n', ''));
    expect(files['ext1.c4']).toBe(EXT1.replace('    #b #c\n', ''));
    expect(files['ext2.c4']).toBe(EXT2.replace('    #d\n', ''));
    expect(m.getElement('app')!.tags).toBeUndefined();
    expect(m.validate()).toEqual([]);
  });

  it.each([
    {
      name: 'links: [] clears every link',
      links: [],
      base: BASE.replace("    link https://base.example.com 'Base'\n", ''),
      expected: undefined,
    },
    {
      name: 'links: [x] leaves exactly x',
      links: [{ url: 'https://new.example.com', label: 'New' }],
      base: BASE.replace("link https://base.example.com 'Base'", "link https://new.example.com 'New'"),
      expected: [{ url: 'https://new.example.com', label: 'New' }],
    },
  ])('$name', ({ links, base, expected }) => {
    const m = makeMutator();
    const result = m.updateElement('app', { links });
    const files = m.serialize();
    expect(files['base.c4']).toBe(base);
    expect(files['ext1.c4']).toBe(
      EXT1.replace("    link https://base.example.com 'Base'\n    link https://ext1.example.com\n", ''),
    );
    expect(files['ext2.c4']).toBe(EXT2);
    expect(m.getElement('app')!.links).toEqual(expected);
    expect(result.changedFiles).toEqual(['base.c4', 'ext1.c4']);
    expect(m.validate()).toEqual([]);
  });
});

describe('updateElement metadata through extend blocks', () => {
  it('null deletes the key everywhere and keeps every other key byte-for-byte', () => {
    const m = makeMutator();
    m.updateElement('app', { metadata: { port: null } });
    const files = m.serialize();
    expect(files['base.c4']).toBe(BASE.replace("      port '8080'\n", ''));
    expect(files['ext1.c4']).toBe(EXT1.replace("      port '9090'\n", ''));
    expect(files['ext2.c4']).toBe(EXT2.replace("      port '8080'\n", ''));
    expect(m.getElement('app')!.metadata).toEqual({
      owner: 'team-a',
      same: 'x',
      arr: ['v1', 'v2', 'v3'],
      region: ['eu', 'us'],
    });
    expect(m.validate()).toEqual([]);
  });

  it('upsert writes the value into the declaration and removes the key from extend blocks', () => {
    const m = makeMutator();
    m.updateElement('app', { metadata: { region: 'global' } });
    const files = m.serialize();
    expect(files['base.c4']).toBe(BASE.replace("      arr ['v1', 'v2']\n", "      arr ['v1', 'v2']\n      region 'global'\n"));
    expect(files['ext1.c4']).toBe(EXT1.replace("      region 'eu'\n", ''));
    expect(files['ext2.c4']).toBe(EXT2.replace("      region 'us'\n", ''));
    const el = m.getElement('app')!;
    expect(el.metadata!.region).toBe('global');
    expect(el.metadata!.port).toEqual(['8080', '9090']);
    expect(m.validate()).toEqual([]);
  });

  it('removes the metadata block of an extend when its last key goes', () => {
    const m = makeMutator();
    m.updateElement('app', { metadata: { port: null, region: null } });
    expect(m.serialize()['ext2.c4']).toBe(`model {\n  extend app {\n    #d\n  }\n}\n`);
    expect(m.validate()).toEqual([]);
  });

  it('reads a written single-element array back as LikeC4 does', () => {
    const m = makeMutator();
    m.updateElement('app', { metadata: { port: ['1'] } });
    const el = m.getElement('app')!;
    expect(el.metadata!.port).toBe('1');
    expect(el.declared.metadata!.port).toEqual(['1']);
    expect(el.extendedBy.some((e) => e.metadata && 'port' in e.metadata)).toBe(false);
  });
});

describe('updateElement — what is left in place', () => {
  it('leaves an extend block that became empty', () => {
    const m = makeMutator();
    m.updateElement('app', { tags: [], metadata: { port: null, region: null } });
    expect(m.serialize()['ext2.c4']).toBe(`model {\n  extend app {\n  }\n}\n`);
    expect(m.getElement('app')!.extendedBy.map((e) => e.file)).toEqual(['ext1.c4', 'ext2.c4']);
    expect(m.validate()).toEqual([]);
  });

  it('keeps elements and relationships declared inside an extend block', () => {
    const ext = `model {\n  extend app {\n    #b\n    cache = service 'Cache' {\n      #c\n    }\n    cache -> app 'reads'\n  }\n}\n`;
    const m = LikeC4Mutator.fromFiles({ 'base.c4': BASE, 'ext.c4': ext });
    m.updateElement('app', { tags: [] });
    expect(m.serialize()['ext.c4']).toBe(ext.replace('    #b\n', ''));
    expect(m.getElement('app.cache')!.tags).toEqual(['c']);
    expect(m.getRelationships({ sourceFqn: 'app.cache' })).toHaveLength(1);
  });

  it('does not touch extend blocks of descendants', () => {
    const base = `${SPEC}model {\n  app = system 'App' {\n    api = service 'API'\n  }\n}\n`;
    const ext = `model {\n  extend app {\n    #b\n  }\n  extend app.api {\n    #c\n    metadata { k 'v' }\n  }\n}\n`;
    const m = LikeC4Mutator.fromFiles({ 'base.c4': base, 'ext.c4': ext });
    m.updateElement('app', { tags: [], metadata: { k: null } });
    expect(m.serialize()['ext.c4']).toBe(ext.replace('    #b\n', ''));
    expect(m.getElement('app.api')!.tags).toEqual(['c']);
  });

  it('leaves extend files untouched when only declaration-only properties change', () => {
    const m = makeMutator();
    const result = m.updateElement('app', { description: 'new', title: 'New App' });
    const files = m.serialize();
    expect(files['ext1.c4']).toBe(EXT1);
    expect(files['ext2.c4']).toBe(EXT2);
    expect(result.changedFiles).toEqual(['base.c4']);
  });

  it('reports no changed file when nothing changes', () => {
    const m = LikeC4Mutator.fromFiles({ 'base.c4': `${SPEC}model {\n  app = system 'App'\n}\n` });
    expect(m.updateElement('app', { tags: [], metadata: { k: null } })).toEqual({ changedFiles: [] });
  });
});

describe('updateElement — declaration and extend blocks in one file', () => {
  it('edits the declaration and an extend block that precedes it in the same file', () => {
    const one = `${SPEC}model {\n  extend app {\n    #b\n    metadata { k 'ext' }\n  }\n  app = system 'App' {\n    #a\n    metadata { k 'body' }\n  }\n}\n`;
    const m = LikeC4Mutator.fromFiles({ 'one.c4': one });
    const result = m.updateElement('app', { tags: ['z'], metadata: { k: 'new' } });
    expect(m.serialize()['one.c4']).toBe(
      `${SPEC}model {\n  extend app {\n  }\n  app = system 'App' {\n    #z\n    metadata {\n      k 'new'\n    }\n  }\n}\n`,
    );
    expect(result.changedFiles).toEqual(['one.c4']);
    const el = m.getElement('app')!;
    expect(el.tags).toEqual(['z']);
    expect(el.metadata).toEqual({ k: 'new' });
    expect(m.validate()).toEqual([]);
  });

  it('creates a body for an element that only had properties from extend blocks', () => {
    const m = LikeC4Mutator.fromFiles({
      'base.c4': `${SPEC}model {\n  app = system 'App'\n}\n`,
      'ext.c4': `model {\n  extend app {\n    #c\n  }\n}\n`,
    });
    m.updateElement('app', { tags: ['z'] });
    expect(m.serialize()['base.c4']).toBe(`${SPEC}model {\n  app = system 'App' {\n    #z\n  }\n}\n`);
    expect(m.serialize()['ext.c4']).toBe(`model {\n  extend app {\n  }\n}\n`);
    expect(m.getElement('app')!.tags).toEqual(['z']);
  });
});

describe('updateElement — failures change nothing', () => {
  const BROKEN = `model {\n  extend app {\n    #c\n`;

  it.each([
    ['tags', { tags: ['a'] }],
    ['links', { links: [] }],
    ['metadata', { metadata: { port: null } }],
  ])('rejects a %s update while a loaded file has syntax errors', (_name, patch) => {
    const files = { 'base.c4': BASE, 'ext1.c4': EXT1, 'broken.c4': BROKEN };
    const m = LikeC4Mutator.fromFiles(files);
    expect(() => m.updateElement('app', patch)).toThrow(/broken\.c4/);
    expect(m.serialize()).toEqual(files);
    expect(m.getElement('app')!.tags).toEqual(['a', 'b', 'c']);
  });

  it('still updates declaration-only properties while a loaded file has syntax errors', () => {
    const m = LikeC4Mutator.fromFiles({ 'base.c4': BASE, 'broken.c4': BROKEN });
    expect(m.updateElement('app', { description: 'new' }).changedFiles).toEqual(['base.c4']);
  });

  it('restores every file when the declaration edit fails after an extend file was edited', () => {
    // ext1.c4 is edited first (load order); the style value then produces
    // text that does not parse in base.c4.
    const files = { 'ext1.c4': EXT1, 'base.c4': BASE };
    const m = LikeC4Mutator.fromFiles(files);
    expect(() =>
      m.updateElement('app', { tags: [], style: { color: 'not a color' } as never }),
    ).toThrow(/base\.c4/);
    expect(m.serialize()).toEqual(files);
    expect(m.getElement('app')!.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('operations that keep declaration semantics', () => {
  it('removeElement removes extend blocks that only carry tags and metadata', () => {
    const m = makeMutator();
    m.removeElement('app');
    const files = m.serialize();
    expect(files['ext1.c4']).toBe('model {\n}\n');
    expect(files['ext2.c4']).toBe('model {\n}\n');
    expect(m.validate()).toEqual([]);
  });

  it('getElementSource returns the declaration only', () => {
    const src = makeMutator().getElementSource('app')!;
    expect(src.startsWith("app = system 'App' {")).toBe(true);
    expect(src).not.toContain('#c');
  });
});
