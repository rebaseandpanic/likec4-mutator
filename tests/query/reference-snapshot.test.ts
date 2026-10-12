/**
 * Reference snapshots (`takeReferenceSnapshot` / `compareReferenceSnapshots`)
 * on hand-written pre- and post-write texts: extend scopes, strict-path
 * targets, survivors under an explicit removal set, change detection and
 * the internal errors.
 *
 * Expected targets are LikeC4 1.59.4's own observations of the same
 * sources: the targets its linker bound (`linkedReferences`), the endpoints
 * of `$data.relations` / `$data.deployments.relations`, and its
 * diagnostics.
 */
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import {
  compareReferenceSnapshots,
  takeReferenceSnapshot,
  type ReferenceRecord,
  type ReferenceSnapshot,
} from '../../src/query/reference-snapshot.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import { buildLikeC4Model, expectValidLikeC4, linkedReferences, type LinkedTarget } from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  deploymentNode vm
}
`;

type Documents = Array<{ file: string; ast: ReturnType<C4Parser['parse']>['ast'] }>;

/** Every file parsed standalone; the parse must be clean. */
function parse(files: Record<string, string>): Documents {
  return Object.entries(files).map(([file, source]) => {
    const doc = new C4Parser().parse(source);
    expect(doc.errors, file).toEqual([]);
    return { file, ast: doc.ast };
  });
}

function snapshot(documents: Documents, removed?: ReadonlySet<object>): ReferenceSnapshot {
  return takeReferenceSnapshot(documents, new WorkspaceIndex(documents), new DeploymentIndex(documents), removed);
}

/** The records of one role and text, in source order; at least one must exist. */
function recordsOf(snap: ReferenceSnapshot, role: string, text?: string): ReferenceRecord[] {
  const found = snap.records.filter((r) => r.role === role && (text === undefined || r.text === text));
  expect(found.length, `${role} ${text ?? ''}`).toBeGreaterThan(0);
  return found;
}

/** The target key of a LikeC4 linked target, in the snapshot's form. */
function keyOf(target: LinkedTarget | null): string | undefined {
  if (target === null) return undefined;
  if ('model' in target) return `element:${target.model}`;
  return 'element' in target ? `deployment:${target.deployment}/element:${target.element}` : `deployment:${target.deployment}`;
}

/** The nth top-level item of `$type` in the first block of `blocks` of the first document. */
function topLevel(documents: Documents, blocks: 'models' | 'deployments', type: string, nth: number): object {
  const items = ((documents[0]!.ast[blocks] as Array<{ elements: Array<{ $type: string }> }>)[0]!.elements).filter(
    (e) => e.$type === type,
  );
  expect(items.length).toBeGreaterThan(nth);
  return items[nth]!;
}

/**
 * `run` throws a plain `Error` — the internal error, which has no code or
 * subtype of its own (not an `InvalidWriteError`, not a change report).
 */
function expectInternalError(run: () => unknown): void {
  let error: unknown;
  try {
    run();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).constructor).toBe(Error);
}

describe('distinct extend scopes (row 28)', () => {
  const blocks = (first: 'a' | 'b', second: 'a' | 'b', firstNode: 'p' | 'q', secondNode: 'p' | 'q'): string => `${SPEC}model {
  a = service {
    x = service
  }
  b = service {
    x = service
  }
  c = service
  extend ${first} {
    c -> x 'L${first}'
  }
  extend ${second} {
    c -> x 'L${second}'
  }
}
deployment {
  vm p {
    vm x
  }
  vm q {
    vm x
  }
  vm r
  extend ${firstNode} {
    r -> x 'D${firstNode}'
  }
  extend ${secondNode} {
    r -> x 'D${secondNode}'
  }
}
`;
  const PRE = { 'm.c4': blocks('a', 'b', 'p', 'q') };

  it('gives equal texts in distinct extend scopes distinct keys and their own targets', async () => {
    await expectValidLikeC4(PRE);
    const { relations, deployments } = await buildLikeC4Model(PRE);
    const logical = (title: string) => relations.find((r) => r.title === title)!.target.model;
    const deployed = (title: string) => deployments.relations.find((r) => r.title === title)!.target.deployment;
    // OP: LikeC4 links the same text `x` to a different target in each scope.
    expect([logical('La'), logical('Lb')]).toEqual(['a.x', 'b.x']);
    expect([deployed('Dp'), deployed('Dq')]).toEqual(['p.x', 'q.x']);

    const snap = snapshot(parse(PRE));
    const logicalTargets = recordsOf(snap, 'relationship target', 'x');
    const deploymentTargets = recordsOf(snap, 'deployment relationship target', 'x');
    expect(logicalTargets.map((r) => r.target?.key)).toEqual([`element:${logical('La')}`, `element:${logical('Lb')}`]);
    expect(deploymentTargets.map((r) => r.target?.key)).toEqual([`deployment:${deployed('Dp')}`, `deployment:${deployed('Dq')}`]);
    expect(new Set(logicalTargets.map((r) => r.key)).size).toBe(2);
    expect(new Set(deploymentTargets.map((r) => r.key)).size).toBe(2);
  });

  it('pairs each reference with the one of its own scope when the blocks change places', () => {
    const post = { 'm.c4': blocks('b', 'a', 'q', 'p') };
    // Keys built without the extend frames would pair `x` of `extend a`
    // with `x` of `extend b` and report a change.
    expect(compareReferenceSnapshots(snapshot(parse(PRE)), snapshot(parse(post)), new Map())).toEqual([]);
  });
});

describe('strict-path targets (row 29)', () => {
  const FILES = {
    'm.c4': `${SPEC}model {
  a = service {
    x = service
  }
}
deployment {
  vm p {
    vm x
    instanceOf a
  }
}
`,
    'n.c4': `model {
  extend a {
    #t
  }
  extend a.x {
    #t
  }
  extend x {
    #t
  }
}
deployment {
  extend p {
  }
  extend p.x {
  }
  extend x {
  }
  extend p.a {
  }
}
`,
  };
  const WITH_TAG = { ...FILES, 'm.c4': FILES['m.c4'].replace('  deploymentNode vm\n', '  deploymentNode vm\n  tag t\n') };

  it('observes `extend <node>` targets with the targets LikeC4 links', async () => {
    const linked = (await linkedReferences(WITH_TAG)).filter((r) => r.role === 'extend');
    // OP: root and nested paths resolve; a non-root name and an instance do not.
    expect(linked.map((r) => r.target)).toEqual([{ deployment: 'p' }, { deployment: 'p.x' }, null, null]);

    const records = recordsOf(snapshot(parse(WITH_TAG)), 'deployment extend target');
    expect(records.map((r) => r.text)).toEqual(linked.map((r) => r.text));
    expect(records.map((r) => r.target?.key)).toEqual(linked.map((r) => keyOf(r.target)));
  });

  it('observes logical `extend X` targets as LikeC4 links them', async () => {
    const { diagnostics, elements } = await buildLikeC4Model(WITH_TAG);
    // OP: in n.c4 LikeC4 leaves unresolved the logical `extend x` (line 8, not
    // a root element) and the deployment `extend x` / `extend p.a` (lines 17,
    // 19); the strict paths `a` and `a.x` resolve.
    const unresolved = diagnostics.filter((d) => d.startsWith('n.c4:') && d.includes('Could not resolve reference'));
    expect(unresolved.map((d) => d.split(':')[1])).toEqual(['8', '17', '19']);
    expect(Object.keys(elements)).toEqual(expect.arrayContaining(['a', 'a.x']));

    const records = recordsOf(snapshot(parse(WITH_TAG)), 'extend target');
    expect(records.map((r) => [r.text, r.target?.key])).toEqual([
      ['a', 'element:a'],
      ['a.x', 'element:a.x'],
      ['x', undefined],
    ]);
  });
});

describe('multiplicity under removal (row 30)', () => {
  const PRE = `${SPEC}model {
  a = service {
    x = service
  }
  c = service
  extend a {
    c -> x 'first'
  }
  extend a {
    c -> x 'second'
  }
}
deployment {
  vm p {
    vm x
  }
  vm r
  extend p {
    r -> x 'first'
  }
  extend p {
    r -> x 'second'
  }
}
`;
  const POST = PRE.replace("  extend a {\n    c -> x 'first'\n  }\n", '').replace("  extend p {\n    r -> x 'first'\n  }\n", '');

  it('matches the survivors of the second blocks once the first ones are marked removed', async () => {
    await expectValidLikeC4({ 'm.c4': PRE });
    await expectValidLikeC4({ 'm.c4': POST });
    const pre = parse({ 'm.c4': PRE });
    const removed = new Set([topLevel(pre, 'models', 'ExtendElement', 0), topLevel(pre, 'deployments', 'ExtendDeployment', 0)]);
    const before = snapshot(pre, removed);
    const after = snapshot(parse({ 'm.c4': POST }));

    // The survivors: each second block's target and body references.
    expect(recordsOf(before, 'extend target', 'a')).toHaveLength(1);
    expect(recordsOf(before, 'deployment extend target', 'p')).toHaveLength(1);
    expect(recordsOf(before, 'relationship target', 'x')).toHaveLength(1);
    expect(recordsOf(before, 'deployment relationship target', 'x')).toHaveLength(1);
    expect(before.records.map((r) => r.key).sort()).toEqual(after.records.map((r) => r.key).sort());
    expect(compareReferenceSnapshots(before, after, new Map())).toEqual([]);
  });
});

describe('change detection and internal errors (row 31)', () => {
  const MODEL = `${SPEC}model {
  app = service {
    inner = service {
      x = service
    }
    y = service
  }
}
`;
  const PRE = `${MODEL}deployment {
  vm p {
    instanceOf app.x
  }
}
`;

  it('reports a survivor that a new element re-targets', async () => {
    const inserted = '    x = service\n';
    const post = PRE.replace('    y = service\n', `    y = service\n${inserted}`);
    const target = async (files: Record<string, string>) =>
      (await linkedReferences(files)).find((r) => r.role === 'instanceOf')!.target;
    // OP: LikeC4 links `app.x` to the unique descendant, then to the new direct child.
    expect(await target({ 'm.c4': PRE })).toEqual({ model: 'app.inner.x' });
    expect(await target({ 'm.c4': post })).toEqual({ model: 'app.x' });

    const offset = post.indexOf(inserted);
    const changes = compareReferenceSnapshots(
      snapshot(parse({ 'm.c4': PRE })),
      snapshot(parse({ 'm.c4': post })),
      new Map([['m.c4', [{ offset, end: offset + inserted.length }]]]),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ file: 'm.c4', role: 'instanceOf target', text: 'app.x' });
    expect(changes[0]!.before.key).toBe(keyOf({ model: 'app.inner.x' }));
    expect(changes[0]!.after?.key).toBe(keyOf({ model: 'app.x' }));
  });

  const ADDED = '    instanceOf app.y\n';
  const WITH_ADDED = PRE.replace('    instanceOf app.x\n', `    instanceOf app.x\n${ADDED}`);

  it('accepts a reference found only after the write inside the inserted text', () => {
    const offset = WITH_ADDED.indexOf(ADDED);
    const changes = compareReferenceSnapshots(
      snapshot(parse({ 'm.c4': PRE })),
      snapshot(parse({ 'm.c4': WITH_ADDED })),
      new Map([['m.c4', [{ offset, end: offset + ADDED.length }]]]),
    );
    expect(changes).toEqual([]);
  });

  it('raises the internal error for a reference found only after the write outside the inserted text', () => {
    expectInternalError(() =>
      compareReferenceSnapshots(snapshot(parse({ 'm.c4': PRE })), snapshot(parse({ 'm.c4': WITH_ADDED })), new Map()),
    );
  });

  it('raises the internal error for a survivor that is gone after the write without being marked removed', () => {
    expectInternalError(() =>
      compareReferenceSnapshots(snapshot(parse({ 'm.c4': WITH_ADDED })), snapshot(parse({ 'm.c4': PRE })), new Map()),
    );
  });
});
