# Plan critique, round 1 — Grok

**Plan:** `docs/plan/lc4m-15.30/plan.md` · **Spec:** `docs/plan/lc4m-15.30/spec.md` (READY-FOR-PLANNING) · **Task:** lc4m-15.30 · **Date:** 2026-10-17

Checked against the spec, the Skein decision comments on lc4m-15.30, the spikes under `docs/plan/lc4m-15.30/spikes/`, and the working tree. Intent is taken as settled. Round-1 class on every finding is `new`.

Coverage of the traceability table is complete: US-1–US-12, INV-1–INV-9, FR-001, FR-002, FR-003, FR-004, FR-010, FR-011, FR-020, FR-021, FR-050, SC-001–SC-012, D53–D110, the three RES-spec rows and the FOR-PLAN rows each have tasks. Out-of-scope rows stay on T036. One repository, one stream, no solo group. G7a/G7b and G8a/G8b have written reasons. Edges match real seams (catalogue, `resolveAt`, body creation, model/specification placement, the selector). No cycle. No undeclared runtime dependency. `isSameHierarchy` is already called from `addRelationship` and `addDeploymentRelationship` (`src/mutator/mutator.ts`), so T015's parent-child check has a function to call. The invariant gate matches the library: `InvalidWriteError` plus field, JSDoc and README in the same commit, tests per CLAUDE.md and CLAUDE_TEST_GUIDELINES §5–§6, with the D106 printed `file:line:column` form named in the spec before the tests.

## RESIDUALS

RES-spec-1 → clean
RES-spec-2 → clean
RES-spec-3 → clean

**RES-spec-1 (D110).** The key-design table states one rule. Additions (`addElement`, `addDeploymentNode`, `addDeploymentInstance` with the id named or taken from the element, `addView`) use new mode. Kind and tag additions are not checked. A rename uses affected mode on the old name and new mode on `newName`. A move uses affected mode on every name in the moved subtree, which includes every new-mode hit on those names; the extra later-segment hits are the declared conservative side (RES-plan-2). T016 gates the spec's rejection: `other.foo` renamed to `api` while `opt { api -> other }` is present. US-3, US-4, D61, D92, D101 and FR-004 are all reachable from that table.

**RES-spec-2 (D109).** T024 states the widened oracle for every `element.kind` / `element.tag` expression in a deployment view (include and exclude predicates and style targets): the view is absent from `computedViews` before the write, the result passes `expectValidLikeC4`, `getView(id).rules[i].text` equals the literal expected text, and the test does not compare computed views. `where kind is` stays under the general sentence that the computed model reports the new names. T002 records the absence precondition. `computedViews` reads `model.views()` (`tests/helpers/likec4-model.ts`). On LikeC4 1.59.4 that iterator drops a deployment view whose body uses `element.kind` or `element.tag` in include, exclude or a style target, and it keeps a view that uses `where kind is` or a style target by name. The precondition is observable. US-7 and SC-006 match.

**RES-spec-3.** Each last-round fix has a task and a gate. D97: T015 names `idsDeclaredIn` for ids declared in `extend <node>` blocks in any file; T016 rejects a collision with a sibling node, a named instance, and an instance declared in an `extend` block of the node in another file. FR-010: T015 and T017 reject a deployment path with no σ image and list the path; rejections stay byte-identical. D108: T011 rejects `view child extends base { include b }` under cascade; the content-check decision says inherited `extends` and `global` content do not count; T035 documents D108. D106: T027 accepts a `candidates[i]` position passed back unchanged; T028 feeds the printed `file:line:column` into a second `apply`. The spec names that printed form, and the invariant gate records the §5 exception. D92 / D101 / US-4: T007 gates the new-mode positions (a bare name and a leading segment block; a later dotted segment does not; a longer identifier does not) and states that a kind or tag addition is not checked.

## Findings

### F1 — MAJOR — class `new`

**Place:** key-design "Snapshot on the catalogue" (the `rekey` sentence); T006; T015; T017; Risks, "σ-rekey errors on moves".

