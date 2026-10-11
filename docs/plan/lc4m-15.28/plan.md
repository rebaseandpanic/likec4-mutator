# Plan: Read and edit the LikeC4 deployment model

**Date** 2026-10-12 · **Requirements source**: `docs/plan/lc4m-15.28/spec.md` · **Task**: lc4m-15.28

## Summary — main requirement by id + technical approach in one paragraph

The library will read and write the whole `deployment { }` model of LikeC4 1.59.4: node kinds, nodes, instances, deployment relationships and `extend <node>` blocks (US-1…US-11). Every write is also an `apply` operation (US-13). Two existing reference defects in `removeElement` and `addElement` are fixed (US-12, D3). Read values must equal LikeC4's computed model (INV-4), and no accepted write may introduce a `likec4 validate` error (INV-1).

Approach:
- **Oracle first.** The test helper is extended first, so that LikeC4's computed deployment model (data layer and getters, optionally without icon-derived technology) checks everything that follows.
- **Read side.** A new workspace-level `DeploymentIndex` and a `DeploymentResolver` mirror LikeC4's deployment scoping (RECON B3, LS:7575-7647). They are separate from `WorkspaceIndex`/`EndpointResolver`, but use `WorkspaceIndex` for `instanceOf` targets and for endpoints that step into an instance's element.
- **Read API.** New read methods on `LikeC4Mutator`, built from the existing readers (`readContribution`, `readDeclared`, `mergeContributions`, `readKindSpec`) plus a new structured style reader. `C4Query` and the logical reads stay byte-for-byte unchanged (INV-7).
- **Write side.** New writers in a new `src/mutator/deployment-ops.ts` reuse the existing body editing code: `BodyInsertions`, the tag/link/metadata/style builders, `clearExtendContributionsEdits`, `buildRemovalEdit`, `applyEditGroups`, snapshot/restore. Two seams are generalized instead of forked:
  - the inline-string anchor of element declarations (RECON A3);
  - the patch half of `updateRelationshipEdit`.
- **Reference stability (INV-8, D13).** It becomes a keyed snapshot over logical and deployment references: `instanceOf`, endpoints, `extend` targets and deployment-view rule references.
- **`apply`.** It gains 11 ops under the existing `MUTATION_FIELDS` exhaustiveness check.

## Technical context — repositories, language and versions, affected contracts

- **Repository:** `likec4-mutator` (public; one repository, one stream). It is TypeScript (`typescript ^7.0.2`, ESM), built with `tsdown`, tested with `vitest ^5`, and runs on Node ≥ 22.22.3.
- **Runtime dependencies:** `@likec4/language-server` / `@likec4/core` 1.59.4 (standalone `LangiumParser`, no linking), `commander`. **No new dependency.**
- **Tests:** unit only (`npm test`; a focused run is `npx vitest run --maxWorkers=2 <files>`). `npm run lint` = `tsc --noEmit` + `tsc -p scripts` + `scripts/grammar-rules.ts --check docs/likec4-coverage.md`. The oracles are in `tests/helpers/likec4-model.ts`.
- **Affected contracts:**
  - `LikeC4Mutator`: new read and write methods. `getSpecification()` gains an additive field. `addElement` and `removeElement` gain rejections (US-12).
  - `src/index.ts` exports new types.
  - The `apply` mutations file gains 11 ops.
  - Docs: README, CHANGELOG, `docs/likec4-coverage.md`.
- **Unchanged:** `C4Query` (per-file), `getElement`, `listElements`, `getRelationships`, `getElementSource`, `ElementInfo`, `RelationshipInfo`, `KindDefaults` (INV-7).
- **Code facts this plan relies on (verified in the source):**
  - `parseElementStyle` reads the first `style {}` block, and a body-level `icon` property overrides `style.icon` (LS:5329-5341).
  - `toDeploymentElement` merges kind style with own style (LS:3266-3299).
  - `toDeploymentRelation` spreads the relationship kind spec, style included (LS:3301-3325).
  - Element and dynamic view bodies count as "model" for scoping (`_isModel`, LS:167-169), so deployment additions cannot change element-view references. Only deployment view bodies resolve deployment candidates first and elements third (LS:7600-7612).
  - `extend X` resolves through `getScopeForStrictFqnRef`: project root nodes first, then direct child nodes (LS:7575-7579).
  - The project config `inferTechnologyFromIcon` reaches `MergedSpecification` (LS:3486), so the oracle can be built without icon inference (D10).

## Invariant check (gate before decomposition) — the guideline is canonical, the checklist only reminds

- [x] CLAUDE_DEV_GUIDELINES, CLAUDE_TEST_GUIDELINES and the stack guideline read. There is no TypeScript stack guideline; the testing section of the project instructions (local CLAUDE.md) is binding: unit only, oracle `expectValidLikeC4`, no code-reading checks beyond the approved coverage check.
- [x] Business errors → 422: n/a for a library. The equivalent is `InvalidWriteError(field, detail)`, used for every rejected write, selector miss and ambiguity (INV-2, INV-3). `apply` maps it to `mutations[i].<field>` and exit 1. Env without silent fallbacks: n/a (the library reads no environment).
- [x] DB + external call → Transactional Outbox: n/a (no DB, no external calls; in-memory text only).
- [x] API changes → documentation in the same commit. Every task that adds or changes a public method also adds its JSDoc and its README subsection in that commit; the Polish tasks only consolidate cross-cutting sections. Metrics: n/a.
- [x] Logs per standard, no secret leaks: n/a (the library does not log; the CLI prints result lines only, no secrets handled).

