# Reconnaissance B/C/E — placement, specification, extend blocks (2026-10-17)

I found everything in all three areas. Line numbers are from the current working tree. The language-server grammar ships as JSON inside `node_modules/@likec4/language-server/dist/chunks/utils.mjs` (`loadGrammarFromJson`). I decoded its rules with a read-only `node -e`; the AST types are in `dist/chunks/module.d.mts`.

## B. Placement

### 1. addElement into a bodiless parent; declaration forms
- **The throw:** `/workspaces/likec4-mutator/src/mutator/element-ops.ts:191-193`, inside `addElementEdit` (starts at :176). If the parent has no `body.$cstNode` it throws `Parent element '${parentFqn}' has no body`. An unknown parent throws `Parent element '…' not found` (:187-189). A test pins this at `tests/integration/edge-cases.test.ts:603`.
- **Root elements:** they go into `ast.models[0]` of the chosen file, via `BodyInsertions.forBlock` (:197-202). If that file has no model block it throws `No model block found in document`. The new element is appended at the end of the block (:204).
- **How updateElement creates a body:** the path is `updateDeclarationEdits` (element-ops.ts:285) → `bodyTargeting` (:322-329) → `buildCombinedBodyInsertElement` (:330-334, defined :395-441).
  - It inserts ` {\n<body>${indent}}` at `cst.end`, the end of the declaration (:439-440).
  - Field order is: tags, summary, description, technology, links, style, metadata.
  - This helper is not in `body-layout.ts`. `BodyInsertions` (`/workspaces/likec4-mutator/src/mutator/body-layout.ts:43`) only works on an existing `{}`: `forBody` throws `internal: body insertion into a node without a { ... } body` (:61-64). Other entry points are `forBlock` (:83) and `forViewBody` (:102).
  - Deployment nodes have their own version, `declarationBodyInsertEdit` (`/workspaces/likec4-mutator/src/mutator/deployment-ops.ts:570-588`). It creates the body at `cst.end` when there is none.
- **Grammar `Element`:**
  ```
  ((kind=[ElementKind] name=Id) | (name=Id Eq kind=[ElementKind])) (props+=String (props+=String (props+=String props+=String?)?)?)? body=ElementBody?
  ```
  - That allows up to 4 inline strings.
  - The library reads positions 0-2 as title / summary / technology (`/workspaces/likec4-mutator/src/query/query.ts:177-189`).
  - Inline title and technology win over the body when written; inline summary wins only when non-empty.
  - The inline anchor is the end of the kind token (`elementInlineAnchor`, element-ops.ts:235-239).
  - Codegen always writes the `name = kind 'title'` form (`/workspaces/likec4-mutator/src/mutator/codegen.ts:84-85`).
- **Grammar `DeploymentNode`:** same two forms, plus `(title=String summary=String?)?`. Its anchor depends on which form is used (`kindFirst`, element-ops.ts:248-255).

### 2. File choice and keys
- **findFileWithModel:** `/workspaces/likec4-mutator/src/mutator/mutator.ts:2858-2863`. It returns the first entry of `this.documents` that has `ast.models.length > 0`. That is Map insertion order (`Object.entries(files)` in the constructor, :329-331), **not** LikeC4 document order. Its doc comment says "pass an explicit target file (future work)" (:2850-2856). A stray doc comment about a views-block finder sits at :2865-2871 with no function under it.
- **Who uses it:**
  - `addElement` with null/'' parent (:569-578). With no model file it throws `No file with a model block found`.
  - `addRelationship` (:796-797, same error). Endpoints resolve against `{ model: 0 }`; the edit goes into the first model block.
  - A child element instead goes to `findFileContaining(parentFqn)` (:2843-2848), the first file whose query has the FQN.
- **chooseBlockPlacement:** `/workspaces/likec4-mutator/src/mutator/block-placement.ts:63-86`, used for the `views` and `deployment` blocks.
  - With `file`: `checkFile`, then that file's first block, else a new block at the end of the file.
  - Without `file`: files are sorted by `mergeOrder`. It takes the first file that has the block, else the first file with a `model` block, else the first file.
  - With no files loaded it throws `InvalidWriteError('file', …)`.
  - `blockInsertEdit` (:92-112) appends `\n\n<keyword> {\n…\n}\n` when it creates a new block.
