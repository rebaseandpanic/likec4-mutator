# Test plan rationale — lc4m-15.30

## Principles

- **Oracle independence (all rows).**
  - Expected values come from four sources: LikeC4 running on the same text (the T039 / T002 helpers), spike literals, spec rules and decisions, and the test's own input.
  - Library read-backs (`getView`, `getRelationships`) are the subject that is compared, never the reference.
  - Whole-file equality is replaced by GONE (an oracle set difference plus INV-5 ranges), because test guidelines §6 forbid whole-output comparison.
- **No helper self-tests (D115).**
  - The helper-sensitivity rows of the earlier matrix are gone, together with the standalone oracle and fixture rows.
  - Their facts are now P assertions in the product rows that rely on them. Fixture validity, INV-6 and oracle role coverage sit in row 2; the unmodelled boundary and the agreement with the legacy helpers sit in row 3; the spike facts sit in rows 111, 125, 137, 153, 161 and 164.
  - A helper that loses one of its parts is caught in review, and indirectly when a product row's P or main assertion fails.
- **Error contract (D106, D111–D114).**
  - Rows assert the type and the structured fields: `field`, `references` (D111, D113), `related` (D114), `candidates` (D106).
  - The only message-text assertion is D106's `file:line:column` (row 132).
  - The `file:line` text in `detail` is for humans. Existing tests that assert it stay unchanged while they are green (§9): `views-remove.test.ts:115-129`, `deployment-nodes-update-remove.test.ts:545-546`, `deployment-reference-stability.test.ts:234`.
  - Owners per the plan amendment:
    - T010 adds `ReferencedRemovalError` and the `related` field;
    - T012 and T013 fill `references` for deployment and view removals;
    - T023 fills it for kind and tag removals;
    - T005, T017, T021, T023, T029 and T031 fill `related`.
  - The rows' "Waits for code" lists follow these owners.
- **Plain error boundary (rows 53, 64, 71).** A test of the base type alone would also accept the subclass that D113 forbids for unknown targets and refused edits. These rows therefore assert `not.toBeInstanceOf(ReferencedRemovalError)` as well.

## Notes per row

- **R2, R3, R4 (catalogue equals linker).**
  - **Role coverage before equality.** Row 2 asserts role coverage before any equality is checked; otherwise a role missing on both sides would pass.
  - **The role list excludes `unrecovered`.** The literal role list is the catalogue/oracle enum and leaves out `unrecovered`. That value is `references`-only, and the oracle walks a linked AST in which unrecovered text has no node.
  - **Pattern for row 3.** `tests/mutator/deployment-reference-stability.test.ts`, an `OP` check against `linkedReferences`.
  - **Row 4 closes RES-plan-6's exclusion half.** FX passes `expectValidLikeC4`, so it contains no unrecovered tokens. The exclusion is therefore observed on a copy with a broken file. Rows 16, 51, 62 and 69 prove the opposite direction (the inventory includes such tokens), not the exclusion.
  - **Discriminating question for these rows.**
    - Absent mechanism: entries are missing, so the equality fails.
    - Built but not wired: rows 5 and 10 go through `addElement`.
    - Keyed by the wrong thing: target and role are part of the compared tuple.
    - Unrecovered entries on either side: row 4 turns red.
  - **Fixture load order.** The load order must differ from the path-sorted order, because `mergeOrder` (`src/query/workspace-index.ts:862-876`) sorts by normalized path.

- **R6, R7 (existing snapshot tests).**
  - `tests/query/reference-snapshot.test.ts:335` builds `viewSnapshot` with the `views:` option that T003 removes.
  - The test at `:541` (lc4m-15.29 row 47) accepted an `addElement` that left `include api` unresolved. US-4 rejects that write now, so the test flips. Under §9 the test is replaced rather than deleted.

- **R8–R10.**
  - `tests/mutator/add-element-references.test.ts` already covers relationship endpoints and stays unchanged.
  - Row 9 lives in `tests/cli/cli-apply-validation.test.ts`, as the plan names it.

- **R11.** No input can make `addView` re-target a resolved view reference (D93, separate view-id name space; F5, accepted). The capture risk of `addView` is covered by new-mode rows 13 and 14.

