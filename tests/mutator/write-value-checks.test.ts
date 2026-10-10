import { describe, it, expect } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

/**
 * Identifiers and string parameters of write calls are checked before
 * anything is written: a value LikeC4 would reject, or one that would add
 * other DSL than the property asked for, throws an InvalidWriteError naming
 * the field and leaves every file unchanged.  The valid counterparts are
 * written and pass LikeC4's own validation (`expectValidLikeC4`).
 */

const SPEC = `specification {
  element service
  relationship calls
  tag internal
  color brand #3b82f6
}
`;

const MODEL = `${SPEC}model {
  app = service 'App' {
    api = service 'API'
    db = service 'DB'
  }
  app.api -> app.db 'reads'
}
views {
  view index {
    include *
  }
}
`;

const OTHER = `model {
  extend app {
    cache = service 'Cache'
  }
  ext = service 'External'
}
`;

function mutator(files: Record<string, string> = { 'model.c4': MODEL }): LikeC4Mutator {
  return LikeC4Mutator.fromFiles(files);
}

/** Run `write`, expect an InvalidWriteError on `field`, and no file changed. */
function expectRejected(m: LikeC4Mutator, field: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect((error as InvalidWriteError).message).toContain(field);
  expect(m.serialize()).toEqual(before);
  return error as InvalidWriteError;
}

describe('string parameters cannot smuggle DSL', () => {
  it.each([
    {
      name: 'autoLayout with an exclude rule',
      field: 'autoLayout',
      write: (m: LikeC4Mutator) => m.addView({ id: 'v', type: 'element', target: 'app', autoLayout: 'LeftRight\n exclude app.db' }),
    },
    {
      name: 'view target with a second view',
      field: 'target',
      write: (m: LikeC4Mutator) => m.addView({ id: 'v', type: 'element', target: 'app {\n }\n view w' }),
    },
    {
      name: 'style color with a shape',
      field: 'style.color',
      write: (m: LikeC4Mutator) => m.updateElement('app', { style: { color: 'red\n shape cylinder' } }),
    },
    {
      name: 'element kind with another element',
      field: 'kind',
      write: (m: LikeC4Mutator) => m.addElement('app', { name: 'x', kind: "service\n y = service 'Y'", title: 'X' }),
    },
    {
      name: 'relationship source with another relation',
      field: 'source',
      write: (m: LikeC4Mutator) => m.addRelationship('app.db\n app.api -> app.db', 'app.api'),
    },
    {
      name: 'relationship target with a body',
      field: 'target',
      write: (m: LikeC4Mutator) => m.addRelationship('app.db', 'app.api {\n }'),
    },
  ])('rejects $name', ({ field, write }) => {
    const m = mutator();
    expectRejected(m, field, () => write(m));
  });
});

describe('view id', () => {
  it.each([
    ['empty', ''],
    ['starting with a digit', '1view'],
    ['with a dot', 'a.b'],
    ['a keyword outside the Id rule', 'title'],
    ['a reserved word', 'this'],
  ])('rejects an id that is %s', (_name, id) => {
    const m = mutator();
    expectRejected(m, 'id', () => m.addView({ id, type: 'element', target: 'app' }));
  });

  it.each([
    ['element', 'index'],
    ['dynamic', 'index'],
    ['deployment', 'index'],
  ] as const)('rejects a %s view whose id is already used by a view', (type, id) => {
    const m = mutator();
    expectRejected(m, 'id', () => m.addView({ id, type }));
  });

  it('rejects an id used by a view of another file', async () => {
    const m = mutator({ 'model.c4': MODEL, 'views.c4': 'views {\n  dynamic view flow {\n  }\n}\n' });
    expectRejected(m, 'id', () => m.addView({ id: 'flow', type: 'element', target: 'app' }));
  });

  it('writes a named view with a layout that sets rankSep and nodeSep', async () => {
    const m = mutator();
    m.addView({ id: 'appView', type: 'element', target: 'app', autoLayout: 'LeftRight 120 40' });
    const text = m.serialize()['model.c4']!;
    expect(text).toContain('view appView of app {');
    expect(text).toContain('autoLayout LeftRight 120 40');
    await expectValidLikeC4(m.serialize());
  });
});

