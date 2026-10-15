# lc4m-15.29 recon: views (element, dynamic, deployment)

LikeC4 / @likec4/language-server 1.59.4. Every claim cites a spike output
(`NN` = `docs/plan/lc4m-15.29/spikes/NN-*.md`), a repo `file:line`, or an LS
line (`LS:n` = `node_modules/@likec4/language-server/dist/chunks/module.mjs`).
Unverified statements are marked ASSUMPTION. Fixture: `_lc4.mts` (`SPEC`,
`MODEL`): kinds system/container/component/actor, relationship `async`, tags
`#next #deprecated`, elements `user`, `ext`, `app{web,api,db}`, deployment
`prod.vm1` with instances of `app.api`, `app.db`.

All spikes run with `npx tsx docs/plan/lc4m-15.29/spikes/<file>.mts`.

## S1 AST / CST shape (unlinked parse, `C4Parser`)

Grammar (00, printed by `scripts/grammar-rules.ts`):
- `ElementViewBody` / `DeploymentViewBody`: `'{' tags=Tags? props+=ViewProperty* rules+=...* '}'`
  — tags strictly first, then props, then rules.
- `DynamicViewBody`: `'{' tags=Tags? props+=DynamicViewProperty* (steps+=StepStatement | rules+=DynamicViewRule)* '}'`
  — steps and rules interleave freely after the props.
- `ElementView`: `'view' name=Id? (('extends' ...) | ('of' viewOf=ElementRef))? body?`
  — `of` and `extends` are mutually exclusive; name optional; body optional.
- `DynamicView` / `DeploymentView`: name required, no `of`/`extends`.
- `ModelViews`: `views folder=String? { (views | styles)* }` — block-level styles.
- `Expressions`: `value=ExpressionV2 ({Expressions.prev=current} ',' value=ExpressionV2?)*`
  — left-recursive, trailing comma allowed. Deployment predicates name the
  feature `expr`, element/dynamic predicates `exprs`.
- `Step` / `StepSeries`: `source=ElementRef (<- | .kind | -> | -[kind]->) target title? custom?`,
  then `StepSeries.source=current` repeated (`<-` only in the first segment).
- `SubflowStep`: `kind=(opt|par|parallel|loop|when|if|else|break) title? { steps }`;
  `AltSteps`: `alt title? { branches+=SubflowStep* }`; try/catch/finally:
  `FinallyBlock.tryCatch -> CatchBlock.try -> TryBlock`.
- Step body = `CustomRelationProperties` (`navigateTo` is a `DynamicViewRef`);
  element `with {}` = `CustomElementProperties` (`navigateTo` is a `ViewRef`).

Observed AST (01):
- Body arrays: element `tags/props/rules`, dynamic `tags/props/steps/rules`,
  deployment `props/rules`. Source order = all members merged and sorted by
  `$cstNode.offset` (01: dynamic `flow` prints `Step`, `include`, `StepSeries`,
  `Step`, `autoLayout`, `Step`... in source order).
- Props seen: `ViewStringProperty` (title/description), `LinkProperty`,
  `DynamicViewDisplayVariantProperty` (variant). Rules seen: `ViewRulePredicate`,
  `ViewRuleGroup` (nested `groupRules`), `ViewRuleRank` (`targets` =
  `FqnExpressions`, also `prev`-linked), `ViewRuleStyle`, `ViewRuleGlobalStyle`,
  `ViewRuleAutoLayout`, `DynamicViewIncludePredicate`,
  `DeploymentViewRulePredicate`, `DeploymentViewRuleStyle`, `ViewRuleAncestors`.
- Expressions: walk `prev`, reverse; item text/offsets = `value.$cstNode`
  (01: `include app.api, app.db,` -> items `app.api [777,784]`, `app.db [786,792]`,
  then an item with `value=UNDEFINED`, node `[777,793]` = the trailing comma).
  `with {...}` belongs to the item: `FqnExprWith [834,876] "app.web with { color red navigateTo flow }"`.
- Step chains: `StepSeries.source` nests down to a `Step`; segment i spans
  `[prev.$cstNode.end, node.$cstNode.end]` (01: `app.web -> app.api` `[1264,1282]`,
  `-[async]-> ext 'x' { notes 'n1' }` `[1282,1316]`). Per segment: `isBackward`
  (`<-`), `kind.$refText` (`-[async]->`), `dotKind` (`.async`), `title`,
  `custom.props` (`NotesProperty`, `RelationNavigateToProperty`, `ColorProperty`,
  `RelationStringProperty:technology`).
