/**
 * Spike 01 for lc4m-15.30: load-bearing LikeC4 1.59.4 facts the spec relies on.
 * Run: npx tsx docs/plan/lc4m-15.30/spikes/01-likec4-facts.mts
 * Each case prints the diagnostics LikeC4 reports and the computed values that matter.
 */
import { build, show, validate } from './_lc4.mts';

const SPEC = `specification {
  element system {
    style { shape browser color amber }
  }
  element container
  relationship async {
    color red
    line dotted
    head diamond
  }
  tag next
}
`;

async function caseRun(label: string, files: Record<string, string>, pick?: (r: any) => unknown) {
  const r = await build(files);
  console.log(`\n=== ${label}`);
  show('diagnostics', r.diagnostics);
  show('validate', await validate(files));
  if (pick) show('pick', pick(r));
}

// 1. Bidirectional relationship: one relation in the computed model?
await caseRun('bidirectional', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a <-> b 'sync'
  a -[async]<-> b
}`,
}, (r) => Object.values(r.model.$data.relations).map((x: any) => ({ s: x.source, t: x.target, k: x.kind, bi: x.isBidirectional, head: x.head, tail: x.tail, line: x.line, color: x.color })));

// 2. Element style: kind style + own style + body icon; what the parsed/computed element carries.
await caseRun('element style', {
  'a.c4': SPEC + `model {
  s1 = system 'S1'
  s2 = system 'S2' {
    style { color green opacity 40% multiple true }
  }
  s3 = system 'S3' {
    icon tech:go
  }
  s4 = system 'S4' {
    icon tech:go
    style { icon tech:java }
  }
}`,
}, (r) => Object.fromEntries(Object.values(r.model.$data.elements).map((x: any) => [x.id, x.style])));

// 3. Relationship style on the computed model: kind defaults vs own.
await caseRun('relationship style', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a -[async]-> b 'k'
  a -> b 'own' {
    style { line solid color blue tail open }
  }
  a -[async]-> b 'kindAndOwn' {
    style { color green }
  }
}`,
}, (r) => Object.values(r.model.$data.relations).map((x: any) => ({ t: x.title, k: x.kind, line: x.line, color: x.color, head: x.head, tail: x.tail })));

// 4. addElement into a bodiless parent, both declaration forms and inline strings.
await caseRun('bodiless parent made a body', {
  'a.c4': SPEC + `model {
  a = system 'A' 'sum' 'tech' {
    b = container 'B'
  }
  system c 'C' {
    d = container 'D'
  }
}`,
}, (r) => Object.values(r.model.$data.elements).map((x: any) => ({ id: x.id, title: x.title, summary: x.summary, technology: x.technology })));

// 5. Two specification blocks in two files; duplicate kind declaration across files.
await caseRun('two specification blocks', {
  'a.c4': SPEC + `model { a = system 'A' }`,
  'b.c4': `specification { element component }
model { c = component 'C' }`,
});
await caseRun('duplicate kind across files', {
  'a.c4': SPEC + `model { a = system 'A' }`,
  'b.c4': `specification { element system }`,
});
await caseRun('duplicate tag in one file', {
  'a.c4': `specification { tag x
 tag x }
model { }`,
});

// 6. Extend relation that matches nothing; one matching two relations.
await caseRun('extend relation matching nothing', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a -> b 'x'
  extend a -> b 'y' { #next }
}`,
});
await caseRun('extend relation matching two', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a -> b 'x'
  a -> b 'x' { description 'second' }
  extend a -> b 'x' { #next }
}`,
}, (r) => Object.values(r.model.$data.relations).map((x: any) => ({ t: x.title, tags: x.tags })));
await caseRun('extend bidirectional matched in reverse order', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a <-> b 'x'
  extend b <-> a 'x' { #next }
}`,
}, (r) => Object.values(r.model.$data.relations).map((x: any) => ({ t: x.title, tags: x.tags })));
await caseRun('extend directed does not match bidirectional', {
  'a.c4': SPEC + `model {
  a = system 'A'
  b = system 'B'
  a <-> b 'x'
  extend a -> b 'x' { #next }
}`,
});

// 7. Undeclared tag in a new extend block; extend of an unresolved element.
await caseRun('extend element undeclared tag', {
  'a.c4': SPEC + `model {
  a = system 'A'
  extend a { #nope }
}`,
});
await caseRun('extend unresolved element', {
  'a.c4': SPEC + `model {
  a = system 'A'
  extend zz { #next }
}`,
});

// 8. Nested relationship forms: `-> x` in a body, `this -> x`, `it -> x`.
await caseRun('nested relationship forms', {
  'a.c4': SPEC + `model {
  a = system 'A' {
    -> b 'sourceless'
    this -> b 'this'
    it -[async]-> b 'it'
    .async b 'dot'
  }
  b = system 'B'
}`,
}, (r) => Object.values(r.model.$data.relations).map((x: any) => ({ s: x.source, t: x.target, title: x.title, k: x.kind })));

// 9. Kind rename: where/kind/tag predicates referencing kinds and tags.
await caseRun('kind and tag references in view predicates', {
  'a.c4': SPEC + `model {
  a = system 'A' { #next }
  b = container 'B'
  a -[async]-> b
}
views {
  view v {
    include * where kind is system
    include element.kind = container
    include * where tag is #next
    include * -> * where kind is async
  }
  dynamic view d {
    a -[async]-> b
    a .async b
  }
}`,
});
await caseRun('undeclared kind in view predicate', {
  'a.c4': SPEC + `model { a = system 'A' }
views { view v { include * where kind is gone } }`,
});

// 10. Body-level `icon` next to `style { icon }`: warning text.
await caseRun('redundant icon', {
  'a.c4': SPEC + `model {
  s = system 'S' {
    icon tech:go
    style { icon tech:java }
  }
}`,
});

// 11. Relationship kind `multiple`.
await caseRun('relationship kind multiple', {
  'a.c4': `specification { element e
relationship r { multiple true } }
model { a = e 'A'
b = e 'B'
a -[r]-> b }`,
}, (r) => ({ spec: r.model.$data.specification?.relationships, rel: Object.values(r.model.$data.relations).map((x: any) => x) }));
