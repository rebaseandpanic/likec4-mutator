/**
 * The read commands (rows 27–31 of the lc4m-15.31 test matrix): each read
 * mode prints with `--json` the value of the library method it maps to for
 * the same arguments (US-3, SC-008, D138, INV-6 exception 3), a missing
 * `get-*` construct exits 1 while an absent specification and empty lists
 * succeed (D148), an unnamed view is listed but not addressable, the new
 * commands print readable text naming what they read, and `list-elements`
 * keeps its text (INV-6).
 *
 * The program runs in process through `buildProgram`.  Expected sides are
 * the library methods' own values for the same arguments, and for row 31
 * the text `list-elements` printed before this change.
 */
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';
import { READ_COMMANDS, readFlags } from '../../src/cli/read-commands.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { loadDirectory } from '../../src/cli/files.js';

const SLOW = { timeout: 300_000 };
const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');

/**
 * The views-flows fixture (elements, relationships, a specification, views
 * of the three types in two files, deployment) and one more deployment
 * relationship, of kind `call` and in the other direction, so that every
 * deployment relationship filter narrows the list.
 */
function richModel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-read-'));
  cpSync(join(FIXTURES, 'views-flows'), dir, { recursive: true });
  writeFileSync(join(dir, 'replies.c4'), "deployment {\n  main.back -[call]-> main.front 'replies'\n}\n", 'utf-8');
  return dir;
}

/** A directory holding `files`. */
function modelOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-read-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf-8');
  return dir;
}

const RICH = richModel();
const MINIMAL = join(FIXTURES, 'minimal');
/** A model with no specification and none of the constructs the lists read. */
const EMPTY = modelOf({ 'model.c4': 'model {\n}\n' });

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: readonly string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const program = buildProgram({
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
  });
  const code = await program.run(args);
  return { code, stdout, stderr };
}

/** A read command on `dir` (`--dir` added). */
function read(dir: string, args: readonly string[]): Promise<Run> {
  const [command, ...flags] = args;
  return run([command, '--dir', dir, ...flags]);
}

function mutatorOf(dir: string): LikeC4Mutator {
  return LikeC4Mutator.fromFiles(loadDirectory(dir));
}

/** The value as JSON reads it back. */
function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

// ---------------------------------------------------------------------------
// Row 27: every read mode and parameter equals its library method
// ---------------------------------------------------------------------------

interface ReadCase {
  args: string[];
  call: (m: LikeC4Mutator) => unknown;
  /** For a filter: the same method without it, whose value must differ */
  unfiltered?: (m: LikeC4Mutator) => unknown;
}

