/**
 * References written in views resolve to the targets LikeC4 1.59.4 links
 * them to (`ViewReferenceResolver`), and the `ViewIndex` reverse index lists
 * every reference to a view.
 *
 * Every expected target is LikeC4's own observation of the same sources,
 * never the library's code: the targets its linker bound
 * (`linkedViewReferences`) and its diagnostics (`buildLikeC4Model`).  A
 * reference LikeC4 leaves unresolved — an ambiguous name included — must
 * resolve to nothing.  Cases follow the reconnaissance spike 03 (a1–h5).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { ViewIndex, type ViewAstNode, type ViewDeclaration } from '../../src/query/view-index.js';
import { ViewReferenceResolver, type ViewTargetRole } from '../../src/query/view-resolver.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import {
  buildLikeC4Model,
  expectValidLikeC4,
  linkedViewReferences,
  parsedViews,
  type LinkedViewReference,
  type LinkedViewReferenceRole,
  type LinkedViewTarget,
} from '../helpers/likec4-model.js';

const SPEC = `specification {
  element actor
  element system
  element container
  deploymentNode env
  deploymentNode vm
  relationship async
  tag next
}
`;

const MODEL = `model {
  user = actor 'User'
  ext = system 'External'
  app = system 'App' {
    web = container 'Web'
    api = container 'API'
    db = container 'DB'
  }
  user -> app.web 'uses'
  app.web -> app.api 'calls'
  app.api -> app.db 'reads'
}
`;

/** A second `model` block that makes `api` ambiguous in its document. */
const OTHER_API = `model {
  ops = system 'Ops' {
    api = container 'Ops API'
  }
}
`;

const DEPLOYMENT = `deployment {
  env prod {
    vm vm1 {
      instanceOf app.api
      instanceOf app.db
    }
  }
}
`;

/** One document holding the specification, the model and `views`. */
const oneFile = (views: string, extra = ''): Record<string, string> => ({
  'a.c4': `${SPEC}${MODEL}${extra}views {\n${views}\n}\n`,
});

/** The library side: every document parsed standalone and indexed. */
function library(files: Record<string, string>) {
  const parser = new C4Parser();
  const documents = Object.entries(files).map(([file, source]) => ({ file, ast: parser.parse(source).ast }));
  const views = new ViewIndex(documents);
  const resolver = new ViewReferenceResolver(new WorkspaceIndex(documents), new DeploymentIndex(documents), views);
  return { documents, views, resolver };
}

interface Cst {
  offset: number;
  text: string;
  range: { start: { line: number } };
}

/** The role of a `navigateTo` property, by the node it is written in. */
function navigateToRole(node: ViewAstNode): LinkedViewReferenceRole {
  for (let up = node.$container; up; up = up.$container) {
    switch (up.$type) {
      case 'FqnExprWith':
        return 'elementWithNavigateTo';
      case 'RelationExprWith':
        return 'relationWithNavigateTo';
      case 'Step':
      case 'StepSeries':
        return 'stepNavigateTo';
      case 'DeploymentRelation':
        return 'deploymentRelationshipNavigateTo';
      case 'Relation':
        return 'relationshipNavigateTo';
    }
  }
  throw new Error('navigateTo outside a known container');
}

/** The view types a `navigateTo` of each role accepts. */
const NAVIGATE_TO: Record<string, ViewTargetRole> = {
  elementWithNavigateTo: 'any',
  relationWithNavigateTo: 'dynamic',
  stepNavigateTo: 'dynamic',
  relationshipNavigateTo: 'dynamic',
  deploymentRelationshipNavigateTo: 'dynamic',
};

/**
 * The library's resolution of the same reference occurrences
 * `linkedViewReferences` reports, in the same order and shape: each
 * occurrence found in the parsed AST, its target from
 * `ViewReferenceResolver`.
 */
