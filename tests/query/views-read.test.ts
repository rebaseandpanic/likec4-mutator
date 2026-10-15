/**
 * Views through the public reads `listViews` / `getView` (US-1): every field
 * of every declared view, with rules and steps, against LikeC4 1.59.4's
 * per-document parse; the INV-4 exceptions, own values only (D21),
 * unnamed and generated views (D28, D29), duplicates, filters, references
 * and best-effort reads.
 *
 * Expected values come from LikeC4's parse, computed views, linker and
 * diagnostics of the same files, and from the input text itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import {
  buildLikeC4Model,
  computedViews,
  expectValidLikeC4,
  expectViewsAgreeWithLikeC4,
  linkedViewReferences,
  parsedViews,
} from '../helpers/likec4-model.js';

/** Every `.c4` file of a fixture workspace, keyed by its path relative to the workspace. */
function readWorkspace(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.c4')) files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

const SPEC = `specification {
  element system
  element container
  tag next
  tag deprecated
}
`;

const MODEL = `model {
  app = system 'App' {
    web = container 'Web'
    api = container 'API'
  }
  app.web -> app.api 'calls'
}
`;

/** One document with the specification, the model and `views`. */
const withViews = (views: string): Record<string, string> => ({ 'a.c4': `${SPEC}${MODEL}${views}` });

describe('full comparison with LikeC4 (row 22)', () => {
  it.each(['views-catalog', 'views-flows'])('%s: listViews and getView', async (fixture) => {
    const files = readWorkspace(fixture);
    // P: valid, and LikeC4 parses views of all three types.
    await expectValidLikeC4(files);
    const parsed = await parsedViews(files);
    expect([...new Set(parsed.map((p) => p.view._type))].sort()).toEqual(['deployment', 'dynamic', 'element']);
    const mutator = LikeC4Mutator.fromFiles(files);
    const views = mutator.listViews();
    expect(views.length).toBeGreaterThan(0);
    await expectViewsAgreeWithLikeC4(views, files);
    for (const view of views.filter((v) => v.id !== null)) {
      expect(mutator.getView(view.id!), view.id!).toEqual(view);
    }
  });
});

describe('folder (row 23)', () => {
  it('the title is reported without the folder prefix LikeC4 adds', async () => {
    const files = withViews(`views 'Folder A' {\n  view x {\n    title 'T'\n  }\n  view y {\n  }\n}\n`);
    // OP: LikeC4's parsed titles carry the folder prefix.
    const titles = Object.fromEntries((await parsedViews(files)).map((p) => [p.view.id, p.view.title]));
    expect(titles).toEqual({ x: 'Folder A / T', y: 'Folder A / y' });
    const mutator = LikeC4Mutator.fromFiles(files);
    expect(mutator.getView('x')).toMatchObject({ title: 'T', folder: 'Folder A' });
    expect(mutator.getView('y')!.folder).toBe('Folder A');
    expect(mutator.getView('y')!.title).toBeUndefined();
  });
});

describe('tag order (row 24)', () => {
  it('`#next, #deprecated` reads in LikeC4\'s order, a repeated tag once', async () => {
    const files = withViews(`views {\n  view v {\n    #next, #deprecated #next\n    include *\n  }\n}\n`);
    // OP: LikeC4's parsed tags.
    const entry = (await parsedViews(files)).find((p) => p.view.id === 'v')!;
    expect(entry.view.tags).toEqual(['deprecated', 'next']);
    expect(LikeC4Mutator.fromFiles(files).getView('v')!.tags).toEqual(['deprecated', 'next']);
  });
});

describe('own values only (row 25)', () => {
  it('a child of `extends` reads no inherited title, description, tags or links', async () => {
    const files = withViews(
      `views {\n  view parent {\n    #next\n    title 'Parent'\n    description 'Parent view'\n    link https://example.com/parent\n    include *\n  }\n  view child extends parent {\n    include app.api\n  }\n}\n`,
    );
    // OP: LikeC4's computed child has the parent's values.
    const model = await buildLikeC4Model(files);
    expect(model.views['child']!.title).toBe('Parent');
    const child = LikeC4Mutator.fromFiles(files).getView('child')!;
    expect(child.title).toBeUndefined();
    expect(child.description).toBeUndefined();
    expect(child.tags).toBeUndefined();
    expect(child.links).toBeUndefined();
  });

  it('an untitled `view of X` and an untitled `index` read no title', async () => {
    const files = withViews(`views {\n  view index {\n    include *\n  }\n  view appView of app {\n    include *\n  }\n}\n`);
    // OP: the computed title of `view of app` is the element's title.
    const model = await buildLikeC4Model(files);
    expect(model.views['appView']!.title).toBe('App');
    const mutator = LikeC4Mutator.fromFiles(files);
    expect(mutator.getView('appView')!.title).toBeUndefined();
    expect(mutator.getView('index')!.title).toBeUndefined();
  });
});

describe('bodyless declarations (row 26)', () => {
  it('`view v` and `dynamic view d` are listed with inModel false', async () => {
    const files = withViews(`views {\n  view v\n  dynamic view d\n  view other {\n    include *\n  }\n}\n`);
    // OP: both are absent from LikeC4's parsed and computed views.
    expect((await parsedViews(files)).map((p) => p.view.id)).toEqual(['other']);
    const computed = Object.keys(await computedViews(files));
    expect(computed).not.toContain('v');
    expect(computed).not.toContain('d');
    const views = LikeC4Mutator.fromFiles(files).listViews();
    expect(views.filter((v) => v.id === 'v' || v.id === 'd').map((v) => [v.id, v.type, v.inModel, v.rules, v.steps])).toEqual([
      ['v', 'element', false, [], undefined],
      ['d', 'dynamic', false, [], []],
    ]);
  });
});

describe('unnamed element view (row 27)', () => {
  it('is listed with id null, its file and range; LikeC4\'s generated id is no view id', async () => {
    const views = `views {\n  view of app {\n    include *\n  }\n}\n`;
    const files = withViews(views);
    const generated = (await parsedViews(files)).map((p) => p.view.id);
    expect(generated).toHaveLength(1);
    // OP: the generated id exists in LikeC4's computed views.
    expect(Object.keys(await computedViews(files))).toContain(generated[0]);
    const mutator = LikeC4Mutator.fromFiles(files);
    const [view] = mutator.listViews();
    const source = files['a.c4']!;
    const offset = source.indexOf('view of app');
    expect(view).toMatchObject({ id: null, file: 'a.c4', sourceRange: { offset, end: source.indexOf('}\n}\n', offset) + 1 } });
    expect(mutator.getView(generated[0]!)).toBeNull();
  });
});

describe('generated views (row 28)', () => {
  it('without a declared `index`, no `index` is listed', async () => {
    const files = withViews(`views {\n  view v {\n    include *\n  }\n}\n`);
    // OP: LikeC4 computes an `index`.
    expect(Object.keys(await computedViews(files))).toContain('index');
    expect(LikeC4Mutator.fromFiles(files).listViews().map((v) => v.id)).toEqual(['v']);
  });

  it('with `implicitViews`, the implicit views are not listed', async () => {
    const files = withViews(`views {\n  view v {\n    include *\n  }\n}\n`);
    // OP: LikeC4 computes implicit views for the project option.
    const implicit = Object.keys(await computedViews(files, { implicitViews: true })).filter((id) => id.startsWith('__'));
    expect(implicit.length).toBeGreaterThan(0);
    expect(LikeC4Mutator.fromFiles(files).listViews().map((v) => v.id)).toEqual(['v']);
  });
});

describe('duplicates and unknown ids (row 29)', () => {
  it('both declarations are listed in LikeC4 document order, getView returns the first', () => {
    const files = {
      'b.c4': `${SPEC}${MODEL}views {\n  view dup {\n    title 'From b'\n    include *\n  }\n}\n`,
      'a/z.c4': `views {\n  view dup {\n    title 'From a/z'\n    include *\n  }\n}\n`,
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    expect(mutator.listViews().map((v) => [v.id, v.file, v.title])).toEqual([
      ['dup', 'a/z.c4', 'From a/z'],
      ['dup', 'b.c4', 'From b'],
    ]);
    expect(mutator.getView('dup')!.file).toBe('a/z.c4');
    expect(mutator.getView('unknown')).toBeNull();
  });
});

describe('filters and provenance (row 30)', () => {
  const files = readWorkspace('views-catalog');
  const mutator = LikeC4Mutator.fromFiles(files);
  /** Declarations written in `source`, by keyword at the start of a line. */
  const count = (source: string, pattern: RegExp) => source.split('\n').filter((line) => pattern.test(line)).length;

  it('the type filter returns exactly the declarations of that type', () => {
    const all = Object.values(files).join('\n');
    expect(mutator.listViews({ type: 'dynamic' }).length).toBe(count(all, /^\s*dynamic view /));
    expect(mutator.listViews({ type: 'deployment' }).length).toBe(count(all, /^\s*deployment view /));
    expect(mutator.listViews({ type: 'element' }).length).toBe(count(all, /^\s*view\b/));
    expect(mutator.listViews({ type: 'dynamic' }).every((v) => v.type === 'dynamic')).toBe(true);
  });

  it('the file filter matches the file name exactly', () => {
    expect(mutator.listViews({ file: 'operations.c4' }).map((v) => v.id)).toEqual(['operations', 'settlement']);
    expect(mutator.listViews({ file: 'operations' })).toEqual([]);
    expect(mutator.listViews({ file: 'views.c4' }).every((v) => v.file === 'views.c4')).toBe(true);
  });

  it('file and range cover the whole declaration', () => {
    const source = files['views.c4']!;
    const view = mutator.getView('orderFlow')!;
    const offset = source.indexOf('dynamic view orderFlow {');
    expect(view.file).toBe('views.c4');
    expect(view.sourceRange.offset).toBe(offset);
    expect(source.slice(view.sourceRange.offset, view.sourceRange.end)).toMatch(/^dynamic view orderFlow \{[\s\S]*autoLayout LeftRight\n {2}\}$/);
  });
});

describe('`of` / `extends` fields (row 31)', () => {
  it.each([
    { name: '`of` an unknown element', views: 'view v of nope {\n include *\n}', role: 'of', field: 'of', text: 'nope' },
    { name: '`extends` an unknown view', views: 'view v extends nope {\n include *\n}', role: 'extends', field: 'extends', text: 'nope' },
    { name: '`extends` a dynamic view', views: 'dynamic view t {\n app.web -> app.api\n}\nview v extends t {\n include *\n}', role: 'extends', field: 'extends', text: 't' },
    { name: '`of` a known element', views: 'view v of api {\n include *\n}', role: 'of', field: 'of', text: 'api' },
    { name: '`extends` an element view', views: 'view t {\n include *\n}\nview v extends t {\n include *\n}', role: 'extends', field: 'extends', text: 't' },
  ] as const)('$name', async ({ views, role, field, text }) => {
    const files = withViews(`views {\n${views}\n}\n`);
    const linked = (await linkedViewReferences(files)).find((r) => r.role === role)!;
    const target = linked.target === null ? null : 'model' in linked.target ? linked.target.model : (linked.target as { view: string }).view;
    expect(LikeC4Mutator.fromFiles(files).getView('v')![field]).toEqual({ text, target });
  });
});

describe('title, description and link forms (row 32)', () => {
  it('equal LikeC4\'s parsed values', async () => {
    const more = withViews(
      [
        'views {',
        '  view slash {',
        "    title 'Cost \\/ Benefit'",
        "    description \'\'\'",
        '      **Bold** text',
        "    \'\'\'",
        '    link https://example.com/a',
        "    link https://example.com/b 'Docs'",
        '    include *',
        '  }',
        '  view plain {',
        "    description 'Plain text'",
        '    include *',
        '  }',
        '  view twoLines {',
        "    title 'Order",
        "      flow'",
        '    include *',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    const parsed = Object.fromEntries((await parsedViews(more)).map((p) => [p.view.id, p.view]));
    // OP: the forms as LikeC4 parses them.
    const twoLines = parsed['twoLines']!.title!;
    expect(twoLines).toMatch(/^Order\s+flow$/);
    expect(twoLines).not.toContain('\n');
    expect(parsed['slash']!.title).toBe('Cost \\/ Benefit');
    expect(parsed['slash']!.description).toEqual({ md: '**Bold** text' });
    expect(parsed['plain']!.description).toEqual({ txt: 'Plain text' });
    const mutator = LikeC4Mutator.fromFiles(more);
    expect(mutator.getView('twoLines')!.title).toBe(twoLines);
    expect(mutator.getView('slash')).toMatchObject({
      title: 'Cost \\/ Benefit',
      description: { md: '**Bold** text' },
      links: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b', label: 'Docs' }],
    });
    expect(mutator.getView('plain')!.description).toEqual({ txt: 'Plain text' });
    await expectViewsAgreeWithLikeC4(mutator.listViews(), more);
  });
});

describe('best-effort reads on syntax errors (row 33)', () => {
  it('views before the error and views of other files are listed', () => {
    const files = {
      'a.c4': `${SPEC}${MODEL}views {\n  view one {\n    include *\n  }\n  dynamic view two {\n    app.web -> app.api\n  }\n  view broken {\n    include (\n`,
      'b.c4': `views {\n  view other {\n    include *\n  }\n}\n`,
    };
    const mutator = LikeC4Mutator.fromFiles(files);
    const ids = mutator.listViews().map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['one', 'two', 'other']));
    expect(mutator.getView('two')!.steps).toHaveLength(1);
  });
});
