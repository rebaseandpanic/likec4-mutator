# Spike 03-reference-scoping

S3: which written references resolve inside views, per LikeC4's linker and validator (all diagnostics shown).

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/03-reference-scoping.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
# a1 no-of include api
  body: "view v {\n include api\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# a2 no-of include app.api
  body: "view v {\n include app.api\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# a3 no-of include nope
  body: "view v {\n include nope\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Referenceable named 'nope'.","ERROR a.c4:37: Validation failed: Element \"nope\" is not resolved"]
  computed v nodes: []
# a4 AMBIG no-of include api
  body: "view v {\n include api\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Referenceable named 'api'.","warn a.c4:40: Prefer one model per document","ERROR a.c4:37: Validation failed: Element \"api\" is not resolved"]
  computed v nodes: []
# a5 XFILE no-of include api
  body: "view v {\n include api\n}"
  diagnostics: ["ERROR v.c4:3: Could not resolve reference to Referenceable named 'api'.","ERROR v.c4:3: Validation failed: Element \"api\" is not resolved"]
  computed v nodes: []
# a6 XFILE no-of include app.api
  body: "view v {\n include app.api\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# b1 of-app include api
  body: "view v of app {\n include api\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# b1b AMBIG of-app include api
  body: "view v of app {\n include api\n}"
  diagnostics: ["warn a.c4:40: Prefer one model per document"]
  computed v nodes: ["app.api"]
# b2 of-app include *
  body: "view v of app {\n include *\n}"
  diagnostics: []
  computed v nodes: ["user","app","app.web","app.api","app.db","ext"]
# b3 of-app include -> api
  body: "view v of app {\n include -> api\n}"
  diagnostics: []
  computed v nodes: ["app.web","app.api"]
# b4 of-app include web -> api
  body: "view v of app {\n include web -> api\n}"
  diagnostics: []
  computed v nodes: ["app.web","app.api"]
# b5 of-app include user (top-level, global)
  body: "view v of app {\n include user\n}"
  diagnostics: []
  computed v nodes: ["user"]
# b6 of-app style api
  body: "view v of app {\n include *\n style api { color red }\n}"
  diagnostics: []
  computed v nodes: ["user","app","app.web","app.api","app.db","ext"]
# b7 of api (relative viewOf)
  body: "view v of api {\n include *\n}"
  diagnostics: []
  computed v nodes: ["app.web","app.api","ext","app.db"]
# c1 extends of-app parent, include api
  body: "view p of app {\n include *\n}\nview v extends p {\n include api\n}"
  diagnostics: []
  computed v nodes: ["user","app","app.web","app.api","app.db","ext"]
# c1b AMBIG extends of-app parent, include api
  body: "view p of app {\n include ext\n}\nview v extends p {\n include api\n}"
  diagnostics: ["warn a.c4:43: Prefer one model per document"]
  computed v nodes: ["app.api","ext"]
# c2 extends no-of parent, include api
  body: "view p {\n include *\n}\nview v extends p {\n include api\n}"
  diagnostics: []
  computed v nodes: ["user","app","app.api","ext"]
# d1 dynamic relative step api -> db
  body: "dynamic view v {\n api -> db\n}"
  diagnostics: []
  computed v nodes: ["app.api","app.db"]
# d1b AMBIG dynamic relative step api -> db
  body: "dynamic view v {\n api -> db\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Referenceable named 'api'.","warn a.c4:40: Prefer one model per document","ERROR a.c4:37: Source not found (not parsed/indexed yet)"]
  computed v nodes: []
# d1c XFILE dynamic relative step api -> db
  body: "dynamic view v {\n api -> db\n}"
  diagnostics: ["ERROR v.c4:3: Could not resolve reference to Referenceable named 'api'.","ERROR v.c4:3: Could not resolve reference to Referenceable named 'db'.","ERROR v.c4:3: Source not found (not parsed/indexed yet)","ERROR v.c4:3: Target not found (not parsed/indexed yet)"]
  computed v nodes: []
# d2 dynamic FQN step
  body: "dynamic view v {\n app.api -> app.db\n}"
  diagnostics: []
  computed v nodes: ["app.api","app.db"]
# d3 dynamic include api
  body: "dynamic view v {\n app.api -> app.db\n include api\n}"
  diagnostics: []
  computed v nodes: ["app.api","app.db"]
# d4 dynamic view of app (syntax)
  body: "dynamic view v of app {\n app.api -> app.db\n}"
  diagnostics: ["ERROR a.c4:36: Expecting token of type '}' but found `of`.","ERROR a.c4:39: Expecting end of file but found `}`."]
  computed v nodes: "NO VIEW v"
# e1 with navigateTo element view
  body: "view t {\n include *\n}\nview v {\n include app.api with { navigateTo t }\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# e2 with navigateTo dynamic view
  body: "dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.api with { navigateTo t }\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# e3 with navigateTo deployment view
  body: "deployment view t {\n include prod.**\n}\nview v {\n include app.api with { navigateTo t }\n}"
  diagnostics: []
  computed v nodes: ["app.api"]
# e4 with navigateTo unknown
  body: "view v {\n include app.api with { navigateTo nope }\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to LikeC4View named 'nope'."]
  computed v nodes: ["app.api"]
# e5 relation with navigateTo element view
  body: "view t {\n include *\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}"
  diagnostics: ["ERROR a.c4:40: Could not resolve reference to DynamicView named 't'."]
  computed v nodes: ["app.web","app.api"]
