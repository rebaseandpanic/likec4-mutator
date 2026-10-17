/**
 * Reference snapshots (`takeReferenceSnapshot` / `compareReferenceSnapshots`)
 * on hand-written pre- and post-write texts: extend scopes, strict-path
 * targets, survivors under an explicit removal set, change detection and
 * the internal errors; the view references, always covered since the
 * snapshot is built on the reference catalogue (lc4m-15.30, US-4).
 *
 * Expected targets are LikeC4 1.59.4's own observations of the same
 * sources: the targets its linker bound (`linkedReferences`), the endpoints
 * of `$data.relations` / `$data.deployments.relations`, and its
 * diagnostics.
 */
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { buildReferenceCatalogue } from '../../src/query/reference-catalogue.js';
import {
  compareReferenceSnapshots,
  takeReferenceSnapshot,
  type ReferenceRecord,
  type ReferenceSnapshot,
} from '../../src/query/reference-snapshot.js';
import { ViewIndex } from '../../src/query/view-index.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  buildLikeC4Model,
  expectValidLikeC4,
  linkedCatalogueReferences,
  linkedReferences,
  linkedViewReferences,
  type LinkedTarget,
  type LinkedViewReference,
  type LinkedViewTarget,
} from '../helpers/likec4-model.js';

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
  const deployments = new DeploymentIndex(documents);
  const catalogue = buildReferenceCatalogue(new WorkspaceIndex(documents), deployments, new ViewIndex(documents));
  return takeReferenceSnapshot(catalogue, deployments, removed);
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

// ---------------------------------------------------------------------------
// View references (rows 42–47 of lc4m-15.29; formerly the opt-in `views`
// option, now always covered: rows 6 and 7 of lc4m-15.30)
// ---------------------------------------------------------------------------

/** The snapshot's key of a LikeC4 linked view-reference target. */
function viewKeyOf(target: LinkedViewTarget | null): string | undefined {
  if (target !== null && 'view' in target) return `view:${target.view}`;
  return keyOf(target);
}

/** The target LikeC4 links the one reference of `role` and `text` in view `view` to. */
async function linkedTarget(
  files: Record<string, string>,
  view: string,
  role: LinkedViewReference['role'],
  text: string,
): Promise<LinkedViewTarget | null> {
  const found = (await linkedViewReferences(files)).filter((r) => r.view === view && r.role === role && r.text === text);
  expect(found, `${view} ${role} ${text}`).toHaveLength(1);
  return found[0]!.target;
}

describe('view references: equal rule texts in two views (row 43)', () => {
  const FILES = {
    'm.c4': `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
    api = service
  }
}
views {
  view a of app {
    include api
  }
  view b of other {
    include api
  }
}
`,
  };

  it('keeps distinct keys, each with the target LikeC4 links', async () => {
    await expectValidLikeC4(FILES);
    const expected = [await linkedTarget(FILES, 'a', 'rule', 'api'), await linkedTarget(FILES, 'b', 'rule', 'api')];
    // OP: LikeC4 links the same text to a different element in each view's `of` scope.
    expect(expected).toEqual([{ model: 'app.api' }, { model: 'other.api' }]);

    const records = recordsOf(snapshot(parse(FILES)), 'view rule reference', 'api');
    expect(records.map((r) => r.target?.key)).toEqual(expected.map(viewKeyOf));
    expect(new Set(records.map((r) => r.key)).size).toBe(2);
  });
});

describe('view references: a removed rule (row 44)', () => {
  const PRE = `${SPEC}model {
  app = service {
    api = service
    db = service
  }
}
views {
  view v of app {
    include api
    exclude db
  }
}
`;
  const POST = PRE.replace('    exclude db\n', '');

  it('leaves the removed rule out: no change and no internal error', async () => {
    await expectValidLikeC4({ 'm.c4': PRE });
    const documents = parse({ 'm.c4': PRE });
    const view = (documents[0]!.ast.views as Array<{ views: Array<{ body: { rules: object[] } }> }>)[0]!.views[0]!;
    const rule = view.body.rules[1]!;
    const before = snapshot(documents, new Set([rule]));
    expect(recordsOf(snapshot(documents), 'view rule reference', 'db')).toHaveLength(1);
    expect(before.records.some((r) => r.role === 'view rule reference' && r.text === 'db')).toBe(false);
    expect(compareReferenceSnapshots(before, snapshot(parse({ 'm.c4': POST })), new Map())).toEqual([]);
  });
});

