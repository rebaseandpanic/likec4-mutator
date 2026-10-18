/**
 * The relationship selector of `updateRelationship` and `removeRelationship`
 * (lc4m-15.30, US-9, D70, D81, D87, D102, D106; rows 129–133 and 137):
 * `matchKind`, `matchTitle`, `matchBidirectional` and the reverse order of a
 * bidirectional relationship each address exactly one relationship; identical
 * relationships are an ambiguity listing 1-based positions, which select a
 * candidate when passed back; no match is an `InvalidWriteError`; orphaned
 * `extend a -> b` blocks still go with a removed relationship.
 *
 * "Only the selected relationship changes" is observed on the text: the
 * sources before and after the selected declaration are byte-equal.
 * Acceptances pass the accepted-write bundle; LikeC4's own warning shows that
 * a leftover `extend` block would be caught.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator, RelationshipAmbiguityError, type RelationshipSelector } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { expectAcceptedWrite, expectValidLikeC4, introducedWarnings } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  relationship sync
  relationship async {
    title 'Async'
  }
}
`;
const VIEWS = 'views {\n  view index {\n    include *\n  }\n}\n';

/** The two writes every selector case runs through. */
const WRITES: Array<[string, (m: LikeC4Mutator, selector: RelationshipSelector) => unknown]> = [
  ['updateRelationship', (m, selector) => m.updateRelationship(selector, { technology: 'HTTP' })],
  ['removeRelationship', (m, selector) => m.removeRelationship(selector)],
];

/** Run `write` and expect BI: an `InvalidWriteError` on `field`, sources and reads unchanged; returns the error. */
function expectRejected(m: LikeC4Mutator, field: string, write: () => unknown): InvalidWriteError {
  const before = { files: m.serialize(), relationships: m.getRelationships() };
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before.files);
  expect(m.getRelationships()).toEqual(before.relationships);
  return error as InvalidWriteError;
}

/**
 * Expect `after` to differ from `before` only at the declaration `declaration`
 * written at the 1-based `line` / `column` of `before`.  An update leaves the
 * text before and after it byte-equal; a removal leaves `before` without it,
 * up to the whitespace the removal takes with it.
 */
function expectOnlyChanged(
  write: string,
  before: string,
  after: string,
  line: number,
  column: number,
  declaration: string,
): void {
  const start = before.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0) + column - 1;
  expect(before.slice(start, start + declaration.length)).toBe(declaration);
  expect(after).not.toBe(before);
  if (write === 'removeRelationship') {
    const words = (text: string): string => text.replace(/\s+/g, ' ');
    expect(words(after)).toBe(words(before.slice(0, start) + before.slice(start + declaration.length)));
    return;
  }
  expect(after.startsWith(before.slice(0, start)), 'text before the selected declaration').toBe(true);
  expect(after.endsWith(before.slice(start + declaration.length)), 'text after the selected declaration').toBe(true);
}

describe('selector fields (row 129)', () => {
  const SOURCE = `${SPEC}model {
  a = service
  b = service
  a -> b 'plain'
  a -[sync]-> b 'plain'
  a <-> b 'both'
  a -> b 'other'
  a -[async]-> b
}
${VIEWS}`;
  const FIELDS: Array<[string, RelationshipSelector, number, string]> = [
    ['matchKind', { source: 'a', target: 'b', matchKind: 'sync' }, 12, "a -[sync]-> b 'plain'"],
    ['matchTitle (the inline title)', { source: 'a', target: 'b', matchTitle: 'other' }, 14, "a -> b 'other'"],
    ['matchBidirectional', { source: 'a', target: 'b', matchBidirectional: true }, 13, "a <-> b 'both'"],
    ['the reverse order of a <-> b', { source: 'b', target: 'a' }, 13, "a <-> b 'both'"],
  ];
  const cases = WRITES.flatMap(([write, run]) => FIELDS.map(([field, selector, line, text]) => [write, field, run, selector, line, text] as const));

  it.each(cases)('%s by %s changes only the selected relationship', async (write, __, run, selector, line, declaration) => {
    const before = { 'm.c4': SOURCE };
    const m = LikeC4Mutator.fromFiles(before);
    run(m, selector);
    const after = m.serialize();
    expectOnlyChanged(write, before['m.c4'], after['m.c4']!, line, 3, declaration);
    await expectAcceptedWrite(before, after);
  });

  it.each(WRITES)('%s: matchTitle compares the written title, not the kind title', (_, run) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expectRejected(m, 'source', () => run(m, { source: 'a', target: 'b', matchTitle: 'Async', matchKind: 'async' }));
  });
});

