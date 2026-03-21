# Changelog

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
