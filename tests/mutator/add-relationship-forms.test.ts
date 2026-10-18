/**
 * The forms of a new relationship (lc4m-15.30 US-5, US-8; FR-011, FR-021,
 * D62, D68, D83, D114; rows 146–150 of the test matrix): `addRelationship`
 * with a kind (bracket and dot form), a direction, nested placement in the
 * source's body, a chosen file, and the `extend` identity guard.
 *
 * Expected values come from the inputs and from LikeC4: the connector line
 * is the requested spelling, and the relationships LikeC4 computes for the
 * result — endpoints, kind, direction, title, values — are those the
 * library reports (`expectRelationshipsAgreeWithLikeC4`).
 *
 * Abbreviations of the matrix: AWB (the accepted-write bundle), BI (an
 * `InvalidWriteError` on the named field, sources and reads unchanged), REL
 * (`error.related` equals a literal list).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { buildLikeC4Model, expectAcceptedWrite, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;
type Opts = NonNullable<Parameters<LikeC4Mutator['addRelationship']>[3]>;

const SPEC = "specification {\n  element sys\n  relationship calls\n  tag t\n  tag u\n}\n";
const MODEL = `model {
  app = sys 'App' {
    api = sys 'API'
    db = sys 'DB'
  }
  ext = sys 'Ext'
  other = sys 'Other' {
    api = sys 'Other API'
  }
}
views {
  view index {
    include *
  }
}
`;
const FILES: Files = { 'spec.c4': SPEC, 'model.c4': MODEL };

/** Every read the mutator offers, for BI. */
function reads(mutator: LikeC4Mutator): string {
  return JSON.stringify([mutator.listElements(), mutator.getRelationships(), mutator.listViews()]);
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

/** The values every spelling of row 146 carries. */
const VALUES: Opts = {
  description: 'Reads the data',
  technology: 'HTTP',
  tags: ['t', 'u'],
  links: [{ url: 'https://example.com/api', label: 'Docs' }],
  metadata: { owner: 'team', zones: ['a', 'b'] },
  style: { line: 'dashed', color: 'red' },
};

describe('every US-8 spelling (row 146)', SLOW, () => {
  it.each([
    ['-[k]->', { kind: 'calls' }, 'top', 'app.api -[calls]-> ext'],
    ['.k', { kind: 'calls', kindForm: 'dot' }, 'top', 'app.api .calls ext'],
    ['<->', { bidirectional: true }, 'top', 'app.api <-> ext'],
    ['-[k]<->', { kind: 'calls', bidirectional: true }, 'top', 'app.api -[calls]<-> ext'],
    ['nested ->', {}, 'nested', '-> ext'],
    ['nested <->', { bidirectional: true }, 'nested', '<-> ext'],
    ['nested -[k]->', { kind: 'calls' }, 'nested', '-[calls]-> ext'],
    ['nested -[k]<->', { kind: 'calls', bidirectional: true }, 'nested', '-[calls]<-> ext'],
    ['nested .k', { kind: 'calls', kindForm: 'dot' }, 'nested', '.calls ext'],
  ] as const)('%s', async (_label, form, placement, connector) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.addRelationship('app.api', 'ext', 'reads', { ...VALUES, ...form, placement });
    const after = m.serialize();
    expect(after['spec.c4']).toBe(SPEC);
    expect(after['model.c4']).toContain(
      placement === 'top' ? `\n  ${connector} 'reads' {\n` : `\n    api = sys 'API' {\n      ${connector} 'reads' {\n`,
    );
    const added = m.getRelationships().find((r) => r.title === 'reads');
    expect(added).toMatchObject({
      sourceFqn: 'app.api',
      targetFqn: 'ext',
      bidirectional: 'bidirectional' in form,
      ...('kind' in form && { kind: 'calls' }),
    });
    await expectRelationshipsAgreeWithLikeC4(after, m.getRelationships());
    await expectAcceptedWrite(FILES, after);
  });
});

describe('the nested target (row 147)', SLOW, () => {
  it.each([
    ['a sibling, bare', 'app.db', '-> db'],
    ['a distant element, qualified', 'other.api', '-> other.api'],
  ] as const)('writes %s and gives the bodiless source a body', async (_label, target, line) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.addRelationship('app.api', target, 'uses', { placement: 'nested' });
    const after = m.serialize();
    expect(after['model.c4']).toBe(MODEL.replace("    api = sys 'API'\n", `    api = sys 'API' {\n      ${line} 'uses'\n    }\n`));
    const model = await buildLikeC4Model(after);
    expect(model.relations.map((r) => [r.source.model, r.target.model, r.title])).toEqual([['app.api', target, 'uses']]);
    await expectAcceptedWrite(FILES, after);
  });
});

