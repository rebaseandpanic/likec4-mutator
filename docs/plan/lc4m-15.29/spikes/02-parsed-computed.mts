/**
 * Spike 02 (S2): LikeC4's parsed and computed views, in process.
 *  A. parsed views: ModelBuilder.parseModel() -> $data.views[id]
 *  B. computed views: ModelBuilder.computeModel() -> $data.views[id] (nodes/edges)
 *     and the LikeC4Model API (model.view(id), model.views())
 *  C. `include x` added -> x among computed nodes
 *  D. two autoLayout rules in one view -> which wins
 *  E. `extends`: what merges into the computed view
 */
import { build, show, SPEC, MODEL } from './_lc4.mts';

const VIEWS = `views 'Folder A' {
  view index {
    #next
    title 'Landscape'
    description 'All **elements**'
    link https://example.com/doc 'Doc'
    include *
    include app.api with { title 'API!' navigateTo flow }
    exclude app.* where tag is #deprecated
    include app.web -> app.api where kind is async
    autoLayout LeftRight
  }
  view twoLayouts {
    autoLayout LeftRight
    include *
    autoLayout BottomTop
  }
  dynamic view flow {
    title 'Flow'
    description 'desc'
    variant sequence
    user -> app.web 'opens'
    app.web -> app.api -[async]-> ext 'x' { notes 'n1' }
    app.web <- app.api 'reply'
    app.api .async ext { technology 'AMQP' color amber navigateTo flow2 }
    par {
      app.api -> app.db
      app.api -> ext
    }
    include app.db
    autoLayout TopBottom
  }
}
views {
  view appView of app {
    #deprecated
    title 'Scoped'
    description 'parent desc'
    include *
    autoLayout RightLeft
  }
  view appChild extends appView {
    #next
    include ext
  }
  view appChild2 extends appView {
    title 'Child2'
    autoLayout TopBottom
  }
  dynamic view flow2 {
    user -> app.web
  }
  deployment view deploy {
    title 'Deploy'
    include prod.**
  }
}
`;
const { diagnostics, parsed, model } = await build({ 'a.c4': SPEC + MODEL + VIEWS });
console.log('diagnostics:', diagnostics);
console.log('parsed model class:', parsed.constructor.name, 'stage:', parsed.stage, '| computed model stage:', model.stage);

console.log('\n-- A. parsed views ($data.views of parseModel()) --');
for (const [id, v] of Object.entries<any>(parsed.$data.views)) {
  const { rules, steps, docUri, ...rest } = v;
  show(`parsed ${id}`, rest);
  show(`  rules`, rules);
  if (steps) show(`  steps`, steps);
}

console.log('\n-- B. computed views --');
console.log('model.views() ids:', [...model.views()].map((v: any) => v.id));
for (const id of ['index', 'flow', 'appView', 'appChild', 'appChild2', 'twoLayouts', 'deploy']) {
  const cv = model.$data.views[id];
  show(`computed ${id}`, {
    _type: cv._type, title: cv.title, folder: model.view(id).folder.path, tags: cv.tags, autoLayout: cv.autoLayout,
    nodes: cv.nodes.map((n: any) => n.id), edges: cv.edges.map((e: any) => `${e.source}->${e.target}`),
  });
}
const flow = model.$data.views.flow;
show('computed flow edge[1]', flow.edges[1]);
show('computed flow rules', flow.rules);
show('computed appChild rules', model.$data.views.appChild.rules);
show('computed appChild extends', model.$data.views.appChild.extends);
show('computed appChild description / viewOf', [model.$data.views.appChild.description, model.$data.views.appChild.viewOf]);
show('computed appChild2 description', model.$data.views.appChild2.description);
show('computed index edge with navigateTo', model.$data.views.index.nodes.find((n: any) => n.id === 'app.api'));

console.log('\n-- C. include x adds x --');
const base = `views {\n  view v of app {\n    include app.api\n  }\n}\n`;
const plus = `views {\n  view v of app {\n    include app.api\n    include ext\n  }\n}\n`;
for (const [label, v] of [['before', base], ['after', plus]] as const) {
  const r = await build({ 'a.c4': SPEC + MODEL + v });
  show(label, { diagnostics: r.diagnostics, nodes: r.model.$data.views.v.nodes.map((n: any) => n.id) });
}
