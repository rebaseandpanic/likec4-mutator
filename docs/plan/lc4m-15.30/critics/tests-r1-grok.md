# Test-coverage critique, round 1 — Grok

**Matrix:** `docs/plan/lc4m-15.30/tests.md` · **Requirements:** `docs/plan/lc4m-15.30/spec.md` · **Plan:** `docs/plan/lc4m-15.30/plan.md` · **Task:** lc4m-15.30 · **Date:** 2026-10-17

Checked against the spec (US-1–US-12, INV-1–INV-9, FR-001–FR-050, SC-001–SC-012, D54–D110), decisions D111–D113 taken at this stage (removal error contract), the plan’s gates, and the working tree (`tests/`, `src/`). Project levels are unit only: vitest on LikeC4 1.59.4’s parser, CLI subprocesses included, plus the coverage-table check inside `npm run lint`. Intent is taken as settled except the five residuals named below.

All 166 rows are `unit` and `wave`. Each names a test-file path; two-file rows name the owner. Every `T0NN` in “Waits for code” exists in the plan (merged ids T004, T006, T011, T015, T016, T019, T024 do not appear). On the plan’s execution order, every non-anchor wait and every “Needed to run” supplier is no later than the row’s anchor. SC-011, SC-012, and the performance note have justified refusals under “Not tested”. The code search did not find an expectation change that the matrix leaves unlisted: the flips and the stay-green `toEqual`s are rows 14, 15, 31, 34, 64, 65, 71, 77, 136, and 137. No row is excess under the test-subject boundary (source text is the fixture, the subject is the write or the oracle). No row is written “after the pattern of” an existing test, so no pattern blind spot is inherited.

## RESIDUALS

RES-plan-4 → clean
RES-plan-5 → clean
RES-plan-6 → confirmed → F1
RES-plan-7 → clean
RES-plan-8 → clean

RES-plan-4. T039 enumerates topmost `FqnRef`, `StrictFqnRef`, and `StrictFqnElementRef` chains, view-ref wrappers, and `Imported`, resolved and unresolved. Row 2 requires `extend-element-target` both resolved and unresolved, and row 12 compares the catalogue with the oracle on `(file, offset, role, text, target, unmodelled)`. A missing class drops the role or the entry.

RES-plan-5. Rows 57 and 58 live in T010’s file and are the closure gate: an element cascade that removes an instance is accepted when the deployment view keeps another `include`, and rejected under D77 when that instance was the only included content. Rows 66–68 are the deployment APIs exposing that closure. T012 does not own a second planner.

RES-plan-7. Row 2 pins the catalogue role list on the oracle, row 11 requires it in the catalogue (including `views`-block styles, relationship-body `navigateTo`, globals, and imports), and row 12 puts `role` and `target` in the equality tuple. Targets are covered by that tuple plus row 3 (`null`) and row 42 (`{ deployment, element }`). The D113 value `unrecovered` is outside this residual; it is F2.

RES-plan-8. Row 109 (waits T010, T017) blocks a move when a subtree name sits in an opaque block or a global construct, including a same-named reference to a different element. Row 69 (waits T012) rejects a deployment id in unrecovered text in both modes, with role `unrecovered` and `cascadable: false`. Those are the two gates the residual added. Further affected-mode holes are F3, not a miss of these two gates.

## Findings

### F1 — MAJOR — class `new`

**Place:** row 12 (`tests/query/reference-catalogue.test.ts`); plan T003 equality gate; plan “Unmodelled boundary”.

**What is not covered.** Unrecovered text is required to stay out of the linker equality. The row never observes it.

**Why.** T003’s gate compares the catalogue with the oracle on `(file, offset, role, text, target, unmodelled)` and then says unrecovered text is not part of that tuple. Row 12 runs that comparison on FX. Row 1 requires both FX trees to pass `expectValidLikeC4`, so FX has no unrecovered tokens. The rationale points at rows 24, 59, and 69. Those rows prove the opposite inclusion: the inventory rejects a write when a name occurs in unrecovered text. They stay green if the catalogue and the oracle both emit those offsets.

Discriminating power for this exclusion:

- absent (both sides emit unrecovered offsets): row 12 stays green, because FX has none;
- built but not wired: same, the equality never sees the tokens;
- keyed by the wrong thing (unrecovered offsets stored as ordinary entries): same.

The modelled-flow half of the same boundary is covered. Row 3 puts `parallel` / `par` on the modelled side and a stray `when`, `opt`, `alt`, `try`, `Globals`, and an import on the unmodelled side. Row 12 compares the flag. Row 51 rejects `loop`, `if` / `else`, `catch` / `finally`, and `break` in both modes with role `opaque-flow`. That half is not this finding.

**Add.** One case in `tests/query/reference-catalogue.test.ts`, on a file that has unrecovered identifier tokens (a second file with a parse error is enough). Assert those token offsets are absent from `linkedCatalogueReferences` and from the catalogue. Equality on FX stays as it is. Do not treat rows 24, 59, or 69 as this assertion.

