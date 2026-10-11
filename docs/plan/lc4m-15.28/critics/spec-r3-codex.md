# Specification review — round 3

Reviewed `spec.md` against the normative description and acceptance criteria of Skein lc4m-15.28, all six comments on epic lc4m-15 (including decisions D1–D14 and revised D7), round-1 and round-2 Codex reports, README, public exports, query/reference and mutation paths in `src/`, `tests/helpers/likec4-model.ts`, reconnaissance and spike reports, the offline Deployment Model documentation, and installed LikeC4 1.59.4.

Both Skein and Context7 answered real calls before substantive review. Context7 documentation was supplementary; the installed version determines version-specific behavior. No test suite was run. The existing `/tmp/zdox-lc4m-15.28-critic/r2-metadata.mts` probe was rerun with `npx tsx` from the repository root. This report is the only repository file written.

## Findings

No BLOCKER, MAJOR or MINOR finding established in this round. No requirement-level reversal of the recorded product decisions is warranted by the evidence reviewed.

## Round-2 closure audit

1. **Must-fix #1 — closed.** D14 fixes the observable contract independently of the physical empty-block representation. US-9 requires every patched effective key to reflect the request, specifies `metadata.<key>` rejection, and explicitly permits unrelated inherited keys to return. D9 remains the merge-base decision; D14 supplies its boundary. The decision table, Clarifications and FOR-PLAN agree with US-9. SC-002 requires post-write comparison, SC-004 covers rejection with unchanged sources, and US-9 requires documented examples. The rerun probe returned inherited `{ region: 'east' }` for absent, empty and blank-valued own metadata, and own `{ tier: 'one' }` for a nonempty override, with no diagnostics in each case. Installed language-server `dist/chunks/module.mjs:5215` omits empty metadata; `parseDeployedInstance` consumes that result. The installed core getter uses instance metadata, then element metadata. This supports D14 rather than an empty-override promise.
2. **Finding #2 — closed.** INV-4 now names D2 and D10; SC-002 accounts for both and requires an inherited icon-only example. US-3, the decision table, Clarifications and SC-006 consistently describe the exceptions. The Goal is a summary subject to those explicit read-contract qualifications.
3. **Finding #3 — closed.** INV-1 bounds the new guarantee to feature writes and the US-12 deployment-reference checks on logical operations. INV-8 explicitly preserves incumbent logical removal behavior against logical and deployment view references, including `view … of X` targets. D13 repeats the exclusion. US-12's unchanged behavior and the scope deferral therefore do not silently acquire a general logical-view removal policy. The broader Scope and Clarifications summaries are qualified by these explicit boundaries.
4. **Finding #4 — closed.** SC-002 now requires differential comparison after each deployment write, including survivors after removal. SC-003 requires validation for every successful deployment write fixture and successful logical additions/removals touching deployment references. These requirements no longer depend on whether a fixture happened to be compared.

Only the Codex round-1 and round-2 reports were present in the critics directory at review time; no other previous-round engine report was available there.

## Design and public-contract audit

The feature addresses the existing deployment read/write gap without mixing deployment relationships into logical relationship reads. The current public exports and specification shape establish the additive API boundary. Existing `addElement` snapshots state and audits reference changes; the current reference enumeration excludes deployment references. Existing `removeElement` cascades logical relationships and extends without inspecting instances. US-12 explicitly closes those deployment gaps while preserving the deferred view-removal policy.

Audited sister surfaces: deployment node and instance CRUD; relationship CRUD with nested logical endpoint components and reversed bidirectional selection; creation and removal of node extends; children declared in extends; multi-file contributions; deployment-block creation and file selection; specification defaults; logical element additions/removals; deployment view predicates and style targets; strict `apply` validation and atomic failure. Rename/move, view editing, specification CRUD, individual CLI commands and insertion into existing extend bodies have explicit scope boundaries. Relationship extends have a grammar-based exclusion. No additional unserved scoped mutation was established.

Concrete adverse scenarios are covered at the requirement level: a new instance making an unqualified view reference ambiguous; deleting an extended child with references elsewhere; selecting two relationships whose deployment components match but nested element components differ; deleting the last inherited metadata key; deleting the last own key and restoring unrelated inherited keys; and rejecting an operation after edits across multiple files without leaving partial state. INV-2, INV-3, INV-8 and the relevant scenarios specify deterministic outcomes. Concurrency is appropriately bounded to the synchronous in-memory library.

The test helper currently exposes logical data and validates diagnostics plus view layout; the specification explicitly requires extending the computed-model oracle to deployments and accounting for getter-layer exceptions. Planning and implementation must demonstrate the prescribed comparisons and validation; readiness here does not assert that those future checks have already passed.

## [USER-DECISION]

None required. D14 is recorded by the authorized lead and resolves the previous product decision.

## FRICTION

The startup-mail rule and live-MCP rule both demand the first action. Startup mail was sent first, then both MCP servers were called before substantive review. The available `skein_show` schema has no `project` parameter; full project-prefixed issue ids were used. Neither prevented review.

VERDICT: READY-FOR-PLANNING

Must-fix: none.
