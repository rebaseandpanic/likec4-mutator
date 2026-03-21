# Research: LikeC4 internals

Date: 2026-03-21
Version: LikeC4 1.53.0

## 1. LikeC4 grammar analysis

Source: `packages/language-server/src/like-c4.langium` (1073 lines)

### Rule statistics

| Category | Count |
|----------|-------|
| Parser rules (total) | ~157 |
| Type/interface declarations | 17 |
| Terminal rules | 23 |
| Fragment rules | 3 |
| **Total rules** | **~200** |

### Grammar rule categorization

#### Entry point
- `LikeC4Grammar` -- root node, contains: `imports`, `specifications`, `models`, `views`, `globals`, `deployments`, `likec4lib`

#### Specification (type definitions) -- ~12 rules
- `SpecificationRule`, `SpecificationElementKind`, `SpecificationTag`, `SpecificationColor`
- `SpecificationRelationshipKind`, `SpecificationDeploymentNodeKind`
- `SpecificationElementStringProperty`, `SpecificationRelationshipStringProperty`
- Helper rules: `ElementKind`, `Tag`, `RelationshipKind`, `CustomColor`, `DeploymentNodeKind`

#### Model (elements and relations) -- ~25 rules
- **Elements**: `Element`, `ElementBody`, `ElementProperty`, `ElementStringProperty`, `ElementStyleProperty`
- **Relations**: `Relation`, `RelationBody`, `RelationProperty`, `RelationStringProperty`, `RelationStyleProperty`
- **Extend**: `ExtendElement`, `ExtendElementBody`, `ExtendRelation`, `ExtendRelationBody`
- **Metadata**: `MetadataProperty`, `MetadataBody`, `MetadataAttribute`, `MetadataValue`, `MetadataArray`
- **References**: `FqnRef`, `StrictFqnRef`, `StrictFqnElementRef`, `ElementRef`, `FqnRefExpr`
- **Tags**: `Tags`, `TagRef`

#### Views (representations) -- ~45 rules
- **View types**: `ElementView`, `DynamicView`, `DeploymentView`
- **Bodies**: `ElementViewBody`, `DynamicViewBody`, `DeploymentViewBody`
- **Properties**: `ViewProperty`, `ViewStringProperty`, `DynamicViewProperty`, `DynamicViewDisplayVariantProperty`
- **Rules**: `ViewRule`, `ViewRulePredicate`, `ViewRuleStyle`, `ViewRuleAutoLayout`, `ViewRuleGroup`, `ViewRuleRank`
- **Dynamic steps**: `DynamicViewStep`, `DynamicStepSingle`, `DynamicStepChain`, `DynamicViewParallelSteps`
- **Refs**: `ViewRef`, `ElementViewRef`, `DynamicViewRef`
- **Global refs**: `ViewRuleGlobalPredicateRef`, `ViewRuleGlobalStyle`, `DynamicViewGlobalPredicateRef`
- **Custom properties**: `CustomElementProperties`, `CustomRelationProperties`, `NavigateToProperty`, `RelationNavigateToProperty`
- **Notation/Notes**: `NotationProperty`, `NotesProperty`

#### Expressions (for include/exclude) -- ~25 rules
- `Expressions`, `ExpressionV2`, `FqnExprOrWith`, `FqnExprOrWhere`, `FqnExpr`, `FqnRefExpr`
- `RelationExprOrWith`, `RelationExprOrWhere`, `RelationExpr`
- `InOutRelationExpr`, `IncomingRelationExpr`, `DirectedRelationExpr`, `OutgoingRelationExpr`
- `FqnExpressions`, `WildcardExpression`, `ElementTagExpression`, `ElementKindExpression`
- **Where**: `WhereElementExpression`, `WhereRelationExpression`, `WhereElement`, `WhereRelation` + Or/And/Negation variants