describe('autoLayout', () => {
  it.each([
    ['an unknown direction', 'Sideways'],
    ['a fractional spacing', 'LeftRight 1.5'],
    ['three numbers', 'TopBottom 10 20 30'],
    ['a lower-case direction', 'leftright'],
  ])('rejects %s', (_name, autoLayout) => {
    const m = mutator();
    expectRejected(m, 'autoLayout', () => m.addView({ id: 'v', type: 'element', target: 'app', autoLayout }));
  });

  it.each(['TopBottom', 'LeftRight', 'BottomTop', 'RightLeft', 'TopBottom 60', 'RightLeft 100 20'])(
    'writes autoLayout %s',
    async (autoLayout) => {
      const m = mutator();
      m.addView({ id: 'v', type: 'element', target: 'app', autoLayout });
      expect(m.serialize()['model.c4']).toContain(`autoLayout ${autoLayout}\n`);
      await expectValidLikeC4(m.serialize());
    },
  );
});

describe('deployment view includes', () => {
  it('rejects an include item that customizes with `with`', () => {
    const m = mutator();
    expectRejected(m, 'includes[1]', () =>
      m.addView({ id: 'deploy', type: 'deployment', includes: ['*', '* with { color red }'] }),
    );
  });

  it('accepts `with` in an element view, where LikeC4 applies it', async () => {
    const m = mutator();
    m.addView({ id: 'v', type: 'element', target: 'app', includes: ['* with { color red }'] });
    await expectValidLikeC4(m.serialize());
  });
});

describe('element name', () => {
  it.each([
    ['starting with a digit', '1api'],
    ['with a dot', 'a.pi'],
    ['with a space', 'a pi'],
    ['a keyword outside the Id rule', 'metadata'],
    ['a reserved word', 'it'],
    ['empty', ''],
  ])('rejects a name that is %s', (_name, name) => {
    const m = mutator();
    expectRejected(m, 'name', () => m.addElement('app', { name, kind: 'service', title: 'X' }));
  });

  it('rejects a name used by a sibling in the same parent', () => {
    const m = mutator();
    expectRejected(m, 'name', () => m.addElement('app', { name: 'api', kind: 'service', title: 'API 2' }));
  });

  it('rejects a name used by a root element', () => {
    const m = mutator();
    expectRejected(m, 'name', () => m.addElement(null, { name: 'app', kind: 'service', title: 'App 2' }));
  });

  it('rejects a name used by a sibling declared in an extend block of another file', () => {
    const m = mutator({ 'model.c4': MODEL, 'other.c4': OTHER });
    expectRejected(m, 'name', () => m.addElement('app', { name: 'cache', kind: 'service', title: 'Cache 2' }));
  });

  it('rejects a name used by a root element of another file', () => {
    const m = mutator({ 'model.c4': MODEL, 'other.c4': OTHER });
    expectRejected(m, 'name', () => m.addElement(null, { name: 'ext', kind: 'service', title: 'Ext 2' }));
  });

  it('writes a name that is unique in its parent although used elsewhere', async () => {
    const m = mutator({ 'model.c4': MODEL, 'other.c4': OTHER });
    expect(m.addElement(null, { name: 'cache', kind: 'service', title: 'Root cache' })).toBe('cache');
    await expectValidLikeC4(m.serialize());
  });
});

describe('kind and reference form', () => {
  it.each([
    ['kind', 'two words'],
    ['kind', 'a.b'],
  ])('rejects %s %j', (field, kind) => {
    const m = mutator();
    expectRejected(m, field, () => m.addElement('app', { name: 'x', kind, title: 'X' }));
  });

  it.each([
    ['source', 'app..api', 'app.db'],
    ['target', 'app.api', 'app. db'],
    ['source', '', 'app.db'],
  ])('rejects a relationship %s that is not a reference', (field, source, target) => {
    const m = mutator();
    expectRejected(m, field, () => m.addRelationship(source, target));
  });
});

// Keywords of the style value rules of the LikeC4 1.59.4 grammar.
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl', 'xsmall', 'small', 'medium', 'large', 'xlarge'];
const ELEMENT_KEYWORDS: Array<[string, string[]]> = [
  ['shape', ['rectangle', 'component', 'person', 'browser', 'mobile', 'cylinder', 'storage', 'queue', 'bucket', 'document']],
  ['border', ['solid', 'dashed', 'dotted', 'none']],
  ['size', SIZES],
  ['padding', SIZES],
  ['textSize', SIZES],
  ['iconSize', SIZES],
  ['iconPosition', ['left', 'right', 'top', 'bottom']],
];
const THEME_COLORS = ['primary', 'secondary', 'muted', 'slate', 'blue', 'indigo', 'sky', 'red', 'gray', 'green', 'amber'];
const ARROWS = ['none', 'normal', 'onormal', 'dot', 'odot', 'diamond', 'odiamond', 'crow', 'open', 'vee'];

