/**
 * `addElement` must not change what references already in the workspace link
 * to (lc4m-15.27 review).  A new name can take a unique descendant's name out
 * of LikeC4's scope — `api` linking to `app.api` stops resolving once
 * `other.api` exists — or shadow it — `app.api` linking to `app.inner.api`
 * links to a new direct child `app.api` instead.  Such a call is rejected with
 * an `InvalidWriteError` on `name` and leaves every file byte-identical.
 *
 * The rejections are checked against LikeC4 itself: the text the call would
 * have written, spelled out by hand, makes LikeC4 report an error or link the
 * reference elsewhere, while the input is valid.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { buildLikeC4Model, expectValidLikeC4, validateLikeC4 } from '../helpers/likec4-model.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

const SPEC = 'specification {\n  element service\n}\n';

/** Run `write`, expect an InvalidWriteError on `name`, and no file changed. */
function expectRejected(m: LikeC4Mutator, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe('name');
  expect(m.serialize()).toEqual(before);
  return error as InvalidWriteError;
}

// The fixture of the review: bare `api` links to `app.api`, the only element
// named `api`.
const AMBIGUOUS_INPUT = `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
  api -> other
}
`;

// What `addElement('other', { name: 'api', kind: 'service' })` would write.
const AMBIGUOUS_WRITTEN = `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
    api = service
  }
  api -> other
}
`;

describe('addElement rejects a name that changes existing references', () => {
  it('LikeC4 reports an unresolved reference for the text the review repro would write', async () => {
    await expectValidLikeC4({ 'model.c4': AMBIGUOUS_INPUT });
    const errors = await validateLikeC4({ 'model.c4': AMBIGUOUS_WRITTEN });
    expect(errors.some((e) => e.includes('Could not resolve reference'))).toBe(true);
  });

  it('rejects the review repro: a sibling name makes a bare relationship source ambiguous', () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': AMBIGUOUS_INPUT });
    const error = expectRejected(m, () => m.addElement('other', { name: 'api', kind: 'service' }));
    expect(error.detail).toContain("relationship source 'api'");
    expect(error.detail).toContain("'app.api'");
    expect(m.getElement('other.api')).toBeNull();
  });

  it('LikeC4 links a qualified reference to a new direct child that shadows a unique descendant', async () => {
    const input = `${SPEC}model {
  app = service {
    inner = service {
      api = service
    }
  }
  other = service
  other -> app.api
}
`;
    const model = await buildLikeC4Model({ 'model.c4': input });
    expect(model.errors).toEqual([]);
    expect(model.relations.map((r) => r.target.model)).toEqual(['app.inner.api']);
    const written = input.replace('    inner = service {', '    api = service\n    inner = service {');
    const after = await buildLikeC4Model({ 'model.c4': written });
    expect(after.errors).toEqual([]);
    expect(after.relations.map((r) => r.target.model)).toEqual(['app.api']);

    const m = LikeC4Mutator.fromFiles({ 'model.c4': input });
    const error = expectRejected(m, () => m.addElement('app', { name: 'api', kind: 'service' }));
    expect(error.detail).toContain("relationship target 'app.api'");
    expect(error.detail).toContain("link to 'app.api' instead");
  });

  it.each([
    {
      // `app.api` links to the unique descendant `app.inner.api`; a second
      // `api` below `app` (`app.more.api`) makes it ambiguous.
      name: 'a relationship in another file',
      files: {
        'a.c4': `${SPEC}model {\n  app = service {\n    inner = service {\n      api = service\n    }\n    more = service {\n    }\n  }\n  other = service\n}\n`,
        'b.c4': 'model {\n  app.api -> other\n}\n',
      },
      parent: 'app.more',
      reference: "relationship source 'app.api'",
    },
    {
      name: 'a relationship in an element body',
      files: {
        'model.c4': `${SPEC}model {\n  app = service {\n    api = service\n  }\n  other = service {\n  }\n  ext = service {\n    -> api\n  }\n}\n`,
      },
      parent: 'other',
      reference: "relationship target 'api'",
    },
    {
      name: 'an extend relationship block',
      files: {
        'model.c4': `${SPEC}model {\n  app = service {\n    api = service\n  }\n  other = service {\n  }\n  app.api -> other 'x'\n  extend api -> other 'x' {\n    metadata {\n      k 'v'\n    }\n  }\n}\n`,
      },
      parent: 'other',
      reference: "extend relationship source 'api'",
    },
    {
      name: 'a view target',
      files: {
        'model.c4': `${SPEC}model {\n  app = service {\n    api = service\n  }\n  other = service {\n  }\n}\nviews {\n  view apiView of api {\n    include *\n  }\n}\n`,
      },
      parent: 'other',
      reference: "view target 'api'",
    },
  ])('rejects a name that leaves $name unresolved', async ({ files, parent, reference }) => {
    await expectValidLikeC4(files);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.addElement(parent, { name: 'api', kind: 'service' }));
    expect(error.detail).toContain(reference);
    expect(error.detail).toContain('no longer resolve');
  });

  it('writes a name that leaves every existing reference as it was', async () => {
    const m = LikeC4Mutator.fromFiles({ 'model.c4': AMBIGUOUS_INPUT });
    m.addElement('other', { name: 'db', kind: 'service' });
    m.addElement('app', { name: 'other', kind: 'service' });
    expect(m.getElement('other.db')).not.toBeNull();
    expect(m.getRelationships({ sourceFqn: 'app.api' }).map((r) => r.targetFqn)).toEqual(['other']);
    await expectValidLikeC4(m.serialize());
  });

  it('accepts a write while unrelated references already do not resolve', async () => {
    const input = `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
  ghost -> other
}
`;
    // Diagnostics without their line number: the new element moves the line.
    const messages = (errors: string[]): string[] => errors.map((e) => e.replace(/^([^:]+):\d+:/, '$1:'));
    const before = messages(await validateLikeC4({ 'model.c4': input }));
    expect(before.some((e) => e.includes("named 'ghost'"))).toBe(true);
    const m = LikeC4Mutator.fromFiles({ 'model.c4': input });
    m.addElement('other', { name: 'api', kind: 'service' });
    expect(m.getElement('other.api')).not.toBeNull();
    // Only the pre-existing diagnostics remain.
    expect(messages(await validateLikeC4(m.serialize()))).toEqual(before);
  });
});

describe('CLI apply rejects an addElement that changes existing references', () => {
  it('exits with code 1 naming the id and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'likec4-mutator-apply-references-'));
    writeFileSync(join(dir, 'model.c4'), AMBIGUOUS_INPUT, 'utf-8');
    const mutationsPath = join(dir, 'mutations.json');
    writeFileSync(
      mutationsPath,
      JSON.stringify({ mutations: [{ op: 'addElement', parent: 'other', kind: 'service', id: 'api', title: 'API' }] }),
      'utf-8',
    );
    const result = spawnSync(
      'npx',
      ['tsx', 'src/cli.ts', 'apply', '--dir', dir, '--mutations', mutationsPath, '--in-place'],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutations[0].id:');
    expect(readFileSync(join(dir, 'model.c4'), 'utf-8')).toBe(AMBIGUOUS_INPUT);
  });
});
