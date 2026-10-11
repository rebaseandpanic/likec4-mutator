# Spike 04-reference-scoping

How LikeC4 1.59.4 links deployment relation endpoints (node vs instance precedence, qualified names via unique descendants, ambiguity, other files, `this`/`it`, sourceless relations, extend bodies, references into an instance's element). Endpoints read from `$data.deployments.relations`. Note on D4: `cache` resolves to `edge.cache` (unique in the document), so the relation is a self relation and is rejected (`Invalid parent-child relationship`, b.c4:7); the label text is just a marker.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/04-reference-scoping.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
== A. node named like a closer instance (node wins or instance wins?)
diagnostics: []
  'A1': {"deployment":"api"} -> {"deployment":"prod.db"}
== B. qualified name through a unique descendant (prod.api where api is in prod.vm1)
diagnostics: []
  'B1': {"deployment":"prod.vm1.api"} -> {"deployment":"prod.db"}
== C. ambiguous descendant name (two vms each with api)
diagnostics: ["ERROR m.c4:27: Could not resolve reference to Referenceable named 'api'.","ERROR m.c4:27: DeploymentRelation source not resolved"]
== D. parentless root node of another file; non-root of another file
diagnostics: ["ERROR b.c4:7: Invalid parent-child relationship"]
  'D1': {"deployment":"dr.db"} -> {"deployment":"prod"}
  'D2-api-is-non-root-of-this-file-but-unique-in-document': {"deployment":"dr.db"} -> {"deployment":"prod.api"}
  'D3': {"deployment":"edge.cache"} -> {"deployment":"prod.api"}
  'D4-self-ignored': {"deployment":"edge.cache"} -> {"deployment":"edge.cache"}
== E. this / it and sourceless in node and instance bodies
diagnostics: ["ERROR m.c4:22: Invalid parent-child relationship"]
  'E3-sourceless-in-node': {"deployment":"prod"} -> {"deployment":"dr"}
  'E1-sourceless-in-instance': {"deployment":"prod.api"} -> {"deployment":"prod.db"}
  'E2-it-in-instance': {"deployment":"prod"} -> {"deployment":"prod.db"}
== F. reference into the element of an instance
diagnostics: []
  'F1': {"deployment":"prod.db"} -> {"deployment":"prod.api","element":"app.api.sub"}
== G. extend body: names of the extended node, its descendants in other files
diagnostics: []
  'G1': {"deployment":"prod.vm1.api"} -> {"deployment":"prod.db"}
  'G2-extended-node-by-name': {"deployment":"prod"} -> {"deployment":"dr"}
== H. document scope: name unique in this document deployment
diagnostics: []
  'H1-top-level-short-names': {"deployment":"prod.vm1.api"} -> {"deployment":"dr.db"}
```