describe('element style values', () => {
  it.each([
    ['shape', 'hexagon'],
    ['border', 'wavy'],
    ['size', 'huge'],
    ['padding', '10px'],
    ['textSize', 'XL'],
    ['iconSize', 'tiny'],
    ['iconPosition', 'middle'],
    ['color', 'nosuchcolor'],
    ['color', '#ff0000'],
    ['iconColor', 'nosuchcolor'],
    ['opacity', '140%'],
    ['opacity', '40'],
    ['icon', 'tech:no-such-icon'],
    ['icon', 'file:///tmp/icon.png'],
    ['icon', 'not an icon'],
  ])('rejects %s %j in addElement and updateElement', (key, value) => {
    const m = mutator();
    const style = { [key]: value };
    expectRejected(m, `style.${key}`, () => m.addElement('app', { name: 'x', kind: 'service', title: 'X', style }));
    expectRejected(m, `style.${key}`, () => m.updateElement('app.api', { style }));
  });

  it('rejects a non-boolean multiple', () => {
    const m = mutator();
    expectRejected(m, 'style.multiple', () => m.updateElement('app', { style: { multiple: 'yes' as never } }));
  });

  it('rejects an unknown style field', () => {
    const m = mutator();
    expectRejected(m, 'style.line', () => m.updateElement('app', { style: { line: 'dashed' } as never }));
  });

  it.each(ELEMENT_KEYWORDS)('writes every %s keyword', async (key, values) => {
    const m = mutator();
    for (const value of values) {
      m.addElement('app', { name: `x_${key}_${value}`, kind: 'service', title: 'X', style: { [key]: value } });
    }
    await expectValidLikeC4(m.serialize());
  });

  it('writes every theme color, a declared custom color, opacities, icons and booleans', async () => {
    const m = mutator();
    for (const color of THEME_COLORS) {
      m.addElement('app', { name: `c_${color}`, kind: 'service', title: 'C', style: { color, iconColor: color } });
    }
    m.updateElement('app', { style: { color: 'brand', iconColor: 'brand', opacity: '0%', multiple: true } });
    m.updateElement('app.api', { style: { icon: 'tech:postgresql', opacity: '100%', multiple: false } });
    m.updateElement('app.db', { style: { icon: 'https://example.com/db.svg', opacity: '40%' } });
    m.addElement('app', { name: 'noIcon', kind: 'service', title: 'N', style: { icon: 'none' } });
    await expectValidLikeC4(m.serialize());
  });
});

describe('relationship style values', () => {
  it.each([
    ['line', 'wavy'],
    ['head', 'arrow'],
    ['tail', 'arrow'],
    ['color', 'nosuchcolor'],
  ])('rejects %s %j in addRelationship and updateRelationship', (key, value) => {
    const m = mutator();
    const style = { [key]: value };
    expectRejected(m, `style.${key}`, () => m.addRelationship('app.db', 'app.api', 'x', { style }));
    expectRejected(m, `style.${key}`, () => m.updateRelationship({ source: 'app.api', target: 'app.db' }, { style }));
  });

  it('rejects an element style field on a relationship', () => {
    const m = mutator();
    expectRejected(m, 'style.shape', () => m.addRelationship('app.db', 'app.api', 'x', { style: { shape: 'person' } as never }));
  });

  it('writes every line, arrow and theme color keyword and a declared custom color', async () => {
    const m = mutator();
    for (const line of ['solid', 'dashed', 'dotted']) m.addRelationship('app.db', 'app.api', `line ${line}`, { style: { line } });
    for (const head of ARROWS) m.addRelationship('app.db', 'app.api', `arrow ${head}`, { style: { head, tail: head } });
    for (const color of [...THEME_COLORS, 'brand']) m.addRelationship('app.db', 'app.api', `color ${color}`, { style: { color } });
    await expectValidLikeC4(m.serialize());
  });
});

