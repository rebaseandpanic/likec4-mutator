# Test-plan critique, round 1 — Codex

Reviewed `tests.md`, `spec.md`, `plan.md`, decision comments D53–D113, the recorded LikeC4 facts, and the existing snapshot, mutator, relationship-removal and oracle tests. This is a review of coverage intent; no implementation or tests were run or changed.

## RESIDUALS

RES-plan-4 → clean. T039 explicitly enumerates topmost `StrictFqnElementRef` chains, including unresolved targets; matrix rows 2, 11 and 12 bind that class to role coverage and catalogue equality.

RES-plan-5 → clean. T010 owns the internal instance closure and deployment-view D77 check; rows 57–58 exercise it through element removal before T012. Rows 66–68 cover the public deployment APIs.

RES-plan-6 → clean. The plan defines the same boundary for T003 and T039, including stray flow containers and exclusion of unrecovered text from linker equality. Rows 3 and 12 cover classification and equality; inventory rows cover unrecovered tokens separately.

RES-plan-7 → clean. The plan specifies the shared role enum, linked target rules and imports. Rows 2, 11–12 and 42 cover role presence, equality, unresolved targets and deployment/element pairs. The excess finding below concerns helper-only rows, not the residual design.

RES-plan-8 → clean. T017 and T012 have the requested affected-mode gates; rows 109 and 69 bind them to their owning commits, with both deployment removal modes explicit.

## Findings

### 1. MAJOR · CLASS: new — Remove tests whose subject is the test apparatus

Rows 1–9, 145 and 163 test fixtures, oracle enumeration/agreement, warning/comparison helpers, or assertion sensitivity. Their stated subject is another test's machinery, rather than the library or CLI. In particular, rows 6, 8, 9, 145 and 163 deliberately feed incorrect reports or after-states to assertion helpers. The instruction explicitly makes this excess a finding; the existing oracle tests do not authorize extending that category.

Remove these standalone matrix rows. Keep necessary fixture/linker preconditions inside the product rows that consume them, before loops. Retain catalogue-versus-linker assertions in rows 11–12 and product read/write comparisons in rows 83, 97, 144 and 160–162. Check helper implementation during review. Do not replace the removed rows with another helper-test file. Row 10 may remain a reference to running existing tests unchanged.

### 2. MAJOR · CLASS: new — Another existing relationship-removal test becomes ambiguous

Row 137 only fixes `tests/mutator/relationship-extends-remove.test.ts:82-93`. The preceding test, at lines 75–81, also calls `removeRelationship('x', 'y')` without a disambiguator. Its BASE model contains both `x -> y 'reads'` and the nested `x -> y 'inner'`; its expectation deliberately removes only the `reads` extend block. US-9's selector now rejects multiple matches. This test cannot stay unchanged. It is not the identical-relationship case already listed in row 137.

Add this existing test to the T027 fixes and select the intended `reads` relationship explicitly, preserving its orphan-cleanup assertion. Include the file in T027's ownership. This is an old-test repair, not a reason to weaken ambiguity handling.

### 3. MAJOR · CLASS: new — FR-002's untouched-other-type rule is not observed

Rows 120–121 test place enumeration and changed names; rows 125–126 exercise the shared-name guard. No row explicitly verifies FR-002 step 3: places of another kind type with the same spelling stay untouched. The no-condition branch of row 125 only promises AWB. Renaming both same-named declarations and their uses can still produce a valid LikeC4 model, so validation alone does not distinguish a rewriter keyed by spelling from one keyed by kind type. Row 115 tests addition namespaces, not rename isolation.

Strengthen the accepted rename branch of row 125 (and the relevant row 121 case) to assert the selected type's new name and values, the other type's original declaration and uses, and byte preservation of those unrelated uses. Include relationship-kind and tag same-spelling isolation under the FR-002 rule. Keep both halves in the same row/assertion bundle.

### 4. MAJOR · CLASS: new — Full-FQN fallback and minimal-choice ordering are not discriminated

FR-011 orders three choices: retain text, replace affected segments, then full FQN. Row 84 covers retaining text and successful segment replacement; row 103 only says an outside reference is rewritten. Row 95 addresses total failure, with its feasibility deferred. None requires a case where segment replacement resolves to the wrong target but the full FQN resolves correctly. An implementation that stops after the second choice can pass the specified assertions. Conversely, SIG alone accepts an implementation that always writes a full FQN where a smaller rewrite suffices.

Bind the successful fallback to a rename/move feature row, with a linker precondition establishing the failed earlier choices, literal expected written text and target equality together. Explicitly require the segment-choice case to keep its smaller text. If a branch is unreachable in LikeC4 1.59.4, document that conclusion with the T005 probe evidence rather than silently omitting it.

### 5. MAJOR · CLASS: new — `addRelationshipExtend` does not test selector wiring