- **R13.** Deployment-class references at unmodelled places are `FqnRef`s typed `Referenceable`, so the inventory treats element and deployment ids as one class.

- **R21–R23.**
  - No existing test has two files that both hold a `model` block with a load order that differs from the sorted order. I searched `edge-cases.test.ts:640-648`, `title-slash.test.ts:24-67`, `insert-layout.test.ts:31` and `remove-relationship.test.ts:67`.
  - The tests at `edge-cases.test.ts:159-171` flip under US-5 (the `model` block is now created).

- **R25, R26.** Pattern for the bodiless declaration: spike 01's "bodiless parent made a body". `edge-cases.test.ts:596-604` pins the old limitation that this run lifts.

- **R28.** D63 requires the exact key. A name that matches a loaded file only after `normalizePath` (for example `./m.c4`) must be rejected.

- **R32–R56 (FR-001).**
  - Each FR-001 row has one test, parameterized only over input literals (§6). Each case has P (OR resolves the reference before the write).
  - Row 32 carries D112: the `cascaded` key is absent without `cascade` and `[]` with it.
  - REFS roles and `cascadable` per FR-001 role:
    - `cascadable: true`: predicate items, steps, style targets, `rank` targets, `navigate-to`, `instance-of`, deployment endpoints through an instance.
    - `cascadable: false`: `view-of`, `view-extends`, `opaque-flow`, `global-or-import`, `unrecovered`.
  - **D77 (rows 47, 50, 61).** The rejecting entry is the content-producing statement. It stays `cascadable: true`, because the flag is the reference's FR-001 policy, not the outcome of this cascade. Its `view` field names the view that would lose its content (grok F4).
  - **Row 51** names the role per parameter (grok F3). A recovered hit reported with a modelled role turns the row red.
  - **Row 38** needs the computed nodes, because an empty `group` parses (spike 04).
  - **Row 40** uses LikeC4's computed step sequence (SEQ, `tests/mutator/view-steps-move-remove.test.ts`).
  - **Row 56** (codex#6) observes the cache from outside. If the removal's catalogue were built for the generation before the addition, its CASC positions or its GONE set would be wrong.

- **R49, R50.** These carry RES-plan-5: T010 owns the removal closure. Rows 59–61 check that the two deployment APIs reach the same closure.

- **R57, R65.** Under D112, results without `cascade` keep their current shape, so `deployment-reference-stability.test.ts:242`, `deployment-nodes-update-remove.test.ts:553, :656` and `deployment-instances-write.test.ts:561` stay green. The rows exist to catch a `cascaded` key leaking into default mode.

- **R58.**
  - The listed fixtures were read and contain no references into the removed subtrees. `minimal/model.c4`, `VALID_FULL` and `VIEWS_C4` contain only `include *`. The models at `mutator.test.ts:434-499` have no views.
  - `multi-file.test.ts:447` (refused edit) still throws. Row 53 adds the type assertion in a new file instead of editing that test (§9).
  - These tests were not run (RES-T4).

- **R62, R63, R69 (grok F3).**
  - Row 62 is RES-plan-8's gate for unrecovered text.
  - Row 63 adds the recovered unmodelled places and the later-dotted-segment rule for deployment ids. A removal that scans only unrecovered tokens, or uses new mode, turns it red. Validity of its input is RES-T7.
  - Row 69 adds the unrecovered hit for `removeView`. Row 68 alone would stay green with the inventory never called, because its references are catalogue references.

- **R66–R72.**
  - `views-remove.test.ts:59-131` covers the default mode through `detail` text and stays green (row 72).
  - Row 59 (deployment views) and row 68 (unmodelled places) name roles per parameter (grok F6).

- **R76, R142.** D84 keeps the options of the standalone commands. These rows use the existing subprocess pattern (`cli-standalone-commands.test.ts:87-140`).

- **R77.** The place resolver is internal, but product code calls it, so its observable result is testable (§5).

- **R78–R93 (rename).**
  - SIG maps LikeC4's computed model before the write through the test's literal σ and compares it with the model after the write.
  - Row 81 is the "keyed by the wrong thing" check for the pairing rule.
  - **Row 80 (codex#4).** It discriminates FR-011's order from both sides. An implementation that stops after segment replacement fails (a); one that always writes the full FQN fails (b). The precondition of (a) uses OR on hand-written copies, so the "earlier choices fail" claim comes from LikeC4, not from the library.
  - **Row 90 (grok F3).** It adds the later-dotted-segment case. A rename that checks the old name in new mode would accept that case and turn the row red.
  - **Row 93 (codex#6).** The lc4m-17 repro is rejected after its edits and the stability comparison, so it builds an intermediate generation. The following rename must use the restored state; its literal text and SIG would differ otherwise.
  - Row 87 uses the literals of spikes 05 and 06.

- **R94–R106 (move).**
  - Row 95 discriminates block ordinals and `file′`.
  - Row 96 uses the literals of spike 03.
  - Row 105 is the parent-child check, on moves only (F4).
  - Row 104 asserts REL (D114, `deployment-path`).
  - Row 106 adds the later-dotted-segment case (grok F3).

- **R109–R116.**
  - Row 112's rejected name comes from spikes 02 and 06.
  - Row 111's P comes from spike 04.
  - Row 114 asserts REL (`extend-block`). Without the D100 guard, the block silently detaches and the write is accepted; with the guard, the write is rejected.

- **R117–R128.**
  - Row 117 is the FR-002 equality check.
  - **Row 119 (codex#3).** It observes FR-002 step 3. A rewriter keyed on spelling still produces a valid model, so AWB alone cannot tell it apart. The byte-equality of the other type's declaration and uses, together with its unchanged values, does.
  - Row 123's accepted branch delegates isolation to row 119, which keeps that assertion in one row (no split).
  - Rows 123 and 124 assert REL (`where-condition`, D114).
  - Row 120 uses D111 with the FR-002 place name as `role`; row 122 uses D113's unmodelled roles.
  - Row 125 follows RES-spec-2, with its spike-06 P.

- **R129–R142 (selector).** Existing tests that this change touches:

  | Test | Today | After |
  |---|---|---|
  | `update-relationship.test.ts:83-85` | `/Multiple relationships match/` (source: `src/mutator/mutator.ts:879-884`) | replaced by `RelationshipAmbiguityError` + `candidates` (row 134) |
  | `update-relationship.test.ts:63`, `:125` | not-found message regex | unchanged if green; otherwise `InvalidWriteError` + BI on the not-found field from T027's JSDoc (row 134, RES-T5) |
  | `relationship-extends-remove.test.ts:75-81` | `removeRelationship('x', 'y')` over `x -> y 'reads'` and the nested `x -> y 'inner'` | ambiguous; selects with `matchTitle: 'reads'`; the orphan assertion is kept (row 135, codex#2) |
  | `relationship-extends-remove.test.ts:82-93` | removes one of two identical `x -> y` (first match, `mutator.ts:984-1001`) | ambiguous; selects by `position` (row 136) |
  | `remove-relationship.test.ts:236-241` | edit-level `removeRelationshipEdit`, asserting message text | touched only if T027 changes that function |

  The tests listed in row 139 stay unchanged.

- **R143–R145.** The 18 call sites of `expectRelationshipsAgreeWithLikeC4` are:
  - `query/deployment-specification-read.test.ts:253-254`;
  - `mutator/spec-defaults-write.test.ts:119, 127`;
  - `query/relationship-extends-read.test.ts:94, 169, 184, 197, 241, 274`;
  - `query/spec-defaults-relations-read.test.ts:75`;
  - `mutator/relationship-dot-kind-header-tags.test.ts:35, 53`;
  - `mutator/relationship-extends-write.test.ts:84, 95, 114, 143, 265`.

  All of them pass library output.

- **R149, R156.** Both assert REL (D114): `extend-block` for D83 and `relationship` for D72.

- **R154, R159 (codex#5).**
  - Case (a) makes extend creation go through the selector. A writer that picks the first endpoint match decorates the competitor, which LikeC4 reports.
  - Case (b) pins how `position` interacts with D72 for identical candidates. It cannot require a single decorated relationship (FRICTION F9).
  - Row 159 mirrors this through `apply`.

- **R160–R165.**
  - The literals come from spike 01.
  - Row 163 lists the deep-equality tests that would break if T033 always added `style` / `multiple`. Their kinds declare no style, so under D18 they stay green.
  - Row 165 protects `write-value-checks.test.ts:296-298`.
