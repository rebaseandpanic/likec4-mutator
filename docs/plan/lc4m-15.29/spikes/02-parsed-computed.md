# Spike 02-parsed-computed

S2: LikeC4's parsed views (`ModelBuilder.parseModel()`) and computed views (`ModelBuilder.computeModel()`), in process.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/02-parsed-computed.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
diagnostics: []
parsed model class: LikeC4Model stage: parsed | computed model stage: computed

-- A. parsed views ($data.views of parseModel()) --
parsed appView: {"_type":"element","tags":["deprecated"],"links":null,"viewOf":"app","_stage":"parsed","sourcePath":"src/a.c4","description":{"txt":"parent desc"},"title":"Scoped","id":"appView"}
  rules: [{"include":[{"wildcard":true}]},{"direction":"RL"}]
parsed deploy: {"_type":"deployment","tags":null,"links":null,"_stage":"parsed","sourcePath":"src/a.c4","description":null,"title":"Deploy","id":"deploy"}
  rules: [{"include":[{"ref":{"deployment":"prod"},"selector":"descendants"}]}]
parsed flow2: {"_type":"dynamic","tags":null,"links":null,"_stage":"parsed","sourcePath":"src/a.c4","description":null,"title":null,"id":"flow2"}
  rules: []
  steps: [{"target":"app.web","astPath":"/steps@0","source":"user"}]
parsed appChild2: {"_type":"element","tags":["deprecated"],"links":null,"viewOf":"app","_stage":"parsed","sourcePath":"src/a.c4","description":{"txt":"parent desc"},"title":"Child2","id":"appChild2","extends":"appView"}
  rules: [{"include":[{"wildcard":true}]},{"direction":"RL"},{"direction":"TB"}]
parsed appChild: {"_type":"element","tags":["deprecated","next"],"links":null,"viewOf":"app","_stage":"parsed","sourcePath":"src/a.c4","description":{"txt":"parent desc"},"title":"Scoped","id":"appChild","extends":"appView"}
  rules: [{"include":[{"wildcard":true}]},{"direction":"RL"},{"include":[{"ref":{"model":"ext"}}]}]
parsed flow: {"_type":"dynamic","tags":null,"links":null,"variant":"sequence","_stage":"parsed","sourcePath":"src/a.c4","description":{"txt":"desc"},"title":"Folder A / Flow","id":"flow"}
  rules: [{"include":[{"ref":{"model":"app.db"}}]},{"direction":"TB"}]
  steps: [{"target":"app.web","astPath":"/steps@0","title":"opens","source":"user"},{"_type":"series","steps":[{"target":"app.api","astPath":"/steps@1/source","source":"app.web"},{"target":"ext","astPath":"/steps@1","title":"x","kind":"async","notes":{"txt":"n1"},"source":"app.api"}]},{"target":"app.web","astPath":"/steps@2","title":"reply","source":"app.api","isBackward":true},{"target":"ext","astPath":"/steps@3","kind":"async","technology":"AMQP","color":"amber","navigateTo":"flow2","source":"app.api"},{"_type":"par","steps":[{"target":"app.db","astPath":"/steps@4/steps@0","source":"app.api"},{"target":"ext","astPath":"/steps@4/steps@1","source":"app.api"}]}]
parsed twoLayouts: {"_type":"element","tags":null,"links":null,"_stage":"parsed","sourcePath":"src/a.c4","description":null,"title":"Folder A / twoLayouts","id":"twoLayouts"}
  rules: [{"direction":"LR"},{"include":[{"wildcard":true}]},{"direction":"BT"}]
parsed index: {"_type":"element","tags":["next"],"links":[{"url":"https://example.com/doc","title":"Doc"}],"_stage":"parsed","sourcePath":"src/a.c4","description":{"txt":"All **elements**"},"title":"Folder A / Landscape","id":"index"}
  rules: [{"include":[{"wildcard":true}]},{"include":[{"custom":{"expr":{"ref":{"model":"app.api"}},"title":"API!","navigateTo":"flow"}}]},{"exclude":[{"where":{"expr":{"ref":{"model":"app"},"selector":"children"},"condition":{"tag":{"eq":"deprecated"}}}}]},{"include":[{"where":{"expr":{"source":{"ref":{"model":"app.web"}},"target":{"ref":{"model":"app.api"}},"isBidirectional":false},"condition":{"kind":{"eq":"async"}}}}]},{"direction":"LR"}]