**Why:** T017's acceptance requires an accepted move: `expectSigmaImage` over every FR-001 reference kind across two files, and a root-to-root move into another file. The rename/move pipeline's last step is the rekeyed snapshot compare (INV-3). Today's key is `JSON.stringify([file, frames, role, text])` plus `#occurrence` (`src/query/reference-snapshot.ts`). `compareReferenceSnapshots` pairs on the prefix before `#` and throws an internal error when a survivor's prefix is missing after the write or a new prefix appears outside inserted text (the throws at the "not found after the write" and "appeared outside the written text" paths).

The plan's substitution updates the file, the `el:` / `extend:` / `inst:` descriptors, the target and the text. That substitution does not determine the prefix those throws compare:

- σ substitutes element names. A root-to-root move keeps FQNs, so applying σ to the file string leaves every reference on the source file. References that travel inside the moved declaration are in the destination file afterwards.
- Frame ordinals other than the three named descriptors stay as they were. `describeFrame` numbers `model`, `views` and `deployment` the same way (`model#k` and the rest). FR-020 inserts a root move at the end of the first `model` block. A reference that lived under a later `model` block changes `model#k`, and the stated rekey does not.
- The risks paragraph treats occurrence order as unsolved. Today's compare ignores `#occurrence` and pairs a prefix in source order. A rekey that looks up the full key and copies the old occurrence collides when FR-011 rewrites two texts onto one prefix. The plan does not say which of those two compares T006's `rekey` is.

T015 is marked "needs planning" and its gate is "covered by T016 and T017". T017 is marked "needs planning: comment range, re-indentation, line endings". Those three are already decided in the key-design table (the contiguous comment range, re-indent to the new depth, line endings of the target file). The open item is the pairing prefix. Until it is stated, the accepted-move gate fails with the internal error, and the "goes red, never silent" note is that failure.

**Proposal:** Add one rule sentence to the snapshot decision, and drop both "needs planning" marks. The expected prefix is the post-edit prefix `compareReferenceSnapshots` already groups on: file, frame path, role, rewritten text. The file component changes only for a reference whose source text moved with the declaration. Every frame ordinal, including `model#k`, `views#k` and `deployment#k`, is the ordinal of the block that encloses the reference after the edit. `el:` / `extend:` / `inst:` descriptors are σ-mapped, as the plan already says. Pairing stays by that prefix, in source order. Occurrence is not part of the expected key. The target is compared after pairing (σ of the old target) and is not a key component. T016 and T017 then call that compare; their existing acceptance class does not change.

### F2 — MINOR — class `new`

**Place:** T004 gate, class "catalogue = linker".

**Why:** The gate compares "every role the catalogue covers" with `linkedReferences` and `linkedViewReferences`. A role the catalogue omits never fails that sentence. The two helpers also have a limit the task does not name. `linkedViewReferences` reports an `FqnRef` only when it sits in an element, dynamic or deployment view body (`tests/helpers/likec4-model.ts`, the `ElementViewBody` / `DynamicViewBody` / `DeploymentViewBody` test). `linkedReferences` reports `instanceOf`, `extend <node>` and a topmost `FqnRef` inside a deployment view. Neither walks `ModelViews.styles`. T003 and T004 correctly add those targets as a catalogue source, and T006 has one direct snapshot test for them, so this is a weak foundational gate rather than a missing row. The pattern "equal to the linker helpers" needs that limit in the gate.

**Proposal:** State the class as every FR-001 row present in the catalogue and equal to the linker. Use the two helpers for the roles they report. Compare `ModelViews.styles` targets with a linker walk of that property. Keep opaque and `global` references as the separate opaque flag the gate already has.

### F3 — MINOR — class `new`

**Place:** key-design "Unrecovered text"; T007; RES-plan-3.

