# Specification review — round 1

Reviewed `spec.md` against Skein lc4m-15.28's description and acceptance criteria, the decision comments on lc4m-15 (including revised D7), README, the current query/mutation paths, `tests/helpers/likec4-model.ts`, reconnaissance spikes 01–07, the offline deployment documentation, and installed LikeC4 1.59.4. Both Skein and Context7 answered live calls. Context7's current documentation was supplementary; installed 1.59.4 and the local probes determined version-specific conclusions. No test suite was run. Only this report was written in the repository; additional probes ran under `/tmp/zdox-lc4m-15.28-critic/`.

## Findings

### 1. MAJOR — Design hat — new

**Location:** Scope exclusions for deployment views; US-12; INV-1 and INV-8; FOR-PLAN reference list.

**Why:** Deployment-view references are protected only on removal. The explicit addition checks enumerate `instanceOf`, deployment relationship endpoints and extend targets, omitting view predicates. New deployment names can invalidate those predicates even when all existing instances, relationships and extends remain intact. This is a regression introduced by the new writers, not a request to implement view editing.

**Verified scenario:** In one file, deploy `app.api` once under `prod.original`, and use `deployment view index { include api }`. LikeC4 1.59.4 reports no diagnostics. Add another instance of `app.api` under `prod.added`, with a different deployment id. The same view now produces `Deployment view predicate must reference deployment model`. This was observed with `npx tsx /tmp/zdox-lc4m-15.28-critic/probe.mts`; all instance ids remain unique. The current `resolveDocumentReferences` documentation (`src/query/workspace-index.ts:502`) explicitly excludes view-rule references, so inheriting the incumbent check's scope will not cover this case.

**Requirement-level proposal:** Protect existing deployment-view reference bindings against additions and other scoped writes that can change their resolution, while keeping view editing deferred. Name the predicate surfaces covered (include/exclude, relationship predicates, style targets, and other reference-bearing rules accepted by 1.59.4). Add acceptance for an addition that makes a previously valid view reference ambiguous, and for shadowing that changes its target while remaining valid.

### 2. MAJOR — Design and completeness hats — new

**Location:** US-4 endpoint representation; US-10 update/remove selectors; D7.

**Why:** Reads distinguish the deployment id and the nested logical element component, but update/remove selectors are specified only by source and target ids, kind and title. That loses information required by the accepted nested-element endpoint contract.

**Verified scenario:** LikeC4 accepts both `left.db -> right.api.first 'reads'` and `left.db -> right.api.second 'reads'`, with no diagnostics. Its computed endpoints have the same deployment component `right.api`, but element components `api.first` and `api.second`. This was observed with `npx tsx /tmp/zdox-lc4m-15.28-critic/endpoints.mts`. Neither kind nor title distinguishes these relationships. A caller who can create and read them cannot select either for update/removal under the documented selector contract. INV-3 prevents a wrong edit, but leaves a supported write surface unusable.

**Requirement-level proposal:** Require selection and filtering to preserve the full semantic identity of each endpoint, including its nested element component, and state whether deployment-id filters intentionally match all nested endpoints of that instance. Define the treatment of direction and reversed bidirectional endpoints as part of the selection contract. Retain explicit rejection when genuinely indistinguishable relationships remain.

### 3. MAJOR — Completeness hat — new

**Location:** US-3 inheritance; US-7 patch semantics; US-9 “same semantics as nodes.”

