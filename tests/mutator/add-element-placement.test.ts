/**
 * Where `addElement` writes (US-5; rows 25, 27 and 28 of the lc4m-15.30
 * test matrix):
 *
 *  - a parent written without a body is given one, in both declaration
 *    forms, with and without inline strings (D64, row 25);
 *  - a model-level element goes into the chosen `file`: its `model` block,
 *    else a new block at its end (row 27);
 *  - `file` is rejected together with a parent, and when it is not exactly
 *    the name of a loaded file (D63, row 28).
 *
 * Expected texts come from D64 / FR-021 and the request (`name = kind` is the
 * form the write produces); expected element values are the ones LikeC4
 * 1.59.4 computes from the written files (`expectAgreesWithLikeC4`); every
 * accepted write passes the accepted-write bundle.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { expectAcceptedWrite, expectAgreesWithLikeC4 } from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

const SPEC = `specification {
  element system
  element service
}
`;

/** The names of the files whose text differs between `before` and `after`. */
function changed(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after).filter((name) => after[name] !== before[name]);
}

// ---------------------------------------------------------------------------
// Row 25: a bodiless parent is given a body
// ---------------------------------------------------------------------------

describe('a parent without a body is given one (row 25)', SLOW, () => {
  it.each([
    { form: 'name = kind', declaration: 'app = system' },
    { form: 'name = kind with inline strings', declaration: "app = system 'App' 'The application'" },
    { form: 'kind name', declaration: 'system app' },
    { form: 'kind name with inline strings', declaration: "system app 'App' 'The application'" },
  ])('$form', async ({ declaration }) => {
    const files = { 'm.c4': `${SPEC}model {\n  ${declaration}\n  other = system\n}\n` };
    const m = LikeC4Mutator.fromFiles(files);
    expect(m.addElement('app', { name: 'svc', kind: 'service' })).toBe('app.svc');
    const after = m.serialize();
    // The declaration is kept byte for byte; the body follows it.
    expect(after['m.c4']).toBe(`${SPEC}model {\n  ${declaration} {\n    svc = service\n  }\n  other = system\n}\n`);
    expect(m.getElement('app')!.children).toEqual(['app.svc']);
    await expectAgreesWithLikeC4(after, 'app', m.getElement('app')!);
    await expectAgreesWithLikeC4(after, 'app.svc', m.getElement('app.svc')!);
    await expectAcceptedWrite(files, after);
  });
});

// ---------------------------------------------------------------------------
// Row 27: a model-level element in the chosen file
// ---------------------------------------------------------------------------

describe('a model-level element goes into the chosen file (row 27)', SLOW, () => {
  // a.c4 is the default file (first in document order with a model block).
  const FILES = {
    'a.c4': 'model {\n  first = system\n}\n',
    'b.c4': `${SPEC}model {\n  second = system\n}\n`,
    'c.c4': '// notes\n',
  };

  it.each([
    { name: 'a file with a model block', file: 'b.c4', expected: `${SPEC}model {\n  second = system\n  added = system\n}\n` },
    { name: 'a file without one (a block is appended)', file: 'c.c4', expected: '// notes\n\nmodel {\n  added = system\n}\n' },
  ])('$name', async ({ file, expected }) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    expect(m.addElement(null, { name: 'added', kind: 'system', file })).toBe('added');
    const after = m.serialize();
    expect(changed(FILES, after)).toEqual([file]);
    expect(after[file]).toBe(expected);
    expect(m.getElement('added')).toMatchObject({ fqn: 'added', kind: 'system' });
    await expectAcceptedWrite(FILES, after);
  });
});

// ---------------------------------------------------------------------------
// Row 28: `file` rejections
// ---------------------------------------------------------------------------

describe('file rejections (row 28)', () => {
  const FILES = { 'm.c4': `${SPEC}model {\n  app = system {\n  }\n}\n` };

  it.each([
    { name: 'file together with a parent', parent: 'app', file: 'm.c4' },
    { name: 'a file that is not loaded', parent: null, file: 'new.c4' },
    { name: 'a loaded file only after normalization', parent: null, file: './m.c4' },
  ])('$name → InvalidWriteError on file, nothing changed', ({ parent, file }) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    const elements = m.listElements();
    let error: unknown;
    try {
      m.addElement(parent, { name: 'added', kind: 'service', file });
    } catch (err) {
      error = err;
    }
    expect(error, 'the write is rejected').toBeInstanceOf(InvalidWriteError);
    expect((error as InvalidWriteError).field).toBe('file');
    expect(m.serialize()).toEqual(FILES);
    expect(m.listElements()).toEqual(elements);
  });
});
