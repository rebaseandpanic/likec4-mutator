# Plan: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Requirements**: docs/plan/lc4m-15.30/spec.md · **Task**: lc4m-15.30 (includes lc4m-17) · **Revision** r1 (after plan critique round 1)

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
- **Independent oracle first.** The test helper gains a LikeC4-linked reference oracle for the whole catalogue universe: every written reference place, its role, its LikeC4-linked target (unresolved included) and whether it sits inside an unmodelled construct. Kind and tag references are covered too.
- **Shared read side.** A new *reference catalogue* is built on the existing resolvers (`WorkspaceIndex` / `EndpointResolver`, `ViewReferenceResolver`, `DeploymentResolver`). It lists every FR-001 reference with:
  - its place, written text, text range and target;
  - its statement class (FR-003);
  - the *unmodelled boundary* flag.
  It lands together with its first consumer, the widened reference snapshot.
- **Place resolver.** Answers "what does text T resolve to at this place, in the current state". It lands with its first consumer, `renameElement`.
- **Unmodelled-name inventory.** Covers every identifier-reference class inside unmodelled constructs (`global`, imports, opaque flow blocks, unrecovered text). It answers FR-004 in two modes: *new* (D107 / D110) and *affected* (removals, old names). Each mode lands with its first consumer.
- **Reference snapshot.** Built on the catalogue, it always covers views and pairs references across a rename or move by one written pairing rule.
- **Writers.** They reuse the existing seams: `BodyInsertions`, `buildRemovalEdit`, `chooseBlockPlacement` (widened to `model` / `specification`), `applyEditGroups`, snapshot/restore, and the per-feature `apply` ops under the `MUTATION_FIELDS` exhaustiveness check.
- **Atomic tasks.** Every task's behavioural gate can be reached at its own commit. A mechanism is merged with its first product consumer; merged ids are listed, and no id is renumbered.

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
    - keys are `JSON.stringify([file, frames, role, text])` plus `#occurrence`; frame descriptors are `model`, `deployment`, `views`, `el:<fqn>`, `extend:`, `node:`, `inst:`, `dextend:`, `view:` with per-parent ordinals (`:192-208`, `:244-274`);
    - `compareReferenceSnapshots` pairs by the prefix before `#`, in source order, and throws internal errors on unmatched prefixes (`:296-351`);
    - view references are opt-in: `attachViewReferences` (`:364-414`) walks every `FqnRef` of element and dynamic view bodies, including style / `rank` targets, `group` predicates and opaque flow blocks;
    - it does not cover `views`-block styles (`ModelViews.styles`) or the `navigateTo` of model and deployment relationship bodies.
  - **`ViewIndex`** (`src/query/view-index.ts`): statement trees with `form: 'opaque'` and `parts`, plus the reverse index of view references.
  - **Grammar AST** (`module.d.mts`):
    - `Globals { predicates, styles }`; `ImportsFromPoject` / `Imported { imported: Reference<Element> }` on the document root (`globals`, `imports`);
    - `ViewRuleRank.targets`, and `ViewRuleStyle` / `DeploymentViewRuleStyle` / `GlobalStyle` `.targets: FqnExpressions`; `ViewRuleGroup.groupRules` (nested);
    - view references are wrappers: `ViewRef` (in `NavigateToProperty`), `DynamicViewRef` (in `RelationNavigateToProperty`), `ElementViewRef` (`extends`).
  - **Reference typing:** `LikeC4AstReflection.getReferenceType(refInfo)` (`module.d.mts:1626`; Langium `AstReflection`) gives the target type of any cross-reference.
  - **Lexer:** `getServices().likec4.parser.Lexer.tokenize(text)` returns `{ tokens, errors, hidden }`. It is already used by `checkBraceBalance` (`src/mutator/brace-balance.ts:18`) and `isLikeC4Id` (`src/parser/grammar.ts:74`).
  - **Block placement:** `chooseBlockPlacement` / `BlockKeyword = 'deployment' | 'views'` (`src/mutator/block-placement.ts`) implements D4/D11/D41 in `mergeOrder` document order.
  - **Body `icon`:**
    - `DeclarationEditOptions.styleIconInBodyIcon` (`src/mutator/element-ops.ts:113-120`) is read inside `updateDeclarationEdits` (`:367-377`);
    - `updateElementEdit` calls `updateDeclarationEdits` without options (`:227`);
    - deployment node and instance updates pass the option.
  - **Parser errors** carry offset and length (`src/parser/parser.ts`). `applyEditsToFile` refuses any edit that leaves the edited file with parse errors.
  - **Oracle:**
    - `buildLikeC4Model` returns warning diagnostics (`tests/helpers/likec4-model.ts:110-112`, `:186-190`);
    - `expectRelationshipsAgreeWithLikeC4` (`:360`) compares neither direction nor style;
    - `linkedReferences` (`:442`) reports only `instanceOf`, `extend <node>` and deployment view references;
    - `linkedViewReferences` (`:1041`) reports only `of`, `extends`, `navigateTo` and `FqnRef`s inside view bodies;
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
- [x] **Tests:**
  - tests are written in the same commit as the code they verify;
  - every rejection is asserted through `InvalidWriteError` and its `field` (plus `candidates` for ambiguity), not through message text; the single exception is the printed position form `file:line:column`, which D106 makes a contract;
  - internal modules are tested only once product code calls them, which is why mechanisms are merged with their first consumer;
  - no visibility is opened for tests.

## Key design decisions

