# Plan: Read and edit LikeC4 views and dynamic view steps

**Date** 2026-10-15 · **Source of requirements**: `docs/plan/lc4m-15.29/spec.md` · **Task**: lc4m-15.29

## Summary

This plan delivers the spec's view reads (US-1, US-2, US-3, US-4), view, rule and step writes (US-5 to US-11) and the matching `apply` operations (US-12). Read values must equal LikeC4 1.59.4's per-document parsed views (INV-4). No accepted write may introduce a `likec4 validate` error (INV-1) or silently drop a computed view (INV-9).

Approach:
- **Oracle first.** The test helper gains:
  - LikeC4's per-document parsed views, taken before `extends` is resolved;
  - computed views with nodes, edges and step sequence;
  - linker targets of view-body references.
- **Read side.** A new workspace-level `ViewIndex` recovers source order from CST offsets. A new `ViewReferenceResolver` mirrors LikeC4's view scoping (D25). It reuses `EndpointResolver` through a new `ReferencePosition` variant, and `DeploymentResolver.resolveText` for deployment views.
- **Read API order.** The internal rule reader and step reader are built and verified first, each on its own class. The public `listViews` / `getView` lands last, with the full field-by-field comparison.
- **Write side.** New writers reuse the existing seams: `BodyInsertions`, `buildRemovalEdit`, the tag/link editors, `applyEditGroups`, snapshot/restore and the reference snapshot. Two seams are generalized instead of forked:
  - deployment block placement, which becomes a shared block placement (D27, D41);
  - `isSingleIncludeRule`, which becomes a rule-text parser.
- **Rule checks.** One rule admissibility check (D23, D34, D35) serves `addView`, `addViewRule` and `replaceViewRule`. It includes semantic validation of every property inside `with { … }`.
- **`par` blocks.** A `par` block is never left contributing no LikeC4 step (D40). One step-contribution predicate, mirroring LikeC4's step parse, decides it for reads and writes.
- **`apply`.** It gains 10 operations and the new `addView` fields under the existing `MUTATION_FIELDS` exhaustiveness check.

## Technical context

- **Repository:** `likec4-mutator`, a single public repository. TypeScript ESM, `tsdown` build, `vitest`. Runtime dependencies are `@likec4/language-server` / `@likec4/core` 1.59.4, used unlinked through `LangiumParser`, and `commander`. **No new dependency.**
- **Tests:** unit only.
  - `npm test`; a focused run is `npx vitest run --maxWorkers=2 <files>`.
  - `npm run lint` = `tsc --noEmit` + `tsc -p scripts` + `scripts/grammar-rules.ts --check docs/likec4-coverage.md`.
  - Oracles live in `tests/helpers/likec4-model.ts`.
- **Contracts touched:**
  - `LikeC4Mutator`: new read and write methods. `addView` gains fields, rejections, block creation and the LikeC4 document-order default (D41). Its return stays `void`.
  - `src/index.ts`: new exported types.
  - `apply` mutations file: new ops, and new `addView` fields.
  - Docs: README, CHANGELOG, `docs/likec4-coverage.md`.
- **Unchanged:** `C4Query`, element, relationship and deployment reads and writes (INV-7). The only exceptions are the `addView` changes INV-7 lists.
- **Code facts this plan relies on (verified):**
  - **`addView` today** (`src/mutator/mutator.ts:922-944`):
    - checks the id, duplicates (`viewIds`, `mutator.ts:2111-2119`), the `target` form, includes (`checkViewIncludes`, `src/mutator/write-checks.ts:190-218`) and `autoLayout`;
    - writes into the first `views` block of the first file **in load order** (`findFileWithViews`, `mutator.ts:2219-2224`; `addViewEdit` takes `ast.views?.[0]`, `src/mutator/view-ops.ts:20-33`);
    - throws a plain `Error` when no block exists (`mutator.ts:934-935`).
  - **Tests pinned to that throw:** `tests/integration/edge-cases.test.ts:219-224`, `:509-514` and `:634-639`.
  - **Text generation and include checks:**
    - `generateView` (`src/mutator/codegen.ts:450-499`) writes only the header, `title`, `include` lines and `autoLayout`;
    - `isSingleIncludeRule` (`src/parser/grammar.ts:106-128`) parses a probe view;
    - `deploymentIncludeUsesWith` (`grammar.ts:333-354`) is the existing deployment `with` rule;
    - `formatLinkUrl` (`codegen.ts:607-614`) throws a plain `Error`, not `InvalidWriteError`.
  - **Parsed-style checks** (`src/mutator/write-checks.ts`):
    - `checkParsedStyleValue` (`:266-293`) checks a parsed style property: declared custom color, existing library icon, no `file://` icon URI, opacity 0%..100%;
    - `checkStyle` (`:302`) runs it on structured style input for the `element` and `relationship` field classes (`STYLE_FIELDS`, `:228-245`).
    - Today `checkParsedStyleValue` is module-private and is fed only by `parseStyleProperty`, never by properties already parsed inside a rule.
  - **Reference resolution:**
    - `resolveReferenceText(..., 'views')` (`src/query/workspace-index.ts:467-507`) resolves only outside view bodies;
    - `resolveDocumentReferences` (`workspace-index.ts:534-582`) explicitly skips view rules and steps and covers only view `of` (`:574-580`);
    - `DeploymentResolver.resolveText` (`src/query/deployment-resolver.ts:205-209`) resolves text in a deployment view body ('view' mode: nodes, instances, then elements);
    - `viewReferences` (`deployment-resolver.ts:185-197`) already feeds deployment-view references into the reference snapshot.
  - **Reference snapshot** (`src/query/reference-snapshot.ts:115-255`, compare `:268-292`): it has a `view:<name>#k` frame (`:247-250`). It is taken through `referenceSnapshot` and `rejectChangedReferences` (`mutator.ts:1943-1984`).
  - **Placement and layout:**
    - `chooseDeploymentPlacement` / `deploymentInsertEdit` (`src/mutator/deployment-ops.ts:242-286`) implement D4/D11 in LikeC4 document order (`mergeOrder`, `workspace-index.ts:811-825`);
    - `BodyInsertions` (`src/mutator/body-layout.ts`) knows `elements` as nested declarations only (`forBody`), plus `forBlock`.
  - **Atomic writes:** `applyEditGroups` (`mutator.ts:1781-1795`) and snapshot/restore (`mutator.ts:2180-2189`). Edits that produce parse errors in the edited file are refused (`applyEditsToFile`, `mutator.ts:2230-2252`).
  - **Element syntax-error guard:** `rejectFieldWhileSyntaxErrors` (`mutator.ts:1733-1744`) exists because of `extend` blocks; view writes do not use it (D42).
  - **`apply` today:**
    - `AddViewMutation` (`src/mutations-file.ts:61-69`) has no `autoLayout`; its field list is at `mutations-file.ts:571`, validation at `:779-807`;
    - the exhaustiveness check is at `mutations-file.ts:661-669`;
    - the CLI dispatches `addView` at `src/cli.ts:515-526`, ends in `assertNever` at `cli.ts:700`, and maps errors at `cli.ts:465-474`.
  - **Test helper today:** `buildLikeC4Model` (`tests/helpers/likec4-model.ts:179-215`) exposes only the view `title` and `folder` (`:197-198`).
  - **LikeC4 per-document parsed views (oracle entry point):**
    - `services.likec4.ModelParser.parse(doc).c4Views`: `LikeC4ModelParser.parse` / `forDocument` at LS:6850-6855 (LS = `node_modules/@likec4/language-server/dist/chunks/module.mjs`);
    - `c4Views` is filled by `ViewsParser.parseViews` (LS:6387-6420). It prefixes the folder into the title (LS:6415-6417) and prepends block-level styles (`localStyles`, LS:6390; rules built at LS:6455 and LS:6568);
    - a bodyless view hits `invariant(body)` (LS:6426, LS:6545, LS:5571) inside the try/catch (LS:6418-6419), so it is absent;
    - `extends` resolution and title defaulting happen later, in `buildModelData` (`toC4View` LS:3590-3600; `resolveRulesExtendedViews` LS:3632).
  - **How LikeC4 parses steps:**
    - `parseStepStatement` dispatches subflow, try, alt, series and single steps (LS:6596-6606);
    - a chain whose first step is backward contributes nothing (LS:6620-6621); a chain infers backward segments (LS:6615-6646); `parseStep` swaps `<-` (LS:6648-6660);
    - `par` / `opt` / `loop` / `break` require a non-empty parsed inner list (LS:6724-6726); `parallel` is normalized to `par` (LS:6718); `if` / `when` / `else` outside `alt` throw (LS:6732-6734);
    - `try` requires a non-empty `try` list (LS:6764-6765); `alt` requires at least one non-empty branch (LS:6773-6785);
    - `tryMap` (LS:5183-5198) drops a statement whose parse throws, and drops a node with an error diagnostic (`isValid`, LS:5015, LS:5157). So `par { }` and `par { opt { } }` both vanish (D40).