describe('view references: a step moved into a par block (row 45)', () => {
  const MODEL = `${SPEC}model {
  a = service
  b = service
  c = service
}
`;
  const PRE = `${MODEL}views {
  dynamic view d {
    a -> b
    b -> c 'moved'
    par {
      c -> a
    }
  }
}
`;
  const POST = `${MODEL}views {
  dynamic view d {
    a -> b
    par {
      b -> c 'moved'
      c -> a
    }
  }
}
`;

  it("matches the moved step's endpoints: no change and no internal error", async () => {
    await expectValidLikeC4({ 'm.c4': PRE });
    await expectValidLikeC4({ 'm.c4': POST });
    const steps = async (files: Record<string, string>) =>
      (await linkedViewReferences(files)).filter((r) => r.role === 'step').map((r) => [r.text, r.target]);
    // OP: LikeC4 links every endpoint to the same element before and after the move.
    expect(await steps({ 'm.c4': POST })).toEqual(await steps({ 'm.c4': PRE }));

    const before = snapshot(parse({ 'm.c4': PRE }));
    expect(recordsOf(before, 'view step endpoint')).toHaveLength(6);
    expect(compareReferenceSnapshots(before, snapshot(parse({ 'm.c4': POST })), new Map())).toEqual([]);
  });
});

describe('view references: re-targeted and lost survivors (row 46)', () => {
  const PRE = `${SPEC}model {
  app = service {
    api = service
  }
  other = service
}
views {
  view base {
    include *
  }
  view child extends base {
    include *
  }
  view plain {
    include api
    include app -> other with {
      navigateTo flow2
    }
  }
  dynamic view flow {
    api -> other
  }
  dynamic view flow2 {
    include app
  }
}
`;
  const POST = PRE.replace('  other = service\n', '  other = service\n  api = service\n')
    .replace('  view base {', '  dynamic view base {')
    .replace('  dynamic view flow2 {', '  view flow2 {');
  const FILES_PRE = { 'm.c4': PRE };
  const FILES_POST = { 'm.c4': POST };

  it('reports each class of view reference whose target changes or is lost', async () => {
    await expectValidLikeC4(FILES_PRE);
    const cases = [
      // In source order, the order of the snapshot's records.
      { view: 'child', role: 'extends', text: 'base', snapshotRole: 'view extends' },
      { view: 'plain', role: 'rule', text: 'api', snapshotRole: 'view rule reference' },
      { view: 'plain', role: 'relationWithNavigateTo', text: 'flow2', snapshotRole: 'relation with navigateTo' },
      { view: 'flow', role: 'step', text: 'api', snapshotRole: 'view step endpoint' },
    ] as const;
    const linked = await Promise.all(
      cases.map(async (c) => [await linkedTarget(FILES_PRE, c.view, c.role, c.text), await linkedTarget(FILES_POST, c.view, c.role, c.text)]),
    );
    // OP: the element references move to the new root `api`; the view references are left unresolved.
    expect(linked).toEqual([
      [{ view: 'base' }, null],
      [{ model: 'app.api' }, { model: 'api' }],
      [{ view: 'flow2' }, null],
      [{ model: 'app.api' }, { model: 'api' }],
    ]);

    const changes = compareReferenceSnapshots(snapshot(parse(FILES_PRE)), snapshot(parse(FILES_POST)), new Map());
    expect(
      changes.map((c) => ({ role: c.role, text: c.text, before: c.before.key, after: c.after?.key })),
    ).toEqual(
      cases.map((c, i) => ({ role: c.snapshotRole, text: c.text, before: viewKeyOf(linked[i]![0]!), after: viewKeyOf(linked[i]![1]!) })),
    );
  });
});

