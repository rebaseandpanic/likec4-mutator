# LikeC4 1.59.4 DSL coverage

What likec4-mutator 0.7.1 can do with each construct of the LikeC4 DSL, one row per parser rule of the grammar shipped in `@likec4/language-server` 1.59.4.

- **Read** — the construct is reported by the structured query API (`getElement`, `listElements`, `getRelationships`, `getSpecification`, `WorkspaceIndex`). The raw text from `getElementSource` does not count.
- **Add / Update / Remove** — a library operation writes, changes or deletes the construct. Removing a whole element or relationship is not counted as removing each of its properties.
- `yes` — supported; `partial` — supported with the limits named in Notes; `no` — not supported; `n/a` — not an independently editable construct (an alternative of other rules, a body, a reference, a keyword or value rule) or something LikeC4 ignores; Notes says why.
- A rule shared by several blocks (e.g. `Tags`, `LinkProperty`) is rated over all the places it occurs: `partial` when only some of them are supported.
- The columns describe the library API. The `apply` command accepts the same operations as JSON (without `autoLayout` for `addView`); the single-purpose CLI commands cover less, see the [README](../README.md#cli).

Terminal rules (strings, numbers, comments, URIs, ...) are lexical and have no rows. `validate()` reports syntax errors only: references (kinds, elements, views) are not resolved.

## Checking this document

The rule list comes from the installed grammar, not from this file:

```bash
npx tsx scripts/grammar-rules.ts                                   # print the LikeC4 version and all rules
npx tsx scripts/grammar-rules.ts --check docs/likec4-coverage.md   # exit 1 on missing / unknown / duplicate rows
```

The check also requires the title to name the installed LikeC4 version, a status of `yes` / `partial` / `no` / `n/a` in each of the four columns, and notes on every row that is not all `no`.

### Upgrading LikeC4

After bumping `@likec4/language-server`, run the check. Rules added by the new grammar show up as missing rows, removed or renamed rules as rows naming rules that no longer exist. Add or fix those rows, re-verify the statuses of rules whose syntax changed, and update the version in the title.

## Planned order of work

Deployment model → views (read, update, remove, rules) → specification CRUD and reference handling on remove / rename → relationships (kind, direction, placement, remove selector) → CLI parity → styling and niche constructs (`global`, `import`, `likec4lib`, notation, colors, dynamic flows).

## Document root

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `LikeC4Grammar` | a `.c4` file | partial | no | n/a | n/a | Entry rule. `specification` and `model` blocks of every file are read; `deployment`, `views`, `global`, `import`, `likec4lib` are not. No top-level block is ever created: root-level elements and relationships go into the first existing `model` block, views into the first existing `views` block. |

## Specification

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `SpecificationRule` | `specification { ... }` | partial | no | n/a | no | `getSpecification()` lists element kind, tag and relationship kind names over all files. Colors and deployment node kinds are not listed. Container: its content has the rows below. |
| `ElementKind` | `element service` (name) | n/a | n/a | n/a | n/a | Name holder of `SpecificationElementKind`. |
| `Tag` | `tag deprecated` (name) | n/a | n/a | n/a | n/a | Name holder of `SpecificationTag`. |
| `RelationshipKind` | `relationship async` (name) | n/a | n/a | n/a | n/a | Name holder of `SpecificationRelationshipKind`. |
| `CustomColor` | `color brand #3b82f6` (name) | n/a | n/a | n/a | n/a | Name holder of `SpecificationColor`. |
| `DeploymentNodeKind` | `deploymentNode zone` (name) | n/a | n/a | n/a | n/a | Name holder of `SpecificationDeploymentNodeKind`. |
| `SpecificationElementKind` | `element service { #backend technology 'Node' }` | partial | no | no | no | Name in `getSpecification().elementKinds`; title / summary / description / technology / tags / links in `ElementInfo.fromSpecification` and `WorkspaceIndex.elementKind()`. `style` and `notation` are not read. |
| `SpecificationElementStringProperty` | `technology 'Node'` in a kind | partial | no | no | no | `title`, `summary`, `description`, `technology` of element kinds are read (`KindDefaults`); `notation` is not; deployment node kinds are not read at all. |
| `SpecificationDeploymentNodeKind` | `deploymentNode zone { title 'Zone' }` | no | no | no | no | Not in `getSpecification()`, no defaults read. |
| `SpecificationTag` | `tag critical { color red }` | partial | no | no | no | Name only (`getSpecification().tags`); the tag color is not read. |
| `SpecificationColor` | `color brand #3b82f6` | no | no | no | no | Custom colors are neither read nor written; a style can only refer to one by name. |
| `SpecificationRelationshipKind` | `relationship async { line dashed }` | partial | no | no | no | Name in `getSpecification().relationshipKinds`; title / description / technology / tags / links in `RelationshipInfo.fromSpecification` and `WorkspaceIndex.relationshipKind()`. Style, `multiple` and `notation` are not read. |
| `SpecificationRelationshipStringProperty` | `title 'Asynchronous'` in a relationship kind | partial | no | no | no | `title`, `description`, `technology` are read (`KindDefaults`); `notation` is not. |

## Model

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Model` | `model { ... }` | yes | no | n/a | no | Every `model` block of every file is indexed. The block is never created: `addElement(null, ...)` and `addRelationship` need an existing one. Container: its content has the rows below. |
| `ModelElement` | element, relation or extend | n/a | n/a | n/a | n/a | Alternative of `ExtendElementOrRelation`, `Relation`, `Element`. |
| `Element` | `api = service 'API' 'summary' 'Node'` | yes | yes | partial | yes | `getElement` / `listElements`; `addElement` (writes `name = kind`; a parent must already have a `{ }` body; a child is always added to the declaration, never to an `extend` block); `updateElement` changes properties but not name, kind or parent (no rename / move); `removeElement` removes the subtree, its relationships and `extend` blocks, but not references in views. A fourth inline string is accepted by the parser and ignored by LikeC4 and by the library. |
| `ElementBody` | `{ ... }` after an element | n/a | n/a | n/a | n/a | Body of `Element`: tags, properties and nested elements / relations, rated in their own rows. |
| `ElementProperty` | any element body property | n/a | n/a | n/a | n/a | Alternative of `ElementStringProperty`, `ElementStyleProperty`, `LinkProperty`, `IconProperty`, `MetadataProperty`. |
| `ElementStringProperty` | `description 'Main API'` | partial | partial | partial | no | Logical elements: read (effective, kind defaults and inline values applied), written by `addElement` and replaced by `updateElement({ title, summary, description, technology })`. Deployment nodes / instances and `with { }` overrides: not supported. `''` writes an empty value; a property cannot be removed. |
| `ExtendElementOrRelation` | `extend app { #critical }`, `extend a -> b { ... }` | yes | no | partial | partial | Read as `ElementInfo.extendedBy` / `RelationshipInfo.extendedBy` and `WorkspaceIndex.extendBlocks()` / `extendRelationBlocks()`; contributions merged into effective values. No block is created. `updateElement` / `updateRelationship` move patched tags / links / metadata keys out of the blocks into the declaration and rewrite the title of relation blocks on a `label` change. Blocks are removed only with their element / relationship (`removeElement`, `removeRelationship`); a block left empty stays. |
| `ExtendElementBody` | `{ ... }` after `extend app` | n/a | n/a | n/a | n/a | Body of an element `extend`: tags, `ExtendElementProperty`, nested elements and relations (nested ones are read as children / relationships). |
| `ExtendElementProperty` | `link ...` / `metadata { }` in an extend | n/a | n/a | n/a | n/a | Alternative of `LinkProperty`, `MetadataProperty`. |
| `ExtendRelationBody` | `{ ... }` after `extend a -> b` | n/a | n/a | n/a | n/a | Body of a relation `extend`: tags and `ExtendRelationProperty`. |
| `ExtendRelationProperty` | `link ...` / `metadata { }` in a relation extend | n/a | n/a | n/a | n/a | Alternative of `LinkProperty`, `MetadataProperty`. |
| `Relation` | `api -> db 'reads' 'desc' 'JDBC' #db { ... }` | yes | partial | partial | partial | `getRelationships` (nested, sourceless `-> x`, `this` / `it` resolved to FQNs). `addRelationship` writes only `source -> target` at the top of the first `model` block (no kind, no `<->`, no nested placement). `updateRelationship` changes properties (`matchKind` / `matchTitle` select among several), not endpoints, kind or direction. `removeRelationship(source, target)` removes the first match by endpoints, without a kind / title selector. |
| `RelationConnector` | `->`, `<->`, `-[async]->`, `.async` | partial | partial | no | n/a | Fragment of `Relation` / `DeploymentRelation` / `ExtendElementOrRelation`. The kind is read (`RelationshipInfo.kind`); the direction is not reported (`RelationshipInfo` has no bidirectional flag). `addRelationship` always writes `->`. Kind and direction cannot be changed. |
| `RelationBody` | `{ ... }` after a relation | n/a | n/a | n/a | n/a | Body of `Relation`: tags and `RelationProperty`. |
| `RelationProperty` | any relation body property | n/a | n/a | n/a | n/a | Alternative of `RelationStringProperty`, `RelationNavigateToProperty`, `RelationStyleProperty`, `LinkProperty`, `MetadataProperty`. |
| `RelationStringProperty` | `technology 'gRPC'` | partial | partial | partial | no | Model relationships: read (effective), written by `addRelationship({ description, technology })` and replaced by `updateRelationship({ label, description, technology })`. Deployment relations and `with { }` overrides: not supported. A property cannot be removed. |
| `RelationStyleProperty` | `style { line dashed }` in a relation | no | partial | partial | no | `addRelationship({ style })`, `updateRelationship({ style })` merges per field; model relationships only. Style is not read and a field cannot be removed. |
| `MetadataProperty` | `metadata { owner 'team-a' }` | partial | partial | partial | partial | Elements, relationships and their `extend` blocks: read (effective and `declared`, only the first block of a body, as LikeC4), written by `addElement` / `addRelationship`, merged by `updateElement` / `updateRelationship({ metadata })`, keys removed with `null` (an emptied block is removed). Deployment nodes, instances and relations: not supported. |
| `MetadataBody` | `{ key 'value' }` | n/a | n/a | n/a | n/a | Body of `MetadataProperty`. |
| `MetadataAttribute` | `owner 'team-a'`, `enabled true` | partial | partial | partial | partial | Same places as `MetadataProperty`. A boolean is read as the string `'true'` / `'false'` and cannot be written as a boolean (values are `string` or `string[]`); `null` in a patch removes the key. |
| `MetadataValue` | `'v'` or `['a', 'b']` | n/a | n/a | n/a | n/a | Alternative of `MarkdownOrString`, `MetadataArray`. |
| `MetadataArray` | `['a', 'b']` | n/a | n/a | n/a | n/a | Value form of `MetadataAttribute`, read and written as `string[]` (non-empty). |

## Deployment

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ModelDeployments` | `deployment { ... }` | no | no | n/a | no | Deployment blocks are not indexed. Container: its content has the rows below. |
| `DeploymentNode` | `prod = zone 'Production' { ... }` | no | no | no | no | |
| `DeploymentNodeBody` | `{ ... }` after a node | n/a | n/a | n/a | n/a | Body of `DeploymentNode`: tags, `ElementProperty`, nested nodes, instances and relations. |
| `DeployedInstance` | `api = instanceOf cloud.api` | no | no | no | no | Named and unnamed instances. |
| `DeployedInstanceBody` | `{ ... }` after an instance | n/a | n/a | n/a | n/a | Body of `DeployedInstance`: tags, `ElementProperty`, relations. |
| `ExtendDeployment` | `extend prod { #eu }` | no | no | no | no | |
| `ExtendDeploymentBody` | `{ ... }` after `extend prod` | n/a | n/a | n/a | n/a | Body of `ExtendDeployment`. |
| `DeploymentRelation` | `prod.api -> prod.db 'reads'` | no | no | no | no | |
| `DeploymentRelationBody` | `{ ... }` after a deployment relation | n/a | n/a | n/a | n/a | Body of `DeploymentRelation`: tags and `RelationProperty`. |

## Views

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ModelViews` | `views 'Folder' { ... }` | no | no | n/a | no | Not read. Never created: `addView` writes into the first existing `views` block; the folder string cannot be set or chosen. Shared styles of the block (`styles`) are not supported. |
| `LikeC4ViewRule` | element, dynamic or deployment view | n/a | n/a | n/a | n/a | Alternative of `DynamicView`, `DeploymentView`, `ElementView`. |
| `ElementView` | `view api of cloud.api { ... }` | no | partial | no | no | `addView({ type: 'element', id, target, title, includes, autoLayout })`; without includes writes `include *`. No `extends`, no unnamed view, no description / tags / links. Existing views cannot be listed, changed or removed. |
| `DeploymentView` | `deployment view prod { ... }` | no | partial | no | no | `addView({ type: 'deployment', id, title, includes, autoLayout })`. |
| `ViewRef` | `navigateTo index` (target) | n/a | n/a | n/a | n/a | Reference in `NavigateToProperty`; references are not resolved or rewritten. |
| `ElementViewRef` | `view b extends index` (target) | n/a | n/a | n/a | n/a | Reference in `ElementView`; `extends` is not supported (row `ElementView`). |
| `ElementViewBody` | `{ ... }` of an element view | n/a | n/a | n/a | n/a | Body of `ElementView`: tags, `ViewProperty`, `ViewRule`. |
| `ViewProperty` | any view property | n/a | n/a | n/a | n/a | Alternative of `ViewStringProperty`, `ViewOrderProperty`, `LinkProperty`. |
| `ViewStringProperty` | `title 'Overview'` | no | partial | no | no | `addView({ title })` only; `description` cannot be written; neither can be read or changed later. |
| `ViewOrderProperty` | `order 10` | no | no | no | no | |
| `ViewLayoutDirection` | `LeftRight` | n/a | n/a | n/a | n/a | Keyword value of `ViewRuleAutoLayout`. |
| `ViewRule` | any element view rule | n/a | n/a | n/a | n/a | Alternative of the element view rule rows. |
| `ViewRuleRank` | `rank same { a, b }` | no | no | no | no | |
| `RankValue` | `same`, `min`, `sink` | n/a | n/a | n/a | n/a | Keyword value of `ViewRuleRank`. |
| `ViewRuleGroup` | `group 'Backend' { include ... }` | no | no | no | no | |
| `ViewRulePredicate` | `include *`, `exclude x` | no | partial | no | no | `include` only, at creation (`addView({ includes })`, one rule per item, checked to form exactly one include rule); `exclude` is rejected. Rules of existing views cannot be read, added, changed or removed. |
| `ViewRuleGlobalPredicateRef` | `global predicate common` | no | no | no | no | |
| `ViewRuleStyle` | `style * { color muted }` | no | no | no | no | |
| `ViewRuleGlobalStyle` | `global style mute` | no | no | no | no | |
| `ViewRuleStyleOrGlobalRef` | style or global style | n/a | n/a | n/a | n/a | Alternative of `ViewRuleStyle`, `ViewRuleGlobalStyle`. |
| `ViewRuleAutoLayout` | `autoLayout LeftRight 120 80` | no | partial | no | no | Library `addView({ autoLayout })` writes the given text (default `TopBottom`, `''` omits it; not validated); `apply` always writes the default. Cannot be read or changed later. |
| `DeploymentViewBody` | `{ ... }` of a deployment view | n/a | n/a | n/a | n/a | Body of `DeploymentView`: tags, `ViewProperty`, `DeploymentViewRule`. |
| `DeploymentViewRule` | any deployment view rule | n/a | n/a | n/a | n/a | Alternative of the deployment view rule rows. |
| `DeploymentViewRulePredicate` | `include prod.**` | no | partial | no | no | `include` only, at creation (`addView({ type: 'deployment', includes })`); `exclude` is rejected. |
| `DeploymentViewRuleStyle` | `style prod.* { color red }` | no | no | no | no | |
| `ViewRuleAncestors` | `includeAncestors true` | no | no | no | no | |
| `NotationProperty` | `notation 'Service'` | no | partial | no | no | Only as text inside a `with { }` of an `includes` item of a new view; not in kinds, view styles or global styles. |
| `NotesProperty` | `notes 'Retries 3 times'` | no | partial | no | no | Only as text inside a `with { }` of an `includes` item of a new view; not in dynamic steps. |
| `CustomElementProperties` | `include api with { title 'API' }` | no | partial | no | no | The `with { }` block of an element predicate; only as text of an `includes` item of a new view. |
| `CustomRelationProperties` | `include a -> b with { line dotted }` | no | partial | no | no | The `with { }` block of a relation predicate or dynamic step; only as text of an `includes` item of a new view (steps are not supported). |
| `NavigateToProperty` | `with { navigateTo apiView }` | no | partial | no | no | Only as text of an `includes` item of a new view. |
| `RelationNavigateToProperty` | `navigateTo flowView` in a relation | no | partial | no | no | Only as text of an `includes` item of a new view; not in a relation body (`updateRelationship` has no `navigateTo`). |
| `Expressions` | `a, b -> c` | no | partial | no | no | Comma-separated predicates of one include rule; written only as the text of an `includes` item of a new view (any form LikeC4 accepts after `include`), without a structured API. |
| `ExpressionV2` | element or relation predicate | n/a | n/a | n/a | n/a | Alternative of `RelationExprOrWith`, `FqnExprOrWith`. |
| `FqnExprOrWith` | `api with { ... }` | no | partial | no | no | As text of an `includes` item of a new view. |
| `FqnExprOrWhere` | `* where kind is service` | no | partial | no | no | As text of an `includes` item of a new view. |
| `RelationExprOrWith` | `a -> b with { ... }` | no | partial | no | no | As text of an `includes` item of a new view. |
| `RelationExprOrWhere` | `a -> b where tag is #async` | no | partial | no | no | As text of an `includes` item of a new view. |
| `FqnExpr` | `*`, `api`, `element.kind = service` | no | partial | no | no | As text of an `includes` item of a new view. Also the targets of `rank` / `style` rules, which are not supported. |
| `FqnRefExpr` | `cloud.*`, `cloud.**`, `cloud._` | no | partial | no | no | As text of an `includes` item of a new view. |
| `RelationExpr` | relation predicate | n/a | n/a | n/a | n/a | Alternative of `InOutRelationExpr`, `DirectedRelationExpr`. |
| `InOutRelationExpr` | `-> api ->` | no | partial | no | no | As text of an `includes` item of a new view. |
| `IncomingRelationExpr` | `-> api` | no | partial | no | no | As text of an `includes` item of a new view. |
| `DirectedRelationExpr` | `a -> b` | no | partial | no | no | As text of an `includes` item of a new view. |
| `OutgoingRelationExpr` | `api ->`, `a <-> b`, `a -[async]-> b` | no | partial | no | no | As text of an `includes` item of a new view. |
| `FqnExpressions` | `a, b` in `rank` / `style` | no | no | no | no | Targets of `rank`, view `style` and `global style` rules, none of which are supported. |
| `WhereElementExpression` | element `where` condition | n/a | n/a | n/a | n/a | Wrapper of `WhereElementOr`. |
| `WhereElementOr` | `kind is a or kind is b` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereElementAnd` | `tag is #a and kind is b` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereElementPrimary` | `( ... )` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereElementNegation` | `not tag is #legacy` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereElement` | `kind is service`, `metadata.tier = 'gold'` | no | partial | no | no | As text of an `includes` item of a new view. |
| `MetadataFilterValue` | `'gold'`, `true` | n/a | n/a | n/a | n/a | Value of a `metadata.key` condition. |
| `WhereRelationExpression` | relation `where` condition | n/a | n/a | n/a | n/a | Wrapper of `WhereRelationOr`. |
| `WhereRelationOr` | `kind is a or kind is b` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereRelationAnd` | `source.kind is a and tag is #x` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereRelationPrimary` | `( ... )` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereRelationNegation` | `not kind is async` | no | partial | no | no | As text of an `includes` item of a new view. |
| `WhereRelation` | `source.tag is #ui`, `kind is async` | no | partial | no | no | As text of an `includes` item of a new view. |
| `Participant` | `source`, `target` | n/a | n/a | n/a | n/a | Keyword value of `WhereRelation`. |

## Dynamic views

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `DynamicView` | `dynamic view checkout { ... }` | no | partial | no | no | `addView({ type: 'dynamic', id, title, includes, autoLayout })` writes a shell without steps or variant. |
| `DynamicViewRef` | `navigateTo checkout` (target) | n/a | n/a | n/a | n/a | Reference in `RelationNavigateToProperty`. |
| `DynamicViewBody` | `{ ... }` of a dynamic view | n/a | n/a | n/a | n/a | Body of `DynamicView`: tags, properties, steps and rules. |
| `DynamicViewProperty` | any dynamic view property | n/a | n/a | n/a | n/a | Alternative of `DynamicViewDisplayVariantProperty`, `ViewProperty`. |
| `DynamicViewDisplayVariantProperty` | `variant sequence` | no | no | no | no | |
| `DynamicViewRule` | any dynamic view rule | n/a | n/a | n/a | n/a | Alternative of the dynamic view rule rows (`DynamicViewIncludePredicate`, `DynamicViewGlobalPredicateRef`, `ViewRuleStyleOrGlobalRef`, `ViewRuleAutoLayout`). |
| `DynamicViewIncludePredicate` | `include cloud.*` | no | partial | no | no | At creation only (`addView({ type: 'dynamic', includes })`). |
| `DynamicViewGlobalPredicateRef` | `global predicate common` | no | no | no | no | |
| `StepStatement` | any step | n/a | n/a | n/a | n/a | Alternative of `SubflowStep`, `AltSteps`, `TryStep`, `StepSeries`. |
| `StepsBlockFragment` | `{ steps }` | n/a | n/a | n/a | n/a | Fragment: the step block of subflows. |
| `SubflowKind` | `par`, `opt`, `loop` | n/a | n/a | n/a | n/a | Keyword of `SubflowStep`. |
| `SubflowStep` | `par { a -> b  a -> c }` | no | no | no | no | |
| `StepsBlock` | `{ steps }` after `finally` / `catch` | n/a | n/a | n/a | n/a | Wrapper of `StepsBlockFragment`. |
| `TryStep` | `try { } catch { } finally { }` | n/a | n/a | n/a | n/a | Wrapper of `FinallyBlock` (rated in `TryBlock`, `CatchBlock`, `FinallyBlock`). |
| `FinallyBlock` | `finally { ... }` | no | no | no | no | |
| `CatchBlock` | `catch { ... }` | no | no | no | no | |
| `TryBlock` | `try { ... }` | no | no | no | no | |
| `AltSteps` | `alt { if { ... } else { ... } }` | no | no | no | no | |
| `StepTarget` | `-> b 'title'` | n/a | n/a | n/a | n/a | Fragment of step chains. |
| `StepSeries` | `a -> b -> c` | no | no | no | no | |
| `Step` | `user -> api 'checkout'`, `api <- db` | no | no | no | no | |

## Global

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Globals` | `global { ... }` | no | no | n/a | no | Container: its content has the rows below. |
| `GlobalPredicateGroup` | `predicateGroup common { include * }` | no | no | no | no | |
| `GlobalDynamicPredicateGroup` | `dynamicPredicateGroup flows { include * }` | no | no | no | no | |
| `GlobalStyleId` | `mute` (name) | n/a | n/a | n/a | n/a | Name holder of `GlobalStyle` / `GlobalStyleGroup`. |
| `GlobalStyle` | `style mute * { opacity 40% }` | no | no | no | no | |
| `GlobalStyleGroup` | `styleGroup theme { style * { ... } }` | no | no | no | no | |

## Imports and likec4lib

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ImportsFromPoject` | `import { api } from 'other-project'` | no | no | no | no | (The rule name's spelling is LikeC4's.) Imported names are not resolved. |
| `Imported` | `api, db` in an import | n/a | n/a | n/a | n/a | Name list of `ImportsFromPoject`. |
| `LikeC4Lib` | `likec4lib { icons { tech:custom } }` | no | no | no | no | |
| `LibIcon` | `tech:custom` in `likec4lib` | no | no | no | no | |

## Shared fragments and values

| Rule | DSL example | Read | Add | Update | Remove | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Tags` | `#internal, #critical` | partial | partial | partial | partial | Elements, relationships (line or body) and their `extend` blocks: read (effective, `declared`, `extendedBy`), written by `addElement` / `addRelationship`, replaced by `updateElement` / `updateRelationship({ tags })`; `[]` clears own and `extend` tags (kind tags still apply). Kind tags are read only (`fromSpecification`). Views and deployment: not supported. |
| `TagRef` | `#internal` | n/a | n/a | n/a | n/a | Reference inside `Tags` and `where` conditions. |
| `ElementRef` | `cloud.api` after `of` / `instanceOf` | n/a | n/a | n/a | n/a | Reference in `ElementView`, `DeployedInstance`, steps; written as given by `addView({ target })`, not rewritten on remove. |
| `StrictFqnElementRef` | `cloud.api` after `extend` | n/a | n/a | n/a | n/a | Reference of an element `extend`, resolved when reading `extendedBy`. |
| `FqnRef` | `cloud.api`, `this`, `it` | n/a | n/a | n/a | n/a | Reference: relation endpoints, resolved to FQNs when reading; no rename / move rewrites references. |
| `StrictFqnRef` | `prod.eu` after `extend` | n/a | n/a | n/a | n/a | Reference of `ExtendDeployment` (not supported). |
| `LinkProperty` | `link https://example.com 'Docs'` | partial | partial | partial | partial | Elements and relationships: read (effective, kind links when none), written by `addElement` / `addRelationship`, replaced by `updateElement` / `updateRelationship({ links })`; `[]` clears own and `extend` links. Kind links are read only. Views and deployment: not supported. |
| `ColorRef` | `red`, `brand` | n/a | n/a | n/a | n/a | Fragment: the value of `ColorProperty` / `IconColorProperty` / tag color. |
| `ColorProperty` | `color red` | no | partial | partial | no | `style.color` of elements and relationships (add, merge per field); only as text in a `with { }` of a new view. Kinds, groups, view / global styles, deployment: not supported. Not read; cannot be removed. |
| `OpacityProperty` | `opacity 40%` | no | partial | partial | no | `style.opacity` of elements (add, merge per field). Not read; cannot be removed; not in kinds, groups, views, deployment. |
| `MultipleProperty` | `multiple true` | no | partial | partial | no | `style.multiple` of elements (boolean; add, merge per field); in a relation `with { }` only as text of an `includes` item of a new view. Relationship kinds: not supported. Not read; cannot be removed. |
| `IconProperty` | `icon tech:postgresql` | no | partial | partial | no | Written inside `style { }` only (`style.icon`); an element body-level `icon` is not read or changed, so a style icon is added next to it. Not read; cannot be removed. |
| `IconColorProperty` | `iconColor red` | no | partial | partial | no | `style.iconColor` of elements (add, merge per field). Not read; cannot be removed. |
| `IconSizeProperty` | `iconSize sm` | no | partial | partial | no | `style.iconSize` of elements (add, merge per field). Not read; cannot be removed. |
| `IconPositionValue` | `left`, `top` | n/a | n/a | n/a | n/a | Keyword value of `IconPositionProperty`. |
| `IconPositionProperty` | `iconPosition left` | no | partial | partial | no | `style.iconPosition` of elements (add, merge per field). Not read; cannot be removed. |
| `ShapeProperty` | `shape cylinder` | no | partial | partial | no | `style.shape` of elements (add, merge per field). Not read; cannot be removed; not in kinds, views, deployment. |
| `BorderStyleValue` | `dashed`, `none` | n/a | n/a | n/a | n/a | Keyword value of `BorderProperty`. |
| `BorderProperty` | `border dashed` | no | partial | partial | no | `style.border` of elements (add, merge per field). Not read; cannot be removed; not in groups, kinds, views, deployment. |
| `SizeValue` | `sm`, `large` | n/a | n/a | n/a | n/a | Keyword value of the size properties. |
| `ShapeSizeProperty` | `size lg` | no | partial | partial | no | `style.size` of elements (add, merge per field). Not read; cannot be removed. |
| `PaddingSizeProperty` | `padding sm` | no | partial | partial | no | `style.padding` of elements (add, merge per field). Not read; cannot be removed. |
| `TextSizeProperty` | `textSize md` | no | partial | partial | no | `style.textSize` of elements (add, merge per field). Not read; cannot be removed. |
| `StyleProperty` | any style property | n/a | n/a | n/a | n/a | Alternative of the element style property rows. |
| `ElementStyleProperty` | `style { shape cylinder }` | no | partial | partial | no | Elements: `addElement({ style })`, `updateElement({ style })` merges per field and regenerates the block. Kinds, deployment nodes and instances: not supported. Not read; a field or the block cannot be removed. |
| `LineProperty` | `line dashed` | no | partial | partial | no | `style.line` of relationships (add, merge per field). Not read; cannot be removed; not on relationship kinds. |
| `ArrowProperty` | `head diamond`, `tail none` | no | partial | partial | no | `style.head` / `style.tail` of relationships (add, merge per field). Not read; cannot be removed; not on relationship kinds. |
| `RelationshipStyleProperty` | any relationship style property | n/a | n/a | n/a | n/a | Alternative of `ColorProperty`, `LineProperty`, `ArrowProperty`. |
| `RelationKindDotRef` | `.async` in `a .async b` | n/a | n/a | n/a | n/a | The dot form of a relationship kind; rated in `RelationConnector`. |
| `LineOptions` | `solid`, `dashed`, `dotted` | n/a | n/a | n/a | n/a | Keyword value of `LineProperty` / `BorderStyleValue`. |
| `ArrowType` | `normal`, `diamond`, `vee` | n/a | n/a | n/a | n/a | Keyword value of `ArrowProperty`. |
| `DynamicViewDisplayVariantValue` | `diagram`, `sequence` | n/a | n/a | n/a | n/a | Keyword value of `DynamicViewDisplayVariantProperty`. |
| `DynamicViewFlowKeyword` | `alt`, `par`, `try` | n/a | n/a | n/a | n/a | Keywords usable as identifiers (`Id`). |
| `ThemeColor` | `primary`, `amber` | n/a | n/a | n/a | n/a | Keyword value of `ColorRef`. |
| `ElementShape` | `cylinder`, `person` | n/a | n/a | n/a | n/a | Keyword value of `ShapeProperty`. |
| `ColorLiteral` | `#3b82f6`, `rgb(...)` | n/a | n/a | n/a | n/a | Alternative of `RGBAColor`, `HexColor`: value of `SpecificationColor` / tag color. |
| `RGBAColor` | `rgba(59, 130, 246, 0.5)` | n/a | n/a | n/a | n/a | Value of `SpecificationColor` / tag color (not supported). |
| `HexColor` | `#3b82f6` | n/a | n/a | n/a | n/a | Value of `SpecificationColor` / tag color (not supported). |
| `IconId` | `tech:postgresql` | n/a | n/a | n/a | n/a | Value of `LibIcon` / `IconProperty`. |
| `Uri` | `https://...`, `./docs/a.md`, `@alias/x` | n/a | n/a | n/a | n/a | Value of `LinkProperty` / `IconProperty`; written as given. |
| `MarkdownOrString` | `'text'`, `'''markdown'''` | n/a | n/a | n/a | n/a | Value of string properties: read as plain text (dedented, trimmed); always written as a single-line quoted string (line breaks become spaces), never as a `'''` Markdown string. |
| `CustomColorId` | `brand` | n/a | n/a | n/a | n/a | Identifier of a custom color. |
| `Id` | `api`, `db` | n/a | n/a | n/a | n/a | Identifier. |
| `HashId` | `#internal` | n/a | n/a | n/a | n/a | Tag identifier. |
| `EqOperator` | `is`, `is not`, `=`, `!=` | n/a | n/a | n/a | n/a | Fragment of `where` conditions. |
| `IsEqual` | `=`, `!=` | n/a | n/a | n/a | n/a | Fragment of `element.kind` / `element.tag` predicates. |
