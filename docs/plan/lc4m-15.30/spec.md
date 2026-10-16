# Spec: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Status** DRAFT · **Task**: lc4m-15.30 (epic lc4m-15, stages 3 and 4; includes lc4m-17) · **Affects**: likec4-mutator (library, `apply` CLI command, docs)
**Type**: feature + change (new rejections and cascades of the remove operations, relationship selection, default file order of root writes, `addRelationship` rejection of shared `extend` identities) · **Based on**: README sections "Views", "Deployment model", "Specification defaults", "`extend` blocks", "Rejected writes"; lc4m-15.28 and lc4m-15.29 specs (decisions D4, D11, D18, D25, D26, D27, D30, D33, D34, D41, D43); reconnaissance `spikes/recon-a.md`, `spikes/recon-bce.md`, `spikes/recon-df.md`; LikeC4 1.59.4 facts `spikes/01-likec4-facts.mts`, `spikes/02-names-and-leftovers.mts`, `spikes/03-critic-r1-checks.mts`, `spikes/04-blocks.mts` (outputs next to them)

Identifiers: scenarios `US-N`, invariants `INV-N`, other requirements `FR-NNN`, success criteria `SC-NNN`. Decisions of this run are decision comments on Skein task lc4m-15.30, numbered from `D53`; earlier decisions of the epic keep their numbers.

## Problem / Goal

The library edits declarations but not the references to them, and it cannot edit the specification:
- Removing an element leaves view rules, dynamic steps and view `of` pointing at nothing; LikeC4 then reports `Could not resolve reference` (oracle audit a1, critique K1). Removing a referenced view or deployment node is rejected without a way forward.
- Elements cannot be renamed or moved; a rename by hand misses references in other files.
- `addElement` cannot add into a bodiless parent, root writes go to a file the caller cannot choose, and a file without a `model` block cannot receive them (critique K2).
- Element kinds, relationship kinds, deployment node kinds and tags cannot be added, changed, renamed or removed, although writes reject undeclared kinds and tags.
- Relationships are written only as `a -> b`: no kind, no `<->`, never nested; direction is not reported; `removeRelationship` silently removes the first match.
- `extend` blocks can be read and cleared but not created.
- Element and relationship styles are not reported; `updateElement({ style: { icon } })` on an element with a body `icon` writes a redundant icon LikeC4 ignores and warns about.
- After `addElement`, references in view rules, dynamic steps and deployment are not re-checked (lc4m-17), so a new name can silently re-target them.

Goal: every reference kind of the DSL has a defined behaviour for every write that adds, removes, renames or moves what it points at; the specification is editable; relationships, `extend` blocks, placement and styles are covered as the task describes — through the library and `apply`, rejecting before writing anything LikeC4 would reject. An accepted write introduces no `likec4 validate` error (INV-1).

## Scope

**In scope**
- **A. References.** One reference policy for `removeElement`, `removeDeploymentNode`, `removeDeploymentInstance` and `removeView` (US-1, US-2); `renameElement` and `moveElement` that rewrite every reference in every file (US-3); one re-check after every write that adds, removes, renames or moves a declaration, covering every reference kind of FR-001 (US-4, lc4m-17).
- **B. Placement.** `addElement` into a bodiless parent; a `file` option for root `addElement` and top-level `addRelationship`; creation of a missing `model` block; `apply` `addElement` without `parent` and without `title` (US-5).
- **C. Specification.** Add, update, rename and remove element kinds, relationship kinds, deployment node kinds (with their string, tag and link defaults) and tags; creation of a missing `specification` block (US-6, US-7).
- **D. Relationships.** `addRelationship` with a kind (both connector forms), `<->`, and nested placement in the source's declaration body; direction reported; one selector for `updateRelationship`, `removeRelationship` and `extend` relationship blocks (US-8, US-9).
- **E. `extend` blocks.** Create `extend <element>` and `extend <a> -> <b>` blocks, merging into an existing block of the same target in the chosen file (US-10).
- **F. Styles.** Report own, kind and effective style of elements (body `icon` included) and relationships (kind `multiple` included); `updateElement({ style: { icon } })` updates an existing body `icon` (US-11).
- `apply` operations for every write; README, CHANGELOG, coverage rows named in the task; version 0.11.0 prepared (SC-011, SC-012).

**Unchanged in this run (already covered by earlier stages)**
- File choice of `addView` (D27/D41), `addDeploymentNode` (root only), `addDeploymentRelationship`, `addDeploymentExtend` (`file` required), and the rejection of `file` for child deployment nodes and for instances (D84). Their existing tests cover the task's "each creating operation" requirement for them.
- The standalone CLI commands (`add-element`, `add-relationship`, `remove-element`, `remove-relationship`, …) keep their options; they apply the library's new rejections and behaviour, and the README points to `apply` for the new options. CLI parity is lc4m-15.31 (D84).

**Not in scope**
- Renaming deployment nodes and views, and changing an element's kind (D59): coverage rows stay `no` with a note.
- Writing styles, notation, `multiple`, colors of kinds; tag colors; custom `color` declarations; body `icon` / `notation` writes other than US-11 (stage 6, lc4m-15.32). They are preserved byte for byte by every write of this feature.
- Writing a nested relationship into an `extend` body, and moving an element into an `extend` body (D90): coverage note for "nested in an `extend` body" (Add) stays `no`.
- Changing endpoints, kind or direction of an existing relationship (coverage note stays `no`).
- Removing one specific `extend` block (D73): coverage stays `no`.
- Manual layouts (`.likec4.snap` files) are not read or updated: a rename, move or removal can leave layout drift there; INV-1 is about `.c4` sources (D91, documented in the README).
- Project configuration (`likec4.config.*`: `styles.defaults`, `inferTechnologyFromIcon`, imports, multi-project): not read; reported styles do not include theme or configured defaults (documented gap).
- Creating new files: every target file must be loaded (D63).

**Deliberately deferred**
- Semantic validation equal to `likec4 validate` inside the library (lc4m-15.31). Tests use the LikeC4 oracle.

