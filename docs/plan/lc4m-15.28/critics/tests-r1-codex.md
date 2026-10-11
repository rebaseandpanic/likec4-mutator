# Test coverage critique — round 1

Class of every finding: **new**. Scope: completeness and test levels, with the explicitly authorized RES-plan-1 audit. No test suite or mutation run was executed. Only this report was written.

## Evidence and scope

Read `spec.md`, `plan.md`, `tests.md`, `tests-rationale.md`, the actual `CLAUDE.md` testing section and `CLAUDE_TEST_GUIDELINES.md` I §§5–6. Grounding includes `src/mutator/mutator.ts`, `write-checks.ts`, `element-ops.ts`, the query/module file inventory, `tests/helpers/likec4-model.ts`, existing reference, line-ending, parser, oracle and recursive fixture tests. Installed `@likec4/language-server/package.json` reports **1.59.4**; its distributed implementation contains the deployment scope, strict extend-reference reader and extend-node validation. New deployment modules and test files are planned artifacts, not existing implementations.

The repository provides vitest unit tests, including CLI subprocess tests. Paths under `tests/integration/` do not introduce an integration level. All executable matrix rows use `unit` and exactly `wave`; row 37 is the exception discussed below. The existing grammar coverage check is separately authorized by the repository, and does not authorize additional source-reading tests. Documentation/release review gates are reasonable; no additional test level is requested.

## RESIDUALS

**RES-plan-1 → clean.** T019 now distinguishes direct strict-path snapshot observations from logical-addition integration; T028 uses applicable node producers against endpoints/views and duplicate-id rejection for occupied strict paths. T030 explicitly includes instance additions against endpoints, and row 62(b) assigns that case to T033's instance-writer file. The matrix's residual paragraph still calls the combination absent from the plan, but the current T030 contains it; update that stale explanation. This is an editorial correction, not a confirmed residual or a request to reopen the design.

## Findings

### 1. MAJOR — Test infrastructure and a search record are presented as product test rows — new

Rows **1–4** exercise fixtures and the test oracle/`linkedReferences` adapter; they do not exercise a likec4-mutator product entity. Row **37** records a grep investigation, has type `—`, and names no test file. Under the supplied subject boundary, another test and its infrastructure are not standalone product test subjects. Rows 2–4 may improve confidence in an oracle, but that does not satisfy this boundary.

**Remove** rows 1–4 and 37 as executable matrix rows. Preserve their useful evidence and fixture non-emptiness/required-construct conditions as setup/oracle documentation and assertions within the product behavior rows that consume them. Keep the existing oracle suite unchanged; this finding does not authorize removing legacy tests. Record the verified SC-005 search as review evidence outside the matrix. I independently found `instanceOf` only in the parser and validation-oracle test files, consistent with that search conclusion.

### 2. MAJOR — Direct mechanism tests do not discriminate missing writer wiring — new

Rows **6–9** call `DeploymentResolver` directly; **28–31** call the snapshot directly with supplied pre/post texts and removal sets. They can pass when those modules are built correctly but product readers/writers never call them. Row 29 in particular can remain green when strict extend targets are absent from every writer's snapshot. Row 45's duplicate-id rejection is a separate guard and cannot prove that snapshot wiring. Rows 55/74 compare surviving target resolutions, but unchanged strict targets also compare equal when no stability mechanism runs.

**Add explicit consumer coverage/ownership** for these direct mechanism claims, rather than calling them wiring gates. Applicable producer/reference combinations remain the current design. For writer integration, require the paired changed-target rejection and safe-write acceptance in the same guard assertion family, and make the scope/multiplicity discriminator observable through the writer that consumes it. Do not invent an addition that re-targets a resolved strict path. Direct tests can remain as unit coverage of the extracted product modules; they must explicitly name their wiring blind spot. A zero numeric threshold is not applicable here; an unconditional/no-op comparison is the relevant disabling fault.

### 3. MAJOR — Instance selectors and node-removal selectors leave INV-3 gaps — new

Row **51** is in the node update/remove file but does not say that both operations exercise its unknown/duplicate-root selector refusals. Rows **58** cover addition's `node`/element/name failures; **59–63** do not cover missing or ambiguous instance ids for **update and remove**. Read best effort on duplicate ids does not prove write refusal, and CLI form validation does not prove library selector uniqueness.

**Add** explicit unknown-id and multiple-candidate refusal coverage for instance update/remove, with `id`, named candidates, byte-identical sources and unchanged reads. State that row 51 applies to both node update and node removal. Owners: `tests/mutator/deployment-instances-write.test.ts` and `tests/mutator/deployment-nodes-update-remove.test.ts` respectively.