- **Existing target-file options:**
  - `AddViewOpts.file` (mutator.ts:190, used at :1060).
  - `addDeploymentNode` `opts.file`, root nodes only. For a child it is rejected (:1629-1634).
  - `addDeploymentRelationship` `opts.file` (:2021).
  - `addDeploymentExtend` `opts.file` is **required** (:2177-2179).
  - `addDeploymentInstance` rejects `file` (:1837-1842).
  - Option interfaces: `deployment-ops.ts:56, :120`.
  - `addElement` and `addRelationship` have **no** file option.
  - `listViews({file})` filters on the exact name (:532-536).
- **checkFile:** `/workspaces/likec4-mutator/src/mutator/write-checks.ts:120-126`. It does an exact string match against the loaded keys, with no normalization, and its error says "no file is created".
- **Keys and normalization:**
  - Keys are the `fromFiles` record keys. The CLI `loadDirectory` uses `relative(absDir, fullPath)` for each `.c4` file (`/workspaces/likec4-mutator/src/cli.ts:21-46`).
  - `mergeOrder` (`/workspaces/likec4-mutator/src/query/workspace-index.ts:862-876`) applies `normalizePath` (:883+): splits on `\` and `/`, drops `.`, resolves `..`. It sorts with `compareNaturalHierarchically('/')` and throws `Files 'a' and 'b' denote the same path`.
  - README:702 says "File names must denote distinct paths". README:784, :1104 and :1406 document the placement rules.

### 3. apply validation
- **Where it runs:** validation happens in `parseMutationsFile` (`/workspaces/likec4-mutator/src/mutations-file.ts:1292-1317`), and the whole file is checked before any source is read. Execution is in `/workspaces/likec4-mutator/src/cli.ts:456-790` (`applyMutation`, switch at :488).
- **addElement validation:** `validateMutation` (mutations-file.ts:990).
  - `requireString` on `parent`, `kind`, `id` and `title` (:994). Non-empty is required (:406-416), so **a root element cannot be added via apply** ('' is rejected).
  - Optional fields: summary, description, technology, tags, links, style, metadata.
  - `formChecks` (:512-521) runs `checkElementName`, `checkKind(…, undefined)` (form only), `checkTags(…, undefined)` and `checkStyle`.
  - The JSON `id` maps to library `name` through `mutationFieldPath` (:493-505).
- **The 28 ops** (`MUTATION_FIELDS`, :800-953):
  - Model: addElement, updateElement, removeElement, addRelationship, updateRelationship, removeRelationship.
  - Views: addView (has `file`), updateView, addViewRule, replaceViewRule, removeViewRule, removeView, addViewStep, updateViewStep, moveViewStep, removeViewStep, addViewParallel.
  - Deployment: addDeploymentNode (`file`), updateDeploymentNode, removeDeploymentNode, addDeploymentInstance, updateDeploymentInstance, removeDeploymentInstance, addDeploymentRelationship (`file`), updateDeploymentRelationship, removeDeploymentRelationship, addDeploymentExtend (`node`, `file`, tags, links, metadata), removeDeploymentExtend.
  - addRelationship has no `file`.
- **How strict it is:**
  - `rejectUnknownFields` (:390-404) runs for each op (:991), for the file root (`mutations` only), and for nested links, endpoints, rules, addresses and steps. Error format: `unknown field 'x' for op '…'; expected one of …`.
  - A compile-time check (`FieldsNotListed` / `AssertNever`, :956-963) forces `MUTATION_FIELDS` to cover every interface key.
  - An unknown op gives `${path}.op: unknown mutation op` (:1275-1281).
  - Update ops call `requirePatchField` (:972-977).
  - Errors are `MutationsFileError(path, detail)` with a JSON path like `mutations[i].field` (:362-371).
  - Checks that need the loaded workspace (declared kinds/tags, duplicates) run at apply time. There, an `InvalidWriteError` is mapped to `mutations[i].<field>` (cli.ts:466-472).
  - Output is written only after every mutation succeeds (cli.ts:779-787).

## C. Specification

### 4. getSpecification and kind defaults
- **Return type and sources:**
  - `getSpecification(): SpecificationInfo | null` (mutator.ts:407-433).
  - The per-file part is `C4Query.getSpecification` (`/workspaces/likec4-mutator/src/query/query.ts:123-157`). It reads `spec.elements[].kind.name`, `spec.tags[].tag.name` and `spec.relationships[].kind.name` — names only.
  - Deployment node kinds come from `specificationKinds(ast).deploymentNodes` (mutator.ts:417-419).
  - Values are deduped in first-seen order.
  - It returns null when all four lists are empty.
  - `deploymentNodeKinds` is present only when non-empty (`/workspaces/likec4-mutator/src/query/types.ts:281-294`).
  - Colors (`SpecificationColor`) are not reported.
- **Where defaults are read:**
  - `/workspaces/likec4-mutator/src/query/kind-specs.ts`: `specificationKinds` (:43-58) and `readKindSpec` (:69-100).
  - String props: `SpecificationElementStringProperty` or `SpecificationRelationshipStringProperty`; the last key wins. title and technology use `markdownAsString`, summary and description use `markdownOrString`. Relationship kinds get no summary. **`notation` is not read.**
  - Tags and links: declared form via `readDeclared`; `contribution` via `readContribution`.
  - Style: `readKindElementStyle` / `readKindRelationshipStyle` (style-read.ts).
  - Result type: `KindDefaults` (types.ts:55-78).
- **Workspace lookups:** `/workspaces/likec4-mutator/src/query/workspace-index.ts:185-241`.
  - Element kinds: the last declaration in the last document wins (:224-234).
  - Relationship kinds: within a document the first declaration wins, and later documents override (:229-235).
  - Lookups: `elementKind` (:286), `relationshipKind` (:294), `deploymentNodeKind` (:304), `hasTag` (:313). There is also `hasCustomColor`, used by write-checks.ts:281.
- **`fromSpecification` is attached at:** query.ts:226 (element), query.ts:315 (relation), deployment-query.ts:261/278 (deployment relation), deployment-query.ts:322/340 (node). `getDeploymentNodeKind` is at mutator.ts:445-456.
- **How defaults merge with an element's own values:** `applyKindDefaults` (`/workspaces/likec4-mutator/src/query/extend-merge.ts:121-127`).
  - Tags: the kind's tags, then the element's own, deduped.
  - Links: the element's own; the kind's only when it has none.
- **Grammar rules:**
  - `SpecificationRule`: `"specification" "{" (elements+=SpecificationElementKind | tags+=SpecificationTag | relationships+=SpecificationRelationshipKind | colors+=SpecificationColor | deploymentNodes+=SpecificationDeploymentNodeKind)* "}"`
  - `SpecificationElementKind`: `"element" kind=ElementKind ("{" tags=Tags? props+=(SpecificationElementStringProperty | LinkProperty | ElementStyleProperty)* "}")?`
  - `SpecificationDeploymentNodeKind`: same as element, with the `"deploymentNode"` keyword.
  - `SpecificationElementStringProperty`: `key=("title"|"description"|"technology"|"notation"|"summary") ":"? value=MarkdownOrString ";"?`
  - `SpecificationRelationshipKind`: `"relationship" kind=RelationshipKind ("{" tags=Tags? props+=(LinkProperty | RelationshipStyleProperty | SpecificationRelationshipStringProperty | MultipleProperty)* "}")?`. Relationship style properties sit directly in the body (Color, Line or Arrow property); there is no `style {}` block.
  - `SpecificationRelationshipStringProperty`: keys `title`, `description`, `technology`, `notation` (no summary).
  - `SpecificationTag`: `"tag" tag=Tag ("{" ("color" (ColorRef | color=ColorLiteral))? "}")?`
  - `SpecificationColor`: `"color" name=CustomColor color=ColorLiteral`
  - `ElementKind`, `RelationshipKind`, `Tag` and `DeploymentNodeKind` are each `name=Id`.
  - `Tags`: `prev?` plus `values: TagRef[]`. `TagRef`: `tag=[Tag:HashId]`.
  - Metadata is not allowed in any spec kind.

### 5. Declaration checks ("Stage 0a")
The string "Stage 0a" does not appear anywhere in `src` or `docs/specs`/`docs/plan`. These are the declaration checks in `/workspaces/likec4-mutator/src/mutator/write-checks.ts` (header :1-14); they run only when a workspace is passed.
- **`checkKind(kind, 'element'|'relationship'|'deploymentNode', ws)`** (:90-112): checks the Id form, then the matching `ws.*Kind` lookup. Error: `<of> kind 'k' is not declared by a specification of the loaded files`. Called from addElement (mutator.ts:566), addDeploymentNode (:1625) and addDeploymentRelationship (:2017). `addRelationship` takes no kind at all.
- **`checkTags`** (:159-172): strips one leading `#`, checks the Id form, then `ws.hasTag`. The field is `tags[i]`.
- **`checkStyle` / `checkParsedStyleValue`** (:270-341): custom colors must be declared (`hasCustomColor`), icons must be library icons, `file://` is rejected, opacity must be 0-100.
- **`checkViewRule`** (:464+): step 4 checks element kinds, tags and relationship kinds against the spec (:535, :538, :547). `where kind is` accepts an element kind or a deployment node kind. The mapping is `REFERENCE_ROLES` (:400-414).
- **Dynamic steps:** `-[k]->` and `.k` kinds are checked in `/workspaces/likec4-mutator/src/mutator/step-ops.ts:116-118`.
- **Resolver predicates:** `isTag`, `isElementKind`, `isElementOrDeploymentNodeKind`, `isRelationshipKind` (`/workspaces/likec4-mutator/src/query/view-resolver.ts:176-193`).

