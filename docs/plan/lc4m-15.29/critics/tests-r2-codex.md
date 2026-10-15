# Test coverage review, round 2

Scope: the complete tests.md, spec.md including Changelog, plan.md, tests-r1-codex.md, the testing section of CLAUDE.md and CLAUDE_TEST_GUIDELINES.md. Product and existing tests were read only. Only this report was created. No tracker writes, implementation changes, commits, product mutation or test-suite run were performed. tests-rationale.md was not read.

## Findings

### F1 — MAJOR — The universal accepted-write convention contradicts row 47

CLASS: consequence of fix tests-r1-codex.md#4

The convention now applies Wv or Wi to **every successful write call in every row**, explicitly saying that a row cannot opt out. Row 47 successfully calls the existing `addElement`, intentionally turning a previously resolved `include api` into an unresolved reference. LINK necessarily fails on exactly that transition. Wv also fails on the newly introduced LikeC4 error; Wi would not permit adding it either. Thus the regression required by INV-7 cannot pass the newly universal assertions.

This is an observable contradiction, independent of implementation. It also appears in the D44 paragraph (LINK on every accepted write), the INV-8/INV-9 mapping and the statement that every accepted-write row needs T002. Existing regression rows 37–40, 42 and 93 advertise unchanged files and omit T002 while including legacy operations outside this feature. They must not silently acquire new feature contracts.

The code supports the intended distinction: `resolveDocumentReferences` in `src/query/workspace-index.ts:534` excludes view rules and steps; the current snapshot comparator in `src/query/reference-snapshot.ts:268–292` reports resolved-to-unresolved changes when those references are actually collected. Plan RES-plan-1 and row 47 intentionally preserve the old caller's weaker policy.

**Fix:** scope the mandatory Wv/Wi/LINK/SURV convention to successful writes of this feature and their apply forms. Explicitly distinguish unchanged legacy regression calls, especially row 47, and propagate that scope through the convention, D44 explanation, prerequisites and mapping. Keep row 47's acceptance and unresolved-reference observation. No product-policy change or additional level is needed.

### F2 — MAJOR — Wv still does not enforce SC-004's computed effect on every successful rule/step write

CLASS: incomplete closure tests-r1-codex.md#4

Wv checks validation, parsed-view agreement, named-view survival and reference stability. None compares the computed content of an edited view with the expected transformation. The convention says that a row's local effect assertion comes in addition, but does not require that assertion for every successful rule/step branch.

Concrete remaining gaps:

- Rows 68 and 71 accept rule writes with Wv alone. Their successful guard/property counterparts do not require CMP. Row 91's accepted rule-property apply branches likewise have Wv only.
- Rows 74 and 75 compare the new parsed step, and row 77 checks insertion/read-back/bytes. Their successful writes do not require comparing the entire computed step sequence. Row 80's accepted final-state patches have Wv without SEQ.
- Rows 66/67/70 cover dynamic rule writes using CMP, but CMP is defined exclusively as computed **nodes**. SC-004 explicitly requires the **step sequence** for dynamic views. The mapping lists CMP for these rule rows and lists SEQ only for step rows; it does not close that mismatch.

An implementation that writes the requested new step but reorders another existing step can satisfy parsed agreement, validation, SURV and LINK. Checking only the new parsed step is therefore insufficient. Similarly, parsed rule read-back and surviving named views do not establish the required computed rule effect. Correctness of each output against its own parsed oracle is different from correctness against the expected before-to-after transformation.

**Fix:** add a universal computed-effect obligation for every successful feature rule/step write, accepted rejection counterparts and apply branches included: nodes for element/deployment rules, expected computed sequence for dynamic rule and step writes. Keep expectations independent as CMP/SEQ already prescribe. Carry the obligation into the affected rows and SC-004 mapping; reuse their existing test files, T018–T022 anchors and T002 oracle. Do not add duplicate rows or standalone helper tests.

### F3 — MAJOR — Runtime JSON validation still omits nested address and required-member classes

CLASS: incomplete closure tests-r1-codex.md#6

Row 90 substantially expands the original coverage, but its container list covers top-level `path`, `from`, `to` and `statements` only. It never requires malformed **`address.path`** coverage for update/remove step operations. Rule-address integer checks are named for `address.index`, while the distinct `before.index` object is only covered for a malformed outer object and unknown fields. Missing-required coverage concerns top-level objects; it does not include missing required members of an otherwise present rule, step or address object.

These are different runtime dispatch boundaries: a correct top-level path validator can coexist with an unvalidated nested step address, and an object-shape check can accept `{}` without validating its required contents. The listed positive operations and library semantic rejections do not force either defect to fail at the required JSON path. Row 90 also names invalid direction/kindForm values for `step` but not for `patch`; a patch-only enum validation omission can escape the stated cases.

This is not a request to duplicate TypeScript checks. JSON enters as untyped values: current `src/mutations-file.ts:298–337` separately implements unknown-field, required-string and optional-string checks, and nested links separately require their members at `:437–446`. Plan T022 introduces distinct rule/step/patch/address validators. Existing apply tests inspected cover the older operations, not these future nested shapes. CLI library-error mapping at `src/cli.ts:465–474` cannot itself establish whole-file runtime validation.

**Fix:** complete row 90's runtime classes for nested rule/step addresses and their required members, including the `before` and step-patch variants. Require located rejection, exit 1 and unchanged files, retaining accepted counterparts. Keep the existing T022 test file and unit level; no per-literal test-case design or new level is required.

## Round-1 closure audit

