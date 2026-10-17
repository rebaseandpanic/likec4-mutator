import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectAcceptedWrite, expectAgreesWithLikeC4, expectValidLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

const source = `specification {
  element service
  tag i
  tag n
  tag t
}
model {
  app = service {
    db = service
  }
  ext = service
  ext -> app.db 'reads'
}
views {
}
`;

/**
 * Run `apply --in-place` on a fresh copy of `model` (`source` by default) with
 * the given mutations file content; return exit status, stderr and the
 * resulting model text.
 */
function runApply(mutationsFile: unknown, model: string = source): {
  status: number | null;
  stderr: string;
  model: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-validation-'));
  writeFileSync(join(dir, 'model.c4'), model, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify(mutationsFile), 'utf-8');
  const result = spawnSync(
    'npx',
    ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'],
    { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 },
  );
  return {
    status: result.status,
    stderr: result.stderr,
    model: readFileSync(join(dir, 'model.c4'), 'utf-8'),
  };
}

const validAdd = { op: 'addElement', parent: 'app', kind: 'service', id: 'ok', title: 'Ok' };

describe('CLI apply validates the mutations file shape', () => {
  it.each([
    {
      name: 'string tags on addElement',
      mutation: { ...validAdd, id: 'child', tags: 'int' },
      field: 'tags',
    },
    {
      name: 'non-string tag on updateElement',
      mutation: { op: 'updateElement', fqn: 'app', tags: [1] },
      field: 'tags',
    },
    {
      name: 'string links on addRelationship',
      mutation: { op: 'addRelationship', source: 'app.db', target: 'ext', links: 'https://x.io' },
      field: 'links',
    },
    {
      name: 'non-string link url',
      mutation: { ...validAdd, links: [{ url: 5 }] },
      field: 'url',
    },
    {
      name: 'non-string metadata value',
      mutation: { op: 'updateElement', fqn: 'app', metadata: { owner: 5 } },
      field: 'owner',
    },
    {
      name: 'null metadata value on addElement (only update accepts null)',
      mutation: { ...validAdd, metadata: { owner: null } },
      field: 'owner',
    },
    {
      name: 'string style on addRelationship',
      mutation: { op: 'addRelationship', source: 'app.db', target: 'ext', style: 'dashed' },
      field: 'style',
    },
    {
      name: 'non-boolean style.multiple',
      mutation: { ...validAdd, style: { multiple: 'yes' } },
      field: 'multiple',
    },
    {
      name: 'non-string label on updateRelationship',
      mutation: { op: 'updateRelationship', source: 'ext', target: 'app.db', label: 7 },
      field: 'label',
    },
    {
      name: 'non-string title on addElement',
      mutation: { ...validAdd, title: 5 },
      field: 'title',
    },
    {
      name: 'unknown addView type',
      mutation: { op: 'addView', id: 'v', type: 'bogus' },
      field: 'type',
    },
  ])('rejects $name, naming the mutation index and field', ({ mutation, field }) => {
    const { status, stderr, model } = runApply({ mutations: [validAdd, mutation] });
    expect(status).toBe(1);
    expect(stderr).toContain('mutations[1]');
    expect(stderr).toContain(field);
    expect(model).toBe(source);
  });

  // A misspelled field would otherwise be ignored and the mutation would
  // silently do less than asked.
  it.each([
    { name: 'tag on addElement', mutation: { ...validAdd, id: 'child', tag: ['i'] }, field: 'tag' },
    {
      name: 'technologies on addRelationship',
      mutation: { op: 'addRelationship', source: 'app.db', target: 'ext', technologies: 'JDBC' },
      field: 'technologies',
    },
    { name: 'titel on updateElement', mutation: { op: 'updateElement', fqn: 'app', titel: 'X' }, field: 'titel' },
    {
      name: 'matchLabel on updateRelationship',
      mutation: { op: 'updateRelationship', source: 'ext', target: 'app.db', matchLabel: 'reads', label: 'x' },
      field: 'matchLabel',
    },
    { name: 'recursive on removeElement', mutation: { op: 'removeElement', fqn: 'app.db', recursive: true }, field: 'recursive' },
    {
      name: 'label on removeRelationship',
      mutation: { op: 'removeRelationship', source: 'ext', target: 'app.db', label: 'reads' },
      field: 'label',
    },
    { name: 'element style key colour', mutation: { ...validAdd, id: 'child', style: { colour: 'red' } }, field: 'colour' },
    {
      name: 'relationship style key shape',
      mutation: { op: 'updateRelationship', source: 'ext', target: 'app.db', style: { shape: 'person' } },
      field: 'shape',
    },
    { name: 'link key title', mutation: { ...validAdd, id: 'child', links: [{ url: 'https://example.com', title: 'X' }] }, field: 'title' },
  ])('rejects the unknown field $name, naming the mutation index and field', ({ mutation, field }) => {
    const { status, stderr, model } = runApply({ mutations: [validAdd, mutation] });
    expect(status).toBe(1);
    expect(stderr).toContain('mutations[1]');
    expect(stderr).toContain(field);
    expect(model).toBe(source);
  });

  it('rejects an unknown top-level field of the mutations file', () => {
    const { status, stderr, model } = runApply({ mutations: [validAdd], dryRun: true });
    expect(status).toBe(1);
    expect(stderr).toContain('dryRun');
    expect(model).toBe(source);
  });

  it('accepts every field the README documents for each op', () => {
    const { status, stderr, model } = runApply({
      mutations: [
        {
          op: 'addElement',
          parent: 'app',
          kind: 'service',
          id: 'api',
          title: 'API',
          summary: 'Short',
          description: 'Detailed',
          technology: 'TypeScript',
          tags: ['i'],
          links: [{ url: 'https://example.com/api', label: 'Repo' }, { url: 'https://example.com/docs' }],
          style: {
            shape: 'rectangle',
            color: 'blue',
            icon: 'tech:typescript',
            opacity: '80%',
            border: 'solid',
            multiple: false,
            size: 'md',
            padding: 'sm',
            textSize: 'md',
            iconPosition: 'top',
            iconColor: 'blue',
            iconSize: 'sm',
          },
          metadata: { owner: 'team', keywords: ['a', 'b'] },
        },
        {
          op: 'addRelationship',
          source: 'app.api',
          target: 'app.db',
          label: 'reads/writes',
          description: 'Queries',
          technology: 'JDBC',
          tags: ['i'],
          links: [{ url: 'https://example.com/db', label: 'DB' }],
          metadata: { sla: '99.9%', owners: ['p', 'd'] },
          style: { line: 'dashed', color: 'red', head: 'diamond', tail: 'none' },
        },
        {
          op: 'updateElement',
          fqn: 'app.api',
          title: 'Updated',
          summary: 'S',
          description: 'D',
          technology: 'Go',
          tags: ['t'],
          links: [{ url: 'https://example.com/migration', label: 'Guide' }],
          metadata: { team: 'backend', keywords: ['x'], owner: null },
          style: { color: 'red', border: 'dashed' },
        },
        {
          op: 'updateRelationship',
          source: 'app.api',
          target: 'app.db',
          matchTitle: 'reads/writes',
          label: 'persists',
          description: 'Reads and writes',
          technology: 'JDBC',
          tags: ['n'],
          links: [{ url: 'https://example.com/db' }],
          metadata: { sla: '99.99%', owners: null },
          style: { line: 'dotted', color: 'red' },
        },
        { op: 'addView', id: 'apiView', type: 'element', target: 'app', title: 'API Overview', includes: ['*'] },
        { op: 'removeRelationship', source: 'ext', target: 'app.db' },
        { op: 'removeElement', fqn: 'app.api' },
      ],
    });
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(LikeC4Mutator.fromFiles({ 'model.c4': model }).validate()).toEqual([]);
  });

  it('rejects a mutation that is not an object, naming its index', () => {
    const { status, stderr, model } = runApply({ mutations: [validAdd, 'addElement'] });
    expect(status).toBe(1);
    expect(stderr).toContain('mutations[1]');
    expect(model).toBe(source);
  });

  it('applies a fully-typed batch', async () => {
    const { status, model } = runApply({
      mutations: [
        {
          ...validAdd,
          tags: ['i', 'n'],
          links: [{ url: 'https://x.io', label: 'X' }],
          style: { color: 'red', multiple: true },
          metadata: { owner: 'team', envs: ['dev', 'prod'] },
        },
        { op: 'updateElement', fqn: 'app', tags: ['t'], metadata: { gone: null } },
        { op: 'updateRelationship', source: 'ext', target: 'app.db', style: { line: 'dashed' } },
        { op: 'addView', id: 'v', type: 'element', target: 'app' },
      ],
    });
    expect(status).toBe(0);
    const m = LikeC4Mutator.fromFiles({ 'model.c4': model });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('app.ok')?.tags).toEqual(['i', 'n']);
    expect(m.getElement('app.ok')?.metadata).toEqual({ owner: 'team', envs: ['dev', 'prod'] });
    expect(m.getElement('app')?.tags).toEqual(['t']);
    await expectValidLikeC4({ 'model.c4': model });
  });
});

