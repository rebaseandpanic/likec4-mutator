/**
 * Writes of the specification (lc4m-15.30 US-6; FR-021, D33, D62, D67,
 * D94, D100, D107, D114; rows 109–115 of the test matrix): `addKind` for
 * the three kind types, `updateKind` and `addTag`, their file choice and
 * their rejections.
 *
 * Expected values come from LikeC4: the effective defaults of elements,
 * relationships and deployment nodes of a written kind are what its model
 * builder computes for the written files (with the elements, relationships
 * and nodes that use the kind added by the test to the library's output),
 * and the expected texts are the inputs with literal edits.
 *
 * Abbreviations of the matrix: AWB (the accepted-write bundle), BI (an
 * `InvalidWriteError` on the named field, sources and reads unchanged), REL
 * (`error.related` equals a literal list), P (a precondition asserted first).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  buildLikeC4Model,
  expectAcceptedWrite,
  expectAgreesWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
  validateLikeC4,
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
  return JSON.stringify([mutator.getSpecification(), mutator.listElements(), mutator.getRelationships(), mutator.listDeploymentNodes()]);
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

/** `{ file, line, column }` of the first `needle` in `files[file]` (1-based), from the test's own input. */
function at(files: Files, file: string, needle: string): { file: string; line: number; column: number } {
  const text = files[file]!;
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`test input: '${needle}' not found in ${file}`);
  const before = text.slice(0, offset);
  return { file, line: before.split('\n').length, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

const SPEC = `specification {
  element system
  relationship uses
  deploymentNode vm
  tag core
  tag edge
}
`;

const MODEL = `model {
  a = system 'A'
  b = system 'B'
}
`;

/** The library's effective values of every element, relationship and deployment node of `files`, compared with LikeC4. */
async function expectReadsAgree(files: Files): Promise<void> {
  const mutator = LikeC4Mutator.fromFiles(files);
  const elements = mutator.listElements();
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) await expectAgreesWithLikeC4(files, element.fqn, element);
  await expectRelationshipsAgreeWithLikeC4(files, mutator.getRelationships());
  await expectDeploymentNodesAgreeWithLikeC4(files, mutator.listDeploymentNodes());
}

describe('addKind and addTag (row 109)', () => {
  it('adds the three kind types with every default and a tag; elements, relationships and nodes of them read as LikeC4 computes', SLOW, async () => {
    const before: Files = { 'm.c4': SPEC + MODEL };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.addTag('fresh');
    const all = { description: 'The kind', technology: 'Go', tags: ['core', 'fresh'], links: [{ url: 'https://example.com/kind', label: 'Kind' }] };
    mutator.addKind('element', 'service', { title: 'Service', summary: 'Serves', ...all });
    mutator.addKind('relationship', 'calls', { title: 'Calls', ...all });
    mutator.addKind('deploymentNode', 'pod', { title: 'Pod', summary: 'Runs', ...all });
    const after = mutator.serialize();
    await expectAcceptedWrite(before, after);

    // The test uses the new kinds: an element, a relationship and a node of each.
    const used: Files = {
      'm.c4': replaced(after['m.c4']!, [
        ["  b = system 'B'\n", "  b = system 'B'\n  api = service\n  a -[calls]-> b\n"],
      ]) + 'deployment {\n  pod p\n}\n',
    };
    await expectValidLikeC4(used);
    await expectReadsAgree(used);
    const model = await buildLikeC4Model(used);
    expect(model.elements['api']?.title).toBe('Service');
    // The defaults reach the elements, relationships and nodes of each kind (reads agree with LikeC4 above).
    const reread = LikeC4Mutator.fromFiles(used);
    const link = [{ url: 'https://example.com/kind', label: 'Kind' }];
    expect(reread.getElement('api')).toMatchObject({ title: 'Service', summary: 'Serves', description: 'The kind', technology: 'Go', tags: ['core', 'fresh'], links: link });
    expect(reread.getRelationships()[0]).toMatchObject({ title: 'Calls', description: 'The kind', technology: 'Go', tags: ['core', 'fresh'], links: link });
    expect(reread.getDeploymentNode('p')).toMatchObject({ title: 'Pod', summary: 'Runs', description: 'The kind', technology: 'Go', tags: ['core', 'fresh'], links: link });
  });
});

