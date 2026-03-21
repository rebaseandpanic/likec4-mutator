import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function runCli(args: string): string {
  return execSync(`npx tsx src/cli.ts ${args}`, {
    cwd: '/workspaces/likec4-mutator',
    encoding: 'utf-8',
    timeout: 15000,
  });
}

const fixtureDir = 'tests/fixtures/minimal';

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
      '/workspaces/likec4-mutator/tests/fixtures/minimal/model.c4',
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
      '/workspaces/likec4-mutator/tests/fixtures/minimal/model.c4',
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
      '/workspaces/likec4-mutator/tests/fixtures/minimal/model.c4',
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
});
