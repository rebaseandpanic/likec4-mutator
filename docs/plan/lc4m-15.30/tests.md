# Test plan: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Requirements**: docs/plan/lc4m-15.30/spec.md · **Plan**: docs/plan/lc4m-15.30/plan.md (including "Amendment after stage 4 (D111 to D115)")

**Levels.** Every row is a vitest `unit` test on LikeC4 1.59.4's real parser.
- A focused run is `npx vitest run --maxWorkers=2 <files>`. The full suite runs in the three parts given in the CLAUDE.md testing section.
- CLI rows start `npx tsx src/cli.ts` as a subprocess. That is still the unit level.
- The project has no integration, e2e, smoke or mutation level, so no row uses them.
- The only approved check that reads code is the coverage-table check inside `npm run lint`. It is a gate, not a row (see "Not tested").

**When run.** Every row is `wave`: it runs in the commit of its anchor task and at the end of each group. No row needs a system to be brought up, so no row is `final`.

**No helper self-tests (D115).** No row tests a test helper on its own. The facts that T039 and T002 used to gate as "precondition tests" are now P assertions inside the product rows that use them, checked before any loop:
- fixture validity and INV-6: row 2;
- oracle role coverage and the unmodelled boundary: rows 2 and 3;
- the spike facts: rows 111, 125, 137, 153, 161 and 164.

**Expected values** come from four sources:
- LikeC4 itself, through `tests/helpers/likec4-model.ts`:
  - `expectValidLikeC4`;
  - `buildLikeC4Model` (`$data`, and diagnostics including warnings);
  - `computedViews`;
  - `linkedCatalogueReferences` / `linkedKindReferences` (T039);
  - `expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`, `expectElementStylesAgreeWithLikeC4`, `introducedWarnings`, `expectSigmaImage` (T002);
- the literal LikeC4 outputs recorded in `spikes/0*.out.txt`;
- the spec rules and decisions;
- the test's own input text.

The library's own output is never the expected value. Rows assert the error type, `field` and the structured fields. The only message-text exception is the printed `file:line:column` form of D106 (row 132).

**Columns.**
- "Waits for code" lists the plan tasks whose code the row exercises, with the owners from the plan amendment for D111–D114. The last id is the anchor: the task whose commit creates or edits the row's test file.
- "Needed to run" lists the suppliers of fixtures and helpers. Each is a plan task no later than the anchor in the plan's order, or `—`.

**Abbreviations** (supplier in brackets):
- **FX**: the fixtures `tests/fixtures/refs-catalog/` and `tests/fixtures/refs-flows/` (T001).
- **OR**: `linkedCatalogueReferences` / `linkedKindReferences` (T039).
- **AWB**: the accepted-write bundle `expectAcceptedWrite(before, after[, { removedViewId }])` (T002). It runs `expectValidLikeC4`, runs `expectComputedViewsSurvive`, and checks that no INV-2 warning was introduced.
- **SIG**: `expectSigmaImage(before, after, σ)` with a literal σ (T002).
- **STAB**: every OR reference that resolved before the write and is not removed by it has target σ(old) after it. σ is the identity outside rename and move.
- **GONE**: OR after the write equals OR before minus a literal list of (file, role, text), plus INV-5. INV-5 means that text outside the removed ranges is byte-equal; the test computes those ranges from its own literal.
- **BI**: the call throws `InvalidWriteError` on the named `field`, and `serialize()` and the reads are unchanged (INV-4).
- **RRE**: BI where the error is `ReferencedRemovalError extends InvalidWriteError` (D111; exported from `src/index.ts` by T010). Every reference-caused removal rejection takes this form, in both modes, for:
  - `removeElement` (T010);
  - `removeDeploymentNode` and `removeDeploymentInstance` (T012);
  - `removeView` (T013);
  - `removeKind` and `removeTag` (T023).
- **REFS**: `error.references` equals a literal list of `{ file, line, column, role, cascadable, view? }` (1-based; D111, D113).
  - For element, deployment and view removals, `role` is a value of the FR-001 role enum. "Blocking under cascade" means `cascadable: false`.
  - For kind and tag removals, `role` is the FR-002 place name.
  - An unrecovered-token hit has role `unrecovered`. That value appears only in `references`, never in the catalogue or the oracle.
  - A kind or tag at an unmodelled place has role `opaque-flow` or `global-or-import` (D113).
  - Each entry carries `view?: string`: the id of the view that contains the reference, when the reference lies in a view.
  - An unknown target or a refused edit is a plain `InvalidWriteError`, not a `ReferencedRemovalError` (D104, D113).
  - The `file:line` text in `detail` is for humans and is not asserted.
- **REL**: `error.related` equals a literal list of `{ file, line, column, construct }` (1-based; D114). `construct` is one of `deployment-path`, `extend-block`, `where-condition` or `relationship`.
- **CASC**: the result's `cascaded` equals a literal list of `{ file, line, column, role }`, with positions in the state before the write (D112). The key is present only with `cascade: true`; without `cascade` it is absent.
- **P**: a precondition asserted before any loop or parameter use.

