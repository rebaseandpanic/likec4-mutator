/**
 * Text written into a file uses the file's line ending (lc4m-15.27, part C
 * item 4): after any write op a file with CRLF line endings has no lone LF,
 * and a file with LF line endings has no CR.  Every result must still pass
 * `likec4 validate`.  The deployment writers are covered the same way, plus
 * the new `deployment` block they create in a file that has none
 * (tests.md row 92).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model, expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  deploymentNode zone
  deploymentNode vm
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

const DEPLOYMENT = `deployment {
  zone prod {
    vm vm1 {
      #t
      metadata {
        owner 'team'
      }
      api = instanceOf a
      instanceOf b
    }
    vm vm2 {
      instanceOf c
    }
    vm1.api -> vm2.c 'reads' {
      description 'x'
    }
  }
  extend prod.vm2 {
    #u
  }
}
`;

const MULTI_LINE = 'apiVersion: v1\nkind: X';

/** Every property of a node or instance, a multi-line metadata value included. */
const DECLARATION = {
  title: 'T',
  summary: 's',
  description: 'd',
  technology: 'go',
  tags: ['u'],
  links: [{ url: 'https://example.com/n', label: 'N' }],
  style: { shape: 'cylinder' as const },
  metadata: { k: 'v', manifest: MULTI_LINE, list: ['x', 'y'] },
};

/** The relationship `prod.vm1.api -> prod.vm2.c 'reads'` of {@link DEPLOYMENT}. */
const READS = { source: { id: 'prod.vm1.api' }, target: { id: 'prod.vm2.c' } };

/** Name, write op, and the file it changes (`model.c4` when not given). */
const OPS: Array<[string, (m: LikeC4Mutator) => unknown, string?]> = [
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
  ['addDeploymentNode as a root node', (m) => m.addDeploymentNode(null, { name: 'dr', kind: 'zone', ...DECLARATION }), 'deployment.c4'],
  ['addDeploymentNode into an existing body', (m) => m.addDeploymentNode('prod', { name: 'vm3', kind: 'vm', ...DECLARATION }), 'deployment.c4'],
  ['updateDeploymentNode tags and metadata in an existing body', (m) =>
    m.updateDeploymentNode('prod.vm1', { tags: ['t', 'u'], metadata: { owner: null, k: 'v', manifest: MULTI_LINE } }), 'deployment.c4'],
  ['updateDeploymentNode creating the body', (m) =>
    m.updateDeploymentNode('prod', { title: 'Prod', technology: 't', links: [{ url: 'https://example.com/p' }], style: { color: 'red' } }), 'deployment.c4'],
  ['removeDeploymentNode', (m) => m.removeDeploymentNode('prod.vm2'), 'deployment.c4'],
  ['addDeploymentInstance', (m) => m.addDeploymentInstance('prod.vm2', { element: 'd', name: 'd1', ...DECLARATION }), 'deployment.c4'],
  ['updateDeploymentInstance creating the body', (m) =>
    m.updateDeploymentInstance('prod.vm1.api', { title: 'API', tags: ['u'], links: [{ url: 'https://example.com/i' }], metadata: { k: 'v' } }), 'deployment.c4'],
  ['removeDeploymentInstance', (m) => m.removeDeploymentInstance('prod.vm1.b'), 'deployment.c4'],
  ['addDeploymentRelationship with every property', (m) =>
    m.addDeploymentRelationship({ id: 'prod.vm1.b' }, { id: 'prod.vm2.c' }, {
      bidirectional: true,
      title: 'syncs',
      description: 'd',
      technology: 't',
      tags: ['u'],
      links: [{ url: 'https://example.com/r' }],
      metadata: { k: 'v', manifest: MULTI_LINE },
      style: { line: 'dashed' },
    }), 'deployment.c4'],
  ['updateDeploymentRelationship into an existing body', (m) =>
    m.updateDeploymentRelationship(READS, {
      tags: ['u'],
      technology: 't',
      links: [{ url: 'https://example.com/r' }],
      metadata: { k: 'v', manifest: MULTI_LINE },
      style: { line: 'dotted' },
    }), 'deployment.c4'],
  ['removeDeploymentRelationship', (m) => m.removeDeploymentRelationship(READS), 'deployment.c4'],
  ['addDeploymentExtend', (m) =>
    m.addDeploymentExtend('prod.vm1', { file: 'deployment.c4', tags: ['u'], links: [{ url: 'https://example.com/x' }], metadata: { k: 'v' } }), 'deployment.c4'],
  ['removeDeploymentExtend', (m) => m.removeDeploymentExtend({ node: 'prod.vm2', file: 'deployment.c4' }), 'deployment.c4'],
];

