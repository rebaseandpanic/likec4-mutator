/**
 * Spike 05 (S5): view writes as plain text edits located through the
 * library's unlinked parse (C4Parser CST offsets), each result checked with
 * the `likec4 validate` equivalent (`validate` in _lc4.mts, same as
 * tests/helpers/likec4-model.ts validateLikeC4) and, where relevant, against
 * the computed view.
 */
import { C4Parser } from '../../../../src/parser/parser.js';
import { build, validate, SPEC, MODEL } from './_lc4.mts';

const VIEWS = `views {
  view idx {
    include app.api
    autoLayout LeftRight
  }
  view bare {
    include *
  }
  view titled {
    title 'T'
    include *
  }
  dynamic view flow {
    user -> app.web
    include app.db
    app.web -> app.api
    app.api -> app.db
    par {
      app.api -> ext
    }
    autoLayout TopBottom
  }
}
`;
const BASE = SPEC + MODEL + VIEWS;

const parse = (t: string) => new C4Parser().parse(t);
const view = (t: string, id: string) => (parse(t).ast as any).views[0].views.find((v: any) => v.name === id);
const indentOf = (t: string, offset: number) => {
  const lineStart = t.lastIndexOf('\n', offset - 1) + 1;
  return t.slice(lineStart, offset).match(/^[ \t]*/)![0];
};
/** Insert `line` as a new line before the line holding `offset`, with that line's indent. */
const insertLineBefore = (t: string, offset: number, line: string) => {
  const lineStart = t.lastIndexOf('\n', offset - 1) + 1;
  return t.slice(0, lineStart) + indentOf(t, offset) + line + '\n' + t.slice(lineStart);
};
/** Insert `line` as the first line of a body whose `{` is at `open`, indented one level deeper than `bodyIndent`. */
const insertFirstInBody = (t: string, open: number, bodyIndent: string, line: string) =>
  t.slice(0, open + 1) + '\n' + bodyIndent + '  ' + line + t.slice(open + 1);
const sourceOrder = (b: any) => [...(b.tags ? [b.tags] : []), ...b.props, ...b.rules, ...(b.steps ?? [])].sort((x, y) => x.$cstNode.offset - y.$cstNode.offset);
const sliceView = (t: string, id: string) => { const v = view(t, id); return t.slice(v.$cstNode.offset, v.$cstNode.end); };

async function report(label: string, text: string, id: string, extra?: (m: any) => unknown) {
  console.log(`\n# ${label}`);
  console.log(sliceView(text, id).split('\n').map((l) => '  | ' + l).join('\n'));
  console.log(`  validate(): ${JSON.stringify(await validate({ 'a.c4': text }))}`);
  if (extra) { const r = await build({ 'a.c4': text }); console.log(`  ${JSON.stringify(extra(r.model))}`); }
}
const nodesOf = (id: string) => (m: any) => ({ nodes: m.$data.views[id].nodes.map((n: any) => n.id), autoLayout: m.$data.views[id].autoLayout });
const stepsOf = (id: string) => (m: any) => ({ edges: m.$data.views[id].edges.map((e: any) => `${e.id}:${e.source}->${e.target}${e.astPath ? ' @' + e.astPath : ''}`) });

console.log('base validate():', JSON.stringify(await validate({ 'a.c4': BASE })));