| # | What we cover — goes red if … | Type | Where | new / fix | When run | Waits for code | Needed to run |
|---|---|---|---|---|---|---|---|
| 1 | The existing oracle test cases stay green with no edits — red if the helper rewrite changes `validateLikeC4` or `buildLikeC4Model` | unit | `tests/likec4-validate-oracle.test.ts` | fix | wave | T002 | — |
| 2 | Catalogue role coverage. P (D115): every FX file passes `expectValidLikeC4`; the two specifications share no kind or tag name (INV-6); each FX has a CRLF file; load order differs from document order; the literal role list is present in OR on both FX and on the unresolved copies, with `extend-element-target` both resolved and unresolved. Then the same list is present in the catalogue. The list is the catalogue/oracle FR-001 role enum and excludes `unrecovered` (D113) — red if a source (`views`-block styles, relationship-body `navigateTo`, globals, imports) is not wired, or a fixture lacks a class | unit | `tests/query/reference-catalogue.test.ts` (catalogue) | new | wave | T003 | T001 (FX), T039 (OR) |
| 3 | The catalogue equals OR one to one on (file, offset, role, text, target, unmodelled), resolved and unresolved, on both FX. P (D115): OR gives `null` for an unresolved reference; `parallel` / `par` are modelled; a stray `when`, `opt`, `alt`, `try`, `Globals` and an import are unmodelled; on their shared roles, OR equals the legacy `linkedReferences` / `linkedViewReferences` — red if an entry is missing or extra, a target is wrong, the role is mis-keyed, or the unmodelled flag is wrong | unit | `tests/query/reference-catalogue.test.ts` | new | wave | T003 | T001 (FX), T039 (OR) |
| 4 | Unrecovered text stays outside the equality (RES-plan-6). A copy of FX gets an extra file whose parse error leaves identifier tokens unrecovered: the offsets of those tokens are absent from OR and from the catalogue, and the equality of row 3 holds on the other files — red if either side emits entries for unrecovered text | unit | `tests/query/reference-catalogue.test.ts` | new | wave | T003 | T001 (FX), T039 (OR) |
| 5 | An `addElement` that re-targets a `views`-block style target is reported as a change, and so is one that re-targets a relationship-body `navigateTo` — red if the snapshot does not cover them | unit | `tests/query/reference-snapshot.test.ts` (snapshot) | new | wave | T003 | — |
| 6 | The existing snapshot tests (rows 28–31 and 43–46 of lc4m-15.29) are adapted to the catalogue-based snapshot without a `views` option; their assertions stay the same — red if a formerly opt-in view reference is lost | unit | `tests/query/reference-snapshot.test.ts:93-520` | fix | wave | T003 | — |
| 7 | lc4m-15.29 row 47 (`:541`) flips: `addElement('other', { name: 'api' })`, which would leave `include api` unresolved, is now BI on `name` (INV-8) — red if view rules are still unchecked | unit | `tests/query/reference-snapshot.test.ts:524-549` | fix | wave | T003 | — |
| 8 | The lc4m-17 repro (`include api`, dynamic `api -> other`, then `addElement('other', { name: 'api' })`) is BI on `name`. Parameterized: a top-level step, a step in `opt`, a step in an `alt` branch — red if steps or opaque blocks are unchecked | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | — |
| 9 | The same three repros through `apply`: exit 1, `mutations[0].id`, no file written — red if `apply` bypasses the check or maps the field wrongly | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T003, T007 | — |
| 10 | One case per newly covered reference kind: rule item, step, dynamic `include`, the element target of an element `with { navigateTo }`, the `of` scope of an `extends` view, style target, `rank` target, `views`-block style. An `addElement` that re-targets it is BI on `name`. P: OR resolves the reference before the write — red if a kind is missing from the snapshot | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | — |
| 11 | `addElement`, `addView`, `addDeploymentNode` and `addDeploymentInstance` with non-colliding names on FX pass AWB and STAB — red if the widened snapshot raises an internal pairing error on an addition | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T003, T007 | T001 (FX), T002 (AWB), T039 (OR) |
| 12 | New mode, element class: an `addElement` name equal to a bare `FqnRef` in an `opt` block, or in a `global` predicate, is BI on `name` — red if the inventory misses opaque or global places | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 13 | New mode, deployment additions: an `addDeploymentNode` name, a named `addDeploymentInstance` id, or an instance id taken from the element, equal to a bare name in an opaque step, is BI on the write's name or id field — red if the inventory is not wired into these writes or the derived id is skipped | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 14 | New mode, view class: an `addView` id equal to a `DynamicViewRef` in an opaque step's `navigateTo`, or to a `ViewRef` in a `global` predicate's `with { navigateTo }`, is BI on `id` — red if view references are not in the inventory | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 15 | New mode, `Imported`: an `addElement` name equal to an imported name is BI on `name` — red if imports are not in the inventory | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T001 (FX) |
| 16 | New mode, unrecovered text: an `addElement` name equal to a bare identifier among another file's unparsed tokens is BI; the same name only in a comment or a string of that file is accepted — red if unrecovered tokens are ignored, or comments and strings are counted | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | — |
| 17 | A global style with a library icon: an `addElement` passes AWB with no internal error — red if `LibIcon` is not on the ignore list | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T001 (FX), T002 (AWB) |
| 18 | New-mode positions (D107), parameterized: a bare name and a leading dotted segment are BI; a later dotted segment and a longer identifier are accepted with AWB — red if new mode applies the removal rule or a substring match | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 19 | A name found only in a comment or a string value of parsed text is accepted with AWB — red if hidden tokens or strings are treated as references | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 20 | D93: an addition that makes a previously unresolved reference (an ambiguous name) resolve is accepted; that reference is neither checked nor rewritten — red if references that were unresolved before are checked | unit | `tests/mutator/add-references-stability.test.ts` | new | wave | T007 | T002 (AWB) |
| 21 | Default file (D62): on a project whose load order differs from document order, with both files holding a `model` block, root `addElement` and top-level `addRelationship` change only the first file in path-sorted document order (named as a literal) — red if load order is used | unit | `tests/mutator/root-placement-default.test.ts` | new | wave | T008 | T002 (AWB) |
| 22 | No loaded file has a `model` block: root `addElement` appends one to the first file in document order; AWB; `getElement` reports the element — red if the write throws or the block goes to another file | unit | `tests/mutator/root-placement-default.test.ts` | new | wave | T008 | T002 (AWB) |
| 23 | `edge-cases.test.ts:159-171` ("throw when model block does not exist", with parent `null` and `''`) are rewritten: the element is added and a `model` block is created (US-5, INV-8) — red if the old rejection persists | unit | `tests/integration/edge-cases.test.ts:159-171` | fix | wave | T008 | — |
| 24 | The deployment and view placement tests stay green with no edits after `chooseBlockPlacement` is widened — red if `deployment` or `views` placement changes | unit | `tests/mutator/views-add.test.ts` (owner; also `tests/mutator/deployment-nodes-add.test.ts`) | fix | wave | T008 | — |
| 25 | `addElement` into a bodiless parent, parameterized over `name = kind …` and `kind name …`, each with and without inline strings. The element is compared with `expectAgreesWithLikeC4`; the declaration text before the new `{` is byte-equal; AWB — red if the body is not created, or the form or the strings are lost | unit | `tests/mutator/add-element-placement.test.ts` (BodyInsertions) | new | wave | T008, T009 | T002 (AWB) |
| 26 | `edge-cases.test.ts:596-604` (a bodiless parent throws) is rewritten: the child is added (D64) — red if the limitation persists | unit | `tests/integration/edge-cases.test.ts:596-604` | fix | wave | T009 | — |
| 27 | Root `addElement` with `file`: a chosen file with a `model` block, and one without (a block is appended). Only that file changes; AWB — red if `file` is ignored or the block is not created | unit | `tests/mutator/add-element-placement.test.ts` | new | wave | T008, T009 | T002 (AWB) |
| 28 | `file` rejections, BI on `file`, parameterized: `file` together with a parent; an unloaded name; a name that equals a loaded file only after normalization (`./m.c4`; D63 exact key) — red if any is accepted or a file is created | unit | `tests/mutator/add-element-placement.test.ts` | new | wave | T009 | — |
| 29 | The insert-layout, codegen and deployment body-creation tests stay green with no edits after the body-insertion paths are merged — red if the merge changes their output | unit | `tests/mutator/insert-layout.test.ts` (owner; also `tests/mutator/codegen.test.ts`, `tests/mutator/deployment-nodes-update-remove.test.ts`) | fix | wave | T009 | — |
| 30 | `apply` `addElement` without `parent` (root) and without `title`: AWB; the title LikeC4 shows (the kind title or the name) is compared with `expectAgreesWithLikeC4` — red if `parent` or `title` is still required | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T009, T020 | T002 (AWB) |
| 31 | `apply` `addElement` with both `file` and `parent`, or with an unloaded `file`: exit 1 on `mutations[0].file`, nothing written; an unknown field is rejected — red if the validation or the field mapping is missing | unit | `tests/cli/cli-apply-validation.test.ts` | new | wave | T020 | — |
| 32 | FR-001 owned rows in both modes, parameterized: a model relationship endpoint (top level, nested, inside an `extend` body); an `extend X` target; an `extend a -> b` endpoint; an orphaned `extend a -> b`. Each is removed; `removedRelationships` equals the literal list; GONE; AWB. Without `cascade` there is no `cascaded` key; with `cascade` the result has `cascaded: []` (D112) — red if owned constructs are rejected (D57) or left behind, or `cascaded` appears without `cascade` | unit | `tests/mutator/remove-element-references.test.ts` (cascade-ops, removal closure) | new | wave | T003, T010 | T001 (FX), T002 (AWB), T039 (OR) |
| 33 | `instanceOf` into the subtree. By default: RRE on `fqn`, with REFS (`instance-of`, `cascadable: true`). With `cascade`: the instance and its deployment relationships are removed; CASC; GONE; STAB; AWB — red if the cascade leaves the instance or the default accepts | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 34 | A deployment relationship through an instance into the subtree (`prod.gw.sub`). By default: RRE with REFS (`deployment-relationship-endpoint`, `cascadable: true`). With `cascade`: removed; CASC; GONE; AWB — red if the `{ deployment, element }` target is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 35 | A view `of` on the removed element: RRE on `fqn` in both modes, with REFS `view-of` and `cascadable: false` (D56) — red if the cascade removes the view or the default accepts | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 36 | Predicate items, parameterized: include item, exclude item, `x.*`, `x.**`, `x._`, a relation predicate with the subtree on either side, `* -> x`, a dynamic `include`, a deployment-view path into an instance, an item inside nested `group`s. By default: RRE with REFS (`predicate-item`, `cascadable: true`). With `cascade`: the item is removed; CASC, GONE, STAB, AWB. P: OR resolves the item before the write — red if a variant is not catalogued or the cascade removes too much | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T002 (AWB), T039 (OR) |
| 37 | The `with { … }` and `where` of a cascaded item go with it, and a sibling item keeps its own. The rule read back through `getView` equals the literal expected rule; INV-5 — red if a `with` / `where` is orphaned or removed from the wrong item | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 38 | Emptied containers (D55), parameterized: the last include item removes the rule; an emptied nested `group` removes each emptied group (no `@gr` node is computed, against spike 04's `["@gr1","a"]`); the last style target; the last `rank` target; an emptied `par`; an emptied `parallel`. Each passes `expectValidLikeC4` and AWB — red if a container is left behind | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 39 | The same element several times in one rule (`include api, api.*, db`): with `cascade`, both `api` items go and `db` stays — red if only the first occurrence is handled | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 40 | Dynamic step endpoints, parameterized: a single step, a chain segment (the whole chain goes), a step in `par`, a step in `parallel`. By default: RRE with REFS (`step-endpoint`, `cascadable: true`). With `cascade`: the computed step sequence after the write equals the sequence before minus the literal steps; CASC; AWB — red if a chain is cut or a `par` step is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 41 | Style rule targets in a view and in the `views` block. By default: RRE with REFS (`style-target`, `cascadable: true`). With `cascade`: the target is removed, and the rule only when it was its last target; CASC; AWB — red if `views`-block styles are not catalogued | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 42 | A `rank` target. By default: RRE with REFS (`rank-target`, `cascadable: true`). With `cascade`: the target is removed and the rule keeps its other targets; CASC; AWB — red if `rank` is not catalogued | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 43 | References in opaque blocks, parameterized: `opt`, `loop`, `alt` / `if` / `when` / `else`, `try` / `catch` / `finally`, `break`. RRE on `fqn` in both modes, with REFS `opaque-flow` and `cascadable: false` — red if the cascade edits an opaque block (D61) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX) |
| 44 | A `global` predicate, a `global` style and an import that name the subtree: RRE in both modes, with REFS `global-or-import` and `cascadable: false` — red if globals or imports are ignored | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX) |
| 45 | `where kind is service` and `where tag is #t` are not element references: removing an element named `service` is accepted with AWB — red if `where` tokens are catalogued as element references | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 46 | The a1 model (`view of app.api`, `include app.api`, dynamic `app.api -> app.db`) is RRE in both modes. REFS: `view-of` with `cascadable: false`; the `predicate-item` and `step-endpoint` entries with `cascadable: true` — red if the `of` does not block or the classification is wrong | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 47 | D77 / D108 fixtures, parameterized: a scoped `view of app { include api  exclude x }`; an unscoped `view { include a  exclude b }`; a dynamic view whose only step names the element; `view child extends base { include b }`. Each is RRE under `cascade`. REFS has the content-producing statement with role `predicate-item` or `step-endpoint`, `cascadable: true`, and `view` set to the id of the view that would lose its last content — red if excludes, inherited content or nothing counts as content, or the wrong view is named | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 48 | The removed element is the `of` of a view that another view `extends`. RRE; REFS has the `view-of` entry with `cascadable: false` and `view` = the scoped view's id, plus a `view-extends` entry with `view` = the extending view's id (D113) — red if the `of` is missed | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 49 | Deployment closure: an element `cascade` removes an instance that a deployment view includes, and that view keeps another `include`. The instance, its relationships and its view items are gone; CASC; GONE; STAB; AWB — red if the closure skips deployment-view items (RES-plan-5) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB), T039 (OR) |
| 50 | The same closure where the instance was the deployment view's only included content: RRE under D77. REFS has the deployment view's `predicate-item` with `cascadable: true` and `view` = that deployment view's id — red if D77 skips deployment views or names another view | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 51 | Affected mode (D92), parameterized, each RRE in both modes with REFS `cascadable: false`: an element `FqnRef` and a later dotted segment in an opaque block (role `opaque-flow`); the same two in a `global` predicate and in a `global` style (`global-or-import`); an `Imported` name (`global-or-import`); unrecovered tokens (`unrecovered`) — red if a class is missing, a role is wrong, or the dotted-segment rule is not applied | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T007, T010 | — |
| 52 | Affected-mode negatives: a longer identifier, a comment and a string that contain the name do not block; AWB — red if a substring match is used | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T002 (AWB) |
| 53 | D104: `removeElement` with an unknown FQN, and a removal whose edit is refused (the element's file has a stray `}`), are each `InvalidWriteError` on `fqn` and **not** a `ReferencedRemovalError`; BI — red if a plain `Error` leaks or the subclass is used (D113) | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | — |
| 54 | Without `cascade`, an accepted removal removes no non-owned reference: OR after equals OR before minus the literal owned list (INV-3) — red if the default mode silently cascades | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T039 (OR) |
| 55 | A cascade in the CRLF file of FX: the file stays CRLF with no lone LF, and the text outside the removed ranges is byte-equal (INV-5) — red if line endings or neighbouring text change | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T010 | T001 (FX), T002 (AWB) |
| 56 | Continuation after an accepted write that shifts positions. On a multi-file copy of FX, an `addElement` inserts lines above the referencing statements of another view; a following `removeElement(…, { cascade: true })` on the same instance gives CASC with the literal positions after the addition (the state before the removal) and GONE; AWB — red if the removal uses positions or targets cached from before the addition | unit | `tests/mutator/remove-element-references.test.ts` | new | wave | T007, T010 | T001 (FX), T002 (AWB), T039 (OR) |
| 57 | `deployment-reference-stability.test.ts:224-243` stays green with no edits. Without `cascade` the result has no `cascaded` key (D112), so `toEqual({ removedRelationships: [] })` holds; its `detail` checks hold because the human-readable text stays (D111) — red if `cascaded` leaks into default mode | unit | `tests/mutator/deployment-reference-stability.test.ts:224-243` | fix | wave | T010 | — |
| 58 | The existing removal tests stay green with no edits, because their models have no non-owned reference into the removed subtree: `tests/mutator/mutator.test.ts:405-500, 700-730`, `tests/integration/mutation-scenarios.test.ts:200-250`, `tests/integration/validation.test.ts:134-180, 302`, `tests/integration/multi-file.test.ts:243-250, 415-450`, `tests/integration/cst-layout.test.ts:20-70`, `tests/integration/edge-cases.test.ts:215, 254, 285`, `tests/mutator/line-endings.test.ts:152`, `tests/mutator/extend-elements.test.ts:108, 139`, `tests/mutator/extend-properties-write.test.ts:373`, `tests/mutator/relationship-extends-remove.test.ts:95-108` — red if owned constructs or unrelated views start to block | unit | `tests/mutator/mutator.test.ts` (owner) | fix | wave | T010 | — |
| 59 | `removeDeploymentNode` and `removeDeploymentInstance`, deployment-view rows, parameterized: include, exclude and relation predicate (`predicate-item`); style target (`style-target`). By default: RRE on `id` with REFS (that role, `cascadable: true`). With `cascade`: the item is removed; CASC, GONE, AWB — red if either API lacks the removal closure or a role is wrong | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | T002 (AWB), T039 (OR) |
| 60 | Owned constructs of a deployment removal, in both modes: deployment relationships with an endpoint in the subtree and `extend <node>` blocks of the subtree (also in another file) are removed; AWB — red if owned constructs are rejected (D57) | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | T002 (AWB) |
| 61 | D77 for a deployment removal: a cascade that would remove a deployment view's only `include` is RRE. REFS has that `predicate-item` with `cascadable: true` and `view` = the deployment view's id — red if D77 is not applied to deployment views or names another view | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | — |
| 62 | Affected mode, deployment ids in unrecovered text: a removed deployment id among another file's unrecovered tokens is RRE in both modes, with REFS `unrecovered` and `cascadable: false` (RES-plan-8) — red if deployment removals skip the inventory | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | — |
| 63 | Affected mode, deployment ids at recovered unmodelled places, parameterized over `removeDeploymentNode` / `removeDeploymentInstance`: the removed id named in an opaque step (`opaque-flow`) and in a `global` construct (`global-or-import`), each once as a whole name and once as a later dotted segment. RRE in both modes; REFS with that role and `cascadable: false`. P: the input passes `expectValidLikeC4` (RES-T7) — red if the removal scans only unrecovered tokens or uses new mode | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | — |
| 64 | D104: an unknown id and a refused edit are each `InvalidWriteError` on `id`, **not** a `ReferencedRemovalError`, BI, for both APIs — red if a plain `Error` leaks or the subclass is used | unit | `tests/mutator/deployment-remove-references.test.ts` | new | wave | T010, T012 | — |
| 65 | These existing deployment removal tests stay green with no edits: `tests/mutator/deployment-nodes-update-remove.test.ts:529-558, 656` and `tests/mutator/deployment-instances-write.test.ts:561`. Their default-mode `toEqual` results have no `cascaded` key (D112) and their `detail` text stays (D111) — red if the default result shape changes | unit | `tests/mutator/deployment-nodes-update-remove.test.ts` (owner; also `tests/mutator/deployment-instances-write.test.ts`) | fix | wave | T012 | — |
| 66 | `removeView`, `navigateTo` in five roles: element `with`, relation `with`, step, model relationship body, deployment relationship body. By default: RRE on `id` with REFS (`navigate-to`, `cascadable: true`). With `cascade`: the property is removed, and so is a `with { }` left empty (read back through `getView`); CASC; AWB with `removedViewId` — red if a role is missed or an empty `with { }` is left | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | T002 (AWB) |
| 67 | `extends` of the removed view: RRE in both modes. REFS has one `view-extends` entry per view of the two-level chain, each with `cascadable: false` and `view` = that view's id (D113) — red if the cascade removes an inheriting view | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | — |
| 68 | A `navigateTo` inside an `opt` step and one in a `global` predicate's `with`: RRE under `cascade`, with REFS roles `opaque-flow` and `global-or-import`, both `cascadable: false` — red if an unmodelled `navigateTo` is cascaded or gets a modelled role | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | — |
| 69 | Affected mode for `removeView`: the view id among another file's unrecovered tokens is RRE in both modes, with REFS `unrecovered` and `cascadable: false` — red if `removeView` skips the inventory for unrecovered text | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | — |
| 70 | D43 under `cascade`: references inside the removed view (a self `navigateTo`, element references) do not block; AWB with `removedViewId` — red if cascade mode lists self-references | unit | `tests/mutator/views-remove.test.ts` | new | wave | T013 | T002 (AWB) |
| 71 | D104 / D113 for `removeView`, parameterized: an unknown id, an id declared in two files, the generated id of an unnamed view, and a refused edit are each `InvalidWriteError` on `id`, **not** a `ReferencedRemovalError`, BI — red if a plain `Error` leaks or the subclass is used on a path without references | unit | `tests/mutator/views-remove.test.ts` | new | wave | T010, T013 | — |
| 72 | The default-mode tests of rows 63, 65 and 94 of lc4m-15.29 stay green with no edits; their `detail` text stays (D111) — red if the default behaviour changes | unit | `tests/mutator/views-remove.test.ts:59-235` | fix | wave | T013 | — |
| 73 | `apply` `cascade` on the four remove ops, both modes: an accepted output passes AWB and GONE; a rejection exits 1 on `mutations[0].fqn` / `id` and writes nothing — red if an op ignores `cascade` | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T010, T012, T013, T014 | T002 (AWB), T039 (OR) |
| 74 | `apply` atomicity: mutation 0 is accepted and mutation 1 is blocked under `cascade`. Exit 1 on `mutations[1].fqn`; no file is written — red if mutation 0 reaches the disk | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T014 | — |
| 75 | `apply` remove ops: a non-boolean `cascade` is reported on `mutations[0].cascade`; an unknown field is rejected — red if the `MUTATION_FIELDS` entry or the validation is missing | unit | `tests/cli/cli-apply-references.test.ts` | new | wave | T014 | — |
| 76 | The standalone `remove-element` keeps its options and applies the new rejection: an element referenced from a view rule exits 1 and writes nothing (D84) | unit | `tests/cli/cli-standalone-commands.test.ts` | new | wave | T010, T014 | — |
| 77 | `resolveAt` agrees with LikeC4 at every place kind. For each catalogue entry, `resolveAt(place, text)` equals its target. For one entry per place kind, a bare, a qualified and a full-FQN text written into a copy resolve as OR reports — red if the frames of a place kind are wrong | unit | `tests/query/reference-catalogue.test.ts` (place resolver) | new | wave | T005 | T001 (FX), T039 (OR) |
| 78 | `renameElement`, σ-equality: an element referenced through every FR-001 kind across two files, in relative and qualified forms, gives SIG and AWB — red if a reference kind is not rewritten or is re-targeted | unit | `tests/mutator/rename-element.test.ts` | new | wave | T003, T005 | T001 (FX), T002 (AWB, SIG) |
| 79 | Written form (FR-011): a relative text that still resolves stays byte-equal; a renamed segment is replaced and its selector suffix kept (`x.*` → `y.*`); chain segments are rewritten in place — red if full FQNs are always written or a suffix is lost | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 80 | FR-011 order, parameterized. (a) Kept text and segment replacement both resolve elsewhere after the rename, and the full FQN resolves correctly. P: OR on hand-written copies with each earlier text shows the wrong target. Then the written text equals the literal full FQN and the target equals σ(old). (b) Segment replacement suffices: the written text equals the literal replaced-segment text, not the full FQN. SIG; AWB — red if the writer stops at segment replacement or always writes the full FQN. If (a) is unreachable in LikeC4 1.59.4, the T005 probe decides (RES-T3) | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB, SIG), T039 (OR) |
| 81 | Two references whose rewritten texts land on one expected prefix are paired correctly; SIG — red if the pairing keys on the old occurrence index | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (SIG) |
| 82 | A title-less element shows the new name; an element whose title comes from its kind keeps the kind title (SIG with the name-derived title) — red if the old name is written as a title | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (SIG) |
| 83 | The unnamed-instance fixture (D97): renaming the deployed element changes the instance id, the deployment-view reference, and the deployment relationships to the instance and to a path under it; SIG over the deployment model — red if the second pass is missing | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T001 (FX), T002 (SIG) |
| 84 | `extend` blocks of the element in other files are rewritten; a kind-first declaration (`service api`) keeps its kind token — red if `extend` targets are skipped or the wrong token is edited | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 85 | D93: a reference with the old name's text that was unresolved before stays byte-equal after the rename — red if previously unresolved references are rewritten | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T039 (OR) |
| 86 | Rename rejections, BI, parameterized: an invalid `newName`; a collision with a sibling (`newName`); an unknown `fqn` — red if any is accepted | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 87 | D97 collisions, each BI on `newName`: the unnamed instance id would equal a sibling node, a named instance, or an instance declared in an `extend` block of the node in another file (LikeC4 `Duplicate …`, spikes 05 and 06) — red if siblings in `extend` blocks are not scanned | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 88 | D110: renaming `other.foo` to `api` while `opt { api -> other }` exists is BI on `newName` — red if new mode is not applied to renames | unit | `tests/mutator/rename-element.test.ts` | new | wave | T007, T005 | — |
| 89 | New-mode negatives for `newName`: equal only to a later dotted segment, or contained in a longer identifier, inside an opaque block; accepted with AWB — red if the new name is checked in affected mode | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T002 (AWB) |
| 90 | Affected mode for the old name, parameterized: the old name as a whole identifier, and as a later dotted segment, in an opaque block and in a `global` predicate. Each makes the rename BI — red if the rename skips the inventory or checks the old name in new mode | unit | `tests/mutator/rename-element.test.ts` | new | wave | T010, T005 | — |
| 91 | A reference with no rewritable text (the last clause of FR-011) is BI. The fixture comes from a T005 probe (RES-T3) | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | — |
| 92 | A rename in the CRLF file of FX keeps CRLF, and text outside the rewritten tokens is byte-equal (INV-5) | unit | `tests/mutator/rename-element.test.ts` | new | wave | T005 | T001 (FX), T002 (AWB) |
| 93 | Continuation after a rejected write. On a multi-file copy of FX, warm the reads. Then the lc4m-17 repro `addElement` is rejected by the post-edit stability check, BI. A following `renameElement` on the same instance gives the literal expected text in each changed file, SIG, STAB and AWB — red if the rename runs on a catalogue or index generation from the rejected intermediate state | unit | `tests/mutator/rename-element.test.ts` | new | wave | T007, T005 | T001 (FX), T002 (AWB, SIG), T039 (OR) |
| 94 | `moveElement`, σ-equality: a subtree referenced through every FR-001 kind across two files gives SIG and AWB — red if a reference kind is not rewritten after the parent changes | unit | `tests/mutator/move-element.test.ts` | new | wave | T005, T017 | T001 (FX), T002 (AWB, SIG) |
| 95 | A move from a later `model` block into an earlier one, and a root-to-root move into another file, are accepted with SIG — red if the pairing does not translate block ordinals or `file′` | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (SIG) |
| 96 | Hierarchy effect (D76): `include app.*` computes `["app.api"]` before and `["app"]` after `app.api` is moved out (spike 03 literals); the move is accepted — red if the move is rejected or the effect differs from the documented one | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 97 | Top-level placement (FR-020, D98), parameterized: a chosen file with a `model` block (end of its first block); a chosen file without one (a block is created); no `file` (end of the first `model` block of the current file) — red if D62 is used instead of D98, or the wrong block is chosen | unit | `tests/mutator/move-element.test.ts` | new | wave | T008, T017 | T002 (AWB) |
| 98 | A move under a bodiless parent creates that parent's body, keeping its declaration form; AWB | unit | `tests/mutator/move-element.test.ts` | new | wave | T009, T017 | T002 (AWB) |
| 99 | Leading comments: contiguous comment lines and a trailing comment move with the declaration; a comment separated by a blank line stays; the text is re-indented to the new depth and uses the target file's line ending (CRLF) — red if comments or line endings are mishandled | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T001 (FX) |
| 100 | Inside the moved body: a nested relationship between two children keeps its relative text; a reference from the body to outside that would resolve elsewhere from the new place is rewritten; SIG — red if references inside the body are not re-checked | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (SIG) |
| 101 | Cross-file move: the file left behind keeps its `model` block, even if empty; `extend` blocks of the element in other files are rewritten to the new FQN; AWB | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 102 | Move rejections, BI on the named field, parameterized: `file` with a parent target; the same parent; a root move without `file`; the element itself or its own subtree as the target; a name collision at the target; an unknown `fqn` or parent — red if a no-op or a cycle is accepted | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | — |
| 103 | D85 / D99: a cross-file move whose text holds a relative body `icon`, a relative `style { icon }` or a relative link is BI; the same move within one file is accepted with AWB — red if links are not checked or same-file moves are rejected | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | T002 (AWB) |
| 104 | FR-010: moving a deployed element's child out of the instance's subtree while a deployment path names it is BI on `parent`, with REL = the literal path entries (`construct: 'deployment-path'`) (D114) — red if the path is re-targeted or not listed | unit | `tests/mutator/move-element.test.ts` | new | wave | T010, T005, T017 | — |
| 105 | After the move, a relationship or step between the element and its new ancestor makes the move BI (LikeC4 `Invalid parent-child relationship`) — red if the hierarchy is not re-checked | unit | `tests/mutator/move-element.test.ts` | new | wave | T017 | — |
| 106 | Affected mode for the moved subtree, parameterized: a name of the subtree as a whole identifier, and as a later dotted segment, in an opaque block and in a `global` construct. Each makes the move BI, including a same-named reference to a different element (RES-plan-2, the conservative side) — red if the move skips the inventory or uses new mode | unit | `tests/mutator/move-element.test.ts` | new | wave | T010, T017 | — |
| 107 | `apply` `renameElement` and `moveElement`: success passes AWB, including a cross-file move that writes two files | unit | `tests/cli/cli-apply-rename-move.test.ts` | new | wave | T005, T017, T018 | T002 (AWB) |
| 108 | `apply` rejections exit 1 on `mutations[i].newName`, `.parent` or `.file` and write nothing; an unknown field is rejected — red if the field mapping or the validation is missing | unit | `tests/cli/cli-apply-rename-move.test.ts` | new | wave | T018 | — |
| 109 | `addKind` for `element`, `relationship` and `deploymentNode` with every default the grammar allows, and `addTag`. The effective values of elements, relationships and nodes of that kind are compared with the LikeC4 oracle (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`, `expectDeploymentNodesAgreeWithLikeC4`); AWB | unit | `tests/mutator/specification-write.test.ts` | new | wave | T008, T021 | T002 (AWB) |
| 110 | `updateKind` (D33): strings are replaced and `null` removes them; `tags` and `links` are replaced; effective values are compared with the LikeC4 oracle; the kind's style, notation, `multiple` and colors stay byte-equal (INV-5) | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 111 | File choice for kinds and tags: a chosen file's existing block; a chosen file without one (a block is created); the default on differing orders; never a second block in a file. P (D115): spike 04's two-block input yields `Prefer one specification per document`, so AWB's warning part sees it — red if a second block is written | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 112 | Names (D67): element kind `model` is accepted and `view` is BI on `name` (spike 06 parse error); the same name in different types (element and deploymentNode, relationship and element, tag and kind) is accepted with AWB — red if one global name space or a keyword list is used | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | T002 (AWB) |
| 113 | Rejections, BI, parameterized: a same-type duplicate in another file; `summary` on a relationship kind; an undeclared tag in `tags`; an update of an undeclared kind; an update of a kind declared twice (D94); an empty update; an unloaded `file` | unit | `tests/mutator/specification-write.test.ts` | new | wave | T021 | — |
| 114 | D100: setting, changing or removing a relationship kind's `title` while an `extend a -> b` block applies, or would start to apply, to a title-less relationship of that kind is BI, with REL = those blocks (`construct: 'extend-block'`) (D114). The same change without such a block is accepted and compared with `expectRelationshipsAgreeWithLikeC4` | unit | `tests/mutator/specification-write.test.ts` | new | wave | T010, T021 | T002 (AWB) |
| 115 | A kind or tag addition whose name appears bare in an opaque block or a `global` construct is accepted with AWB (D107: not checked) — red if kind and tag additions run new mode | unit | `tests/mutator/specification-write.test.ts` | new | wave | T007, T021 | T002 (AWB) |
| 116 | `apply` `addKind`, `updateKind` and `addTag`: success passes AWB; rejections exit 1 with the field path and write nothing; unknown fields are rejected | unit | `tests/cli/cli-apply-specification.test.ts` | new | wave | T021, T022 | T002 (AWB) |
| 117 | The FR-002 place catalogue equals `linkedKindReferences` one to one on FX, with unmodelled places excluded on both sides; every `where … kind is` and participant-kind place has type `shared` — red if a place, a negation or a type is wrong | unit | `tests/query/kind-places.test.ts` | new | wave | T023 | T001 (FX), T039 (OR) |
| 118 | `renameKind` / `renameTag`, one case per FR-002 place, positive and negated, across two files: AWB; the computed model reports the new kind or tag name on the same elements and relationships — red if a place is not rewritten | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T001 (FX), T002 (AWB) |
| 119 | FR-002 step 3 isolation. This covers the accepted branch of the D78 matrix (row 123, no condition) and the rename-per-place case for same-spelled names of another type. Parameterized: element kind `vm` vs deploymentNode kind `vm`; relationship kind `x` vs element kind `x`; tag `x` vs kind `x`. After renaming one type, its declaration and uses carry the new name in the computed model. The other type's same-spelled declaration and every use of it stay byte-equal and keep their values (`expectAgreesWithLikeC4`, `expectDeploymentNodesAgreeWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`). AWB — red if the rewriter keys on spelling instead of kind type | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 120 | Removing a kind or tag that is used only at that place, for each FR-002 place: RRE on `name`, with REFS = that place, `role` the FR-002 place name, `cascadable: false` — red if a use is not detected | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T010, T023 | — |
| 121 | Removing an unused kind or tag: the declaration is gone and the emptied `specification { }` stays (D94; spike 04 shows it valid); AWB — red if the block is removed or a used kind or tag passes | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 122 | Affected mode, kinds and tags: a kind in an opaque step connector, and a tag in a `global` predicate. Each makes the rename BI and the removal RRE, with REFS role `opaque-flow` / `global-or-import` and `cascadable: false` (D113) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T010, T023 | — |
| 123 | The D78 matrix: element kind `vm` and deploymentNode kind `vm`, with and without `where kind is vm` / `where kind is not vm`, in an element view and in a deployment view, renaming each type. When a condition is present: BI on `name`, with REL = those conditions (`construct: 'where-condition'`) (D114). When none is present: accepted with AWB, and isolation is asserted by row 119 | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T010, T023 | T002 (AWB) |
| 124 | Renaming an element kind to a name a deploymentNode kind already has, while a `where kind is` condition names it: BI, with REL = that condition (`where-condition`) (D114) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T010, T023 | — |
| 125 | D109: renaming a kind or tag used in `element.kind` / `element.tag` expressions of a deployment view (include, exclude, style target). P (D115): the view is absent from `computedViews` (spike 06). Then: AWB; the rule text read back through `getView` equals a literal; no computed-view comparison | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 126 | Rejections, BI, parameterized: an invalid `newName`, or one already declared for the type; a rename or removal of an undeclared name; a name declared twice (D94). The removal of an undeclared kind and of an undeclared tag is also **not** a `ReferencedRemovalError` (D113) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | — |
| 127 | A tag rename keeps the tag's color block; `#old` inside a string or a markdown value stays byte-equal; in a kind-first declaration the kind token is rewritten and the name kept (INV-5) | unit | `tests/mutator/specification-rename-remove.test.ts` | new | wave | T023 | T002 (AWB) |
| 128 | `apply` rename and remove ops for kinds and tags: success passes AWB; rejections exit 1 with the field path and write nothing; unknown fields are rejected | unit | `tests/cli/cli-apply-specification.test.ts` | new | wave | T023, T025 | T002 (AWB) |
| 129 | The selector, parameterized over `updateRelationship` and `removeRelationship`: `matchKind`, `matchTitle` (raw inline title) and `matchBidirectional`; `removeRelationship(b, a)` matches `a <-> b`. Only the selected relationship changes, the others stay byte-equal; AWB — red if a field is ignored or reverse order fails | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 130 | Two relationships identical in every selector field, on different lines and on one line: `RelationshipAmbiguityError` (an `InvalidWriteError`) whose `candidates` equal the literal 1-based `{ file, line, column, kind, title, bidirectional }`; BI — red if positions are 0-based or only file and line | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 131 | A `candidates[i]` position passed back unchanged selects that candidate, in update and in remove; only that one changes — red if `position` is ignored or matched by line only (the same-line case) | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 132 | D106 printed form: the error message contains the `file:line:column` of each candidate, equal to `candidates[i]` — red if the printed and the structured positions differ | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 133 | No match is `InvalidWriteError`, BI, in update and in remove (D87) — red if a plain `Error` is thrown | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | — |
| 134 | `update-relationship.test.ts:65-86` (`/Multiple relationships match/`) is replaced by an assertion of `RelationshipAmbiguityError`, BI and the literal `candidates`. The not-found regex checks at `:59-63` and `:116-126` stay unchanged if they are green. If T027 changes the not-found text, they are replaced by an `InvalidWriteError` + BI assertion on the not-found field named in T027's JSDoc (RES-T5) | unit | `tests/mutator/update-relationship.test.ts:59-126` | fix | wave | T027 | — |
| 135 | `relationship-extends-remove.test.ts:75-81` calls `removeRelationship('x', 'y')` while BASE has both `x -> y 'reads'` and the nested `x -> y 'inner'`, so the call is now ambiguous. It is rewritten to select the `reads` relationship (`matchTitle: 'reads'`). Its orphan-cleanup assertion is kept: `ext.c4` equals EXT without `extend x -> y 'reads'`, and the diagnostics are `[]` | unit | `tests/mutator/relationship-extends-remove.test.ts:75-81` | fix | wave | T027 | — |
| 136 | `relationship-extends-remove.test.ts:82-93` (two identical `x -> y`; today the first match is removed) is now ambiguous. It is rewritten to select by `position`; the block stays and the survivor keeps tag `a` | unit | `tests/mutator/relationship-extends-remove.test.ts:82-93` | fix | wave | T027 | — |
| 137 | Orphan cleanup through `removeRelationship(selector)`: an `extend a -> b` block that applies only to the removed relationship is removed, others are kept. P (D115): an `extend` block that matches nothing yields `does not match any relation` (spike 01), so AWB's warning part sees a leftover — red if the cleanup is lost on the new path | unit | `tests/mutator/relationship-selector.test.ts` | new | wave | T027 | T002 (AWB) |
| 138 | Deployment relationship selection is unchanged (D105): `deployment-relationships-write.test.ts` stays green with no edits | unit | `tests/mutator/deployment-relationships-write.test.ts` | fix | wave | T027 | — |
| 139 | The legacy `(source, target)` forms stay green with no edits: `tests/mutator/remove-relationship.test.ts:34-109`, `tests/query/relationship-resolution.test.ts:30-60`, `tests/integration/cst-layout.test.ts:28-31`, `tests/mutator/line-endings.test.ts:153`, `tests/cli/cli-apply-extended.test.ts:84-118` | unit | `tests/mutator/remove-relationship.test.ts` (owner) | fix | wave | T027 | — |
| 140 | `apply` D102 / D106 round trip: an ambiguity in `mutations[1]`, after `mutations[0]` has shifted lines, names `mutations[1]` and gives `candidates` positions in the state after `mutations[0]`. A second `apply` that passes one position unchanged selects that candidate; AWB | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T027, T028 | T002 (AWB) |
| 141 | `apply` `matchBidirectional` / `position`: wrong types and unknown fields are reported on their `mutations[0].<path>` — red if the validation is missing | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T028 | — |
| 142 | The standalone `remove-relationship` on two identical relationships exits 1 and writes nothing (D84, US-9) | unit | `tests/cli/cli-apply-relationship-selector.test.ts` | new | wave | T027, T028 | — |
| 143 | Direction read: `->`, `<->`, `-[k]<->` and `.k` report `bidirectional` equal to LikeC4's `isBidirectional`, through `expectRelationshipsAgreeWithLikeC4` with direction compared | unit | `tests/query/relationship-direction-read.test.ts` | new | wave | T026 | — |
| 144 | `ExtendContribution.bidirectional`: an `extend a <-> b` block is reported as bidirectional and applies to an `a <-> b` written in reverse order (spike 01) — red if the block identity lacks the direction | unit | `tests/query/relationship-direction-read.test.ts` | new | wave | T026 | — |
| 145 | Every existing caller of `expectRelationshipsAgreeWithLikeC4` stays green with direction compared: `tests/query/relationship-extends-read.test.ts`, `tests/query/deployment-specification-read.test.ts`, `tests/mutator/spec-defaults-write.test.ts`, `tests/query/spec-defaults-relations-read.test.ts`, `tests/mutator/relationship-dot-kind-header-tags.test.ts`, `tests/mutator/relationship-extends-write.test.ts` | unit | `tests/query/relationship-extends-read.test.ts` (owner) | fix | wave | T026 | — |
| 146 | Every US-8 spelling, parameterized: `-[k]->`, `.k`, `<->`, `-[k]<->`, and nested `-> t`, `<-> t`, `-[k]-> t`, `-[k]<-> t`, `.k t`. Each carries title, description, technology, tags, links, metadata and style, and is compared with `expectRelationshipsAgreeWithLikeC4` (kind and direction); AWB | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T026, T029 | T002 (AWB) |
| 147 | The nested target text resolves at its place to the requested element (a sibling bare, a distant element qualified); a bodiless source gets a body; the computed endpoints equal the request | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T005, T009, T029 | T002 (AWB) |
| 148 | Top-level `file`: a chosen file; a chosen file without a `model` block; the default on differing orders. Only that file changes; AWB | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T008, T029 | T002 (AWB) |
| 149 | D83: a new relationship whose identity matches an existing `extend a -> b` block is BI, with REL = those blocks (`extend-block`) (D114). With `shared` it is accepted and the block's values apply (LikeC4 oracle) — red if the relationship silently joins the block, or `shared` is ignored | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T010, T029 | T002 (AWB) |
| 150 | Rejections, BI, parameterized: an undeclared `kind`; the dot form with `bidirectional`; `file` with nested placement; an unresolved endpoint; a self-relationship; parent and child as endpoints | unit | `tests/mutator/add-relationship-forms.test.ts` | new | wave | T029 | — |
| 151 | `apply` `addRelationship` with the new fields (`kind`, `kindForm`, `bidirectional`, `placement`, `file`, `shared`): success passes AWB; rejections exit 1 with the field path and write nothing | unit | `tests/cli/cli-apply-extended.test.ts` | new | wave | T029, T030 | T002 (AWB) |
| 152 | `addElementExtend` in a chosen file: a new block (a `model` block is created in a file that has none), and a merge into the first existing block of the same target (FR-050: tags, links and metadata appended; a metadata block created if absent). Effective values are compared with the LikeC4 oracle; AWB | unit | `tests/mutator/extend-create.test.ts` | new | wave | T008, T031 | T002 (AWB) |
| 153 | `addRelationshipExtend`: the block is written with a bracket connector carrying the kind, the direction and the relationship's own title. It applies to a dot-form relationship and to a bidirectional one; new-block and merge cases; effective values compared with the LikeC4 oracle. P (D115): a block that matches nothing yields `does not match any relation` (spike 01), so AWB catches a block that does not apply | unit | `tests/mutator/extend-create.test.ts` | new | wave | T027, T031 | T002 (AWB) |
| 154 | `addRelationshipExtend` through the selector. (a) Among relationships that differ only in kind, inline title or direction, `matchKind` / `matchTitle` / `matchBidirectional` select one: the block decorates exactly that relationship, and the competitor keeps its values (LikeC4 oracle on both). (b) Two identical same-line relationships: without `position`, `RelationshipAmbiguityError`, BI. With one candidate's `position` but without `shared`, the D72 rejection, BI. With `position` and `shared: true`, accepted, and the block applies to both (LikeC4 matches by identity; FRICTION F9). AWB on every acceptance — red if extend creation ignores a selector field or `position`, or picks the first endpoint match | unit | `tests/mutator/extend-create.test.ts` | new | wave | T027, T031 | T002 (AWB) |
| 155 | FR-050, no repetition: tags and links already in the target block are not repeated; an identical link in another block is kept (LikeC4 keeps duplicates) | unit | `tests/mutator/extend-create.test.ts` | new | wave | T031 | T002 (AWB) |
| 156 | D72: an identity that matches another relationship is BI, with REL = the other matches (`construct: 'relationship'`) (D114). With `shared`, the block applies to both (LikeC4 oracle); `shared` with a single match is accepted | unit | `tests/mutator/extend-create.test.ts` | new | wave | T010, T031 | T002 (AWB) |
| 157 | Rejections, BI, parameterized: an unresolved element; an undeclared tag; nothing to add (no property, or every tag and link already present); a D86 metadata key already in the declaration or in an `extend` block in another file; the D82 kind-only title; `file` missing or unloaded | unit | `tests/mutator/extend-create.test.ts` | new | wave | T031 | — |
| 158 | `apply` `addElementExtend` and `addRelationshipExtend`: success passes AWB; rejections exit 1 with the field path and write nothing | unit | `tests/cli/cli-extend.test.ts` | new | wave | T031, T032 | T002 (AWB) |
| 159 | `apply` `addRelationshipExtend` with the selector fields (`matchKind`, `matchTitle`, `matchBidirectional`, `position`): the block decorates the selected relationship and the competitor is unchanged (LikeC4 oracle). A wrong-typed selector field is reported on `mutations[0].<path>`. An ambiguity names `mutations[0]` and writes nothing — red if the op drops or misvalidates a selector field | unit | `tests/cli/cli-extend.test.ts` | new | wave | T027, T031, T032 | T002 (AWB) |
| 160 | Element styles: every style field of the grammar as own style (the first `style { }` plus a body `icon`), as kind style and combined, with a body `icon` winning over `style { icon }`. Own, kind and effective styles are compared with `$data` through `expectElementStylesAgreeWithLikeC4`, opacity as LikeC4's number against the written percentage (spike 01 `s1`–`s4`; D88) | unit | `tests/query/styles-read.test.ts` | new | wave | T033 | T002 (style helper) |
| 161 | Relationship styles: `line`, `color`, `head` and `tail` as own, kind and effective values, and the relationship kind's `multiple`. P (D115): for spike 01's bidirectional input, `$data` reports `tail: normal` without a written tail. Then the bidirectional `tail` rule and the values are compared with `$data` through `expectRelationshipsAgreeWithLikeC4` with style compared | unit | `tests/query/styles-read.test.ts` | new | wave | T026, T033 | — |
| 162 | No theme or configured defaults (D74): an element and a relationship with no style report no effective value that LikeC4's `$data` lacks | unit | `tests/query/styles-read.test.ts` | new | wave | T033 | — |
| 163 | These stay green with no edits: the six callers of row 145 with style compared; the deployment reader tests (`tests/query/deployment-nodes-read.test.ts`, `tests/query/deployment-instances-read.test.ts`, `tests/query/deployment-relationships-read.test.ts`); `getSpecification()` reporting names only (`tests/query/deployment-specification-read.test.ts:201`); the `fromSpecification` deep-equality tests (`tests/query/spec-defaults-read.test.ts:153,168`, `tests/query/spec-defaults-relations-read.test.ts:136,150`, `tests/query/deployment-nodes-read.test.ts:253`) | unit | `tests/query/spec-defaults-read.test.ts` (owner) | fix | wave | T033 | — |
| 164 | D75: `updateElement({ style: { icon } })` on an element with a body `icon` rewrites the body `icon` and writes no `style { icon }`; the effective icon is compared with LikeC4. P (D115): spike 01's body-`icon` plus `style { icon }` input yields `Redundant as icon defined on element`, so AWB's warning part detects a redundant write | unit | `tests/mutator/style-body-icon.test.ts` | new | wave | T034 | T002 (AWB) |
| 165 | A `style { icon }` already next to the body `icon` stays byte for byte (INV-5); an element without a body `icon` keeps today's behaviour (`tests/mutator/write-value-checks.test.ts:296-298` stay green) | unit | `tests/mutator/style-body-icon.test.ts` | new | wave | T034 | T002 (AWB) |

## Not tested (with reasons)

- **Test helpers on their own (D115).** Helper behaviour is checked in review. The facts the helpers rely on are asserted as P in the consuming rows: 2, 3, 111, 125, 137, 153, 161 and 164.
- **SC-011** (`npm run lint` with the coverage check, the suite, the build, version 0.11.0). These are gates of T036 and T038. The coverage-table check is the approved code-reading check that lint runs, not a row. The version string and "not published" are a review checklist; a test that reads `package.json` would be an unapproved code-reading check.
- **SC-012, T035, T037** (README and CHANGELOG content). These are review checklists of T035 and T037. A test that reads README text is not an approved kind (F2, accepted). Instead, each README example's input and stated values are copied as literals into the feature row that covers them (rows 32–165), and the T035 review checks that.
- **D59, D73, D90, D105 coverage notes.** These are coverage-table rows checked by lint, not behaviour. D105's behaviour is row 138.
- **D91** (manual layouts are not read or updated). There is nothing to observe: the library never opens `.likec4.snap` files.
- **D66, the public API names.** Checked by `tsc --noEmit` and `tsc -p tests/types` in `npm run lint` (the compiler; test guidelines §5).
- **"The T039 helper never calls library code."** A code-structure property, checked in the G1 review (test guidelines part III).
- **The inventory's "unknown reference type is an internal error".** It fires only for a grammar class that LikeC4 1.59.4 does not have, so testing it would need a fabricated AST. Rows 12–16 and 51 cover every class that exists.
- **Performance** ("the catalogue is built once before and once after"). The spec sets no numeric bound.
- **RES-plan-1** (`addRelationship` without `checkMetadata`). Out of scope by the plan (lc4m-15.31).
- **The parent-child check on rename.** No rename input can produce it, so it is gated on moves only (row 105; F4, accepted).
- **Writing kind and tag colors, notation and `multiple`** (stage 6). Only their preservation is tested (rows 110, 127).

## Known residuals

Ids from earlier rounds are kept. RES-T1 and RES-T2 were closed by D111 and D112.
- **RES-T3 · MINOR.** Rows 80(a) and 91: I do not know whether LikeC4 1.59.4 has a place where the kept text and the replaced segment fail but the full FQN resolves (row 80a), or where none of the three resolves (row 91). T005 runs a probe. If such a place is unreachable, the row moves to "Not tested", with the probe output as proof.
- **RES-T4 · MINOR.** Row 58 relies on reading the listed fixtures, not on running them. The suite run in T010's commit is the proof; any test that turns red there becomes a listed `fix`.
- **RES-T5 · MINOR.** The plan does not name the rejection field for these writes: the new-mode check of `addDeploymentNode`, D100, D83, D72, the FR-050 "nothing to add" case, and relationship not-found (row 134). These rows assert the field that the implementing task documents in its JSDoc, and the review checks that it is the write's input field.
- **RES-T6 · MINOR.** Rows 15, 44 and 51: it is unverified (ASSUMPTION) whether an `import` passes `expectValidLikeC4` without a multi-project configuration. Row 2's P reveals it. If it fails, those cases move to fixtures built with a project option.
- **RES-T7 · MINOR.** Row 63: it is unverified (ASSUMPTION) whether LikeC4 1.59.4 accepts a deployment id inside an opaque dynamic step or a `global` construct. Row 63's P reveals it. If no valid recovered place exists, row 63 keeps only the valid parameters, the rest move to "Not tested" with the diagnostics as proof, and row 62 stays the gate.

- **RES-tests-1 · MAJOR · owner limit · stage 4, round 2.** Rows 71 and 126 gained the D113 plain-error boundary for `removeView` unknown, duplicate and generated ids and for undeclared kind and tag removals (grok r2 F1) — a fix of the last round without critique → carrier: tree critique and the wave review of T013 / T023.

## Source-to-row coverage

**Scenarios**
- US-1: 32–65, 73–76
- US-2: 66–73
- US-3: 77–108
- US-4: 2–20
- US-5: 21–31, 97, 98, 148, 152
- US-6: 109–116
- US-7: 117–128
- US-8: 146–151
- US-9: 129–145, 154
- US-10: 152–159
- US-11: 160–165
- US-12: 9, 30, 31, 73–76, 107, 108, 116, 128, 140, 141, 151, 158, 159

**Invariants**
- INV-1: every AWB row: 11, 17–22, 25, 27, 30, 32–42, 45, 49, 52, 55, 56, 59, 60, 66, 70, 73, 78–84, 89, 92–101, 103, 107, 109–112, 114–116, 118, 119, 121, 123, 125, 127–129, 131, 137, 140, 146–149, 151–156, 158, 159, 164, 165
- INV-2: 111, 137, 153, 164
- INV-3: 3, 5, 7, 8, 10, 11, 33, 36, 49, 54, 56, 78–85, 93–95, 100
- INV-4: 7–9, 12–16, 18, 28, 31, 33–36, 40–44, 46–48, 50, 51, 53, 59, 61–64, 66–69, 71, 74, 75, 86–88, 90, 91, 93, 102–106, 108, 113, 114, 120, 122–124, 126, 130, 133, 149, 150, 154, 156, 157
- INV-5: 25, 37, 55, 79, 92, 99, 110, 119, 127, 165
- INV-6: 2 (every fixture row uses both specifications)
- INV-7: 109, 110, 114, 118, 119, 143, 144, 152, 153, 160–162
- INV-8: 7–16, 21, 23, 26, 53, 57, 64, 65, 71, 76, 134–136, 142, 149, 164
- INV-9: every AWB row; with `removedViewId`: 66, 70

**Functional requirements**
- FR-001: 2, 3, 32–54, 56, 59–61, 66–68, 70
- FR-002: 117–127
- FR-003: 3, 37, 38, 40, 43, 47, 50, 61
- FR-004: 3, 4, 12–19, 43, 44, 51, 52, 62, 63, 68, 69, 88–90, 106, 115, 122
- FR-010: 83, 87, 94, 104
- FR-011: 77, 79, 80, 81, 91, 100, 147
- FR-020: 97–99
- FR-021: 21, 22, 27, 111, 148
- FR-050: 152, 153, 155

**Success criteria**
- SC-001: 32–50, 59–61, 63, 66–69
- SC-002: 33–46, 49, 59, 66
- SC-003: 78, 82, 83, 94–96
- SC-004: 8, 9
- SC-005: 21, 22, 27, 97, 111, 148, 152
- SC-006: 109–128
- SC-007: 143, 146–150
- SC-008: 129–142
- SC-009: 152–157
- SC-010: 160–165
- SC-011: Not tested (gate)
- SC-012: Not tested (review)

**Decisions**
- D53: 8
- D54: 33–44
- D55: 38
- D56: 35, 67
- D57: 32, 60
- D58: 79, 80
- D60: 5, 10, 11
- D61: 43, 44, 68, 90
- D62: 21, 111, 148
- D63: 28, 31
- D64: 25, 26
- D65: 30
- D67: 112
- D68: 146, 147
- D69: 143, 144
- D70: 129, 135, 154, 159
- D71: 152, 157
- D72: 154, 156
- D74: 162
- D75: 164, 165
- D76: 82, 96
- D77: 47, 50, 61
- D78: 119, 123, 124
- D79: 118
- D80: 10, 36, 41, 42
- D81: 130, 131
- D82: 157
- D83: 149
- D84: 76, 142
- D85: 102, 103
- D86: 157
- D87: 133
- D88: 160
- D89: 161, 163
- D92: 51, 52, 63, 90, 106
- D93: 20, 85
- D94: 113, 121, 126
- D95: 117–119
- D97: 83, 87
- D98: 97
- D99: 103
- D100: 114
- D101: 12–16
- D102: 140
- D103: 157
- D104: 53, 64, 71
- D106: 130–132, 140
- D107: 18, 115
- D108: 47
- D109: 125
- D110: 88, 106
- D111: 33–36, 40–44, 46–48, 50, 51, 57, 59, 61–63, 65–69, 72, 120, 122
- D112: 32, 33, 36, 40–42, 49, 56, 57, 59, 65, 66
- D113: 2, 47, 48, 50, 51, 53, 61–64, 67–69, 71, 122
- D114: 104, 114, 123, 124, 149, 156
- D115: 2, 3, 111, 125, 137, 153, 161, 164
