# Spec: Read and edit the LikeC4 deployment model

**Date** 2026-10-12 · **Status** draft · **Task**: lc4m-15.28 (epic lc4m-15, stage 1) · **Affects**: likec4-mutator (library, `apply` CLI command, docs)
**Type**: feature (+ two reference-stability bugfixes in existing operations) · **Based on**: README sections "Specification defaults", "`extend` blocks", "Rejected writes"; reconnaissance `spikes/RECON.md` (LikeC4 1.59.4, spikes 01–07)

Identifiers: scenarios `US-N`, invariants `INV-N`, other requirements `FR-NNN`, success criteria `SC-NNN`. Decisions recorded as decision comments on Skein epic lc4m-15 (lc4m-15.28) are referenced as `D1`…`D14`.

## Problem / Goal

The `deployment { … }` part of the LikeC4 DSL — deployment node kinds, nested nodes, `instanceOf` instances, deployment relationships and `extend <node>` blocks — is neither read nor written by the library. Users edit it as text, which is fragile (instance blocks repeat across nodes, instance names are implicit, nothing validates before writing).

Goal: read the whole deployment model with the values LikeC4 1.59.4 computes, and add / update / remove every deployment construct through the library and `apply`, rejecting before writing anything LikeC4 would reject. An accepted write introduces no `likec4 validate` error (INV-1).

## Scope

**In scope**
- Reading: deployment node kinds (with defaults), nodes, instances, deployment relationships, `extend <node>` provenance.
- Writing: the `deployment { }` block (creation), nodes, instances, deployment relationships, `extend <node>` blocks.
- `apply` operations for every write.
- Reference stability for deployment references: writes to the logical model and to the deployment model must not silently break or re-target existing deployment references, including references in deployment view rules (two existing defects, US-12; D13).
- Test helper: expose LikeC4's computed deployment model to tests.
- Coverage table rows for the deployment grammar.

**Not in scope**
- Deployment views (`deployment view …`) — read/write of views is stage 2 (lc4m-15.29). Here their references are only consulted to protect them (US-8, US-12, D13).
- General reference policy, rename / move (lc4m-15.30). Removal of referenced constructs is rejected here instead (D5).
- `removeElement` against references to the removed element in view rules (logical or deployment views): unchanged here, part of the general reference policy (lc4m-15.30). US-12 covers only `instanceOf` and deployment relationship endpoints.
- Single-purpose CLI commands (lc4m-15.31).
- Styling beyond reading and writing `style { }` fields of nodes, instances and relations (notation, icons catalogue: lc4m-15.32).
- Logical-model elements and relations themselves (unchanged except US-12).

**Deliberately deferred**
- Adding a child into an existing `extend <node>` body instead of the declaration body (children inside extend bodies are read and addressable; writing new ones goes to the declaration body). Reason: one documented placement rule; extend-body placement can be added later without breaking callers.
- Writing an `extend` of a deployment relationship: does not exist in LikeC4 1.59.4 (grammar has no such rule; LikeC4 docs: "deployment relationships cannot be extended"). Recorded as `n/a` in the coverage table.

## Scenarios and acceptance

### US-1 — Read deployment node kinds (P1)
- **Acceptance**: Given a specification with `deploymentNode` kinds (with and without defaults), when the caller reads the specification, then every declared deployment node kind is listed, and each kind's defaults (title, summary, description, technology, tags, links, style) are available with file and source range, following the same "declared more than once" rule as element kinds (last file in LikeC4 document order, last declaration within a file).
- Element kinds, relationship kinds and tags are reported exactly as today.

### US-2 — Read deployment nodes (P1)
- **Acceptance**: Given nodes declared in both forms (`kind name`, `name = kind`), nested at least three levels, across files, with `extend <node>` blocks in other files, when the caller lists or gets nodes, then each node is reported with: id (LikeC4 deployment id = parent id + `.` + name), name, kind, parent id, effective title, summary, description, technology, tags, links, metadata, style, kind defaults (`fromSpecification`), `declared` (declaration body as written), `extendedBy` (one entry per `extend` block with file and range), child node ids, instance ids, file and source range. Listing is filterable by kind and by parent id.
- Effective values equal LikeC4's computed model (INV-4), including its node rules: own values override kind defaults; own links replace kind links; an empty title stays `''`; a title equal to the node name is replaced by the kind title when the kind has one; tags = own (or kind tags when there are none) then `extend` tags, then the kind tags appended without duplicates; metadata and links from `extend` blocks merge as for elements; style = kind style overridden per field by own style.