function libraryReferences(files: Record<string, string>): LinkedViewReference[] {
  const { documents, views, resolver } = library(files);
  const declarationOf = new Map<unknown, ViewDeclaration>(views.declarations().map((d) => [d.node, d]));
  const result: LinkedViewReference[] = [];
  for (const { file, ast } of documents) {
    const found: Array<{ offset: number; reference: LinkedViewReference }> = [];
    const visit = (node: ViewAstNode, view: ViewDeclaration | undefined, inBody: boolean): void => {
      const declaration = declarationOf.get(node) ?? view;
      const report = (written: ViewAstNode, role: LinkedViewReferenceRole, target: LinkedViewTarget | undefined): void => {
        const cst = written.$cstNode as unknown as Cst;
        found.push({
          offset: cst.offset,
          reference: {
            file,
            at: `${file}:${cst.range.start.line + 1}`,
            view: declaration?.id ?? null,
            role,
            text: cst.text,
            target: target ?? null,
          },
        });
      };
      if (declarationOf.has(node) && node.$type === 'ElementView') {
        if (node.viewOf) {
          const fqn = resolver.viewOf(declaration!);
          report(node.viewOf as ViewAstNode, 'of', fqn === undefined ? undefined : { model: fqn });
        }
        if (node.extends) {
          const text = resolver.extendsText(declaration!)!;
          const id = resolver.resolveViewText(text, 'element');
          report(node.extends as ViewAstNode, 'extends', id === undefined ? undefined : { view: id });
        }
      }
      if (node.$type === 'NavigateToProperty' || node.$type === 'RelationNavigateToProperty') {
        const value = node.value as ViewAstNode & { view: { $refText: string } };
        const role = navigateToRole(node);
        const id = resolver.resolveViewText(value.view.$refText, NAVIGATE_TO[role]!);
        report(value, role, id === undefined ? undefined : { view: id });
      }
      if (node.$type === 'FqnRef' && inBody) {
        const endpoint = node.$container?.$type === 'ElementRef' && /^(Step|StepSeries)$/.test(node.$container.$container?.$type ?? '');
        if (declaration!.type === 'deployment') report(node, 'rule', resolver.resolveDeploymentRef(node));
        else {
          const fqn = resolver.resolveElementRef(declaration!, node);
          report(node, endpoint ? 'step' : 'rule', fqn === undefined ? undefined : { model: fqn });
        }
        return; // the topmost reference only
      }
      const body = inBody || /^(ElementViewBody|DynamicViewBody|DeploymentViewBody)$/.test(node.$type ?? '');
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('$')) continue;
        for (const child of Array.isArray(value) ? value : [value]) {
          if (child && typeof child === 'object' && typeof (child as ViewAstNode).$type === 'string') {
            visit(child as ViewAstNode, declaration, body);
          }
        }
      }
    };
    visit(ast as unknown as ViewAstNode, undefined, false);
    result.push(...found.sort((a, b) => a.offset - b.offset).map((f) => f.reference));
  }
  return result;
}

/** LikeC4's diagnostics of `files` at `<file>:<line>`. */
async function diagnosticsAt(files: Record<string, string>, at: string): Promise<string[]> {
  const { diagnostics } = await buildLikeC4Model(files);
  return diagnostics.filter((d) => d.startsWith(`${at}: `)).map((d) => d.slice(at.length + 2));
}

/**
 * Assert the library resolves every view reference of `files` as LikeC4
 * links it, and return LikeC4's references whose text is `text` and role is
 * one of `roles`, for the case's own assertions.
 */
async function expectLinked(files: Record<string, string>, text: string, roles: LinkedViewReferenceRole[]): Promise<LinkedViewReference[]> {
  const linked = await linkedViewReferences(files);
  expect(libraryReferences(files)).toEqual(linked);
  const selected = linked.filter((r) => r.text === text && roles.includes(r.role));
  expect(selected.length, `references '${text}'`).toBeGreaterThan(0);
  return selected;
}

/** OP: an unresolved reference has LikeC4's `Could not resolve reference` diagnostic at its line. */
async function expectUnresolvedDiagnostic(files: Record<string, string>, reference: LinkedViewReference): Promise<void> {
  const messages = await diagnosticsAt(files, reference.at);
  expect(messages.some((m) => m.startsWith('Could not resolve reference')), `${reference.at}: ${messages.join(' | ')}`).toBe(true);
}

