# Plan critique, round 2 — Codex

Reviewed revision r1 of `plan.md` against `spec.md`, the Skein decision index and decision bodies on lc4m-15.30, the reconnaissance and saved spike results, and the current parser, reference snapshot, logical/deployment resolvers, deployment removals, view index, placement/body helpers and test oracle. Product intent remains settled. No implementation changes or commits were made.

## Round-1 closure and coherence

- **plan-r1-codex.md#1:** the generic inventory now includes view references, has separate new/affected modes, excludes comments and strings, and gives opaque/global navigation the same unmodelled boundary as endpoints. T007, T010, T013, T005 and T023 carry the consumers. The new-name negatives are in T005; kind/tag-addition acceptance moved to T021.
- **plan-r1-codex.md#2:** T039 supplies an independent oracle and explicit role coverage before T003/T005/T023. Its enumeration still misses a reference class: F1 below.
- **plan-r1-codex.md#3:** direction comparison is unconditional from T026 and T029 explicitly consumes it. The revised group graph adds unnecessary prerequisites to that read contract: F4 below.
- **plan-r1-codex.md#4:** the documented merges remove most deferred gates. Two completion boundaries remain incomplete: F2 and F3 below.
- **plan-r1-grok.md#1:** the pairing decision now specifies destination file only for moved text, post-edit block ordinals, mapped descriptors, rewritten text, source-order pairing without occurrence in the expected key, and target comparison after pairing. T017 names cross-block and cross-file acceptance. The former pairing ambiguity is closed; F3 concerns when its implementation lands.
- The accepted-write bundle centralizes validation, introduced warnings and named-view survival. D109 remains a written-text oracle with an explicit missing-computed-view precondition. T034 now forwards the body-icon option into the declaration edit that reads it. The lexer fallback is removed and RES-plan-3 is closed.
- The traceability table retains every scenario, invariant, functional requirement, success criterion and decision id. One repository and one stream are explicit; group rationales exist, there are no solo groups, and waves explicitly permit sequential order choices rather than parallel edits. No cycle or new runtime dependency is declared. Same-commit JSDoc/README updates, structured errors and the existing unit-test regime remain required.

## Findings

### F1 — MAJOR — The independent oracle still cannot enumerate logical extend targets

**CLASS: incomplete closure plan-r1-codex.md#2**

**Place:** `plan.md:178–190` (T039), T003's catalogue-equality gate, and the full-oracle claim in Key design decisions / Complexity Tracking.

**Why:** T039 enumerates `FqnRef`, `StrictFqnRef`, view-reference wrappers and `Imported`. A logical `extend <element>` target uses a different AST class: `StrictFqnElementRef`, with an `el` cross-reference and a `parent` chain. The installed `module.d.mts:600–604,1149–1155` declares this explicitly; it is not a subtype of either enumerated FQN wrapper. `resolveDocumentReferences` already reports this class as `extend target`.

I parsed a neutral `extend app.api {}` example with the current `C4Parser` and traversed it with `AstUtils.streamAst`. It had no parse errors and yielded only `StrictFqnElementRef` nodes for that target: `app.api`, then its parent `app`. T039's stated traversal therefore cannot produce its promised `extend target` role. Its own role-coverage gate fails before T003 can use the oracle. This is the same full-universe proof obligation raised in round 1, rather than a new product requirement.

**Proposal:** Define the oracle enumeration over every written element/deployment/view cross-reference class, including topmost `StrictFqnElementRef` chains and their linked `el` target. Keep the role-coverage gate independent and require logical extend targets, resolved and unresolved, to appear before catalogue equality is checked. Reconcile the full-oracle descriptions with that enumeration; do not weaken equality to the roles the enumerator happens to emit.

### F2 — MAJOR — T010 does not explicitly own the deployment closure its gate needs

**CLASS: incomplete closure plan-r1-codex.md#4**

**Place:** T010's `instanceOf` closure and every-FR-001-row gate; T012; execution order and G4.

**Why:** T010 promises that an instance referencing a removed element is cascaded as `removeDeploymentInstance` with `cascade`, and closes that behavior in its own commit. T012 later introduces deployment-removal cascade support, including deployment-view item edits and D77. The current `removeDeploymentInstance` routes through `removeDeploymentPart`, which rejects any deployment-view reference before constructing removal edits (`mutator.ts:1790–1792,2690–2695`). Reusing that current behavior cannot close T010's instance closure when a deployment view refers to the instance.

