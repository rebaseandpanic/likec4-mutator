# Specification: likec4-mutator — a library for programmatic mutation of .c4 files

## Problem

LikeC4 does not have a programmatic API for modifying `.c4` files. Existing tools:
- `LikeC4.fromSource()` / `LikeC4.fromWorkspace()` — read-only
- `@likec4/core/builder` — creates a model from scratch in memory, without serialization to `.c4`
- `likec4 validate` — always returns 0, useless
- `likec4 export json` — export only, not mutation

Currently in the host application we edit `.c4` files via text patching (old_text -> new_text). This works, but:
- The agent must read the entire file and search for anchors to insert
- Easy to break indentation, braces, ordering
- No semantic validation (duplicate IDs, non-existent parent)
- Gets worse as the model grows (currently ~1200 lines in model.c4)

## Solution

The `likec4-mutator` library — parses `.c4` files, provides structured mutation operations, serializes back to `.c4` text while preserving formatting.

## Name

**likec4-mutator** — npm package (TypeScript) or NuGet package (C#).

Recommendation: **TypeScript** — LikeC4 is built on Langium (TypeScript), we can reuse the grammar `like-c4.langium` and AST types from `@likec4/language-server`. Can be called from .NET as a CLI tool.

## Phase 0: Research (MANDATORY before development)

Before writing code, the agent MUST conduct research and document the results.

### 0.1 Research the LikeC4 DSL grammar

- Download and study the grammar file `like-c4.langium` from the [likec4/likec4](https://github.com/likec4/likec4) repository (path: `packages/language-server/src/like-c4.langium`)
- Compile a list of all grammar rules, determine the required subset
- Determine: how complex is the parser? How many rules? Are there non-obvious constructs?

### 0.2 Research existing parsers/tools

- Check npm: are there ready-made parsers for `.c4` / LikeC4 DSL
- Check whether `@likec4/language-server` can be used as a library for parsing (without a full LSP server)
- Check `@likec4/core` — what internal types/interfaces are exported, can they be reused
- Study how Langium parses: can CST (Concrete Syntax Tree) with positions and comments be obtained through the Langium API

### 0.3 Research the serialization problem

- Study [Langium discussion #683](https://github.com/eclipse-langium/langium/discussions/683) about AST -> text serialization
- Check: has `langium-stringify` or an equivalent appeared since that discussion
- Determine approach: reuse Langium CST with positions for preserving formatting, or a custom printer

### 0.4 Study real .c4 files

- Find 5-10 open-source projects on GitHub with `.c4` / `.likec4` files of varying size and complexity
- Study official LikeC4 examples from the [likec4/likec4](https://github.com/likec4/likec4) repository (`examples/`, `docs/` directories)
- Compile a list of all DSL constructs used in the found projects
- Determine which constructs are common, which are rare
- Use these files as test data (`tests/fixtures/external/`)

### 0.5 Approach selection and justification

Based on the research results, make a decision:

| Question | Options |
|----------|---------|
| Language | TypeScript (close to LikeC4) or C# (close to host application) |
| Parser | Custom (for a subset) or Langium-based (full DSL) |
| Serialization | CST-based (preserving formatting) or pretty-print (reformatting) |
| Integration | npm + CLI or NuGet library |

**Research results** should be documented in `docs/research/likec4-mutator-research.md` before starting development. Show the user, wait for approach confirmation.

## Scope — what we support

Supported subset of LikeC4 DSL:

### Elements
- `specification { element kinds, tags, deployments }`
- `model { elements, relationships }`
- `views { view definitions }`
- `deployments { environments, zones, kubernetes, namespaces, instanceOf }`

### Mutation operations

#### Elements (in model)
| Operation | Parameters | What it does |
|-----------|-----------|------------|
| `addElement` | parentFqn, kind, id, title, props | Adds an element inside parent |
| `updateElement` | fqn, props | Updates properties (description, technology, link, tags) |
| `removeElement` | fqn | Removes element and its children |
| `moveElement` | fqn, newParentFqn | Moves element to a different parent |

Props: `{ description?, technology?, link?, tags?, metadata? }`

#### Relationships
| Operation | Parameters | What it does |
|-----------|-----------|------------|
| `addRelationship` | sourceFqn, targetFqn, label, tags? | Adds a relationship |
| `updateRelationship` | sourceFqn, targetFqn, newLabel?, newTags? | Updates an existing one |
| `removeRelationship` | sourceFqn, targetFqn | Removes a relationship |

#### Deployment
| Operation | Parameters | What it does |
|-----------|-----------|------------|
| `addDeploymentNode` | parentPath, kind, id, title, metadata? | Adds namespace/zone/etc |
| `addInstanceOf` | namespacePath, elementFqn, title, metadata? | Adds instanceOf |
| `updateInstanceOf` | namespacePath, elementFqn, metadata | Updates metadata |
| `removeInstanceOf` | namespacePath, elementFqn | Removes instanceOf |

#### Views
| Operation | Parameters | What it does |
|-----------|-----------|------------|
| `addView` | viewId, type, target?, title?, includes[] | Adds a view |
| `updateView` | viewId, title?, includes? | Updates a view |
| `removeView` | viewId | Removes a view |
| `addInclude` | viewId, includeExpr, navigateTo? | Adds an include to a view |

### Reading (query)
| Operation | Parameters | Returns |
|-----------|-----------|--------|
| `getElement` | fqn | Element with children and props |
| `getElementSource` | fqn | Raw DSL text of the element |
| `getRelationships` | sourceFqn? targetFqn? | List of relationships |
| `getDeploymentInstances` | elementFqn | List of instanceOf |
| `listElements` | parentFqn?, kind? | List of elements |

## API (TypeScript)

```typescript
import { LikeC4Mutator } from 'likec4-mutator';

// Load from files
const mutator = LikeC4Mutator.fromFiles({
  spec: '_spec.c4 content',
  model: 'model.c4 content',
  views: 'views.c4 content'
});

// Or from a directory
const mutator = await LikeC4Mutator.fromDirectory('/path/to/c4/files');

// Mutations
mutator.addElement('cloud.services', {
  kind: 'api',
  id: 'myApi',
  title: 'my-api',
  description: 'REST API',
  technology: 'C# / ASP.NET Core 9',
  link: { url: 'https://example.com/my-api', title: 'Repository' },
  tags: ['internal']
});

mutator.addRelationship(
  'cloud.services.myApi',
  'cloud.services.myApi.myDb',
  'EF Core'
);

mutator.addView({
  id: 'myApiView',
  type: 'element',  // element view (viewOf)
  target: 'cloud.services.myApi',
  title: 'My API',
  includes: ['*']
});

// Validation
const errors = mutator.validate();
// []: empty array = all ok
// ['Element cloud.services.myApi already exists']: error

// Serialize back to .c4
const result = mutator.serialize();
// result.model -> updated model.c4
// result.views -> updated views.c4
// result.spec -> updated _spec.c4 (if changed)

// Or write files
await mutator.writeFiles('/path/to/output/');
```

## CLI (for calling from .NET / shell)

```bash
# Add element
likec4-mutator add-element \
  --dir /path/to/c4 \
  --parent cloud.services \
  --kind api \
  --id myApi \
  --title 'my-api' \
  --description 'REST API' \
  --technology 'C# / ASP.NET Core 9' \
  --tag internal \
  --output /path/to/output

# Add relationship
likec4-mutator add-relationship \
  --dir /path/to/c4 \
  --source cloud.services.myApi \
  --target cloud.services.myApi.myDb \
  --label 'EF Core'

# Batch mutation from JSON
likec4-mutator apply \
  --dir /path/to/c4 \
  --mutations mutations.json \
  --output /path/to/output

# Validation
likec4-mutator validate --dir /path/to/c4

# Get element as DSL text
likec4-mutator get-element --dir /path/to/c4 --fqn cloud.services.myApi

# Get element as JSON
likec4-mutator get-element --dir /path/to/c4 --fqn cloud.services.myApi --json
```

### mutations.json — batch mutation format

```json
{
  "mutations": [
    {
      "op": "addElement",
      "parent": "cloud.services",
      "kind": "api",
      "id": "myApi",
      "title": "my-api",
      "props": {
        "description": "REST API",
        "technology": "C# / ASP.NET Core 9",
        "tags": ["internal"],
        "link": { "url": "https://example.com", "title": "Repo" }
      }
    },
    {
      "op": "addElement",
      "parent": "cloud.services.myApi",
      "kind": "database",
      "id": "myDb",
      "title": "PostgreSQL",
      "props": {
        "description": "API data",
        "technology": "PostgreSQL"
      }
    },
    {
      "op": "addRelationship",
      "source": "cloud.services.myApi",
      "target": "cloud.services.myApi.myDb",
      "label": "EF Core"
    },
    {
      "op": "addView",
      "id": "myApiView",
      "type": "element",
      "target": "cloud.services.myApi",
      "title": "My API",
      "includes": ["*"]
    }
  ]
}
```

## Validation (what we check)

### Semantic checks
- Duplicate ID at the same level
- Reference to non-existent parent in addElement
- Reference to non-existent element in relationship
- Reference to non-existent element in instanceOf
- Removing an element that has relationships or instanceOf referencing it
- Unknown element kind (not from specification)
- Unknown tag (not from specification)

### Syntactic checks
- Correctness of generated DSL (parses back without errors)
- Balanced braces
- Correct quotes in strings

## Serialization — requirements

### Preserving formatting
- Existing elements are NOT reformatted — only inserted/modified ones
- Comments are preserved
- Blank lines between blocks are preserved

### Formatting of new elements
- Indent: 2 spaces per nesting level (LikeC4 standard)
- Blank line between elements at the same level
- Relationships are grouped with a comment `// Service Name`

### Insertion point
- New element is added at the end of parent (before the closing `}`)
- New relationship is added at the end of the relationships section
- New view is added at the end of the views file

## Architecture (recommendation)

```
likec4-mutator/
├── src/
│   ├── parser/          # Parsing .c4 -> AST
│   │   ├── lexer.ts     # Tokenization
│   │   ├── parser.ts    # Parsing into AST
│   │   └── types.ts     # AST types
│   ├── mutator/         # Mutation operations on AST
│   │   ├── elements.ts
│   │   ├── relationships.ts
│   │   ├── deployments.ts
│   │   └── views.ts
│   ├── serializer/      # AST -> .c4 text
│   │   └── printer.ts
│   ├── validator/       # Semantic checks
│   │   └── validator.ts
│   ├── query/           # Reading/searching the AST
│   │   └── query.ts
│   ├── cli.ts           # CLI entry point
│   └── index.ts         # Library API
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

### Parsing approach — two options

**Option A: Custom parser (recommended)**
- Parse `.c4` into CST (Concrete Syntax Tree) preserving positions, whitespace, comments
- During serialization — reproduce original text for unchanged parts, format only new/modified
- Parse only the required DSL subset
- Simpler and more predictable than Langium integration

**Option B: Langium-based**
- Reuse the `like-c4.langium` grammar from `@likec4/language-server`
- Full parsing of the entire DSL
- More complex — Langium has no serializer, need to write one on top of AST
- Dependency on LikeC4 internal APIs

## Integration with host application

After publishing the package:

1. Install `likec4-mutator` in the host application Docker image (npm install -g)
2. Replace text patching with CLI calls:
   - `PatchAndCommitAsync` -> `likec4-mutator apply --mutations {...}`
   - `RunValidationAsync` -> `likec4-mutator validate`
3. Add new MCP tools:
   - `AddElement(parentFqn, kind, id, title, props)` -> CLI call
   - `AddRelationship(source, target, label)` -> CLI call
   - `GetElementSource(fqn)` -> CLI call, returns DSL fragment
4. Keep old tools (SaveModelFile, PatchModelFile) for backward compatibility

## Testing

### MANDATORY: full unit test coverage

Every public function of the library MUST have unit tests. Without tests — not accepted.

### Unit tests — parser

For EACH LikeC4 DSL construct a separate test:
- `specification { }` — element kinds, tags, relationship kinds, deployment node kinds, custom colors, styles
- `model { }` — nested elements, elements with description, technology, link, tags, metadata
- All element kinds: organization, product, category, infrastructure, service, api, webapp, bot, worker, exporter, tool, database, cache, queue, storage, external, paymentProvider, vpnProvider
- Relationships: simple, with tags, with technology, with description
- Deployment: environment, zone, kubernetes, namespace, instanceOf with metadata
- Views: view, viewOf, deployment view, include expressions, navigateTo, $include, $style
- Extend blocks: `extend element { }`, `extend model { }`
- Comments: single-line `//`, multi-line `/* */`, inside blocks, between elements
- Metadata: single field, multiple fields, nested
- Links: single link, multiple links, with title and without
- Strings: single quotes, with escape characters, multi-line
- Empty blocks, nesting 5+ levels deep
- Edge cases: trailing comma, trailing whitespace, BOM, Windows line endings (CRLF), Unix (LF)

### Unit tests — mutations

For EACH mutation operation:
- Successful execution
- Error: duplicate ID
- Error: non-existent parent
- Error: non-existent target in relationship
- Removing element with dependent relationships
- Removing element with dependent instanceOf
- Updating a single field without changing the rest
- Adding to an empty parent
- Adding to a parent with existing children

### Unit tests — serialization

- Round-trip: parse -> serialize -> parse -> compare AST (for each construct type)
- Preserving comments after round-trip
- Preserving blank lines between blocks
- Preserving indentation of existing elements
- Correct formatting of ONLY new/modified elements
- Encoding: UTF-8 input -> UTF-8 output

### Unit tests — validation

- Duplicate ID -> error
- Non-existent parent -> error
- Non-existent target in relationship -> error
- Non-existent element kind -> error
- Non-existent tag -> error
- Valid model -> 0 errors
- Empty model -> 0 errors (not an error)

### Test data — MUST be found online

The agent MUST find real `.c4` / `.likec4` files from open-source projects:

1. **Official LikeC4 examples** — repository [likec4/likec4](https://github.com/likec4/likec4), `examples/` and `docs/` directories — they contain demo models
2. **GitHub search** — search for `*.c4` and `*.likec4` files on GitHub, find 5-10 different projects with models of varying size and complexity
3. **LikeC4 playground examples** — the likec4.dev website has examples, extract the DSL
4. **Structurizr DSL examples** — LikeC4 is compatible with a subset of Structurizr DSL, find large models

Copy all found files to `tests/fixtures/external/` with source attribution (URL, license).

### Stress test generation

Write a generator `tests/generators/generate-large-model.ts` that creates `.c4` files with:

| Scenario | Parameters | Purpose |
|----------|-----------|---------|
| Many elements | 500+ elements of different kinds | Parser performance testing |
| Deep nesting | 10+ nesting levels | Parser/serializer edge case |
| Many relationships | 1000+ relationships | Verify parser is not O(n^2) |
| Many deployments | 50+ namespaces, 200+ instanceOf | Realistic production scenario |
| Many views | 100+ views with different include patterns | Parsing complex view expressions |
| All constructs | Every element type, every relationship type, every metadata type | Full DSL coverage |
| Large file | 10000+ lines | Single file with maximum of everything |
| Many comments | Comments between every block + inline | Preservation during round-trip |
| Unicode | Names in Russian, Chinese, emoji in description | Correct UTF-8 handling |
| Edge cases | Empty descriptions, metadata without fields, element without children | Edge cases |

The generator must create valid `.c4` files that pass `likec4 export json`.

### Integration tests

- Take real .c4 files (model.c4, views.c4, _spec.c4) from `tests/fixtures/`
- Apply a series of mutations (add 10 services, add relationships, add views)
- Verify that the result is parsed by `likec4 export json` without errors
- Compare element count in the export (should increase by 10)
- Round-trip all found external files
- Round-trip generated large files

### Performance tests

- Parsing a 10000-line file — measure time, should be < 1 second
- 100 sequential mutations — measure time
- Serialization after 100 mutations — measure time
- Record results in `tests/benchmarks/`

### Test data
- Use `.c4` files from `tests/fixtures/`
- This is ~1700 lines of real model for smoke tests

## Acceptance criteria

1. `likec4-mutator validate` on test files — 0 errors
2. Round-trip (parse -> serialize) of test files — identical result (or minimal whitespace differences)
3. `addElement` + `addRelationship` + `addView` -> result passes `likec4 export json`
4. CLI works, can be called from .NET via `Process.Start`
5. npm package published on npmjs.com or GitHub Packages
6. README with API and CLI examples