### F2 — MAJOR — class `new`

**Place:** rows 2 and 11 (`tests/likec4-validate-oracle.test.ts`, `tests/query/reference-catalogue.test.ts`).

**What is not covered.** The literal role list is unsatisfiable once D113 is applied as written, or the required exception is missing from the row.

**Why.** D113 adds `unrecovered` as a new FR-001 role-enum value and limits it to error `references`, because an unrecovered hit has no AST node. The plan’s oracle walks the linked AST. Row 2 says every FR-001 role-enum value appears in the oracle on FX. Row 1 makes FX valid, so the oracle cannot emit `unrecovered`. Row 11 repeats “the literal role list” for the catalogue. A list that includes `unrecovered` stays red on a correct oracle. A list that silently drops it no longer matches the row text.

`opaque-flow` and `global-or-import` stay in the oracle. D113 reuses them for kind and tag hits in `references` (row 124). They are real AST roles (row 3).

**Add.** State in rows 2 and 11 that the literal list is the catalogue/oracle enum and excludes `unrecovered`. Keep `extend-element-target` resolved and unresolved.

### F3 — MAJOR — class `new`

**Place:** rows 59, 69, 74, 94, and 109. No row for an inventory hit on `removeView`.

**What is not covered.** Affected mode (any dotted segment, recovered unmodelled places, unrecovered tokens) is locked on `removeElement` only, and even there the role is pinned only for the unrecovered parameter. Rename, move, deployment removal, and view removal can pass while calling the wrong mode or skipping the inventory.

**Why.** The plan’s per-write table sends rename (old name), move (every subtree name), and element, deployment, and view removal through affected mode: an identifier equal to the name, or any dotted segment. New mode, used for a new name, blocks a bare identifier or a leading segment and accepts a later segment (rows 26 and 93). D113 rejects the option “do not assert the role” for rows 59, 69, and 124.

- Row 59 parameterizes an element `FqnRef`, a later dotted segment, a global predicate, a global style, an `Imported` name, and unrecovered tokens. The `REFS` object is `{ file, line, column, cascadable: false }`, and the role is named only for the unrecovered hit. A recovered hit reported as `predicate-item` or `relationship-endpoint` stays green. Rows 51 and 52 pin `opaque-flow` / `global-or-import` for catalogue references into the removed subtree. They do not pin a later segment whose target is a different element, which is the case affected mode adds.
- Row 94 blocks a rename when the old name sits in an opaque block or a global predicate. A whole identifier is enough for that sentence. An implementation that runs new mode on the old name still rejects the bare name (row 94 green) and accepts a later segment (no row). That is the wrong key. Row 93 already shows the new-mode side of the same key for `newName`.
- Row 109 has the same shape for a moved subtree name. RES-plan-8’s gate is present (the move is blocked). The later-segment discriminator is not.
- Row 69 blocks a deployment id in unrecovered text, which is RES-plan-8’s gate. A deployment id in a recovered opaque step or a global construct, and a later dotted segment of that id, have no deployment-removal row. Row 21 is new mode on `addDeploymentNode` (a bare name). An implementation that scans only unrecovered tokens on `removeDeploymentNode` / `removeDeploymentInstance` passes row 69. FR-004 and the per-write table both apply affected mode to those ids.
- View removal: row 74 rejects a `navigateTo` inside `opt` and inside a global predicate. That is a catalogue reference at an unmodelled place. It stays red if the inventory is never called. FR-004 also blocks `removeView` when unrecovered text contains the view id (unknown class matches every class). No row does that.

**Add.**

- Row 59: put the role in the literal for every parameter. Recovered flow places are `opaque-flow`. Globals and `Imported` are `global-or-import`. Unrecovered tokens stay `unrecovered`.
- Row 94 and row 109: add a later-dotted-segment case that is BI. A bare-name case may stay.
- Deployment removal, in `tests/mutator/deployment-remove-references.test.ts`: one recovered unmodelled place (opaque step or global) and one later dotted segment, both modes, RRE, with the role above and `cascadable: false`. Keep row 69 for unrecovered text.
- `removeView`: one unrecovered-token hit on the view id, both modes, RRE, role `unrecovered`, `cascadable: false`, in `tests/mutator/views-remove.test.ts`.

### F4 — MAJOR — class `new`

**Place:** rows 55, 58, and 68.

**What is not covered.** A D77 rejection is asserted as `ReferencedRemovalError` with unchanged sources. `references` is not asserted, so the error is not required to name the view.

**Why.** D77 rejects a cascade that would remove a view’s last content-producing statement, and it requires the error to name the view. D111 makes that list `references`. D113 puts the containing view’s id in `references[i].view`. The coverage map lists rows 55, 58, and 68 under D111. An empty `references` array, or an entry whose `view` is a different view, stays green. Row 57 (accepted when another `include` remains) discriminates accept against reject. It does not discriminate which view was named.

