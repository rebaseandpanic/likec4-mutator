/**
 * Creation of `extend` blocks (lc4m-15.30 US-10; FR-050, D71, D72, D82,
 * D86, D103, D114; rows 152–157 of the test matrix): `addElementExtend` and
 * `addRelationshipExtend` write a new block or merge into the file's first
 * block of the same target, and the contributions read as LikeC4 merges
 * them.
 *
 * Expected values come from LikeC4: the effective tags, links and metadata
 * of the extended element or relationship are what its model builder
 * computes for the written files (`expectAgreesWithLikeC4`,
 * `expectRelationshipsAgreeWithLikeC4`), and the written texts are the
 * inputs with literal edits.
 *
 * Abbreviations of the matrix: AWB (the accepted-write bundle, whose warning
 * part covers `This extend does not match any relation`), BI (an
 * `InvalidWriteError` on the named field, sources and reads unchanged), REL
 * (`error.related` equals a literal list), P (a precondition asserted
 * first).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { RelationshipAmbiguityError } from '../../src/mutator/relationship-selector.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  buildLikeC4Model,
  expectAcceptedWrite,
  expectAgreesWithLikeC4,
  expectRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
} from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;

/** `text` with each `[from, to]` replaced; every `from` must occur in it exactly once. */
function replaced(text: string, replacements: ReadonlyArray<readonly [string, string]>): string {
  return replacements.reduce((current, [from, to]) => {
    if (current.split(from).length !== 2) throw new Error(`test input: '${from}' not found once`);
    return current.replace(from, to);
  }, text);
}

/** Every read the mutator offers, for BI. */
function reads(mutator: LikeC4Mutator): string {
  return JSON.stringify([mutator.listElements(), mutator.getRelationships()]);
}

/** BI: `write` throws an `InvalidWriteError` on `field`; the sources and the reads are unchanged. */
function expectRejected(mutator: LikeC4Mutator, write: () => unknown, field: string): InvalidWriteError {
  const sources = mutator.serialize();
  const before = reads(mutator);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(mutator.serialize()).toEqual(sources);
  expect(reads(mutator)).toBe(before);
  return error as InvalidWriteError;
}

/** The library's effective values of every element and relationship of `files`, compared with LikeC4. */
async function expectReadsAgree(files: Files): Promise<void> {
  const mutator = LikeC4Mutator.fromFiles(files);
  for (const element of mutator.listElements()) await expectAgreesWithLikeC4(files, element.fqn, element);
  await expectRelationshipsAgreeWithLikeC4(files, mutator.getRelationships());
}

const SPEC = `specification {
  element system
  relationship calls
  relationship syncs {
    title 'Syncs'
  }
  tag core
  tag edge
}
`;

const FILES: Files = {
  'a.c4': `${SPEC}model {
  app = system 'App' {
    #core
    metadata {
      owner 'team'
    }
  }
  db = system 'DB'
  app -[calls]-> db 'reads'
  db .calls app 'notifies'
  app <-> db 'replicates'
}
`,
  'b.c4': `model {
  extend app {
    #edge
    link https://example.com/app 'App'
  }
}
`,
  'c.c4': `views {
  view index {
    include *
  }
}
`,
};

describe('addElementExtend (row 152)', () => {
  it('writes a new block, creating the model block of a file that has none', SLOW, async () => {
    await expectValidLikeC4(FILES);
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expect(mutator.addElementExtend('db', { file: 'c.c4', tags: ['core'], metadata: { tier: 'data' } })).toEqual({
      changedFiles: ['c.c4'],
      merged: false,
    });
    const after = mutator.serialize();
    expect(after['c.c4']).toBe(`${FILES['c.c4']}\nmodel {\n  extend db {\n    #core\n    metadata {\n      tier 'data'\n    }\n  }\n}\n`);
    await expectAcceptedWrite(FILES, after);
    await expectReadsAgree(after);
  });

  it('merges tags, links and a new metadata block into the first block of the file', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expect(
      mutator.addElementExtend('app', { file: 'b.c4', tags: ['core'], links: [{ url: 'https://example.com/more' }], metadata: { tier: 'web' } }),
    ).toEqual({ changedFiles: ['b.c4'], merged: true });
    const after = mutator.serialize();
    expect(after['b.c4']).toBe(
      replaced(FILES['b.c4']!, [
        ['    #edge\n', '    #edge #core\n'],
        // FR-050 orders neither: a new metadata block goes where the other writers put one, links at the end.
        ["    link https://example.com/app 'App'\n", "    link https://example.com/app 'App'\n    metadata {\n      tier 'web'\n    }\n    link https://example.com/more\n"],
      ]),
    );
    await expectAcceptedWrite(FILES, after);
    await expectReadsAgree(after);
  });
});

