/**
 * `updateElement({ style })` and `updateRelationship({ style })` merge the
 * patch into the existing `style { }` block in place (lc4m-15.27, part C
 * item 2): a patched field gets its new value where it is written, a field
 * the block lacks is added to it, and everything else — other fields,
 * comments, separators, indentation — keeps its text.  The merged style is
 * the one LikeC4's model builder computes from the result.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model, expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
}
`;

function lines(text: string): string[] {
  return text.split('\n');
}

/** The lines from the one starting with `first` through the next line that is exactly `last`. */
function block(text: string, first: string, last: string): string[] {
  const all = lines(text);
  const from = all.findIndex((l) => l.startsWith(first));
  expect(from).toBeGreaterThanOrEqual(0);
  const to = all.findIndex((l, i) => i > from && l === last);
  expect(to).toBeGreaterThan(from);
  return all.slice(from, to + 1);
}

async function computedStyle(files: Record<string, string>): Promise<{
  element: unknown;
  relation: Record<string, unknown> | undefined;
}> {
  const model = await buildLikeC4Model(files);
  expect(model.errors).toEqual([]);
  const element = (model.elements['a'] as { style?: unknown } | undefined)?.style;
  const [rel] = model.relations as unknown as Array<Record<string, unknown>>;
  return {
    element,
    relation: rel && { line: rel['line'], color: rel['color'], head: rel['head'], tail: rel['tail'] },
  };
}

describe('updateElement({ style }) merges into the block in place', () => {
  it('keeps comments, untouched fields and separators; rewrites patched values; adds missing fields', async () => {
    const model = `model {
  a = service {
    metadata { k 'v' }
    style {
      // brand colour, see the design guide
      color: red;
      shape cylinder // storage
      opacity 40%
    }
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': model });
    m.updateElement('a', { style: { color: 'blue', border: 'dashed' } });
    const files = m.serialize();
    await expectValidLikeC4(files);
    expect(block(files['model.c4']!, '  a = service {', '  }')).toEqual([
      '  a = service {',
      "    metadata { k 'v' }",
      '    style {',
      '      // brand colour, see the design guide',
      '      color: blue;',
      '      shape cylinder // storage',
      '      opacity 40%',
      '      border dashed',
      '    }',
      '  }',
    ]);
    expect((await computedStyle(files)).element).toEqual({
      color: 'blue',
      shape: 'cylinder',
      opacity: 40,
      border: 'dashed',
    });
  });

  it('rewrites every declaration of a patched field (the last one is what LikeC4 reads)', async () => {
    const model = `model {
  a = service {
    style {
      color red
      color green
    }
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': model });
    m.updateElement('a', { style: { color: 'amber' } });
    const files = m.serialize();
    await expectValidLikeC4(files);
    expect(block(files['model.c4']!, '    style {', '    }')).toEqual([
      '    style {',
      '      color amber',
      '      color amber',
      '    }',
    ]);
    expect((await computedStyle(files)).element).toEqual({ color: 'amber' });
  });

  it('adds a field to a one-line block on its line', async () => {
    const model = `model {\n  a = service {\n    style { color red }\n  }\n}\n`;
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': model });
    m.updateElement('a', { style: { shape: 'cylinder', multiple: true } });
    const files = m.serialize();
    await expectValidLikeC4(files);
    expect(lines(files['model.c4']!)).toContain('    style { color red shape cylinder multiple true }');
    expect((await computedStyle(files)).element).toEqual({ color: 'red', shape: 'cylinder', multiple: true });
  });
});

describe('updateRelationship({ style }) merges into the block in place', () => {
  it('keeps comments and untouched fields; rewrites patched values; adds missing fields', async () => {
    const model = `model {
  a = service
  b = service
  a -> b {
    style {
      // dashed: asynchronous
      line dashed
      head diamond
    }
  }
}
`;
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': model });
    m.updateRelationship({ source: 'a', target: 'b' }, { style: { head: 'vee', color: 'red' } });
    const files = m.serialize();
    await expectValidLikeC4(files);
    expect(block(files['model.c4']!, '  a -> b {', '  }')).toEqual([
      '  a -> b {',
      '    style {',
      '      // dashed: asynchronous',
      '      line dashed',
      '      head vee',
      '      color red',
      '    }',
      '  }',
    ]);
    expect((await computedStyle(files)).relation).toEqual({
      line: 'dashed',
      color: 'red',
      head: 'vee',
      tail: undefined,
    });
  });
});