## Scenarios and acceptance

### US-1 — Removing an element, deployment node or instance never leaves a dangling reference (P1)
- **Current**: `removeElement` removes the declaration, the relationships with an endpoint in its subtree, the `extend` blocks of the subtree and orphaned `extend a -> b` blocks, but leaves view `of`, view rules, `with`, dynamic steps and style and rank targets pointing at nothing; it rejects only deployment references (`instanceOf`, deployment relationship endpoints through an instance). `removeDeploymentNode` / `removeDeploymentInstance` reject deployment view references into the removed subtree.
- **Expected**: each reference into the removed subtree is handled as FR-001 says. By default a reference that the policy does not own is a rejection that lists every such reference (file, line, kind of reference, view or construct). With `cascade`, the referencing constructs are removed as FR-001 says. A view `of` or an `extends` that would lose its target, a reference from a construct cascade cannot edit (FR-001), and a cascade that would leave a view with no include or exclude rule (D77) are rejections in both modes; a rejection with `cascade` lists separately the references that block the write and those cascade would have removed.
- **Unchanged**: owned constructs (relationships with an endpoint in the subtree, `extend` blocks of the subtree, orphaned `extend a -> b` blocks, deployment relationships with an endpoint in a removed deployment subtree, `extend <node>` blocks of a removed node subtree) are removed in both modes, as today.
- **Acceptance**: Given the audit a1 model (a view `of app.api`, `include app.api`, a dynamic step `app.api -> app.db`) and its variants — `instanceOf`, `navigateTo` (through `removeView`), `exclude`, `with`, dynamic `include`, `rank` targets, style targets in a view and in the `views` block, predicates inside `group`, deployment relationships, deployment view rules — When the element (node, instance) is removed without `cascade`, Then the write is rejected listing every reference and the sources are byte-identical; When removed with `cascade`, Then the result passes `expectValidLikeC4`, exactly the constructs FR-001 names are gone, and every other reference resolves to the same target as before. The a1 model itself is rejected in both modes because of its view `of`, the cascade error naming the `of` as blocking and the include and step as cascadable. Fixtures for D77: a scoped `view of app { include api }` and an unscoped `view { include a }`, both rejected under `cascade` when the removed element is their only predicate. One test per row of FR-001.

### US-2 — Removing a view (P1)
- **Current**: `removeView` rejects a view that is referenced from outside it (D26).
- **Expected**: `extends` of the view is a rejection in both modes, naming every view of the `extends` chain; `navigateTo` (element `with`, relation `with`, step, model relationship body, deployment relationship body) is a rejection by default and, with `cascade`, the `navigateTo` property is removed (a `with { }` left empty is removed with it). References inside the removed view do not block it (D43).
- **Acceptance**: one test per referrer role, both modes; results pass `expectValidLikeC4`.

### US-3 — Rename and move an element (P1)
- **Expected**: `renameElement(fqn, newName)` changes the element's name in place. `moveElement(fqn, target)` moves the declaration with its whole body (nested elements, nested relationships, leading comments) under a new parent — into the parent's declaration body, created if absent — or to the top level of a `model` block of a chosen file (FR-020); a root element may move to the top level of another file. Every reference to the element or anything in its subtree, in every file, is rewritten so that it resolves to its σ-mapped target (INV-3), and every other reference — including references written inside the moved body — keeps resolving to what it resolved to before. The written form is kept where possible (FR-011).
- **What a rename and a move guarantee** (D76): LikeC4's computed elements after the write are the σ-mapped elements before, with the same own and kind-default property values (an element whose displayed title is its name shows the new name); its explicit relationships are the σ-mapped ones (same kinds, titles, directions, values); every reference a view or step writes resolves to its σ-mapped target. Contents that LikeC4 derives from the hierarchy — what `x.*`, `x.**`, `x._`, `*` in a scoped view, or implicit and aggregated relationships show — can change with a move, as they would by hand; the README says so.
- **Rejected before writing**: the new name is not a valid element name; an element of that name already exists under the target parent (or at the top level, for a root target); the target parent is the element itself or inside its subtree; the move changes neither parent nor file (nothing to change); `file` given with a parent target (the parent decides the file); a cross-file move of a declaration that contains an icon value LikeC4 resolves relative to the file (D85); the result would contain a relationship or a dynamic step between an element and its ancestor (LikeC4: `Invalid parent-child relationship`); a reference cannot be rewritten to a text that resolves to the new target at its place; a reference into the subtree sits in a construct the library does not model (FR-004).
- **Acceptance**: Given models where the element is referenced through every reference kind of FR-001 across at least two files (with relative and qualified written forms), When it is renamed or moved, Then the result passes `expectValidLikeC4` and the D76 guarantees hold, compared with LikeC4's computed model; a title-less element and an element with a kind-default title are renamed; a move under `include app.*` shows the documented hierarchy effect; a root-to-root move into another file is accepted; each rejection above is a test.

### US-4 — Every declaration-changing write keeps references stable (P1; lc4m-17)
- **Current**: `addElement` re-checks relationship endpoints, `extend` targets, view `of` and deployment references, but not view rules, dynamic steps, `navigateTo`, `extends`, style or rank targets.
- **Expected**: every write that adds, removes, renames or moves an element, a deployment node or instance, or a view re-checks every reference kind of FR-001 (INV-3); a write that would make an existing resolved reference resolve elsewhere, become ambiguous or stop resolving — other than what the write removes or rewrites on purpose — is rejected with the field that causes it (`name` for `addElement`, as today). References that did not resolve before the write are neither rewritten nor checked (D93).
- **Acceptance**: the lc4m-17 repro (`view index { include api }`, `dynamic view d { api -> other }`, then `addElement('other', { name: 'api' })`) is rejected in the library and in `apply`; one test per reference kind newly covered.

