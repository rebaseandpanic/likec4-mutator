/**
 * Spike 04 (S4): exact LikeC4 diagnostics for view constructs.  Each case is
 * SPEC+MODEL (lines 1-34) plus a views block (`views {` = line 35, case body
 * from line 36) unless it lists its own files.  Prints every diagnostic
 * (ERROR / warn) or "valid" when there are none.
 */
import { build, SPEC, MODEL } from './_lc4.mts';

const one = (body: string) => ({ 'a.c4': SPEC + MODEL + `views {\n${body}\n}\n` });
const cases: Array<[string, Record<string, string>]> = [
  ['parent-child step app -> app.api', one(`dynamic view v {\n app -> app.api\n}`)],
  ['self step app.api -> app.api', one(`dynamic view v {\n app.api -> app.api\n}`)],
  ['chain after backward user <- app.web -> app.api', one(`dynamic view v {\n user <- app.web -> app.api\n}`)],
  ['chain returning to previous source (a -> b -> a)', one(`dynamic view v {\n app.web -> app.api -> app.web\n}`)],
  ['nested par (par in par)', one(`dynamic view v {\n par {\n  par {\n   app.web -> app.api\n  }\n }\n}`)],
  ['par in loop (not nested par)', one(`dynamic view v {\n loop {\n  par {\n   app.web -> app.api\n  }\n }\n}`)],
  ['empty par {}', one(`dynamic view v {\n app.web -> app.api\n par {\n }\n}`)],
  ['if outside alt', one(`dynamic view v {\n if {\n  app.web -> app.api\n }\n}`)],
  ['opt inside alt', one(`dynamic view v {\n alt {\n  opt {\n   app.web -> app.api\n  }\n }\n}`)],
  ['step with unknown element', one(`dynamic view v {\n app.web -> nope\n}`)],
  ['dynamic view without steps', one(`dynamic view v {\n include app.api\n}`)],
  ['empty element view body', one(`view v {\n}`)],
  ['element view without body', one(`view v`)],
  ['with inside exclude', one(`view v {\n include *\n exclude app.api with { color red }\n}`)],
  ['with on element.kind expr', one(`view v {\n include element.kind = container with { color red }\n}`)],
  ['with on element.tag expr', one(`view v {\n include element.tag = #next with { color red }\n}`)],
  ['with on wildcard (element view)', one(`view v {\n include * with { color red }\n}`)],
  ['with on app.* (element view)', one(`view v {\n include app.* with { color red }\n}`)],
  ['with in dynamic include on wildcard', one(`dynamic view v {\n app.web -> app.api\n include * with { color red }\n}`)],
  ['with in deployment view include', one(`deployment view v {\n include prod.vm1.api with { color red }\n}`)],
  ['trailing comma include a, b,', one(`view v {\n include app.api, app.db,\n}`)],
  ['title after include', one(`view v {\n include *\n title 'X'\n}`)],
  ['link after include', one(`view v {\n include *\n link https://example.com\n}`)],
  ['tags after title', one(`view v {\n title 'X'\n #next\n include *\n}`)],
  ['title twice', one(`view v {\n title 'X'\n title 'Y'\n include *\n}`)],
  ['dynamic: title after a step', one(`dynamic view v {\n app.web -> app.api\n title 'X'\n}`)],
  ['dynamic: variant after include', one(`dynamic view v {\n include app.api\n variant sequence\n}`)],
  ['variant in element view', one(`view v {\n variant sequence\n include *\n}`)],
  ['two views same id, two files (element + dynamic)', {
    'a.c4': SPEC + MODEL + `views {\n view v {\n  include *\n }\n}\n`,
    'b.c4': `views {\n dynamic view v {\n  app.web -> app.api\n }\n}\n`,
  }],
  ['extends cycle v1 <-> v2', one(`view v1 extends v2 {\n include *\n}\nview v2 extends v1 {\n include *\n}`)],
  ['extends self', one(`view v1 extends v1 {\n include *\n}`)],
  ['view of + extends together', one(`view p {\n include *\n}\nview v of app extends p {\n include *\n}`)],
  ['navigateTo target removed (with)', one(`view v {\n include app.api with { navigateTo gone }\n}`)],
  ['navigateTo target removed (step)', one(`dynamic view v {\n app.web -> app.api { navigateTo gone }\n}`)],
  ['extends target removed', one(`view v extends gone {\n include *\n}`)],
  ['view id reserved word (this)', one(`view this {\n include *\n}`)],
];

for (const [label, files] of cases) {
  const r = await build(files);
  console.log(`# ${label}`);
  console.log(`  ${r.diagnostics.length === 0 ? 'valid' : r.diagnostics.join('\n  ')}`);
}

// The extends cycle reports no diagnostic (only a console.warn from
// @likec4/core resolveRulesExtendedViews): what does `likec4 validate` say,
// and which views end up in the computed model?
{
  const files = one(`view v1 extends v2 {\n include *\n}\nview v2 extends v1 {\n include *\n}`);
  const { validate } = await import('./_lc4.mts');
  const r = await build(files);
  console.log('# extends cycle: computed view ids', JSON.stringify([...r.model.views()].map((v: any) => v.id)));
  console.log('# extends cycle: validate()', JSON.stringify(await validate(files)));
}
