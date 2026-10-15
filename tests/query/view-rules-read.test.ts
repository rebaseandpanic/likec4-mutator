/**
 * The rules of a view and their structured predicates (US-2, US-3), read by
 * the rule builder of `src/query/view-query.ts`.
 *
 * Expected values come from LikeC4 1.59.4's own parse of the same files
 * (`parsedViews`, compared through `expectRulesAgreeWithLikeC4`), its linker
 * (`linkedViewReferences`), its diagnostics, and from the input text itself
 * (ranges, source text, written forms).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { toSourceRange } from '../../src/query/source-range.js';
import type { ViewPredicateItem, ViewRuleInfo } from '../../src/query/types.js';
import { ViewIndex } from '../../src/query/view-index.js';
import { buildViewRules } from '../../src/query/view-query.js';
import { ViewReferenceResolver } from '../../src/query/view-resolver.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import {
  buildLikeC4Model,
  expectRulesAgreeWithLikeC4,
  expectValidLikeC4,
  linkedViewReferences,
  parsedViews,
  type ReportedViewRules,
} from '../helpers/likec4-model.js';

const FIXTURES = ['views-catalog', 'views-flows'] as const;

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

/** The library's rules of every view declaration of `files`, in the shape the comparison reads. */
function libraryRules(files: Record<string, string>): Array<ReportedViewRules & { rules: ViewRuleInfo[] }> {
  const parser = new C4Parser();
  const documents = Object.entries(files).map(([file, source]) => ({ file, ast: parser.parse(source).ast }));
  const views = new ViewIndex(documents);
  const resolver = new ViewReferenceResolver(new WorkspaceIndex(documents), new DeploymentIndex(documents), views);
  return views.declarations().map((view) => ({
    id: view.id ?? null,
    type: view.type,
    file: view.file!,
    sourceRange: toSourceRange(view.node.$cstNode),
    inModel: view.body !== undefined,
    rules: buildViewRules(view, resolver),
  }));
}

/** The library's rules of the view `id`. */
function rulesOf(files: Record<string, string>, id: string): ViewRuleInfo[] {
  const view = libraryRules(files).find((v) => v.id === id);
  expect(view, id).toBeDefined();
  return view!.rules;
}

/** `{ offset, end, line, column }` of `text`, found in `source` at or after `from`. */
function rangeOf(source: string, text: string, from = 0): { offset: number; end: number; line: number; column: number } {
  const offset = source.indexOf(text, from);
  expect(offset, text).toBeGreaterThanOrEqual(0);
  const before = source.slice(0, offset);
  const line = before.split('\n').length - 1;
  return { offset, end: offset + text.length, line, column: offset - (before.lastIndexOf('\n') + 1) };
}

/** LikeC4's diagnostics of `files` at `<file>:<line>` (1-based). */
async function diagnosticsAt(files: Record<string, string>, at: string): Promise<string[]> {
  const { diagnostics } = await buildLikeC4Model(files);
  return diagnostics.filter((d) => d.startsWith(`${at}: `)).map((d) => d.slice(at.length + 2));
}

