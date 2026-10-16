# Spec: References, rename and move, placement, specification, relationships, extend blocks, styles

**Date** 2026-10-17 · **Status** DRAFT · **Task**: lc4m-15.30 (epic lc4m-15, stages 3 and 4; includes lc4m-17) · **Affects**: likec4-mutator (library, `apply` CLI command, docs)
**Type**: feature + change (new rejections and cascades of the remove operations, `removeRelationship` selection, default file order of root writes) · **Based on**: README sections "Views", "Deployment model", "Specification defaults", "`extend` blocks", "Rejected writes"; lc4m-15.28 and lc4m-15.29 specs (decisions D4, D11, D18, D25, D26, D27, D33, D34, D41, D43); reconnaissance `spikes/recon-a.md`, `spikes/recon-bce.md`, `spikes/recon-df.md`; LikeC4 1.59.4 facts `spikes/01-likec4-facts.mts`, `spikes/02-names-and-leftovers.mts` (outputs next to them)

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
- **A. References.** One reference policy for `removeElement`, `removeDeploymentNode`, `removeDeploymentInstance` and `removeView` (US-1, US-2); `renameElement` and `moveElement` that rewrite every reference in every file (US-3); one re-check after every write that adds, removes, renames or moves a declaration, covering view rules, dynamic steps and deployment references (US-4, lc4m-17).
- **B. Placement.** `addElement` into a bodiless parent; a `file` option for root `addElement` and top-level `addRelationship`; creation of a missing `model` block; `apply` `addElement` without `parent` and without `title` (US-5).
- **C. Specification.** Add, update, rename and remove element kinds, relationship kinds, deployment node kinds (with their string, tag and link defaults) and tags; creation of a missing `specification` block (US-6, US-7).
- **D. Relationships.** `addRelationship` with a kind (both connector forms), `<->`, and nested placement in the source's body; direction reported; a selector for `removeRelationship` (US-8, US-9).
- **E. `extend` blocks.** Create `extend <element>` and `extend <a> -> <b>` blocks, merging into an existing block of the same target in the chosen file (US-10).
- **F. Styles.** Report own, kind and effective style of elements (body `icon` included) and relationships (kind `multiple` included); `updateElement({ style: { icon } })` updates an existing body `icon` (US-11).
- `apply` operations for every write; README, CHANGELOG, coverage rows named in the task; version 0.11.0 prepared.

**Not in scope**
- Renaming deployment nodes and views, and changing an element's kind (D59): coverage rows stay `no` with a note.
- Writing styles, notation, `multiple`, colors of kinds; tag colors; custom `color` declarations; body `icon` / `notation` writes other than US-11 (stage 6, lc4m-15.32). They are preserved byte for byte by every write of this feature.
- Changing endpoints, kind or direction of an existing relationship (coverage note stays `no`).
- Removing one specific `extend` block (D73): coverage stays `no`.
- Project configuration (`likec4.config.*`: `styles.defaults`, `inferTechnologyFromIcon`, imports, multi-project): not read; reported styles do not include configured defaults (documented gap).
- Creating new files: every target file must be loaded (D63).

**Deliberately deferred**
- Semantic validation equal to `likec4 validate` inside the library (lc4m-15.31). Tests use the LikeC4 oracle.

## Scenarios and acceptance