Rows 131–133 exercise selector fields and position only through update/remove. Rows 155 and 157 exercise extend identity and `shared`, but do not require selecting among relationships differing in selector fields or copying a same-line candidate position into extend creation. US-9 and US-10 require the same selector here too. An extend writer that ignores `position` or a match field, or bypasses the selector and picks the first endpoint match, is not forced red by those rows.

Extend the T031 row intent to exercise selection through `addRelationshipExtend`, asserting the block decorates exactly the intended relationship and leaves the competing one unchanged. Include position discrimination for otherwise identical same-line candidates together with the required shared-identity behavior, and bind the assertion to the selector result in that same row. Mirror the new selector-field validation through the T032 CLI row.

### 6. MAJOR · CLASS: new — Rejection rollback and generation caching lack a continuation assertion

The plan caches catalogue data per index generation and restores state on rejection. BI checks immediate serialization and reads, and row 19 covers successful additions, but no row requires a second reference-sensitive write on the same instance after a rejected write. The CLI atomicity row checks disk output only. A cached catalogue from the rejected intermediate generation can preserve immediate visible state yet drive a later removal or rename using obsolete targets or ranges.

Add a continuation to an existing multi-file rollback row: warm reference reads, attempt a write rejected after edits/stability comparison, assert rollback, then perform a reference-sensitive accepted write on the same mutator and compare its targets/edits with literal expectations and LikeC4. Include a successful-write continuation that changes reference positions before the next operation. This observes cache invalidation and restore wiring without asserting private caches or build counts.

### 7. MAJOR · CLASS: new — New removal-error contracts have no implementation supplier in the plan

D111–D113 were read. The matrix now requires `ReferencedRemovalError`, structured `references`, `view` chain entries and D112's exact `cascaded` shape. The plan still specifies `InvalidWriteError(field, detail)` for removals; T010/T012/T013/T023 do not own the new error type/export or the structured construction, and its role enum predates `unrecovered`. T010's generic `cascaded[]` does not specify D112's pre-write positions or conditional key. These are changed product contracts, not unchanged helper prerequisites. Tests cannot supply their own missing production API.

Update the owning plan tasks and error/export ownership to implement D111–D113, including kind/tag removals, pre-write CASC positions, conditional presence, `unrecovered` and view-chain entries. Update affected row dependencies to those owners. This reconciles accepted decisions; it does not reopen their intent. Also make rows 61, 70 and 76 assert the error is not `ReferencedRemovalError`: merely asserting its `InvalidWriteError` base type would accept the subclass D113 explicitly forbids.

### 8. MINOR · CLASS: new — Several bindings point to a nonexistent rationale

Rows 136, 140, 147 and 164 refer to “the rationale”, but `tests.md` has no such section or linked rationale file. Row 136 therefore leaves the actual replacement of existing not-found message assertions unspecified. Row 147 names one owner but does not identify the remaining caller files; row 164 similarly leaves some helper callers unnamed. Naming a count does not establish file ownership or the properties those existing assertions retain.

Replace these references with explicit test file paths and repair/unchanged intent, retaining one named owner per multi-file row. For row 136, state the type/field assertions that replace the two not-found regex checks. No extra tests of caller counts or source scanning are needed.

## Coverage and level assessment

All matrix rows declare exactly one execution value (`wave`) and a nonempty list of existing plan task ids. T005's position after T010 is intentional despite its smaller numeric id. Fixture/oracle suppliers T001 and T039 precede their consumers in the stated execution order; T002 supplies AWB/SIG. Test paths bind ordinary feature rows to owners. The contract ownership gap is finding 7.

The unit level is appropriate for the product rows, including CLI subprocesses and files under `tests/integration/`. No new integration, e2e, smoke or mutation level is warranted. Lint/build, the approved coverage-table check and prose documentation remain gates/review work. No named existing-test pattern is used as a substitute for an assertion. The mechanism findings above follow from missing observable distinctions; they do not propose breaking product code to prove test sensitivity.

## [USER-DECISION]

None. The findings concern coverage and binding to already accepted behavior.

## FRICTION

- The matrix references a rationale that is not included or linked (finding 8).
- D111–D113 changed the removal contract after the plan was finalized; the matrix incorporates those decisions but the supplied plan still has the earlier contract (finding 7).

VERDICT NOT-READY

Must fix:
1. Remove helper/fixture self-test rows and place necessary preconditions in product rows.
2. Repair the additional ambiguous existing removal call in T027.
3. Observe untouched same-spelling kind/tag types during rename.
4. Discriminate the FR-011 fallback and minimal written-form choices.
5. Exercise the shared selector through extend creation.
6. Observe reference-sensitive continuation after rollback and after a successful generation change.
7. Assign implementation ownership for D111–D113 and assert the plain-error boundary.
8. Replace missing-rationale references with concrete file and assertion bindings.
