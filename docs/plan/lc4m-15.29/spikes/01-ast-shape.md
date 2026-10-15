# Spike 01-ast-shape

S1: AST/CST shape of element, dynamic and deployment views from the library's unlinked parse (`C4Parser`): members in source order, `Expressions` items, step-chain segments, subflow blocks, each with CST offsets and text.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/01-ast-shape.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
parse errors: []
ModelViews keys: [ 'name', 'views', 'styles' ] folder: undefined styles: [ 'ViewRuleGlobalStyle' ]

== {"type":"ElementView","name":"index"} body [643,1045]
  body keys: [ 'tags', 'props', 'rules' ]
  Tags [649,667] "#next, #deprecated" values=#next,#deprecated
  prop ViewStringProperty key=title [672,689] "title 'Landscape'"
  prop ViewStringProperty key=description [694,711] "description 'All'"
  prop LinkProperty key=link [716,750] "link https://example.com/doc 'Doc'"
  rule ViewRulePredicate [755,764] "include *"
  rule   item Expressions value=WildcardExpression [763,764] "*"
  rule ViewRulePredicate [769,793] "include app.api, app.db,"
  rule   item Expressions value=FqnRefExpr [777,784] "app.api"
  rule   item Expressions value=FqnRefExpr [786,792] "app.db"
  rule   item Expressions value=UNDEFINED (trailing comma, node [777,793] "app.api, app.db,")
  rule ViewRulePredicate [798,821] "exclude user -> app.web"
  rule   item Expressions value=DirectedRelationExpr [806,821] "user -> app.web"
  rule ViewRulePredicate [826,876] "include app.web with { color red navigateTo flow }"
  rule   item Expressions value=FqnExprWith [834,876] "app.web with { color red navigateTo flow }"
  rule ViewRuleGroup [881,921] "group 'Core' {\n      include app.*\n    }"
  rule   ViewRulePredicate [902,915] "include app.*"
  rule     item Expressions value=FqnRefExpr [910,915] "app.*"
  rule ViewRuleRank [926,955] "rank same { app.api, app.db }"
  rule   item FqnExpressions value=FqnRefExpr [938,945] "app.api"
  rule   item FqnExpressions value=FqnRefExpr [947,953] "app.db"
  rule ViewRuleStyle [960,987] "style app.* { color muted }"
  rule   item FqnExpressions value=FqnRefExpr [966,971] "app.*"
  rule ViewRuleGlobalStyle [992,1009] "global style mute"
  rule ViewRuleAutoLayout [1014,1041] "autoLayout LeftRight 120 80"

== {"type":"ElementView","name":"appView","viewOf":"app"} body [1068,1087]
  body keys: [ 'rules', 'props' ]
  rule ViewRulePredicate [1074,1083] "include *"
  rule   item Expressions value=WildcardExpression [1082,1083] "*"

== {"type":"ElementView","name":"appView2","extends":"appView"} body [1120,1141]
  body keys: [ 'rules', 'props' ]
  rule ViewRulePredicate [1126,1137] "include ext"
  rule   item Expressions value=FqnRefExpr [1134,1137] "ext"

