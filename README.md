# likec4-mutator

TypeScript library + CLI for programmatic mutation of LikeC4 `.c4` files. Parses `.c4` via `@likec4/language-server` (Langium), mutates through CST-position-based text replacement, serializes back preserving formatting.

## Library API

```typescript
import { LikeC4Mutator } from 'likec4-mutator';

const mutator = LikeC4Mutator.fromFiles({
  'model.c4': `
specification {
  element service
  element database
}
model {
  app = service 'My App'
}
views {
  view index {
    include *
  }
}
`});

// Query
const el = mutator.getElement('app');
const all = mutator.listElements({ kind: 'service' });
const rels = mutator.getRelationships({ sourceFqn: 'app' });
const source = mutator.getElementSource('app');
const spec = mutator.getSpecification();

// Add element (all properties)
mutator.addElement('app', {
  name: 'db',
  kind: 'database',
  title: 'PostgreSQL',
  summary: 'Primary data store',
  description: 'Main database for user and transaction data',
  technology: 'PostgreSQL 16',
  tags: ['internal', 'critical'],
  links: [
    { url: 'https://docs.example.com/db', label: 'DB Docs' },
    { url: 'https://github.com/example/db' },
  ],
  style: {
    shape: 'cylinder',
    color: 'blue',
    icon: 'tech:postgresql',
    opacity: '80%',
    border: 'dashed',
  },
  metadata: { owner: 'platform-team', env: 'production' },
});

// Add relationship (all properties)
mutator.addRelationship('app', 'app.db', 'reads/writes', {
  description: 'Queries the main database',
  technology: 'JDBC',
  tags: ['internal'],
  links: [{ url: 'https://docs.example.com/db', label: 'DB Docs' }],
  metadata: { sla: '99.9%' },
  style: { line: 'dashed', color: 'red', head: 'diamond', tail: 'none' },
});

// Add view
mutator.addView({
  id: 'appView',
  type: 'element',    // 'element' | 'dynamic' | 'deployment'
  target: 'app',
  title: 'App Overview',
  includes: ['*'],
});

// Update element (only specified fields are changed)
mutator.updateElement('app.db', {
  title: 'Updated Title',             // replaces existing
  summary: 'Updated summary',         // replaces existing
  description: 'Updated description', // replaces existing
  technology: 'PostgreSQL 17',        // replaces existing
  tags: ['deprecated'],               // inserted (appended)
  links: [{ url: 'https://new.link' }], // inserted (appended)
  metadata: { team: 'backend' },      // inserted (appended)
  style: { color: 'red' },            // inserted (appended)
});

// Remove
mutator.removeElement('app.db');
mutator.removeRelationship('app', 'app.db');

// Validate & serialize
const errors = mutator.validate(); // [] = valid
const files = mutator.serialize(); // { 'model.c4': '...' }
```

## CLI

### validate

Parse and validate all `.c4` files. Exits with code 0 if valid, 1 if errors found.

```bash
likec4-mutator validate --dir ./c4
```

### list-elements

List elements with optional filtering by kind or parent FQN.

```bash
likec4-mutator list-elements --dir ./c4
likec4-mutator list-elements --dir ./c4 --kind service
likec4-mutator list-elements --dir ./c4 --parent app
likec4-mutator list-elements --dir ./c4 --json
```

### get-element

Get a single element by fully qualified name (FQN).

```bash
# Human-readable output
likec4-mutator get-element --dir ./c4 --fqn app.api

# JSON output
likec4-mutator get-element --dir ./c4 --fqn app.api --json

# Raw DSL source text
likec4-mutator get-element --dir ./c4 --fqn app.api --source
```

### add-element

Add a new element as a child of an existing element. Supports summary and tags directly via CLI flags. For full property support (links, metadata, style), use the `apply` command with JSON.

