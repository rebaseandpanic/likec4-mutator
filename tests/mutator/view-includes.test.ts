import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model } from '../helpers/likec4-model.js';

const source = `specification {
  element service
}
model {
  app = service {
    api = service
    includeApi = service
  }
}
views {
}
`;

/** The `include ...` rule lines of view `id`, trimmed. */
function includeLines(model: string, id: string): string[] {
  const start = model.indexOf(`view ${id} `);
  expect(start).toBeGreaterThanOrEqual(0);
  return model
    .slice(start, model.indexOf('}', start))
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('include'));
}

describe('LikeC4Mutator.addView includes', () => {
  it.each([
    { name: 'a leading include keyword is stripped once', includes: ['include *', 'include\tapp.api'], expected: ['include *', 'include app.api'] },
    { name: 'surrounding whitespace is trimmed', includes: ['  *  ', ' app.api'], expected: ['include *', 'include app.api'] },
    { name: 'an element whose name starts with include is kept', includes: ['app.includeApi'], expected: ['include app.includeApi'] },
    { name: 'comma-separated expressions stay in one rule', includes: ['include app.api, app.includeApi'], expected: ['include app.api, app.includeApi'] },
  ])('$name', async ({ includes, expected }) => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.addView({ id: 'v', type: 'element', target: 'app', includes });
    const model = m.serialize()['model.c4']!;
    expect(includeLines(model, 'v')).toEqual(expected);
    expect((await buildLikeC4Model({ 'model.c4': model })).errors).toEqual([]);
  });

  it.each([
    { name: 'an empty item', includes: ['*', ''] },
    { name: 'a whitespace-only item', includes: ['  '] },
    { name: 'a bare include keyword', includes: ['include'] },
    { name: 'an include keyword followed only by whitespace', includes: ['*', ' include \n'] },
  ])('throws on $name and leaves the source unchanged', ({ includes }) => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    expect(() => m.addView({ id: 'v', type: 'element', target: 'app', includes })).toThrow(/include/);
    expect(m.serialize()['model.c4']).toBe(source);
  });
});

// An includes item must form exactly one include rule of the view: anything
// that would add another rule, a property or another view is rejected before
// the view is written.
describe('LikeC4Mutator.addView rejects an item that is not exactly one include rule', () => {
  it.each([
    ['element', '* exclude app.api'],
    ['element', '*\n  autoLayout LeftRight'],
    ['element', "*\n  title 'x'"],
    ['element', '* }\n  view other {\n  include *'],
    ['deployment', '* exclude app.api'],
    ['dynamic', "*\n  title 'x'"],
  ] as const)('%s view, item %j', (type, item) => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    expect(() => m.addView({ id: 'v', type, target: type === 'element' ? 'app' : undefined, includes: [item] })).toThrow();
    expect(m.serialize()['model.c4']).toBe(source);
  });

  it.each([
    ['element', 'app.api, app.includeApi'],
    ['element', '* // every element'],
    ['dynamic', 'app.api'],
    ['deployment', '*'],
  ] as const)('%s view accepts %j', (type, item) => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': source });
    m.addView({ id: 'v', type, target: type === 'element' ? 'app' : undefined, includes: [item] });
    expect(m.serialize()['model.c4']).toContain(`include ${item}`);
  });
});