const READS: ReadCase[] = [
  { args: ['list-elements'], call: (m) => m.listElements() },
  { args: ['list-elements', '--kind', 'ui'], call: (m) => m.listElements({ kind: 'ui' }), unfiltered: (m) => m.listElements() },
  { args: ['list-elements', '--parent', 'portal'], call: (m) => m.listElements({ parentFqn: 'portal' }), unfiltered: (m) => m.listElements() },
  { args: ['get-element', '--fqn', 'portal.web'], call: (m) => m.getElement('portal.web') },
  { args: ['get-element', '--fqn', 'portal.gateway', '--source'], call: (m) => m.getElementSource('portal.gateway') },
  { args: ['get-relationships'], call: (m) => m.getRelationships() },
  {
    args: ['get-relationships', '--source-fqn', 'portal.worker'],
    call: (m) => m.getRelationships({ sourceFqn: 'portal.worker' }),
    unfiltered: (m) => m.getRelationships(),
  },
  {
    args: ['get-relationships', '--target-fqn', 'portal.gateway'],
    call: (m) => m.getRelationships({ targetFqn: 'portal.gateway' }),
    unfiltered: (m) => m.getRelationships(),
  },
  { args: ['get-specification'], call: (m) => m.getSpecification() },
  { args: ['list-views'], call: (m) => m.listViews() },
  { args: ['list-views', '--type', 'dynamic'], call: (m) => m.listViews({ type: 'dynamic' }), unfiltered: (m) => m.listViews() },
  { args: ['list-views', '--file', 'platform.c4'], call: (m) => m.listViews({ file: 'platform.c4' }), unfiltered: (m) => m.listViews() },
  { args: ['get-view', '--id', 'landing'], call: (m) => m.getView('landing') },
  { args: ['list-deployment-nodes'], call: (m) => m.listDeploymentNodes() },
  { args: ['list-deployment-nodes', '--kind', 'pod'], call: (m) => m.listDeploymentNodes({ kind: 'pod' }), unfiltered: (m) => m.listDeploymentNodes() },
  {
    args: ['list-deployment-nodes', '--parent-id', 'main'],
    call: (m) => m.listDeploymentNodes({ parentId: 'main' }),
    unfiltered: (m) => m.listDeploymentNodes(),
  },
  { args: ['get-deployment-node', '--id', 'main.front'], call: (m) => m.getDeploymentNode('main.front') },
  { args: ['get-deployment-node-kind', '--kind', 'pod'], call: (m) => m.getDeploymentNodeKind('pod') },
  { args: ['list-deployment-instances'], call: (m) => m.listDeploymentInstances() },
  {
    args: ['list-deployment-instances', '--node-id', 'main.back'],
    call: (m) => m.listDeploymentInstances({ nodeId: 'main.back' }),
    unfiltered: (m) => m.listDeploymentInstances(),
  },
  {
    args: ['list-deployment-instances', '--element', 'portal.web'],
    call: (m) => m.listDeploymentInstances({ element: 'portal.web' }),
    unfiltered: (m) => m.listDeploymentInstances(),
  },
  { args: ['get-deployment-instance', '--id', 'main.front.gateway'], call: (m) => m.getDeploymentInstance('main.front.gateway') },
  { args: ['list-deployment-relationships'], call: (m) => m.listDeploymentRelationships() },
  {
    args: ['list-deployment-relationships', '--source', 'main.front'],
    call: (m) => m.listDeploymentRelationships({ source: 'main.front' }),
    unfiltered: (m) => m.listDeploymentRelationships(),
  },
  {
    args: ['list-deployment-relationships', '--target', 'main.front'],
    call: (m) => m.listDeploymentRelationships({ target: 'main.front' }),
    unfiltered: (m) => m.listDeploymentRelationships(),
  },
  {
    args: ['list-deployment-relationships', '--kind', 'call'],
    call: (m) => m.listDeploymentRelationships({ kind: 'call' }),
    unfiltered: (m) => m.listDeploymentRelationships(),
  },
];

