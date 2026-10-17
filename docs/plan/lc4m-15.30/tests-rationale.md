# Test plan rationale — lc4m-15.30

- **Oracle independence (all rows).**
  - Expected values come from four sources: LikeC4 running on the same text (the T039 / T002 helpers), spike literals, spec rules and decisions, and the test's own input.
  - Library read-backs (`getView`, `getRelationships`) are the subject that is compared, never the reference.
  - The whole-file equality used in lc4m-15.29 is replaced by GONE (an oracle set difference plus INV-5 ranges). A whole-output comparison is forbidden by test guidelines §6.

- **Error contract (D106, D111).**
  - Rows assert the type and the structured fields: `field`, `references` (D111), `candidates` (D106). The only message-text assertion is D106's `file:line:column` (row 134).
  - The `file:line` text that removal errors keep in `detail` is for humans. New rows do not assert it.
  - Existing tests that do assert it stay unchanged as long as they are green (§9, no silent edits): `views-remove.test.ts:115-129`, `deployment-nodes-update-remove.test.ts:545-546`, `deployment-reference-stability.test.ts:234`.
  - For kind and tag removals (row 122), `references[i].role` is the FR-002 place name. This was stated by the lead with D111.

- **R1 (fixtures).** Row 1 is the only fixture test, and it also proves INV-6. The load order must differ from the path-sorted order, because `mergeOrder` (`src/query/workspace-index.ts:862-876`) sorts by normalized path; for example, load `views.c4`, `model.c4`, `a-model.c4` in that order.

- **R2–R4 (T039).**
  - Role coverage comes before equality; otherwise a role missing on both sides would pass.
  - Row 3 is the oracle side of the unmodelled boundary; row 12 compares the product's flag against it.
  - Row 4 ties the new oracle to the helpers the existing tests trust: `linkedReferences` (`tests/helpers/likec4-model.ts:442`) and `linkedViewReferences` (`:1041`).

- **R6–R9 (helper sensitivity).** Each mechanism row answers the discriminating question with hand-written inputs to the helper. No product file is broken (§6, part II). For example, row 6 fails each part of the bundle on its own, so a bundle that lacks one part goes red.

- **R12 (catalogue equals linker).**
  - Pattern: `tests/mutator/deployment-reference-stability.test.ts`, an `OP` against `linkedReferences`. It does not give the full reference universe; that is why T039 exists.
  - Unrecovered text is excluded from the compared tuple, as the plan says. It is covered by rows 24, 59 and 69.
  - Discriminating question:
    - absent: entries are missing;
    - built but not wired: rows 13 and 18 go through `addElement`;
    - wrong key: the target and the role are part of the tuple.

- **R14, R15 (snapshot tests).**
  - `tests/query/reference-snapshot.test.ts:335` builds `viewSnapshot` with the `views:` option that T003 removes. Rows 43–46 of lc4m-15.29 use it.
  - The row 47 test (`:541`) asserts that `addElement` is accepted while `include api` becomes unresolved. US-4 rejects this now, so the test flips (INV-8).
  - Under §9 that test is replaced, not deleted: the property "the snapshot sees view rules" stays covered, with the opposite verdict.
  - The calls at `:52` and `:335` change if T003 changes the snapshot signature.

- **R16–R18 (lc4m-17).**
  - `tests/mutator/add-element-references.test.ts` already covers relationship endpoints and stays unchanged; rows 16–18 add the view reference kinds.
  - Row 17 goes into `tests/cli/cli-apply-validation.test.ts`, as the plan names it.

- **R19.** No input can make `addView` re-target a resolved view reference. View ids have their own name space, a duplicate id is already rejected, and a `navigateTo` to a missing view is unresolved (D93). So the wiring row for the non-element additions checks "no internal error, plus STAB on the full fixture" (F5, accepted). The capture risk is tested in new mode (rows 21, 22).

