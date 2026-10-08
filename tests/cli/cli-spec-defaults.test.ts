import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

function runCli(args: string[]): string {
  return execFileSync('npx', ['tsx', 'src/cli.ts', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 15000,
  });
}

/** A project whose element `app` takes tags, title and technology from its kind. */
function writeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-spec-'));
  writeFileSync(
    join(dir, 'spec.c4'),
    `specification {\n  element system {\n    #base\n    title 'System'\n    technology 'Go'\n  }\n  tag base\n  tag own\n}\n`,
  );
  writeFileSync(join(dir, 'model.c4'), `model {\n  app = system {\n    #own\n  }\n}\n`);
  return dir;
}

describe('CLI get-element with kind defaults', () => {
  it('--json reports effective values and fromSpecification', () => {
    const el = JSON.parse(runCli(['get-element', '--dir', writeProject(), '--fqn', 'app', '--json']));
    expect(el.title).toBe('System');
    expect(el.technology).toBe('Go');
    expect(el.tags).toEqual(['base', 'own']);
    expect(el.fromSpecification).toMatchObject({ kind: 'system', file: 'spec.c4', tags: ['base'], title: 'System' });
  });

  it('prints the effective values and where the kind is declared', () => {
    const out = runCli(['get-element', '--dir', writeProject(), '--fqn', 'app']);
    expect(out).toContain('Title:       System\n');
    expect(out).toContain('Technology:  Go\n');
    expect(out).toContain('Tags:        base, own\n');
    expect(out).toContain('Kind spec:   spec.c4:2\n');
  });
});
