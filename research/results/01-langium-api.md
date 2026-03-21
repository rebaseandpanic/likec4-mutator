# Research: Langium API for use in likec4-mutator

**Date:** 2026-03-21
**Langium version:** 4.2.1 (npm latest)
**Langium version in @likec4/language-server:** 3.5.0

---

## 1. Can Langium be used as a standalone parser (without LSP)?

### Answer: YES

Starting with Langium v3.0, the package is split into two exports:
- `langium` — core functionality (parser, AST, CST, utilities)
- `langium/lsp` — LSP-specific part

For standalone parsing you need:
- `createDefaultCoreModule` and `createDefaultSharedCoreModule` from `langium`
- `EmptyFileSystem` for working without a file system
- `parseHelper` from `langium/test` — convenient wrapper for parsing strings

### Working example (using LikeC4 services):

```typescript
import { parseHelper } from 'langium/test';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } from '@likec4/language-server/module';

const services = createLanguageServices({
  ...NoFileSystem,
  ...NoLikeC4ManualLayouts,
  ...NoMCPServer,
});
const parse = parseHelper(services.likec4);

const document = await parse(`
specification {
  element component
}
model {
  app = component 'App'
}
`);

// Result:
// document.parseResult.value.$type === 'LikeC4Grammar'
// document.parseResult.parserErrors.length === 0
// document.parseResult.value.$cstNode — full CST tree
```

**Conclusion:** LikeC4 language-server already provides `createLanguageServices` with `NoFileSystem`, which allows parsing .c4 files standalone without an LSP server.

---

## 2. Does CST preserve positions and whitespace?

### Answer: PARTIALLY — positions YES, whitespace NO (as tokens)

### What CST contains:
- **Exact positions** of each token: `offset`, `end`, `length`
- **Range** with line/character (LSP format): `range.start.line`, `range.start.character`
- **Comments** as hidden tokens (`LINE_COMMENT`, `BLOCK_COMMENT`)
- **Full source text** in `RootCstNode.fullText`
- **Text of each node** in `CstNode.text`
- **AST <-> CST link** via `astNode.$cstNode`

### What CST does NOT contain:
- **Whitespace and line breaks** — by default not stored as tokens (status `SKIPPED`)
- Can be enabled by overriding `TokenBuilder`, but this is non-trivial

### CST node structure:

```
CstNode extends DocumentSegment {
  container?: CompositeCstNode   // parent
  text: string                    // text of this node
  root: RootCstNode              // root with fullText
  grammarSource?: AbstractElement // grammar rule
  astNode: AstNode               // associated AST node
  hidden: boolean                // hidden token (comment)?
  range: Range                   // {start: {line, character}, end: {line, character}}
  offset: number                 // absolute position in text
  length: number                 // length
  end: number                    // offset + length
}
```

### Utilities for working with CST (`CstUtils`):
- `flattenCst(node)` — all leaf nodes (Stream)
- `findLeafNodeAtOffset(node, offset)` — search by position
- `streamCst(node)` — all nodes (TreeStream)
- `toDocumentSegment(node)` — node position

### CST output example:

```
ROOT [21:217]
  LEAF(LINE_COMMENT) [HIDDEN] [0:20] "// This is a comment"
  COMPOSITE [21:76] "specification {...}"
    LEAF(specification) [21:34]
    LEAF({) [35:36]
    COMPOSITE [39:56] "element component"
    ...
```

**Conclusion:** CST provides full position information but does not store whitespace as separate tokens. However, `fullText` contains the original text in full, and positions allow precise determination of where each fragment is located.

---

## 3. Is there a serializer (AST -> DSL text)?

### Answer: NO built-in DSL serializer

### What exists:
1. **`JsonSerializer`** — serializes AST to JSON (and back). Useful for data exchange, but not for generating .c4 text.
2. **`Formatter`** (in `langium/lsp`) — formats existing text, but **only if the AST node has an attached CST**. Cannot create text "from scratch".
3. **`Hydrator`** — restores AST from JSON representation.

### Why there is no DSL serializer (from discussion #683):
Langium developers highlight 5 challenges:
1. Handling hidden nodes (comments, whitespace)
2. Creating a default formatter for arbitrary grammars
3. Grammar rule ambiguity during serialization
4. Unassigned data (AST without binding to rules)
5. Handling invalid AST