**Why:** The plan calls `services.parser.Lexer.tokenize` an assumption about Langium 3.5 and offers a `LikeC4Terminals` regex fallback. The method is already used on the language-server services this repo holds: `getServices().likec4.parser.Lexer.tokenize(...)` in `src/mutator/brace-balance.ts` and `src/parser/grammar.ts`. The call returns `{ tokens, errors, hidden }`. A second tokenizer can classify the unrecovered spans differently from the lexer the brace balancer trusts. Context7 has no documentation page for this method; the in-repo call is the evidence.

**Proposal:** Name that existing call as the lexer T007 uses. Remove the assumption and the regex fallback. Close RES-plan-3.

### F4 — MINOR — class `new`

**Place:** T034 mechanism, "`updateElement` passes `styleIconInBodyIcon`".

**Why:** The body-icon gate (the body `icon` is rewritten, no `style { icon }` is written, no `Redundant as icon` warning, an existing `style { icon }` stays byte for byte) does not follow from that call. `updateElement` calls `updateElementEdit` (`src/mutator/mutator.ts`). `updateElementEdit` calls `updateDeclarationEdits` with no options argument (`src/mutator/element-ops.ts`). The flag is read only inside `updateDeclarationEdits`, and only when the options object carries it. Deployment node and instance updates already pass it. Passing it at `updateElement` leaves the reader off, so the gate stays red. The technical context already cites the option and the reader; the task mechanism does not connect them.

**Proposal:** Say in T034 that the existing option is forwarded into the declaration edit that already reads it, the same reader deployment nodes and instances use. The observable gate stays as written.

### F5 — MINOR — class `new`

**Place:** T002 `expectSigmaImage`; traceability row INV-9 (T011, T012, T013 only).

**Why:** INV-9 requires every named view computed before an accepted write to stay computed afterwards, σ-mapped, except the view `removeView` removes. `expectComputedViewsSurvive` implements that (`tests/helpers/likec4-model.ts`) and the removal gates call it. `expectSigmaImage` checks computed elements, deployment elements, explicit relations and linked reference targets. It does not check view ids. `expectValidLikeC4` does not either: a model LikeC4 accepts can still drop a deployment view (D109). Rename, move, addition, specification and style gates therefore leave INV-9 unasserted. The id is not dangling; the gates that perform accepted writes do not close it.

**Proposal:** Those acceptance gates call `expectComputedViewsSurvive` with the view-id set unchanged (element σ does not rename view ids). Removal gates keep the `removedId` they already pass.

### F6 — MINOR — class `new`

**Place:** T016 gate, the `other.foo` → `api` rejection.

**Why:** The decision table checks a rename's `newName` in new mode (bare identifier or leading segment). T016 locks the positive case from US-3, `opt { api -> other }`. It does not lock the negatives T007 locks for additions: a later dotted segment does not block, and a longer identifier does not block. An implementation that runs `newName` through affected mode passes T016 and rejects names D107 keeps. The move side is already the declared stricter rule (RES-plan-2) and is not this finding.

**Proposal:** Extend T016's rejection class with the same new-mode negatives T007 names, applied to the rename's `newName`.

## FRICTION

- Context7 (`/websites/langium`, query for `Lexer.tokenize`) returned no documentation. F3 uses the calls already in this repository.
- The wave line ("ready sets in waves") is read as the sets of groups with no edge between them, inside one repository. Task numbers T001–T038 are a total order. Groups in one wave share files (`mutator.ts`, `src/cli.ts`, `src/mutations-file.ts`), so the wave is an order freedom, not a parallel schedule. No ordering-only edge was found. Not filed.

## VERDICT

NOT-READY

Must-fix:

1. F1. Write the post-edit pairing prefix (file only when the reference text moved, every frame ordinal after the edit, σ on `el:` / `extend:` / `inst:`, rewritten text, pair by prefix in source order, occurrence not part of the key). Remove the "needs planning" marks on T015 and T017. The comment range, re-indentation and line endings on T017 stay as the key-design table already states them.

F2–F6 are recorded and are not must-fix.
