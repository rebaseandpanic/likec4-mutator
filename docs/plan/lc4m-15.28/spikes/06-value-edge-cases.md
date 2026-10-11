# Spike 06-value-edge-cases

Edge cases of effective values: empty node/instance titles, node titled with its own name, kind-tag order, per-field style merge with kind / element style, repeated metadata blocks, relation kind defaults vs own values, `extend` of a node in another file adding a child.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/06-value-edge-cases.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
diagnostics: []
--- $data.deployments.elements
emptyInline: {"title":"","tags":["k2","k1"],"style":{"color":"green","shape":"cylinder"},"kind":"zone","id":"emptyInline"}
emptyBody: {"title":"","tags":["k2","k1"],"style":{"color":"green","shape":"cylinder"},"kind":"zone","id":"emptyBody"}
selfNamed: {"title":"Kind title","tags":["k2","k1"],"style":{"color":"green","shape":"cylinder"},"kind":"zone","id":"selfNamed"}
ownTags: {"title":"Kind title","tags":["own","k2"],"style":{"color":"green","shape":"queue"},"kind":"zone","metadata":{"a":"1"},"id":"ownTags"}
host: {"style":{},"kind":"vm","title":"host","id":"host","tags":["own"],"links":null}
host.i1: {"id":"host.i1","element":"app.api","title":"","style":{}}
host.i2: {"id":"host.i2","element":"app.api","title":"","style":{"color":"amber"}}
host.i3: {"id":"host.i3","element":"app.api","title":"Inline","summary":{"txt":"inline summary"},"style":{}}
host.inner: {"style":{},"kind":"vm","title":"inner","id":"host.inner"}
--- LikeC4Model getters
emptyInline: {"id":"emptyInline","title":"","summary":null,"description":null,"technology":null,"tags":["k2","k1"],"links":[],"metadata":{},"kind":"zone","style":{"shape":"cylinder","color":"green","opacity":15,"size":"md"}}
emptyBody: {"id":"emptyBody","title":"","summary":null,"description":null,"technology":null,"tags":["k2","k1"],"links":[],"metadata":{},"kind":"zone","style":{"shape":"cylinder","color":"green","opacity":15,"size":"md"}}
selfNamed: {"id":"selfNamed","title":"Kind title","summary":null,"description":null,"technology":null,"tags":["k2","k1"],"links":[],"metadata":{},"kind":"zone","style":{"shape":"cylinder","color":"green","opacity":15,"size":"md"}}
ownTags: {"id":"ownTags","title":"Kind title","summary":null,"description":null,"technology":null,"tags":["own","k2","k1"],"links":[],"metadata":{"a":"1"},"kind":"zone","style":{"shape":"queue","color":"green","opacity":15,"size":"md"}}
host: {"id":"host","title":"host","summary":null,"description":null,"technology":null,"tags":["own"],"links":[],"metadata":{},"kind":"vm","style":{"shape":"rectangle","color":"primary","opacity":15,"size":"md"}}
host.i1: {"id":"host.i1","title":"","summary":null,"description":null,"technology":"Go","tags":[],"links":[],"metadata":{},"element":"app.api","style":{"shape":"browser","color":"red","opacity":15,"size":"md","icon":"tech:go"}}
host.i2: {"id":"host.i2","title":"","summary":null,"description":null,"technology":"Go","tags":[],"links":[],"metadata":{},"element":"app.api","style":{"shape":"browser","color":"amber","opacity":15,"size":"md","icon":"tech:go"}}
host.i3: {"id":"host.i3","title":"Inline","summary":"inline summary","description":"inline summary","technology":"Go","tags":[],"links":[],"metadata":{},"element":"app.api","style":{"shape":"browser","color":"red","opacity":15,"size":"md","icon":"tech:go"}}
host.inner: {"id":"host.inner","title":"inner","summary":null,"description":null,"technology":null,"tags":[],"links":[],"metadata":{},"kind":"vm","style":{"shape":"rectangle","color":"primary","opacity":15,"size":"md"}}
--- relations ($data, then getters)
data: {"title":"Kind rel title","description":{"txt":"Kind rel description"},"technology":"Kind tech","source":{"deployment":"host.i1"},"target":{"deployment":"host.i2"},"kind":"calls"}
data: {"title":"Own title","description":{"txt":"Kind rel description"},"technology":"","source":{"deployment":"host.i1"},"target":{"deployment":"host.i3"},"kind":"calls"}
data: {"title":"","source":{"deployment":"host.i2"},"target":{"deployment":"host.i3"}}
data: {"title":"body","description":{"txt":"Kind rel description"},"technology":"Kind tech","source":{"deployment":"host.i2"},"target":{"deployment":"host.i1"},"kind":"calls"}
getter: {"source":"host.i1","target":"host.i2","kind":"calls","title":"Kind rel title","description":"Kind rel description","technology":"Kind tech"}
getter: {"source":"host.i1","target":"host.i3","kind":"calls","title":"Own title","description":"Kind rel description","technology":"Kind tech"}
getter: {"source":"host.i2","target":"host.i3","kind":null,"title":null,"description":null,"technology":null}
getter: {"source":"host.i2","target":"host.i1","kind":"calls","title":"body","description":"Kind rel description","technology":"Kind tech"}
```