describe('row 27: with --json each read mode prints the value of its library method', SLOW, () => {
  it('the cases cover every mode and every parameter of the read table', () => {
    for (const entry of READ_COMMANDS) {
      const used = new Set(READS.filter((c) => c.args[0] === entry.command).flatMap((c) => c.args.filter((t) => t.startsWith('--'))));
      for (const flag of readFlags(entry)) expect(used, entry.command).toContain(`--${flag.flag}`);
      expect(READS.some((c) => c.args[0] === entry.command), entry.command).toBe(true);
    }
    expect(READS.some((c) => c.args[0] === 'get-element' && c.args.includes('--source'))).toBe(true);
  });

  it.each(READS.map((c) => [c.args.join(' '), c] as const))('%s', async (_, c) => {
    const result = await read(RICH, [...c.args, '--json']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const value = c.call(mutatorOf(RICH));
    expect(value).not.toBeNull();
    if (c.unfiltered) expect(asJson(value)).not.toEqual(asJson(c.unfiltered(mutatorOf(RICH))));
    expect(JSON.parse(result.stdout)).toStrictEqual(asJson(value));
  });

  it('get-element --source --json prints the source as a JSON string', async () => {
    const result = await read(RICH, ['get-element', '--fqn', 'portal.gateway', '--source', '--json']);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as unknown;
    expect(typeof parsed).toBe('string');
    expect(parsed).toBe(mutatorOf(RICH).getElementSource('portal.gateway'));
  });
});

// ---------------------------------------------------------------------------
// Row 28: exit codes
// ---------------------------------------------------------------------------

describe('row 28: a missing get-* exits 1; no specification and empty lists succeed', SLOW, () => {
  it.each(
    [
      ['get-element', '--fqn', 'does.not.exist'],
      ['get-view', '--id', 'nope'],
      ['get-deployment-node', '--id', 'nope'],
      ['get-deployment-instance', '--id', 'nope'],
      ['get-deployment-node-kind', '--kind', 'nope'],
    ].flatMap((args) => [false, true].map((json) => [`${args.join(' ')}${json ? ' --json' : ''}`, json ? [...args, '--json'] : args] as const)),
  )('%s', async (_, args) => {
    const result = await read(RICH, args);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  });

  it('get-specification of a model without one succeeds; --json prints null', async () => {
    expect(mutatorOf(EMPTY).getSpecification()).toBeNull();
    const text = await read(EMPTY, ['get-specification']);
    expect(text.code).toBe(0);
    expect(text.stderr).toBe('');
    const json = await read(EMPTY, ['get-specification', '--json']);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toBeNull();
  });

  it.each(['list-elements', 'get-relationships', 'list-views', 'list-deployment-nodes', 'list-deployment-instances', 'list-deployment-relationships'])(
    '%s of a model with none succeeds; --json prints []',
    async (command) => {
      const text = await read(EMPTY, [command]);
      expect(text.code).toBe(0);
      expect(text.stderr).toBe('');
      const json = await read(EMPTY, [command, '--json']);
      expect(json.code).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Row 29: an unnamed view
// ---------------------------------------------------------------------------

describe('row 29: an unnamed view is listed and not addressable', SLOW, () => {
  it('list-views holds it; get-view with the id it reports exits 1', async () => {
    const views = mutatorOf(RICH).listViews();
    const unnamed = views.filter((v) => v.id === null);
    expect(unnamed).toHaveLength(1);
    const list = await read(RICH, ['list-views', '--json']);
    expect(list.code).toBe(0);
    expect(JSON.parse(list.stdout)).toStrictEqual(asJson(views));
    // The reported id is null; a flag carries it as the text "null".
    const id = String(unnamed[0].id);
    expect(mutatorOf(RICH).getView(id)).toBeNull();
    const get = await read(RICH, ['get-view', '--id', id]);
    expect(get.code).toBe(1);
    expect(get.stdout).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Row 30: readable text of the new read commands
// ---------------------------------------------------------------------------

describe('row 30: the new read commands print readable text naming what they read', SLOW, () => {
  const ids = (items: Array<{ id: string | null }>): string[] => items.flatMap((i) => (i.id === null ? [] : [i.id]));
  it.each([
    {
      args: ['get-relationships'],
      names: (m: LikeC4Mutator) => m.getRelationships().flatMap((r) => [r.sourceFqn, r.targetFqn]),
    },
    {
      args: ['get-specification'],
      names: (m: LikeC4Mutator) => {
        const spec = m.getSpecification()!;
        return [...spec.elementKinds, ...spec.relationshipKinds, ...(spec.deploymentNodeKinds ?? []), ...spec.tags];
      },
    },
    { args: ['list-views'], names: (m: LikeC4Mutator) => ids(m.listViews()) },
    { args: ['get-view', '--id', 'landing'], names: (m: LikeC4Mutator) => [m.getView('landing')!.id!] },
    { args: ['list-deployment-nodes'], names: (m: LikeC4Mutator) => ids(m.listDeploymentNodes()) },
    { args: ['get-deployment-node', '--id', 'main.front'], names: (m: LikeC4Mutator) => [m.getDeploymentNode('main.front')!.id] },
    { args: ['get-deployment-node-kind', '--kind', 'pod'], names: (m: LikeC4Mutator) => [m.getDeploymentNodeKind('pod')!.kind] },
    { args: ['list-deployment-instances'], names: (m: LikeC4Mutator) => ids(m.listDeploymentInstances()) },
    {
      args: ['get-deployment-instance', '--id', 'main.front.gateway'],
      names: (m: LikeC4Mutator) => [m.getDeploymentInstance('main.front.gateway')!.id],
    },
    {
      args: ['list-deployment-relationships'],
      names: (m: LikeC4Mutator) => m.listDeploymentRelationships().flatMap((r) => [r.source.id, r.target.id]),
    },
  ])('$args.0', async ({ args, names }) => {
    const expected = names(mutatorOf(RICH));
    expect(expected.length).toBeGreaterThan(0);
    const result = await read(RICH, args);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toBe('');
    for (const name of expected) expect(result.stdout).toContain(name);
  });
});

// ---------------------------------------------------------------------------
// Row 31: the kept text of list-elements
// ---------------------------------------------------------------------------

describe('row 31: list-elements keeps its text', SLOW, () => {
  it('lists the elements of the minimal fixture', async () => {
    const result = await read(MINIMAL, ['list-elements']);
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toEqual([
      'app  [system]  "My Application"',
      'app.api  [service]  "REST API"  (TypeScript / Express)',
      'app.db  [database]  "PostgreSQL"  (PostgreSQL 16)',
      '',
    ]);
  });

  it('prints No elements found when the filter matches none', async () => {
    const result = await read(MINIMAL, ['list-elements', '--kind', 'nothing']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('No elements found\n');
  });
});
