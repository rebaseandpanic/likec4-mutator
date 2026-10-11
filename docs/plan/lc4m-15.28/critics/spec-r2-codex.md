# Specification review — round 2

Reviewed `spec.md` against the normative description and acceptance criteria of Skein lc4m-15.28, all five decision comments on lc4m-15 (D1–D13, including revised D7), round-1 `spec-r1-codex.md`, README, public exports and query/mutation/reference paths in `src/`, `tests/helpers/likec4-model.ts`, reconnaissance and spike reports, the offline Deployment Model documentation, and installed `@likec4/language-server` 1.59.4. Only `spec-r1-codex.md` was present as a previous-round critic report.

Skein and Context7 answered real calls before substantive review. Context7 documentation corroborated instance inheritance but did not establish the empty-map behavior; the installed version and live probes establish that behavior below. No test suite was run. Probe scripts were written only under `/tmp/zdox-lc4m-15.28-critic/`. This report is the only repository file written.

## Findings

### 1. MAJOR — Design and completeness hats — incomplete-fix spec-r1-codex.md#3

**Location:** US-9 metadata patch acceptance; D9; Clarifications; final FOR-PLAN bullet.

**Why:** The last-key case remains a product-contract ambiguity and contains an incorrect assumption about LikeC4. US-9 promises that `null` deletes a key from the effective map, then says inherited metadata applies again *only if the own block is removed*. In 1.59.4, a retained empty own block also restores inheritance. Thus preserving the block does not make an empty effective override possible. The FOR-PLAN question cannot decide this public behavior solely as a text-editing choice.

**Verified scenario:** Logical `api` has `metadata { region 'east' }`; `prod.api` deploys it. These four independent source variants build with no diagnostics:

| Instance declaration | Computed own metadata | Getter metadata |
|---|---|---|
| No metadata block | absent | `{ region: 'east' }` |
| `metadata { }` | absent | `{ region: 'east' }` |
| `metadata { region '' }` | absent | `{ region: 'east' }` |
| `metadata { tier 'one' }` | `{ tier: 'one' }` | `{ tier: 'one' }` |

Observed with `npx tsx /tmp/zdox-lc4m-15.28-critic/r2-metadata.mts`. Installed `dist/chunks/module.mjs:5215` (`getMetadata`) returns no map for an empty block or values that normalize away; `parseDeployedInstance` uses it at line 5494. A requested effective patch `{ region: null }` that removes the last key therefore cannot produce the promised empty effective map. The same issue occurs when a nonempty own map becomes empty and the element has unrelated inherited keys: those keys reappear.

**Requirement-level proposal:** Decide a deterministic outcome when the patched effective map becomes empty while the element supplies metadata: either explicitly allow inheritance to resume as a documented exception to effective deletion, or reject that patch with a named-field error. State the result independently of whether an empty block is retained. Cover both deletion of the last inherited key and deletion of the last own key with inherited keys present. Propagate the decision into US-9, D9, Clarifications and acceptance; the observable outcome must be fixed before planning.

### 2. MINOR — Completeness hat — incomplete-fix spec-r1-codex.md#4

**Location:** US-3 and D10 versus INV-4, Goal, SC-002 and Clarifications for effective values.

**Why:** D10 and US-3 correctly document the deliberate exclusion of icon-derived technology, but INV-4 lists only D2 as an exception to computed-model equality. SC-002 still requires unconditional field-by-field equality. Consequently a valid inherited-icon fixture must both report the uninferred technology and equal LikeC4's default inferred technology. SC-006 already names both exceptions, demonstrating that the correction has not propagated everywhere.

**Requirement-level proposal:** Apply D2 and D10 consistently to every equality promise and oracle acceptance criterion. State that the reference comparison accounts for the declared exceptions, and require an icon-only inherited-technology example. Preserve the explicit decision to leave logical reads unchanged.

### 3. MINOR — Design and completeness hats — incomplete-fix spec-r1-codex.md#6

**Location:** Scope's deferred `removeElement` view-reference policy and US-12 “Unchanged” versus INV-1, INV-8 and D13's “every write of this feature.”

