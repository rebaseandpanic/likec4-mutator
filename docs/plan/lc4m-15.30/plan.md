# Plan: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Requirements**: docs/plan/lc4m-15.30/spec.md · **Task**: lc4m-15.30 (includes lc4m-17)

## Summary

The plan covers every requirement of the spec:
- **US-1 / US-2**: a reference policy for the four remove operations, with an optional `cascade` (FR-001, FR-003, D54–D57, D77, D104, D108).
- **US-3**: `renameElement` and `moveElement`, which rewrite every reference through the substitution σ (FR-010, FR-011, FR-020, D58, D76, D85, D97–D99, D110).
- **US-4 / lc4m-17**: one reference-stability check, widened to every reference kind and run after every write that adds, removes, renames or moves a declaration (D60, D101, D107).
- **US-5**: placement. Covers bodiless parents, a `file` option, block creation and the default file in document order (D62–D65, D98).
- **US-6 / US-7**: add, update, rename and remove for kinds and tags (FR-002, D66, D67, D78, D94, D100, D109).
- **US-8 / US-9**: relationship kind, direction and nesting, plus one selector shared by several writes (D68–D70, D81, D83, D87, D102, D105, D106).
- **US-10**: creating `extend` blocks (FR-050, D71, D72, D82, D86, D103).
- **US-11**: style reads and the body-`icon` fix (D74, D75, D88, D89).
- **US-12**: an `apply` operation for every write.

Approach:
- **Shared read side.** A new *reference catalogue* is built on the existing resolvers (`WorkspaceIndex` / `EndpointResolver`, `ViewReferenceResolver`, `DeploymentResolver`). It lists every FR-001 reference with:
  - its place, written text, text range and target;
  - its statement class (FR-003).
- **Place resolver.** Answers "what does text T resolve to at this place, in the current state". It serves rename, move and nested relationships.
- **Unmodelled-name inventory.** Covers `global`, imports, opaque flow blocks and unrecovered text. It answers FR-004 in two modes: *affected* for removals and old names, *new* for D107 / D110.
- **Reference snapshot.** It is rebuilt on top of the catalogue, always covers views, and can pair references across a rename or move by σ-rekeying.
- **Writers.** They reuse the existing seams: `BodyInsertions`, `buildRemovalEdit`, `chooseBlockPlacement` (widened to `model` / `specification`), `applyEditGroups`, snapshot/restore, and the per-feature `apply` ops under the `MUTATION_FIELDS` exhaustiveness check.

## Technical context

- **Repository and stack:** `likec4-mutator`, one public repository. TypeScript ESM, built with `tsdown`, tested with `vitest` (^5). LikeC4 `@likec4/language-server` / `@likec4/core` 1.59.4, used unlinked through `LangiumParser`.
- **Runtime dependencies:** `@likec4/*`, `commander`, `bundle-require`, `esbuild`, `strip-indent`. **No new runtime dependency.**
- **Tests:** unit only.
  - Run in parts, each under `timeout 30m` with `--maxWorkers=2` (CLAUDE.md testing section).
  - `npm run lint` runs `tsc --noEmit`, `tsc -p scripts`, `tsc -p tests/types` and the coverage-table check.
  - Oracle: `tests/helpers/likec4-model.ts`.
- **Contracts touched:**
  - `LikeC4Mutator`: new methods; new options and fields on existing ones.
  - `src/index.ts`: new exported types.
  - The `apply` mutations file: new ops and fields.
  - Docs: README, CHANGELOG, `docs/likec4-coverage.md`, `package.json` version.
- **Code facts this plan relies on (read in the working tree):**
  - **`addElement`** (`src/mutator/mutator.ts:564-604`):
    - writes into `findFileContaining(parent)` or `findFileWithModel()` (`:2858-2863`, load order);
    - takes `referenceSnapshot()` without views and runs `rejectChangedReferences` (`:594-598`, `:2588-2631`).
  - **`removeElement`** (`:709-769`):
    - rejects only deployment references (`rejectDeploymentReferences`, `:2545-2580`);
    - takes no reference snapshot;
    - an unknown FQN is a plain `Error` (`:711`).
  - **`addRelationship`** (`:779-819`): no kind, direction, file or `checkMetadata`.
  - **`updateRelationship`** (`:872-964`): ambiguity is a plain `Error` (`:879-884`).
  - **`removeRelationship(source, target)`** (`:984-1001`): removes the first match in load order. The matcher is in `src/mutator/relationship-ops.ts:137-146` and `:399-419`: raw inline title, no reverse match for `<->`.
  - **Refused edits:** `EditRefusedError` (`mutator.ts:2911`) becomes an `InvalidWriteError` only through `refusedOn` (`:2914`), which view writes use.
  - **Reference snapshot** (`src/query/reference-snapshot.ts`):
    - keys are file + frame path (`el:<fqn>`, `view:<name>`, …) + role + text + occurrence (`:9-24`, `:192-208`);
    - view references are opt-in: `attachViewReferences` (`:364-414`) walks every `FqnRef` of element and dynamic view bodies, including style / `rank` targets, `group` predicates and opaque flow blocks;
    - it does not cover `views`-block styles (`ModelViews.styles`) or the `navigateTo` of model and deployment relationship bodies.
  - **`ViewIndex`** (`src/query/view-index.ts`): statement trees with `form: 'opaque'` and `parts`, plus the reverse index of view references.
  - **Grammar AST** (`module.d.mts`): `Globals { predicates, styles }`; `ImportsFromPoject` / `Imported` on the document root (`globals`, `imports`); `ViewRuleRank.targets`, `ViewRuleStyle` / `DeploymentViewRuleStyle` / `GlobalStyle` `.targets: FqnExpressions`; `ViewRuleGroup.groupRules` (nested).
  - **Block placement:** `chooseBlockPlacement` / `BlockKeyword = 'deployment' | 'views'` (`src/mutator/block-placement.ts`) implements D4/D11/D41 in `mergeOrder` document order.
  - **Body `icon`:** `DeclarationEditOptions.styleIconInBodyIcon` (`src/mutator/element-ops.ts:113-120`, applied at `:367-377`) exists and is passed only for deployment nodes and instances.
  - **Parser errors** carry offset and length (`src/parser/parser.ts`). `applyEditsToFile` refuses any edit that leaves the edited file with parse errors.
  - **Oracle:**
    - `buildLikeC4Model` already returns warning diagnostics (`diagnostics`, `tests/helpers/likec4-model.ts:110-112`, `:186-190`);
    - `LikeC4ModelRelation` has no style or `isBidirectional` comparison (`expectRelationshipsAgreeWithLikeC4`, `:360`);
    - `computedViews` / `expectComputedViewsSurvive` are at `:885` / `:953`.
  - **`apply`:** `MUTATION_FIELDS` with `FieldsNotListed` (`src/mutations-file.ts:800-963`); the CLI dispatch ends in `assertNever` (`src/cli.ts`).

