# Test-coverage critique, round 2 — Grok

**Matrix:** `docs/plan/lc4m-15.30/tests.md` (rows 1–165) · **Requirements:** `docs/plan/lc4m-15.30/spec.md` · **Plan:** `docs/plan/lc4m-15.30/plan.md`, section "Amendment after stage 4 (D111 to D115)" · **Task:** lc4m-15.30 · **Date:** 2026-10-17

Scope is the closure of the round-1 must-fixes and the consequences of the edits that closed them. Decisions D111–D115 were read from the task comments. LikeC4 1.59.4 facts used below are the spike outputs under `docs/plan/lc4m-15.30/spikes/`. Existing tests cited by the new fix rows were read in `tests/`.

Project levels are unchanged: every row is `unit` and `wave`. No row introduces integration, e2e, smoke, or mutation. The coverage-table check stays a lint gate under "Not tested".

## Closure of round-1 must-fixes

| Round-1 item | Result |
|---|---|
| grok #1 — unrecovered offsets absent from the equality | Closed. Row 4, on a copy of FX plus a file whose parse error leaves identifier tokens, requires those offsets absent from `linkedCatalogueReferences` and from the catalogue, and keeps row 3's equality on the other files. Absent exclusion, an unwired side, or unrecovered offsets stored as ordinary entries all leave an offset in one of the two sets. |
| grok #2 — `unrecovered` out of the catalogue/oracle role list | Closed. Row 2 states that the literal list is the catalogue/oracle FR-001 enum and excludes `unrecovered`, on OR and on the catalogue, with `extend-element-target` resolved and unresolved. |
| grok #3 — affected-mode roles and the missing discriminators | Closed. Row 51 names `opaque-flow`, `global-or-import`, and `unrecovered` per parameter, including a later dotted segment. Rows 90 and 106 reject a later dotted segment of the old name and of a moved subtree name; new mode would accept that segment (row 18 / row 89), so the wrong mode goes red. Row 63 does the same for both deployment removal APIs at a recovered opaque step and a global construct, whole name and later segment, both modes, RRE, `cascadable: false`. Row 69 is the unrecovered view-id hit on `removeView`. |
| grok #4 — D77 `references` name the view | Closed. Rows 47, 50, and 61 require the content-producing statement, role `predicate-item` or `step-endpoint`, `cascadable: true`, and `view` equal to the view that would lose that content. An empty list, or another view's id, goes red. |
| grok #5 — listing contract outside removals | Closed by D114. Rows 104, 114, 123, 124, 149, and 156 assert `related` as a literal of `{ file, line, column, construct }` with the construct D114 names. The field is added on `InvalidWriteError` by T010; each filler is an owner in the amendment and is not later than the row's anchor in the plan's execution order (`T001, T039, T002 · T003, T007 · … · T010, T012, T013, T014 · T005, T017, T018 · T021, T022 · T023, … · T029, … · T031`). |
| codex #1 — helper self-test rows | Closed in the matrix. Rows whose subject was a helper fed wrong data are gone. D115 facts are P inside product rows 2, 3, 111, 125, 137, 153, 161, and 164, before any loop. Spike texts match the outputs: spike 04 `Prefer one specification per document`; spike 01 `does not match any relation` and `Redundant as icon defined on element` and bidirectional `tail: normal`; spike 06's valid `style element.kind = e` deployment view is absent from `diagrams()` (`pick: ["index"]` only). Row 1 is the existing oracle suite staying green, which codex #1 allowed. |
| codex #2 — `relationship-extends-remove.test.ts:75-81` | Closed. Row 135. The current test calls `removeRelationship('x', 'y')` while BASE has both `x -> y 'reads'` and the nested `x -> y 'inner'` (lines 75–81). Both resolve to FQN `x -> y`, so US-9 makes the call ambiguous. The row selects `matchTitle: 'reads'` and keeps the orphan assertion. Row 136 still covers lines 82–93. Row 58's stay-green range starts at line 95. |
| codex #3 — FR-002 step 3 | Closed. Row 119, one assertion bundle: after renaming one of element-kind `vm` / deploymentNode `vm`, relationship-kind `x` / element-kind `x`, or tag `x` / kind `x`, the selected type's declaration and uses carry the new name, and the other type's declaration and every use stay byte-equal with their values. AWB alone would accept a spelling-keyed rewriter; the byte-equal half does not. Row 123's no-condition branch points at this row rather than splitting the assertion. |
| codex #4 — FR-011 order | Closed. Row 80(a) requires the literal full FQN when kept text and segment replacement both resolve elsewhere (OR on hand-written copies is the precondition). Row 80(b) requires the literal replaced-segment text, not the full FQN. Stopping after the second choice fails (a); always writing the full FQN fails (b). RES-T3 still records that (a) may be unreachable and then moves, with the T005 probe as proof. That is the escape codex #4 allowed. |
| codex #5 — selector through `addRelationshipExtend` | Closed. Row 154(a) selects by `matchKind` / `matchTitle` / `matchBidirectional` and requires the block to decorate that relationship only. Row 154(b) requires ambiguity without `position`, the D72 rejection with `position` and without `shared`, and acceptance with `position` and `shared: true`. Ignoring `position` leaves the with-position cases ambiguous, so they go red. Identical same-line relationships cannot show which one was decorated; the row says LikeC4 matches the block by identity (FRICTION F9 in the row). Row 159 mirrors selection, a wrong-typed field, and ambiguity through `apply`. |
| codex #6 — continuation after rollback and after a generation change | Closed. Row 93 warms reads, rejects the lc4m-17 `addElement` (BI: `serialize()` and the reads unchanged), then `renameElement` on the same instance with literal text, SIG, STAB, and AWB. Row 56 inserts lines, then cascade-removes, and requires CASC positions from the state after the addition. A catalogue kept from the rejected generation, or from before the addition, disagrees with those literals. A cache that is absent and always rebuilt stays green; that is the correct observable result, not a missing discriminator. |
| codex #7 — D111–D113 ownership and the plain-error boundary | Ownership is closed. The amendment assigns `ReferencedRemovalError` (exported from `src/index.ts`), `references` including `unrecovered` and `view`, and D112's `cascaded` key to T010, T012, T013, and T023. Rows 53 and 64 assert unknown target and refused edit are `InvalidWriteError` and not the subclass, for `removeElement` and for both deployment APIs. **Not closed for `removeView`'s unknown id, nor for an undeclared kind or tag removal.** See F1. |
| codex #8 — "the rationale" | Closed in the matrix. `tests.md` no longer says "the rationale". Row 134 names `tests/mutator/update-relationship.test.ts:59-126`, replaces the ambiguity regex with `RelationshipAmbiguityError` and literal `candidates`, and states the not-found replacement as `InvalidWriteError` + BI when the text changes. The field name stays RES-T5 (T027's JSDoc). That residual was already recorded; the binding codex #8 asked for is present. |
| D112 and the four existing `toEqual`s | Closed. D112 keeps the result shape without `cascade`. Row 57 names `deployment-reference-stability.test.ts:224-243` (the `toEqual` is line 242). Row 65 names `deployment-nodes-update-remove.test.ts:529-558, 656` and `deployment-instances-write.test.ts:561`. Those calls are in the tree. Row 72 keeps `views-remove.test.ts:144` (`toEqual({ changedFiles: ['m.c4'] })`) green, which is the view half of the same shape. |