### US-1 — Removing an element, deployment node or instance never leaves a dangling reference (P1)
- **Current**: `removeElement` removes the declaration, the relationships with an endpoint in its subtree, the `extend` blocks of the subtree and orphaned `extend a -> b` blocks, but leaves view `of`, view rules, `with`, dynamic steps and view `style` rule targets pointing at nothing; it rejects only deployment references (`instanceOf`, deployment relationship endpoints through an instance). `removeDeploymentNode` / `removeDeploymentInstance` reject deployment view references into the removed subtree.
- **Expected**: each reference into the removed subtree is handled as the policy table (FR-001) says. By default a reference that the policy does not own is a rejection that lists every such reference (file, line, kind of reference, view or construct). With `cascade`, the referencing constructs are removed as the table says. A view `of` or an `extends` that would lose its target is a rejection in both modes.
- **Unchanged**: owned constructs (relationships with an endpoint in the subtree, `extend` blocks of the subtree, orphaned `extend a -> b` blocks, deployment relationships with an endpoint in a removed deployment subtree, `extend <node>` blocks of a removed node subtree) are removed in both modes, as today.
- **Acceptance**: Given the audit a1 model (a view `of app.api`, `include app.api`, a dynamic step `app.api -> app.db`) and its variants — `instanceOf`, `navigateTo` (through `removeView`), `exclude`, `with`, view `style` rule targets, deployment relationships, deployment view rules — When the element (node, instance) is removed without `cascade`, Then the write is rejected listing every reference and the sources are byte-identical; When removed with `cascade`, Then the result passes `expectValidLikeC4`, exactly the constructs of the table are gone, and every other reference resolves to the same target as before. One test per reference kind of FR-001.

### US-2 — Removing a view (P1)
- **Current**: `removeView` rejects a view that is referenced from outside it (D26).
- **Expected**: same policy as US-1 for view references: `extends` of the view is a rejection in both modes; `navigateTo` (element `with`, relation `with`, step, model relationship body, deployment relationship body) is a rejection by default and, with `cascade`, the `navigateTo` property is removed (a `with { }` left empty is removed with it). References inside the removed view do not block it (D43).
- **Acceptance**: one test per referrer role, both modes; results pass `expectValidLikeC4`.

### US-3 — Rename and move an element (P1)
- **Expected**: `renameElement(fqn, newName)` changes the element's name in place. `moveElement(fqn, newParent | root, file?)` moves the declaration with its whole body (nested elements, nested relationships, comments) under a new parent (creating its body if needed) or to the top level of a `model` block of the chosen file (FR-020). Every reference to the element or anything in its subtree, in every file, is rewritten so that it resolves to the renamed or moved target (σ, INV-3), and every other reference — including references written inside the moved body — keeps resolving to what it resolved to before. The written form is kept where possible (FR-011).
- **Rejected before writing**: the new name is not a valid element name; an element of that name already exists under the target parent (or at the top level, for a root target); the target parent is the element itself or inside its subtree; the result would contain a relationship or a dynamic step between an element and its ancestor (LikeC4: `Invalid parent-child relationship`); a reference cannot be rewritten to a text that resolves to the new target at its place; a reference into the subtree sits in a construct the library does not model (FR-004).
- **Acceptance**: Given models where the element is referenced through every reference kind of FR-001 across at least two files (with relative and qualified written forms), When it is renamed or moved, Then the result passes `expectValidLikeC4`, LikeC4's computed model has the same elements under σ-mapped FQNs with the same properties, the same relationships (σ-mapped endpoints, same kinds, titles, directions), and the same computed view contents (σ-mapped); each rejection above is a test.

### US-4 — Every declaration-changing write keeps references stable (P1; lc4m-17)
- **Current**: `addElement` re-checks relationship endpoints, `extend` targets, view `of` and deployment references, but not view rules, dynamic steps, `navigateTo`, `extends` or view `style` rule targets.
- **Expected**: every write that adds, removes, renames or moves an element, a deployment node or instance, or a view re-checks every reference kind of FR-001 (INV-3); a write that would make an existing reference resolve elsewhere, become ambiguous or stop resolving — other than what the write removes or rewrites on purpose — is rejected with the field that causes it (`name` for `addElement`, as today).
- **Acceptance**: the lc4m-17 repro (`view index { include api }`, `dynamic view d { api -> other }`, then `addElement('other', { name: 'api' })`) is rejected in the library and in `apply`; one test per reference kind newly covered.

