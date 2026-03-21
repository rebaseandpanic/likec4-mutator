# Research results: likec4-mutator

**Date:** 2026-03-21
**Status:** Completed, decisions made

---

## Decisions made

| Question | Decision | Justification |
|----------|----------|---------------|
| Language | **TypeScript** | LikeC4 is built on Langium (TS), we reuse the parser and grammar |
| Parser | **Langium-based** (`@likec4/language-server`) | ~200 grammar rules — a custom parser is impractical |
| Serialization | **Text replacement by CST positions** | No built-in serializer, but the approach has been tested and works |
| Integration with .NET | **CLI (batch mode)** | `Process.Start("likec4-mutator", "apply --mutations file.json")` |

---

## 1. Langium API — standalone parsing

### Verdict: SUITABLE

Langium (v3.5.0, used in `@likec4/language-server`) supports standalone parsing without LSP:

```typescript
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer }
  from '@likec4/language-server/module';
import { parseHelper } from 'langium/test';

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

const ast = document.parseResult.value;       // LikeC4Grammar AST
const cst = document.parseResult.value.$cstNode; // CST with positions
```

Alternative synchronous method:
```typescript
const parser = services.likec4.parser.LangiumParser;
const result = parser.parse(sourceCode);
const ast = result.value;
```

### CST — what it provides

| Property | Available? | Details |
|----------|-----------|---------|
| Token positions | YES | `offset`, `end`, `length` on each CstNode |
| Line/character range | YES | `range.start.line`, `range.start.character` (LSP format) |
| Comments | YES | Hidden tokens: `LINE_COMMENT`, `BLOCK_COMMENT` |
| Whitespace | NO (as tokens) | But `RootCstNode.fullText` stores the original text in full |
| AST <-> CST link | YES | `astNode.$cstNode` on each AST node |

### Serialization — text replacement

There is **no** built-in DSL serializer in Langium (discussed since 2022, developers consider the task too complex for a generic solution).

Working approach — text replacement by positions from CST:

```typescript
// Multiple replacements — from end to beginning
const replacements = [...edits].sort((a, b) => b.offset - a.offset);
let text = rootCst.fullText;
for (const { offset, end, newText } of replacements) {
  text = text.substring(0, offset) + newText + text.substring(end);
}
// text — valid .c4 with preserved formatting
```

**Tested:** multiple string literal replacement, re-parsing without errors.

### Dependencies

| Package | Size |
|---------|------|
| `langium` | 11 MB |
| `chevrotain` | 1.8 MB |
| `vscode-languageserver` + types | ~1.7 MB |
| **Total** | **~15 MB** |

There is no need to install langium separately — it is already a dependency of `@likec4/language-server`.

---

## 2. LikeC4 internals

### Grammar: ~200 rules, 1073 lines

| Category | Rules | Needed? |
|----------|-------|---------|
| Specification | ~12 | YES — core |
| Model/Elements/Relations | ~25 | YES — core |
| Views | ~45 | YES — core |
| Expressions (predicates) | ~25 | PARTIALLY |
| Deployment | ~15 | YES |
| Global styles/predicates | ~6 | NO (for now) |
| Style properties | ~15 | PARTIALLY |
| Terminals/literals | ~23 | Automatically |
| Types/interfaces | ~17 | Automatically |

**Conclusion:** grammar is of medium-high complexity. Parametric rules, left recursion, complex expression chains. Writing a custom parser is impractical.

### Key services in @likec4/language-server

| Service | What it does | Useful for us? |
|---------|-------------|----------------|
| `LangiumParser` | Parsing -> AST + CST | YES — foundation |
| `LikeC4ModelParser` | AST -> typed model data | MAYBE |
| `LikeC4ModelBuilder` | Building model from documents | NO |
| `LikeC4ModelChanges` | Applying changes via TextEdit | YES — reference implementation |
| `FqnIndex` | Fully qualified names index | MAYBE |
| `ModelLocator` | Finding element positions | YES |

### LikeC4ModelChanges.convertToTextEdit()

**This is the reference implementation of what we need.** The language-server already has a mechanism for generating text edits for model mutations. We need to study its code and adapt it.

### AST types (key ones)

**Root:** `LikeC4Grammar` -> `specifications[]`, `models[]`, `views[]`, `deployments[]`, `globals[]`

**Elements:** `Element` (name, kind, props[], body?), `ElementBody` (elements[], props[], tags?)

**Relations:** `Relation` (source?, target, title?, description?, technology?, tags?, body?, kind?)

**Views:** `ElementView` (name?, viewOf?, body?), `DynamicView`, `DeploymentView`

**Deployment:** `DeploymentNode` (name, kind, title?, body?), `DeployedInstance` (name?, target)

**References:** `FqnRef` (recursive: parent? + value), `ElementRef`, `StrictFqnRef`