#### Deployment (deployment model) -- ~15 rules
- `ModelDeployments`, `DeploymentNode`, `DeploymentNodeBody`
- `DeployedInstance`, `DeployedInstanceBody`
- `DeploymentRelation`, `DeploymentRelationBody`
- `ExtendDeployment`, `ExtendDeploymentBody`
- `DeploymentView`, `DeploymentViewBody`, `DeploymentViewRule`, `DeploymentViewRulePredicate`, `DeploymentViewRuleStyle`

#### Global (global styles and predicates) -- ~6 rules
- `Globals`, `GlobalPredicateGroup`, `GlobalDynamicPredicateGroup`
- `GlobalStyle`, `GlobalStyleGroup`, `GlobalStyleId`

#### Imports -- 2 rules
- `ImportsFromPoject`, `Imported`

#### Style properties -- ~15 rules
- `ColorProperty`, `OpacityProperty`, `ShapeProperty`, `BorderProperty`, `IconProperty`
- `IconColorProperty`, `IconSizeProperty`, `IconPositionProperty`, `MultipleProperty`
- `ShapeSizeProperty`, `PaddingSizeProperty`, `TextSizeProperty`
- `LinkProperty`, `LineProperty`, `ArrowProperty`
- `RelationshipStyleProperty`, `StyleProperty`, `ElementStyleProperty`

#### Enum-like returns -- ~10 rules
- `ThemeColor`, `ElementShape`, `ViewLayoutDirection`, `LineOptions`, `ArrowType`
- `SizeValue`, `BorderStyleValue`, `DynamicViewDisplayVariantValue`, `Participant`, `RankValue`, `IconPositionValue`

#### Literals and terminals -- ~23 rules
- Terminals: `BOOLEAN`, `LIB_ICON`, `URI_WITH_SCHEMA`, `URI_RELATIVE`, `URI_ALIAS`, `DotUnderscore`, `DotWildcard`, `Hash`, `StickyDot`, `Dot`, `NotEqual`, `Eq`, `Percent`, `MarkdownString`, `String`, `Float`, `Number`, `IdTerminal`, `Hex`
- Hidden: `BLOCK_COMMENT`, `LINE_COMMENT`, `WS`, `NL`
- Composed: `Id`, `Uri`, `MarkdownOrString`, `ColorLiteral`, `RGBAColor`, `HexColor`, `CustomColorId`, `IconId`

### Complexity assessment

The grammar is of **medium-high complexity**:
- ~200 rules total -- this is substantial
- Parametric rules (Relation<isExplicit>, DeploymentRelation<isExplicit>)
- Left recursion via `infer` (FqnRef, StrictFqnRef, Expressions, Tags)
- Complex expression system for view predicates (where/with chains)

### What is needed for our subset

**Required (Core)**:
- Specification (element kinds, tags, relationship kinds)
- Element, ElementBody, ElementProperty
- Relation, RelationBody, RelationProperty
- Tags, TagRef
- FqnRef (for relations)
- ElementView, ElementViewBody, ViewRule (basic)
- ViewRuleAutoLayout
- Basic properties (title, description, technology, style)

**Desirable**:
- DynamicView, DynamicViewStep
- ExtendElement, ExtendRelation

**Exotic (can be deferred)**:
- DeploymentNode, DeployedInstance, DeploymentView
- Global predicates/styles
- Where/With expressions
- Metadata
- Imports
- LikeC4Lib (icons)
- ViewRuleGroup, ViewRuleRank
- CustomElementProperties, CustomRelationProperties

## 2. Package exports

### @likec4/language-server (v1.53.0)
- 35 dependencies, 6.3 MB, 672 kB unpacked
- Exports: `createLanguageServices`, `startLanguageServer`, context objects (`NoFileSystem`, `NoLikeC4ManualLayouts`, `NoMCPServer`, `WithFileSystem`, `WithMCPServer`, `WithLikeC4ManualLayouts`), `configureLanguageServerLogger`
- Inside: full Langium-based language server with LSP, completion, validation, formatting, code actions

