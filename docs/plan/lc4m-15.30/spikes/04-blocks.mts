/** Spike 04 for lc4m-15.30: empty specification block, rank syntax, empty group. Run: npx tsx docs/plan/lc4m-15.30/spikes/04-blocks.mts */
import { build, show, validate } from './_lc4.mts';
for (const [l, t] of Object.entries({
  emptySpec: `specification { }\nspecification { element e }\nmodel { a = e 'A' }`,
  rankSame: `specification { element e }\nmodel { a = e 'A'\nb = e 'B' }\nviews { view v { include *\nrank same { a, b } } }`,
  rankOne: `specification { element e }\nmodel { a = e 'A' }\nviews { view v { include *\nrank { a } } }`,
  emptyGroup: `specification { element e }\nmodel { a = e 'A' }\nviews { view v { include a\ngroup 'g' { } } }`,
})) { const r = await build({ 'a.c4': t }); console.log(l); show(' diag', r.diagnostics); show(' validate', await validate({ 'a.c4': t })); if (l==='emptyGroup') show(' nodes', r.model.$data.views.v.nodes.map((n:any)=>n.id)); }
