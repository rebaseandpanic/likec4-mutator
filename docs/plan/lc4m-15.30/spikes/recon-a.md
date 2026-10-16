# Reconnaissance A — references, remove, rename (2026-10-17)

I've answered all eight questions below. Two corrections first: commit 52852f7 belongs to **lc4m-15.27**, not lc4m-17 (no lc4m-17 commit exists), and the deployment part of the check was added later in lc4m-21.1. `docs/plan/lc4m-15.30/` holds only empty `critics/` and `spikes/` folders. Paths are relative to `/workspaces/likec4-mutator`.

## 1. How the removals work today

**`removeElement(fqn)`**, `src/mutator/mutator.ts:709-769` (doc comment at 681-708):
- An unknown fqn throws a plain `Error` (`Element '${fqn}' not found in any file`, :711), not `InvalidWriteError`.
- It first calls `rejectDeploymentReferences(fqn)` (:712, body at :545-580). This rejects with `InvalidWriteError('fqn', "'<fqn>' cannot be removed while the deployment model refers to it or its descendants: instances '<id>' (instanceOf '<el>'), …; deployment relationship endpoints <role> '<text>' in '<file>' (element '…' of instance '…') (LikeC4 would report: Could not resolve reference)")`. It covers instances whose `instanceOf` is in the subtree, and deployment relationship endpoints that step into an instance's element in the subtree.
- What it removes, in this order:
  1. Every relationship in any file whose resolved source or target is the element or a descendant (`isSameOrDescendant`, :714, :938), when declared outside the removed ranges. They go one at a time and each removal reparses the file (:748-752).
  2. Orphaned `extend a -> b` blocks, via `removeOrphanedExtendRelations` (:753, :492-508). A block goes when its source or target endpoint is in the subtree, or when it applied to a removed relationship and to no remaining one. The fingerprints come from `relationKeys` (:474-485).
  3. Every `extend X {}` block whose X is the fqn or a descendant, in any file (`findExtendBlock` :822 / `findExtendBlocks`, `src/mutator/element-ops.ts:478-490`, strict-FQN target match).
  4. The declaration itself (`removeElementEdit`, `element-ops.ts:452-464`). Relationships inside the body or a removed `extend` block go along with it.
- The result `removedRelationships` lists the dependent relationships plus those inside the removed ranges (:718-726). Orphaned extend-relation blocks are not listed (:195-203).
- Atomic through `snapshot()`/`restore()`.
- **Not done:** no reference snapshot or `rejectChangedReferences`, so a survivor that gets re-targeted after the removal is not caught. No check of views at all: view `of`, include/exclude/`with` predicates, dynamic steps and `navigateTo` are left dangling. This is documented in `docs/likec4-coverage.md:102` and README:1551.

**`removeDeploymentNode(id)`** / **`removeDeploymentInstance(id)`** (:1764, :1790):
- Both go through `removeDeploymentSubtree` (:642-662) and then `removeDeploymentPart` (:683-747).
- The id is looked up by `nodeDeclaration` / `instanceDeclaration` (`deployment-ops.ts` ~:510-546). Wrong type, unknown id or several declarations each throw `InvalidWriteError(field='id')`.
- **View rejection** (:695-696): `viewReferencesIntoSubtree` (`deployment-ops.ts:627-638`) collects deployment-view rule references that resolve into the subtree. The error is `InvalidWriteError('id', "'<id>' cannot be removed while deployment views refer to <scope>: '<ref>' in view '<name>' ('<file>'), …")`. Scope is `it or its subtree` for a node and `it or an element through it` for an instance.
- What it removes:
  1. Deployment relationships outside the construct with an endpoint in the subtree (`relationEndpointInSubtree`, `deployment-ops.ts:605-617`).
  2. For nodes only (`extendBlocks: true`), every `extend <node>` block targeting the subtree (`isInSubtree`).
  3. The construct itself, with everything nested in it.