**Why:** The scope exclusion now explicitly leaves logical removal against view-rule references unchanged, but the invariants still read as universal promises for accepted writes, including logical references. The actual incumbent also permits removing an element that is a view's `of` target. That surviving reference becomes unresolved. This review does not request expanding the deferred policy; it requests making the scope of the guarantees consistent.

**Verified scenario:** `model { api = service }` and `views { view index of api { include * } }` build without diagnostics. Current `removeElement('api')` succeeds and returns `{ removedRelationships: [] }`; rebuilding the serialized source reports `Could not resolve reference to Referenceable named 'api'`. Observed with `npx tsx /tmp/zdox-lc4m-15.28-critic/r2-removal.mts`. The operation in `src/mutator/mutator.ts:375` does not guard that view reference; `src/query/workspace-index.ts:502` separately excludes view-rule references from the incumbent resolution audit.

**Requirement-level proposal:** State precisely which guarantees govern new deployment writes, the new checks added to existing logical operations, and the unchanged behavior of those operations. Explicitly include the deferred view surfaces, including view scope targets, in the boundary statement. Qualify INV-1/INV-8 and the D13 summary accordingly, without silently adding general logical-view protection to this feature.

### 4. MINOR — Completeness hat — new

**Location:** SC-002 and SC-003; testing clarification; normative source issue “Effective values” acceptance criterion.

**Why:** The source issue requires effective-value comparisons after reads and after each write. SC-002 covers read scenarios only; SC-003 requires validity only for writes “whose output is compared.” Valid LikeC4 text alone does not detect an incorrect inherited value or a lost contribution from another file. The narrowed wording permits writer coverage without the required post-write differential checks, particularly for update/removal of extends and inherited instance properties.

**Requirement-level proposal:** Restore explicit post-write effective-value comparison for each deployment write operation, including surviving entities after removals, with D2/D10 accounted for. Require every successful write fixture to pass the validation oracle; do not condition that requirement on whether its output happened to be compared.

## Round-1 closure and sister-surface audit

- **#1, deployment-view stability:** Closed at the requirements level. D13, Scope, US-12, INV-8 and the reference backlog cover additions and surviving bindings; predicates, relationship predicates and style targets are enumerated. View editing remains deferred.
- **#2, complete endpoints:** Closed. US-4 and US-10/D12 preserve the logical element component, specify deployment-id list filtering, and match bidirectional relationships in either order. Truly indistinguishable relationships are explicitly rejected.
- **#3, instance patch semantics:** Substantially clarified by D9; the empty-result boundary remains finding 1.
- **#4, icon-derived technology:** Product decision recorded and US-3 corrected; equality promises remain finding 2.
- **#5, file choice:** Closed. D11/US-5 bound `file` to root nodes, relationships and extends, reject it for children/instances, require loaded files and reject empty workspaces.
- **#6, release and invariant consistency:** Release preparation and surviving-reference cascade wording are corrected. The boundary for unchanged logical operations remains finding 3.

Audited sibling surfaces: public `C4Query`/`LikeC4Mutator` reads, node and instance CRUD, deployment relationship CRUD, extend creation/removal with externally declared children and dependent relationships, logical element additions/removals, deployment view references, specification defaults, and `apply`. Child insertion into extends, view editing, rename/move, relationship extends and individual CLI commands have explicit scope decisions. No additional missing deployment mutation is established by this review. Atomic failure and strict batch field validation are required; no concurrent service or persistence contract is needed for the synchronous in-memory library.

## [USER-DECISION]

Finding 1 requires a product decision for a result LikeC4 1.59.4 cannot represent as an empty instance metadata override. The lead is authorized to decide on the owner's behalf. Accepting a documented return to inheritance is compatible with the existing parenthetical intent, but must be unconditional on block removal and explicitly limit the effective-deletion promise. Alternatively, reject the unrepresentable patch. No reversal of D1–D8 is requested.

## FRICTION

The startup-mail rule and the live-MCP rule both require being the first action. Startup mail was sent first, then both MCP servers were called before substantive work. The available `skein_show` schema has no `project` parameter, so full project-prefixed issue ids were used. Neither prevented review. No other previous-round engine report existed in the critics directory at review time.

VERDICT: NOT-READY

Must-fix:
1. Resolve and specify the empty effective instance-metadata result using verified LikeC4 behavior (finding 1).