describe('addRelationshipExtend (row 153)', () => {
  it('P: a block that matches no relationship makes LikeC4 warn (spike 01)', async () => {
    const files = { ...FILES, 'b.c4': `model {\n  extend app -> db 'nothing' {\n    #edge\n  }\n}\n` };
    expect((await buildLikeC4Model(files)).diagnostics.some((d) => d.includes('does not match any relation'))).toBe(true);
  });
  it.each([
    ['a bracket relationship with kind and title', { source: 'app', target: 'db', matchTitle: 'reads' }, "extend app -[calls]-> db 'reads'"],
    ['a dot-form relationship', { source: 'db', target: 'app', matchTitle: 'notifies' }, "extend db -[calls]-> app 'notifies'"],
    ['a bidirectional relationship', { source: 'app', target: 'db', matchBidirectional: true }, "extend app <-> db 'replicates'"],
  ] as const)('writes a new block for %s', SLOW, async (_, selector, header) => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expect(mutator.addRelationshipExtend(selector, { file: 'c.c4', tags: ['edge'] })).toEqual({ changedFiles: ['c.c4'], merged: false });
    const after = mutator.serialize();
    expect(after['c.c4']).toBe(`${FILES['c.c4']}\nmodel {\n  ${header} {\n    #edge\n  }\n}\n`);
    await expectAcceptedWrite(FILES, after);
    await expectReadsAgree(after);
  });
  it('merges into an existing block of the relationship', SLOW, async () => {
    const before = { ...FILES, 'c.c4': `model {\n  extend app -[calls]-> db 'reads' {\n    #edge\n  }\n}\n` };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    expect(mutator.addRelationshipExtend({ source: 'app', target: 'db', matchTitle: 'reads' }, { file: 'c.c4', tags: ['core'], metadata: { sla: 'gold' } })).toEqual({
      changedFiles: ['c.c4'],
      merged: true,
    });
    const after = mutator.serialize();
    expect(after['c.c4']).toBe("model {\n  extend app -[calls]-> db 'reads' {\n    #edge #core\n    metadata {\n      sla 'gold'\n    }\n  }\n}\n");
    await expectAcceptedWrite(before, after);
    await expectReadsAgree(after);
  });
});

describe('the selector (row 154)', () => {
  const COMPETING: Files = {
    'm.c4': `${SPEC}model {
  a = system 'A'
  b = system 'B'
  a -[calls]-> b 'x'
  a -> b 'x'
  a -[calls]-> b 'y'
  a <-> b 'x'
}
`,
  };
  it.each([
    ['matchKind', { source: 'a', target: 'b', matchKind: 'calls', matchTitle: 'x', matchBidirectional: false }],
    ['matchTitle', { source: 'a', target: 'b', matchTitle: 'y' }],
    ['matchBidirectional', { source: 'a', target: 'b', matchBidirectional: true }],
  ] as const)('decorates exactly the relationship selected by %s', SLOW, async (_, selector) => {
    await expectValidLikeC4(COMPETING);
    const mutator = LikeC4Mutator.fromFiles(COMPETING);
    mutator.addRelationshipExtend(selector, { file: 'm.c4', tags: ['edge'] });
    const after = mutator.serialize();
    await expectAcceptedWrite(COMPETING, after);
    await expectReadsAgree(after);
    const decorated = LikeC4Mutator.fromFiles(after)
      .getRelationships()
      .filter((r) => r.tags?.includes('edge'));
    expect(decorated).toHaveLength(1);
  });

  const SAME_LINE: Files = { 'm.c4': `${SPEC}model {\n  a = system 'A'\n  b = system 'B'\n  a -> b 'same' a -> b 'same'\n}\n` };
  it('rejects two identical relationships without position as ambiguous', async () => {
    await expectValidLikeC4(SAME_LINE);
    const mutator = LikeC4Mutator.fromFiles(SAME_LINE);
    const error = expectRejected(mutator, () => mutator.addRelationshipExtend({ source: 'a', target: 'b' }, { file: 'm.c4', tags: ['edge'] }), 'source');
    expect(error).toBeInstanceOf(RelationshipAmbiguityError);
  });
  it('rejects one of them by position without shared (D72)', () => {
    const mutator = LikeC4Mutator.fromFiles(SAME_LINE);
    expectRejected(
      mutator,
      () => mutator.addRelationshipExtend({ source: 'a', target: 'b', position: { file: 'm.c4', line: 13, column: 17 } }, { file: 'm.c4', tags: ['edge'] }),
      'shared',
    );
  });
  it('accepts one of them by position with shared, applying to both', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(SAME_LINE);
    mutator.addRelationshipExtend({ source: 'a', target: 'b', position: { file: 'm.c4', line: 13, column: 17 } }, { file: 'm.c4', tags: ['edge'], shared: true });
    const after = mutator.serialize();
    await expectAcceptedWrite(SAME_LINE, after);
    await expectReadsAgree(after);
    expect(LikeC4Mutator.fromFiles(after).getRelationships().map((r) => r.tags)).toEqual([['edge'], ['edge']]);
  });
});