### US-5 — Place new elements and relationships (P1)
- **Expected**: `addElement` into a parent without a body creates the body, keeping the parent's declaration form (`name = kind …` or `kind name …`) and inline strings. Root `addElement` and top-level `addRelationship` accept a `file` (a loaded file); when it has no `model` block, one is appended. Without `file`, the default file rule (FR-021) applies; when no file has a `model` block, one is created in the first file of that rule. `apply` `addElement` accepts a missing `parent` (root) and a missing `title` (LikeC4 then shows the kind title or the name, as the library already reports).
- **Rejected**: a `file` that is not loaded (exact key, D63), `file` together with a `parent` (the parent decides the file).
- **Acceptance**: both declaration forms, with and without inline strings, compared with LikeC4's computed element (`expectAgreesWithLikeC4`); for every operation that gains file choice in this run (root `addElement`, top-level `addRelationship`, kind and tag additions, `moveElement` to the root) the missing-block creation, the chosen file and the default rule are tested, the default rule on a project of at least two files whose load order differs from LikeC4's document order; `extend` creation tests the chosen file and the missing `model` block (its `file` is required, D71); `apply` root and title-less `addElement`; unloaded and colliding file names rejected.

### US-6 — Add and update kinds and tags (P1)
- **Expected**: add an element kind, a relationship kind or a deployment node kind with optional defaults — `title`, `summary` (element and deployment node kinds only, per grammar), `description`, `technology`, `tags` (declared), `links`; add a tag. Update a kind's defaults: strings REPLACE (`null` removes), `tags` and `links` REPLACE (D33 semantics). A `specification` block is created when the target file has none. A `file` option chooses the file of a new declaration (default FR-021); an update edits the one existing declaration wherever it is.
- **Rejected**: a name LikeC4's grammar does not accept as that declaration's name (spike 02: `element view` is a parse error, `element model` is accepted — D67); a name already declared for the same type in any loaded file (LikeC4 errors `Duplicate element kind …` / `Duplicate tag …` on every copy, spike 01); `summary` on a relationship kind; an undeclared tag in `tags`; an update of an undeclared kind; an update, rename or removal of a name the loaded files already declare more than once for that type (D94); an empty update.
- Element kinds, deployment node kinds and relationship kinds are separate name spaces, and a tag may share a name with a kind (spike 02): a name is a duplicate only within its own type. Element and deployment node kinds sharing a name have a special rule for rename and removal (US-7, D78).
- Style, notation, `multiple` and colors of an existing kind are kept as written by every operation of US-6 and US-7.
- **Acceptance**: each kind type and tags added and updated in the library and in `apply`; effective values of elements and relationships of that kind after the change compared with LikeC4's ModelBuilder (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`); at least one accepted keyword-like name and one rejected; every rejection a test.

### US-7 — Rename and remove kinds and tags (P1)
- **Expected**: rename rewrites the declaration and every reference that resolves to it in every file:
  - element and deployment node declarations (`= kind` / `kind name`);
  - relationship connectors (`-[k]->`, `-[k]<->`, `.k`) of model, deployment and `extend` relationships, and of dynamic steps;
  - `#tag` uses in every tags list (elements, relationships, deployment, views, `extend` blocks, kind defaults);
  - view predicates, positive and negated: `where tag is #t` / `is not`, `where kind is k` / `is not`, `element.tag = #t` / `!=`, `element.kind = k` / `!=`, relation `where` kind and tag conditions, participant kind and tag conditions;
  - the same expressions in style rule targets and `rank` targets (in views and in the `views` block).
  Remove deletes the declaration of an unused kind or tag (an emptied `specification { }` block is kept, D94); a used one is a rejection that lists every use (file, line, construct).
- **Shared element and deployment node kind names** (D78): LikeC4 matches `where kind is k` (and participant kind conditions) by name against both element and deployment node kinds (spike 03). Renaming or removing an element kind or a deployment node kind whose name is also declared for the other type is rejected while such a condition names it, listing the conditions; without such a condition the rename rewrites only references that resolve to the renamed declaration (`element.kind` resolves to element kinds only).
- **Rejected**: new name invalid or already declared for the type; rename or remove of an undeclared name; D78 and D94 cases.
- **Acceptance**: a test per reference place of the list (positive and negated forms) across two files; removal of a used kind and of a used tag rejected listing uses; a model declaring element kind `vm` and deployment node kind `vm`, with and without a `where kind is vm` condition, for rename of each; results pass `expectValidLikeC4` and LikeC4's computed model reports the new kind and tag names on the same elements and relationships.

### US-8 — Add typed, bidirectional and nested relationships (P1)
- **Expected**: `addRelationship` accepts a `kind` (a declared relationship kind), written `-[kind]->` by default or `.kind` when the caller asks for the dot form; `bidirectional` (written `<->`, or `-[kind]<->` with a kind); and a nested placement that writes the relationship inside the source element's declaration body (created when absent) without a source: `-> target`, `<-> target`, `-[kind]-> target`, `-[kind]<-> target`, or `.kind target` (D68). The target is written in a form that resolves at that place to the requested element (FR-011). Title, description, technology, tags, links, metadata and style are written as for a top-level relationship. Top-level placement keeps today's form and gains `file` (US-5).
- **Rejected**: an undeclared kind; the dot form together with `bidirectional` (the grammar has no such connector); `file` with nested placement; unresolved endpoints, a self-relationship, parent and child endpoints (as today); a new relationship whose identity matches an existing `extend a -> b` block, unless the caller passes `shared` (D83, the error lists the blocks).
- **Acceptance**: typed (both forms), bidirectional (with and without kind) and nested relationships (every spelling above) added; LikeC4's computed relationships — endpoints, kind, direction, title, values — compared with the library's report (`expectRelationshipsAgreeWithLikeC4`, extended to direction); the D83 rejection and its `shared` acceptance.

