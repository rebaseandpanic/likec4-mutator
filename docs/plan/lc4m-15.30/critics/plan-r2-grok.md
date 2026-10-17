# Plan critique, round 2 — Grok

**Plan:** `docs/plan/lc4m-15.30/plan.md` (revision r1) · **Spec:** `docs/plan/lc4m-15.30/spec.md` (READY-FOR-PLANNING) · **Task:** lc4m-15.30 · **Date:** 2026-10-17

Checked against the spec, the decision index on lc4m-15.30, the spikes, and the working tree (snapshot compare, style-icon reader, `chooseBlockPlacement`, the linked-reference helpers, `SubflowKind`, `FqnIndex.resolve`, `LikeC4AstReflection.getReferenceType`). Intent is taken as settled. This round checks that the round-1 fixes reached every place they are mentioned.

## Coherence of the round-1 fixes

| Changed notion | Places walked | Result |
|---|---|---|
| Pairing rule (expected post-edit prefix) | Key design; T003 (`expectedPrefix`); T005 and T017 gates (later `model` block, root-to-root file change); risks; complexity; INV-3 | Matches. No "needs planning". Occurrence stays out of the key. |
| `expectAcceptedWrite` / INV-9 | Key design; T002; the acceptance gates named on the INV-9 row; the D109 note in T023 | Matches those gates. `expectComputedViewsSurvive` only requires views LikeC4 computed before the write (`tests/helpers/likec4-model.ts`), so a deployment view already absent under D109 holds. The INV-1 cell overclaims — F5. |
| Direction from T026, T029 ← T026 | Key design ("no conditional comparison"); T002 leaves the helper unchanged; T026; T029; G8b; execution order (T026 before T029); waves (G8b does not wait for G8a) | Matches. |
| Merges (T004/T006→T003, T011→T010, T015/T016→T005, T019→T009, T024→T023) | Merge list, task headings, groups, execution order, traceability | Old ids appear only as merge notes. No live task uses them. |
| Execution order, groups, dependency graph | Group table, edge list, wave line, delivery stops | The wave line matches the edges. No cycle. One repository, no solo group. Waves are order freedom inside one stream, as the plan says. The execution order is one valid topological order, stricter than the waves. |
| T021 kind/tag additions are not checked | Key design per-write table; T021 gate | Matches D107. |
| T034 option forwarding | T034; `updateElementEdit` (`element-ops.ts:227`) calls `updateDeclarationEdits` with no options; the reader (`:369-376`) redirects `style.icon` only when a body icon edit exists | Matches. An element with no body icon still receives `style { icon }`. |
| RES-plan-3 | Residuals; `Lexer.tokenize` in `brace-balance.ts:18` and `grammar.ts:74` | Closed, and the call exists. |
| T039 oracle, unmodelled boundary, inventory modes | Key design, T003, T007, T010, T012, T013, T005, T017, T023, T039, traceability D61/D92/D101 | Mismatches F1–F4. |
| T008 gate | T008 | Document-order case and the bundle are present. The last FR-021 clause is not — F6. |

## Findings

### F1 — MAJOR — class `incomplete closure plan-r1-codex.md#2`

**Place:** Key design, "Unmodelled boundary" (defined in T003); T039 `unmodelled`; T003 equality gate on `(file, offset, role, text, target, unmodelled)`.

**Why:** The equality gate requires the same `unmodelled` flag from the catalogue and from `linkedCatalogueReferences`. The two definitions are different sets.

