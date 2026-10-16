/**
 * Spike 02 for lc4m-15.30: name spaces of kinds and tags, and what a cascade
 * removal may leave behind (empty rules, empty `with`, style rule targets).
 * Run: npx tsx docs/plan/lc4m-15.30/spikes/02-names-and-leftovers.mts
 */
import { build, show, validate } from './_lc4.mts';

async function run(label: string, files: Record<string, string>, pick?: (r: any) => unknown) {
  const r = await build(files);
  console.log(`\n=== ${label}`);
  show('diagnostics', r.diagnostics);
  show('validate', await validate(files));
  if (pick) show('pick', pick(r));
}

// Element kind and deployment node kind with the same name; tag with the name of a kind.
await run('element kind == deploymentNode kind', {
  'a.c4': `specification { element vm
deploymentNode vm
tag vm }
model { a = vm 'A' }
deployment { vm n { instanceOf a } }
views { view v { include * where kind is vm } }`,
});
// Relationship kind with the name of an element kind.
await run('relationship kind == element kind', {
  'a.c4': `specification { element x
relationship x }
model { a = x 'A'
b = x 'B'
a -[x]-> b }`,
});
// Keyword-like kind names.
await run('kind named like a keyword', {
  'a.c4': `specification { element model
element view }
model { a = model 'A' }`,
});
// View style rule targeting a missing element.
await run('style rule target missing', {
  'a.c4': `specification { element e }
model { a = e 'A' }
views { view v { include *
style gone { color red } } }`,
});
// Empty `with {}` after removing its only property.
await run('empty with block', {
  'a.c4': `specification { element e }
model { a = e 'A' }
views { view v { include a with { } } }`,
});
// Rule whose only item would be removed: is `include` with no items valid? (expected: parse error)
await run('include with no items', {
  'a.c4': `specification { element e }
model { a = e 'A' }
views { view v { include } }`,
});
// Empty dynamic view and empty par block.
await run('empty dynamic view and par', {
  'a.c4': `specification { element e }
model { a = e 'A'
b = e 'B' }
views { dynamic view d { par { } } }`,
});
// Relationship between parent and child after a move (expected: error).
await run('relationship parent-child', {
  'a.c4': `specification { element e }
model { a = e 'A' { b = e 'B' }
a -> a.b }`,
});
// Dynamic step between parent and child (expected: error).
await run('step parent-child', {
  'a.c4': `specification { element e }
model { a = e 'A' { b = e 'B' } }
views { dynamic view d { a -> a.b } }`,
});
// Relative names: `include api` in a view of app, after app.api would be renamed to app.svc.
await run('relative name in view of', {
  'a.c4': `specification { element e }
model { app = e 'App' { svc = e 'Svc' } }
views { view v of app { include svc } }`,
});
