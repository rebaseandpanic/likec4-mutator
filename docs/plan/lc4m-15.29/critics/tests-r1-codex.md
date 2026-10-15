# Test coverage review, round 1

CLASS: new

Scope: the complete tests.md, spec.md (including its Changelog), plan.md, the project testing canon and testing guidelines. This is a read-only review of product code and existing tests; only this report was written. No product mutation, test implementation, tracker write, commit or full test run was performed.

## Findings

### F1 — MAJOR — Resolver rows have an anchor before their test-file supplier

Rows 1–8 end their code dependencies at T005; row 9 ends at T004. Their Where file, tests/query/view-resolution.test.ts, is created by T006, not either anchor. The matrix explicitly defines the last task as the task holding the row, and requires every supplier to exist by that anchor. Thus the test-file supplier is later than the advertised execution point. All task ids exist, but that does not make this scheduling valid.

Add T006 as the final dependency/anchor of rows 1–9, retaining the earlier exercised-code dependencies. This also makes the resolver class gate coincide with the task that actually owns it. No new task or test level is needed.

### F2 — MAJOR — Helper compatibility is presented as product coverage

Rows 34 and 35 have the test oracle and its helper result shape as their subject: keeping validateLikeC4 unchanged and preserving buildLikeC4Model(...).views[id] for another test. The current helper really constructs only title/folder records (tests/helpers/likec4-model.ts:197–198), and title-slash.test.ts consumes that shape. This is useful compatibility work, but neither row observes a new product contract; row 35's stated counterexample is a change to test infrastructure. The prompt explicitly excludes rows about another test or its harness.

Remove rows 34–35 from the product matrix and retain them as T002 infrastructure/regression gates. Do not delete or weaken the existing test files. Product title normalization remains covered by rows 22, 23 and 32 and the existing title-slash tests.

### F3 — MAJOR — LINK omits the resolved-to-unresolved failure and Wi omits survival

The Wv LINK convention compares only references linked both before and after. A surviving reference that resolved before and becomes unresolved after is therefore excluded, although INV-8 prohibits that loss. Current compareReferenceSnapshots explicitly treats a previously resolved target becoming undefined as a change (src/query/reference-snapshot.ts:268–292); the test convention is weaker than that product contract. Validation can catch an error on clean input, but it cannot replace the independent target assertion, especially on inputs already containing errors.

Wi checks read-back and diagnostic multisets only. Rows 41, 56 and 62 consequently do not require INV-8 target preservation or INV-9 computed-view survival for their accepted writes. Those invariants apply to every accepted feature write, not just clean workspaces. Resolving a formerly unresolved reference in row 56 must remain allowed.

Change LINK to enumerate all surviving references resolved before, require each to remain linked to the same target, and exclude only deliberately edited/removed reference occurrences. Apply the appropriate LINK and SURV assertions to Wi too. Preserve the explicit unresolved-to-resolved acceptance. Include oracle prerequisites and supplier T002 in consuming rows where needed.

### F4 — MAJOR — Successful writes do not consistently inherit SC-003 and SC-004

Wv is opt-in by row wording, and several accepted-write rows do not invoke it. Examples: row 59 checks layout effects without output validation or survival; row 60 checks bytes/changedFiles only; row 74 compares the newly parsed step only; row 79 specifies SEQ but no Wv; row 92 says a valid layout is written without validating the resulting workspace. Rows 49, 54, 71 and 91 use validation alone in at least part of their accepted branches. The table mapping to Wv rows does not add obligations to these branches.

A write can satisfy its local assertion while invalidating another view or dropping a computed named view. That is exactly the gap SC-003 and SC-004/INV-9 require the suite to close.

Make the successful-write conventions universal: every successful write on valid input must validate the output, check surviving computed views, and check surviving reference targets. Retain the per-operation CMP/SEQ effect assertion. Explicitly cover the accepted counterparts and no-op cases; supply T002 wherever that adds an oracle dependency. This is consolidation of existing obligations, not additional duplicate rows.

### F5 — MAJOR — [USER-DECISION] Reference-guard wiring remains unproved

The paragraph preceding rows 43–46 explicitly acknowledges that these direct snapshot tests stay green if writers never call the guard. Row 56 also stays green with an absent or disabled guard: it exercises an accepted transition. LINK checks an invariant on the selected successful examples, but a guard-free writer produces the same result on those examples. Thus removing the mechanism, constructing it without attaching it, or disabling rejection all escape the proposed consumer coverage. Row 46 can discriminate comparison logic at the direct unit boundary; it cannot prove writer wiring.