The plan does not allocate the complete internal deployment closure to T010 or say that T012 is only a later public exposure. I asked the lead rather than choosing an interpretation. The lead clarified: **T010 owns the complete internal deployment-instance cascade closure, including deployment-view item edits and D77 for deployment views; T012 exposes that existing closure through the deployment remove APIs and closes their own rows.** That resolves intent, but the task text still needs the ownership and reachable gate.

**Proposal:** Put that internal ownership explicitly in T010. Its gate must cover an element removal cascading an instance that has deployment-view referrers, both an accepted surviving-content case and a D77 rejection, in the same commit. State in T012 that it exposes/reuses the already completed closure. Preserve T010 before T012 without a forward dependency or a duplicate planner.

### F3 — MINOR — The pairing implementation still lands before its first consumer and closing gate

**CLASS: incomplete closure plan-r1-codex.md#4**

**Place:** `plan.md:218–224` (T003), T005, the atomic-task promise and G2/G5 descriptions.

**Why:** T003 explicitly implements `expectedPrefix` and the rename/move pairing rule while saying its first product use is T005. Its new gates cover catalogue equality, added snapshot roles and an addition that retargets a survivor; none exercises translating a before-prefix across a rename. Today's additions and removals use the existing comparison without an expected-prefix contract. Merging the catalogue with the ordinary snapshot consumer closed their completion boundary, but did not close this separate new behavior. It remains deferred to T005 despite the plan's same-commit mechanism/first-consumer rule.

**Proposal:** Keep catalogue-backed ordinary snapshots in T003 and assign the expected-prefix extension and pairing implementation to T005 with `renameElement` and its sigma-equality gate. T017 then adds move-specific prefix computation and its existing move gates. Update the task/group descriptions that currently call pairing an implemented G2 prerequisite. No test-only access or extra helper task is needed.

### F4 — MINOR — Group edges make consumers wait beyond the required contracts

**CLASS: consequence of fix plan-r1-codex.md#3**

**Place:** G8b and `plan.md:500–509`, especially G8b ← G5; also the contract-only rationales of G5 ← G4 and G7b ← G4.

**Why:** Moving T026 into G8b fixes the T029 direction prerequisite, but G8b now waits for the entire rename-and-move group. T026 is a direction read plus an oracle comparison; it needs neither rename nor move. T029 needs `resolveAt` delivered by T005, not the move implementation T017 or its CLI exposure T018. Similarly, the stated affected-mode prerequisite for G5/G7b is delivered by T010, not the remaining deployment/view remove APIs and CLI tasks of all G4. These are stronger waits than the contracts cited as their reasons. The single-stream rule prevents concurrent repository edits; it does not require unrelated work to precede a ready consumer.

**Proposal:** Express executable prerequisites at task/contract completion: T026 can be ready after G1; T029 consumes T026, T005 and the placement/body contracts; affected-mode consumers consume T010 once its F2 closure is complete. Retain groups as review units, but distinguish their aggregate review completion from prerequisites needed to start consumers. Reconcile the ready sets and topological-order explanation with those edges, keeping all repository execution sequential.

## Verification limits

This was a plan review, not a full test run. The AST-class check above was executed read-only against the installed LikeC4 package. Context7 and the official [Langium cross-reference documentation](https://langium.org/docs/learn/workflow/resolve_cross_references/) were consulted for the reference/container/target distinction; pinned AST classes and behavior were checked in the installed package rather than inferred from current online documentation.

FRICTION:

- Combined guideline and reconnaissance output exceeded the tool output limit; the required guidelines and relevant sections were reread in smaller chunks. Saved parser-error output also contains very long generated token alternatives, so its raw combined output was truncated.
- T010/T012 ownership required a mail clarification. The lead supplied the decision recorded in F2; no product fork remains for the owner.

VERDICT NOT-READY

1. Complete T039's written-reference universe so its logical-extend role gate is reachable (F1).
2. Assign and gate the complete internal deployment-instance cascade closure in T010; make T012 its public exposure (F2).
3. Land the expected-prefix implementation with its first real consumer and closing gate in T005 (F3).
4. Replace the excess group waits with the actual task/contract prerequisites and reconcile readiness documentation (F4).