describe('rules equal LikeC4 parsed rules (row 10)', () => {
  it('on both fixtures, every rule equals LikeC4\'s parsed rules', async () => {
    // P: both fixtures are valid and together hold every predicate form and rule kind.
    const parsed: string[] = [];
    const written: string[] = [];
    for (const fixture of FIXTURES) {
      const files = readWorkspace(fixture);
      await expectValidLikeC4(files);
      const views = await parsedViews(files);
      expect(views.length).toBeGreaterThan(0);
      parsed.push(...views.map((v) => JSON.stringify(v.view.rules.slice(v.prepended.length))));
      written.push(...Object.values(files));
    }
    const lc4 = parsed.join('\n');
    const text = written.join('\n');
    const forms: Array<[string, boolean]> = [
      ['wildcard', lc4.includes('{"wildcard":true}')],
      ['reference', lc4.includes('{"ref":{"model"')],
      ['selector .*', lc4.includes('"selector":"children"')],
      ['selector .**', lc4.includes('"selector":"descendants"')],
      ['selector ._', lc4.includes('"selector":"expanded"')],
      ['element.kind =', lc4.includes('"isEqual":true') && lc4.includes('"elementKind"')],
      ['element.kind !=', /"elementKind":"[^"]+","isEqual":false/.test(lc4)],
      ['element.tag =', /"elementTag":"[^"]+","isEqual":true/.test(lc4)],
      ['element.tag !=', /"elementTag":"[^"]+","isEqual":false/.test(lc4)],
      ['direct', lc4.includes('"source":') && lc4.includes('"isBidirectional":false')],
      ['bidirectional', lc4.includes('"isBidirectional":true')],
      ['incoming', lc4.includes('"incoming"')],
      ['outgoing', lc4.includes('"outgoing"')],
      ['in-out', lc4.includes('"inout"')],
      ['relationship kind (bracket)', /-\[\w+\]->/.test(text)],
      ['relationship kind (dot)', /\w \.\w+ \w/.test(text)],
      ['element with', lc4.includes('"custom":')],
      ['relation with', lc4.includes('"customRelation":')],
      ['navigateTo', lc4.includes('"navigateTo"')],
      ['custom color', /"custom":\{"expr":.*?"color":"(brand|accent)"/.test(lc4)],
      ['library icon', lc4.includes('"icon":"tech:')],
      ['where and / or / not', lc4.includes('"and":') && lc4.includes('"or":') && lc4.includes('"not":')],
      ['where tag', lc4.includes('{"tag":{"eq"')],
      ['where kind', lc4.includes('{"kind":{"eq"')],
      ['where metadata key', /"metadata":\{"key":"[^"]+"\}/.test(lc4)],
      ['where metadata value', /"metadata":\{"key":"[^"]+","value"/.test(lc4)],
      ['where participant', lc4.includes('"participant":"source"') && lc4.includes('"participant":"target"')],
      ['operator =', / (tag|kind) = /.test(text)],
      ['operator !=', / (tag|kind) != /.test(text)],
      ['operator is', / (tag|kind) is #?\w/.test(text)],
      ['operator is not', / is not /.test(text)],
      ['autoLayout spacing', lc4.includes('"rankSep"') && lc4.includes('"nodeSep"')],
      ['style', lc4.includes('"style":{')],
      ['group', lc4.includes('"groupRules"')],
      ['rank', lc4.includes('"rank":')],
      ['global predicate', lc4.includes('"predicateId"')],
      ['global style', lc4.includes('"styleId"')],
      ['includeAncestors', lc4.includes('"includeAncestors"')],
    ];
    expect(forms.filter(([, present]) => !present).map(([form]) => form)).toEqual([]);

    for (const fixture of FIXTURES) {
      const files = readWorkspace(fixture);
      const views = libraryRules(files);
      expect(views.some((v) => v.rules.length > 0), fixture).toBe(true);
      await expectRulesAgreeWithLikeC4(views, files);
    }
  });
});

describe('source-only rule fields (row 11)', () => {
  const catalog = readWorkspace('views-catalog');
  const flows = readWorkspace('views-flows');

  it('index, text and range of each rule; both autoLayout rules are listed', () => {
    const source = catalog['views.c4']!;
    const view = source.indexOf('view landscape {');
    const expected = ['include *', 'exclude partner', 'autoLayout LeftRight', 'autoLayout TopBottom 120 60'];
    const rules = rulesOf(catalog, 'landscape');
    expect(rules.map((r) => r.kind)).toEqual(['include', 'exclude', 'autoLayout', 'autoLayout']);
    expect(rules.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(rules.map((r) => r.text)).toEqual(expected);
    expect(rules.map((r) => r.sourceRange)).toEqual(expected.map((text) => rangeOf(source, text, view)));
    expect(rules.map((r) => source.slice(r.sourceRange.offset, r.sourceRange.end))).toEqual(expected);
    expect(rules.slice(2).map((r) => r.autoLayout)).toEqual([
      { direction: 'LeftRight' },
      { direction: 'TopBottom', rankSep: 120, nodeSep: 60 },
    ]);
  });

  it('opaque stage-6 kinds are named', () => {
    const shop = rulesOf(catalog, 'shopView');
    expect(shop.slice(-5).map((r) => [r.kind, r.text.split(/\s*\{/)[0]])).toEqual([
      ['style', 'style shop.orders'],
      ['group', "group 'Core'"],
      ['rank', 'rank same'],
      ['globalPredicate', 'global predicate coreServices'],
      ['globalStyle', 'global style faded'],
    ]);
    expect(rulesOf(catalog, 'runtime').map((r) => r.kind)).toEqual(['include', 'exclude', 'exclude', 'style', 'includeAncestors', 'autoLayout']);
  });

  it('a dynamic view whose rules and steps interleave lists only its rules', () => {
    const source = flows['flows.c4']!;
    const view = source.indexOf('dynamic view checkout {');
    const starts = [
      'include visitor',
      'include portal.gateway with {',
      'autoLayout LeftRight',
      'style portal.web {',
      'global predicate frontDoor',
      'global style highlight',
      'include portal.worker with {',
      'autoLayout TopBottom',
    ];
    const rules = rulesOf(flows, 'checkout');
    expect(rules.map((r) => r.index)).toEqual(starts.map((_, i) => i));
    expect(rules.map((r) => r.kind)).toEqual(['include', 'include', 'autoLayout', 'style', 'globalPredicate', 'globalStyle', 'include', 'autoLayout']);
    expect(rules.map((r) => r.sourceRange.offset)).toEqual(starts.map((text) => rangeOf(source, text, view).offset));
    for (const rule of rules) expect(source.slice(rule.sourceRange.offset, rule.sourceRange.end)).toBe(rule.text);
    // A step is never a rule: no rule text starts with a step written between them.
    expect(rules.some((r) => /->|<-/.test(r.text.split('\n')[0]!) && r.kind !== 'include')).toBe(false);
  });
});

describe('block-level styles are not the view\'s rules (row 12)', () => {
  it.each([
    { fixture: 'views-catalog', id: 'operations', first: 'include shop.**' },
    { fixture: 'views-flows', id: 'landing', first: 'include *' },
  ])('$fixture: $id', async ({ fixture, id, first }) => {
    const files = readWorkspace(fixture);
    // OP: LikeC4's parsed rules of the view start with the block's style rule.
    const entry = (await parsedViews(files)).find((p) => p.view.id === id)!;
    expect(entry.prepended.length).toBeGreaterThan(0);
    expect(entry.view.rules.slice(0, entry.prepended.length)).toEqual(entry.prepended);
    expect(JSON.stringify(entry.prepended[0])).toContain('"style"');
    const rules = rulesOf(files, id);
    expect(rules[0]!.index).toBe(0);
    expect(rules[0]!.text).toBe(first);
    expect(rules.some((r) => r.kind === 'style')).toBe(false);
  });
});

const SPEC = `specification {
  element system
  element container
  deploymentNode env
  deploymentNode vm
  relationship async
}
`;

const MODEL = `model {
  ext = system 'External'
  app = system 'App' {
    web = container 'Web'
    api = container 'API'
    db = container 'DB'
  }
  app.web -> app.api 'calls'
  app.api -[async]-> ext 'notifies'
}
`;

describe('trailing comma (row 13)', () => {
  it('`include a, b,` reads two items, the rule text keeps the comma', async () => {
    const source = `${SPEC}${MODEL}views {\n  view v {\n    include app.web, app.api,\n  }\n}\n`;
    const files = { 'a.c4': source };
    // OP: LikeC4's parsed include has two items.
    const entry = (await parsedViews(files)).find((p) => p.view.id === 'v')!;
    expect(entry.view.rules).toEqual([{ include: [{ ref: { model: 'app.web' } }, { ref: { model: 'app.api' } }] }]);
    const [rule] = rulesOf(files, 'v');
    expect(rule!.text).toBe('include app.web, app.api,');
    expect(rule!.items!.map((i) => i.text)).toEqual(['app.web', 'app.api']);
    const ruleStart = source.indexOf('include app.web');
    expect(rule!.items!.map((i) => i.sourceRange)).toEqual([rangeOf(source, 'app.web', ruleStart), rangeOf(source, 'app.api', ruleStart)]);
  });
});

describe('D34 constructs are reported as written (row 14)', () => {
  const dynamic = (include: string) => ({
    'a.c4': `${SPEC}${MODEL}views {\n  dynamic view d {\n    app.web -> app.api\n    include ${include}\n  }\n}\n`,
  });

  it('a relation predicate in a dynamic include', async () => {
    const files = dynamic('app.web -> app.api');
    // OP: LikeC4's parsed include omits the item.
    const entry = (await parsedViews(files)).find((p) => p.view.id === 'd')!;
    expect(entry.view.rules).toEqual([{ include: [] }]);
    const [rule] = rulesOf(files, 'd');
    expect(rule!.items!.map((i) => i.expression)).toEqual([
      {
        type: 'direct',
        source: { type: 'element', ref: { text: 'app.web', target: 'app.web' } },
        target: { type: 'element', ref: { text: 'app.api', target: 'app.api' } },
        bidirectional: false,
      },
    ]);
  });

  it.each([
    { name: '`* with { … }`', include: '* with { color red }', expression: { type: 'wildcard' } },
    {
      name: '`element.kind = k with { … }`',
      include: 'element.kind = container with { color red }',
      expression: { type: 'elementKind', operator: '=', kind: 'container' },
    },
  ])('$name in a dynamic include', async ({ include, expression }) => {
    const files = dynamic(include);
    // OP: LikeC4 ignores the item in a dynamic view (it parses it, then warns
    // and leaves it out of the computed view).
    const line = files['a.c4'].split('\n').findIndex((l) => l.includes(`include ${include}`)) + 1;
    expect(await diagnosticsAt(files, `a.c4:${line}`)).toContain('Predicate is ignored, as not supported in dynamic views');
    const [rule] = rulesOf(files, 'd');
    expect(rule!.items).toHaveLength(1);
    expect(rule!.items![0]!.expression).toEqual(expression);
    expect(rule!.items![0]!.with).toEqual({ style: { color: 'red' } });
  });
});

describe('the rule reader uses the view resolver (row 15)', () => {
  const OTHER_API = `model {\n  ops = system 'Ops' {\n    api = container 'Ops API'\n  }\n}\n`;
  const DEPLOYMENT = `deployment {\n  env prod {\n    vm vm1 {\n      instanceOf app.api\n    }\n  }\n}\n`;
  const files = (views: string, extra = '') => ({ 'a.c4': `${SPEC}${MODEL}${extra}views {\n${views}\n}\n` });
  /** The first predicate item of the first rule of `id`. */
  const firstItem = (input: Record<string, string>, id: string): ViewPredicateItem => rulesOf(input, id)[0]!.items![0]!;

  it('`include api` under `view of app`, ambiguous in the document → app.api', async () => {
    const input = files('view v of app {\n include api\n}', OTHER_API);
    const linked = (await linkedViewReferences(input)).find((r) => r.role === 'rule' && r.text === 'api')!;
    expect(linked.target).toEqual({ model: 'app.api' });
    expect(firstItem(input, 'v').expression).toEqual({ type: 'element', ref: { text: 'api', target: 'app.api' } });
  });

  it('the same text in a view without `of` → unresolved', async () => {
    const input = files('view v {\n include api\n}', OTHER_API);
    const linked = (await linkedViewReferences(input)).find((r) => r.role === 'rule' && r.text === 'api')!;
    expect(linked.target).toBeNull();
    expect(firstItem(input, 'v').expression).toEqual({ type: 'element', ref: { text: 'api', target: null } });
  });

  it('a deployment view: a node and an instance in the LinkedTarget shape', async () => {
    const input = files('deployment view v {\n include prod.vm1, prod.vm1.api\n}', DEPLOYMENT);
    const linked = (await linkedViewReferences(input)).filter((r) => r.role === 'rule').map((r) => r.target);
    expect(linked).toEqual([{ deployment: 'prod.vm1' }, { deployment: 'prod.vm1.api' }]);
    expect(rulesOf(input, 'v')[0]!.items!.map((i) => i.expression)).toEqual([
      { type: 'element', ref: { text: 'prod.vm1', target: { deployment: 'prod.vm1' } } },
      { type: 'element', ref: { text: 'prod.vm1.api', target: { deployment: 'prod.vm1.api' } } },
    ]);
  });

  it('a relation `with { navigateTo }` to an element view → unresolved', async () => {
    const input = files('view t {\n include *\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}');
    const linked = (await linkedViewReferences(input)).find((r) => r.role === 'relationWithNavigateTo')!;
    expect(linked.target).toBeNull();
    expect(firstItem(input, 'v').with).toEqual({ navigateTo: { text: 't', target: null } });
  });
});