describe('CLI apply rejects values LikeC4 would not accept', () => {
  // Checked while the file is validated (no loaded files needed) or when the
  // mutation is applied; either way the JSON path is named and nothing is
  // written.
  it.each([
    { name: 'an element id that is not an identifier', mutation: { ...validAdd, id: '1api' }, path: 'mutations[1].id' },
    { name: 'an element kind with DSL', mutation: { ...validAdd, kind: "service\n x = service 'X'" }, path: 'mutations[1].kind' },
    {
      name: 'a style color with DSL',
      mutation: { ...validAdd, style: { color: 'red\n shape cylinder' } },
      path: 'mutations[1].style.color',
    },
    {
      name: 'a style color with a trailing line comment',
      mutation: { op: 'updateElement', fqn: 'app', style: { color: 'red // injected' } },
      path: 'mutations[1].style.color',
    },
    {
      name: 'an unknown shape',
      mutation: { op: 'updateElement', fqn: 'app', style: { shape: 'hexagon' } },
      path: 'mutations[1].style.shape',
    },
    {
      name: 'a relationship source that is not a reference',
      mutation: { op: 'addRelationship', source: 'app db', target: 'app' },
      path: 'mutations[1].source',
    },
    {
      name: 'an unknown arrow head',
      mutation: { op: 'updateRelationship', source: 'app.db', target: 'ext', style: { head: 'arrow' } },
      path: 'mutations[1].style.head',
    },
    { name: 'a view id with a dot', mutation: { op: 'addView', id: 'a.b', type: 'element' }, path: 'mutations[1].id' },
    {
      name: 'a view target with DSL',
      mutation: { op: 'addView', id: 'v', type: 'element', target: 'app {\n }\n view w' },
      path: 'mutations[1].target',
    },
    {
      name: '`with` in a deployment view include',
      mutation: { op: 'addView', id: 'd', type: 'deployment', includes: ['* with { color red }'] },
      path: 'mutations[1].includes[0]',
    },
    { name: 'a duplicate element name', mutation: { ...validAdd, id: 'db' }, path: 'mutations[1].id' },
    { name: 'the id of a view added before', mutation: { op: 'addView', id: 'index', type: 'element' }, path: 'mutations[2].id' },
    {
      name: 'an undeclared tag',
      mutation: { ...validAdd, tags: ['i', 'undeclared'] },
      path: 'mutations[1].tags[1]',
    },
    { name: 'an undeclared element kind', mutation: { ...validAdd, kind: 'nosuchkind' }, path: 'mutations[1].kind' },
    {
      name: 'a parent-child relationship',
      mutation: { op: 'addRelationship', source: 'app', target: 'app.db' },
      path: 'mutations[1].target',
    },
    {
      name: 'an unresolved relationship target',
      mutation: { op: 'addRelationship', source: 'ext', target: 'app.missing' },
      path: 'mutations[1].target',
    },
    {
      name: 'an undeclared tag on a relationship update',
      mutation: { op: 'updateRelationship', source: 'ext', target: 'app.db', tags: ['undeclared'] },
      path: 'mutations[1].tags[0]',
    },
    {
      name: 'an undeclared custom color',
      mutation: { op: 'updateElement', fqn: 'app', style: { color: 'nosuchcolor' } },
      path: 'mutations[1].style.color',
    },
  ])('rejects $name with exit code 1, naming $path', ({ mutation, path }) => {
    const mutations: unknown[] = [validAdd, mutation];
    if (path.startsWith('mutations[2]')) mutations.splice(1, 0, { op: 'addView', id: 'index', type: 'element' });
    const { status, stderr, model } = runApply({ mutations });
    expect(status).toBe(1);
    expect(stderr).toContain(`${path}:`);
    expect(model).toBe(source);
  });
});

