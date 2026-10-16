# Changelog

## [0.10.0] - 2026-10-16

Read and edit views (lc4m-15.29): list views with their properties, rules and dynamic view steps; update and remove views; add, replace and remove rules; add, update, move and remove steps and `par` blocks. See [Views](README.md#views) in the README.

### Breaking
- `addView` checks its `includes` items as LikeC4 reads them in the new view, as the new rule writes do; before, an item was only checked to form exactly one `include` rule. Rejected now, on `includes[i]`, with nothing written:
  - a reference that does not resolve in the view's scope (its `of` element or its `extends` parent's, its document; in a deployment view deployment nodes and instances, a logical element not accepted in an `include`), an undeclared kind, tag or relationship kind;
  - a `with { }` value LikeC4 reports: an undeclared custom color, a library icon that does not exist, a `file://` icon URI, an opacity outside 0%..100%, an icon given twice in one body (LikeC4: `Icon must be defined once`), a `navigateTo` that names no view (from a relation's `with`, no dynamic view);
  - items LikeC4 drops without an error: a relation predicate in a dynamic view, `with` on a wildcard, `element.kind` or `element.tag` in a dynamic view, `with` on `element.kind` / `element.tag`; a bare wildcard, kind or tag predicate in a dynamic view stays accepted (it adds elements no step names);
  - an item ending with a comma, and one whose text reaches past its rule (closing the view and opening a block-level `style` or a `global` block). The `autoLayout` value is confined to its rule the same way.
- `addView` without `file` writes into the first `views` block of the first file in LikeC4's document order that has one, instead of the first such file in load order; the two differ only when the files were loaded in another order than LikeC4 sorts them.
- `addView` creates a `views` block when there is none to write into — at the end of its `file`, or of the first file in LikeC4's order with a `model` block, else of the first file — instead of throwing `No file with a views block found`.
- `addView` reports an edit the file's parser refuses as an `InvalidWriteError` on `file` instead of a plain `Error`.

### Added
- Reads: `listViews({ type?, file? })` and `getView(id)`. A view reports its own values as LikeC4 parses the declaration (no `extends` inheritance): id, type, `of` / `extends` (as written and resolved), title, description, tags, links, folder, file and source range, `inModel`; its rules in source order with their index, text and structure (predicate items with `where` and `with`, `autoLayout`, the stage-6 rules by kind); for a dynamic view its step statements (steps, chains, `par` blocks, opaque stage-6 blocks) with resolved endpoints, direction as LikeC4 parses it and the position in LikeC4's step sequence. Unnamed views are read with `id: null`; views LikeC4 generates are not listed.
- `addView` options `description`, `extends` (an element view declared once with a body, no `extends` cycle, not together with `target`) and `file`.
- Writes, each returning `{ changedFiles }`: `updateView` (title, description, tags, links, `autoLayout`); `addViewRule`, `replaceViewRule`, `removeViewRule` (a rule given as kind and expression text, addressed by `{ index, text? }`); `addViewStep`, `updateViewStep`, `moveViewStep`, `removeViewStep`, `addViewParallel` (steps given by structured fields, addressed by `{ path, segment?, text? }`; moves and removals also return `removedParallelBlocks`; a view that is not a dynamic view is rejected on `id`); `removeView`, rejected while another view, a step or a relationship refers to the view. Every write throws `InvalidWriteError` naming the option and changes nothing when rejected, also when the edited file would not parse; the writes that add or remove text are rejected when a surviving reference would link elsewhere; view writes are allowed while other files have syntax errors.
- A `par` block that a move or removal empties is removed with it; one left giving LikeC4 no step is rejected, as is a new block that would give none.
- `apply`: `addView` gains `autoLayout` (a string, or `null` for none), `description`, `extends` and `file`; new operations `updateView`, `addViewRule`, `replaceViewRule`, `removeViewRule`, `removeView`, `addViewStep`, `updateViewStep`, `moveViewStep`, `removeViewStep`, `addViewParallel` with the same fields, validated as a whole before anything is written; errors name `mutations[i].<path>`.
- Exported types of the new API: `ViewInfo` and the rule, predicate, step and address types (`ViewRuleInfo`, `ViewPredicateItem`, `ViewStepStatementInfo`, `ViewStepInfo`, `ViewRuleAddress`, `ViewStepAddress`, ...), `ViewWriteResult`, `ViewStepWriteResult`, `UpdateViewPatch`, `ViewRuleText`, `ViewStepSpec`, `ViewStepPatch`, `LinkedTarget`, `DeploymentTarget`.

## [0.9.0] - 2026-10-12

Read and write the deployment model (lc4m-15.28): deployment node kinds, nodes, instances, deployment relationships and `extend <node>` blocks. See [Deployment model](README.md#deployment-model) in the README.

### Breaking
- `removeElement` is rejected (`InvalidWriteError` on `fqn`, nothing changed) while the deployment model refers to the element or an element of its subtree: as the element of an instance (`instanceOf api`) or as the element part of a deployment relationship endpoint that steps into an instance's element (`prod.vm1.api.handler`). The error lists the instances and endpoints. Before, the element was removed and LikeC4 then reported `Could not resolve reference`.
- `addElement` also protects the references of the deployment model: it is rejected (field `name`) when the new element would change what an `instanceOf` target, the element part of a deployment relationship endpoint, an `extend <node>` target or a reference in a deployment view rule (`include`, `exclude`, relationship predicates, `style`) links to — making it ambiguous, unresolved or linked to another target. E.g. a new root element `api` next to `app.api` would make an existing `instanceOf api` link elsewhere. Before, only references of the logical model were checked.
- `getSpecification()` returns a result for a workspace whose specifications declare only deployment node kinds; it returned `null`.

### Added
- `getSpecification().deploymentNodeKinds` (present when at least one `deploymentNode` kind is declared) and `getDeploymentNodeKind(kind)` with the kind's defaults (`DeploymentNodeKindDefaults`: title, summary, description, technology, tags, links, style).
- Reads: `getDeploymentNode`, `listDeploymentNodes({ kind?, parentId? })`, `getDeploymentInstance`, `listDeploymentInstances({ nodeId?, element? })`, `listDeploymentRelationships({ source?, target?, kind? })`. Effective values are LikeC4's computed ones — kind defaults, `extend` blocks and element inheritance applied — with provenance (`declared`, `extendedBy`, `fromSpecification`) and file and source range, with three documented exceptions: summary and description are inherited field by field, no technology is derived from an icon, and style `opacity` and `icon` keep their written form. `getRelationships()` keeps returning the logical model only.
- Writes: `addDeploymentNode`, `updateDeploymentNode`, `removeDeploymentNode`; `addDeploymentInstance`, `updateDeploymentInstance`, `removeDeploymentInstance`; `addDeploymentRelationship`, `updateDeploymentRelationship`, `removeDeploymentRelationship` (selected by `{ source, target, kind?, title? }`); `addDeploymentExtend`, `removeDeploymentExtend`. Updates return `{ changedFiles }`, removals `{ removedRelationships }`. A `deployment { }` block is created when a root node, relationship or `extend` block needs one; an explicit `file` decides where. Updates follow `updateElement`: strings and tags / links replace, metadata merges with `null` deleting a key, style merges per field, and patched tags, links and metadata keys of a node are removed from its `extend` blocks. Instance metadata is patched on the effective map (inherited keys are copied first); a patch LikeC4 would read differently, as an own map cannot be empty, is rejected on `metadata.<key>`.
- Removals cascade: a node takes its subtree, its `extend` blocks and every deployment relationship touching it; an instance takes the relationships touching it. A removal is rejected while a deployment view rule refers to what it removes, or when a surviving reference would link elsewhere.
- Every deployment write checks what it introduces before writing and throws `InvalidWriteError` naming the option: undeclared deployment node kind, relationship kind or tag; invalid style value; a name or id already used; an `element` or endpoint that does not resolve as LikeC4 links it; a self or parent-child relationship; an `extend` of an instance; a new name that would change what an existing reference links to.
- `apply` operations with the same fields: `addDeploymentNode` (`parent` optional), `updateDeploymentNode`, `removeDeploymentNode`, `addDeploymentInstance`, `updateDeploymentInstance`, `removeDeploymentInstance`, `addDeploymentRelationship`, `updateDeploymentRelationship` and `removeDeploymentRelationship` (selector `source`, `target`, `matchKind`, `matchTitle`), `addDeploymentExtend`, `removeDeploymentExtend`. Validated as a whole before anything is written; errors name `mutations[i].<path>`.
- Exported types of the new API: `DeploymentNodeInfo`, `DeploymentInstanceInfo`, `DeploymentRelationshipInfo`, `DeploymentEndpoint`, `DeploymentNodeKindDefaults`, the filter, option, patch, selector and result types.

## [0.8.0] - 2026-10-10

### Breaking
- Write calls check the identifiers and string parameters they introduce before anything is written, and throw the new `InvalidWriteError` (`field`, `detail`) naming the offending option; no file changes. `apply` exits with code 1 naming `mutations[i].<field>`; the single-purpose CLI commands name the option. Rejected now, written before:
  - an element name or view id that is not one LikeC4 identifier or is a reserved word (`this`, `it`, `self`, `super`, `likec4lib`, `global`) — an empty view id wrote an unnamed view;
  - an element name already declared at the same FQN in a loaded file (a sibling in the parent's body or in an `extend` of the parent, or another root element), and a view id already used by a view of any type;
  - a `kind` that is not one identifier, a relationship endpoint or view `target` that is not identifiers joined by `.`;
  - an `autoLayout` that is not a direction optionally followed by whole-number rankSep and nodeSep;
  - a style value that is not a value of its field (keyword sets of the installed grammar, a theme color or a custom color declared in a loaded file, a percentage from 0% to 100%, a library icon that exists, a URI other than `file://`, `none`, a boolean), and a style field the style type does not have;
  - an `includes` item of a deployment view that uses `with { ... }`.
  - a style value with a comment (`// ...`, `/* ... */`) or a separator (`red;`): written into an existing one-line style block, `color: 'red // x'` commented out the fields after it on that line (`//` inside a URI is not a comment and stays accepted).
  Such values could add other DSL than asked for (`autoLayout: 'LeftRight\n exclude a'` wrote an `exclude` rule) or produced text LikeC4 rejects or ignores.
- Writes LikeC4 would reject semantically are refused before writing, with an `InvalidWriteError` naming the field: an undeclared element kind (`addElement`), an undeclared tag (`addElement`, `updateElement`, `addRelationship`, `updateRelationship`), a relationship endpoint that does not resolve, a self or parent-child relationship (`addRelationship`), and an element view `target` that does not resolve (`addView`). Endpoints are resolved the way LikeC4 links them from the `model` block they are written into (unique descendants included), so `addRelationship('app.gateway', 'app.cache')` is rejected when `app.cache` links to `app.gateway.cache`.
- `addElement` is rejected (field `name`, nothing changed) when the new element would change what an existing reference links to — a relationship endpoint, an `extend a -> b` endpoint, an `extend X` target or a view's `of` target that resolved before and would then resolve to another element or not at all. E.g. with `app.api` the only `api`, a model-level `api -> other` stops resolving once `other.api` is added (LikeC4: `Could not resolve reference`); a new direct child `app.api` would take over `app.api` from the unique descendant `app.inner.api`. References in view rules, dynamic view steps and the deployment model are not checked.
- Only the values a call introduces are checked: problems already in the files do not block valid writes. Only the loaded files are known: a kind, tag, custom color or element declared in a file that is not loaded is rejected.

### Added
- `InvalidWriteError`, exported.

### Bugfix
- Text inserted into an existing block is laid out on lines of its own (lc4m-15.27). A property, tag, link, `style` or `metadata` block added to a one-line body (`a = service { description 'd' }`, `a -> b { }`), and an element, relationship or view added to a one-line parent body, `model { }` or `views { }` block, now spreads the block over several lines, indented one level deeper than its owner, with the closing `}` on its own line. Before, the new text was written on the `{` line and the `}` was moved to the end of the inserted text. Into a body already written over several lines, a property no longer gets the indentation of the `}` line added to its own and no longer pulls the `}` to the start of the line; inserted tags are no longer followed by an empty line.
- Metadata values (and array items) with line breaks are written as Markdown strings `'''...'''` instead of being flattened to one line (lc4m-15.27), so LikeC4 reads back the lines written — e.g. YAML or JSON payloads. Single-line values keep the `'...'` form.
- Written text uses the file's line ending (lc4m-15.27): in a file with CRLF line endings, every inserting write (`addElement`, `addRelationship`, `addView`, `updateElement`, `updateRelationship`) used to add LF-only lines, leaving the file with mixed line endings. The line ending is that of the file's first line break.
- A `\/` in a view or element title (`addView`, `addElement`, `updateElement`) is written as is — LikeC4's escape for a literal slash in a title, where `/` separates view folders — instead of as `\\/` (lc4m-15.27). LikeC4 reads either form as a literal slash; with the documented form the library's `getElement().title` now agrees with LikeC4's (`Cost / Benefit` instead of `Cost \/ Benefit`). Other backslashes are still escaped.
- `updateElement({ style })` and `updateRelationship({ style })` merge the patch into the existing `style { }` block in place (lc4m-15.27). Patched values are rewritten where they are written and missing fields added at the end of the block; comments, other fields, `:` / `;` separators and indentation are kept. Before, the whole block was regenerated, which dropped comments and could mis-indent it.

## [0.7.1] - 2026-10-08

### Bugfix
- CLI `apply`: `addView` accepts `includes` (an array of strings, one `include` rule per item, in order) and passes it to the library. Before 0.6.0 the field was silently dropped; since 0.6.0 it was rejected as an unknown field.
- `addView({ includes })` (library and CLI): one leading `include` keyword followed by whitespace is stripped, so `"include *"` writes `include *` instead of `include include *`. Each item must form exactly one `include` rule of the view's type — an empty item, a bare `include`, an item LikeC4 cannot parse, or one that would add another rule, a view property or another view (`"* exclude x"`, `"*\n autoLayout LeftRight"`) is rejected before anything is written (`apply`: exit code 1 with the path `mutations[i].includes[j]`; library: throws).
- Without `includes` the behaviour is unchanged: an element view gets `include *`.

## [0.7.0] - 2026-10-08

### Breaking
- Effective values include the **specification defaults of the element / relationship kind**, applied as LikeC4 1.59.4 does, before `extend` blocks: `title`, `summary`, `description`, `technology`, `tags` and `links`.
  - Tags are ordered kind, then own, then `extend` (duplicates dropped).
  - Own links replace the kind's links; the kind's links apply only when there are none of its own.
  - Elements: summary / description / technology fall back to the kind value when the element has none.
  - Relationships: description / technology fall back to the kind value when absent; an own `''` overrides.
- `ElementInfo.title` is always defined: the element's own title, else the kind title, else the element name (as LikeC4 computes it). The title as written stays available in `declared`.
- `removeElement().removedRelationships[].title` and the CLI `list-elements` / `get-element` output show effective titles.
- Writes never edit the specification: kind defaults are read-only. After `updateElement({ tags: T })` the effective tags are the kind's tags followed by `T`; `links: []` brings back the kind's links; `title: ''` / `label: ''` falls back to the kind title (elements: then the element name).

### Added
- `ElementInfo.fromSpecification` and `RelationshipInfo.fromSpecification` (kind, file, source range, the defaults the kind declares); exported type `KindDefaults`.
- CLI `get-element` prints the location of the kind specification that contributes defaults.

### Known gaps
- Style / notation defaults, `multiple`, and technology derived from an icon (which depends on project configuration the library does not read) are not reported.

## [0.6.0] - 2026-10-08

### Breaking
- Relationship endpoints are reported and matched as absolute FQNs, resolved the way LikeC4 links references (relative names inside element bodies, `this` / `it`, sourceless `-> x`, `extend` bodies, elements declared in other files). `RelationshipInfo.sourceFqn` / `targetFqn` and the `getRelationships({ sourceFqn, targetFqn })` filters previously carried the reference text as written (e.g. `'api'` for `api -> db` inside `app`); they now return `'app.api'`. Model-level references that were already absolute resolve to the same value. Unresolvable (e.g. ambiguous) names stay as written.
- `getElement().title` prefers the inline title over a body `title` property, as LikeC4 does.
- Invalid tag names (anything that is not a single token of the grammar's `Id` rule — e.g. `1a`, `a b`, `true`, `true-x`, or keywords such as `title` / `with`) and invalid link URLs (whitespace, or not `scheme://…`, `/…`, `./…`, `../…`, `@alias/…`) now throw. Previously tags were written as-is and URLs were silently rewritten.
- CLI `apply` validates the mutations file before touching any `.c4` file and fails with exit code 1 naming the location (e.g. `mutations[0].tags: expected an array of strings, got a string`). Unknown fields are rejected too — top-level keys other than `mutations`, fields an op does not accept, and unknown keys inside `style` objects and `links` entries — so a typo such as `tag` instead of `tags` now fails instead of being silently ignored.
- Metadata keys must be valid LikeC4 identifiers (as the grammar's `Id` rule accepts them): keys such as `1abc`, `-x`, `_`, `true`, `true-x` or keywords like `title` and `metadata` now throw before any text is generated. Previously they produced text that failed to parse, or `generateElement` returned invalid DSL.
- `getSpecification()` returns the merged specification of all files (names in first-declaration order, a name declared in several files listed once) instead of only the first file's.
- Metadata maps returned by the library have a null prototype.
- `getElement` / `listElements` return **effective** `tags`, `links` and `metadata`: the element body merged with every `extend` block of that element in all files, as LikeC4 1.59.4 does. Tags are a union (all comma-separated groups); links are concatenated and keep duplicates; metadata reads only the first `metadata { }` block of each body, values are dedented/trimmed and empty values dropped, then grouped per key (one value → string, several → array). Effective link labels are collapsed to one line. The declarative form is available as `ElementInfo.declared`, and each contributing block as `ElementInfo.extendedBy[]` (file, source range, contribution).
- `updateElement` `tags` / `links` / `metadata` act on the effective value: new values go into the declaration; the patched tags, links or metadata keys are also removed from every `extend` block of exactly that element, in every file (empty `extend` blocks are left in place). A metadata `null` removes the key from every `metadata` block; an emptied first block is kept as `metadata { }` while later blocks still have attributes, so hidden blocks never become effective. The same multi-block metadata handling applies to `updateRelationship`.
- `updateElement` returns `{ changedFiles: string[] }` instead of `void`.
- `getRelationships` returns **effective** `tags`, `links` and `metadata`: the relationship merged with every `extend a -> b { … }` block that applies to it, as LikeC4 1.59.4 does (matched by resolved source / target, kind — an undeclared kind counts as none — title — an untitled relationship by its kind's spec title — and direction). Values are normalized as for elements; a link from a block is dropped when the same url and label are already present. New `RelationshipInfo.declared` and `RelationshipInfo.extendedBy`.
- `updateRelationship` `tags` / `links` / `metadata` act on the effective value: patched tags, links and keys are also removed from every matching `extend a -> b` block in every file. A `label` that changes the title is written into those blocks. An update is rejected (nothing changes) when it would change a block shared with another relationship, or when a label change would move blocks onto another relationship or pull blocks of the new title onto this one. Label / tags / links / metadata updates are rejected while any file has syntax errors. Returns `{ changedFiles }` instead of `void`.
- `getElement` / `listElements` / `getRelationships` report `title`, `summary`, `description` and `technology` normalized as LikeC4 reads them: dedented and trimmed, inline technology on one line, Markdown as its content; an empty Markdown title or technology is no value. An inline value overrides the body as in LikeC4 (title and technology whenever written, summary / description when non-empty); among repeated body declarations the last one counts.
- A metadata patch edits the first `metadata` block attribute by attribute instead of rebuilding it: one-line blocks stay on one line, comments and untouched attributes keep their exact text.
- A tags / links / metadata `updateElement` is rejected while any loaded file has syntax errors. Atomicity is in memory only; the CLI writes files one by one.
- `fromFiles` / `WorkspaceIndex` reject two file names that denote the same path (e.g. `a.c4` and `./a.c4`).

### Bugfix
- `ElementInfo.summary` is reported (it was missing); inline element summary / technology (`a = service 'T' 'S' 'K'`) and inline relationship description / technology (`a -> b 'T' 'D' 'K'`) are read, and updates replace them where they are written instead of writing a body value they override.
- Updating `summary` / `description` / `technology` rewrites every declaration of the key; LikeC4 reads the last one, so editing only the first was a silent no-op.
- Markdown (`'''…'''`) summary and description values are read; they were reported as undefined.
- `RelationshipInfo.kind` reports the `.kind` form (`x .calls y`) and `matchKind` matches it.
- Tags written on the relation line (`x -> y 'T' #a`) are read; `updateRelationship` replaces or clears them in place and removes body tags too.
- `removeRelationship` / `removeElement` remove `extend a -> b` blocks that applied only to removed relationships or point at removed elements.
- Tags written as comma-separated groups (`#a, #b #c`) are read completely; previously only the last group was returned (elements and relationships).
- Links written as `link: url` are read for elements and relationships.
- Replacing `links` no longer deletes properties declared between two `link` lines (elements and relationships).
- `removeElement` now actually removes relationships whose source or target is the removed element or one of its descendants, in every file; `removedRelationships` lists exactly what was removed. All files are restored if a step fails.
- Removing an element or relationship no longer joins neighbouring lines or pulls the next line into a trailing `//` comment.
- `updateElement({ title })` updates titles declared in the element body (every declaration), instead of adding a second inline title.
- `removeRelationship` searches all files, not only the first file with a `model` block, and matches by absolute FQN (falling back to the reference text as written).
- Brace handling no longer misreads block comments, `'''…'''` strings or unquoted URLs such as `link https://…`: `validate()` no longer reports false brace errors and edits on such files are no longer rejected.
- Properties added to an element whose first child sits on the `{` line are inserted before the child.
- Metadata keys named like `Object.prototype` members (`__proto__`, `constructor`) are kept as data.
- Merging metadata keeps untouched attributes byte-for-byte, including boolean and markdown values; reads now include boolean (`'true'` / `'false'`) and markdown values.
- Relationships declared inside `extend` blocks are now returned by `getRelationships`.
- Elements declared inside `extend X { … }` blocks (in any file) are found by `getElement`, `listElements`, `getElementSource`, `updateElement`, `removeElement` and `addElement`, and appear in their parent's `children`. `removeElement` also deletes every `extend` block that targets the removed element or one of its descendants; relationships inside those blocks are listed in `removedRelationships`.

### Dependencies
- `@likec4/core` `^1.59.4` (LikeC4's path ordering) and `strip-indent` `^4.1.1` (LikeC4's value dedenting) are direct runtime dependencies; both were already installed through `@likec4/language-server`.

### Added
- `ElementInfo.declared` and `ElementInfo.extendedBy`; exported types `ElementDecorations`, `ExtendContribution`, `SourceRange`, `UpdateElementResult`, `WorkspaceDocument`, `WorkspaceDocumentAst`, `ExtendBlockRef`, `ExtendElementNode`. `WorkspaceIndex` accepts `{ file, ast }` documents and has `extendBlocks(fqn)`.
- CLI `get-element` prints the `extend` blocks that contribute to an element.
- `WorkspaceIndex.extendRelationBlocks()` / `effectiveIdentity()`; exported types `UpdateRelationshipResult`, `ExtendRelationBlockRef`, `ExtendRelationNode`, `RelationIdentity`.
- `WorkspaceIndex` export (with `children(fqn)`) and an optional second parameter `new C4Query(ast, workspace?)` for cross-file reference resolution.

## [0.5.0] - 2026-10-07

### Breaking
- Minimum Node.js is now `>=22.22.3`, matching the requirement of `@likec4/language-server` (`>=22.22.3` since 1.57.0).
- CLI: passing unexpected positional arguments to a command is now an error (Commander 13+ default), e.g. `likec4-mutator validate --dir ./c4 extra` exits with code 1 and `error: too many arguments for 'validate'. Expected 0 arguments but got 1: extra.`. Previously such arguments were silently ignored.

### Dependencies
- `@likec4/language-server` `^1.55.0` → `^1.59.4`. Tests now run against the same version a clean install resolves to.
- `esbuild` `0.27.4` → `0.28.2`, matching the optional peer pinned by `@likec4/language-server@1.59.4`. A clean install now contains a single esbuild copy instead of two.
- `commander` `^12.0.0` → `^15.0.0`.
- Dev: `vitest` `^3` → `^5`, `tsx` → `^4.23.15`, `@types/node` `^25` → `^22` (types now match the minimum supported Node.js).
- Release workflow runs on Node.js 22.

### Internal
- Build tool switched from `tsup` to `tsdown`; `typescript` `^5.4` → `^7.0.2`. Public exports (runtime and type) are unchanged; the emitted `.d.ts` type-checks for consumers on TypeScript 5.9 and 7.
- `tsconfig.json` lists `"types": ["node"]` explicitly (required since TypeScript 6).

## [0.4.2] - 2026-05-03

### Bugfix
- `updateElement` and `updateRelationship` no longer produce parse errors when adding a property block (`metadata`, `links`, `style`) or a property line (`summary`, `description`, `technology`) for the first time on a body that already contains child elements. Previously the new content was spliced in before the body's closing `}`, which placed it AFTER existing children — the LikeC4 grammar requires `(properties* tags*) children*` ordering, so this produced `Expecting token of type '}' but found …`. The insertion point now lands before the first child whenever children are present.
- `updateElement.metadata` / `updateRelationship.metadata` with a `null` patch that deletes every remaining key no longer squashes the previous and following lines together. `expandRangeToConsumeSurroundingNewlines` previously ate both surrounding newlines on plain deletion; the deletion path now preserves the trailing newline so adjacent body content keeps its own line.

### Internal
- New shared helper `findInsertOffsetBeforeChildren` (`src/mutator/cst-helpers.ts`) implements the "insert before first child, fall back to before closing brace" routing used by both fixes.
- `expandRangeToConsumeSurroundingNewlines` accepts an optional `{ consumeTrailingNewline?: boolean }` (default `true` — backward compatible).

## [0.4.1] - 2026-05-01

### Bugfix
- Pin `bundle-require` and `esbuild` as direct dependencies. Upstream
  `@likec4/config` declares them as optional peer dependencies, so a clean
  `npm install likec4-mutator` did not pull them and the first runtime call
  failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'bundle-require'`.

## [0.4.0] - 2026-05-01

### Breaking changes
- `updateElement.tags`: was APPEND, now REPLACE. Migration: read existing tags first and pass full union if append behaviour is needed. Empty array `[]` clears all tags.
- `updateElement.style`: was full REPLACE, now MERGE per-field. Migration: pass full style object to reproduce the old replace-all behaviour.

### Features
- Add `updateRelationship` operation: update label, description, technology, tags, links, metadata, style on existing relationships. Disambiguate parallel relationships via `matchKind` / `matchTitle`. Available via the programmatic API and the `apply` batch (no standalone CLI command).
- Support array values in metadata: `Record<string, string | string[]>` for `addElement`, `updateElement`, `addRelationship`, `updateRelationship`. Empty arrays are rejected (LikeC4 grammar limitation).
- `null` sentinel in metadata patch deletes a key (applies to `updateElement` and `updateRelationship`).
- Read API: `ElementInfo.metadata`, `ElementInfo.links`, `RelationshipInfo.{kind, tags, links, metadata}` are now exposed.

### Internal
- Verified standalone `LangiumParser.parse()` supports the `MetadataArray` AST type without a linking phase (see `research/spike-array-metadata.mjs`).
- AST shape probe for tag / style / relation-style `$type` strings (`research/spike-ast-shapes.mjs`).
- Codegen preserves original array literal formatting on round-trip for keys not modified by the patch (multi-line vs inline).
- Extracted shared CST helpers (`src/mutator/cst-helpers.ts`) and metadata read/merge/write logic (`src/mutator/metadata-ops.ts`); replaced naive `findClosingBrace` in `relationship-ops.ts` with the string-literal-aware version.

## [0.3.2] - 2026-04-30
- [BUGFIX] Drop NoMCPServer import — incompatible with @likec4/language-server >=1.55.0 which removed MCP server module
- Bump @likec4/language-server dependency from ^1.53.0 to ^1.55.0

## [0.3.1] - 2026-03-25
- [BUGFIX] Fix updateElement duplicating metadata, links, and style blocks — now replaces existing blocks
- [BUGFIX] Fix addElement inserting child inside sibling element due to naive backward brace scan
- [BUGFIX] Add automatic rollback when mutation produces parse errors (Level 1 validation)
- [FEATURE] Add brace balance check to validate() for structural damage detection (Level 2 validation)
- Stable sort in applyEdits for deterministic same-offset edit ordering

## [0.3.0] - 2026-03-22
- [FEATURE] Add GitHub Actions workflow for automated npm publish and GitHub Release on version tag
- Add author and keywords to package.json for npm discoverability

## [0.2.1] - 2026-03-21
- [BUGFIX] addView now adds `include *` by default for element views
- [FEATURE] addElement returns created FQN (CLI outputs it to stdout)
- [FEATURE] removeElement returns list of removed relationships (CLI outputs them)

## [0.2.0] - 2026-03-21
- [FEATURE] Full element property support: summary, tags, links, metadata, style block (shape/color/icon/opacity/border/multiple/size/padding/textSize/iconPosition/iconColor/iconSize)
- [FEATURE] Full relationship property support: technology, tags, links, metadata, style (line/color/head/tail)
- [FEATURE] Standalone CLI commands: update-element, remove-element, remove-relationship
- [FEATURE] CLI add-element --summary and --tags flags
- [FEATURE] Batch apply supports all 6 operations with full properties
- [BUGFIX] Fix fuzzy matching in removeRelationshipEdit — exact FQN matching only
- [BUGFIX] Fix tag # prefix stripping (prevents ##tag)
- Security: URL sanitization, metadata key validation, path traversal protection, JSON input validation
- Code quality: extract shared helpers, clean public API surface, exhaustive switch checks

## [0.1.0] - 2026-03-21
- [FEATURE] Initial release: C4Parser for parsing .c4 files via @likec4/language-server (Langium standalone)
- [FEATURE] Query layer: getElement, listElements, getRelationships by FQN with CST positions
- [FEATURE] Mutation operations: addElement, updateElement, removeElement, addRelationship, removeRelationship, addView via CST text replacement
- [FEATURE] CLI: validate, list-elements, get-element, add-element, add-relationship, apply (batch JSON mutations)
- [ARCHITECTURE] Text replacement mutation engine using CST positions from Langium parser
- [BUGFIX] Fix fuzzy matching in removeRelationshipEdit — use exact FQN matching only