describe('element view without `of` (row 1)', () => {
  it.each([
    { name: 'a1 unique in the same document', files: oneFile('view v {\n include api\n}'), text: 'api', target: 'app.api' },
    { name: 'a4 ambiguous in the document', files: oneFile('view v {\n include api\n}', OTHER_API), text: 'api', target: null },
    {
      name: 'a5 declared only in another file',
      files: { 'a.c4': `${SPEC}${MODEL}`, 'v.c4': 'views {\n view v {\n include api\n }\n}\n' },
      text: 'api',
      target: null,
    },
    {
      name: 'a6 qualified, across files',
      files: { 'a.c4': `${SPEC}${MODEL}`, 'v.c4': 'views {\n view v {\n include app.api\n }\n}\n' },
      text: 'app.api',
      target: 'app.api',
    },
  ])('$name', async ({ files, text, target }) => {
    const [reference] = await expectLinked(files, text, ['rule']);
    expect(reference!.target).toEqual(target === null ? null : { model: target });
    if (target === null) await expectUnresolvedDiagnostic(files, reference!);
  });
});

describe('`of` scope (row 2)', () => {
  it.each([
    { name: 'b1 include api', views: 'view v of app {\n include api\n}', extra: '', text: 'api', target: 'app.api' },
    { name: 'b1b include api, ambiguous in the document', views: 'view v of app {\n include api\n}', extra: OTHER_API, text: 'api', target: 'app.api' },
    { name: 'b3 include -> api', views: 'view v of app {\n include -> api\n}', extra: OTHER_API, text: 'api', target: 'app.api' },
    { name: 'b4 include web -> api', views: 'view v of app {\n include web -> api\n}', extra: OTHER_API, text: 'api', target: 'app.api' },
    { name: 'b6 style api', views: 'view v of app {\n include *\n style api { color red }\n}', extra: OTHER_API, text: 'api', target: 'app.api' },
    { name: 'b5 top-level user', views: 'view v of app {\n include user\n}', extra: '', text: 'user', target: 'user' },
    {
      name: 'ambiguous under `of` stays unresolved',
      views: 'view v of app {\n include node\n}',
      extra: `model {\n  extend app.web {\n    node = container 'Web node'\n  }\n  extend app.db {\n    node = container 'DB node'\n  }\n}\n`,
      text: 'node',
      target: null,
    },
  ])('$name', async ({ views, extra, text, target }) => {
    const files = oneFile(views, extra);
    const [reference] = await expectLinked(files, text, ['rule']);
    expect(reference!.target).toEqual(target === null ? null : { model: target });
    if (target === null) await expectUnresolvedDiagnostic(files, reference!);
  });

  it('b7 `view v of api` resolves the `of` target', async () => {
    const files = oneFile('view v of api {\n include *\n}');
    const [reference] = await expectLinked(files, 'api', ['of']);
    expect(reference!.target).toEqual({ model: 'app.api' });
  });
});

describe('`extends` scope (row 3)', () => {
  it.each([
    { name: 'c1 parent `of app`', views: 'view p of app {\n include *\n}\nview v extends p {\n include api\n}', extra: '', target: 'app.api' },
    { name: 'c1b parent `of app`, ambiguous in the document', views: 'view p of app {\n include ext\n}\nview v extends p {\n include api\n}', extra: OTHER_API, target: 'app.api' },
    { name: 'c2 parent without `of`: document scope', views: 'view p {\n include *\n}\nview v extends p {\n include api\n}', extra: '', target: 'app.api' },
    { name: 'c2 parent without `of`, ambiguous: unresolved', views: 'view p {\n include *\n}\nview v extends p {\n include api\n}', extra: OTHER_API, target: null },
    {
      name: 'two-level chain: grandchild of a child of a parent `of app`',
      views: 'view p of app {\n include *\n}\nview c extends p {\n include api\n}\nview g extends c {\n include api\n}',
      extra: OTHER_API,
      target: 'app.api',
    },
  ])('$name', async ({ views, extra, target }) => {
    const files = oneFile(views, extra);
    const references = await expectLinked(files, 'api', ['rule']);
    for (const reference of references) {
      expect(reference.target, reference.at).toEqual(target === null ? null : { model: target });
      if (target === null) await expectUnresolvedDiagnostic(files, reference);
    }
  });
});

