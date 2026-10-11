# Implementation plan review — round 1

Reviewed `plan.md` against `spec.md`, the current query/mutator and apply implementation, `tests/helpers/likec4-model.ts`, `scripts/grammar-rules.ts`, project instructions, testing guidelines, reconnaissance, and the installed LikeC4 language server 1.59.4. Skein and Context7 both answered real calls. Context7 documentation was supplementary; version-specific conclusions use the installed source. No test suite was run. Only this report and a probe under `/tmp/zdox-lc4m-15.28-critic/` were written.

## Findings

### 1. MAJOR — explicit file selection can be overridden by the placement fallback

**Class:** `new`  
**Location:** `plan.md`, T024; consumers T025, T034, T038.  
**Why:** T024 orders placement as the first deployment block of the chosen file, then the first other file with a deployment block, then a new block in the chosen file. If the caller selects a loaded file without a deployment block while another file already has one, this sequence writes into the other file. US-5/D11 make the explicit file authoritative, and US-11 specifically requires creating a block in that file when needed. This is a plan mechanism defect, not a missing compiler call-site. Existing `BodyInsertions.forBlock` and new-block edits can support the required branching.  
**Proposal:** Branch first on whether `file` was supplied. With an explicit loaded file, use its first deployment block or append a new block there. Only the no-file branch searches other documents and applies the model-file/default fallback. Add an acceptance class covering explicit placement into a blockless file while other loaded files already contain deployment blocks, for all placement-selecting operations.

### 2. MAJOR — the snapshot key does not identify extend scopes or surviving occurrences

**Class:** `new`  
**Location:** `plan.md`, reference-stability decision, T017, and risk statement claiming equal keys imply equal resolution inputs.  
**Why:** The proposed key contains enclosing named containers, top-level block index, role, and reference text. An `extend` body is not a named declaration, but its target changes the scope. For example, relationship target `api` in `extend prod { ... }` and in `extend other { ... }` in the same deployment block has the same stated key while resolving through different extend frames. The installed scope provider explicitly adds `genScopeExtendDeployment(container.$container)` during lookup; the existing logical resolver likewise carries a separate `ScopeFrame.extended`. Thus the stated key's equivalence claim does not hold. Repeated contributions to the same target also require an explicit treatment of multiplicity and of references deliberately deleted by cascades. Without that rule, a snapshot can collapse references or confuse a removed occurrence with a survivor, defeating INV-8.  
**Proposal:** Specify how the key represents every resolution-bearing frame, including logical/deployment extend targets, and how snapshots preserve repeated occurrences and match surviving references across edits. State how intentionally removed references are excluded rather than treating a missing key as proof of intentional removal. Gate the class with equal reference texts in distinct extend scopes and repeated same-target extend blocks, including deletion of one block while another survives. Keep the G4 gate executable through the existing logical writes or direct snapshot/resolver tests; put deployment-removal integration checks in the later writer test tasks that own those operations.

### 3. MAJOR — T008's declared oracle cannot close its non-endpoint resolution gate

**Class:** `new`  
**Location:** `plan.md`, T002 and T008, especially “Each compared with LikeC4 `$data.deployments.relations` endpoints”; dependency on T008 for the resolver foundation.  
**Why:** Relation endpoints verify deployment relationship resolution. They do not expose an instance's logical `instanceOf` target, an extend target, or the references in deployment-view rules. An instance can have no relationships at all, and a view reference can change without changing any relationship endpoint. The current helper returns view title/folder only, and T002 adds deployment data/getter snapshots without a reference-oriented view or linked-reference oracle. Therefore T008's claimed gate for these reference classes cannot be met by its stated observation mechanism. This leaves the foundation used by D13/US-12 insufficiently verified even though the traceability table lists tasks for it.  
**Proposal:** Allocate an independent observable for each reference class before T008: instance targets from deployment instance data, and linked targets or another direct LikeC4 observation for extend/view-rule references. Extend the helper only as needed to expose those observations. Make T008 assert resolved identity and unresolved/ambiguous outcomes for each class, including view references that resolve to deployment candidates and logical-element candidates. Relationship endpoints remain the oracle for relationship references.

## Other checks

- Every US, INV, SC, D and FOR-PLAN identifier has a traceability entry. The defects above concern the mechanisms and gates behind those entries.
- The one-repository sequential stream has written group rationales, no cross-repository waits, and no dependency cycle apparent in the stated graph. No new runtime dependency is proposed.
- HTTP 422, outbox, environment, metrics and service logging requirements are correctly marked inapplicable to this library. Public API documentation accompanies API tasks; release preparation explicitly excludes push/tag/publication.
- Reused mechanisms are named and their material deployment differences are generally described: inline anchors, body-only relation strings, style-icon precedence, deployment kind checks, and reference checks.
- A focused real-language-service probe of `it -> other` inside `prod.app1` built without diagnostics and produced source deployment `prod`. This confirms the plan's documented explicit-`it` rule for that case; it is not a finding. The probe is not a test-suite run.

## Friction

- T019 is said in the risk section to exercise removal-uniqueness cases, but it runs in G4 before deployment removals exist, and its task body describes the existing logical removal guard instead. The report recommends assigning the later integration checks to their owning writer tasks rather than guessing an unstated dependency.
- The first temporary probe used a `.ts` file outside the ESM package and failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`; rerunning it as `.mts` succeeded. No repository configuration was changed.

VERDICT: NOT-READY

Must-fix:

1. Make explicit-file placement authoritative in T024 and test the mixed block/blockless workspace class.
2. Define snapshot scope identity, multiplicity, and survivor matching; allocate executable acceptance gates at the correct stages.
3. Give T008 independent LikeC4 observations for instance, extend and deployment-view references rather than comparing all of them with relationship endpoints.
