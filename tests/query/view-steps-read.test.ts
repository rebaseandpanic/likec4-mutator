/**
 * The step statements of dynamic views (US-4), read by the step builder of
 * `src/query/view-query.ts`.
 *
 * Expected values come from LikeC4 1.60.0's own parse and computed views of
 * the same files (`parsedViews`, `computedViews`, compared through
 * `expectStepsAgreeWithLikeC4`), its linker (`linkedViewReferences`), its
 * diagnostics, and from the input text itself (paths, ranges, written
 * arrows and keywords).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { toSourceRange } from '../../src/query/source-range.js';
import type { ViewRuleInfo, ViewStepInfo, ViewStepStatementInfo } from '../../src/query/types.js';
import { ViewIndex } from '../../src/query/view-index.js';
import { buildViewRules, buildViewSteps } from '../../src/query/view-query.js';
import { ViewReferenceResolver } from '../../src/query/view-resolver.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import {
  buildLikeC4Model,
  computedViews,
  expectStepsAgreeWithLikeC4,
  expectValidLikeC4,
  linkedViewReferences,
  parsedViews,
  type ReportedViewSteps,
} from '../helpers/likec4-model.js';

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

/** The library's steps (and rules) of every view declaration of `files`. */
function libraryViews(files: Record<string, string>): Array<Omit<ReportedViewSteps, 'steps'> & { steps: ViewStepStatementInfo[]; rules: ViewRuleInfo[] }> {
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
    steps: buildViewSteps(view, resolver),
    rules: buildViewRules(view, resolver),
  }));
}

/** The library's step statements of the view `id`. */
function stepsOf(files: Record<string, string>, id: string): ViewStepStatementInfo[] {
  const view = libraryViews(files).find((v) => v.id === id);
  expect(view, id).toBeDefined();
  return view!.steps;
}

/** The step of a single-step statement. */
function single(statement: ViewStepStatementInfo | undefined): ViewStepInfo {
  expect(statement?.type).toBe('step');
  return (statement as Extract<ViewStepStatementInfo, { type: 'step' }>).step;
}

