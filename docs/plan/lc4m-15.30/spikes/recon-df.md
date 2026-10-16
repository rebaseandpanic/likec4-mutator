# Reconnaissance D/F — relationships and styles (2026-10-17)

# Recon report: relationships (D) and styles (F) in likec4-mutator, against LikeC4 1.59.4

Short version: model relationships are written only as `->`, kind and direction are never written, and `RelationshipInfo` has no direction or style field. Logical elements have no style read at all. The deployment code already writes kinds, `<->` and styles, and reads styles; that code is reusable.

Abbreviations: `LS` = `node_modules/@likec4/language-server/dist/chunks/module.d.mts`, `LSJ` = `.../language-server/dist/chunks/module.mjs`, `CORE` = `node_modules/@likec4/core/dist/chunks/index.d.mts`. `src/parser/grammar.ts` is a helper wrapper; the grammar AST types are in LS.

## D. Relationships

### 1. addRelationship
- **Public API** (`src/mutator/mutator.ts:779-819`): `addRelationship(source, target, label?, opts?: {description, technology, tags, links, metadata, style})`. There is no `kind`, no `bidirectional` and no placement/file option.
- **Checks before writing:**
  - `checkReferenceForm` on both endpoints (792-793), `checkTags` (794), `checkStyle(...,'relationship')` (795).
  - No `checkMetadata` call. `addDeploymentRelationship` does call it (`mutator.ts:2018`).
- **Placement:**
  - The file is `findFileWithModel()` (`mutator.ts:2858-2863`): the first document in load order that has `models.length > 0`.
  - Within it, `addRelationshipEdit` (`relationship-ops.ts:47-85`) appends to `ast.models[0]` through `BodyInsertions.forBlock(...).append`. It throws `'No model block found in document'` when there is no model block (64-66).
- **Validation:**
  - Each endpoint goes through `resolveWritten(doc, filename, ref, field, {model:0})` (`mutator.ts:803-804`, 2518-2533).
  - An unresolved endpoint throws `InvalidWriteError(field, "'x' does not resolve ... (LikeC4 would report: Could not resolve reference)")`.
  - `isSameHierarchy` (imported from `@likec4/core/utils`, `mutator.ts:30`) throws `InvalidWriteError('target', ...)`: a self-relation gets "...LikeC4 rejects a relationship of an element with itself", a parent/child pair gets "...are parent and child" (809-816).
- **Text written** (`codegen.ts:219-238` `generateRelationship`):
  - The line is always `${source} -> ${target}`, with ` 'label'` only when the label is truthy.
  - The body (`generateBody`) holds tags, description, technology, links, `style` and metadata. Description and technology go in the body, never inline.
  - `GenerateRelationshipOpts` (`codegen.ts:170-200`) has no kind or bidirectional field.
- **JSON / CLI form:** `AddRelationshipMutation` in `src/mutations-file.ts:52-63` has no kind or direction. Allowed keys are listed at line 828. The CLI calls are at `src/cli.ts:311` and `:508-510`.

### 2. RelationshipInfo and how relations are read
- **Fields** (`src/query/types.ts:198-276`): `sourceFqn, targetFqn, title?, kind?, technology?, description?, tags?, links?, metadata?, fromSpecification?: KindDefaults, declared, extendedBy, sourceRange`.
  - There is no direction/bidirectional field and no style field. The doc comment at 195-196 says "Style and notation are not covered".
  - `KindDefaults` (55-78) also has no style.
- **Kind:** `relationKind(node) = node.kind?.$refText ?? node.dotKind?.kind?.$refText` (`src/query/relation-node.ts:22-24`). So `-[k]->`, `-[k]<->` and `.k` all report `kind` (`query.ts:278`).
- **AST** (LS:965-978): `Relation { body?, description?, dotKind?: RelationKindDotRef, isBidirectional: boolean, kind?: Reference<RelationshipKind>, source?: FqnRef, tags?, target, technology?, title? }`, with `$container: ElementBody | ExtendElementBody | Model`.
  - `RelationKindDotRef` (LS:1005-1010) is `{ kind: Reference<RelationshipKind> }`.
  - `ExtendRelation` (LS:617-626) and `DeploymentRelation` (LS:372-385) carry the same `isBidirectional` / `kind` / `dotKind`.
