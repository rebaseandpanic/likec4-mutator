# Task completeness review — round 2

## Scope

Address re-check only for `tasks-codex.md#2` (F2), including RES-tests-4 and RES-tests-5. F1 was rejected by the lead and was not reopened. No new completeness or design audit was performed.

Read the implementation branch directly from Skein: listed `lc4m-15.28.2`, then each group `lc4m-18` through `lc4m-27`, then fetched all 48 delivery cards. Service/review nodes were excluded. Compared the affected passages against `spec.md`, `plan.md`, `tests.md`, `critics/tasks-analyze.md`, the round-1 report, commit `19ca7c3`, and the creator's v2 synchronization report. Tracker access was read-only; no tests were run.

## Re-check results

- **F2 / RES-tests-4 — closed.** `tests.md:26` now explicitly requires normalized multiset containment for row 62(c): after is a sub-multiset of before, so existing errors may disappear and none may appear. Equality remains required for rows 50, 63 and 70. Comparison still drops line numbers and retains diagnostic multiplicity.
- **F2 / RES-tests-5 — closed.** `plan.md:351` (T033) distinguishes the syntax-error update in row 63 from the ambiguity-resolving removal in row 62(c). Delivery step 4 (`plan.md:450`) makes the same distinction. The INV-1 mapping (`tests.md:209`) separately names the equality cases and the resolving-removal case. These passages agree with the introduced-only requirement in spec INV-1 and SC-003.
- **All affected task copies — synchronized.** Each of the following live cards was version 2 and contained exactly one byte-identical copy of the updated Wi bullet: `lc4m-19.6`, `lc4m-20.5`, `lc4m-20.6`, `lc4m-20.7`, `lc4m-20.8`, `lc4m-21.3`, `lc4m-21.4`, `lc4m-23.4`, `lc4m-23.5`, `lc4m-24.4`, `lc4m-25.4`, `lc4m-25.6`, `lc4m-25.7`, `lc4m-26.3`.
- **T033 — internally consistent.** `lc4m-24.4` contains the exact updated T033 mechanism bullet from the plan and the exact matrix rows 62 and 63. Its convention, mechanism and matrix obligation permit the ambiguity diagnostic to disappear while retaining equality for the unrelated syntax-error case.
- **Equality cases — preserved.** The exact source matrix lines occur once each in the delivery cards: row 50 in `lc4m-23.5`, rows 62 and 63 in `lc4m-24.4`, and row 70 in `lc4m-25.4`. T029's row-50 and T037's row-70 unchanged-error acceptance passages remain correctly specialized to syntax errors.
- **Stale wording — absent.** Checked description, design, acceptance and notes across all 48 live delivery cards for the four superseded passages identified by commit `19ca7c3`: unconditional Wi equality, old T033 acceptance, old delivery-step-4 acceptance, and old INV-1 mapping. No match remains. Historical old-to-new quotations in the round-1 and creator reports are evidence, not live task instructions.
- **Traceability — consistent within scope.** `tasks-analyze.md` maps US-9 and the applicable INV-1/SC-003 obligations to T033 (`lc4m-24.4`); the fix does not require another row owner or task.

## Findings

No `incomplete-fix tasks-codex.md#2` or `consequence-of-fix tasks-codex.md#2` finding. No remaining SPEC-CONCERN or USER-DECISION within this re-check.

## Friction

None affecting this re-check. The explicit round-2 scope was applied instead of repeating the general round-1 checklist. Prior ownership and dependency conclusions were not independently re-audited.

VERDICT: TASKS-READY

Must-fix:

1. None. F2 and its carried residuals RES-tests-4/5 are closed in the reviewed sources and live task copies.