### US-5 — Place new elements and relationships (P1)
- **Expected**: `addElement` into a parent without a body creates the body, keeping the parent's declaration form (`name = kind …` or `kind name …`) and inline strings. Root `addElement` and top-level `addRelationship` accept a `file` (a loaded file); when it has no `model` block, one is appended. Without `file`, the default file rule (FR-021) applies; when no file has a `model` block, one is created in the first file of that rule. `apply` `addElement` accepts a missing `parent` (root) and a missing `title` (LikeC4 then shows the kind title or the name, as the library already reports).
- **Rejected**: a `file` that is not loaded (exact key, D63), `file` together with a `parent` (the parent decides the file).
- **Acceptance**: both declaration forms, with and without inline strings, compared with LikeC4's computed element (`expectAgreesWithLikeC4`); missing-block creation, chosen file and default rule each tested for every creating operation of this feature and of earlier ones that gained `file` (`addElement`, `addRelationship`, kind and tag additions, `extend` creation); `apply` root and title-less `addElement`; invalid and colliding file names rejected.

### US-6 — Add and update kinds and tags (P1)
- **Expected**: add an element kind, a relationship kind or a deployment node kind with optional defaults — `title`, `summary` (element and deployment node kinds only, per grammar), `description`, `technology`, `tags` (declared), `links`; add a tag. Update a kind's defaults: strings REPLACE (`null` removes), `tags` and `links` REPLACE (D33 semantics). A `specification` block is created when the target file has none. A `file` option chooses the file of a new declaration (default FR-021); an update edits the one existing declaration wherever it is.
- **Rejected**: an invalid name (not an identifier, or a keyword LikeC4 cannot parse as one — spike 02); a name already declared for the same type in any loaded file (LikeC4 errors `Duplicate element kind …` / `Duplicate tag …` on every copy, spike 01); `summary` on a relationship kind; an undeclared tag in `tags`; an update of an undeclared kind; an empty update.
- Element kinds, deployment node kinds and relationship kinds are separate name spaces, and a tag may share a name with a kind (spike 02): a name is a duplicate only within its own type.
- Style, notation, `multiple` and colors of an existing kind are kept as written by every operation of US-6 and US-7.
- **Acceptance**: each kind type and tags added and updated in the library and in `apply`; effective values of elements and relationships of that kind after the change compared with LikeC4's ModelBuilder (`expectAgreesWithLikeC4`, `expectRelationshipsAgreeWithLikeC4`); every rejection a test.

### US-7 — Rename and remove kinds and tags (P1)
- **Expected**: rename rewrites the declaration and every reference to the kind or tag in every file: element and deployment node declarations (`= kind` / `kind name`), relationship connectors (`-[k]->`, `-[k]<->`, `.k`) of model, deployment and `extend` relationships, dynamic steps, `#tag` uses in every tags list (elements, relationships, deployment, views, `extend` blocks, kind defaults), view predicates (`where tag is #t`, `where kind is k`, `element.tag = #t`, `element.kind = k`, relation `where` kind and tag conditions, participant conditions). Remove deletes the declaration of an unused kind or tag; a used one is a rejection that lists every use (file, line, construct).
- **Rejected**: new name invalid or already declared for the type; rename or remove of an undeclared name.
- **Acceptance**: a test per reference place of the list, across two files; removal of a used kind and of a used tag rejected listing uses; results pass `expectValidLikeC4` and LikeC4's computed model reports the new kind and tag names on the same elements and relationships.

### US-8 — Add typed, bidirectional and nested relationships (P1)
- **Expected**: `addRelationship` accepts a `kind` (a declared relationship kind), written `-[kind]->` by default or `.kind` when the caller asks for the dot form; `bidirectional` (written `<->`, or `-[kind]<->` with a kind); and a nested placement that writes the relationship inside the source element's declaration body as `-> target` (creating the body when there is none), with the target written in a form that resolves at that place to the requested element (FR-011). Top-level placement keeps today's form and gains `file` (US-5).
- **Rejected**: an undeclared kind; the dot form together with `bidirectional` (the grammar has no such connector); `file` with nested placement; unresolved endpoints, a self-relationship, parent and child endpoints (as today).
- **Acceptance**: typed (both forms), bidirectional (with and without kind) and nested relationships added; LikeC4's computed relationships — endpoints, kind, direction, title, values — compared with the library's report (`expectRelationshipsAgreeWithLikeC4`, extended to direction).