## Multi-repo and contracts

One repository (`likec4-mutator`) and one stream. No cross-repository contracts. The public contract is the npm package API plus the `apply` JSON format, both documented in README and JSDoc.

## Invariant gate (before decomposition)

- [x] CLAUDE.md, CLAUDE_DEV_GUIDELINES.md and CLAUDE_TEST_GUIDELINES.md are read. There is no TypeScript stack guideline, so the project testing section binds:
  - unit tests only, on LikeC4's real parser;
  - no snapshots of whole outputs, no grep-on-source checks;
  - the only code-reading check is the approved coverage-table check;
  - the full suite runs in parts.
- [x] **422 for business errors:** n/a for a library. The equivalent is `InvalidWriteError(field, detail)` for every rejection, not-found and ambiguity (INV-4, D87, D104). `apply` reports `mutations[i].<field>`, exits 1 and writes nothing.
- [x] **Env without fallbacks:** n/a. The library and CLI read no environment.
- [x] **Transactional outbox:** n/a. No database and no external call; edits are in memory and atomic across files through snapshot/restore.
- [x] **Logs, secrets, metrics:** n/a. The library does not log; the CLI prints result lines only and handles no secrets.
- [x] **API documentation in the same commit:** every task that adds or changes a public method or `apply` op adds its JSDoc (meaning, algorithm, parameters, result, rejections) and its README subsection in that commit. T035 only consolidates cross-cutting README sections.
- [x] **Tests:** tests are written in the same commit as the code they verify. Every rejection is asserted through `InvalidWriteError` and its `field` (plus `candidates` for ambiguity), not through message text. The single exception is the printed position form `file:line:column`, which D106 makes a contract.

## Key design decisions