### 4. MAJOR — Relationship read provenance is missing — new

US-4 requires **`declared`, file and source range**. Rows **24–27** enumerate effective fields, connector forms and filters, but never assert these three fields. The source-less and extend-body examples make provenance particularly significant: effective endpoints alone cannot distinguish the wrong containing declaration/file/range.

**Add** these provenance properties to the relationship-read coverage owned by `tests/query/deployment-relationships-read.test.ts`, including nested and extend-body declarations. Compare against the input declaration/CST positions rather than a fabricated getter provenance contract.

### 5. MAJOR — New writer input-safety and line-ending behavior lack explicit coverage — new

The spec requires the existing DSL-injection checks to extend to the new parameters and requires writers to preserve line endings. Row **43** covers node titles containing quote/backslash/slash; this does not cover malformed instance element references or relationship endpoint reference forms, nor new block CRLF output. Rows 58/65 use unresolved or model-only references, which can pass a semantic lookup guard without proving the form guard. Existing `write-value-checks.test.ts` exercises existing operations; existing `line-endings.test.ts` likewise lists logical operations, and row 80 does not even identify that file. Plan T024 explicitly has a CRLF gate, but row 40 omits it.

**Add** observable injection/form rejection for the new reference parameters at the library boundary, with offending fields and atomicity, and line-ending preservation for the new deployment writer paths, including block creation in a CRLF file and existing-body edits. Use `tests/mutator/deployment-instances-write.test.ts`, `deployment-relationships-write.test.ts`, and an explicitly owned extension to `tests/mutator/line-endings.test.ts` or the relevant deployment writer files. This concerns text emitted by the product, not source-code formatting.

### 6. MAJOR — SC-002 fixture breadth and fixture blind spots are underspecified — new

Rows **39/56/64** explicitly run successful additions on both fixtures. Node updates/removals (**47–55**), instance updates/removals (**59–61**), relationship updates/removals (**67–69**) and extend writes (**71–74**) do not explicitly do so or assert field-by-field oracle agreement for all surviving entity families. SC-002 requires both unrelated fixtures after each deployment write, including removals. A valid output alone does not establish computed-value equality. Rows 24, 39 and 56 name samples without identifying what those samples do not verify; row 82's recursive round-trip suite actually compares logical element FQNs and logical relationship counts, not deployment structure.

**Add** explicit two-fixture applicability and surviving-entity oracle comparison ownership to those write rows. Name the sample blind spots, especially standalone parser/linker differences and the logical-only round-trip assertions of row 82. Keep parser/round-trip tests as their actual contracts, not evidence for deployment read or mutation correctness.

### 7. MINOR — Ambiguous file ownership and contradictory row wording — new

Row **2** names a test file and helper without an explicit test owner; rows **46/79/80/81/82** name multiple files without assigning assertion ownership (row 46 does at least identify suites). Many `Where` entries say only `same`; several multi-file lists abbreviate paths. The request requires a named test path for every row and a named owner for multi-file rows. Row **67** says it goes red when the update edits line tags while LikeC4 reads them from the line, which describes the correct location rather than a fault.

**Make** each row's test-file path explicit, identify the owner for every multi-file row, and correct row 67's counterexample to updating the wrong tag location or leaving an effective old tag. Remove the obsolete residual claim that T030 lacks row 62(b)'s combination.

## Discriminating-strength audit

Reasoning only; no deliberately broken product was run. No numerical threshold appears in these mechanisms. For every row below, disabling means omitting the behavior or applying a no-op guard. Wrong-key faults are judged against the row's stated inputs, not against hypothetical stronger tests.

