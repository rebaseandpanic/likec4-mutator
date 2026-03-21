/**
 * Tests for the three new standalone CLI commands added in Task 1 and the
 * --summary / --tags flags added to add-element in Task 2.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// update-element standalone command
// ---------------------------------------------------------------------------

describe('CLI update-element', () => {
  it('should update element description via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const stdout = runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --description 'Updated via CLI' --output ${tmpDir}`,
    );

    expect(stdout).toContain('updated successfully');
    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Updated via CLI');
  });

  it('should update element title via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app --title 'Renamed App' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Renamed App');
  });

  it('should update element technology via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --technology Go --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Go');
  });

  it('should update element summary via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --summary 'Quick overview' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('Quick overview');
  });

  it('should add tags to element via standalone command', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `update-element --dir ${FIXTURE_DIR} --fqn app.api --tags deprecated,legacy --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#deprecated');
    expect(content).toContain('#legacy');
  });

  it('should exit with error when element FQN does not exist', () => {
    expect(() =>
      runCli(`update-element --dir ${FIXTURE_DIR} --fqn does.not.exist --title 'X'`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// remove-element standalone command
// ---------------------------------------------------------------------------

describe('CLI remove-element', () => {
  it('should remove an element via standalone command and verify it is absent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    // Copy fixture so we don't modify the original
    const originalContent = readFileSync(resolve(FIXTURE_DIR, 'model.c4'), 'utf-8');
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const outDir = join(tmpDir, 'out');
    const stdout = runCli(
      `remove-element --dir ${tmpDir} --fqn app.db --output ${outDir}`,
    );

    expect(stdout).toContain("Removed element 'app.db'");
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).not.toContain("db = database 'PostgreSQL'");
    // Other elements must remain
    expect(content).toContain('api = service');
  });

  it('should exit with error when element FQN does not exist', () => {
    expect(() =>
      runCli(`remove-element --dir ${FIXTURE_DIR} --fqn does.not.exist`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// remove-relationship standalone command
// ---------------------------------------------------------------------------

describe('CLI remove-relationship', () => {
  it('should remove a relationship via standalone command and verify it is absent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    const originalContent = readFileSync(resolve(FIXTURE_DIR, 'model.c4'), 'utf-8');
    writeFileSync(join(tmpDir, 'model.c4'), originalContent, 'utf-8');

    const outDir = join(tmpDir, 'out');
    const stdout = runCli(
      `remove-relationship --dir ${tmpDir} --source api --target db --output ${outDir}`,
    );

    expect(stdout).toContain('removed successfully');
    const content = readFileSync(join(outDir, 'model.c4'), 'utf-8');
    expect(content).not.toContain('api -> db');
  });

  it('should exit with error when relationship does not exist', () => {
    expect(() =>
      runCli(`remove-relationship --dir ${FIXTURE_DIR} --source ghost --target phantom`),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// add-element with --summary and --tags flags (Task 2)
// ---------------------------------------------------------------------------

describe('CLI add-element with --summary and --tags', () => {
  it('should pass --summary flag through to the generated DSL', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id summarySvc --title 'Summary Service' --summary 'Quick overview text' --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain("summary 'Quick overview text'");
  });

  it('should pass --tags flag (comma-separated) through to the generated DSL', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id taggedSvc --title 'Tagged Service' --tags internal,backend --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#internal');
    expect(content).toContain('#backend');
  });

  it('should pass both --summary and --tags together', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id fullSvc --title 'Full Service' --summary 'A summary' --tags critical,monitored --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain("summary 'A summary'");
    expect(content).toContain('#critical');
    expect(content).toContain('#monitored');
  });

  it('should handle a single tag without a comma', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'likec4-mutator-test-'));
    runCli(
      `add-element --dir ${FIXTURE_DIR} --parent app --kind service --id singleTagSvc --title 'Single Tag' --tags internal --output ${tmpDir}`,
    );

    const content = readFileSync(join(tmpDir, 'model.c4'), 'utf-8');
    expect(content).toContain('#internal');
  });
});
