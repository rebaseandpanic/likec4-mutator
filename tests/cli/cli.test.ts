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

describe('CLI', () => {
  const fixtureDir = 'tests/fixtures/minimal';

  it('should validate valid files', () => {
    const output = runCli(`validate --dir ${fixtureDir}`);
    expect(output).toContain('valid');
  });

  it('should list elements', () => {
    const output = runCli(`list-elements --dir ${fixtureDir} --json`);
    const elements = JSON.parse(output);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should get element by FQN', () => {
    const output = runCli(`get-element --dir ${fixtureDir} --fqn app --json`);
    const el = JSON.parse(output);
    expect(el.name).toBe('app');
  });

  it('should get element source', () => {
    const output = runCli(`get-element --dir ${fixtureDir} --fqn app.api --source`);
    expect(output).toContain('REST API');
  });

  it('should add element and write to output', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(`add-element --dir ${fixtureDir} --parent app --kind service --id newSvc --title 'New Service' --output ${tmpDir}`);
    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('newSvc');
    expect(content).toContain('New Service');
  });

  it('should apply batch mutations', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(mutationsPath, JSON.stringify({
      mutations: [
        { op: 'addElement', parent: 'app', kind: 'service', id: 'batchSvc', title: 'Batch Service' },
        { op: 'addRelationship', source: 'app.batchSvc', target: 'app.db', label: 'reads' },
      ],
    }));

    const outDir = join(tmpDir, 'output');
    mkdirSync(outDir);
    runCli(`apply --dir ${fixtureDir} --mutations ${mutationsPath} --output ${outDir}`);

    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).toContain('batchSvc');
    expect(content).toContain('Batch Service');
  });

  it('should list elements filtered by kind', () => {
    const output = runCli(`list-elements --dir ${fixtureDir} --kind service --json`);
    const elements = JSON.parse(output);
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.kind).toBe('service');
    }
  });

  it('should list elements filtered by parent', () => {
    const output = runCli(`list-elements --dir ${fixtureDir} --parent app --json`);
    const elements = JSON.parse(output);
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.parentFqn).toBe('app');
    }
  });

  it('should print human-readable element info', () => {
    const output = runCli(`get-element --dir ${fixtureDir} --fqn app.api`);
    expect(output).toContain('app.api');
    expect(output).toContain('service');
    expect(output).toContain('REST API');
  });

  it('should exit with error for missing element', () => {
    expect(() => runCli(`get-element --dir ${fixtureDir} --fqn does.not.exist --json`)).toThrow();
  });

  it('should add relationship and write to output', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(`add-relationship --dir ${fixtureDir} --source app.api --target app.db --label 'syncs' --output ${tmpDir}`);
    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('syncs');
  });

  it('should apply batch mutations in-place', () => {
    // Copy the fixture to a temp dir so we can mutate in-place safely
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync('/workspaces/likec4-mutator/tests/fixtures/minimal/model.c4', 'utf-8');
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const mutationsPath = join(tmpDir, 'mutations.json');
    writeFileSync(mutationsPath, JSON.stringify({
      mutations: [
        { op: 'addElement', parent: 'app', kind: 'service', id: 'inplaceSvc', title: 'In-Place Service' },
      ],
    }));

    runCli(`apply --dir ${tmpDir} --mutations ${mutationsPath} --in-place`);

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('inplaceSvc');
    expect(content).toContain('In-Place Service');
  });
});