describe('comments and separators in probe-checked values', () => {
  // A style value is written into the existing property's value span; a
  // trailing `// ...` would comment out whatever follows on that line, and a
  // `/* ... */` or `;` would write text beyond the value.  Values that only
  // contain `//` inside a token (a URI) are not comments and stay accepted.
  const INLINE_STYLE = `${SPEC}model {
  app = service {
    style {
      color blue border dashed
    }
  }
  api = service
  db = service
  api -> db {
    style {
      line dotted head diamond
    }
  }
}
`;

  it.each([
    ['a trailing line comment', 'red // injected'],
    ['a trailing block comment', 'red /* injected */'],
    ['a trailing separator', 'red;'],
    ['a separator and a comment', 'red; // injected'],
  ])('rejects an element style value with %s and keeps the other fields of its line', async (_name, color) => {
    const m = mutator({ 'model.c4': INLINE_STYLE });
    expectRejected(m, 'style.color', () => m.updateElement('app', { style: { color } }));
    expectRejected(m, 'style.color', () => m.addElement('app', { name: 'x', kind: 'service', title: 'X', style: { color } }));
    m.updateElement('app', { style: { color: 'red' } });
    expect(m.serialize()['model.c4']).toContain('      color red border dashed\n');
    await expectValidLikeC4(m.serialize());
  });

  it('rejects an icon URI followed by a comment, and writes the URI alone', async () => {
    const m = mutator({ 'model.c4': INLINE_STYLE });
    expectRejected(m, 'style.icon', () => m.updateElement('app', { style: { icon: 'https://example.com/a.svg // x' } }));
    m.updateElement('app', { style: { icon: 'https://example.com/a//b.svg' } });
    expect(m.serialize()['model.c4']).toContain('icon https://example.com/a//b.svg');
    await expectValidLikeC4(m.serialize());
  });

  it('rejects a relationship style value with a trailing comment', async () => {
    const m = mutator({ 'model.c4': INLINE_STYLE });
    expectRejected(m, 'style.line', () =>
      m.updateRelationship({ source: 'api', target: 'db' }, { style: { line: 'dashed // injected' } }),
    );
    expectRejected(m, 'style.color', () => m.addRelationship('db', 'api', 'x', { style: { color: 'red /* x */' } }));
    m.updateRelationship({ source: 'api', target: 'db' }, { style: { line: 'dashed' } });
    expect(m.serialize()['model.c4']).toContain('      line dashed head diamond\n');
    await expectValidLikeC4(m.serialize());
  });

  it.each([
    ['autoLayout', { autoLayout: 'LeftRight // x' }, 'autoLayout LeftRight // x\n'],
    ['an include item', { includes: ['app.api /* x */'] }, 'include app.api /* x */\n'],
  ] as const)('writes %s with a trailing comment on a line of its own', async (_name, opts, line) => {
    const m = mutator();
    m.addView({ id: 'v', type: 'element', target: 'app', includes: ['*'], autoLayout: 'TopBottom', ...opts });
    const text = m.serialize()['model.c4']!;
    expect(text).toContain(line);
    // The rules after the commented line are still written and parsed.
    expect(text).toMatch(/include [^\n]*\n\s+autoLayout /);
    await expectValidLikeC4(m.serialize());
  });

  it.each([
    ['target', () => ({ id: 'v', type: 'element' as const, target: 'app // x' })],
    ['id', () => ({ id: 'v /* x */', type: 'element' as const, target: 'app' })],
  ])('rejects a comment in the view %s', (field, opts) => {
    const m = mutator();
    expectRejected(m, field, () => m.addView(opts()));
  });

  it.each([
    ['name', { name: 'x // y', kind: 'service' }],
    ['kind', { name: 'x', kind: 'service /* y */' }],
  ])('rejects a comment in the element %s', (field, opts) => {
    const m = mutator();
    expectRejected(m, field, () => m.addElement('app', { title: 'X', ...opts }));
  });

  it('writes an include whose string contains // (not a comment)', async () => {
    const m = mutator();
    m.addView({ id: 'v', type: 'element', target: 'app', includes: ["* with { title 'see https://example.com' }"] });
    expect(m.serialize()['model.c4']).toContain("include * with { title 'see https://example.com' }\n");
    await expectValidLikeC4(m.serialize());
  });
});
