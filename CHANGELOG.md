# Changelog

## [0.6.0] - 2026-10-08

### Breaking
- Relationship endpoints are reported and matched as absolute FQNs, resolved the way LikeC4 links references (relative names inside element bodies, `this` / `it`, sourceless `-> x`, `extend` bodies, elements declared in other files). `RelationshipInfo.sourceFqn` / `targetFqn` and the `getRelationships({ sourceFqn, targetFqn })` filters previously carried the reference text as written (e.g. `'api'` for `api -> db` inside `app`); they now return `'app.api'`. Model-level references that were already absolute resolve to the same value. Unresolvable (e.g. ambiguous) names stay as written.
- `getElement().title` prefers the inline title over a body `title` property, as LikeC4 does.
- Invalid tag names (anything that is not a single token of the grammar's `Id` rule — e.g. `1a`, `a b`, `true`, `true-x`, or keywords such as `title` / `with`) and invalid link URLs (whitespace, or not `scheme://…`, `/…`, `./…`, `../…`, `@alias/…`) now throw. Previously tags were written as-is and URLs were silently rewritten.
- CLI `apply` validates the mutations file before touching any `.c4` file and fails with exit code 1 naming the location (e.g. `mutations[0].tags: expected an array of strings, got a string`). Unknown fields are rejected too — top-level keys other than `mutations`, fields an op does not accept, and unknown keys inside `style` objects and `links` entries — so a typo such as `tag` instead of `tags` now fails instead of being silently ignored.
- Metadata keys must be valid LikeC4 identifiers (as the grammar's `Id` rule accepts them): keys such as `1abc`, `-x`, `_`, `true`, `true-x` or keywords like `title` and `metadata` now throw before any text is generated. Previously they produced text that failed to parse, or `generateElement` returned invalid DSL.
- `getSpecification()` returns the merged specification of all files (names in first-declaration order, a name declared in several files listed once) instead of only the first file's.
- Metadata maps returned by the library have a null prototype.

### Bugfix
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

### Added
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