**Why:** An instance's own metadata replaces the whole inherited map, unlike a node's extend merge. Consequently “metadata MERGE with null deleting a key” is ambiguous about the merge base. Existing element updates explicitly operate on effective contributions (README's extend section), but do not have this instance replacement boundary.

**Concrete scenario:** An element has metadata `{ region: 'east', tier: 'one' }`, and its instance has no own metadata. Patching only `region` can mean either preserving inherited `tier` in the resulting effective map or creating an own map containing only `region`, losing `tier`. Deleting inherited `region` has the same ambiguity: merely removing an own key restores inheritance rather than deleting the effective key. Reconnaissance spike 02 verifies whole-map replacement for instance metadata. Tags also always retain element tags, and empty own links can restore inherited links; an unqualified REPLACE promise is misleading for those fields.

**Requirement-level proposal:** State whether each instance patch acts on declared or effective values. Specify inherited-key preservation and deletion, the last-key/empty-map case, and what empty tag/link replacements do. Require explicit acceptance examples. Do not alter the referenced logical element as a side effect. Document any inherited values that cannot be suppressed through a patch.

### 4. MINOR — Completeness hat — new

**Location:** D2, US-3, INV-4 and the logical-model compatibility constraint.

**Why:** The new reads promise the LikeC4 getter layer, whereas README “Specification defaults” explicitly excludes icon-derived technology from current logical reads and says project settings are not read. The mutator constructor accepts source files only (`src/mutator/mutator.ts:130`). Installed LikeC4's `buildModelData` uses `project.config.inferTechnologyFromIcon ?? true` (`dist/chunks/module.mjs:3486`). A live probe with `style { icon tech:postgresql }`, no technology declaration, and `host.api = instanceOf api` returned `Postgresql` for both LikeC4 getters, with no diagnostics.

**Requirement-level proposal:** State the configuration context against which deployment getter equality is promised, including default icon inference and unsupported project configurations. Clarify the intentional difference from unchanged logical reads. Include an icon-derived instance technology example in acceptance. This is a contract clarification, not a proposal to add project configuration support.

### 5. MINOR — Completeness hat — new

**Location:** D4 “file on every add”; US-6/US-9 declaration-body placement; US-11 chosen file.

**Why:** Child-node and instance additions always go to the parent's declaration body, but D4 offers a file option on every addition. The spec does not say what happens when the caller selects a different loaded file, or a file absent from the loaded workspace. US-5 also has no first-file fallback for an empty workspace. These cases affect a public API's observable behavior and error fields.

**Requirement-level proposal:** Specify precedence between parent placement and explicit file choice, the outcome of a conflicting file choice, whether file choice may create a new file, and the empty-workspace rejection. Preserve the deliberate deferral of extend-body placement.

### 6. MINOR — Completeness hat — new

**Location:** Success criteria; INV-8; Goal versus INV-1.

**Why:** The source issue requires preparation of a minor release with version changes in `package.json` and the coverage document, but the success criteria mention only a CHANGELOG entry. Also, INV-8 literally forbids changing any existing reference target while US-8/US-9 intentionally delete dependent relationships and extends. The Goal promises every accepted result validates, while INV-1 permits unrelated pre-existing errors. These formulations leave acceptance broader or narrower depending on the section read.

**Requirement-level proposal:** Restore the explicit minor-release preparation requirement and prohibition on push/tag/publication without owner instruction. Qualify stability for surviving references and intentional removals, and use the introduced-error rule consistently in the Goal and acceptance. Clearly bound guarantees for existing logical operations whose broader view-reference policy is deferred.

## Sister-surface audit

The relevant surfaces are logical additions/removals, deployment node/instance additions/removals, removal of an extend containing children, deployment relationship CRUD, and deployment view references. US-11 appropriately inherits subtree-removal protection for children of a removed extend. Relationship CRUD has no relationship-extend counterpart in this grammar. Rename/move, specification CRUD and view editing are explicitly deferred. The unresolved inherited scope is protection of existing view bindings during additions (finding 1), and the endpoint selection surface does not fully carry revised D7 (finding 2).

## [USER-DECISION]

Finding 3 needs a product decision on declared versus effective instance patch semantics. The lead has authority to make that decision on the owner's behalf. The other findings can be resolved by clarifying or completing existing commitments; no reversal of D1–D8 is requested.

## FRICTION

The startup instructions require both the live MCP probes and the startup mail to be the first action. I sent startup mail first, then called both MCP servers before substantive work. Also, the available `skein_show` schema has no `project` parameter although the workspace instruction requests it on every task tool; full project-prefixed ids were used. Neither constraint prevented the review.

VERDICT: NOT-READY

Must-fix:
1. Cover deployment-view reference stability for additions and other relevant scoped writes.
2. Preserve complete endpoints in relationship selection, including nested logical elements.
3. Decide and document inherited instance patch semantics, including deletion and empty values.
