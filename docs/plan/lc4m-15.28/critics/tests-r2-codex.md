# Test coverage critique — round 2

Scope: closure of round-1 must-fix items and consequences of the listed amendments. No design reopening, test-case implementation, test-suite execution, or deliberately broken product run. Only this report was written.

## Evidence

Read the revised matrix, rationale, spec, plan, round-1 report, the actual `CLAUDE.md` testing section, and `CLAUDE_TEST_GUIDELINES.md` I §§5–6. Code grounding includes `src/mutator/mutator.ts`, `src/mutator/write-checks.ts`, `src/query/workspace-index.ts`, the test-file inventory, `tests/helpers/likec4-model.ts`, existing line-ending, semantic-write, parser, oracle and recursive fixture tests. The installed language-server package is 1.59.4; its `dist/chunks/module.mjs` implements strict direct-child extend scope, deployment node-before-instance lookup, the view-only element pass, and duplicate-instance validation. The new deployment modules and their suites are planned, not implemented.

Every product row names a test path and has exactly `unit` and `wave`. CLI subprocess tests and files under `tests/integration/` remain unit tests under the repository canon. No missing test level or additional benchmark is required. The grammar coverage check retains its separately authorized scope. Documentation, coverage-status review and release preparation properly remain review gates.

## Round-1 closure

| Round-1 finding | Result |
|---|---|
| 1 — infrastructure/search subjects | Search record and row numbering are fixed. Standalone oracle self-checks remain scheduled under I-2–I-4 and T002; finding 1 below. |
| 2 — consumer wiring | Rows 83/85, the wiring map, strict-path blind spots and paired deployment-writer rows materially close the consumer gap. Logical-addition acceptance remains a separate row; finding 2 below. |
| 3 — selectors | Closed: row 51 explicitly covers both node operations; row 87 covers both instance operations, missing ids and ambiguity with atomicity. |
| 4 — relationship provenance | Closed by row 84, with input-position expectations and declaration/file distinctions across containing scopes. |
| 5 — forms and line endings | Row 92 explicitly extends the existing line-ending owner across all 11 operations and new-block/body paths. Rows 88–91 cover unsafe-input refusal, but overstate form-check discrimination and row 89 contradicts amended endpoint fields; findings 3 and 5 below. |
| 6 — breadth/oracle/sample limits | Main write families now explicitly use 2F and W, and fixture/parser/round-trip blind spots are named. Universal W creates an invalid-input contradiction; finding 4 below. |
| 7 — ownership/stale wording | Closed for the original issues: owners are stated, row 67's counterexample is corrected, and RES-plan-1 no longer calls T030's endpoint combination absent. |

RES-plan-1 remains clean. Strict-target additions are not invented. The removal, scope and multiplicity consumer claims are now distinguished from direct mechanism coverage.

## Findings

### 1. MAJOR — Relocated oracle self-tests remain standalone test subjects

**Class:** `incomplete-fix tests-r1-codex.md#1`.

I-2, I-3 and I-4 still schedule assertions in `tests/likec4-validate-oracle.test.ts` whose subjects are the new test helper, its option handling and its linked-reference adapter. Plan T002 still requires the oracle test to reproduce spike literals and null targets. Moving these executable checks outside the product table does not change their subject: another test's infrastructure. R-1 explicitly relies on those self-checks as proof of independence.

**Remove** the new standalone oracle self-check obligations from I-2–I-4 and T002. Preserve spike outputs and adapter assumptions as setup/review evidence, and assert required oracle preconditions within the product rows that consume them. Keep the existing oracle tests unchanged. Propagate this correction to R-1; an existing helper-test precedent does not resolve the supplied subject boundary.

### 2. MAJOR — Logical-addition rejection and acceptance remain split across rows

**Class:** `incomplete-fix tests-r1-codex.md#2`.

Rows 32, 33 and 34 own separate guard refusal claims; row 35 owns their safe acceptance. Sharing a `describe` is organizational proximity, not a single paired coverage obligation. This is the expressly prohibited separated linkage. A refusal row alone stays green for an unconditional guard, and the matrix still needs a different row to establish discrimination. The snapshot introduction and R-5 call these writer guards paired even though their matrix obligations are separated.

**Combine** each logical-addition refusal with its corresponding safe acceptance in one row/table obligation owned by `tests/mutator/deployment-reference-stability.test.ts`. Remove the standalone acceptance-only obligation of row 35, retaining its number as a cross-reference if useful. Update the wiring introduction, R-5/R-7, SC/INV mappings and residual summary consistently. This is a matrix pairing correction, not a new reference-policy requirement.

### 3. MAJOR — Unsafe-input rows do not establish absence-of-form-check discrimination

**Class:** `consequence-of-fix tests-r1-codex.md#5`.

Rows 88–91 claim failure if the form check is skipped. Their malformed references also fail semantic lookup or loaded-file selection. Removing only `checkReferenceForm` can still produce the same `InvalidWriteError` field, unchanged files and unchanged reads. In particular, the existing `resolveReferenceText` in `src/query/workspace-index.ts:470` splits the text into segments and resolves their exact names; `prod }` or `app.api'` need not reach text insertion to be refused without a separate form check. Row 90's unloaded `../a.c4` similarly needs no form checker to fail a loaded-file membership check.