No new row is excess. Each new row's subject is a product write, a catalogue comparison, or an existing product test whose expectation the selector or the error contract changes. Source text is the fixture. No new row's subject is another test, and none is pipeline plumbing. Each names one test file. Every `T0NN` in the changed rows exists in the plan. Suppliers in "Needed to run" are T001, T002, or T039, all earlier than those anchors, or `—`.

## Findings

### F1 — MAJOR — class `incomplete closure tests-r1-codex.md#7`

**Place:** row 71 (`tests/mutator/views-remove.test.ts`) and the "removal of an undeclared name" parameter of row 126 (`tests/mutator/specification-rename-remove.test.ts`). The frozen tests are `tests/mutator/views-remove.test.ts:175-190`.

**What is not covered.** D113 keeps `ReferencedRemovalError` for reference-caused removal rejections only. An unknown target stays a plain `InvalidWriteError`. Rows 53 and 64 say so, and they say the error is not the subclass. Row 71 says it only for a refused edit of `removeView`. Nothing says it for `removeView` of an unknown id. Row 126's undeclared-name removal is only BI, and BI is `InvalidWriteError`, which the subclass satisfies.

**Why.** `views-remove.test.ts:21-34` implements rejection as `toBeInstanceOf(InvalidWriteError)`. `ReferencedRemovalError extends InvalidWriteError`, so that assertion stays green when the subclass is thrown. Row 72 freezes lines 59–235 with no edits. Inside that range:

- lines 175–177 reject `removeView('nope')`;
- lines 180–182 reject an id declared in two files;
- lines 185–190 reject the id LikeC4 generates for an unnamed view.

None of those three is a reference-caused rejection. D113 forbids the subclass for them. The frozen helper accepts it. Row 71 does not repeat the inputs with `not` the subclass.

The same hole is on the removal half of row 126. T023's reference-caused kind and tag removals are RRE (rows 120 and 122). An undeclared name has no references. A removal path that throws `ReferencedRemovalError` for every `removeKind` / `removeTag` failure, or only for the not-found path, passes BI. D113's reason is the absence of references, not the US-1 / US-2 boundary in D104. Rows 53 and 64 already treat that as something the test must reject.

Discriminating power of the plain-error guard:

- absent (not-found and refused edit thrown as `ReferencedRemovalError`): rows 53 and 64 go red; row 71 goes red only for the refused edit; the unknown `removeView` and the undeclared kind/tag removal stay green;
- built but not wired on `removeView`'s not-found path, while the refused-edit path stays plain: row 71 stays green;
- keyed by the wrong thing (every removal failure wrapped, because the operation is a removal): same.

**Add.** In row 71, require `InvalidWriteError` on `id` and not `ReferencedRemovalError` for an unknown id, for an id declared in two files, and for a generated id of an unnamed view, together with the refused edit already there. In row 126, require the same negative assertion on the removal of an undeclared kind and of an undeclared tag. Leave the old `expectRejected` tests in place; the new assertions are what go red.

## [USER-DECISION]

None. F1 is the D113 boundary the previous round already required. It does not reopen the contract.

## VERDICT

NOT-READY

Must-fix:

1. F1. Assert that `removeView` of an unknown id, of a duplicate id, and of a generated id is `InvalidWriteError` and not `ReferencedRemovalError` (row 71). Assert the same for removal of an undeclared kind and of an undeclared tag (row 126).