**Key internal services** (accessible via `services.likec4.*`):
- `ModelParser` (LikeC4ModelParser) -- parsing documents into typed model data
- `ModelBuilder` (LikeC4ModelBuilder) -- building model from documents
- `ModelLocator` -- finding element positions
- `ModelChanges` (LikeC4ModelChanges) -- applying changes via TextEdit
- `Views` (LikeC4Views) -- computing views
- `FqnIndex` -- FQN index

### @likec4/core (v1.53.0)
- 3 dependencies (immer, type-fest, zod), 886 kB unpacked
- Subpackages: `/model`, `/types`, `/builder`, `/geometry`, `/compute-view`, `/styles`, `/utils`

**Key exports**:
- ~95 exports from the main package
- `LikeC4Model` -- main model with methods `.elements()`, `.relationships()`, `.views()` etc.
- `ElementModel`, `RelationshipModel`, `NodeModel`, `EdgeModel` -- element wrappers
- `Fqn`, `ViewId`, `EdgeId` and other branded types
- Many type guards (`isElementView`, `isDynamicView` etc.)
- `Builder` -- programmatic model construction

### likec4 (v1.53.0, main package)
- Exports `LikeC4` class + `LikeC4Options`
- Re-exports everything from `@likec4/core/types`
- Subpackages: `/model`, `/config`, `/vite-plugin`, `/react`

## 3. Can we reuse the parser?

### **YES** -- two options:

### Option A: High-level -- `LikeC4.fromSource()` (package `likec4`)

```typescript
import { LikeC4 } from 'likec4'

const likec4 = await LikeC4.fromSource(sourceCode, {
  printErrors: false,
  logger: false,
})

const model = likec4.syncComputedModel()
// model.elements(), model.relationships(), model.views()
```

**Pros**:
- Simple API, one line for parsing
- Returns a fully resolved model
- Works out of the box

**Cons**:
- No access to AST with positions (CST nodes)
- No access to element source text
- Heavy package (188 MB node_modules with graphviz-wasm and more)
- Async API
- No ability to modify and serialize back

### Option B: Low-level -- `createLanguageServices()` + `LangiumParser.parse()` (package `@likec4/language-server`)

```typescript
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer }
  from '@likec4/language-server'

const { likec4: services } = createLanguageServices({
  ...NoFileSystem,
  ...NoLikeC4ManualLayouts,
  ...NoMCPServer,
})

const parser = services.parser.LangiumParser
const result = parser.parse(sourceCode)
const ast = result.value // LikeC4Grammar AST node
```

**Pros**:
- Full access to AST with types (Element, Relation, Model etc.)
- CST nodes with positions (offset, length, range)
- Synchronous parsing
- Can modify AST and serialize back via Langium
- Access to `LikeC4ModelChanges.convertToTextEdit()` for generating edits

**Cons**:
- More complex to use
- Still pulls ~35 dependencies
- AST types are not exported directly (hidden in chunks)

### Option C: Custom parser (alternative)
- Write a parser for a grammar subset
- Full control, minimal dependencies
- But: ~200 grammar rules -- that is a lot of work

## 4. AST type catalog

Data from `module.d.mts` (`@likec4/language-server`):

### Root
| Type | Description |
|------|-------------|
| `LikeC4Grammar` | Root node. Contains: `specifications[]`, `models[]`, `views[]`, `deployments[]`, `globals[]`, `imports[]`, `likec4lib[]` |

### Elements
| Type | Description |
|------|-------------|
| `Element` | Model element. `name`, `kind` (ref), `props` (string[]), `body?` |
| `ElementBody` | Element body. `elements[]` (Element\|Relation), `props[]` (ElementProperty), `tags?` |
| `ElementKind` | Element type from specification. `name` |
| `ElementStringProperty` | Property: `key` (title\|description\|technology\|summary), `value` (MarkdownOrString) |
| `ElementStyleProperty` | Style block. `props[]` (StyleProperty) |
| `ExtendElement` | Element extension. `element` (StrictFqnElementRef), `body` |
| `ExtendElementBody` | Extend body. `elements[]`, `props[]`, `tags?` |