### US-9 — Direction and one relationship selector (P1)
- **Expected**: every reported model relationship carries its direction (bidirectional or not), the same field deployment relationships already report; the identity of an `extend a -> b` block reported with a relationship includes its direction. One selector serves `updateRelationship`, `removeRelationship` and `extend` relationship creation (D70, D87): endpoints (a bidirectional relationship matches in either order), `matchKind`, `matchTitle` (as `updateRelationship` matches them today), `matchBidirectional`, and a position (file and line of the relationship's declaration) for relationships no other field tells apart (D81). More than one match is a rejection listing every candidate (file, line, kind, title, direction) and changes nothing; no match is a rejection; both are `InvalidWriteError`. Orphaned `extend a -> b` blocks are still removed with the relationship.
- **This is a behaviour change**: `removeRelationship` used to remove the first match in load order; `updateRelationship` reported ambiguity as a plain `Error` and did not match a bidirectional relationship in reverse order (CHANGELOG).
- **Acceptance**: `->`, `<->`, `-[k]<->` reported with direction and compared with LikeC4 (`isBidirectional`); selector removal and update address exactly the selected relationship, including one of two relationships identical in every selector field (by position); ambiguity is an error with byte-identical sources; orphaned-block cleanup still tested.

### US-10 — Create `extend` blocks (P1)
- **Expected**: create `extend <element> { … }` with tags, links and metadata in a chosen loaded file (required, as for `addDeploymentExtend` — a conscious deviation from the task's optional `file`, D71), inside its `model` block (created if missing). Create `extend <source> -[kind]-> <target> 'title' { … }` (bracket connector with the relationship's kind and direction; matches a dot-form relationship too, spike 01) whose identity — endpoints, kind, title, direction — is taken from one existing relationship selected with the US-9 selector. When the chosen file already has an `extend` block for the same element or the same relationship identity, the new properties are merged into the first such block instead of creating another (FR-050). Effective values follow LikeC4's merge order: kind defaults, declaration, then blocks in document order.
- **Shared identity** (D72): without `shared`, an identity that matches more than the selected relationship is a rejection listing the other matches; with `shared`, the block is created and applies to all of them; `shared` with an identity matching only the selected relationship is accepted and changes nothing.
- **Rejected**: an unresolved element; an undeclared tag; nothing to add (no property, or every tag and link already in the target block); a metadata key the element (or relationship) already has in its declaration or in any `extend` block in any loaded file (D86); a relationship whose title comes only from its kind's default title (D82: LikeC4 1.59.4 either ignores a block without that title or warns about a block with it — spike 03); the shared-identity case above.
- **Acceptance**: element and relationship blocks created in a chosen file, with and without an existing block; effective tags, links and metadata compared with LikeC4's ModelBuilder; LikeC4 emits no `This extend does not match any relation` warning (diagnostics checked, not only errors — INV-2); every rejection a test.

### US-11 — Read styles; body `icon` update (P1)
- **Expected**: every reported element carries its own style (its first `style { }` block plus a body-level `icon`, values as written — D18), its kind's style, and its effective style: the kind style overridden by the own style, with a body `icon` winning over `style { icon }` (spike 01). Every reported model relationship carries its own `line`, `color`, `head`, `tail`, its kind's, and the effective values (kind overridden by own; for a bidirectional relationship an absent `tail` is the effective `head`, else `normal` — spike 01). The kind's style, and for relationship kinds the `multiple` flag, are reported with the kind's values on the element or relationship (D89); `getSpecification()` keeps reporting names only. Theme defaults and configured `styles.defaults` are not applied (D74). The value types are the ones deployment nodes and instances already use; deployment reads keep reporting what they report today. `updateElement({ style: { icon } })` on an element with a body `icon` rewrites that body `icon` and writes no `style { icon }` (D75).
- **Acceptance**: every style field of the grammar, own and kind values and their combination, compared with LikeC4's computed model before theme defaults (`$data`; opacity as LikeC4's number against the written percentage — D88); the body-icon update introduces no `Redundant as icon defined on element` warning (diagnostics checked); deployment readers keep reporting the same values.

### US-12 — Batch operations through `apply` (P1)
- **Expected**: every new library write of US-1–US-11 has an `apply` operation with the same field names and the same strict validation (unknown fields rejected, `mutations[i].<path>` errors, nothing written on any error, atomic across files in memory). Existing operations gain the new fields (`cascade`, `file`, `kind`, `bidirectional`, nested placement, `shared`, the selector fields).

## Architecture overview