- T003 / FR-003: a `par` or `parallel` block is a step statement. Opaque flow is `opt`, `loop`, `break`, `alt` and its branches, `try` / `catch` / `finally`. `view-index.ts` treats `keyword === 'par' || keyword === 'parallel'` as `form: 'parallel'` and every other `SubflowStep` as opaque.
- T039: unmodelled containers include every "non-`par` `SubflowStep`". A `parallel` block is a `SubflowStep` whose kind is not `par` (`SubflowKind` is `opt | par | parallel | loop | when | if | else | break`, coverage row and `docs/plan/lc4m-15.29/spikes/00-grammar.md`). Step endpoints inside `parallel` are therefore unmodelled on the oracle side and modelled on the catalogue side.
- T001's fixtures include `par` and `parallel`, and T003 compares the oracle with the catalogue on those fixtures. The flag disagrees on `parallel`, so the gate fails.
- The other way: a stray `when` / `if` / `else` `SubflowStep` is opaque in the reader (`contributesSteps` returns false for that keyword) and is "every other flow block" in FR-003. T039 marks it unmodelled. T003's closed list does not name it.

**Proposal:** One predicate, shared by T003 and T039. Modelled flow containers are `SubflowStep` of kind `par` or `parallel` only. Every other `SubflowStep` (`opt`, `loop`, `break`, `when`, `if`, `else`), plus `AltSteps`, `TryBlock`, `CatchBlock`, `FinallyBlock`, `Globals`, and `ImportsFromPoject`, is unmodelled. Unrecovered text has no AST node; it stays in the inventory and is absent from this equality tuple.

### F2 — MAJOR — class `incomplete closure plan-r1-codex.md#2`

**Place:** T039 mechanism and its role-coverage gate; T003 catalogue sources and the equality tuple; Key design catalogue `role` ("FR-001 row").

**Why:** T003 requires one-to-one equality on `role` and `target`, and requires every FR-001 row to appear in `linkedCatalogueReferences`. T039 describes a different role vocabulary and a target call that cannot produce every target in that universe.

- Catalogue `role` is an FR-001 row (include, exclude, `rank`, view style, step, opaque, a deployment relationship through an instance, and the rest). T039's classifier emits coarser names: "view rule", "step", "each `navigateTo` role", "views-block style". `rank`, a view style target, and "through an instance" are not names in that list. A literal FR-001 row that the classifier cannot emit fails role coverage, and the two sides fail equality on `role`.
- `FqnIndex.resolve` is declared `resolve(reference: Referenceable): Fqn` (`node_modules/@likec4/language-server/dist/chunks/module.d.mts`). `Referenceable` is `DeployedInstance | DeploymentNode | Element | Imported`. A view is not a `Referenceable`. T039 still tells `linkedCatalogueReferences` to take every target, view wrappers included, from `FqnIndex.resolve`. The existing helper does not do that for views: `linkedViewReferences` reads the linked view's `name` (`tests/helpers/likec4-model.ts`). For a path under an instance the same helper returns the pair `{ deployment, element }` by walking the `FqnRef` parent chain, which a single `FqnIndex.resolve` of the leaf does not return.
- T039 walks every `Imported` reference. T003's source list names global references and does not name imports. FR-001 has a project-imports row, and the equality gate requires that row on both sides.

**Proposal:** Use the FR-001 reference rows as the single `role` enum on both sides. State the two table rows that are policy, not places: `with` / `where` travel with the item, and `where` conditions are FR-002. Resolve element, deployment, and import targets with `FqnIndex.resolve`, and keep the parent-chain pair for a path under an instance. Resolve a view target as the linked view's name, or `null` when it is unresolved. Add imports to the catalogue sources. Keep the sentence that the old helpers agree on the roles they already report.

### F3 — MAJOR — class `incomplete closure plan-r1-codex.md#1`

**Place:** T017 gate; T012 gate; traceability rows D61, D92, D101.

**Why:** The per-write table sends moves and deployment removals through affected mode. The gates that would fail if that call were skipped do not include it.

- US-3 requires a test for every listed rejection, including a move blocked because an unmodelled construct names the moved element or any name in its subtree (D110). T017's mechanism names affected mode for those subtree names. Its rejection list is `file` with a parent, no-op, own subtree, a cross-file relative icon or link, and a path without an image. An implementation that never calls the inventory on `moveElement` passes that gate. RES-plan-2 and the T035 README sentence then document a behaviour no test locks.
- T012's mechanism applies affected mode to the subtree ids. Its gate locks deployment view rows (include, exclude, style target) in both modes. An unrecovered token equal to a removed deployment id is an affected-mode hit (unknown class matches every class) and is not in the gate.
- The traceability rows were not updated with those consumers. D61 lists T003, T007, T010, T013, T005 and omits T017 and T012. D92 lists only T010. D101 lists only T007, while the per-write table also runs new-name / affected checks on rename (T005) and move (T017).