- **Where direction is used:**
  - Model relations: `isBidirectional` is read only for `extend` matching. See `relation-extends.ts:42,68,78-79` (a bidirectional fingerprint sorts the endpoints) and `:112-118`, plus `workspace-index.ts:364`.
  - It is reported only for deployment relations (`types.ts:485-486`, `deployment-query.ts:246`) and view expressions (`types.ts:623,626`; `view-query.ts:185,193`).
  - The `toRelationshipInfo` result (`query.ts:305-319`) does not include it.
- **Nested relations** (`workspace-index.ts:447-466` `resolveRelations` → `EndpointResolver.walkContainer`, 681-711):
  - Recurses into `Element.body.elements` and `ExtendElement.body.elements`, pushing a scope frame with `self` = the element's FQN (or the extended FQN).
  - `this` / `it` resolve to `frame.self` (`SELF_ALIASES`, 164; used at ~764).
  - A sourceless `-> x` takes `sourceFqn = sourceText = ownerFqn` and `linkedSource: undefined` (731-742).
  - `resolved` is true only when both endpoints resolved.
  - An unresolved reference is reported as its written text (`ResolvedRelation`, 136-158).
  - `getRelationships` (`query.ts:108-118`) returns all of these, filtered by FQN.

### 3. removeRelationship and the updateRelationship selector
- **removeRelationship(source, target)** (`mutator.ts:984-1001`):
  - `locateRelations({source,target})` (2343-2351): matches by absolute FQN in any file win over matches by written text (`findMatchingRelations`, `relationship-ops.ts:399-419`).
  - It takes the first file in load order. In that file, `removeRelationshipEdit` (`relationship-ops.ts:100-115`) removes `matchRelations(...)[0]`, the first match.
  - There is no kind or title selector, and ambiguity is never reported.
  - Not found throws ``Relationship '${source} -> ${target}' not found``.
  - Endpoint order is not swapped for a `<->` relation: the match is a plain `sourceFqn === source && targetFqn === target` (412-415).
- **Orphaned `extend` cleanup:**
  - `relationKeys(rel => rel.node === removed.node)` (2474-2486) collects fingerprints of the removed relation and of the remaining ones (resolved relations only).
  - `removeOrphanedExtendRelations(keys, () => false)` (2492-2510) then deletes, one at a time, every `extend a -> b` block whose key is in `removed` and not in `remaining`.
  - The whole operation is wrapped in snapshot/restore (993-1000).
- **Selector semantics** (`relationship-ops.ts:137-146, 399-419`):
  - `matchKind` keeps relations where `relationKind(r) === matchKind`, i.e. the written kind text, either form.
  - `matchTitle` keeps relations where `r.title === matchTitle`, the raw inline AST title only. A body `title` or a kind's default title is not considered.
  - Both filters apply before endpoint matching.
- **Errors:**
  - Mutator-level, across files (`mutator.ts:875-885`): `formatNotFoundError` gives `Relationship not found: source=… target=… [kind=…] [title='…']` (`relationship-ops.ts:459-464`). More than one match gives `Multiple relationships match (N found across files: f1, f2). Specify matchKind and/or matchTitle to disambiguate.`
  - Per-document (`relationship-ops.ts:221-226, 466-478`): `Multiple relationships match (N found). Specify matchKind and/or matchTitle to disambiguate. Found: [kind=k title='t'], ...`.
  - An empty patch throws `nothing to update` (200-202).

### 4. How LikeC4 1.59.4 models `<->`
- **One relation, not two.**
  - `parseRelation` emits one object with `isBidirectional: astNode.isBidirectional || void 0` (LSJ:6192-6232).
  - `toModelRelation` / `toDeploymentRelation` wrap it with `applyBidirectional` (LSJ:3237-3261, 3301-3323).
  - `applyBidirectional` (LSJ:3142-3149) returns `{...rel, isBidirectional, tail: rel.tail ?? rel.head ?? "normal"}`.
