/**
 * Text written into a file uses the file's line ending (lc4m-15.27, part C
 * item 4): after any write op a file with CRLF line endings has no lone LF,
 * and a file with LF line endings has no CR.  Every result must still pass
 * `likec4 validate`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model, expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  tag t
  tag u
}
`;

const MODEL = `model {
  a = service 'A' {
    #t
    description 'x'
    link https://example.com/a
    style {
      color red
    }
    metadata {
      owner 'team'
    }
    child = service
  }
  b = service
  c = service { description 'one line' }
  d = service
  a -> b 'calls' {
    description 'x'
  }
  a -> c
}
views {
  view index {
    include *
  }
}
`;

const MULTI_LINE = 'apiVersion: v1\nkind: X';

const OPS: Array<[string, (m: LikeC4Mutator) => unknown]> = [
  [
    'addElement with every property',
    (m) =>
      m.addElement('a', {
        name: 'e',
        kind: 'service',
        title: 'E',
        summary: 's',
        description: 'd',
        technology: 'go',
        tags: ['u'],
        links: [{ url: 'https://example.com/e', label: 'E' }],
        style: { shape: 'cylinder' },
        metadata: { k: 'v', manifest: MULTI_LINE, list: ['x', 'y'] },
      }),
  ],
  ['addElement into a one-line body', (m) => m.addElement('c', { name: 'e', kind: 'service' })],
  ['addElement at model level', (m) => m.addElement(null, { name: 'e', kind: 'service', description: 'd' })],
  [
    'addRelationship with every property',
    (m) =>
      m.addRelationship('b', 'c', 'uses', {
        description: 'd',
        technology: 't',
        tags: ['u'],
        links: [{ url: 'https://example.com/r' }],
        metadata: { k: 'v' },
        style: { line: 'dashed' },
      }),
  ],
  ['addView', (m) => m.addView({ id: 'v', type: 'element', target: 'a', title: 'V', includes: ['*', 'b'] })],
  ['updateElement inserting tags, properties, links, style and metadata', (m) =>
    m.updateElement('b', {
      tags: ['u'],
      technology: 't',
      links: [{ url: 'https://example.com/b' }],
      style: { color: 'red' },
      metadata: { k: 'v' },
    })],
  ['updateElement into an existing body', (m) =>
    m.updateElement('a', {
      tags: ['t', 'u'],
      technology: 't',
      links: [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }],
      style: { shape: 'cylinder' },
      metadata: { added: 'v', manifest: MULTI_LINE, list: ['x', 'y'] },
    })],
  ['updateElement into a one-line body', (m) => m.updateElement('c', { tags: ['u'], technology: 't' })],
  ['updateElement removing the metadata block', (m) => m.updateElement('a', { metadata: { owner: null } })],
  ['updateElement inserting a title', (m) => m.updateElement('d', { title: 'D' })],
  ['updateRelationship into an existing body', (m) =>
    m.updateRelationship({ source: 'a', target: 'b' }, {
      tags: ['u'],
      technology: 't',
      links: [{ url: 'https://example.com/r' }],
      metadata: { k: 'v', manifest: MULTI_LINE },
      style: { line: 'dotted' },
    })],
  ['updateRelationship creating the body', (m) =>
    m.updateRelationship({ source: 'a', target: 'c' }, { label: 'l', description: 'd', tags: ['u'] })],
  ['removeElement', (m) => m.removeElement('a.child')],
  ['removeRelationship', (m) => m.removeRelationship('a', 'b')],
];

async function runOp(eol: '\n' | '\r\n', op: (m: LikeC4Mutator) => unknown): Promise<Record<string, string>> {
  const files = { 'spec.c4': SPEC.replace(/\n/g, eol), 'model.c4': MODEL.replace(/\n/g, eol) };
  const m = LikeC4Mutator.fromFiles(files);
  op(m);
  const out = m.serialize();
  expect(out['model.c4']).not.toBe(files['model.c4']);
  await expectValidLikeC4(out);
  return out;
}

describe('written text uses the line ending of the file', () => {
  it.each(OPS)('CRLF file: %s leaves no lone LF', async (_, op) => {
    const out = await runOp('\r\n', op);
    expect(out['model.c4']).not.toMatch(/(?<!\r)\n/);
  });

  it.each(OPS)('LF file: %s writes no CR', async (_, op) => {
    const out = await runOp('\n', op);
    expect(out['model.c4']).not.toContain('\r');
  });

  it('a multi-line metadata value in a CRLF file reads back with CRLF line breaks, by the library and by LikeC4', async () => {
    const out = await runOp('\r\n', (m) => m.updateElement('d', { metadata: { manifest: MULTI_LINE } }));
    const expected = 'apiVersion: v1\r\nkind: X';
    expect(LikeC4Mutator.fromFiles(out).getElement('d')?.metadata?.['manifest']).toBe(expected);
    expect((await buildLikeC4Model(out)).elements['d']?.metadata?.['manifest']).toBe(expected);
  });
});