| Previous finding | Round-2 result |
|---|---|
| F1 | Closed: rows 1–9 end at T006, which supplies their test file. |
| F2 | Closed: old rows 34–35 are infrastructure gates I-4/I-5; existing tests are preserved. |
| F3 | Closed in the LINK/Wi definitions: enumerate references resolved before, reject loss and retargeting, and apply SURV/LINK on invalid input. The overbroad application to legacy calls is this report's F1. |
| F4 | Partially closed: accepted branches now inherit Wv/Wi, but scope is contradictory (F1) and computed effects remain incomplete (F2). |
| F5 | Closed by the supplied D44 decision. Missing/disabled writer attachment remains unproved, explicitly accepted; it is not reopened here. |
| F6 | Partially closed: malformed outer objects and many new field classes were added; nested classes remain (F3). |
| F7 | Closed: rows 95–96 add both outcomes for try/alt at the reader and creation/leave-block writer boundaries. |

D43 remains consistent across spec Changelog, plan T017 and row 94. Self-reference removals are paired with an outside-referrer rejection; the error excludes the removed declaration's own reference. No new [SPEC-CONCERN] or [USER-DECISION] is needed for these findings.

## Coverage, levels, suppliers and discrimination

A read-only metadata check found 94 product rows, ids 1–96 except the intentionally retired 34/35. Every row has a test-file path, unit type, exactly one `wave` token and a nonempty list of existing T001–T026 ids. Multi-file rows identify an owner. New test files resolve to T006–T009, T015–T022; fixtures to T001, oracle to T002 and getView to T009. Their suppliers precede or coincide with their anchors. Existing regression paths exist. The prerequisite consequence of the universal convention is described in F1.

The three existing no-views-block throws were verified at `tests/integration/edge-cases.test.ts:219–224`, `:509–514` and `:634–639`; row 41 correctly requests their rewrite. The helper currently exposes `{ title, folder }` at `tests/helpers/likec4-model.ts:197–198`, consumed by `tests/mutator/title-slash.test.ts`; preserving that through infrastructure gates is appropriate. Installed language-server package.json reports 1.59.4. Its `parseTryStep` and `parseAltSteps` at `dist/chunks/module.mjs:6738–6785` confirm that contributing catch/finally alone is insufficient while one contributing alt branch suffices.

| Rows | Discrimination reasoning |
|---|---|
| 1–9 | Differing scope/type/declaration targets distinguish absent resolution and wrong keys at the direct boundary. Rows 15/21/31 and 53/70/76/81 exercise consumers; 63/94 exercise reverse-index consumers. Corrected T006 anchors remove the former scheduling failure. |
| 10–18, 20–33 | Oracle comparisons, independent source positions and paired exception observations distinguish missing fields, wrong order/scope and unconditional filtering. Public assembly is reached in row 22. These inspect product inputs/outputs, not TypeScript source structure. |
| 19, 95 | Both contribution outcomes distinguish absent classification, literal-empty checks, generic descendant search and an all-alt-branches threshold. Row 95 explicitly extends sequence comparison to its inline inputs. |
| 36–42 | Existing product calls protect regressions; 41 changes the three obsolete expectations. They are not standalone tests of the oracle. F1 limits what may be inferred from unchanged legacy calls. |
| 43–46 | Distinct equal-text scopes, removal/move matching and explicit changed/lost targets discriminate direct comparator behavior and key choice. Consumer attachment is deliberately outside the proof under D44. |
| 47 | Opt-in policy distinguishes an accidentally enabled guard on a legacy caller; the universal convention currently contradicts its intended outcome (F1). |
| 48–62 | Competing placement candidates, accepted/rejected headers, parent types, scope pairs and final layout selection distinguish missing checks, disconnected checks, unconditional rejection and wrong file/property selection. Wi now includes survival and reference targets. |
| 63–65, 94 | Referrer roles and coupled self/outside-reference cases distinguish absent removal protection, disabled rejection and overbroad ownership exclusion. |
| 66–72 | Address, placement and admissibility pairs distinguish missing rule checks and wrong address/scope keys; computed-effect completeness remains F2. |
| 73–81 | Endpoint/type rejections, D36 round trips and D38 final-state pairs distinguish missing validators, wrong direction and old-state checks; whole-sequence effects are incomplete in F2. |
| 82–88, 96 | Literal pre-move examples, no-op bytes, block removal reporting and positive/negative contribution cases distinguish wrong boundary keys, missing writer checks and disabling contribution thresholds. Both try/alt outcomes are now coupled at consumer boundaries. |
| 89–93 | Per-operation success distinguishes missing dispatch; rejected batches distinguish premature file writes and error mapping failures. Nested JSON omissions remain F3; accepted branches inherit the effect gap in F2. |

No additional test level is warranted. No remaining product row has source/AST inspection of implementation, another test or pipeline machinery as its subject. Fixture presence checks and oracle preconditions are attached to consuming product assertions. I-4/I-5 and documentation/release checks stay gates. No duplicate rows need removal.

## FRICTION

- Combined reads exceeded tool output limits; artifacts were subsequently inspected in smaller ranges. No conclusion treats a truncated command as a complete artifact.
- The matrix cites rationale sections R-3/R-4/R-5 while that file is intentionally excluded. It was not opened. D44 was accepted as supplied in the review instruction; this report does not claim independent verification of its tracker comment.
- The matrix calls D44 a spec decision, but the supplied spec itself ends at D43 and has no D44 Changelog entry. The instruction explicitly supplies the later accepted decision, so this is provenance friction rather than a reopened product decision.

## Verdict: NOT-READY

Must-fix:

1. Scope accepted-write invariants consistently so row 47 and unchanged legacy regressions remain executable (F1).
2. Require the appropriate computed effect for every successful rule/step branch, including dynamic rule sequence and apply counterparts (F2).
3. Complete nested runtime JSON validation classes in row 90 (F3).
