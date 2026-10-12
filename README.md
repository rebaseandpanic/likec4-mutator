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
  tag internal
  tag critical
  tag deprecated
}
model {
  app = service 'My App' {
    api = service 'API'
  }
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
mutator.addRelationship('app.api', 'app.db', 'reads/writes', {
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
  includes: ['*'],     // one `include` rule per item; a leading `include` keyword is stripped
});

// Update element (only specified fields are changed).  tags / links / metadata
// apply to the effective values, including `extend` blocks — see "`extend` blocks".
const { changedFiles } = mutator.updateElement('app.db', {
  title: 'Updated Title',             // REPLACE
  summary: 'Updated summary',         // REPLACE
  description: 'Updated description', // REPLACE
  technology: 'PostgreSQL 17',        // REPLACE
  tags: ['deprecated'],               // REPLACE (v0.4.0 BREAKING — was append). Empty [] clears own and extend tags.
  links: [{ url: 'https://new.link' }], // REPLACE.  Empty [] clears own and extend links.
  metadata: {                         // MERGE + null-deletion
    team: 'backend',                  //   upsert (string)
    keywords: ['core', 'critical'],   //   upsert (array)
    deprecated: null,                 //   delete the key
  },
  style: { color: 'red' },            // MERGE per-field (v0.4.0 BREAKING — was full replace)
});

// Update an existing relationship (=> { changedFiles })
mutator.updateRelationship(
  { source: 'app.api', target: 'app.db' },
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
mutator.removeRelationship('app.api', 'app.db');
mutator.removeElement('app.db');

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
| `title`, `summary`, `description`, `technology` | REPLACE.  Every declaration is rewritten (a body may repeat a property; LikeC4 reads the last one).  A summary or technology written after the title (`name = kind 'title' 'summary' 'technology'`) is what LikeC4 reads, so it is replaced there; an empty summary no longer overrides the body and is written into the body as well. |
| `tags` | REPLACE (v0.4.0 BREAKING — was append).  `[]` clears all tags written for it (kind defaults still apply, see [Specification defaults](#specification-defaults)). |
| `links` | REPLACE.  `[]` clears all links written for it (the kind links then apply). |
| `metadata` | MERGE.  Map a key to `null` to delete it; map to a string or `string[]` to upsert.  Keys absent from the patch are preserved verbatim (including original array formatting), and so are comments in the block: patched keys are edited in place, new keys added at the end of the block.  A value with line breaks is written as a Markdown string (see [Multi-line metadata values](#multi-line-metadata-values)). |
| `style` | MERGE per-field (v0.4.0 BREAKING — was full replace).  Pass a complete style object to reproduce the old replace-all behaviour.  The first `style { }` block of the body (the one LikeC4 reads) is edited in place: a patched field gets its new value wherever the block declares it, a missing field is added at the end of the block, and other fields, comments, `:` / `;` separators and indentation keep their text. |

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
| `label`, `description`, `technology` | REPLACE.  Every body declaration is rewritten (a body may repeat a property; LikeC4 reads the last one).  A description or technology written after the title (`a -> b 'title' 'description' 'technology'`) is what LikeC4 reads, so it is replaced there; an empty description no longer overrides the body and is written into the body as well. |
| `tags` | REPLACE.  `[]` clears all tags written for it (kind defaults still apply, see [Specification defaults](#specification-defaults)). |
| `links` | REPLACE.  `[]` clears all links written for it (the kind links then apply). |
| `metadata` | MERGE with `null`-deletion (same as `updateElement`). |
| `style` | MERGE per-field, in place (same as `updateElement`). |

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

Adds a new view. Type can be `element`, `dynamic`, or `deployment`. Required: `op`, `id`, `type`; `target`, `title` and `includes` are optional.

```json
{
  "op": "addView",
  "id": "apiView",
  "type": "element",
  "target": "app.api",
  "title": "API Overview",
  "includes": ["*", "app.db", "app.api -> app.db"]
}
```

`includes` is an array of strings; each item becomes one `include` rule of the view, in order. An item is what follows the keyword: one or more comma-separated predicates, as LikeC4 accepts them after `include` (`"*"`, `"app.db"`, `"app.*, app.api -> app.db"`). One leading `include` keyword followed by whitespace is stripped, so `"include *"` writes `include *`, not `include include *` (`"include*"` is not stripped and is rejected); surrounding whitespace is trimmed. Each item must form exactly one `include` rule of the view's type: an item that is empty or only `include`, that LikeC4 cannot parse, or that would add anything beyond that rule (another rule such as `"* exclude x"` or `"*\n autoLayout LeftRight"`, a view property, or another view) is rejected before any file is touched (exit code 1, path `mutations[i].includes[j]`). Without `includes` (or with `[]`) an element view gets `include *` and other view types get no include rule. The library's `addView({ includes })` handles items the same way and throws on such an item.

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

Which LikeC4 DSL constructs the library can read, add, update and remove — rule by rule of the LikeC4 grammar, including what is not supported yet — is listed in the [DSL coverage matrix](docs/likec4-coverage.md).

### Element properties

| Property | Type | addElement | updateElement | DSL syntax |
|----------|------|:----------:|:-------------:|------------|
| title | string | yes | yes (replace) | `= kind 'Title'` |
| summary | string | yes | yes (replace) | `summary 'text'` or `= kind 'Title' 'summary'` |
| description | string | yes | yes (replace) | `description 'text'` |
| technology | string | yes | yes (replace) | `technology 'text'` or `= kind 'Title' 'summary' 'technology'` |
| tags | string[] | yes | yes (replace) | `#tagname` |
| links | {url, label?}[] | yes | yes (replace) | `link url 'label'` |
| style | ElementStyle | yes | yes (merge per-field) | `style { shape ... }` |
| metadata | `Record<string, string \| string[]>` | yes | yes (merge, `null` deletes a key) | `metadata { key 'val' }` or `metadata { key ['v1', 'v2'] }` |

`getElement`, `listElements` and `getRelationships` report `title`, `summary`, `description` and `technology` as LikeC4 reads them: common indentation removed and trimmed, a technology written inline (`= kind 'Title' 'summary' 'technology'`, `-> target 'label' 'description' 'technology'`) joined into one line, a Markdown string (`'''...'''`) as its content. `summary '  text  '` reads as `'text'`; a whitespace-only Markdown summary or description reads as `''`; an empty Markdown `title` or `technology` is no value.

### Multi-line metadata values

A metadata value (or array item) with line breaks — YAML, JSON, any multi-line text — is written as a LikeC4 Markdown string, one level deeper than its key, wherever the library writes metadata (`addElement`, `addRelationship`, `updateElement`, `updateRelationship`):

```typescript
mutator.updateElement('app', { metadata: { manifest: 'apiVersion: v1\nkind: Deployment' } });
```

```
    metadata {
      manifest '''
        apiVersion: v1
        kind: Deployment
      '''
    }
```

LikeC4 (and the library) read it back as the value written.  As for any metadata value, LikeC4 removes the indentation shared by all lines and trims the value, so leading and trailing whitespace and common indentation are not kept.  Line breaks are written as the file's line ending, so in a file with CRLF line endings the value reads back with `\r\n` line breaks.  A value without line breaks stays a single-quoted string.

### Element style properties

| Property | Values |
|----------|--------|
| shape | rectangle, component, person, browser, mobile, cylinder, storage, queue, bucket, document |
| color | primary, secondary, muted, slate, blue, indigo, sky, red, gray, green, amber, or a custom color declared in a specification (`color brand #3b82f6`) |
| icon | An icon of LikeC4's built-in library (`tech:postgresql`, `aws:lambda`), a URI (`https://…`, `/…`, `./…`, `../…`, `@alias/…`; not `file://`) or `none` |
| opacity | Percentage from `0%` to `100%` (`40%`) |
| border | solid, dashed, dotted, none |
| multiple | true, false (a boolean) |
| size | xs, sm, md, lg, xl, xsmall, small, medium, large, xlarge |
| padding | Same as size |
| textSize | Same as size |
| iconPosition | left, right, top, bottom |
| iconColor | Same as color |
| iconSize | Same as size |

Values are checked before writing (see [Rejected writes](#rejected-writes)); the keyword sets are taken from the grammar of the installed LikeC4.

### Relationship properties

| Property | Type | addRelationship | updateRelationship | DSL syntax |
|----------|------|:---------------:|:------------------:|------------|
| label | string | yes | yes (replace) | `-> target 'label'` |
| description | string | yes | yes (replace) | `description 'text'` or `-> target 'label' 'description'` |
| technology | string | yes | yes (replace) | `technology 'text'` or `-> target 'label' 'description' 'technology'` |
| tags | string[] | yes | yes (replace) | `#tagname` |
| links | {url, label?}[] | yes | yes (replace) | `link url 'label'` |
| metadata | `Record<string, string \| string[]>` | yes | yes (merge, `null` deletes a key) | `metadata { key 'val' }` or `metadata { key ['v1', 'v2'] }` |
| style | RelationshipStyle | yes | yes (merge per-field) | `style { line ... }` |

### Relationship style properties

| Property | Values |
|----------|--------|
| line | solid, dashed, dotted |
| color | Same as the element `color` |
| head | normal, onormal, diamond, odiamond, crow, open, vee, dot, odot, none |
| tail | Same as head |

## Specification defaults

A kind declared in a `specification` block can carry defaults, and LikeC4 applies them to every element or relationship of that kind:

```
specification {
  element service {
    #backend
    title 'Service'
    technology 'Node'
    link https://wiki.example.com/services 'Service guide'
  }
  relationship async {
    #queue
    title 'Asynchronous'
    technology 'Kafka'
  }
  tag backend
  tag queue
  tag critical
}
model {
  api = service {
    #critical
  }
  db = service 'DB'
  api -[async]-> db
}
```

`getElement` / `listElements` / `getRelationships` report the values LikeC4 1.59.4 computes from them, and `fromSpecification` tells where they come from:

```typescript
const api = mutator.getElement('api')!;
api.title;             // 'Service'
api.technology;        // 'Node'
api.tags;              // ['backend', 'critical']
api.links;             // [{ url: 'https://wiki.example.com/services', label: 'Service guide' }]
api.fromSpecification; // { kind: 'service', file: 'spec.c4', sourceRange: {...}, title: 'Service', technology: 'Node', tags: ['backend'], links: [...] }

const [rel] = mutator.getRelationships({ sourceFqn: 'api', targetFqn: 'db' });
rel.title;             // 'Asynchronous'
rel.tags;              // ['queue']
```

Rules (LikeC4's own, applied before any `extend` block):

| Property | Element | Relationship |
| --- | --- | --- |
| `title` | own when non-empty (after dedent and trim); else the kind's when non-empty; else the element **name** — so an element `title` is always defined | own when non-empty; else the kind's; else own (`''` or none) |
| `summary` | own, else the kind's. An empty summary written after the title (`x = s 'T' ''`) is no summary; an empty body `summary ''` is a summary | — (a relationship kind has none) |
| `description` | own (an empty body `description ''` included), else the kind's | own (an empty one in the body included; an empty one written after the title is none), else the kind's |
| `technology` | own (`''` included), else the kind's | own (`''` included), else the kind's |
| `tags` | the kind's, then own, then `extend` blocks — without duplicates | same |
| `links` | own; the kind's only when the element has none of its own; then `extend` blocks | same, with the `extend` link rule for relationships |
| `metadata` | not affected (a kind declares none) | not affected |

- `fromSpecification` (`KindDefaults`) holds the kind name, its file and `sourceRange`, the strings normalized like the effective values, and tags and links as written. It is present whenever a specification declares the kind (also without defaults) and absent otherwise: an element of an undeclared kind (LikeC4 leaves it out of its model; the library still reports it, with its name as title), a relationship without a kind or with an undeclared one.
- A kind declared more than once (a LikeC4 validation error the library does not report) is taken as LikeC4's model builder takes it: the declaration of the last file (ordered as for `extend` blocks); within a file the last one for an element kind, the first one for a relationship kind.
- Not covered: `style` and `notation` defaults (no such fields are read), `multiple`, and the technology LikeC4 derives from an element's icon. With the project setting `inferTechnologyFromIcon` (on by default), LikeC4 replaces an element's missing or empty technology by one derived from its icon (`tech:postgresql` → `Postgresql`). The library does not read project settings and reports the technology as written or inherited from the kind: an own `technology ''` is reported as `''`.

### Writing

Kind defaults are read-only. `updateElement` and `updateRelationship` edit the declaration and its `extend` blocks as described below, never the specification. The patch is written as given, and the effective value afterwards follows the rules above:

| Patch | Effective value after the update |
| --- | --- |
| `tags: T` | kind tags, then `T`, without duplicates — `tags: []` leaves the kind tags |
| `links: L` | `L` when non-empty; `links: []` brings back the kind links |
| element `title: ''` / relationship `label: ''` | the kind title; for an element of a kind without one, the element name |
| element `summary: S` / `description: S` | `S`, `''` included when written in the body (an empty summary written after the title reads as the kind summary) |
| element `technology: S`, relationship `description: S` / `technology: S` | `S`, `''` included (an empty relationship description written after the title reads as the kind description) |
| `metadata` | as without kind defaults |

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

- The defaults of the element's kind come first (see [Specification defaults](#specification-defaults)), then the declaration body, then every `extend` block of exactly this element — files ordered by path the way LikeC4 orders documents (natural and segment by segment: `a/x.c4` before `a.c4`, `ext9.c4` before `ext10.c4`; independent of the order passed to `fromFiles`), then source order within a file.
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

- A block applies to every relationship with the same source and target (resolved to FQNs), kind, title and direction. No kind matches only relationships without a kind (`-[calls]->` and `.calls` are the same kind); a kind no specification declares counts as no kind, as LikeC4 resolves it (`kind` in `getRelationships()` still reports it as written). Titles are compared dedented and trimmed; the title may be written after the target or as a `title` body property, and a relationship without a title is compared with the `title` of its kind's specification when that declares one. A bidirectional block (`extend b <-> a`) matches `a <-> b`; a directed block never matches a bidirectional relationship.
- The defaults of the relationship's kind come first (see [Specification defaults](#specification-defaults)), then the relationship's own values — its tags are those written on the relation line (`a -> b 'x' #t`) or else those of its body — then every matching block in the order used for elements. `updateRelationship` replaces tags where the relationship has them: on the relation line when it has any there (body tags in the same relationship, which LikeC4 reports as an error, are removed so they cannot take over), otherwise in the body.
- `tags` and `metadata` merge as for elements. `links` differ: a block's link is skipped when a link with the same url and label is already present; the relationship's own duplicates are kept.
- The kind's tags and links take part as described in [Specification defaults](#specification-defaults): a block's link equal to a kind link is skipped too.

`updateRelationship` treats these blocks like `updateElement` treats `extend X` blocks — same table and rules (new values go into the relationship; patched tags, links and metadata keys leave every matching block in every file; empty blocks stay; rejected while a file has syntax errors; atomic in memory) — and returns `{ changedFiles }`. In addition:

- The title identifies the relationship for its blocks, so a `label` that changes the title is written into every matching block as well (`extend api -[calls]-> db 'queries' { ... }`); otherwise they would stop applying.
- A block applies to every relationship with the same identity (e.g. `a -> b 'x'` and `a -> b { title 'x' }`). When an update would change such a shared block, it is rejected before anything changes, because the other relationship would change too.
- A `label` that changes the identity is rejected, before anything changes, when the relationship's blocks would then also apply to another relationship that already has the new identity, or when blocks of the new identity with tags, links or metadata exist (even if no relationship has it yet): they would start applying to the renamed relationship.
- `removeRelationship` also removes the blocks that applied to the removed relationship and apply to no remaining one (they would match nothing). `removeElement` removes, besides those of the relationships it removes, every block whose source or target is in the removed subtree. Blocks that matched nothing before are left alone.

## Deployment model

The `deployment { ... }` part of the model is read through workspace-level methods: ids span files, so they are not per-file reads.

### Reading

#### Deployment node kinds

`getSpecification()` lists the deployment node kinds (`deploymentNode <kind>`) in `deploymentNodeKinds`, in order of first declaration. The field is present only when at least one is declared, so the result of a specification without deployment node kinds is unchanged; a specification that declares only deployment node kinds no longer reads as `null`. `getDeploymentNodeKind(kind)` returns the declaration and its defaults (`DeploymentNodeKindDefaults`), or `null` for an undeclared kind:

```
specification {
  element service
  deploymentNode environment
  deploymentNode vm {
    #infra
    title 'Virtual machine'
    technology 'Linux'
    style {
      shape rectangle
      color secondary
      opacity 40%
    }
  }
  tag infra
}
```

```typescript
mutator.getSpecification();
// { elementKinds: ['service'], tags: ['infra'], relationshipKinds: [], deploymentNodeKinds: ['environment', 'vm'] }

mutator.getDeploymentNodeKind('vm');
// { kind: 'vm', file: 'spec.c4', sourceRange: {...}, title: 'Virtual machine', technology: 'Linux',
//   tags: ['infra'], style: { shape: 'rectangle', color: 'secondary', opacity: '40%' } }
```

- The defaults are the values LikeC4 computes for the kind: title, summary, description and technology normalized as for an element kind; tags of every comma-separated group in LikeC4's order (the last group first) without duplicates — `#a, #b` reads as `['b', 'a']`; link labels read as one line; and `style`: the kind's first `style { ... }` block, the last value of a repeated field, no theme defaults, with `opacity` and `icon` as written (see [Style values as written](#style-values-as-written)). The `fromSpecification` of a node reports the kind's tags and links as written.
- A kind declared more than once is taken as for an element kind: the last declaration of the last file in LikeC4 document order.

#### Style values as written

The style of a deployment node kind, a node and an instance is reported as LikeC4 computes it (no theme defaults; size aliases such as `small` read as `sm`; a hex color inside `style { ... }` is ignored, as LikeC4 ignores it), except for two fields, which keep the form they are written in — a value the library reads is a value it can write back:

- `opacity` keeps its written spelling: `opacity 40%` reads as `'40%'`, `opacity 040%` as `'040%'` and `opacity 150%` as `'150%'`, where LikeC4 computes the numbers 40, 40 and 100 (clamped to 0…100).
- `icon` keeps relative paths (`./img/db.svg`), root-relative paths (`/img/db.svg`) and image aliases (`@/db.svg`) as written; LikeC4 resolves them to URLs. Library icons (`tech:postgresql`), `none` and absolute URLs read as LikeC4 reads them.

A relative icon path is relative to the file that declares it: a node or instance that inherits the icon of a kind or element declared in another file reports the path written there (`./img/db.svg`), which LikeC4 resolves against that other file. Copied into another file, the same text can resolve to a different URL. Root-relative paths and image aliases depend on the consumer's project — its root folder and its `imageAliases` (`@` stands for `./images` by default) — which the library does not read.

#### Deployment nodes

`getDeploymentNode(id)` returns a node by its LikeC4 deployment id — the parent's id + `.` + name, e.g. `prod.vm1` — or `null`. `listDeploymentNodes({ kind?, parentId? })` lists nodes of every file in LikeC4 document order (a parent before its children); `parentId` matches direct children only.

```
// model.c4
specification {
  element service
  deploymentNode environment
  deploymentNode vm {
    #infra
    title 'Virtual machine'
    style {
      color secondary
    }
  }
  tag infra
  tag eu
}
model {
  api = service 'API'
}
deployment {
  environment prod 'Production' {
    vm vm1 {
      technology 'Ubuntu'
      instanceOf api
    }
  }
}

// regions.c4
deployment {
  extend prod.vm1 {
    #eu
    metadata {
      region 'eu-west'
    }
  }
}
```

```typescript
const vm1 = mutator.getDeploymentNode('prod.vm1')!;
vm1.title;       // 'Virtual machine' (the kind title: vm1 has no title of its own)
vm1.technology;  // 'Ubuntu'
vm1.tags;        // ['infra', 'eu']
vm1.metadata;    // { region: 'eu-west' }
vm1.style;       // { color: 'secondary' }
vm1.extendedBy;  // [{ file: 'regions.c4', sourceRange: {...}, tags: ['eu'], metadata: { region: 'eu-west' } }]
vm1.instances;   // ['prod.vm1.api']
vm1.parentId;    // 'prod'

mutator.listDeploymentNodes({ parentId: 'prod' });      // [prod.vm1]
mutator.listDeploymentNodes({ kind: 'environment' });   // [prod]
```

The effective values are LikeC4's (`DeploymentNodeInfo`):

| Property | Rule |
| --- | --- |
| `title` | own when written (`''` included, inline or in the body); else the node name. A title equal to the node name — written or by default — is replaced by the kind title when the kind has one |
| `summary`, `description`, `technology` | own (`''` included), else the kind's; summary and description are reported field by field, without the display fallback from one to the other |
| `tags` | own — or the kind's when the node has none — then those of the `extend` blocks, then the kind's appended, without duplicates |
| `links` | own — or the kind's when the node has none — then those of the `extend` blocks |
| `metadata` | own, then the `extend` blocks, merged as for elements |
| `style` | the kind's style overridden field by field by the node's own `style { ... }`; `opacity` and `icon` as written (see [Style values as written](#style-values-as-written)) |

- `extendedBy` lists every `extend <node>` block whose written path is exactly the node's id — `extend prod.vm1` extends `prod.vm1`, never another node named `vm1` — including blocks that only add children. `children` (nodes) and `instances` include those declared in `extend` bodies.
- `declared` holds the tags, links and metadata of the node's own body as written, `fromSpecification` the kind's declaration (`DeploymentNodeKindDefaults`).
- Only what LikeC4 keeps in its model is reported. A node whose kind no specification declares is left out, and with it everything below it — child nodes and instances — and every relationship with an endpoint there; so is a node declared inside an `extend` block of a node that does not exist. An id declared twice (a LikeC4 error) is listed once per declaration; `getDeploymentNode` returns the first in document order.

#### Instances

`getDeploymentInstance(id)` returns an instance (`instanceOf <element>`) by its deployment id — the id of its node + `.` + name — or `null`. `listDeploymentInstances({ nodeId?, element? })` lists instances of every file in LikeC4 document order; `nodeId` matches the instances directly in that node, `element` the FQN the `instanceOf` reference resolves to (not the text as written). An instance written without a name is named after the last segment of its reference as written: `instanceOf app.api` is `api`.

```
specification {
  element service
  deploymentNode vm
  tag backend
  tag replica
}
model {
  api = service 'API' {
    #backend
    summary 'Public API'
    technology 'Go'
    metadata {
      owner 'team-a'
    }
    style {
      shape browser
    }
  }
}
deployment {
  vm vm1 {
    instanceOf api
    replica = instanceOf api 'API replica' {
      #replica
      metadata {
        region 'eu'
      }
      style {
        color red
      }
    }
  }
}
```

```typescript
const api = mutator.getDeploymentInstance('vm1.api')!;
api.element;     // 'api'
api.title;       // 'API' (inherited)
api.technology;  // 'Go' (inherited)
api.metadata;    // { owner: 'team-a' } (inherited)

const replica = mutator.getDeploymentInstance('vm1.replica')!;
replica.title;     // 'API replica'
replica.summary;   // 'Public API' (inherited)
replica.tags;      // ['replica', 'backend']
replica.metadata;  // { region: 'eu' } — an own map replaces the element's
replica.style;     // { shape: 'browser', color: 'red' }

mutator.listDeploymentInstances({ element: 'api' });  // [vm1.api, vm1.replica]
```

The effective values are LikeC4's (`DeploymentInstanceInfo`):

| Property | Rule |
| --- | --- |
| `title` | own when written (`''` included); else the element's title |
| `summary`, `description`, `technology`, `links` | own, else the element's (as `getElement` reports it) |
| `metadata` | the own map, else the element's map — an own map replaces the element's whole map, keys are not merged |
| `tags` | own, then the element's, without duplicates |
| `style` | the element's style (its kind's style overridden by its own) overridden field by field by the instance's own `style { ... }`; `opacity` and `icon` as written (see [Style values as written](#style-values-as-written)) |

- Three documented differences from LikeC4's computed values: summary and description are inherited field by field — LikeC4 shows the description as the summary (and the reverse) when only one of them is set, the library does not; no technology is derived from an icon (LikeC4's `inferTechnologyFromIcon`, on by default), as for elements; and style `opacity` and `icon` keep their written form, also when inherited from the element (see [Style values as written](#style-values-as-written)).
- An instance whose `instanceOf` reference does not resolve is not reported, as LikeC4 drops it. Instances cannot be extended; `declared` holds the tags, links and metadata of the instance's own body as written.

#### Relationships

`listDeploymentRelationships({ source?, target?, kind? })` lists the relationships of the deployment model in LikeC4 document order; `getRelationships()` keeps returning the logical model only. Each endpoint is `{ id, element? }`: the deployment id of a node or instance, plus the element FQN when the endpoint steps into the element of an instance (`vm1.db.replLog`). A `source` / `target` filter by an instance id also matches endpoints that step into its element.

```
specification {
  element service
  deploymentNode vm
  relationship replicates {
    #data
    technology 'TCP'
    line dotted
  }
  tag data
}
model {
  db = service {
    replLog = service
  }
}
deployment {
  vm vm1 {
    instanceOf db
  }
  vm vm2 {
    instanceOf db
    -> vm1 'heartbeat'
  }
  vm2.db -[replicates]-> vm1.db.replLog 'streams WAL'
  vm1.db <-> vm2.db 'sync'
}
```

```typescript
mutator.listDeploymentRelationships();
// [
//   { source: { id: 'vm2' }, target: { id: 'vm1' }, bidirectional: false, title: 'heartbeat', ... },
//   { source: { id: 'vm2.db' }, target: { id: 'vm1.db', element: 'db.replLog' }, kind: 'replicates',
//     bidirectional: false, title: 'streams WAL', technology: 'TCP', tags: ['data'], style: { line: 'dotted' }, ... },
//   { source: { id: 'vm1.db' }, target: { id: 'vm2.db' }, bidirectional: true, title: 'sync', style: { tail: 'normal' }, ... },
// ]
mutator.listDeploymentRelationships({ target: 'vm1.db' });   // ['streams WAL']
```

The effective values are LikeC4's (`DeploymentRelationshipInfo`):

| Property | Rule |
| --- | --- |
| `source` | as written; for a relationship written without a source (`-> vm1`), the enclosing node or instance |
| `kind` | `-[kind]->`, `-[kind]<->` or `.kind`, as written |
| `title` | own (after the target, else in the body), else the kind's; an empty one is no title |
| `description` | the body `description`, else the kind's. A description or technology written on the relation line is ignored, as LikeC4 ignores it |
| `technology` | the body `technology` when non-empty, else the kind's |
| `tags` | the kind's, then the tags written on the relation line — or, when there are none there, those of the body — without duplicates |
| `links` | own, else the kind's |
| `metadata` | the first `metadata { ... }` block |
| `style` | the kind's style overridden field by field by the own `style { ... }`. A bidirectional relationship always has a `tail`, as LikeC4 computes it: the one written, else the `head`, else `'normal'` |

- A relationship whose source or target does not resolve (an unknown or ambiguous name), or resolves to a node or instance LikeC4 leaves out of its model, is not listed, as LikeC4 drops it. Deployment relationships cannot be extended.
- `declared` holds the tags, links and metadata written in the relationship, `fromSpecification` the kind's declaration with its style.

### Writing

Deployment writes address nodes and instances by their deployment id, as the reads do. A rejected write throws an `InvalidWriteError` naming the option (see [Rejected writes](#rejected-writes)) and changes no file.

#### Adding nodes

`addDeploymentNode(parentId, opts)` adds a node under the node `parentId`, or a root node when `parentId` is `null`, and returns its id. It is written in the `name = kind` form: the title inline (an empty title is written as `''`), summary, description, technology, tags, links, style and metadata in the body — a node has no inline technology.

```typescript
mutator.addDeploymentNode('prod', {
  name: 'vm3',
  kind: 'vm',
  title: 'VM 3',
  technology: 'KVM',
  tags: ['primary'],
  style: { color: 'blue' },
});
// 'prod.vm3', written at the end of the body of `prod`:
//   vm3 = vm 'VM 3' {
//     #primary
//     technology 'KVM'
//     style {
//       color blue
//     }
//   }

mutator.addDeploymentNode(null, { name: 'stage', kind: 'environment', file: 'deployment.c4' }); // 'stage'
```

- **A child node** goes at the end of the body of its parent's declaration; a declaration without a body gets one. Children the parent has in `extend` blocks do not change this place. `file` is not accepted for a child node.
- **A root node** goes into a `deployment` block. With `file` (one of the loaded files; no file is created): the first `deployment` block of that file, else a new block at the end of that file. Without `file`: the first `deployment` block of the first file in LikeC4's document order that has one; else a new block at the end of the first file (in that order) with a `model` block; else of the first file.
- **Rejected**, with nothing changed: a `name` that is not one identifier or is reserved, or whose id is already used by a node or instance of a loaded file — children declared in `extend` blocks included (`name`); a `kind` no specification declares as a deployment node kind (`kind`); an undeclared tag (`tags[i]`); an invalid style value (`style.<field>`); a `parentId` that is not declared, is an instance or is declared more than once (`parent`, naming the declarations); `file` on a child node, or a `file` that is not loaded (`file`).
- **References stay as they are.** A new node can change how LikeC4 links a reference that is already written: with `prod { inner { x } y }`, `prod.x` links to `prod.inner.x`, the only `x` below `prod`, until `prod.y.x` exists. The write is rejected on `name` when a reference that resolved before — a deployment relationship endpoint, an `instanceOf` target, an `extend` target, a deployment view rule or a reference of the logical model — would then resolve to another target or not at all.

#### Updating nodes

`updateDeploymentNode(id, patch)` patches a node with the semantics of `updateElement`, on the node's effective values, and returns `{ changedFiles }`:

- `title`, `summary`, `description`, `technology` replace every declaration LikeC4 reads — inline (after the kind in `name = kind 'Title'`, after the name in `kind name 'Title'`) and in the body. A new title is written inline; summary, description and technology go into the body.
- `tags` and `links` replace; `metadata` merges, `null` deletes a key; `style` merges per field. `style.icon` is written into the body-level `icon` when the node has one (it overrides `style { icon ... }`), else into the style block.
- The kind's defaults keep applying, as LikeC4 reads them: `tags: []` clears the node's own tags and those of its `extend` blocks, but the kind's tags stay; `links: []` clears own and `extend` links, and the kind's links apply again. A `title` equal to the node's name reads as the kind's title when the kind has one; an empty `title` (`''`) reads as `''`.
- Patched tags, links and metadata keys are removed from every `extend <node>` block whose path is exactly `id`, in every file, so that the patched value is the effective one. Blocks of other nodes, descendants included, are not touched.
- The kind is not changed. A node declared in an `extend` block is addressed by its id like any other.

```typescript
mutator.updateDeploymentNode('prod.eu', { title: 'Europe', tags: ['primary'], metadata: { owner: null } });
// { changedFiles: ['deployment.c4', 'ext/eu.c4'] }
```

Rejected, with nothing changed: an `id` no node has, that is an instance or that is declared more than once (`id`, naming the declarations); an undeclared tag or an invalid style value; a `tags`, `links` or `metadata` update while any loaded file has syntax errors (field `tags`, `links` or `metadata`: an `extend` block could hide in that file); the other fields can still be updated then.

#### Removing nodes

`removeDeploymentNode(id)` removes a node with its whole subtree — child nodes, instances and the relationships declared in them — and returns `{ removedRelationships }`. Removed with it, in every file:

- every `extend <node>` block of the node or of a node of its subtree, with what is declared in it;
- every deployment relationship whose source or target is in the subtree — a node or instance of it, or an element stepped into through an instance of it.

`removedRelationships` lists each removed relationship as `listDeploymentRelationships()` reported it before the call: `{ source, target, title? }`, endpoints as `{ id, element? }`.

```typescript
mutator.removeDeploymentNode('prod.eu.vm1');
// { removedRelationships: [{ source: { id: 'prod.eu.vm2.web' }, target: { id: 'prod.eu.vm1.api' }, title: 'requests' }, ...] }
```

Rejected, with nothing changed (field `id`):

- an `id` no node has, that is an instance or that is declared more than once;
- a rule of a deployment view (`include`, `exclude`, a relationship predicate, `style`) refers to the node or anything in its subtree — the error lists the references; views are never edited;
- the removal would change what a surviving reference links to. A name can become unique: with `vm n` at the root and `prod { a { n } b { n } c { -> n } }`, `-> n` links to the root `n` while `n` is ambiguous below `prod`; removing `prod.b` would make it link to `prod.a.n`.

#### Adding instances

`addDeploymentInstance(nodeId, opts)` deploys the element `opts.element` in the node `nodeId` and returns the instance's id. The instance is written at the end of the body of the node's declaration (a declaration without a body gets one), also when the node has children in `extend` blocks: `name = instanceOf element`, or `instanceOf element` without a name, with the title inline (an empty title is written as `''`) and summary, description, technology, tags, links, style and metadata in the body — an instance has no inline technology. `file` is not accepted.

```typescript
mutator.addDeploymentInstance('prod.eu.vm2', { element: 'shop.db' });
// 'prod.eu.vm2.db', written at the end of the body of `vm2`:
//   instanceOf shop.db

mutator.addDeploymentInstance('prod.eu.vm1', { element: 'shop.api', name: 'api3', title: 'API 3', tags: ['replica'] });
// 'prod.eu.vm1.api3':
//   api3 = instanceOf shop.api 'API 3' {
//     #replica
//   }
```

- **`element`** is written as given and resolved as LikeC4 links `instanceOf` from the node: in the model blocks of the node's file and among the root elements, then each further segment among the unique descendants of the previous one. Nodes and instances are never candidates, so `instanceOf vm1` does not name the instance `vm1`.
- **Without `name`** the instance is unnamed, and LikeC4 names it after the last segment of `element` as written (`instanceOf shop.db` is `db`). That id must be free; when a node or instance already has it, give a `name`.
- **Rejected**, with nothing changed: a `name` that is not one identifier or is reserved, or an id — given or implicit — already used by a node or instance of a loaded file, children declared in `extend` blocks included (`name`); an `element` that is not identifiers joined by `.`, or does not resolve to exactly one element (`element`); an undeclared tag (`tags[i]`); an invalid style value (`style.<field>`); a `nodeId` that is not declared, is an instance or is declared more than once (`node`, naming the declarations); any `file` (`file`).
- **References stay as they are**, as for [nodes](#adding-nodes): the write is rejected on `name` when a reference that resolved before would then resolve to another target or not at all. With `n1 { instanceOf app.db }` and a top-level `n2.web -> db`, `db` links to the only instance named `db`; an unnamed `instanceOf app.db` in another node would make it ambiguous, while `db2 = instanceOf app.db` is accepted. A rule of a deployment view that names an instance by its name alone is protected the same way.

## Slashes in titles

In a view title, and in an element title that names an implicit view, LikeC4 reads `/` as a folder separator and `\/` as a literal slash.  Title values (`addView({ title })`, `addElement` / `updateElement` `title`) use the same notation: `\/` is written as is and every other backslash is escaped, so LikeC4 reads the title given.

```typescript
mutator.addView({ id: 'costs', type: 'element', target: 'app', title: 'Cost \\/ Benefit' }); // view "Cost / Benefit", no folder
mutator.addView({ id: 'prod', type: 'element', target: 'app', title: 'Deployment / Prod' });  // view "Prod" in folder "Deployment"
```

`getElement().title` reports such a title with `/` (`'Cost / Benefit'`), as LikeC4's model does; write `\/` again when passing it back as a title that should not create a folder.

## Line endings

Text the library writes into a file uses that file's line ending — the one of its first line break (`\r\n` or `\n`; `\n` when the file has none).  Text kept from the file is never changed, so a file that already mixes line endings stays mixed.
## Rejected writes

Every write call checks the values it introduces before anything changes. A rejected call throws an `InvalidWriteError` (exported): `field` names the offending option in the terms of the call (`name`, `kind`, `id`, `target`, `source`, `autoLayout`, `tags[1]`, `style.color`, `includes[0]`), `detail` says what is wrong, and no file changes. `apply` reports the same as `mutations[i].<field>` (the element name of `addElement` is its `id`) with exit code 1 and writes nothing; the single-purpose CLI commands name the option (`--id`, `--kind`, `--tags`, ...).

| Value | Accepted |
| --- | --- |
| element `name` (`addElement`), view `id` (`addView`) | One LikeC4 identifier (letters, digits, `_`, `-`; not starting with a digit or `-`; no `.`; not a keyword such as `title`), not a reserved word (`this`, `it`, `self`, `super`, `likec4lib`, `global`), and not used yet: no element of a loaded file has the same FQN (a sibling in the parent's body or in an `extend` of the parent, or another root element), no view of any type has the same id. |
| `kind` (`addElement`) | One identifier. |
| relationship `source` / `target` (`addRelationship`), view `target` (`addView`) | Identifiers joined by `.` (`app.api`). |
| `autoLayout` (`addView`) | A direction (`TopBottom`, `LeftRight`, `BottomTop`, `RightLeft`), optionally followed by a whole-number rankSep and nodeSep (`LeftRight 120 40`). |
| `includes` items (`addView`) | Exactly one `include` rule of the view's type; in a deployment view without `with { ... }`, which LikeC4 does not apply there. |
| style values (`addElement`, `updateElement`, `addRelationship`, `updateRelationship`) | See [Element style properties](#element-style-properties) and [Relationship style properties](#relationship-style-properties); a field the style type does not have is rejected. |

A value that would add other DSL than the property asked for (`autoLayout: 'LeftRight\n exclude a'`, `style: { color: 'red\n shape cylinder' }`) is rejected by these checks, and so is a style value with a comment (`// ...`, `/* ... */`) or a separator (`color: 'red;'`): a style value is written in place of the existing one, where `red // x` would comment out a field that follows on the same line. Only what LikeC4 lexes as a comment counts: `//` inside a URI (`icon: 'https://example.com/a.svg'`) is accepted. `autoLayout` and `includes` items are written on lines of their own, so a trailing comment there (`'* // every element'`) is accepted and ends with the line.

Writes LikeC4 would reject are refused the same way:

| Call | Rejected when |
| --- | --- |
| `addElement` | `kind` is not declared as an element kind by a specification (`element service`); a tag is not declared (`tag internal`); the new name would change what an existing reference links to (field `name`, see below). |
| `updateElement`, `updateRelationship` | a tag of `tags` is not declared. |
| `addRelationship` | `source` or `target` does not resolve to an element (LikeC4: `Could not resolve reference`); they resolve to the same element or to a parent and its descendant (LikeC4: `Invalid parent-child relationship`); a tag is not declared. |
| `addView` | an element view's `target` does not resolve to an element. |
| `addDeploymentNode` | `kind` is not declared as a deployment node kind (`deploymentNode vm`); a tag is not declared; the new node would change what an existing reference links to (field `name`, see [Adding nodes](#adding-nodes)). |
| `addDeploymentInstance` | `element` does not resolve to one element as LikeC4 links `instanceOf` (LikeC4: `Could not resolve reference`); a tag is not declared; the new instance would change what an existing reference links to (field `name`, see [Adding instances](#adding-instances)). |

Endpoints are resolved the way LikeC4 links them from the place they are written — the first `model` block of the first file that has one: a name is looked up among the children of that block and the names unique below it, then the names unique across the file's model blocks, then the root elements of every loaded file; each further segment among the unique descendants of the previous one. So `addRelationship('app.gateway', 'app.cache')` is rejected when `cache` is declared only inside `app.gateway`: LikeC4 links `app.cache` to `app.gateway.cache`, a child of the source. `this` / `it` do not resolve at model level.

A new element can change how LikeC4 links references that are already written: with `app = service { api = service }`, a model-level `api -> other` links `api` to `app.api`, the only element of that name; once `other.api` exists, `api` is ambiguous and LikeC4 reports `Could not resolve reference`. A new direct child can also shadow a unique descendant (`app.api` linking to `app.inner.api` would link to a new `app.api`). `addElement` resolves the existing references again with the new element in place and is rejected, with nothing changed, when one that resolved before then resolves to another element or not at all. Checked are, in every loaded file:

- in the logical model: relationship endpoints (at model level, in element bodies and in `extend` bodies), the endpoints of `extend a -> b` blocks, the targets of `extend X` blocks and the `of` targets of element views;
- in the deployment model: the element of every instance (`instanceOf api`), the element part of a deployment relationship endpoint that steps into an instance's element (`prod.api.handler`), the targets of `extend <node>` blocks, and every reference in the rules of deployment views (`include`, `exclude`, relationship predicates, `style`), whether it names a node, an instance or a logical element.

The rules of element and dynamic views, and the steps of dynamic views, are not resolved by the library and not checked. References that did not resolve before the call are not considered.

**Only what the call introduces is checked.** Problems already in the files — undeclared tags or kinds, dangling references, duplicates — are neither reported nor a reason to reject a valid write, so a workspace with unrelated LikeC4 errors still accepts valid edits. `validate()` still reports syntax errors only.

**Only the loaded files are known.** Declarations and elements of files that were not passed to `fromFiles` (or are outside `--dir`) are invisible: a kind, tag, custom color or endpoint declared only there is rejected, as the library cannot tell it from a typo. Load every file of the project (the CLI loads the whole `--dir` tree).

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