/**
 * Run `op` on the workspace with every file in `eol` line endings; the op
 * must change `changed`, and the result must be valid.
 */
async function runOp(
  eol: '\n' | '\r\n',
  op: (m: LikeC4Mutator) => unknown,
  changed = 'model.c4',
  sources: Record<string, string> = { 'spec.c4': SPEC, 'model.c4': MODEL, 'deployment.c4': DEPLOYMENT },
): Promise<Record<string, string>> {
  const files = Object.fromEntries(Object.entries(sources).map(([file, text]) => [file, text.replace(/\n/g, eol)]));
  const m = LikeC4Mutator.fromFiles(files);
  op(m);
  const out = m.serialize();
  expect(out[changed]).not.toBe(files[changed]);
  await expectValidLikeC4(out);
  return out;
}

describe('written text uses the line ending of the file', () => {
  it.each(OPS)('CRLF file: %s leaves no lone LF', async (_, op, changed) => {
    const out = await runOp('\r\n', op, changed);
    for (const text of Object.values(out)) expect(text).not.toMatch(/(?<!\r)\n/);
  });

  it.each(OPS)('LF file: %s writes no CR', async (_, op, changed) => {
    const out = await runOp('\n', op, changed);
    for (const text of Object.values(out)) expect(text).not.toContain('\r');
  });

  describe('a new deployment block in a CRLF file that has none', () => {
    it('by the default rule: at the end of the file with the model', async () => {
      const out = await runOp(
        '\r\n',
        (m) => m.addDeploymentNode(null, { name: 'dr', kind: 'zone', ...DECLARATION }),
        'model.c4',
        { 'spec.c4': SPEC, 'model.c4': MODEL },
      );
      expect(out['model.c4']).toContain('deployment {\r\n');
      expect(out['model.c4']).not.toMatch(/(?<!\r)\n/);
    });

    it.each<[string, (m: LikeC4Mutator) => unknown]>([
      ['addDeploymentNode', (m) => m.addDeploymentNode(null, { name: 'dr', kind: 'zone', file: 'extra.c4', ...DECLARATION })],
      ['addDeploymentRelationship', (m) =>
        m.addDeploymentRelationship({ id: 'prod.vm1' }, { id: 'prod.vm2' }, { file: 'extra.c4', title: 'r', technology: 't', tags: ['u'] })],
      ['addDeploymentExtend', (m) => m.addDeploymentExtend('prod.vm1', { file: 'extra.c4', tags: ['u'], metadata: { manifest: MULTI_LINE } })],
    ])('with an explicit file while another file has a block: %s', async (_, op) => {
      const out = await runOp('\r\n', op, 'extra.c4', {
        'spec.c4': SPEC,
        'model.c4': MODEL,
        'deployment.c4': DEPLOYMENT,
        'extra.c4': 'model {\n}\n',
      });
      expect(out['extra.c4']).toContain('deployment {\r\n');
      expect(out['extra.c4']).not.toMatch(/(?<!\r)\n/);
    });
  });

  it('a multi-line metadata value in a CRLF file reads back with CRLF line breaks, by the library and by LikeC4', async () => {
    const out = await runOp('\r\n', (m) => m.updateElement('d', { metadata: { manifest: MULTI_LINE } }));
    const expected = 'apiVersion: v1\r\nkind: X';
    expect(LikeC4Mutator.fromFiles(out).getElement('d')?.metadata?.['manifest']).toBe(expected);
    expect((await buildLikeC4Model(out)).elements['d']?.metadata?.['manifest']).toBe(expected);
  });
});
