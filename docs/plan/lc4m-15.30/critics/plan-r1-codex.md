# Plan critique, round 1 — Codex

Reviewed `plan.md` against `spec.md`, the decision-comment index and decision bodies on lc4m-15.30, the reconnaissance and saved spike evidence, and the current parser, reference resolvers, snapshot, view reader, placement helper and test oracle. This is a plan review; no implementation change is requested beyond closing the contracts below.

RESIDUALS:

- RES-spec-1 → confirmed → F1: the D107/D110 operation table is consistent, but its inventory omits a real class of identifier references inside opaque constructs.
- RES-spec-2 → clean. Independently checked the installed LikeC4 1.59.4: kind and tag expressions in each of include predicates, exclude predicates and style targets produce no diagnostics or validation errors, while the deployment view disappears from `LanguageServices.diagrams()`. The control using `include *` retains the view. T024 explicitly applies the written-text oracle to all these classes, with a precondition and no computed-view comparison.
- RES-spec-3 → clean. D97 includes siblings contributed by deployment extend bodies; T015/T016 cover that closure. FR-010's path without an image is explicitly rejected by T015/T017. D108's content rule and inherited-content fixture are in the removal work and README work. T027/T028 carry the D106 unchanged-position round trip. The D92/D101/US-4 operation table distinguishes affected-name matching from new-name matching consistently with D107; F1 concerns the inventory feeding that table.

## Findings

### 1. MAJOR — The unmodelled inventory does not cover every identifier-reference class

**CLASS: new**

**Place:** `plan.md`, Key design decisions, “RES-spec-1: new-name rule”; T007 and its consumers T013/T015/T024.

**Why:** The inventory is explicitly assembled from FQN chains, imported names, kind/tag tokens and unrecovered tokens. Recovered opaque bodies also contain view references that are none of these. I parsed a dynamic view containing `opt { a -> b { navigateTo v } }` with the current parser: it has no parser or lexer errors, and `v` is a `DynamicViewRef` under the step's custom properties, with a `view` reference rather than an FQN chain. The installed grammar also has `ViewRef` for navigation in global styles.

Consequently, the inventory described by T007 cannot implement the complete bare-identifier rule of FR-004/D107/D110. For example, adding view `v` while an opaque block contains an unresolved `navigateTo v` must be rejected by that rule. The stability snapshot cannot substitute for the inventory: D93 deliberately excludes references that were unresolved before the write. Similarly, the old/new-name rule is specified by identifier position, not just by FQN-reference node type. Removal must also respect the opaque boundary rather than treating every navigation property as cascadable.

**Proposal:** Define the inventory over the complete class of identifier references in each unmodelled construct, including view-reference wrappers, with the existing comments/string exclusions and the two matching modes. Give T007 a gate covering each identifier-reference class and wire that same boundary into removal and rename/move consumers. This closes the existing rule; it does not change the intended conservative policy.

### 2. MAJOR — The foundation's linker-equality gate has no oracle for its full reference universe

**CLASS: new**

**Place:** `plan.md:142–172`, T002, T004 and T005.

**Why:** T004 requires one-to-one equality with LikeC4's linked references for every catalogue role and makes that proof the foundation for later writers. The named oracle functions cannot currently observe that universe. `linkedReferences` reports only instance targets, deployment extend targets and deployment-view references. `linkedViewReferences` reports view targets, view-body FQNs and navigation properties. Neither reports model relationship endpoints, logical extend targets, deployment relationship endpoints, or FQNs in styles at the enclosing `views` level and in global constructs. These limits are explicit in `tests/helpers/likec4-model.ts` and its traversal conditions. T002 adds computed values, warnings and sigma comparison, but does not widen the linked-reference oracle.

The gate therefore cannot be met with the planned foundation. Comparing only the intersection would leave exactly the reference-class drift the gate is meant to prevent. Computed relationships are not a replacement for a one-to-one reference-place oracle: they do not expose each written reference and its unresolved state.

