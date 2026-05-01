# Changelog

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
