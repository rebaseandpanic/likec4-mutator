import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';

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
  app -> app.db 'reads'
}
views {
}
`;

/**
 * Run `apply --in-place` on a fresh copy of `source` with the given mutations
 * file content; return exit status, stderr and the resulting model text.
 */
function runApply(mutationsFile: unknown): {
  status: number | null;
  stderr: string;
  model: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-validation-'));
  writeFileSync(join(dir, 'model.c4'), source, 'utf-8');
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
      mutation: { op: 'addRelationship', source: 'app.db', target: 'app', links: 'https://x.io' },
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
      mutation: { op: 'addRelationship', source: 'app.db', target: 'app', style: 'dashed' },
      field: 'style',
    },
    {
      name: 'non-boolean style.multiple',
      mutation: { ...validAdd, style: { multiple: 'yes' } },
      field: 'multiple',
    },
    {
      name: 'non-string label on updateRelationship',
      mutation: { op: 'updateRelationship', source: 'app', target: 'app.db', label: 7 },
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
      mutation: { op: 'addRelationship', source: 'app.db', target: 'app', technologies: 'JDBC' },
      field: 'technologies',
    },
    { name: 'titel on updateElement', mutation: { op: 'updateElement', fqn: 'app', titel: 'X' }, field: 'titel' },
    {
      name: 'matchLabel on updateRelationship',
      mutation: { op: 'updateRelationship', source: 'app', target: 'app.db', matchLabel: 'reads', label: 'x' },
      field: 'matchLabel',
    },
    { name: 'recursive on removeElement', mutation: { op: 'removeElement', fqn: 'app.db', recursive: true }, field: 'recursive' },
    {
      name: 'label on removeRelationship',
      mutation: { op: 'removeRelationship', source: 'app', target: 'app.db', label: 'reads' },
      field: 'label',
    },
    { name: 'includes on addView', mutation: { op: 'addView', id: 'v', type: 'element', includes: ['*'] }, field: 'includes' },
    { name: 'element style key colour', mutation: { ...validAdd, id: 'child', style: { colour: 'red' } }, field: 'colour' },
    {
      name: 'relationship style key shape',
      mutation: { op: 'updateRelationship', source: 'app', target: 'app.db', style: { shape: 'person' } },
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
        { op: 'addView', id: 'apiView', type: 'element', target: 'app.api', title: 'API Overview' },
        { op: 'removeRelationship', source: 'app', target: 'app.db' },
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

  it('applies a fully-typed batch', () => {
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
        { op: 'updateRelationship', source: 'app', target: 'app.db', style: { line: 'dashed' } },
        { op: 'addView', id: 'v', type: 'element', target: 'app' },
      ],
    });
    expect(status).toBe(0);
    const m = LikeC4Mutator.fromFiles({ 'model.c4': model });
    expect(m.validate()).toEqual([]);
    expect(m.getElement('app.ok')?.tags).toEqual(['i', 'n']);
    expect(m.getElement('app.ok')?.metadata).toEqual({ owner: 'team', envs: ['dev', 'prod'] });
    expect(m.getElement('app')?.tags).toEqual(['t']);
  });
});
