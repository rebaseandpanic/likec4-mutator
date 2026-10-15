# Implementation plan review — round 2

Task: lc4m-15.29  
Reviewed: `docs/plan/lc4m-15.29/plan.md` in full.  
Requirements: `spec.md` in full, including Changelog and FOR-PLAN backlog; RECON; Skein decision comments D21–D42, including the D40 refinement; project testing rules and `CLAUDE_TEST_GUIDELINES.md`.

## Findings

No BLOCKER, MAJOR or MINOR findings requiring a plan change were identified.

## Closure of round 1

### plan-r1-codex.md#1 — closed

The read implementation now proceeds through the internal rule reader T007 and internal step reader T008 before T009 publishes `listViews` / `getView` and the complete `ViewInfo`.

The correction is carried through all relevant plan surfaces:

- Summary and Key design decisions state the internal-reader-first order.
- T002 assigns separate `expectRulesAgreeWithLikeC4` and `expectStepsAgreeWithLikeC4` helpers alongside the full-view helper.
- T007 gates the rule class; T008 gates the step class. Neither requires the later public API.
- T009 assembles both builders and requires the complete field-by-field comparison from its publication commit, with README documentation.
- G3 lists T007, T008, T009 in that order and explains their shared module.
- Dependencies explicitly place both T007 and T008 before T009; writer read-back dependencies point to T009.
- The MVP STOP requires both class gates and T009's complete comparison.
- Traceability assigns rules to T007, steps to T008 and complete public reads to T009, including D22, D24, D36 and SC-002.

No remaining gate was found that requires the public read task to obtain rule or step representations from a later task.

### plan-r1-codex.md#2 — closed

`checkViewRule` now has an explicit property-validation step (5), with the field class selected from the `with` subject and errors located on the expression field. T010 owns the adaptation of existing parsed-style checks; the expression remains unchanged.

The correction also appears in the Summary, Complexity Tracking, G4 rationale, delivery gates, Risks, README consolidation and CHANGELOG task. T015 checks the class through `addView` includes, T018 through both add and replace rule operations, and T022 through their three `apply` forms. Their gates cover invalid custom colors, library icons, `file://` icon URIs and opacity, valid declared values, byte-identical rejections and LikeC4 validation of accepted writes. The CLI task correctly leaves workspace-dependent property checks in the library.

The reuse is supported by current code: `src/mutator/write-checks.ts:266–293` already checks custom colors, library icons, forbidden icon URIs and opacity. `checkStyle` currently invokes that helper on parsed properties. T010 explicitly changes the helper's input seam rather than assuming it already accepts arbitrary rule-body properties.

## Other review results

- Every declared US-1–US-12, INV-1–INV-9, SC-001–SC-008, D21–D42 and FOR-PLAN backlog item has assigned work. The specification declares no individual FR requirement.
- One repository and one sequential stream are appropriate. Groups have recorded boundaries; solo G7 has an explicit union/dispatch atomic-commit rationale. The dependency graph is acyclic and the stated task sequence is topological.
- The named mechanisms are grounded in existing code: include probe parsing at `src/parser/grammar.ts:106–128`; placement at `src/mutator/deployment-ops.ts:242–286`; body insertion in `src/mutator/body-layout.ts`; reference snapshots at `src/query/reference-snapshot.ts:115` onward; current view creation at `src/mutator/mutator.ts:922–944`; and the current oracle at `tests/helpers/likec4-model.ts:179–215`.
- The oracle entry point exists in installed LikeC4 1.59.4: `LikeC4ModelParser.parse(doc)` returns the parsed document (`module.mjs:6850–6855`), and `ViewsParser` fills `c4Views` before model-level inheritance resolution. The installed step parser supports the stated backward-step, chain and non-contributing flow-block mechanisms (`module.mjs:6596–6790`).
- D40's contribution test, literal-empty removal and rejection of non-contributing leftovers remain explicit in the read and write tasks. D41 placement and D42 syntax-error handling remain assigned and gated.
- Public-method tasks carry documentation in the same commit under the invariant gate; T023 consolidates documentation later. The plan introduces no dependency, snapshot test, source-grep test or unapproved test category. Existing patterns have explicit limits where relevant: body anchors are extended for views, deployment placement is generalized, element syntax-error restrictions are not copied, and existing-operation error behavior is preserved.
- Context7 was queried for current dynamic-view syntax. Its results describe nested parallel blocks and step properties beyond the installed version's behavior. Version-specific conclusions therefore use the installed 1.59.4 implementation, not those current examples. Documentation reference: [LikeC4 dynamic-view reference](https://github.com/likec4/likec4/blob/main/skills/likec4-dsl/references/dynamic-views.md).

This is a plan review, not verification of an implementation. No project test suite was run. No source file or tracker record was changed; this report is the only repository file written.

## Friction

The launch prompt prescribes two different first actions: live MCP probes and the startup mailbox message. I sent the explicitly prescribed startup message first, then successfully called both MCP servers before reading task artifacts. A single prescribed startup sequence would remove that conflict.

## Verdict: PLAN-READY

Must-fix: none.