-- B. computed views --
model.views() ids: [
  'appView',
  'deploy',
  'flow2',
  'appChild2',
  'appChild',
  'flow',
  'twoLayouts',
  'index'
]
computed index: {"_type":"element","title":"Folder A / Landscape","folder":"Folder A","tags":["next"],"autoLayout":{"direction":"LR"},"nodes":["user","app","app.api","ext"],"edges":["app.api->ext"]}
computed flow: {"_type":"dynamic","title":"Folder A / Flow","folder":"Folder A","tags":null,"autoLayout":{"direction":"TB"},"nodes":["app.db","user","app.web","app.api","ext"],"edges":["user->app.web","app.web->app.api","app.api->ext","app.api->app.web","app.api->ext","app.api->app.db","app.api->ext"]}
computed appView: {"_type":"element","title":"Scoped","folder":"","tags":["deprecated"],"autoLayout":{"direction":"RL"},"nodes":["user","app","app.web","app.api","app.db","ext"],"edges":["user->app.web","app.web->app.api","app.api->app.db","app.api->ext"]}
computed appChild: {"_type":"element","title":"Scoped","folder":"","tags":["deprecated","next"],"autoLayout":{"direction":"RL"},"nodes":["user","app","app.web","app.api","app.db","ext"],"edges":["user->app.web","app.web->app.api","app.api->app.db","app.api->ext"]}
computed appChild2: {"_type":"element","title":"Child2","folder":"","tags":["deprecated"],"autoLayout":{"direction":"TB"},"nodes":["user","app","app.web","app.api","app.db","ext"],"edges":["user->app.web","app.web->app.api","app.api->app.db","app.api->ext"]}
computed twoLayouts: {"_type":"element","title":"Folder A / twoLayouts","folder":"Folder A","tags":null,"autoLayout":{"direction":"BT"},"nodes":["user","app","ext"],"edges":["user->app","app->ext"]}
computed deploy: {"_type":"deployment","title":"Deploy","folder":"","tags":null,"autoLayout":{"direction":"TB"},"nodes":["prod.vm1.api","prod.vm1.db"],"edges":["prod.vm1.api->prod.vm1.db"]}
computed flow edge[1]: {"id":"step-02","parent":null,"source":"app.web","target":"app.api","label":"calls","relations":["1fcg3mf"],"color":"gray","line":"dashed","head":"normal","tags":[],"astPath":"/steps@1/source"}
computed flow rules: undefined
computed appChild rules: undefined
computed appChild extends: "appView"
computed appChild description / viewOf: [{"txt":"parent desc"},"app"]
computed appChild2 description: {"txt":"parent desc"}
computed index edge with navigateTo: {"id":"app.api","parent":"app","level":1,"children":[],"inEdges":[],"outEdges":["1kdj3tg"],"title":"API!","modelRef":"app.api","shape":"rectangle","color":"primary","style":{"opacity":15,"size":"md"},"tags":["next"],"kind":"container","navigateTo":"flow","isCustomized":true}

-- C. include x adds x --
before: {"diagnostics":[],"nodes":["app.api"]}
after: {"diagnostics":[],"nodes":["app.api","ext"]}
```

Conclusion:

- Parsed views: `(await ModelBuilder.parseModel()).$data.views[id]` (rules, steps, title with folder prefix `'Folder A / ...'`, untitled -> `'Folder A / <id>'`, description `{txt}`, tags, links). Computed: `(await computeModel()).$data.views[id]` with `nodes`/`edges`; `model.view(id).folder.path` gives the folder. In parsed dynamic views rules and steps are separate arrays (interleaving lost); a series is `{_type:'series'}`, a par block `{_type:'par'}`.
- Two `autoLayout` rules: the last one wins (BT). `extends`: parent rules first then child's, child title/description override else parent's, tags merged, `viewOf` inherited; a child `autoLayout` wins.
- Adding `include ext` adds `ext` to computed nodes.
