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
