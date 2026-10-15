/**
 * Spike 01 (S1): AST/CST shape of element, dynamic and deployment views as
 * the library's standalone parser (C4Parser, no linking) produces it.
 * Prints body members in SOURCE ORDER (merged arrays sorted by CST offset),
 * Expressions items recovered from the `prev` chain, StepSeries segments,
 * step bodies and subflow blocks, each with offsets and exact CST text.
 */
import { C4Parser } from '../../../../src/parser/parser.js';
import { SPEC, MODEL } from './_lc4.mts';

const VIEWS = `views {
  view index {
    #next, #deprecated
    title 'Landscape'
    description 'All'
    link https://example.com/doc 'Doc'
    include *
    include app.api, app.db,
    exclude user -> app.web
    include app.web with { color red navigateTo flow }
    group 'Core' {
      include app.*
    }
    rank same { app.api, app.db }
    style app.* { color muted }
    global style mute
    autoLayout LeftRight 120 80
  }
  view appView of app {
    include *
  }
  view appView2 extends appView {
    include ext
  }
  dynamic view flow {
    #next
    title 'Flow'
    variant sequence
    user -> app.web 'opens'
    include app.api
    app.web -> app.api -[async]-> ext 'x' { notes 'n1' }
    app.web <- app.api 'reply'
    autoLayout TopBottom
    app.api .async ext
    app.api -> app.db {
      notes 'reads'
      navigateTo flow2
      color amber
      technology 'SQL'
    }
    par {
      app.web -> app.api
      parallel 'inner' { app.api -> app.db }
    }
    opt 'cached' { app.api -> app.db }
    loop { app.web -> app.api }
    alt 'choice' {
      if 'a' { app.api -> app.db }
      else { app.api -> ext }
    }
    try 'T' { app.api -> app.db } catch 'C' { app.api -> ext } finally { app.web -> app.api }
    break { app.web -> app.api }
  }
  dynamic view flow2 {
    user -> app.web
  }
  deployment view deploy {
    title 'Deploy'
    include prod.**
    exclude prod.vm1.db
    style prod.* { color red }
    includeAncestors true
    autoLayout LeftRight
  }
  global style mute
}
`;
const src = SPEC + MODEL + `global {\n  style mute * { opacity 50% }\n}\n` + VIEWS;
const doc = new C4Parser().parse(src);
console.log('parse errors:', doc.errors.map((e) => e.message));
const text = doc.fullText;
const at = (n: any) => (n?.$cstNode ? `[${n.$cstNode.offset},${n.$cstNode.end}] ${JSON.stringify(text.slice(n.$cstNode.offset, n.$cstNode.end))}` : '(no cst)');

const block = (doc.ast as any).views[0];
console.log('ModelViews keys:', Object.keys(block).filter((k) => !k.startsWith('$')), 'folder:', block.folder, 'styles:', block.styles.map((s: any) => s.$type));

/** Items of an Expressions / FqnExpressions linked list in source order (walk prev, reverse). */
function items(exprs: any): any[] {
  const out: any[] = [];
  for (let it = exprs; it; it = it.prev) out.push(it);
  return out.reverse();
}

function describeRule(r: any, pad: string) {
  console.log(`${pad}${r.$type} ${at(r)}`);
  const list = r.exprs ?? r.expr ?? r.targets;
  if (list) {
    for (const it of items(list)) {
      console.log(`${pad}  item ${it.$type} value=${it.value?.$type ?? 'UNDEFINED'} ${it.value ? at(it.value) : '(trailing comma, node ' + at(it) + ')'}`);
    }
  }
  if (r.groupRules) for (const g of r.groupRules) describeRule(g, pad + '  ');
}

/** Segments of a step chain: walk `source` down to the first Step, reverse. */
function segments(node: any): Array<{ node: any; start: number; end: number }> {
  const chain: any[] = [];
  let n = node;
  while (n.$type === 'StepSeries') { chain.push(n); n = n.source; }
  chain.push(n); // first Step
  chain.reverse();
  return chain.map((s, i) => ({ node: s, start: i === 0 ? s.$cstNode.offset : chain[i - 1].$cstNode.end, end: s.$cstNode.end }));
}

function describeStep(s: any, pad: string) {
  if (s.$type === 'Step' || s.$type === 'StepSeries') {
    console.log(`${pad}${s.$type} ${at(s)}`);
    for (const seg of segments(s)) {
      const x = seg.node;
      const info = {
        source: x.source?.$type === 'ElementRef' ? x.source.$cstNode.text : undefined,
        isBackward: x.isBackward,
        kind: x.kind?.$refText,
        dotKind: x.dotKind?.$cstNode?.text,
        target: x.target.$cstNode.text,
        title: x.title,
        custom: x.custom?.props.map((p: any) => `${p.$type}:${p.key}`),
      };
      console.log(`${pad}  segment [${seg.start},${seg.end}] ${JSON.stringify(text.slice(seg.start, seg.end).trim())} ${JSON.stringify(info)}`);
    }
    return;
  }
  if (s.$type === 'SubflowStep') {
    console.log(`${pad}SubflowStep kind=${s.kind} title=${s.title} ${at(s).slice(0, 40)}...`);
    for (const c of s.steps) describeStep(c, pad + '  ');
    return;
  }
  if (s.$type === 'AltSteps') {
    console.log(`${pad}AltSteps title=${s.title} [${s.$cstNode.offset},${s.$cstNode.end}]`);
    for (const b of s.branches) describeStep(b, pad + '  ');
    return;
  }
  if (s.$type === 'FinallyBlock' || s.$type === 'CatchBlock' || s.$type === 'TryBlock') {
    console.log(`${pad}${s.$type} title=${s.title} keys=${Object.keys(s).filter((k) => !k.startsWith('$'))} [${s.$cstNode.offset},${s.$cstNode.end}]`);
    for (const k of ['tryCatch', 'try']) if (s[k]) describeStep(s[k], pad + '  ');
    for (const k of ['catch', 'finally']) if (s[k]) { console.log(`${pad}  ${k}: ${s[k].$type}`); for (const c of s[k].steps) describeStep(c, pad + '    '); }
    if (s.$type === 'TryBlock') for (const c of s.steps) describeStep(c, pad + '  ');
    return;
  }
  console.log(`${pad}?? ${s.$type}`);
}

for (const v of block.views) {
  const header = { type: v.$type, name: v.name, viewOf: v.viewOf?.$cstNode?.text, extends: v.extends?.view?.$refText };
  console.log(`\n== ${JSON.stringify(header)} body ${v.body ? `[${v.body.$cstNode.offset},${v.body.$cstNode.end}]` : 'none'}`);
  const b = v.body;
  console.log('  body keys:', Object.keys(b).filter((k) => !k.startsWith('$')));
  const members = [
    ...(b.tags ? [b.tags] : []),
    ...b.props,
    ...b.rules,
    ...(b.steps ?? []),
  ].sort((x, y) => x.$cstNode.offset - y.$cstNode.offset);
  for (const m of members) {
    if (m.$type === 'Tags') console.log(`  Tags ${at(m)} values=${items(m).flatMap((t: any) => t.values.map((x: any) => x.$cstNode.text))}`);
    else if (b.props.includes(m)) console.log(`  prop ${m.$type} key=${m.key} ${at(m)}`);
    else if (b.rules.includes(m)) describeRule(m, '  rule ');
    else describeStep(m, '  step ');
  }
}
