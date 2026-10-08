import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

/**
 * `updateRelationship` applies `tags` / `links` REPLACE and `metadata` MERGE
 * with `null` deletion to the relationship's effective values, which include
 * `extend a -> b { ... }` blocks: new values go into the relationship, the
 * patched properties / keys leave every block that applies to it, in every
 * file.  The title identifies the relationship for those blocks, so a new
 * label is written into them too.
 */

const SPEC = `specification {
  element service
  tag a
  tag b
  tag c
  tag z
}
`;

const BASE = `${SPEC}model {
  x = service
  y = service
  x -> y 'reads' {
    #a
    technology 'HTTP'
    link https://base.example.com 'Base'
    metadata {
      owner 'team-a'
      port '8080'
    }
  }
}
`;

const EXT1 = `model {
  extend x -> y 'reads' {
    #b
    link https://ext1.example.com
    // ext1 metadata
    metadata {
      port '9090'
      region 'eu'
    }
  }
}
`;

const EXT2 = `model {
  // unrelated relationship
  extend y -> x {
    #c
  }
  extend x -> y 'reads' {
    #c
    metadata { tier 'gold' }
  }
}
`;

const FILES = { 'base.c4': BASE, 'ext1.c4': EXT1, 'ext2.c4': EXT2, 'other.c4': `model {\n  y -> x\n}\n` };
const MATCH = { source: 'x', target: 'y' };

function make(files: Record<string, string> = FILES): LikeC4Mutator {
  return LikeC4Mutator.fromFiles(files);
}

function reads(m: LikeC4Mutator) {
  return m.getRelationships({ sourceFqn: 'x', targetFqn: 'y' })[0]!;
}

describe('updateRelationship tags / links through extend blocks', () => {
  it('REPLACE tags: new tags in the relationship, none left in its extend blocks', async () => {
    const m = make();
    const result = m.updateRelationship(MATCH, { tags: ['z'] });
    expect(result).toEqual({ changedFiles: ['base.c4', 'ext1.c4', 'ext2.c4'] });
    const r = reads(m);
    expect(r.tags).toEqual(['z']);
    expect(r.extendedBy.map((e) => e.tags)).toEqual([undefined, undefined]);
    // The block of `y -> x` keeps its tag.
    expect(m.serialize()['ext2.c4']).toContain('extend y -> x {\n    #c\n  }');
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });

  it.each([
    ['tags', { tags: [] as string[] }, (m: LikeC4Mutator) => reads(m).tags],
    ['links', { links: [] as Array<{ url: string }> }, (m: LikeC4Mutator) => reads(m).links],
  ])('%s: [] clears the relationship and every extend block', async (_name, patch, read) => {
    const m = make();
    m.updateRelationship(MATCH, patch);
    expect(read(m)).toBeUndefined();
    expect(m.validate()).toEqual([]);
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });

  it('REPLACE links: new links in the relationship, none left in its extend blocks', () => {
    const m = make();
    m.updateRelationship(MATCH, { links: [{ url: 'https://new.example.com' }] });
    expect(reads(m).links).toEqual([{ url: 'https://new.example.com' }]);
    expect(m.serialize()['ext1.c4']).toBe(EXT1.replace('    link https://ext1.example.com\n', ''));
  });
});

describe('updateRelationship metadata through extend blocks', () => {
  it('null deletes the key everywhere and keeps everything else byte-for-byte', async () => {
    const m = make();
    const { changedFiles } = m.updateRelationship(MATCH, { metadata: { port: null } });
    expect(changedFiles).toEqual(['base.c4', 'ext1.c4']);
    expect(reads(m).metadata).toEqual({ owner: 'team-a', region: 'eu', tier: 'gold' });
    expect(m.serialize()['ext1.c4']).toBe(EXT1.replace("      port '9090'\n", ''));
    expect(m.serialize()['ext2.c4']).toBe(EXT2);
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });

  it('upsert writes the value into the relationship and removes the key from extend blocks', () => {
    const m = make();
    m.updateRelationship(MATCH, { metadata: { tier: 'silver' } });
    expect(reads(m).metadata).toEqual({ owner: 'team-a', port: ['8080', '9090'], tier: 'silver', region: 'eu' });
    expect(m.serialize()['ext2.c4']).toBe(EXT2.replace("\n    metadata { tier 'gold' }", ''));
  });

  it('leaves an extend block that became empty', () => {
    const m = make();
    m.updateRelationship(MATCH, { tags: [], metadata: { tier: null } });
    expect(m.serialize()['ext2.c4']).toContain("  extend x -> y 'reads' {\n  }\n");
    expect(m.validate()).toEqual([]);
  });
});

describe('updateRelationship label', () => {
  it('writes the new title into every extend block of the relationship', async () => {
    const m = make();
    const before = reads(m);
    const { changedFiles } = m.updateRelationship(MATCH, { label: 'queries' });
    expect(changedFiles).toEqual(['base.c4', 'ext1.c4', 'ext2.c4']);
    expect(m.serialize()['ext1.c4']).toBe(EXT1.replace("extend x -> y 'reads'", "extend x -> y 'queries'"));
    expect(m.serialize()['ext2.c4']).toBe(EXT2.replace("extend x -> y 'reads'", "extend x -> y 'queries'"));
    const after = reads(m);
    expect(after.title).toBe('queries');
    expect([after.tags, after.links, after.metadata]).toEqual([before.tags, before.links, before.metadata]);
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });

  it('adds a title to extend blocks of a relationship that had none', () => {
    const m = make({
      'base.c4': `${SPEC}model {\n  x = service\n  y = service\n  x -> y\n  extend x -> y {\n    #a\n  }\n}\n`,
    });
    m.updateRelationship(MATCH, { label: 'new' });
    expect(m.serialize()['base.c4']).toContain("  x -> y 'new'\n  extend x -> y 'new' {\n    #a\n  }\n");
    expect(reads(m).tags).toEqual(['a']);
  });

  it('leaves extend blocks alone when the title does not change', () => {
    const m = make();
    expect(m.updateRelationship(MATCH, { label: 'reads' }).changedFiles).toEqual([]);
  });
});