describe('CLI apply style merge into a one-line style block', () => {
  const inlineStyle = `specification {
  element service
}
model {
  app = service {
    style {
      color blue border dashed
    }
  }
}
`;

  function applyTo(mutations: unknown[]): { status: number | null; stderr: string; model: string } {
    const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-style-'));
    writeFileSync(join(dir, 'model.c4'), inlineStyle, 'utf-8');
    const mutationsPath = join(dir, 'mutations.json');
    writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
    const result = spawnSync(
      'npx',
      ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 },
    );
    return { status: result.status, stderr: result.stderr, model: readFileSync(join(dir, 'model.c4'), 'utf-8') };
  }

  it('rejects a color with a trailing comment, which would comment out the border', () => {
    const { status, stderr, model } = applyTo([{ op: 'updateElement', fqn: 'app', style: { color: 'red // injected' } }]);
    expect(status).toBe(1);
    expect(stderr).toContain('mutations[0].style.color:');
    expect(model).toBe(inlineStyle);
  });

  it('writes the color alone and keeps the border on its line', async () => {
    const { status, model } = applyTo([{ op: 'updateElement', fqn: 'app', style: { color: 'red' } }]);
    expect(status).toBe(0);
    expect(model).toContain('      color red border dashed\n');
    await expectValidLikeC4({ 'model.c4': model });
  });
});

