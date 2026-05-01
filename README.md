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
  metadata: {
    owner: 'platform-team',
    env: 'production',
    keywords: ['internal', 'critical'], // array values are supported
  },
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
  title: 'Updated Title',             // REPLACE
  summary: 'Updated summary',         // REPLACE
  description: 'Updated description', // REPLACE
  technology: 'PostgreSQL 17',        // REPLACE
  tags: ['deprecated'],               // REPLACE (v0.4.0 BREAKING — was append). Empty [] clears all tags.
  links: [{ url: 'https://new.link' }], // REPLACE.  Empty [] clears all links.
  metadata: {                         // MERGE + null-deletion
    team: 'backend',                  //   upsert (string)
    keywords: ['core', 'critical'],   //   upsert (array)
    deprecated: null,                 //   delete the key
  },
  style: { color: 'red' },            // MERGE per-field (v0.4.0 BREAKING — was full replace)
});

// Update an existing relationship
mutator.updateRelationship(
  { source: 'app', target: 'app.db' },
  {
    label: 'persists',
    description: 'Reads and writes user data',
    technology: 'JDBC',
    tags: ['internal'],                                  // REPLACE
    links: [{ url: 'https://docs.example.com/db' }],     // REPLACE
    metadata: { sla: '99.9%', owner: null },             // MERGE + null-delete
    style: { line: 'dashed', color: 'red' },             // MERGE per-field
  },
);

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
    "version": "v2",
    "keywords": ["internal", "critical"]
  }
}
```

#### updateElement

Updates properties of an existing element.  Only specified fields are changed.

| Field | Semantics |
| --- | --- |
| `title`, `summary`, `description`, `technology` | REPLACE |
| `tags` | REPLACE (v0.4.0 BREAKING — was append).  `[]` clears all tags. |
| `links` | REPLACE.  `[]` clears all links. |
| `metadata` | MERGE.  Map a key to `null` to delete it; map to a string or `string[]` to upsert.  Keys absent from the patch are preserved verbatim (including original array formatting). |
| `style` | MERGE per-field (v0.4.0 BREAKING — was full replace).  Pass a complete style object to reproduce the old replace-all behaviour. |

```json
{
  "op": "updateElement",
  "fqn": "app.api",
  "title": "Updated Title",
  "description": "Updated description",
  "technology": "Go / Fiber",
  "tags": ["deprecated"],
  "links": [{ "url": "https://migration.example.com", "label": "Migration Guide" }],
  "metadata": {
    "team": "backend",
    "keywords": ["internal", "critical"],
    "deprecatedKey": null
  },
  "style": { "color": "red", "border": "dashed" }
}
```

#### updateRelationship

Updates fields on an existing relationship.  Required: `op`, `source`, `target`, plus at least one update field.  When more than one relation matches `source`/`target`, supply `matchKind` and/or `matchTitle` to disambiguate.

| Field | Semantics |
| --- | --- |
| `label`, `description`, `technology` | REPLACE |
| `tags` | REPLACE.  `[]` clears all tags. |
| `links` | REPLACE.  `[]` clears all links. |
| `metadata` | MERGE with `null`-deletion (same as `updateElement`). |
| `style` | MERGE per-field. |

```json
{
  "op": "updateRelationship",
  "source": "app.api",
  "target": "app.db",
  "matchTitle": "reads/writes",
  "label": "persists",
  "description": "Reads and writes user data",
  "technology": "JDBC",
  "tags": ["internal"],
  "links": [{ "url": "https://docs.example.com/db" }],
  "metadata": { "sla": "99.9%", "deprecatedOwner": null },
  "style": { "line": "dashed", "color": "red" }
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
  "metadata": { "sla": "99.9%", "owners": ["platform", "data"] },
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
    { "op": "updateRelationship", "source": "app.gateway", "target": "app.api", "matchTitle": "proxies", "metadata": { "sla": "99.9%" } },
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
| tags | string[] | yes | yes (replace) | `#tagname` |
| links | {url, label?}[] | yes | yes (replace) | `link url 'label'` |
| style | ElementStyle | yes | yes (merge per-field) | `style { shape ... }` |
| metadata | `Record<string, string \| string[]>` | yes | yes (merge, `null` deletes a key) | `metadata { key 'val' }` or `metadata { key ['v1', 'v2'] }` |

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

| Property | Type | addRelationship | updateRelationship | DSL syntax |
|----------|------|:---------------:|:------------------:|------------|
| label | string | yes | yes (replace) | `-> target 'label'` |
| description | string | yes | yes (replace) | `description 'text'` |
| technology | string | yes | yes (replace) | `technology 'text'` |
| tags | string[] | yes | yes (replace) | `#tagname` |
| links | {url, label?}[] | yes | yes (replace) | `link url 'label'` |
| metadata | `Record<string, string \| string[]>` | yes | yes (merge, `null` deletes a key) | `metadata { key 'val' }` or `metadata { key ['v1', 'v2'] }` |
| style | RelationshipStyle | yes | yes (merge per-field) | `style { line ... }` |

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
