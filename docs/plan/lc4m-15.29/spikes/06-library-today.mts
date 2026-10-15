/**
 * Spike 06 (S6): what LikeC4Mutator.addView does today (src/ as is).
 *  A. no `views` block in any file -> error
 *  B. two files with views blocks -> which file / block gets the view, generated text
 *  C. element view `of` a relative name, dynamic and deployment views -> text + validate()
 */
import { LikeC4Mutator } from '../../../../src/mutator/mutator.js';
import { validate, SPEC, MODEL } from './_lc4.mts';

// A
try {
  const m = new LikeC4Mutator({ 'a.c4': SPEC + MODEL });
  m.addView({ id: 'v', type: 'element' });
  console.log('A: no error');
} catch (e) {
  console.log(`A: ${(e as Error).constructor.name}: ${(e as Error).message}`);
}

// B + C
const files = {
  'a.c4': SPEC + MODEL,
  'b.c4': `views {\n  view first {\n    include *\n  }\n}\n\nviews 'Second' {\n  view second {\n    include *\n  }\n}\n`,
  'c.c4': `views {\n  view third {\n    include *\n  }\n}\n`,
};
const m = new LikeC4Mutator(files);
m.addView({ id: 'scoped', type: 'element', target: 'app', title: 'Scoped', includes: ['api', 'include ext'], autoLayout: 'LeftRight' });
m.addView({ id: 'flow', type: 'dynamic', includes: ['app.api'] });
m.addView({ id: 'deploy', type: 'deployment', includes: ['prod.**'], autoLayout: '' });
for (const label of ['dup id', 'exclude smuggled', 'step as include']) {
  try {
    if (label === 'dup id') m.addView({ id: 'first', type: 'element' });
    if (label === 'exclude smuggled') m.addView({ id: 'x1', type: 'element', includes: ['* exclude app'] });
    if (label === 'step as include') m.addView({ id: 'x2', type: 'dynamic', includes: ['app.web -> app.api'] });
    console.log(`B ${label}: no error`);
  } catch (e) {
    console.log(`B ${label}: ${(e as Error).constructor.name}: ${(e as Error).message}`);
  }
}
const out = m.serialize();
console.log('--- b.c4 after addView x3 ---');
console.log(out['b.c4']);
console.log('--- c.c4 unchanged:', out['c.c4'] === files['c.c4']);
console.log('validate():', JSON.stringify(await validate(out)));
{
  const { build } = await import('./_lc4.mts');
  const r = await build(out);
  console.log('computed x2 (dynamic, include of a relation predicate):', JSON.stringify({
    rules: r.parsed.$data.views.x2.rules, nodes: r.model.$data.views.x2.nodes.map((n: any) => n.id),
  }));
}