- **Post-check** (:723, :741): `referenceSnapshot(removed)` before, `rejectChangedReferences(before, new Map(), id, {field:'id', action:'removing'})` after. It catches a name that becomes unique and re-targets a surviving reference. Views are not part of this snapshot.
- `removeDeploymentExtend` (:2215) uses the same `removeDeploymentPart`.

**`removeView(id)`** (:1159-1196):
- `namedView` (`src/mutator/view-address.ts:33-48`) rejects an id that is empty, undeclared or declared several times, with `InvalidWriteError('id')`.
- **Rejection**: `outsideReferrers(views, view)` (`src/mutator/view-ops.ts:213-217`) uses `ViewIndex.referrersOf(id)`, filtered by `REFERRER_TARGET_TYPES` per role and excluding references inside the view itself (D43). The error is `InvalidWriteError('id', "view '<id>' is referenced, and LikeC4 would no longer resolve these references: <file>:<line> (<role> in view '<v>'), …")`. `describeReferrer` is at `view-ops.ts:220-224`; the role texts are at :198-205 (extends, navigateTo in element / relation `with`, dynamic step, relationship, deployment relationship).
- It removes only the declaration (`removeViewEdit`, `view-ops.ts:227-232`).
- Post-check: `referenceSnapshot(new Set([view.node]), {views:true})`, then `rejectChangedReferences(..., {field:'id', action:'removing the view'}, {views:true})` (:1186-1190).
- A refused (unparsable) edit is mapped to `InvalidWriteError('id')` via `refusedOn`.
- Decision D26 (`docs/plan/lc4m-15.29/spec.md:110`) calls this the interim rule: "A referenced view cannot be removed… policy belongs to lc4m-15.30". Spec :28 puts the general removal policy in lc4m-15.30.

## 2. Reference-tracking machinery

**`src/query/workspace-index.ts`**
- `resolveRelations(ast, workspace): ResolvedRelation[]` (:447). Relationship endpoints at model level, in element bodies and in `extend X` bodies.
- `type ReferencePosition = {model:number} | 'views' | {view:{frame?:string}}` (:467-478).
- `resolveReferenceText(ast, workspace, reference, position): string|undefined` (:496).
- `class DocumentReferenceResolver` with `resolve(reference, position)` (:512-558). It caches model scopes and frame scopes. `frameScope` is the frame element itself plus its unique descendants.
- `resolveDocumentReferences(ast, workspace): ReferenceResolution[]` (:588-633). Roles: `relationship source/target`, `extend relationship source/target` (model level only), `extend target` (strict FQN, `workspace.has`), and `view target` (the `of`, resolved with an empty chain).
  - Its doc (:585-586) says it does NOT cover view rules, dynamic steps or the deployment model.
- `WorkspaceIndex` helpers: `extendBlocks(fqn)`, `extendRelationBlockList()`, `uniqueDescendants`, `rootElement`, `children`, `has` (:171-430).

**`src/query/view-resolver.ts`**, `class ViewReferenceResolver(workspace, deployments, views)`:
- `viewOf`, `extendsText`, `extendsParent`, and `frame(view)`. The frame is `of`, else the `of` of the `extends` chain, cycle-safe; dynamic views get none.
- `resolveElementText` / `resolveElementRef` handle element and dynamic view bodies (document scope plus frame).
- `resolveDeploymentText` / `resolveDeploymentRef` handle deployment view bodies.
- `resolveViewText(text, role: 'any'|'dynamic'|'element')` resolves view references.
- `isTag`, `isElementKind`, `isElementOrDeploymentNodeKind`, `isRelationshipKind` check names against the specifications.
- Also `contributesSteps(statement, view, resolver)` (:235).

**`src/query/view-index.ts`**, `class ViewIndex`:
- `declarations()`, `declarationsOf(id)`, `referrers()`, `referrersOf(id): ViewReferrer[]` (:154-221).
- Referrer roles (:111-117): `extends`, `elementWithNavigateTo`, `relationWithNavigateTo`, `stepNavigateTo`, `relationshipNavigateTo`, `deploymentRelationshipNavigateTo`. They are found by walking the whole AST, model and deployment relationship bodies included (`readReferrer` / `navigateToRole`, :385-420).
- It holds no resolution: ids are matched as text.