- Blocks: `SubflowStep kind=par|parallel|opt|loop|break|if|else` with `title`
  and `steps`; `parallel` keeps `kind=parallel` in the AST (01); `AltSteps.branches`;
  try/catch/finally nest as `FinallyBlock{tryCatch,finally}` ->
  `CatchBlock{try,title,catch}` -> `TryBlock{title,steps}` (01).
- Unlinked parse accepts nested `par` and other validator-level errors
  (01: `parse errors: []` with `parallel` inside `par`).

## S2 Parsed and computed views (in process)

- Parsed: `(await services.likec4.ModelBuilder.parseModel()).$data.views[id]`;
  computed: `(await ModelBuilder.computeModel()).$data.views[id]` (nodes/edges),
  plus `model.view(id)`, `model.views()` (02; LS:2464-2468 interface,
  LS:3793 parseModel, LS:3846 computeModel). `model.views()` order is not
  source order (02: `appView, appChild2, ...`); ASSUMPTION: no order contract.
- Parsed view fields (02): `_type` element|dynamic|deployment, `id`, `title`,
  `description` (`{txt}` / null), `tags` (array / null), `links`
  (`[{url,title}]` / null), `viewOf`, `extends`, `variant`, `rules`, `steps`.
- Folder: `views 'Folder A' { }` prefixes titles: `"Folder A / Landscape"`,
  untitled -> `"Folder A / twoLayouts"` (id) (02; LS:6417); computed
  `model.view(id).folder.path` = `"Folder A"` (02).
- Rule shapes (02): `{include:[{wildcard:true}]}`,
  `{include:[{custom:{expr:{ref:{model:'app.api'}},title:'API!',navigateTo:'flow'}}]}`,
  `{exclude:[{where:{expr:{ref:{model:'app'},selector:'children'},condition:{tag:{eq:'deprecated'}}}}]}`,
  relation where -> `{where:{expr:{source,target,isBidirectional},condition:{kind:{eq:'async'}}}}`,
  autoLayout -> `{direction:'LR'}`, deployment `{include:[{ref:{deployment:'prod'},selector:'descendants'}]}`.
  Block-level `views { style ... }` rules are prepended to every view's rules (LS:6455, LS:6568).
- Dynamic parsed (02): `rules` and `steps` are separate arrays (interleaving
  lost, LS:6568-6569). Step: `{source,target,title?,kind?,notes?{txt},technology?,
  color?,navigateTo?,isBackward?,astPath}`; chain -> `{_type:'series',steps:[..]}`;
  `par` -> `{_type:'par',steps}` (`parallel` normalised to `par`, LS:6718);
  `<-` swaps source/target and sets `isBackward` (LS:6648-6660 parseStep).
- Computed (02): element view `index` nodes `["user","app","app.api","ext"]`;
  dynamic `flow` edges carry `id` `step-02`, `astPath` `/steps@1/source`.
  Adding `include ext` to `view v of app { include app.api }` changes nodes
  `["app.api"]` -> `["app.api","ext"]` (02 C).
- Two `autoLayout` rules: last wins (02 `twoLayouts`: LR then BT -> computed `BT`).
  No autoLayout in a deployment view -> computed `TB` (02 `deploy`).
- `extends` (02; `resolveRulesExtendedViews` in
  `node_modules/@likec4/core/dist/compute-view/index.mjs`, called at LS:3632):
  rules = parent's then child's; title/description = child ?? parent; tags
  merged parent-first (`["deprecated","next"]`); links concatenated; `viewOf`
  inherited (`appChild` viewOf `app`); a child `autoLayout TopBottom` wins
  (`appChild2` -> TB).
- An `index` view is synthesized when none exists (LS:3603-3610).

## S3 Reference scoping in views

Mechanism (LS): element exports are only top-level elements (LS:7349);
each document's root scope gets the descendants that are unique across that
document's model/deployment blocks (LS:7403-7431); a `view of X` body adds X and
X's unique descendants, an `extends` view the parent's `of` scope (LS:7564-7573,
LS:7640). The library already mirrors this for `view ... of X`
(`src/query/workspace-index.ts:488`, `resolveReferenceText(..., 'views')`) and
explicitly does not resolve rule/step references (`workspace-index.ts:534`).

Observed (03):
- (a) no `of`: `include api` resolves to `app.api` when `api` is unique in the
  same document (a1); fails when ambiguous (a4) or when the model is in another
  file (a5): `Could not resolve reference to Referenceable named 'api'.` +
  `Validation failed: Element "api" is not resolved`. `include app.api` works
  across files (a6).
