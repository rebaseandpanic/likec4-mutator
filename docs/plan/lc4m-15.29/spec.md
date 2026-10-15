# Spec: Read and edit LikeC4 views and dynamic view steps

**Date** 2026-10-15 · **Status** DRAFT · **Task**: lc4m-15.29 (epic lc4m-15, stage 2) · **Affects**: likec4-mutator (library, `apply` CLI command, docs)
**Type**: feature (+ behaviour changes of `addView`: new rejections, `views` block creation) · **Based on**: README sections "Views", "Rejected writes"; lc4m-15.28 spec (deployment, decisions D4/D11 file choice, D18 written-form reads); reconnaissance `spikes/RECON.md` (LikeC4 1.59.4, spikes 00–06)

Identifiers: scenarios `US-N`, invariants `INV-N`, other requirements `FR-NNN`, success criteria `SC-NNN`. Decisions recorded as decision comments on Skein task lc4m-15.29 are referenced by number (`D21` to `D39`, all listed in "Load-bearing decisions"); earlier decisions of the epic as `D4`, `D11`, `D18`.

## Problem / Goal

Existing views cannot be read, changed or deleted through the library; a view can only be created (`addView`), and only inside an existing `views` block. Common edits — add an element to a view (`include x`, `include x with { navigateTo y }`), drop an exclude rule, rename a title, delete a view, add a step to a dynamic view — need fragile text patches.

Goal: read every declared view of the three types with its properties, its rules in source order (predicates structured) and, for dynamic views, its steps; edit view properties, rules and steps at a precise address; remove views; create views in any loaded file — through the library and `apply`, rejecting before writing anything LikeC4 would reject or silently ignore. An accepted write introduces no `likec4 validate` error (INV-1).

## Scope

**In scope**
- **A. Read.** Views of all three types across files and `views` blocks: properties, rules in source order with structured predicates and source text, resolved references (`of`, `extends`, `navigateTo`), stable addresses for rules and steps.
- **B. Edit views.** `updateView` (title, description, tags, links, `autoLayout`); add / replace / remove include and exclude rules at an address; `removeView`; `addView` gains `description`, `extends`, a `file` option and creates a missing `views` block; `apply` `addView` gains `autoLayout`, `description`, `extends`, `file`.
- **C. Dynamic view steps.** Read steps (single steps, chains, `par` / `parallel` blocks); add, update, move and remove steps; create and remove `par` blocks; move steps in and out of them.
- `apply` operations for every write.
- Test helper: expose LikeC4's parsed views (per document, before `extends` resolution) and computed views (nodes, edges, step sequence) to tests.
- Coverage table rows named in the task.

**Not in scope**
- The `views 'Folder'` string and block-level `views { style … }` rules (stage 6, lc4m-15.32). Block-level styles are not reported as rules of any view.
- Stage-6 rule and block contents: `style`, `group`, `rank`, `global predicate` / `global style`, `includeAncestors`, `variant`, `order`, flow blocks `opt` / `loop` / `alt` / `try` / `break`. They are reported and removable as opaque positions only (D30).
- Renaming a view, changing its type, `of` target or `extends` parent (lc4m-15.30 may add rename).
- The general reference policy on removal of elements, nodes and views (lc4m-15.30); here a referenced view cannot be removed (D26).
- Manual layout snapshots (`.likec4.snap`): never touched; removing a view leaves its snapshot (documented).
- Generated views (synthesized `index`, `implicitViews`): not reported (D29).
- The computed (inherited through `extends`) layer of view values (D21).