### Relations (Relationships)
| Type | Description |
|------|-------------|
| `Relation` | Relationship. `source?` (FqnRef), `target` (FqnRef), `title?`, `description?`, `technology?`, `tags?`, `body?`, `kind?`, `dotKind?` |
| `RelationBody` | Relationship body. `props[]`, `tags?` |
| `RelationStringProperty` | key: title\|technology\|description |
| `RelationStyleProperty` | Style block for relationship |
| `RelationshipKind` | Relationship type from specification |
| `ExtendRelation` | Relationship extension |

### Views
| Type | Description |
|------|-------------|
| `ModelViews` | Views container. `views[]` (LikeC4View), `styles[]`, `folder?` |
| `ElementView` | Regular view. `name?`, `viewOf?` (ElementRef), `extends?`, `body?` |
| `DynamicView` | Dynamic view. `name`, `body?` |
| `DeploymentView` | Deployment view. `name`, `body?` |
| `ElementViewBody` | View body. `tags?`, `props[]`, `rules[]` |
| `DynamicViewBody` | Dynamic view body. `tags?`, `props[]`, `steps[]`, `rules[]` |

### View Rules
| Type | Description |
|------|-------------|
| `ViewRulePredicate` | include/exclude expression |
| `ViewRuleStyle` | Style for targets |
| `ViewRuleAutoLayout` | autoLayout direction + spacing |
| `ViewRuleGroup` | Element grouping |
| `ViewRuleRank` | Element ranking |
| `ViewRuleGlobalPredicateRef` | Reference to global predicate |
| `ViewRuleGlobalStyle` | Reference to global style |

### Deployment
| Type | Description |
|------|-------------|
| `ModelDeployments` | Deployment model container |
| `DeploymentNode` | Deployment node. `name`, `kind` (ref), `title?`, `body?` |
| `DeployedInstance` | Element instance. `name?`, `target` (ElementRef) |
| `DeploymentRelation` | Deployment relationship |
| `ExtendDeployment` | Deployment extension |

### References and expressions
| Type | Description |
|------|-------------|
| `FqnRef` | Reference like `a.b.c`. Recursive: `parent?` + `value` (ref) |
| `StrictFqnRef` | Strict FQN reference |
| `ElementRef` | Element reference via `modelElement` (FqnRef) |
| `Expressions` | Expression chain (via `prev`) |
| `FqnRefExpr` | Expression: `ref` (FqnRef) + `selector?` (`._` or `.*`) |
| `WildcardExpression` | Expression `*` |

### Style properties
| Type | Description |
|------|-------------|
| `ColorProperty` | color: themeColor or customColor |
| `ShapeProperty` | shape: ElementShape |
| `BorderProperty` | border: solid\|dashed\|dotted\|none |
| `OpacityProperty` | opacity: Percent |
| `IconProperty` | icon: libicon or URL |
| `LineProperty` | line: solid\|dashed\|dotted |
| `ArrowProperty` | head/tail: ArrowType |

## 5. LikeC4.fromSource() -- capabilities and limitations

### API
```typescript
LikeC4.fromSource(sourceCode: string, options?: LikeC4Options): Promise<LikeC4>
```

### Returns a `LikeC4` object with methods:
- `documentCount()` -- number of parsed documents
- `hasErrors()` / `getErrors()` / `printErrors()` -- error handling
- `syncComputedModel(project?)` -- synchronous model retrieval (without layout)
- `computedModel(project?)` -- async, with manual layouts
- `layoutedModel(project?)` -- async, with layout via Graphviz
- `diagrams(project?)` -- async, layouted views
- `format(options?)` -- source formatting
- `projects()` -- list of projects
- `dispose()` -- cleanup

