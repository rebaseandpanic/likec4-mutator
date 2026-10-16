# Spec critique, round 3 — grok

**Artifact:** `docs/plan/lc4m-15.30/spec.md` (draft, 2026-10-17).
**Task:** lc4m-15.30 (project lc4m). Description, acceptance criteria, and decision comments D53–D105 were read from Skein. Round-2 must-fix lists were read from `critics/spec-r2-grok.md` and `critics/spec-r2-claude.md`.
**Role:** critic of the spec. No implementation is proposed.

LikeC4 facts below were executed on the installed 1.59.4 package through `docs/plan/lc4m-15.30/spikes/_lc4.mts`. Context7 was not available (see FRICTION).

## Coherence of the round-2 fixes

Walked every place the round-2 changes are mentioned. These agree with each other and with the code or with LikeC4 1.59.4, and are not re-opened:

- **FR-002, D78, D79, D95 (grok r2 #2, claude r2 #3).** One place list, kind types `element | deploymentNode | relationship | shared`, shared-name guard for the old name and the new name, positive and negated. Participant kind conditions (`source.kind`, `target.kind`) are shared, as the spec says: on 1.59.4, `include host.otherbox -> host.empty where target.kind is vm` selects an edge whose target is a deployment node of kind `vm` and that node has no instance of an element of kind `vm`; `where target.kind is other` selects nothing. `where kind is` / `is not` in element and deployment views likewise match both kind types by name. US-7's sample does not spell the participant case; FR-002, D78 and SC-006 ("the D78 cases") do.
- **FR-003, D55, D61, D77, D96, FR-001 rows for include, step and opaque flow (grok r2 #1 and #4, claude r2 #2).** `par` / `parallel` are step statements; `opt`, `loop`, `break`, `alt` with `if` / `when` / `else`, `try` / `catch` / `finally` are opaque. `rank` is an element-view rule. An emptied `par` / `parallel` is removed. A cascade that removes the last content-producing statement is rejected even when an opaque statement remains. Empty `par { }` and empty `parallel { }` validate and compute no nodes. A scoped view with only `exclude` still computes its `of` element. Style and `rank` do not add nodes. Dynamic `include` does.
- **D99 (claude r2 #4).** Cross-file rejection is relative icons (body and `style`) and relative links. On 1.59.4, `./` and `../` are file-relative; a leading-slash link resolves the same way from two directories (project root) and is outside this rejection. The spec does not claim otherwise.
- **D100 (claude r2 #5).** US-6 and the D100 row reject a relationship-kind title set, change or remove while an `extend a -> b` applies or would start to apply to a title-less relationship of that kind. Deployment relationships cannot be extended (not in the grammar). Not re-opened.
- **D102, D81, US-9, SC-008 (grok r2 #3, claude r2 F8).** Position is the declaration start (file, line, column), including inside `apply` after preceding mutations.
- **D103, US-10 (claude r2 F9).** Relationship `extend` creation requires `file`. D71 stays the element-block rule; D103 is the amendment.
- **D104, INV-4 (claude r2 F11).** Every rejection of the US-1 and US-2 removals, including an unknown target and a refused edit, is `InvalidWriteError`.
- **D105 (grok r2 #8).** Scope, the D105 row and SC-008: deployment relationship selection stays today's selector, with no position.
- **INV-8 and US-4 (claude r2 F10, F7).** INV-8 lists the new rejections of `addElement`, `addView`, `addDeploymentNode`, `addDeploymentInstance` and of `addRelationship`.
- **US-3 narrowing (claude r2 F12).** The guarantee paragraph states that hierarchy-derived view contents may change, as a conscious narrowing of the task's "same view contents".
- **SC-012 CLI sentence (grok r2 #7).** Standalone CLI commands keep their options; new options are on `apply`.
- **D68 comment and the D55 spike citation (grok r2 #5 and #6).** The decision comments now list every sourceless spelling, and they cite spike 02 for an empty `include` and spike 05 for an empty `rank` and a style rule with no target. The spec table matches those comments.

Two subjects did not reach every place that defines them. Those are the findings.

## Findings

### 1. BLOCKER · Hat 1 and Hat 2 · `incomplete closure spec-r2-claude.md#6`

- **Place:** FR-020 (the sentence "default file D62"). Neighbours that still omit the exception: SC-012 ("placement and file choice (D62, D63, D85)") and SC-005 ("every operation that gains file choice … with the default file"). Already aligned, and not the defect: US-3 expected and acceptance, US-5 acceptance, the D62 row (move is not in that list), the D98 row, and the edge case "Move that changes neither parent nor file" (it does not name the file used when `file` is omitted).
- **Why:** D98, recorded on the task, says a move to the top level without `file` stays in the element's current file, because a move has a current file and D62 is for writes that do not. FR-020 still says the top-level destination is the first `model` block of the chosen file, "default file D62". SC-012 would have the README document D62 for placement and file choice and never mention the move exception. SC-005 tests "the default file" for every operation that gains file choice, and `moveElement` is one of them, so that criterion reads as D62 unless it says otherwise. US-5's acceptance already requires the current file, so the suite and the requirement disagree.

  Concrete result. A nested element lives in `b.c4`. The caller moves it to the top level and omits `file`. US-3 and D98 keep it in `b.c4`. FR-020 sends it to the first file that has a `model` block, which can be `a.c4`. The caller did not ask for a file change. If the body has a relative icon or a relative link, D99 then rejects the write for a file the caller did not choose; if it does not, the element changes file and LikeC4 resolves those relative values against a different directory. A planner cannot implement both sentences.
- **Proposal:** In FR-020, when `file` is omitted and the target is the top level, the file is the element's current file, not D62. A root element moved to the top level without `file` stays the no-op rejection already in US-3. SC-012 names D98 beside D62, D63 and D85. SC-005's default for `moveElement` is that current file; D62 remains the default only for the operations in the D62 row. This completes D98. It does not reopen the choice of file.

### 2. BLOCKER · Hat 1 and Hat 2 · `incomplete closure spec-r2-claude.md#1`

- **Place:** The definition of σ. INV-3 ("σ is the identity except for the renamed or moved subtree"), D58 ("old FQN → new FQN for the subtree"), FR-011 ("each reference into the subtree"), the D76 row (σ-equality of elements, explicit relationships and written references; deployment elements are absent), and SC-003 ("the D76 guarantees", with no unnamed-instance fixture). The rewriter boundary and the data-flow stability check follow FR-011 and INV-3. Already aligned, and not the defect: US-3 expected, the duplicate-id rejection, the US-3 acceptance fixture, the US-3 guarantee paragraph (it does name deployment elements), and the D97 row.
- **Why:** D97 says σ also maps the ids of deployment instances written without a name, and everything inside them, and that a rename which would make two such ids equal in one node is rejected. LikeC4 1.59.4 derives that id from the last segment of the `instanceOf` reference as written. `instanceOf app.api` is a reference into the element subtree, so FR-011 rewrites it and the id becomes `prod.svc` after `api` is renamed to `svc`. `include prod.api` in a deployment view, and a deployment relationship whose endpoint is `prod.api`, refer to the instance id. They are not references to an element FQN in the subtree, and INV-3's σ does not map `prod.api` to `prod.svc`.

  Concrete result. Rename `api` to `svc` while an unnamed `instanceOf app.api` is referenced from a deployment view and from a deployment relationship. Following FR-011 and INV-3 leaves `prod.api` in those texts. LikeC4 then reports that it cannot resolve `api`, so an accepted write breaks INV-1. Rejecting the write fails the US-3 acceptance fixture. Either outcome contradicts D97.

  The same gap covers paths under those instances. On 1.59.4, `instanceOf app.api` does not create a deployment element for a child of `api`. A deployment relationship written `prod.api.db` stops resolving after that child is renamed (`Could not resolve reference` to the old child name; the deployment relation source is not resolved). A deployment view cannot `include` that internal path ("Must reference deployment nodes or instances, but not internals"), so the consumer is the deployment relationship, and a style target written the same way. D97's "everything inside" is the requirement that those paths move with the instance id. A named instance (`name = instanceOf app.api`) does not change id when the element is renamed; a path under it still changes when the child is renamed, which is the ordinary endpoint rewrite and has to be stated with the same rule. SC-003, by citing only the D76 row, does not require the US-3 fixture or deployment elements, so a plan that satisfies SC-003 can skip both.
- **Proposal:** INV-3, D58, FR-011, the D76 row and SC-003 state the same σ as D97. σ also maps (1) the id of each unnamed instance of a renamed element in the subtree, taken from the last segment of the `instanceOf` reference after that reference is rewritten, and (2) deployment paths under those instances. Deployment references are rewritten by the same rule as element references. The duplicate-id rejection stays. SC-003 includes the US-3 unnamed-instance fixture and requires σ-equality of deployment elements. This completes D97. It does not reopen the choice between rewriting and rejecting.

### 3. MINOR · Hat 2 · `incomplete closure spec-r2-claude.md#7`

- **Place:** SC-004. The rule itself is already in US-4 (acceptance: the lc4m-17 repro, also with the step inside `opt` and inside an `alt` branch), FR-004 and D101.
- **Why:** SC-004 says only that the lc4m-17 repro is rejected. A plan that ticks SC-004 and does not re-read US-4 ships without the two flow-block fixtures D101 exists to require.
- **Proposal:** SC-004 names those two fixtures: the same repro with the step inside `opt`, and with the step inside an `alt` branch, rejected in the library and in `apply`.

### 4. MINOR · Hat 2 · `consequence of fix spec-r2-claude.md#7`

- **Place:** FR-004, the addition clause ("blocks an addition when it names the new name"), read with the preceding list "element, node, view, kind or tag". D101 states the same widening and does not limit which addition. US-4's additions are an element, a deployment node, a deployment instance and a view.
- **Why:** The addition clause is not limited to those declarations. A new element kind or a new tag whose spelling appears as an identifier inside an opaque block would be rejected, although that identifier does not name the new kind or tag (kind and tag uses are the places in FR-002, which are modelled). The write would have left the model valid. The rejection is safe and wrong.
- **Proposal:** The addition half of FR-004 applies to a new element name, deployment-node name, deployment-instance name or view name (the additions US-4 names). It does not apply to a new kind name or a new tag name. Removals, renames and moves of kinds and tags stay on the FR-002 places plus the unmodelled-text rule as FR-004 already states for those operations.

## [FOR-PLAN]

- The view index already splits `par` / `parallel` from the opaque keywords (`src/query/view-index.ts`). The catalogue binds to that split. Not a spec edit.
- A model relationship's source range is what makes two declarations on one line different. The requirement stays "start file, line and column" (D102). Which stored component satisfies that is the plan's choice.
- D99 is a textual rejection. LikeC4's computed element link carries a `relative` field; the library's link type does not. The plan does not need a new read field to enforce the rejection.
- Once finding 2 states both the derived instance id and the paths under it, which segment of a deployment path is rewritten is the plan's choice.
- `include * -> *` on a deployment view shows instance edges and does not show node-to-node deployment relationships; `include *` shows the node edges. That is LikeC4 view behaviour. The spec does not claim otherwise.

## [USER-DECISION]

None. Finding 1 completes D98 (current file). Finding 2 completes D97 (map the derived ids and rewrite). Both choices are already on the task. Neither finding opens a new fork.

## FRICTION

- Context7 `resolve-library-id` for LikeC4 returned "Monthly quota reached" on 2026-10-17. No Context7 fact is used. LikeC4 facts in this report were executed on the installed 1.59.4 package.
- `CLAUDE.md`, `CLAUDE_DEV_GUIDELINES.md` and `CLAUDE_TEST_GUIDELINES.md` were read in full. The spec's Testing clarification matches the project testing section (unit tests plus the coverage-table check). Nothing in those files conflicts with the spec.

VERDICT: NOT-READY

Must-fix:

1. Finding 1 — FR-020, SC-012 and SC-005 use the element's current file for a top-level move without `file` (D98), not D62.
2. Finding 2 — INV-3, D58, FR-011, the D76 row and SC-003 carry D97's σ: unnamed instance ids, deployment paths under them, deployment elements, and the US-3 fixture.
3. Findings 3 and 4 — in the same pass: SC-004 names the `opt` and `alt` fixtures; FR-004's addition clause is limited to the declarations US-4 names.
