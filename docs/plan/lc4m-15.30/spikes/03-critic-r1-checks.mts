/**
 * Spike 03 for lc4m-15.30: LikeC4 1.59.4 behaviour behind spec critique round 1
 * findings (shared kind names in `where kind is`, kind-default titles and
 * `extend a -> b`, identical relationships, hierarchy-dependent view contents,
 * view-block style rules).
 * Run: npx tsx docs/plan/lc4m-15.30/spikes/03-critic-r1-checks.mts
 */
import { build, show, validate } from './_lc4.mts';

async function run(label: string, files: Record<string, string>, pick?: (r: any) => unknown) {
  const r = await build(files);
  console.log(`\n=== ${label}`);
  show('diagnostics', r.diagnostics);
  show('validate', await validate(files));
  if (pick) show('pick', pick(r));
}
const nodes = (r: any, id: string) => (r.model.$data.views[id]?.nodes ?? []).map((n: any) => n.id);

// Shared element / deployment node kind name in `where kind is`.
await run('shared kind name, element view', {
  'a.c4': `specification { element vm
deploymentNode vm }
model { a = vm 'A' }
deployment { vm n { instanceOf a } }
views { view v { include * where kind is vm } }`,
}, (r) => nodes(r, 'v'));

// Relationship whose title comes from its kind; extend with and without that title.
const KIND_TITLE = `specification { element e
relationship r { title 'kt' }
tag t }
model { a = e 'A'
b = e 'B'
a -[r]-> b
`;
await run('extend without kind title', { 'a.c4': KIND_TITLE + `extend a -[r]-> b { #t } }` },
  (r) => Object.values(r.model.$data.relations).map((x: any) => ({ title: x.title, tags: x.tags })));
await run('extend with kind title', { 'a.c4': KIND_TITLE + `extend a -[r]-> b 'kt' { #t } }` },
  (r) => Object.values(r.model.$data.relations).map((x: any) => ({ title: x.title, tags: x.tags })));

// Two identical relationships.
await run('identical relationships', {
  'a.c4': `specification { element e }
model { a = e 'A'
b = e 'B'
a -> b 'x'
a -> b 'x' }`,
}, (r) => Object.values(r.model.$data.relations).length);

// Hierarchy-dependent membership: include app.* before and after moving app.api.
await run('include app.* before move', {
  'a.c4': `specification { element e }
model { app = e 'App' { api = e 'Api' }
other = e 'Other' }
views { view v { include app.* } }`,
}, (r) => nodes(r, 'v'));
await run('include app.* after move', {
  'a.c4': `specification { element e }
model { app = e 'App'
other = e 'Other' { api = e 'Api' } }
views { view v { include app.* } }`,
}, (r) => nodes(r, 'v'));

// views-block style rules with element and tag targets.
await run('views block style rules', {
  'a.c4': `specification { element e
tag t }
model { app = e 'App' { api = e 'Api' { #t } } }
views {
  style app.api { color red }
  style element.tag = #t { color green }
  view v { include * }
}`,
});