describe('no repetition (row 155)', () => {
  it('does not repeat tags and links of the target block and keeps an identical link of another block', SLOW, async () => {
    const before = { ...FILES, 'c.c4': `model {\n  extend app {\n    link https://example.com/other\n  }\n}\n` };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    // `#edge` and the App link are already in b.c4's block; the other link is in c.c4's.
    mutator.addElementExtend('app', { file: 'b.c4', tags: ['edge', 'core'], links: [{ url: 'https://example.com/app', label: 'App' }, { url: 'https://example.com/other' }] });
    const after = mutator.serialize();
    expect(after['b.c4']).toBe(
      replaced(FILES['b.c4']!, [
        ['    #edge\n', '    #edge #core\n'],
        ["    link https://example.com/app 'App'\n", "    link https://example.com/app 'App'\n    link https://example.com/other\n"],
      ]),
    );
    await expectAcceptedWrite(before, after);
    await expectReadsAgree(after);
  });
});

describe('a shared identity (row 156)', () => {
  const SHARED: Files = {
    'm.c4': `${SPEC}model {
  a = system 'A'
  b = system 'B'
  a -[calls]-> b 'x'
  a .calls b 'x'
}
`,
  };
  it('rejects an identity another relationship shares, listing it', async () => {
    await expectValidLikeC4(SHARED);
    const mutator = LikeC4Mutator.fromFiles(SHARED);
    const error = expectRejected(
      mutator,
      () => mutator.addRelationshipExtend({ source: 'a', target: 'b', position: { file: 'm.c4', line: 13, column: 3 } }, { file: 'm.c4', tags: ['edge'] }),
      'shared',
    );
    expect(error.related).toEqual([{ file: 'm.c4', line: 14, column: 3, construct: 'relationship' }]);
  });
  it('applies to both with shared', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(SHARED);
    mutator.addRelationshipExtend({ source: 'a', target: 'b', position: { file: 'm.c4', line: 13, column: 3 } }, { file: 'm.c4', tags: ['edge'], shared: true });
    const after = mutator.serialize();
    await expectAcceptedWrite(SHARED, after);
    await expectReadsAgree(after);
    expect(LikeC4Mutator.fromFiles(after).getRelationships().map((r) => r.tags)).toEqual([['edge'], ['edge']]);
  });
  it('accepts shared when the identity matches only the selected relationship', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    mutator.addRelationshipExtend({ source: 'app', target: 'db', matchTitle: 'reads' }, { file: 'c.c4', tags: ['edge'], shared: true });
    await expectAcceptedWrite(FILES, mutator.serialize());
  });
});

describe('rejections (row 157)', () => {
  const KIND_TITLE: Files = { 'm.c4': `${SPEC}model {\n  a = system 'A'\n  b = system 'B'\n  a -[syncs]-> b\n}\n` };
  it.each([
    ['an unresolved element', FILES, (m: LikeC4Mutator) => m.addElementExtend('nope', { file: 'b.c4', tags: ['core'] }), 'fqn'],
    ['an undeclared tag', FILES, (m: LikeC4Mutator) => m.addElementExtend('db', { file: 'b.c4', tags: ['nope'] }), 'tags[0]'],
    ['nothing to add', FILES, (m: LikeC4Mutator) => m.addElementExtend('db', { file: 'b.c4' }), 'tags'],
    ['only tags and links the block has', FILES, (m: LikeC4Mutator) => m.addElementExtend('app', { file: 'b.c4', tags: ['edge'], links: [{ url: 'https://example.com/app', label: 'App' }] }), 'tags'],
    ['a metadata key of the declaration', FILES, (m: LikeC4Mutator) => m.addElementExtend('app', { file: 'c.c4', metadata: { owner: 'x' } }), 'metadata.owner'],
    [
      'a metadata key of an extend block in another file',
      { ...FILES, 'c.c4': `model {\n  extend db {\n    metadata {\n      tier 'data'\n    }\n  }\n}\n` },
      (m: LikeC4Mutator) => m.addElementExtend('db', { file: 'b.c4', metadata: { tier: 'other' } }),
      'metadata.tier',
    ],
    ['a kind-only title (D82)', KIND_TITLE, (m: LikeC4Mutator) => m.addRelationshipExtend({ source: 'a', target: 'b' }, { file: 'm.c4', tags: ['core'] }), 'source'],
    ['a missing file', FILES, (m: LikeC4Mutator) => m.addElementExtend('db', { tags: ['core'] } as unknown as { file: string }), 'file'],
    ['an unloaded file', FILES, (m: LikeC4Mutator) => m.addElementExtend('db', { file: 'z.c4', tags: ['core'] }), 'file'],
  ] as const)('rejects %s', (_, files, write, field) => {
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => write(mutator), field);
  });
});