describe('updateKind (row 110)', () => {
  const STYLED = `specification {
  element service {
    #core
    title 'Old title'
    summary 'Old summary'
    technology 'Node'
    link https://example.com/old 'Old'
    notation 'A service'
    style {
      shape rectangle
      color red
    }
  }
  relationship calls {
    title 'Calls'
    description 'Old description'
    color amber
    line dotted
  }
  deploymentNode pod {
    style {
      color green
    }
  }
  tag core
  tag edge
}
model {
  a = service
  b = service
  a -[calls]-> b
}
deployment {
  pod p
}
`;
  it.each([
    [
      'replaces strings, removes one with null, and replaces tags and links of an element kind',
      'element',
      'service',
      { title: 'New title', summary: null, description: 'New description', tags: ['edge'], links: [{ url: 'https://example.com/new' }] },
    ],
    ['replaces and removes the strings of a relationship kind', 'relationship', 'calls', { description: null, technology: 'HTTP' }],
    ['gives a body to a deployment node kind without strings', 'deploymentNode', 'pod', { title: 'Pod', tags: ['core'] }],
  ] as const)('%s', SLOW, async (_, type, name, patch) => {
    const before: Files = { 'm.c4': STYLED };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    expect(mutator.updateKind(type, name, patch)).toEqual({ changedFiles: ['m.c4'] });
    const after = mutator.serialize();
    // Style, notation, colors and the line style are kept byte for byte.
    for (const kept of ["    notation 'A service'\n", '    style {\n      shape rectangle\n      color red\n    }\n', '    color amber\n    line dotted\n', '    style {\n      color green\n    }\n']) {
      expect(after['m.c4']).toContain(kept);
    }
    await expectAcceptedWrite(before, after);
    await expectReadsAgree(after);
  });
});

describe('file choice (row 111)', () => {
  const FILES: Files = {
    'a.c4': `${SPEC}${MODEL}`,
    'b.c4': `model {\n  c = system 'C'\n}\n`,
    'c.c4': `specification {\n  element extra\n}\n`,
  };
  it('P: two specification blocks in one file give the INV-2 warning (spike 04)', async () => {
    const twoBlocks = { 'a.c4': `${SPEC}specification {\n  tag other\n}\n${MODEL}` };
    expect((await buildLikeC4Model(twoBlocks)).diagnostics.some((d) => d.includes('Prefer one specification per document'))).toBe(true);
  });
  it.each([
    ['a chosen file with a block: its block', { file: 'c.c4' }, { 'c.c4': "specification {\n  element extra\n  tag fresh\n}\n" }],
    ['a chosen file without one: a new block', { file: 'b.c4' }, { 'b.c4': "model {\n  c = system 'C'\n}\n\nspecification {\n  tag fresh\n}\n" }],
    ['no file: the first file in document order with a block', {}, { 'a.c4': replaced(FILES['a.c4']!, [['  tag edge\n', '  tag edge\n  tag fresh\n']]) }],
  ] as const)('writes into %s', SLOW, async (_, opts, changed) => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    mutator.addTag('fresh', opts);
    const after = mutator.serialize();
    expect(after).toEqual({ ...FILES, ...changed });
    await expectAcceptedWrite(FILES, after);
  });
  it('writes a new kind into a new block of a chosen file without one', SLOW, async () => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expect(mutator.addKind('element', 'fresh', { file: 'b.c4' })).toEqual({ changedFiles: ['b.c4'] });
    const after = mutator.serialize();
    expect(after).toEqual({ ...FILES, 'b.c4': "model {\n  c = system 'C'\n}\n\nspecification {\n  element fresh\n}\n" });
    await expectAcceptedWrite(FILES, after);
  });
  it('uses LikeC4 document order, not the load order, for the default file', SLOW, async () => {
    // Loaded as views10, views2: LikeC4 orders views2 first.
    const files: Files = {
      'views10.c4': `specification {\n  element late\n}\n`,
      'views2.c4': `specification {\n  element early\n}\nmodel {\n  x = early\n}\n`,
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.addKind('element', 'fresh');
    const after = mutator.serialize();
    expect(after).toEqual({ ...files, 'views2.c4': replaced(files['views2.c4']!, [['  element early\n', '  element early\n  element fresh\n']]) });
    await expectAcceptedWrite(files, after);
  });
});

