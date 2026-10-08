# likec4-mutator

[![npm version](https://img.shields.io/npm/v/likec4-mutator)](https://www.npmjs.com/package/likec4-mutator)
[![npm downloads](https://img.shields.io/npm/dm/likec4-mutator)](https://www.npmjs.com/package/likec4-mutator)
[![node](https://img.shields.io/node/v/likec4-mutator)](https://www.npmjs.com/package/likec4-mutator)
[![license](https://img.shields.io/npm/l/likec4-mutator)](./LICENSE)

TypeScript library + CLI for programmatic mutation of LikeC4 `.c4` files. Parses `.c4` via `@likec4/language-server` (Langium), mutates through CST-position-based text replacement, serializes back preserving formatting.

## Installation

Requires Node.js >= 22.22.3 (the minimum supported by `@likec4/language-server`).

```bash
npm install likec4-mutator      # library
npx likec4-mutator --help        # CLI
```

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

// Update element (only specified fields are changed).  tags / links / metadata
// apply to the effective values, including `extend` blocks — see "`extend` blocks".
const { changedFiles } = mutator.updateElement('app.db', {
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

// Update an existing relationship (=> { changedFiles })
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

Update properties of an existing element. Only the flags you provide are changed; all other properties are left intact. `--tags` replaces all tags of the element, including those added by `extend` blocks (see [`extend` blocks](#extend-blocks)). Every loaded file is written to the output directory.

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

Remove a relationship matched by source and target FQN (searched across all files), together with `extend a -> b` blocks that applied only to it.

```bash
likec4-mutator remove-relationship --dir ./c4 --source app.api --target app.db --output ./out
```

### apply

Apply a batch of mutations from a JSON file. This is the most powerful command — supports all 7 operations with all properties.

```bash
# Write to a separate output directory
likec4-mutator apply --dir ./c4 --mutations mutations.json --output ./out

# Overwrite source files in-place
likec4-mutator apply --dir ./c4 --mutations mutations.json --in-place
```

### Batch mutations format

The JSON file contains a `mutations` array. Each mutation has an `op` field and operation-specific parameters. Fields not listed for an op below (including inside `style` and `links` entries), and top-level keys other than `mutations`, are rejected before any `.c4` file is touched, so a misspelled field such as `tag` fails the command instead of being silently ignored.

The whole file is validated before any mutation is applied: a missing required field or a value of the wrong type (e.g. `"tags": "internal"` instead of `["internal"]`) aborts with exit code 1 and an error naming its location, e.g. `mutations[2].links[0].url`. Nothing is written in that case.

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

Updates properties of an existing element.  Only specified fields are changed.  `tags`, `links` and `metadata` apply to the effective values, including contributions of `extend` blocks (see [`extend` blocks](#extend-blocks)).

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

Updates fields on an existing relationship.  Required: `op`, `source`, `target`, plus at least one update field.  When more than one relation matches `source`/`target`, supply `matchKind` and/or `matchTitle` to disambiguate.  `label`, `tags`, `links` and `metadata` also apply to `extend a -> b { ... }` blocks of the relationship (see [Relationships](#relationships)).

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

Removes a relationship between two elements (matched by absolute source and target FQN, across all files; the reference text as written is accepted as a fallback).

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

## `extend` blocks

An element can get tags, links and metadata from `extend X { ... }` blocks, in the same or other files:

```
// base.c4
model {
  app = service 'App' {
    #internal
    metadata { owner 'team-a' }
  }
}

// ext/ops.c4
model {
  extend app {
    #critical
    link https://runbooks.example.com/app 'Runbook'
    metadata { owner 'ops' }
  }
}
```

### Reading

`getElement` / `listElements` report the **effective** `tags`, `links` and `metadata` — what LikeC4 itself builds for the element — plus their provenance:

```typescript
const app = mutator.getElement('app')!;
app.tags;        // ['internal', 'critical']
app.links;       // [{ url: 'https://runbooks.example.com/app', label: 'Runbook' }]
app.metadata;    // { owner: ['team-a', 'ops'] }
app.declared;    // { tags: ['internal'], metadata: { owner: 'team-a' } } — the declaration body only
app.extendedBy;  // [{ file: 'ext/ops.c4', sourceRange: {...}, tags: ['critical'], links: [...], metadata: { owner: 'ops' } }]
```

Merge rules (LikeC4 1.59.4):

- The declaration body comes first, then every `extend` block of exactly this element — files ordered by path the way LikeC4 orders documents (natural and segment by segment: `a/x.c4` before `a.c4`, `ext9.c4` before `ext10.c4`; independent of the order passed to `fromFiles`), then source order within a file.
- `tags`: union without duplicates. Within one body, comma-separated groups (`#a, #b #c`) are taken last group first, as LikeC4 does (`['b', 'c', 'a']`); `declared` and `extendedBy` list them in source order.
- `links`: concatenated; duplicates are kept.
- `metadata`: every value of a key is collected (a key repeated inside one block too); when a key appears in more than one body, duplicate values are dropped. A key with one value maps to a string — also when written as `key ['v1']` — otherwise to an array. `declared` and `extendedBy` keep the form as written.
- Only the first `metadata { ... }` block of a body counts, as in LikeC4 — for the effective values, `declared`, `extendedBy` and relationship metadata alike. Later blocks are ignored, even when the first block is empty.
- Values are normalized as LikeC4 does: metadata values are dedented and trimmed and empty ones dropped (`k '  x  '` reads as `'x'`, `k ''` not at all); a link label is dedented, trimmed and joined into one line, an empty label is dropped. `declared` and `extendedBy` keep strings as written.
- `getElementSource` and `sourceRange` still refer to the declaration; each `extendedBy` entry carries the range of its block. Blocks that only declare nested elements, or nothing, are listed too.
- File names must denote distinct paths: `fromFiles({ 'a.c4': ..., './a.c4': ... })` throws.
- A standalone `new C4Query(ast)` merges only the `extend` blocks of that document and reports them without `file`; pass a `WorkspaceIndex` built from `{ file, ast }` documents for the whole project.
- A workspace with syntax errors is read best effort: what the parser recovers is merged.
- Relationships have `extend a -> b { ... }` blocks with their own matching and merge rules — see [Relationships](#relationships).

### Writing

`updateElement` keeps its documented semantics for the effective values:

| Patch | Declaration body | Every `extend X { ... }` of exactly this element, in every file |
| --- | --- | --- |
| `title`, `summary`, `description`, `technology`, `style` | updated as before | untouched (the grammar does not allow them there) |
| `tags: [...]` / `tags: []` | replaced / removed | tags removed |
| `links: [...]` / `links: []` | replaced / removed | links removed |
| `metadata: { k: value }` | `k` upserted | `k` removed |
| `metadata: { k: null }` | `k` removed | `k` removed |
| metadata keys not in the patch | kept verbatim | kept verbatim |

```typescript
mutator.updateElement('app', { tags: ['internal'], metadata: { owner: 'platform' } });
// base.c4:    #internal, metadata { owner 'platform' }
// ext/ops.c4: extend app { link https://runbooks.example.com/app 'Runbook' }
// => { changedFiles: ['base.c4', 'ext/ops.c4'] }
```

- New values always go into the declaration; `extend` blocks only lose the patched properties / keys. Nested elements, relationships, comments and other keys in the blocks are kept; a block that ends up empty (`extend app { }`) stays in place — remove it by hand if you do not want it.
- Extend blocks of descendants (`extend app.api`) are not touched by `updateElement('app', ...)`.
- A body may hold several `metadata { ... }` blocks; LikeC4 reads only the first. A patched key is upserted into the first block and removed from every block of the declaration and of the `extend` blocks. A block left without attributes is removed — except a first block while a later block of the same body still has attributes: it stays as an empty `metadata { }`, so the later block does not start counting. `updateRelationship` handles a relationship's blocks the same way.
- After the update, reading the element returns what LikeC4 makes of the written value: e.g. `metadata: { k: ['v1'] }` reads back as `k: 'v1'` (`declared` keeps `['v1']`).
- `updateElement` returns `{ changedFiles }`: the files whose text changed, in load order (`[]` when nothing changed). It describes the in-memory state — use it to save only those files from `serialize()`.
- An update of `tags`, `links` or `metadata` is rejected, before anything changes, while any loaded file has syntax errors (`validate()` is not empty): an `extend` block in that file could not be found reliably. Other properties can still be updated.
- The update is atomic in memory: when any file's edit fails, all files are restored. Writing files to disk (e.g. the CLI's `--output` / `--in-place`) happens file by file and is not atomic.
- `removeElement` deletes every `extend` block of the element's subtree; `addElement` and `generateElement` write only the new declaration — `extend` blocks that already target the new FQN start contributing once it exists.

### Relationships

A relationship can get tags, links and metadata from `extend a -> b { ... }` blocks (only directly in a `model` block):

```
// base.c4
model {
  api -[calls]-> db 'reads' {
    metadata { sla '99.9%' }
  }
}

// ext/ops.c4
model {
  extend api -[calls]-> db 'reads' {
    #critical
    metadata { owner 'ops' }
  }
}
```

`getRelationships()` reports effective `tags`, `links` and `metadata`, `declared` and `extendedBy`, as for elements. LikeC4 1.59.4 decides which relationships a block applies to, and merges, as follows:

- A block applies to every relationship with the same source and target (resolved to FQNs), kind, title and direction. No kind matches only relationships without a kind (`-[calls]->` and `.calls` are the same kind). Titles are compared dedented and trimmed; the title may be written after the target or as a `title` body property, and a relationship without a title is compared with the `title` of its kind's specification when that declares one. A bidirectional block (`extend b <-> a`) matches `a <-> b`; a directed block never matches a bidirectional relationship.
- The relationship's own values come first — its tags are those written on the relation line (`a -> b 'x' #t`) or else those of its body — then every matching block in the order used for elements.
- `tags` and `metadata` merge as for elements. `links` differ: a block's link is skipped when a link with the same url and label is already present; the relationship's own duplicates are kept.
- Spec defaults of a relationship kind (its tags and links) are not merged, neither for relationships nor for elements.

`updateRelationship` treats these blocks like `updateElement` treats `extend X` blocks — same table and rules (new values go into the relationship; patched tags, links and metadata keys leave every matching block in every file; empty blocks stay; rejected while a file has syntax errors; atomic in memory) — and returns `{ changedFiles }`. In addition:

- The title identifies the relationship for its blocks, so a `label` that changes the title is written into every matching block as well (`extend api -[calls]-> db 'queries' { ... }`); otherwise they would stop applying.
- A block applies to every relationship with the same identity (e.g. `a -> b 'x'` and `a -> b { title 'x' }`). When an update would change such a shared block, it is rejected before anything changes, because the other relationship would change too.
- `removeRelationship` also removes the blocks that applied to the removed relationship and apply to no remaining one (they would match nothing). `removeElement` removes, besides those of the relationships it removes, every block whose source or target is in the removed subtree. Blocks that matched nothing before are left alone.

## How it works

1. **Parse** — `.c4` source → AST + CST via `@likec4/language-server` (Langium standalone, no LSP)
2. **Query** — find elements by FQN, walk AST, build index
3. **Mutate** — compute text edits from CST positions (`$cstNode.offset`/`end`)
4. **Apply** — splice edits into source text (end → start to preserve offsets)
5. **Reparse** — verify result is valid `.c4`

## Build

```bash
npm install
npm run build    # tsdown → ESM + TypeScript declarations
npm test         # vitest
npm run lint     # tsc --noEmit
```

## License

MIT
