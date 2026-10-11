# Task-tree completeness review

Scope: implementation branch `lc4m-15.28.2`, live groups `lc4m-18` through `lc4m-27`, compared with `spec.md`, `plan.md`, `tests.md`, `critics/tasks-analyze.md`, and the creator report. Read-only tracker access; no tests run and no tracker changes.

## Residuals

- RES-tests-1 → clean. T002 retains review evidence rather than standalone oracle tests; T008 carries OP rows 7–9, T014 carries OP row 13, and T015 carries OP rows 21–22, verbatim.
- RES-tests-2 → clean. T019b (`lc4m-21.4`) owns row 32 with refusal and safe acceptance together for each of the three applicable logical-addition/reference combinations. Rows 33–35 have not become duplicate tasks.
- RES-tests-3 → clean. Rows 88–91 retain refusal, atomicity and their explicit semantic-lookup blind spots in T033, T037, T039 and T028. No dedicated-form-check proof is invented.
- RES-tests-4 → confirmed → MAJOR F2: Wi's unchanged-error-set requirement contradicts row 62(c), where resolving an existing ambiguity may remove an error. Both incompatible instructions are copied into T033.
- RES-tests-5 → confirmed → MAJOR F2: spec SC-003 is correctly introduced-only, but plan T033 and delivery step 4 still require unchanged errors, and T033 transfers that requirement alongside row 62(c)'s weaker no-new-errors assertion. The other named edits are transferred consistently.

## Findings

### F1 — BLOCKER — Execution-field values do not match the matrix

Affected tasks: `lc4m-18.1`, `lc4m-19.6`, `lc4m-20.1`, `lc4m-20.5`–`lc4m-20.8`, `lc4m-21.1`–`lc4m-21.4`, `lc4m-22.5`, `lc4m-23.4`–`lc4m-23.5`, `lc4m-24.4`, `lc4m-25.4`, `lc4m-25.6`–`lc4m-25.7`, and `lc4m-26.2`–`lc4m-26.3`.

All 20 matrix-owning tasks have the requested execution section, but its primary backticked value is the Russian word encoded as `\u0432\u043e\u043b\u043d\u0430`; the matrix value is `wave`. The parenthetical text explicitly explains the intended mapping, so the timing intent is clear to a human. Nevertheless, the requested exact field-value contract is not met; no normalization rule was supplied for downstream stages.

Fix: retain the required section heading and replace its primary value with literal `wave` in every affected task. No ownership or timing decision needs to change.

### F2 — MAJOR — [SPEC-CONCERN] Conflicting Wi acceptance criteria reach T033

Affected task: T033 (`lc4m-24.4`), row 62(c); carried residuals RES-tests-4 and RES-tests-5.

Evidence:

- `tests.md`, Wi convention: the error set after the write equals the set before, compared as normalized multisets.
- `tests.md`, row 62(c): removing one of two same-named instances makes an already ambiguous reference resolve; acceptance requires that the resulting error set contain no error absent before.
- `plan.md`, T033 and delivery step 4: accepted writes on invalid inputs require an unchanged error set.
- The live T033 body copies both the unchanged-set mechanism and row 62(c) verbatim, plus the shared Wi convention.
- `spec.md`, INV-1 and SC-003: accepted writes introduce no new error; existing errors may remain. Equality is not required.

Why this matters: an accepted removal can eliminate the pre-existing ambiguity diagnostic. An implementation of the generic equality convention can reject that expected successful case or produce a failing test despite meeting the stated product requirement. The executor receives two incompatible assertions within one task.

Fix: explicitly specialize Wi for row 62(c) to normalized multiset containment (after is a sub-multiset of before), allowing removed errors. Preserve equality for the syntax-error cases in rows 50, 63 and 70. Synchronize the Wi convention, plan T033, delivery step 4, and T033's copied convention/mechanism. This resolves the named residual without reopening product design.

## Verified completeness and graph checks

- All T001–T046 plan identities are present. T019 is split into the approved single-file T019a/T019b tasks; M092 is the approved matrix-only row-92 delivery. There are 48 delivery tasks under the ten groups.
- All 84 active numeric matrix rows have exactly one owner. Every copied row is byte-for-byte equal to its source matrix line. Retired rows 1–5 and 37 are infrastructure/review evidence; rows 33–35 are merged into row 32.
- The approved legacy-row owners are present: 38→T017, 46→T009, 79→T041, 80→T024, 81→T018, 82→T001. These are unchanged-suite gates, not grants to edit legacy test files. Row 80 retains its original per-refactor attribution within T024's consolidated gate.
- New/fixed test-file delivery keys are unique by repository, path, group and timing. The two T019 files have separate owners. The line-ending file has only M092. No two tasks are authorized to commit the same test path concurrently.
- Every group is single-repository S1, with rationale and explicit order. All successive tasks in each group have a directed dependency path to their predecessor; the consecutive group barriers G1→G10 are also present. No solo group needs justification.
- Dependency edges were fetched explicitly with `depsTypes: ["blocks", "waits-for"]`. Their observed direction is dependent→prerequisite: for example, T002 points to T001 and is blocked, while T001 has no blocker. Foundations precede consumers; product-test tasks depend on their implementations and T002. No reversed chain or missing test prerequisite was found.
- Delivery tasks contain specification extracts, requirement identifiers, requirement-source and plan paths, assigned files, boundaries, acceptance and group information. Implementation tasks retain code/smoke gates; product test classes are assigned to the test tasks. Priorities match the requested foundation/setup/P1/P2/polish ranges.
- T001/T002, T029, T035/T036/T037 and their relevant test rows carry the named final-round edits. The remaining discrepancy in that transfer is F2.
- The direct branch children outside groups are service/review nodes, including this completeness review; none is an implementation delivery. The code-review service node was not counted as a group.

## Friction

- The supplied branch description named the code-review service exception, but the live branch also contains this completeness-review service task (`lc4m-15.28.2.2`). Its title and zero children distinguish it from commit-producing implementation work; it was excluded from delivery counting.
- The exact-value audit encounters a localized execution token with an English explanatory mapping in every matrix owner. F1 records the contract mismatch rather than silently assuming a downstream normalization rule.
- The requested carried-residual check exposed two different meanings of Wi in the authoritative artifacts and the same live task. F2 records that contradiction; no design alternative was guessed.

VERDICT: NOT-READY

Must-fix:

1. Set the execution-field value to literal `wave` in all 20 matrix-owning tasks (F1).
2. Reconcile Wi row 62(c) across tests.md, plan T033/delivery step 4, and the live T033 body, permitting existing errors to disappear while forbidding new errors (F2; RES-tests-4 and RES-tests-5).
