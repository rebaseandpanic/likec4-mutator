import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { expectAcceptedWrite, expectRelationshipsAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_DIR = resolve(import.meta.dirname, '..', 'fixtures', 'minimal');

function runCli(args: string): string {
  return execSync(`npx tsx src/cli.ts ${args}`, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 15000,
  });
}

const fixtureDir = FIXTURE_DIR;

describe('CLI apply extended', () => {
  it('should apply updateElement mutation via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'updateElement',
            fqn: 'app.api',
            description: 'Updated REST API description',
            technology: 'Go / Fiber',
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Updated REST API description');
    expect(content).toContain('Go / Fiber');
  });

  it('should apply removeElement mutation via apply command', () => {
    // Copy fixture to temp dir so we have a fresh copy with the element present
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync(
      resolve(FIXTURE_DIR, 'model.c4'),
      'utf-8',
    );
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'removeElement',
            fqn: 'app.db',
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${tmpDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    // The db element block should be gone
    expect(content).not.toContain("db = database 'PostgreSQL'");
  });

  it('should apply removeRelationship mutation via apply command', () => {
    // Copy fixture to temp dir so we have a fresh copy with the relationship present
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync(
      resolve(FIXTURE_DIR, 'model.c4'),
      'utf-8',
    );
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'removeRelationship',
            source: 'api',
            target: 'db',
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${tmpDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    // The "api -> db" relationship line should be gone
    expect(content).not.toContain('api -> db');
  });

  it('should apply a mixed batch of addElement + updateElement + removeRelationship', () => {
    // Copy fixture to temp dir so we can safely remove the existing relationship
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync(
      resolve(FIXTURE_DIR, 'model.c4'),
      'utf-8',
    );
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'addElement',
            parent: 'app',
            kind: 'service',
            id: 'cache',
            title: 'Redis Cache',
            technology: 'Redis 7',
          },
          {
            op: 'updateElement',
            fqn: 'app.api',
            description: 'Updated Backend API',
          },
          {
            op: 'removeRelationship',
            source: 'api',
            target: 'db',
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${tmpDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 3 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');

    // addElement: new cache element present
    expect(content).toContain('cache');
    expect(content).toContain('Redis Cache');
    expect(content).toContain('Redis 7');

    // updateElement: api description updated
    expect(content).toContain('Updated Backend API');

    // removeRelationship: api -> db link gone
    expect(content).not.toContain('api -> db');
  });

  it('should apply addElement with tags, links, metadata via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'addElement',
            parent: 'app',
            kind: 'service',
            id: 'enriched',
            title: 'Enriched Service',
            tags: ['internal', 'backend'],
            links: [{ url: 'https://enriched.example.com', label: 'Docs' }],
            metadata: { owner: 'team-alpha', env: 'staging' },
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#internal');
    expect(content).toContain('#backend');
    expect(content).toContain("link https://enriched.example.com 'Docs'");
    expect(content).toContain('metadata {');
    expect(content).toContain("owner 'team-alpha'");
    expect(content).toContain("env 'staging'");
  });

  it('should apply addRelationship with description via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'addRelationship',
            source: 'app.db',
            target: 'app.api',
            label: 'delegates to',
            description: 'Routes incoming requests to the API',
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain("description 'Routes incoming requests to the API'");
  });

  it('should apply updateElement with tags and metadata via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'updateElement',
            fqn: 'app.db',
            tags: ['critical'],
            metadata: { engine: 'PostgreSQL', version: '16' },
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#critical');
    expect(content).toContain('metadata {');
    expect(content).toContain("engine 'PostgreSQL'");
  });

  it('should apply addElement with style block via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'addElement',
            parent: 'app',
            kind: 'service',
            id: 'styledSvc',
            title: 'Styled Service',
            style: { shape: 'browser', color: 'blue', icon: 'tech:react' },
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain('styledSvc');
    expect(content).toContain('style {');
    expect(content).toContain('shape browser');
    expect(content).toContain('color blue');
    expect(content).toContain('icon tech:react');
  });

  it('should apply addRelationship with technology, tags, and style via apply command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({
        mutations: [
          {
            op: 'addRelationship',
            source: 'app.api',
            target: 'app.db',
            label: 'stores data',
            technology: 'JDBC',
            tags: ['internal', 'async'],
            style: { line: 'dashed', color: 'blue' },
          },
        ],
      }),
    );

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    const stdout = runCli(
      `apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`,
    );

    expect(stdout).toContain('Applied 1 mutation(s) successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain("technology 'JDBC'");
    expect(content).toContain('#internal');
    expect(content).toContain('#async');
    expect(content).toContain('style {');
    expect(content).toContain('line dashed');
    expect(content).toContain('color blue');
  });
});