const TWO_LINES = `${SPEC}model {
  a = service
  b = service
  a -> b 'same'
  a -> b 'same'
}
${VIEWS}`;
const ONE_LINE = `${SPEC}model {
  a = service
  b = service
  a -> b 'same' a -> b 'same'
}
${VIEWS}`;
const IDENTICAL: Array<[string, string, Array<{ line: number; column: number }>]> = [
  ['on different lines', TWO_LINES, [{ line: 11, column: 3 }, { line: 12, column: 3 }]],
  ['on one line', ONE_LINE, [{ line: 11, column: 3 }, { line: 11, column: 17 }]],
];

describe('identical relationships are ambiguous (rows 130, 132)', () => {
  const cases = WRITES.flatMap(([write, run]) => IDENTICAL.map(([where, source, positions]) => [write, where, run, source, positions] as const));

  it.each(cases)('%s of two identical relationships %s is a RelationshipAmbiguityError listing both', async (_, __, run, source, positions) => {
    // P: LikeC4 accepts the two identical relationships.
    await expectValidLikeC4({ 'm.c4': source });
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    const error = expectRejected(m, 'source', () => run(m, { source: 'a', target: 'b' }));
    expect(error).toBeInstanceOf(RelationshipAmbiguityError);
    const candidates = (error as RelationshipAmbiguityError).candidates;
    expect(candidates).toStrictEqual(positions.map((p) => ({ file: 'm.c4', ...p, title: 'same', bidirectional: false })));
    // Row 132 (D106): the message prints each candidate's position as file:line:column.
    for (const c of candidates) expect(error.message).toContain(`${c.file}:${c.line}:${c.column}`);
  });
});

describe('what a candidate reports (row 130)', () => {
  const PAIRS: Array<[string, string, Record<string, unknown>]> = [
    ['kinded relationships', "a -[sync]-> b 'same'", { kind: 'sync', title: 'same', bidirectional: false }],
    ['untitled relationships of a kind with a title', 'a -[async]-> b', { kind: 'async', effectiveTitle: 'Async', bidirectional: false }],
    ['bidirectional relationships', 'a <-> b', { bidirectional: true }],
  ];
  const cases = WRITES.flatMap(([write, run]) => PAIRS.map(([label, relationship, fields]) => [write, label, run, relationship, fields] as const));

  it.each(cases)('%s of two identical %s lists exactly their fields', (_, __, run, relationship, fields) => {
    const source = `${SPEC}model {\n  a = service\n  b = service\n  ${relationship}\n  ${relationship}\n}\n${VIEWS}`;
    const m = LikeC4Mutator.fromFiles({ 'm.c4': source });
    const error = expectRejected(m, 'source', () => run(m, { source: 'a', target: 'b' }));
    expect(error).toBeInstanceOf(RelationshipAmbiguityError);
    expect((error as RelationshipAmbiguityError).candidates).toStrictEqual([
      { file: 'm.c4', line: 11, column: 3, ...fields },
      { file: 'm.c4', line: 12, column: 3, ...fields },
    ]);
  });
});

describe('a position names its file (row 131)', () => {
  const BEFORE = {
    'a.c4': `${SPEC}model {\n  a = service\n  b = service\n}\n${VIEWS}`,
    'm.c4': "model {\n  a -> b 'same'\n}\n",
    'n.c4': "model {\n  a -> b 'same'\n}\n",
  };

  it.each(WRITES)('%s at the same line and column in two files selects the named file', async (write, run) => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    run(m, { source: 'a', target: 'b', position: { file: 'n.c4', line: 2, column: 3 } });
    const after = m.serialize();
    expect(after['m.c4']).toBe(BEFORE['m.c4']);
    expectOnlyChanged(write, BEFORE['n.c4'], after['n.c4']!, 2, 3, "a -> b 'same'");
    await expectAcceptedWrite(BEFORE, after);
  });
});