| Decision | Why | Rejected |
|---|---|---|
| **Public API names.** `renameElement(fqn, newName)`, `moveElement(fqn, { parent: string \| null, file? })` → `{ fqn, changedFiles }`. `addKind(type, name, opts)`, `updateKind(type, name, patch)`, `renameKind(type, name, newName)`, `removeKind(type, name)` with `type: 'element' \| 'relationship' \| 'deploymentNode'`; `addTag(name, { file? })`, `renameTag`, `removeTag`. `addElementExtend(fqn, { file, tags?, links?, metadata? })`, `addRelationshipExtend(selector, { file, tags?, links?, metadata?, shared? })`. `apply` ops use the same names and fields; the existing `addElement` mapping `name` → `id` is kept. | D66: one verb per operation; the spec fixes the names to the plan; one name set for the library and `apply` (US-12) | One `updateSpecification` patch; noun-first names |
| **Errors.** Every new write and every remove of US-1 / US-2 reports `InvalidWriteError`; refused edits are wrapped with `refusedOn` (D104). Fields: `fqn` / `id` (remove target, cascade rejections), `newName`, `parent`, `file`, `type`, `name`, `tags[i]`, `kind`, `source` / `target` / `position` (selector), `shared`, `metadata.<key>`. Ambiguity is a `RelationshipAmbiguityError extends InvalidWriteError` with `candidates: { file, line, column, kind?, title?, effectiveTitle?, bidirectional }[]` (1-based, D106). | INV-4; tests assert type and field (test guidelines §5); the round trip of D106 needs machine-readable positions | Message-only errors; a plain `Error` |
| **Accepted-write oracle bundle** (defined once in T002; every acceptance gate below refers to it as "the accepted-write bundle"). `expectAcceptedWrite(before, after, { removedViewId? })` = `expectValidLikeC4(after)` + `expectComputedViewsSurvive(before, after, removedViewId)` (INV-9; element σ never renames view ids) + `introducedWarnings(before, after)` empty (INV-2). | INV-1, INV-2 and INV-9 on every accepted write, stated once | Repeating the three checks per gate; checking INV-9 only for removals |
| **Unmodelled boundary** (defined once in T003; T003, T007, T010, T013, T005, T023 refer to it). A reference place is *unmodelled* when it lies inside a `Globals` block, an `ImportsFromPoject`, an FR-003 opaque statement (`opt`, `loop`, `break`, `alt` and its branches, `try` / `catch` / `finally`, and everything inside), or unrecovered text. An unmodelled place is never cascaded, rewritten or counted as content. In removals it is blocking in both modes, including a `navigateTo` inside an opaque block. | D61, FR-003, FR-004: one boundary for removal, rename, move and additions | Per-operation lists of opaque places |
| **Reference catalogue** (`src/query/reference-catalogue.ts`). One entry per FR-001 reference: `file`, AST node, text range, `role` (FR-001 row), written text, target (element / deployment / view key), enclosing view, container chain (item → rule → group …; step → `par`), statement class (FR-003), the unmodelled flag and a `place` descriptor. Target-indexed queries: into an element subtree, into a deployment subtree, to a view. Built once per index generation. | One mechanism for removal, rename, move and the stability check (D60, Component boundaries) | Per-operation scanners (today's `rejectDeploymentReferences`, `viewReferencesIntoSubtree`) |
| **Place resolver.** `resolveAt(place, text)` resolves any text at an entry's place in the current state, through the existing resolvers. Places: model block, element / `extend` body frame chain, view `of` (views mode), element view body with frame, dynamic document scope, deployment container, `instanceOf`. | FR-011 ("keeps the text if it resolves at its place"); nested relationship targets (US-8) | Rewriting everything to full FQNs (Rejected alternatives) |
| **Snapshot on the catalogue, views always on.** `takeReferenceSnapshot` gets its records from the catalogue, adding `views`-block styles and relationship-body `navigateTo`. The `views` option goes away, so every declaration-changing write checks every reference kind. `compareReferenceSnapshots(before, after, { inserted, expectedPrefix? })`. | US-4 / lc4m-17 / INV-3 | A separate checker per write |
| **Pairing rule across a rename or move** (defined once here; T005 and T017 use it). For each surviving before-record the write computes its **expected post-edit prefix** `[file′, frames′, role, text′]`:  • `file′` is the destination file only when the reference's text lies inside the moved declaration text; otherwise it is the record's own file.  • `frames′` is the frame path of the reference's place after the edit. Every frame ordinal, `model#k`, `views#k` and `deployment#k` included, is the ordinal of the enclosing block after the edit; a `model` block created by the move counts, and an emptied one stays and keeps its ordinal (spec edge case). `el:` / `extend:` / `inst:` descriptors are σ-mapped, and an unnamed instance's `inst:` id follows its rewritten `instanceOf`.  • `role` is unchanged.  • `text′` is the rewritten text, or the written text when it is kept.  Pairing: before-records and after-records are grouped by prefix (expected prefix on the before side, actual prefix on the after side) and paired in source order within each group, as today's compare pairs. The occurrence index is not part of the expected key. After pairing, the after-record's target must equal σ(old target); a mismatch is a `ReferenceChange` and the write is rejected. A group whose sizes differ is an internal error. Text inserted by the write that is not moved declaration text keeps today's `inserted` rule. | The current keys change with σ and with block ordinals; pairing on expected prefixes in source order is the existing comparison with a translated before side | Offset mapping through edits (breaks under the re-indentation of FR-020); a full key that keeps the old occurrence (collides when FR-011 rewrites two texts onto one prefix) |
| **RES-spec-1: new-name rule (D107 / D110) and the unmodelled-name inventory** (`src/query/unmodelled.ts`; defined once, consumers refer). **Inventory** = every identifier reference written inside an unmodelled place (unmodelled boundary), found generically:  (a) every Langium cross-reference in those AST subtrees. Its class comes from `LikeC4AstReflection.getReferenceType`: *element / deployment* (`Referenceable`, `ModelReferenceable`, `Element`, `Imported`'s `imported`, the per-segment `FqnRef` / `StrictFqnRef` values, joined along the `parent` chain into a dotted name with segment positions), *view* (`ViewRef`, `DynamicViewRef`, `ElementViewRef` targets, e.g. `navigateTo v` inside `opt { … }` or in a global predicate's `with { }`), *kind* per kind type (`ElementKind`, `DeploymentNodeKind`, `DeploymentNodeOrElementKind` = shared, `RelationshipKind`), *tag* (`Tag`). Reference types that name none of these (global style ids, custom colors) are ignored by an explicit list; any other reference type is an internal error, so a new grammar class cannot pass silently.  (b) unrecovered text, i.e. in a file with parse errors the tokens of `getServices().likec4.parser.Lexer.tokenize` not covered by any CST leaf, plus the tokens in the parser-error ranges. Identifier tokens joined by `.` tokens form dotted names; their class is unknown, so they match every class.  Comments are `hidden` tokens and strings are string terminals or string AST values; neither is a reference, so both are excluded by construction.  **Modes:** *new* (a bare name, or the leading segment of a dotted name, equal to the name; D107) and *affected* (an identifier equal to the name, or any dotted segment equal to it; D92). A name is matched only against references of its own class or unknown-class tokens.  **Per write:** additions (`addElement`, `addDeploymentNode`, `addDeploymentInstance` with its id named or taken from the element, `addView`) → new mode with the new name; kind and tag additions → not checked; rename → affected mode with the old name plus new mode with `newName`; move → affected mode with the names of every element of the moved subtree, which subsumes new mode with the same names at their new place (D110); element, deployment and view removals → affected mode with the subtree names (the last segment of each element FQN and deployment id) or the view id; kind / tag rename and remove → affected mode with the name in its class.  A hit is an `InvalidWriteError` naming file and line, on the write's field (`name` / `id` / `newName` / `fqn` / `parent`). New mode lands in T007; affected mode lands in T010, its first consumer. | Closes D61, D92, D101, D107, D110 and FR-004 with one rule table over a complete inventory; the stability snapshot cannot substitute, because D93 skips references that did not resolve before | Separate checks per operation; FQN chains only (misses view references, codex F1); resolving opaque references (D61) |
| **Cascade planning** (`src/mutator/cascade-ops.ts`). Collect the AST nodes to remove (never unmodelled places). Normalize them to maximal containers: the item becomes the rule when it was the last item; the rule becomes the group when the group is emptied (recursively); a step becomes its `par` / `parallel` block when emptied; `navigateTo` becomes its `with { }` when emptied. `with` / `where` go with their item. Then build one non-overlapping edit group per file: a list-item edit for `prev`-linked lists, `buildRemovalEdit` for whole statements. | D55; FR-003 "a container a cascade empties"; one atomic application | Removing one construct at a time with reparses (today's removal loop), where emptied containers would be found too late |
| **Content check (D77, D108).** Before applying a cascade, each affected view must keep at least one content-producing statement of FR-003: element and deployment `include` rules (top level or in a `group`); dynamic steps and dynamic `include`. Inherited (`extends`) and `global` content does not count. | FR-003; spikes 03 and 05 | Evaluating inheritance |
| **Leading comments of a moved declaration** (FOR-PLAN). The contiguous `//` and `/* */` comment lines directly above the declaration, with no blank line between them, plus a trailing comment on its last line, move with it. The same range is removed at the source. The text is re-indented to the new depth and written with the target file's line ending (`withLineEnding`). Removals keep today's range (INV-8). | Comments describing the declaration travel with it; a blank line separates file-level comments | Moving every preceding comment; moving none |
| **Rename / move pipeline.** (1) validate and build the catalogue; (2) declaration edits (name token, or cut + reindented insert) in memory; (3) intermediate catalogue, paired with the before-catalogue by the pairing rule; (4) FR-011 text per changed reference through the place resolver — a first pass for everything but deployment paths (`instanceOf` included), a rebuild, then a second pass for deployment paths (an unnamed instance's id follows the rewritten `instanceOf`, spike 05); (5) final stability check by the pairing rule: every survivor resolves to σ(old) (INV-3). All of it runs under snapshot/restore. | FR-010 order dependence; atomicity (INV-4) | One-pass rewriting, which gets the unnamed-instance path wrong |
| **Default file.** `findFileWithModel` is replaced by `chooseBlockPlacement` with `BlockKeyword` widened to `'model'` (T008) and `'specification'` (T021, its first consumer) — FR-021, D62. A new kind or tag goes into the chosen file's first `specification` block, else a new block; never a second block in a file (INV-2 "Prefer one specification per document", spike 04). | One file-choice rule (D62); INV-2 | Load order |
| **Selector** (`src/mutator/relationship-selector.ts`). `RelationshipSelector = UpdateRelationshipMatcher & { matchBidirectional?, position? }`. `matchTitle` keeps today's raw inline title. A bidirectional relationship matches in either order. Candidates show the written and the effective title. The `extend` identity uses the effective title (`workspace.effectiveIdentity`), and D82 rejects a kind-only title. The library gains `removeRelationship(selector)` beside the legacy `(source, target)`; it returns `{ changedFiles }`. | D70, D81, D87, D102, D106; FOR-PLAN on `matchTitle`; source compatibility | Changing `matchTitle` semantics |
| **Relationship comparison in the oracle.** No conditional comparison exists. `expectRelationshipsAgreeWithLikeC4` compares direction unconditionally from T026 on, the commit that adds `RelationshipInfo.bidirectional`; that commit updates every caller. It compares style unconditionally from T033 on. | Test guidelines §6: no green result when the assertion did not run | Comparing a field only when present |
| **Style read shape.** `ElementInfo.ownStyle` (first `style { }` plus body `icon`) and `style` (effective). `ElementKindDefaults extends KindDefaults { style? }` on `fromSpecification`. `RelationshipInfo.ownStyle`, `style` (effective, bidirectional `tail` rule), `fromSpecification: RelationshipKindDefaults { style?, multiple? }`, and `bidirectional: boolean` (T026). The types are the existing `ElementStyle` / `RelationshipStyle`; deployment reads are unchanged. | D69, D74, D89; one value type with deployment | Adding style to `getSpecification()` (D89 rejected it) |
| **`apply` ops land with their feature.** Each group adds its op interface, its `MUTATION_FIELDS` entry and its CLI dispatch case in one commit, so `assertNever` holds. | No ordering-only "apply" group that waits for all features | One big `apply` commit |
| **Release 0.11.0** (minor). Prepared, not pushed, tagged or published. | SC-011 | — |

## Complexity Tracking

| Added layer or generalization | Why and what would happen without it |
|---|---|
| Full linked-reference oracle (T039) | The catalogue's correctness is claimed against LikeC4's linker. The existing helpers see only part of the universe. Without it, catalogue drift in unseen roles (model endpoints, `views`-block styles, globals, unresolved references) would pass. |
| Reference catalogue | Without it, removal, rename, move and stability each re-walk ASTs with their own reference lists, which drift: two critique rounds hit that kind of drift (D95, D96). FR-001's "every reference listed" would not be testable in one place. |
| Place resolver | FR-011 and nested relationship targets need "would this text resolve here". Without it the only safe option is full FQNs, which D58 rejects. |
| Pairing rule on expected post-edit prefixes | Frame-path keys change under rename and move. Without it the existing comparison throws "not found after the write" on every rename or move, or INV-3 goes unchecked. |
| Unmodelled-name inventory with two modes over all reference classes | D61 / FR-004 / D107 / D110 need one rule. Without it, opaque blocks silently re-target (`opt { api -> other }`, critique r4; `opt { … navigateTo v }`, plan critique r1), or unrelated additions are rejected. |
| Cascade normalizer | Without it, emptied rules, groups, `par` and `with` stay behind and fail to parse (spikes 02 and 05), or edits overlap. |
| Kind / tag place catalogue (FR-002) | Rename and remove of kinds and tags need every place with its kind type, including `shared`. Without it, D78 and the negated forms cannot be decided. |
| `chooseBlockPlacement` widened to `model` / `specification` | One file rule (D62). Without it a second placement copy exists and keeps load order (the backlog item). |
| `RelationshipAmbiguityError.candidates` | D106 round trip without parsing message text (test guidelines §5). Without it the caller copies text from a message string. |

No new runtime dependency.

## Decomposition by phases

Execution order (ids are stable, not sequential):

T001, T039, T002 · T003, T007 · T008, T009, T020 · T010, T012, T013, T014 · T005, T017, T018 · T021, T022 · T023, T025 · T027, T028 · T026, T029, T030 · T031, T032 · T033, T034 · T035, T036, T037, T038.

Merged ids:
- T004 and T006 merged into T003;
- T011 merged into T010;
- T015 and T016 merged into T005;
- T019 merged into T009;
- T024 merged into T023.

### Phase Setup

**T001 [TEST]** — new fixtures `tests/fixtures/refs-catalog/` and `tests/fixtures/refs-flows/`: two unrelated neutral specifications (INV-6), each multi-file, with a load order that differs from LikeC4's document order. A precondition test goes in `tests/likec4-validate-oracle.test.ts`.
- Mechanism: together the fixtures hold every FR-001 reference kind, in relative and qualified form, across files and including unresolved references:
  - model, nested and `extend` relationships;
  - `extend X` / `extend a -> b`;
  - view `of`, `extends`;
  - include / exclude items with `x.*`, `x.**`, `x._`, relation predicates, `with`, `where`, inside nested `group`s;
  - dynamic `include`, steps, chains, `par`, `parallel`;
  - opaque `opt` / `alt` / `loop` / `try` / `break` blocks containing step endpoints, kinds, tags and a step `navigateTo`;
  - `rank`, view style rules and `views`-block style rules;
  - every `navigateTo` role;
  - `instanceOf`, named and unnamed instances with deployment paths under them, deployment relationships through instances, `extend <node>` in another file, deployment view rules;
  - `global` predicates (with `with { navigateTo }`) and styles, an import;
  - every FR-002 place, positive and negated, with element kind and deployment node kind sharing a name;
  - a CRLF file.
- Gate: the precondition test asserts both fixtures pass `expectValidLikeC4` (with the unresolved-reference variants kept in separate copies that the consuming tests build).

### Phase Foundational (BLOCKING)

**T039 [TEST]** — `tests/helpers/likec4-model.ts`, `tests/likec4-validate-oracle.test.ts`. Mechanism: the independent LikeC4-linked oracle for the whole catalogue universe.
- `linkedCatalogueReferences(files)` walks LikeC4's linked AST (`AstUtils.streamAst`) and reports every topmost `FqnRef` / `StrictFqnRef`, every view-reference wrapper (`ViewRef`, `DynamicViewRef`, `ElementViewRef`) and every `Imported` reference.
- For each reference it reports:
  - `file`, offset and 1-based line;
  - written text;
  - the target LikeC4 bound (`FqnIndex.resolve` as the existing helpers do; `null` when unresolved);
  - `role`, classified by the helper from AST container types: relationship source / target, extend target, extend relationship source / target, deployment relationship source / target, `instanceOf`, extend node, view `of`, `extends`, view rule, step, each `navigateTo` role, `views`-block style, global predicate / style, import;
  - `unmodelled`, from AST containers: `Globals`, `ImportsFromPoject`, non-`par` `SubflowStep`, `AltSteps`, `TryBlock` / `CatchBlock` / `FinallyBlock`.
- `linkedKindReferences(files)` reports every linked `ElementKind` / `DeploymentNodeKind` / `DeploymentNodeOrElementKind` / `RelationshipKind` / `Tag` reference, with its place, negation and unmodelled flag.
- The helper never calls library code.
- Gate:
  - **role coverage** — a literal list of every FR-001 row and every FR-002 place is asserted to appear at least once in the oracle's output on the T001 fixtures;
  - an unresolved reference reports `null`;
  - on the roles they cover, `linkedReferences` and `linkedViewReferences` agree with the new helper.

**T002 [TEST]** — `tests/helpers/likec4-model.ts`, `tests/likec4-validate-oracle.test.ts`, `tests/types/`. Mechanism: oracle extensions.
- `LikeC4ModelElement.style` and relation `line` / `color` / `head` / `tail` / `isBidirectional`, all from `$data` (before theme defaults, D88).
- `expectElementStylesAgreeWithLikeC4` compares own, kind and effective style; opacity is LikeC4's number against the written percentage.
- `introducedWarnings(before, after)`: the INV-2 messages present after the write and not before.
- `expectAcceptedWrite(before, after, { removedViewId? })`: the accepted-write bundle (Key design decisions).
- `expectSigmaImage(before, after, sigma)`: computed elements, deployment elements and explicit relations of `after` equal those of `before` under the literal σ map the test gives, with own and kind-default values (D76); `linkedCatalogueReferences` targets map by σ.
- `expectRelationshipsAgreeWithLikeC4` is unchanged here; direction lands in T026, style in T033.
- Oracle precondition tests for the spike facts the plan relies on:
  - bidirectional `tail` rule;
  - `Redundant as icon defined on element` warning;
  - `Prefer one specification per document`;
  - an `extend` matching nothing warns;
  - D109: a deployment view with `element.kind` / `element.tag` is absent from `computedViews`.
- Gate: the existing oracle tests are green unchanged; the precondition tests are green.

**T003 [TEST]** (T004, T006 merged into T003) — `src/query/view-index.ts`, new `src/query/reference-catalogue.ts`, `src/query/reference-snapshot.ts`, `src/mutator/mutator.ts`, new `tests/query/reference-catalogue.test.ts`, `tests/query/reference-snapshot.test.ts`.

Mechanism:
- **Statement classes.** The FR-003 class of every view body node, the container chain of each rule item (nested `group`s included), `views`-block style rules (`ModelViews.styles`) as `views`-level rules, and the **unmodelled boundary** predicate (defined here).
- **Catalogue.** The catalogue as defined in Key design decisions. Sources:
  - `resolveDocumentReferences`, `resolveRelations` (model);
  - `DeploymentResolver` (deployment, `instanceOf`, view rules);
  - `ViewReferenceResolver` (view bodies, step endpoints, `extends`);
  - `ViewIndex.referrers()` (all `navigateTo`, model and deployment relationship bodies included);
  - `views`-block style targets;
  - `global` references (flagged unmodelled).
- **Snapshot (first product consumer).** `takeReferenceSnapshot` is rebuilt on the catalogue; the `views` option is removed; `compareReferenceSnapshots` gains `expectedPrefix`. The pairing rule is implemented here; its first product use is T005.
- **Callers:** `addElement`, `addView`, `addDeploymentNode`, `addDeploymentInstance`, the deployment removals and `removeView` now check every reference kind.

Gate:
- (class "every FR-001 row present in the catalogue and equal to the linker") **role coverage first**: the literal FR-001 row list is asserted present in both `linkedCatalogueReferences` and the catalogue on both fixtures. Then the catalogue equals the oracle one to one on `(file, offset, role, text, target, unmodelled)`, unresolved references included. The expected side is the T039 oracle only.
- Snapshot: the existing snapshot tests are green, with the `views` option replaced. New direct tests: a `views`-block style target and a relationship-body `navigateTo` are covered; a survivor re-targeted by an addition is reported.
- The full suite is green except tests whose expectations change by INV-8. Those are rewritten in the same commit, and each is named in the commit message.

**T007 [TEST]** — new `src/query/unmodelled.ts`, `src/mutator/mutator.ts`, new `tests/mutator/add-references-stability.test.ts`, `tests/cli/cli-apply-validation.test.ts`. Mechanism: the unmodelled-name inventory and its **new** mode (Key design decisions, RES-spec-1), wired into the four additions (US-4, D101, D107; INV-8 new rejections).
- Gate (class "an addition never re-targets, makes ambiguous or captures a reference"):
  - the lc4m-17 repro is rejected in the library and in `apply` (`mutations[i].id`), also with the step inside `opt` and inside an `alt` branch;
  - one test per reference kind newly covered by the widened snapshot (view rule, step, dynamic `include`, `navigateTo`, `extends`, style / `rank` target, `views`-block style);
  - **one test per identifier-reference class of the inventory, in new mode:**
    - element `FqnRef` in an opaque block and in a global predicate (`addElement`);
    - deployment-class reference (`addDeploymentNode`, `addDeploymentInstance`, both the named id and the id taken from the element);
    - view reference: `DynamicViewRef` in an opaque step's `navigateTo`, `ViewRef` in a global predicate's `with { navigateTo }` (`addView`);
    - `Imported` (`addElement`);
    - unrecovered tokens (`addElement` while another file has a parse error);
  - **new-mode positions:** a bare name and a leading segment block; a later dotted segment does not block; a longer identifier does not block;
  - **exclusions:** the same name only in a comment or in a string value does not block;
  - sources are byte-identical on every rejection.

**T008 [TEST]** — `src/mutator/block-placement.ts`, `src/mutator/mutator.ts`, new `tests/mutator/root-placement-default.test.ts`. Mechanism: `BlockKeyword` gains `model`; `findFileWithModel` is deleted; root `addElement` and top-level `addRelationship` take the FR-021 default (D62; INV-8 change).
- Gate:
  - on a project whose load order differs from document order, root `addElement` and top-level `addRelationship` write into the first file with a `model` block in document order;
  - the deployment and view placement tests are green unchanged;
  - the accepted-write bundle passes.

**T009 [TEST]** (T019 merged into T009) — `src/mutator/body-layout.ts`, `src/mutator/element-ops.ts`, `src/mutator/mutator.ts`, new `tests/mutator/add-element-placement.test.ts`, `tests/integration/edge-cases.test.ts:603` (rewritten: a bodiless parent is now accepted). Mechanism:
- `BodyInsertions` creates the body of a bodiless element declaration (both forms, inline strings kept); `buildCombinedBodyInsertElement` and the deployment `declarationBodyInsertEdit` collapse into it.
- Its first consumer: `addElement(parent, { …, file? })` into a bodiless parent.
- `file` for a root element only (`checkFile`, D63; `file` with a parent rejected); model block creation through T008.

Gate:
- both declaration forms, with and without inline strings, compared with `expectAgreesWithLikeC4`;
- chosen file, missing block, and the default rule on differing orders;
- `tests/mutator/insert-layout.test.ts`, `tests/mutator/codegen.test.ts` and the deployment body tests are green unchanged;
- the accepted-write bundle passes;
- unloaded and colliding file names are rejected byte-identical.

**T020 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-apply-validation.test.ts`. Mechanism: `apply` `addElement` with `parent` optional (absent means root), `title` optional and `file` (D65). Gate: root and title-less additions pass the accepted-write bundle; `file` with `parent` exits 1 with `mutations[i].file`.

### Phase US-1, US-2: removal policy (MVP)

**T010 [TEST]** (T011 merged into T010) — new `src/mutator/cascade-ops.ts`, `src/query/unmodelled.ts` (affected mode), `src/mutator/mutator.ts` (`removeElement(fqn, { cascade? })`, result `cascaded[]`), new `tests/mutator/remove-element-references.test.ts`, existing remove tests.

Mechanism:
- the cascade planner (Key design decisions) — normalization, list-item removal with `with` / `where`, `navigateTo` and emptied `with { }`, emptied `par` / `parallel` (reusing `leaveParallel` of `step-ops.ts`), one edit group per file;
- the inventory's **affected** mode;
- catalogue entries into the subtree, classified per FR-001 as owned / cascadable / blocking (D56; every unmodelled place is blocking by the unmodelled boundary);
- the D77 content check (D108);
- the `instanceOf` closure (instances cascaded as `removeDeploymentInstance` with `cascade`), and deployment relationships through instances;
- `rejectDeploymentReferences` is replaced by the catalogue;
- the stability check on survivors;
- D104 errors (an unknown `fqn` and a refused edit become `InvalidWriteError('fqn')`);
- a rejection lists every reference, separating blocking from cascadable.

Gate (class "every FR-001 row, both modes"):
- one test per row. Without `cascade`: rejected with byte-identical sources and every reference listed. With `cascade`: the accepted-write bundle, exactly the FR-001 constructs gone, and every other reference resolving to its old target (`linkedCatalogueReferences`).
- The a1 model is rejected in both modes, with `of` reported as blocking and the include and step as cascadable.
- The D77 fixtures are rejected: scoped and unscoped views with a remaining `exclude`, a dynamic view whose only step names the removed element, and `view child extends base { include b }`.
- **Affected mode, one test per inventory class:** element `FqnRef` and dotted later segment in an opaque block, in a global predicate and in a global style; `Imported`; unrecovered tokens. Each is blocking in both modes; a longer identifier and a comment or string do not block.

**T012 [TEST]** — `src/mutator/mutator.ts`, `src/mutator/deployment-ops.ts`, new `tests/mutator/deployment-remove-references.test.ts`. Mechanism: `removeDeploymentNode` / `removeDeploymentInstance` gain `{ cascade? }`. Deployment view items cascade through the T010 planner, with D77 for deployment views. Affected mode applies to the subtree's ids. Owned constructs are unchanged (D57); D104. Gate: the same class as T010 for deployment view rows (include, exclude, style target), both modes, with the accepted-write bundle on acceptance.

**T013 [TEST]** — `src/mutator/mutator.ts`, `src/mutator/view-ops.ts`, `tests/mutator/views-remove.test.ts`. Mechanism: `removeView(id, { cascade? })`.
- `extends` is rejected in both modes, naming the chain.
- `navigateTo` in its five roles is rejected by default; with `cascade` the property is removed, and an emptied `with { }` with it.
- A `navigateTo` at an unmodelled place (inside an opaque block, in a global predicate) is blocking in both modes (unmodelled boundary; affected mode, view class).
- References inside the removed view do not block it (D43).

Gate: one test per referrer role in both modes; the opaque and global `navigateTo` cases are rejected byte-identical under `cascade`; acceptance passes the accepted-write bundle with `removedViewId`.

**T014 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-references.test.ts`, `tests/cli/cli-standalone-commands.test.ts`. Mechanism: `cascade` on the four remove ops; result lines list the cascaded constructs; the standalone commands keep their options and apply the new rejections (D84). Gate: each op in both modes; a rejection exits 1 with `mutations[i].fqn` / `id` and writes nothing.

### Phase US-3: rename and move

**T005 [TEST]** (T015, T016 merged into T005) — `src/query/workspace-index.ts` (public frame-chain resolution for an element / `extend` body), `src/query/reference-catalogue.ts` (`resolveAt`), new `src/mutator/rename-ops.ts`, `src/mutator/mutator.ts` (`renameElement`), new `tests/mutator/rename-element.test.ts`, `tests/query/reference-catalogue.test.ts`.

Mechanism:
- the place resolver;
- σ per FR-010, including unnamed instance ids and the deployment paths under them; a path without an image is rejected, listing it;
- the FR-011 text choice through `resolveAt` on the intermediate state, in two passes;
- the expected-prefix computation of the pairing rule;
- `renameElement`: the name-token edit (both declaration forms), `newName` checked by `checkElementName`, a collision under the parent;
- pre-write rejections: the inventory in affected mode for the old name and new mode for `newName` (D110); a parent-child relationship or step after σ (`isSameHierarchy` on the σ-mapped endpoints of every relationship and step); the D97 sibling-id collision, including ids declared in `extend <node>` blocks in any file (`idsDeclaredIn`); a reference with no rewritable text.

Gate:
- (class "`resolveAt` agrees with LikeC4 at every place kind"): for each place kind, `resolveAt(entry.place, entry.text)` equals the entry's target; for one entry per place kind, an alternative text (bare name, qualified name, full FQN) written into a copy of the fixture resolves as `linkedCatalogueReferences` reports there.
- (class "σ-equality and written-form preservation"):
  - every FR-001 reference kind across two files, relative and qualified, gives `expectSigmaImage` and the accepted-write bundle;
  - relative text that still resolves is unchanged;
  - title-less and kind-default-title elements;
  - the unnamed-instance fixture referenced from a deployment view and from deployment relationships to the instance and to a path under it.
- Rejections:
  - collisions with a sibling node, a named instance, and an instance declared in an `extend` block of the node in another file;
  - the rename of `other.foo` to `api` with `opt { api -> other }` present;
  - **new-mode negatives for `newName`:** `newName` equal only to a later dotted segment, or contained in a longer identifier, inside an opaque block does not block;
  - the old name at an unmodelled place (affected mode) blocks;
  - each rejection is byte-identical.

**T017 [TEST]** — `src/mutator/mutator.ts` (`moveElement`), `src/mutator/rename-ops.ts`, new `tests/mutator/move-element.test.ts`. Mechanism:
- the declaration text with its leading comments, re-indented, in the target file's line ending (Key design decisions);
- FR-020 placement into the parent body (created through T009) or the first `model` block of the chosen or current file (created through T008, D98);
- the T005 pipeline and pairing rule with `file′` and block ordinals;
- the inventory in affected mode for the subtree names (D110);
- rejections: `file` with a parent; no-op; own subtree; cross-file relative icon or link anywhere in the moved text (D85, D99); a path without an image.

Gate:
- `expectSigmaImage` over every reference kind across two files, plus the accepted-write bundle;
- a move from a later `model` block into an earlier one, and a root-to-root move into another file, are accepted (block ordinal and file change of the pairing rule);
- a move under `include app.*` shows the documented hierarchy effect (the computed nodes before and after are the literal expectation from spike 03);
- a root move without `file` is a no-op rejection;
- a chosen file without a `model` block;
- every rejection byte-identical.

**T018 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-rename-move.test.ts`. Mechanism: `renameElement` (`fqn`, `newName`) and `moveElement` (`fqn`, `parent`, `file`) ops. Gate: success passes the accepted-write bundle; library rejections exit 1 with the field path and write nothing.

### Phase US-6, US-7: specification

**T021 [TEST]** — new `src/mutator/specification-ops.ts`, `src/mutator/codegen.ts`, `src/parser/grammar.ts` (name probe), `src/mutator/block-placement.ts` (`specification` keyword), `src/mutator/mutator.ts`, new `tests/mutator/specification-write.test.ts`. Mechanism: `addKind`, `updateKind`, `addTag`.
- Name validity through a parse probe of the declaration in its position (D67).
- Same-type duplicates in any file; D94 for an update; `summary` on a relationship kind rejected; declared tags.
- The D100 guard on a relationship kind `title` change.
- Placement through the `specification` keyword into the file's existing block.
- Updates edit inside the kind body (created if absent) with D33 semantics; style, notation, `multiple` and colors are kept byte for byte.

Gate:
- each kind type and tags, added and updated;
- the effective values of elements and relationships of that kind are compared with ModelBuilder (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`);
- one accepted keyword-like name (`model`) and one rejected (`view`);
- chosen file, missing `specification` block, and the default rule on differing orders;
- **FR-004 / D107:** a kind or tag addition whose name appears as a bare identifier in an opaque block or a global construct is accepted (additions of kinds and tags are not checked);
- the accepted-write bundle;
- every rejection is byte-identical.

**T022 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-specification.test.ts`. Mechanism: `addKind` / `updateKind` / `addTag` ops. Gate: each op, plus the rejection paths.

**T023 [TEST]** (T024 merged into T023) — new `src/query/kind-places.ts`, `src/mutator/specification-ops.ts`, `src/mutator/mutator.ts`, new `tests/query/kind-places.test.ts`, new `tests/mutator/specification-rename-remove.test.ts`.

Mechanism:
- **FR-002 place catalogue.** Every FR-002 place in every file, with its kind type (element / deployment node / relationship / shared / tag) and its negation. Unmodelled places are excluded; they are the inventory's (FR-004).
- **First consumer.** `renameKind` / `renameTag` / `removeKind` / `removeTag`:
  - FR-002 steps 1–3, with the D78 shared-name guard;
  - D94 duplicates;
  - affected mode in the kind or tag class;
  - an emptied `specification { }` is kept;
  - `#old` inside strings is untouched;
  - a removal rejection lists every use.

Gate:
- the places equal `linkedKindReferences` one to one on the T001 fixtures (unmodelled places excluded on both sides by the oracle's own flag), and each `kind is` / participant place has type `shared`;
- one rename test per FR-002 place, positive and negated, across two files;
- a removal-rejection test for kinds and tags used only at that place;
- affected mode in the kind and tag classes: a kind in an opaque step connector and a tag in a global predicate block the rename and the removal;
- the `vm` / `vm` D78 fixtures, with and without `where kind is (not) vm` in an element view and a deployment view, for the rename of each;
- a rename into a name the other type has;
- results pass the accepted-write bundle, and the computed model reports the new names on the same elements and relationships.

**RES-spec-2 (D109).** For every `element.kind` / `element.tag` expression in a deployment view (include and exclude predicates and style targets), the test:
- asserts the precondition that `computedViews` before the write lacks the view;
- asserts the accepted-write bundle on the result (its view-survival part holds trivially for that view);
- asserts that the rule text read back through `getView(id).rules[i].text` equals the literal expected text;
- makes no computed-view comparison.

**T025 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-apply-specification.test.ts`. Mechanism: the rename and remove ops. Gate: each op, plus the rejection paths.

### Phase US-9, US-8: relationships

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
- the deployment relationship tests are green unchanged;
- acceptance passes the accepted-write bundle.

**T028 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-relationship-selector.test.ts`. Mechanism: `matchBidirectional` and `position` on `updateRelationship` / `removeRelationship`. A position refers to the state after the preceding mutations (D102, D106).
- Gate: the round trip — the position printed by an ambiguity error, which D106 makes the contract form, is passed back in a second `apply` and selects that candidate; the error path names `mutations[i]`.

**T026 [TEST]** — `src/query/types.ts`, `src/query/query.ts`, `src/query/relation-extends.ts`, `tests/helpers/likec4-model.ts` (direction compared unconditionally; every caller updated), new `tests/query/relationship-direction-read.test.ts`. Mechanism: `RelationshipInfo.bidirectional`; `ExtendContribution.bidirectional` for relationship blocks (D69). Gate: `->`, `<->`, `-[k]<->` and `.k` agree with LikeC4's `isBidirectional` through `expectRelationshipsAgreeWithLikeC4`; every existing caller of that helper is green with direction compared.

**T029 [TEST]** — `src/mutator/codegen.ts` (`generateRelationship` with kind, dot form, `<->`, sourceless nested), `src/mutator/relationship-ops.ts`, `src/mutator/mutator.ts`, new `tests/mutator/add-relationship-forms.test.ts`. Mechanism: `addRelationship(source, target, label?, { …, kind?, kindForm?, bidirectional?, placement?: 'top' | 'nested', file?, shared? })`.
- `checkKind('relationship')`; dot form with `bidirectional` rejected.
- Nested placement goes into the source's declaration body (T009) with the target text chosen through `resolveAt` (T005); `file` with nested rejected.
- `file` for top level goes through T008 (US-5).
- D83 against `extend a -> b` identities, unless `shared`.

Gate:
- every US-8 spelling is compared with `expectRelationshipsAgreeWithLikeC4`, with kind and direction compared (from T026);
- chosen file, missing block, and the default rule on differing orders;
- D83 rejection and its `shared` acceptance;
- the accepted-write bundle;
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
- the accepted-write bundle, whose warning part covers `does not match any relation`;
- every rejection is byte-identical.

**T032 [TEST]** — `src/mutations-file.ts`, `src/cli.ts`, `tests/cli/cli-extend.test.ts`. Mechanism: the two ops. Gate: success and rejection paths.

### Phase US-11: styles

**T033 [TEST]** — `src/query/types.ts`, `src/query/query.ts`, `src/query/kind-specs.ts`, `src/query/style-read.ts` (the bidirectional `tail` rule shared with `deployment-query.ts`), `tests/helpers/likec4-model.ts` (style compared unconditionally in `expectRelationshipsAgreeWithLikeC4`; callers updated), `tests/types/`, new `tests/query/styles-read.test.ts`. Mechanism: the style read shape of Key design decisions (D74, D89). Gate: every style field of the grammar, own and kind values and their combination, body `icon` over `style { icon }`, and kind `multiple`, all equal LikeC4's `$data` (D88); the deployment reader tests are green unchanged.

**T034 [TEST]** — `src/mutator/element-ops.ts`, `src/mutator/mutator.ts`, new `tests/mutator/style-body-icon.test.ts`. Mechanism: D75. `updateElementEdit` forwards `{ styleIconInBodyIcon: true }` into `updateDeclarationEdits` (today it passes no options, `element-ops.ts:227`), the same reader deployment nodes and instances use. Gate: the body `icon` is rewritten; no `style { icon }` is written; the accepted-write bundle (no `Redundant as icon`); an already present `style { icon }` stays byte for byte.

### Phase Polish

**T035** — `README.md`. Mechanism: consolidated sections (SC-012):
- the FR-001 table, with the unmodelled boundary;
- placement and file choice (D62, D63, D85, D98);
- "Specification defaults → Writing" rewritten;
- "`extend` blocks → Writing";
- relationships (kind, direction, nesting, selector, positions);
- styles (D74, D75);
- the move hierarchy effect (D76) and manual layouts (D91);
- standalone CLI vs `apply` (D84);
- D108;
- D109;
- the RES-plan-2 conservative move rule;
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
| S1 | likec4-mutator | G1 Oracle | T001, T039, T002 | Fixtures and the independent oracles are reviewed before any code depends on them |
| S1 | likec4-mutator | G2 Reference foundation | T003, T007 | One layer: catalogue with its snapshot consumer, then the inventory with its addition consumers; closes US-4 / lc4m-17 |
| S1 | likec4-mutator | G3 Placement | T008, T009, T020 | US-5 for root and child elements: block placement, body creation and `apply` `addElement` |
| S1 | likec4-mutator | G4 Removal policy | T010, T012, T013, T014 | US-1 / US-2 share the cascade planner, affected mode and the content check |
| S1 | likec4-mutator | G5 Rename and move | T005, T017, T018 | US-3 shares σ, the place resolver, the rewriter and the pairing rule |
| S1 | likec4-mutator | G7a Specification add / update | T021, T022 | US-6 shares `specification-ops.ts` and the name and duplicate checks |
| S1 | likec4-mutator | G7b Specification rename / remove | T023, T025 | US-7 shares the FR-002 place catalogue |
| S1 | likec4-mutator | G8a Relationship selector | T027, T028 | US-9: one selector in the library and `apply` |
| S1 | likec4-mutator | G8b Relationship direction and writes | T026, T029, T030 | Direction is the read contract the US-8 writes are compared on |
| S1 | likec4-mutator | G9 `extend` creation | T031, T032 | US-10 |
| S1 | likec4-mutator | G10 Styles | T033, T034 | US-11: one read shape plus the body-icon fix |
| S1 | likec4-mutator | G11 Docs and release | T035, T036, T037, T038 | Cross-cutting docs and release preparation |

There are no solo groups.

## Dependencies and build order

Edges exist only where code is really needed:
- **G1** → every other group with tests: they use the fixtures and the oracle helpers.
- **G2** ← G1.
- **G3** ← G1.
- **G4** ← G2 (catalogue, unmodelled boundary, inventory, snapshot).
- **G5** ← G2 (catalogue, pairing rule, inventory new mode), G3 (T008 model placement, T009 body creation), G4 (T010 affected mode).
- **G7a** ← G3 (T008 placement, widened in T021).
- **G7b** ← G4 (T010 affected mode) and G7a (shared name and duplicate checks in `specification-ops.ts`).
- **G8a** ← G1.
- **G8b** ← G3 (T008, T009) and G5 (T005 `resolveAt`). Inside G8b, T029 ← T026 (direction contract). G8b does not wait for G8a.
- **G9** ← G3 (T008) and G8a (selector).
- **G10** ← G1.
- **G11** ← all: the docs describe delivered behaviour, and the version closes the run.

There are no cycles. Ready sets in waves: {G1} → {G2, G3, G8a, G10} → {G4, G7a, G9} → {G5, G7b} → {G8b} → G11. The execution order listed at the top of the decomposition is a topological order of the tasks. Groups in one wave share files (`mutator.ts`, `cli.ts`, `mutations-file.ts`), so a wave is freedom of order in one stream, not a parallel schedule. A run of the three suite parts plus `npm run lint` ends each group.

## Delivery strategy

1. **MVP = G1, G2, G3, G4** (removals never dangle; lc4m-17 closed). STOP & VALIDATE:
   - T039 role coverage and the T003 catalogue = linker equality;
   - every FR-001 row is tested in both modes;
   - every inventory class is tested in new mode (T007) and affected mode (T010, T013);
   - the a1 model and the D77 / D108 fixtures behave as specified;
   - the INV-8 test changes are listed.
2. **G5.** STOP: `resolveAt` equality with the oracle; `expectSigmaImage` over every reference kind, with block-ordinal and cross-file moves; the D97 / D110 / FR-010 rejections and the new-mode negatives.
3. **G7a, G7b.** STOP: SC-005 file-choice matrix; SC-006, including D78 and D109.
4. **G8a, G8b, G9.** STOP: SC-007 with direction compared, SC-008 with the D106 round trip, SC-009.
5. **G10.** STOP: SC-010.
6. **G11.** STOP: `npm run lint`, the three suite parts and `npm run build`. Prepared, not published.

## Risks and rollback

- **Catalogue drift from LikeC4 scoping:** T003 compares every role, after role coverage, with the independent T039 oracle; T005 compares every place kind.
- **Widened snapshot (T003) turns hidden pairing gaps into internal errors on existing writes:** the full suite runs in T003's commit, and every changed expectation is tied to an INV-8 item.
- **Pairing errors on moves:** the pairing rule fixes file, block ordinals, descriptors and text. T017 gates moves across `model` blocks and files; any mismatch is an internal error or a `ReferenceChange` (red, never silent).
- **A grammar class missing from the inventory:** an unknown reference type is an internal error by the inventory rule, and T007 / T010 / T013 / T023 gate each known class.
- **Performance:** the catalogue is built two or three times per rename or move (no numeric bound, per the spec). Per-generation resolver caching is reused.
- **Rollback:** each group is a contiguous series of atomic commits on the working branch; a failing group is reverted with `git revert`. Nothing is pushed.

## Known residuals

- **RES-plan-1 · MINOR.** `addRelationship` has no `checkMetadata` today, while `addDeploymentRelationship` has. The spec does not list adding it among the INV-8 changes, so the plan leaves it; the new nested and typed forms inherit the gap. → carrier: lc4m-15.31 (semantic validation).
- **RES-plan-2 · MINOR.** FR-004 in affected mode for moves uses every subtree name, so a same-named reference in an opaque block that refers to a different element also blocks the move. This is the conservative side; the error names the block. → documented in README (T035).
- RES-plan-3 is closed: the lexer is the existing `getServices().likec4.parser.Lexer.tokenize`.

## Spec traceability

| Spec id | Tasks |
|---|---|
| US-1 | T003, T010, T012, T014 |
| US-2 | T010, T013, T014 |
| US-3 | T005, T017, T018 |
| US-4 | T003, T007 |
| US-5 | T008, T009, T020, T029, T031 |
| US-6 | T021, T022 |
| US-7 | T023, T025 |
| US-8 | T029, T030 |
| US-9 | T026, T027, T028 |
| US-10 | T031, T032 |
| US-11 | T033, T034 |
| US-12 | T014, T018, T020, T022, T025, T028, T030, T032 |
| INV-1 | T002 (accepted-write bundle), every acceptance gate of T005–T034 |
| INV-2 | T002 (accepted-write bundle), T021, T031, T034 |
| INV-3 | T003, T005, T017 |
| INV-4 | T010, T012, T013, T027, every rejection gate |
| INV-5 | T009, T010, T017, T021, T034 |
| INV-6 | T001 |
| INV-7 | T002, T026, T033, T021 |
| INV-8 | T003, T007, T008, T009, T010, T027, T029, T034, T037 |
| INV-9 | T002 (accepted-write bundle); asserted by the acceptance gates of T005, T008, T009, T010, T012, T013 (`removedViewId`), T017, T020, T021, T023, T027, T029, T031, T034 |
| FR-001 | T039, T003, T010, T012, T013, T035 |
| FR-002 | T039, T023 |
| FR-003 | T003, T010 |
| FR-004 | T003 (boundary), T007 (new mode), T010 (affected mode), T013, T005, T017, T021 (kind / tag additions not checked), T023 |
| FR-010 | T005, T017 |
| FR-011 | T005 |
| FR-020 | T017 |
| FR-021 | T008, T009, T021, T029 |
| FR-050 | T031 |
| SC-001 | T010, T012, T013 |
| SC-002 | T010, T012, T013 |
| SC-003 | T002, T005, T017 |
| SC-004 | T007 |
| SC-005 | T008, T009, T017, T021, T029, T031 |
| SC-006 | T021, T022, T023, T025 |
| SC-007 | T026, T029 |
| SC-008 | T027, T028 |
| SC-009 | T031 |
| SC-010 | T033, T034 |
| SC-011 | T036, T038 |
| SC-012 | T035, T037 |
| D53 | T007 |
| D54 | T010, T012, T013 |
| D55 | T010 |
| D56 | T010, T013 |
| D57 | T010, T012 |
| D58 | T005 |
| D59 | T036 |
| D60 | T003 |
| D61 | T003, T007, T010, T013, T005 |
| D62 | T008, T009, T021, T029 |
| D63 | T009, T029 |
| D64 | T009 |
| D65 | T020 |
| D66 | T021, T023 |
| D67 | T021 |
| D68 | T029 |
| D69 | T026 |
| D70 | T027 |
| D71 | T031 |
| D72 | T031 |
| D73 | T036 |
| D74 | T033 |
| D75 | T034 |
| D76 | T002, T005, T017, T035 |
| D77 | T010, T012 |
| D78 | T023 |
| D79 | T039, T023 |
| D80 | T003, T010 |
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
| D92 | T010 |
| D93 | T003, T005 |
| D94 | T021, T023 |
| D95 | T023 |
| D96 | T003 |
| D97 | T005 |
| D98 | T017 |
| D99 | T017 |
| D100 | T021 |
| D101 | T007 |
| D102 | T027, T028 |
| D103 | T031 |
| D104 | T010, T012, T013 |
| D105 | T027, T036 |
| D106 | T027, T028 |
| D107 | T007, T021 |
| D108 | T010, T035 |
| D109 | T002, T023, T035 |
| D110 | T005, T017 |
| RES-spec-1 | T007, T010, T005, T017 (rule table in Key design decisions) |
| RES-spec-2 | T002, T023 |
| RES-spec-3: `extend`-body siblings in D97 | T005 |
| RES-spec-3: FR-010 path without an image | T005, T017 |
| RES-spec-3: D108 fixtures and README | T010, T035 |
| RES-spec-3: D106 round trip | T027, T028 |
| RES-spec-3: D92 / D101 / US-4 aligned with D107 | T007, T010, T005 |
| FOR-PLAN: D104 fields | T010, T012, T013 |
| FOR-PLAN: oracle direction and style | T002, T026, T033 |
| FOR-PLAN: `findFileWithModel` order | T008 |
| FOR-PLAN: `views`-block styles, style and `rank` targets | T039, T003 |
| FOR-PLAN: `extend` identity title | T031 |
| FOR-PLAN: leading comments of a move | T017 |
| FOR-PLAN: `matchTitle` vs effective title | T027 |