describe('CLI apply rejects the lc4m-17 repro (row 9 of lc4m-15.30)', () => {
  const MODEL = `specification {
  element service
}
model {
  app = service {
    api = service
  }
  other = service {
  }
}
`;
  const STEPS = {
    'a top-level step': '    api -> other\n',
    'a step in opt': '    opt {\n      api -> other\n    }\n',
    'a step in an alt branch': "    alt {\n      if 'ok' {\n        api -> other\n      }\n    }\n",
  };

  it.each(Object.entries(STEPS))('rejects addElement other.api with %s: exit 1, mutations[0].id, nothing written', async (_, step) => {
    const model = `${MODEL}views {\n  view index {\n    include api\n  }\n  dynamic view d {\n${step}  }\n}\n`;
    // P: the repro is valid LikeC4.
    await expectValidLikeC4({ 'model.c4': model });
    const result = runApply({ mutations: [{ op: 'addElement', parent: 'other', kind: 'service', id: 'api', title: 'API' }] }, model);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutations[0].id:');
    expect(result.model).toBe(model);
  });
});

describe('CLI apply addElement without parent or title (row 30 of lc4m-15.30)', () => {
  // US-5, D65: no parent adds a model-level element; without a title LikeC4
  // shows the kind's title, else the element name.
  it.each([
    { name: 'a kind without a title: the name', kind: 'element service', title: 'solo' },
    { name: 'a kind with a title: the kind title', kind: "element service {\n    title 'Service'\n  }", title: 'Service' },
  ])('adds a model-level element with $name as its title', { timeout: 60_000 }, async ({ kind, title }) => {
    const model = `specification {\n  ${kind}\n}\nmodel {\n  app = service\n}\n`;
    const result = runApply({ mutations: [{ op: 'addElement', kind: 'service', id: 'solo' }] }, model);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.model).toBe(model.replace('  app = service\n', '  app = service\n  solo = service\n'));
    const after = { 'model.c4': result.model };
    const element = LikeC4Mutator.fromFiles(after).getElement('solo')!;
    expect(element.title).toBe(title);
    await expectAgreesWithLikeC4(after, 'solo', element);
    await expectAcceptedWrite({ 'model.c4': model }, after);
  });
});

describe('CLI apply addElement file rejections (row 31 of lc4m-15.30)', () => {
  it.each([
    { name: 'file together with parent', mutation: { op: 'addElement', parent: 'app', kind: 'service', id: 'x', file: 'model.c4' }, field: 'file' },
    { name: 'an unloaded file', mutation: { op: 'addElement', kind: 'service', id: 'x', file: 'other.c4' }, field: 'file' },
    { name: 'an unknown field', mutation: { op: 'addElement', kind: 'service', id: 'x', files: 'model.c4' }, field: 'files' },
  ])('$name: exit 1 on mutations[0].$field, nothing written', ({ mutation, field }) => {
    const { status, stderr, model } = runApply({ mutations: [mutation] });
    expect(status).toBe(1);
    expect(stderr).toContain(`mutations[0].${field}`);
    expect(model).toBe(source);
  });
});