### US-9 — Direction and removal selector (P1)
- **Expected**: every reported model relationship carries its direction (bidirectional or not), the same field deployment relationships already report; the identity of an `extend a -> b` block reported with a relationship includes its direction. `removeRelationship` accepts the selector `updateRelationship` uses (`matchKind`, `matchTitle`) plus `matchBidirectional`; endpoints of a bidirectional relationship match in either order. More than one match without a selector that singles one out is a rejection listing every candidate (file, line, kind, title, direction) and changes nothing; no match is a rejection. Orphaned `extend a -> b` blocks are still removed with the relationship.
- **This is a behaviour change**: `removeRelationship` used to remove the first match in load order (CHANGELOG).
- **Acceptance**: `->`, `<->`, `-[k]<->` reported with direction and compared with LikeC4 (`isBidirectional`); selector removal removes exactly the selected relationship; ambiguity is an error with byte-identical sources; orphaned-block cleanup still tested.

### US-10 — Create `extend` blocks (P1)
- **Expected**: create `extend <element> { … }` with tags, links and metadata in a chosen loaded file (required, as for `addDeploymentExtend`), inside its `model` block (created if missing). Create `extend <source> -> <target> 'title' { … }` (connector with the relationship's kind and direction) whose identity — endpoints, kind, title, direction — is taken from one existing relationship selected with the US-9 selector. When the chosen file already has an `extend` block for the same element or the same relationship identity, the new properties are merged into the first such block instead of creating another (FR-050). Effective values follow LikeC4's merge order: kind defaults, declaration, then blocks in document order.
- **Rejected**: an unresolved element; an undeclared tag; nothing to add (no property, or every tag already in the target block); a metadata key already present in the target block; a relationship identity that matches more than the selected relationship, unless the caller states it explicitly (`shared`), in which case the error lists the other matches when the flag is absent; a block that would match no relationship (cannot arise from a selected relationship; checked anyway, INV-2).
- **Acceptance**: element and relationship blocks created in a chosen file, with and without an existing block; effective tags, links and metadata compared with LikeC4's ModelBuilder; LikeC4 emits no `This extend does not match any relation` warning (diagnostics checked, not only errors — INV-2); every rejection a test.

### US-11 — Read styles; body `icon` update (P1)
- **Expected**: every reported element carries its own style (its first `style { }` block plus a body-level `icon`, values as written — D18), its kind's style, and its effective style as LikeC4 computes it: the kind style overridden by the own style, with a body `icon` winning over `style { icon }` (spike 01). Every reported model relationship carries its own `line`, `color`, `head`, `tail`, its kind's, and the effective values as LikeC4 computes them (kind overridden by own; for a bidirectional relationship an absent `tail` is the effective `head`, else `normal` — spike 01); the kind's `multiple` flag is reported with the kind's values. Theme defaults and configured `styles.defaults` are not applied (Not in scope). The style representation is the one deployment nodes and instances already use. `updateElement({ style: { icon } })` on an element with a body `icon` rewrites that body `icon` and writes no `style { icon }`.
- **Acceptance**: every style field of the grammar, own and kind values and their combination, compared with LikeC4's computed model in tests; the body-icon update introduces no `Redundant as icon defined on element` warning (diagnostics checked); deployment readers keep reporting the same values.

### US-12 — Batch operations through `apply` (P1)
- **Expected**: every new library write of US-1–US-11 has an `apply` operation with the same field names and the same strict validation (unknown fields rejected, `mutations[i].<path>` errors, nothing written on any error, atomic across files in memory). Existing operations gain the new fields (`cascade`, `file`, `kind`, `bidirectional`, nested placement, the selector fields).

## Architecture overview

### Load-bearing decisions
| # | Decision | Why | Rejected |
|---|---|---|---|
| D54 | Removal of a referenced thing is rejected by default, listing the references; an explicit `cascade` option removes the referencing constructs per FR-001 | no view silently changes meaning unless the caller chooses it; the caller still has a one-step path | always cascade; always reject; rewriting references to another target |
| D55 | Cascade removes the smallest construct that stops referencing: a predicate item (its rule when it was the last item), a step statement (a chain is one statement; an emptied `par` is removed), a `navigateTo` property (an emptied `with { }` with it), a view `style` rule target (the rule when it was the last target), a deployment instance (cascading as its own removal), a deployment relationship | LikeC4 rejects `include` with no items and empty style targets (spike 02); the rest of the view keeps its meaning | removing whole views or rules; leaving empty constructs |
| D56 | A view `of` or `extends` losing its target is rejected in both modes | the only cascade would remove a whole view, which must be an explicit `removeView` | cascading to `removeView` |
| D57 | Constructs owned by the removed thing are removed in both modes, as today | unchanged behaviour; they cannot outlive their endpoint | rejecting them by default |
| D58 | Rename and move rewrite every reference by the substitution σ (old FQN → new FQN for the subtree); the written text is kept when it still resolves to the new target at its place, else the minimal change that does (FR-011) | references never change meaning; diffs stay small and readable | always writing full FQNs; keeping text and hoping it resolves |
| D59 | Renaming deployment nodes and views and changing an element's kind are out of scope | each needs its own rules (view ids are matched by text, deployment names have three passes); the task makes them optional | doing them now |
| D60 | One reference check after every declaration-changing write, covering every reference kind of FR-001 including view rules, steps, `navigateTo`, `extends` and view `style` targets (lc4m-17) | one mechanism for remove, rename, move and insertion shadowing | per-operation scanners |
| D61 | A reference into the affected subtree from a construct the library does not model (`global` predicates and styles, project imports) is a rejection | the library cannot rewrite or prove it; leaving it dangling breaks INV-1 | ignoring it |
| D62 | Default file for root `addElement`, top-level `addRelationship`, new kind and tag declarations: the first file in LikeC4 document order with the block, else the first file with a `model` block, else the first file (same rule as `addView`, D27/D41) | one file-choice rule across the library | keeping load order for root model writes |
| D63 | Only loaded files are written; `file` must equal a loaded file name exactly; no new files are created | no path handling or file-system side effects in the library; the CLI writes only what it loaded | creating files |
| D64 | `addElement` into a bodiless parent creates the body like `updateElement` does, keeping the declaration form and inline strings | the limit was not from the grammar (K2) | rejecting |
| D65 | `apply` `addElement`: `parent` optional (absent = root), `title` optional, `file` only for root elements | matches the library | requiring them |
| D66 | Specification writes are separate operations per verb (add, update, rename, remove) taking the kind type (`element`, `relationship`, `deploymentNode`) plus tag operations; defaults use D33 semantics | each verb has its own rejections and error path; the three kind types share one shape | one specification patch |
| D67 | Name spaces: a duplicate is a same-type duplicate only; names must parse as identifiers | LikeC4 behaviour (spikes 01, 02) | one global name space |
| D68 | `addRelationship` kind: bracket form by default, dot form on request; `bidirectional`; nested placement writes `-> target` in the source's body | the bracket form is the only one that combines with `<->`; the sourceless form is the shortest unambiguous nested form | `this -> target`; always top level |
| D69 | Direction is reported with the field name and meaning deployment relationships already use | one representation | a new direction enum |
| D70 | `removeRelationship` selector = `updateRelationship`'s (`matchKind`, `matchTitle`, same matching) + `matchBidirectional`; ambiguity is an error | silent first-match removal can delete the wrong relationship | first match; a new selector shape |
| D71 | `extend <element>` creation requires `file`, merges into the first block of the same target in that file, needs at least one new property, rejects a metadata key already in that block | same contract as `addDeploymentExtend`; merging avoids duplicate blocks; a metadata overwrite is an update, not an add | default file; always a new block |
| D72 | `extend a -> b` identity is taken from one selected relationship; a shared identity needs `shared` | a block applies to every relationship of the identity (LikeC4, spike 01) | writing identity from caller input |
| D73 | Removing a specific `extend` block stays out of scope | its addressing needs its own design; clears already exist | adding it now |
| D74 | Styles: own (as written, D18), kind, effective (kind overridden by own, body `icon` first; bidirectional `tail` rule); no theme or configured defaults | equals LikeC4's computed model where the library can know the inputs (spike 01) | filling theme defaults; own only |
| D75 | `updateElement({ style: { icon } })` with a body `icon` rewrites the body `icon`; an already present `style { icon }` is left as it is | LikeC4 uses the body icon; the write must not introduce the warning, and pre-existing text is not the write's business | moving the icon into `style` |

### Component boundaries
- **Reference catalogue** (new, read side): for a set of documents, every reference of FR-001 with its place (file, position, enclosing construct), its written text and its resolved target, built on the existing resolvers (logical, view, deployment); answers "every reference into this subtree / to this view / to this kind or tag".
- **Reference policy** (new): turns a removal and the catalogue into rejections or cascade edits (FR-001).
- **Rewriter** (new): computes the rewritten text of each reference for rename and move (FR-011), and the moved declaration's new text.
- **Specification writers** (new), **relationship writer** (extended), **extend writers** (new), **style readers** (extended to elements and relationships), **write checks** (extended: names, kinds and tags in new positions, file choice).
- **Stability check** (extended): the existing before/after reference snapshot, switched to cover every reference kind of FR-001 for every declaration-changing write.
- **`apply`** (extended), **test helper** (extended: computed element and relationship style, relationship direction, warning diagnostics).

### Data flow
Write: validate form → resolve the target (element, view, kind, relationship) → catalogue references → policy decides: reject / cascade edits / rewrite edits → declaration edits → apply all files atomically → rebuild indexes → stability check (every surviving reference resolves to its σ-mapped target; roll back otherwise) → result with changed files and, for cascades, the removed constructs.

### Key invariants
- **INV-1** An accepted write introduces no LikeC4 error (introduced-only): a file set that passed `likec4 validate` before passes after (`expectValidLikeC4`).
- **INV-2** An accepted write introduces none of these LikeC4 warnings: `Redundant as icon defined on element`, `This extend does not match any relation …`. Tests check diagnostics, because `likec4 validate` does not fail on warnings (spike 01).
- **INV-3** Reference stability: after an accepted write, every reference that resolved before and survives the write resolves to σ(its old target), where σ is the identity except for the renamed or moved subtree; a reference that did not resolve before is not touched. A surviving reference is one the write neither removes (owned, D57, or cascaded, D55) nor rewrites (D58, which rewrites to σ). Without `cascade`, no non-owned reference is removed.
- **INV-4** A rejected write changes no file and no in-memory state; the error names the field (`InvalidWriteError`); `apply` reports `mutations[i].<field>` and writes nothing.
- **INV-5** Text outside the edited ranges is byte-identical, including comments and other declarations; edits keep the file's indentation and line endings; kind styles, notation, colors and other stage-6 text are kept as written.
- **INV-6** Generic: no element kinds, relationship kinds, tags, metadata keys, view ids or nesting depths are assumed; tests use at least two unrelated specifications.
- **INV-7** Reads equal LikeC4 1.59.4's computed model for every value this feature reports (direction, kinds after rename, effective defaults after a kind change, effective `extend` values, effective styles), with the documented exceptions: written forms of style values (D18), no theme or configured defaults (D74).
- **INV-8** Existing reads and writes keep their behaviour, except the documented changes: the remove operations' new rejections and cascades (US-1, US-2), `removeRelationship` selection (US-9), the default file of root `addElement` / `addRelationship` now in LikeC4 document order (D62; differs only when load order and document order differ), `addElement`'s new rejections under the wider check (US-4), and `updateElement` style icon placement (D75).
- **INV-9** Every named view LikeC4 computed before an accepted write is still computed after it (σ-mapped), except a view `removeView` removes on purpose (same as lc4m-15.29 INV-9).

### Integration points and contracts
| Surface | Contract |
|---|---|
| Remove operations | + `cascade` option; result lists the cascaded constructs; new rejections (US-1, US-2) |
| New element operations | rename, move (names fixed in the plan); each returns `{ changedFiles }` |
| `addElement` | bodiless parent accepted; `file` for root |
| `addRelationship` | + `kind`, dot form, `bidirectional`, nested placement, `file` |
| `removeRelationship` | + `matchKind`, `matchTitle`, `matchBidirectional`; ambiguity is an error |
| New specification operations | add / update / rename / remove for the three kind types; add / rename / remove tag; `file` for additions |
| New `extend` operations | create an element block; create a relationship block (selector + `shared`) |
| Reads | model relationships + direction and styles; elements + styles; kinds + style and (relationship kinds) `multiple`; `getSpecification` unchanged in shape |
| `apply` | one operation per new write, same field names; new fields on existing operations |
| LikeC4 reference scoping | as mirrored today (lc4m-15.29 D25, spike 03 there): element and `extend` body frames, view `of` / `extends` frames, document scope, top-level names, deployment passes |

### Significant non-functional constraints
- Atomic in memory across files; formatting, comments and line endings kept as existing writers do.
- A write that touches references in many files edits each file once; no per-reference reparse loop that grows quadratically with the number of references beyond what the existing removals do.

### Rejected alternatives
- Linking with the language server inside the library to find references (lc4m-15.31).
- Rewriting every reference to a full FQN on rename / move: correct but rewrites relative text users chose on purpose.

## API / event surface (from code)

| Today | Change |
|---|---|
| `removeElement(fqn)` | + `cascade`; new rejections for view and `style` references; result + cascaded constructs |
| `removeDeploymentNode(id)`, `removeDeploymentInstance(id)` | + `cascade` for deployment view references |
| `removeView(id)` | + `cascade` for `navigateTo` |
| — | rename element, move element |
| `addElement(parent, opts)` | bodiless parent; `file` for root |
| `addRelationship(source, target, label?, opts?)` | + `kind`, dot form, `bidirectional`, nested placement, `file` |
| `removeRelationship(source, target)` | + selector; ambiguity and not-found as `InvalidWriteError` |
| `getSpecification()` | unchanged; new add / update / rename / remove operations for kinds and tags |
| — | create `extend <element>` block, create `extend a -> b` block |
| element and relationship reads | + style (own, kind, effective); relationships + direction; relationship kinds + `multiple` |
| `apply` | new operations; new fields on `addElement`, `addRelationship`, `removeRelationship`, `removeElement`, `removeDeploymentNode`, `removeDeploymentInstance`, `removeView` |

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
- **`with` on an item** that is cascaded: removed with the item.
- **Chains** (`a -> b -> c`) in dynamic views: one statement; cascade removes the whole statement; rename and move rewrite the segment texts in place.
- **A removed element is the `of` of a view extended by another view**: rejected (D56), the error names both views.
- **Duplicate names in a document** (LikeC4 ambiguity) before the write: such references did not resolve; they are untouched (INV-3), and a rename that would make them resolve to the renamed element is rejected by the stability check.
- **Rename to the same name / move to the same parent**: rejected as nothing to change.
- **Move between files**: the declaration leaves its file; `extend` blocks of the element in other files are rewritten to the new FQN; the file left without the element keeps its `model` block even if empty.
- **Kind rename where an element is declared `kind name`** (kind-first form): the kind token is rewritten, the name kept.
- **Tag rename**: a tag written with and without colour block in the specification keeps its block; `#old` inside markdown strings is text, not a reference, and is not rewritten.
- **Bidirectional selector**: `removeRelationship(b, a)` matches `a <-> b`.
- **Files with syntax errors**: writes behave as existing writes do (rejected where the edit would not parse; reads best effort). A rename or remove never claims stability for text the parser could not recover: such files are reported in the rejection when they contain the affected name as text (FR-004).
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
| include / exclude predicate item (element, selectors, relation predicates, `element.*` expressions with a reference), element and deployment views | rejected | the item is removed; the rule when it was the last item |
| `with { … }` on such an item | goes with the item | goes with the item |
| `navigateTo` in element `with`, relation `with`, step, model relationship body, deployment relationship body (removeView) | rejected | the property is removed; an emptied `with { }` too |
| dynamic step endpoint (single step, chain segment, inside `par`) | rejected | the step statement is removed; an emptied `par` too |
| view `style` rule target | rejected | the target is removed; the rule when it was the last target |
| `where` conditions | — | — (they reference kinds, tags and metadata only) |
| `global` predicates and styles, project imports | rejected (D61) | rejected (D61) |

Every rejection lists every reference (file, line, kind of reference, enclosing view or construct). The cascade result lists every construct it removed.

### FR-004 Unmodelled references
A reference the library does not resolve (`global` blocks, imports, files the parser could not recover around the name) that names the affected element, node, view, kind or tag as text blocks remove, rename and move: the write is rejected naming the place.

### FR-011 Written form on rename and move
For each reference into the subtree (and each reference inside a moved body), in this order: keep the text if it resolves at its place to σ(target) after the write; else replace the segments that name the renamed or moved part (keeping the selector suffix); else write the full FQN of σ(target) if it resolves there; else reject (US-3).

### FR-020 Move placement
The declaration moves as text (with its comments and body) to the end of the new parent's body, created if absent, or to the end of the first `model` block of the chosen file (created if absent; default file D62). Indentation is adjusted to the new depth; line endings follow the target file.

### FR-021 Default file
As D62: the first file in LikeC4 document order that has the block written into, else the first file with a `model` block, else the first file.

### FR-050 Merge into an existing `extend` block
New tags are appended after the block's existing tags (tags already in the block are not repeated); new links are appended; new metadata keys are appended to the block's metadata (created if absent). Effective values are recomputed by the existing merge rules.

## Success criteria
- **SC-001** Every reference kind of FR-001 has a test for default and `cascade` removal, each output passing `expectValidLikeC4` or rejected with byte-identical sources.
- **SC-002** The audit a1 repro and its variants (`instanceOf`, `navigateTo`, `exclude`, `with`, deployment relationships, view `style` targets) behave as FR-001 says.
- **SC-003** Rename and move: LikeC4's computed elements, relationships and views after the write equal the σ-mapped ones before, in tests covering every reference kind across two files.
- **SC-004** The lc4m-17 repro is rejected (library and `apply`).
- **SC-005** Every creating operation is tested with a chosen file, with the default file, and with a missing block.
- **SC-006** Kind and tag add / update / rename / remove for all three kind types in the library and `apply`; effective values compared with LikeC4's ModelBuilder; every reference place of US-7 covered by a rename test.
- **SC-007** Typed (both forms), bidirectional and nested relationships compared with LikeC4 including direction.
- **SC-008** `removeRelationship` with a selector removes exactly the selected relationship; ambiguity changes nothing.
- **SC-009** `extend` creation: effective values equal LikeC4's; no `does not match any relation` warning.
- **SC-010** Style reads equal LikeC4's computed element and relationship styles for every grammar field and kind defaults; the body-icon update introduces no `Redundant as icon` warning.
- **SC-011** `npm run lint` (with the coverage check) and the test suite pass; the coverage rows named in the task are updated; README and CHANGELOG describe every behaviour change of INV-8; version 0.11.0 is prepared and not published.

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