- **R21.** Deployment-class references at unmodelled places are dynamic-step endpoints: `FqnRef`s typed `Referenceable` (`DeployedInstance | DeploymentNode | Element | Imported`, plan "Code facts"). The inventory therefore treats element and deployment as one class.

- **R29–R31 (default file).**
  - No existing test has two files that both hold a `model` block with a load order that differs from the sorted order. Checked: `edge-cases.test.ts:640-648`, `title-slash.test.ts:24-67`, `insert-layout.test.ts:31`, `remove-relationship.test.ts:67`.
  - `edge-cases.test.ts:159-171` expects a `/model block/` throw for a spec-only file; US-5 creates the block instead, so those tests flip.

- **R33, R34.**
  - `edge-cases.test.ts:596-604` pins the old limitation (`/has no body/`); the plan names it.
  - The bodiless-declaration pattern comes from spike 01 ("bodiless parent made a body"): both forms, with the inline summary and technology kept.

- **R36.** "Colliding" file names, read as D63's exact-key rule: a name that equals a loaded file only after normalization must be rejected. `normalizePath` turns `./m.c4` into `m.c4`.

- **R40–R63 (FR-001).**
  - Each FR-001 row has one test, parameterized where only the input literal differs (§6). Each case asserts P, so a fixture that never had the reference cannot pass vacuously.
  - Row 40 also carries D112: the `cascaded` key is absent without `cascade` and present (`[]`) with it. That is the discriminating check for a `cascaded` key that is always present.
  - REFS rows assert `cascadable` per FR-001 role, from the D111 contract:
    - `cascadable: true`: predicate items, steps, style and rank targets, `navigateTo`, `instance-of`, deployment endpoints through an instance;
    - `cascadable: false`: `view-of`, `view-extends`, `opaque-flow`, `global-or-import`, and affected-mode hits.
  - Row 46 needs the computed nodes for the empty `group`: spike 04 shows that an empty `group` parses and yields an `@gr1` node, so only the computed view can tell whether it was removed.
  - Row 48 uses LikeC4's computed step sequence, the SEQ pattern of lc4m-15.29 (`tests/mutator/view-steps-move-remove.test.ts`).
  - Row 62 shows INV-3's "without `cascade`, no non-owned reference is removed".

- **R57, R58.** These are the carrier of RES-plan-5: T010 owns the removal closure, so its gate lives in T010's file. T012's rows 66–68 check that both deployment APIs reach that closure.

- **R64, R71.**
  - Under D112, the default-mode results keep their current shape. These stay green with no edits: `deployment-reference-stability.test.ts:242`, `deployment-nodes-update-remove.test.ts:553` and `:656`, `deployment-instances-write.test.ts:561`.
  - Under D111 the human-readable `detail` stays, so their `toContain` checks also hold.
  - They are kept as rows because they detect a `cascaded` key leaking into default mode.

- **R65.** These fixtures were read for references into the removed subtrees; there are none:
  - `tests/fixtures/minimal/model.c4`, `VALID_FULL` (`validation.test.ts`) and `VIEWS_C4` (`multi-file.test.ts`) contain only `include *`;
  - the models at `mutator.test.ts:434-499` have no views.

  `multi-file.test.ts:447` (a refused edit, caused by a stray `}`) still throws. Row 61 adds the `InvalidWriteError` assertion in a new file instead of editing that test (§9). This was not run (RES-T4).

- **R72–R77.**
  - `views-remove.test.ts:59-131` (row 63 of lc4m-15.29) covers the default mode of every `navigateTo` role and of `extends`, through `detail` text. It stays green (row 77).
  - Rows 72–76 add `cascade`, REFS and the unmodelled cases in the same file, as T013 names it.

- **R81, R143.** D84 keeps the options of the standalone commands. These rows check the new behaviour with the existing subprocess pattern (`cli-standalone-commands.test.ts:87-140`).

- **R82.** The place resolver is internal, but product code calls it (rename, nested writes). Testing its observable result through the catalogue's places is therefore allowed (§5, an internal type with product callers).

