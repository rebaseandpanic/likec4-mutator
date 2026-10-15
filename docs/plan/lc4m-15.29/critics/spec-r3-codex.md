# Specification review: lc4m-15.29, round 3

## Findings

No new specification finding requiring amendment. The three round-2 must-fix items are closed. No implementation proposal or additional [FOR-PLAN] finding is raised.

## Round-2 closure and consistency audit

1. **spec-r2-codex.md#1 — closed.** US-9 rejects adding a single backward step with an explicit kind. US-10 checks the resulting single step, including partial updates, and permits a patch that simultaneously removes the kind or changes direction. Chain property edits remain allowed under D31; the single-step restriction does not prohibit LikeC4's inferred backward flag on returning chain segments. D38, the backward-step edge case, Clarifications and SC-005 agree. US-12 carries the same requirements into apply; SC-007 requires documentation of the write contract. The scope and API summaries do not promise unrestricted combinations that override these rejections.
2. **spec-r2-codex.md#2 — closed.** US-1 defines unique view tags in LikeC4 parse order and gives the comma-group example. D39 and Clarifications select that same order. INV-4 therefore needs no tag-order exception. SC-002 explicitly requires a multi-group example. US-6's REPLACE semantics concern the written input and do not claim source-ordered readback; D39's decision comment explicitly leaves write order to the caller.
3. **spec-r2-codex.md#3 — closed.** SC-004 now checks removal of the declaration and preservation of surviving named declarations, explicitly sharing INV-9's generated/unnamed exceptions. The declared-index example permits a synthesized index afterwards. US-8's declaration-only removal, D28/D29, the scope exclusions and SC-007's documentation obligations agree with that boundary.

The round-1 repairs remain present: addView and apply addView inherit all US-7 include checks (D35); pre-move boundaries and no-op/inside-source cases are fixed by D37; endpoint meaning and written connectors remain distinct under D36; bodyless declarations and enclosing-block styles remain explicit oracle exceptions under INV-4.

## Design, scope and regression audit

- The feature addresses the task's read/edit/remove problem across element, dynamic and deployment views, multiple files and multiple views blocks. Predicate text writes, structured predicate reads, source ordering, guarded addresses and opaque stage-6 positions are represented in acceptance.
- Sibling write paths are covered: addView, property updates, rule add/replace/remove, step add/update/move/remove, par creation/removal and view removal, with corresponding apply operations. The existing public generateView surface does not independently receive a workspace-validity guarantee; it remains a text generator under the existing-operation compatibility rule.
- The task's coverage categories map to the declared-view/block, property, predicate, navigation/reference and step scenarios. Folder mutation, block-level styles, stage-6 contents, flow interiors, rename/type/of/extends changes, generated views and manual snapshots have explicit boundaries. No additional surface was silently inherited from addView's current limited implementation.
- Current addView checks include syntax but not all semantic references. US-5/D35 expressly replace that behavior for both library and apply; INV-7 and SC-005/006 account for the compatibility change. Existing include keyword stripping, default includes/layout and placement remain protected except for the stated changes.
- Current reference snapshots cover logical/deployment references and deployment-view rules, not the complete new view-reference surface. INV-8 and the data flow require that broader protection for this feature. US-8 requires cross-file removal rejection for extends and navigation in with blocks, steps and model/deployment relationship bodies, including references inside otherwise opaque content. These are existing requirements to carry into planning, not specification omissions.
- Considered unsafe scenarios include removing a navigated-to view in another file, writing unresolved includes through addView, moving a step across an interleaved rule, a stale move address, a returning chain with a kind, and removal of a declared index. The rejection, preservation and addressing requirements specify the intended outcomes without requiring silent cascades or loss of requested fields.
- Existing logical/deployment writes retain the preceding stage's reference-policy limits under INV-7. This feature does not silently broaden their scope. Atomic rejection and apply's delayed file output remain required across loaded files.

## Evidence and verification limits

Read the specification, both preceding review reports, task description/acceptance criteria and decision comments D21–D39, the preceding deployment specification, README, CLAUDE.md testing rules, RECON and recorded spike outputs. Inspected the current addView writer/code generator, mutations-file validation and CLI dispatch, reference snapshots, view-includes tests, and installed language-server view/step/tag parsers.

Required live Skein and Context7 calls succeeded. Context7 was queried for backward-step syntax and relationship kinds; installed LikeC4 1.59.4 code governs version-specific conclusions. In particular, `module.mjs` parseTags follows comma groups through prev; parseStep swaps endpoints for the literal backward connector; recursiveParseStepSeries can infer backward while retaining a relationship kind.

A disposable probe in the authorized scratch directory produced these results, all with empty diagnostic arrays:

- `#next, #deprecated` parsed as `["deprecated", "next"]`.
- `app.web <- app.api` parsed with source `app.api`, target `app.web`, isBackward true.
- `app.web -> app.api -[async]-> app.web` retained kind `async` and isBackward true on its second segment.
- A declared index produced declared ids `["index"]` and computed ids `["index"]`; after removing that declaration, declared ids were `[]` and computed ids remained `["index"]`.

No full test suite was run for this read-only specification review. No source, tracker record, commit or release artifact was changed. Only this report and the authorized scratch probe were written.

## [USER-DECISION]

None pending.

## Must-fix

None.

## FRICTION

The startup prompt contains two competing first-action instructions: live MCP probes first and the mailbox startup message first. Sent the required mailbox startup message, then made both real MCP calls before reviewing task artifacts. No task work depended on an unverified MCP connection.

VERDICT: READY-FOR-PLANNING
