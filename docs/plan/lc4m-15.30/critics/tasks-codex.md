# Task completeness review — lc4m-15.30

Reviewed directly from Skein project `lc4m`: implementation branch `lc4m-15.30.2`, all twelve group nodes `lc4m-37` through `lc4m-48`, and all 57 child task bodies. Dependencies were fetched explicitly with `depsTypes: ["blocks", "waits-for"]`. Compared against `spec.md`, `plan.md` including the D111–D115 amendment, `tests.md`, and `critics/tasks-analyze.md`. No tracker mutation or commit was performed.

## Residuals

RES-tests-1 → clean.

Row 71 in `lc4m-48.6` explicitly requires an unknown view id, a duplicate id, a generated unnamed-view id, and a refused edit to produce `InvalidWriteError` on `id`, excluding `ReferencedRemovalError`. Row 126 in `lc4m-47.2` explicitly excludes that subclass for undeclared kind and tag removals. Both cards carry the residual and name the tree critique and the wave review of T013 / T023 as its carrier. These rows match the current matrix verbatim.

## Verified registration

- The tree has 32 plan tasks and 25 additional test tasks: 29 implementation tasks plus T001, T039 and T002. Each surviving plan id has one card; merged ids follow the plan. All commit-producing cards are under a group node. The two service nodes directly under the implementation branch are excluded as instructed.
- All twelve groups preserve the plan's membership, task order, rationale, single repository and stream S1. There are no solo groups.
- All 165 matrix rows occur exactly once in task bodies, with their complete row text matching the matrix. The traceability table's row owners match the tracker. No extra numbered row was found.
- The 40 primary matrix paths resolve to 17 embedded paths, 22 distinct paths represented by the 25 test cards, and the T002-owned oracle test path. Rows 24, 29 and 65 use the first explicitly designated owner path. Secondary regression paths mentioned within a row are preserved in its text.
- Every embedded path has only wave rows; its code-wait union is exactly its implementation owner. Named helper prerequisites have the required outgoing dependency. No embedded primary path has a test card, and test-card rows are absent from implementation test sections.
- Repeated test paths have direct linear chains: reference catalogue `lc4m-45.2 → lc4m-41.2`; CLI validation `lc4m-43.6 → lc4m-41.5`; CLI specification `lc4m-47.4 → lc4m-42.4`. Arrows mean the left task waits for the right task. Other test-card paths have one owner.
- T002 owns row 1 in its work section, has the `tests` label and a wave run section. T001 and T039 supply changed fixture/helper paths, have no owned matrix rows, no test section or run section, and no `tests` label. T001 has no blockers; T039 waits for T001. Their consuming rows have supplier edges. D115's prohibition on helper self-tests is carried in their boundaries.
- Exactly 370 outgoing `blocks` edges were returned, with no `waits-for` edges, truncation or cycle. Every code/helper task explicitly named by a row has a direct edge from the owner, except an owner's dependency on itself. All referenced plan ids exist. Each T035–T038 card waits directly for every task in G1–G10, including test cards.
- All rows are wave rows; no final-row ownership or final-edge case applies. Each test card and T002 has a matching wave run section. Row owners require executed/skipped/failed numbers and a row-to-test table in their closing reason. Implementation cards without embedded rows require build and smoke self-checks; fixture/helper foundations require build and path existence. The expected-red qualification includes the condition that the cause is not a defect of the current task's code.
- Every task links to the requirements source and plan and names requirement ids. Plan work blocks are preserved verbatim, with amendment contracts and row ownership supplied separately. The exception to complete specification excerpts is F2 below.

## Findings

### F1 — MAJOR — structural: P1 feature work is registered as priority 2

**Affected:** all child tasks of `lc4m-39` (G10), `lc4m-40` (G8a), `lc4m-42` (G7a), `lc4m-44` (G9), `lc4m-46` (G8b), and `lc4m-47` (G7b): 23 cards in total. Their group nodes also have priority 2.

**Evidence:** the specification labels US-6, US-7, US-8, US-9, US-10, US-11 and US-12 as P1. The corresponding implementation cards T021/T022, T023/T025, T026/T029/T030, T027/T028, T031/T032 and T033/T034, and their test cards, all return `priority: 2`. For example, `lc4m-42.1` implements P1 US-6 and `lc4m-47.1` implements P1 US-7, yet both are priority 2.

**Why:** this systematically loses the required P1 → 1 mapping during registration. Neither the specification nor the plan downgrades these features to P2. The issue concerns tracker metadata, not a proposal to change product priorities.

**Fix:** set these feature and test cards to priority 1; align the six group nodes with their children. Preserve the separately justified priority-0 foundations and priority-3 polish tasks.

### F2 — MINOR — sub-threshold: T038 has an empty specification-excerpt block

**Affected:** `lc4m-38.4` / T038.

**Evidence:** its context names SC-011, but the specification-excerpt marker is followed only by blank lines before the work section. The source link to `spec.md#SC-011` exists. Its copied plan paragraph and acceptance preserve the release-preparation gate, so no release action is missing.

**Why:** the task-body template explicitly requires a specification excerpt; this card leaves that field empty and supplies only the plan's account of the requirement.

**Fix:** insert the actual SC-011 requirement from `spec.md` in the existing excerpt block, retaining the prohibition on publication.

## Friction

The original plan task paragraphs still prescribe precondition tests in T001/T039/T002, while the later D115 amendment and task boundaries move them to consuming product rows. I applied the explicit amendment as the governing contract; rows 2, 3, 111, 125, 137, 153, 161 and 164 carry those preconditions. This is an artifact-reading hazard, not a request to reopen the plan.

The creator's count calls T002 a foundation although it also owns row 1. Its card correctly uses the row-owner acceptance and run form; I treated those roles as overlapping, rather than requiring the rowless-foundation exception for T002.

VERDICT: NOT-READY

Must-fix:
1. Correct the P1 priority mapping for the 23 cards and six group nodes identified in F1.
2. Fill T038's empty SC-011 specification excerpt (F2).