describe('reserved names (row 112)', () => {
  it.each([
    ['an element kind', 'element'],
    ['a relationship kind', 'relationship'],
    ['a deployment node kind', 'deploymentNode'],
  ] as const)('rejects self as %s, which LikeC4 rejects as a reserved word', async (_, type) => {
    // P: LikeC4 reports the declaration when written by hand.
    expect(await validateLikeC4({ 'm.c4': replaced(SPEC + MODEL, [['  tag core\n', `  ${type} self\n  tag core\n`]]) })).not.toEqual([]);
    const mutator = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + MODEL });
    expectRejected(mutator, () => mutator.addKind(type, 'self'), 'name');
  });
  it('accepts self as a tag, which LikeC4 accepts', SLOW, async () => {
    const before: Files = { 'm.c4': SPEC + MODEL };
    // P: LikeC4 accepts the tag when written by hand.
    await expectValidLikeC4({ 'm.c4': replaced(SPEC + MODEL, [['  tag core\n', '  tag self\n  tag core\n']]) });
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.addTag('self');
    await expectAcceptedWrite(before, mutator.serialize());
  });
});

describe('names (row 112)', () => {
  it('accepts the element kind `model` and rejects `view` (D67)', SLOW, async () => {
    const before: Files = { 'm.c4': SPEC + MODEL };
    const mutator = LikeC4Mutator.fromFiles(before);
    expectRejected(mutator, () => mutator.addKind('element', 'view'), 'name');
    mutator.addKind('element', 'model');
    await expectAcceptedWrite(before, mutator.serialize());
  });
  it.each([
    ['an element kind named like a deployment node kind', 'element', 'vm'],
    ['a deployment node kind named like an element kind', 'deploymentNode', 'system'],
    ['a relationship kind named like an element kind', 'relationship', 'system'],
    ['an element kind named like a tag', 'element', 'core'],
  ] as const)('accepts %s', SLOW, async (_, type, name) => {
    const before: Files = { 'm.c4': SPEC + MODEL };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.addKind(type, name);
    await expectAcceptedWrite(before, mutator.serialize());
  });
  it('accepts a tag named like a kind', SLOW, async () => {
    const before: Files = { 'm.c4': SPEC + MODEL };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.addTag('system');
    await expectAcceptedWrite(before, mutator.serialize());
  });
});

describe('rejections (row 113)', () => {
  const FILES: Files = {
    'a.c4': SPEC + MODEL,
    'b.c4': `specification {\n  element twice\n  element twice\n}\n`,
  };
  it.each([
    ['a same-type duplicate in another file', (m: LikeC4Mutator) => m.addKind('element', 'twice'), 'name'],
    ['a tag declared already', (m: LikeC4Mutator) => m.addTag('core'), 'name'],
    ['summary on a relationship kind', (m: LikeC4Mutator) => m.addKind('relationship', 'calls', { summary: 'x' }), 'summary'],
    ['summary in an update of a relationship kind', (m: LikeC4Mutator) => m.updateKind('relationship', 'uses', { summary: 'x' }), 'summary'],
    ['an undeclared tag', (m: LikeC4Mutator) => m.addKind('element', 'service', { tags: ['nope'] }), 'tags[0]'],
    ['an update of an undeclared kind', (m: LikeC4Mutator) => m.updateKind('element', 'nope', { title: 'x' }), 'name'],
    ['an update of a kind declared twice (D94)', (m: LikeC4Mutator) => m.updateKind('element', 'twice', { title: 'x' }), 'name'],
    ['an empty update', (m: LikeC4Mutator) => m.updateKind('element', 'system', {}), 'patch'],
    ['a file that is not loaded', (m: LikeC4Mutator) => m.addKind('element', 'service', { file: 'z.c4' }), 'file'],
    ['an unknown kind type', (m: LikeC4Mutator) => m.addKind('node' as 'element', 'service'), 'type'],
    ['an unknown kind type in an update', (m: LikeC4Mutator) => m.updateKind('node' as 'element', 'system', { title: 'x' }), 'type'],
    ['an invalid link', (m: LikeC4Mutator) => m.addKind('element', 'service', { links: [{ url: 'not a url' }] }), 'links[0].url'],
    ['an undeclared tag in an update', (m: LikeC4Mutator) => m.updateKind('element', 'system', { tags: ['nope'] }), 'tags[0]'],
    ['an invalid link in an update', (m: LikeC4Mutator) => m.updateKind('element', 'system', { links: [{ url: 'not a url' }] }), 'links[0].url'],
  ] as const)('rejects %s', (_, write, field) => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expectRejected(mutator, () => write(mutator), field);
  });
});