### 6. Where kind and tag names are referenced in the DSL, and what the code reads
Grammar rules that cross-reference a kind or tag:
- `Element.kind` and `DeploymentNode.kind`.
- `RelationConnector`: `-[k]->`, `-[k]<->`, `.k`. Used by `Relation`, `DeploymentRelation` and `ExtendRelation`.
- `OutgoingRelationExpr`: `-[k]->` or `.k`.
- `Step` and `StepSeries`: `-[k]->` or `.k`.
- `FqnExpr`: `element.tag (=|!=) #t` and `element.kind (=|!=) k`.
- `WhereElement`: `tag is #t`, `kind is k`. The `kind` reference type is `DeploymentNodeOrElementKind` (module.d.mts:1291-1297).
- `WhereRelation`: `kind`, `tag`, `source.kind`/`target.kind`, `source.tag`/`target.tag`.
- `TagRef` in every `Tags` list: element, relation, deployment, view and extend bodies, and spec kinds.

What the code reads:
- **Relationship kind:** read in either form by `relationKind` (`/workspaces/likec4-mutator/src/query/relation-node.ts:21-22`). Used at query.ts:278, deployment-query.ts:243, relation-extends.ts:116, workspace-index.ts:362, and for `matchKind` at relationship-ops.ts:410.
- **Element kind:** read as `ElementInfo.kind`.
- **Tags:** read from `$cstNode.text` with `#` stripped, because cross-references are not resolved (extend-merge.ts:185-199).
- **View include/exclude predicates:** parsed in `/workspaces/likec4-mutator/src/query/view-query.ts`.
  - `element.kind` / `element.tag` (:209-212).
  - Connector kind, as `form: 'bracket'|'dot'` (:228-233).
  - `where` leaves for tag, kind and metadata, including participant (:306-325).
  - Dynamic step kind (:504-509).