The claim that no feature write can trigger re-targeting is referenced to rationale R-5, which is deliberately not an input to this review. Even if accepted as an argument, it is not an observable assertion that distinguishes the installed guard from its absence.

Resolve this explicitly: provide a genuine observable unit contract through a consumer that distinguishes the wiring, or obtain an owner decision accepting the unobservable defensive mechanism and its coverage limitation. Do not add source/AST inspection, a test of a test, a fake product mutation, or another test level. Direct comparator coverage can stay. The lead confirmed that no waiver or additional observable contract exists and requested this decision finding. Recommendation: explicitly accept the limited evidence for this defensive mechanism, retain its direct comparator tests and the corrected consumer invariants, and record that writer attachment is not behaviourally distinguished. If attachment itself remains a required independently proven contract, the lead must instead identify an observable consumer boundary before calling this covered.

### F6 — MAJOR — Strict JSON type validation is only partially represented

US-12 requires wrong types to be rejected for the operations' fields. Row 90 covers unknown fields, integer indices, paths and statements containers, but not malformed step/patch/rule/address objects themselves or the scalar/array fields introduced for updateView and addView (description, extends, file, tags and links). Row 89 exercises valid dispatch; rows 91–92 cover selected semantic failures. None closes those JSON type classes.

These are runtime JSON inputs, so TypeScript does not discharge the obligation. The existing cli-apply-validation.test.ts cases inspected cover existing addView type/id/target/includes behaviour; they cannot cover the new operation shapes.

Extend the unit validation row in tests/cli/cli-apply-views.test.ts, anchored at T022, to identify the new object/container and scalar type classes, required-field failures, and applicable nullable forms. Keep rejection path, exit 1 and unchanged files as the observations, with accepted counterparts where a permissive/reject-all implementation would otherwise escape. No line-by-line test design or additional test level is required.

### F7 — MAJOR — The contribution predicate's form-specific blind spots remain

Rows 19, 85 and 87 discriminate literal emptiness from a discarded opt block, plus selected invalid single/chain statements. They do not discriminate the different contribution rules for try/catch/finally and alt branches. T005 explicitly commits to those different rules. LikeC4 1.59.4 implements them separately: parseTryStep requires contributing try steps, whereas parseAltSteps requires a contributing branch (node_modules/@likec4/language-server/dist/chunks/module.mjs:6737–6785).

A generic descendant-step search can pass valid stage-6 fixture examples and every named opt/invalid-step example while classifying discarded try/alt forms incorrectly. The same helper serves both reads and writes; exercising its opt case through a writer does not close its other branches.

Expand the contribution classes covered at the reader and the D40 creation/leave-block consumer boundary to include these distinct stage-6 rules, with independent LikeC4 absence/presence observations. Keep positive and negative expectations together per contribution class. Reuse tests/query/view-steps-read.test.ts (T008) and tests/mutator/view-steps-move-remove.test.ts (T021), with T002 as oracle supplier; do not test helper implementation structure.

## D43 repair audit

D43 is consistent with INV-8: references inside intentionally removed text are not surviving references. It narrows D26's referenced-view rejection by the source location of the reference, rather than weakening protection for outside referrers. US-8, the decision table, Clarifications, Changelog, plan T017 and row 94 agree.

Row 94 is appropriately coupled: valid element and dynamic self-reference removals, plus the same element view with an outside referrer that still blocks removal. Its explicit outside-error and absent-self-error assertions distinguish an overbroad exemption. SURV(removedId) and Untouched protect other declarations. Row 63 retains all external referrer roles. No [SPEC-CONCERN] was found in this repair.

## Coverage and discrimination audit

All 94 product rows were inspected. Each has a Where test-file path, a nonempty list of existing plan task ids, and exactly one When run token, wave. Existing paths named in fix rows resolve. Multi-file rows identify an owner. Future fixture paths resolve to T001, oracle paths to T002, and getView to T009; they precede their consumer anchors apart from F1's test-file supplier problem. The three old no-views-block throws really exist at edge-cases.test.ts:219–224, 509–514 and 634–639 and are correctly listed for rewrite.

The following records the reasoning by row family; the general convention findings above apply to every consuming row, rather than being repeated for each row.