// A. include as the last rule but before a trailing autoLayout
{
  const v = view(BASE, 'idx');
  const rules = v.body.rules;
  const last = rules[rules.length - 1];
  const anchor = last.$type === 'ViewRuleAutoLayout' ? last : null;
  const t = anchor ? insertLineBefore(BASE, anchor.$cstNode.offset, 'include ext') : BASE;
  await report('A. include ext before trailing autoLayout', t, 'idx', nodesOf('idx'));
}
// B1. dynamic: include appended among interleaved steps, before the trailing autoLayout
{
  const v = view(BASE, 'flow');
  const members = sourceOrder(v.body);
  const lastMember = members[members.length - 1];
  const t = insertLineBefore(BASE, lastMember.$cstNode.offset, 'include ext');
  await report('B1. dynamic: include ext before trailing autoLayout', t, 'flow', nodesOf('flow'));
}
// B2. dynamic: include between two steps
{
  const v = view(BASE, 'flow');
  const t = insertLineBefore(BASE, v.body.steps[2].$cstNode.offset, 'include user');
  await report('B2. dynamic: include between steps 2 and 3', t, 'flow', nodesOf('flow'));
}
// C1. step inserted at position 1 (before the 2nd step in source order)
{
  const v = view(BASE, 'flow');
  const t = insertLineBefore(BASE, v.body.steps[1].$cstNode.offset, 'app.web -> ext');
  await report('C1. step inserted before steps[1]', t, 'flow', stepsOf('flow'));
}
// C2. step appended inside a par block (before its closing brace)
{
  const v = view(BASE, 'flow');
  const par = v.body.steps.find((s: any) => s.$type === 'SubflowStep');
  const lastInner = par.steps[par.steps.length - 1];
  const at = lastInner.$cstNode.end;
  const t = BASE.slice(0, at) + '\n' + indentOf(BASE, lastInner.$cstNode.offset) + 'app.api -> app.db' + BASE.slice(at);
  await report('C2. step appended inside par', t, 'flow', stepsOf('flow'));
}
// D. wrap steps[1] and steps[2] (consecutive in source) into a new par { }
{
  const v = view(BASE, 'flow');
  const [a, b] = [v.body.steps[1], v.body.steps[2]];
  const ind = indentOf(BASE, a.$cstNode.offset);
  const lineStart = BASE.lastIndexOf('\n', a.$cstNode.offset - 1) + 1;
  const lineEnd = BASE.indexOf('\n', b.$cstNode.end);
  const inner = BASE.slice(lineStart, lineEnd).split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  const t = BASE.slice(0, lineStart) + ind + 'par {\n' + inner + '\n' + ind + '}' + BASE.slice(lineEnd);
  await report('D. wrap steps[1..2] (consecutive in source) into a new par', t, 'flow', stepsOf('flow'));
}
// D2. the same naive wrap over steps[0..1], which have `include app.db` between them in source
{
  const v = view(BASE, 'flow');
  const [a, b] = [v.body.steps[0], v.body.steps[1]];
  const ind = indentOf(BASE, a.$cstNode.offset);
  const lineStart = BASE.lastIndexOf('\n', a.$cstNode.offset - 1) + 1;
  const lineEnd = BASE.indexOf('\n', b.$cstNode.end);
  const inner = BASE.slice(lineStart, lineEnd).split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  const t = BASE.slice(0, lineStart) + ind + 'par {\n' + inner + '\n' + ind + '}' + BASE.slice(lineEnd);
  await report('D2. wrap steps[0..1] with an include between them (rule ends up inside par)', t, 'flow');
}
// E1. props into a body with none: tags, title, description, link at body start
{
  const v = view(BASE, 'bare');
  const open = v.body.$cstNode.offset;
  const ind = indentOf(BASE, v.$cstNode.offset);
  let t = BASE;
  for (const line of ["link https://example.com/doc 'Doc'", "description 'D'", "title 'New'", '#next']) t = insertFirstInBody(t, open, ind, line);
  await report('E1. tags, title, description, link into a body without props', t, 'bare', (m: any) => {
    const cv = m.$data.views.bare; return { title: cv.title, description: cv.description, tags: cv.tags, links: cv.links };
  });
}
// E2. tags into a body that has a title: must go before the title (first in body)
{
  const v = view(BASE, 'titled');
  const t = insertFirstInBody(BASE, v.body.$cstNode.offset, indentOf(BASE, v.$cstNode.offset), '#next, #deprecated');
  await report('E2. tags first, before an existing title', t, 'titled', (m: any) => ({ tags: m.$data.views.titled.tags }));
  const wrong = insertLineBefore(BASE, v.body.rules[0].$cstNode.offset, '#next');
  await report('E2-neg. tags after the title (wrong place)', wrong, 'titled');
}
// E3. link into a body with props: after the last prop, before the first rule
{
  const v = view(BASE, 'titled');
  const lastProp = v.body.props[v.body.props.length - 1];
  const at = lastProp.$cstNode.end;
  const t = BASE.slice(0, at) + '\n' + indentOf(BASE, lastProp.$cstNode.offset) + 'link https://example.com/x' + BASE.slice(at);
  await report('E3. link after last prop, before first rule', t, 'titled', (m: any) => ({ links: m.$data.views.titled.links }));
}
// E4. dynamic: title into a body whose first member is a step -> must precede the steps
{
  const v = view(BASE, 'flow');
  const t = insertFirstInBody(BASE, v.body.$cstNode.offset, indentOf(BASE, v.$cstNode.offset), "title 'Flow'");
  await report('E4. dynamic: title before the first step', t, 'flow', (m: any) => ({ title: m.$data.views.flow.title }));
}
