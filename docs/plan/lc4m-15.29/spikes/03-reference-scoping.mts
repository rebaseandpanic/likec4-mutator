/**
 * Spike 03 (S3): which written references resolve inside views, per LikeC4's
 * own linker and validator.  Each case is the shared SPEC+MODEL plus one
 * `views { }` block; prints LikeC4 diagnostics (every severity) and, where
 * useful, the computed node ids of view `v` (to show what a name resolved to).
 * Line numbers: SPEC+MODEL take lines 1-34, `views {` is line 35, the case
 * body starts at line 36.  Cases marked AMBIG append (after the views block)
 * a second model block declaring `other.api`, so the bare name `api` is no
 * longer unique in the project.  Cases marked XFILE put the views block in a
 * second file `v.c4` (line 1 = `views {`, body from line 2).
 */
import { build, SPEC, MODEL } from './_lc4.mts';

const cases: Array<[string, string]> = [
  // (a) element view without `of`
  ['a1 no-of include api', `view v {\n include api\n}`],
  ['a2 no-of include app.api', `view v {\n include app.api\n}`],
  ['a3 no-of include nope', `view v {\n include nope\n}`],
  // (b) view of app
  ['a4 AMBIG no-of include api', `view v {\n include api\n}`],
  ['a5 XFILE no-of include api', `view v {\n include api\n}`],
  ['a6 XFILE no-of include app.api', `view v {\n include app.api\n}`],
  ['b1 of-app include api', `view v of app {\n include api\n}`],
  ['b1b AMBIG of-app include api', `view v of app {\n include api\n}`],
  ['b2 of-app include *', `view v of app {\n include *\n}`],
  ['b3 of-app include -> api', `view v of app {\n include -> api\n}`],
  ['b4 of-app include web -> api', `view v of app {\n include web -> api\n}`],
  ['b5 of-app include user (top-level, global)', `view v of app {\n include user\n}`],
  ['b6 of-app style api', `view v of app {\n include *\n style api { color red }\n}`],
  ['b7 of api (relative viewOf)', `view v of api {\n include *\n}`],
  // (c) extends
  ['c1 extends of-app parent, include api', `view p of app {\n include *\n}\nview v extends p {\n include api\n}`],
  ['c1b AMBIG extends of-app parent, include api', `view p of app {\n include ext\n}\nview v extends p {\n include api\n}`],
  ['c2 extends no-of parent, include api', `view p {\n include *\n}\nview v extends p {\n include api\n}`],
  // (d) dynamic views
  ['d1 dynamic relative step api -> db', `dynamic view v {\n api -> db\n}`],
  ['d1b AMBIG dynamic relative step api -> db', `dynamic view v {\n api -> db\n}`],
  ['d1c XFILE dynamic relative step api -> db', `dynamic view v {\n api -> db\n}`],
  ['d2 dynamic FQN step', `dynamic view v {\n app.api -> app.db\n}`],
  ['d3 dynamic include api', `dynamic view v {\n app.api -> app.db\n include api\n}`],
  ['d4 dynamic view of app (syntax)', `dynamic view v of app {\n app.api -> app.db\n}`],
  // (e) navigateTo
  ['e1 with navigateTo element view', `view t {\n include *\n}\nview v {\n include app.api with { navigateTo t }\n}`],
  ['e2 with navigateTo dynamic view', `dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.api with { navigateTo t }\n}`],
  ['e3 with navigateTo deployment view', `deployment view t {\n include prod.**\n}\nview v {\n include app.api with { navigateTo t }\n}`],
  ['e4 with navigateTo unknown', `view v {\n include app.api with { navigateTo nope }\n}`],
  ['e5 relation with navigateTo element view', `view t {\n include *\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}`],
  ['e6 relation with navigateTo dynamic view', `dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}`],
  ['e7 step navigateTo dynamic view', `dynamic view t {\n app.api -> app.db\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}`],
  ['e8 step navigateTo element view', `view t {\n include *\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}`],
  ['e9 step navigateTo deployment view', `deployment view t {\n include prod.**\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}`],
  ['e10 step navigateTo unknown', `dynamic view v {\n app.web -> app.api { navigateTo nope }\n}`],
  // (f) extends targets
  ['f1 extends dynamic view', `dynamic view t {\n app.api -> app.db\n}\nview v extends t {\n include *\n}`],
  ['f2 extends deployment view', `deployment view t {\n include prod.**\n}\nview v extends t {\n include *\n}`],
  ['f3 extends unknown', `view v extends nope {\n include *\n}`],
  // (g) undeclared kinds / tags
  ['g1 step -[nope]->', `dynamic view v {\n app.api -[nope]-> ext\n}`],
  ['g2 step .nope', `dynamic view v {\n app.api .nope ext\n}`],
  ['g3 predicate -[nope]->', `view v {\n include app.api -[nope]-> ext\n}`],
  ['g4 where tag is #nope', `view v {\n include app.* where tag is #nope\n}`],
  ['g5 element.tag = #nope', `view v {\n include element.tag = #nope\n}`],
  ['g6 where kind is nope', `view v {\n include app.* where kind is nope\n}`],
  ['g7 element.kind = nope', `view v {\n include element.kind = nope\n}`],
  ['g8 view tag #nope', `view v {\n #nope\n include *\n}`],
  // (h) deployment views
  ['h1 deployment include model ref app.api', `deployment view v {\n include app.api\n}`],
  ['h2 deployment include prod.vm1.api', `deployment view v {\n include prod.vm1.api\n}`],
  ['h3 deployment include relation of model refs', `deployment view v {\n include prod.**\n include app.api -> app.db\n}`],
  ['h4 deployment exclude relation of model refs', `deployment view v {\n include prod.**\n exclude app.api -> app.db\n}`],
  ['h5 deployment include relative vm1', `deployment view v {\n include vm1\n}`],
];

for (const [label, body] of cases) {
  const views = `views {\n${body}\n}\n`;
  const extra = label.includes('AMBIG') ? `model {\n  other = system {\n    api = container\n  }\n}\n` : '';
  const r = label.includes('XFILE')
    ? await build({ 'a.c4': SPEC + MODEL, 'v.c4': views })
    : await build({ 'a.c4': SPEC + MODEL + views + extra });
  const v = r.model.$data.views.v;
  const nodes = v ? (v.nodes ?? []).map((n: any) => n.id) : 'NO VIEW v';
  console.log(`# ${label}`);
  console.log(`  body: ${JSON.stringify(body)}`);
  console.log(`  diagnostics: ${JSON.stringify(r.diagnostics)}`);
  console.log(`  computed v nodes: ${JSON.stringify(nodes)}`);
}
