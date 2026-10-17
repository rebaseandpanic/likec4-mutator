/**
 * The default file of model-level writes (FR-021, D62; rows 21 and 22 of
 * the lc4m-15.30 test matrix): a root `addElement` and a top-level
 * `addRelationship` go to the first `model` block of the first file, in
 * LikeC4's document order, that has one; when no loaded file has a `model`
 * block, a new one is appended to the first file in that order.
 *
 * Expected files and texts come from FR-021 / D62 and the request (the
 * `name = kind` form and `source -> target` are the forms the writes
 * produce); LikeC4's document order is the path order shown by
 * `buildLikeC4Model`; every accepted write passes the accepted-write bundle.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { buildLikeC4Model, expectAcceptedWrite } from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

const SPEC = `specification {
  element system
}
`;

/** The names of the files whose text differs between `before` and `after`. */
function changed(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after).filter((name) => after[name] !== before[name]);
}

// ---------------------------------------------------------------------------
// Row 21: load order differs from document order
// ---------------------------------------------------------------------------

describe('default file: LikeC4 document order, not load order (row 21)', SLOW, () => {
  // Loaded b.c4 first; LikeC4 orders a/z.c4 first (path order).
  const FILES = {
    'b.c4': `${SPEC}model {\n  second = system\n}\n`,
    'a/z.c4': 'model {\n  first = system\n}\n',
  };

  it('LikeC4 orders a/z.c4 before b.c4 (P)', async () => {
    const { elements } = await buildLikeC4Model(FILES);
    expect(Object.keys(elements)).toEqual(['first', 'second']);
  });

  it.each([
    {
      name: 'root addElement',
      write: (m: LikeC4Mutator) => m.addElement(null, { name: 'added', kind: 'system' }),
      expected: 'model {\n  first = system\n  added = system\n}\n',
    },
    {
      name: 'top-level addRelationship',
      write: (m: LikeC4Mutator) => m.addRelationship('second', 'first'),
      expected: 'model {\n  first = system\n  second -> first\n}\n',
    },
  ])('$name changes only a/z.c4', async ({ write, expected }) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    write(m);
    const after = m.serialize();
    expect(changed(FILES, after)).toEqual(['a/z.c4']);
    expect(after['a/z.c4']).toBe(expected);
    await expectAcceptedWrite(FILES, after);
  });
});

// ---------------------------------------------------------------------------
// Row 22: no loaded file has a model block
// ---------------------------------------------------------------------------

describe('default file: no model block anywhere (row 22)', SLOW, () => {
  // Loaded b.c4 first; a.c4 is first in document order.
  const FILES = {
    'b.c4': SPEC,
    'a.c4': '// notes\n',
  };

  it('root addElement appends a model block to a.c4', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    expect(m.addElement(null, { name: 'added', kind: 'system' })).toBe('added');
    const after = m.serialize();
    expect(changed(FILES, after)).toEqual(['a.c4']);
    expect(after['a.c4']).toBe('// notes\n\nmodel {\n  added = system\n}\n');
    expect(m.getElement('added')).toMatchObject({ fqn: 'added', kind: 'system' });
    await expectAcceptedWrite(FILES, after);
  });
});