`cascadable` is already fixed by row 54: on a rejected cascade the `view-of` entry is `cascadable: false`, and the `predicate-item` and `step-endpoint` entries stay `cascadable: true`. The flag is the reference’s FR-001 policy, not the outcome of this cascade. The D77 statement is still a `predicate-item` or a `step-endpoint`, so it stays `cascadable: true`. The view id on that entry is how the structured error names the view.

**Add.** On each D77 parameter, assert `REFS` with the content-producing statement: role `predicate-item` or `step-endpoint`, `cascadable: true`, and `view` equal to the id of the view that would lose its last content-producing statement. Cover row 55 (scoped view, unscoped view, dynamic view, `extends` child), row 58 (deployment view reached through the element cascade), and row 68 (the same content check on the deployment removal APIs).

### F5 — MAJOR — class `new` — [SPEC-CONCERN]

**Place:** rows 107, 117, 125, 126, 151, and 157.

**What is not covered.** The spec requires these errors to list the blocking constructs. The rows assert `InvalidWriteError` and unchanged sources. A rejection that names the wrong block, the wrong path, or nothing stays green.

**Why.** The clauses are:

- FR-010 / row 107: a deployment path with no σ image is rejected, listing the path;
- D100 / row 117: a relationship-kind `title` change that attaches or detaches `extend` blocks is rejected, listing the blocks;
- D78 / rows 125 and 126: a shared-name rename is rejected, listing the conditions (US-7, FR-002 step 2);
- D83 / row 151: `addRelationship` matching an `extend a -> b` identity is rejected, listing the blocks;
- D72 / row 157: a shared identity is rejected, listing the other matches.

D106 and D111 exist because a listing that lives only in `detail` cannot be asserted without parsing message text, which the test guidelines forbid. The plan’s `InvalidWriteError` field list has `candidates` for ambiguity and, after D111, `references` for reference-caused removals. It has no field for these five listings. Row 122 does assert the use list for an ordinary kind or tag removal, so the removal half of “lists every use” is covered. The D78 rename is not a removal and does not go through that row.

This is a contradiction between the spec’s listing clauses and the error contract the tests are allowed to see. Asserting `detail` text is not a repair.

**Add.** See [USER-DECISION]. Until the owner chooses, the coverage map should not treat rows 107, 117, 125, 126, 151, and 157 as covering the listing clauses.

### F6 — MINOR — class `new`

**Place:** rows 66 and 74.

**What is not covered.** `REFS` is named, and the role is not.

**Why.** Row 66’s parameters are an include, an exclude, a relation predicate, and a style target. The row says `REFS (cascadable: true)`. A style target reported as `predicate-item` stays green. Row 74 says the unmodelled `navigateTo` entries have `cascadable: false` and does not say `opaque-flow` or `global-or-import`. A modelled role with the flag forced false stays green. `cascadable` still discriminates “this was cascaded”, so the safety property holds. The role key does not.

**Add.** Name the role in each literal: `predicate-item` or `style-target` on row 66; `opaque-flow` for the `opt` hit and `global-or-import` for the global hit on row 74.

## [USER-DECISION]

F5. The spec lists the blocking constructs for FR-010, D72, D78 (rename), D83, and D100. The testable error contract has no structured field for those lists, and message text is not an allowed assertion.

- **Option A.** Extend the error contract with a structured list (the same kind of decision as D106 `candidates` and D111 `references`), name the field in the plan, and assert it from rows 107, 117, 125, 126, 151, and 157.
- **Option B.** Decide that those listings are human `detail`, as D111 already did for the `file:line` sentence. Record that refusal under “Not tested”, and leave the rows as the rejection-and-byte-identical checks they are now.

The matrix cannot honestly claim the listing clauses until one option is chosen. Option A is the one that makes the spec’s wording testable. Option B keeps the current plan contract and narrows the claim.

F4 does not need a decision: `cascadable: true` on the D77 statement follows row 54 and the FR-001 policy, and `view` is the field D113 already added.

## VERDICT

NOT-READY

Must-fix:

1. F1. Assert that unrecovered token offsets are absent from both the oracle and the catalogue, on a file that has them. Keep the FX equality for recovered references.
2. F2. Exclude `unrecovered` from the catalogue/oracle role list in rows 2 and 11. It remains a `references`-only value.
3. F3. Pin the role on every row 59 parameter. Add a later-dotted-segment rejection on rename (row 94) and move (row 109). Add a recovered unmodelled hit, and a later segment, on deployment removal. Add an unrecovered view-id hit on `removeView`.
4. F4. Assert `REFS` on the D77 rows (55, 58, 68): the content-producing statement, its FR-001 role, `cascadable: true`, and `view` equal to the view that would lose its last content.
5. F5. [SPEC-CONCERN] Resolve the listing contract for FR-010, D72, D78’s rename, D83, and D100 (see [USER-DECISION]), then either assert the structured list or record the refusal and narrow the coverage map.

F6 is recorded and is not must-fix.