describe('addElement checks view rule references (row 7; lc4m-15.29 row 47 flipped, INV-8)', () => {
  const FILES = {
    'm.c4': `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
}
views {
  view v {
    include api
  }
}
`,
  };
  // What `addElement('other', { name: 'api', kind: 'service' })` would write.
  const WRITTEN = { 'm.c4': FILES['m.c4'].replace('  other = service {\n', '  other = service {\n    api = service\n') };

  it('rejects addElement that would leave a view rule reference unresolved, changing nothing', async () => {
    await expectValidLikeC4(FILES);
    // P: LikeC4 links the rule's `api` to `app.api`, and leaves it unresolved in the text the call would write.
    expect(await linkedTarget(FILES, 'v', 'rule', 'api')).toEqual({ model: 'app.api' });
    expect(await linkedTarget(WRITTEN, 'v', 'rule', 'api')).toBeNull();

    const m = LikeC4Mutator.fromFiles(FILES);
    const before = { files: m.serialize(), elements: m.listElements() };
    let error: unknown;
    try {
      m.addElement('other', { name: 'api', kind: 'service' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(InvalidWriteError);
    expect((error as InvalidWriteError).field).toBe('name');
    expect(m.serialize()).toEqual(before.files);
    expect(m.listElements()).toEqual(before.elements);
  });
});

/** The target LikeC4 links the one catalogue reference of `role` and `text` to. */
async function catalogueTarget(files: Record<string, string>, role: string, text: string): Promise<LinkedViewTarget | null> {
  const found = (await linkedCatalogueReferences(files)).filter((r) => r.role === role && r.text === text);
  expect(found, `${role} ${text}`).toHaveLength(1);
  return found[0]!.target;
}

describe('newly covered reference kinds (row 5)', () => {
  const STYLED = `${SPEC}model {
  app = service {
    api = service
  }
}
views {
  style api {
    color red
  }
  view v {
    include *
  }
}
`;
  const ROOT = '  api = service\n';
  const STYLED_WRITTEN = STYLED.replace('  app = service {\n', `${ROOT}  app = service {\n`);

  it('reports a views-block style target an addition re-targets, and addElement rejects that addition', async () => {
    await expectValidLikeC4({ 'm.c4': STYLED });
    const linked = [await catalogueTarget({ 'm.c4': STYLED }, 'style-target', 'api'), await catalogueTarget({ 'm.c4': STYLED_WRITTEN }, 'style-target', 'api')];
    // OP: LikeC4 links the views-block style target to `app.api`, then to the new root `api`.
    expect(linked).toEqual([{ model: 'app.api' }, { model: 'api' }]);

    const offset = STYLED_WRITTEN.indexOf(ROOT);
    const changes = compareReferenceSnapshots(
      snapshot(parse({ 'm.c4': STYLED })),
      snapshot(parse({ 'm.c4': STYLED_WRITTEN })),
      new Map([['m.c4', [{ offset, end: offset + ROOT.length }]]]),
    );
    expect(changes.map((c) => ({ role: c.role, text: c.text, before: c.before.key, after: c.after?.key }))).toEqual([
      { role: 'views style target', text: 'api', before: viewKeyOf(linked[0]!), after: viewKeyOf(linked[1]!) },
    ]);

    const m = LikeC4Mutator.fromFiles({ 'm.c4': STYLED });
    const before = { files: m.serialize(), elements: m.listElements() };
    let error: unknown;
    try {
      m.addElement(null, { name: 'api', kind: 'service' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(InvalidWriteError);
    expect((error as InvalidWriteError).field).toBe('name');
    expect(m.serialize()).toEqual(before.files);
    expect(m.listElements()).toEqual(before.elements);
  });

  // D119: no element addition can change what a `navigateTo` links to (view
  // ids are their own name space), so the coverage of a relationship-body
  // `navigateTo` is observed on hand-written texts where its view changes type.
  const NAVIGATING = `${SPEC}model {
  a = service
  b = service
  a -> b {
    navigateTo flow
  }
}
views {
  dynamic view flow {
    include a
  }
}
`;
  const RETYPED = NAVIGATING.replace('  dynamic view flow {', '  view flow {');

  it('reports a relationship-body navigateTo whose target is lost', async () => {
    await expectValidLikeC4({ 'm.c4': NAVIGATING });
    const linked = [await catalogueTarget({ 'm.c4': NAVIGATING }, 'navigate-to', 'flow'), await catalogueTarget({ 'm.c4': RETYPED }, 'navigate-to', 'flow')];
    // OP: a relationship's `navigateTo` links only to a dynamic view: LikeC4 leaves it unresolved once `flow` is an element view.
    expect(linked).toEqual([{ view: 'flow' }, null]);

    const changes = compareReferenceSnapshots(snapshot(parse({ 'm.c4': NAVIGATING })), snapshot(parse({ 'm.c4': RETYPED })), new Map());
    expect(changes.map((c) => ({ role: c.role, text: c.text, before: c.before.key, after: c.after?.key }))).toEqual([
      { role: 'relationship navigateTo', text: 'flow', before: viewKeyOf(linked[0]!), after: viewKeyOf(linked[1]!) },
    ]);
  });
});