```bash
likec4-mutator add-element --dir ./c4 \
  --parent app \
  --kind service \
  --id myApi \
  --title 'My API' \
  --summary 'Short label shown on diagrams' \
  --description 'REST API' \
  --technology 'TypeScript' \
  --tags internal,backend \
  --output ./out
```

### add-relationship

Add a relationship between two elements. For full property support (description, technology, tags, style), use the `apply` command with JSON.

```bash
likec4-mutator add-relationship --dir ./c4 \
  --source app.myApi \
  --target app.db \
  --label 'reads/writes' \
  --output ./out
```

### update-element

Update properties of an existing element. Only the flags you provide are changed; all other properties are left intact.

```bash
likec4-mutator update-element --dir ./c4 --fqn app.api \
  --title 'New Title' \
  --description 'New description' \
  --technology 'Go' \
  --summary 'Updated summary' \
  --tags deprecated,legacy \
  --output ./out
```

### remove-element

Remove an element (and its entire body block) from the model.

```bash
likec4-mutator remove-element --dir ./c4 --fqn app.api --output ./out
```

### remove-relationship

Remove a relationship matched by exact source and target identifiers.

```bash
likec4-mutator remove-relationship --dir ./c4 --source app.api --target app.db --output ./out
```

### apply

Apply a batch of mutations from a JSON file. This is the most powerful command — supports all 6 operations with all properties.

```bash
# Write to a separate output directory
likec4-mutator apply --dir ./c4 --mutations mutations.json --output ./out

# Overwrite source files in-place
likec4-mutator apply --dir ./c4 --mutations mutations.json --in-place
```

### Batch mutations format

The JSON file contains a `mutations` array. Each mutation has an `op` field and operation-specific parameters.

#### addElement

Adds a new element inside a parent. All fields except `op`, `parent`, `kind`, `id`, `title` are optional.

```json
{
  "op": "addElement",
  "parent": "app",
  "kind": "service",
  "id": "newApi",
  "title": "New API",
  "summary": "Short description for diagram",
  "description": "Detailed description",
  "technology": "TypeScript / Express",
  "tags": ["internal", "backend"],
  "links": [
    { "url": "https://github.com/example/api", "label": "Repository" },
    { "url": "https://docs.example.com/api" }
  ],
  "style": {
    "shape": "rectangle",
    "color": "blue",
    "icon": "tech:typescript",
    "opacity": "80%",
    "border": "solid",
    "multiple": false,
    "size": "md",
    "padding": "sm",
    "textSize": "md",
    "iconPosition": "top",
    "iconColor": "blue",
    "iconSize": "sm"
  },
  "metadata": {
    "owner": "platform-team",
    "version": "v2"
  }
}
```

#### updateElement

Updates properties of an existing element. Only specified fields are changed. `title`, `summary`, `description`, `technology` replace existing values. `tags`, `links`, `metadata`, `style` are appended.

```json
{
  "op": "updateElement",
  "fqn": "app.api",
  "title": "Updated Title",
  "description": "Updated description",
  "technology": "Go / Fiber",
  "tags": ["deprecated"],
  "links": [{ "url": "https://migration.example.com", "label": "Migration Guide" }],
  "metadata": { "team": "backend" },
  "style": { "color": "red", "border": "dashed" }
}
```

#### removeElement

Removes an element and all its children.

```json
{
  "op": "removeElement",
  "fqn": "app.oldService"
}
```

#### addRelationship

Adds a relationship between two elements. All fields except `op`, `source`, `target` are optional.

```json
{
  "op": "addRelationship",
  "source": "app.api",
  "target": "app.db",
  "label": "reads/writes",
  "description": "Queries user data",
  "technology": "JDBC",
  "tags": ["internal"],
  "links": [{ "url": "https://docs.example.com/db", "label": "DB Docs" }],
  "metadata": { "sla": "99.9%" },
  "style": {
    "line": "dashed",
    "color": "red",
    "head": "diamond",
    "tail": "none"
  }
}
```