**`src/query/deployment-resolver.ts`**, `class DeploymentResolver(index, workspace)`:
- `relationEndpoints(relation)`, `instanceElement(instance)` (the `instanceOf` target, element mode).
- `extendTarget(extend)` (strict path).
- `viewReferences(document): DeploymentViewReference[]`: the topmost `FqnRef`s inside a `DeploymentViewBody`.
- `resolveText(text, container)`, `resolveElementText`, `resolveReference(ref): LinkedTarget` (:151-232).
- Lookup passes are nodes, then instances, then elements in views (header :1-37).

**`src/query/reference-snapshot.ts`**
- `takeReferenceSnapshot(documents, workspace, deployments, removed?, {views?}): ReferenceSnapshot` (:133).
- `compareReferenceSnapshots(before, after, insertedRanges): ReferenceChange[]` (:296).
- Records are keyed by file, frame path (`model`, `el:<fqn>`, `extend:`, `node:`, `inst:`, `dextend:`, `view:`), role and text, plus an occurrence count.
- Always covered: the `resolveDocumentReferences` roles, `instanceOf target`, `deployment relationship source/target`, `deployment extend target` and `deployment view reference`.
- With `views:true` (`attachViewReferences`, :364-414):
  - `view extends`;
  - `view rule reference` / `view step endpoint`: every topmost `FqnRef` in element and dynamic view bodies. That includes the base ref of `x.*`, `x.**` and `x._`; the selector is not modelled separately.
  - `element with navigateTo`, `relation with navigateTo`, `step navigateTo`.
- Model and deployment relationship-body `navigateTo` are not in the snapshot; only `ViewIndex.referrersOf` sees them.
- `where` holds only tags and kinds. Those are checked as declarations in `src/mutator/write-checks.ts:394-415` and are not snapshotted.
- `import` is not handled anywhere in `src/query`.

**Is there one function that enumerates all references to a given FQN, node or view?** No. There is no target-indexed lookup for elements or deployment ids. The closest pieces:
- `takeReferenceSnapshot` lists all references with their targets (key `element:<fqn>`, `deployment:<id>`, `deployment:<id>/element:<fqn>` or `view:<id>`), which can be filtered by target. It is only used through the private `LikeC4Mutator.referenceSnapshot` (:588) and `rejectChangedReferences` (:613).
- `ViewIndex.referrersOf(id)` is a reverse index for views only, by text.
- Two per-case scanners: `rejectDeploymentReferences` and `viewReferencesIntoSubtree`.

## 3. addElement re-checks (52852f7, lc4m-15.27; extended in lc4m-21.1 8544098 and b7e00e2)

- Code: `mutator.ts:594-602`. It takes `referenceSnapshot()` (no `views` option), applies the edit, then `rejectChangedReferences(before, insertedRanges, fqn)`. The error is `InvalidWriteError('name', "declaring '<fqn>' changes what an existing reference links to: the <role> '<text>' in '<file>' links to … and would no longer resolve (LikeC4 would report: Could not resolve reference) | link to … instead")` (:622-630). `apply` maps `name` to `mutations[i].id`.
- **Re-checked** (README:1562-1567): relationship endpoints at every nesting level, `extend a -> b` endpoints, `extend X` targets, view `of`, `instanceOf`, the element part of deployment relationship endpoints, `extend <node>` targets and deployment view rule references. Shadowing and new ambiguity are both caught.
- Tests: `tests/mutator/add-element-references.test.ts:65-178` covers the ambiguous sibling, a direct child shadowing a unique descendant, another file, an element body, an extend relation, a view target, and the accept cases; the CLI case is at :180. Deployment cases are in `tests/mutator/deployment-reference-stability.test.ts` (128b0f3).
- **Not re-checked** (README:1567, coverage :97): element and dynamic view rules, dynamic steps, `navigateTo`, `extends`. The `views` option is off on purpose (INV-7; lc4m-15.29 spec:148). References that did not resolve before are ignored.

