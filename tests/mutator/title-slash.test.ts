/**
 * A `/` in a view or element title separates view folders; `\/` is a
 * literal slash (LikeC4 docs, "Organize views").  Title values use that
 * notation and are written in the docs' form (lc4m-15.27, part C item 5):
 * `\/` stays `\/`, any other backslash is escaped.  Titles must read back as
 * intended — in LikeC4's computed views (title and folder) and as element
 * titles in the library and in LikeC4.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/index.js';
import { buildLikeC4Model, expectAgreesWithLikeC4, expectValidLikeC4 } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
}
`;

const LITERAL = 'Cost \\/ Benefit'; // Cost \/ Benefit
const FOLDER = 'Deployment / Prod';
const BACKSLASH = 'C:\\temp'; // C:\temp

describe('view titles', () => {
  it('a literal slash, a folder separator and another backslash read back as intended', async () => {
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': `model {\n  a = service\n}\nviews {\n}\n` });
    m.addView({ id: 'literal', type: 'element', target: 'a', title: LITERAL });
    m.addView({ id: 'folder', type: 'element', target: 'a', title: FOLDER });
    m.addView({ id: 'backslash', type: 'element', target: 'a', title: BACKSLASH });
    const files = m.serialize();
    await expectValidLikeC4(files);
    const lines = files['model.c4']!.split('\n');
    expect(lines).toContain("    title 'Cost \\/ Benefit'");
    expect(lines).toContain("    title 'Deployment / Prod'");
    expect(lines).toContain("    title 'C:\\\\temp'");
    const { views } = await buildLikeC4Model(files);
    expect(views['literal']).toEqual({ title: 'Cost / Benefit', folder: '' });
    expect(views['folder']).toEqual({ title: 'Prod', folder: 'Deployment' });
    expect(views['backslash']).toEqual({ title: 'C:\\temp', folder: '' });
  });
});

describe('element titles', () => {
  const MODEL = `model {
  a = service 'Old'
  b = service {
    title 'Old'
  }
}
`;

  it.each([
    ['an inline title', 'a', `  a = service 'Cost \\/ Benefit'`],
    ['a body title', 'b', `    title 'Cost \\/ Benefit'`],
  ])('updateElement writes the escape of %s as the docs do, and LikeC4 and the library agree on it', async (_, fqn, line) => {
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': MODEL });
    m.updateElement(fqn, { title: LITERAL });
    const files = m.serialize();
    await expectValidLikeC4(files);
    expect(files['model.c4']!.split('\n')).toContain(line);
    const element = m.getElement(fqn)!;
    expect(element.title).toBe('Cost / Benefit');
    await expectAgreesWithLikeC4(files, fqn, element);
  });

  it('the implicit views of elements land in folders as the titles say', async () => {
    const m = LikeC4Mutator.fromFiles({ 'spec.c4': SPEC, 'model.c4': `model {\n}\n` });
    m.addElement(null, { name: 'x', kind: 'service', title: LITERAL });
    m.addElement(null, { name: 'y', kind: 'service', title: 'Ops / Db' });
    const files = m.serialize();
    await expectValidLikeC4(files);
    const { views, elements } = await buildLikeC4Model(files, { implicitViews: true });
    expect(views['__x']).toEqual({ title: 'Cost / Benefit', folder: 'Auto' });
    expect(views['__y']).toEqual({ title: 'Db', folder: 'Auto/Ops' });
    expect(elements['x']?.title).toBe('Cost / Benefit');
    expect(m.getElement('x')?.title).toBe('Cost / Benefit');
  });
});