describe('a bidirectional relationship next to one that shares an endpoint (row 129)', () => {
  const OTHERS: Array<[string, string]> = [
    ['c <-> a', '  c <-> a\n'],
    ['b <-> c', '  b <-> c\n'],
  ];
  const cases = WRITES.flatMap(([write, run]) => OTHERS.map(([label, other]) => [write, label, run, other] as const));

  it.each(cases)('%s from a to b next to %s selects a <-> b only', async (write, _, run, other) => {
    const before = { 'm.c4': `${SPEC}model {\n  a = service\n  b = service\n  c = service\n  a <-> b\n${other}}\n${VIEWS}` };
    const m = LikeC4Mutator.fromFiles(before);
    run(m, { source: 'a', target: 'b' });
    const after = m.serialize();
    expectOnlyChanged(write, before['m.c4'], after['m.c4']!, 12, 3, 'a <-> b');
    await expectAcceptedWrite(before, after);
  });
});

describe('a candidate position passed back selects it (row 131)', () => {
  const cases = WRITES.flatMap(([write, run]) =>
    IDENTICAL.flatMap(([where, source]) => [0, 1].map((index) => [write, where, index, run, source] as const)),
  );

  it.each(cases)('%s %s, candidate %i', async (write, __, index, run, source) => {
    const before = { 'm.c4': source };
    const m = LikeC4Mutator.fromFiles(before);
    let error: unknown;
    try {
      run(m, { source: 'a', target: 'b' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(RelationshipAmbiguityError);
    const candidate = (error as RelationshipAmbiguityError).candidates[index]!;
    run(m, { source: 'a', target: 'b', position: { file: candidate.file, line: candidate.line, column: candidate.column } });
    const after = m.serialize();
    expectOnlyChanged(write, source, after['m.c4']!, candidate.line, candidate.column, "a -> b 'same'");
    await expectAcceptedWrite(before, after);
  });
});

describe('no match (row 133, D87)', () => {
  const SOURCE = `${SPEC}model {
  a = service
  b = service
  c = service
  a -> b 'calls'
}
${VIEWS}`;

  it.each(WRITES)('%s of an unknown relationship is an InvalidWriteError on source', (_, run) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expectRejected(m, 'source', () => run(m, { source: 'a', target: 'c' }));
  });

  it.each(WRITES)('%s at a position no matching relationship starts at is an InvalidWriteError on position', (_, run) => {
    const m = LikeC4Mutator.fromFiles({ 'm.c4': SOURCE });
    expectRejected(m, 'position', () => run(m, { source: 'a', target: 'b', position: { file: 'm.c4', line: 12, column: 4 } }));
  });
});

describe('orphaned extend blocks go with the selected relationship (row 137)', () => {
  const BASE = `${SPEC}model {
  a = service
  b = service
  a -> b 'one'
  a -> b 'two'
}
${VIEWS}`;
  const EXT = "model {\n  extend a -> b 'one' {\n    link https://example.com/one\n  }\n  extend a -> b 'two' {\n    link https://example.com/two\n  }\n}\n";
  const before = { 'base.c4': BASE, 'ext.c4': EXT };

  it('removes the block that applied only to the removed relationship and keeps the other', async () => {
    // P: a block left behind matches nothing, which LikeC4 warns about — the bundle's warning check would see it.
    const leftover = { 'base.c4': BASE.replace("  a -> b 'one'\n", ''), 'ext.c4': EXT };
    const warnings = await introducedWarnings(before, leftover);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.startsWith('ext.c4:')).toBe(true);

    const m = LikeC4Mutator.fromFiles(before);
    expect(m.removeRelationship({ source: 'a', target: 'b', matchTitle: 'one' })).toEqual({ changedFiles: ['base.c4', 'ext.c4'] });
    const after = m.serialize();
    expect(after['base.c4']).toBe(leftover['base.c4']);
    expect(after['ext.c4']).toBe("model {\n  extend a -> b 'two' {\n    link https://example.com/two\n  }\n}\n");
    await expectAcceptedWrite(before, after);
  });
});