- **Style rules:** `style …` rules (`ViewRuleStyle`, `DeploymentViewRuleStyle`), global styles and global predicates are indexed by rule kind only (`/workspaces/likec4-mutator/src/query/view-index.ts:135-145`). Their `element.tag` targets are not parsed into items; `buildViewRules` produces items only for include/exclude (view-query.ts:113). The rules of a `views { style … }` block are not listed (view-query.ts:104-106).
- **Reference snapshots:** `reference-snapshot.ts` tracks no kind or tag references; its header :25-35 lists what it covers (element, deployment and view references only).

## E. Extend

### 7. Matching and merge order
- **Grammar:**
  - `ExtendElementOrRelation`: `"extend" (({ExtendRelation} source=FqnRef RelationConnector target=FqnRef title=String? body=ExtendRelationBody) | ({ExtendElement} element=StrictFqnElementRef body=ExtendElementBody))`. The body is required, and these only appear in `model`.
  - `ExtendElementBody`: `tags? props+=(Link|Metadata)* elements+=(Relation|Element)*`.
  - `ExtendRelationBody`: `tags? props+=(Link|Metadata)*`.
  - `ExtendDeployment`: `"extend" deploymentNode=StrictFqnRef body=ExtendDeploymentBody`, inside `deployment`. Its body allows tags, link, metadata and nested nodes, instances and relations.
- **Relation matching** (`/workspaces/likec4-mutator/src/query/relation-extends.ts`):
  - `relationFingerprint` (:75-80) builds `JSON[source, target, kind ?? 'default', title, isBidirectional]`.
  - For a bidirectional relation the endpoints are ordered so the smaller comes first.
  - The title is dedented, from the inline title or else the last body `title` (`relationTitle`, :94-104).
  - The workspace variant `effectiveIdentity` applies the kind's spec title (workspace-index.ts:331-340).