### US-3 — Read instances (P1)
- **Acceptance**: Given named and unnamed instances, several instances of one element in one node (named), instances inside `extend` bodies, when the caller lists or gets instances, then each is reported with: id, name (explicit, or the last segment of the `instanceOf` reference as written), parent node id, target element FQN, effective title, summary, description, technology, tags, links, metadata, style, `declared`, file, source range. Listing is filterable by node id and by element FQN.
- Effective values follow LikeC4's computed model: title, technology, links, metadata come from the instance when it has them, else from the element (an instance metadata map replaces the element's whole map; an empty instance title stays `''`); tags = instance tags then element tags without duplicates; style = element style overridden per field by instance style. **Exceptions (D2, D10):** summary and description are reported per field (instance value, else element value) without LikeC4's display fallback between summary and description; technology is never derived from an icon (LikeC4's default `inferTechnologyFromIcon` is not applied — the library reads no project settings, the same rule as for logical elements). Both documented.

### US-4 — Read deployment relationships (P1)
- **Acceptance**: Given relationships at the top of `deployment`, nested in node and instance bodies (including source-less ones), in `extend` bodies, with every connector form (`->`, `<->`, `-[k]->`, `-[k]<->`, `.k`), with endpoints that are nodes, instances, or elements nested inside an instance's element (`prod.db.replLog`), when the caller lists them, then each is reported with: source and target (deployment id, plus the element FQN when the endpoint steps into an instance's element), kind, bidirectional flag, effective title, description, technology, tags, links, metadata, style, kind defaults, `declared`, file, source range. Listing is filterable by source id, target id and kind; a source / target filter by deployment id also matches endpoints that step into that instance's element.
- Effective values follow LikeC4: inline description and technology on the relation line are ignored (LikeC4 parses but ignores them); line tags win over body tags; the kind's tags are prepended; the kind's title / description / technology apply when own is absent.
- `getRelationships()` (logical model) returns exactly what it returns today; deployment relationships are not mixed into it.

### US-5 — Create the deployment block (P1)
- **Acceptance**: Given a workspace without any `deployment` block, when the caller adds a root node or a relationship, then a `deployment { }` block is created in the chosen file (`file` option) or, by default, appended at the end of the first file (LikeC4 document order) that has a `model` block; if no file has a `model` block, the first file. With no loaded file at all the write is rejected. With an existing block, root additions go into the first `deployment` block of the chosen file, or of the first file (document order) that has one (D4).
- **File option (D11):** `file` is accepted only where placement is a choice — a root node, a relationship, an `extend` block. For a child node or an instance (placed in the parent's declaration body) a `file` option is rejected. The file must be one of the loaded files; no new file is created; an unknown file is rejected naming `file`.

### US-6 — Add a node (P1)
- **Acceptance**: Given a declared deployment node kind, when the caller adds a node under a parent id (or at the root) with name, kind and optional title, summary, description, technology, tags, links, metadata, style, then the node is written in the parent's declaration body (creating `{ }` when the parent has none) and reading it back returns the requested values (after kind defaults, as US-2). Technology is written in the body (the grammar has no inline technology for nodes).
- Rejected before writing: undeclared kind; name that is not one identifier or is reserved; a node or instance with the same id anywhere in the workspace (including children declared in `extend` bodies); undeclared tag; invalid style value; parent id that is not a node.

### US-7 — Update a node (P1)
- **Acceptance**: Given a node, when the caller patches it: title, summary, description, technology REPLACE every declaration LikeC4 reads (inline and body); tags REPLACE, links REPLACE, metadata MERGE with `null` deleting a key, style MERGE per field, comments and untouched text kept. Patched tags, links and metadata keys are removed from every `extend` block of exactly this node in every file (as `updateElement` does for elements). Result `{ changedFiles }`.
- Tag / link / metadata updates are rejected while any loaded file has syntax errors (as for elements).
- Kind is not changeable (out of scope; rename/move is lc4m-15.30).

### US-8 — Remove a node (P1)
- **Acceptance**: Given a node, when the caller removes it, then the node with its whole subtree (child nodes, instances, nested relationships) and every `extend` block targeting a node of the subtree are removed, and every deployment relationship anywhere whose source or target lies in the subtree is removed and reported (`removedRelationships`).
- Rejected before writing, with an error listing the references: a deployment view that references the node or anything in its subtree (D5).

### US-9 — Add, update and remove instances (P1)
- **Acceptance**: Given a node and a resolvable element, when the caller adds an instance with optional name and properties, then it is written in the node's declaration body and reads back as US-3. Without a name the implicit name is the last segment of the written element reference; an instance is written unnamed only when that implicit id is free, otherwise the caller must give a name.
- Update (D9): strings REPLACE the instance's own values; style MERGE per field into its own style; tags REPLACE its own tags (LikeC4 always appends the element's tags; they cannot be suppressed); links REPLACE its own links (`[]` removes them, and the element's links apply again); metadata is patched on the **effective** map: when the instance has no own metadata, the inherited keys are first copied into its own block, then keys are upserted, and `null` removes a key from the effective map. LikeC4 1.59.4 cannot express an empty own map (an empty `metadata { }` or values that normalize to nothing count as absent, and the element's map applies again), so (D14) a metadata patch is accepted only if, after the write, every patched key reads as requested — an upserted key with its value, a `null` key absent; otherwise it is rejected naming `metadata.<key>` and explaining that the override cannot be empty. Unpatched keys of the element may come back when the instance's own map becomes empty (own `{ tier }`, element `{ region }`, patch `{ tier: null }` → effective `{ region }`), documented. The referenced element is never changed. Patched tags, links and metadata keys are not stored in `extend` blocks (instances cannot be extended). The target element is not changeable. Documented with examples.
- Remove: the instance, its nested relationships, and every deployment relationship whose endpoint is the instance (or an element inside it) are removed; rejected when a deployment view references it.
- Rejected before writing: element reference that does not resolve as LikeC4 resolves `instanceOf` (document model scope and root elements); duplicate id; invalid name; undeclared tag; invalid style; target node id that is not a node.

