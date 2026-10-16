/**
 * Spike 06 for lc4m-15.30: LikeC4 1.59.4 behaviour behind spec critique round 3
 * findings (relationship kinds in predicate connectors, deployment view style
 * targets by kind or tag, unnamed instance ids colliding with sibling nodes and
 * named instances).
 * Run: npx tsx docs/plan/lc4m-15.30/spikes/06-critic-r3-checks.mts
 */
import { build, show, validate } from './_lc4.mts';

async function run(label: string, files: Record<string, string>, extra?: (r: any) => Promise<unknown> | unknown) {
  const r = await build(files);
  console.log(`\n=== ${label}`);
  show('diagnostics', r.diagnostics.map((d: string) => d.slice(0, 160)));
  show('validate', (await validate(files)).map((d: string) => d.slice(0, 160)));
  if (extra) show('pick', await extra(r));
}
const SPEC = `specification { element e
relationship async
relationship msg
deploymentNode node
tag t }
`;
const MODEL = `model { a = e 'A'
b = e 'B'
a -[async]-> b }
`;
await run('predicate connector with a declared kind', {
  'a.c4': SPEC + MODEL + `views { view v { include *\nexclude a -[async]-> b\nexclude a .async b } }`,
});
await run('predicate connector after the kind is renamed elsewhere', {
  'a.c4': SPEC.replace('relationship async\n', '') + MODEL.replace('-[async]->', '-[msg]->') + `views { view v { include *\nexclude a -[async]-> b } }`,
});
await run('deployment view style target by kind', {
  'a.c4': SPEC + MODEL + `deployment { node prod { instanceOf a } }\nviews { deployment view dv { include *\nstyle element.kind = node { color red } } }`,
}, async (r) => (await r.services.likec4.LanguageServices.diagrams()).map((d: any) => d.id));
await run('deployment view style target by name', {
  'a.c4': SPEC + MODEL + `deployment { node prod { instanceOf a } }\nviews { deployment view dv { include *\nstyle prod { color red } } }`,
}, async (r) => (await r.services.likec4.LanguageServices.diagrams()).map((d: any) => d.id));
await run('unnamed instance id equal to a sibling node', {
  'a.c4': SPEC + `model { app = e 'App' { svc = e 'S' } }\ndeployment { node prod { node svc\ninstanceOf app.svc } }`,
});
await run('unnamed instance id equal to a named instance', {
  'a.c4': SPEC + `model { app = e 'App' { svc = e 'S'\nx = e 'X' } }\ndeployment { node prod { svc = instanceOf app.x\ninstanceOf app.svc } }`,
});
await run('deployment view style target by element kind', {
  'a.c4': SPEC + MODEL + `deployment { node prod { instanceOf a } }\nviews { deployment view dv { include *\nstyle element.kind = e { color red } } }`,
}, async (r) => (await r.services.likec4.LanguageServices.diagrams()).map((d: any) => d.id));