**Proposal:** Add one T017 rejection: an opaque or global identifier equal to a name in the moved subtree blocks the move, with byte-identical sources. Add one T012 rejection: an affected-mode hit on a deployment id in unrecovered text blocks both modes. Put T012 and T017 on D61 and D92, and put T005 and T017 on D101.

### F4 — MINOR — class `incomplete closure plan-r1-codex.md#1`

**Place:** Key design, inventory ignore list ("global style ids, custom colors").

**Why:** Any other reference type inside an unmodelled construct is an internal error. `IconProperty.libicon` is `Reference<LibIcon>` and its container includes `GlobalStyle` (`module.d.mts`). A global style that names a library icon is a legal unmodelled construct. `LibIcon` is neither a matched class nor on the ignore list, so the inventory throws before the FR-004 comparison.

**Proposal:** Add `LibIcon` to the explicit ignore list, beside custom colors and global style ids.

### F5 — MINOR — class `new`

**Place:** Traceability, INV-1 ("every acceptance gate of T005–T034").

**Why:** The bundle is named on the library acceptance gates that perform an accepted write (T005, T008, T009, T010, T012, T013, T017, T020, T021, T023, T027, T029, T031, T034) and on T018. T022, T025, T030, and T032 say "each op" and do not name the bundle. T014's cascade success does not either. INV-1 for those writes is carried by the library gates, so the id is not dangling. The traceability cell is wider than the gates.

**Proposal:** Name the bundle on those `apply` gates, or narrow the INV-1 cell to the library gates that call it.

### F6 — MINOR — class `new`

**Place:** T008 gate.

**Why:** `chooseBlockPlacement` already implements FR-021's three clauses for `deployment` and `views` (`block-placement.ts`: first file with the block, else the first file with a `model` block, else the first file). For keyword `model` the first two clauses are the same check. The remaining clause is a project in which no file has a `model` block: the block is created in the first file. T008 locks the document-order choice among files that already have a `model` block, and the accepted-write bundle. It does not lock the empty case. US-5 requires that case.

**Proposal:** Add that fixture to the T008 gate: no loaded file contains a `model` block, and root `addElement` creates one in the first file of document order.

## FRICTION

- `skein_get_instructions` and `skein_show` were truncated by the tool transport. The comment index was complete (`commentsTotal` 46, `commentsTruncated` false). Decision text was taken from the spec's D53–D110 table, which is the source of truth for this review. Individual decision bodies were not re-fetched.
- LikeC4 1.59.4 contracts were read from the installed package (`FqnIndex.resolve`, `Referenceable`, `getReferenceType`, `LibIcon`, `SubflowKind`). Context7 was not used. Round 1 already recorded that it has no page for `Lexer.tokenize`; the calls in this repo are the evidence for RES-plan-3.
- Mailbox checks during the review returned no messages.

## VERDICT

NOT-READY

Must-fix:

1. F1. Use one unmodelled predicate in T003 and T039: `par` and `parallel` are modelled; every other `SubflowStep`, plus alt, try/catch/finally, globals, and imports, is unmodelled. Keep unrecovered text out of the linker equality tuple.
2. F2. Make `role` the FR-001 row on both sides of the T003 equality. Resolve view targets as the linked view name, and deployment paths under an instance as the pair the existing helper already reports. Add imports to the catalogue sources.
3. F3. Gate the affected-mode rejection on `moveElement` (a subtree name in an unmodelled construct) and on deployment removal (an id in unrecovered text). Add T012 and T017 to D61 and D92, and T005 and T017 to D101.

F4–F6 are recorded and are not must-fix.