## Multi-repo and contracts

N/A: one repository, one stream. No cross-repository contracts.

## Invariant gate (before decomposition)

- [x] CLAUDE.md, CLAUDE_DEV_GUIDELINES.md and CLAUDE_TEST_GUIDELINES.md read. There is no TypeScript stack guideline, so the testing section of the project CLAUDE.md binds:
  - unit only;
  - oracles are `expectValidLikeC4` and LikeC4's parsed and computed views;
  - no snapshots, no grep-on-source checks;
  - the only code-reading check is the approved coverage-table check.
- [x] Business errors → 422: n/a for a library. The equivalent is `InvalidWriteError(field, detail)` for every rejection, address miss and ambiguity (INV-2, INV-3). `apply` reports `mutations[i].<field>` and exits 1.
- [x] Env without fallbacks: n/a; the library reads no environment.
- [x] Transactional outbox: n/a; no DB and no external calls, in-memory text only.
- [x] Metrics and logging: n/a. The library does not log; the CLI prints result lines only and handles no secrets.
- [x] API documentation in the same commit: every task that adds or changes a public method adds its JSDoc and README subsection in that commit. T023 only consolidates cross-cutting sections.

## Key design decisions

| Decision | Why | Rejected |
|---|---|---|
| **Read API** (names fixed here; spec "Integration points"): `listViews({ type?, file? }): ViewInfo[]` and `getView(id): ViewInfo \| null`. `getView` returns the first declaration in LikeC4 document order; `listViews` lists every declaration, duplicates included (US-1). | Same duplicate rule as `getDeploymentNode` (`src/query/deployment-query.ts:100-108`); one id addressing scheme (D28) | `getView` returning an array; `getView` throwing on duplicates |
| **Read API build order.** The internal rule / predicate reader (T007) and step reader (T008) are verified first, each on its own class. The public `listViews` / `getView` (T009) is published only once the complete `ViewInfo` can be compared field by field with LikeC4. | Every public read is complete and fully compared from the commit that publishes it | Publishing `ViewInfo` with empty `rules` / `steps` first; a gate that waits for later tasks |
| **Write API**, each returning `{ changedFiles }`: `updateView(id, patch)`, `addViewRule(id, rule, { before? })`, `replaceViewRule(id, address, rule)`, `removeViewRule(id, address)`, `removeView(id)`, `addViewStep(id, step, { path? })`, `updateViewStep(id, address, patch)`, `moveViewStep(id, from, to)`, `removeViewStep(id, address)`, `addViewParallel(id, { path?, statements?, steps? })`. `moveViewStep` and `removeViewStep` also return `removedParallelBlocks`, the pre-write paths of `par` blocks removed because the write literally emptied them (D40). A `par` block is removed whole through `removeViewStep`. `addView` keeps its `void` return (INV-7). | D32: one operation per address kind; the same names are used in `apply` (US-12); D40 asks for removed blocks to be reported | One `updateView` patch carrying rules and steps (D32 rejected it) |
| **Addresses and error fields.** Rule address `{ index, text? }` (D22). Step address `{ path, segment?, text? }` (D24); a move destination is a `path` (D37). Error fields: `id` (view); `address.index` / `address.text` / `before.index` / `before.text`; `rule.kind` / `rule.expression`; `includes[i]` (`addView`); `path`, `segment`, `text`, `from`, `to`, `address`; `statements` / `statements[i]`; `steps[i].<field>`; `step.<field>`; `patch.<field>`. | INV-2 / INV-3 need the field; `apply` gets `mutations[i].<field>` through `mutationFieldPath` unchanged | Free-text error locations |
| **Rule admissibility check** (`checkViewRule`, defined once in T010; used by `addView` includes, `addViewRule`, `replaceViewRule` and their `apply` forms). Every failure is an `InvalidWriteError` on the rule's expression field (`rule.expression`, or `includes[i]` for `addView`). Steps, in order:<br>(1) **Form:** the text parses to exactly one rule of the requested kind, allowed for the view type.<br>(2) **Structure (D34):** rejected are `with` in `exclude`; `with` on `element.kind` / `element.tag`; a dynamic relation predicate; dynamic `with` on wildcard / kind / tag; deployment `with`.<br>(3) **References:** every reference resolves at the insertion place through `ViewReferenceResolver` (unresolved, ambiguous, wrong target type, model reference in a deployment `include`).<br>(4) **Declarations:** kinds, tags and relationship kinds are declared.<br>(5) **`with` properties:** every property of every parsed `with { … }` body is validated through the existing parsed-style checks of `write-checks.ts:266-293`. The class follows the subject: element class for an element `with`, relationship class for a relation `with`. This covers declared custom colors, existing library icons, no `file://` icon URI and opacity 0%..100%. The written text is kept as given. | D23, D34, D35: one write path, INV-1, and silent no-ops rejected. Step (5) closes the class "parses and resolves, but LikeC4 reports a property error". | Parse-only checks; relying on `validate()` (RECON note 7); regenerating the expression |
| **Step-contribution predicate** (`contributesSteps`, defined once in T005; used by T008 and T021). A step statement contributes a LikeC4 step exactly when LikeC4's step parse (LS:6596-6790) would return at least one step for it. Per form: a single step whose endpoints resolve and that is not a known invalid construct; a chain whose first step is not backward; a `par` / `opt` / `loop` / `break` block with at least one contributing inner statement; a `try` block whose `try` part contributes; an `alt` with at least one contributing `if` / `when` / `else` branch. A stray `if` / `when` / `else` never contributes. Known invalid constructs are those of RECON S4: parent-child step, chain after a backward step, nested `par`. | D40 defines "empty" as contributing no parsed step; one predicate for reads (`inModel`) and writes | Checking only for literal emptiness (misses `par { opt { } }`) |
| **`par` creation, auto-removal and rejection (D40).** `addViewParallel` needs at least one of `statements` and `steps`, and the new block must satisfy `contributesSteps`; otherwise it is rejected on `statements`. `statements` are existing top-level step statements addressed by pre-move paths (D37); `steps` are new step specs checked as `addViewStep`. **Plan-level mechanism (accepted):** the block goes at the top-level insertion boundary `path`, a pre-move path (default: after the last top-level statement). Inside it, moved statements come first in the order given, then new steps in the order given. Rules between moved statements stay where they are (statements move individually). **Leaving a block:** a move or removal that takes away a block's last statement removes the block in the same edit group (`removedParallelBlocks`). A move or removal that would leave the block holding only non-contributing statements (for example an empty `opt { }`) is rejected on `from` / `address`, naming the block path; the remaining opaque text is never deleted silently. A `par` block already in the text that does not contribute reads with `inModel: false`. | LikeC4 silently drops such blocks (LS:6724-6726, LS:5183-5198); same principle as D34 | Empty placeholder blocks; rejecting the last move-out; silently deleting leftover opaque statements |
| **Placement (D27, D41).** `chooseDeploymentPlacement` is generalized into one block placement for `deployment` and `views`. An explicit `file` must be loaded and is authoritative (its first block, else a new block at its end). Without `file`: the first file in LikeC4 document order with a block, else the first file with a `model` block, else the first file. This replaces `findFileWithViews`' load order. | One file-choice rule across the library (D4, D41) | A second copy of the placement code; keeping load order for views |
| **`ViewReferenceResolver`** in a new module. Element references use `EndpointResolver` through a new `ReferencePosition` variant ("view body": document scope, plus the `of` element frame, or the `extends` parent's `of` frame). Deployment views use `DeploymentResolver.resolveText` with the view body as container. View references are typed by role. | Mirrors LS:7403-7431 and LS:7564-7573 / LS:7640 without forking `EndpointResolver`; same pattern as D7 | Language-server linking at run time (lc4m-15.31, D25 rejected it) |
| **Reference snapshot extended opt-in** (`views` option): view-body element and deployment references, step endpoints, `navigateTo`, `extends`. Taken by view writes only. | INV-8 guard. Turning it on for `addElement` would add new `addElement` rejections, which INV-7 forbids (see Known residuals). | Always-on view references; no guard |
| **Steps are written from structured fields**, never as text. Backward is written `target <- source` (D36). The kind form is chosen by `kindForm: 'bracket' \| 'dot'`. A single step that is both backward and kind-bearing is rejected (D38). Step style fields go through `checkStyle('relationship')`. | US-9 contract; D36 round trip | Step text input |
| **Step sequence position** is reported as `sequence: { step, parallel? }`, mirroring LikeC4's computed `step-NN[:par.MM]`. Inner steps of opaque stage-6 blocks are counted. | US-4 one-to-one comparison; FOR-PLAN 8: compare by content, ids are positional | LikeC4 `astPath` as an address (D24 rejected it) |
| **`extends` cycle and parent checks** are a graph walk over `ViewIndex` (named element view with a body, no cycle after the write). Rejected on `extends`. | `validate()` is silent on cycles (RECON S4; FOR-PLAN 6); INV-9 | Relying on the oracle |
| **Links of view writes** get a new `checkLinks` (`InvalidWriteError` on `links[i].url`). Existing operations keep `formatLinkUrl`'s plain `Error`. | INV-2 for the new writes; INV-7 for the old ones | Changing the error type of existing operations |
| **No syntax-error guard for view writes (D42).** View tag and link updates are allowed while other files have syntax errors; `rejectFieldWhileSyntaxErrors` is not used. A write that leaves the edited file unparsable is still refused by `applyEditsToFile`. | Views have no `extend` blocks, the reason for the element restriction | Copying the element restriction |
| **Files.** View writers in `src/mutator/view-ops.ts`, step writers in a new `src/mutator/step-ops.ts`. `LikeC4Mutator` keeps thin public methods around its private snapshot / `applyEditGroups` / `rebuildQueries`. | One atomic-apply path; `mutator.ts` is already 2303 lines | A second mutator class |
| **Release 0.10.0** (minor; the `addView` behaviour changes, D41 included, are listed in CHANGELOG). | SC-008 | 1.0.0 |

Spec decisions D21 to D42 are implemented as mapped in the traceability table. No `[DECISION-NEEDED]`.

## Complexity Tracking

| Introduced complexity | Why it is needed | What without it |
|---|---|---|
| `ViewIndex` (`src/query/view-index.ts`) | The source order of a view body exists only in CST offsets (FOR-PLAN 1). Addresses, the reverse reference index (FOR-PLAN 7) and duplicate ids need one workspace-level structure. | Each reader and writer would re-walk and re-sort ASTs; addresses would drift between read and write |
| `ViewReferenceResolver` (`src/query/view-resolver.ts`) | View scoping differs from model scoping (`of` / `extends` frames, dynamic document scope, typed view targets; RECON S3) | No reference checks at all: INV-1 breaks on unresolved, ambiguous or wrong-type references |
| Step-contribution predicate | D40: "empty" is defined by LikeC4's parse result, not by text | `par { opt { } }` would be written or left in place and silently vanish from LikeC4's model |
| Reference snapshot `views` option | INV-8 guard over view references without changing `addElement` (INV-7) | INV-8 would rest on argument only, with no runtime rollback |
| Generalized block placement and view-body insertion anchors | D27/D41 equal D4/D11. View bodies have tags, props and rules/steps (FOR-PLAN 2), which `forBody` (`elements` only) cannot place. | A forked placement and an ad hoc insertion per writer |
| `par` auto-removal inside move and remove | D40: LikeC4 silently drops an emptied block | Leaving an empty block that reads as a statement but vanishes from LikeC4's model |

No new dependency. Step (5) of `checkViewRule` adds no new check logic: it feeds parsed `with` properties into the existing `checkParsedStyleValue`.

## Decomposition by phases

### Phase Setup

**T001 [TEST]** — new fixtures `tests/fixtures/views-catalog/` and `tests/fixtures/views-flows/`, each a multi-file workspace.
- Mechanism: two unrelated neutral workspaces with different kinds, tags, relationship kinds and custom colors (INV-6, SC-002). Together they contain:
  - all three view types across several files and several `views` blocks, with and without a folder;
  - a bodyless view and an unnamed element view;
  - `of` and `extends`;
  - a multi-group tag list `#a, #b`;
  - links and a markdown description;
  - two `autoLayout` rules;
  - block-level `views { style … }`;
  - every predicate form of the grammar (element, relation, `with` with style properties incl. a declared custom color and a library icon, `where` with each leaf and participant variant), with a trailing-comma include;
  - every stage-6 rule kind;
  - a dynamic view where rules and steps interleave, with every step form: `->`, `<-`, `-[k]->`, `.k`, a chain, a returning chain, a step body with each property, `par`, `parallel`, an empty `par { }`, a `par { opt { } }`, and stage-6 blocks containing steps;
  - every `navigateTo` role (element `with`, relation `with`, step, model relationship body, deployment relationship body);
  - a CRLF file.
- Gate: both fixtures pass `expectValidLikeC4`, asserted as a precondition in the consuming test files.

### Phase Foundational (BLOCKING)

**T002** — `tests/helpers/likec4-model.ts`. Mechanism: the view oracle.
- `parsedViews(files)`: per file, LikeC4's `c4Views` from `services.likec4.ModelParser.parse(doc)` (LS:6850-6855) after the existing `buildWorkspace`. These views come before `extends` resolution and title defaulting (LS:3590-3632). FOR-PLAN 9.
- `buildLikeC4Model(...).views` gains: `_type`, node ids, edges (source, target), and the step sequence (`step-NN[:par.MM]`, source, target, title, kind, backward flag) taken from computed edges.
- `linkedViewReferences(files)` reports the linked target of every view-body element / deployment reference and every `navigateTo` / `extends` / `of` target, or `null` when unlinked. It reuses the existing `FqnIndex` approach of `linkedReferences` (`likec4-model.ts:442`).
- Comparison helpers that encode every INV-4 exception:
  - `expectViewsAgreeWithLikeC4(views, files)` compares the whole view;
  - `expectRulesAgreeWithLikeC4` and `expectStepsAgreeWithLikeC4` compare one class each, for T007 and T008.
  - Exceptions encoded:
    - folder prefix stripped;
    - block-level style rules removed from LikeC4's list;
    - a bodyless view compared by its absence;
    - a `par` statement that contributes no LikeC4 step (`par { }`, `par { opt { } }`) compared by its absence (D40);
    - D18 style written forms;
    - D34 constructs;
    - source-only fields ignored.
- `expectComputedViewsSurvive(before, after, removedId?)` checks INV-9; generated and unnamed views are exempt.
- Gate: `tests/likec4-validate-oracle.test.ts` unchanged and green. Consuming test files assert the oracle preconditions they rely on: bodyless absence, absence of non-contributing `par` blocks (both forms), folder prefix.

**T003** — `src/query/types.ts`, `src/index.ts`. Mechanism: the public read and address contract.
- `ViewInfo`: `id` (null if unnamed), `type`, `of`, `extends`, `title`, `description`, `tags`, `links`, `folder`, `file`, `sourceRange`, `inModel`, `rules`, `steps`.
- `ViewRuleInfo`: `index`, `kind` (`include` / `exclude` / `autoLayout` / opaque kinds), `text`, `sourceRange`, plus `autoLayout` values or predicate items.
- `ViewPredicateItem`: element / relation expression, `with` props, `where` tree. Reference fields are "as written + resolved target or `null`"; deployment views use the `LinkedTarget` shape.
- `ViewStepStatementInfo` (step / chain / `par` / opaque). A `par` statement carries `inModel`, which is false when the block contributes no LikeC4 step (D40).
- `ViewStepInfo` (`source`, `target`, `direction`, `arrow`, `kind` + form, `title`, body properties, `sequence`, `segment`).
- `ViewRuleAddress`, `ViewStepAddress`, and the result type with `removedParallelBlocks`; exports.
- Gate: `tsc --noEmit`; no existing member changes.

**T004** — new `src/query/view-index.ts`, and `src/mutator/mutator.ts` (`rebuildQueries` builds the index beside `WorkspaceIndex`). Mechanism: `ViewIndex`.
- Declarations in LikeC4 document order (`mergeOrder`), with block folder, body or none, and duplicate counts.
- Body items merged and sorted by CST offset (FOR-PLAN 1).
- Rule list with opaque kinds.
- Expression item lists from the `prev`-linked `Expressions` / `FqnExpressions` / `Tags`; a trailing-comma item without a value is dropped (FOR-PLAN 3).
- Step-statement tree with paths, including the inner statements of opaque stage-6 blocks (unaddressable, but needed by `contributesSteps`). Chain segments come from nested `StepSeries.source`; segment i spans the previous node's end to its own end (FOR-PLAN 4).
- Reverse index of view references (`navigateTo` in element `with`, relation `with`, steps, model and deployment relationship bodies; `extends`) with file and position (FOR-PLAN 7).
- Gate: full existing suite green unchanged (INV-7); covered by T006 to T009.

**T005** — new `src/query/view-resolver.ts`; `src/query/workspace-index.ts` (new `ReferencePosition` variant for a view body scope). Mechanism: `ViewReferenceResolver` (D25, FOR-PLAN 5), plus the step-contribution predicate `contributesSteps` (defined in Key design decisions; it needs the resolver for step endpoints). The resolver resolves:
- element references: document-unique names; the `of` frame; the `extends` parent's `of` frame; dynamic views use the document scope only;
- deployment references in deployment views, flagged as model or deployment targets, through `DeploymentResolver.resolveText`;
- view references by role: element `with` → any view; relation `with` / step → dynamic view; `extends` → element view;
- tag, element kind, deployment kind and relationship kind references against the index.

Gate: resolver covered by T006; predicate covered by T008 (reads) and T021 (writes).

**T006 [TEST]** — new `tests/query/view-resolution.test.ts`. Mechanism: the resolver against `linkedViewReferences`, one block per reference class. Each class asserts the resolved target and the unresolved / ambiguous outcomes:
- no-`of` view: same file, ambiguous, cross-file, qualified (spike 03 a1-a6);
- `of` scope, including ambiguous-under-`of`, top-level and `view of api` (b1-b7);
- `extends` scope (c1, c1b, c2);
- dynamic document scope (d1-d1c);
- `navigateTo` roles (e1-e10);
- `extends` target types (f1-f3);
- undeclared kinds and tags (g1-g8);
- deployment views (h1-h5);
- the `ViewIndex` reverse index, against the linked `navigateTo` / `extends` referrers.

Gate: every class equals LikeC4's linker observation.

### Phase US-1 to US-4: Read API (MVP)

**T007** — new `src/query/view-query.ts` (internal rule builder, not yet public), new `tests/query/view-rules-read.test.ts`. Mechanism: rule list and structured predicate reader (US-2, US-3) over `ViewIndex` + `ViewReferenceResolver`.
- Rule list (index, kind, text, range, autoLayout values); dynamic rules separate from steps.
- Predicate items: element and relation expressions, every connector form, `with` props incl. `navigateTo`, `where` trees with operators.
- Block-level styles are never reported.
- Gate (rule class only): through `expectRulesAgreeWithLikeC4`, every predicate form of the grammar and every rule kind of both fixtures equals LikeC4's parsed rules. LikeC4's list is taken minus the prepended block styles; D34 constructs are asserted against the written text. Also covered: trailing comma, two `autoLayout` rules, opaque stage-6 kinds.

**T008** — `src/query/view-query.ts` (internal step builder), new `tests/query/view-steps-read.test.ts`. Mechanism: the step reader (US-4).
- Statement paths; chain segments with numbers.
- Source / target in LikeC4's sense; direction, including the inferred backward segment of a returning chain (D36).
- Written arrow, kind form, title, body properties.
- `par` / `parallel` with `[i, j]` paths; `inModel` of a `par` block from `contributesSteps` (D40); opaque stage-6 blocks.
- `sequence` counting inner steps of opaque blocks.
- Gate (step class only), through `expectStepsAgreeWithLikeC4`:
  - every step form equals LikeC4's parsed steps one to one, by `sequence` and content, backward and returning-chain examples included;
  - `par { }`, `par { opt { } }` and a `par` holding only a stray `if { … }` read `inModel: false` and are absent from LikeC4's steps; a `par` with one contributing statement reads `inModel: true` and is present;
  - interleaved rules and steps appear in separate lists.

**T009** — `src/query/view-query.ts` (view info builder), `src/mutator/mutator.ts`, README "Views › Reading" (view fields, rule addressing D22, step addressing D24), new `tests/query/views-read.test.ts`. Mechanism: the complete `ViewInfo` and the public `listViews` / `getView` (US-1), assembled with the rule builder (T007) and step builder (T008).
- Own values only (D21), folder separate.
- Title as LikeC4 normalizes it (single line, escaped slash kept).
- Description as markdown or text.
- Tags in LikeC4's parse order (D39).
- `inModel: false` for bodyless declarations; unnamed → `id: null` (D28); generated views not reported (D29); unknown id → `null`.
- Best-effort reads on files with syntax errors.
- Gate (full comparison, enforced from this commit on): on both T001 fixtures, every declared view returned by `listViews` / `getView` equals `parsedViews` field by field, rules and steps included, through `expectViewsAgreeWithLikeC4`. Dedicated examples: folder prefix, multi-group tags (D39), bodyless, unnamed, duplicate id listed twice, `index` absent with `implicitViews` (D29), the `type` / `file` filters.

### Phase Foundational, write side (BLOCKING for US-5 to US-12)

**T010** — `src/parser/grammar.ts`, `src/mutator/write-checks.ts`. Mechanism:
- `parseViewRule(kind, expression, viewType)` returns the single parsed rule or `undefined`. `isSingleIncludeRule` becomes a wrapper with identical behaviour.
- `checkViewRule`: the rule admissibility check, steps (1) to (5) as defined in Key design decisions. For step (5), `checkParsedStyleValue` (`write-checks.ts:266-293`) accepts a property node taken from a parsed `with` body, together with its field class; the field is the rule's expression field. Existing callers of `checkStyle` are unchanged.
- `checkLinks`.
- Gate: `tests/mutator/view-includes.test.ts`, `tests/cli/cli-apply-view-includes.test.ts` and `tests/mutator/write-value-checks.test.ts` green unchanged. Behaviour is tested through every entry point in T015, T018 and T022.

**T011** — new `src/mutator/block-placement.ts`, `src/mutator/deployment-ops.ts`. Mechanism: `chooseDeploymentPlacement` / `deploymentInsertEdit` generalized over the block keyword (`deployment` | `views`), with the LikeC4 document-order default (D27, D41). Gate: all deployment write tests green unchanged.

**T012** — `src/mutator/body-layout.ts`, `src/mutator/codegen.ts`. Mechanism:
- `BodyInsertions.forViewBody` with the grammar anchors (FOR-PLAN 2):
  - tags open the body;
  - props go after tags and before the first rule or step;
  - an insertion goes before an arbitrary body item or step statement, or inside a `par` block.
- `generateView` gains `description` and `extends`; output for existing options is byte-identical.
- New generators:
  - `generateViewRule`;
  - `generateStep` (D36 / D38 forms);
  - `generateParallel`, which takes its inner statement texts and requires at least one (D40).
- Gate: `tests/mutator/codegen.test.ts` and `tests/mutator/insert-layout.test.ts` green unchanged.

**T013** — new `src/mutator/view-address.ts`. Mechanism: the shared address resolvers.
- `namedView(id)`: exactly one named declaration, else `InvalidWriteError` on `id` (unknown, unnamed or ambiguous; INV-3).
- `ruleAt(address, field)`: index plus text guard (D22).
- `stepAt(address)`: path / segment / guard (D24); rejects paths into chains or stage-6 blocks.
- Gate: `tsc`; behaviour is tested by the writer tasks.

**T014** — `src/query/reference-snapshot.ts`, `src/mutator/mutator.ts`, `tests/query/reference-snapshot.test.ts`. Mechanism: the snapshot `views` option (INV-8), covering view-body element and deployment references, step endpoints, `navigateTo` and `extends`. Existing callers are unchanged.
- Gate: existing snapshot tests green unchanged. New direct tests show:
  - equal rule texts in two views keep distinct keys;
  - a removed rule's references are excluded;
  - a moved step's references are matched;
  - a re-targeted survivor is reported.

### Phase US-5, US-6, US-7, US-8: views and rules

**T015** — `src/mutator/view-ops.ts`, `src/mutator/mutator.ts`, README "Views › Writing", new `tests/mutator/views-add.test.ts`; rewrites `tests/integration/edge-cases.test.ts:219-224`, `:509-514` and `:634-639` (SC-006). Mechanism: `addView` + `description`, `extends`, `file`.
- Placement and block creation through T011 (D27, D41).
- Includes run through `checkViewRule` (D35).
- `of` + `extends` rejected.
- `extends` parent must be a named element view with a body, and must not create a cycle (D34, INV-9).
- The snapshot with the `views` option (an unresolved `navigateTo` / `extends newId` becoming resolved is not a change).
- Gate:
  - every US-5 placement branch, including an explicit blockless file while other files have blocks, and the D41 default where load order and LikeC4 document order differ;
  - every rejection class, with sources byte-identical;
  - the `with`-property class through `includes`: an undeclared custom color, a non-existent library icon, a `file://` icon URI and an out-of-range opacity on an element `with`, plus an undeclared custom color on a relation `with`, are each rejected on `includes[i]` byte-identical; a declared custom color, an existing library icon and a valid icon URI are accepted, and the output passes `expectValidLikeC4`;
  - accepted outputs pass `expectValidLikeC4`, read back as US-1 and pass `expectComputedViewsSurvive`.

**T016** — same source files + README, new `tests/mutator/views-update.test.ts`. Mechanism: `updateView` (US-6, D33).
- Title / description REPLACE (`null` removes, `''` written); tags and links REPLACE through `buildReplaceTagsEdit` / `buildReplaceLinksEdit` with view-body anchors.
- `autoLayout` replaces the last rule in place, appends one as the last rule, or `null` removes every `autoLayout` rule.
- A missing body is created.
- No syntax-error guard (D42).
- Gate: read-back equals the patch. LikeC4's parsed and computed values agree (computed `autoLayout` direction). Untouched text is byte-identical (INV-5), CRLF included. Rejections as specified. D42 is shown both ways: a tag / link update succeeds while another loaded file has a syntax error (read-back, other file unchanged), and a write that would leave the edited file unparsable is rejected byte-identical.

**T017** — same source files + README, new `tests/mutator/views-remove.test.ts`. Mechanism: `removeView` (US-8, D26).
- Rejected on `id` while the reverse index lists any referrer (`navigateTo` in any role, `extends`), each with file and position.
- Otherwise the declaration is removed through `buildRemovalEdit`.
- The snapshot is taken with the declaration as the removal set.
- Gate: every referrer class rejected byte-identical. Accepted removals pass `expectValidLikeC4` and `expectComputedViewsSurvive(removedId)`, including a declared `index` (the synthesized one may appear). README snapshot note.

**T018** — same source files + README, new `tests/mutator/view-rules-write.test.ts`. Mechanism: `addViewRule` / `replaceViewRule` / `removeViewRule` (US-7).
- Default position rules: element and deployment views before a trailing `autoLayout`; dynamic views after the last body item, before a trailing `autoLayout`.
- `before` address.
- `checkViewRule` at the insertion place.
- Removal of any rule kind, including opaque ones and `autoLayout` (D30); trailing-comma removal.
- Gate:
  - on all three view types, `with { navigateTo }` and `where` included, the computed nodes after each write match the LikeC4-derived expectation (SC-004);
  - other rules keep their order and bytes;
  - every rejection class byte-identical;
  - the `with`-property class (same invalid and valid values as T015, element and relation `with`) through both `addViewRule` and `replaceViewRule`, rejected on `rule.expression` byte-identical, valid values accepted with `expectValidLikeC4`;
  - `expectValidLikeC4` and `expectComputedViewsSurvive` on accepted writes.

### Phase US-9, US-10, US-11: steps and `par` blocks

**T019** — new `src/mutator/step-ops.ts`, `src/mutator/mutator.ts`, README "Dynamic view steps", new `tests/mutator/view-steps-add.test.ts`. Mechanism: `addViewStep`.
- Default path, `[i]`, `[i, j]`, `[i, n]`.
- Endpoints resolved in document scope (D25).
- Rejections: parent-child pair; undeclared kind; backward with kind (D38); `navigateTo` that is not a dynamic view; strings and style through `checkStyle('relationship')`; paths into chains or stage-6 blocks.
- The step-spec check is exported inside the module for reuse by `addViewParallel` (T021).
- Gate: the step reads back at the path with the same source, target and direction (D36 round trip). LikeC4's step sequence equals the previous one with the new step inserted, compared by content. Rejections byte-identical; `expectValidLikeC4`.

**T020** — same files, new `tests/mutator/view-steps-update.test.ts`. Mechanism: `updateViewStep`.
- An in-place token-level patch of a single step: endpoints, arrow, inline title, body props per field.
- On a chain segment, only title, kind, body strings, `navigateTo` and style can change; endpoint or direction changes are rejected naming the chain (D31).
- D38 is evaluated on the final state.
- Gate: only the patched parts change and other bytes are identical (INV-5). LikeC4's sequence matches the expectation; rejections byte-identical.

**T021** — same files, new `tests/mutator/view-steps-move-remove.test.ts`. Mechanism:
- `moveViewStep` with pre-move source and destination boundary (D37); no-op at its own boundary.
- `addViewParallel` (D40) with `statements` and/or `steps`, placed at the pre-move top-level boundary `path`; moved statements first in the order given, then new steps in the order given.
- `removeViewStep` for a single step, a whole chain, a `par` block or an opaque block.
- After every move or removal, the `par` block that held the statement is evaluated:
  - literally empty → removed in the same edit group and reported in `removedParallelBlocks`;
  - not empty but failing `contributesSteps` → rejected (D40).
- Rejections:
  - `addViewParallel` with no statement and no step, or whose block would not satisfy `contributesSteps` (for example only an empty `opt { }` moved in) → `statements`;
  - a move or removal that would leave a block holding only non-contributing statements → `from` / `address`, naming the block path;
  - a `statements` path that is not top-level, or that addresses a `par` block (nested parallel);
  - duplicate `statements` paths;
  - `par` into `par`;
  - a destination inside the moved statement;
  - a single chain segment;
  - a missing path;
  - a guard mismatch.
- Gate:
  - the D37 examples `[0]→[2]`, `[0]→[3]`, `[2]→[0]` and `[0]→[2,0]`;
  - moves in and out of `par`, including moving and removing the last statement of a block (the block disappears and is reported);
  - the SC-005 D40 case: in `par { a -> b  opt { } }`, moving or removing `a -> b` is rejected naming the block, sources byte-identical;
  - `addViewParallel` with moved statements only, new steps only, both, and the rejected non-contributing case;
  - a rule between moved steps is never moved;
  - after each accepted write, LikeC4's sequence equals the expectation; `expectValidLikeC4`; `expectComputedViewsSurvive`.

### Phase US-12: `apply`

**T022** — `src/mutations-file.ts`, `src/cli.ts`, new `tests/cli/cli-apply-views.test.ts`, README "Batch mutations format". Mechanism: one commit, because widening the `Mutation` union breaks the `assertNever` at `cli.ts:700` without its dispatch.
- 10 op interfaces with `MUTATION_FIELDS` entries under the `FieldsNotListed` check:

  | op | fields besides `op` |
  |---|---|
  | `updateView` | `id`, `title`, `description`, `tags`, `links`, `autoLayout` |
  | `addViewRule` | `id`, `rule`, `before` |
  | `replaceViewRule` | `id`, `address`, `rule` |
  | `removeViewRule` | `id`, `address` |
  | `removeView` | `id` |
  | `addViewStep` | `id`, `step`, `path` |
  | `updateViewStep` | `id`, `address`, `patch` |
  | `moveViewStep` | `id`, `from`, `to` |
  | `removeViewStep` | `id`, `address` |
  | `addViewParallel` | `id`, `path`, `statements`, `steps` |

- `addView` + `autoLayout`, `description`, `extends`, `file`.
- Validators: addresses (`index` non-negative integer, `path` integer array), step objects and patch objects (`rejectUnknownFields`), `statements` (array of paths); `addViewParallel` needs at least one of `statements` / `steps`.
- The workspace-dependent checks run in the library at apply time: `checkViewRule` steps (3) to (5), which include declared custom colors, and the `contributesSteps` rejection.
- `formChecks` reusing the library form checks; dispatch cases. Result lines name removed `par` blocks.
- Gate:
  - each op succeeds on a fixture copy and the output passes `expectValidLikeC4`;
  - unknown fields, wrong types and a library rejection exit 1 with `mutations[i].<path>` and write nothing, including the D40 block rejection;
  - the `with`-property class through `apply` `addView` (`mutations[i].includes[j]`), `addViewRule` and `replaceViewRule` (`mutations[i].rule.expression`): the invalid values exit 1 and write nothing; a valid declared custom color and an existing library icon are accepted with `expectValidLikeC4` on the output;
  - `addView` `autoLayout` is validated as in the library.

### Phase Polish

- **T023** — `README.md`. Mechanism: one consolidated "Views" section:
  - read API and own values (D21 exceptions, unnamed and generated views, a `par` block that contributes no step reads as not in the model);
  - rule and step addressing (D22, D24, D37);
  - write API and the reference rules for written text;
  - the checks on rule text, `with` property values included;
  - `par` creation, auto-removal and rejection (D40);
  - removal rejection and the snapshot note;
  - the D41 default file and the D42 syntax-error rule;
  - "Rejected writes" table rows.
  
  Gate: the README examples, run against the library in a smoke script, give the stated values.
- **T024** — `docs/likec4-coverage.md`. Mechanism: every row named in the lc4m-15.29 Skein issue "Coverage rows to update" (blocks and views, properties, rules, navigation and references, predicate and expression rows, steps, `implicitViews` and manual-layout notes) set to non-`no` with notes, or `no` / `n/a` with the out-of-scope reason (stage 6, rename). Gate: `npm run lint` passes (SC-001).
- **T025** — `CHANGELOG.md`. Mechanism: a `[0.10.0]` entry.
  - Added: read API, write API, `apply` ops.
  - Breaking / behaviour changes: `addView` D34 / D35 / `of`+`extends` rejections (`with` property values included), block creation, and the default file in LikeC4 document order instead of load order (D41).
  
  Gate: the entry matches the README.
- **T026** — `package.json`, `package-lock.json`, `docs/likec4-coverage.md` title. Mechanism: version 0.10.0 in one commit; not pushed, tagged or published. Gate: `npm run lint && npm test && npm run build` green (SC-007, SC-008).

## Streams and groups

| Stream | Repository | Group | Tasks in order | Group rationale |
|---|---|---|---|---|
| S1 | likec4-mutator | G1 Oracle | T001, T002 | Small on purpose: fixtures and the parsed/computed/linked oracle must be reviewed before any code depends on them |
| S1 | likec4-mutator | G2 Read foundation | T003, T004, T005, T006 | One layer: contract types, index, resolver with the step-contribution predicate, and the resolver's per-class oracle tests |
| S1 | likec4-mutator | G3 Read API | T007, T008, T009 | US-1 to US-4: the internal rule reader and step reader, each verified on its own class, then the public API with the full comparison; the MVP; they share `view-query.ts` |
| S1 | likec4-mutator | G4 Write foundation | T010, T011, T012, T013, T014 | Shared write seams (rule check incl. `with` properties, placement, layout and codegen, addressing, snapshot), each guarded by the unchanged suite |
| S1 | likec4-mutator | G5 Views and rules | T015, T016, T017, T018 | US-5 to US-8: whole-view writes and rule writes share `view-ops.ts`, addressing and `checkViewRule` |
| S1 | likec4-mutator | G6 Steps | T019, T020, T021 | US-9 to US-11 share `step-ops.ts`, paths, the step-spec check and the sequence comparison |
| S1 | likec4-mutator | G7 Apply | T022 | Solo on purpose: the op union and the CLI dispatch must land in one commit (`assertNever` exhaustiveness), over the finished library surface |
| S1 | likec4-mutator | G8 Docs and release | T023, T024, T025, T026 | Cross-cutting docs and release preparation |

## Dependencies and build order

- T001 → T002 → every `[TEST]` task and every task with tests (oracles).
- T003 → T007, T008, T009. T004 → T005 → T006.
- T004 and T005 → T007 and T008 (T008 uses `contributesSteps`). T007 and T008 → T009 (public `ViewInfo` assembled from both builders; full comparison). **STOP: MVP.**
- T005 → T010 and T014. T004 → T012 and T013. T011 depends only on existing code (scheduled after G3).
- T015 ← T009 (read-back), T010, T011, T012, T013, T014. T016 ← T009, T012, T013, T014. T017 ← T004 (reverse index), T013, T014. T018 ← T009, T010, T012, T013, T014.
- T019 ← T005, T009, T012, T013, T014. T020 ← T019. T021 ← T019 (step-spec check, insertion inside `par`) and T005 (`contributesSteps`).
- G5 and G6 → T022 → T023 → T024 → T025 → T026.
- There are no cycles. The task order T001…T026 is a topological order. The stream is strictly sequential with one executor; a full `npm test` + `npm run lint` runs at the end of each group.

## Delivery strategy

1. **MVP = G1 to G3** (read-only views). STOP & VALIDATE:
   - T007 and T008 class gates green;
   - T009's full field-by-field comparison green on both fixtures, with every INV-4 exception shown by an example (both non-contributing `par` forms included) (SC-002);
   - every T006 reference class equal to the linker;
   - `npm run lint` green.
2. **G4.** STOP: the pre-existing suite green unchanged (refactors are behaviour-neutral, INV-7); the snapshot direct tests.
3. **G5.** STOP:
   - SC-003, SC-004 (computed nodes and INV-9 survival);
   - SC-005 rejection classes byte-identical, including the `with`-property class through `addView` includes, `addViewRule` and `replaceViewRule`;
   - SC-006 (the three rewritten edge-case tests);
   - the D41 order example and both directions of D42.
4. **G6.** STOP: the step-sequence comparisons, including the D37 examples, the D40 creation / auto-removal cases and the D40 `opt { }` rejection; the D38 / D31 rejections.
5. **G7.** STOP: `apply` exits 1 and writes nothing on every error path, the `with`-property class included.
6. **G8.** STOP: `npm run lint && npm test && npm run build`. The release is prepared, not pushed, tagged or published.

## Risks and rollback

- Scope-mirror drift between `ViewReferenceResolver` and LS:7403-7431 / LS:7564-7640 (including whether `extends` chains inherit `of` transitively): T006 compares every class with LikeC4's linker before any writer uses it.
- `contributesSteps` drift from LikeC4's step parse (LS:6596-6790), which also drops nodes with any error diagnostic (`isValid`, LS:5015): T008 compares `inModel` with LikeC4's parsed steps for every step form, invalid ones included. Writes only ever add contributing steps, because new steps are checked to resolve and to be valid.
- Rule text that parses and resolves but carries an invalid property value: `checkViewRule` step (5) covers the property checks LikeC4 applies to style values (`write-checks.ts:266-293`). T015, T018 and T022 gate the class on every entry point, with LikeC4 validation of accepted output.
- Insertion anchors in single-line or interleaved bodies could produce parse errors. `applyEditsToFile` refuses them and rolls back (`mutator.ts:2230-2252`); T012 keeps existing layouts byte-identical; writer tests cover `{ }`, one-line and CRLF bodies.
- Multi-edit `par` writes could produce overlapping edits in one file: moving statements into a new block, or a move that also removes an emptied block. Each such write is computed as one non-overlapping edit group against the pre-write document and applied atomically; T021 covers every combination.
- Silent LikeC4 drops that `validate()` misses (cycles, dynamic relation predicates, deployment model references, non-contributing `par`): tests compare computed views and step sequences, not just `validate()`.
- Rollback: each group is a contiguous series of atomic commits on the working branch. Nothing is pushed; a failing group is reverted with `git revert` without touching earlier groups.

## Known residuals

- RES-plan-1 · MINOR · pre-existing gap, kept out of scope by INV-7 · `addElement` / `removeElement` do not protect element-view rule and step references (`workspace-index.ts:534-536`). A new element can still make an `include api` ambiguous, and a removal can still re-target it. The plan's view reference snapshot is opt-in for view writes only. → carrier: lc4m-15.30 (general reference policy).

## Spec traceability

| Spec id | Tasks |
|---|---|
| US-1 | T003, T004, T009 |
| US-2 | T004, T007, T009 |
| US-3 | T005, T007, T009 |
| US-4 | T004, T005, T008, T009 |
| US-5 | T010, T011, T012, T015, T022 |
| US-6 | T012, T013, T016 |
| US-7 | T010, T012, T013, T018 |
| US-8 | T004, T017 |
| US-9 | T012, T013, T019 |
| US-10 | T013, T020 |
| US-11 | T005, T012, T013, T021 |
| US-12 | T022 |
| INV-1 | T002, T010, T015, T016, T017, T018, T019, T020, T021, T022 |
| INV-2 | T010, T013, T015, T016, T017, T018, T019, T020, T021, T022 |
| INV-3 | T004, T013, T015, T016, T017, T018, T019, T020, T021 |
| INV-4 | T002, T005, T007, T008, T009 |
| INV-5 | T012, T016, T018, T020, T021 |
| INV-6 | T001, T005, T010 |
| INV-7 | T010, T011, T012, T014, T015, T025 |
| INV-8 | T014, T015, T017, T018, T019, T021 |
| INV-9 | T002, T015, T017, T018, T021 |
| SC-001 | T024 |
| SC-002 | T001, T002, T007, T008, T009 |
| SC-003 | T015, T016, T017, T018, T019, T020, T021, T022 |
| SC-004 | T002, T017, T018, T019, T020, T021 |
| SC-005 | T015 (incl. `with`-property class), T016, T017, T018 (incl. `with`-property class), T019, T020, T021 (incl. the D40 `opt { }` case), T022 (incl. `with`-property class) |
| SC-006 | T015 (rewritten edge-case tests), G4 STOP |
| SC-007 | T009, T023, T025, T026 |
| SC-008 | T026 |
| D21 | T009, T023 |
| D22 | T003, T007, T009, T013, T018, T023 |
| D23 | T010, T018 |
| D24 | T003, T004, T008, T009, T013, T019, T020, T021, T023 |
| D25 | T005, T006, T019 |
| D26 | T004, T017 |
| D27 | T011, T015 |
| D28 | T009, T013 |
| D29 | T009 |
| D30 | T004, T007, T008, T018, T021 |
| D31 | T020, T021 |
| D32 | T018, T019, T020, T021, T022 |
| D33 | T016 |
| D34 | T007, T010, T015, T018 |
| D35 | T010, T015, T022 |
| D36 | T008, T012, T019, T020 |
| D37 | T021, T022 |
| D38 | T012, T019, T020 |
| D39 | T009 |
| D40 | T001, T002, T003, T004, T005, T008, T012, T021, T022, T023 |
| D41 | T011, T015, T023, T025 |
| D42 | T016, T023 |
| FOR-PLAN 1 (source order by offset) | T004 |
| FOR-PLAN 2 (insertion anchors) | T012 |
| FOR-PLAN 3 (`prev`-linked lists, trailing comma) | T004, T007, T018 |
| FOR-PLAN 4 (chain segments) | T004, T008 |
| FOR-PLAN 5 (per-document uniqueness in the resolver) | T005, T006 |
| FOR-PLAN 6 (`validate()` gaps: cycles, dynamic relation predicates) | T010, T015, T018 |
| FOR-PLAN 7 (reverse index for removal) | T004, T017 |
| FOR-PLAN 8 (positional step ids, compare by content) | T002, T008, T019, T020, T021 |
| FOR-PLAN 9 (per-document parsed views entry point) | T002 |