# e6 relation with navigateTo dynamic view
  body: "dynamic view t {\n app.api -> app.db\n}\nview v {\n include app.web -> app.api with { navigateTo t }\n}"
  diagnostics: []
  computed v nodes: ["app.web","app.api"]
# e7 step navigateTo dynamic view
  body: "dynamic view t {\n app.api -> app.db\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}"
  diagnostics: []
  computed v nodes: ["app.web","app.api"]
# e8 step navigateTo element view
  body: "view t {\n include *\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}"
  diagnostics: ["ERROR a.c4:40: Could not resolve reference to DynamicView named 't'."]
  computed v nodes: ["app.web","app.api"]
# e9 step navigateTo deployment view
  body: "deployment view t {\n include prod.**\n}\ndynamic view v {\n app.web -> app.api { navigateTo t }\n}"
  diagnostics: ["ERROR a.c4:40: Could not resolve reference to DynamicView named 't'."]
  computed v nodes: ["app.web","app.api"]
# e10 step navigateTo unknown
  body: "dynamic view v {\n app.web -> app.api { navigateTo nope }\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to DynamicView named 'nope'."]
  computed v nodes: ["app.web","app.api"]
# f1 extends dynamic view
  body: "dynamic view t {\n app.api -> app.db\n}\nview v extends t {\n include *\n}"
  diagnostics: ["ERROR a.c4:39: Could not resolve reference to ElementView named 't'."]
  computed v nodes: "NO VIEW v"
# f2 extends deployment view
  body: "deployment view t {\n include prod.**\n}\nview v extends t {\n include *\n}"
  diagnostics: ["ERROR a.c4:39: Could not resolve reference to ElementView named 't'."]
  computed v nodes: "NO VIEW v"
# f3 extends unknown
  body: "view v extends nope {\n include *\n}"
  diagnostics: ["ERROR a.c4:36: Could not resolve reference to ElementView named 'nope'."]
  computed v nodes: "NO VIEW v"
# g1 step -[nope]->
  body: "dynamic view v {\n app.api -[nope]-> ext\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to RelationshipKind named 'nope'."]
  computed v nodes: ["app.api","ext"]
# g2 step .nope
  body: "dynamic view v {\n app.api .nope ext\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to RelationshipKind named 'nope'."]
  computed v nodes: ["app.api","ext"]
# g3 predicate -[nope]->
  body: "view v {\n include app.api -[nope]-> ext\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to RelationshipKind named 'nope'."]
  computed v nodes: ["app.api","ext"]
# g4 where tag is #nope
  body: "view v {\n include app.* where tag is #nope\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Tag named '#nope'."]
  computed v nodes: []
# g5 element.tag = #nope
  body: "view v {\n include element.tag = #nope\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Tag named '#nope'."]
  computed v nodes: []
# g6 where kind is nope
  body: "view v {\n include app.* where kind is nope\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to DeploymentNodeOrElementKind named 'nope'."]
  computed v nodes: []
# g7 element.kind = nope
  body: "view v {\n include element.kind = nope\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to ElementKind named 'nope'."]
  computed v nodes: []
# g8 view tag #nope
  body: "view v {\n #nope\n include *\n}"
  diagnostics: ["ERROR a.c4:37: Could not resolve reference to Tag named '#nope'."]
  computed v nodes: ["user","app","ext"]
# h1 deployment include model ref app.api
  body: "deployment view v {\n include app.api\n}"
  diagnostics: ["ERROR a.c4:37: Deployment view predicate must reference deployment model"]
  computed v nodes: []
# h2 deployment include prod.vm1.api
  body: "deployment view v {\n include prod.vm1.api\n}"
  diagnostics: []
  computed v nodes: ["prod.vm1.api"]
# h3 deployment include relation of model refs
  body: "deployment view v {\n include prod.**\n include app.api -> app.db\n}"
  diagnostics: ["ERROR a.c4:38: Model reference is allowed in exclude predicate only","ERROR a.c4:38: Model reference is allowed in exclude predicate only"]
  computed v nodes: "NO VIEW v"
# h4 deployment exclude relation of model refs
  body: "deployment view v {\n include prod.**\n exclude app.api -> app.db\n}"
  diagnostics: []
  computed v nodes: ["prod.vm1.api","prod.vm1.db"]
# h5 deployment include relative vm1
  body: "deployment view v {\n include vm1\n}"
  diagnostics: []
  computed v nodes: ["prod.vm1"]
```

Conclusion:

- Bare names (`api`) in views and steps resolve when the name is unique among the descendants declared in the SAME document's model blocks (or via `view of X` / the `extends` parent's `of`); cross-file or ambiguous bare names fail with `Could not resolve reference to Referenceable named 'api'.`. `dynamic view ... of` is a parse error.
- `with { navigateTo X }` on an element predicate accepts any view type; on a relation predicate or a step only a dynamic view (`Could not resolve reference to DynamicView named 't'.`). `extends` accepts only an element view (`Could not resolve reference to ElementView named 't'.`).
- Undeclared kinds/tags are linker errors naming the reference type (RelationshipKind, Tag, ElementKind, DeploymentNodeOrElementKind). Deployment views reject model refs in include (`Deployment view predicate must reference deployment model`, `Model reference is allowed in exclude predicate only`) but accept them in exclude.