describe('dynamic views use the document scope only (row 4)', () => {
  it.each([
    { name: 'd1 unique in the same document', files: oneFile('dynamic view v {\n api -> db\n include web\n}'), resolved: true },
    { name: 'd1b ambiguous in the document', files: oneFile('dynamic view v {\n api -> app.db\n include api\n}', OTHER_API), resolved: false },
    {
      name: 'd1c declared only in another file',
      files: { 'a.c4': `${SPEC}${MODEL}`, 'v.c4': 'views {\n dynamic view v {\n api -> db\n include web\n }\n}\n' },
      resolved: false,
    },
    { name: 'd2 qualified', files: oneFile('dynamic view v {\n app.api -> app.db\n include app.web\n}'), resolved: true },
  ])('$name', async ({ files, resolved }) => {
    const linked = await linkedViewReferences(files);
    expect(libraryReferences(files)).toEqual(linked);
    const unqualified = linked.filter((r) => (r.role === 'step' || r.role === 'rule') && !r.text.includes('.'));
    const covered = new Set(linked.filter((r) => r.role === 'step' || r.role === 'rule').map((r) => r.role));
    expect([...covered].sort()).toEqual(['rule', 'step']);
    for (const reference of unqualified) {
      expect(reference.target !== null, reference.at).toBe(resolved);
      if (!resolved) await expectUnresolvedDiagnostic(files, reference);
    }
  });
});

describe('`navigateTo` roles (row 5)', () => {
  it.each([
    { name: 'e1 element `with` → element view', views: 'view t {\n include *\n}\nview v {\n include app.api with { navigateTo t }\n}', role: 'elementWithNavigateTo', resolved: true },
    { name: 'e2 element `with` → dynamic view', views: 'dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.api with { navigateTo t }\n}', role: 'elementWithNavigateTo', resolved: true },
    { name: 'e3 element `with` → deployment view', views: 'deployment view t {\n include prod.**\n}\nview v {\n include app.api with { navigateTo t }\n}', role: 'elementWithNavigateTo', resolved: true },
    { name: 'e4 element `with` → unknown', views: 'view v {\n include app.api with { navigateTo t }\n}', role: 'elementWithNavigateTo', resolved: false },
    { name: 'e5 relation `with` → element view', views: 'view t {\n include *\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}', role: 'relationWithNavigateTo', resolved: false },
    { name: 'e6 relation `with` → dynamic view', views: 'dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}', role: 'relationWithNavigateTo', resolved: true },
    { name: 'e7 step → dynamic view', views: 'dynamic view t {\n app.api -> app.db\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}', role: 'stepNavigateTo', resolved: true },
    { name: 'e8 step → element view', views: 'view t {\n include *\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}', role: 'stepNavigateTo', resolved: false },
    { name: 'e9 step → deployment view', views: 'deployment view t {\n include prod.**\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}', role: 'stepNavigateTo', resolved: false },
    { name: 'e10 step → unknown', views: 'dynamic view v {\n app.web -> app.api { navigateTo t }\n}', role: 'stepNavigateTo', resolved: false },
  ] as const)('$name', async ({ views, role, resolved }) => {
    const files = oneFile(views, DEPLOYMENT);
    const [reference] = await expectLinked(files, 't', [role]);
    expect(reference!.target).toEqual(resolved ? { view: 't' } : null);
    if (!resolved) await expectUnresolvedDiagnostic(files, reference!);
  });
});

describe('`extends` targets (row 6)', () => {
  it.each([
    { name: 'an element view', views: 'view t {\n include *\n}\nview v extends t {\n include *\n}', resolved: true },
    { name: 'f1 a dynamic view', views: 'dynamic view t {\n app.api -> app.db\n}\nview v extends t {\n include *\n}', resolved: false },
    { name: 'f2 a deployment view', views: 'deployment view t {\n include prod.**\n}\nview v extends t {\n include *\n}', resolved: false },
    { name: 'f3 an unknown id', views: 'view v extends t {\n include *\n}', resolved: false },
  ])('$name', async ({ views, resolved }) => {
    const files = oneFile(views, DEPLOYMENT);
    const [reference] = await expectLinked(files, 't', ['extends']);
    expect(reference!.target).toEqual(resolved ? { view: 't' } : null);
    if (!resolved) await expectUnresolvedDiagnostic(files, reference!);
  });
});

