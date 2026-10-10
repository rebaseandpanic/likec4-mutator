# LikeC4 1.59.4 DSL coverage

What likec4-mutator 0.7.1 can do with each construct of the LikeC4 DSL. Every parser rule of the grammar shipped in `@likec4/language-server` 1.59.4 has a main row; its alternatives, keywords, properties, value forms and the AST types its actions create have sub-rows (`` `Rule` › ... ``) where they can be read or written independently. Constructs outside the grammar (file names, project configuration, references, text form) are rated in [Outside the grammar](#outside-the-grammar). The rows follow the installed 1.59.4 grammar; the documentation at likec4.dev may show syntax this version does not parse, listed in [Documented but not in LikeC4 1.59.4](#documented-but-not-in-likec4-1594).

- **Read** — the construct is reported by the structured query API (`getElement`, `listElements`, `getRelationships`, `getSpecification`, `WorkspaceIndex`). The raw text from `getElementSource` does not count. For a reference: the library resolves it.
- **Add / Update / Remove** — a library operation writes, changes or deletes the construct. Removing a whole element or relationship is not counted as removing each of its properties. For a reference: Add — written by an operation; Update — rewritten when its target is renamed or moved; Remove — cleaned up when its target is removed.
- Statuses:
  - `yes` — supported without limits;
  - `partial` — supported with the limits named in Notes;
  - `text` — written only as unchecked DSL text inside an `includes` item of `addView` (the item is only checked to parse as exactly one `include` rule of the view); it cannot be read, changed or removed afterwards;
  - `no` — not supported;
  - `n/a` — not an independently editable construct: an alternative, wrapper, body or name holder whose parts are rated in other rows, or a set of keyword values; Notes says which.
- A rule used in several places (e.g. `Tags`, `LinkProperty`, the style properties) is rated over all of them: `partial` when only some are supported. Its Notes or sub-rows name the places.
- DSL that a string parameter smuggles into a file is not counted as support. Identifiers and string parameters are checked before writing: an element name, a view `id`, a `kind`, a relationship endpoint or view `target`, `autoLayout` and each style value must form exactly one token or property of the grammar (`includes` items exactly one `include` rule), so e.g. `addView({ autoLayout: 'LeftRight\n exclude a' })`, `addView({ target: 'a {\n }\n view w' })` and `updateElement('a', { style: { color: 'red\n shape cylinder' } })` are rejected with an `InvalidWriteError` naming the field.
- The columns describe the library API. The `apply` command accepts the same operations as JSON, except: `addView` has no `autoLayout` (always `TopBottom`), and `addElement` requires a non-empty `parent` and `title` (no root-level element, no element without a title; `src/mutations-file.ts`). The single-purpose CLI commands cover less, see the [README](../README.md#cli).
- `validate()` reports syntax errors only. Write calls check the references, kinds and tags they introduce before writing (see Semantic validation in [Outside the grammar](#outside-the-grammar)).
- Names in backticks in Notes are DSL keywords and the grammar's feature and AST type names (the check below requires them), not API fields: e.g. `elements` in `SpecificationRule` is the grammar feature, while the API field is written in full as `getSpecification().elementKinds`.

Terminal rules (strings, numbers, comments, URIs, ...) are lexical and have no rows; comments and separators are rated in [Text form and preservation](#text-form-and-preservation). Merge rules across files and `extend` blocks are described in the [README](../README.md#extend-blocks).

## Checking this document

Rules, keywords and AST types come from the installed grammar (`likec4.Grammar` of `@likec4/language-server`), not from this file:

```bash
npx tsx scripts/grammar-rules.ts                                   # LikeC4 version; per rule: fingerprint, definition, facets
npx tsx scripts/grammar-rules.ts --check docs/likec4-coverage.md   # exit 1 when this document does not match the grammar
```

`--check` fails when:

- the file does not have exactly one `# ` title naming the installed LikeC4 version as a whole version (`1.59.40` does not name `1.59.4`), or a `likec4-mutator X.Y.Z` in this file is not the version in `package.json`;
- a parser rule has no main row, a row names a rule the grammar does not have, or two rows have the same label;
- the hidden `<!-- grammar-hash: ... -->` at the end of a main row is not the fingerprint of the rule's current definition (a SHA-256 of the rule node with its keywords, alternatives, assignments, cardinalities, actions and called rule names) — reported as `rule X changed ... re-review its row(s)`, with the new definition;
- a keyword (other than brackets), an assigned feature or an action-created AST type of a rule is not named in backticks in the label or Notes of one of the rule's rows as a whole token (`model` is not named by `models`, `->` is not named by `<->`, `]->` or `-[x]->`), or an action-created AST type without a rule of its own has no sub-row `` `Rule` › `Type` `` under each rule that creates it;
- a rule that no other rule calls does not say `Unused` in its row;
- a status cell is not `yes` / `partial` / `text` / `no` / `n/a`, or a row with a status other than `no` has no notes;
- a table in a grammar section does not have the `Rule | DSL example | Read | Add | Update | Remove | Notes` header, or one of its rows is not labelled `` `Rule` `` or `` `Rule` › ... ``;
- [Outside the grammar](#outside-the-grammar) or [Documented but not in LikeC4 1.59.4](#documented-but-not-in-likec4-1594) is missing, has no rows, has a table with another header, a row with another number of cells or an empty cell, or a status other than `yes` / `partial` / `no` (Outside the grammar) or a third cell not starting with `Parse error` (Documented but not in).

The check does not judge whether a status is true of the library's code, in any table, nor whether the syntax listed under Documented but not in is still rejected: fingerprints change with the grammar, never with `src/`. That is a review step (code reading or a probe), and the success message of `--check` says so.

### Upgrading LikeC4

1. Bump `@likec4/language-server` and run `--check`. New rules show up as missing main rows, removed or renamed rules as rows naming unknown rules, changed rule bodies as `rule X changed`, new keywords, features and action types as not named.
2. For every reported rule, compare the printed definition with the rows, re-verify the statuses against the library (code or a probe) and add or fix rows. Update the version in the title.
3. Mark the reviewed rules: `npx tsx scripts/grammar-rules.ts --update-fingerprints docs/likec4-coverage.md RuleA RuleB ...`. Only the named rules are refreshed; naming a rule whose fingerprint is already current is an error, and nothing is written when any name is wrong. New main rows get their fingerprint the same way after they are written.
4. Run `--check` again; it must pass.

## Planned order of work

Deployment model → views (read, update, remove, rules) → specification CRUD and reference handling on remove / rename → relationships (kind, direction, placement, remove selector) → CLI parity → styling and niche constructs (`global`, `import`, `likec4lib`, notation, colors, dynamic flows).

Not yet placed in that order: writing multi-line values of string properties other than metadata and keeping Markdown strings when a value is replaced, preservation of the remaining written forms (separators of regenerated links), project configuration (see [Outside the grammar](#outside-the-grammar)).

## Document root

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `LikeC4Grammar` | a `.c4` file | partial | no | n/a | n/a | Entry rule: top-level blocks `imports`, `specifications`, `models`, `views`, `globals`, `deployments`, `likec4lib`. `specification` and `model` blocks of every file are read; the others are not. No top-level block is ever created or removed: root-level elements and relationships go into the first `model` block of the first file that has one, views into the first `views` block of the first file that has one. <!-- grammar-hash: 3cb86ce8359a --> |

## Specification

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `SpecificationRule` | `specification { ... }` | partial | no | n/a | no | `getSpecification()` lists element kinds (grammar feature `elements`; `getSpecification().elementKinds`), tags (`tags`; `getSpecification().tags`) and relationship kinds (`relationships`; `getSpecification().relationshipKinds`) over all files; custom colors (`colors`) and deployment node kinds (`deploymentNodes`) are not listed. `name` holds the keyword `specification`. No block or entry is created, changed or removed. <!-- grammar-hash: 3b71d62c6855 --> |
| `ElementKind` | `element service` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `SpecificationElementKind`. <!-- grammar-hash: a4f14cabe706 --> |
| `Tag` | `tag deprecated` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `SpecificationTag`. <!-- grammar-hash: 9b44154c766e --> |
| `RelationshipKind` | `relationship async` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `SpecificationRelationshipKind`. <!-- grammar-hash: 2b75290e09c7 --> |
| `CustomColor` | `color brand #3b82f6` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `SpecificationColor`. <!-- grammar-hash: bf52848cf8f3 --> |
| `DeploymentNodeKind` | `deploymentNode zone` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `SpecificationDeploymentNodeKind`. <!-- grammar-hash: ace347188dee --> |
| `SpecificationElementKind` | `element service { #backend technology 'Node' }` | partial | no | no | no | `element` declaration: the `kind` name is in `getSpecification().elementKinds`; its defaults (`props`, `tags`) are in `ElementInfo.fromSpecification` and `WorkspaceIndex.elementKind()`, see sub-rows. Kinds cannot be added, renamed or removed. <!-- grammar-hash: 934640be4f9f --> |
| `SpecificationElementKind` › `tags` | `element service { #backend }` | yes | no | no | no | Read as `fromSpecification.tags` and as the first part of the effective tags. |
| `SpecificationElementKind` › `LinkProperty` | `element service { link https://wiki 'Guide' }` | yes | no | no | no | Read as `fromSpecification.links`; effective links of an element without own links. |
| `SpecificationElementKind` › `ElementStyleProperty` | `element service { style { shape cylinder } }` | no | no | no | no | Kind styles are not read. |
| `SpecificationElementStringProperty` | `technology 'Node'` in a kind | partial | no | no | no | Keys (`key`): see sub-rows; `value` is a `MarkdownOrString`. Element kinds only: deployment node kinds are not read at all. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: ae00e68965ad --> |
| `SpecificationElementStringProperty` › `title` / `summary` / `description` / `technology` | `title 'Service'` in a kind | yes | no | no | no | Read as `KindDefaults` (normalized like effective values) and applied to the effective values of elements of the kind. |
| `SpecificationElementStringProperty` › `notation` | `notation 'Service'` in a kind | no | no | no | no | Not read. |
| `SpecificationDeploymentNodeKind` | `deploymentNode zone { title 'Zone' }` | no | no | no | no | `deploymentNode` declaration (`kind`, `tags`, `props`): not in `getSpecification()`, no defaults read. <!-- grammar-hash: f2de1f8da316 --> |
| `SpecificationTag` | `tag critical { color red }` | partial | no | no | no | `tag` declaration: the `tag` name is in `getSpecification().tags`. Tags cannot be added or removed. <!-- grammar-hash: bebc1c4bb2c7 --> |
| `SpecificationTag` › `color` | `tag critical { color #ff0000 }` | no | no | no | no | Tag `color` (`ColorRef` or a `ColorLiteral`): not read or written. |
| `SpecificationColor` | `color brand #3b82f6` | no | no | no | no | `color` declaration (`name`, `color` literal): custom colors are neither read nor written; a style can only refer to one by name. <!-- grammar-hash: e2bac7591bfb --> |
| `SpecificationRelationshipKind` | `relationship async { line dashed }` | partial | no | no | no | `relationship` declaration: the `kind` name is in `getSpecification().relationshipKinds`; defaults (`props`, `tags`) in `RelationshipInfo.fromSpecification` and `WorkspaceIndex.relationshipKind()`, see sub-rows. <!-- grammar-hash: 6b055506c8d5 --> |
| `SpecificationRelationshipKind` › `tags` | `relationship async { #queue }` | yes | no | no | no | Read as `fromSpecification.tags` and as the first part of the effective tags. |
| `SpecificationRelationshipKind` › `LinkProperty` | `relationship async { link https://wiki }` | yes | no | no | no | Read as `fromSpecification.links`. |
| `SpecificationRelationshipKind` › `RelationshipStyleProperty` / `MultipleProperty` | `relationship async { line dashed  multiple true }` | no | no | no | no | Kind styles and `multiple` are not read. |
| `SpecificationRelationshipStringProperty` | `title 'Asynchronous'` in a relationship kind | partial | no | no | no | Keys (`key`): see sub-rows; `value` is a `MarkdownOrString`. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: fbf8dc7f9f67 --> |
| `SpecificationRelationshipStringProperty` › `title` / `description` / `technology` | `technology 'Kafka'` in a relationship kind | yes | no | no | no | Read as `KindDefaults` and applied to the effective values of relationships of the kind. |
| `SpecificationRelationshipStringProperty` › `notation` | `notation 'Async'` in a relationship kind | no | no | no | no | Not read. |

## Model

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Model` | `model { ... }` | yes | no | n/a | no | Every `model` block (`name` holds the keyword) of every file is indexed; its `elements` have the rows below. The block is never created or removed: `addElement(null, ...)` and `addRelationship` need an existing one. <!-- grammar-hash: f52a9629b3df --> |
| `ModelElement` | element, relation or extend | n/a | n/a | n/a | n/a | Alternative of `ExtendElementOrRelation`, `Relation`, `Element`. <!-- grammar-hash: 8e5110efe6a7 --> |
| `Element` | `api = service 'API' 'summary' 'Node'` | yes | partial | partial | partial | Declaration with `kind`, `name`, inline strings (`props`) and an optional `body`. `getElement` / `listElements` (also elements declared in `extend` bodies); `addElement`, `updateElement`, `removeElement` with the limits in the sub-rows. <!-- grammar-hash: 9d329064c24b --> |
| `Element` › `name = kind` | `api = service` | yes | partial | partial | partial | The only form `addElement` writes: into the end of the parent's `{ }` body (the parent must already have one: `Parent element ... has no body`), or for a root element into the end of the first `model` block of the first file that has one. A file cannot be chosen, and a child is never added to an `extend` block. The name must be one `Id` token that is not a reserved word (`this`, `it`, `self`, `super`, `likec4lib`, `global`) and not already declared at that FQN in a loaded file — a sibling in the parent's body or in an `extend` of it, in any file, or another root element (LikeC4: `Duplicate element name`); `kind` must be one `Id` token declared as an element kind by a specification of a loaded file. A violation is rejected before writing (`InvalidWriteError`, field `name` / `kind`). |
| `Element` › `kind name` | `service api` | yes | no | partial | partial | Read; never written. Its properties are updated and it is removed like the other form (verified); children can be added into its body. |
| `Element` › inline strings (`props`) | `= service 'Title' 'summary' 'technology'` | yes | partial | partial | no | Read as title, summary, technology (a fourth string is ignored by LikeC4 and the library). The docs' *Description* section shows the second string as a description; LikeC4 1.59.4 reads it as the summary (verified against LikeC4's computed model: `a = service 'T' 'S' 'Tech'` gives summary `S`, no description). `addElement` writes only the title inline (summary, description, technology go into the body; empty strings are dropped). `updateElement` replaces an inline summary / technology in place. Cannot be removed. |
| `Element` › `body` | `api = service { ... }` | yes | partial | partial | n/a | Created by `addElement` when a property besides the title is given and by `updateElement` when a property needs it; `addElement` cannot create one in an existing parent. |
| `Element` › rename, move, change `kind` | `api` → `gateway`, `cloud.api` → `edge.api` | n/a | n/a | no | n/a | `updateElement` changes properties only; references are never rewritten. |
| `Element` › removal | `removeElement('cloud.api')` | n/a | n/a | n/a | partial | Removes the declaration with its subtree, the relationships of the subtree, its `extend` blocks and `extend a -> b` blocks of removed relationships. References elsewhere are left dangling and LikeC4 then reports errors: view `of`, `include` / `exclude` predicates and `with` predicates, dynamic view steps, deployment `instanceOf` (verified with LikeC4's validator; see [Outside the grammar](#outside-the-grammar)). |
| `ElementBody` | `{ ... }` after an element | n/a | n/a | n/a | n/a | Body of `Element`: `tags`, `props`, nested `elements` (elements and relations), rated in their own rows; its creation in `Element` › `body`. <!-- grammar-hash: 1ddce6cfa7a6 --> |
| `ElementProperty` | any element body property | n/a | n/a | n/a | n/a | Alternative of `ElementStringProperty`, `ElementStyleProperty`, `LinkProperty`, `IconProperty`, `MetadataProperty`. <!-- grammar-hash: 027a6b0de072 --> |
| `ElementStringProperty` | `description 'Main API'` | partial | partial | partial | no | Keys (`key`): see sub-rows; `value` is a `MarkdownOrString` (single-line string when written). Element bodies: read (effective, kind defaults and inline values applied), written by `addElement`, replaced by `updateElement` (every declaration of the key is rewritten). A property cannot be removed. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: f8b951dfd2cf --> |
| `ElementStringProperty` › `title` | `title 'API'` | yes | partial | partial | no | In element bodies (other places: the `with { }` and deployment sub-rows below). `addElement` writes the title inline after the kind; `updateElement` rewrites the inline and every body `title`. `''` at add is dropped (the element name is the title). A `\/` in the title value is written as is, as for view titles (see `ViewStringProperty` › `title`); LikeC4 and the library read it as `/`, and the implicit view of the element is not put into a folder by it (verified). |
| `ElementStringProperty` › `summary` | `summary 'Edge API'` | yes | partial | partial | no | In element bodies. `addElement` drops `summary: ''`; `updateElement` writes `''` (into the body when the summary is inline). Reported as written: the docs' "falls back to `description`" is a display rule; LikeC4's computed model has no summary for an element with only a description either (verified). |
| `ElementStringProperty` › `description` / `technology` | `technology 'Go'` | yes | partial | partial | no | In element bodies. `addElement` drops `''`; `updateElement` writes it. |
| `ElementStringProperty` › in `with { }` | `include api with { title 'API' }` | no | text | no | no | Inside `CustomElementProperties` of a view predicate. |
| `ElementStringProperty` › in deployment node / instance bodies | `prod = zone { title 'Prod' }` | no | no | no | no | Deployment is not supported. |
| `ExtendElementOrRelation` | `extend app { ... }`, `extend a -> b { ... }` | yes | no | partial | partial | `extend` of an element or of a relation; see the two AST types below (`source`, `target`, `title`, `element`, `body`). No block is created; a block is never removed on its own. <!-- grammar-hash: d812a7d45824 --> |
| `ExtendElementOrRelation` › `ExtendElement` | `extend app { #critical }` | yes | no | partial | partial | `element` and `body`: read as `ElementInfo.extendedBy` and `WorkspaceIndex.extendBlocks()`, contributions merged into effective values; nested elements and relations are read and editable. `updateElement` moves patched tags / links / metadata keys out of every block of the element into the declaration (a block left empty stays). Removed by `removeElement` of the element or an ancestor. |
| `ExtendElementOrRelation` › `ExtendRelation` | `extend api -[calls]-> db 'reads' { ... }` | yes | no | partial | partial | `source`, connector, `target`, `title`, `body`: read as `RelationshipInfo.extendedBy` and `WorkspaceIndex.extendRelationBlocks()` (LikeC4's matching rules, README). `updateRelationship` moves patched properties out of matching blocks and rewrites their `title` on a `label` change; updates that would change a block shared by another relationship are rejected. Blocks left matching nothing are removed by `removeRelationship` / `removeElement`. A relation without a title and one with `''` match the same blocks, as the docs state (`a -> b ''` with `extend a -> b { #t }`, and `a -> b` with `extend a -> b '' { #u }`, both apply; verified against LikeC4's computed model and the library). |
| `ExtendElementBody` | `{ ... }` after `extend app` | n/a | n/a | n/a | n/a | Body of an element `extend`: `tags`, `props` (`ExtendElementProperty`), nested `elements` (read as children / relationships). <!-- grammar-hash: 5898567eeb90 --> |
| `ExtendElementProperty` | `link ...` / `metadata { }` in an extend | n/a | n/a | n/a | n/a | Alternative of `LinkProperty`, `MetadataProperty`. <!-- grammar-hash: 6b48f778a5ad --> |
| `ExtendRelationBody` | `{ ... }` after `extend a -> b` | n/a | n/a | n/a | n/a | Body of a relation `extend`: `tags` and `props` (`ExtendRelationProperty`). <!-- grammar-hash: 03009f7e33bb --> |
| `ExtendRelationProperty` | `link ...` / `metadata { }` in a relation extend | n/a | n/a | n/a | n/a | Alternative of `LinkProperty`, `MetadataProperty`. <!-- grammar-hash: b81de5808635 --> |
| `Relation` | `api -> db 'reads' 'desc' 'JDBC' #db { ... }` | yes | partial | partial | partial | `source`, connector (`RelationConnector`, direction not reported), `target`, inline `title` / `description` / `technology`, line `tags`, `body`. `getRelationships()` with `this` / `it` resolved to FQNs; limits in the sub-rows. <!-- grammar-hash: f8068b058a79 --> |
| `Relation` › top level of `model` | `api -> db` in `model { }` | yes | partial | partial | partial | `addRelationship` appends `source -> target 'label'` at the end of the first `model` block of the first file that has one; endpoints are written as given after checking that they resolve, as LikeC4 links them from that `model` block, to elements of the loaded files and are neither the same element nor parent and child (LikeC4: `Could not resolve reference`, `Invalid parent-child relationship`); otherwise rejected before writing. |
| `Relation` › nested in an element or `extend` body | `api = service { -> db }` | yes | no | partial | partial | Read with the enclosing element as source. Never written there. |
| `Relation` › without `source` | `-> db 'reads'` in a body | yes | no | partial | partial | Read; updated and removed like other relations (verified). |
| `Relation` › inline `title` / `description` / `technology` | `a -> b 'title' 'desc' 'tech'` | yes | partial | partial | no | `addRelationship` writes the label inline, description and technology in the body (empty strings dropped). `updateRelationship` replaces inline values in place. |
| `Relation` › `tags` on the line | `a -> b 'x' #async` | yes | no | partial | partial | `addRelationship` writes tags in the body. `updateRelationship({ tags })` replaces line tags where the relation has them (`[]` clears). |
| `Relation` › `body` | `a -> b { ... }` | yes | partial | partial | n/a | Created by `addRelationship` when properties are given and by `updateRelationship` when needed. |
| `Relation` › change endpoints, kind, direction | `a -> b` → `a -> c` | n/a | n/a | no | n/a | `updateRelationship` changes properties only (`matchKind` / `matchTitle` select among several). |
| `Relation` › removal selector | `removeRelationship('a', 'b')` | n/a | n/a | n/a | partial | Removes the first match by endpoints (first file in load order); no kind / title selector. |
| `RelationConnector` | `->`, `<->`, `-[async]->`, `.async` | partial | partial | no | n/a | Fragment of `Relation`, `DeploymentRelation`, `ExtendElementOrRelation`: `kind`, `dotKind`, `isBidirectional`. Only `->` is written; kind and direction cannot be changed. <!-- grammar-hash: f710d43750a6 --> |
| `RelationConnector` › `->` | `a -> b` | partial | partial | n/a | n/a | Model relationships and their `extend` blocks: read; written by `addRelationship`. Deployment relations (`DeploymentRelation`): not read or written. |
| `RelationConnector` › `<->` (`isBidirectional`) | `a <-> b` | partial | no | no | n/a | The relationship is read, its direction is not reported (`RelationshipInfo` has no bidirectional flag); used for `extend` matching. |
| `RelationConnector` › `-[kind]->` (`kind`) | `a -[async]-> b` | partial | no | no | n/a | Model relationships: kind read as `RelationshipInfo.kind`; `matchKind` selects by it. Deployment relations: not read. |
| `RelationConnector` › `-[kind]<->` | `a -[async]<-> b` | partial | no | no | n/a | Kind read, direction not reported. |
| `RelationConnector` › `.kind` (`dotKind`) | `a .async b` | partial | no | no | n/a | Model relationships: kind read (`RelationKindDotRef`). Deployment relations: not read (verified). |
| `RelationBody` | `{ ... }` after a relation | n/a | n/a | n/a | n/a | Body of `Relation`: `tags` and `props` (`RelationProperty`). <!-- grammar-hash: 12546e670426 --> |
| `RelationProperty` | any relation body property | n/a | n/a | n/a | n/a | Alternative of `RelationStringProperty`, `RelationNavigateToProperty`, `RelationStyleProperty`, `LinkProperty`, `MetadataProperty`. <!-- grammar-hash: af3680b9605e --> |
| `RelationStringProperty` | `technology 'gRPC'` | partial | partial | partial | no | Keys (`key`): see sub-rows; `value` is a `MarkdownOrString`. Model relationships: read (effective), written by `addRelationship`, replaced by `updateRelationship` (every body declaration rewritten). A property cannot be removed. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: 08d2c46ba9d4 --> |
| `RelationStringProperty` › `title` | `title 'reads'` in a relation body | yes | no | partial | no | In model relationship bodies (other places: the `with { }` and deployment sub-rows below). `addRelationship` writes the label inline; `updateRelationship({ label })` rewrites body titles too. |
| `RelationStringProperty` › `description` / `technology` | `description 'Reads users'` | yes | partial | partial | no | In model relationship bodies. Written in the body by `addRelationship`; replaced by `updateRelationship`. |
| `RelationStringProperty` › in `with { }` | `include a -> b with { title 'x' }` | no | text | no | no | Inside `CustomRelationProperties` of a view predicate; not in dynamic steps. |
| `RelationStringProperty` › in deployment relations | `x -> y { description 'd' }` in `deployment` | no | no | no | no | Deployment is not supported. |
| `RelationStyleProperty` | `style { line dashed }` in a relation | no | partial | partial | no | `style` block (`key`, `props`) of model relationships: `addRelationship({ style })`, `updateRelationship({ style })` merges per field in place, as for elements (verified with tests). Each value is checked before writing (keywords of `LineOptions` / `ArrowType`, a theme color or a custom color declared in a loaded file). Not read; a field or the block cannot be removed; deployment relations not supported. <!-- grammar-hash: 57941df581fc --> |
| `MetadataProperty` | `metadata { owner 'team-a' }` | partial | partial | partial | partial | `metadata` of elements, relationships and their `extend` blocks: read (effective and `declared`, only the first block of a body counts, as in LikeC4), written by `addElement` / `addRelationship`, merged by `updateElement` / `updateRelationship({ metadata })`, keys removed with `null` (an emptied block is removed). Deployment nodes, instances and relations: not supported. <!-- grammar-hash: 7638813ad040 --> |
| `MetadataBody` | `{ key 'value' }` | n/a | n/a | n/a | n/a | Body of `MetadataProperty`: `props` (`MetadataAttribute`). <!-- grammar-hash: 3b1c118761fe --> |
| `MetadataAttribute` | `owner 'team-a'`, `enabled true` | partial | partial | partial | partial | `key` with a string or array `value` (`MetadataValue`) or a `boolValue`; places as `MetadataProperty`; `null` in a patch removes the key. Comments in the block are kept, patched keys edited in place. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: e40b7cc2ece0 --> |
| `MetadataAttribute` › string `value` | `owner 'team-a'` | partial | partial | partial | partial | Elements, relationships and their `extend` blocks; deployment nodes, instances and relations: not read (see `MetadataProperty`). Read (dedented, trimmed, empty values dropped in effective values). Written and replaced as a single-line `'...'` string; a value with line breaks (the docs' use case for YAML or JSON in metadata), also as an array item, as a Markdown string `'''...'''` with its lines one level deeper than the key, which the library and LikeC4's model builder read back as the value written (verified with tests, quotes, backslashes and empty lines included). LikeC4 dedents and trims every metadata value, so leading or trailing whitespace and indentation shared by all lines are not kept, written either way. |
| `MetadataAttribute` › `boolValue` | `enabled true` | partial | no | no | partial | Read as the string `'true'` / `'false'`; cannot be written as a boolean (an upsert writes a string); removed with `null`. |
| `MetadataValue` | `'v'` or `['a', 'b']` | n/a | n/a | n/a | n/a | Alternative of `MarkdownOrString`, `MetadataArray`. <!-- grammar-hash: 5bd9731d396d --> |
| `MetadataArray` | `['a', 'b']` | partial | partial | partial | partial | Array `values` (`,`-separated): read as `string[]` (a one-value array reads as a string in effective values), written and upserted from `string[]`, removed with its key. Places as `MetadataProperty`. <!-- grammar-hash: 90d6033e845d --> |

## Deployment

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ModelDeployments` | `deployment { ... }` | no | no | n/a | no | `deployment` block (`name`, `elements`): not indexed, never created. <!-- grammar-hash: 25dd2d92ed41 --> |
| `DeploymentNode` | `prod = zone 'Production' { ... }` | no | no | no | no | Node with `kind`, `name`, inline `title` / `summary`, `body`. <!-- grammar-hash: 4a775d903482 --> |
| `DeploymentNode` › `name = kind` / `kind name` | `prod = zone`, `zone prod` | no | no | no | no | Both declaration forms. |
| `DeploymentNodeBody` | `{ ... }` after a node | n/a | n/a | n/a | n/a | Body of `DeploymentNode`: `tags`, `props` (`ElementProperty`), nested `elements` (nodes, instances, relations). <!-- grammar-hash: f66a4aac5170 --> |
| `DeployedInstance` | `api = instanceOf cloud.api` | no | no | no | no | `instanceOf` with `target`, optional `name`, inline `title` / `summary`, `body`, optional `;`. Semantics to define before support (LikeC4 docs): an instance inherits properties and styling from the element and may override them; in view filters its tags are those of the model element combined with its own, its metadata replaces the model element's, and tags are not inherited from parent nodes. <!-- grammar-hash: 54b7ab6c8c41 --> |
| `DeployedInstance` › named / unnamed | `api = instanceOf cloud.api`, `instanceOf cloud.api` | no | no | no | no | Unnamed instances take the element's name. |
| `DeployedInstanceBody` | `{ ... }` after an instance | n/a | n/a | n/a | n/a | Body of `DeployedInstance`: `tags`, `props` (`ElementProperty`), relation `elements`. <!-- grammar-hash: a64dd42dc911 --> |
| `ExtendDeployment` | `extend prod { #eu }` | no | no | no | no | `extend` of a `deploymentNode` with a `body`. <!-- grammar-hash: e6574a7b376e --> |
| `ExtendDeploymentBody` | `{ ... }` after `extend prod` | n/a | n/a | n/a | n/a | Body of `ExtendDeployment`: `tags`, `props`, `elements`. <!-- grammar-hash: bcad020538c6 --> |
| `DeploymentRelation` | `prod.api -> prod.db 'reads'` | no | no | no | no | `source`, connector, `target`, inline `title` / `description` / `technology`, `tags`, `body`. Not returned by `getRelationships()` (verified). LikeC4 docs: deployment relationships cannot be extended (`extend` of relationships is for the logical model only). <!-- grammar-hash: 3d9f57ca0c50 --> |
| `DeploymentRelationBody` | `{ ... }` after a deployment relation | n/a | n/a | n/a | n/a | Body of `DeploymentRelation`: `tags` and `props` (`RelationProperty`). <!-- grammar-hash: 2e46f7e64bcd --> |

## Views

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ModelViews` | `views 'Folder' { ... }` | no | no | n/a | no | `views` block (`name`, `views`, `styles`): not read, never created: `addView` writes into the first `views` block of the first file that has one. <!-- grammar-hash: 402f20b0a9df --> |
| `ModelViews` › `folder` | `views 'Team A' { }` | no | no | no | no | The folder string cannot be read, set or chosen. |
| `ModelViews` › `styles` | `views { style * { color muted } }` | no | no | no | no | Shared view styles of the block (`ViewRuleStyleOrGlobalRef`). |
| `LikeC4ViewRule` | element, dynamic or deployment view | n/a | n/a | n/a | n/a | Alternative of `DynamicView`, `DeploymentView`, `ElementView`. <!-- grammar-hash: d844cd1f7bd5 --> |
| `ElementView` | `view api of cloud.api { ... }` | no | partial | no | no | `view` with `name`, `of` / `extends`, `body`. `addView({ type: 'element', id, target, title, includes, autoLayout })`; without includes writes `include *`. Existing views cannot be listed, changed or removed. <!-- grammar-hash: 7626d9dc660d --> |
| `ElementView` › `of` (`viewOf`) | `view api of cloud.api` | no | partial | no | no | `target` written as given after checking that it is an element reference (dot-separated `Id` tokens) that resolves to an element of the loaded files; otherwise rejected before writing. |
| `ElementView` › `extends` | `view b extends index { }` | no | no | no | no | |
| `ElementView` › unnamed | `view of cloud.api { }` | no | no | no | no | Not written: `addView` rejects an `id` that is empty, not one `Id` token or a reserved word, and an `id` already used by a view of any type in a loaded file (LikeC4: `Duplicate view`), before writing. LikeC4 docs: an unnamed view cannot be referenced. |
| `DeploymentView` | `deployment view prod { ... }` | no | partial | no | no | `deployment` `view` with `name` and `body`: `addView({ type: 'deployment', id, title, includes, autoLayout })`; `target` is ignored. <!-- grammar-hash: 77356df0ada0 --> |
| `ViewRef` | `navigateTo index` (target) | no | text | no | no | Reference (`view`) of `NavigateToProperty`: written only inside a `with { }`; not resolved; views are never renamed or removed. <!-- grammar-hash: b51c0b630894 --> |
| `ElementViewRef` | `view b extends index` (target) | no | no | no | no | Reference (`view`) of `ElementView` › `extends` (not supported). <!-- grammar-hash: 701294c1b225 --> |
| `ElementViewBody` | `{ ... }` of an element view | n/a | n/a | n/a | n/a | Body of `ElementView`: `tags`, `props` (`ViewProperty`), `rules` (`ViewRule`). <!-- grammar-hash: 8a00bced1fc3 --> |
| `ViewProperty` | any view property | n/a | n/a | n/a | n/a | Alternative of `ViewStringProperty`, `ViewOrderProperty`, `LinkProperty`. <!-- grammar-hash: c89f22df9027 --> |
| `ViewStringProperty` | `title 'Overview'` | no | partial | no | no | Keys (`key`) `title`, `description`; `value` is a `MarkdownOrString`. Optional `:` / `;`: see [Text form](#text-form-and-preservation). <!-- grammar-hash: 6151390c236e --> |
| `ViewStringProperty` › `title` | `title 'Overview'` | no | partial | no | no | `addView({ title })` only, single-line; cannot be read or changed later. Written before the rules, as LikeC4 requires (properties before predicates; verified). A `/` in the title puts the view into a folder and `\/` is a literal slash (LikeC4 docs); the title value uses the same notation and `\/` is written as is, any other `\` escaped: `'Cost \/ Benefit'` gives the view `Cost / Benefit` without folder, `'Deployment / Prod'` the view `Prod` in the folder `Deployment` (verified with LikeC4's computed views). A backslash right before a folder separator cannot be expressed, in LikeC4 either. |
| `ViewStringProperty` › `description` | `description 'All services'` | no | no | no | no | Cannot be written. |
| `ViewOrderProperty` | `order 10` | no | no | no | no | `order` (`key`, numeric `value`, optional `;`). <!-- grammar-hash: 7002481dd88e --> |
| `ViewLayoutDirection` | `LeftRight` | n/a | n/a | n/a | n/a | Keyword values of `ViewRuleAutoLayout`: `TopBottom`, `LeftRight`, `BottomTop`, `RightLeft`. <!-- grammar-hash: c924caa0d274 --> |
| `ViewRule` | any element view rule | n/a | n/a | n/a | n/a | Alternative of the element view rule rows. <!-- grammar-hash: 8cd485a93793 --> |
| `ViewRuleRank` | `rank same { a, b }` | no | no | no | no | `rank` with a `value` (`RankValue`) and `targets` (`FqnExpressions`). <!-- grammar-hash: 5903d54c3ead --> |
| `RankValue` | `same`, `min`, `max`, `source`, `sink` | n/a | n/a | n/a | n/a | Keyword values of `ViewRuleRank`: `same`, `min`, `max`, `source`, `sink`. <!-- grammar-hash: 826819730c4e --> |
| `ViewRuleGroup` | `group 'Backend' { include ... }` | no | no | no | no | `group` with an optional `title`. <!-- grammar-hash: f9741f0ec1f2 --> |
| `ViewRuleGroup` › `props` | `group { color amber  border dashed  opacity 20% }` | no | no | no | no | `ColorProperty`, `BorderProperty`, `OpacityProperty` of a group. |
| `ViewRuleGroup` › `groupRules` | nested `group`, `include`, `global predicate` | no | no | no | no | Predicates, global predicates and nested groups inside a group. |
| `ViewRulePredicate` | `include *`, `exclude x` | no | partial | no | no | `include` / `exclude` (`isInclude`) of `exprs` (`Expressions`). Rules of existing views cannot be read, added, changed or removed. <!-- grammar-hash: 69d112a94b38 --> |
| `ViewRulePredicate` › `include` | `include *, cloud.api` | no | partial | no | no | At creation only: `addView({ includes })`, one rule per item, each checked to parse as exactly one `include` rule (its content is `text`, see `Expressions`). |
| `ViewRulePredicate` › `exclude` | `exclude cloud.legacy` | no | no | no | no | An `includes` item that forms an `exclude` is rejected (smuggling through `autoLayout` is not counted). |
| `ViewRuleGlobalPredicateRef` | `global predicate common` | no | no | no | no | `global` `predicate` reference (`predicate`). <!-- grammar-hash: 981284211975 --> |
| `ViewRuleStyle` | `style * { color muted }` | no | no | no | no | `style` rule with `targets` (`FqnExpressions`) and `props` (`StyleProperty`, `NotationProperty`). <!-- grammar-hash: 1f7a23009ab0 --> |
| `ViewRuleGlobalStyle` | `global style mute` | no | no | no | no | `global` `style` reference (`style`). <!-- grammar-hash: 836024edc4e3 --> |
| `ViewRuleStyleOrGlobalRef` | style or global style | n/a | n/a | n/a | n/a | Alternative of `ViewRuleStyle`, `ViewRuleGlobalStyle`. <!-- grammar-hash: 44aeb8151d55 --> |
| `ViewRuleAutoLayout` | `autoLayout LeftRight 120 80` | no | partial | no | no | `autoLayout`: written by the library's `addView({ autoLayout })` (default `TopBottom`, `''` omits it) after checking that the value forms exactly one `autoLayout` rule; `apply` always writes `TopBottom`. Cannot be read or changed later. <!-- grammar-hash: b10f0d4c780e --> |
| `ViewRuleAutoLayout` › `direction` | `autoLayout LeftRight` | no | partial | no | no | One of the `ViewLayoutDirection` keywords; any other value (`Sideways`) or text after the rule is rejected before writing. |
| `ViewRuleAutoLayout` › `rankSep` / `nodeSep` | `autoLayout TopBottom 120 80` | no | partial | no | no | Only as part of the `autoLayout` string (`'LeftRight 120 40'`); each must be a whole number (`Number`), otherwise rejected. |
| `DeploymentViewBody` | `{ ... }` of a deployment view | n/a | n/a | n/a | n/a | Body of `DeploymentView`: `tags`, `props` (`ViewProperty`), `rules` (`DeploymentViewRule`). <!-- grammar-hash: ac6417e0712d --> |
| `DeploymentViewRule` | any deployment view rule | n/a | n/a | n/a | n/a | Alternative of the deployment view rule rows. <!-- grammar-hash: 0669d217b9b7 --> |
| `DeploymentViewRulePredicate` | `include prod.**` | no | partial | no | no | `include` / `exclude` (`isInclude`) of `expr` (`Expressions`); `include` at creation only (`addView({ type: 'deployment', includes })`), `exclude` items are rejected. LikeC4 docs: `with` expressions in deployment views are not supported yet (`include * with { color: red } // does not work`); an `includes` item with `with { }` is rejected before writing. <!-- grammar-hash: 0cc9e3e8c6ff --> |
| `DeploymentViewRuleStyle` | `style prod.* { color red }` | no | no | no | no | `style` rule with `targets` and `props`. A deployment view has no `global style` rule in 1.59.4 (see [Documented but not in LikeC4 1.59.4](#documented-but-not-in-likec4-1594)). <!-- grammar-hash: 61f40811ee7c --> |
| `ViewRuleAncestors` | `includeAncestors true` | no | no | no | no | `includeAncestors` (`key`, boolean `value`, optional `:` / `;`). <!-- grammar-hash: b1c5bc577bc3 --> |
| `NotationProperty` | `notation 'Service'` | no | text | no | no | `notation` (`key`, `value`; optional `:` / `;`): only in a `with { }` of an `includes` item; view `style` rules, deployment view styles and global styles are not supported (kind notation: `SpecificationElementStringProperty`). <!-- grammar-hash: 444f29c51f0d --> |
| `NotesProperty` | `notes 'Retries 3 times'` | no | text | no | no | `notes` (`key`, `value`; optional `:` / `;`): only in a `with { }` of an `includes` item; not in dynamic steps. <!-- grammar-hash: d57c3922c13b --> |
| `CustomElementProperties` | `include api with { title 'API' }` | no | text | no | no | The `with { }` `props` of an element predicate. In deployment views ignored by LikeC4 (docs). <!-- grammar-hash: 5a9842898a64 --> |
| `CustomRelationProperties` | `include a -> b with { line dotted }` | no | text | no | no | The `with { }` `props` of a relation predicate (text) or the body of a dynamic step (not supported). In deployment views ignored by LikeC4 (docs). <!-- grammar-hash: 636dc7f1e1f8 --> |
| `NavigateToProperty` | `with { navigateTo apiView }` | no | text | no | no | `navigateTo` (`key`, `value`: `ViewRef`) in a `with { }` of an element predicate. <!-- grammar-hash: 1dafa4962f5e --> |
| `RelationNavigateToProperty` | `navigateTo flowView` in a relation | no | text | no | no | `navigateTo` (`key`, `value`: `DynamicViewRef`): only in a `with { }` of an `includes` item; not in a relation body (`updateRelationship` has no `navigateTo`) or a step. <!-- grammar-hash: 2b13eaa3dcac --> |
| `Expressions` | `a, b -> c` | no | text | no | no | `,`-separated `value`s (`ExpressionV2`) of one rule: any form LikeC4 accepts after `include`, without a structured API. <!-- grammar-hash: c234b0c018b4 --> |
| `ExpressionV2` | element or relation predicate | n/a | n/a | n/a | n/a | Alternative of `RelationExprOrWith`, `FqnExprOrWith`. <!-- grammar-hash: 7b220219149d --> |
| `FqnExprOrWith` | `api with { ... }` | no | text | no | no | `with` and its `custom` properties on an element predicate. In deployment views ignored by LikeC4 (docs). <!-- grammar-hash: 916bf6316be0 --> |
| `FqnExprOrWith` › `FqnExprWith` | `api with { title 'API' }` | no | text | no | no | AST type of the `with` form. |
| `FqnExprOrWhere` | `* where kind is service` | no | text | no | no | `where` condition (`where`) on an element predicate. <!-- grammar-hash: 503f63e12b8a --> |
| `FqnExprOrWhere` › `FqnExprWhere` | `* where tag is #db` | no | text | no | no | AST type of the `where` form. |
| `RelationExprOrWith` | `a -> b with { ... }` | no | text | no | no | `with` and its `custom` properties on a relation predicate. In deployment views ignored by LikeC4 (docs). <!-- grammar-hash: 8796a4b18ddf --> |
| `RelationExprOrWith` › `RelationExprWith` | `a -> b with { line dotted }` | no | text | no | no | AST type of the `with` form. |
| `RelationExprOrWhere` | `a -> b where tag is #async` | no | text | no | no | `where` condition (`where`) on a relation predicate. <!-- grammar-hash: d82def40d6c3 --> |
| `RelationExprOrWhere` › `RelationExprWhere` | `* -> * where kind is async` | no | text | no | no | AST type of the `where` form. |
| `FqnExpr` | `*`, `api`, `element.kind = service` | no | text | no | no | Element predicate: see sub-rows and `FqnRefExpr`. Also the targets of `rank` / `style` rules (not supported). <!-- grammar-hash: 6eb1c9c2baba --> |
| `FqnExpr` › `WildcardExpression` (`isWildcard`) | `*` | no | text | no | no | `include *` is also the default of a new element view. |
| `FqnExpr` › `ElementTagExpression` (`tag`) | `element.tag = #db` | no | text | no | no | No deprecation diagnostic from LikeC4 1.59.4 on `element.kind` (verified); `element.tag` not probed. LikeC4 docs on `element.kind` / `element.tag`: "These predicates may be deprecated in the future, please consider `where` operator". |
| `FqnExpr` › `ElementKindExpression` (`kind`) | `element.kind != service` | no | text | no | no | As text of an `includes` item. |
| `FqnRefExpr` | `cloud.*`, `cloud.**`, `cloud._` | no | text | no | no | `ref` with an optional `selector` (children, descendants, expanded). <!-- grammar-hash: 4629bbf8138e --> |
| `RelationExpr` | relation predicate | n/a | n/a | n/a | n/a | Alternative of `InOutRelationExpr`, `DirectedRelationExpr`. <!-- grammar-hash: 1467629de1ed --> |
| `InOutRelationExpr` | `-> api ->` | no | text | no | no | Incoming expression followed by `->`: in and out. <!-- grammar-hash: a8d8577ae92a --> |
| `IncomingRelationExpr` | `-> api` | no | text | no | no | `->` and the target (`to`). The docs' incoming forms with a kind (`-[kind]-> x`, `.kind x`) are not in the 1.59.4 grammar: an `includes` item with them fails to parse and is rejected (see [Documented but not in LikeC4 1.59.4](#documented-but-not-in-likec4-1594)). <!-- grammar-hash: ab03a28a8a1b --> |
| `DirectedRelationExpr` | `a -> b` | no | text | no | no | Outgoing expression with a `target`. <!-- grammar-hash: 1fadabb6e4ac --> |
| `OutgoingRelationExpr` | `api ->`, `a <-> b`, `a -[async]-> b`, `a .async b` | no | text | no | no | `from` with a connector: sub-rows. A kind needs a source here; the incoming forms `-[kind]-> x` / `.kind x` shown in the docs do not parse in 1.59.4. <!-- grammar-hash: a8aa4c3680ca --> |
| `OutgoingRelationExpr` › `->` | `api -> *` | no | text | no | no | As text of an `includes` item. |
| `OutgoingRelationExpr` › `<->` (`isBidirectional`) | `a <-> b` | no | text | no | no | As text of an `includes` item. |
| `OutgoingRelationExpr` › `-[kind]->` (`kind`) | `a -[async]-> b` | no | text | no | no | As text of an `includes` item. |
| `OutgoingRelationExpr` › `.kind` (`dotKind`) | `a .async b` | no | text | no | no | As text of an `includes` item. |
| `FqnExpressions` | `a, b` in `rank` / `style` | no | no | no | no | `,`-separated `value`s: targets of `rank`, view `style` and `global style` rules, none of which are supported. <!-- grammar-hash: fe2de2065441 --> |
| `WhereElementExpression` | element `where` condition | n/a | n/a | n/a | n/a | Wrapper of `WhereElementOr`. <!-- grammar-hash: 53e70db67015 --> |
| `WhereElementOr` | `kind is a or kind is b` | no | text | no | no | `or` (`operator`, `right`). <!-- grammar-hash: fe0c12689f1d --> |
| `WhereElementOr` › `WhereBinaryExpression` | `tag is #a or tag is #b` | no | text | no | no | AST type of `or` / `and`. |
| `WhereElementAnd` | `tag is #a and kind is b` | no | text | no | no | `and` (`operator`, `right`). <!-- grammar-hash: eb5837b5cbeb --> |
| `WhereElementAnd` › `WhereBinaryExpression` | `tag is #a and kind is b` | no | text | no | no | AST type of `or` / `and`. |
| `WhereElementPrimary` | `( ... )` | no | text | no | no | Parenthesized condition, negation or atom. <!-- grammar-hash: 36f02dc73757 --> |
| `WhereElementNegation` | `not tag is #legacy` | no | text | no | no | `not` with a `value`. <!-- grammar-hash: 9e65b368350d --> |
| `WhereElement` | `kind is service`, `metadata.tier = 'gold'` | no | text | no | no | Atoms on `metadata` (`key`, `value`), `tag`, `kind`: sub-rows. <!-- grammar-hash: 524cf5267f30 --> |
| `WhereElement` › `WhereElementMetadata` | `metadata.tier = 'gold'`, `metadata.tier` | no | text | no | no | As text of an `includes` item. |
| `WhereElement` › `WhereElementTag` | `tag is #db` | no | text | no | no | As text of an `includes` item. |
| `WhereElement` › `WhereElementKind` | `kind is not service` | no | text | no | no | As text of an `includes` item. |
| `MetadataFilterValue` | `'gold'`, `true` | n/a | n/a | n/a | n/a | String or boolean value of a `metadata.key` condition. <!-- grammar-hash: 74e9bdd153eb --> |
| `WhereRelationExpression` | relation `where` condition | n/a | n/a | n/a | n/a | Wrapper of `WhereRelationOr`. <!-- grammar-hash: 289b315177f7 --> |
| `WhereRelationOr` | `kind is a or kind is b` | no | text | no | no | `or` (`operator`, `right`). <!-- grammar-hash: 56cf8cef50d3 --> |
| `WhereRelationOr` › `WhereBinaryExpression` | `kind is a or kind is b` | no | text | no | no | AST type of `or` / `and`. |
| `WhereRelationAnd` | `source.kind is a and tag is #x` | no | text | no | no | `and` (`operator`, `right`). <!-- grammar-hash: d6878cc72b81 --> |
| `WhereRelationAnd` › `WhereBinaryExpression` | `kind is a and tag is #x` | no | text | no | no | AST type of `or` / `and`. |
| `WhereRelationPrimary` | `( ... )` | no | text | no | no | Parenthesized condition, negation or atom. <!-- grammar-hash: 7f513640895f --> |
| `WhereRelationNegation` | `not kind is async` | no | text | no | no | `not` with a `value`. <!-- grammar-hash: 5243113e1584 --> |
| `WhereRelation` | `source.tag is #ui`, `kind is async` | no | text | no | no | Atoms on the relation or a `participant`: `metadata` (`key`, `value`), `kind`, `tag`: sub-rows. <!-- grammar-hash: 3c1c2819afe8 --> |
| `WhereRelation` › `WhereRelationParticipantMetadata` | `source.metadata.tier = 'gold'` | no | text | no | no | As text of an `includes` item. |
| `WhereRelation` › `WhereRelationParticipantKind` | `target.kind is db` | no | text | no | no | As text of an `includes` item. |
| `WhereRelation` › `WhereRelationParticipantTag` | `source.tag is #ui` | no | text | no | no | As text of an `includes` item. |
| `WhereRelation` › `WhereRelationMetadata` | `metadata.sla = 'gold'` | no | text | no | no | As text of an `includes` item. |
| `WhereRelation` › `WhereRelationKind` | `kind is async` | no | text | no | no | As text of an `includes` item. |
| `WhereRelation` › `WhereRelationTag` | `tag is not #sync` | no | text | no | no | As text of an `includes` item. |
| `Participant` | `source`, `target` | n/a | n/a | n/a | n/a | Keyword values of `WhereRelation`: `source`, `target`. <!-- grammar-hash: 4d1935fa2301 --> |

## Dynamic views

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `DynamicView` | `dynamic view checkout { ... }` | no | partial | no | no | `dynamic` `view` with `name` and `body`: `addView({ type: 'dynamic', id, title, includes, autoLayout })` writes a shell without steps or variant. <!-- grammar-hash: ac4d828129a1 --> |
| `DynamicViewRef` | `navigateTo checkout` (target) | no | text | no | no | Reference (`view`) of `RelationNavigateToProperty`: written only inside a `with { }`; not resolved. <!-- grammar-hash: c5bd73634d13 --> |
| `DynamicViewBody` | `{ ... }` of a dynamic view | n/a | n/a | n/a | n/a | Body of `DynamicView`: `tags`, `props`, `steps`, `rules`. <!-- grammar-hash: 06a97590722d --> |
| `DynamicViewProperty` | any dynamic view property | n/a | n/a | n/a | n/a | Alternative of `DynamicViewDisplayVariantProperty`, `ViewProperty`. <!-- grammar-hash: 9d7fc3e39515 --> |
| `DynamicViewDisplayVariantProperty` | `variant sequence` | no | no | no | no | `variant` (`key`, `value`). <!-- grammar-hash: 5e6a38aed082 --> |
| `DynamicViewRule` | any dynamic view rule | n/a | n/a | n/a | n/a | Alternative of `DynamicViewIncludePredicate`, `DynamicViewGlobalPredicateRef`, `ViewRuleStyleOrGlobalRef`, `ViewRuleAutoLayout`. <!-- grammar-hash: 92e1291d7517 --> |
| `DynamicViewIncludePredicate` | `include cloud.*` | no | partial | no | no | `include` of `exprs`, at creation only (`addView({ type: 'dynamic', includes })`). In the `sequence` variant the `include` order sets the order of actors (LikeC4 docs). <!-- grammar-hash: a3eda8d0f562 --> |
| `DynamicViewGlobalPredicateRef` | `global predicate flows` | no | no | no | no | `global` `predicate` reference (`predicate`). <!-- grammar-hash: efe2d4bf296c --> |
| `StepStatement` | any step | n/a | n/a | n/a | n/a | Alternative of `SubflowStep`, `AltSteps`, `TryStep`, `StepSeries`. <!-- grammar-hash: d1aa3ca5eb60 --> |
| `StepsBlockFragment` | `{ steps }` | n/a | n/a | n/a | n/a | Fragment: the block of `steps` of subflows. <!-- grammar-hash: 816aedcbcb10 --> |
| `SubflowKind` | `par`, `opt`, `loop` | n/a | n/a | n/a | n/a | Keyword values of `SubflowStep`: `opt`, `par`, `parallel`, `loop`, `when`, `if`, `else`, `break`. <!-- grammar-hash: 30022f3d1309 --> |
| `SubflowStep` | `par { a -> b  a -> c }` | no | no | no | no | Subflow `kind` with an optional `title`; one sub-row per kind. <!-- grammar-hash: 644cb39aa0c7 --> |
| `SubflowStep` › `par` / `parallel` | `parallel { ... }` | no | no | no | no | |
| `SubflowStep` › `opt` | `opt 'cached' { ... }` | no | no | no | no | |
| `SubflowStep` › `loop` | `loop { ... }` | no | no | no | no | |
| `SubflowStep` › `when` / `if` / `else` | branches of `alt` | no | no | no | no | |
| `SubflowStep` › `break` | `break { ... }` | no | no | no | no | |
| `StepsBlock` | `{ steps }` after `finally` / `catch` | n/a | n/a | n/a | n/a | Wrapper of `StepsBlockFragment`. <!-- grammar-hash: b08353cda781 --> |
| `TryStep` | `try { } catch { } finally { }` | n/a | n/a | n/a | n/a | Wrapper of `FinallyBlock` (rated in `TryBlock`, `CatchBlock`, `FinallyBlock`). <!-- grammar-hash: 6554749e0e9a --> |
| `FinallyBlock` | `finally { ... }` | no | no | no | no | `finally` with an optional `title`. <!-- grammar-hash: 7eaf8cc52f2a --> |
| `CatchBlock` | `catch { ... }` | no | no | no | no | `catch` with an optional `title`. <!-- grammar-hash: 848599edbce5 --> |
| `TryBlock` | `try { ... }` | no | no | no | no | `try` with an optional `title`. <!-- grammar-hash: 423d7d45a340 --> |
| `AltSteps` | `alt { if { ... } else { ... } }` | no | no | no | no | `alt` with an optional `title` and `branches`. <!-- grammar-hash: 670c0825370b --> |
| `StepTarget` | `-> b 'title'` | n/a | n/a | n/a | n/a | Unused fragment in 1.59.4 (no rule calls it); `Step` and `StepSeries` spell out `target`, `title`, `custom` themselves. <!-- grammar-hash: 01c4470782d6 --> |
| `StepSeries` | `a -> b -> c` | no | no | no | no | Chain continuing a `Step` with `->`, `-[kind]->` (`kind`) or `.kind` (`dotKind`), each with `target`, `title`, `custom`. <!-- grammar-hash: b665d58e2637 --> |
| `Step` | `user -> api 'checkout'`, `api <- db` | no | no | no | no | `source`, connector, `target`, `title`, `custom` properties: sub-rows. <!-- grammar-hash: 9f3622da1a40 --> |
| `Step` › `->` | `user -> api` | no | no | no | no | |
| `Step` › `<-` (`isBackward`) | `api <- db` | no | no | no | no | Response step. |
| `Step` › `-[kind]->` / `.kind` (`kind`, `dotKind`) | `a -[async]-> b` | no | no | no | no | |
| `Step` › `custom` | `a -> b { notes 'n'  navigateTo flow }` | no | no | no | no | Step body (`CustomRelationProperties`): notes, `navigateTo`, style, title. |

## Global

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Globals` | `global { ... }` | no | no | n/a | no | `global` block (`name`, `predicates`, `styles`). <!-- grammar-hash: 2403a682cee0 --> |
| `GlobalPredicateGroup` | `predicateGroup common { include * }` | no | no | no | no | `predicateGroup` with a `name` and `predicates`. <!-- grammar-hash: 3a9f2511607a --> |
| `GlobalDynamicPredicateGroup` | `dynamicPredicateGroup flows { include * }` | no | no | no | no | `dynamicPredicateGroup` with a `name` and `predicates`. <!-- grammar-hash: a2db2c4d1927 --> |
| `GlobalStyleId` | `mute` (name) | n/a | n/a | n/a | n/a | Name holder (`name`) of `GlobalStyle` / `GlobalStyleGroup`. <!-- grammar-hash: cc639770a59c --> |
| `GlobalStyle` | `style mute * { opacity 40% }` | no | no | no | no | `style` with an `id`, `targets` and `props`. <!-- grammar-hash: 1cb312a2a0f8 --> |
| `GlobalStyleGroup` | `styleGroup theme { style * { ... } }` | no | no | no | no | `styleGroup` with an `id` and `styles`. <!-- grammar-hash: f7b3a02abd98 --> |

## Imports and likec4lib

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ImportsFromPoject` | `import { api } from 'other-project'` | no | no | no | no | `import` of `imports` `from` a `project`, optional `;`; the rule name's spelling is LikeC4's. Imported names are not resolved (see multi-project in [Outside the grammar](#outside-the-grammar)). <!-- grammar-hash: 494460b39a7f --> |
| `ImportsFromPoject` › `{ a, b }` / bare list | `import api, db from 'p'` | no | no | no | no | Both list forms. |
| `Imported` | `api, db` in an import | n/a | n/a | n/a | n/a | Name list (`imported`, `,`-separated, optional `;`) of `ImportsFromPoject`. <!-- grammar-hash: c3efe4738b96 --> |
| `LikeC4Lib` | `likec4lib { icons { tech:custom } }` | no | no | no | no | `likec4lib` `icons` declarations (`icons`). <!-- grammar-hash: aa223f4d8b3b --> |
| `LibIcon` | `tech:custom` in `likec4lib` | no | no | no | no | Declared icon `name`. <!-- grammar-hash: ed5fff64b161 --> |

## Shared fragments and values

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Tags` | `#internal, #critical` | partial | partial | partial | partial | Tag `values`, `,`-separated groups, optional `;`. Elements, relationships (line or body) and their `extend` blocks: read (effective, `declared`, `extendedBy`; groups taken last first, as LikeC4), written one per line by `addElement` / `addRelationship`, replaced by `updateElement` / `updateRelationship({ tags })`; `[]` clears own and `extend` tags. Always written first in the body, as the grammar requires (tags precede properties): `addElement` / `addRelationship` write them first (`src/mutator/codegen.ts`), `updateElement` / `updateRelationship` insert them right after `{` (`element-ops.ts`, `relationship-ops.ts`; probed for `updateElement`). Contexts in sub-rows. <!-- grammar-hash: e660dfa30d03 --> |
| `Tags` › kinds | `element service { #backend }` | yes | no | no | no | Kind tags are read only (`fromSpecification`). |
| `Tags` › views | `view index { #draft }` | no | no | no | no | |
| `Tags` › deployment | `prod = zone { #eu }` | no | no | no | no | |
| `TagRef` | `#internal` | partial | partial | partial | partial | Reference (`tag`) inside `Tags`, `where` conditions (`WhereElement`, `WhereRelation`) and tag predicates (`FqnExpr`). Read: tags of elements, relationships, their `extend` blocks and kinds are reported by name; tags of views, deployment nodes and instances, and tags in view predicates are not read (verified: a deployment instance `{ #t }` and `include * where tag is #t` are not reported). Element and relationship tags are written as given; the name must be an `Id` token declared by a specification of a loaded file (`tag x`), otherwise the write is rejected; tags are never renamed; `[]` clears them. In `where` conditions: `text`. <!-- grammar-hash: 48bffefa4592 --> |
| `ElementRef` | `cloud.api` after `of` / `instanceOf`, in steps | no | partial | no | no | Reference (`modelElement`) of `ElementView` › `of`, `DeployedInstance`, steps: written as given by `addView({ target })`; never rewritten; left dangling by `removeElement` (verified). <!-- grammar-hash: e2fd0d13d9f2 --> |
| `StrictFqnElementRef` | `cloud.api` after `extend` | yes | no | no | yes | Reference (`el`) of an element `extend`: resolved when reading `extendedBy`; `extend` blocks of a removed subtree are removed. <!-- grammar-hash: 832149750a84 --> |
| `FqnRef` | `cloud.api`, `this`, `it` | partial | partial | no | partial | Reference (`value`): model relation endpoints are resolved to FQNs (`this` / `it` included); in view predicates not resolved. `addRelationship` writes endpoints as given after checking the reference form (dot-separated `Id` tokens) and that they resolve from the `model` block they are written into, as LikeC4 links them (unique descendants, document scope, root elements of the loaded files). Never rewritten. Relationships of a removed subtree are removed, view predicates are left dangling. <!-- grammar-hash: 5c408d419451 --> |
| `StrictFqnRef` | `prod.eu` after `extend` | no | no | no | no | Reference (`value`) of `ExtendDeployment` (not supported). <!-- grammar-hash: 06e35c68eb71 --> |
| `LinkProperty` | `link https://example.com 'Docs'` | partial | partial | partial | partial | `link` (`key`, `value`: `Uri`, optional `title`; optional `:` / `;`). Elements, relationships and their `extend` blocks: read (effective; kind links when none), written by `addElement` / `addRelationship`, replaced by `updateElement` / `updateRelationship({ links })` (regenerated: `:` / `;` are not kept); `[]` clears own and `extend` links. Contexts in sub-rows. <!-- grammar-hash: 5a236520dfc8 --> |
| `LinkProperty` › `title` | `link https://x 'Docs'` | yes | partial | partial | partial | Of element, relationship, `extend` and kind links (views and deployment: the sub-row below). Label: read normalized (dedented, single line, empty dropped), written single-line; removed by writing the link without a label. |
| `LinkProperty` › kinds | `element service { link https://wiki }` | yes | no | no | no | Kind links are read only. |
| `LinkProperty` › views and deployment | `view index { link https://x }` | no | no | no | no | |
| `ColorRef` | `red`, `brand` | n/a | n/a | n/a | n/a | Fragment: `themeColor` or `customColor`, the value of `ColorProperty` / `IconColorProperty` / tag color; written in a style after checking that a custom color is declared in a loaded file. <!-- grammar-hash: fa69de302426 --> |
| `ColorProperty` | `color red` | no | partial | partial | no | `color` (`key`; optional `:` / `;`): `style.color` of elements and relationships (add, merge per field); text in `with { }`. Kinds, groups, view / global styles, deployment: not supported. Not read; cannot be removed. <!-- grammar-hash: 8f901d222f1d --> |
| `OpacityProperty` | `opacity 40%` | no | partial | partial | no | `opacity` (`key`, `value`; optional `:` / `;`): `style.opacity` of elements, a percentage between 0% and 100% (LikeC4 ignores others with a warning; rejected before writing); text in `with { }`. Not read; cannot be removed; not in kinds, groups, view styles, deployment. <!-- grammar-hash: 6922018e4120 --> |
| `MultipleProperty` | `multiple true` | no | partial | partial | no | `multiple` (`key`, boolean `value`; optional `:` / `;`): `style.multiple` of elements; text in a relation `with { }`. Relationship kinds: not supported. Not read; cannot be removed. <!-- grammar-hash: 912682fad463 --> |
| `IconProperty` | `icon tech:postgresql` | no | partial | partial | no | `icon` (`key`; `libicon` or `value`; optional `:` / `;`): written inside an element `style { }` only (`style.icon`, checked as in the sub-rows); text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: 924a3b7a4516 --> |
| `IconProperty` › `libicon` | `icon tech:postgresql`, `icon aws:lambda` | no | partial | partial | no | Library icon reference (`tech:postgresql` and `aws:lambda` parse as `libicon`, verified); an icon the built-in library of the installed LikeC4 does not have is rejected before writing. |
| `IconProperty` › `value` URI | `icon https://example.com/i.svg`, `icon @assets/i.png` | no | partial | partial | no | Written as given; a `file://` URI (a LikeC4 error) is rejected; an `@alias` depends on `imageAliases` of the project config (not read). |
| `IconProperty` › `none` | `icon none` | no | partial | partial | no | Written when `style.icon` is `'none'`. |
| `IconProperty` › element body `icon` | `api = service { icon tech:go }` | no | no | no | no | Not read or changed. A `style.icon` is added next to it; LikeC4 then uses the body icon and warns `Redundant as icon defined on element` (verified). |
| `IconColorProperty` | `iconColor red` | no | partial | partial | no | `iconColor` (`key`; optional `:` / `;`): `style.iconColor` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: 74796ffdbc62 --> |
| `IconSizeProperty` | `iconSize sm` | no | partial | partial | no | `iconSize` (`key`, `value`; optional `:` / `;`): `style.iconSize` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: 25ba7d8d4522 --> |
| `IconPositionValue` | `left`, `right`, `top`, `bottom` | n/a | n/a | n/a | n/a | Keyword values of `IconPositionProperty`: `left`, `right`, `top`, `bottom`. <!-- grammar-hash: cab0a63db4b8 --> |
| `IconPositionProperty` | `iconPosition left` | no | partial | partial | no | `iconPosition` (`key`, `value`; optional `:` / `;`): `style.iconPosition` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: ae3a194a791f --> |
| `ShapeProperty` | `shape cylinder` | no | partial | partial | no | `shape` (`key`, `value`; optional `:` / `;`): `style.shape` of elements; text in `with { }`. Not read; cannot be removed; not in kinds, view styles, deployment. <!-- grammar-hash: fd99ff6c4708 --> |
| `BorderStyleValue` | `dashed`, `none` | n/a | n/a | n/a | n/a | Keyword values of `BorderProperty`: `LineOptions` or `none`. <!-- grammar-hash: 5dd23576e13d --> |
| `BorderProperty` | `border dashed` | no | partial | partial | no | `border` (`key`, `value`; optional `:` / `;`): `style.border` of elements; text in `with { }`. Not read; cannot be removed; not in groups, kinds, view styles, deployment. <!-- grammar-hash: 5d4ffc4fea87 --> |
| `SizeValue` | `sm`, `large` | n/a | n/a | n/a | n/a | Keyword values of the size properties: `xs`, `sm`, `md`, `lg`, `xl`, `xsmall`, `small`, `medium`, `large`, `xlarge`. <!-- grammar-hash: 08aac356fe55 --> |
| `ShapeSizeProperty` | `size lg` | no | partial | partial | no | `size` (`key`, `value`; optional `:` / `;`): `style.size` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: 24ae77b24269 --> |
| `PaddingSizeProperty` | `padding sm` | no | partial | partial | no | `padding` (`key`, `value`; optional `:` / `;`): `style.padding` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: 0395e91b0068 --> |
| `TextSizeProperty` | `textSize md` | no | partial | partial | no | `textSize` (`key`, `value`; optional `:` / `;`): `style.textSize` of elements; text in `with { }`. Not read; cannot be removed. <!-- grammar-hash: fea9f8f05a46 --> |
| `StyleProperty` | any style property | n/a | n/a | n/a | n/a | Alternative of the element style property rows; the places it is used are rated in the sub-rows. <!-- grammar-hash: 323a1b6f1ef9 --> |
| `StyleProperty` › element `style { }` | `api = service { style { shape cylinder } }` | no | partial | partial | no | See `ElementStyleProperty`. |
| `StyleProperty` › in `with { }` | `include api with { color red }` | no | text | no | no | `CustomElementProperties`. |
| `StyleProperty` › element / deployment node kind `style { }` | `element service { style { shape cylinder } }` | no | no | no | no | |
| `StyleProperty` › deployment node / instance `style { }` | `prod = zone { style { color red } }` | no | no | no | no | |
| `StyleProperty` › view, deployment view and global `style` rules | `style * { color muted }` | no | no | no | no | `ViewRuleStyle`, `DeploymentViewRuleStyle`, `GlobalStyle`. |
| `ElementStyleProperty` | `style { shape cylinder }` | no | partial | partial | no | `style` block (`key`, `props`) of elements: `addElement({ style })`, `updateElement({ style })` merges per field into the first block (the one LikeC4 reads) in place: patched values are rewritten where they are written, missing fields added at the end of the block; other fields, comments, `:` / `;` separators and indentation keep their text (verified with tests, merged style compared with LikeC4's model builder). Each value is checked before writing: the keywords of the field's value rule, a theme color or a custom color declared in a loaded file, a percentage between 0% and 100%, a library icon that exists, a URI (not `file://`) or `none`, a boolean; an unknown field is rejected. Kinds, deployment nodes and instances: not supported. Not read; a field or the block cannot be removed. <!-- grammar-hash: 48af42385c6d --> |
| `LineProperty` | `line dashed` | no | partial | partial | no | `line` (`key`, `value`; optional `:` / `;`): `style.line` of relationships; text in `with { }`. Not read; cannot be removed; not on relationship kinds. <!-- grammar-hash: 29dd435cfcbc --> |
| `ArrowProperty` | `head diamond`, `tail none` | no | partial | partial | no | `head` / `tail` (`key`, `value`; optional `:` / `;`): `style.head` / `style.tail` of relationships; text in `with { }`. Not read; cannot be removed; not on relationship kinds. <!-- grammar-hash: 175799c7ed66 --> |
| `RelationshipStyleProperty` | any relationship style property | n/a | n/a | n/a | n/a | Alternative of `ColorProperty`, `LineProperty`, `ArrowProperty`; places in the sub-rows. <!-- grammar-hash: d0c45d5bf00a --> |
| `RelationshipStyleProperty` › relation `style { }` | `a -> b { style { line dashed } }` | no | partial | partial | no | See `RelationStyleProperty`. |
| `RelationshipStyleProperty` › in `with { }` | `include a -> b with { line dotted }` | no | text | no | no | `CustomRelationProperties`. |
| `RelationshipStyleProperty` › relationship kinds | `relationship async { line dashed }` | no | no | no | no | |
| `RelationKindDotRef` | `.async` in `a .async b` | partial | no | no | n/a | Dot form of a relationship `kind`, used by `RelationConnector` (rated there), `OutgoingRelationExpr`, `StepSeries` and `Step`. Read only in model relationships and their `extend` blocks (`RelationshipInfo.kind`); not read in deployment relations, view predicates or dynamic steps (verified: `x .async y` in `deployment`, `include a .async b` and the step `a .async b` in a dynamic view are not reported). <!-- grammar-hash: 31342e8eed01 --> |
| `LineOptions` | `solid`, `dashed`, `dotted` | n/a | n/a | n/a | n/a | Keyword values of `LineProperty` / `BorderStyleValue`: `solid`, `dashed`, `dotted`. <!-- grammar-hash: 3c73e87f50c3 --> |
| `ArrowType` | `normal`, `diamond`, `vee` | n/a | n/a | n/a | n/a | Keyword values of `ArrowProperty`: `none`, `normal`, `onormal`, `dot`, `odot`, `diamond`, `odiamond`, `crow`, `open`, `vee`. <!-- grammar-hash: c64333f98e47 --> |
| `DynamicViewDisplayVariantValue` | `diagram`, `sequence` | n/a | n/a | n/a | n/a | Keyword values of `DynamicViewDisplayVariantProperty`: `diagram`, `sequence`. <!-- grammar-hash: f30451171843 --> |
| `DynamicViewFlowKeyword` | `alt`, `par`, `try` | n/a | n/a | n/a | n/a | Keywords usable as identifiers (`Id`): `alt`, `opt`, `par`, `parallel`, `loop`, `when`, `if`, `else`, `break`, `try`, `catch`, `finally`. <!-- grammar-hash: ac910ffa3df6 --> |
| `ThemeColor` | `primary`, `amber` | n/a | n/a | n/a | n/a | Keyword values of `ColorRef`: `primary`, `secondary`, `muted`, `slate`, `blue`, `indigo`, `sky`, `red`, `gray`, `green`, `amber`. <!-- grammar-hash: d22ba33b1a11 --> |
| `ElementShape` | `cylinder`, `person` | n/a | n/a | n/a | n/a | Keyword values of `ShapeProperty`: `rectangle`, `component`, `person`, `browser`, `mobile`, `cylinder`, `storage`, `queue`, `bucket`, `document`. <!-- grammar-hash: 4e3b56f6f6cf --> |
| `ColorLiteral` | `#3b82f6`, `rgb(...)` | n/a | n/a | n/a | n/a | Alternative of `RGBAColor`, `HexColor`: value of `SpecificationColor` / tag color (not supported). <!-- grammar-hash: 4717a530dfd0 --> |
| `RGBAColor` | `rgba(59, 130, 246, 0.5)` | n/a | n/a | n/a | n/a | `rgba` / `rgb` with `red`, `green`, `blue`, optional `alpha`, optional `,`: value of `SpecificationColor` / tag color (not supported). <!-- grammar-hash: fb037f312f1b --> |
| `HexColor` | `#3b82f6` | n/a | n/a | n/a | n/a | `hex` value of `SpecificationColor` / tag color (not supported). <!-- grammar-hash: d0fa85727e79 --> |
| `IconId` | `tech:postgresql` | n/a | n/a | n/a | n/a | Value of `LibIcon` / `IconProperty`. <!-- grammar-hash: fd8e10e8907f --> |
| `Uri` | `https://...`, `./docs/a.md`, `@alias/x` | n/a | n/a | n/a | n/a | Value of `LinkProperty` / `IconProperty`, written as given: a URI with a scheme, a relative path, or an `@alias` path resolved through `imageAliases` of the project config (not read by the library). <!-- grammar-hash: c068812bc62d --> |
| `MarkdownOrString` | `'text'`, `'''markdown'''` | partial | partial | partial | n/a | Value of string properties: `text` or `markdown` (`'''...'''` or `"""..."""`), see sub-rows; written as `markdown` only for multi-line metadata values. Read in element and relationship string properties, kind string properties (`fromSpecification`) and metadata values (a `'''...'''` metadata value reads as its content, verified); not read in view `title` / `description` (`ViewStringProperty`), `notation`, `notes`, `with { }` and deployment nodes, instances and relations (verified: none of these values is reported). <!-- grammar-hash: c35645b60823 --> |
| `MarkdownOrString` › `text` | `'text'` | partial | partial | partial | n/a | In the places read (see the main row): read dedented and trimmed; written as a single-line `'...'` string: line breaks and tabs become spaces (metadata values with line breaks are written as `markdown`, see that sub-row). |
| `MarkdownOrString` › `markdown` | `'''# Title ...'''` | partial | partial | partial | n/a | In the places read (see the main row) both forms `'''...'''` and `"""..."""` read as their content (verified for `"""`). Written (`'''...'''`) only for metadata values with line breaks, by `addElement`, `addRelationship`, `updateElement` and `updateRelationship` (see `MetadataAttribute` › string `value`). Other properties are never written as Markdown: an update replaces a Markdown value with a single-line string, so Markdown structure is flattened. |
| `CustomColorId` | `brand` | n/a | n/a | n/a | n/a | Identifier of a custom color; besides plain identifiers accepts value keywords and `element`, `model`. <!-- grammar-hash: 7d315ad2a665 --> |
| `Id` | `api`, `db` | n/a | n/a | n/a | n/a | Identifier; accepts value keywords (shapes, colors, sizes, flow keywords, ...) and `element`, `model`, `group`, `node`, `deployment`, `instance`, `relationship`. Tag names, metadata keys, element names, view ids and kinds written by the library are checked to be one `Id` token (element names and view ids also not a reserved word); `1api` or `a.pi` are rejected before writing with an `InvalidWriteError` naming the field. <!-- grammar-hash: 058d335a9e2f --> |
| `HashId` | `#internal` | n/a | n/a | n/a | n/a | Tag identifier. <!-- grammar-hash: d7429ef4c249 --> |
| `EqOperator` | `is`, `is not`, `=`, `!=` | n/a | n/a | n/a | n/a | Fragment of `where` atoms: `operator` (`is` with optional `not`, or `=` / `!=`). <!-- grammar-hash: 9eb84da41979 --> |
| `EqOperator` › `is` / `is not` | `kind is not service` | no | text | no | no | As text of an `includes` item. |
| `EqOperator` › `=` / `!=` | `metadata.tier != 'gold'` | no | text | no | no | As text of an `includes` item. |
| `IsEqual` | `=`, `!=` | n/a | n/a | n/a | n/a | Fragment of `element.kind` / `element.tag` predicates: `isEqual` (`=`) or `!=`; written only as text. <!-- grammar-hash: 2f68af3b1a08 --> |

## Outside the grammar

Statuses: `yes` / `partial` / `no` for what the library does today; Notes says what is planned or out of scope.

| Topic | Status | Notes |
| --- | --- | --- |
| File extensions `.c4`, `.likec4`, `.like-c4` | partial | LikeC4 reads all three (`LikeC4LanguageMetaData.fileExtensions`). The library parses whatever names are passed to `fromFiles` (verified with `.likec4` and `.like-c4`); the CLI loads only `.c4` files (`src/cli.ts`), so other files of a project are silently left out. Planned: CLI parity. |
| Project config files (`likec4.config.json`, `.likec4rc`, `.likec4.config.json`, `likec4.config.{js,cjs,mjs,ts,cts,mts}`) | no | Not read by the library or the CLI. Fields that change the model are below; `title`, `contactPerson`, `metadata`, `styles` (`theme`, `defaults`, `customCss`), `landingPage`, `webapp` do not affect what the library reads or writes; `styles.defaults` applies default styles to all elements and relationships and will matter once styles are read. Planned with multi-project support. |
| Config `include` (`paths`, `maxDepth`, `fileThreshold`) and `exclude` | no | Decide which files belong to a project (`fileThreshold` only warns when more files are loaded). The CLI walks every `.c4` file below `--dir` (also `node_modules`), ignoring both. A nested `likec4.config.json` starts another project whose files are not part of the parent (LikeC4 docs); the CLI merges them into one model. A specification shared through `include.paths` is seen only when the caller passes its files, so `fromSpecification` and undeclared-kind results depend on it. Planned. |
| Config `name`, `extends` and multi-project `import` | no | `name` identifies a project for `import ... from 'name'`; `extends` shares styles between configs. The library knows one project only: imported names are not resolved and the projects of a workspace are not separated. LikeC4 docs limit `import` to top-level `model` elements of projects loaded in the same workspace. Planned (niche). |
| Config `imageAliases` | no | Resolves `@alias/...` in icons and image URIs; the library writes such values as given. Out of scope while URIs are not resolved. |
| Config `inferTechnologyFromIcon` | no | On by default in LikeC4: a missing or empty technology is derived from the icon. The library reports the technology as written or inherited from the kind (README). Planned with reading icons. |
| Config `implicitViews` | no | LikeC4 generates scoped views for elements without one; the library does not read views at all. A `/` in an element title then puts the generated view into a folder, `\/` does not (LikeC4 docs; verified for titles the library writes, see `ElementStringProperty` › `title`). Independently of this setting, LikeC4 generates the special view `index` with the top-level elements when it is not defined. Planned with reading views. |
| Manual layouts (`*.likec4.snap` in `manualLayouts.outDir`, default `.likec4`) | no | Stored per view id; LikeC4 reports layout drift when the model changes. The library neither reads nor updates them; renaming or removing views (not supported yet) will have to. Planned with views. |
| Semantic validation | partial | `validate()` reports syntax errors only (unchanged). Write calls reject, before writing, what they would introduce and LikeC4 rejects: an unresolved relationship endpoint or view `target` (resolved as LikeC4 links it), a self or parent-child relationship, an undeclared tag, element kind or custom color, a duplicate element name or view id. Only the values of the call are checked: problems already in the files are neither reported nor a reason to reject. Only loaded files are known, so a kind, tag or element declared in a file that is not loaded is rejected. Not checked: references inside `includes` items of `addView`. |
| Reference integrity on remove | partial | `removeElement` removes the subtree's relationships and `extend` blocks, but leaves references in view `of`, `include` / `exclude` and `with` predicates, dynamic steps and deployment `instanceOf`, which LikeC4 then reports as errors (verified). Views and kinds are never removed. Planned with views / deployment. |
| Rename and move | no | No element, kind, tag, view or relationship identity can be renamed or moved, so no reference is ever rewritten. Planned with specification CRUD. |
| Unchecked string parameters | yes | `autoLayout`, view `target`, relationship endpoints, `kind`, element names, view ids and style values are checked before writing to form exactly one token or property of the grammar; DSL inside them is rejected with an `InvalidWriteError` naming the field (see the legend). |
| Merge semantics across files (`extend` order, duplicate kinds) | yes | As LikeC4 1.59.4, see the [README](../README.md#extend-blocks). |

### Text form and preservation

| Topic | Status | Notes |
| --- | --- | --- |
| Comments (`//`, `/* */`) | partial | Edits replace CST ranges, so comments outside the replaced text are kept (verified after a title update; inside `metadata { }` and `style { }` blocks per the README, verified with tests). Comments inside removed declarations are removed with them. Planned. |
| Separators `:` and `;` after property keys | partial | Kept when a string property's value is replaced in place (`title: 'B2';` → `title: 'T';`, verified) and when a style field's value is replaced (`color: red;` → `color: blue;`, verified); lost where text is regenerated (links); never written. |
| Declaration form (`kind name` vs `name = kind`, inline vs body properties) | partial | Existing forms are kept by updates; new declarations are always `name = kind 'title' { ... }` with other properties in the body. |
| Quotes and Markdown strings | partial | Single- and double-quoted strings are read with their escapes (`'Cloud\'s'`, `"Say \"hi\""`; verified). Written values are single-line `'...'` strings with `'` and `\` escaped; a replaced double-quoted value is rewritten single-quoted (`"A"` → `'It\'s'`, verified). Metadata values with line breaks are written as Markdown `'''...'''` strings; other Markdown `'''...'''` and `"""..."""` values are never written and are flattened when replaced (see `MarkdownOrString`). |
| Indentation and layout of new text | partial | New text is indented one level (two spaces, whatever the file's own indentation unit) deeper than the owner of its block, every inserted construct on its own line, and the closing `}` keeps a line of its own at the owner's indentation. A block written on one line (`a = service { description 'd' }`, `{ }`, `model { a = service }`) is spread over several lines when something is inserted into it; into a block already laid out over several lines the new lines are inserted without changing the existing text. Inserted tags are not followed by an empty line (all verified with tests). |
| Line endings, BOM and final newline | partial | Written text uses the file's line ending, taken from its first line break (`\r\n` or `\n`; `\n` for a file without one): after every write op a CRLF file has no lone LF and an LF file no CR (verified with tests, multi-line metadata values included, which then read back with `\r\n` line breaks in LikeC4 and the library). Text kept from the file keeps its line breaks, so a file that already mixes line endings stays mixed. A missing final newline stays missing (verified). A file starting with a UTF-8 BOM gets a lexer error (`unexpected character`) in the library and in LikeC4's language services for the same text (verified), so every edit of it fails with `Edit produced parse errors`; the CLI reads files as is (`readFileSync(..., 'utf-8')`, no BOM stripping). Whether the `likec4` CLI strips a BOM when reading files: not verified. |

## Documented but not in LikeC4 1.59.4

Syntax the LikeC4 documentation at likec4.dev shows that the installed 1.59.4 grammar does not accept. Checked by parsing with LikeC4's parser (`LangiumParser.parse`) in a project that declares the kinds involved.

| Documented syntax | Where in the docs | 1.59.4 |
| --- | --- | --- |
| Incoming relation predicate with a kind: `include -[http-request]-> backend` | [Views › Predicates › Filter](https://likec4.dev/dsl/views/predicates/#filter) | Parse error (`Expecting: one of these possible Token sequences: 1. [->] ...`): `IncomingRelationExpr` is `'->' to=FqnExpr`, without a kind. `include a -[http-request]-> b` (with a source) parses. |
| Incoming relation predicate with a dot kind: `include .http-request backend` | [Views › Predicates › Filter](https://likec4.dev/dsl/views/predicates/#filter) | Parse error, same message. The equivalent `include -> backend where kind is http-request` parses. |
| `global style applications` inside a `deployment view` (the docs mark it "does not work") | [Deployment › Views](https://likec4.dev/dsl/deployment/views/#view-predicates) | Parse error (``Expecting token of type '}' but found `global` ``): `DeploymentViewRule` has no `ViewRuleGlobalStyle` alternative. |

The docs also list `with { }` in deployment views as not working; it parses in 1.59.4 (see `DeploymentViewRulePredicate`), so it is not in this table.
