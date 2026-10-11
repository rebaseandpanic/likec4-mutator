# Spike 02-computed-model

LikeC4 1.59.4 computed deployment model: raw data layer (`$data.deployments`, `$data.specification.deployments`) and LikeC4Model getters (`model.deployment.element(id)`, `model.deployment.relationships()`): node kind defaults, instance inheritance from the element, `extend <node>` merge across 3 files (`a.c4`, `a/z.c4`, `b.c4`), deployment relation inline/body/kind values.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/02-computed-model.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
diagnostics: []
--- $data.deployments.elements
prod: {"title":"Zone kind title","summary":{"txt":"Zone kind summary"},"description":{"txt":"Zone kind description"},"technology":"Zone kind tech","tags":["zonekind"],"links":[{"url":"https://example.com/zone-kind"}],"style":{"color":"green"},"kind":"zone","id":"prod"}
staging: {"title":"Staging","summary":{"txt":"Zone kind summary"},"description":{"txt":"Zone kind description"},"technology":"Zone kind tech","tags":["own","ext2","ext1"],"links":[{"url":"https://example.com/staging"},{"url":"https://example.com/ext-b"}],"style":{"color":"green"},"kind":"zone","metadata":{"owner":["ops","ext-az","ext-b"],"extra":"x"},"id":"staging"}
named: {"title":"Zone kind title","summary":{"txt":"Zone kind summary"},"description":{"txt":"Zone kind description"},"technology":"Zone kind tech","tags":["zonekind"],"links":[{"url":"https://example.com/zone-kind"}],"style":{"color":"green"},"kind":"zone","id":"named"}
prod.vm1: {"style":{},"kind":"vm","title":"vm1","id":"prod.vm1"}
prod.vm1.api: {"id":"prod.vm1.api","element":"app.api","style":{}}
prod.vm1.api2: {"id":"prod.vm1.api2","element":"app.api","tags":["inst"],"title":"API copy","technology":"Rust","style":{"color":"blue"},"metadata":{"region":"eu"}}
prod.vm1.db: {"id":"prod.vm1.db","element":"app.db","style":{}}
--- $data.deployments.relations
relation: {"title":"calls kind title","technology":"HTTP","tags":["relkind"],"source":{"deployment":"prod.vm1.api"},"target":{"deployment":"prod.vm1.db"},"kind":"calls"}
relation: {"title":"reads","source":{"deployment":"prod.vm1.api"},"target":{"deployment":"prod.vm1.db"}}
relation: {"title":"body title","description":{"txt":"body description"},"technology":"body tech","metadata":{"k":"v"},"tags":["own"],"source":{"deployment":"prod.vm1.api2"},"target":{"deployment":"prod.vm1.db"}}
--- $data.specification.deployments
spec: {"zone":{"title":"Zone kind title","summary":{"txt":"Zone kind summary"},"description":{"txt":"Zone kind description"},"technology":"Zone kind tech","tags":["zonekind"],"links":[{"url":"https://example.com/zone-kind"}],"style":{"color":"green"}},"vm":{"style":{}}}
--- LikeC4Model getters (model.deployment)
prod: {"id":"prod","title":"Zone kind title","summary":"Zone kind summary","description":"Zone kind description","technology":"Zone kind tech","tags":["zonekind"],"links":[{"url":"https://example.com/zone-kind"}],"metadata":{},"kind":"zone"}
staging: {"id":"staging","title":"Staging","summary":"Zone kind summary","description":"Zone kind description","technology":"Zone kind tech","tags":["own","ext2","ext1","zonekind"],"links":[{"url":"https://example.com/staging"},{"url":"https://example.com/ext-b"}],"metadata":{"owner":["ops","ext-az","ext-b"],"extra":"x"},"kind":"zone"}
named: {"id":"named","title":"Zone kind title","summary":"Zone kind summary","description":"Zone kind description","technology":"Zone kind tech","tags":["zonekind"],"links":[{"url":"https://example.com/zone-kind"}],"metadata":{},"kind":"zone"}
prod.vm1: {"id":"prod.vm1","title":"vm1","summary":null,"description":null,"technology":null,"tags":[],"links":[],"metadata":{},"kind":"vm"}
prod.vm1.api: {"id":"prod.vm1.api","title":"API","summary":"api summary","description":"api description","technology":"Go","tags":["svc","own"],"links":[{"url":"https://example.com/api"}],"metadata":{"owner":"team-a","tier":"one"},"element":"app.api"}
prod.vm1.api2: {"id":"prod.vm1.api2","title":"API copy","summary":"api summary","description":"api description","technology":"Rust","tags":["inst","svc","own"],"links":[{"url":"https://example.com/api"}],"metadata":{"region":"eu"},"element":"app.api"}
prod.vm1.db: {"id":"prod.vm1.db","title":"DB","summary":null,"description":null,"technology":"Go","tags":["svc"],"links":[{"url":"https://example.com/svc-kind","title":"svc kind"}],"metadata":{},"element":"app.db"}
relationship: {"source":"prod.vm1.api","target":"prod.vm1.db","kind":"calls","title":"calls kind title","technology":"HTTP","description":null,"tags":["relkind"],"metadata":{}}
relationship: {"source":"prod.vm1.api","target":"prod.vm1.db","kind":null,"title":"reads","technology":null,"description":null,"tags":[],"metadata":{}}
relationship: {"source":"prod.vm1.api2","target":"prod.vm1.db","kind":null,"title":"body title","technology":"body tech","description":"body description","tags":["own"],"metadata":{"k":"v"}}
```