### US-10 — Add, update and remove deployment relationships (P1)
- **Acceptance (add)**: Given resolvable endpoints, when the caller adds a relationship with optional kind (declared relationship kind), bidirectional flag, title, description, technology, tags, links, metadata, style, then it is written at the top level of a `deployment` block (US-5 file rule); description and technology go into the body, never on the line (INV-5); it reads back as US-4.
- Endpoints are written as the caller gives them and must resolve, from the insertion point, by LikeC4's deployment scoping, to a node, an instance, or an element nested inside an instance's element (D7-revised). Rejected: unresolved endpoint, a model-only FQN, self or parent–child pair (LikeC4's deployment hierarchy check), undeclared kind or tag, invalid style.
- **Update** (D12): selected by source and target endpoints — each a deployment id plus, when the endpoint steps into an instance's element, that element part, exactly as reads report them — optionally narrowed by kind and title; a bidirectional relationship matches either endpoint order; strings REPLACE (every declaration LikeC4 reads), tags / links REPLACE, metadata MERGE with `null`, style MERGE per field. More than one match without a narrowing selector → explicit ambiguity error naming the candidates.
- **Remove**: same selector; ambiguity → explicit error. Relationships that the selector cannot tell apart (same endpoints, kind, title) can only be removed or updated once disambiguated by the caller's edits; the error names them.

### US-11 — Create and remove `extend <node>` blocks (P2)
- **Acceptance**: Given a node, when the caller creates an `extend` block for it in a chosen file with tags, links and/or metadata, then the block is appended to a `deployment` block of that file (created if needed) and the node's effective values include its contribution (provenance in `extendedBy`). Removing selects the block by node id and file (plus a 1-based occurrence when the file holds several blocks for that node; otherwise ambiguity error); children declared inside the removed block are removed with it, following US-8 rules for their references.
- An `extend` body never receives string or style properties (the grammar forbids them) nor source-less relationships (parse error).
- Extending an instance is rejected (LikeC4: "ExtendDeployment allows only DeploymentNode").

### US-12 — Reference stability across the logical and deployment models (P1, bugfix)
**Current**: `removeElement` removes an element referenced by `instanceOf` (LikeC4 then reports `Could not resolve reference`); `addElement` can make an existing `instanceOf api` ambiguous and is not rejected (spike 07 C/D).
**Expected**: `removeElement` is rejected, listing the instances, when the element or any element of its subtree is the target of an `instanceOf` or of a deployment relationship endpoint stepping into an instance's element. `addElement`, `addDeploymentNode` and `addDeploymentInstance` — and every other write of this feature that adds a name — are rejected (sources unchanged) when the new name would change the resolution of any existing reference — logical-model references as today, plus `instanceOf` targets, deployment relationship endpoints, `extend <node>` targets, and references in deployment view rules (include / exclude predicates, relationship predicates, style targets, every rule that names an element of the view), whether the change makes the reference ambiguous, unresolved or re-targeted (D13). Example: a second instance of an element whose implicit name a view rule uses unqualified makes the rule ambiguous → rejected.
**Unchanged**: everything else `removeElement` / `addElement` do.

### US-13 — Batch operations through `apply` (P1)
- **Acceptance**: Every library write of US-5…US-11 is an `apply` operation with the same fields; the mutations file is validated as a whole before any file is touched (unknown fields rejected, wrong types rejected, errors located as `mutations[i].<path>`); a rejected write exits 1 and writes nothing.

## Architecture overview

### Load-bearing decisions
| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Nodes and instances are addressed by their LikeC4 deployment id; reads can filter instances by element | the id is unique in any valid model; one addressing scheme, no "first match" | path + element FQN (+ name) selector (two ways to address, ambiguity handling twice) |
| D2 | Effective values = LikeC4's computed model (getter layer) with provenance; summary / description per field | callers see what diagrams and view filters see; provenance explains it | raw data layer (no instance inheritance); getter cross-fallback (would report a description the user never wrote) |
| D3 | Fix US-12 defects in this run | deployment references are part of the deployment model's integrity; otherwise INV-1 does not hold | separate task |
| D4 | Optional `file` for root additions (see D11); default: first file with a `deployment` block, else end of first file with a `model` block, else first file | predictable, no new files, compatible with lc4m-15.30 file choice | always first file; a new file |
| D5 | Remove cascades deployment relationships; rejects when deployment views reference the removed thing | view rules are the user's intent; silently editing them is worse than refusing | cascade into views; reject on any relationship |
| D6 | Never write inline description / technology on deployment relationships | LikeC4 ignores them | mirror model-relation inline form |
| D7 | Relationship endpoints: node, instance, or element nested in an instance's element | documented LikeC4 scenario (`vm2.db -> vm1.db.repl_log`) | nodes and instances only |
| D8 | Only `extend <node>`; extend of relationships `n/a` | grammar | — |
| D9 | Instance metadata patched on the effective map (copy-on-write of inherited keys); tags / links / strings on own values | no silent loss of inherited keys; LikeC4 replaces the whole map | patch only own values (loses inherited keys on first patch) |
| D10 | No icon-derived technology in deployment reads | one rule across the library; project settings are not read | follow LikeC4's default getter |
| D11 | `file` only where placement is a choice; loaded files only | the parent decides a child's place; no surprise files | `file` everywhere / create files |
| D12 | Relationship selector carries the full endpoint (deployment id + element part) | nested endpoints are otherwise unaddressable | ids only |
| D13 | Deployment-view references protected against every write of this feature (logical `removeElement` vs view references stays as today, lc4m-15.30) | views break silently on additions too | protect only on removal |
| D14 | Instance metadata patch accepted only when every patched key reads as requested afterwards; else rejected | LikeC4 cannot express an empty override; no silently ignored deletion | let inheritance return silently; reject every patch emptying the own map |

### Component boundaries
- **Deployment index** (new, read side): per workspace, built from all documents' `deployment` blocks in LikeC4 document order: nodes, instances, relationships, `extend <node>` blocks, by id; separate from the logical-model index, linked to it for `instanceOf` targets and for endpoints that step into elements.
- **Deployment resolver** (new): resolves a written reference text from a given position exactly as LikeC4 1.59.4 scopes deployment references (see "Integration points").
- **Deployment queries** (new, read API): build node / instance / relationship info with effective values and provenance.
- **Deployment writers** (new, write API): reuse the existing body-editing, style, metadata, tag, link, extend-stripping, insertion-layout and atomic multi-file apply mechanisms; deployment-specific parts are the declaration forms, the anchors of inline strings, file / block choice and the reference checks.
- **Reference-stability check** (extended): covers deployment references (US-12).
- **`apply`** (extended): new operations.
- **Test helper** (extended): exposes LikeC4's computed deployment model (data and getter layers).

### Data flow
Read: documents → deployment index (with logical index for `instanceOf`) → info objects with effective values. Write: validate form → resolve and check semantics against both indices → compute edits per file → apply all files atomically → rebuild indices → reference-stability check (roll back on change) → result.

### Key invariants
- **INV-1** An accepted write of this feature, and an accepted `addElement` / `removeElement` with respect to deployment references (US-12), introduces no LikeC4 error (introduced-only rule, as for existing writes): a file set that passed `likec4 validate` before passes after (checked in tests by `expectValidLikeC4`); errors already present before the write may remain.
- **INV-2** A rejected write changes no file and no in-memory state; the error names the offending field (`InvalidWriteError`), `apply` reports `mutations[i].<field>`.
- **INV-3** Every write addressing a node, instance, relationship or extend block resolves to exactly one target; zero or several → explicit error naming the selector (and candidates when several).
- **INV-4** Read values equal LikeC4 1.59.4's computed deployment model for every field listed in US-1…US-4, except the two documented exceptions: per-field summary / description (D2) and no icon-derived technology (D10).
- **INV-5** Writes produce only text LikeC4 reads: no inline description / technology on deployment relationships, no inline technology on nodes / instances, no string or style properties and no source-less relationships in `extend` bodies.
- **INV-6** Generic: no node kinds, tags, metadata keys or nesting depth are assumed; kinds and tags come from the loaded specification.
- **INV-7** Existing logical-model reads (`getElement`, `listElements`, `getRelationships`, `getSpecification` existing fields) return exactly what they return today.
- **INV-8** No accepted write of this feature changes the target that a surviving existing reference resolves to (logical and deployment references, `instanceOf`, `extend` targets, deployment view rules); references inside text the write removes on purpose (cascade) are not surviving. For the existing logical operations only the US-12 additions apply: `addElement` keeps its current checks plus deployment references; `removeElement` keeps its current behaviour towards view references (logical and deployment views, including `view … of X` targets) — that policy is lc4m-15.30.

### Integration points and contracts
| Surface | Contract |
|---|---|
| `getSpecification()` | additive: deployment node kinds listed; kind defaults retrievable like element kinds, with style |
| New read methods | list / get nodes, list / get instances, list deployment relationships (names fixed in the plan, documented in README) |
| New write methods | add / update / remove node, add / update / remove instance, add / update / remove deployment relationship, add / remove `extend <node>`; update returns `{ changedFiles }`, remove returns `{ removedRelationships }` like `removeElement` |
| `apply` | one operation per write method, same field names, same strict validation |
| `removeElement`, `addElement` | stricter (US-12): new rejections, documented as behaviour changes |
| LikeC4 deployment scoping (mirrored) | parentless name: deployment nodes first (container chain outward, `extend` frames, document scope, project root nodes), then instances; `this`/`it` bind the enclosing node or instance (inside an instance body: the enclosing node); qualified `a.b`: `b` among unique descendants of `a`, stepping into the element's model tree when `a` is an instance; `extend X`: strict path of direct child nodes; `instanceOf X`: element scope (document model scope + root elements) |

### Significant non-functional constraints
- Atomic in memory across files; edits keep formatting, comments and line endings as existing writers do.
- Reads are best effort on files with syntax errors (what the parser recovers).

### Rejected alternatives
- A single generic "element" abstraction for model elements and deployment nodes: LikeC4 itself keeps separate ids, scopes and inheritance rules; merging would leak deployment quirks into element reads (breaks INV-7).

## API / event surface (from code)

| Today | Change |
|---|---|
| `getSpecification()` → `elementKinds, tags, relationshipKinds` | + deployment node kinds |
| `getElement` / `listElements` / `getRelationships` | unchanged |
| `addElement` | + rejection when it re-targets a deployment reference |
| `removeElement` → `{ removedRelationships }` | + rejection when an `instanceOf` or deployment endpoint references the subtree |
| `apply` ops: addElement, updateElement, removeElement, addRelationship, updateRelationship, removeRelationship, addView | + deployment ops (US-13) |

## Data / entities / migrations
No persistent data; `.c4` text only. No migration. Reads gain new info types for nodes, instances and deployment relationships; style is reported in the existing style shapes (element style for nodes and instances, relationship style for relationships) so later stages can reuse them for elements and relations.

## Constraints
- Security: none beyond existing string escaping; DSL injection through string parameters is rejected by the stage-0a checks, extended to the new parameters.
- Performance: no numeric target; reads and writes stay linear in workspace size as today.
- Observability: n/a (library).

## Edge cases, failures, concurrency
- Several instances of one element in a node: unnamed + named, or two named → reads report each; a write that would create a second instance with the same id is rejected (INV-3, US-9).
- Instance named like a sibling node → duplicate id, rejected.
- Same root node name in two files → LikeC4 error; reads report both (best effort), writes addressing that id are rejected as ambiguous.
- Children declared inside `extend` bodies: ids are under the extended node; update / remove address them by id.
- Node with an empty title / a title equal to its name: read rules of US-2.
- Relationship whose endpoints do not resolve (in existing text): reads skip it like LikeC4 drops it.
- Source-less nested relationship: source = enclosing node or instance (enclosing node when written inside an instance body via `it`).
- `extend` of a node that does not exist (existing text, a LikeC4 error): contributes to no node and does not break reads.
- Syntax errors: reads best effort; tag / link / metadata updates rejected while any file has syntax errors; other writes allowed.
- Concurrency: n/a (single in-memory instance).

## Success criteria
- **SC-001** Every deployment-related row named in lc4m-15.28 "Coverage rows to update" has a non-`no` status in docs/likec4-coverage.md, or `n/a` with the grammar reason (extend of deployment relationships), and the coverage check passes.
- **SC-002** For each read scenario (US-1…US-4), and after each deployment write (US-5…US-11, including the surviving entities after a removal), the library's values equal LikeC4's computed model field by field, with the D2 / D10 exceptions accounted for (including an inherited icon-only technology example), in at least two unrelated fixtures (different kinds and metadata keys).
- **SC-003** Every successful deployment write in the test suite (and every successful `addElement` / `removeElement` touching deployment references) produces files that pass `expectValidLikeC4`.
- **SC-004** Each rejection class of US-6…US-12 has a test showing rejection with the field named and sources byte-identical; the `apply` path exits 1 and writes nothing.
- **SC-005** All pre-existing tests pass unchanged except tests that pinned the US-12 defects (rewritten to assert rejection).
- **SC-006** `npm run lint` and `npm test` pass; README documents read API, write API and `apply` format for deployment, the instance patch rules (D9) and the read exceptions (D2, D10); CHANGELOG lists additions and the US-12 behaviour changes.
- **SC-007** One minor release is prepared (version in package.json and docs/likec4-coverage.md, CHANGELOG entry) and is not pushed, tagged or published without the owner's explicit command.

## Clarifications
- Q: How are instances addressed? → A: by LikeC4 id; filter by element in reads (D1).
- Q: What are "effective" instance values? → A: LikeC4 getter semantics with provenance, per-field summary/description (D2).
- Q: Fix `removeElement` / `addElement` gaps here? → A: yes (D3).
- Q: Where does a new `deployment` block go? → A: optional `file` (D11); default rule D4.
- Q: Removing referenced nodes? → A: cascade relationships, reject when deployment views reference (D5).
- Q: Inline relation description / technology? → A: never written (D6).
- Q: Endpoints into an instance's nested element? → A: allowed when they resolve (D7).
- Q: Extend of relationships? → A: n/a (D8).
- Q: Does an instance patch act on own or effective values? → A: metadata on the effective map, the rest on own values (D9); a metadata patch whose patched keys cannot read as requested (empty override) is rejected (D14).
- Q: Icon-derived technology? → A: not applied, as for logical elements (D10).
- Q: Where may `file` be given? → A: root nodes, relationships, extend blocks; loaded files only (D11).
- Q: How are nested-element relationship endpoints selected? → A: full endpoint in the selector (D12).
- Q: Are deployment views protected against additions? → A: yes, against every write (D13).
- **Testing**: unit level only (vitest; `npm test`; integration / e2e / smoke / mutation not provided by the project). Oracles: `expectValidLikeC4` (likec4 validate 1.59.4 in-process) and LikeC4's computed model via `buildLikeC4Model`, extended to deployments.

## Open questions / [NEEDS CLARIFICATION]
None.

## Decomposition preview
1. Test helper: computed deployment model exposed.
2. Deployment index + resolver + specification kinds (read foundation).
3. Read API for nodes, instances, relationships (US-1…US-4).
4. Node and block writers (US-5…US-8).
5. Instance writers (US-9).
6. Relationship and extend writers (US-10, US-11).
7. Reference stability (US-12) and `apply` ops (US-13); docs, coverage, release.

## Known residuals
None yet.

## FOR-PLAN backlog
- Generalize the inline-string anchor (after `kind` / `name` / `target`) instead of forking title editing (RECON A3).
- `StrictFqnRef.value` reader for `extend <node>` targets (RECON A3).
- `checkKind` for deployment node kinds; `checkStyle` reuse for nodes / instances / relations.
- Reference-stability list must include `instanceOf`, deployment endpoints, `extend <node>` targets and deployment view rule references (RECON B4; D13); deployment views resolve both deployment and element candidates (RECON B4, LS:7609).
- An own metadata block left without attributes is removed (LikeC4 treats it as absent anyway, critique r2 probe); the D14 check runs on the effective map after the write.