| Rows | Discrimination reasoning |
|---|---|
| 1–8 | Resolved/unresolved and differing scope/type/declaration classes distinguish absent resolution and wrong scope/key at the direct resolver boundary. Writer attachment is tested separately in 53, 70, 76 and 81. Supplier anchor fails F1. |
| 9 | Exact oracle referrer sets and source positions distinguish missing roles and containing-view positions; consumer attachment is reached in 63/94. F1 applies. |
| 10–18, 20–33 | Independent parsed/linker expectations, explicit source-derived fields and exception OPs distinguish missing mapping, ignored forms, wrong scope and source order. Positive/negative examples prevent unconditional filtering. Row 22 assembles the public read path. |
| 19 | Both contributing/non-contributing results distinguish missing attachment and a literal-empty or always-true/false implementation, but not all form-specific decisions: F7. |
| 34–35 | Their subject is test infrastructure, not product behaviour: F2. |
| 36–42 | Existing product regressions, fixture parsing and the changed block-creation behaviour are actual observed product calls. Their oracle wiring is not evidence for new runtime reference-guard attachment. |
| 43–47 | Separate equal-text scopes, explicit removal/move pairing, reported changes and opt-in acceptance distinguish direct comparison/key failures. They do not distinguish missing/disabled writer guard: F5. |
| 48–55 | Competing placement candidates, accepted/rejected headers, parent types, rule classes and property values distinguish absent checks, disconnected checks, over-rejection and wrong file/scope/class keys. F4 applies to successful branches without Wv. |
| 56 | Newly resolved references discriminate an over-rejecting guard, but not an absent/disabled guard; F3/F5. |
| 57–62 | Replace/remove/empty-value and last-layout examples distinguish missing writes and wrong property/rule selection; BI plus accepted counterparts distinguish rejection gates. Global successful-write obligations are incomplete: F3/F4. |
| 63–65, 94 | Each referrer class plus accepted unreferenced and self-referenced removals distinguishes absent/unattached/disabled removal checks, overbroad exemption and wrong reference ownership. D43's acceptance and outside-referrer rejection are together. |
| 66–72 | Rule position/effect and paired admissibility outcomes distinguish missing writes/checks, wrong address/scope and unconditional rejection. F4 applies to accepted branches not inheriting Wv. |
| 73–81 | Parsed/content sequence, paths, final-state D38 pairs and BI distinguish absent/unattached validation, old-state/patch-only thresholds and wrong step/segment addressing. F4 applies to 74/79 and untagged accepted counterparts. |
| 82–88 | Pre-move literal examples, no-op bytes, emptied-block reporting and paired discarded-block rejection distinguish wrong index base, missing move/remove logic and opt-only contribution failures. General form coverage still fails F7. |
| 89–93 | Success per operation distinguishes missing dispatch; atomic rejected batches distinguish early file writes and missing error mapping for listed classes. Untested JSON type classes remain F6. F4 applies to accepted paths lacking the global checks. |

No new source-reading row, standalone oracle test, fixture test, framework test, concurrency test or additional test level is warranted. Source ranges and byte preservation concern the library's .c4 output contract, so those assertions are not prohibited inspections of TypeScript implementation code. Existing tests under tests/integration remain unit under the project's explicit canon.

## Friction

- The first combined artifact read exceeded tool output limits. The artifacts were subsequently read in smaller ranges; no conclusion relies on the truncated portion being visible.
- The matrix refers to rationale sections R-3/R-4/R-5 although tests-rationale.md is intentionally not provided to this critic. It was not read. Matrix obligations and the inspected product code were used instead; the runtime guard coverage claim requires the explicit resolution in F5.
- The prompt calls for an English report while using a Russian name for the friction block; this report uses the English heading above to satisfy the public-repository language rule.

## Verdict: NOT-READY

Must-fix:

1. Correct rows 1–9 to anchor at their test-file supplier T006 (F1).
2. Move rows 34–35 to infrastructure gates, preserving the existing tests (F2).
3. Cover resolved-to-unresolved reference loss and apply invariants to Wi (F3).
4. Apply successful-write validation and survival obligations consistently (F4).
5. Resolve the reference-guard wiring coverage decision explicitly (F5).
6. Complete runtime JSON type-class coverage for the new apply surface (F6).
7. Cover the form-specific contribution rules through readers and D40 writers (F7).
