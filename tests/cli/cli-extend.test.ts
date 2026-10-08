import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** A project whose element `app` is extended from two other files. */
function writeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-extend-'));
  mkdirSync(join(dir, 'ext'));
  writeFileSync(
    join(dir, 'base.c4'),
    `specification {\n  element system\n}\nmodel {\n  app = system 'App' {\n    #a\n  }\n}\n`,
  );
  writeFileSync(join(dir, 'ext', 'more.c4'), `model {\n  extend app {\n    #b\n    metadata { k 'v' }\n  }\n}\n`);
  writeFileSync(join(dir, 'z.c4'), `model {\n\n  extend app {\n    #c\n  }\n}\n`);
  return dir;
}

describe('CLI get-element with extend blocks', () => {
  it('--json reports effective values and provenance', () => {
    const el = JSON.parse(runCli(['get-element', '--dir', writeProject(), '--fqn', 'app', '--json']));
    expect(el.tags).toEqual(['a', 'b', 'c']);
    expect(el.metadata).toEqual({ k: 'v' });
    expect(el.declared).toEqual({ tags: ['a'] });
    expect(el.extendedBy.map((e: { file: string }) => e.file)).toEqual([join('ext', 'more.c4'), 'z.c4']);
  });

  it('prints where the element is extended', () => {
    const out = runCli(['get-element', '--dir', writeProject(), '--fqn', 'app']);
    expect(out).toContain('Tags:        a, b, c\n');
    expect(out).toContain(`Extended by: ${join('ext', 'more.c4')}:2, z.c4:3\n`);
  });
});

describe('CLI update-element with extend blocks', () => {
  it('--tags replaces the effective tags and writes the extend files to --output', () => {
    const dir = writeProject();
    const out = mkdtempSync(join(tmpdir(), 'likec4-mutator-extend-out-'));
    runCli(['update-element', '--dir', dir, '--fqn', 'app', '--tags', 'a', '--output', out]);
    expect(readFileSync(join(out, 'ext', 'more.c4'), 'utf-8')).toBe(`model {\n  extend app {\n    metadata { k 'v' }\n  }\n}\n`);
    expect(readFileSync(join(out, 'z.c4'), 'utf-8')).toBe(`model {\n\n  extend app {\n  }\n}\n`);
    const el = JSON.parse(runCli(['get-element', '--dir', out, '--fqn', 'app', '--json']));
    expect(el.tags).toEqual(['a']);
  });
});
