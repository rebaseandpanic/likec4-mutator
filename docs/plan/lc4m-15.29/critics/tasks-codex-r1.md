# Task completeness review — lc4m-15.29, round 1

## Scope and evidence

Read-only review of the live Skein tree under lc4m-15.29.2 against spec.md, plan.md, tests.md, critics/tasks-analyze.md and the creator report `/tmp/zsa/zdox-lc4m-15.29/out/tasks-v1.md`. No tracker writes or implementation changes were made.

The live tree was enumerated with `skein_list` at both levels. Every one of its 29 delivery cards and all eight group cards were read with `skein_show`, explicitly requesting `blocks` and `waits-for`. Decision D45 was read in the parent thread and applied: earlier Waits-for-code ids are suppliers, while the last id is the embedding anchor. Findings below concern task transcription and closure contracts, not a redesign of the approved artifacts.

## RESIDUALS

- RES-tests-1 → clean
- RES-tests-2 → clean
- RES-tests-3 → clean

RES-tests-1: T014/lc4m-32.5 and T015/lc4m-33.1, together with the other owners of rows 36–42, 47 and 93 (lc4m-29.3, lc4m-32.6, lc4m-32.7 and lc4m-35.1), contain the feature-only convention. They explicitly exclude legacy operations, preserve row 47 without LINK/SURV/Wv and include the three rewritten `addView` cases of row 41.

RES-tests-2: T018–T022 (lc4m-33.4, lc4m-34.1–34.3, lc4m-35.1) carry the universal EFF obligation, CMP for element/deployment rule writes, CMP plus SEQ for dynamic rule writes, and whole-view SEQ for step writes. Accepted counterparts, no-op branches and successful apply output are included. This is a required convention, not merely a definition of optional assertions.

RES-tests-3: T022 includes row 90 verbatim, including nested `address.path`, `before.index`/`before.text`, missing required object members, patch enums, precise nested error paths and accepted counterparts.

## Verified coverage and structure

- T001–T026 each have one primary delivery card. The three additional regression cards are separate matrix deliveries, not merged or duplicated plan mechanisms.
- G1–G8 match the plan, in one repository and stream S1. Every delivery card is under a group. The two service nodes are excluded. G7 records its solo rationale.
- All 94 numbered matrix rows (1–96 excluding 34/35) occur exactly once across live card bodies, and each row is identical to the source matrix line. No extra numbered row occurs. Embedded rows are inside their owner's embedded-tests section; T006 owns rows 1–9 in its work section.
- The 20 owner paths each have one owner. Sixteen paths are embedded across 12 implementation cards; four are owned by test cards (T006 and the three additional regression cards). No owner path mixes a test card with embedding. No path needs a multi-card linear chain in this matrix. Unchanged companion files explicitly designated by the source rows remain companion runs.
- Every matrix row is `wave`. All four test cards have the matching run field and `tests` label; no embedded or final run was substituted. There is no final task and therefore no edge targeting one.
- All matrix supplier ids exist. For every owned row, each earlier Waits-for-code supplier and each Needed-to-run task has a direct outgoing blocking edge from the owner to the supplier, excluding self. This checks D45 against live edges, not the creator's claimed proof. The cards expose 100 task-level blocking edges; the groups expose seven more. No waits-for edge was returned.
- T001 is unblocked. T002 waits on T001. Actual fixture/oracle harness paths occur in Needed-to-run, their consumers have the required supplier edges, and neither harness has matrix rows, an embedded-tests section, a run field or the tests label.
- Each delivery card has a specification excerpt, requirement ids, the specification path and plan path. Wave row owners require numerical executed/skipped/failed tables in their close reasons. Every card carries the expected-red condition that failures caused by its own code block closure.
- Priorities match foundation 0, feature P1 1 and polish 3, apart from the acceptance-class issue below. No plan task was silently merged.

## Findings

### F1 — BLOCKER — T005 closure gate refers to downstream tasks

**Task:** lc4m-30.3 (T005).

Its work section says: “Gate: resolver covered by T006; predicate covered by T008 (reads) and T021 (writes).” Its acceptance then requires “Run the plan gate above”. This makes its closure gate refer to future task deliveries. T006 directly waits on T005; T008 and T021 also have direct blocking edges to it. The final sentence saying acceptance must not depend on a later test run does not resolve the contradictory operative gate.

**Why:** the requested closure contract expressly forbids acceptance depending on another task. A card cannot require downstream coverage for closure while blocking that downstream work. This is a transcription problem: the plan's coverage allocation has been promoted into the card's executable acceptance.