describe('extend blocks shared by several relationships', () => {
  // `x -> y 'T'` and `x -> y { title 'T' }` have the same identity for
  // LikeC4, so every `extend x -> y 'T'` block applies to both.
  const SHARED = {
    'base.c4': `${SPEC}model {\n  x = service\n  y = service\n  x -> y 'T'\n  x -> y {\n    title 'T'\n  }\n}\n`,
    'ext.c4': `model {\n  extend x -> y 'T' {\n    #a\n    metadata { k 'v' }\n  }\n}\n`,
  };
  const ONE = { source: 'x', target: 'y', matchTitle: 'T' };

  it.each([
    ['tags', { tags: ['b'] }],
    ['metadata', { metadata: { k: null } }],
    ['label', { label: 'U' }],
  ])('rejects a %s update that would change the other relationship, changing nothing', (_name, patch) => {
    const m = make(SHARED);
    expect(() => m.updateRelationship(ONE, patch)).toThrow(/also applies to 1 other relationship/);
    expect(m.serialize()).toEqual(SHARED);
  });

  it('allows an update that leaves the shared blocks unchanged', () => {
    const m = make(SHARED);
    expect(m.updateRelationship(ONE, { links: [], metadata: { other: 'x' } }).changedFiles).toEqual(['base.c4']);
    expect(m.serialize()['ext.c4']).toBe(SHARED['ext.c4']);
  });
});

describe('updateRelationship — failures and declaration-only properties', () => {
  const BROKEN = { ...FILES, 'broken.c4': 'model {\n  x -> \n' };

  it.each([
    ['tags', { tags: ['z'] }],
    ['links', { links: [] }],
    ['metadata', { metadata: { port: null } }],
    ['label', { label: 'queries' }],
  ])('rejects a %s update while a loaded file has syntax errors, changing nothing', (_name, patch) => {
    const m = make(BROKEN);
    expect(() => m.updateRelationship(MATCH, patch)).toThrow(/syntax errors/);
    expect(m.serialize()).toEqual(BROKEN);
  });

  it('still updates other properties while a loaded file has syntax errors', () => {
    const m = make(BROKEN);
    expect(m.updateRelationship(MATCH, { technology: 'gRPC' }).changedFiles).toEqual(['base.c4']);
  });
});

describe('label change into a title another relationship or extend block already uses', () => {
  // A new title moves the relationship's extend blocks to the new identity
  // (LikeC4 `relationFingerprint`: endpoints, kind, title, direction).  There
  // they would also apply to every relationship that already has it, and the
  // blocks already there would apply to the renamed relationship.
  const spec = `specification {\n  element service\n  relationship titled {\n    title 'U'\n  }\n  tag a\n  tag b\n}\n`;
  const model = (body: string): Record<string, string> => ({
    'model.c4': `${spec}model {\n  x = service\n  y = service\n${body}}\n`,
  });
  const T = { source: 'x', target: 'y', matchTitle: 'T' };

  const tagsByTitle = (m: LikeC4Mutator) =>
    m.getRelationships().map((r) => ({ title: r.title, tags: r.tags }));

  it.each([
    [
      'both titles have blocks and relationships',
      model(`  x -> y 'T'\n  x -> y 'U'\n  extend x -> y 'T' { #a }\n  extend x -> y 'U' { #b }\n`),
      { label: 'U' },
    ],
    [
      'only the renamed relationship has blocks',
      model(`  x -> y 'T'\n  x -> y 'U'\n  extend x -> y 'T' {\n    #a\n    link https://old.example.com\n  }\n`),
      { label: 'U' },
    ],
    [
      'blocks of the new title match no relationship yet',
      model(`  x -> y 'T'\n  extend x -> y 'U' { #b }\n`),
      { label: 'U' },
    ],
    [
      'blocks of the new title, renamed relationship without blocks, tags patched too',
      model(`  x -> y 'T' #a\n  extend x -> y 'U' { #b }\n`),
      { label: 'U', tags: ['a'] },
    ],
    [
      "an empty label takes the kind's specification title, used by another relationship",
      model(`  x -[titled]-> y 'T'\n  x -[titled]-> y\n  extend x -[titled]-> y 'T' { #a }\n`),
      { label: '' },
    ],
  ])('rejects the update and changes nothing: %s', (_name, files, patch) => {
    const m = make(files);
    const before = tagsByTitle(m);
    expect(() => m.updateRelationship(T, patch)).toThrow(/Cannot update relationship 'x -> y'/);
    expect(m.serialize()).toEqual(files);
    expect(tagsByTitle(m)).toEqual(before);
  });

  it.each([
    ['another relationship has the new title, no blocks are involved', model(`  x -> y 'T'\n  x -> y 'U'\n`)],
    [
      'blocks of the old title move, nothing has the new title',
      model(`  x -> y 'T'\n  x -> y 'V'\n  extend x -> y 'T' { #a }\n  extend x -> y 'V' { #b }\n`),
    ],
    ['an empty block of the new title', model(`  x -> y 'T' #a\n  x -> y 'U'\n  extend x -> y 'U' {\n  }\n`)],
  ])('allows the label change when no block would change another relationship: %s', async (_name, files) => {
    const m = make(files);
    expect(m.updateRelationship(T, { label: 'U' }).changedFiles).toEqual(['model.c4']);
    await expectRelationshipsAgreeWithLikeC4(m.serialize(), m.getRelationships());
  });
});