**Deliberately deferred**
- Structured (non-text) input for rule predicates (D23): rules are written as text and checked by parsing; structure is returned by reads only.
- Structural edits inside a multi-segment chain `a -> b -> c` (changing a segment's endpoints or direction, removing one segment): rejected with an error naming the chain; the chain can be removed whole (D31).

## Scenarios and acceptance

### US-1 — List and get views (P1)
- **Acceptance**: Given views of all three types in several files and several `views` blocks (with and without a folder string, with and without a body), when the caller lists views (optionally filtered by type and by file) or gets a view by id, then each declared view is reported with: id (`null` for an unnamed element view, D28), type (`element` | `dynamic` | `deployment`), `of` target (as written, plus the resolved element FQN or an unresolved marker), `extends` parent (as written, plus the resolved view id or an unresolved marker), own title, own description, own tags, own links, folder string of its `views` block (or none), file and source range, its rules (US-2) and, for dynamic views, its steps (US-4).
- Own values (D21) equal LikeC4's per-document parsed view: title as LikeC4 normalizes it (single line, escaped slash kept) but without the folder prefix LikeC4 adds (the folder is reported separately); description as markdown or text; tags unique, in the order LikeC4's parse returns them (D39: comma-separated groups come last group first, so `#next, #deprecated` reads `deprecated`, `next`); links with URL and title. Views without the property report it absent. Values inherited through `extends`, the element title LikeC4 shows for an untitled `view of X`, and the default title of `index` are not applied (documented).
- A declaration without a body (`view v`) is reported with no rules and marked as not part of LikeC4's model (LikeC4 builds no view from it); a write that gives it a body makes it a view.
- Generated views (`index` when none is declared, `implicitViews`) are not reported (D29). Getting an unknown id returns nothing; an id declared more than once (a LikeC4 error) is reported for each declaration in lists and is ambiguous for writes (INV-3).

### US-2 — Rules in source order with addresses (P1)
- **Acceptance**: Given a view with predicates, `autoLayout`, and stage-6 rules, when the caller reads it, then `rules` lists every rule of the view body in source order (for dynamic views: the rules only, steps are reported separately in US-4), each with: index (0-based position in this list), kind (`include` | `exclude` | `autoLayout` | an opaque kind naming the stage-6 rule — `style`, `group`, `rank`, `globalPredicate`, `globalStyle`, `includeAncestors`), the exact source text and source range. `autoLayout` reports direction and the optional rank and node spacing.
- The address of a rule is `{ index, text? }` (D22): `text`, when given, must equal the rule's source text as read; otherwise the write is rejected naming the rule address, with nothing changed.

### US-3 — Structured predicates (P1)
- **Acceptance**: Given include / exclude rules using every predicate form of the grammar, when the caller reads them, then each rule reports its items in source order (a trailing comma adds no item), each with its source text, source range and structure:
  - element expression: wildcard; element reference (as written, the resolved element FQN — or deployment id in deployment views — or an unresolved marker, and the selector `children` (`.*`), `descendants` (`.**`), `expanded` (`._`) or none); `element.kind` / `element.tag` comparison (equal or not equal, kind or tag as written);
  - relation expression: direct (source, target, optional relationship kind in either written form, bidirectional flag), incoming (`-> x`), outgoing (`x ->`, optional kind, bidirectional), in-out (`-> x ->`); each endpoint is an element expression;
  - `with { … }`: the subject expression plus every property written in the block — title, description, technology, notes, notation, `navigateTo` (as written, resolved view id or unresolved marker), style fields (as written, D18 rule), relation `multiple`;
  - `where …`: the subject expression plus the condition tree (`and` / `or` / `not` and leaves for tag, kind, metadata key with optional value, and for relations the `source` / `target` participant variants), each leaf with its operator (`=`, `!=`, `is`, `is not`).
- The structure agrees with LikeC4's parsed rule for the same text (INV-4), with the documented exception of D34 constructs LikeC4 drops (they are reported as written).

### US-4 — Read dynamic view steps (P1)
- **Acceptance**: Given a dynamic view with single steps (`->`, `<-`, `-[kind]->`, `.kind`), chains `a -> b -> c` (including a chain that returns to an earlier element), steps with bodies (`title`, `description`, `technology`, `notes`, `notation`, `navigateTo`, `color`, `line`, `head`, `tail`), `par` and `parallel` blocks, and stage-6 blocks (`opt`, `loop`, `alt`, `try` / `catch` / `finally`, `break`) containing steps, when the caller reads the view, then `steps` lists the step statements in source order (D24), each with its address (path), source text and source range:
  - single step: source and target in LikeC4's sense (D36: the element the interaction goes from and the one it goes to — for `a <- b` source `b`, target `a`), each as written and resolved element FQN or unresolved marker; direction (`forward` | `backward`, as LikeC4 parses it); the written arrow (`->`, `<-`, `-[kind]->`, `.kind`); relationship kind with its written form (`bracket` | `dot`) or none; inline title; body properties;
  - chain: its segments in order, each with the step fields above and its segment number; a segment LikeC4 treats as backward (returning to the previous source) reports `backward` with LikeC4's source and target, while its written arrow stays `->` (D36);
  - `par` / `parallel` block: keyword as written, its contained statements (steps and chains, and opaque blocks) with paths `[i, j]`;
  - stage-6 block: opaque position with its keyword and source text (its inner steps are not addressable).
- Each step also reports its position in LikeC4's step sequence, so that steps compare one-to-one with LikeC4's parsed steps (INV-4). Steps and rules are reported in separate lists even when they interleave in the text.

### US-5 — Create views anywhere (P1)
- **Acceptance**: Given any loaded workspace, when the caller adds a view with id, type, optional `of` target (element views), optional `extends` parent (element views), optional title, description, includes and `autoLayout`, and an optional `file`, then the view is appended to the first `views` block of the chosen file — or, without `file`, of the first file (LikeC4 document order) that has a `views` block; without any `views` block a block is created at the end of the chosen file, or of the first file with a `model` block, or of the first file (D27). The view reads back as US-1 with the requested values.
- Rejected before writing: `of` together with `extends`; `extends` on a dynamic or deployment view; an `extends` parent that is not a declared, named element view with a body (a bodyless parent is not a view for LikeC4, and the child would be dropped); an unknown `file` (loaded files only, no file is created); everything `addView` rejects today; every include that US-7 rejects for the new view's type, scope and file (D35) — unresolved references, undeclared kinds or tags, `navigateTo` targets of a disallowed type, model references in a deployment include, and the constructs LikeC4 would drop (D34: relation predicate in a dynamic view, `with` on a wildcard / kind / tag in a dynamic view). The same checks apply to `apply` `addView`.

### US-6 — Update view properties (P1)
- **Acceptance**: Given a named view, when the caller patches title, description, tags, links or `autoLayout` (D33), then: title and description REPLACE (`null` removes the property, `''` is written as an empty string), tags REPLACE (declared tags only), links REPLACE, `autoLayout` replaces the view's effective (last) `autoLayout` rule in place or appends one as the last rule, and `null` removes every `autoLayout` rule. Properties are placed where the grammar requires them (tags first in the body, then other properties, before any rule or step), a missing body is created, untouched text and comments are kept. Result `{ changedFiles }`.
- Rejected: undeclared tag; invalid link; invalid layout direction or spacing; a view addressed by an id that is unknown, unnamed or ambiguous.

### US-7 — Add, replace and remove rules (P1)
- **Acceptance (add)**: Given a named view, when the caller adds a rule given as kind (`include` | `exclude`) and expression text (D23) at an optional position (`before` a rule address; default: after the last rule, but before the last rule when that rule is an `autoLayout`; in a dynamic view the new rule goes after the last body item, before a trailing `autoLayout`), then the rule is written there and the view reads back with the rule at the expected index, other rules in their order.
- **Replace** a rule at an address with a new kind and expression; **remove** a rule at an address (any rule kind, including opaque stage-6 rules and `autoLayout`, D30).
- The expression must form exactly one rule of a kind the view type allows: element views — include / exclude; dynamic views — include only; deployment views — include / exclude without `with` (the existing library rule). Every reference inside the text must resolve as LikeC4 resolves it at that place (scope rules in "Integration points and contracts", D25): element references (document-unique names, the `of` scope, the scope inherited through `extends`), deployment references in deployment views (model references only where LikeC4 allows them, i.e. in `exclude`), relationship kinds, tags, element kinds, `navigateTo` targets (any view from an element `with`, only a dynamic view from a relation `with`). Also rejected: `with` inside `exclude`; `with` on `element.kind` / `element.tag`; D34 constructs.
- The view contents LikeC4 computes after the write match the expectation for the rule (for example, an added include makes the element appear among the computed nodes; a removed exclude makes it reappear).

### US-8 — Remove a view (P1)
- **Acceptance**: Given a named view, when the caller removes it, then its declaration is removed and nothing else; the result `{ changedFiles }`.
- Rejected before writing, listing each reference with file and position (D26): a `navigateTo` targeting the view from any `with` block, dynamic step, model relationship body or deployment relationship body; an `extends` of the view. Its manual layout snapshot, if any, is not touched (documented).

### US-9 — Add steps (P1)
- **Acceptance**: Given a named dynamic view, when the caller adds a step with source, target (LikeC4's sense, D36), direction (default forward; `backward` is written as `target <- source`), optional relationship kind and form, optional title, description, technology, notes, `navigateTo`, color, line, head, tail, at an optional path (default: after the last step statement; a path `[i]` inserts before top-level statement `i`; `[i, j]` inserts before statement `j` inside the `par` block at `i`, `[i, n]` appends to it), then the step is written as a single step statement and reads back as US-4 at that path with the same source, target and direction (a read step's fields written back produce the same interaction, D36); LikeC4's step sequence equals the previous one with the new step at the expected position.
- Rejected: an endpoint that does not resolve to a model element as LikeC4 resolves step references (document scope only, D25); a parent–child pair; an undeclared relationship kind; a backward step with an explicit relationship kind (D38: the grammar has no connector for both), naming the field; a `navigateTo` that is not a declared dynamic view; a path that does not exist or points into a chain or a stage-6 block.

### US-10 — Update steps (P1)
- **Acceptance**: Given a step at a path (a single step, or a segment of a chain addressed by path plus segment number), when the caller patches endpoints (LikeC4's sense, D36), direction, kind, title, description, technology, notes, `navigateTo` or style fields, then the single step is rewritten in place with only the patched parts changed (title / strings REPLACE, `null` removes; style fields per field), and untouched steps, chains and comments are unchanged byte for byte.
- On a segment of a multi-segment chain only title, kind, body strings, `navigateTo` and style fields can change; changing its endpoints or direction is rejected naming the chain (D31). The same rejections as US-9 apply to the patched values; in particular a single step that would end up both backward and with a kind is rejected (D38) unless the same patch removes the kind or makes the step forward. A returning chain segment keeps the kind it has (LikeC4 infers its backward flag, D31).

### US-11 — Move and remove steps; `par` blocks (P1)
- **Acceptance**: Given a dynamic view, when the caller (a) creates an empty `par` block at a top-level path, (b) moves a step statement (single step or whole chain) from one path to another — into a `par` block, out of it, or between top-level positions —, (c) removes a step statement (a single step, a whole chain, a `par` block with its contents, or an opaque stage-6 block), then the text is edited at exactly those places and LikeC4's step sequence after the write equals the expected sequence.
- **Move addressing (D37).** Source and destination are both paths in the view as it is before the move; the destination is an insertion boundary — "before the statement at this path" — and a path equal to the length of its level appends there (`[n]` at the top level, `[i, n]` at the end of the `par` block at `i`). Examples for top-level statements `[A, B, C]`: `[0] → [2]` gives `[B, A, C]`; `[0] → [3]` gives `[B, C, A]`; `[2] → [0]` gives `[C, A, B]`. A move to the statement's own boundary (destination equal to the source path or to the next path at the same level) changes nothing and writes nothing. Moving into a `par` block that comes later at the top level uses that block's pre-move path (`[0] → [2, 0]` with `C` a `par` block moves `A` into it). A destination inside the moved statement is rejected.
- Rejected: a `par` block inside a `par` block (moving a `par` statement into a `par`, LikeC4 `Nested parallel blocks are not allowed`); removing a single segment of a multi-segment chain (D31); a path that does not exist; an address `text` guard that does not match.

### US-12 — Batch operations through `apply` (P1)
- **Acceptance**: Every library write of US-5, US-6, US-7, US-8, US-9, US-10, US-11 is an `apply` operation with the same fields; the mutations file is validated as a whole before any file is touched (unknown fields rejected, wrong types rejected, errors located as `mutations[i].<path>`); a rejected write exits 1 and writes nothing. `addView` in `apply` accepts `autoLayout` with the same validation as the library.

## Architecture overview

### Load-bearing decisions
| # | Decision | Why | Rejected |
|---|---|---|---|
| D21 | Reads report a view's own values (LikeC4 parse layer), folder separately; no `extends` inheritance applied | a read value is the value a write changes (same principle as D18); inheritance is rendering | computed / inherited values |
| D22 | Rule address = index in the view's rule list + optional source-text guard | exact at write time; the guard catches stale addresses; human-readable | content hash; index only; marker comments |
| D23 | Rules are written as kind + expression text, checked by parsing to exactly one rule of an allowed kind, references resolved; reads return structure + text | any predicate form of the grammar is writable without a second contract | structured predicate input |
| D24 | Step address = path over step statements (`[i]`, `[i, j]` inside `par`, plus segment number in a chain) + text guard | matches the text structure, so inserts and moves are exact | flat LikeC4 sequence; LikeC4 `astPath` |
| D25 | References in written rule / step text are resolved by the library's own mirror of LikeC4 view scoping | synchronous, no language-server runtime; same path as deployment (D7) | linking with the language server at run time (lc4m-15.31) |
| D26 | A referenced view cannot be removed; the error lists the references | silent cascades change other views' meaning; policy belongs to lc4m-15.30 | cascade; force option |
| D27 | Optional `file` for `addView`; default first file with a `views` block, else first file with a `model` block, else first file; loaded files only | same rule as deployment (D4/D11); compatible with lc4m-15.30 | always first file; new files |
| D28 | Unnamed views are read-only | LikeC4's generated id depends on the document URI and AST path | file + ordinal addressing |
| D29 | Generated views are not reported | project settings are not read (same as D10/D18) | synthesizing them |
| D30 | Stage-6 rules and flow blocks are opaque, positioned, removable | complete addresses without stage-6 semantics | read-only; full support now |
| D31 | Chain segments: property edits in place; structural edits rejected | untouched text stays untouched; LikeC4 derives backward segments from history | expanding the chain |
| D32 | Separate operations (view properties, rules, steps, `par`, removal) instead of one patch | each has its own address, rejections and error path | one big `updateView` patch |
| D33 | Strings REPLACE (`null` removes), tags / links REPLACE, one effective `autoLayout` | same semantics as other updates; LikeC4 uses the last `autoLayout` (spike 02) | MERGE tags |
| D34 | Writes LikeC4 silently ignores or that make it drop views are rejected | `validate` does not catch them; a no-op write is a defect for the caller | accepting them |
| D35 | `addView` includes (library and `apply`) get every rule check of US-7 | one write path must not bypass INV-1 | parse-only checks |
| D36 | Step source / target in LikeC4's sense (who interacts with whom), direction as LikeC4 parses it, written arrow reported separately | equals LikeC4's parsed steps; a read step written back keeps its meaning | written left / right positions |
| D37 | Move: source and destination address the pre-move state; destination = insertion boundary | both come from the same read; same rule as step insertion | post-removal index; before/after references |
| D38 | A single step cannot be both backward and kind-bearing: such adds and updates are rejected | the grammar has no connector for it; silent loss of either is worse | writing forward with swapped endpoints; dropping the kind |
| D39 | View tags in the order LikeC4's parse returns them | one source of truth (D21) | written order with an oracle exception |

### Component boundaries
- **View index** (new, read side): per workspace, all declared views in LikeC4 document order with their bodies, the views-block folder, and per view the ordered rule list and step-statement tree recovered from source offsets.
- **View reference resolver** (new): resolves a written element, deployment, view, kind or tag reference at a place inside a view exactly as LikeC4 1.59.4 scopes it (see Integration points).
- **View queries** (new, read API): build view info, rule info with structured predicates and step info.
- **View writers** (new and extended): view properties, rules, steps, `par` blocks, view removal, `views` block creation; they reuse the existing body-editing, string escaping, insertion-layout and atomic multi-file apply mechanisms.
- **Write checks** (extended): rule text parsing to one rule of an allowed kind, reference resolution, D34 rejections, step rejections, view reference collection for removal.
- **`apply`** (extended): new operations; `addView` fields.
- **Test helper** (extended): LikeC4's per-document parsed views and computed views.

### Data flow
Read: documents → view index (with the logical and deployment indexes for references) → view, rule and step info. Write: validate form → resolve address (with guard) → parse rule / step text, resolve references against the indexes → compute edits per file → apply all files atomically → rebuild indexes → reference-stability check (roll back on change) → result.

### Key invariants
- **INV-1** An accepted write of this feature introduces no LikeC4 error (introduced-only rule, as for existing writes): a file set that passed `likec4 validate` before passes after (`expectValidLikeC4` in tests); errors already present may remain.
- **INV-2** A rejected write changes no file and no in-memory state; the error names the offending field (`InvalidWriteError`), `apply` reports `mutations[i].<field>`.
- **INV-3** Every write addresses exactly one named view, and within it exactly one rule or step statement; a missing, unnamed or ambiguous view, a missing address or a failing text guard is an explicit error.
- **INV-4** Read values equal LikeC4 1.59.4's per-document parsed views (before `extends` resolution) for every field of US-1, US-2, US-3, US-4, except: the folder prefix of titles (reported as `folder`); D18 written forms of style values; D34 constructs LikeC4 drops (reported as written); the rules LikeC4 prepends from the enclosing `views { style … }` block (not reported as the view's rules — compared after removing them from LikeC4's list); a view without a body (`view v`, `dynamic view d`), which LikeC4 does not turn into a view at all (absent from its parsed and computed views, no diagnostic — verified on 1.59.4) and the library reports as a declaration with no rules and `inModel: false` — compared by that absence; source-level fields LikeC4 does not keep (written arrow, written kind form, addresses, source text).
- **INV-5** Text outside the edited ranges is unchanged byte for byte, including other rules, steps, chains and comments; edits keep the file's indentation and line endings.
- **INV-6** Generic: no element kinds, tags, relationship kinds, view ids or nesting depths are assumed.
- **INV-7** Existing reads and writes keep their behaviour, except `addView`'s (library and `apply`) new rejections (D34, D35, `of` + `extends`) and its new placement when no `views` block exists (it used to throw).
- **INV-8** No accepted write of this feature changes the target a surviving existing reference resolves to (view rules, steps, `navigateTo`, `extends`, `of`); references inside text a write removes on purpose are not surviving.
- **INV-9** Every named view that LikeC4 computed before an accepted write and that survives it (that is, every one except the view `removeView` removes on purpose) is still in LikeC4's computed model after it: no write silently drops a view (`extends` cycles and non-element `extends` parents are rejected, D34). Generated views (D29) and unnamed views (D28, whose LikeC4 ids depend on their position) are outside this invariant.

### Integration points and contracts
| Surface | Contract |
|---|---|
| New read methods | list / get views (names fixed in the plan, documented in README) |
| New write methods | update view, add / replace / remove rule, add / update / move / remove step statement, add `par` block, remove view; each returns `{ changedFiles }` |
| `addView` | + `description`, `extends`, `file`; creates a missing `views` block; new rejections (D34, D35, `of` + `extends`) |
| `apply` | one operation per write method, same field names, same strict validation; `addView` + `autoLayout`, `description`, `extends`, `file` |
| LikeC4 view scoping (mirrored, spike 03) | a bare name resolves when it is unique among the descendants declared in the same document (or is a top-level element); an element view `of X` adds X's scope; a view `extends P` uses P's `of` scope; dynamic views use the document scope only; deployment views resolve deployment names (model references only in `exclude` and in relation predicates of `exclude`); element `with { navigateTo }` targets any view, relation `with` and step `navigateTo` only dynamic views, `extends` only element views |

### Significant non-functional constraints
- Atomic in memory across files; formatting, comments and line endings kept as existing writers do.
- Reads are best effort on files with syntax errors (what the parser recovers).

### Rejected alternatives
- Linking with the language server inside the library to validate writes: correct by construction but asynchronous and heavy; it is the subject of lc4m-15.31 (D25).

## API / event surface (from code)

| Today | Change |
|---|---|
| no view read API (`src/index.ts`) | + list / get views with rules and steps |
| `addView(opts)` — element, dynamic, deployment; `of`, `title`, `includes`, `autoLayout`; first `views` block of the first file that has one, else throws | + `description`, `extends`, `file`; `views` block creation; D34 and D35 rejections |
| `apply` op `addView` (`op, id, type, target, title, includes`) | + `autoLayout`, `description`, `extends`, `file`; + view, rule, step and removal ops |
| other operations | unchanged |

## Data / entities / migrations
No persistent data; `.c4` text only. No migration. Reads gain view, rule, predicate and step info types; style values in step and `with` bodies use the existing relationship / element style shapes.

## Constraints
- Security: none beyond existing string escaping; DSL injection through string parameters is rejected by the stage-0a checks, extended to the new parameters (titles, notes, link titles, expression text checked to form exactly one rule).
- Performance: no numeric target; reads and writes stay linear in workspace size.
- Observability: n/a (library).

## Edge cases, failures, concurrency
- View without a body (`view v`): reads report no rules; writes that need a body create `{ }`.
- Trailing comma in an include list: no extra item; replacing / removing the rule removes it with its separator.
- Two `autoLayout` rules: both reported; `updateView({ autoLayout })` replaces the last one (the effective one, spike 02).
- Dynamic view where rules and steps interleave: rules and steps keep their text positions; a new rule goes after the last body item (before a trailing `autoLayout`).
- `include` between two steps that are moved into a `par` block: moves are per statement, so a rule is never moved into a block.
- A chain that returns to an earlier element (`a -> b -> a`): the returning segment is reported backward with LikeC4's source and target, its written arrow `->` (D36).
- A backward step `a <- b`: source `b`, target `a`, direction `backward`; writing those fields back produces `a <- b` (D36); the same step with a kind cannot be written (D38).
- A view declared without a body: reported, not in LikeC4's model; an `extends` to it is rejected; writes that need a body create one.
- `parallel` keyword: read as written; new blocks are written as `par`.
- Stage-6 blocks containing steps: reported opaque; their inner steps are not addressable; the statement can be removed whole.
- Same view id declared twice (LikeC4 error): reads report both; writes addressing the id are rejected as ambiguous.
- An `of` / `extends` / `navigateTo` target that does not resolve in existing text: reported unresolved; not an obstacle for writes elsewhere.
- Syntax errors: reads best effort; tag / link updates rejected while any loaded file has syntax errors (as for elements); other writes allowed.
- Concurrency: n/a (single in-memory instance).

## Success criteria
- **SC-001** Every row named in lc4m-15.29 "Coverage rows to update" has a non-`no` status in docs/likec4-coverage.md, or a documented `no` / `n/a` for the parts out of scope (stage 6, rename), and the coverage check passes.
- **SC-002** For each read scenario (US-1, US-2, US-3, US-4), in at least two unrelated fixtures, the library's values equal LikeC4's per-document parsed views field by field, with every INV-4 exception accounted for by a dedicated example (folder prefix, block-level style rules, bodyless view, backward step and returning chain segment), and a multi-group tag list (`#a, #b`) showing LikeC4's tag order (D39); every predicate form of the grammar and every step form appears in at least one compared example.
- **SC-003** Every successful write in the test suite on a valid input produces files that pass `expectValidLikeC4`; a successful write on an input that already has LikeC4 errors introduces no new error (INV-1).
- **SC-004** After each rule write (add, replace, remove) and each step write (add, update, move — including the D37 examples —, remove, `par` create / remove), the view LikeC4 computes is compared with the expectation derived from LikeC4: the nodes for element and deployment views, the step sequence for dynamic views; every named view computed before the write and surviving it is still computed after the write; after `removeView` the removed declaration is gone and every other named declaration that was computed is still computed — generated and unnamed views are exempt as in INV-9 (removing a declared `index` lets LikeC4's synthesized `index` appear, which is accepted) (INV-9).
- **SC-005** Each rejection class of US-5, US-6, US-7, US-8, US-9, US-10, US-11, D34, D35 (through `addView` and `apply` `addView`) and D38 has a test showing rejection with the field named and sources byte-identical; the `apply` path exits 1 and writes nothing.
- **SC-006** All pre-existing tests pass unchanged, except tests that pinned behaviour this spec changes (INV-7), which are rewritten to assert the new behaviour.
- **SC-007** `npm run lint` and `npm test` pass; README documents the view read API (own values, D21 exceptions, unnamed and generated views), the rule and step addressing (D22, D24), the write API and `apply` format, the reference rules for written text, the removal rejection and the snapshot note; CHANGELOG lists additions and the `addView` behaviour changes.
- **SC-008** One minor release is prepared (version in package.json and docs/likec4-coverage.md, CHANGELOG entry) and is not pushed, tagged or published without the owner's explicit command.

## Clarifications
- Q: Own or inherited view values? → A: own values, folder separate (D21).
- Q: How is a rule addressed? → A: index + optional text guard (D22).
- Q: Structured or text rule input? → A: text, checked by parsing and reference resolution (D23).
- Q: How are steps addressed? → A: path over step statements, segment number in chains (D24).
- Q: How are references in written text validated? → A: library mirror of LikeC4 view scoping (D25).
- Q: Remove a referenced view? → A: rejected, listing references (D26).
- Q: Where does a new view / `views` block go? → A: `file` option, default rule D27.
- Q: Unnamed and generated views? → A: unnamed read-only (D28); generated not reported (D29).
- Q: Stage-6 rules and flow blocks? → A: opaque, removable (D30).
- Q: Edits inside chains? → A: property edits only (D31).
- Q: Operation granularity? → A: separate operations (D32).
- Q: Update semantics? → A: D33.
- Q: Writes LikeC4 ignores? → A: rejected (D34).
- Q: Does `addView` check references in its includes? → A: yes, all US-7 checks, library and `apply` (D35).
- Q: What do a step's source and target mean for `<-`? → A: LikeC4's sense; the written arrow is reported separately (D36).
- Q: How are move destinations counted? → A: pre-move paths, insertion boundary (D37).
- Q: Backward step with a kind? → A: rejected for single steps (D38).
- Q: Tag order? → A: LikeC4's parse order (D39).
- **Testing**: unit level only (vitest; `npm test`; integration / e2e / smoke / mutation not provided by the project). Oracles: `expectValidLikeC4` (likec4 validate 1.59.4 in-process) and LikeC4's parsed and computed views, exposed by the extended test helper.

## Open questions / [NEEDS CLARIFICATION]
None.

## Decomposition preview
1. Test helper: LikeC4 per-document parsed views and computed views exposed.
2. View index and view reference resolver (read foundation).
3. Read API: views, rules with structured predicates, steps (US-1, US-2, US-3, US-4).
4. View writers: `addView` extensions and `views` block creation, `updateView`, `removeView` (US-5, US-6, US-8).
5. Rule writers (US-7).
6. Step writers and `par` blocks (US-9, US-10, US-11).
7. `apply` operations (US-12); README, CHANGELOG, coverage, release.

## FOR-PLAN backlog
- Source order of a view body exists only in CST offsets; merge tags / props / rules / steps by offset (RECON S1, note 1).
- Insertion anchors follow the grammar: tags first, props after tags and before the first rule or step (RECON S5, note 2).
- `Expressions`, `FqnExpressions` and `Tags` are `prev`-linked lists; a trailing comma is an item without value (RECON note 3).
- Chain segments come from nested `StepSeries.source` offsets (RECON note 4).
- The existing `resolveReferenceText(..., 'views')` covers only references outside view bodies (RECON note 5); the resolver needs the per-document uniqueness rule.
- `extends` cycles and relation predicates in dynamic includes are not caught by `validate()` — D34 checks cannot rely on the oracle (RECON note 7); tests compare computed views instead.
- A reverse index over view references (`navigateTo`, `extends`) for removal (RECON note 8).
- Computed step ids are positional; compare step sequences by content, not by id (RECON note 9).
- Per-document parsed views before `extends` resolution: find the language-server entry point for the test helper (spike 02 used `parseModel()`, which already applies `extends`).

## Known residuals
None yet.