- **Relation merge:** `mergeRelationContributions` (:134-163).
  - Starts from the relationship's own values, kind defaults applied, then each block in merge order.
  - Tags: union. Links: appended unless the same url and label is already present. Metadata: values unioned per key; one value becomes a string, several stay an array.
- **Element merge** (`/workspaces/likec4-mutator/src/query/extend-merge.ts`):
  - `mergeContributions` (:137-158) accumulates every block first: tags deduped, links **concatenated with duplicates**, metadata via `mergeMetadata` (:165-178).
  - The declaration always comes first.
  - Merge order is `mergeOrder`: sorted normalized path, then source order.
  - The full order is kind defaults (`applyKindDefaults`), then the declaration, then the extend blocks.
- **"New values always go into the declaration":**
  - README:727 and mutator.ts:622-628 (updateElement).
  - The relationship version is at mutator.ts:840-851. Clearing happens at :914-922 (`clearExtendContributionsEdits`, plus `buildExtendRelationTitleEdit` when the label changes, `/workspaces/likec4-mutator/src/mutator/relationship-ops.ts:449-457`).
  - An update is rejected when a block it would change also applies to other relations (:925-935), or when blocks with the new title contribute values (:937-958).
  - README:646 says kind defaults are read-only and the spec is never edited.
- **Code that already creates `extend` blocks:**
  - `addDeploymentExtend` (mutator.ts:2165-2196). Requires `file`; needs at least one tag, link or metadata key; rejects an instance (`ExtendDeployment allows only DeploymentNode`). The block goes through `chooseDeploymentPlacement`.
  - Codegen: `generateDeploymentExtend` (codegen.ts:383-391) writes `extend <node>` plus a tags/links/metadata body.
  - Apply op: `addDeploymentExtend` (mutations-file.ts:1249; cli.ts:758-762).
  - Tests: `/workspaces/likec4-mutator/tests/mutator/deployment-extends-write.test.ts` (addition :114, rejections :165, removal :189, survivors :281, unsafe input :358, scopes :372).
  - Nothing creates an `extend X` or `extend a -> b` block in `model`. The `extend` writes there only clear or retitle existing blocks; removeRelationship deletes orphaned blocks (mutator.ts:968-982).

### 8. Research docs (all three exist under gitignored `docs/research/`, `.gitignore:5`)
- **`/workspaces/likec4-mutator/docs/research/spec-kind-defaults.md`** (lc4m-11, 504 lines, Russian)
  - LikeC4 1.59.4 applies kind defaults before merging `extend` blocks.
  - For elements: title, summary, description, technology, tags, links, notation, style. For relationships: title, description, technology, tags, links, notation, line/color/head/tail (`multiple` is not copied).
  - Rules: tags = kind tags then own; links = own, else the kind's; title = the kind's when own is ''; an element's technology, description or summary = the kind's when absent ('' stays ''). For relationships any value present overrides, except title.
  - Recommendation (a): defaults are read-only plus provenance through `fromSpecification`; writes never edit the spec.
  - Open owner questions: whether an element title should always be defined, and whether technology inferred from the icon stays out of scope.
- **`/workspaces/likec4-mutator/docs/research/extend-property-merging.md`** (lc4m-7)
  - The `extend X` body allows only tags, link and metadata, plus nested elements and relations. title, description, style and the like are parse errors (verified by probes).
  - Merge order: declaration first, then blocks in URI-path order.
  - Recommends effective reads with `declared` and `extendedBy[]` provenance, plus the cross-file write variant (b). REPLACE tags/links and MERGE metadata act on the effective value, with patched keys removed from every block atomically.
  - Leaves `extend a -> b` as a separate task.
- **`/workspaces/likec4-mutator/docs/research/extend-property-merging-decisions.md`**
  - Decisions: keep a block that becomes empty; `updateElement` returns `{changedFiles}`.
  - Relation extends are a separate task: the fingerprint is source, target, kind, title and direction, and relation links are deduped by URL plus title, unlike elements.
  - Add one async oracle test against LikeC4's ModelBuilder.
  - Refinements: exact LikeC4 metadata normalization (`['v1']` reads back as `'v1'`); document order by normalized URI with a hierarchical natural comparator; reject keys that collide after normalization.