| Rows, individually included | Reasoning and limits |
|---|---|
| 1, 2, 3, 4 | Fixture/adapter assertions can detect omissions in their own test infrastructure; they cannot establish product wiring. Remove as standalone product rows (finding 1). |
| 5 | Existing diagnostic cases detect changed adapter behavior; an unchanged suite is regression evidence, not deployment writer wiring. |
| 6, 7, 8, 9 | Wrong resolver scope/order/target kinds differ from the oracle; direct calls still pass if product consumers omit the resolver (finding 2). |
| 10, 11, 12 | Public reads observe kinds/defaults, optional shape and logical leaks; reversed document order and wrong index keys change asserted results. |
| 13, 14, 15, 16, 17, 18 | Public node reads observe effective values, provenance, direct-parent filtering and recovery; omission/default-only computation changes outputs. Structural/key errors are visible through differing parents/files/extends. |
| 19, 20, 21, 22, 23 | Public instance reads discriminate inheritance, the two exceptions, target FQN and parent filtering. Row 23's two implicit-name examples both end in `api`; they do not by themselves discriminate written versus resolved last segment, although the element-filter assertion does distinguish written text from FQN. Do not claim a distinction those two equivalent examples cannot show. |
| 24, 25, 26, 27 | Effective relation fields, ignored inline strings, source-less behavior and filters distinguish omission/wrong endpoint keys; provenance omission remains invisible (finding 4). |
| 28, 29, 30, 31 | Direct comparison can distinguish omitted records, confused scopes, multiplicity and unmatched records. Correct extracted logic with no writer wiring remains green (finding 2). |
| 32, 33, 34, 35, 36 | Public logical writes supply changed-reference refusals and safe acceptance. Missing/no-op checks accept forbidden writes; wrong subtree or reference-family keys miss the stated refusal. Acceptance prevents unconditional rejection. |
| 37 | No executable behavior assertion (finding 1). |
| 38 | Existing public reference refusals detect missing wiring. Existing exact detail assertions are legacy tests to retain; they do not authorize adding new arbitrary wording assertions under I §5. |
| 39, 40, 41, 42, 43 | Public writes/read-back distinguish missing generation, placement, validation and escaping. Different document/load orders and explicit files discriminate file keys. CRLF is missing (finding 5). |
| 44, 45 | Row 44 observes public endpoint/view guard behavior. Row 45 proves duplicate-id checks and safe strict paths; it stays green if strict-target snapshot wiring is absent (finding 2). |
| 46, 47, 48, 49, 50, 51 | Existing/public shape and updates expose wrong anchors, omitted stripping, icon shadowing and syntax guard. Row 50's accepted title rejects an unconditional syntax gate. Row 51 needs operation coverage explicit (finding 3). |
| 52, 53, 54, 55 | Cascade/read-back and view refusals detect missing removal behavior, subtree keys and extend lookup; unchanged survivor targets alone cannot prove comparison wiring. Pair with a changed-survivor refusal (finding 2). |
| 56, 57, 58, 59, 60, 61, 62, 63 | Public instance generation, refusal, copy-on-write, metadata read-back, cascade and changed-reference cases detect omitted behavior. Row 62(b) distinguishes an endpoint-specific wiring omission. Row 63 alone does not reject an unconditional syntax gate; assign accepted non-collection instance updates in the same guard family. Selector/form gaps remain findings 3/5. |
| 64, 65, 66, 67, 68, 69, 70 | Public relation writes distinguish inline/body mistakes, endpoint scope and selector ambiguity. Row 67's stated fault is contradictory (finding 7). Row 70 alone permits unconditional syntax rejection; include accepted non-collection relation updates in the same guard family. |
| 71, 72, 73, 74 | Effective extend contribution, invalid targets, occurrence and cascade expose omissions/wrong file or occurrence keys. Row 74's changed-survivor refusal is necessary alongside unchanged survivors; direct snapshot tests cannot substitute for it. |
| 75, 76, 77, 78, 79 | CLI output/effects, form rejection, batch atomicity and existing validation distinguish missing dispatch/validation and wrong operation/field keys. Row 77 observes prior successful effects being withheld, preventing a merely per-operation atomic implementation from passing. |
| 80, 81 | Existing public writer regression files exercise their actual operations. They cannot prove invocation of new deployment guards; no such claim should be assigned to them. |
| 82 | Parser and logical round-trip assertions detect parser rejection; omission of deployment reconstruction remains green. Explicitly name that blind spot (finding 6). |

The positive cases in rows 35/36 and the unchanged-resolution examples should remain paired with their corresponding guard refusal claims. Extend-preservation assertions and duplicate checks are useful but cannot replace a writer-level changed-survivor assertion. No new test level, performance benchmark or numeric target is justified by the spec.

## FRICTION

The matrix calls the RES-plan-1 endpoint combination absent from the plan, while current T030 already contains it. Also, the direct-module testing rationale treats correctness of an extracted mechanism as evidence of consumer wiring; those are separate claims under the requested discriminator. Both mismatches are recorded above without reopening the design.

## VERDICT NOT-READY

Must-fix:

1. Remove infrastructure/search records as executable product matrix rows; retain setup and review evidence outside that role.
2. Separate direct mechanism correctness from consumer wiring; name wiring blind spots and assign observable consumer guard coverage, including accepted non-collection writes under syntax errors.
3. Cover instance update/remove selector failures and explicitly apply node selector refusals to removal.
4. Cover deployment relationship `declared`, file and source range.
5. Cover new reference-parameter input safety and deployment writer line-ending preservation.
6. State both-fixture and surviving-value coverage for every write family and identify fixture/round-trip blind spots.
7. Make paths/owners explicit and correct contradictory/stale explanations.