**Proposal:** Assign a foundation task the independent LikeC4-linked oracle contract for the complete catalogue reference universe, including unresolved references and written places. Make T004/T005 depend on that contract and require explicit role coverage before comparison. Keep the expected side independent of the production catalogue. This is a missing proof mechanism for a class, not a request for a call-site checklist.

### 3. MAJOR — Relationship-write acceptance can silently omit the required direction comparison

**CLASS: new**

**Place:** `plan.md:144`, T026, T029 (`plan.md:345–355`), T033 and Dependencies and build order.

**Why:** T002 makes direction/style comparison conditional on whether the reported object has those fields, and makes both mandatory only in T033. T029 promises comparison of kind and direction for every spelling through that helper. However, G8b depends on G2/G3 and the oracle, not on the direction-reader contract delivered by T026 in G8a. Its declared prerequisites therefore permit T029 to run while model relationship reads still omit `bidirectional`; under the planned conditional comparison, its direction gate can pass without asserting direction at all. The written numeric task order happens to put T026 first, but the dependency graph and ready sets claim to define executable order as well.

This also conflicts with the testing guideline against a green result when the relevant assertion was not executed. Delaying style reads is a separate concern and does not justify postponing direction proof.

**Proposal:** Make direction comparison mandatory when the T026 direction contract lands, independently of style comparison, and make T029 consume that contract. Express the task-level prerequisite without forcing relationship writes to wait for the unrelated selector and CLI work of all G8a. If numeric order is the sole execution contract instead, reconcile the dependency graph with it explicitly.

### 4. MAJOR — Several atomic tasks defer their closing gate to later tasks

**CLASS: new**

**Place:** T003 (`plan.md:156`), T009 (`plan.md:192`), T010 (`plan.md:196–203`), T015; T007's kind/tag-addition gate (`plan.md:186`).

**Why:** The plan promises atomic commits with tests in the same commit as the behavior, but several tasks explicitly say their new class is “covered by” future tasks. T010's entire gate is T011–T013; T015's is T016/T017. T003/T009 rely on unchanged tests plus future consumers to prove the new class. These tasks can be compiled or regression-checked at their own completion, but their declared new behavior is not yet closed. Conversely, T007 requires observing that kind/tag additions are not checked, while those public operations arrive only in T021. That part of T007's own gate is unreachable at the stated position in the plan.

The issue is the completion boundary, not whether internal helpers need a separate test API. The testing guidelines specifically do not permit exposing an otherwise unused helper solely to make an early task testable.

**Proposal:** Define atomic completion units that include each new mechanism, its first real product consumer and its behavior gate in the same commit; alternatively give an independently consumed unit its own reachable behavioral gate. Move the kind/tag-addition acceptance cases to T021 while retaining their FR-004 traceability. Update groups and ordering to reflect those completion units. Do not solve this by adding test-only visibility or forward dependencies that create a cycle.

## Other checks

The traceability table names every scenario, invariant, functional requirement, success criterion and numbered decision in this run. The single-repository/single-stream grouping has written feature and shared-layer rationales, no solo groups and no declared cycles. No new runtime dependency is proposed. Same-commit JSDoc/README updates, structured errors, strict apply validation and release-without-publication are explicitly required. These parts do not require a different design.

The fallback lexer uncertainty is resolvable already: a read-only call against the current services returned `typeof getServices().likec4.parser.Lexer.tokenize === 'function'`. No new package or speculative API is needed to settle that point. External current-version documentation was not needed for this review of the pinned 1.59.4 behavior; the relevant APIs were inspected locally and the D109 behavior was executed against that installation.

FRICTION:

- The initial combined guidelines/tool output was truncated by the output limit. I reread the affected material in smaller sections before relying on it.
- The supplied spec was closed under an owner round limit. The residual checks above distinguish verified rule closures from the inventory implementation gap, without reopening settled product choices.

VERDICT NOT-READY

1. Complete the unmodelled identifier-reference inventory and its rejection gate (F1).
2. Provide the complete independent linked-reference oracle before catalogue/place-resolver equality gates (F2).
3. Make direction proof unconditional at the direction contract and express T029's actual prerequisite (F3).
4. Make every atomic task's behavioral gate reachable at its own completion; move acceptance cases that require later APIs (F4).