#### removeRelationship

Removes a relationship between two elements (matched by exact source and target FQN).

```json
{
  "op": "removeRelationship",
  "source": "app.api",
  "target": "app.oldService"
}
```

#### addView

Adds a new view. Type can be `element`, `dynamic`, or `deployment`.

```json
{
  "op": "addView",
  "id": "apiView",
  "type": "element",
  "target": "app.api",
  "title": "API Overview"
}
```

### Full batch example

```json
{
  "mutations": [
    { "op": "addElement", "parent": "app", "kind": "service", "id": "gateway", "title": "API Gateway", "description": "Routes requests", "technology": "nginx" },
    { "op": "addRelationship", "source": "app.gateway", "target": "app.api", "label": "proxies" },
    { "op": "updateElement", "fqn": "app.api", "technology": "Go / Fiber" },
    { "op": "addView", "id": "gatewayView", "type": "element", "target": "app.gateway", "title": "Gateway" },
    { "op": "removeRelationship", "source": "app.api", "target": "app.legacy" },
    { "op": "removeElement", "fqn": "app.legacy" }
  ]
}
```

## Supported properties reference

### Element properties

| Property | Type | addElement | updateElement | DSL syntax |
|----------|------|:----------:|:-------------:|------------|
| title | string | yes | yes (replace) | `= kind 'Title'` |
| summary | string | yes | yes (replace) | `summary 'text'` |
| description | string | yes | yes (replace) | `description 'text'` |
| technology | string | yes | yes (replace) | `technology 'text'` |
| tags | string[] | yes | yes (append) | `#tagname` |
| links | {url, label?}[] | yes | yes (append) | `link url 'label'` |
| style | ElementStyle | yes | yes (append) | `style { shape ... }` |
| metadata | Record<string,string> | yes | yes (append) | `metadata { key 'val' }` |

### Element style properties

| Property | Values |
|----------|--------|
| shape | rectangle, person, browser, mobile, cylinder, storage, queue, bucket, document |
| color | primary, secondary, muted, slate, blue, indigo, sky, red, gray, green, amber |
| icon | Library icons (`tech:postgresql`, `aws:lambda`) or URL |
| opacity | Percentage (`40%`, `100%`) |
| border | solid, dashed, dotted, none |
| multiple | true, false |
| size | xs, sm, md, lg, xl |
| padding | xs, sm, md, lg, xl |
| textSize | xs, sm, md, lg, xl |
| iconPosition | left, right, top, bottom |
| iconColor | Theme colors |
| iconSize | xs, sm, md, lg, xl |

### Relationship properties

| Property | Type | addRelationship | DSL syntax |
|----------|------|:---------------:|------------|
| label | string | yes | `-> target 'label'` |
| description | string | yes | `description 'text'` |
| technology | string | yes | `technology 'text'` |
| tags | string[] | yes | `#tagname` |
| links | {url, label?}[] | yes | `link url 'label'` |
| metadata | Record<string,string> | yes | `metadata { key 'val' }` |
| style | RelationshipStyle | yes | `style { line ... }` |

### Relationship style properties

| Property | Values |
|----------|--------|
| line | solid, dashed, dotted |
| color | Theme colors |
| head | normal, onormal, diamond, odiamond, crow, open, vee, dot, odot, none |
| tail | Same as head |

## How it works

1. **Parse** — `.c4` source → AST + CST via `@likec4/language-server` (Langium standalone, no LSP)
2. **Query** — find elements by FQN, walk AST, build index
3. **Mutate** — compute text edits from CST positions (`$cstNode.offset`/`end`)
4. **Apply** — splice edits into source text (end → start to preserve offsets)
5. **Reparse** — verify result is valid `.c4`

## Build

```bash
npm install
npm run build    # tsup → ESM + TypeScript declarations
npm test         # vitest
npm run lint     # tsc --noEmit
```

## License

MIT