**Fix:** state a local build and smoke/self-check gate that can be completed with T005's own commit and its existing prerequisites. Retain the T006/T008/T021 mapping as coverage information explicitly outside the closure gate. Preserve their existing ownership and edges.

### F2 — MAJOR — Seven source implementation cards use the harness acceptance class

**Tasks:** T003/lc4m-30.1, T004/lc4m-30.2, T005/lc4m-30.3, T010/lc4m-32.1, T011/lc4m-32.2, T012/lc4m-32.3 and T013/lc4m-32.4.

All seven use “Acceptance (foundation / harness)” with build, supplied-path existence and lint. Their source paths are not test-harness paths named in Needed-to-run. They are source implementation tasks without embedded rows. The lead confirmed in reply to the review question that no broader harness exemption was approved and that these cards need the implementation-without-embedded-tests class.

**Why:** the required local smoke/self-check is absent, and “run the plan gate” is insufficient for cards whose copied gate only describes later coverage (F1 is the concrete blocking instance). Build/path existence cannot substitute for that acceptance class.

**Fix:** use build plus a concrete local smoke/self-check, preserving every executable plan gate and the expected-red policy. Keep later behavioral coverage as explanatory allocation. Do not add invented matrix rows or move existing rows. Keep T001/T002 as actual harness tasks. This is more than a heading-only correction because it must supply the missing local check.

### F3 — MAJOR — Five copied work sections retain unresolved file shorthand

**Tasks:** T016/lc4m-33.2, T017/lc4m-33.3, T018/lc4m-33.4, T020/lc4m-34.2 and T021/lc4m-34.3.

The first three say “same source files + README”; the last two say “same files”. These cards contain no explicit `src/` path anywhere in their bodies. The shorthand has a referent in the contiguous plan, but not inside the standalone card.

**Why:** the task's exact source ownership requires recovering a previous task's paragraph. The requested standalone body must identify what its executor owns without reconstructing surrounding context. The mechanism itself has been retained; its concrete source-file scope has not.

**Fix:** expand T016–T018 to `src/mutator/view-ops.ts`, `src/mutator/mutator.ts` and `README.md`; expand T020–T021 to `src/mutator/step-ops.ts`, `src/mutator/mutator.ts` and the relevant README subsection from T019. Keep their existing test paths and mechanisms.

### F4 — MAJOR — Group cards omit the approved delivery stop gates

**Tasks:** group cards lc4m-31 (G3) and lc4m-32 (G4); also check the remaining group cards against plan.md “Delivery strategy”.

The group descriptions contain order, rationale and the generic instruction to run npm test and lint. G3 does not carry the explicit MVP STOP & VALIDATE gate, and G4 does not carry the stop requiring the pre-existing suite green unchanged plus direct snapshot tests. Those obligations are explicit in the approved delivery strategy. A general test command does not record the MVP boundary or its required evidence; the expected-red policy elsewhere is also broader than G4's unchanged-suite stop condition.

**Why:** phase-completion instructions have not all been transferred to the executable group nodes. Individual test rows remain present, but the checkpoint controlling progression is missing.

**Fix:** copy the relevant approved stop criteria into each group card, especially G3's MVP validation and G4's unchanged-suite/snapshot gate. Preserve the approved sequence and do not create new scope or test ownership.

## [USER-DECISION]

None outstanding. The source-task versus harness classification question was answered by the lead during this review; D45 resolves anchor embedding.

## FRICTION

- The launch prompt specifies two different mandatory first actions: real MCP probes and the startup-mail command. The startup mail was sent first, followed immediately by successful real calls to both required MCP services.
- The word “foundation” denotes both source prerequisites in the plan and the narrow rowless test-harness exception in the review contract. The live creator cards applied the latter acceptance to the former. The lead resolved this ambiguity explicitly; F2 records the resulting task correction.
- Initial combined reads exceeded tool output limits. The review switched to cached individual live cards and bounded extraction, then mechanically compared all numbered source rows. No absence finding is based on a truncated response.

## VERDICT NOT-READY

Must-fix:

1. Remove downstream-task dependency from T005's operative closure gate (F1).
2. Correct the seven source-task acceptance classes and provide local smoke/self-check gates (F2).
3. Expand unresolved source-file shorthand in the five standalone cards (F3).
4. Transfer the approved phase stop gates into the group execution instructions (F4).