## 4. Rename, move, kind change

- None implemented. The grep finds only `moveViewStep` (`mutator.ts:1412`) and step helpers.
- `docs/likec4-coverage.md:101`: "`Element` › rename, move, change `kind` … `updateElement` changes properties only; references are never rewritten."
- `UpdateElementPatch` has no `kind`.
- `docs/specs/likec4-mutator-spec.md:90` lists `moveElement | fqn, newParentFqn` as planned.
- `SpecificationElementKind` (coverage :71): kinds cannot be added, renamed or removed.

## 5. Error classes and how `apply` maps them

- **`InvalidWriteError(field, detail)`**, `src/mutator/write-checks.ts:43-54`. Message is `Invalid ${field}: ${detail}`.
- **`EditRefusedError`** (module-private), `mutator.ts:2911`. Thrown for parse errors or unbalanced braces after an edit (:2882-2894). Only view writes convert it to `InvalidWriteError(field, "the write was refused because the edited file would not parse — …")` via `refusedOn` (:2914-2923). Element and deployment removals keep it as a plain `Error`.
- **`MutationsFileError(path, detail)`**, `src/mutations-file.ts:359-367`. Raised while parsing the file; `formChecks` (:512-519) converts form-level `InvalidWriteError`s into it with `mutationFieldPath`.
- **`mutationFieldPath(op, path, field)`** (:493-506) builds `mutations[i].<field>`, with these renames:
  - addElement `name` becomes `id`;
  - for update/removeViewStep, step `path|segment|text` become `address.*`;
  - moveViewStep `segment|text` become `from.*`;
  - for deployment relationship update/remove, `kind|title` become `matchKind|matchTitle`.
- **CLI `apply`** (`src/cli.ts:440-794`):
  - The whole file is validated first (`parseMutationsFile`, `mutations-file.ts:1292`).
  - At run time an `InvalidWriteError` is rethrown as `Error('mutations[i].<path>: <detail>')` (:465-473).
  - Any error prints `Error: …` to stderr and exits 1 with nothing written (:791-794). Success exits 0.
  - Plain `Error`s (e.g. `Element 'x' not found in any file`) have no `mutations[i]` path.
- Standalone CLI commands use `asOptionError` (:75-79), which maps to `--<field>` (`name` becomes `--id`).

## 6. Test oracle, `tests/helpers/likec4-model.ts`

- `buildLikeC4Model(files, project?)` (:179): builds LikeC4 1.59.4's model and returns elements, relations, deployment model and `errors` (`<file>:<line>: msg`).
- `validateLikeC4(files)` (:271): the `likec4 validate` equivalent (diagnostics plus `diagrams()` layout errors), returned as strings.
- `expectValidLikeC4(files)` (:288): asserts `validateLikeC4` returns `[]`.
- `EffectiveValues` (:293): the element values the library reports, used for comparison.
- `expectAgreesWithLikeC4(...)` (:311): asserts the library's effective element values equal LikeC4's computed ones.
- `expectSameValues(actual, expected)` (:328): field-by-field comparison helper.
- `ReportedRelationship` (:343): a relationship as the library reports it.
- `expectRelationshipsAgreeWithLikeC4(...)` (:360): endpoints, kind and values match LikeC4's relations.
- `LinkedTarget` / `LinkedReference` / `linkedReferences(files)` (:406-442): LikeC4-linker targets of `instanceOf`, `extend <node>` and deployment view references.
- `ReportedDeploymentElement` / `ReportedDeploymentEndpoint` / `ReportedDeploymentRelationship` (:495-508), checked by `expectDeploymentNodesAgreeWithLikeC4` (:609), `expectDeploymentInstancesAgreeWithLikeC4` (:650) and `expectDeploymentRelationshipsAgreeWithLikeC4` (:690).
- `parsedViews` (:802) and `computedViews` (:885): LikeC4's parsed and computed views.
- `expectComputedViewsSurvive` (:953): the INV-9 check that no named view is dropped.
- `LinkedViewTarget` / `LinkedViewReferenceRole` / `LinkedViewReference` / `linkedViewReferences(files)` (:965-1041): the linker's targets for `of`, `extends`, `rule`, `step` and the five `navigateTo` roles. It is independent of the library and the closest existing all-references oracle.
- `Reported*` view types (:1115-1279): text, reference, relation kind, element and relation expressions, where leaf and condition, with properties, predicate item, rule, step body, step, statement, view, `ReportedViewRules`, `ReportedViewSteps`. They are compared by `expectRulesAgreeWithLikeC4` (:1691), `expectStepsAgreeWithLikeC4` (:1708) and `expectViewsAgreeWithLikeC4` (:1735).

