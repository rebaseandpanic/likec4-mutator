/**
 * The commands generated from the operation table (rows 8–16 of the
 * lc4m-15.31 test matrix): each runs exactly what `apply` runs for the same
 * single mutation (US-1, INV-2, D135), prints `apply`'s lines without its
 * summary or `<operation>: done` (D145), prints only the `--json` envelope
 * with `--json`, rejects with the flag in place of `apply`'s mutation path
 * and writes nothing (INV-1, P3), honours `--output`, and decodes every
 * value kind losslessly (US-1 encoding, D156, Edge cases).
 *
 * The program runs in process through `buildProgram`.  Each case runs on
 * its own copies of one model: one copy gets the command, another `apply`
 * with the case's mutation; files are compared byte for byte.  Expected
 * sides are `apply`'s run on the same input (the spec's contract: the
 * command equals `apply`), the library method's own value for `--json`,
 * and for the printed lines `apply`'s format from before this change
 * (INV-6), written out per case.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { Mutation } from '../../src/mutations-file.js';
import { expectValidLikeC4 } from '../helpers/likec4-model.js';

const SLOW = { timeout: 300_000 };
const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Model A of row 1: `nav` refers to `base` (15:18); `flow` opens with a parallel block. */
const MODEL_A = [
  'specification {',
  '  element system',
  '}',
  'model {',
  '  app = system',
  '  other = system',
  '  app -> other',
  '}',
  'views {',
  '  view base {',
  '    include app, other',
  '  }',
  '  view nav {',
  '    include app with {',
  '      navigateTo base',
  '    }',
  '  }',
  '  dynamic view flow {',
  '    parallel {',
  '      app -> other',
  '    }',
  '    app -> other',
  '  }',
  '}',
  '',
].join('\n');

/** Model B of row 1: model A without `nav`. */
const MODEL_B = MODEL_A.replace('  view nav {\n    include app with {\n      navigateTo base\n    }\n  }\n', '');

/** The models of the cases, by name: a fixture directory, or files given here. */
const MODELS = {
  zones: 'deployment-zones',
  flows: 'views-flows',
  minimal: 'minimal',
  /** A kind and a tag nothing uses; elements no instance deploys */
  spec: {
    'model.c4':
      'specification {\n  element system\n  element unused\n  tag core\n  tag old\n}\n' +
      'model {\n  app = system {\n    #core\n    api = system\n  }\n  other = system\n}\n',
  },
  /** `a -> b` next to `a <-> b` */
  bidi: { 'model.c4': 'specification {\n  element system\n}\nmodel {\n  a = system\n  b = system\n  a -> b\n  a <-> b\n}\n' },
  /** Two `extend prod` blocks in one file */
  twice: {
    'model.c4':
      'specification {\n  element system\n  deploymentNode node\n  tag first\n  tag second\n}\n' +
      'model {\n  app = system\n}\ndeployment {\n  prod = node\n}\n',
    'ext.c4': 'deployment {\n  extend prod {\n    #first\n  }\n  extend prod {\n    #second\n  }\n}\n',
  },
  modelA: { 'model.c4': MODEL_A },
  modelB: { 'model.c4': MODEL_B },
} as const satisfies Record<string, string | Record<string, string>>;

type Model = keyof typeof MODELS;

/** Every file under `dir`, by path relative to `dir`. */
function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).split('\\').join('/')] = readFileSync(path, 'utf-8');
    }
  };
  walk(dir);
  return files;
}

/** The files of a model. */
function modelFiles(model: Model): Record<string, string> {
  const source = MODELS[model];
  return typeof source === 'string' ? readTree(join(FIXTURES, source)) : { ...source };
}

/** A new temporary directory holding a copy of `model`. */
function workspace(model: Model): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-operation-commands-'));
  const source = MODELS[model];
  if (typeof source === 'string') {
    cpSync(join(FIXTURES, source), dir, { recursive: true });
  } else {
    for (const [name, text] of Object.entries(source)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text, 'utf-8');
    }
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the program on `args`. */
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

/** A command run on a fresh copy of `model`, and the files after it. */
async function runCommand(model: Model, args: readonly string[]): Promise<Run & { files: Record<string, string> }> {
  const dir = workspace(model);
  const [command, ...flags] = args;
  const result = await run([command, '--dir', dir, ...flags]);
  return { ...result, files: readTree(dir) };
}

/** `apply` with the single `mutation` on a fresh copy of `model`, in place, and the files after it. */
async function runApply(model: Model, mutation: object): Promise<Run & { files: Record<string, string> }> {
  const dir = workspace(model);
  const mutations = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-operation-mutations-')), 'mutations.json');
  writeFileSync(mutations, JSON.stringify({ mutations: [mutation] }), 'utf-8');
  const result = await run(['apply', '--dir', dir, '--mutations', mutations, '--in-place']);
  return { ...result, files: readTree(dir) };
}

const SUMMARY = 'Applied 1 mutation(s) successfully';

/** `apply`'s stdout lines for one mutation, without the summary line. */
function applyLines(stdout: string): string[] {
  const lines = stdout.split('\n');
  expect(lines.slice(-2), 'apply ends with its summary line').toEqual([SUMMARY, '']);
  return lines.slice(0, -2);
}

/**
 * `apply`'s rejection line with `--<flag>` in place of the mutation path
 * `mutations[0].<field>`; for a rejection of the whole operation
 * (`field` null) the detail alone.
 */