- (b) `view of app`: `include api`, `include -> api`, `include web -> api`,
  `style api` resolve under `app` even when `api` is ambiguous (b1b); top-level
  `user` resolves (b5); `view v of api` resolves to `app.api` (b7).
- (c) `extends` of an `of app` parent: `include api` resolves even when ambiguous
  (c1b); parent without `of`: plain document scope (c2).
- (d) dynamic: steps/includes use the document scope only (d1 ok, d1b ambiguous
  and d1c cross-file fail; d1b/d1c add `Source not found (not parsed/indexed yet)`
  / `Target not found (...)`). `dynamic view v of app` is a parse error (d4).
- (e) `include X with { navigateTo T }`: T may be an element, dynamic or
  deployment view (e1-e3); unknown: `Could not resolve reference to LikeC4View
  named 'nope'.` (e4). On a relation predicate (e5) and a step (e8, e9) only a
  dynamic view: `Could not resolve reference to DynamicView named 't'.`;
  unknown in a step: `... DynamicView named 'nope'.` (e10).
- (f) `extends` a dynamic/deployment view or unknown:
  `Could not resolve reference to ElementView named 't'.` and the view `v`
  is absent from the computed model (f1-f3).
- (g) `-[nope]->` / `.nope` in a step or predicate: `Could not resolve
  reference to RelationshipKind named 'nope'.`; `where tag is #nope`,
  `element.tag = #nope`, view tag `#nope`: `... Tag named '#nope'.`;
  `where kind is nope`: `... DeploymentNodeOrElementKind named 'nope'.`;
  `element.kind = nope`: `... ElementKind named 'nope'.` (g1-g8).
- (h) deployment view: `include app.api` -> `Deployment view predicate must
  reference deployment model` (LS:4891); `include app.api -> app.db` ->
  `Model reference is allowed in exclude predicate only` x2 (LS:4948) and the
  view disappears from the computed model; the same in `exclude` is valid
  (h4); `include vm1` (unique deployment name) resolves to `prod.vm1` (h5).

## S4 Validation matrix (04)

| construct | LikeC4 result |
|---|---|
| `app -> app.api` | `Invalid parent-child relationship` (LS:4356) |
| `app.api -> app.api` | valid |
| `user <- app.web -> app.api` | `Invalid chain after backward step` (LS:4363) |
| `app.web -> app.api -> app.web` | valid (2nd segment parsed as backward, LS:6626) |
| `par { par { } }` | `Nested parallel blocks are not allowed` (LS:4375) |
| `loop { par { } }`, empty `par {}` | valid |
| `if { }` outside `alt` | `"if" alternative branch must be inside "alt"` |
| `opt` inside `alt` | `"opt" can not be used as an alternative branch, only "if", "when" or "else" are allowed` |
| step to unknown element | `Could not resolve reference to Referenceable named 'nope'.` + `Target not found (not parsed/indexed yet)` |
| dynamic view without steps; `view v { }`; `view v` | valid |
| `exclude app.api with { }` | `Invalid usage inside "exclude"` (LS:4853) |
| `include element.kind = .. with {}` / `element.tag = .. with {}` | `Invalid target (expect reference to specific element)` |
| `include * with {}`, `include app.* with {}` (element view) | valid |
| `include * with {}` (dynamic) | warning `Predicate is ignored, as not supported in dynamic views` |
| `include prod.vm1.api with { color red }` (deployment) | valid |
| `include app.api, app.db,` | valid |
| `title` / `link` after `include` | parse error `Expecting token of type '}' but found \`title\`.` / `` `link` `` |
| tags after title | parse error ``... but found `#`.`` |
| `title` twice | valid |
| dynamic: `title` after a step | parse error |
| dynamic: `variant` after `include` | parse error + spurious step errors (`variant sequence` read as a step) |
| `variant` in an element view | parse error |
| same id in two files (element + dynamic) | `Duplicate view 'v'` in both files (LS:4792) |
| `v1 extends v2`, `v2 extends v1` / self-extends | NO diagnostic, `validate()` `[]`; console `View "v2" extends from "v1" which creates a cycle`; computed views = `["index"]` only — both views silently dropped |
| `view v of app extends p` | parse error |
| navigateTo / extends target removed | linker error at the referrer (`LikeC4View` / `DynamicView` / `ElementView named 'gone'`) |
| `view this` | `Reserved word: this` |

## S5 Write feasibility via text edits (05)