| Decision | Why | Rejected |
|---|---|---|
| **Public API names.** `renameElement(fqn, newName)`, `moveElement(fqn, { parent: string \| null, file? })` → `{ fqn, changedFiles }`. `addKind(type, name, opts)`, `updateKind(type, name, patch)`, `renameKind(type, name, newName)`, `removeKind(type, name)` with `type: 'element' \| 'relationship' \| 'deploymentNode'`; `addTag(name, { file? })`, `renameTag`, `removeTag`. `addElementExtend(fqn, { file, tags?, links?, metadata? })`, `addRelationshipExtend(selector, { file, tags?, links?, metadata?, shared? })`. `apply` ops use the same names and fields; the existing `addElement` mapping `name` → `id` is kept. | D66: one verb per operation; the spec fixes the names to the plan; one name set for the library and `apply` (US-12) | One `updateSpecification` patch; noun-first names |
| **Errors.** Every new write and every remove of US-1 / US-2 reports `InvalidWriteError`; refused edits are wrapped with `refusedOn` (D104). Fields: `fqn` / `id` (remove target, cascade rejections), `newName`, `parent`, `file`, `type`, `name`, `tags[i]`, `kind`, `source` / `target` / `position` (selector), `shared`, `metadata.<key>`. Ambiguity is a `RelationshipAmbiguityError extends InvalidWriteError` with `candidates: { file, line, column, kind?, title?, effectiveTitle?, bidirectional }[]` (1-based, D106). | INV-4; tests assert type and field (test guidelines §5); the round trip of D106 needs machine-readable positions | Message-only errors; a plain `Error` |
| **Reference catalogue** (`src/query/reference-catalogue.ts`). One entry per FR-001 reference: `file`, AST node, text range, `role` (FR-001 row), written text, target (element / deployment / view key), enclosing view, container chain (item → rule → group …; step → `par`), statement class (FR-003) and a `place` descriptor. Target-indexed queries: into an element subtree, into a deployment subtree, to a view. Built once per index generation. | One mechanism for removal, rename, move and the stability check (D60, Component boundaries) | Per-operation scanners (today's `rejectDeploymentReferences`, `viewReferencesIntoSubtree`) |
| **Place resolver.** `resolveAt(place, text)` resolves any text at an entry's place in the current state, through the existing resolvers. Places: model block, element / `extend` body frame chain, view `of` (views mode), element view body with frame, dynamic document scope, deployment container, `instanceOf`. | FR-011 ("keeps the text if it resolves at its place"); nested relationship targets (US-8) | Rewriting everything to full FQNs (Rejected alternatives) |
| **Snapshot on the catalogue, views always on.** `takeReferenceSnapshot` gets its records from the catalogue, adding `views`-block styles and relationship-body `navigateTo`. The `views` option goes away, so every declaration-changing write checks every reference kind. `compareReferenceSnapshots` gains `rekey`: per surviving record, its expected key after a rename or move (σ applied to the file, to the `el:` / `extend:` / `inst:` frame descriptors and to the target; the text replaced by the rewritten text). | US-4 / lc4m-17 / INV-3; the frame-path keys of today change with a rename or move, so σ-rekeying is the only pairing that survives re-indentation | Offset mapping through edits (breaks under the re-indentation of FR-020); a separate checker per write |
| **RES-spec-1: new-name rule (D107 / D110).** One function over the unmodelled-name inventory, `unmodelledHits(names, mode)`. Inventory per construct: names as segment arrays from the `FqnRef` chains of `global` predicates and styles and of opaque flow blocks; `Imported` names; kind and tag tokens of those constructs; tokens of unrecovered text. Modes: **affected** (any identifier equal to the name or any dotted segment equal to it; D92); **new** (a bare identifier, or the leading segment of a dotted name, equal to it; D107). Per write: **additions** (`addElement`, `addDeploymentNode`, `addDeploymentInstance` with its id named or taken from the element, `addView`) → new mode with the new name. **Kind and tag additions** → not checked. **Rename** → affected mode with the old name plus new mode with `newName`. **Move** → affected mode with the names of every element of the moved subtree, which subsumes new mode with the same names at their new place (D110). **Removals** → affected mode with the subtree names (element; deployment ids' last segments) or the view id. **Kind / tag rename and remove** → affected mode with the name. A hit is an `InvalidWriteError` naming file and line, on the write's field (`name` / `id` / `newName` / `fqn` / `parent`). | Closes D61, D92, D101, D107, D110 and FR-004 with one rule table; testable one row at a time | Separate checks per operation; resolving opaque references (D61 says the library cannot rewrite them) |
| **Unrecovered text.** In a file with parse errors: the lexer tokens not covered by any CST leaf, plus the tokens of the parser-error ranges. Comments and strings are excluded by token type. Lexing uses the language server's `LikeC4Terminals` regexes or the Langium lexer of the existing services (ASSUMPTION: `services.parser.Lexer.tokenize` exists in Langium 3.5; T007 verifies it and otherwise uses the `LikeC4Terminals` regexes, which `module.d.mts` exports). | FR-004 names the class; the parser drops skipped tokens from the CST | Treating a whole erroneous file as unmodelled (it would block every write) |
| **Cascade planning** (`src/mutator/cascade-ops.ts`). Collect the AST nodes to remove. Normalize them to maximal containers: the item becomes the rule when it was the last item; the rule becomes the group when the group is emptied (recursively); a step becomes its `par` / `parallel` block when emptied; `navigateTo` becomes its `with { }` when emptied. `with` / `where` go with their item. Then build one non-overlapping edit group per file: a list-item edit for `prev`-linked lists, `buildRemovalEdit` for whole statements. | D55; FR-003 "a container a cascade empties"; one atomic application | Removing one construct at a time with reparses (today's removal loop), where emptied containers would be found too late |
| **Content check (D77, D108).** Before applying a cascade, each affected view must keep at least one content-producing statement of FR-003: element and deployment `include` rules (top level or in a `group`); dynamic steps and dynamic `include`. Inherited (`extends`) and `global` content does not count. | FR-003; spikes 03 and 05 | Evaluating inheritance |
| **Leading comments of a moved declaration** (FOR-PLAN). The contiguous `//` and `/* */` comment lines directly above the declaration, with no blank line between them, plus a trailing comment on its last line, move with it. The same range is removed at the source. Removals keep today's range (INV-8). | Comments describing the declaration travel with it; a blank line separates file-level comments | Moving every preceding comment; moving none |
| **Rename / move pipeline.** (1) validate and build the catalogue; (2) declaration edits (name token, or cut + reindented insert) in memory; (3) intermediate catalogue paired with σ-rekeys; (4) FR-011 text per changed reference through the place resolver — first pass for everything but deployment paths, `instanceOf` included, rebuild, second pass for deployment paths (an unnamed instance's id follows the rewritten `instanceOf`, spike 05); (5) final stability check: every survivor resolves to σ(old) (INV-3). All of it runs under snapshot/restore. | FR-010 order dependence; atomicity (INV-4) | One-pass rewriting, which gets the unnamed-instance path wrong |
| **Default file.** `findFileWithModel` is replaced by `chooseBlockPlacement` with `BlockKeyword` widened to `'model' \| 'specification'` (FR-021, D62). A new kind or tag goes into the chosen file's first `specification` block, else a new block; never a second block in a file (INV-2 "Prefer one specification per document", spike 04). | One file-choice rule (D62); INV-2 | Load order |
| **Selector** (`src/mutator/relationship-selector.ts`). `RelationshipSelector = UpdateRelationshipMatcher & { matchBidirectional?, position? }`. `matchTitle` keeps today's raw inline title. A bidirectional relationship matches in either order. Candidates show the written and the effective title. The `extend` identity uses the effective title (`workspace.effectiveIdentity`), and D82 rejects a kind-only title. The library gains `removeRelationship(selector)` beside the legacy `(source, target)`; it returns `{ changedFiles }`. | D70, D81, D87, D102, D106; FOR-PLAN on `matchTitle`; source compatibility | Changing `matchTitle` semantics |
| **Style read shape.** `ElementInfo.ownStyle` (first `style { }` plus body `icon`) and `style` (effective). `ElementKindDefaults extends KindDefaults { style? }` on `fromSpecification`. `RelationshipInfo.ownStyle`, `style` (effective, bidirectional `tail` rule), `fromSpecification: RelationshipKindDefaults { style?, multiple? }`, and `bidirectional: boolean`. The types are the existing `ElementStyle` / `RelationshipStyle`; deployment reads are unchanged. | D69, D74, D89; one value type with deployment | Adding style to `getSpecification()` (D89 rejected it) |
| **`apply` ops land with their feature.** Each group adds its op interface, its `MUTATION_FIELDS` entry and its CLI dispatch case in one commit, so `assertNever` holds. | No ordering-only "apply" group that waits for all features | One big `apply` commit |
| **Release 0.11.0** (minor). Prepared, not pushed, tagged or published. | SC-011 | — |

## Complexity Tracking

| Added layer or generalization | Why and what would happen without it |
|---|---|
| Reference catalogue | Without it, removal, rename, move and stability each re-walk ASTs with their own reference lists, which drift: two critique rounds hit that kind of drift (D95, D96). FR-001's "every reference listed" would not be testable in one place. |
| Place resolver | FR-011 and nested relationship targets need "would this text resolve here". Without it the only safe option is full FQNs, which D58 rejects. |
| σ-rekeyed snapshot comparison | Frame-path keys change under rename and move. Without rekeying, the existing comparison throws an internal error ("not found after the write") on every rename or move, or INV-3 goes unchecked. |
| Unmodelled-name inventory with two modes | D61 / FR-004 / D107 / D110 need one rule. Without it, opaque blocks silently re-target (`opt { api -> other }`, critique r4) or unrelated additions are rejected. |
| Cascade normalizer | Without it, emptied rules, groups, `par` and `with` stay behind and fail to parse (spikes 02 and 05), or edits overlap. |
| Kind / tag place catalogue (FR-002) | Rename and remove of kinds and tags need every place with its kind type, including `shared`. Without it, D78 and the negated forms cannot be decided. |
| `chooseBlockPlacement` widened to `model` / `specification` | One file rule (D62). Without it a second placement copy exists and keeps load order (the backlog item). |
| `RelationshipAmbiguityError.candidates` | D106 round trip without parsing message text (test guidelines §5). Without it the caller copies text from a message string. |

No new runtime dependency.

## Decomposition by phases

### Phase Setup

**T001 [TEST]** — new fixtures `tests/fixtures/refs-catalog/` and `tests/fixtures/refs-flows/`: two unrelated neutral specifications (INV-6), each multi-file, with a load order that differs from LikeC4's document order.
- Mechanism: together they hold every FR-001 reference kind, in relative and qualified form and across files:
  - model, nested and `extend` relationships;
  - `extend X` / `extend a -> b`;
  - view `of`, `extends`;
  - include / exclude items with `x.*`, `x.**`, `x._`, relation predicates, `with`, `where`, inside nested `group`s;
  - dynamic `include`, steps, chains, `par`, `parallel`, opaque `opt` / `alt` / `loop` / `try` / `break` blocks;
  - `rank`, view style rules and `views`-block style rules;
  - every `navigateTo` role;
  - `instanceOf`, named and unnamed instances with deployment paths under them, deployment relationships through instances, `extend <node>` in another file, deployment view rules;
  - `global` predicates and styles, an import;
  - every FR-002 place, positive and negated, with element kind and deployment node kind sharing a name;
  - a CRLF file.
- Gate: each fixture passes `expectValidLikeC4`, asserted as a precondition by every consuming test file.

### Phase Foundational (BLOCKING)

**T002 [TEST]** — `tests/helpers/likec4-model.ts`, `tests/likec4-validate-oracle.test.ts`, `tests/types/`. Mechanism: oracle extensions.
- `LikeC4ModelElement.style` and relation `line` / `color` / `head` / `tail` / `isBidirectional`, all from `$data` (before theme defaults, D88).
- `expectRelationshipsAgreeWithLikeC4` compares `bidirectional` and the effective style. Existing callers pass library objects, which carry both once T026 / T033 land; until then the new fields are compared only when the reported object has them. The comparison becomes mandatory in T033, and that commit updates the callers.
- `expectElementStylesAgreeWithLikeC4` compares own, kind and effective style; opacity is LikeC4's number against the written percentage.
- `introducedWarnings(before, after)`: the INV-2 messages present after the write and not before.
- `expectSigmaImage(before, after, sigma)`: computed elements, deployment elements and explicit relations of `after` equal those of `before` under the literal σ map the test gives, with own and kind-default values (D76); `linkedReferences` / `linkedViewReferences` targets map by σ.
- Oracle precondition tests for the spike facts the plan relies on:
  - bidirectional `tail` rule;
  - `Redundant as icon defined on element` warning;
  - `Prefer one specification per document`;
  - an `extend` matching nothing warns;
  - D109: a deployment view with `element.kind` / `element.tag` is absent from `computedViews`.
- Gate: the existing oracle tests are green unchanged; the precondition tests are green.

**T003** — `src/query/view-index.ts`. Mechanism: the FR-003 statement class of every view body node (`rule` / `step` / `opaque` / `property`), the container chain of each rule item (nested `group`s included), the `views`-block style rules (`ModelViews.styles`) as `views`-level rules, and `global` blocks recorded as opaque. Gate: the existing view read tests are green unchanged; covered by T004.

**T004 [TEST]** — new `src/query/reference-catalogue.ts`, new `tests/query/reference-catalogue.test.ts`. Mechanism: the catalogue as defined in Key design decisions. Sources:
- `resolveDocumentReferences` and `resolveRelations` (model);
- `DeploymentResolver` (deployment, `instanceOf`, view rules);
- `ViewReferenceResolver` (view bodies, step endpoints, `extends`);
- `ViewIndex.referrers()` (all `navigateTo`, model and deployment relationship bodies included);
- `views`-block style targets (T003).

Gate: on both T001 fixtures, the class "catalogue = linker" holds:
- for every role the catalogue covers, its entries equal LikeC4's linked references (`linkedReferences`, `linkedViewReferences`) one to one — the target, unresolved included, and the count;
- opaque and `global` references are flagged opaque.

**T005 [TEST]** — `src/query/workspace-index.ts` (public frame-chain resolution for an element / `extend` body), `src/query/reference-catalogue.ts` (`resolveAt`), `tests/query/reference-catalogue.test.ts`. Mechanism: the place resolver.
- Gate (class "resolveAt agrees with LikeC4 at every place kind"):
  - for each place kind, `resolveAt(entry.place, entry.text)` equals the entry's target;
  - for one entry per place kind, an alternative text (bare name, qualified name, full FQN) written into a copy of the fixture resolves as LikeC4's linker resolves it there.

**T006** — `src/query/reference-snapshot.ts`, `src/mutator/mutator.ts`, `tests/query/reference-snapshot.test.ts`.
- Mechanism: the snapshot built from the catalogue; the `views` option removed (always on); `views`-block styles and relationship-body `navigateTo` added; `compareReferenceSnapshots(before, after, { inserted, rekey? })`.
- Callers: `addElement`, `addView`, `addDeploymentNode`, `addDeploymentInstance`, the deployment removals and `removeView`. `removeElement` joins in T011.
- Gate:
  - the existing snapshot tests are green, with the `views` option replaced;
  - new direct tests: a rekeyed survivor pairs; a survivor re-targeted after a rekey is reported; a `views`-block style target and a relationship-body `navigateTo` are covered;
  - the full suite is green except tests whose expectations change by INV-8; those are rewritten in the same commit, and each is named in the commit message.

**T007 [TEST]** — new `src/query/unmodelled.ts`, `src/mutator/mutator.ts`, new `tests/mutator/add-references-stability.test.ts`, `tests/cli/cli-apply-validation.test.ts`. Mechanism: the unmodelled-name inventory and `unmodelledHits(names, mode)` (Key design decisions, RES-spec-1), including unrecovered text, with the Langium lexer API verified first. It is wired into the four additions in new mode (US-4, D101, D107; INV-8 new rejections).
- Gate (class "an addition never re-targets, makes ambiguous or captures a reference"):
  - the lc4m-17 repro is rejected in the library and in `apply` (`mutations[i].id`), also with the step inside `opt` and inside an `alt` branch;
  - one test per newly covered reference kind (view rule, step, dynamic `include`, `navigateTo`, `extends`, style / `rank` target, `views`-block style);
  - new-mode positions: a bare name and a leading segment block, a later dotted segment does not, a longer identifier does not, a kind or tag addition is never checked;
  - unrecovered text blocks;
  - sources are byte-identical on every rejection.

**T008** — `src/mutator/block-placement.ts`, `src/mutator/mutator.ts`. Mechanism: `BlockKeyword` gains `model` and `specification`; `findFileWithModel` is deleted; the default rule is FR-021. Gate: the deployment and view placement tests are green unchanged (only the new keywords change behaviour).

**T009** — `src/mutator/body-layout.ts`, `src/mutator/element-ops.ts`. Mechanism: `BodyInsertions` creates the body of a bodiless element declaration (both forms, inline strings kept). `buildCombinedBodyInsertElement` and the deployment `declarationBodyInsertEdit` collapse into it. Gate: `tests/mutator/insert-layout.test.ts` and `tests/mutator/codegen.test.ts` are green unchanged; covered by T019, T029 and T017.

### Phase US-1, US-2: removal policy (MVP)

**T010** — new `src/mutator/cascade-ops.ts`. Mechanism: the cascade planner.
- Normalization to maximal containers.
- List-item removal in `prev`-linked `Expressions` / `FqnExpressions` (trailing comma kept valid), with `with` / `where`.
- `navigateTo` property removal and emptied `with { }`.
- Emptied `par` / `parallel` (reusing `leaveParallel` of `step-ops.ts`).
- One non-overlapping edit group per file.

Gate: covered by T011–T013 (no public surface).

**T011 [TEST]** — `src/mutator/mutator.ts` (`removeElement(fqn, { cascade? })`, result `cascaded[]`), new `tests/mutator/remove-element-references.test.ts`, existing remove tests. Mechanism:
- catalogue entries into the subtree, classified per FR-001: owned / cascadable / blocking (D56, opaque, `global`);
- FR-004 in affected mode;
- the D77 content check (D108);
- the `instanceOf` closure (instances cascaded as `removeDeploymentInstance` with `cascade`), and deployment relationships through instances;
- `rejectDeploymentReferences` is replaced by the catalogue;
- the stability check on survivors;
- D104 errors (an unknown `fqn` and a refused edit become `InvalidWriteError('fqn')`);
- a rejection lists every reference, separating blocking from cascadable.

Gate (class "every FR-001 row, both modes"):
- one test per row: without `cascade`, rejected with byte-identical sources and every reference listed; with `cascade`, `expectValidLikeC4`, exactly the FR-001 constructs gone, every other reference resolving to its old target (`linkedViewReferences`), `expectComputedViewsSurvive`;
- the a1 model is rejected in both modes, with `of` reported as blocking and the include and step as cascadable;
- the D77 fixtures are rejected: scoped and unscoped views with a remaining `exclude`, a dynamic view whose only step names the removed element, and `view child extends base { include b }`.

**T012 [TEST]** — `src/mutator/mutator.ts`, `src/mutator/deployment-ops.ts`, new `tests/mutator/deployment-remove-references.test.ts`. Mechanism: `removeDeploymentNode` / `removeDeploymentInstance` gain `{ cascade? }`. Deployment view items cascade through T010, with D77 for deployment views; owned constructs are unchanged (D57); D104. Gate: the same class as T011 for deployment view rows (include, exclude, style target), both modes.

**T013 [TEST]** — `src/mutator/mutator.ts`, `src/mutator/view-ops.ts`, `tests/mutator/views-remove.test.ts`. Mechanism: `removeView(id, { cascade? })`.
- `extends` is rejected in both modes, naming the chain.
- `navigateTo` in its five roles is rejected by default; with `cascade` the property is removed, and an emptied `with { }` with it.
- References inside the removed view do not block it (D43).

Gate: one test per referrer role in both modes, `expectValidLikeC4`, `expectComputedViewsSurvive(removedId)`.

**T014 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-references.test.ts`, `tests/cli/cli-standalone-commands.test.ts`. Mechanism: `cascade` on the four remove ops; result lines list the cascaded constructs; the standalone commands keep their options and apply the new rejections (D84). Gate: each op in both modes; a rejection exits 1 with `mutations[i].fqn` / `id` and writes nothing.

### Phase US-4 closure, US-3: rename and move

**T015** (needs planning) — new `src/mutator/rename-ops.ts`. Mechanism:
- σ per FR-010, including unnamed instance ids and the deployment paths under them; a path without an image is rejected, listing it;
- the FR-011 text choice through `resolveAt` on the intermediate state, in two passes (Key design decisions);
- the σ-rekey map for T006's compare;
- pre-write rejections: FR-004 affected mode for the old names; the D110 new-name rule; a parent-child relationship or step after σ (`isSameHierarchy` on the σ-mapped endpoints of every relationship and step); the D97 sibling-id collision, including ids declared in `extend <node>` blocks in any file (`idsDeclaredIn`); a reference with no rewritable text.

Gate: covered by T016 and T017.

**T016 [TEST]** — `src/mutator/mutator.ts` (`renameElement`), new `tests/mutator/rename-element.test.ts`. Mechanism: the name-token edit (both declaration forms), the T015 pipeline, `newName` checked by `checkElementName`, and a collision under the parent.
- Gate (class "σ-equality and written-form preservation"):
  - every FR-001 reference kind across two files, relative and qualified, gives `expectSigmaImage` and `expectValidLikeC4`;
  - relative text that still resolves is unchanged;
  - title-less and kind-default-title elements;
  - the unnamed-instance fixture referenced from a deployment view and from deployment relationships to the instance and to a path under it;
  - collisions with a sibling node, a named instance, and an instance declared in an `extend` block of the node in another file are rejected;
  - the rename of `other.foo` to `api` with `opt { api -> other }` present is rejected;
  - each rejection is byte-identical.

**T017 [TEST]** (needs planning: comment range, re-indentation, line endings) — `src/mutator/mutator.ts` (`moveElement`), `src/mutator/rename-ops.ts`, new `tests/mutator/move-element.test.ts`. Mechanism:
- the declaration text with its leading comments (Key design decisions), re-indented to the new depth, line endings of the target file;
- FR-020 placement into the parent body (created through T009) or the first `model` block of the chosen or current file (created through T008, D98);
- rejections: `file` with a parent; no-op; own subtree; cross-file relative icon or link anywhere in the moved text (D85, D99); a path without an image.

Gate:
- `expectSigmaImage` over every reference kind across two files;
- a move under `include app.*` shows the documented hierarchy effect (the computed nodes before and after are taken from spike 03 as the literal expectation);
- root-to-root into another file is accepted;
- a root move without `file` is a no-op rejection;
- a chosen file without a `model` block;
- every rejection byte-identical.

**T018 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-rename-move.test.ts`. Mechanism: `renameElement` (`fqn`, `newName`) and `moveElement` (`fqn`, `parent`, `file`) ops. Gate: success with `expectValidLikeC4`; library rejections exit 1 with the field path and write nothing.

### Phase US-5: placement

**T019 [TEST]** — `src/mutator/mutator.ts`, `src/mutator/element-ops.ts`, new `tests/mutator/add-element-placement.test.ts`, `tests/integration/edge-cases.test.ts:603` (rewritten: a bodiless parent is now accepted). Mechanism: `addElement(parent, { …, file? })`.
- A bodiless parent through T009.
- `file` for a root element only (`checkFile`, D63; `file` with a parent rejected).
- Model block creation and the default FR-021 through T008.

Gate:
- both declaration forms, with and without inline strings, compared with `expectAgreesWithLikeC4`;
- chosen file, missing block and default rule on a project whose load order differs from document order;
- unloaded and colliding file names rejected byte-identical.

**T020 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-apply-validation.test.ts`. Mechanism: `apply` `addElement` with `parent` optional (absent means root), `title` optional and `file` (D65). Gate: root and title-less additions, with `expectValidLikeC4`; `file` with `parent` exits 1 with `mutations[i].file`.

### Phase US-6, US-7: specification

**T021 [TEST]** — new `src/mutator/specification-ops.ts`, `src/mutator/codegen.ts`, `src/parser/grammar.ts` (name probe), `src/mutator/mutator.ts`, new `tests/mutator/specification-write.test.ts`. Mechanism: `addKind`, `updateKind`, `addTag`.
- Name validity through a parse probe of the declaration in its position (D67).
- Same-type duplicates in any file; D94 for an update; `summary` on a relationship kind rejected; declared tags.
- The D100 guard on a relationship kind `title` change.
- Placement through T008 into the file's existing block.
- Updates edit inside the kind body (created if absent) with D33 semantics; style, notation, `multiple` and colors are kept byte for byte.

Gate:
- each kind type and tags, added and updated;
- the effective values of elements and relationships of that kind are compared with ModelBuilder (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`);
- one accepted keyword-like name (`model`) and one rejected (`view`);
- chosen file, missing `specification` block, and the default rule on differing orders;
- `introducedWarnings` is empty;
- every rejection is byte-identical.

**T022 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-specification.test.ts`. Mechanism: `addKind` / `updateKind` / `addTag` ops. Gate: each op, plus the rejection paths.

**T023 [TEST]** — new `src/query/kind-places.ts`, `tests/helpers/likec4-model.ts` (`linkedKindReferences`: LikeC4's linked `ElementKind` / `DeploymentNodeKind` / `DeploymentNodeOrElementKind` / `RelationshipKind` / `Tag` references), new `tests/query/kind-places.test.ts`. Mechanism: every FR-002 place in every file, with its kind type (element / deployment node / relationship / shared / tag) and its negation. Opaque and `global` places are excluded here; they are FR-004's. Gate: on the T001 fixtures, the places equal LikeC4's linked kind and tag references one to one; the type of each `kind is` / participant place is `shared`.

**T024 [TEST]** — `src/mutator/specification-ops.ts`, `src/mutator/mutator.ts`, new `tests/mutator/specification-rename-remove.test.ts`. Mechanism: `renameKind` / `renameTag` / `removeKind` / `removeTag`.
- FR-002 steps 1–3, with the D78 shared-name guard.
- D94 duplicates.
- FR-004 affected mode.
- An emptied `specification { }` is kept.
- `#old` inside strings is untouched.
- A removal rejection lists every use.

Gate:
- one rename test per FR-002 place, positive and negated, across two files;
- a removal-rejection test for kinds and tags used only at that place;
- the `vm` / `vm` D78 fixtures with and without `where kind is (not) vm` in an element view and a deployment view, for the rename of each;
- a rename into a name the other type has;
- results pass `expectValidLikeC4`, and the computed model reports the new names on the same elements and relationships.

**RES-spec-2 (D109).** For every `element.kind` / `element.tag` expression in a deployment view (include and exclude predicates and style targets), the test:
- asserts the precondition that `computedViews` before the write lacks the view;
- asserts `expectValidLikeC4` on the result;
- asserts that the rule text read back through `getView(id).rules[i].text` equals the literal expected text;
- makes no computed-view comparison.

**T025 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-apply-specification.test.ts`. Mechanism: the rename and remove ops. Gate: each op, plus the rejection paths.

### Phase US-9, US-8: relationships

**T026 [TEST]** — `src/query/types.ts`, `src/query/query.ts`, `src/query/relation-extends.ts`, new `tests/query/relationship-direction-read.test.ts`. Mechanism: `RelationshipInfo.bidirectional`; `ExtendContribution.bidirectional` for relationship blocks (D69). Gate: `->`, `<->`, `-[k]<->` and `.k` agree with LikeC4's `isBidirectional` through `expectRelationshipsAgreeWithLikeC4`.

**T027 [TEST]** — new `src/mutator/relationship-selector.ts`, `src/mutator/relationship-ops.ts`, `src/mutator/mutator.ts`, `src/mutator/write-checks.ts` (`RelationshipAmbiguityError`), `src/index.ts`, new `tests/mutator/relationship-selector.test.ts`, `tests/mutator/update-relationship.test.ts`, `tests/mutator/remove-relationship.test.ts`. Mechanism:
- the D70 selector (Key design decisions), shared by `updateRelationship` and `removeRelationship`;
- not-found and ambiguity become `InvalidWriteError` (D87);
- orphaned-block cleanup is kept;
- the deployment selector is untouched (D105).

Gate (class "a selector addresses exactly one relationship"):
- update and remove address exactly the selected relationship, including one of two identical relationships on different lines and on one line, by position;
- a `candidates[i]` position passed back unchanged selects that candidate;
- reverse order matches `<->`;
- ambiguity leaves sources byte-identical;
- orphan cleanup is tested;
- the deployment relationship tests are green unchanged.

**T028 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-relationship-selector.test.ts`. Mechanism: `matchBidirectional` and `position` on `updateRelationship` / `removeRelationship`. A position refers to the state after the preceding mutations (D102, D106).
- Gate: the round trip — the position printed by an ambiguity error, which D106 makes the contract form, is passed back in a second `apply` and selects that candidate; the error path names `mutations[i]`.

**T029 [TEST]** — `src/mutator/codegen.ts` (`generateRelationship` with kind, dot form, `<->`, sourceless nested), `src/mutator/relationship-ops.ts`, `src/mutator/mutator.ts`, new `tests/mutator/add-relationship-forms.test.ts`. Mechanism: `addRelationship(source, target, label?, { …, kind?, kindForm?, bidirectional?, placement?: 'top' | 'nested', file?, shared? })`.
- `checkKind('relationship')`; dot form with `bidirectional` rejected.
- Nested placement goes into the source's declaration body (T009) with the target text chosen through `resolveAt`; `file` with nested rejected.
- `file` for top level goes through T008 (US-5).
- D83 against `extend a -> b` identities, unless `shared`.

Gate:
- every US-8 spelling is compared with `expectRelationshipsAgreeWithLikeC4` (kind and direction);
- chosen file, missing block and the default rule on differing orders;
- D83 rejection and its `shared` acceptance;
- each rejection is byte-identical.

**T030 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-apply-extended.test.ts`. Mechanism: the new `addRelationship` fields. Gate: success and rejection paths.

### Phase US-10: `extend` creation

**T031 [TEST]** — new `src/mutator/extend-ops.ts`, `src/mutator/codegen.ts`, `src/mutator/mutator.ts`, new `tests/mutator/extend-create.test.ts`. Mechanism:
- `addElementExtend` and `addRelationshipExtend` (selector from T027), with `file` required (D71, D103) and the model block created through T008;
- FR-050 merge into the first same-target block of the file;
- the relationship block is written with the bracket connector carrying kind and direction, and the relationship's own title;
- rejections: unresolved element; undeclared tag; nothing to add; D86 metadata key present anywhere; D82; D72 shared identity.

Gate:
- with and without an existing block, effective tags, links and metadata equal ModelBuilder;
- `introducedWarnings` has no `does not match any relation`;
- every rejection is byte-identical.

**T032 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-extend.test.ts`. Mechanism: the two ops. Gate: success and rejection paths.

### Phase US-11: styles

**T033 [TEST]** — `src/query/types.ts`, `src/query/query.ts`, `src/query/kind-specs.ts`, `src/query/style-read.ts` (the bidirectional `tail` rule shared with `deployment-query.ts`), `tests/helpers/likec4-model.ts` (direction and style comparison made mandatory, callers updated), `tests/types/`, new `tests/query/styles-read.test.ts`. Mechanism: the style read shape of Key design decisions (D74, D89). Gate: every style field of the grammar, own and kind values and their combination, body `icon` over `style { icon }`, and kind `multiple`, all equal LikeC4's `$data` (D88); the deployment reader tests are green unchanged.

**T034 [TEST]** — `src/mutator/mutator.ts` (`updateElement` passes `styleIconInBodyIcon`), new `tests/mutator/style-body-icon.test.ts`. Mechanism: D75. Gate: the body `icon` is rewritten, no `style { icon }` is written, `introducedWarnings` has no `Redundant as icon`, and an already present `style { icon }` stays byte for byte.

### Phase Polish

**T035** — `README.md`. Mechanism: consolidated sections (SC-012):
- the FR-001 table;
- placement and file choice (D62, D63, D85, D98);
- "Specification defaults → Writing" rewritten;
- "`extend` blocks → Writing";
- relationships (kind, direction, nesting, selector, positions);
- styles (D74, D75);
- the move hierarchy effect (D76) and manual layouts (D91);
- standalone CLI vs `apply` (D84);
- D108;
- D109;
- "Rejected writes" rows.

Gate: every README example is run in a test of the matching feature file and gives the stated values.

**T036** — `docs/likec4-coverage.md`. Mechanism: every row named in the task's "Coverage rows to update" (A–F) is updated; the out-of-scope rows (D59, D73, D90, D105) stay `no` with their reason. Gate: `npm run lint`.

**T037** — `CHANGELOG.md`. Mechanism: a `[0.11.0]` entry. Added: every new operation and field. Changed: every INV-8 item:
- remove rejections and cascades, and their error type (D104);
- relationship selection and its error type (D87);
- the D62 default file;
- the new rejections of `addElement` / `addView` / `addDeploymentNode` / `addDeploymentInstance` (US-4) and `addRelationship` (D83);
- D75.

Gate: matches README.

**T038** — `package.json`, `package-lock.json`, `docs/likec4-coverage.md` title. Mechanism: version 0.11.0; not pushed, tagged or published. Gate: `npm run lint`, the three suite parts and `npm run build` are green (SC-011).

## Streams and groups

| Stream | Repository | Group | Tasks in order | Group rationale |
|---|---|---|---|---|
| S1 | likec4-mutator | G1 Oracle | T001, T002 | Fixtures and oracle are reviewed before any code depends on them |
| S1 | likec4-mutator | G2 Reference foundation | T003, T004, T005, T006, T007 | One layer: statement classes, catalogue, place resolver, widened snapshot, unmodelled inventory; closes US-4 / lc4m-17 |
| S1 | likec4-mutator | G3 Placement foundation | T008, T009 | Shared write seams: block placement and body creation, guarded by the unchanged suite |
| S1 | likec4-mutator | G4 Removal policy | T010, T011, T012, T013, T014 | US-1 / US-2 share the cascade planner and the content check |
| S1 | likec4-mutator | G5 Rename and move | T015, T016, T017, T018 | US-3 shares σ, the rewriter and the rekeyed comparison |
| S1 | likec4-mutator | G6 Element placement | T019, T020 | US-5 for `addElement` (library and `apply`) |
| S1 | likec4-mutator | G7a Specification add / update | T021, T022 | US-6 shares `specification-ops.ts` and the name and duplicate checks |
| S1 | likec4-mutator | G7b Specification rename / remove | T023, T024, T025 | US-7 shares the FR-002 place catalogue |
| S1 | likec4-mutator | G8a Relationship read and selector | T026, T027, T028 | US-9: direction and one selector |
| S1 | likec4-mutator | G8b Relationship writes | T029, T030 | US-8 (with the US-5 `file` of `addRelationship`) |
| S1 | likec4-mutator | G9 `extend` creation | T031, T032 | US-10 |
| S1 | likec4-mutator | G10 Styles | T033, T034 | US-11: one read shape plus the body-icon fix |
| S1 | likec4-mutator | G11 Docs and release | T035, T036, T037, T038 | Cross-cutting docs and release preparation |

There are no solo groups.

## Dependencies and build order

Edges exist only where code is really needed:
- **G1** → every group with tests (G2, G4–G10): they use the fixtures and oracle helpers.
- **G2** ← G1.
- **G3** ← none: existing code only; the gate is the unchanged suite.
- **G4** ← G2 (catalogue, unmodelled inventory, snapshot).
- **G5** ← G2 (catalogue, `resolveAt`, rekey) and G3 (body creation, model block).
- **G6** ← G3.
- **G7a** ← G3 (`specification` placement).
- **G7b** ← G2 (unmodelled inventory, statement classes) and G7a (shared name and duplicate checks in `specification-ops.ts`).
- **G8a** ← G1.
- **G8b** ← G2 (`resolveAt`) and G3 (body creation, model placement).
- **G9** ← G3 and G8a (selector).
- **G10** ← G1.
- **G11** ← all: the docs describe delivered behaviour, and the version closes the run.

There are no cycles. Ready sets in waves: {G1, G3} → {G2, G6, G7a, G8a, G10} → {G4, G5, G7b, G8b, G9} → G11. The task numbering T001…T038 is a topological order. A run of the three suite parts plus `npm run lint` ends each group.

## Delivery strategy

1. **MVP = G1, G2, G3, G4** (removals never dangle; lc4m-17 closed). STOP & VALIDATE:
   - T004 / T005 equal LikeC4's linker;
   - every FR-001 row is tested in both modes;
   - the a1 model and the D77 / D108 fixtures behave as specified;
   - the INV-8 test changes are listed.
2. **G5.** STOP: `expectSigmaImage` over every reference kind; the D97 / D110 / FR-010 rejections.
3. **G6, G7a, G7b.** STOP: SC-005 file-choice matrix; SC-006 including D78 and D109.
4. **G8a, G8b, G9.** STOP: SC-007, SC-008 including the D106 round trip, SC-009 with no warning introduced.
5. **G10.** STOP: SC-010.
6. **G11.** STOP: `npm run lint`, the three suite parts and `npm run build`. Prepared, not published.

## Risks and rollback

- **Catalogue drift from LikeC4 scoping:** T004 and T005 compare every role and place kind with LikeC4's linker before any writer uses them.
- **Widened snapshot (T006) turns hidden pairing gaps into internal errors on existing writes:** the full suite runs in T006's commit, and every changed expectation is tied to an INV-8 item.
- **σ-rekey errors on moves** (the ordinals of a destination `model#k`, occurrence order): T015 and T017 are marked "needs planning"; `expectSigmaImage` plus the internal not-found error make any mismatch red, never silent.
- **Langium lexer API assumption (T007):** it is verified first; the fallback is the exported `LikeC4Terminals` regexes.
- **Performance:** the catalogue is built two or three times per rename or move (no numeric bound, per the spec). Per-generation resolver caching is reused.
- **Rollback:** each group is a contiguous series of atomic commits on the working branch; a failing group is reverted with `git revert`. Nothing is pushed.

## Known residuals

- **RES-plan-1 · MINOR.** `addRelationship` has no `checkMetadata` today, while `addDeploymentRelationship` has. The spec does not list adding it among the INV-8 changes, so the plan leaves it; the new nested and typed forms inherit the gap. → carrier: lc4m-15.31 (semantic validation).
- **RES-plan-2 · MINOR.** FR-004 in affected mode for moves uses every subtree name, so a bare same-named token in an opaque block that refers to a different element also blocks the move. This is the conservative side; the error names the block. → documented in README.
- **RES-plan-3 · MINOR.** Detection of unrecovered text rests on an unverified API until T007 runs. A fallback is named in the plan.

## Spec traceability

| Spec id | Tasks |
|---|---|
| US-1 | T003, T004, T010, T011, T012, T014 |
| US-2 | T010, T013, T014 |
| US-3 | T005, T015, T016, T017, T018 |
| US-4 | T004, T006, T007 |
| US-5 | T008, T009, T019, T020, T029, T031 |
| US-6 | T021, T022 |
| US-7 | T023, T024, T025 |
| US-8 | T029, T030 |
| US-9 | T026, T027, T028 |
| US-10 | T031, T032 |
| US-11 | T033, T034 |
| US-12 | T014, T018, T020, T022, T025, T028, T030, T032 |
| INV-1 | T002, T011–T034 (gates use `expectValidLikeC4`) |
| INV-2 | T002, T021, T031, T034 |
| INV-3 | T006, T015, T016, T017 |
| INV-4 | T011, T012, T013, T027, every rejection gate |
| INV-5 | T009, T010, T017, T021, T034 |
| INV-6 | T001 |
| INV-7 | T002, T026, T033, T021 |
| INV-8 | T006, T007, T011, T019, T027, T029, T034, T037 |
| INV-9 | T011, T012, T013 (`expectComputedViewsSurvive`) |
| FR-001 | T004, T011, T012, T013, T035 |
| FR-002 | T023, T024 |
| FR-003 | T003, T010, T011 |
| FR-004 | T007, T011, T015, T024 |
| FR-010 | T015, T016, T017 |
| FR-011 | T005, T015 |
| FR-020 | T017 |
| FR-021 | T008, T019, T021, T029 |
| FR-050 | T031 |
| SC-001 | T011, T012, T013 |
| SC-002 | T011, T012, T013 |
| SC-003 | T002, T016, T017 |
| SC-004 | T007 |
| SC-005 | T017, T019, T021, T029, T031 |
| SC-006 | T021–T025 |
| SC-007 | T029 |
| SC-008 | T027, T028 |
| SC-009 | T031 |
| SC-010 | T033, T034 |
| SC-011 | T036, T038 |
| SC-012 | T035, T037 |
| D53 | T007 |
| D54 | T011, T012, T013 |
| D55 | T010 |
| D56 | T011, T013 |
| D57 | T011, T012 |
| D58 | T015 |
| D59 | T036 |
| D60 | T006 |
| D61 | T007, T011, T015 |
| D62 | T008, T019, T021, T029 |
| D63 | T019, T029 |
| D64 | T009, T019 |
| D65 | T020 |
| D66 | T021, T024 |
| D67 | T021 |
| D68 | T029 |
| D69 | T026 |
| D70 | T027 |
| D71 | T031 |
| D72 | T031 |
| D73 | T036 |
| D74 | T033 |
| D75 | T034 |
| D76 | T002, T016, T017, T035 |
| D77 | T011, T012 |
| D78 | T024 |
| D79 | T023, T024 |
| D80 | T004, T011 |
| D81 | T027 |
| D82 | T031 |
| D83 | T029 |
| D84 | T014, T035 |
| D85 | T017 |
| D86 | T031 |
| D87 | T027 |
| D88 | T002, T033 |
| D89 | T033 |
| D90 | T036 |
| D91 | T035 |
| D92 | T007 |
| D93 | T006, T015 |
| D94 | T021, T024 |
| D95 | T023 |
| D96 | T003 |
| D97 | T015, T016 |
| D98 | T017 |
| D99 | T017 |
| D100 | T021 |
| D101 | T007 |
| D102 | T027, T028 |
| D103 | T031 |
| D104 | T011, T012, T013 |
| D105 | T027, T036 |
| D106 | T027, T028 |
| D107 | T007 |
| D108 | T011, T035 |
| D109 | T002, T024, T035 |
| D110 | T007, T015, T016 |
| RES-spec-1 | T007, T015, T016 (rule table in Key design decisions) |
| RES-spec-2 | T002, T024 |
| RES-spec-3: `extend`-body siblings in D97 | T015, T016 |
| RES-spec-3: FR-010 path without an image | T015, T017 |
| RES-spec-3: D108 fixtures and README | T011, T035 |
| RES-spec-3: D106 round trip | T027, T028 |
| RES-spec-3: D92 / D101 / US-4 aligned with D107 | T007 |
| FOR-PLAN: D104 fields | T011, T012, T013 |
| FOR-PLAN: oracle direction and style | T002, T033 |
| FOR-PLAN: `findFileWithModel` order | T008 |
| FOR-PLAN: `views`-block styles, style and `rank` targets | T003, T004, T006 |
| FOR-PLAN: `extend` identity title | T031 |
| FOR-PLAN: leading comments of a move | T017 |
| FOR-PLAN: `matchTitle` vs effective title | T027 |