function translated(applyStderr: string, field: string | null, flag: string | null): string {
  if (field === null) {
    expect(applyStderr.startsWith('Error: mutations[0]: '), applyStderr).toBe(true);
    return `Error: ${applyStderr.slice('Error: mutations[0]: '.length)}`;
  }
  const prefix = `Error: mutations[0].${field}`;
  expect(applyStderr.startsWith(prefix), applyStderr).toBe(true);
  expect(/^[.[:]/.test(applyStderr.slice(prefix.length)), applyStderr).toBe(true);
  return `Error: --${flag}${applyStderr.slice(prefix.length)}`;
}

/**
 * The command `args` ends as `apply` with `mutation` does on `model`: when
 * `apply` succeeds, exit 0 and the same files, which pass the LikeC4 check;
 * when it rejects, exit 1, nothing on stdout, the files unchanged and
 * `apply`'s line with the flag (`rejectedAt`: the field and its flag).
 */
async function expectSameAsApply(
  model: Model,
  args: readonly string[],
  mutation: object,
  rejectedAt: { field: string | null; flag: string | null } = { field: null, flag: null },
): Promise<{ command: Run; apply: Run }> {
  const apply = await runApply(model, mutation);
  const command = await runCommand(model, args);
  if (apply.code === 0) {
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    expect(command.files).toEqual(apply.files);
    await expectValidLikeC4(command.files);
  } else {
    expect(apply.code).toBe(1);
    expect(command.code).toBe(1);
    expect(command.stdout).toBe('');
    expect(command.files).toEqual(modelFiles(model));
    expect(command.stderr).toBe(translated(apply.stderr, rejectedAt.field, rejectedAt.flag));
  }
  return { command, apply };
}

// ---------------------------------------------------------------------------
// The case table: one or more successful cases per generated command
// ---------------------------------------------------------------------------

interface Case {
  model: Model;
  /** The command and its field flags (`--dir` is added) */
  args: string[];
  /** The same fields as an `apply` mutation */
  mutation: { op: Mutation['op'] } & Record<string, unknown>;
  /** The library call of the operation with the same arguments */
  call: (m: LikeC4Mutator) => unknown;
  /**
   * The lines `apply` prints for the operation, in its format from before
   * lc4m-15.31 (INV-6), filled in from the model by hand; absent where
   * `apply` prints none, and the command prints `<operation>: done`
   */
  output?: string[];
}

const LINKS = [{ url: 'https://example.com/docs', label: 'Docs' }];
const LINKS_JSON = '[{"url":"https://example.com/docs","label":"Docs"}]';
const WEB = { id: 'prod.eu.vm2.web' };
const API = { id: 'prod.eu.vm1.api' };
const API2 = { id: 'prod.eu.vm1.api2' };
const DB = { id: 'prod.eu.vm1.db' };
const VM1 = { id: 'prod.eu.vm1' };
const VM2 = { id: 'prod.eu.vm2' };
const RS = { file: 'model.c4', line: 25, column: 3 };
const RS_JSON = '{"file":"model.c4","line":25,"column":3}';

const CASES: Case[] = [
  {
    model: 'zones',
    args: ['rename-element', '--fqn', 'shop.db', '--new-name', 'storage'],
    mutation: { op: 'renameElement', fqn: 'shop.db', newName: 'storage' },
    output: ["  renameElement: renamed 'shop.db' to 'shop.storage'"],
    call: (m) => m.renameElement('shop.db', 'storage'),
  },
  {
    model: 'spec',
    args: ['move-element', '--fqn', 'other', '--parent', 'app'],
    mutation: { op: 'moveElement', fqn: 'other', parent: 'app' },
    output: ["  moveElement: moved 'other' to 'app.other'"],
    call: (m) => m.moveElement('other', { parent: 'app' }),
  },
  {
    model: 'spec',
    args: ['move-element', '--fqn', 'app.api', '--unset-parent', '--file', 'model.c4'],
    mutation: { op: 'moveElement', fqn: 'app.api', parent: null, file: 'model.c4' },
    output: ["  moveElement: moved 'app.api' to 'api'"],
    call: (m) => m.moveElement('app.api', { parent: null, file: 'model.c4' }),
  },
  {
    model: 'zones',
    args: [
      'add-kind', '--type', 'element', '--name', 'gateway', '--file', 'spec.c4', '--title', 'Gateway', '--summary', 'Entry point',
      '--description', 'Routes requests', '--technology', 'Envoy', '--tags', 'edge', '--links', LINKS_JSON,
    ],
    mutation: {
      op: 'addKind', type: 'element', name: 'gateway', file: 'spec.c4', title: 'Gateway', summary: 'Entry point',
      description: 'Routes requests', technology: 'Envoy', tags: ['edge'], links: LINKS,
    },
    output: ["  addKind: declared the element kind 'gateway'"],
    call: (m) =>
      m.addKind('element', 'gateway', {
        file: 'spec.c4', title: 'Gateway', summary: 'Entry point', description: 'Routes requests', technology: 'Envoy', tags: ['edge'], links: LINKS,
      }),
  },
  {
    model: 'zones',
    args: [
      'update-kind', '--type', 'element', '--name', 'service', '--title', 'Service', '--summary', 'A service',
      '--description', 'Runs code', '--tags', '["public"]', '--links', LINKS_JSON,
    ],
    mutation: {
      op: 'updateKind', type: 'element', name: 'service', title: 'Service', summary: 'A service', description: 'Runs code', tags: ['public'], links: LINKS,
    },
    output: ["  updateKind: changed the element kind 'service'"],
    call: (m) =>
      m.updateKind('element', 'service', { title: 'Service', summary: 'A service', description: 'Runs code', tags: ['public'], links: LINKS }),
  },
  {
    model: 'zones',
    args: ['update-kind', '--type', 'element', '--name', 'service', '--unset-technology'],
    mutation: { op: 'updateKind', type: 'element', name: 'service', technology: null },
    output: ["  updateKind: changed the element kind 'service'"],
    call: (m) => m.updateKind('element', 'service', { technology: null }),
  },
  {
    model: 'zones',
    args: ['add-tag', '--name', 'beta', '--file', 'spec.c4'],
    mutation: { op: 'addTag', name: 'beta', file: 'spec.c4' },
    output: ["  addTag: declared the tag 'beta'"],
    call: (m) => m.addTag('beta', { file: 'spec.c4' }),
  },
  {
    model: 'zones',
    args: ['rename-kind', '--type', 'element', '--name', 'worker', '--new-name', 'job'],
    mutation: { op: 'renameKind', type: 'element', name: 'worker', newName: 'job' },
    output: ["  renameKind: renamed the element kind 'worker' to 'job'"],
    call: (m) => m.renameKind('element', 'worker', 'job'),
  },
  {
    model: 'spec',
    args: ['remove-kind', '--type', 'element', '--name', 'unused'],
    mutation: { op: 'removeKind', type: 'element', name: 'unused' },
    output: ["  removeKind: removed the element kind 'unused'"],
    call: (m) => m.removeKind('element', 'unused'),
  },
  {
    model: 'zones',
    args: ['rename-tag', '--name', 'replica', '--new-name', 'standby'],
    mutation: { op: 'renameTag', name: 'replica', newName: 'standby' },
    output: ["  renameTag: renamed the tag 'replica' to 'standby'"],
    call: (m) => m.renameTag('replica', 'standby'),
  },
  {
    model: 'spec',
    args: ['remove-tag', '--name', 'old'],
    mutation: { op: 'removeTag', name: 'old' },
    output: ["  removeTag: removed the tag 'old'"],
    call: (m) => m.removeTag('old'),
  },
  {
    model: 'zones',
    args: ['add-element-extend', '--fqn', 'shop.web', '--file', 'model.c4', '--tags', 'internal', '--links', LINKS_JSON, '--metadata', '{"owner":"team-b"}'],
    mutation: { op: 'addElementExtend', fqn: 'shop.web', file: 'model.c4', tags: ['internal'], links: LINKS, metadata: { owner: 'team-b' } },
    output: ["  addElementExtend: added an extend block of 'shop.web' in 'model.c4'"],
    call: (m) => m.addElementExtend('shop.web', { file: 'model.c4', tags: ['internal'], links: LINKS, metadata: { owner: 'team-b' } }),
  },
  {
    model: 'zones',
    args: [
      'add-relationship-extend', '--source', 'shop.web', '--target', 'shop.api', '--match-title', 'calls', '--match-bidirectional', 'false',
      '--file', 'model.c4', '--tags', 'public', '--links', LINKS_JSON, '--metadata', '{"owner":"team-b"}',
    ],
    mutation: {
      op: 'addRelationshipExtend', source: 'shop.web', target: 'shop.api', matchTitle: 'calls', matchBidirectional: false,
      file: 'model.c4', tags: ['public'], links: LINKS, metadata: { owner: 'team-b' },
    },
    output: ["  addRelationshipExtend: added an extend block of 'shop.web' -> 'shop.api' in 'model.c4'"],
    call: (m) =>
      m.addRelationshipExtend(
        { source: 'shop.web', target: 'shop.api', matchTitle: 'calls', matchBidirectional: false },
        { file: 'model.c4', tags: ['public'], links: LINKS, metadata: { owner: 'team-b' } },
      ),
  },
  {
    model: 'zones',
    args: ['add-relationship-extend', '--source', 'shop.api', '--target', 'shop.db', '--position', RS_JSON, '--file', 'model.c4', '--tags', 'internal', '--shared'],
    mutation: { op: 'addRelationshipExtend', source: 'shop.api', target: 'shop.db', position: RS, file: 'model.c4', tags: ['internal'], shared: true },
    output: ["  addRelationshipExtend: added an extend block of 'shop.api' -> 'shop.db' in 'model.c4'"],
    call: (m) => m.addRelationshipExtend({ source: 'shop.api', target: 'shop.db', position: RS }, { file: 'model.c4', tags: ['internal'], shared: true }),
  },
  {
    model: 'flows',
    args: ['add-relationship-extend', '--source', 'portal.web', '--target', 'portal.gateway', '--match-kind', 'call', '--file', 'model.c4', '--tags', 'draft'],
    mutation: { op: 'addRelationshipExtend', source: 'portal.web', target: 'portal.gateway', matchKind: 'call', file: 'model.c4', tags: ['draft'] },
    output: ["  addRelationshipExtend: added an extend block of 'portal.web' -> 'portal.gateway' in 'model.c4'"],
    call: (m) => m.addRelationshipExtend({ source: 'portal.web', target: 'portal.gateway', matchKind: 'call' }, { file: 'model.c4', tags: ['draft'] }),
  },
  {
    model: 'zones',
    args: [
      'update-relationship', '--source', 'shop.web', '--target', 'shop.api', '--match-title', 'calls', '--match-bidirectional', 'false',
      '--label', 'requests', '--description', 'Browses', '--technology', 'HTTPS', '--tags', 'public', '--links', LINKS_JSON,
      '--metadata', '{"owner":"team-b"}', '--style', '{"line":"dashed"}',
    ],
    mutation: {
      op: 'updateRelationship', source: 'shop.web', target: 'shop.api', matchTitle: 'calls', matchBidirectional: false, label: 'requests',
      description: 'Browses', technology: 'HTTPS', tags: ['public'], links: LINKS, metadata: { owner: 'team-b' }, style: { line: 'dashed' },
    },
    call: (m) =>
      m.updateRelationship(
        { source: 'shop.web', target: 'shop.api', matchTitle: 'calls', matchBidirectional: false },
        { label: 'requests', description: 'Browses', technology: 'HTTPS', tags: ['public'], links: LINKS, metadata: { owner: 'team-b' }, style: { line: 'dashed' } },
      ),
  },
  {
    model: 'zones',
    args: ['update-relationship', '--source', 'shop.api', '--target', 'shop.db', '--position', RS_JSON, '--technology', 'SQL'],
    mutation: { op: 'updateRelationship', source: 'shop.api', target: 'shop.db', position: RS, technology: 'SQL' },
    call: (m) => m.updateRelationship({ source: 'shop.api', target: 'shop.db', position: RS }, { technology: 'SQL' }),
  },
  {
    model: 'flows',
    args: ['update-relationship', '--source', 'portal.web', '--target', 'portal.gateway', '--match-kind', 'call', '--technology', 'HTTP'],
    mutation: { op: 'updateRelationship', source: 'portal.web', target: 'portal.gateway', matchKind: 'call', technology: 'HTTP' },
    call: (m) => m.updateRelationship({ source: 'portal.web', target: 'portal.gateway', matchKind: 'call' }, { technology: 'HTTP' }),
  },
  {
    model: 'flows',
    args: [
      'add-view', '--id', 'overview', '--type', 'element', '--target', 'portal', '--title', 'Overview', '--includes', '["*","mailer"]',
      '--auto-layout', 'LeftRight', '--description', 'The portal', '--file', 'platform.c4',
    ],
    mutation: {
      op: 'addView', id: 'overview', type: 'element', target: 'portal', title: 'Overview', includes: ['*', 'mailer'],
      autoLayout: 'LeftRight', description: 'The portal', file: 'platform.c4',
    },
    call: (m) =>
      m.addView({
        id: 'overview', type: 'element', target: 'portal', title: 'Overview', includes: ['*', 'mailer'],
        autoLayout: 'LeftRight', description: 'The portal', file: 'platform.c4',
      }),
  },
  {
    model: 'flows',
    args: ['add-view', '--id', 'wider', '--type', 'element', '--extends', 'platform', '--unset-auto-layout'],
    mutation: { op: 'addView', id: 'wider', type: 'element', extends: 'platform', autoLayout: null },
    call: (m) => m.addView({ id: 'wider', type: 'element', extends: 'platform', autoLayout: null }),
  },
  {
    model: 'zones',
    args: [
      'add-deployment-node', '--parent', 'prod.eu', '--name', 'vm4', '--kind', 'host', '--title', 'VM 4', '--summary', 'Spare host',
      '--description', 'Standby', '--technology', 'KVM', '--tags', 'edge', '--links', LINKS_JSON, '--style', '{"color":"green"}',
      '--metadata', '{"owner":"ops"}',
    ],
    mutation: {
      op: 'addDeploymentNode', parent: 'prod.eu', name: 'vm4', kind: 'host', title: 'VM 4', summary: 'Spare host', description: 'Standby',
      technology: 'KVM', tags: ['edge'], links: LINKS, style: { color: 'green' }, metadata: { owner: 'ops' },
    },
    output: ["  addDeploymentNode: created 'prod.eu.vm4'"],
    call: (m) =>
      m.addDeploymentNode('prod.eu', {
        name: 'vm4', kind: 'host', title: 'VM 4', summary: 'Spare host', description: 'Standby', technology: 'KVM', tags: ['edge'],
        links: LINKS, style: { color: 'green' }, metadata: { owner: 'ops' },
      }),
  },
  {
    model: 'zones',
    args: ['add-deployment-node', '--name', 'staging', '--kind', 'environment', '--file', 'ext/eu.c4'],
    mutation: { op: 'addDeploymentNode', name: 'staging', kind: 'environment', file: 'ext/eu.c4' },
    output: ["  addDeploymentNode: created 'staging'"],
    call: (m) => m.addDeploymentNode(null, { name: 'staging', kind: 'environment', file: 'ext/eu.c4' }),
  },
  {
    model: 'zones',
    args: [
      'update-deployment-node', '--id', 'prod.eu.vm2', '--title', 'VM 2', '--summary', 'Web host', '--description', 'Serves', '--technology', 'Xen',
      '--tags', 'public', '--links', LINKS_JSON, '--style', '{"color":"red"}', '--metadata', '{"owner":"ops"}',
    ],
    mutation: {
      op: 'updateDeploymentNode', id: 'prod.eu.vm2', title: 'VM 2', summary: 'Web host', description: 'Serves', technology: 'Xen',
      tags: ['public'], links: LINKS, style: { color: 'red' }, metadata: { owner: 'ops' },
    },
    call: (m) =>
      m.updateDeploymentNode('prod.eu.vm2', {
        title: 'VM 2', summary: 'Web host', description: 'Serves', technology: 'Xen', tags: ['public'], links: LINKS, style: { color: 'red' },
        metadata: { owner: 'ops' },
      }),
  },
  {
    model: 'zones',
    args: ['remove-deployment-node', '--id', 'prod.eu.vm3', '--cascade'],
    mutation: { op: 'removeDeploymentNode', id: 'prod.eu.vm3', cascade: true },
    output: ["  removeDeploymentNode: removed 'prod.eu.vm3' (1 relationship(s) also removed)"],
    call: (m) => m.removeDeploymentNode('prod.eu.vm3', { cascade: true }),
  },
  {
    model: 'zones',
    args: [
      'add-deployment-instance', '--node', 'prod.eu.vm2', '--element', 'shop.api', '--name', 'api3', '--title', 'API 3', '--summary', 'Third',
      '--description', 'Extra', '--technology', 'Go', '--tags', 'replica', '--links', LINKS_JSON, '--style', '{"color":"green"}',
      '--metadata', '{"tier":"bronze"}',
    ],
    mutation: {
      op: 'addDeploymentInstance', node: 'prod.eu.vm2', element: 'shop.api', name: 'api3', title: 'API 3', summary: 'Third', description: 'Extra',
      technology: 'Go', tags: ['replica'], links: LINKS, style: { color: 'green' }, metadata: { tier: 'bronze' },
    },
    output: ["  addDeploymentInstance: created 'prod.eu.vm2.api3'"],
    call: (m) =>
      m.addDeploymentInstance('prod.eu.vm2', {
        element: 'shop.api', name: 'api3', title: 'API 3', summary: 'Third', description: 'Extra', technology: 'Go', tags: ['replica'],
        links: LINKS, style: { color: 'green' }, metadata: { tier: 'bronze' },
      }),
  },
  {
    model: 'zones',
    args: [
      'update-deployment-instance', '--id', 'prod.eu.vm1.api', '--title', 'Primary API', '--summary', 'Main', '--description', 'Serves',
      '--technology', 'Go', '--tags', 'primary', '--links', LINKS_JSON, '--style', '{"color":"green"}', '--metadata', '{"tier":"gold"}',
    ],
    mutation: {
      op: 'updateDeploymentInstance', id: 'prod.eu.vm1.api', title: 'Primary API', summary: 'Main', description: 'Serves', technology: 'Go',
      tags: ['primary'], links: LINKS, style: { color: 'green' }, metadata: { tier: 'gold' },
    },
    call: (m) =>
      m.updateDeploymentInstance('prod.eu.vm1.api', {
        title: 'Primary API', summary: 'Main', description: 'Serves', technology: 'Go', tags: ['primary'], links: LINKS, style: { color: 'green' },
        metadata: { tier: 'gold' },
      }),
  },
  {
    model: 'zones',
    args: ['remove-deployment-instance', '--id', 'prod.eu.cache', '--cascade'],
    mutation: { op: 'removeDeploymentInstance', id: 'prod.eu.cache', cascade: true },
    output: ["  removeDeploymentInstance: removed 'prod.eu.cache'"],
    call: (m) => m.removeDeploymentInstance('prod.eu.cache', { cascade: true }),
  },
  {
    model: 'zones',
    args: [
      'add-deployment-relationship', '--source', '{"id":"prod.eu.vm2.web"}', '--target', '{"id":"prod.eu.vm1.db"}', '--kind', 'calls',
      '--bidirectional', '--title', 'reads', '--description', 'Direct read', '--technology', 'SQL', '--tags', 'internal', '--links', LINKS_JSON,
      '--metadata', '{"owner":"ops"}', '--style', '{"line":"dashed"}', '--file', 'deployment.c4',
    ],
    mutation: {
      op: 'addDeploymentRelationship', source: WEB, target: DB, kind: 'calls', bidirectional: true, title: 'reads', description: 'Direct read',
      technology: 'SQL', tags: ['internal'], links: LINKS, metadata: { owner: 'ops' }, style: { line: 'dashed' }, file: 'deployment.c4',
    },
    call: (m) =>
      m.addDeploymentRelationship(WEB, DB, {
        kind: 'calls', bidirectional: true, title: 'reads', description: 'Direct read', technology: 'SQL', tags: ['internal'], links: LINKS,
        metadata: { owner: 'ops' }, style: { line: 'dashed' }, file: 'deployment.c4',
      }),
  },
  {
    model: 'zones',
    args: [
      'update-deployment-relationship', '--source', '{"id":"prod.eu.vm1.api"}', '--target', '{"id":"prod.eu.vm1.db"}', '--match-title', 'queries',
      '--title', 'reads', '--description', 'Reads rows', '--technology', 'SQL', '--tags', 'internal', '--links', LINKS_JSON,
      '--metadata', '{"owner":"ops"}', '--style', '{"line":"dashed"}',
    ],
    mutation: {
      op: 'updateDeploymentRelationship', source: API, target: DB, matchTitle: 'queries', title: 'reads', description: 'Reads rows',
      technology: 'SQL', tags: ['internal'], links: LINKS, metadata: { owner: 'ops' }, style: { line: 'dashed' },
    },
    call: (m) =>
      m.updateDeploymentRelationship(
        { source: API, target: DB, title: 'queries' },
        { title: 'reads', description: 'Reads rows', technology: 'SQL', tags: ['internal'], links: LINKS, metadata: { owner: 'ops' }, style: { line: 'dashed' } },
      ),
  },
  {
    model: 'zones',
    args: ['update-deployment-relationship', '--source', '{"id":"prod.eu.vm1.api"}', '--target', '{"id":"prod.eu.vm1.api2"}', '--match-kind', 'calls', '--technology', 'HTTP'],
    mutation: { op: 'updateDeploymentRelationship', source: API, target: API2, matchKind: 'calls', technology: 'HTTP' },
    call: (m) => m.updateDeploymentRelationship({ source: API, target: API2, kind: 'calls' }, { technology: 'HTTP' }),
  },
  {
    model: 'zones',
    args: ['remove-deployment-relationship', '--source', '{"id":"prod.eu.vm2"}', '--target', '{"id":"prod.eu.vm1"}', '--match-kind', 'syncs', '--match-title', 'mirrors'],
    mutation: { op: 'removeDeploymentRelationship', source: VM2, target: VM1, matchKind: 'syncs', matchTitle: 'mirrors' },
    call: (m) => m.removeDeploymentRelationship({ source: VM2, target: VM1, kind: 'syncs', title: 'mirrors' }),
  },
  {
    model: 'zones',
    args: ['add-deployment-extend', '--node', 'prod.eu.vm2', '--file', 'deployment.c4', '--tags', 'internal', '--links', LINKS_JSON, '--metadata', '{"owner":"ops"}'],
    mutation: { op: 'addDeploymentExtend', node: 'prod.eu.vm2', file: 'deployment.c4', tags: ['internal'], links: LINKS, metadata: { owner: 'ops' } },
    call: (m) => m.addDeploymentExtend('prod.eu.vm2', { file: 'deployment.c4', tags: ['internal'], links: LINKS, metadata: { owner: 'ops' } }),
  },
  {
    model: 'zones',
    args: ['remove-deployment-extend', '--node', 'prod.eu', '--file', 'ext/eu.c4', '--occurrence', '1'],
    mutation: { op: 'removeDeploymentExtend', node: 'prod.eu', file: 'ext/eu.c4', occurrence: 1 },
    output: ["  removeDeploymentExtend: removed 'extend prod.eu' in 'ext/eu.c4' (1 relationship(s) also removed)"],
    call: (m) => m.removeDeploymentExtend({ node: 'prod.eu', file: 'ext/eu.c4', occurrence: 1 }),
  },
  {
    model: 'flows',
    args: ['update-view', '--id', 'landing', '--title', 'Home', '--description', 'Start here', '--tags', 'draft', '--links', LINKS_JSON, '--auto-layout', 'TopBottom'],
    mutation: { op: 'updateView', id: 'landing', title: 'Home', description: 'Start here', tags: ['draft'], links: LINKS, autoLayout: 'TopBottom' },
    call: (m) => m.updateView('landing', { title: 'Home', description: 'Start here', tags: ['draft'], links: LINKS, autoLayout: 'TopBottom' }),
  },
  {
    model: 'flows',
    args: ['update-view', '--id', 'landing', '--unset-title', '--unset-description', '--unset-auto-layout'],
    mutation: { op: 'updateView', id: 'landing', title: null, description: null, autoLayout: null },
    call: (m) => m.updateView('landing', { title: null, description: null, autoLayout: null }),
  },
  {
    model: 'flows',
    args: ['add-view-rule', '--id', 'landing', '--rule', '{"kind":"exclude","expression":"mailer"}', '--before', '{"index":0}'],
    mutation: { op: 'addViewRule', id: 'landing', rule: { kind: 'exclude', expression: 'mailer' }, before: { index: 0 } },
    call: (m) => m.addViewRule('landing', { kind: 'exclude', expression: 'mailer' }, { before: { index: 0 } }),
  },
  {
    model: 'flows',
    args: ['replace-view-rule', '--id', 'platform', '--address', '{"index":1}', '--rule', '{"kind":"exclude","expression":"portal.jobs"}'],
    mutation: { op: 'replaceViewRule', id: 'platform', address: { index: 1 }, rule: { kind: 'exclude', expression: 'portal.jobs' } },
    call: (m) => m.replaceViewRule('platform', { index: 1 }, { kind: 'exclude', expression: 'portal.jobs' }),
  },
  {
    model: 'flows',
    args: ['remove-view-rule', '--id', 'platform', '--address', '{"index":1,"text":"exclude jobs"}'],
    mutation: { op: 'removeViewRule', id: 'platform', address: { index: 1, text: 'exclude jobs' } },
    call: (m) => m.removeViewRule('platform', { index: 1, text: 'exclude jobs' }),
  },
  {
    model: 'flows',
    args: ['remove-view', '--id', 'delivery', '--cascade'],
    mutation: { op: 'removeView', id: 'delivery', cascade: true },
    output: ["  removeView: removed 'delivery'", '  removeView: cascade removed flows.c4:28:18 (navigate-to), flows.c4:79:18 (navigate-to)'],
    call: (m) => m.removeView('delivery', { cascade: true }),
  },
  {
    model: 'flows',
    args: ['add-view-step', '--id', 'delivery', '--step', '{"source":"mailer","target":"portal.worker","title":"bounces"}', '--path', '[2]'],
    mutation: { op: 'addViewStep', id: 'delivery', step: { source: 'mailer', target: 'portal.worker', title: 'bounces' }, path: [2] },
    call: (m) => m.addViewStep('delivery', { source: 'mailer', target: 'portal.worker', title: 'bounces' }, { path: [2] }),
  },
  {
    model: 'flows',
    args: ['update-view-step', '--id', 'delivery', '--address', '{"path":[0]}', '--patch', '{"title":"pulls"}'],
    mutation: { op: 'updateViewStep', id: 'delivery', address: { path: [0] }, patch: { title: 'pulls' } },
    call: (m) => m.updateViewStep('delivery', { path: [0] }, { title: 'pulls' }),
  },
  {
    model: 'flows',
    args: ['move-view-step', '--id', 'delivery', '--from', '{"path":[1]}', '--to', '[0]'],
    mutation: { op: 'moveViewStep', id: 'delivery', from: { path: [1] }, to: [0] },
    call: (m) => m.moveViewStep('delivery', { path: [1] }, [0]),
  },
  {
    model: 'flows',
    args: ['remove-view-step', '--id', 'delivery', '--address', '{"path":[1]}'],
    mutation: { op: 'removeViewStep', id: 'delivery', address: { path: [1] } },
    call: (m) => m.removeViewStep('delivery', { path: [1] }),
  },
  {
    model: 'flows',
    args: ['add-view-parallel', '--id', 'delivery', '--statements', '[[0],[1]]'],
    mutation: { op: 'addViewParallel', id: 'delivery', statements: [[0], [1]] },
    call: (m) => m.addViewParallel('delivery', { statements: [[0], [1]] }),
  },
  {
    model: 'flows',
    args: ['add-view-parallel', '--id', 'delivery', '--path', '[2]', '--steps', '[{"source":"portal.jobs","target":"mailer"},{"source":"mailer","target":"portal.jobs"}]'],
    mutation: {
      op: 'addViewParallel', id: 'delivery', path: [2],
      steps: [{ source: 'portal.jobs', target: 'mailer' }, { source: 'mailer', target: 'portal.jobs' }],
    },
    call: (m) =>
      m.addViewParallel('delivery', { path: [2], steps: [{ source: 'portal.jobs', target: 'mailer' }, { source: 'mailer', target: 'portal.jobs' }] }),
  },
];

/** The five commands that keep their own interface (US-2), not generated from a case of this table. */
const KEPT_COMMANDS = ['add-element', 'add-relationship', 'update-element', 'remove-element', 'remove-relationship'];

/** The spec's command name of an operation: its kebab-case form (`addView` → `add-view`). */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The flags of a case's arguments (the tokens naming a flag). */
function flagsOf(args: readonly string[]): string[] {
  return args.slice(1).filter((token) => token.startsWith('--'));
}

/** Label of a case in test names. */
function label(c: Case): string {
  return flagsOf(c.args).length > 0 ? `${c.args[0]} ${flagsOf(c.args).join(' ')}` : c.args[0];
}

const memo = new Map<string, Promise<Run & { files: Record<string, string> }>>();

/** One run per case and kind, shared by the tests of rows 8 and 9. */
function once(key: string, start: () => Promise<Run & { files: Record<string, string> }>): Promise<Run & { files: Record<string, string> }> {
  let pending = memo.get(key);
  if (!pending) {
    pending = start();
    memo.set(key, pending);
  }
  return pending;
}

const applyOf = (c: Case) => once(`apply ${label(c)}`, () => runApply(c.model, c.mutation));
const commandOf = (c: Case) => once(`command ${label(c)}`, () => runCommand(c.model, c.args));

// ---------------------------------------------------------------------------
// Row 8: success equals apply
// ---------------------------------------------------------------------------

describe('row 8: each generated command writes what apply writes for the same mutation', SLOW, () => {
  it('the case table covers exactly the generated commands', async () => {
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    const commands = help.stdout
      .slice(help.stdout.indexOf('Commands:'))
      .split('\n')
      .map((line) => /^ {2}([a-z][a-z-]*)/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined);
    // Without the kept, read, validate, apply and help commands.
    const generated = commands.filter(
      (name) => !KEPT_COMMANDS.includes(name) && !/^(get|list)-/.test(name) && !['validate', 'apply', 'help'].includes(name),
    );
    expect(new Set(CASES.map((c) => c.args[0]))).toEqual(new Set(generated));
    expect(generated).toHaveLength(34);

    for (const c of CASES) expect(c.args[0], c.mutation.op).toBe(kebab(c.mutation.op));
  });

  it.each(CASES.map((c) => [label(c), c] as const))('%s', async (_, c) => {
    const apply = await applyOf(c);
    expect(apply.stderr).toBe('');
    expect(apply.code).toBe(0);
    const command = await commandOf(c);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    expect(command.files).not.toEqual(modelFiles(c.model));
    expect(command.files).toEqual(apply.files);
    await expectValidLikeC4(command.files);
  });
});

// ---------------------------------------------------------------------------
// Row 9: text output
// ---------------------------------------------------------------------------

describe("row 9: a generated command prints apply's lines without the summary, or '<operation>: done'", SLOW, () => {
  it.each(CASES.map((c) => [label(c), c] as const))('%s', async (_, c) => {
    expect(applyLines((await applyOf(c)).stdout)).toEqual(c.output ?? []);
    const command = await commandOf(c);
    expect(command.code).toBe(0);
    expect(command.stderr).toBe('');
    expect(command.stdout.split('\n')).toEqual([...(c.output ?? [`${c.mutation.op}: done`]), '']);
  });

  it.each([
    {
      model: 'modelA' as const,
      args: ['remove-view', '--id', 'base', '--cascade'],
      mutation: { op: 'removeView', id: 'base', cascade: true },
    },
    {
      model: 'modelB' as const,
      args: ['remove-view-step', '--id', 'flow', '--address', '{"path":[0,0]}'],
      mutation: { op: 'removeViewStep', id: 'flow', address: { path: [0, 0] } },
    },
  ])("$args.0 on the row-1 model prints apply's cascade / emptied-par lines", async ({ model, args, mutation }) => {
    const apply = await runApply(model, mutation);
    expect(apply.stderr).toBe('');
    expect(apply.code).toBe(0);
    const lines = applyLines(apply.stdout);
    expect(lines.length).toBeGreaterThan(0);
    const command = await runCommand(model, args);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    expect(command.stdout.split('\n')).toEqual([...lines, '']);
    expect(command.files).toEqual(apply.files);
  });
});

// ---------------------------------------------------------------------------
// Row 10: the --json envelope
// ---------------------------------------------------------------------------

describe('row 10: with --json a generated command prints only {"operation", "result"}', SLOW, () => {
  it.each(CASES.map((c) => [label(c), c] as const))('%s', async (_, c) => {
    const command = await runCommand(c.model, [...c.args, '--json']);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    const value = c.call(LikeC4Mutator.fromFiles(modelFiles(c.model)));
    const result = value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown);
    expect(JSON.parse(command.stdout)).toStrictEqual({ operation: c.mutation.op, result });
    expect(command.files).toEqual((await applyOf(c)).files);
  });
});