All edits located with `C4Parser` CST offsets; all accepted by `validate()`
(same as `tests/helpers/likec4-model.ts:271` `validateLikeC4`):
- A: `include ext` inserted before a trailing `autoLayout` -> valid, `ext` among
  nodes, autoLayout kept `LR`.
- B1/B2: `include` in a dynamic body before the trailing `autoLayout` and
  between two steps -> valid, node added.
- C1: step inserted before `steps[1]` -> valid; later step ids shift
  (`step-02:app.web->ext`, old `step-02` becomes `step-03`).
- C2: step appended inside `par` -> `step-04:par.02`.
- D: two consecutive steps wrapped in a new `par { }` -> valid
  (`step-02:par.01`, `step-02:par.02`). D2: wrapping steps that have an
  `include` between them in source -> parse errors (rule inside `par`).
- E1: `#next`, `title`, `description`, `link` inserted at body start of a body
  without props -> valid; computed title/description/tags/links as written.
- E2: tags must be first: before an existing title -> valid; after it ->
  `Expecting token of type '}' but found \`#\`.` (E2-neg).
- E3: `link` after the last prop, before the first rule -> valid.
- E4: `title` before the first step of a dynamic view -> valid.
- Observed: tags written `#next, #deprecated` compute as `["deprecated","next"]` (E2).

## S6 Library today (06)

- `addView` with no views block: `Error: No file with a views block found`
  (`src/mutator/mutator.ts:934-935`; `view-ops.ts:24-26` has its own
  `No views block found in document`).
- Placement: end of the FIRST `views` block (`ast.views?.[0]`,
  `src/mutator/view-ops.ts:23`) of the first file that has one
  (`mutator.ts:2219-2224`); 06: all three views landed in `b.c4`'s first block,
  not in `views 'Second'` nor `c.c4`.
- Text (`src/mutator/codegen.ts:450` `generateView`): header, `title`, one
  `include` per item, `autoLayout` (default `TopBottom`, `''` omits); element
  view without includes gets `include *`. Checks: id syntax and duplicate id
  across loaded files (`mutator.ts:923-928`, `viewIds` `mutator.ts:2111`),
  includes parse as exactly one include rule (`src/parser/grammar.ts:106-128`
  `isSingleIncludeRule`), `of` target resolved (`mutator.ts:939-941`).
- `includes: ['app.web -> app.api']` on a dynamic view is written and passes
  `validate()`, but LikeC4 parses it to `{"include":[]}` with no nodes (06;
  LS:6579-6590 keeps only `FqnExprOrWith` items).
- No read API for views exists (`src/index.ts` exports `AddViewOpts`,
  `GenerateViewOpts`, `generateView` only — grep of `View` in `src/index.ts`).

## FOR-PLAN mechanism notes (no spec decisions)

1. Source order of view bodies is only in the CST: merge `tags/props/rules/steps`
   by `$cstNode.offset`; LikeC4's parsed model loses rule/step interleaving.
2. Insertion anchors follow the grammar: tags at body start; props after tags,
   before the first rule/step; rules/steps after props; an "append rule" must
   decide relative to a trailing `autoLayout` (last autoLayout wins, 02).
3. `Expressions` / `FqnExpressions` / `Tags` are `prev`-linked lists; item
   boundaries come from `value.$cstNode`; a trailing comma is an item with
   `value` undefined (a remover must handle the separator).
4. Step-chain segments are recoverable from nested `StepSeries.source`
   offsets; `<-` is legal only on the first segment of a chain (LS:4363).
5. Reference scoping for written view text: document-unique descendants +
   `view of X` / `extends` parent `of` scope for element views; dynamic views
   only the document scope; deployment views deployment names (model refs only
   in `exclude` or relation predicates of exclude). The existing
   `resolveReferenceText(..., 'views')` covers only the outside-of-body case.
6. Step `navigateTo` and relation-`with` `navigateTo` must target a dynamic
   view; element-`with` `navigateTo` any view; `extends` only an element view.
7. Validation gaps the oracle does not catch: `extends` cycles (silent drop of
   views, `validate()` clean) and relation predicates in dynamic includes
   (silently empty). A write check cannot rely on `validate()` for these.
8. Removing a view leaves linker errors at every `navigateTo` / `extends`
   referrer (04) — a remover needs a reverse index over view references.
9. Computed step ids are positional (`step-NN[:par.MM]`, `astPath /steps@i`) —
   any step insert/remove/wrap renumbers later steps.
10. `addView` today targets only the first views block of the first file and
    has no folder/file choice (06).