### Returned model (`LikeC4Model.Computed`):
- `.elements()` -- iterator of `ElementModel` (id, title, kind, description, technology, tags, style)
- `.relationships()` -- iterator of `RelationshipModel` (source, target, title, technology, tags)
- `.views()` -- iterator of `LikeC4ViewModel` (id, title, rules, nodes, edges)
- `.element(fqn)` -- find element by FQN
- `.parent(el)` / `.children(el)` -- hierarchy navigation
- `.incoming(el)` / `.outgoing(el)` -- element relationships

### Limitations:
1. **No access to AST** -- model is "computed", source code positions are lost
2. **No CST nodes** -- impossible to determine where a specific element is in the source
3. **Async API** -- cannot use synchronously (except `syncComputedModel`)
4. **Heavy dependencies** -- graphviz-wasm, langium, vscode-languageserver etc.
5. **No write-back** -- model is read-only, no way to modify and get new source code

## 6. Dependency tree

### When installing `likec4` + `@likec4/language-server` + `@likec4/core`:
- **208 packages**, **188 MB** on disk
- Major heavyweights:
  - `langium` -- 11 MB (Langium framework)
  - `likec4` -- 9.8 MB (CLI + graphviz-wasm)
  - `@likec4/language-server` -- 6.3 MB
  - `@likec4/core` -- 1.2 MB
  - `@hpcc-js/wasm-graphviz` -- heavy WASM module
  - `@modelcontextprotocol/sdk` -- MCP server
  - `hono` -- HTTP framework (for MCP)
  - `chokidar` -- file watcher
  - `immer` -- immutable state

### Critical dependencies for parsing:
- `langium` (3.5.0) -- **required** when using language-server
- `@likec4/core` -- required for types
- Everything else (graphviz, MCP, chokidar, hono) -- not needed for parsing

### When using only `@likec4/language-server`:
- Can use `NoFileSystem`, `NoLikeC4ManualLayouts`, `NoMCPServer` for minimization
- Parser works fully in-memory
- But dependencies are still pulled (35 deps for language-server)

## 7. Overall recommendation

### For likec4-mutator the recommendation is: Option B + elements of C

**Strategy: Use `@likec4/language-server` for parsing, custom layer for mutations**

1. **Parsing**: `createLanguageServices()` + `LangiumParser.parse()` gives full AST with CST positions
2. **AST -> Model**: Can use `LikeC4ModelParser` for typed model data
3. **Mutations**: Work at the text edits level (similar to `LikeC4ModelChanges.convertToTextEdit()`)
4. **Serialization**: Use CST node positions for targeted text edits

### Key findings:

1. **Parser is fully reusable** -- both at high level (LikeC4.fromSource) and low level (LangiumParser.parse)
2. **CST nodes are accessible** -- each AST node has `$cstNode` with offset, length, range
3. **AST typing is good** -- interfaces for all ~80 node types
4. **LikeC4ModelChanges** -- there is already a text edit generation mechanism, can be studied and adapted
5. **Dependencies are heavy** -- 188 MB, but when using only language-server for parsing, a tree-shakeable wrapper can be created
6. **Grammar is complex** -- ~200 rules, writing a custom parser from scratch is impractical for full support; for a DSL subset -- possible, but risky due to edge cases

### Risks:
- Langium API may break between versions (currently 3.5.0 in language-server, 4.2.1 installed)
- AST types are not exported as public API -- dependency on internal structure
- Dependency size may be a problem for a CLI utility

### Next steps:
1. Study `LikeC4ModelChanges.convertToTextEdit()` -- how text edits are generated
2. Check whether AST types can be imported via `@likec4/language-server/module`
3. Create proof-of-concept mutator: parse -> modify -> serialize
4. Evaluate whether the parser can be extracted into a separate lightweight package