- **Data types:**
  - `Relationship { source, target: FqnRef.ModelRef; isBidirectional?: boolean }` (CORE:1404-1410).
  - `DeploymentRelationship` has the same shape (CORE:1445-1450).
  - `AbstractRelationship` holds `kind?, color?, line?, head?, tail?, navigateTo?` (CORE:1389-1398).
  - The builder's `NewRelationProps` has `isBidirectional?`, `head?/tail?/line?/color?` (`core/dist/chunks/_types.d.mts:962-979`).
- **Model getters** (`core/dist/chunks/LikeC4Model.d.mts:20-32, 64-72`): `color: Color`, `line`, `head`, `tail: … | undefined`, `isBidirectional: boolean`. At runtime (`core/dist/chunks/model.mjs`):
  - `isBidirectional` is `$relationship.isBidirectional===!0`.
  - `color`, `line` and `head` fall back to `$styles.defaults.relationship.{color,line,arrow}`.
  - `tail` is `$relationship.tail` with no default.
- **Extend identity:** an `extend` relation's fingerprint uses `isBidirectional ? "bidirectional" : "directed"` and sorts the endpoints when bidirectional (LSJ:3414-3422).

### 5. Deployment relationship writer (reusable pieces)
- **Text:** `generateDeploymentRelationship` (`codegen.ts:349-366`) writes `->`, `<->`, `-[kind]->` or `-[kind]<->` (`arrow`/`connector`, 352-353). The title is written whenever defined (including `''`), and description and technology go in the body only. It never writes `.kind`. Options: `GenerateDeploymentRelationshipOpts` (316-341).
- **Mutator:** `addDeploymentRelationship` (`mutator.ts:2010-2050`):
  - Checks: `checkKind(kind,'relationship')` (`write-checks.ts:90-114`, which requires the kind to be declared by a spec), `checkTags`, `checkStyle`, `checkMetadata`.
  - Then a same-hierarchy check, and placement through `chooseDeploymentPlacement`.
  - Options type: `AddDeploymentRelationshipOpts` (`deployment-ops.ts:96-120`).