### Load-bearing decisions
| # | Decision | Why | Rejected |
|---|---|---|---|
| D54 | Removal of a referenced thing is rejected by default, listing the references; an explicit `cascade` option removes the referencing constructs per FR-001 | no view silently changes meaning unless the caller chooses it; the caller still has a one-step path | always cascade; always reject; rewriting references to another target |
| D55 | Cascade removes the smallest construct that stops referencing (FR-001); a construct the cascade empties is removed when an empty one would not parse or would mean nothing: an include, exclude, style or `rank` rule with no items, a `par` block, a `with { }`, a view `group` | LikeC4 rejects empty `include`, style and `rank` targets (spikes 02, 04); an empty `par` or `with` adds nothing; an empty `group` is an empty box | removing whole views or rules; leaving empty constructs |
| D56 | A view `of` or `extends` losing its target is rejected in both modes | the only cascade would remove a whole view, which must be an explicit `removeView` | cascading to `removeView` |
| D57 | Constructs owned by the removed thing are removed in both modes, as today | unchanged behaviour; they cannot outlive their endpoint | rejecting them by default |
| D58 | Rename and move rewrite every reference by the substitution σ (old FQN → new FQN for the subtree); the written text is kept when it still resolves to the new target at its place, else the minimal change that does (FR-011) | references never change meaning; diffs stay small and readable | always writing full FQNs; keeping text and hoping it resolves |
| D59 | Renaming deployment nodes and views and changing an element's kind are out of scope | each needs its own rules (view ids are matched by text, deployment names have three passes); the task makes them optional | doing them now |
| D60 | One reference check after every declaration-changing write, covering every reference kind of FR-001 (lc4m-17) | one mechanism for remove, rename, move and insertion shadowing | per-operation scanners |
| D61 | A reference from a construct the library does not model (`global` predicates and styles, project imports) or from a stage-6 flow block of a dynamic view (`alt`, `opt`, `loop`, `try` and their branches; D30) blocks remove, rename and move in both modes | the library cannot rewrite or prove it; leaving it dangling breaks INV-1 | ignoring it; cascading into opaque blocks |
| D62 | Default file for root `addElement`, top-level `addRelationship`, a root `moveElement` without `file`, new kind and tag declarations: the first file in LikeC4 document order with the block, else the first file with a `model` block, else the first file (same rule as `addView`, D27/D41) | one file-choice rule across the library | keeping load order for root model writes |
| D63 | Only loaded files are written; `file` must equal a loaded file name exactly; no new files are created | no path handling or file-system side effects in the library; the CLI writes only what it loaded | creating files |
| D64 | `addElement` into a bodiless parent creates the body like `updateElement` does, keeping the declaration form and inline strings | the limit was not from the grammar (K2) | rejecting |
| D65 | `apply` `addElement`: `parent` optional (absent = root), `title` optional, `file` only for root elements | matches the library | requiring them |
| D66 | Specification writes are separate operations per verb (add, update, rename, remove) taking the kind type (`element`, `relationship`, `deploymentNode`) plus tag operations; defaults use D33 semantics | each verb has its own rejections and error path; the three kind types share one shape | one specification patch |
| D67 | Name spaces: a duplicate is a same-type duplicate only; a name must be accepted by LikeC4's grammar in that position (spike 02: `element view` fails, `element model` parses) | LikeC4 behaviour (spikes 01, 02) | one global name space; a fixed keyword list |
| D68 | `addRelationship` kind: bracket form by default, dot form on request; `bidirectional`; nested placement writes the sourceless connector in the source's declaration body | the bracket form is the only one that combines with `<->`; the sourceless form is the shortest unambiguous nested form | `this -> target`; always top level |
| D69 | Direction is reported with the field name and meaning deployment relationships already use | one representation | a new direction enum |
| D70 | One selector for update, remove and `extend` creation: endpoints (bidirectional in either order), `matchKind`, `matchTitle` (today's update semantics), `matchBidirectional`, position; ambiguity is an error | silent first-match removal can delete the wrong relationship; three selectors would diverge | first match; per-operation selectors |
| D71 | `extend <element>` creation requires `file`, merges into the first block of the same target in that file, needs at least one new property | same contract as `addDeploymentExtend`; merging avoids duplicate blocks; an `extend` is written for a file the caller has in mind | default file; always a new block |
| D72 | `extend a -> b` identity is taken from one selected relationship; a shared identity needs `shared` | a block applies to every relationship of the identity (LikeC4, spike 01) | writing identity from caller input |
| D73 | Removing a specific `extend` block stays out of scope | its addressing needs its own design; clears already exist | adding it now |
| D74 | Styles: own (as written, D18), kind, effective (kind overridden by own, body `icon` first; bidirectional `tail` rule); no theme or configured defaults | equals LikeC4's computed model before theme defaults (spike 01) | filling theme defaults; own only |
| D75 | `updateElement({ style: { icon } })` with a body `icon` rewrites the body `icon`; an already present `style { icon }` is left as it is | LikeC4 uses the body icon; the write must not introduce the warning, and pre-existing text is not the write's business | moving the icon into `style` |
| D76 | Rename and move guarantee σ-equality of elements (own and kind-default values; a name-derived title follows the name), explicit relationships and written references; hierarchy-derived view contents may change with a move and are documented | LikeC4 derives wildcard and aggregated contents from the hierarchy (spike 03); preserving them would forbid most moves | rejecting moves that change derived contents; writing old names as titles |
| D77 | A cascade that would leave a view with no include or exclude rule is rejected, naming the view | a scoped view without predicates shows its `of` element, an unscoped one shows nothing: the meaning changes (critique r1, grok) | accepting and documenting the fallback |
| D78 | Element and deployment node kinds sharing a name: rename and removal of either is rejected while a `where kind is` or participant kind condition names it | LikeC4 matches those conditions by name against both kinds (spike 03); neither rewrite keeps the selected set | rewriting both; rewriting the linked one only |
| D79 | Negated predicate forms (`is not`, `!=`, negated relation and participant conditions) are reference places like their positive forms | they link the same declarations (critique r1, grok) | rewriting positive forms only |
| D80 | Dynamic-view `include`, `rank` targets and `views`-block style rules are reference kinds of FR-001 with cascade like their neighbours | LikeC4 reports unresolved references for each (critique r1, codex, grok, claude) | rejecting them always |
| D81 | Relationships no other selector field tells apart are addressed by position (file and line of the declaration), which every ambiguity error lists | LikeC4 accepts identical relationships (spike 03); the caller needs a way forward | remove-all; first match |
| D82 | `extend a -> b` creation for a relationship whose only title is its kind's default title is rejected | LikeC4 1.59.4 ignores a block without the title and warns about a block with it (spike 03) | writing either form |
| D83 | `addRelationship` whose identity matches an existing `extend a -> b` block is rejected unless `shared` | the new relationship would silently take that block's values; same opt-in as D72 | silently joining; reporting only |
| D84 | Existing creating operations keep their file choice; standalone CLI commands keep their options and apply the new behaviour | the task's file choice for them was delivered by earlier stages; CLI parity is lc4m-15.31 | changing them in this run |
| D85 | Moves: a root element may change file; no-op moves rejected; `file` only for a root target; a parent target means its declaration body; a cross-file move of text with an icon LikeC4 resolves relative to the file is rejected | LikeC4 resolves relative icons against the declaring file (critique r1, codex); the other rules make the target unambiguous | rewriting icon paths; moving into `extend` bodies |
| D86 | Adding a metadata key the element or relationship already has anywhere (declaration or any `extend` block) is rejected; tags and links already in the target block are not repeated | a second value turns LikeC4's metadata into an array (critique r1, grok): that is an update, not an add | per-block check only |
| D87 | `updateRelationship` and `removeRelationship` report not-found and ambiguity as `InvalidWriteError` | `apply` error paths; one error contract | plain `Error` |
| D88 | Style comparisons in tests use LikeC4's values before theme defaults; opacity is compared as LikeC4's number against the written percentage | the library reports written forms (D18) and no theme (D74) | comparing getter values |
| D89 | Kind style and relationship-kind `multiple` are reported with the kind's values on the element or relationship; `getSpecification()` keeps names only | one home per value | adding styles to `getSpecification()` |
| D90 | Writing a nested relationship into, or moving an element into, an `extend` body is out of scope | needs its own placement rules (which block, which file) | doing it now |
| D91 | Manual layouts are not read or updated | the library works on `.c4` sources only | updating `.likec4.snap` |
| D92 | An unmodelled construct blocks a write when it contains the name as a whole identifier token or dotted segment (FR-004) | testable and on the safe side; a substring match would block unrelated names (critique r1, grok) | substring match; ignoring unmodelled text |
| D93 | References that did not resolve before a write are neither rewritten nor checked | matches today's check; LikeC4 ambiguity is not the write's business | rejecting writes that make them resolve |
| D94 | An update, rename or removal of a kind or tag declared more than once for its type is rejected; removing the last kind or tag keeps an empty `specification { }` | the input is already invalid for LikeC4; an empty block is valid (spike 04) | picking one declaration; removing the block |

### Component boundaries
- **Reference catalogue** (new, read side): for a set of documents, every reference of FR-001 with its place (file, position, enclosing construct), its written text and its resolved target, built on the existing resolvers (logical, view, deployment); answers "every reference into this subtree / to this view / to this kind or tag".
- **Reference policy** (new): turns a removal and the catalogue into rejections or cascade edits (FR-001).
- **Rewriter** (new): computes the rewritten text of each reference for rename and move (FR-011), and the moved declaration's new text.
- **Specification writers** (new), **relationship writer and selector** (extended), **extend writers** (new), **style readers** (extended to elements and relationships), **write checks** (extended: names, kinds and tags in new positions, file choice).
- **Stability check** (extended): the existing before/after reference snapshot, switched to cover every reference kind of FR-001 for every declaration-changing write.
- **`apply`** (extended), **test helper** (extended: computed element and relationship style before theme defaults, relationship direction, warning diagnostics).

### Data flow
Write: validate form → resolve the target (element, view, kind, relationship) → catalogue references → policy decides: reject / cascade edits / rewrite edits → declaration edits → apply all files atomically → rebuild indexes → stability check (every surviving resolved reference resolves to its σ-mapped target; roll back otherwise) → result with changed files and, for cascades, the removed constructs.

### Key invariants
- **INV-1** An accepted write introduces no LikeC4 error in the `.c4` sources (introduced-only): a file set that passed `likec4 validate` before passes after (`expectValidLikeC4`). Manual layouts are outside (D91).
- **INV-2** An accepted write introduces none of these LikeC4 warnings: `Redundant as icon defined on element`, `This extend does not match any relation …`, `Prefer one specification per document`. Tests check diagnostics, because `likec4 validate` does not fail on warnings (spikes 01, 04).
- **INV-3** Reference stability: after an accepted write, every reference that resolved before and survives the write resolves to σ(its old target), where σ is the identity except for the renamed or moved subtree. A surviving reference is one the write does not remove (owned, D57, or cascaded, D55); rewritten references (D58) are surviving and must resolve to σ. References that did not resolve before are not touched (D93). Without `cascade`, no non-owned reference is removed.
- **INV-4** A rejected write changes no file and no in-memory state; the error names the field (`InvalidWriteError`); `apply` reports `mutations[i].<field>` and writes nothing.
- **INV-5** Text outside the edited ranges is byte-identical, including comments and other declarations; edits keep the file's indentation and line endings; kind styles, notation, colors and other stage-6 text are kept as written.
- **INV-6** Generic: no element kinds, relationship kinds, tags, metadata keys, view ids or nesting depths are assumed; tests use at least two unrelated specifications.
- **INV-7** Reads equal LikeC4 1.59.4's computed model for every value this feature reports (direction, kinds after rename, effective defaults after a kind change, effective `extend` values, effective styles before theme defaults), with the documented exceptions: written forms of style values (D18, D88), no theme or configured defaults (D74).
- **INV-8** Existing reads and writes keep their behaviour, except the documented changes: the remove operations' new rejections and cascades (US-1, US-2), relationship selection and its error type (US-9, D87), the default file of root `addElement` / `addRelationship` now in LikeC4 document order (D62; differs only when load order and document order differ), `addElement`'s and `addRelationship`'s new rejections (US-4, D83), and `updateElement` style icon placement (D75).
- **INV-9** Every named view LikeC4 computed before an accepted write is still computed after it (σ-mapped), except a view `removeView` removes on purpose (same as lc4m-15.29 INV-9).

### Integration points and contracts
| Surface | Contract |
|---|---|
| Remove operations | + `cascade` option; result lists the cascaded constructs; new rejections (US-1, US-2) |
| New element operations | rename, move (names fixed in the plan); each returns `{ changedFiles }` |
| `addElement` | bodiless parent accepted; `file` for root |
| `addRelationship` | + `kind`, dot form, `bidirectional`, nested placement, `file`, `shared` |
| `updateRelationship`, `removeRelationship` | one selector (D70, D81); ambiguity and not-found are `InvalidWriteError` |
| New specification operations | add / update / rename / remove for the three kind types; add / rename / remove tag; `file` for additions |
| New `extend` operations | create an element block; create a relationship block (selector + `shared`) |
| Reads | model relationships + direction and styles; elements + styles; the kind's style and `multiple` with the kind's values; `getSpecification()` unchanged |
| `apply` | one operation per new write, same field names; new fields on existing operations |
| Standalone CLI commands | options unchanged; new library behaviour applies (D84) |
| LikeC4 reference scoping | as mirrored today (lc4m-15.29 D25, spike 03 there): element and `extend` body frames, view `of` / `extends` frames, document scope, top-level names, deployment passes |

### Significant non-functional constraints
- Atomic in memory across files; formatting, comments and line endings kept as existing writers do.
- A write builds its reference catalogue once before and once after its edits, and edits each file once; no numeric bound is set (SC-011 runs the suite in its usual time).

### Rejected alternatives
- Linking with the language server inside the library to find references (lc4m-15.31).
- Rewriting every reference to a full FQN on rename / move: correct but rewrites relative text users chose on purpose.

## API / event surface (from code)

| Today | Change |
|---|---|
| `removeElement(fqn)` | + `cascade`; new rejections for view, style and rank references; result + cascaded constructs |
| `removeDeploymentNode(id)`, `removeDeploymentInstance(id)` | + `cascade` for deployment view references |
| `removeView(id)` | + `cascade` for `navigateTo` |
| — | rename element, move element |
| `addElement(parent, opts)` | bodiless parent; `file` for root |
| `addRelationship(source, target, label?, opts?)` | + `kind`, dot form, `bidirectional`, nested placement, `file`, `shared`; new D83 rejection |
| `updateRelationship(…)` | + `matchBidirectional`, position, reverse-order match for `<->`; `InvalidWriteError` |
| `removeRelationship(source, target)` | + the same selector; ambiguity and not-found as `InvalidWriteError` |
| `getSpecification()` | unchanged; new add / update / rename / remove operations for kinds and tags |
| — | create `extend <element>` block, create `extend a -> b` block |
| element and relationship reads | + style (own, kind, effective); relationships + direction; relationship kind values + `multiple` |
| `apply` | new operations; new fields on `addElement`, `addRelationship`, `updateRelationship`, `removeRelationship`, `removeElement`, `removeDeploymentNode`, `removeDeploymentInstance`, `removeView` |

## Data / entities / migrations
No persisted data. Source files are the data; every change is an edit of loaded files.

## Constraints
- Public repository: code, tests, fixtures, docs and commit messages in English, neutral names (`app`, `api`, `db`).
- No new runtime dependency.

## Edge cases, failures, concurrency
- **Reference inside the removed or moved subtree to outside**: on removal it goes with the subtree; on move it is re-checked and rewritten if its text would resolve elsewhere from the new place (FR-011).
- **Reference to the subtree from inside the subtree** (a nested relationship between two children of the moved element): rewritten if needed; usually keeps its relative text.
- **Same element referenced several times in one rule or step** (`include api, api.*`): each reference handled; cascade removes each item.
- **Selector references** `x.*`, `x.**`, `x._`: the base reference counts; cascade removes the item; rename keeps the selector suffix.
- **Relation predicates** (`include a -> b`, `exclude * -> b`): the item references both sides; either side in the removed subtree makes it a reference.
- **`with` and `where` on an item** that is cascaded: removed with the item (each `where` belongs to its own expression).
- **Predicates inside a view `group`**: the same items as top-level ones; an emptied group is removed (D55).
- **Chains** (`a -> b -> c`) in dynamic views: one statement; cascade removes the whole statement; rename and move rewrite the segment texts in place.
- **A removed element is the `of` of a view extended by another view**: rejected (D56), the error names both views.
- **A cascade that empties a view of include and exclude rules**: rejected (D77).
- **Ambiguous names before the write** (LikeC4 cannot resolve them): untouched (D93).
- **Move that changes neither parent nor file**: rejected as nothing to change; a root element moved to another file is a real move (D85).
- **Move between files**: the declaration leaves its file; `extend` blocks of the element in other files are rewritten to the new FQN; the file left without the element keeps its `model` block even if empty.
- **Kind rename where an element is declared `kind name`** (kind-first form): the kind token is rewritten, the name kept.
- **Tag rename**: a tag's colour block in the specification is kept; `#old` inside a markdown or string value is text, not a reference, and is not rewritten.
- **Bidirectional selector**: `removeRelationship(b, a)` matches `a <-> b`.
- **Files with syntax errors**: writes behave as existing writes do (rejected where the edit would not parse; reads best effort); text the parser could not recover is handled by FR-004.
- **Concurrency**: the library is single-threaded per instance; `apply` is atomic in memory.

## Functional requirements

### FR-001 Reference policy table
Reference kinds into a removed subtree (element, deployment node or instance) or view, and what removal does:

| Reference kind | Default | `cascade` |
|---|---|---|
| model relationship endpoint (any nesting level, `extend` body) | removed (owned) | removed |
| `extend <element>` target; `extend a -> b` endpoint; orphaned `extend a -> b` | removed (owned) | removed |
| deployment relationship endpoint into a removed deployment subtree | removed (owned) | removed |
| `extend <node>` target in a removed node subtree | removed (owned) | removed |
| `instanceOf` into a removed element subtree | rejected | the instance is removed, as `removeDeploymentInstance` with `cascade` |
| deployment relationship endpoint through an instance into a removed element subtree | rejected | the relationship is removed |
| view `of` | rejected | rejected (D56) |
| view `extends` (removeView) | rejected | rejected (D56) |
| include / exclude predicate item (element, selectors, relation predicates, `element.*` expressions with a reference), in element, dynamic and deployment views, at top level or inside a `group` | rejected | the item is removed; the rule when it was the last item; the group when it was emptied; rejected if the view would have no include or exclude rule left (D77) |
| `with { … }` and `where` on such an item | go with the item | go with the item |
| `navigateTo` in element `with`, relation `with`, step, model relationship body, deployment relationship body (removeView) | rejected | the property is removed; an emptied `with { }` too |
| dynamic step endpoint (single step, chain segment, inside `par`) | rejected | the step statement is removed; an emptied `par` too |
| style rule target, in a view or in the `views` block | rejected | the target is removed; the rule when it was the last target |
| `rank` target | rejected | the target is removed; the rule when it was the last target |
| reference inside a stage-6 flow block (`alt`, `opt`, `loop`, `try` and branches) | rejected | rejected (D61) |
| `global` predicates and styles, project imports | rejected | rejected (D61) |
| `where` conditions | — | — (they reference kinds, tags and metadata only) |

Every rejection lists every reference (file, line, kind of reference, enclosing view or construct); with `cascade` it separates the references that block the write from those the cascade would have removed. The cascade result lists every construct it removed.

### FR-004 Unmodelled references
A construct the library does not resolve (`global` blocks, imports, stage-6 flow blocks, text the parser could not recover) blocks remove, rename and move when it names the affected element, node, view, kind or tag: a whole identifier token equal to the name, or a dotted segment equal to it, outside comments and string values of recovered text. The write is rejected naming the file and line. A longer identifier that merely contains the name does not block.

### FR-011 Written form on rename and move
For each reference into the subtree (and each reference inside a moved body), in this order: keep the text if it resolves at its place to σ(target) after the write; else replace the segments that name the renamed or moved part (keeping the selector suffix); else write the full FQN of σ(target) if it resolves there; else reject (US-3).

### FR-020 Move placement
The declaration moves as text (with its leading comments and body) to the end of the new parent's declaration body, created if absent, or to the end of the first `model` block of the chosen file (created if absent; default file D62). Indentation is adjusted to the new depth; line endings follow the target file.

### FR-021 Default file
As D62: the first file in LikeC4 document order that has the block written into, else the first file with a `model` block, else the first file.

### FR-050 Merge into an existing `extend` block
New tags are appended after the block's existing tags; new links are appended; new metadata keys are appended to the block's metadata (created if absent). Tags and links already in the target block are not repeated (identical links in other blocks are kept, as LikeC4 keeps duplicates). Effective values are recomputed by the existing merge rules.

## Success criteria
- **SC-001** Every row of FR-001 has a test for default and `cascade` removal, each output passing `expectValidLikeC4` or rejected with byte-identical sources; the D77 fixtures are rejected.
- **SC-002** The audit a1 repro and its variants (`instanceOf`, `navigateTo`, `exclude`, `with`, dynamic `include`, `rank`, view and `views`-block style targets, `group` predicates, deployment relationships) behave as FR-001 says.
- **SC-003** Rename and move: the D76 guarantees hold against LikeC4's computed model in tests covering every reference kind across two files; the hierarchy effect of a move is shown by a test and documented.
- **SC-004** The lc4m-17 repro is rejected (library and `apply`).
- **SC-005** Every operation that gains file choice in this run is tested with a chosen file, with the default file (on a project whose load order differs from document order) and with a missing block; `extend` creation with a chosen file and a missing block.
- **SC-006** Kind and tag add / update / rename / remove for all three kind types in the library and `apply`; effective values compared with LikeC4's ModelBuilder; every reference place of US-7, positive and negated, covered by a rename test; the D78 cases.
- **SC-007** Typed (both forms), bidirectional and nested relationships (every spelling of US-8) compared with LikeC4 including direction; D83.
- **SC-008** The relationship selector addresses exactly one relationship in update and remove, including by position; ambiguity changes nothing.
- **SC-009** `extend` creation: effective values equal LikeC4's; no `does not match any relation` warning; D82 and D86 rejections.
- **SC-010** Style reads equal LikeC4's computed element and relationship styles before theme defaults (D88) for every grammar field and kind defaults; the body-icon update introduces no `Redundant as icon` warning.
- **SC-011** `npm run lint` (with the coverage check) and the test suite pass; the coverage rows named in the task are updated; version 0.11.0 is prepared (package.json, coverage document, CHANGELOG) and not published.
- **SC-012** README: the FR-001 reference policy as a table; placement and file choice (D62, D63, D85); "Specification defaults → Writing" rewritten; "`extend` blocks → Writing"; relationships (kind, direction, nesting, selector); styles (D74, D75); the move hierarchy effect (D76) and manual layouts (D91). CHANGELOG lists every behaviour change of INV-8.

## Clarifications
- Q: Include lc4m-17? → A: yes (D53, task comment of 2026-10-10).
- Q: Who decides product forks in this run? → A: the lead, logged as decision comments `D<N>` on lc4m-15.30 (owner, 2026-10-17).
- Q: Rename deployment nodes and views? → A: not in this run (D59; the task makes them optional).
- **Testing** (the project testing section of CLAUDE.md): only unit tests (vitest; library and CLI on LikeC4's real parser; CLI tests run `npx tsx src/cli.ts` as subprocesses) plus the coverage-table check inside `npm run lint`. Integration, e2e, smoke and mutation testing are not part of the project. The LikeC4 oracle (`expectValidLikeC4`, `buildLikeC4Model`, `expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`) is the reference for every write and read; INV-2 needs warning diagnostics from it. The full suite is long; it runs in parts.

## Open questions / [NEEDS CLARIFICATION]
None.

## Decomposition preview
1. Reference catalogue and the widened stability check (US-4, lc4m-17) — foundation for 2–3 and 6.
2. Reference policy for removals, `cascade` (US-1, US-2).
3. Rename and move (US-3).
4. Placement and default file; bodiless parents; `apply` `addElement` (US-5).
5. Specification add / update / rename / remove (US-6, US-7).
6. Relationships: kind, direction, nesting, selector (US-8, US-9); `extend` creation (US-10).
7. Style reads and body icon (US-11); docs, coverage, CHANGELOG, version.

## FOR-PLAN backlog
- `removeElement` with an unknown FQN throws a plain `Error`; element and deployment removals leak `EditRefusedError` as a plain `Error` (recon A §1, §5). The plan decides whether to map them to `InvalidWriteError` (apply paths) with the new rejections.
- The test helper's relationship comparison does not compare direction or style (recon D/F §9); it must for INV-7.
- `findFileWithModel` uses load order while `chooseBlockPlacement` uses document order (recon B §2); D62 unifies them.
- The snapshot does not cover `views`-block style rules, and the view reader does not parse style and `rank` targets (recon A §2, recon B/C/E §6): the catalogue needs a source for both (critique r1, claude).
- `extend` relationship identity must use the title LikeC4's merge uses; with D82 the written block carries the relationship's own title (critique r1, claude).
- Which leading comments belong to a moved declaration (FR-020; critique r1, claude).
- `matchTitle` compares the raw inline title while the deployment selector compares the effective title; candidate lists and `extend` identity must use one on purpose (critique r1, claude).