// ---------------------------------------------------------------------------
// Row 11: rejections
// ---------------------------------------------------------------------------

interface Rejection {
  model: Model;
  args: string[];
  mutation: Record<string, unknown>;
  /** The rejected field of `apply`'s path (null: the whole operation) and its flag */
  field: string | null;
  flag: string | null;
}

const ZONE_TAGS = (op: string, extra: Record<string, unknown>, args: string[]): Rejection => ({
  model: 'zones', args, mutation: { op, ...extra }, field: 'tags', flag: 'tags',
});

const REJECTIONS: Rejection[] = [
  { model: 'zones', args: ['rename-element', '--fqn', 'shop.db', '--new-name', '1bad'], mutation: { op: 'renameElement', fqn: 'shop.db', newName: '1bad' }, field: 'newName', flag: 'new-name' },
  { model: 'spec', args: ['move-element', '--fqn', 'other', '--parent', 'nope'], mutation: { op: 'moveElement', fqn: 'other', parent: 'nope' }, field: 'parent', flag: 'parent' },
  { model: 'zones', args: ['add-kind', '--type', 'element', '--name', 'bad name'], mutation: { op: 'addKind', type: 'element', name: 'bad name' }, field: 'name', flag: 'name' },
  ZONE_TAGS('updateKind', { type: 'element', name: 'service', tags: ['nope'] }, ['update-kind', '--type', 'element', '--name', 'service', '--tags', 'nope']),
  { model: 'zones', args: ['add-tag', '--name', '9x'], mutation: { op: 'addTag', name: '9x' }, field: 'name', flag: 'name' },
  { model: 'zones', args: ['rename-kind', '--type', 'element', '--name', 'worker', '--new-name', 'a.b'], mutation: { op: 'renameKind', type: 'element', name: 'worker', newName: 'a.b' }, field: 'newName', flag: 'new-name' },
  { model: 'zones', args: ['remove-kind', '--type', 'element', '--name', 'nope'], mutation: { op: 'removeKind', type: 'element', name: 'nope' }, field: 'name', flag: 'name' },
  { model: 'zones', args: ['rename-tag', '--name', 'nope', '--new-name', 'other'], mutation: { op: 'renameTag', name: 'nope', newName: 'other' }, field: 'name', flag: 'name' },
  { model: 'zones', args: ['remove-tag', '--name', 'nope'], mutation: { op: 'removeTag', name: 'nope' }, field: 'name', flag: 'name' },
  { model: 'zones', args: ['add-element-extend', '--fqn', 'nope', '--file', 'model.c4', '--tags', 'internal'], mutation: { op: 'addElementExtend', fqn: 'nope', file: 'model.c4', tags: ['internal'] }, field: 'fqn', flag: 'fqn' },
  ZONE_TAGS('addRelationshipExtend', { source: 'shop.web', target: 'shop.api', file: 'model.c4', tags: ['nope'] }, [
    'add-relationship-extend', '--source', 'shop.web', '--target', 'shop.api', '--file', 'model.c4', '--tags', 'nope',
  ]),
  {
    model: 'zones',
    args: ['update-relationship', '--source', 'shop.web', '--target', 'shop.api', '--style', '{"color":"nocolor"}'],
    mutation: { op: 'updateRelationship', source: 'shop.web', target: 'shop.api', style: { color: 'nocolor' } },
    field: 'style',
    flag: 'style',
  },
  {
    model: 'zones',
    args: ['update-relationship', '--source', 'shop.web', '--target', 'shop.api'],
    mutation: { op: 'updateRelationship', source: 'shop.web', target: 'shop.api' },
    field: null,
    flag: null,
  },
  { model: 'flows', args: ['add-view', '--id', 'bad id', '--type', 'element'], mutation: { op: 'addView', id: 'bad id', type: 'element' }, field: 'id', flag: 'id' },
  { model: 'zones', args: ['add-deployment-node', '--name', 'vm4', '--kind', 'nokind'], mutation: { op: 'addDeploymentNode', name: 'vm4', kind: 'nokind' }, field: 'kind', flag: 'kind' },
  {
    model: 'zones',
    args: ['update-deployment-node', '--id', 'prod.eu.vm2', '--style', '{"color":"nocolor"}'],
    mutation: { op: 'updateDeploymentNode', id: 'prod.eu.vm2', style: { color: 'nocolor' } },
    field: 'style',
    flag: 'style',
  },
  { model: 'zones', args: ['remove-deployment-node', '--id', 'nope'], mutation: { op: 'removeDeploymentNode', id: 'nope' }, field: 'id', flag: 'id' },
  { model: 'zones', args: ['add-deployment-instance', '--node', 'prod.eu.vm2', '--element', 'nope'], mutation: { op: 'addDeploymentInstance', node: 'prod.eu.vm2', element: 'nope' }, field: 'element', flag: 'element' },
  ZONE_TAGS('updateDeploymentInstance', { id: 'prod.eu.vm1.api', tags: ['nope'] }, ['update-deployment-instance', '--id', 'prod.eu.vm1.api', '--tags', 'nope']),
  { model: 'zones', args: ['remove-deployment-instance', '--id', 'nope'], mutation: { op: 'removeDeploymentInstance', id: 'nope' }, field: 'id', flag: 'id' },
  {
    model: 'zones',
    args: ['add-deployment-relationship', '--source', '{"id":"nope"}', '--target', '{"id":"prod.eu.vm1.db"}'],
    mutation: { op: 'addDeploymentRelationship', source: { id: 'nope' }, target: DB },
    field: 'source',
    flag: 'source',
  },
  ZONE_TAGS('updateDeploymentRelationship', { source: API, target: DB, tags: ['nope'] }, [
    'update-deployment-relationship', '--source', '{"id":"prod.eu.vm1.api"}', '--target', '{"id":"prod.eu.vm1.db"}', '--tags', 'nope',
  ]),
  {
    model: 'zones',
    args: ['remove-deployment-relationship', '--source', '{"id":"prod.eu.vm2"}', '--target', '{"id":"prod.eu.vm1"}', '--match-kind', 'nokind'],
    mutation: { op: 'removeDeploymentRelationship', source: VM2, target: VM1, matchKind: 'nokind' },
    field: 'source',
    flag: 'source',
  },
  {
    model: 'zones',
    args: ['add-deployment-extend', '--node', 'prod.eu.vm2', '--file', 'nofile.c4', '--tags', 'internal'],
    mutation: { op: 'addDeploymentExtend', node: 'prod.eu.vm2', file: 'nofile.c4', tags: ['internal'] },
    field: 'file',
    flag: 'file',
  },
  {
    model: 'zones',
    args: ['remove-deployment-extend', '--node', 'prod.eu', '--file', 'ext/eu.c4', '--occurrence', '0'],
    mutation: { op: 'removeDeploymentExtend', node: 'prod.eu', file: 'ext/eu.c4', occurrence: 0 },
    field: 'occurrence',
    flag: 'occurrence',
  },
  { model: 'flows', args: ['update-view', '--id', 'nope', '--title', 'x'], mutation: { op: 'updateView', id: 'nope', title: 'x' }, field: 'id', flag: 'id' },
  {
    model: 'flows',
    args: ['add-view-rule', '--id', 'landing', '--rule', '{"kind":"bogus","expression":"x"}'],
    mutation: { op: 'addViewRule', id: 'landing', rule: { kind: 'bogus', expression: 'x' } },
    field: 'rule',
    flag: 'rule',
  },
  {
    model: 'flows',
    args: ['replace-view-rule', '--id', 'platform', '--address', '{"index":9}', '--rule', '{"kind":"exclude","expression":"mailer"}'],
    mutation: { op: 'replaceViewRule', id: 'platform', address: { index: 9 }, rule: { kind: 'exclude', expression: 'mailer' } },
    field: 'address',
    flag: 'address',
  },
  {
    model: 'flows',
    args: ['remove-view-rule', '--id', 'platform', '--address', '{"index":-1}'],
    mutation: { op: 'removeViewRule', id: 'platform', address: { index: -1 } },
    field: 'address',
    flag: 'address',
  },
  { model: 'flows', args: ['remove-view', '--id', 'nope'], mutation: { op: 'removeView', id: 'nope' }, field: 'id', flag: 'id' },
  {
    model: 'flows',
    args: ['add-view-step', '--id', 'delivery', '--step', '{"source":"nope","target":"mailer"}'],
    mutation: { op: 'addViewStep', id: 'delivery', step: { source: 'nope', target: 'mailer' } },
    field: 'step',
    flag: 'step',
  },
  {
    model: 'flows',
    args: ['update-view-step', '--id', 'delivery', '--address', '{"path":[9]}', '--patch', '{"title":"x"}'],
    mutation: { op: 'updateViewStep', id: 'delivery', address: { path: [9] }, patch: { title: 'x' } },
    field: 'address',
    flag: 'address',
  },
  {
    model: 'flows',
    args: ['move-view-step', '--id', 'delivery', '--from', '{"path":[0]}', '--to', '[9]'],
    mutation: { op: 'moveViewStep', id: 'delivery', from: { path: [0] }, to: [9] },
    field: 'to',
    flag: 'to',
  },
  {
    model: 'flows',
    args: ['remove-view-step', '--id', 'delivery', '--address', '{"path":[9]}'],
    mutation: { op: 'removeViewStep', id: 'delivery', address: { path: [9] } },
    field: 'address',
    flag: 'address',
  },
  {
    model: 'flows',
    args: ['add-view-parallel', '--id', 'delivery', '--statements', '[[9]]'],
    mutation: { op: 'addViewParallel', id: 'delivery', statements: [[9]] },
    field: 'statements',
    flag: 'statements',
  },
];

