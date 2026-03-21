import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
            source: 'app',
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
            source: 'app',
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