// ----- addRelationship with the fields of lc4m-15.30 US-5 and US-8 (row 151) ----------

const RELATIONSHIP_FILES: Record<string, string> = {
  'spec.c4': "specification {\n  element sys\n  relationship calls\n  tag t\n}\n",
  'model.c4': "model {\n  app = sys 'App' {\n    api = sys 'API'\n    db = sys 'DB'\n  }\n  ext = sys 'Ext'\n}\n",
  'ext.c4': "model {\n  extend app.api -[calls]-> ext 'reads' {\n    #t\n  }\n}\n",
};

/** Run `apply --in-place` on a copy of `RELATIONSHIP_FILES`; exit status, output and the files after. */
function runApplyInPlace(mutations: unknown[]): { status: number | null; stderr: string; files: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-relationship-'));
  for (const [file, text] of Object.entries(RELATIONSHIP_FILES)) writeFileSync(join(dir, file), text, 'utf-8');
  const mutationsPath = join(dir, 'mutations.json');
  writeFileSync(mutationsPath, JSON.stringify({ mutations }), 'utf-8');
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  const files = Object.fromEntries(Object.keys(RELATIONSHIP_FILES).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
  return { status: result.status, stderr: result.stderr, files };
}

describe('apply addRelationship with kind, direction, placement, file and shared (row 151)', { timeout: 120_000 }, () => {
  it('writes every new field', async () => {
    const result = runApplyInPlace([
      { op: 'addRelationship', source: 'app.api', target: 'ext', label: 'syncs', kind: 'calls', bidirectional: true },
      { op: 'addRelationship', source: 'app.api', target: 'app.db', label: 'writes', placement: 'nested', kind: 'calls', kindForm: 'dot' },
      { op: 'addRelationship', source: 'app', target: 'ext', label: 'uses', file: 'model.c4' },
      { op: 'addRelationship', source: 'app.api', target: 'ext', label: 'reads', kind: 'calls', shared: true },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.files).toEqual({
      'spec.c4': RELATIONSHIP_FILES['spec.c4'],
      // `file` chose `model.c4`; the others go to the default file `ext.c4`, the first in LikeC4's document order with a model block (D62).
      'model.c4':
        "model {\n  app = sys 'App' {\n    api = sys 'API' {\n      .calls db 'writes'\n    }\n    db = sys 'DB'\n  }\n  ext = sys 'Ext'\n  app -> ext 'uses'\n}\n",
      'ext.c4':
        "model {\n  extend app.api -[calls]-> ext 'reads' {\n    #t\n  }\n  app.api -[calls]<-> ext 'syncs'\n  app.api -[calls]-> ext 'reads'\n}\n",
    });
    await expectRelationshipsAgreeWithLikeC4(result.files, LikeC4Mutator.fromFiles(result.files).getRelationships());
    await expectAcceptedWrite(RELATIONSHIP_FILES, result.files);
  });

  it.each([
    ['an undeclared kind', { kind: 'nope' }, 'mutations[0].kind:'],
    ['an unknown kindForm', { kind: 'calls', kindForm: 'sideways' }, 'mutations[0].kindForm'],
    ['the dot form with bidirectional', { kind: 'calls', kindForm: 'dot', bidirectional: true }, 'mutations[0].kindForm:'],
    ['a non-boolean bidirectional', { bidirectional: 'yes' }, 'mutations[0].bidirectional'],
    ['an unknown placement', { placement: 'inside' }, 'mutations[0].placement'],
    ['file with nested placement', { placement: 'nested', file: 'model.c4' }, 'mutations[0].file:'],
    ['a file that is not loaded', { file: 'nope.c4' }, 'mutations[0].file:'],
    ['the identity of an extend block without shared', { label: 'reads', kind: 'calls' }, 'mutations[0].shared:'],
    ['a non-boolean shared', { shared: 1 }, 'mutations[0].shared'],
  ])('rejects %s and writes nothing', (_label, fields, path) => {
    const result = runApplyInPlace([{ op: 'addRelationship', source: 'app.api', target: 'ext', ...fields }]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.files).toEqual(RELATIONSHIP_FILES);
  });
});