const SPEC = `specification {
  element system
  element container
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

/** One document with a dynamic view `d` whose body is `body`. */
const dynamic = (body: string, extraViews = '') => ({
  'a.c4': `${SPEC}${MODEL}views {\n${extraViews}  dynamic view d {\n${body}\n  }\n}\n`,
});

describe('steps equal LikeC4 parsed steps (row 16)', () => {
  it('on both fixtures, every step equals LikeC4\'s parsed steps and sequence', async () => {
    const fixtures = ['views-catalog', 'views-flows'].map((name) => ({ name, files: readWorkspace(name) }));
    // P: both fixtures are valid and parse dynamic views with steps; together
    // they hold every step form (the flows fixture's checkout view).
    const json: string[] = [];
    const sources: string[] = [];
    for (const { name, files } of fixtures) {
      await expectValidLikeC4(files);
      const parsed = (await parsedViews(files)).filter((p) => p.view._type === 'dynamic');
      expect(parsed.some((p) => (p.view.steps ?? []).length > 0), name).toBe(true);
      json.push(...parsed.map((p) => JSON.stringify(p.view.steps)));
      sources.push(...Object.values(files));
    }
    const steps = json.join('\n');
    const source = sources.join('\n');
    const forms: Array<[string, boolean]> = [
      ['->', / -> /.test(source)],
      ['<-', steps.includes('"isBackward":true') && / <- /.test(source)],
      ['-[k]->', /-\[\w+\]->/.test(source)],
      ['.k', /\w \.\w+ \w/.test(source)],
      ['chain', steps.includes('"_type":"series"')],
      ['returning chain', /"_type":"series","steps":\[[^\]]*"isBackward":true/.test(steps)],
      ['body with every property', ['title', 'description', 'technology', 'notes', 'notation', 'navigateTo', 'color', 'line', 'head', 'tail'].every((k) => steps.includes(`"${k}":`))],
      ['par', steps.includes('"_type":"par"')],
      ['parallel', /parallel '/.test(source)],
      ['stage-6 blocks with steps', ['opt', 'loop', 'alt', 'try', 'break'].every((k) => steps.includes(`"_type":"${k}"`))],
    ];
    expect(forms.filter(([, present]) => !present).map(([form]) => form)).toEqual([]);

    for (const { files } of fixtures) {
      await expectStepsAgreeWithLikeC4(libraryViews(files), files);
    }
  });
});

describe('D36: backward step and returning chain (row 17)', () => {
  it('`a <- b` and the returning segment of `a -> b -> a`', async () => {
    const files = dynamic('    app.web <- app.api\n    app.web -> app.api -> app.web');
    // OP: LikeC4's parsed steps carry isBackward with LikeC4's endpoints.
    const steps = (await parsedViews(files)).find((p) => p.view.id === 'd')!.view.steps;
    expect(steps).toEqual([
      expect.objectContaining({ source: 'app.api', target: 'app.web', isBackward: true }),
      {
        _type: 'series',
        steps: [
          expect.objectContaining({ source: 'app.web', target: 'app.api' }),
          expect.objectContaining({ source: 'app.api', target: 'app.web', isBackward: true }),
        ],
      },
    ]);
    const [backward, chain] = stepsOf(files, 'd');
    expect(single(backward)).toMatchObject({
      source: { text: 'app.api', target: 'app.api' },
      target: { text: 'app.web', target: 'app.web' },
      direction: 'backward',
      arrow: '<-',
    });
    expect(chain!.type).toBe('chain');
    const segments = (chain as Extract<ViewStepStatementInfo, { type: 'chain' }>).segments;
    expect(segments.map((s) => [s.source.target, s.target.target, s.direction, s.arrow])).toEqual([
      ['app.web', 'app.api', 'forward', '->'],
      ['app.api', 'app.web', 'backward', '->'],
    ]);
  });
});

describe('addresses and source-only step fields (row 18)', () => {
  const files = readWorkspace('views-flows');
  const source = files['flows.c4']!;
  const statements = stepsOf(files, 'checkout');

  it('top-level paths, statement texts and ranges', () => {
    expect(statements.map((s) => s.path)).toEqual(statements.map((_, i) => [i]));
    for (const statement of statements) {
      expect(source.slice(statement.sourceRange.offset, statement.sourceRange.end)).toBe(statement.text);
    }
    expect(statements.map((s) => s.type)).toEqual([
      'step', 'step', 'step', 'step', 'chain', 'chain', 'step', 'parallel', 'parallel', 'parallel', 'parallel',
      'opaque', 'opaque', 'opaque', 'opaque', 'opaque',
    ]);
  });

  it('`par` and `parallel` keep their keyword and [i, j] paths', () => {
    const blocks = statements.filter((s): s is Extract<ViewStepStatementInfo, { type: 'parallel' }> => s.type === 'parallel');
    expect(blocks.map((b) => b.keyword)).toEqual(['par', 'parallel', 'par', 'par']);
    expect(blocks[1]!.title).toBe('Fan-out');
    expect(blocks[1]!.statements.map((s) => [s.path, s.type])).toEqual([
      [[8, 0], 'step'],
      [[8, 1], 'chain'],
    ]);
  });

  it('chain segments: numbers and adjacent, non-overlapping ranges', () => {
    const chain = statements[5] as Extract<ViewStepStatementInfo, { type: 'chain' }>;
    expect(chain.text).toBe("portal.gateway -> portal.worker -> portal.gateway 'answers'");
    expect(chain.segments.map((s) => s.segment)).toEqual([0, 1]);
    expect(chain.segments.map((s) => s.text)).toEqual(['portal.gateway -> portal.worker', " -> portal.gateway 'answers'"]);
    expect(chain.segments[0]!.sourceRange.offset).toBe(chain.sourceRange.offset);
    expect(chain.segments[1]!.sourceRange.offset).toBe(chain.segments[0]!.sourceRange.end);
    expect(chain.segments[1]!.sourceRange.end).toBe(chain.sourceRange.end);
    for (const segment of chain.segments) {
      expect(source.slice(segment.sourceRange.offset, segment.sourceRange.end)).toBe(segment.text);
    }
  });

  it('arrow and kind form', () => {
    expect(statements.slice(0, 4).map((s) => [single(s).arrow, single(s).kind?.form])).toEqual([
      ['->', undefined],
      ['<-', undefined],
      ['-[call]->', 'bracket'],
      ['.publish', 'dot'],
    ]);
  });

  it('stage-6 blocks are opaque, with keyword and text, without addressable inner paths', () => {
    const opaque = statements.filter((s): s is Extract<ViewStepStatementInfo, { type: 'opaque' }> => s.type === 'opaque');
    expect(opaque.map((s) => s.keyword)).toEqual(['opt', 'loop', 'alt', 'try', 'break']);
    expect(opaque.map((s) => s.text.split(/\s*\{/)[0])).toEqual(["opt 'Optional'", 'loop', "alt 'Outcome'", 'try', "break 'Stop'"]);
    expect(opaque.every((s) => !('statements' in s))).toBe(true);
  });
});

describe('`inModel` of `par` blocks (row 19)', () => {
  it('from the fixture: `par { }` and `par { opt { } }` read false and are absent from LikeC4', async () => {
    const files = readWorkspace('views-flows');
    const blocks = stepsOf(files, 'checkout').filter((s): s is Extract<ViewStepStatementInfo, { type: 'parallel' }> => s.type === 'parallel');
    expect(blocks.map((b) => [b.text.replace(/\s+/g, ' '), b.inModel])).toEqual([
      ['par { portal.gateway -> portal.jobs portal.gateway -> mailer }', true],
      ["parallel 'Fan-out' { portal.jobs -> portal.worker portal.worker -> mailer -> portal.worker }", true],
      ['par { }', false],
      ['par { opt { } }', false],
    ]);
    // OP: LikeC4 parses two `par` blocks of the four.
    const steps = (await parsedViews(files)).find((p) => p.view.id === 'checkout')!.view.steps as Array<{ _type?: string }>;
    expect(steps.filter((s) => s._type === 'par')).toHaveLength(2);
  });

  // Inline, LikeC4-invalid inputs (read only).  LikeC4 keeps a parent-child
  // step in its parse despite its validation error (decision D49), so a
  // block holding one contributes.
  it.each([
    { name: 'only a stray `if { … }`', block: 'par { if { app.web -> app.api } }', inModel: false },
    { name: 'only a parent-child step', block: 'par { app -> app.api }', inModel: true },
    { name: 'only a chain after a backward step', block: 'par { app.web <- app.api -> ext }', inModel: false },
    { name: '`a -> b` and an empty `opt { }`', block: 'par { app.web -> app.api\n      opt { } }', inModel: true },
  ])('$name', async ({ block, inModel }) => {
    const files = dynamic(`    ${block}`);
    const [statement] = stepsOf(files, 'd');
    expect(statement).toMatchObject({ type: 'parallel', inModel });
    // OP: the block is present in LikeC4's parsed steps exactly when it is in the model.
    const steps = (await parsedViews(files)).find((p) => p.view.id === 'd')!.view.steps as Array<{ _type?: string }>;
    expect(steps.filter((s) => s._type === 'par')).toHaveLength(inModel ? 1 : 0);
  });
});

describe('interleaved rules and steps (row 20)', () => {
  it('steps have paths [0] [1] [2], rules have indices 0 1, the sequence is LikeC4\'s', async () => {
    const files = dynamic('    app.web -> app.api\n    include ext\n    app.api -> app.db\n    autoLayout LeftRight\n    app.api -> ext');
    const view = libraryViews(files).find((v) => v.id === 'd')!;
    expect(view.steps.map((s) => s.path)).toEqual([[0], [1], [2]]);
    expect(view.rules.map((r) => [r.index, r.kind])).toEqual([
      [0, 'include'],
      [1, 'autoLayout'],
    ]);
    const computed = (await computedViews(files))['d']!.steps.map((s) => [s.step, s.source, s.target]);
    expect(view.steps.map((s) => [single(s).sequence?.step, single(s).source.target, single(s).target.target])).toEqual(computed);
    await expectStepsAgreeWithLikeC4([view], files);
  });
});

describe('the step reader uses the view resolver (row 21)', () => {
  const OTHER_API = `model {\n  ops = system 'Ops' {\n    api = container 'Ops API'\n  }\n}\n`;

  it('endpoints resolve in the document scope', async () => {
    const files = dynamic('    web -> db');
    const linked = (await linkedViewReferences(files)).filter((r) => r.role === 'step').map((r) => r.target);
    expect(linked).toEqual([{ model: 'app.web' }, { model: 'app.db' }]);
    const step = single(stepsOf(files, 'd')[0]);
    expect([step.source, step.target]).toEqual([
      { text: 'web', target: 'app.web' },
      { text: 'db', target: 'app.db' },
    ]);
  });

  it('an ambiguous endpoint is unresolved, and LikeC4 drops the step', async () => {
    const files = { 'a.c4': dynamic('    api -> app.db')['a.c4']!.replace('views {', `${OTHER_API}views {`) };
    const linked = (await linkedViewReferences(files)).filter((r) => r.role === 'step').map((r) => r.target);
    expect(linked).toEqual([null, { model: 'app.db' }]);
    const step = single(stepsOf(files, 'd')[0]);
    expect(step.source).toEqual({ text: 'api', target: null });
    expect(step.sequence).toBeUndefined();
  });

  it('an endpoint declared only in another file is unresolved', async () => {
    const files = {
      'a.c4': `${SPEC}${MODEL}`,
      'v.c4': 'views {\n  dynamic view d {\n    web -> app.db\n  }\n}\n',
    };
    const linked = (await linkedViewReferences(files)).filter((r) => r.role === 'step').map((r) => r.target);
    expect(linked).toEqual([null, { model: 'app.db' }]);
    expect(single(stepsOf(files, 'd')[0]).source).toEqual({ text: 'web', target: null });
  });

  it('a step `navigateTo` to an element view is unresolved', async () => {
    const files = dynamic('    app.web -> app.api {\n      navigateTo t\n    }', '  view t {\n    include *\n  }\n');
    const linked = (await linkedViewReferences(files)).find((r) => r.role === 'stepNavigateTo')!;
    expect(linked.target).toBeNull();
    expect(single(stepsOf(files, 'd')[0]).body?.navigateTo).toEqual({ text: 't', target: null });
  });
});

describe('`inModel` of `par` blocks: `try` and `alt` (row 95)', () => {
  /** Diagnostics of `files` at the line of the first `par` (1-based). */
  const diagnosticsOfBlock = async (files: Record<string, string>) => {
    const line = files['a.c4']!.split('\n').findIndex((l) => l.includes('par {')) + 1;
    const { diagnostics } = await buildLikeC4Model(files);
    return diagnostics.filter((d) => d.startsWith(`a.c4:${line}:`));
  };

  it.each([
    { name: 'try: the `try` part contributes', block: 'par { try { app.web -> app.api } catch { } }', inModel: true, id: 'try.01' },
    { name: 'try: only `catch` contributes', block: 'par { try { } catch { app.web -> app.api } }', inModel: false, id: '' },
    { name: 'try: only `finally` contributes', block: 'par { try { } finally { app.web -> app.api } }', inModel: false, id: '' },
    { name: 'alt: the `if` branch contributes', block: 'par { alt { if { app.web -> app.api } } }', inModel: true, id: 'alt.01' },
    { name: 'alt: only the `else` branch contributes', block: 'par { alt { if { } else { app.web -> app.api } } }', inModel: true, id: 'alt.01' },
    { name: 'alt: no branch contributes', block: 'par { alt { if { } else { } } }', inModel: false, id: '' },
  ])('$name', async ({ block, inModel, id }) => {
    const files = dynamic(`    ${block}\n    app.api -> app.db`);
    const statements = stepsOf(files, 'd');
    expect(statements[0]).toMatchObject({ type: 'parallel', inModel });
    // OP: a block that contributes no step is absent from LikeC4's parse, without a diagnostic;
    // one that contributes is present, its step id under `try.01` / `alt.01`.
    const steps = (await parsedViews(files)).find((p) => p.view.id === 'd')!.view.steps as Array<{ _type?: string }>;
    expect(steps.filter((s) => s._type === 'par')).toHaveLength(inModel ? 1 : 0);
    if (inModel) {
      expect((await computedViews(files))['d']!.steps.some((s) => s.id.startsWith(`step-01:par.01:${id}`))).toBe(true);
    } else {
      expect(await diagnosticsOfBlock(files)).toEqual([]);
    }
    // The sequence of the surrounding step follows LikeC4's numbering.
    await expectStepsAgreeWithLikeC4(libraryViews(files), files);
  });

  it.each([
    { name: 'a top-level `try { } catch { a -> b }`', block: 'try { } catch { app.web -> app.api }' },
    { name: 'a top-level `alt { if { } }`', block: 'alt { if { } }' },
  ])('$name contributes no step, in LikeC4 either', async ({ block }) => {
    const files = dynamic(`    ${block}\n    app.api -> app.db`);
    expect(stepsOf(files, 'd')[0]).toMatchObject({ type: 'opaque', inModel: false });
    const steps = (await parsedViews(files)).find((p) => p.view.id === 'd')!.view.steps as Array<{ _type?: string }>;
    expect(steps.map((s) => s._type ?? 'step')).toEqual(['step']);
    await expectStepsAgreeWithLikeC4(libraryViews(files), files);
  });
});