== {"type":"DynamicView","name":"flow"} body [1162,1887]
  body keys: [ 'tags', 'props', 'steps', 'rules' ]
  Tags [1168,1173] "#next" values=#next
  prop ViewStringProperty key=title [1178,1190] "title 'Flow'"
  prop DynamicViewDisplayVariantProperty key=variant [1195,1211] "variant sequence"
  step Step [1216,1239] "user -> app.web 'opens'"
  step   segment [1216,1239] "user -> app.web 'opens'" {"source":"user","isBackward":false,"target":"app.web","title":"opens"}
  rule DynamicViewIncludePredicate [1244,1259] "include app.api"
  rule   item Expressions value=FqnRefExpr [1252,1259] "app.api"
  step StepSeries [1264,1316] "app.web -> app.api -[async]-> ext 'x' { notes 'n1' }"
  step   segment [1264,1282] "app.web -> app.api" {"source":"app.web","isBackward":false,"target":"app.api"}
  step   segment [1282,1316] "-[async]-> ext 'x' { notes 'n1' }" {"kind":"async","target":"ext","title":"x","custom":["NotesProperty:notes"]}
  step Step [1321,1347] "app.web <- app.api 'reply'"
  step   segment [1321,1347] "app.web <- app.api 'reply'" {"source":"app.web","isBackward":true,"target":"app.api","title":"reply"}
  rule ViewRuleAutoLayout [1352,1372] "autoLayout TopBottom"
  step Step [1377,1395] "app.api .async ext"
  step   segment [1377,1395] "app.api .async ext" {"source":"app.api","isBackward":false,"dotKind":".async","target":"ext"}
  step Step [1400,1509] "app.api -> app.db {\n      notes 'reads'\n      navigateTo flow2\n      color amber\n      technology 'SQL'\n    }"
  step   segment [1400,1509] "app.api -> app.db {\n      notes 'reads'\n      navigateTo flow2\n      color amber\n      technology 'SQL'\n    }" {"source":"app.api","isBackward":false,"target":"app.db","custom":["NotesProperty:notes","RelationNavigateToProperty:navigateTo","ColorProperty:color","RelationStringProperty:technology"]}
  step SubflowStep kind=par title=undefined [1514,1595] "par {\n      app.web -> app...
  step   Step [1526,1544] "app.web -> app.api"
  step     segment [1526,1544] "app.web -> app.api" {"source":"app.web","isBackward":false,"target":"app.api"}
  step   SubflowStep kind=parallel title=inner [1551,1589] "parallel 'inner' { app.api ...
  step     Step [1570,1587] "app.api -> app.db"
  step       segment [1570,1587] "app.api -> app.db" {"source":"app.api","isBackward":false,"target":"app.db"}
  step SubflowStep kind=opt title=cached [1600,1634] "opt 'cached' { app.api -> a...
  step   Step [1615,1632] "app.api -> app.db"
  step     segment [1615,1632] "app.api -> app.db" {"source":"app.api","isBackward":false,"target":"app.db"}
  step SubflowStep kind=loop title=undefined [1639,1666] "loop { app.web -> app.api }...
  step   Step [1646,1664] "app.web -> app.api"
  step     segment [1646,1664] "app.web -> app.api" {"source":"app.web","isBackward":false,"target":"app.api"}
  step AltSteps title=choice [1671,1756]
  step   SubflowStep kind=if title=a [1692,1720] "if 'a' { app.api -> app.db ...
  step     Step [1701,1718] "app.api -> app.db"
  step       segment [1701,1718] "app.api -> app.db" {"source":"app.api","isBackward":false,"target":"app.db"}
  step   SubflowStep kind=else title=undefined [1727,1750] "else { app.api -> ext }"...
  step     Step [1734,1748] "app.api -> ext"
  step       segment [1734,1748] "app.api -> ext" {"source":"app.api","isBackward":false,"target":"ext"}
  step FinallyBlock title=undefined keys=tryCatch,finally [1761,1850]
  step   CatchBlock title=C keys=try,title,catch [1761,1819]
  step     TryBlock title=T keys=title,steps [1761,1790]
  step       Step [1771,1788] "app.api -> app.db"
  step         segment [1771,1788] "app.api -> app.db" {"source":"app.api","isBackward":false,"target":"app.db"}
  step     catch: StepsBlock
  step       Step [1803,1817] "app.api -> ext"
  step         segment [1803,1817] "app.api -> ext" {"source":"app.api","isBackward":false,"target":"ext"}
  step   finally: StepsBlock
  step     Step [1830,1848] "app.web -> app.api"
  step       segment [1830,1848] "app.web -> app.api" {"source":"app.web","isBackward":false,"target":"app.api"}
  step SubflowStep kind=break title=undefined [1855,1883] "break { app.web -> app.api ...
  step   Step [1863,1881] "app.web -> app.api"
  step     segment [1863,1881] "app.web -> app.api" {"source":"app.web","isBackward":false,"target":"app.api"}

== {"type":"DynamicView","name":"flow2"} body [1909,1934]
  body keys: [ 'steps', 'props', 'rules' ]
  step Step [1915,1930] "user -> app.web"
  step   segment [1915,1930] "user -> app.web" {"source":"user","isBackward":false,"target":"app.web"}

== {"type":"DeploymentView","name":"deploy"} body [1960,2110]
  body keys: [ 'props', 'rules' ]
  prop ViewStringProperty key=title [1966,1980] "title 'Deploy'"
  rule DeploymentViewRulePredicate [1985,2000] "include prod.**"
  rule   item Expressions value=FqnRefExpr [1993,2000] "prod.**"
  rule DeploymentViewRulePredicate [2005,2024] "exclude prod.vm1.db"
  rule   item Expressions value=FqnRefExpr [2013,2024] "prod.vm1.db"
  rule DeploymentViewRuleStyle [2029,2055] "style prod.* { color red }"
  rule   item FqnExpressions value=FqnRefExpr [2035,2041] "prod.*"
  rule ViewRuleAncestors [2060,2081] "includeAncestors true"
  rule ViewRuleAutoLayout [2086,2106] "autoLayout LeftRight"
```

Conclusion:

- Source order of a body = `tags`, `props`, `rules` (and `steps`) merged and sorted by `$cstNode.offset`; in a dynamic body steps and rules are separate arrays, so interleaving is recoverable only from offsets.
- `Expressions` items: walk `prev` and reverse; each item text = `value.$cstNode`; a trailing comma leaves an outermost `Expressions` node with `value` undefined.
- A chain `a -> b -[k]-> c` is nested `StepSeries.source` down to a `Step`; segment i spans from the end of the previous node's CST to the end of its own. `par`/`opt`/`loop`/`break`/`if`/`else` are `SubflowStep` (`kind`, `title`, `steps`); `alt` is `AltSteps.branches`; `try/catch/finally` nest as `FinallyBlock.tryCatch -> CatchBlock.try -> TryBlock`.