describe('the file of a top-level relationship (row 148)', SLOW, () => {
  it('writes into a chosen file with a model block', async () => {
    const files = { ...FILES, 'other.c4': "model {\n  extra = sys 'Extra'\n}\n" };
    const m = LikeC4Mutator.fromFiles(files);
    m.addRelationship('app', 'ext', 'uses', { file: 'other.c4' });
    const after = m.serialize();
    expect(after).toEqual({ ...files, 'other.c4': "model {\n  extra = sys 'Extra'\n  app -> ext 'uses'\n}\n" });
    await expectAcceptedWrite(files, after);
  });

  it('creates a model block in a chosen file without one', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    m.addRelationship('app', 'ext', 'uses', { file: 'spec.c4' });
    const after = m.serialize();
    expect(after).toEqual({ ...FILES, 'spec.c4': `${SPEC}\nmodel {\n  app -> ext 'uses'\n}\n` });
    await expectAcceptedWrite(FILES, after);
  });

  it('takes the first file in LikeC4’s document order by default, not the first loaded', async () => {
    // P: `z.c4` is loaded first; LikeC4 orders `a/m.c4` before it.
    const files = { 'z.c4': `${SPEC}model {\n  app = sys 'App'\n}\n`, 'a/m.c4': "model {\n  ext = sys 'Ext'\n}\n" };
    expect(Object.keys(files)[0]).toBe('z.c4');
    const m = LikeC4Mutator.fromFiles(files);
    m.addRelationship('app', 'ext', 'uses');
    const after = m.serialize();
    expect(after).toEqual({ ...files, 'a/m.c4': "model {\n  ext = sys 'Ext'\n  app -> ext 'uses'\n}\n" });
    await expectAcceptedWrite(files, after);
  });
});

describe('an extend block with the new identity (row 149)', SLOW, () => {
  const EXT = "model {\n  extend app.api -[calls]-> ext 'reads' {\n    #t\n  }\n}\n";
  const files: Files = { ...FILES, 'ext.c4': EXT };

  it('rejects the relationship on shared, listing the block', () => {
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.addRelationship('app.api', 'ext', 'reads', { kind: 'calls' }), 'shared');
    expect(error.related).toEqual([{ file: 'ext.c4', line: 2, column: 3, construct: 'extend-block' }]);
  });

  it('accepts it with shared, and the block applies', async () => {
    const m = LikeC4Mutator.fromFiles(files);
    m.addRelationship('app.api', 'ext', 'reads', { kind: 'calls', shared: true });
    const after = m.serialize();
    const [added] = m.getRelationships();
    expect(added).toMatchObject({ sourceFqn: 'app.api', targetFqn: 'ext', kind: 'calls', tags: ['t'] });
    await expectRelationshipsAgreeWithLikeC4(after, m.getRelationships());
    await expectAcceptedWrite(files, after);
  });

  it('accepts a relationship of another direction without shared', async () => {
    const m = LikeC4Mutator.fromFiles(files);
    m.addRelationship('app.api', 'ext', 'reads', { kind: 'calls', bidirectional: true });
    const after = m.serialize();
    const [added] = m.getRelationships();
    expect(added).toMatchObject({ bidirectional: true, extendedBy: [] });
    await expectRelationshipsAgreeWithLikeC4(after, m.getRelationships());
  });
});

describe('a refused edit (row 150)', () => {
  // The file the relationship goes into has a syntax error, so the edited file would not parse.
  const BROKEN: Files = { 'spec.c4': SPEC, 'model.c4': `${MODEL}deployment {\n  = =\n}\n` };

  it.each([
    ['top level', {}, 'file'],
    ['nested', { placement: 'nested' }, 'source'],
  ] as const)('is an InvalidWriteError on the input that addresses the text: %s', (_label, opts, field) => {
    const m = LikeC4Mutator.fromFiles(BROKEN);
    // P: the loaded file does not parse.
    expect(m.validate().length).toBeGreaterThan(0);
    expectRejected(m, () => m.addRelationship('app.api', 'ext', 'x', opts as Opts), field);
  });
});

describe('rejections (row 150)', () => {
  it.each([
    ['an undeclared kind', 'app.api', 'ext', { kind: 'nope' }, 'kind'],
    ['the dot form with bidirectional', 'app.api', 'ext', { kind: 'calls', kindForm: 'dot', bidirectional: true }, 'kindForm'],
    ['file with nested placement', 'app.api', 'ext', { placement: 'nested', file: 'model.c4' }, 'file'],
    ['an unresolved target', 'app.api', 'nowhere', {}, 'target'],
    ['an unresolved source', 'nowhere', 'ext', {}, 'source'],
    ['a self-relationship', 'app.api', 'app.api', {}, 'target'],
    ['parent and child', 'app', 'app.api', {}, 'target'],
    ['parent and child, nested', 'app', 'app.db', { placement: 'nested' }, 'target'],
  ] as const)('rejects %s', (_label, source, target, opts, field) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    expectRejected(m, () => m.addRelationship(source, target, 'x', opts as Opts), field);
  });
});