**Keep** the boundary input-safety obligations, but **remove** the unsupported claims that they prove invocation or existence of a particular form checker. Name this semantic-check blind spot and reflect it in R-7. If a specific additional form-only product effect is claimed, assign an observable discriminator for that effect; do not use private call-order assertions, source inspection, arbitrary message text, or a broken-product run. No hypothetical unsafe write should be reported as verified. The current rows prove refusal/atomicity for these inputs, which is useful but narrower than their mechanism claim.

### 4. MAJOR — Universal W conflicts with accepted writes retaining existing errors [SPEC-CONCERN]

**Class:** `consequence-of-fix tests-r1-codex.md#6`.

W now requires `expectValidLikeC4` after **every accepted deployment write**. Rows 50, 63 and 70 explicitly accept non-collection updates while a loaded file still has syntax errors. They therefore cannot also satisfy an empty-error oracle. Row 62(c) starts with an ambiguous reference; other unrelated errors need not disappear. The fixture blind-spot paragraph explicitly places invalid cases inline, but the global convention does not exempt them. The SC-002 accepted-write enumeration omits the new acceptances in rows 50/63/70 while the convention includes them, so the correction was not propagated consistently.

This exposes an existing spec tension: INV-1 permits pre-existing errors to remain, whereas SC-003 literally requires every accepted write to pass `expectValidLikeC4`. The existing unit precedent in `tests/mutator/semantic-write-checks.test.ts:182` compares normalized before/after errors for accepted writes in an already-invalid workspace. The helper's `expectValidLikeC4` asserts an empty error list; it cannot establish introduced-only behavior on such inputs.

**Reconcile** SC-003/W with INV-1 explicitly: valid-input success keeps the clean oracle requirement; intentional invalid-input acceptance needs independent read-back and evidence that it introduces no error, without requiring the old error to disappear. Apply that distinction to rows 50/62/63/70, the SC/INV mapping and applicable plan gates. Do not silently drop these paired acceptances or weaken valid-fixture validation. If the owner intends the literal universal SC-003 instead, that conflicts with the specified syntax-error acceptance and needs a human decision rather than a test-level change.

### 5. MINOR — New endpoint refusal expectations contradict the amended plan

**Class:** `consequence-of-fix tests-r1-codex.md#5`.

Row 89 expects `source` / `target` for malformed endpoint ids and element parts. Amended T034 explicitly requires `source.id` / `target.id` and `source.element` / `target.element`, including `apply` paths. Row 65 likewise abbreviates unresolved endpoint failures to `source` / `target`. These are externally reported structured fields, not optional prose wording; a test asserting the shortened field would reject the planned implementation. Rows 76/77 do not explicitly repair the element-part library-error propagation claim.

**Align** rows 65/89 with T034's field paths and identify the corresponding `apply` propagation obligation in the existing CLI owner. Keep hierarchy failures on `target`, as T034 specifies. If update/remove selector fields intentionally differ from add fields, state that distinction explicitly in the matrix instead of saying all selectors are the same.

## Discriminating-strength audit

Reasoning only. There is no numeric threshold in these mechanisms; a zero-threshold fault means a disabled/no-op guard, while an always-rejecting guard requires a safe acceptance. Direct units are assessed together with their named consumer coverage, with their acknowledged wiring blind spots retained.