## 7. Research docs (both exist)

**a1** (`docs/research/likec4-validate-oracle-audit.md:97-122`): `removeElement` leaves view references to the removed element dangling. It was found in `cli-apply-validation.test.ts` (addView `target: app.api`, then `removeElement app.api`). In the minimal repro, `removeElement('app.api')` removes only the declaration. LikeC4 then reports `Could not resolve reference` for `view … of app.api`, for `include app.api` and for the dynamic step, plus "Element is not resolved" and "Source not found". The doc did not check `navigateTo`, `instanceOf`, `exclude` or `with`; `instanceOf` has since been rejected (lc4m-21.2).

**K1** (`docs/research/likec4-coverage-critique.md:14-27`): the coverage table marked `Element` Remove as `yes`, although the removal leaves a project LikeC4 rejects; per its own legend that is `partial`. The probe ran `removeElement('b')` against `view of a { include a, b }`, `instanceOf b` and step `a -> b`. LikeC4 reported Could-not-resolve errors for each, while `validate()` returned `[]`. Dangling places listed: view `of`, predicates, steps, `instanceOf`, `navigateTo`, `import`. The fix was `Remove = partial` with those notes, which is the current row at :102.

**K2** (:29-37): `addElement` was marked Add `yes` despite limits:
- it cannot add into a bodiless parent (`Parent element 'a' has no body`, still at `element-ops.ts:192`);
- the file cannot be chosen, and it never writes into an `extend` block (first file with `model`);
- only the `name = kind` form is written;
- an empty `summary: ''` is dropped.

The fix was `Add = partial` (now :97).

## 8. How LikeC4 resolves names in bodies, and the mirror

The code mirrors LikeC4 1.59.4. It cites `LikeC4ScopeProvider.computeScope` / `streamForFqnRef`, `LikeC4ScopeComputation.processContainer` and `FqnIndex.uniqueDescedants` (`workspace-index.ts:485-494`, :790; `view-resolver.ts:1-22`; `deployment-resolver.ts:1-37`). There is no language-server linking at run time (D25 table row, `docs/plan/lc4m-15.29/spec.md:109`; that is lc4m-15.31).

- **Local scope** (`computeLocalScope`, :795-824): direct children, plus descendants unique across the container's subtree and not shadowed by a direct child. The first declaration wins on duplicates.
- **Bare names** (`resolveName`, :764-782): looked up from the reference outwards.
  1. Each enclosing body frame. In element and `extend` bodies `this` / `it` bind first; an `extend X` frame also offers X by name and X's unique descendants.
  2. The document scope: names unique across all of the document's `model` blocks (`uniqueAcross`).
  3. The project's root elements.
- **Qualified names**: each later segment is looked up in `uniqueDescendants` of the previous one (:754-762).
- **Views** (spec :159; `ReferencePosition`): `of` is resolved with no container frame, so document scope and roots only. Element view bodies add the `of` element's frame: the element by name, then its unique descendants, element first. A view with `extends P` inherits P's `of` frame recursively. Dynamic views use document scope only, which also covers step endpoints (`step-ops.ts:57`). Deployment views resolve nodes, then instances, then elements.
- **Deployment**: the same container and unique-descendant pattern per kind. `extend <node>` is strict. `instanceOf` uses element mode (`resolveReferenceText(…, 'views')`).