describe('kinds and tags (row 7)', () => {
  type Check = 'relationshipKind' | 'tag' | 'elementKind' | 'elementOrDeploymentNodeKind';
  const declared = (resolver: ViewReferenceResolver, check: Check, name: string): boolean => {
    switch (check) {
      case 'relationshipKind':
        return resolver.isRelationshipKind(name);
      case 'tag':
        return resolver.isTag(name);
      case 'elementKind':
        return resolver.isElementKind(name);
      case 'elementOrDeploymentNodeKind':
        return resolver.isElementOrDeploymentNodeKind(name);
    }
  };
  const TYPE: Record<Check, string> = {
    relationshipKind: 'RelationshipKind',
    tag: 'Tag',
    elementKind: 'ElementKind',
    elementOrDeploymentNodeKind: 'DeploymentNodeOrElementKind',
  };
  const DECLARED: Record<Check, string> = { relationshipKind: 'async', tag: 'next', elementKind: 'container', elementOrDeploymentNodeKind: 'vm' };
  /** Every place a kind or tag is written, with the name `pick` chooses for its declaration set. */
  const cases = (pick: (check: Check) => string) =>
    [
      { form: 'g1 step `-[k]->`', check: 'relationshipKind', views: (n: string) => `dynamic view v {\n app.api -[${n}]-> ext\n}` },
      { form: 'g2 step `.k`', check: 'relationshipKind', views: (n: string) => `dynamic view v {\n app.api .${n} ext\n}` },
      { form: 'g3 predicate `-[k]->`', check: 'relationshipKind', views: (n: string) => `view v {\n include app.api -[${n}]-> ext\n}` },
      { form: 'g3 predicate `.k`', check: 'relationshipKind', views: (n: string) => `view v {\n include app.api .${n} ext\n}` },
      { form: 'g4 `where tag is #t`', check: 'tag', views: (n: string) => `view v {\n include app.* where tag is #${n}\n}` },
      { form: 'g5 `element.tag = #t`', check: 'tag', views: (n: string) => `view v {\n include element.tag = #${n}\n}` },
      { form: 'g8 view tag', check: 'tag', views: (n: string) => `view v {\n #${n}\n include *\n}` },
      { form: 'g7 `element.kind = k`', check: 'elementKind', views: (n: string) => `view v {\n include element.kind = ${n}\n}` },
      { form: 'g6 `where kind is k`', check: 'elementOrDeploymentNodeKind', views: (n: string) => `view v {\n include app.* where kind is ${n}\n}` },
    ].map((c) => {
      const name = pick(c.check as Check);
      return { label: `${c.form}: ${name}`, check: c.check as Check, name, views: c.views(name) };
    });

  it.each([...cases(() => 'nope'), ...cases((check) => DECLARED[check])])('$label', async ({ check, name, views }) => {
    const files = oneFile(views, DEPLOYMENT);
    // The line of the view body that writes the name: the one after `view v {` / `dynamic view v {`.
    const lines = files['a.c4']!.split('\n');
    const line = lines.findIndex((l) => /^(dynamic )?view v \{$/.test(l)) + 2;
    expect(lines[line - 1]).toContain(name);
    const messages = await diagnosticsAt(files, `a.c4:${line}`);
    const linkerSaysDeclared = !messages.some((m) => m.startsWith(`Could not resolve reference to ${TYPE[check]} named`));
    // OP: the declared name links, the undeclared one does not.
    expect(linkerSaysDeclared, messages.join(' | ')).toBe(name !== 'nope');
    expect(declared(library(files).resolver, check, name)).toBe(linkerSaysDeclared);
  });
});

describe('deployment views (row 8)', () => {
  const files = (views: string) => oneFile(views, DEPLOYMENT);

  it('h5 a unique deployment name resolves to its node', async () => {
    const [reference] = await expectLinked(files('deployment view v {\n include vm1\n}'), 'vm1', ['rule']);
    expect(reference!.target).toEqual({ deployment: 'prod.vm1' });
  });

  it('h2 a deployment path into an instance resolves to the instance', async () => {
    const [reference] = await expectLinked(files('deployment view v {\n include prod.vm1.api\n}'), 'prod.vm1.api', ['rule']);
    expect(reference!.target).toEqual({ deployment: 'prod.vm1.api' });
  });

  it('h1 a model reference in include is flagged as a model target', async () => {
    const input = files('deployment view v {\n include app.api\n}');
    const [reference] = await expectLinked(input, 'app.api', ['rule']);
    expect(reference!.target).toEqual({ model: 'app.api' });
    expect(await diagnosticsAt(input, reference!.at)).toContain('Deployment view predicate must reference deployment model');
  });

  it('h4 a model reference in exclude is flagged as a model target, without error', async () => {
    const input = files('deployment view v {\n include prod.**\n exclude app.api -> app.db\n}');
    const references = await expectLinked(input, 'app.api', ['rule']);
    expect(references.map((r) => r.target)).toEqual([{ model: 'app.api' }]);
    expect((await buildLikeC4Model(input)).errors).toEqual([]);
  });

  it('a deployment name wins over a top-level element of the same name', async () => {
    const input = files('deployment view v {\n include prod\n}');
    const withElement = { 'a.c4': input['a.c4']!.replace("ext = system 'External'", "ext = system 'External'\n  prod = system 'Prod'") };
    const [reference] = await expectLinked(withElement, 'prod', ['rule']);
    expect(reference!.target).toEqual({ deployment: 'prod' });
  });
});

/** Every `.c4` file of a fixture workspace, keyed by its path relative to the workspace. */
function readWorkspace(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.c4')) files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

describe('reverse index of view references (row 9)', () => {
  it('on both fixtures, the referrers of every view equal LikeC4\'s linked references', async () => {
    const fixtures = ['views-catalog', 'views-flows'].map((name) => ({ name, files: readWorkspace(name) }));
    // P: both fixtures are valid, declare views, and together reference views in every role.
    const linkedOf = new Map<string, LinkedViewReference[]>();
    for (const { name, files } of fixtures) {
      await expectValidLikeC4(files);
      expect((await parsedViews(files)).length, name).toBeGreaterThan(0);
      const linked = (await linkedViewReferences(files)).filter((r) => r.role === 'extends' || r.role.endsWith('NavigateTo'));
      expect(linked.length, name).toBeGreaterThan(0);
      expect(linked.every((r) => r.target !== null), name).toBe(true);
      linkedOf.set(name, linked);
    }
    expect([...new Set([...linkedOf.values()].flat().map((r) => r.role))].sort()).toEqual([
      'deploymentRelationshipNavigateTo',
      'elementWithNavigateTo',
      'extends',
      'relationWithNavigateTo',
      'relationshipNavigateTo',
      'stepNavigateTo',
    ]);

    for (const { name, files } of fixtures) {
      const linked = linkedOf.get(name)!;
      const { views } = library(files);
      const ids = [...new Set(views.declarations().map((d) => d.id).filter((id): id is string => id !== undefined))];
      expect(ids.length, name).toBeGreaterThan(0);
      for (const id of ids) {
        const expected = linked
          .filter((r) => (r.target as { view?: string }).view === id)
          .map((r) => `${r.at} ${r.role} ${r.text} @${r.view ?? '-'}`)
          .sort();
        const actual = views
          .referrersOf(id)
          .map((r) => {
            const written = (r.role === 'extends' ? r.node : (r.node.value as ViewAstNode)).$cstNode as unknown as Cst;
            return `${r.file}:${written.range.start.line + 1} ${r.role} ${written.text} @${r.view?.id ?? '-'}`;
          })
          .sort();
        expect(actual, `${name}: referrers of ${id}`).toEqual(expected);
        for (const referrer of views.referrersOf(id)) {
          // The entry points at the reference itself, not at its view.
          const written = (referrer.role === 'extends' ? referrer.node : (referrer.node.value as ViewAstNode)).$cstNode as unknown as Cst;
          expect(files[referrer.file!]!.slice(written.offset, written.offset + written.text.length)).toBe(referrer.target);
        }
      }
    }
  });
});