describe('a relationship kind title and extend blocks (row 114)', () => {
  const FILES = (kindTitle: string, extendTitle: string): Files => ({
    'm.c4': `specification {
  element system
  relationship calls${kindTitle}
  tag core
}
model {
  a = system 'A'
  b = system 'B'
  a -[calls]-> b
}
`,
    'e.c4': `model {
  extend a -[calls]-> b${extendTitle} {
    #core
  }
}
`,
  });
  it.each([
    ['setting a title detaches a block matched by the empty title', FILES('', ''), 'Calls'],
    ['changing the title detaches the block matched by it', FILES(" {\n    title 'Calls'\n  }", " 'Calls'"), 'Invokes'],
    ['removing the title detaches the block matched by it', FILES(" {\n    title 'Calls'\n  }", " 'Calls'"), null],
    ['setting a title attaches a block written with it', FILES('', " 'Calls'"), 'Calls'],
    ['removing the title attaches a block written without one', FILES(" {\n    title 'Calls'\n  }", ''), null],
  ] as const)('rejects %s, listing the block', async (_, files, title) => {
    const mutator = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(mutator, () => mutator.updateKind('relationship', 'calls', { title }), 'title');
    expect(error.related).toEqual([{ ...at(files, 'e.c4', 'extend a'), construct: 'extend-block' }]);
  });
  it('accepts a title change when no extend block is affected', SLOW, async () => {
    const files: Files = { 'm.c4': FILES('', '')['m.c4']! };
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.updateKind('relationship', 'calls', { title: 'Calls' });
    const after = mutator.serialize();
    await expectAcceptedWrite(files, after);
    expect(after['m.c4']).toContain("  relationship calls {\n    title 'Calls'\n  }\n");
    const reread = LikeC4Mutator.fromFiles(after);
    await expectRelationshipsAgreeWithLikeC4(after, reread.getRelationships());
    expect(reread.getRelationships()[0]?.title).toBe('Calls');
  });
  it('accepts a title change when the blocks belong to titled relationships or another kind', SLOW, async () => {
    const files: Files = {
      'm.c4': `specification {
  element system
  relationship calls
  relationship uses
  tag core
}
model {
  a = system 'A'
  b = system 'B'
  c = system 'C'
  a -[calls]-> b
  a -[calls]-> c 'Own'
  b -[uses]-> c
}
`,
      'e.c4': "model {\n  extend a -[calls]-> c 'Own' {\n    #core\n  }\n  extend b -[uses]-> c {\n    #core\n  }\n}\n",
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.updateKind('relationship', 'calls', { title: 'Calls' });
    const after = mutator.serialize();
    await expectAcceptedWrite(files, after);
    await expectRelationshipsAgreeWithLikeC4(after, LikeC4Mutator.fromFiles(after).getRelationships());
  });
  it('accepts an element kind title change next to a block of a relationship kind of the same name', SLOW, async () => {
    const files: Files = {
      'm.c4': "specification {\n  element system\n  element calls\n  relationship calls\n  tag core\n}\nmodel {\n  a = system 'A'\n  b = system 'B'\n  a -[calls]-> b\n}\n",
      'e.c4': 'model {\n  extend a -[calls]-> b {\n    #core\n  }\n}\n',
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.updateKind('element', 'calls', { title: 'X' });
    await expectAcceptedWrite(files, mutator.serialize());
  });
  it('accepts a title change next to an unresolved relationship of the kind and a block with its written endpoints', () => {
    const files: Files = {
      'm.c4': "specification {\n  element system\n  relationship calls\n  tag core\n}\nmodel {\n  a = system 'A'\n  a -[calls]-> ghost\n  extend a -[calls]-> ghost {\n    #core\n  }\n}\n",
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    expect(mutator.updateKind('relationship', 'calls', { title: 'Calls' })).toEqual({ changedFiles: ['m.c4'] });
  });
});

describe('kind and tag names at unmodelled places (row 115)', () => {
  const FILES: Files = {
    'm.c4': `specification {
  element system
}
model {
  fresh = system 'Fresh'
  other = system 'Other'
}
global {
  predicateGroup g {
    include fresh
  }
}
views {
  dynamic view d {
    fresh -> other
    opt {
      fresh -> other
    }
  }
}
`,
  };
  it.each([
    ['an element kind', (m: LikeC4Mutator) => m.addKind('element', 'fresh')],
    ['a tag', (m: LikeC4Mutator) => m.addTag('fresh')],
  ] as const)('accepts %s named like a bare identifier in an opaque block and a global predicate (D107)', SLOW, async (_, write) => {
    await expectValidLikeC4(FILES);
    const mutator = LikeC4Mutator.fromFiles(FILES);
    write(mutator);
    await expectAcceptedWrite(FILES, mutator.serialize());
  });
});

describe('names the grammar would read as another name (row 112)', () => {
  it.each([
    ['an element kind with a comment', (m: LikeC4Mutator) => m.addKind('element', 'svc // note')],
    ['an element kind with a trailing space', (m: LikeC4Mutator) => m.addKind('element', 'svc ')],
    ['an element kind with a body', (m: LikeC4Mutator) => m.addKind('element', 'svc {}')],
    ['a tag with a comment', (m: LikeC4Mutator) => m.addTag('hot // x')],
    ['a tag with a line comment and more', (m: LikeC4Mutator) => m.addTag('x // c')],
  ] as const)('rejects %s on name', (_, write) => {
    const mutator = LikeC4Mutator.fromFiles({ 'm.c4': SPEC + MODEL });
    expectRejected(mutator, () => write(mutator), 'name');
  });
});

describe('an edit the file would not parse after (row 113)', () => {
  // The only specification is in a file with a stray closing brace.
  const BROKEN: Files = { 'm.c4': `${SPEC}${MODEL}}\n` };
  it.each([
    ['addKind', (m: LikeC4Mutator) => m.addKind('element', 'fresh')],
    ['updateKind', (m: LikeC4Mutator) => m.updateKind('element', 'system', { title: 'X' })],
    ['addTag', (m: LikeC4Mutator) => m.addTag('fresh')],
  ] as const)('refuses %s on name', (_, write) => {
    const mutator = LikeC4Mutator.fromFiles(BROKEN);
    // P: the loaded file does not parse.
    expect(mutator.validate().length).toBeGreaterThan(0);
    expectRejected(mutator, () => write(mutator), 'name');
  });
});

describe('what updateKind writes (row 110)', () => {
  const KIND = `specification {
  element service {
    #core
    title 'Old title'
    summary 'Old summary'
    technology 'Node'
    link https://example.com/old 'Old'
    notation 'A service'
    style {
      shape rectangle
    }
  }
  relationship uses
  deploymentNode pod {
    title 'Old pod'
  }
  tag core
  tag edge
}
model {
  a = service
}
deployment {
  pod p
}
`;
  /** The declaration of the element kind in `text`. */
  const serviceKind = (text: string): string => text.slice(text.indexOf('  element service {'), text.indexOf('  relationship uses'));

  it('replaces each element kind string once, removes summary and replaces tags and links', SLOW, async () => {
    const before: Files = { 'm.c4': KIND };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.updateKind('element', 'service', {
      title: 'New title',
      summary: null,
      description: 'New description',
      tags: ['edge'],
      links: [{ url: 'https://example.com/new' }],
    });
    const after = mutator.serialize();
    const block = serviceKind(after['m.c4']!);
    expect(block.split("title 'New title'").length - 1).toBe(1);
    expect(block).not.toContain('Old title');
    expect(block).not.toContain('summary');
    expect(block.split("description 'New description'").length - 1).toBe(1);
    expect(block).toContain('#edge');
    expect(block).not.toContain('#core');
    expect(block).toContain('link https://example.com/new\n');
    expect(block).not.toContain('https://example.com/old');
    expect(block).toContain("    technology 'Node'\n    ");
    expect(block).toContain("    notation 'A service'\n    style {\n      shape rectangle\n    }\n");
    await expectAcceptedWrite(before, after);
    await expectReadsAgree(after);
  });

  it('replaces a deployment node kind title in place', SLOW, async () => {
    const before: Files = { 'm.c4': KIND };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.updateKind('deploymentNode', 'pod', { title: 'Pod' });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(KIND, [["    title 'Old pod'\n", "    title 'Pod'\n"]]));
    await expectAcceptedWrite(before, after);
  });

  it('writes several tags on one line', SLOW, async () => {
    const before: Files = { 'm.c4': KIND };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.updateKind('element', 'service', { tags: ['core', 'edge'] });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(KIND, [['    #core\n', '    #core #edge\n']]));
    await expectAcceptedWrite(before, after);
  });

  it('removes the tags line with tags: [] and leaves no blank line', SLOW, async () => {
    const before: Files = { 'm.c4': KIND };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.updateKind('element', 'service', { tags: [] });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(KIND, [['    #core\n', '']]));
    await expectAcceptedWrite(before, after);
  });

  it('gives a kind without a body one with tags and links', SLOW, async () => {
    const before: Files = { 'm.c4': KIND };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.updateKind('relationship', 'uses', { tags: ['core'], links: [{ url: 'https://example.com/uses', label: 'Uses' }] });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(replaced(KIND, [['  relationship uses\n', "  relationship uses {\n    #core\n    link https://example.com/uses 'Uses'\n  }\n"]]));
    await expectAcceptedWrite(before, after);
  });
});
