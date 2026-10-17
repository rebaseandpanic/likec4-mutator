# Test plan: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Requirements**: docs/plan/lc4m-15.30/spec.md · **Plan**: docs/plan/lc4m-15.30/plan.md

**Levels.** Every row is a vitest `unit` test on LikeC4 1.59.4's real parser. A focused run is `npx vitest run --maxWorkers=2 <files>`; the full suite runs in the three parts given in the CLAUDE.md testing section. CLI rows start `npx tsx src/cli.ts` as a subprocess, which is still the unit level. The project has no integration, e2e, smoke or mutation level, so no row uses them. The only approved check that reads code is the coverage-table check inside `npm run lint`; it is a gate, not a row (see "Not tested").

**When run.** It is `wave` for every row: the row runs in the commit of its anchor task and at the end of each group. No row needs a system to be brought up, so no row is `final`.

**Expected values** come from four sources:
- LikeC4 itself, through `tests/helpers/likec4-model.ts`: `expectValidLikeC4`, `buildLikeC4Model` (`$data`, and diagnostics including warnings), `computedViews`, `linkedCatalogueReferences` / `linkedKindReferences` (T039), and `expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`, `expectElementStylesAgreeWithLikeC4`, `introducedWarnings`, `expectSigmaImage` (T002);
- the literal LikeC4 outputs recorded in `spikes/0*.out.txt`;
- the spec rules and decisions;
- the test's own input text.

The library's own output is never the expected value. Rows assert the error type, `field` and structured fields. The only message-text exception is the printed `file:line:column` form of D106 (row 134).

**Columns.**
- "Waits for code" lists the plan tasks whose code the row exercises. The last id is the anchor: the task whose commit creates or edits the row's test file.
- "Needed to run" lists the suppliers of fixtures and helpers. Each is a plan task that comes no later than the anchor in the plan's order, or `—`.

**Abbreviations** (supplier in brackets):
- **FX**: the fixtures `tests/fixtures/refs-catalog/` and `tests/fixtures/refs-flows/` (T001).
- **OR**: `linkedCatalogueReferences` / `linkedKindReferences` (T039).
- **AWB**: the accepted-write bundle `expectAcceptedWrite(before, after[, { removedViewId }])` (T002). It runs `expectValidLikeC4`, runs `expectComputedViewsSurvive`, and checks that no INV-2 warning is introduced.
- **SIG**: `expectSigmaImage(before, after, σ)` with a literal σ (T002).
- **STAB**: every OR reference that resolved before the write and is not removed by it has target σ(old) after it. σ is the identity outside rename and move.
- **GONE**: OR after the write equals OR before minus a literal list of (file, role, text), plus INV-5. INV-5 means the text outside the removed ranges is byte-equal; the test computes those ranges from its own literal.
- **BI**: the call throws `InvalidWriteError` on the named `field`, and `serialize()` and the reads are unchanged (INV-4).
- **RRE**: BI where the error is `ReferencedRemovalError extends InvalidWriteError` (D111). Every removal rejection of `removeElement`, `removeDeploymentNode`, `removeDeploymentInstance`, `removeView`, `removeKind` and `removeTag` takes this form, in both modes.
- **REFS**: `error.references` equals a literal list of `{ file, line, column, role, cascadable, view? }` (1-based; D111, D113).
  - For element, deployment and view removals, `role` is a value of the FR-001 role enum. "Blocking under cascade" means `cascadable: false`.
  - For kind and tag removals, `role` is the FR-002 place name.
  - An unrecovered-token hit has role `unrecovered`; a kind or tag at an unmodelled place has role `opaque-flow` or `global-or-import` (D113).
  - Each entry carries `view?: string`, the id of the view that contains the reference, when it lies in a view (D113).
  - Only reference-caused rejections are `ReferencedRemovalError`; an unknown target or a refused edit stays a plain `InvalidWriteError` (D104, D113).
  - The `file:line` text in `detail` is for humans and is not asserted.
- **CASC**: the result's `cascaded` equals a literal list of `{ file, line, column, role }`, with positions in the state before the write (D112). The key is present only with `cascade: true`; without `cascade` it is absent.
- **P**: a precondition asserted before any loop or parameter use, for example that OR resolves the reference before the write.