- **Selector:** `DeploymentRelationshipSelector` plus `selectDeploymentRelationship` (`deployment-ops.ts:122-135, 377-418`):
  - Filters by `kind` and `title` as reported, i.e. effective (own title, else the kind's).
  - A bidirectional relation matches in either endpoint order (386-388).
  - Not found throws `InvalidWriteError('source', ...)`. Ambiguity lists every candidate through `describeRelationship` (`'a' <-> 'b' kind 'k' title 't' in 'file' at line n`, 434-442), with an extra hint when the candidates share endpoints, kind and title.
  - Used by `updateDeploymentRelationship` / `removeDeploymentRelationship` (`mutator.ts:2080-2159`).
  - The JSON form uses `matchKind`/`matchTitle` mapped to `kind`/`title` (`mutations-file.ts:279-304, 490-501, 985-986`).
- **Shared patch code:** `relationPatchEdits(rel, fullText, patch, {inlineStrings:'rewrite'|'body-only'})` (`relationship-ops.ts:253-342`) is used by both model and deployment relations.

## F. Styles

### 6. src/query/style-read.ts
- **What it reads** (header 1-23): values as written, no theme defaults. An empty value is no value, size aliases become tokens (`SIZE_TOKENS`, 38-49), `multiple` is a boolean, opacity stays a string like `'40%'`, an icon is the libicon name or the raw value, and a hex/rgb color is ignored (`readColor` 202-204).
- **Functions:**
  - `readElementStyle(props)` (65-70): the first `ElementStyleProperty` block, later fields overriding earlier ones (`elementStyleOf` 134-177), then a body-level `IconProperty` overriding `icon`.
  - `readKindElementStyle` (78-80): the first block only.
  - `readRelationshipStyle` (88-93): the first `RelationStyleProperty`.
  - `readKindRelationshipStyle` (101-103): props written directly in the kind.
  - `readElementStyleProps` (130-132): for `with {}`.
  - `mergeStyle(base, own)` (109-114): `{...base, ...own}`.
- **Types:** `ElementStyle` (`codegen.ts:17-42`: shape, color, icon, opacity, border, multiple, size, padding, textSize, iconPosition, iconColor, iconSize; all strings except `multiple`) and `RelationshipStyle` (`codegen.ts:159-168`: line, color, head, tail). There is no separate declared-vs-effective type.
- **"Effective" style** means kind style merged with own style, nothing more:
  - Deployment nodes: `deployment-query.ts:321`.
  - Instances (element kind → element → instance): `:214` and `:286-291` (`elementStyle`).
  - Deployment relations (kind → own, then the `applyBidirectional` tail rule): `:256-260`.
  - Specs: `fromSpecification.style` for deployment kinds and relationship kinds (`types.ts:308, 521`).
- **Where used:** `kind-specs.ts:94` (fills `KindSpec.style`, 18-29, which "logical reads" do not report), `deployment-query.ts` (lines above), and `view-query.ts:276, 539`. `query.ts` (ElementInfo/RelationshipInfo) does not use it; `ElementInfo` says "Not covered: style" (`types.ts:90`).

### 7. Writing element styles
- **Path:** `updateElement` (`mutator.ts:650-668`) calls `checkStyle(props.style,'element')`, then `updateElementEdit` (`element-ops.ts:220-228`), then `updateDeclarationEdits(node, doc, props, anchor)` with **no options**.
- **Merge:** `buildReplaceStyleEdits` (`element-ops.ts:704-726`) either merges into the first `ElementStyleProperty` through `buildMergeStyleEdits` (`style-ops.ts:34-58`, which rewrites values in place and appends missing keys) or inserts a `generateStyleBlock` (`codegen.ts:876`).
- **Body-level `icon`:**
  - The `styleIconInBodyIcon` option (`element-ops.ts:113-120, 367-377`, `buildBodyIconEdits` 641-648) rewrites body-level `icon` properties in place. It is passed only for deployment nodes and instances (`mutator.ts:1727, 1957`).
  - So for `api = service { icon tech:go }`, `updateElement({style:{icon}})` adds `style { icon … }` and leaves the body icon untouched. The coverage doc (row at line 349) records that LikeC4 then uses the body icon and warns "Redundant as icon defined on element".
- **Validation:** `checkStyle` (`write-checks.ts:307-333`) checks each field against `STYLE_FIELDS` (234-252) and parses each value with `parseStyleProperty` (`src/parser/grammar.ts:339-370`). Library icon names come from `libraryIconNames` (`grammar.ts:434`).
- **Grammar** (all in LS):
  - Unions:
    - `ElementProperty = ElementStringProperty | ElementStyleProperty | IconProperty | LinkProperty | MetadataProperty` (114).
    - `StyleProperty = Border | Color | IconColor | IconPosition | Icon | IconSize | Multiple | Opacity | PaddingSize | Shape | ShapeSize | TextSize` (205).
    - `RelationshipStyleProperty = Arrow | Color | Line` (188).
    - `RelationProperty` (185).
  - Property nodes:

    | Node | LS line | key | value |
    |---|---|---|---|
    | `ElementStyleProperty` | 533-539 | `'style'` | `props: StyleProperty[]` |
    | `IconProperty` | 760-766 | `'icon'` | `libicon?` or `value?: 'none'\|Uri`; container may be `ElementBody` |
    | `ShapeProperty` | 1053 | `shape` | `ElementShape` |
    | `ColorProperty` | 295 | `color` | `themeColor?` / `customColor?` |
    | `OpacityProperty` | 939 | `opacity` | string |
    | `BorderProperty` | 278 | `border` | `BorderStyleValue` |
    | `ShapeSizeProperty` | 1061 | `size` | — |
    | `PaddingSizeProperty` | 957 | `padding` | — |
    | `TextSizeProperty` | 1187 | `textSize` | — |
    | `MultipleProperty` | 907 | `multiple` | boolean |
    | `IconColorProperty` | 743 | `iconColor` | — |
    | `IconSizeProperty` | 769 | `iconSize` | — |
    | `IconPositionProperty` | 752 | `iconPosition` | — |
    | `LineProperty` | 833 | `line` | `LineOptions` |
    | `ArrowProperty` | 270 | `head`\|`tail` | `ArrowType` |
    | `RelationStyleProperty` | 1035-1040 | `'style'` | `props: RelationshipStyleProperty[]` |

  - Value enums: `ArrowType` (86), `LineOptions` (154), `BorderStyleValue` (88), `IconPositionValue` (147), `SizeValue` (192), `ElementShape` (117).
  - Kinds in the specification:
    - `SpecificationElementKind.props: (ElementStyleProperty | LinkProperty | SpecificationElementStringProperty)[]` (1086-1092); deployment node kinds are the same (1077).
    - `SpecificationRelationshipKind.props: (LinkProperty | MultipleProperty | RelationshipStyleProperty | SpecificationRelationshipStringProperty)[]`, i.e. style props directly in the kind, with no `style {}` block (1103-1109).

### 8. LikeC4's computed style fields and defaults
- **`ElementStyle`** (CORE:1353-1379): `icon?, iconColor?, iconSize?, iconPosition?, shape?, color?, border?, opacity?: number` (0-100, `@default 100`), `multiple?` (`@default false`), `size?` (`@default 'md'`), `padding?, textSize?`.
  - `Element.style: ElementStyle` (CORE:1383-1388). `DeploymentNode` / `DeployedInstance` also have `.style` (1418-1434).
- **`ElementSpecification.style`** (CORE:1461-1488) has the same fields.
- **`RelationshipSpecification`** (CORE:1498-1514): `color?, line?, head?, tail?, multiple?` plus strings.
- **There is no `RelationshipStyle` type in core:** relation style lives in top-level fields on `AbstractRelationship` (CORE:1389-1398). Enums: `RelationshipLineTypes` (456-458), `RelationshipArrowTypes` (459-460).
- **Defaults:** `LikeC4StyleDefaults` (CORE:487-510) has `relationship: {color, line, arrow}`. The values (`core/dist/chunks/types.mjs`): `{color:'primary', size:'md', opacity:15, shape:'rectangle', group:{opacity:15, border:'dashed'}, relationship:{color:'gray', line:'dashed', arrow:'normal'}}`.
- **ElementModel.style getter** (`model.mjs`): fills `shape, color, border, opacity, size, padding, textSize (defaults.text), iconPosition` from `$styles.defaults`, then spreads `$element.style`. The instance getter spreads `element.$element.style` then `$instance.style`. Typed `SetRequired<ElementStyle,'shape'|'color'|'size'>` (`LikeC4Model.d.mts:137, 747`).
- **Model relationship getters:** `color`, `line` and `head` default as in section 4; `tail` has no default.
- **Kind merge:** `toModelRelation` spreads the kind spec (minus `multiple`/`tags`) under the own values (LSJ:3237-3250).

### 9. tests/helpers/likec4-model.ts
- **`buildLikeC4Model`** (179-216) exposes:
  - `elements` from `$data.elements` and `relations` from `$data.relations`.
  - `deployments.{elements, relations, specification, getters, relationGetters}`.
- **Types:**
  - `LikeC4ModelElement` (21-29) has no style.
  - `LikeC4ModelRelation` (32-37) has `source, target, kind?, isBidirectional?` and no line/color/head/tail.
  - `LikeC4DeploymentRelation` (62-73) has `isBidirectional, line, color, head, tail`.
- **`expectAgreesWithLikeC4`** / **`expectSameValues`** (311-341): compare title, summary, description, technology, tags, links, metadata (plus metadata key order). They do not compare style.
- **`ReportedRelationship`** (343-347) is `EffectiveValues + sourceFqn, targetFqn, kind?`. **`expectRelationshipsAgreeWithLikeC4`** (360-404) compares a multiset canonical of `[source, target, kind, title||'', description, technology, tags, links, metadata]`. `isBidirectional` and style are not compared.
- **Deployment comparisons:**
  - `ReportedStyle` (492), `ReportedDeploymentElement.style?` (495-499), `ReportedDeploymentRelationship.bidirectional?, style?` (508-517).
  - `reportedStyle` (529-537) turns opacity `N` into `'N%'`.
  - `expectSameStyle` (557-572): same keys; opacity clamped to 0-100; a computed `file:` icon is matched by the pattern `^(\.{1,2}/|/|@)`.
  - `expectDeploymentRelationshipsAgreeWithLikeC4` (690-731) compares `bidirectional` and `style` built from `{line, color, head, tail}`.

### 10. docs/likec4-coverage.md (columns: Read / Add / Update / Remove)
- 118 `Relation` — yes/partial/partial/partial: "connector (`RelationConnector`, direction not reported)".
- 119 › top level of `model` — yes/partial/partial/partial: "`addRelationship` appends … at the end of the first `model` block of the first file that has one …".
- 120 › nested in an element or `extend` body — yes/no/partial/partial: "Read with the enclosing element as source. Never written there."
- 121 › without `source` — yes/no/partial/partial.
- 125 › change endpoints, kind, direction — n/a/n/a/no/n/a.
- 126 › removal selector — n/a/n/a/n/a/partial: "Removes the first match by endpoints (first file in load order); no kind / title selector."
- 127 `RelationConnector` — partial/partial/no/n/a: "Model relationships: only `->` is written … Kind and direction cannot be changed."
- 128 › `->` — yes/yes/n/a/n/a.
- 129 › `<->` — partial/partial/no/n/a: "direction is not reported (`RelationshipInfo` has no bidirectional flag); used for `extend` matching".
- 130 › `-[kind]->` — yes/partial/no/n/a. 131 › `-[kind]<->` — partial/partial/no/n/a. 132 › `.kind` — yes/no/no/n/a: "Never written."
- 140 `RelationStyleProperty` — partial/partial/partial/no: model relations "not read"; written and merged; deployment relations read.
- 374 `RelationKindDotRef` — partial/partial/no/n/a: read everywhere; written only by the step writer.
- Specification rows: 74 `SpecificationElementKind › ElementStyleProperty` — partial/no/no/no ("Not reported for the kind or in `ElementInfo`"). 85 `SpecificationRelationshipKind › RelationshipStyleProperty / MultipleProperty` — partial ("read for deployment relationships only … Not in `RelationshipInfo`"). 373 `RelationshipStyleProperty › relationship kinds` — yes/no/no/no.
- Style property rows:
  - 342-360 `ColorProperty`, `OpacityProperty`, `MultipleProperty`, `IconProperty`, `IconColorProperty`, `IconSizeProperty`, `IconPositionProperty`, `ShapeProperty`, `BorderProperty`, `ShapeSizeProperty`, `PaddingSizeProperty`, `TextSizeProperty` — all partial ×4, each "not read for elements; cannot be removed".
  - 346-348 `IconProperty` › `libicon` / URI / `none` — partial/partial/partial/no.
  - 349 `IconProperty` › element body `icon` — partial/no/partial/no: "Of elements: not reported or changed …".
- Block rows:
  - 362 `StyleProperty › element style { }` — no/partial/partial/no.
  - 364 › element / deployment node kind `style { }` — partial/no/no/no.
  - 365 › deployment node / instance `style { }` — yes/yes/partial/no.
  - 367 `ElementStyleProperty` — partial/partial/partial/no: "Elements: not read. A field or the block cannot be removed."
  - 368 `LineProperty` / 369 `ArrowProperty` — partial ×4: "not read for model relationship[s]".
  - 371 `RelationshipStyleProperty › relation style { }` — partial/partial/partial/no.