### LikeC4.fromSource() — not suitable

- No access to AST/CST
- No source code positions
- No write-back
- 188 MB dependencies (graphviz-wasm and more)

---

## 3. Real .c4 files

### Ecosystem scale

- **88 files** in the official likec4/likec4 repo
- **246+ matches** on GitHub (public projects)
- Most mature external project: **SpecterOps/BloodHound** (12 .c4 files)

### DSL construct frequency

**Used by almost everyone (>85%):**
- `specification { element <kind> }` — 100%
- `model { }` with nested elements — 100%
- `->` relationships — 95%
- `description` — 95%
- `style { }` inline — 90%
- `views { }` with include/exclude — 85%
- `shape`, `icon` — 75-80%

**Used frequently (30-70%):**
- `tag` — 60%
- `technology` — 55%
- `view of <element>` — 50%
- `autoLayout` — 45%
- `relationship <kind>` — 40%
- `extend` — 40%
- `link` — 30%

**Used rarely (<20%):**
- `dynamic view` — 25%
- `deployment` — 20%
- `metadata` — 15%
- `global predicate` — <5%
- `rank` — <5%

### Typical sizes

| File type | Typical (lines) | Range |
|-----------|-----------------|-------|
| _spec.c4 | 50-100 | 20-200 |
| model.c4 | 80-220 | 30-500+ |
| views.c4 | 40-100 | 20-200 |
| deployment.c4 | 60-140 | 30-200 |

Typical nesting: 2-3 levels. Maximum in real projects: 4.

### Constructs missing from our spec

Found in documentation/real projects, but not described in the spec:
1. `summary` — short description on the diagram
2. Triple-quoted strings (`'''...'''`) — multiline markdown
3. Colon syntax (`description: '...'` vs `description '...'`)
4. `it` / `this` — reference to the current element
5. `.uses` / `.solid` — dot-prefix relationship syntax
6. `color rgba(...)` — RGBA colors
7. `view extends <view>` — view inheritance

All these constructs will be automatically supported by the parser (Langium parses the full grammar), but the mutator needs to know about them for correct text generation.

---

## 4. Architecture (final recommendation)

```
@likec4/language-server (parser)
         |
   parse(.c4 text) -> AST + CST + fullText
         |
   likec4-mutator (our code)
   ├── query/     — element search by FQN, kind, tag
   ├── mutator/   — mutation operations (add/update/remove/move)
   ├── edits/     — forming text edits by CST positions
   ├── validator/ — semantic checks
   └── cli/       — CLI interface for calling from .NET
```

### Mutation algorithm

1. **Parse** — `LangiumParser.parse(text)` -> AST + CST
2. **Find** — find AST node by FQN via tree traversal
3. **Position** — get position via `$cstNode.offset` / `$cstNode.end`
4. **Edit** — form text edit (offset, end, newText)
5. **Apply** — apply all edits to fullText (from end to beginning)
6. **Validate** — re-parse the result, verify 0 errors

### For adding new elements

New elements have no CST positions (they don't exist in the text yet). Algorithm:
1. Find parent AST node
2. Find the position of the closing `}` via `$cstNode`
3. Generate text for the new element (custom printer for a subset of constructs)
4. Insert before `}`

---

## 5. Risks and mitigations

| Risk | Probability | Mitigation |
|------|------------|-----------|
| Langium API breaks between versions | Medium | Pin `@likec4/language-server` version, compatibility tests |
| AST types — internal API | High | Wrapper adapters, don't depend on specific field names directly |
| 15 MB dependencies for CLI | Low | Acceptable for CLI, can bundle via esbuild |
| Complex mutations (move with cascading FQN update) | High | Defer moveElement to phase 2 |
| New element formatting doesn't match existing | Medium | Analyze indent/style of existing elements in parent during generation |

---

## 6. Downloaded examples

Files in `/workspaces/likec4-mutator/research/results/examples/`:

| File | Source | Description |
|------|--------|-------------|
| cloud-system-spec.c4 | likec4/likec4 examples | Cloud system specification |
| cloud-system-model.c4 | likec4/likec4 examples | Model with elements and relationships |
| cloud-system-deployment.c4 | likec4/likec4 examples | Deployment model |
| boutique-spec.c4 | likec4/likec4 examples | E-commerce specification |
| boutique-model.c4 | likec4/likec4 examples | E-commerce model |
| bloodhound-*.c4 | SpecterOps/BloodHound | Real production project |

All files under MIT or Apache 2.0 licenses.

---

## Next steps

1. Study `LikeC4ModelChanges.convertToTextEdit()` — adapt for the mutator
2. Initialize the project: package.json, tsconfig, vitest
3. Implement core: parse -> query -> mutate -> serialize round-trip
4. Start with addElement + addRelationship as proof of concept
5. Cover with tests using the downloaded examples
