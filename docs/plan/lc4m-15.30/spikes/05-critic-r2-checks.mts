/**
 * Spike 05 for lc4m-15.30: LikeC4 1.59.4 behaviour behind spec critique round 2
 * findings (empty rank and style targets, parallel and break blocks,
 * exclude-only views, empty dynamic views, unnamed instances on rename).
 * Run: npx tsx docs/plan/lc4m-15.30/spikes/05-critic-r2-checks.mts
 */
import { build, show, validate } from './_lc4.mts';

async function run(label: string, files: Record<string, string>, pick?: (r: any) => unknown) {
  const r = await build(files);
  console.log(`\n=== ${label}`);
  show('diagnostics', r.diagnostics.map((d: string) => d.slice(0, 160)));
  show('validate', (await validate(files)).map((d: string) => d.slice(0, 160)));
  if (pick) show('pick', pick(r));
}
const SPEC = `specification { element e\ndeploymentNode node }\n`;
const nodes = (id: string) => (r: any) => (r.model.$data.views[id]?.nodes ?? []).map((n: any) => n.id);

await run('empty rank', { 'a.c4': SPEC + `model { a = e 'A' }\nviews { view v { include *\nrank { } } }` });
await run('style with no target', { 'a.c4': SPEC + `model { a = e 'A' }\nviews { view v { include *\nstyle { color red } } }` });
await run('parallel block', { 'a.c4': SPEC + `model { a = e 'A'\nb = e 'B' }\nviews { dynamic view d { parallel { a -> b } } }` }, nodes('d'));
await run('break block with a missing endpoint', { 'a.c4': SPEC + `model { a = e 'A'\nb = e 'B' }\nviews { dynamic view d { break { a -> gone } } }` });
await run('exclude-only scoped view', { 'a.c4': SPEC + `model { app = e 'App' { api = e 'Api'\ndb = e 'Db' } }\nviews { view v of app { exclude app.db } }` }, nodes('v'));
await run('exclude-only unscoped view', { 'a.c4': SPEC + `model { app = e 'App' { api = e 'Api'\ndb = e 'Db' } }\nviews { view w { exclude app.db } }` }, nodes('w'));
await run('empty dynamic view', { 'a.c4': SPEC + `model { a = e 'A' }\nviews { dynamic view d { } }` }, nodes('d'));
await run('unnamed instance id', {
  'a.c4': SPEC + `model { app = e 'App' { api = e 'Api' } }\ndeployment { node prod { instanceOf app.api } }\nviews { deployment view dv { include prod.api } }`,
}, (r) => Object.keys(r.model.$data.deployments.elements));
await run('unnamed instances colliding after rename', {
  'a.c4': SPEC + `model { a = e 'A' { svc = e 'S1' }\nb = e 'B' { svc = e 'S2' } }\ndeployment { node prod { instanceOf a.svc\ninstanceOf b.svc } }`,
});