### Working approach: Text Replacement via CST positions

Instead of serialization, the most reliable approach is **text replacement by positions from CST**:

```typescript
const rootCst = document.parseResult.value.$cstNode as RootCstNode;
const fullText = rootCst.fullText;

// Find the needed token
for (const leaf of CstUtils.flattenCst(rootCst)) {
  if (leaf.text === "'Original description'") {
    // Replace by positions
    const newText = fullText.substring(0, leaf.offset)
      + "'New description'"
      + fullText.substring(leaf.end);
    // newText — valid .c4 text!
  }
}
```

For multiple mutations — sort replacements from end to beginning:

```typescript
const replacements = [...nodes].sort((a, b) => b.offset - a.offset);
let text = rootCst.fullText;
for (const node of replacements) {
  text = text.substring(0, node.offset) + newValue + text.substring(node.end);
}
```

**Tested:** multiple string literal replacement works correctly, re-parsing without errors.

---

## 4. Dependency sizes and potential issues

### Package sizes in node_modules:

| Package | Size |
|---------|------|
| `langium` | **11 MB** |
| `chevrotain` | 1.8 MB |
| `chevrotain-allstar` | 208 KB |
| `vscode-languageserver` | 392 KB |
| `vscode-languageserver-protocol` | 880 KB |
| `vscode-languageserver-textdocument` | 80 KB |
| `vscode-languageserver-types` | 404 KB |
| `vscode-uri` | 256 KB |
| **Total ~** | **~15 MB** |

### Dependencies of langium@4.2.1:
```json
{
  "chevrotain": "~11.1.1",
  "chevrotain-allstar": "~0.3.1",
  "vscode-languageserver": "~9.0.1",
  "vscode-languageserver-textdocument": "~1.0.11",
  "vscode-uri": "~3.1.0"
}
```

### Issues:
- **`vscode-languageserver`** is pulled in even when using only core. This is ~1.7 MB of unnecessary dependencies.
- There is **no** separate `langium-core` package — developers decided not to create one, instead splitting via import paths (`langium` vs `langium/lsp`).
- When bundling (esbuild/rollup) with tree-shaking, unused LSP code should be eliminated.

### For our case:
We do NOT need to install langium separately — **@likec4/language-server already depends on langium@3.5.0** and provides ready-made services with `NoFileSystem`.

---

## 5. Langium package exports

### Entry points (package.json exports):
- `langium` — main (core services, AST, CST, parser)
- `langium/lsp` — LSP services
- `langium/test` — test utilities (`parseHelper`, etc.)
- `langium/node` — `NodeFileSystem`
- `langium/grammar` — grammar utilities
- `langium/generate` — code generation

### Key interfaces:
- `AstNode` — AST node with `$type`, `$cstNode`, `$container`
- `CstNode` / `CompositeCstNode` / `LeafCstNode` / `RootCstNode` — CST
- `LangiumDocument` — document with `parseResult`
- `LangiumCoreServices` — services without LSP
- `CstUtils` — utilities for working with CST
- `Mutable<T>` — type for mutating readonly AST properties

---

## 6. Overall recommendation

### Langium IS SUITABLE for likec4-mutator, with caveats:

**Pros:**
1. Standalone parsing works great via `@likec4/language-server/module`
2. CST contains exact positions of all tokens (offset/end)
3. Comments are preserved in CST as hidden tokens
4. `RootCstNode.fullText` stores the original text in full
5. The "text replacement by CST positions" approach is working and tested
6. No need to add langium separately — it's already in @likec4/language-server

**Cons:**
1. **No built-in AST->text serializer** — need to work via text replacement
2. **Whitespace is not stored in CST** — but this is solved via fullText + offset
3. **CST is not updated when AST is mutated** — cannot modify AST and "re-serialize"
4. **For complex structural mutations** (adding new elements, moving blocks) you need to manually form text and insert at correct positions

### Recommended architecture for the mutator:

```
1. Parse .c4 file -> get AST + CST + fullText
2. Find needed AST nodes by semantics
3. Get exact text positions via $cstNode
4. Form replacements (offset, end, newText)
5. Apply replacements from end to beginning
6. Optionally: re-parse for validation
```

This approach:
- Preserves formatting and comments
- Does not require a DSL serializer
- Works with any mutations (replacing values, adding properties, removing blocks)
- Allows validating the result via re-parsing