| # | What we cover — goes red if … | Type | Where | new / fix | When run | Waits for code | Needed to run |
|---|---|---|---|---|---|---|---|
| 1 | P on the fixtures: both pass `expectValidLikeC4`, their specifications share no kind or tag name (INV-6), each has a CRLF file, and their load order differs from document order — red if a fixture is invalid or lacks one of these | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T001 | — |
| 2 | Role coverage: every FR-001 role-enum value and every FR-002 place (positive and negated) appears in OR on FX; `extend-element-target` appears both resolved and, on an unresolved copy, unresolved — red if a class is missing from the oracle or from the fixtures | unit | `tests/likec4-validate-oracle.test.ts` (T039 oracle) | new | wave | T001, T039 | T001 (FX) |
| 3 | Unmodelled boundary, oracle side: an unresolved reference has target `null`; a reference inside `parallel` / `par` is modelled; references inside a stray `when`, `opt`, `alt`, `try`, `Globals` and an import are unmodelled — red if `parallel` falls on the wrong side or a container is missed | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T039 | T001 (FX) |
| 4 | On the roles they share, OR equals the legacy `linkedReferences` / `linkedViewReferences` on FX — red if the new oracle classifies or resolves those roles differently | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T039 | T001 (FX) |
| 5 | Spike facts as oracle preconditions (parameterized): the bidirectional `tail` rule (spike 01); the `Redundant as icon` warning; `Prefer one specification per document` (spike 04); `does not match any relation`; a D109 deployment view is absent from `computedViews` (spike 06) — red if LikeC4 or the helper no longer shows the fact | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T002 | — |
| 6 | AWB sensitivity: it passes on an unchanged file set and fails on three hand-written after-states (one introduced error, one lost named view, one introduced INV-2 warning) — red if any of the three parts is absent or disabled | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T002 | — |
| 7 | `introducedWarnings`: a warning present both before and after is not reported; a new one is — red if it counts every warning, or none | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T002 | — |
| 8 | `expectSigmaImage` sensitivity: it passes with the correct literal σ on a hand-renamed pair; it fails with the identity σ; it fails when a kind-default value differs — red if σ or the values are ignored | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T002 | T039 (OR) |
| 9 | `expectElementStylesAgreeWithLikeC4` sensitivity: a written `40%` agrees with LikeC4's `40`; a wrong own color fails (D88) — red if opacity is compared unconverted or style is not compared | unit | `tests/likec4-validate-oracle.test.ts` | new | wave | T002 | — |
| 10 | The existing oracle test cases stay green with no edits — red if the helper rewrite changes `validateLikeC4` or `buildLikeC4Model` | unit | `tests/likec4-validate-oracle.test.ts` | fix | wave | T002 | — |
| 11 | Catalogue role coverage: the literal role list is present in the catalogue on both FX and on the unresolved copies — red if a source (`views`-block styles, relationship-body `navigateTo`, globals, imports) is not wired | unit | `tests/query/reference-catalogue.test.ts` (catalogue) | new | wave | T003 | T001 (FX), T039 (OR) |
| 12 | The catalogue equals OR one to one on (file, offset, role, text, target, unmodelled), resolved and unresolved, on both FX — red if an entry is missing or extra, a target is wrong, the role is mis-keyed, or the unmodelled flag is wrong | unit | `tests/query/reference-catalogue.test.ts` | new | wave | T003 | T001 (FX), T039 (OR) |
| 13 | An `addElement` that re-targets a `views`-block style target is reported as a change, and so is one that re-targets a relationship-body `navigateTo` — red if the snapshot does not cover them | unit | `tests/query/reference-snapshot.test.ts` (snapshot) | new | wave | T003 | — |
| 14 | The existing snapshot tests (rows 28–31 and 43–46 of lc4m-15.29) are adapted to the catalogue-based snapshot without a `views` option; their assertions stay the same — red if a formerly opt-in view reference is lost | unit | `tests/query/reference-snapshot.test.ts:93-520` | fix | wave | T003 | — |
| 15 | Row 47 (`:541`) flips: `addElement('other', { name: 'api' })`, which would leave `include api` unresolved, is now BI on `name` (INV-8) — red if view rules are still unchecked | unit | `tests/query/reference-snapshot.test.ts:524-549` | fix | wave | T003 | — |
| 16 | The lc4m-17 repro (`include api`, dynamic `api -> other`, then `addElement('other', { name: 'api' })`) is BI on `name`, parameterized: a top-level step, a step in `opt`, a step in an `alt` branch — red if steps or opaque blocks are unchecked | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | — |
| 17 | The same three repros through `apply`: exit 1, `mutations[0].id`, no file written — red if `apply` bypasses the check or maps the field wrongly | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T003, T007 | — |
| 18 | One case per newly covered reference kind: rule item, step, dynamic `include`, the element target of an element `with { navigateTo }`, the `of` scope of an `extends` view, style target, `rank` target, `views`-block style. An `addElement` that re-targets it is BI on `name`; P: OR resolves it before the write — red if any of these kinds is missing from the snapshot | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | — |
| 19 | `addElement`, `addView`, `addDeploymentNode` and `addDeploymentInstance` with non-colliding names on FX pass AWB and STAB — red if the widened snapshot raises an internal pairing error on an addition | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | T001 (FX), T002 (AWB), T039 (OR) |
| 20 | New mode, element class: an `addElement` name equal to a bare `FqnRef` in an `opt` block, or in a `global` predicate, is BI on `name` — red if the inventory misses opaque or global places | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 21 | New mode, deployment additions: an `addDeploymentNode` name, a named `addDeploymentInstance` id, or an instance id taken from the element, equal to a bare name in an opaque step, is BI on the write's name or id field — red if the inventory is not wired into these writes or the derived id is skipped | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 22 | New mode, view class: an `addView` id equal to a `DynamicViewRef` in an opaque step's `navigateTo`, or to a `ViewRef` in a `global` predicate's `with { navigateTo }`, is BI on `id` — red if view references are not in the inventory | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 23 | New mode, `Imported`: an `addElement` name equal to an imported name is BI on `name` — red if imports are not in the inventory | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T001 (FX) |
| 24 | New mode, unrecovered text: an `addElement` name equal to a bare identifier among another file's unparsed tokens is BI; the same name only in a comment or a string of that file is accepted — red if unrecovered tokens are ignored, or comments and strings are counted | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 25 | A global style with a library icon: an `addElement` passes AWB with no internal error — red if `LibIcon` is not on the ignore list | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T001 (FX), T002 (AWB) |
| 26 | New-mode positions (D107), parameterized: a bare name and a leading dotted segment are BI; a later dotted segment and a longer identifier are accepted with AWB — red if new mode applies the removal rule or a substring match | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 27 | A name found only in a comment or a string value of parsed text: accepted with AWB — red if hidden tokens or strings are treated as references | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 28 | D93: an addition that makes a reference that was unresolved before (an ambiguous name) resolve is accepted; that reference is neither checked nor rewritten — red if references unresolved before are checked | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 29 | Default file (D62): on a project whose load order differs from document order, with both files holding a `model` block, root `addElement` and top-level `addRelationship` change only the first file in path-sorted document order (the test names it as a literal) — red if load order is used | unit | `tests/mutator/root-placement-default.test.ts` | new | wave | T008 | T002 (AWB) |
| 30 | No loaded file has a `model` block: root `addElement` appends one to the first file in document order; AWB; `getElement` reports the new element — red if the write throws or the block goes to another file | unit | `tests/mutator/root-placement-default.test.ts` | new | wave | T008 | T002 (AWB) |
| 31 | `edge-cases.test.ts:159-171` ("throw when model block does not exist", with parent `null` and `''`) are rewritten: the element is added and a `model` block is created (US-5, INV-8) — red if the old rejection persists | unit | `tests/integration/edge-cases.test.ts:159-171` | fix | wave | T008 | — |
| 32 | The deployment and view placement tests stay green with no edits after `chooseBlockPlacement` is widened — red if `deployment` / `views` placement changes | unit | `tests/mutator/views-add.test.ts` (owner; also `tests/mutator/deployment-nodes-add.test.ts`) | fix | wave | T008 | — |
| 33 | `addElement` into a bodiless parent, parameterized over `name = kind …` and `kind name …`, each with and without inline strings: the element is compared with `expectAgreesWithLikeC4`; the declaration text before the new `{` is byte-equal; AWB — red if the body is not created, or the declaration form or the strings are lost | unit | `tests/mutator/add-element-placement.test.ts` (BodyInsertions) | new | wave | T008, T009 | T002 (AWB) |
| 34 | `edge-cases.test.ts:596-604` (a bodiless parent throws) is rewritten: the child is added (D64) — red if the limitation persists | unit | `tests/integration/edge-cases.test.ts:596-604` | fix | wave | T009 | — |
| 35 | Root `addElement` with `file`: a chosen file that has a `model` block, and one that does not (a block is appended); only that file changes; AWB — red if `file` is ignored or the block is not created | unit | `tests/mutator/add-element-placement.test.ts` | new | wave | T008, T009 | T002 (AWB) |
| 36 | `file` rejections, BI on `file`, parameterized: `file` together with a parent; an unloaded name; a name equal to a loaded file only after normalization (`./m.c4`; D63 requires the exact key) — red if any is accepted or a file is created | unit | `tests/mutator/add-element-placement.test.ts` | new | wave | T009 | — |
| 37 | `insert-layout`, `codegen` and the deployment body-creation tests stay green with no edits after the body-insertion code paths are merged — red if the merge changes their output | unit | `tests/mutator/insert-layout.test.ts` (owner; also `codegen.test.ts`, `deployment-nodes-update-remove.test.ts`) | fix | wave | T009 | — |
| 38 | `apply` `addElement` without `parent` (root) and without `title`: AWB; the title LikeC4 shows (the kind title or the name) is compared with `expectAgreesWithLikeC4` — red if `parent` or `title` is still required | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T009, T020 | T002 (AWB) |
| 39 | `apply` `addElement` with both `file` and `parent`, or with an unloaded `file`: exit 1 on `mutations[0].file`, nothing written; an unknown field is rejected — red if the validation or the field mapping is missing | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T020 | — |
| 40 | FR-001 owned rows in both modes, parameterized: a model relationship endpoint (top level, nested, inside an `extend` body); an `extend X` target; an `extend a -> b` endpoint; an orphaned `extend a -> b`. Each is removed; `removedRelationships` equals the literal list; GONE; AWB. Without `cascade` the result has no `cascaded` key; with `cascade` it has `cascaded: []` (D112) — red if owned constructs are rejected by default (D57), are left behind, or `cascaded` appears in default mode | unit | `tests/mutator/remove-element-references.test.ts` (cascade-ops, removal closure) | new | wave | T003, T010 | T001 (FX), T002 (AWB), T039 (OR) |
| 41 | `instanceOf` into the subtree: by default RRE on `fqn` with REFS (`instance-of`, `cascadable: true`); with `cascade`, the instance and its deployment relationships are removed; CASC; GONE; STAB; AWB — red if the cascade leaves the instance or the default accepts | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 42 | A deployment relationship through an instance into the subtree (`prod.gw.sub`): by default RRE with REFS (`deployment-relationship-endpoint`, `cascadable: true`); with `cascade`, the relationship is removed; CASC; GONE; AWB — red if the `{ deployment, element }` target is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 43 | A view `of` on the removed element: RRE on `fqn` in both modes; REFS has the `view-of` entry with `cascadable: false` (D56) — red if the cascade removes the view or the default accepts | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 44 | Predicate items, parameterized: include item, exclude item, `x.*`, `x.**`, `x._`, a relation predicate with the subtree on either side, a wildcard-side relation (`* -> x`), a dynamic `include`, a deployment-view path into an instance, an item inside nested `group`s. By default RRE with REFS (`predicate-item`, `cascadable: true`); with `cascade` the item is removed, with CASC, GONE, STAB and AWB; P: OR resolves the item before the write — red if a variant is not catalogued or the cascade removes too much | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T002 (AWB), T039 (OR) |
| 45 | The `with { … }` and `where` of a cascaded item go with it; a sibling item keeps its own; the rule read back through `getView` equals the literal expected rule; INV-5 — red if a `with` / `where` is orphaned or removed from the wrong item | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 46 | Emptied containers (D55), parameterized: the last include item removes the rule; an emptied nested `group` removes each emptied group (the computed nodes have no `@gr` node, against spike 04's `["@gr1","a"]`); the last target of a style rule; the last target of a `rank` rule; an emptied `par`; an emptied `parallel`. Each passes `expectValidLikeC4` and AWB — red if a container is left behind (a spike 05 parse error, or an empty group box) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 47 | The same element several times in one rule (`include api, api.*, db`): with `cascade`, both `api` items go and `db` stays — red if only the first occurrence is handled | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 48 | Dynamic step endpoints, parameterized: a single step, a chain segment (the whole chain goes), a step in `par`, a step in `parallel`. By default RRE with REFS (`step-endpoint`, `cascadable: true`); with `cascade`, the computed step sequence after the write equals the sequence before minus the literal steps; CASC; AWB — red if a chain is cut or a `par` step is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 49 | Style rule targets in a view and in the `views` block: by default RRE with REFS (`style-target`, `cascadable: true`); with `cascade` the target is removed, and the rule only when it was the last target; CASC; AWB — red if `views`-block styles are not catalogued | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 50 | A `rank` target: by default RRE with REFS (`rank-target`, `cascadable: true`); with `cascade` the target is removed and the rule keeps its other targets; CASC; AWB — red if `rank` is not catalogued | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 51 | References in opaque blocks, parameterized: `opt`, `loop`, `alt` / `if` / `when` / `else`, `try` / `catch` / `finally`, `break`. RRE on `fqn` in both modes; REFS has `opaque-flow` entries with `cascadable: false` — red if the cascade edits an opaque block (D61) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX) |
| 52 | A `global` predicate, a `global` style and an import that name the subtree: RRE in both modes; REFS has `global-or-import` entries with `cascadable: false` — red if globals or imports are ignored | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX) |
| 53 | `where kind is service` and `where tag is #t` are not element references: removing an element named `service` is accepted with AWB — red if `where` tokens are catalogued as element references | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 54 | The a1 model (`view of app.api`, `include app.api`, dynamic `app.api -> app.db`) is RRE in both modes. REFS: `view-of` with `cascadable: false`; the `predicate-item` and `step-endpoint` entries with `cascadable: true` — red if the `of` does not block or the classification is wrong | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 55 | D77 / D108 fixtures, parameterized: a scoped `view of app { include api  exclude x }`; an unscoped `view { include a  exclude b }`; a dynamic view whose only step names the element; `view child extends base { include b }`. Each is RRE under `cascade` — red if excludes, inherited content, or nothing at all counts as content | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 56 | The removed element is the `of` of a view that another view `extends`: RRE; REFS has the `view-of` entry with `cascadable: false`, and its `view` equals the scoped view id; the extending view appears as a second entry (`view-extends`, `view` = extending view id) (D113) — red if the `of` is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 57 | Deployment closure: an element `cascade` that removes an instance included by a deployment view that keeps another `include`. The instance, its relationships and its view items are gone; CASC; GONE; STAB; AWB — red if the closure skips deployment-view items (RES-plan-5) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 58 | The same closure, where the instance was the deployment view's only included content: RRE under D77 — red if D77 skips deployment views | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 59 | Affected mode (D92), parameterized: an element `FqnRef` and a later dotted segment in an opaque block, in a `global` predicate and in a `global` style; an `Imported` name; unrecovered tokens. Each is RRE in both modes; REFS has the hit's `{ file, line, column, cascadable: false }` (role `unrecovered` for an unrecovered-token hit, D113) — red if a class is missing or the dotted-segment rule is not applied | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T007, T010 | — |
| 60 | Affected-mode negatives: a longer identifier, a comment and a string that contain the name do not block; AWB — red if a substring match is used | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 61 | D104: `removeElement` with an unknown FQN, and a removal whose edit is refused (the element's file has a stray `}`), are each `InvalidWriteError` on `fqn`, BI — red if a plain `Error` leaks | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 62 | Without `cascade`, an accepted removal removes no non-owned reference: OR after the write equals OR before minus the literal owned list (INV-3) — red if the default mode silently cascades | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T039 (OR) |
| 63 | A cascade in the CRLF file of FX: the file stays CRLF with no lone LF, and the text outside the removed ranges is byte-equal (INV-5) — red if the line endings or neighbouring text change | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T002 (AWB) |
| 64 | `deployment-reference-stability.test.ts:224-243` stays green with no edits: without `cascade` the result has no `cascaded` key (D112), so `toEqual({ removedRelationships: [] })` holds, and its `detail` checks hold because the human-readable text stays (D111) — red if `cascaded` leaks into default mode | unit | `tests/mutator/deployment-reference-stability.test.ts:224-243` | fix | wave | T010 | — |
| 65 | The existing removal tests stay green with no edits (`mutator.test.ts:405-500` and `:700-730`, `mutation-scenarios`, `validation`, `multi-file`, `cst-layout`, `line-endings`, `extend-elements`, `relationship-extends-remove`): their models have no non-owned reference into the removed subtree — red if owned constructs or unrelated views start to block | unit | `tests/mutator/mutator.test.ts` (owner; the files are listed in the rationale) | fix | wave | T010 | — |
| 66 | `removeDeploymentNode` and `removeDeploymentInstance`, deployment-view rows, parameterized: include, exclude, relation predicate, style target. By default RRE on `id` with REFS (`cascadable: true`); with `cascade` the item is removed, with CASC, GONE and AWB — red if either API lacks the removal closure | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | T002 (AWB), T039 (OR) |
| 67 | Owned constructs of a deployment removal, in both modes: deployment relationships with an endpoint in the subtree, and `extend <node>` blocks of the subtree (also in another file), are removed; AWB — red if owned constructs are rejected (D57) | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T012 | T002 (AWB) |
| 68 | D77 for a deployment removal: a cascade that would remove a deployment view's only `include` is RRE — red if D77 is not applied to deployment views | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T012 | — |
| 69 | Affected mode, deployment ids: a removed deployment id among another file's unrecovered tokens is RRE in both modes; REFS has that hit with role `unrecovered` and `cascadable: false` (RES-plan-8, D113) — red if deployment removals skip the inventory | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T012 | — |
| 70 | D104: an unknown id and a refused edit are each `InvalidWriteError` on `id`, BI, for both APIs — red if a plain `Error` leaks | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T012 | — |
| 71 | These existing deployment removal tests stay green with no edits: `deployment-nodes-update-remove.test.ts:529-558` (D5, row 53) and `:656`, and `deployment-instances-write.test.ts:561`. Their default-mode `toEqual` results carry no `cascaded` key (D112), and their `detail` text stays (D111) — red if the default result shape changes | unit | `tests/mutator/deployment-nodes-update-remove.test.ts` (owner; also `deployment-instances-write.test.ts`) | fix | wave | T012 | — |
| 72 | `removeView`, `navigateTo` in five roles: element `with`, relation `with`, step, model relationship body, deployment relationship body. By default RRE on `id` with REFS (`navigate-to`, `cascadable: true`); with `cascade` the property is removed, and so is a `with { }` left empty (read back through `getView`); CASC; AWB with `removedViewId` — red if a role is missed or an empty `with { }` is left | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | T002 (AWB) |
| 73 | `extends` of the removed view: RRE in both modes; REFS has one `view-extends` entry per view of the two-level chain, each with `cascadable: false` and `view` = that view's id (D113) — red if the cascade removes an inheriting view | unit | `tests/mutator/views-remove.test.ts` | new | wave | T013 | — |
| 74 | A `navigateTo` inside an `opt` step, and one in a `global` predicate's `with`: RRE under `cascade`; REFS has them with `cascadable: false` — red if an unmodelled `navigateTo` is cascaded | unit | `tests/mutator/views-remove.test.ts` | new | wave | T013 | — |
| 75 | D43 under `cascade`: references inside the removed view (a self `navigateTo`, element references) do not block; AWB with `removedViewId` — red if cascade mode lists self-references | unit | `tests/mutator/views-remove.test.ts` | new | wave | T013 | T002 (AWB) |
| 76 | D104 for `removeView`: a refused edit is `InvalidWriteError` on `id`, BI — red if a plain `Error` leaks | unit | `tests/mutator/views-remove.test.ts` | new | wave | T013 | — |
| 77 | The default-mode tests of rows 63, 65 and 94 of lc4m-15.29 stay green with no edits; their `detail` text stays (D111) — red if the default behaviour changes | unit | `tests/mutator/views-remove.test.ts:59-235` | fix | wave | T013 | — |
| 78 | `apply` `cascade` on the four remove ops, both modes: an accepted output passes AWB and GONE; a rejection exits 1 on `mutations[0].fqn` / `id` and writes nothing — red if an op ignores `cascade` | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T010, T012, T013, T014 | T002 (AWB), T039 (OR) |
| 79 | `apply` atomicity: mutation 0 is accepted and mutation 1 is blocked under `cascade`; exit 1 on `mutations[1].fqn`, and no file is written — red if mutation 0 reaches the disk | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T014 | — |
| 80 | `apply` remove ops: a non-boolean `cascade` is reported on `mutations[0].cascade`; an unknown field is rejected — red if the `MUTATION_FIELDS` entry or the validation is missing | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T014 | — |
| 81 | The standalone `remove-element` keeps its options and applies the new rejection: an element referenced from a view rule exits 1 and writes nothing (D84) | unit | `tests/cli/cli-standalone-commands.test.ts` | new | wave | T010, T014 | — |
| 82 | `resolveAt` agrees with LikeC4 at every place kind. For each catalogue entry, `resolveAt(place, text)` equals its target. For one entry per place kind, a bare, a qualified and a full-FQN text written into a copy of the fixture each resolve as OR reports — red if the frames of a place kind are wrong | unit | `tests/query/reference-catalogue.test.ts` (place resolver) | new | wave | T005 | T001 (FX), T039 (OR) |
| 83 | `renameElement`, σ-equality: an element referenced through every FR-001 kind across two files, in relative and qualified forms, gives SIG and AWB — red if a reference kind is not rewritten or is re-targeted | unit | `tests/mutator/rename-element.test.ts` | new | wave | T003, T005 | T001 (FX), T002 (AWB, SIG) |
| 84 | Written form (FR-011): a relative text that still resolves stays byte-equal; a renamed segment is replaced and its selector suffix kept (`x.*` → `y.*`); chain segments are rewritten in place — red if full FQNs are always written or a suffix is lost | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 85 | Two references whose rewritten texts land on one expected prefix are paired correctly; SIG — red if the pairing keys on the old occurrence index | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (SIG) |
| 86 | A title-less element shows the new name; an element whose title comes from its kind keeps the kind title (SIG with the name-derived title) — red if the old name is written as a title | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (SIG) |
| 87 | The unnamed-instance fixture (D97): renaming the deployed element changes the instance id, the deployment-view reference, and the deployment relationships to the instance and to a path under it; SIG over the deployment model — red if the second pass is missing | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T001 (FX), T002 (SIG) |
| 88 | `extend` blocks of the element in other files are rewritten; a kind-first declaration (`service api`) keeps its kind token — red if `extend` targets are skipped or the wrong token is edited | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 89 | D93: a reference with the old name's text that was unresolved before stays byte-equal after the rename — red if references unresolved before are rewritten | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T039 (OR) |
| 90 | Rename rejections, BI, parameterized: an invalid `newName`; a collision with a sibling (`newName`); an unknown `fqn` — red if any is accepted | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 91 | D97 collisions, each BI on `newName`: the unnamed instance's id would equal a sibling node, a named instance, or an instance declared in an `extend` block of the node in another file (LikeC4 reports `Duplicate …`, spikes 05 and 06) — red if siblings in `extend` blocks are not scanned | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 92 | D110: renaming `other.foo` to `api` while `opt { api -> other }` exists is BI on `newName` — red if new mode is not applied to renames | unit | `tests/mutator/rename-element.test.ts` | new | wave | T007, T005 | — |
| 93 | New-mode negatives for `newName`: equal only to a later dotted segment, or contained in a longer identifier, inside an opaque block; accepted with AWB — red if the new name is checked in affected mode | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 94 | Affected mode for the old name: the old name in an opaque block, or in a `global` predicate, makes the rename BI — red if the rename skips the inventory | unit | `tests/mutator/rename-element.test.ts` | new | wave | T010, T005 | — |
| 95 | A reference with no rewritable text (the last clause of FR-011) is BI. The fixture comes from a T005 probe; see RES-T3 | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 96 | A rename in the CRLF file of FX keeps CRLF, and the text outside the rewritten tokens is byte-equal (INV-5) | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T001 (FX), T002 (AWB) |
| 97 | `moveElement`, σ-equality: a subtree referenced through every FR-001 kind across two files gives SIG and AWB — red if a reference kind is not rewritten after the parent changes | unit | `tests/mutator/move-element.test.ts` | new | wave | T005, T017 | T001 (FX), T002 (AWB, SIG) |
| 98 | A move from a later `model` block into an earlier one, and a root-to-root move into another file, are accepted with SIG — red if the pairing does not translate block ordinals or `file′` | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (SIG) |
| 99 | Hierarchy effect (D76): `include app.*` computes `["app.api"]` before and `["app"]` after `app.api` is moved out (spike 03 literals); the move is accepted — red if the move is rejected or the effect differs from the documented one | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 100 | Top-level placement (FR-020, D98), parameterized: a chosen file with a `model` block (the element goes to the end of its first block); a chosen file without one (a block is created); no `file` (the end of the first `model` block of the current file) — red if D62 is used instead of D98, or the wrong block is chosen | unit | `tests/mutator/move-element.test.ts` | new | wave | T008, T017 | T002 (AWB) |
| 101 | A move under a bodiless parent creates that parent's body and keeps its declaration form; AWB | unit | `tests/mutator/move-element.test.ts` | new | wave | T009, T017 | T002 (AWB) |
| 102 | Leading comments: the contiguous comment lines and a trailing comment move with the declaration; a comment separated by a blank line stays; the moved text is re-indented to the new depth and uses the target file's line ending (CRLF) — red if comments or line endings are mishandled | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T001 (FX) |
| 103 | Inside the moved body: a nested relationship between two children keeps its relative text; a reference from the body to outside that would resolve elsewhere from the new place is rewritten; SIG — red if references inside the body are not re-checked | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (SIG) |
| 104 | Cross-file move: the file left behind keeps its `model` block, even if empty; `extend` blocks of the element in other files are rewritten to the new FQN; AWB | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 105 | Move rejections, BI on the named field, parameterized: `file` with a parent target; the same parent; a root move without `file`; the element itself or its own subtree as the target; a name collision at the target; an unknown `fqn` or parent — red if a no-op or a cycle is accepted | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | — |
| 106 | D85 / D99: a cross-file move whose text holds a relative body `icon`, a relative `style { icon }` or a relative link is BI; the same move within one file is accepted with AWB — red if links are not checked or same-file moves are rejected | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 107 | FR-010: moving a deployed element's child out of the instance's subtree while a deployment path names it is BI on `parent` — red if the path is re-targeted | unit | `tests/mutator/move-element.test.ts` | new | wave | T005, T017 | — |
| 108 | After the move, a relationship or step between the element and its new ancestor makes the move BI (LikeC4 reports `Invalid parent-child relationship`) — red if the hierarchy is not re-checked | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | — |
| 109 | Affected mode for the moved subtree: a name of the subtree in an opaque block or in a `global` construct makes the move BI, including a same-named reference to a different element (RES-plan-2, the conservative side) | unit | `tests/mutator/move-element.test.ts` | new | wave | T010, T017 | — |
| 110 | `apply` `renameElement` and `moveElement`: success passes AWB, including a cross-file move that writes two files | unit | `tests/cli/cli-apply-rename-move.test.ts` | new | wave | T005, T017, T018 | T002 (AWB) |
| 111 | `apply` rejections exit 1 on `mutations[i].newName`, `.parent` or `.file` and write nothing; an unknown field is rejected — red if the field mapping or the validation is missing | unit | `tests/cli/cli-apply-rename-move.test.ts` | new | wave | T018 | — |
| 112 | `addKind` for `element`, `relationship` and `deploymentNode` with every default the grammar allows, plus `addTag`. The effective values of elements, relationships and nodes of that kind are compared with the LikeC4 oracle (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`, `expectDeploymentNodesAgreeWithLikeC4`); AWB | unit | `tests/mutator/specification-write.test.ts` | new | wave | T008, T021 | T002 (AWB) |
| 113 | `updateKind` (D33): strings are replaced and `null` removes; `tags` and `links` are replaced; the effective values are compared with the LikeC4 oracle; the kind's style, notation, `multiple` and colors stay byte-equal (INV-5) | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 114 | File choice for kinds and tags: a chosen file's existing `specification` block; a chosen file without one (a block is created); the default on differing orders; never a second block in a file (AWB includes the `Prefer one specification per document` warning) — red if a second block is written | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 115 | Names (D67): element kind `model` is accepted; `view` is BI on `name` (spike 06 parse error); the same name in different types (element and deploymentNode, relationship and element, tag and kind) is accepted with AWB — red if one global name space or a keyword list is used | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 116 | Rejections, BI, parameterized: a same-type duplicate in another file; `summary` on a relationship kind; an undeclared tag in `tags`; an update of an undeclared kind; an update of a kind declared twice (D94); an empty update; an unloaded `file` | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | — |
| 117 | D100: setting, changing or removing a relationship kind's `title` while an `extend a -> b` block applies, or would start to apply, to a title-less relationship of that kind is BI; the same change without such a block is accepted and compared with `expectRelationshipsAgreeWithLikeC4` | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 118 | A kind or tag addition whose name appears bare in an opaque block or a `global` construct is accepted with AWB (D107: such additions are not checked) — red if kind and tag additions run new mode | unit | `tests/mutator/specification-write.test.ts` | new | wave | T007, T021 | T002 (AWB) |
| 119 | `apply` `addKind`, `updateKind` and `addTag`: success passes AWB; rejections exit 1 with the field path and write nothing; unknown fields are rejected | unit | `tests/cli/cli-apply-specification.test.ts` | new | wave | T021, T022 | T002 (AWB) |
| 120 | The FR-002 place catalogue equals `linkedKindReferences` one to one on FX, with unmodelled places excluded on both sides; every `where … kind is` and participant-kind place has type `shared` — red if a place, a negation or a type is wrong | unit | `tests/query/kind-places.test.ts` | new | wave | T023 | T001 (FX), T039 (OR) |
| 121 | `renameKind` / `renameTag`, one case per FR-002 place, positive and negated, across two files: AWB; the computed model reports the new kind or tag name on the same elements and relationships — red if a place is not rewritten | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T001 (FX), T002 (AWB) |
| 122 | Removing a kind or tag that is used only at one place, for each FR-002 place: RRE on `name`; REFS has that place, with `role` the FR-002 place name and `cascadable: false` — red if a use is not detected | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | — |
| 123 | Removing an unused kind or tag: the declaration is gone and the emptied `specification { }` stays (D94; spike 04 shows it valid); AWB — red if the block is removed or a used kind or tag passes | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 124 | Affected mode, kinds and tags: a kind in an opaque step connector, and a tag in a `global` predicate, make the rename BI and the removal RRE, with REFS role `opaque-flow` / `global-or-import` and `cascadable: false` (D113) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T010, T023 | — |
| 125 | The D78 matrix: element kind `vm` and deploymentNode kind `vm`, with and without `where kind is vm` / `where kind is not vm`, in an element view and in a deployment view, renaming each type. BI on `name` when a condition is present; AWB when none is | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 126 | Renaming an element kind to a name a deploymentNode kind already has, while a `where kind is` condition names that name: BI | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | — |
| 127 | D109: renaming a kind or tag used in `element.kind` / `element.tag` expressions of a deployment view (include, exclude, style target). P: the view is absent from `computedViews`; AWB; the rule text read back through `getView` equals a literal; no computed-view comparison | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 128 | Rejections, BI, parameterized: an invalid `newName`, or one already declared for the type; a rename or removal of an undeclared name; a name declared twice (D94) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | — |
| 129 | A tag rename keeps the tag's color block; `#old` inside a string or a markdown value stays byte-equal; in a kind-first declaration, the kind token is rewritten and the name kept (INV-5) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 130 | `apply` rename and remove ops for kinds and tags: success passes AWB; rejections exit 1 with the field path and write nothing; unknown fields are rejected | unit | `tests/cli/cli-apply-specification.test.ts` | new | wave | T023, T025 | T002 (AWB) |
| 131 | The selector, parameterized over `updateRelationship` and `removeRelationship`: `matchKind`, `matchTitle` (the raw inline title) and `matchBidirectional`; `removeRelationship(b, a)` matches `a <-> b`. Only the selected relationship changes; the others stay byte-equal; AWB — red if a field is ignored or the reverse order fails | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 132 | Two relationships identical in every selector field, on different lines and on one line: `RelationshipAmbiguityError` (an `InvalidWriteError`) whose `candidates` equal the literal 1-based `{ file, line, column, kind, title, bidirectional }`; BI — red if the positions are 0-based or only file and line | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 133 | A `candidates[i]` position passed back unchanged selects that candidate, in update and in remove; only that relationship changes — red if `position` is ignored or matched by line only (the same-line case) | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 134 | D106 printed form: the error message contains the `file:line:column` of each candidate, equal to `candidates[i]` — red if the printed and the structured positions differ | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 135 | No match is `InvalidWriteError`, BI, in update and in remove (D87) — red if a plain `Error` is thrown | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 136 | `update-relationship.test.ts:65-86` (`/Multiple relationships match/`) is replaced by an assertion on type, field and `candidates`; `:59-63` and `:116-126` (not-found regex) are handled as the rationale says | unit | `tests/mutator/update-relationship.test.ts:59-126` | fix | wave | T027 | — |
| 137 | `relationship-extends-remove.test.ts:82-93` (two identical `x -> y`, today the first match is removed) is now ambiguous. It is rewritten to select by `position`: the block stays and the surviving relationship keeps tag `a` | unit | `tests/mutator/relationship-extends-remove.test.ts:82-93` | fix | wave | T027 | — |
| 138 | Orphan cleanup through `removeRelationship(selector)`: an `extend a -> b` block that applies only to the removed relationship is removed, others are kept; no `does not match` warning (AWB) — red if the cleanup is lost on the new path | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 139 | Deployment relationship selection is unchanged (D105): `deployment-relationships-write.test.ts` stays green with no edits | unit | `tests/mutator/deployment-relationships-write.test.ts` | fix | wave | T027 | — |
| 140 | The legacy `(source, target)` forms stay green with no edits: `remove-relationship.test.ts:34-109`, `relationship-resolution.test.ts:30-60`, `cst-layout.test.ts:28-31`, `line-endings.test.ts:153` | unit | `tests/mutator/remove-relationship.test.ts` (owner; the others are in the rationale) | fix | wave | T027 | — |
| 141 | `apply` D102 / D106 round trip: an ambiguity in `mutations[1]`, after `mutations[0]` has shifted lines, names `mutations[1]` and gives `candidates` positions in the post-`mutations[0]` state. A second `apply` that passes one of those positions unchanged selects that candidate; AWB | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T027, T028 | T002 (AWB) |
| 142 | `apply` `matchBidirectional` / `position`: wrong types and unknown fields are reported on their `mutations[0].<path>` — red if the validation is missing | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T028 | — |
| 143 | The standalone `remove-relationship` on two identical relationships exits 1 and writes nothing (D84, US-9) | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T027, T028 | — |
| 144 | Direction read: `->`, `<->`, `-[k]<->` and `.k` report `bidirectional` equal to LikeC4's `isBidirectional`, through `expectRelationshipsAgreeWithLikeC4` with direction compared | unit | `tests/query/relationship-direction-read.test.ts` | new | wave | T026 | — |
| 145 | Helper sensitivity: a report with one `bidirectional` flipped fails `expectRelationshipsAgreeWithLikeC4` — red if the helper does not compare direction | unit | `tests/query/relationship-direction-read.test.ts` | new | wave | T026 | — |
| 146 | `ExtendContribution.bidirectional`: an `extend a <-> b` block is reported as bidirectional and applies to an `a <-> b` written in reverse order (spike 01) — red if the block identity lacks the direction | unit | `tests/query/relationship-direction-read.test.ts` | new | wave | T026 | — |
| 147 | Every existing caller of `expectRelationshipsAgreeWithLikeC4` (18 call sites in 6 files) stays green with direction compared | unit | `tests/query/relationship-extends-read.test.ts` (owner; the others are in the rationale) | fix | wave | T026 | — |
| 148 | Every US-8 spelling, parameterized: `-[k]->`, `.k`, `<->`, `-[k]<->`, and the nested `-> t`, `<-> t`, `-[k]-> t`, `-[k]<-> t`, `.k t`, each with title, description, technology, tags, links, metadata and style. Compared with `expectRelationshipsAgreeWithLikeC4` (kind and direction); AWB | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T026, T029 | T002 (AWB) |
| 149 | The nested target text resolves at its place to the requested element (a sibling bare, a distant element qualified); a bodiless source gets a body; the computed endpoints equal the request | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T005, T009, T029 | T002 (AWB) |
| 150 | Top-level `file`: a chosen file; a chosen file without a `model` block; the default on differing orders. Only that file changes; AWB | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T008, T029 | T002 (AWB) |
| 151 | D83: a new relationship whose identity matches an existing `extend a -> b` block is BI; with `shared` it is accepted and the block's values apply (LikeC4 oracle) — red if it silently joins the block or `shared` is ignored | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T029 | T002 (AWB) |
| 152 | Rejections, BI, parameterized: an undeclared `kind`; the dot form with `bidirectional`; `file` with nested placement; an unresolved endpoint; a self-relationship; parent and child as endpoints | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T029 | — |
| 153 | `apply` `addRelationship` with the new fields (`kind`, `kindForm`, `bidirectional`, `placement`, `file`, `shared`): success passes AWB; rejections exit 1 with the field path and write nothing | unit | `tests/cli/cli-apply-extended.test.ts` | new | wave | T029, T030 | T002 (AWB) |
| 154 | `addElementExtend`: a new block in a chosen file (a `model` block is created in a file that has none); a merge into the first existing block of the same target (FR-050: tags, links and metadata appended, a metadata block created if absent). The effective values are compared with the LikeC4 oracle; AWB | unit | `tests/mutator/extend-create.test.ts` | new | wave | T008, T031 | T002 (AWB) |
| 155 | `addRelationshipExtend`: the block is written with a bracket connector carrying the kind, the direction and the relationship's own title; it applies to a dot-form relationship and to a bidirectional one; new-block and merge cases; effective values compared with the LikeC4 oracle; no `does not match any relation` warning (AWB) | unit | `tests/mutator/extend-create.test.ts` | new | wave | T027, T031 | T002 (AWB) |
| 156 | FR-050, no repetition: tags and links already in the target block are not repeated; an identical link in another block is kept (LikeC4 keeps duplicates) | unit | `tests/mutator/extend-create.test.ts` | new | wave | T031 | T002 (AWB) |
| 157 | D72: an identity that matches another relationship is BI; with `shared` the block applies to both (LikeC4 oracle); `shared` with a single match is accepted | unit | `tests/mutator/extend-create.test.ts` | new | wave | T031 | T002 (AWB) |
| 158 | Rejections, BI, parameterized: an unresolved element; an undeclared tag; nothing to add (no property, or every tag and link already present); a D86 metadata key already in the declaration or in an `extend` block in another file; the D82 kind-only title; `file` missing or unloaded | unit | `tests/mutator/extend-create.test.ts` | new | wave | T031 | — |
| 159 | `apply` `addElementExtend` and `addRelationshipExtend`: success passes AWB; rejections exit 1 with the field path and write nothing | unit | `tests/cli/cli-extend.test.ts` | new | wave | T031, T032 | T002 (AWB) |
| 160 | Element styles: every style field of the grammar as own style (the first `style { }` plus a body `icon`), as kind style and combined, with a body `icon` winning over `style { icon }`. Own, kind and effective styles are compared with `$data` through `expectElementStylesAgreeWithLikeC4` (spike 01 `s1`–`s4`) | unit | `tests/query/styles-read.test.ts` | new | wave | T033 | T002 (style helper) |
| 161 | Relationship styles: `line`, `color`, `head` and `tail` as own, kind and effective values; the bidirectional `tail` rule; the relationship kind's `multiple` (spike 01). Compared with `$data` through `expectRelationshipsAgreeWithLikeC4` with style compared | unit | `tests/query/styles-read.test.ts` | new | wave | T026, T033 | — |
| 162 | No theme or configured defaults (D74): an element and a relationship without any style report no effective value that LikeC4's `$data` lacks | unit | `tests/query/styles-read.test.ts` | new | wave | T033 | — |
| 163 | Helper sensitivity: a report with a wrong `line` fails `expectRelationshipsAgreeWithLikeC4` — red if style is not compared | unit | `tests/query/styles-read.test.ts` | new | wave | T033 | — |
| 164 | These stay green with no edits: the helper's callers with style compared; the deployment reader tests; `getSpecification()` reporting names only (`deployment-specification-read.test.ts:201`); the `fromSpecification` deep-equality tests (`spec-defaults-read.test.ts:153,168`, `spec-defaults-relations-read.test.ts:136,150`) | unit | `tests/query/spec-defaults-read.test.ts` (owner; the others are in the rationale) | fix | wave | T033 | — |
| 165 | D75: `updateElement({ style: { icon } })` on an element with a body `icon` rewrites the body `icon` and writes no `style { icon }`; the effective icon is compared with LikeC4; AWB (no `Redundant as icon`) | unit | `tests/mutator/style-body-icon.test.ts` | new | wave | T034 | T002 (AWB) |
| 166 | A `style { icon }` already present next to the body `icon` stays byte for byte (INV-5); an element without a body `icon` keeps today's behaviour (`write-value-checks.test.ts:296-298` stay green) | unit | `tests/mutator/style-body-icon.test.ts` | new | wave | T034 | T002 (AWB) |

## Not tested (with reasons)

- **SC-011** (`npm run lint` with the coverage check, the suite, the build, version 0.11.0): gates of T036 and T038. The coverage-table check is the approved code-reading check that lint runs; it is not a row. The version string and "not published" are a review checklist, because a test that reads `package.json` would be an unapproved code-reading check.
- **SC-012, T035, T037** (README and CHANGELOG content): review checklists of T035 and T037. A test that reads README text is not an approved kind (F2, accepted). Instead, each README example's input and stated values are copied as literals into the feature row that covers them (rows 40–166), and the T035 review checks that.
- **D59, D73, D90, D105 coverage notes**: coverage-table rows (lint), not behaviour. D105's behaviour is row 139.
- **D91** (manual layouts are not read or updated): there is nothing to observe; the library never opens `.likec4.snap` files.
- **D66, the public API names**: checked by `tsc --noEmit` and `tsc -p tests/types` in `npm run lint` (compiler; test guidelines §5).
- **"The T039 helper never calls library code"**: a code-structure property, checked in the G1 review (test guidelines part III).
- **The inventory's "unknown reference type is an internal error"**: it fires only for a grammar class that LikeC4 1.59.4 does not have. Triggering it would need a fabricated AST, which means reaching into internals. Rows 20–24 and 59 cover every class that exists.
- **Performance** ("the catalogue is built once before and once after"): the spec sets no numeric bound (test guidelines frame).
- **RES-plan-1** (`addRelationship` has no `checkMetadata`): out of scope by the plan (lc4m-15.31).
- **The parent-child check on rename**: no rename input can produce it, so it is gated on moves only (row 108; F4, accepted).
- **Writing kind and tag colours, notation and `multiple`** (stage 6): only their preservation is tested (rows 113, 129).

## Known residuals

The ids of earlier rounds are kept; RES-T1 and RES-T2 are closed by D111 and D112.
- **RES-T3 · MINOR.** Row 95: I do not know whether LikeC4 1.59.4 has a place where none of these resolves: the kept text, the replaced segment, or the full FQN. T005 runs a probe. If no such place exists, row 95 moves to "Not tested", with the probe output as proof.
- **RES-T4 · MINOR.** Row 65 relies on reading the fixtures named in the rationale, not on running them. The suite run in T010's commit is the proof; any test that turns red there becomes a listed `fix`.
- **RES-T5 · MINOR.** The plan does not name the rejection field for some writes: the new-mode check of `addDeploymentNode`, D100, D83, D72, and the FR-050 "nothing to add". These rows assert the field that the implementing task documents in its JSDoc. The review checks that it is the write's input field.
- **RES-T6 · MINOR.** Rows 23, 52, 59: whether an `import` passes `expectValidLikeC4` without a multi-project configuration is unverified (ASSUMPTION). Row 1 reveals it. If it fails, those cases move to fixtures built with a project option.

## Source-to-row coverage

**Scenarios**
- US-1: 40–71, 78–81
- US-2: 72–78
- US-3: 82–111
- US-4: 11–28
- US-5: 29–39, 100, 101, 150, 154
- US-6: 112–119
- US-7: 120–130
- US-8: 148–153
- US-9: 131–147
- US-10: 154–159
- US-11: 160–166
- US-12: 17, 38, 39, 78–81, 110, 111, 119, 130, 141, 142, 153, 159

**Invariants**
- INV-1: 6 (the bundle) and every AWB row: 19, 25–30, 33, 35, 38, 40–50, 53, 57, 60, 63, 66, 67, 72, 75, 78, 83–88, 93, 96–104, 106, 110, 112–115, 117–119, 121, 123, 125, 127, 129–131, 133, 138, 141, 148–151, 153–157, 159, 165, 166
- INV-2: 5, 6, 7, 114, 138, 155, 165
- INV-3: 12, 13, 15, 16, 18, 19, 41, 44, 57, 62, 83–89, 97, 98, 103
- INV-4: 15–17, 20–24, 26, 36, 39, 41–44, 48–52, 54–56, 58, 59, 61, 66, 68–70, 72–74, 76, 79, 80, 90–92, 94, 95, 105–109, 111, 116, 117, 122, 124–126, 128, 132, 135, 151, 152, 157, 158
- INV-5: 33, 45, 63, 84, 96, 102, 113, 129, 166
- INV-6: 1 (every fixture row uses both specifications)
- INV-7: 112, 113, 117, 121, 144, 146, 154, 155, 160–162
- INV-8: 15–24, 29, 31, 34, 61, 64, 70, 71, 76, 81, 136, 137, 143, 151, 165
- INV-9: 6 and every AWB row; with `removedViewId`: 72, 75

**Functional requirements**
- FR-001: 2, 11, 12, 40–60, 62, 66–68, 72–75
- FR-002: 2, 120–129
- FR-003: 3, 45, 46, 48, 51, 55, 58, 68
- FR-004: 3, 20–27, 51, 52, 59, 60, 69, 74, 92–94, 109, 118, 124
- FR-010: 87, 91, 97, 107
- FR-011: 82, 84, 85, 95, 103, 149
- FR-020: 100–102
- FR-021: 29, 30, 35, 114, 150
- FR-050: 154–156

**Success criteria**
- SC-001: 40–58, 66–68, 72–74
- SC-002: 41–54, 57, 66, 72
- SC-003: 83, 86, 87, 97–99
- SC-004: 16, 17
- SC-005: 29, 30, 35, 100, 114, 150, 154
- SC-006: 112–130
- SC-007: 144, 145, 148–152
- SC-008: 131–143
- SC-009: 154–158
- SC-010: 160–166
- SC-011: Not tested (gate)
- SC-012: Not tested (review)

**Decisions**
- D53: 16
- D54: 41–52
- D55: 46
- D56: 43, 73
- D57: 40, 67
- D58: 84
- D60: 13, 18, 19
- D61: 51, 52, 74, 94
- D62: 29, 114, 150
- D63: 36, 39
- D64: 33, 34
- D65: 38
- D67: 115
- D68: 148, 149
- D69: 144, 146
- D70: 131
- D71: 154, 158
- D72: 157
- D74: 162
- D75: 165, 166
- D76: 86, 99
- D77: 55, 58, 68
- D78: 125, 126
- D79: 121
- D80: 18, 44, 49, 50
- D81: 132, 133
- D82: 158
- D83: 151
- D84: 81, 143
- D85: 105, 106
- D86: 158
- D87: 135
- D88: 9, 160
- D89: 161, 164
- D92: 59, 60
- D93: 28, 89
- D94: 116, 123, 128
- D97: 87, 91
- D98: 100
- D99: 106
- D100: 117
- D101: 20–24
- D102: 141
- D103: 158
- D104: 61, 70, 76
- D106: 132–134, 141
- D107: 26, 118
- D108: 55
- D109: 5, 127
- D110: 92, 109
- D111: 41–44, 48–52, 54–56, 58, 59, 64, 66, 68, 69, 71–74, 77, 122, 124
- D112: 40, 41, 44, 48–50, 57, 64, 66, 71, 72
- D113: 56, 59, 69, 73, 124
