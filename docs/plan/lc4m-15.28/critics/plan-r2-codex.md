# Implementation plan review — round 2

Reviewed the round-1 must-fix items and their propagation through the revised plan, against the specification, reconnaissance, current query and mutator code, `tests/helpers/likec4-model.ts`, `scripts/grammar-rules.ts`, project instructions and testing guidelines. Skein and Context7 answered real calls. Context7 documentation was supplementary; version-specific scoping evidence comes from the installed language server 1.59.4. No test suite was run and no probe script was needed. Only this report was written.

## Prior must-fix closure

1. **Explicit file placement:** closed. The decision row and T024 branch on explicit `file` before any default search. T025/T034/T038 consume that rule; T001 provides a blockless file; T028/T037/T039 exercise explicit placement when another file has a deployment block. Dependencies, delivery gates and traceability carry the change.
2. **Snapshot identity and survivor matching:** the mechanism is corrected. Frame descriptors now include logical and deployment extend targets and sibling ordinals; repeated references retain multiplicity. Explicit removal sets exclude deleted occurrences before ordinal calculation, and unmatched survivors or unexpected post-write records produce internal errors. T017 owns the implementation, T019 owns direct snapshot tests, and T027/T032/T038 plus T029/T033/T039 own deployment-removal integration. One revised acceptance requirement remains unreachable, as described below.
3. **Independent resolution observations:** closed. T002 supplies instance `element` data and linked targets through `FqnIndex.resolve(value.ref)`; T008 separates relationship, instance, extend and deployment-view reference classes. It includes logical-element view targets and unresolved/ambiguous outcomes. The oracle dependency precedes T008, and the foundation gate, risk statement and traceability reflect it. The installed `FqnIndex.resolve` accepts linked element/deployment AST targets; the existing helper already builds linked documents, so this extension is implementable without a new dependency.

## Findings

### 1. MAJOR — revised reference acceptance requires an impossible producer/reference combination

**Class:** `consequence-of-fix plan-r1-codex.md#2`  
**Location:** `plan.md`, T019 integration through existing logical writes; related T028 rejection gate.  
**Why:** T019 explicitly requires `addElement` to make an existing `extend <node>` target ambiguous, unresolved or re-targeted and then be rejected. In the installed language server, `getScopeForStrictFqnRef` selects project `DeploymentNode` candidates for the first segment and direct child deployment nodes for subsequent segments (`dist/chunks/module.mjs:7575–7579`). A logical element addition cannot change those candidates. T017 adds observation and comparison, but cannot make that transition occur. Thus this part of the G4 gate cannot be closed by its assigned operation.

T028 likewise includes an existing deployment extend target in the class of references made ambiguous or re-targeted by a newly added deployment node. T025 rejects duplicate deployment ids before insertion, while strict extend resolution uses direct paths rather than unique-descendant aliases. Adding a distinct node cannot change the target of an already resolved strict path; attempting the same path exercises duplicate-id rejection rather than snapshot protection. This is an acceptance-mechanism defect, not a request to change the specification's protected reference classes.

**Proposal:** State the acceptance class as applicable producer/reference combinations. In T019, retain logical-addition integration for `instanceOf`, endpoint element parts and logical candidates in deployment-view rules; demonstrate deployment extend target observation and survivor matching through the already allocated direct snapshot tests. In T028, retain node-addition integration for deployment endpoints and deployment-view references, and distinguish duplicate-id rejection from snapshot rejection for strict extend paths. Keep extend targets in the snapshot contract and direct gates. Propagate this qualification into any task-tree acceptance copied from these bullets.

## Other checks

- All specification identifiers remain traced to tasks. The revised placement, snapshot and oracle mechanisms are carried into their dependencies, groups, delivery checks and risk statements.
- The dependency graph remains sequential within one repository, with written group rationales and no cross-repository implementation waits or apparent cycles. G4's direct snapshot tests do not require later deployment writers; deployment-removal integration is allocated after those writers.
- No new runtime dependency, public-service invariant violation, or missing deployment-specific limit of a reused implementation pattern was found in the revised scope. Public API documentation remains assigned with API changes; release preparation excludes push, tag and publication.
- The snapshot mechanism can use CST ranges for explicit exclusion and inserted-text classification; the existing mutation implementation already applies text edits with snapshot/restore. No compiler call-site inventory is required for this review.

## Friction

- The revised T019 gate required interpreting an impossible logical-addition/deployment-extend transition. It is reported as finding 1 rather than silently treating the named reference class as optional.
- An initial source lookup used a nonexistent `node_modules/@likec4/language-server/lib` directory; the installed implementation was then read from `dist/chunks/module.mjs`. No conclusion relies on the failed lookup.

VERDICT: NOT-READY

Must-fix:

1. Make the revised reference integration gates achievable: qualify producer/reference combinations in T019 and T028, retain strict deployment extend coverage in direct snapshot/oracle tests, and distinguish duplicate-id rejection from reference-change rejection.