- **R83–R96 (rename).**
  - SIG compares LikeC4's computed models before and after the write under a literal σ. The expected side is LikeC4 on the input, mapped by the test's σ.
  - Row 85 is the "keyed by the wrong thing" discriminator for the pairing rule.
  - Row 91 uses the literals in `spikes/05-critic-r2-checks.out.txt` and `spikes/06-critic-r3-checks.out.txt`.
  - Row 95: see RES-T3.

- **R97–R109 (move).**
  - Row 98 is the discriminator for block ordinals and `file′`.
  - Row 99 uses the literals in `spikes/03-critic-r1-checks.out.txt`.
  - Row 108 covers the parent-child check on moves only (F4).
  - Row 107 asserts the field and not the listed path, because the plan gives move rejections no structured path field.

- **R112–R118.**
  - Row 115's rejected name `view` comes from spike 02 and spike 06.
  - Row 114 relies on spike 04, through AWB.
  - Row 117's discriminator: without the D100 guard, the block silently detaches, and the change is accepted where it must be rejected.

- **R120–R130.**
  - Row 120 has the equality pattern of row 12.
  - Row 125 is D78's matrix (spike 03, "shared kind name").
  - Row 127 follows the plan's RES-spec-2 recipe; spike 06 shows the view is dropped from the computed views.
  - Row 122 uses D111 with the FR-002 place name as `role`.
  - Row 124's removal half is RRE; its rename half is BI.

- **R131–R140 (selector).** The existing tests the change touches:

  | Test | Today | Effect of the change |
  |---|---|---|
  | `update-relationship.test.ts:83-85` | matches `/Multiple relationships match/` (source: `src/mutator/mutator.ts:879-884`) | the message changes; the test is replaced (row 136) |
  | `update-relationship.test.ts:63`, `:125` | match the not-found message text | if T027 keeps the text they stay green and are left alone; otherwise they are replaced by type and field assertions in the same commit (§5, §9) |
  | `relationship-extends-remove.test.ts:82-93` | removes one of two identical `x -> y` (first match, `mutator.ts:984-1001`) | now an ambiguity rejection; rewritten to select by `position` (row 137) |
  | `remove-relationship.test.ts:236-241` | the edit-level `removeRelationshipEdit`, asserting message text | touched only if T027 changes that function |

  These stay unchanged: `remove-relationship.test.ts:80-109`, `relationship-resolution.test.ts:45` and `:57`, `cst-layout.test.ts:30`, `line-endings.test.ts:153`, `cli-apply-extended.test.ts:84-118`.

- **R144–R147.**
  - The 18 call sites of `expectRelationshipsAgreeWithLikeC4`:
    - `query/deployment-specification-read.test.ts:253-254`;
    - `mutator/spec-defaults-write.test.ts:119, 127`;
    - `query/relationship-extends-read.test.ts:94, 169, 184, 197, 241, 274`;
    - `query/spec-defaults-relations-read.test.ts:75`;
    - `mutator/relationship-dot-kind-header-tags.test.ts:35, 53`;
    - `mutator/relationship-extends-write.test.ts:84, 95, 114, 143, 265`.
  - Every call site passes library output, so no hand-built list needs a new field.
  - Row 145 is the "built but not wired" discriminator for the direction comparison.

- **R160–R166.**
  - The literals come from spike 01: "element style" `s1`–`s4`, "relationship style", "bidirectional", "relationship kind multiple".
  - Row 164 covers the deep-equality tests that would break if T033 always added `style` / `multiple` keys: `spec-defaults-read.test.ts:153, 168`, `spec-defaults-relations-read.test.ts:136, 150`, `deployment-nodes-read.test.ts:253`. Their kinds declare no style, so under D18 they stay green.
  - Row 166: `write-value-checks.test.ts:296-298` write `style { icon }` on elements that have no body `icon`, and D75 must not change that.