describe("row 11: a rejected generated command names the flag with apply's detail and writes nothing", SLOW, () => {
  it('every generated command has a rejection case', () => {
    expect(new Set(REJECTIONS.map((r) => r.args[0]))).toEqual(new Set(CASES.map((c) => c.args[0])));
  });

  it.each(REJECTIONS.flatMap((r) => [false, true].map((json) => [`${r.args.join(' ')}${json ? ' --json' : ''}`, r, json] as const)))(
    '%s',
    async (_, r, json) => {
      const apply = await runApply(r.model, r.mutation);
      expect(apply.code).toBe(1);
      const command = await runCommand(r.model, json ? [...r.args, '--json'] : r.args);
      expect(command.code).toBe(1);
      expect(command.stdout).toBe('');
      expect(command.files).toEqual(modelFiles(r.model));
      expect(command.stderr).toBe(translated(apply.stderr, r.field, r.flag));
    },
  );
});

// ---------------------------------------------------------------------------
// Row 12: --output
// ---------------------------------------------------------------------------

describe('row 12: a generated command with --output writes every loaded file there and leaves --dir unchanged', SLOW, () => {
  it('update-view --output on a directory holding a .likec4 file', async () => {
    /** The flows model with `platform.c4` as `platform.likec4`. */
    const mixed = (): string => {
      const dir = workspace('flows');
      renameSync(join(dir, 'platform.c4'), join(dir, 'platform.likec4'));
      return dir;
    };
    const dir = mixed();
    const before = readTree(dir);
    expect(Object.keys(before)).toContain('platform.likec4');
    const out = mkdtempSync(join(tmpdir(), 'likec4-mutator-operation-out-'));
    const command = await run(['update-view', '--dir', dir, '--id', 'landing', '--title', 'T', '--output', out]);
    expect(command.stderr).toBe('');
    expect(command.code).toBe(0);
    expect(readTree(dir)).toEqual(before);

    const applyDir = mixed();
    const applyOut = mkdtempSync(join(tmpdir(), 'likec4-mutator-operation-out-'));
    const mutations = join(mkdtempSync(join(tmpdir(), 'likec4-mutator-operation-mutations-')), 'mutations.json');
    writeFileSync(mutations, JSON.stringify({ mutations: [{ op: 'updateView', id: 'landing', title: 'T' }] }), 'utf-8');
    const apply = await run(['apply', '--dir', applyDir, '--mutations', mutations, '--output', applyOut]);
    expect(apply.code, apply.stderr).toBe(0);

    const written = readTree(out);
    expect(Object.keys(written).sort()).toEqual(Object.keys(before).sort());
    expect(written).toEqual(readTree(applyOut));
    expect(written).not.toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Row 13: encoding rejections
// ---------------------------------------------------------------------------

describe('row 13: a value that does not fit its encoding is rejected naming the flag', SLOW, () => {
  it.each(
    (
      [
        ['flows', ['add-view', '--id', 'v1', '--type', 'element', '--includes', '{'], 'includes'],
        ['flows', ['update-view', '--id', 'landing', '--links', '{'], 'links'],
        ['flows', ['add-view', '--id', 'v1', '--type', 'element', '--includes', '{"a":1}'], 'includes'],
        ['minimal', ['add-view', '--id', 'v1', '--type', 'element', '--includes', '*, app.api -> app.db'], 'includes'],
        ['flows', ['update-view', '--id', 'landing', '--title', 'x', '--unset-title'], 'title'],
        ['zones', ['update-relationship', '--source', 'shop.web', '--target', 'shop.api', '--technology', 'T', '--match-bidirectional', 'yes'], 'match-bidirectional'],
        ['zones', ['update-relationship', '--source', 'shop.web', '--target', 'shop.api', '--technology', 'T', '--match-bidirectional', 'TRUE'], 'match-bidirectional'],
        ['zones', ['remove-deployment-extend', '--node', 'prod.eu', '--file', 'ext/eu.c4', '--occurrence', 'abc'], 'occurrence'],
      ] as const
    ).flatMap(([model, args, flag]) => [false, true].map((json) => [`${args.join(' ')}${json ? ' --json' : ''}`, model, args, flag, json] as const)),
  )('%s', async (_, model, args, flag, json) => {
    const command = await runCommand(model, json ? [...args, '--json'] : args);
    expect(command.code).toBe(1);
    expect(command.stdout).toBe('');
    expect(command.files).toEqual(modelFiles(model));
    expect(command.stderr).toMatch(new RegExp(`^Error: --${flag}[:.[]`));
  });
});

// ---------------------------------------------------------------------------
// Row 14: the named lossless cases
// ---------------------------------------------------------------------------

describe('row 14: the encoding keeps every value apply accepts', SLOW, () => {
  it('an includes item containing commas stays one item', async () => {
    await expectSameAsApply('minimal', ['add-view', '--id', 'v1', '--type', 'element', '--includes', '["*, app.api -> app.db"]'], {
      op: 'addView', id: 'v1', type: 'element', includes: ['*, app.api -> app.db'],
    });
  });

  it('update-view --unset-title removes the title', async () => {
    const { command } = await expectSameAsApply('flows', ['update-view', '--id', 'landing', '--unset-title'], { op: 'updateView', id: 'landing', title: null });
    expect(command.code).toBe(0);
  });

  it('move-element --unset-parent moves to the model level', async () => {
    const { command } = await expectSameAsApply('spec', ['move-element', '--fqn', 'app.api', '--unset-parent'], { op: 'moveElement', fqn: 'app.api', parent: null });
    expect(command.code).toBe(0);
  });

  it('--match-bidirectional false differs from the flag left out, as in apply', async () => {
    const args = ['update-relationship', '--source', 'a', '--target', 'b', '--technology', 'T'];
    const given = await expectSameAsApply('bidi', [...args, '--match-bidirectional', 'false'], {
      op: 'updateRelationship', source: 'a', target: 'b', technology: 'T', matchBidirectional: false,
    });
    const omitted = await expectSameAsApply('bidi', args, { op: 'updateRelationship', source: 'a', target: 'b', technology: 'T' }, { field: 'source', flag: 'source' });
    expect(given.apply.code).not.toBe(omitted.apply.code);
    expect(given.command.code).not.toBe(omitted.command.code);
  });

  it('--match-bidirectional true selects the bidirectional relationship, as in apply', async () => {
    const args = ['update-relationship', '--source', 'a', '--target', 'b', '--technology', 'T'];
    const mutation = { op: 'updateRelationship', source: 'a', target: 'b', technology: 'T' };
    const chosen = await expectSameAsApply('bidi', [...args, '--match-bidirectional', 'true'], { ...mutation, matchBidirectional: true });
    expect(chosen.command.code).toBe(0);
    const lines = applyLines(chosen.apply.stdout);
    expect(chosen.command.stdout).toBe(lines.length > 0 ? `${lines.join('\n')}\n` : 'updateRelationship: done\n');
    // The other value of the flag picks the other relationship: different files.
    const other = await runApply('bidi', { ...mutation, matchBidirectional: false });
    const trueFiles = (await runApply('bidi', { ...mutation, matchBidirectional: true })).files;
    expect(other.code).toBe(0);
    expect(trueFiles).not.toEqual(other.files);
  });

  it("add-view-step --path '[0]' puts the step before the first top-level statement", async () => {
    const step = { source: 'mailer', target: 'portal.worker', title: 'bounces' };
    const { command } = await expectSameAsApply('flows', ['add-view-step', '--id', 'delivery', '--step', JSON.stringify(step), '--path', '[0]'], {
      op: 'addViewStep', id: 'delivery', step, path: [0],
    });
    expect(command.code).toBe(0);
    // `[i]` is the boundary before top-level statement i (D24); without a path the step would go last.
    const flows = modelFiles('flows')['flows.c4']!;
    const before = "    title 'Delivery'\n    portal.jobs -> portal.worker\n";
    expect(flows.split(before)).toHaveLength(2);
    expect(command.files['flows.c4']).toBe(flows.replace(before, "    title 'Delivery'\n    mailer -> portal.worker 'bounces'\n    portal.jobs -> portal.worker\n"));
  });

  it.each([
    ['null', 'null'],
    ['', ''],
  ])('--title %j is the text %j', async (text, title) => {
    await expectSameAsApply('flows', ['update-view', '--id', 'landing', '--title', text], { op: 'updateView', id: 'landing', title }, { field: 'title', flag: 'title' });
  });
});

// ---------------------------------------------------------------------------
// Row 15: tags (D156)
// ---------------------------------------------------------------------------

describe('row 15: --tags on a generated command (D156)', SLOW, () => {
  it.each([
    ["''", ['--title', 'T', '--tags', ''], { title: 'T' }],
    ["'[]'", ['--tags', '[]'], { tags: [] }],
    ['a JSON array', ['--tags', '["public","internal"]'], { tags: ['public', 'internal'] }],
    ['a comma list', ['--tags', ' public, internal,,edge '], { tags: ['public', 'internal', 'edge'] }],
  ] as const)('%s', async (_, flags, fields) => {
    const { command } = await expectSameAsApply('zones', ['update-view', '--id', 'production', ...flags], { op: 'updateView', id: 'production', ...fields });
    expect(command.code).toBe(0);
  });

  it("'[1]' is the comma list [\"[1]\"] and is rejected at --tags[0]", async () => {
    const { command } = await expectSameAsApply('zones', ['update-view', '--id', 'production', '--tags', '[1]'], { op: 'updateView', id: 'production', tags: ['[1]'] }, {
      field: 'tags',
      flag: 'tags',
    });
    expect(command.code).toBe(1);
    expect(command.stderr.startsWith('Error: --tags[0]: ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 16: a flag given twice
// ---------------------------------------------------------------------------

describe('row 16: a flag given twice takes its second value', SLOW, () => {
  it.each([
    ['string', 'flows', ['update-view', '--id', 'landing', '--title', 'a', '--title', 'b'], { op: 'updateView', id: 'landing', title: 'b' }],
    ['tags', 'zones', ['update-view', '--id', 'production', '--tags', 'public', '--tags', 'internal'], { op: 'updateView', id: 'production', tags: ['internal'] }],
    [
      'value boolean',
      'bidi',
      ['update-relationship', '--source', 'a', '--target', 'b', '--technology', 'T', '--match-bidirectional', 'true', '--match-bidirectional', 'false'],
      { op: 'updateRelationship', source: 'a', target: 'b', technology: 'T', matchBidirectional: false },
    ],
    [
      'number',
      'twice',
      ['remove-deployment-extend', '--node', 'prod', '--file', 'ext.c4', '--occurrence', '1', '--occurrence', '2'],
      { op: 'removeDeploymentExtend', node: 'prod', file: 'ext.c4', occurrence: 2 },
    ],
    [
      'JSON',
      'zones',
      ['update-relationship', '--source', 'shop.web', '--target', 'shop.api', '--style', '{"color":"red"}', '--style', '{"color":"green"}'],
      { op: 'updateRelationship', source: 'shop.web', target: 'shop.api', style: { color: 'green' } },
    ],
  ] as const)('%s', async (_, model, args, mutation) => {
    const { command } = await expectSameAsApply(model, args, mutation);
    expect(command.code).toBe(0);
  });
});