| Rows individually included | Reasoning and limits |
|---|---|
| 6, 7, 8, 9 | Direct resolution observes omitted passes, wrong scopes, strict-vs-descendant lookup and target classes. Missing consumer wiring is expressly unobserved here; rows 23/26/53/58/65/66/83/85 supply consumer observations. |
| 10, 11, 12 | Defaults/order, optional specification shape and logical leak assertions detect omitted behavior and wrong file/model keys. Existing shape regression owners remain explicit. |
| 13, 14, 15, 16, 17, 18 | Node values, precedence, provenance, direct-parent filters, style layer and recovery distinguish omitted computation or wrong entity/file/container keys. Oracle loops have explicit presence preconditions. |
| 19, 20, 21, 22, 23 | Instance inheritance, whole-map replacement, ordered tags, the two exceptions and resolved element filtering distinguish missing/wrong-key behavior. Row 23 correctly stops claiming written-vs-resolved last-segment discrimination; row 86 supplies the unresolved-name distinction. |
| 24, 25, 26, 27 | Relation values, inline/line precedence, connector/source-less rules and instance id filters discriminate wrong fields/endpoints. Public resolver ambiguity and provenance are separately explicit in 83/84. |
| 28, 29, 30, 31 | Direct snapshot results discriminate missing records, collapsed scope keys, removal ordinals and unmatched survivors. They do not prove writer wiring. Strict-path and observationally equivalent key-collapse limits are now stated; consumer scope/multiplicity evidence is in 55/74/93. |
| 32, 33, 34, 35, 36 | Public logical writes detect omitted/no-op protection and wrong reference-family/subtree keys. Row 36 pairs refusal and safe removal. Rows 32–35 still divide the unconditional-guard discriminator across obligations: finding 2. |
| 38, 46, 79, 80, 81 | Existing public behavior suites retain their actual regression contracts and owners. They do not prove new deployment guard wiring, and the matrix no longer claims they do. |
| 39, 40, 41, 42, 43 | Requested values, differing file/document orders, placement refusal classes and title read-back observe missing generation, ignored options, wrong insertion keys and escaping errors. CRLF now has owner 92. |
| 44, 45 | Paired public changed-target/safe additions detect missing/no-op/unconditional snapshot checks and wrong reference-family keys. Row 45 detects duplicate-index omissions and explicitly does not prove strict-target snapshot wiring. |
| 47, 48, 49, 50, 51 | Read-back, unaffected descendant extends, two-file changedFiles, icon shadowing and both selector operations expose absent editing/stripping and wrong anchors/keys. Row 50 has a same-test acceptance for unconditional syntax guards, but global W is contradictory: finding 4. |
| 52, 53, 54, 55 | Cascade sets, subtree view refusals, extend-body lookup and paired survivor acceptance/refusal expose omitted removal checks and wrong subtree/removal-set keys. Row 55's acceptance must assert which references actually survive; equal-text blocks intentionally removed by the cascade are not themselves survivor evidence. |
| 56, 57, 58, 59, 60, 61, 62, 63 | Instance output, implicit duplicate ids, target class, own-value updates, effective metadata, element-part cascade and paired stability guards expose missing behavior and wrong element/instance/endpoint keys. Syntax acceptance prevents an unconditional guard; invalid-input validity needs finding 4's correction. |
| 64, 65, 66, 67, 68, 69, 70 | Body-only properties, chosen-file endpoint scope, line-tag replacement, full selectors and narrowed ambiguity distinguish omitted editing/validation and wrong endpoint/file/tag keys. Row 67's counterexample is corrected. Fields and invalid-input acceptance need findings 5/4. |
| 71, 72, 73, 74 | Chosen-file provenance, node-only target, 1-based occurrence and paired removal effects expose omitted contributions/cascade/guards and wrong target/file/occurrence keys. Row 74 now assigns observable snapshot and removal-set discrimination. |
| 75, 76, 77, 78 | CLI effect read-back, strict form errors, prior-success rollback and US-12 fields detect missing dispatch/validation, no-op protection, wrong field mapping and partial-batch writes. Finding 5 requires endpoint subfield propagation to be explicit. |
| 82 | Existing sweeps observe standalone parser acceptance and logical-only round trips. Deployment reconstruction can be absent while these stay green; that blind spot is correctly documented. |
| 83, 84, 85 | Public reads distinguish node/instance precedence with a contrasting input, ambiguous relation omission, extend frames, declaration positions/files and strict path lookup. These supply the formerly absent read consumer/provenance observations. |
| 86, 87 | Written unresolved names participate in duplicate rejection; both instance selectors refuse zero/multiple candidates. Missing indexing/checks or first-match keys change observable results. |
| 88, 89, 90, 91 | Unsafe-input refusal and atomicity are observable, but semantic/loaded-file rejection can mask removal of the standalone form check: finding 3. Endpoint field expectations also need finding 5. |
| 92 | Every operation must actually alter its selected file, as in the existing line-ending runner, then preserve LF/CRLF and validate. This detects missing text generation and wrong line-ending selection. It remains a product-output test, not code formatting. |
| 93 | Paired changed-q refusal/safe addition and p-block removal expose absent writer comparison and mispaired observable survivors. A key collapse preserving pairing is expressly unobserved here and assigned to the direct unit; no invented product effect is claimed. |

No additional level is required. The 2F sample limits and recursive-sweep limitations are stated. Existing tests pinning US-12 defects were not found in the test code search; retaining I-6 as review evidence is appropriate. Other than the retained oracle self-test obligations, no new pipeline-wrapper or source-code assertion subject is introduced by the amendments.

## FRICTION

The amended plan specifies endpoint subfield errors while the new matrix uses top-level fields. Universal W/SC-003 requires clean output for accepted writes that deliberately retain syntax errors; INV-1 permits those old errors to remain. These are concrete artifact inconsistencies, not failures observed in an implemented deployment writer. No test suite or probe script was run.

## VERDICT NOT-READY

Must-fix:

1. Remove new standalone oracle self-check obligations from I-2–I-4/T002 and update R-1; retain setup/review evidence and legacy tests.
2. Put logical-addition refusal and safe acceptance in the same coverage obligation; update every dependent mapping and wiring summary.
3. Correct rows 88–91's form-check discrimination claims and document semantic/loaded-file masking without introducing internal-path assertions.
4. Reconcile W/SC-003 with INV-1 for accepted invalid-input writes, then propagate the conditional oracle obligation to the rows, summaries and plan gates.
5. Align endpoint refusal fields with T034 and explicitly assign their CLI propagation coverage.