## Key design decisions (+ ADR refs)

| Decision | Why | Rejected |
|---|---|---|
| Public read API on `LikeC4Mutator`: `getDeploymentNodeKind(kind)`, `getDeploymentNode(id)`, `listDeploymentNodes({ kind?, parentId? })`, `getDeploymentInstance(id)`, `listDeploymentInstances({ nodeId?, element? })`, `listDeploymentRelationships({ source?, target?, kind? })` (spec: "names fixed in the plan") | Ids span files, so reads are workspace-level like the `WorkspaceIndex`; one addressing scheme (D1) | Methods on `C4Query` (per-file; would change the existing reader's surface, INV-7) |
| Public write API: `addDeploymentNode(parentId \| null, opts)` → id; `updateDeploymentNode(id, patch)` → `{ changedFiles }`; `removeDeploymentNode(id)` → `{ removedRelationships }`; `addDeploymentInstance(nodeId, opts)` → id; `updateDeploymentInstance(id, patch)` → `{ changedFiles }`; `removeDeploymentInstance(id)` → `{ removedRelationships }`; `addDeploymentRelationship(source, target, opts)`; `updateDeploymentRelationship(selector, patch)` → `{ changedFiles }`; `removeDeploymentRelationship(selector)`; `addDeploymentExtend(nodeId, { file, tags?, links?, metadata? })`; `removeDeploymentExtend({ node, file, occurrence? })` → `{ removedRelationships }` | Spec integration contract; a removal result lists endpoints as `{ id, element? }` (D12 shape) | Reusing `addRelationship` / `updateRelationship` with a flag (mixes the two models, breaks INV-7) |
| `getSpecification()` gains `deploymentNodeKinds`, **present only when at least one deployment kind is declared**; null only when all four lists are empty. `C4Query.getSpecification()` is unchanged; the field is filled from the index | Keeps every existing `toEqual` on `getSpecification()` identical (INV-7) while being additive | Always-present `deploymentNodeKinds: []` (changes existing outputs) |
| `DeploymentNodeKindDefaults = KindDefaults & { style?: ElementStyle }`. Relationship-kind style is kept internally on `KindSpec.style` and exposed only through deployment relationship `fromSpecification` (`KindDefaults & { style?: RelationshipStyle }`) | `KindDefaults` is part of `ElementInfo.fromSpecification`; adding `style` there changes logical reads (INV-7) | A `style` field on `KindDefaults` |
| Style is reported in the existing shapes (`ElementStyle` / `RelationshipStyle`): first `style {}` block, last value of a repeated field, body-level `icon` overrides `style.icon`, opacity as written (`'40%'`), **no theme defaults**; effective = kind/element style overridden per field by own (spec US-2, US-3) | Equals LikeC4's data layer (LS:5329, 3289); theme defaults are presentation, not model | Getter style (adds shape/color/opacity/size defaults) |
| Not-found and ambiguous selectors of the new ops throw `InvalidWriteError` with the selector field (`id`, `parentId`→`parent`, `nodeId`→`node`, `source`/`target`, `node`/`file`/`occurrence`), naming candidates when several | INV-2/INV-3 require the field; `apply` gets `mutations[i].<field>` for free | Plain `Error` as in the legacy ops |
| Reference stability: a keyed snapshot. Key = (file, scope path of enclosing named containers and top-level block index, role, reference text). Before/after comparison runs after every write that adds or removes a name: `addElement`, `addDeploymentNode`, `addDeploymentInstance`, `removeDeploymentNode`, `removeDeploymentInstance`, `removeDeploymentExtend`. A change rolls back and throws on `name` (adds) or `id` / `node` (removals) | Same text in the same container resolves identically, so the key survives appends and cascade deletions; removals can re-target survivors by making a name unique (INV-8). Replaces the current equal-length positional comparison (`rejectChangedReferences`, mutator.ts:932-955), which a new `instanceOf` reference would break | Offset remapping through edits (not stable under `BodyInsertions.rewriteBlock`); checking additions only |
| `instanceOf` targets resolve with the element scope of `resolveReferenceText(…, 'views')`, gated by an oracle test in every deployment position | LS:7601: no deployment container contributes elements (RECON A3 ASSUMPTION, made a tested gate) | A separate element resolver |
| Deployment titles are written with the plain string escape; the slash form (`escapeTitle`) is used only if the oracle test shows LikeC4 unescapes `\/` in deployment titles | No implicit views exist for deployment nodes; must read back as written | Copying the element title rule untested |
| `style.icon` on node/instance update is written where LikeC4 reads it: into the body-level `icon` property when the body has one, else into the style block | LS:5333-5336: a body `icon` overrides `style.icon`, so otherwise the write would not read back | Always writing into `style {}` |
| `addDeploymentExtend` requires at least one of tags / links / metadata | An extend with nothing contributes nothing (LS:5511-5518); mirrors `updateRelationship`'s "at least one field" rule | Writing empty `extend X { }` |
| `updateDeploymentRelationship` writes description / technology in the body only and leaves existing inline ones (ignored by LikeC4) untouched | D6 / INV-5; touches no text it does not need to | Deleting ignored inline strings (an unrequested edit) |
| `apply` op fields equal the library option names (`name`, not `id`; `parent` optional for root nodes; endpoint selectors as `{ id, element? }`) | US-13 "same fields"; the `addElement`→`id` mapping in `mutationFieldPath` stays legacy-only | Copying the `addElement` naming quirk |
| Deployment write orchestration lives in a new `src/mutator/deployment-ops.ts` (edit builders over documents and indices); `LikeC4Mutator` keeps thin public methods that use its private snapshot / `applyEditGroups` / `rebuildQueries` | `mutator.ts` is already 1134 lines; keeps one atomic-apply path | A second mutator class (forks atomic apply) |
| Release version 0.9.0 (minor; the spec's US-12 rejections are behaviour changes listed in CHANGELOG) | SC-007 "one minor release" | 1.0.0 |

No `[DECISION-NEEDED]`.

## Complexity Tracking

| Introduced complexity | Why it is needed | Simpler alternative rejected because |
|---|---|---|
| A second resolver (`DeploymentResolver`) beside `EndpointResolver` | LikeC4 uses a different index, two-pass node→instance order, instance→element descent and extend frames (RECON A3, B3) | Extending `EndpointResolver` in place would mix two indices and risk INV-7 |
| Keyed reference snapshot | INV-8 / D13 over additions and removals | The positional list breaks as soon as a write adds a reference (`instanceOf`) or removes text |

No new dependency.

## Decomposition by phases

### Phase Setup

- **T001 [TEST]** — `tests/fixtures/deployment-zones/` and `tests/fixtures/deployment-clusters/` (new; each holds `spec.c4`, `model.c4`, `deployment.c4`, `ext/*.c4`).
  - Mechanism: two neutral, unrelated multi-file workspaces with different node kinds, tags and metadata keys (INV-6, SC-002). Each covers:
    - both node forms, at least 3 levels;
    - named and unnamed instances, and two named instances of one element;
    - every connector form;
    - nested and source-less relations;
    - an endpoint into an instance's element;
    - an `extend` in another file with tags, links, metadata and a child;
    - kind defaults with style, an element with an icon only;
    - a deployment view with include, exclude and style rules.
  - Gate: both pass `expectValidLikeC4` (asserted in T002's test file).

### Phase Foundational (BLOCKING) — shared foundation and contracts

**T002 [TEST]** — `tests/helpers/likec4-model.ts`, `tests/likec4-validate-oracle.test.ts`. Mechanism: the computed deployment model in the oracle.
- `buildLikeC4Model` returns `deployments` with `elements` and `relations` (`$data.deployments`) and `specification` (`$data.specification.deployments`), plus a getter snapshot per deployment id (`model.deployment.element(id)`).
- `LikeC4ProjectOptions` gains `inferTechnologyFromIcon`.
- New comparison helpers: `expectDeploymentNodesAgreeWithLikeC4`, `expectDeploymentInstancesAgreeWithLikeC4`, `expectDeploymentRelationshipsAgreeWithLikeC4`. They encode the two documented exceptions:
  - D2: instance summary and description per field, own else element, from the data layer;
  - D10: the reference is built with `inferTechnologyFromIcon: false`.
- Style is compared on the data layer: node `$data` style; instance = element `$data` style overridden per field by instance `$data` style; opacity number ↔ `'N%'`.
- Gate:
  - the oracle test reproduces literal values recorded in spikes 02 and 06 (independent reference);
  - T001 fixtures validate clean;
  - the existing oracle tests are unchanged and green.

**T003** — `src/query/types.ts`, `src/index.ts`. Mechanism: the public read contract.
- `DeploymentNodeInfo` (id, name, kind, parentId, effective strings, tags, links, metadata, style, fromSpecification, declared, extendedBy, children, instances, file, sourceRange).
- `DeploymentInstanceInfo` (id, name, parentId, element, effective values, style, declared, file, sourceRange).
- `DeploymentEndpoint { id; element? }`.
- `DeploymentRelationshipInfo` (source, target, kind, bidirectional, effective values, style, fromSpecification, declared, file, sourceRange).
- `DeploymentNodeKindDefaults`, the optional `SpecificationInfo.deploymentNodeKinds`; exports.
- Gate: `tsc --noEmit`; no change to existing type members.

**T004** — `src/query/fqn.ts`, `src/query/kind-specs.ts`, `src/query/workspace-index.ts`. Mechanism: generalized readers (FOR-PLAN 2).
- `readStrictFqnRef` reads `.el` or `.value` segments (`StrictFqnElementRef` and `StrictFqnRef`).
- `specificationKinds` also returns `deploymentNodes`.
- `readKindSpec` captures `style` into `KindSpec.style` (not into `defaults`).
- `WorkspaceIndex.deploymentNodeKind(kind)` uses the element-kind last-wins rule (LS:3184-3190).
- `WorkspaceDocumentAst` gains `deployments`.
- Gate: full existing suite green unchanged (INV-7 guard); smoke on spike 07 B values.

**T005** — `src/query/style-read.ts` (new). Mechanism: the structured style reader.
- `readElementStyle(props)`: first `ElementStyleProperty`, body `IconProperty` override, value forms as written.
- `readRelationshipStyle(props)` and the kind-spec form (relationship kind style properties sit directly in `props`).
- `mergeStyle(base, own)` per field.
- Gate: smoke against spike 06 data-layer styles.

**T006** — `src/query/deployment-index.ts` (new), `src/query/workspace-index.ts` (export the merge order), `src/mutator/mutator.ts` (`rebuildQueries` builds it beside `WorkspaceIndex`). Mechanism: `DeploymentIndex`.
- Walks `ast.deployments` of every document in LikeC4 document order. Collects:
  - nodes and instances by id with declaration counts (duplicates), parent and children, extend-body children under the extended node;
  - implicit instance name = last segment of the written `instanceOf`;
  - `extend <node>` blocks by target id in merge order;
  - root nodes per document and per project;
  - relations with their container frames;
  - deployment views per document.
- Gate: smoke on T001 fixtures (ids and children equal LikeC4 `$data.deployments` keys).

**T007** — `src/query/deployment-resolver.ts` (new). Mechanism: `DeploymentResolver`, mirroring LS:7460-7487 and 7575-7647.
- Container local scopes (named children plus unique deeper names, not shadowed).
- `this` / `it`: the enclosing node; inside an instance body, the enclosing node.
- Source-less source: the enclosing node or instance.
- Extend frames: the extended node by name plus its unique descendants, unfiltered as LikeC4 does.
- Document scope, then project root nodes.
- Two passes: node candidates before instance candidates.
- Qualified segments: unique descendants of a node; through an instance into its element's model tree via `WorkspaceIndex.uniqueDescendants`, giving `{ deployment, element }`.
- `extend X`: strict path (project root nodes, then direct child nodes).
- `instanceOf`: element scope.
- Deployment-view references: every topmost `FqnRef` under a `DeploymentViewBody`; parentless passes are nodes, instances, then elements.
- Gate: covered by T008.

**T008 [TEST]** — `tests/query/deployment-resolution.test.ts`. Mechanism: the resolver against the oracle.
- Spike 04 cases A–H, spike 03 #10, #11, #13, #14, #15, #24, #37.
- `instanceOf` short and qualified names in node, extend and nested positions (closes the RECON A3 ASSUMPTION).
- Deployment-view references.
- Each compared with LikeC4 `$data.deployments.relations` endpoints.
- Gate: the class "every endpoint and `instanceOf` resolution equals LikeC4" is green.

### Phase — US-1…US-4 — Read API (MVP)

**T009** — `src/mutator/mutator.ts`, README "Deployment model › Reading" (spec part). Mechanism: `getSpecification().deploymentNodeKinds` (from the index, optional field) and `getDeploymentNodeKind(kind)` returning `DeploymentNodeKindDefaults` with file, sourceRange and style. Gate: smoke; `C4Query` untouched.

**T010** — `src/query/deployment-query.ts` (new), `src/mutator/mutator.ts`, README. Mechanism: node info builder, US-2 rules.
- Own values override kind defaults; own links replace kind links.
- `''` title kept; a title equal to the name becomes the kind title.
- Tags: own (else kind) + extend tags, then kind tags appended (getter).
- `mergeContributions` with the extend blocks.
- Style: kind then own.
- `declared`, `extendedBy` with file; children and instances; `getDeploymentNode` / `listDeploymentNodes({ kind, parentId })`.
- Gate: smoke against the T002 helper on T001 fixtures.

**T011** — `src/query/deployment-query.ts`, `src/mutator/mutator.ts`, README. Mechanism: instance info builder (US-3).
- Own else element (from the library's logical element values, so D10 holds): title (`''` kept), technology, links, and metadata (the whole map replaced).
- Per-field summary and description (D2).
- Tags: own then element, unique.
- Style: element (kind + own + body icon) then instance per field.
- `getDeploymentInstance` / `listDeploymentInstances({ nodeId, element })`.
- Gate: smoke against the helper.

**T012** — `src/query/deployment-query.ts`, `src/mutator/mutator.ts`, README. Mechanism: deployment relationship info builder (US-4).
- Endpoints `{ id, element? }`; source-less source.
- Kind from `-[k]->` or `.k`; bidirectional flag.
- Inline description and technology ignored; line tags win over body tags; kind tags prepended; kind title, description, technology and style applied when own is absent.
- Unresolved endpoints are skipped.
- `listDeploymentRelationships({ source, target, kind })`: an id filter also matches endpoints stepping into that instance's element.
- `getRelationships()` is unchanged.
- Gate: smoke against the helper.

**T013 [TEST]** — `tests/query/deployment-specification-read.test.ts`. Mechanism: US-1 kinds and defaults with multi-file last-wins. INV-7 guard: on T001 fixtures `getSpecification()` existing fields, `getRelationships()`, `getElement`, `listElements` equal values computed from the fixture's logical part alone. Gate: class green.

**T014 [TEST]** — `tests/query/deployment-nodes-read.test.ts`. Mechanism: US-2 acceptance on both fixtures, equal to the oracle (SC-002), including the edge cases of spec "Edge cases" (empty title, self-named title, extend of a missing node, duplicate root). Gate: class green.

**T015 [TEST]** — `tests/query/deployment-instances-read.test.ts`. Mechanism: US-3 on both fixtures, including the D2 cross-fallback case and the D10 icon-only element case (compared with `inferTechnologyFromIcon: false`, and shown to differ from the default getter). Gate: class green.

**T016 [TEST]** — `tests/query/deployment-relationships-read.test.ts`. Mechanism: US-4, all connector forms, nested and source-less, extend bodies, element-part endpoints, filters. Gate: class green.

### Phase — US-12 — Reference stability (bugfix)

**T017** — `src/query/workspace-index.ts` (`resolveDocumentReferences` gains deployment references from the resolver), `src/mutator/mutator.ts` (`referenceResolutions` / `rejectChangedReferences` become the keyed snapshot). Mechanism: keyed reference snapshot (D13, INV-8, FOR-PLAN 4).
- References covered: `instanceOf` targets, deployment endpoints including element parts, `extend <node>` targets, deployment-view rule references.
- `addElement` gains the deployment check, with its messages and field `name` unchanged.
- Gate: existing `add-element-references` tests green; spike 07 D is now rejected (smoke).

**T018** — `src/mutator/mutator.ts`. Mechanism: `removeElement` pre-check. It is rejected (field `fqn`, listing instance ids or endpoints) when the element or any element of its subtree is an `instanceOf` target or an endpoint element part. Nothing else in `removeElement` changes. Gate: spike 07 C rejected with sources byte-identical (smoke).

**T019 [TEST]** — `tests/mutator/deployment-reference-stability.test.ts`. Mechanism:
- US-12 rejection classes (removal: `instanceOf` and element-part endpoint; addition: ambiguous, unresolved, re-targeted; a deployment view rule made ambiguous) with sources byte-identical.
- Accepted neighbouring writes pass `expectValidLikeC4`.
- Gate includes a search of the existing tests for any pinning the US-12 defects; any found is rewritten to assert rejection (SC-005).

### Phase Foundational (write side, BLOCKING for US-5…US-11)

**T020** — `src/mutator/codegen.ts`. Mechanism: shared body-line builder extracted from `generateElement` (byte-identical output), plus:
- `generateDeploymentNode`: `name = kind`, inline title written whenever defined (including `''`), summary, description and technology in the body;
- `generateDeployedInstance`;
- `generateDeploymentRelationship`: connector `->`, `<->`, `-[k]->`, `-[k]<->`; title inline; description and technology body-only (INV-5, D6);
- `generateDeploymentExtend`: tags, links, metadata only.
- Gate: `tests/mutator/codegen.test.ts` green unchanged; each snippet parses (smoke).

**T021** — `src/mutator/element-ops.ts`, `src/mutator/cst-helpers.ts`. Mechanism: generalized inline-string anchor (FOR-PLAN 1, RECON A3).
- `buildTitleEdits` and the inline summary/technology editor take an `InlineAnchor` (offset after which inline strings start, which positions exist, which escape to use).
- Anchors: element = kind ref; node `kind name` = name token; node `name = kind` = kind ref; instance = end of target.
- `updateElementEdit` becomes lookup + exported `updateDeclarationEdits(node, doc, patch, anchor)`; `buildReplaceTagsEdit` is exported.
- The `clearExtendContributionsEdits` node type accepts `ExtendDeployment`.
- The `style.icon` placement rule (body `icon` when present) is behind a flag used only by deployment callers.
- Gate: all existing element and extend tests green unchanged.

**T022** — `src/mutator/relationship-ops.ts`. Mechanism: `updateRelationshipEdit` split into model matching + exported `relationPatchEdits(rel, fullText, patch, { inlineStrings: 'rewrite' | 'body-only' })`, reusing `buildLabelEdit` for the title. Gate: all existing relationship tests green unchanged.

**T023** — `src/mutator/write-checks.ts`. Mechanism:
- `checkKind(kind, 'deploymentNode', ws)` via `WorkspaceIndex.deploymentNodeKind` (FOR-PLAN 3);
- `checkFile(file, loadedFiles)` → `InvalidWriteError('file')` (D11);
- `checkStyle` reused unchanged for nodes and instances (`'element'`) and relationships (`'relationship'`).
- Gate: `tests/mutator/write-value-checks.test.ts` green; smoke for the new kinds.

**T024** — `src/mutator/deployment-ops.ts` (new). Mechanism: block and file placement (D4, D11). The target is the first `deployment` block of the chosen file; else the first file in LikeC4 document order that has one; else a new block appended at the end of the chosen file, else the first file with a `model` block, else the first file; with no file, reject. Insertion uses `BodyInsertions.forBlock` or a new-block edit with the file's line ending. Gate: smoke on files with and without blocks and with CRLF.

### Phase — US-5…US-8 — Nodes

**T025** — `src/mutator/deployment-ops.ts`, `src/mutator/mutator.ts`, README. Mechanism: `addDeploymentNode`.
- Value checks: name (`checkElementName`), kind, tags, style, file allowed only for a root node (D11).
- Parent: must resolve to exactly one node declaration (instance or missing → `parent`; duplicate declaration → ambiguity).
- Duplicate id anywhere, extend children included (`name`).
- Written into the parent's declaration body (bodyless → combined body snippet) or by T024 placement.
- Keyed stability check.
- Gate: smoke; the write passes `expectValidLikeC4`.

**T026** — same files + README. Mechanism: `updateDeploymentNode` via `updateDeclarationEdits` with the node anchor. Strings REPLACE every declaration; tags and links REPLACE; metadata MERGE with `null`; style MERGE; patched tags, links and metadata keys are stripped from every `extend` of exactly this id in every file; syntax-error rejection for tags, links and metadata; `changedFiles`. Gate: smoke and oracle values after the write.

**T027** — same files + README. Mechanism: `removeDeploymentNode`.
- Pre-check: deployment-view references resolving into the subtree reject (field `id`, listing them) (D5).
- Then, one at a time: relationships outside removed ranges whose endpoint is in the subtree; every `extend` targeting the subtree; the declaration.
- `removedRelationships` lists endpoints and titles; keyed stability check for survivors; atomic.
- Gate: smoke; survivors equal the oracle.

**T028 [TEST]** — `tests/mutator/deployment-nodes-add.test.ts`. Mechanism: US-5 (all file rules, unknown-file rejection, `file` on a child rejected) and US-6 values and rejection classes on both fixtures; outputs pass `expectValidLikeC4`; values equal the oracle. Gate: class green.

**T029 [TEST]** — `tests/mutator/deployment-nodes-update-remove.test.ts`. Mechanism: US-7 (both forms, extend stripping, syntax-error rejection) and US-8 (cascade, view rejection, extend-body children); survivors equal the oracle; rejections leave sources byte-identical. Gate: class green.

### Phase — US-9 — Instances

**T030** — `src/mutator/deployment-ops.ts`, `src/mutator/mutator.ts`, README. Mechanism: `addDeploymentInstance`.
- `element` checked with `checkReferenceForm` and resolved with the `instanceOf` scope from the node body (`element`).
- The implicit id must be free, otherwise the call is rejected with a request for `name`.
- Duplicate id; node must be a node (`node`); tags and style checks; no `file` (D11).
- Keyed stability check (D13 view example).
- Gate: smoke and oracle.

**T031** — same files + README (D9 examples). Mechanism: `updateDeploymentInstance`.
- Strings, tags and links on own values; style MERGE into own.
- Metadata on the effective map: when the instance has no own map, the element's keys are copied into the own block first, then the patch is applied with `null` deletion; an emptied own block is removed (FOR-PLAN 5).
- After applying, the D14 check reads the instance back; a patched key that does not read as requested rolls back and throws `metadata.<key>`.
- The target element and extend blocks are never touched.
- Gate: smoke on spec example `{ tier }` / `{ region }`.

**T032** — same files + README. Mechanism: `removeDeploymentInstance`. Removes the instance, its nested relationships, and every relationship whose endpoint is the instance or an element inside it. Rejected (`id`) when a deployment view references it; keyed stability check. Gate: smoke.

**T033 [TEST]** — `tests/mutator/deployment-instances-write.test.ts`. Mechanism: US-9 acceptance and every rejection class (D14 rejections included), two fixtures, oracle values after each write, `expectValidLikeC4`. Gate: class green.

### Phase — US-10, US-11 — Deployment relationships and extend blocks

**T034** — `src/mutator/deployment-ops.ts`, `src/mutator/mutator.ts`, README. Mechanism: `addDeploymentRelationship`.
- Written at the top level of the T024 block (`file` allowed).
- Endpoints in reference form, resolved from the insertion point by `DeploymentResolver`; model-only FQNs and unresolved endpoints are rejected (D7).
- `isSameHierarchy` on the deployment parts is rejected (`target`); kind (`checkKind` relationship), tags and style checks.
- Description and technology go into the body (D6).
- Gate: smoke and oracle.

**T035** — same files + README. Mechanism: deployment relationship selector + `updateDeploymentRelationship`.
- Selector `{ source: { id, element? }, target: { id, element? }, kind?, title? }`; a bidirectional relationship matches in either order; zero matches or ambiguity → `InvalidWriteError` naming candidates (D12, INV-3).
- Patch through `relationPatchEdits('body-only')`; line tags replaced where present; `changedFiles`.
- Gate: smoke and oracle.

**T036** — same files + README. Mechanism: `removeDeploymentRelationship` with the same selector, using `buildRemovalEdit`. Gate: smoke.

**T037 [TEST]** — `tests/mutator/deployment-relationships-write.test.ts`. Mechanism: US-10 add, update, remove, every connector the API writes, element-part endpoints, ambiguity and rejection classes, two fixtures, oracle and `expectValidLikeC4`. Gate: class green.

**T038** — same files + README. Mechanism:
- `addDeploymentExtend(nodeId, { file, … })`: written into a `deployment` block of `file`, created if needed; target written as the node id path; an instance target is rejected (`node`, "ExtendDeployment allows only DeploymentNode"); at least one contribution required.
- `removeDeploymentExtend({ node, file, occurrence? })`: 1-based occurrence, ambiguity error; children inside follow the T027 rules (view rejection, relationship cascade, stability check).
- Gate: smoke and oracle.

**T039 [TEST]** — `tests/mutator/deployment-extends-write.test.ts`. Mechanism: US-11 acceptance, `extendedBy` provenance after the write, occurrence selection and ambiguity, removal with children, instance target rejected, no string or style properties written (INV-5). Gate: class green.

### Phase — US-13 — `apply`

**T040** — `src/mutations-file.ts`. Mechanism: 11 op interfaces (`addDeploymentNode`, `updateDeploymentNode`, `removeDeploymentNode`, `addDeploymentInstance`, `updateDeploymentInstance`, `removeDeploymentInstance`, `addDeploymentRelationship`, `updateDeploymentRelationship`, `removeDeploymentRelationship`, `addDeploymentExtend`, `removeDeploymentExtend`), each with:
- its `MUTATION_FIELDS` entry under the existing `satisfies` + `FieldsNotListed` exhaustiveness check;
- validators for optional `parent`, `file`, `bidirectional` (boolean), endpoint selector objects (`rejectUnknownFields` on `{ id, element }`), `occurrence` (positive integer);
- `formChecks` reusing the library checks; at least one patch field for updates.
- Gate: `tsc` (exhaustiveness); smoke on one file per op.

**T041** — `src/cli.ts`. Mechanism: `applyMutation` dispatch cases for the 11 ops (exhaustive `assertNever`), result lines, the same `InvalidWriteError` → `mutations[i].<field>` path. Gate: smoke via `npx tsx src/cli.ts apply`.

**T042 [TEST]** — `tests/cli/cli-apply-deployment.test.ts`. Mechanism: each op succeeds on a fixture copy (output passes `expectValidLikeC4`); unknown fields, wrong types and a library rejection exit 1 with `mutations[i].<path>` and write nothing. Gate: class green.

### Phase Polish

- **T043** — `README.md`. Mechanism: consolidated "Deployment model" section (read API, write API, `apply` format, D9/D14 instance metadata examples, D2/D10 read exceptions, file and placement rule D4/D11); "Rejected writes" table rows for the new ops; the US-12 behaviour changes in the `addElement` / `removeElement` text. Gate: examples executed in a smoke script against the library give the stated values.
- **T044** — `docs/likec4-coverage.md`. Mechanism: the rows listed in the Skein issue "Coverage rows to update" set to non-`no` with notes; `extend` of deployment relationships recorded as `n/a` with the grammar reason; no fingerprint update needed unless `--check` reports one. Gate: `npm run lint` passes (SC-001).
- **T045** — `CHANGELOG.md`. Mechanism: `[0.9.0]` entry with Added (read and write API, `apply` ops, `getSpecification().deploymentNodeKinds`) and Breaking / behaviour changes (US-12 rejections, `getSpecification()` non-null for deployment-only specifications). Gate: entry matches README.
- **T046** — `package.json`, `package-lock.json`, `docs/likec4-coverage.md` title line. Mechanism: version 0.9.0 in one commit (the coverage check ties both). Not pushed, tagged or published. Gate: `npm run lint && npm test && npm run build` green (SC-006, SC-007).

## Streams and groups (MANDATORY — input of the task tree)

| Stream | Repository (exactly one) | Group | Tasks in order | Group rationale |
|---|---|---|---|---|
| S1 | likec4-mutator | G1 Oracle | T001, T002 | Small on purpose: the fixtures and the computed-model oracle must be reviewed before any code depends on them |
| S1 | likec4-mutator | G2 Read foundation | T003, T004, T005, T006, T007, T008 | One layer: types, readers, index, resolver and its oracle tests |
| S1 | likec4-mutator | G3 Read API | T009, T010, T011, T012, T013, T014, T015, T016 | US-1…US-4 builders and their tests; the MVP |
| S1 | likec4-mutator | G4 Reference stability | T017, T018, T019 | Small on purpose: a behaviour-changing bugfix of existing public ops (US-12), reviewed in isolation; it also blocks every name-adding write |
| S1 | likec4-mutator | G5 Write foundation | T020, T021, T022, T023, T024 | Shared write seams (codegen, anchor, relation patch, checks, placement); each refactor guarded by the unchanged suite |
| S1 | likec4-mutator | G6 Nodes | T025, T026, T027, T028, T029 | US-5…US-8 |
| S1 | likec4-mutator | G7 Instances | T030, T031, T032, T033 | US-9 including D9/D14 |
| S1 | likec4-mutator | G8 Relationships and extends | T034, T035, T036, T037, T038, T039 | US-10, US-11 share the selector, placement and cascade code |
| S1 | likec4-mutator | G9 Apply | T040, T041, T042 | US-13 over the finished library surface |
| S1 | likec4-mutator | G10 Docs and release | T043, T044, T045, T046 | Cross-cutting docs and release prep |

## Dependencies and build order — who waits for what

- T001 → T002 → every `[TEST]` task (oracle).
- T003 → T009–T012. T004, T005 → T010–T012, T020. T006 → T007 → T008, T010–T012, T017.
- T009–T012 → T013–T016 (STOP: MVP).
- T007, T012 → T017 → T018 → T019. T017 blocks T025, T027, T030, T032, T038 (stability check).
- T020–T024 block G6–G8. T021 → T026, T031. T022 → T035. T023 → T025, T030, T034, T038. T024 → T025, T034, T038.
- G6 → G7 (instances live in nodes; removal cascade shared) → G8 (endpoints need instances; extend removal reuses T027).
- All library ops (G6–G8) → G9. G9 → G10. T046 is last.
- Strictly sequential, one executor; full `npm test` + `npm run lint` at the end of every group.

## Delivery strategy — MVP-first, STOP & VALIDATE points

1. **MVP = G1–G3** (read-only deployment model). STOP & VALIDATE: SC-002 read part green on both fixtures; INV-7 guard green; `npm run lint` green.
2. **G4** (US-12). STOP: spike 07 C/D rejected; SC-005 confirmed (the pre-existing suite passes, any pinned defect rewritten).
3. **G5**. STOP: whole pre-existing suite green unchanged (refactors are behaviour-neutral).
4. **G6 → G7 → G8**, each ending with STOP: oracle values after each write, `expectValidLikeC4` on every output, rejection classes with byte-identical sources (SC-002, SC-003, SC-004).
5. **G9**. STOP: `apply` exit 1 and nothing written on every error path (SC-004).
6. **G10**. STOP: `npm run lint && npm test && npm run build`. The release is prepared but not pushed, tagged or published (SC-007).

## Risks and rollback — 3–7 lines

- Scope-mirror drift (`DeploymentResolver` vs LS:7575-7647, including the unfiltered extend frame and the two-pass order). Every resolution class is compared with the oracle in T008 before any writer uses it.
- Inline anchors for the `kind name` node form and for instances (no kind ref) may mis-target strings. T021 keeps elements byte-identical; node and instance titles and summaries are oracle-checked in T029/T033.
- Text that does not read back as written: a body `icon` overriding `style.icon`, and the title escape of deployment titles. Mitigation: the placement rule in T021, the escape decision gated by an oracle test, read-back after every write in tests.
- The keyed reference snapshot could miss a re-targeting when two references with equal text sit in one container but different scopes. The key includes the full container path, so equal key implies equal resolution inputs; T019 exercises removal-uniqueness cases.
- Rollback: each group is a contiguous series of atomic commits on the working branch. Nothing is pushed; a failing group is reverted with `git revert` of its commits without touching earlier groups.

## Known residuals

- `removeElement` does not check whether a removal makes a surviving reference re-target by gaining uniqueness (logical or deployment). This is pre-existing behaviour, kept by INV-8 / scope; it belongs to the general reference policy, lc4m-15.30.
- `updateDeploymentRelationship` leaves inline description / technology that LikeC4 ignores on existing relation lines as written (no read effect; INV-5 concerns written text only).

## Spec traceability — every spec id → task(s)

| Spec id | Tasks |
|---|---|
| US-1 | T004, T009, T013 |
| US-2 | T005, T006, T010, T014 |
| US-3 | T005, T011, T015 |
| US-4 | T007, T012, T016 |
| US-5 | T024, T025, T028 |
| US-6 | T020, T023, T025, T028 |
| US-7 | T021, T026, T029 |
| US-8 | T027, T029 |
| US-9 | T030, T031, T032, T033 |
| US-10 | T022, T034, T035, T036, T037 |
| US-11 | T038, T039 |
| US-12 | T017, T018, T019 |
| US-13 | T040, T041, T042 |
| INV-1 | T019, T028, T029, T033, T037, T039, T042 |
| INV-2 | T023, T025–T038 (snapshot/restore, `InvalidWriteError`), T042 |
| INV-3 | T025, T030, T035, T036, T038 |
| INV-4 | T002, T010, T011, T012, T014, T015, T016 |
| INV-5 | T020, T034, T035, T038, T039 |
| INV-6 | T001, T004, T023 |
| INV-7 | T003, T004, T009, T013, T017 (messages unchanged), T021, T022 |
| INV-8 | T017, T025, T027, T030, T032, T038, T019 |
| SC-001 | T044 |
| SC-002 | T001, T002, T014, T015, T016, T028, T029, T033, T037, T039 |
| SC-003 | T019, T028, T029, T033, T037, T039, T042 |
| SC-004 | T019, T028, T029, T033, T037, T039, T042 |
| SC-005 | T019, G5 STOP (pre-existing suite unchanged) |
| SC-006 | T043, T045, T046 |
| SC-007 | T046 |
| D1 | T006, T010, T011, T025, T030 |
| D2 | T002, T011, T015, T043 |
| D3 | T017, T018, T019 |
| D4 | T024, T025, T028 |
| D5 | T027, T032, T038 |
| D6 | T020, T034, T035 |
| D7 | T007, T034, T037 |
| D8 | T038, T044 |
| D9 | T031, T033, T043 |
| D10 | T002, T011, T015, T043 |
| D11 | T023, T024, T025, T030, T038 |
| D12 | T003, T012, T035, T036 |
| D13 | T007, T017, T019, T025, T030 |
| D14 | T031, T033 |
| FOR-PLAN 1 (generalized inline anchor) | T021 |
| FOR-PLAN 2 (`StrictFqnRef.value` reader) | T004 |
| FOR-PLAN 3 (`checkKind` deploymentNode, `checkStyle` reuse) | T023 |
| FOR-PLAN 4 (reference list incl. `instanceOf`, endpoints, extend targets, deployment view refs; views resolve deployment + element candidates) | T007, T017 |
| FOR-PLAN 5 (emptied own metadata block removed; D14 check on effective map after write) | T031 |
