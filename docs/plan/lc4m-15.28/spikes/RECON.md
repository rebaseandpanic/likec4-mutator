# lc4m-15.28 reconnaissance: deployment model read/write

Stage 1/2 input for the spec. Every claim cites a file:line of this repository,
of the installed `@likec4/language-server` / `@likec4/core` **1.59.4**
(`node_modules/@likec4/language-server/dist/chunks/module.mjs`, abbreviated
`LS:<line>`; `node_modules/@likec4/core/dist/chunks/model.mjs`, abbreviated
`CORE`), a doc URL, or a spike in this folder (`NN-*.md` holds the exact
command and its real output). Statements marked ASSUMPTION are not verified.

Spikes: `01-ast-shape`, `02-computed-model`, `03-validation-matrix`,
`04-reference-scoping`, `05-views-and-removal`, `06-value-edge-cases`,
`07-library-today` (+ shared helper `_lc4.mts`).

---

## A. Library architecture

### A1. Public read API and how effective values are computed

- Exports: `src/index.ts:1-46` — `C4Parser`, `C4Query`, `WorkspaceIndex`,
  `LikeC4Mutator`, `InvalidWriteError`, types `ElementInfo`,
  `RelationshipInfo`, `SpecificationInfo`, `KindDefaults`,
  `ExtendContribution`, `ElementDecorations`, style/metadata types, codegen
  helpers.
- `ElementInfo` (`src/query/types.ts:138-228`): `fqn, name, kind, title`
  (always defined), `summary, description, technology, tags, links, metadata`
  (effective), `fromSpecification?: KindDefaults`, `declared:
  ElementDecorations`, `extendedBy: ExtendContribution[]`, `children,
  parentFqn, sourceRange`. No style field (types.ts:133).
- `RelationshipInfo` (types.ts:241-319): `sourceFqn, targetFqn, title, kind,
  technology, description, tags, links, metadata, fromSpecification,
  declared, extendedBy, sourceRange`. No style, no direction field.
- `KindDefaults` (types.ts:98-121): kind, file, sourceRange, title, summary,
  description, technology, tags, links (no style).
- `SpecificationInfo` (types.ts:324-331): `elementKinds, tags,
  relationshipKinds` only; `LikeC4Mutator.getSpecification()` merges all
  files, returns null when empty (mutator.ts:204-227).
- Effective values of an element (`C4Query.toElementInfo`, query.ts:163-234):
  own inline/body strings (`removeIndent`/`toSingleLine`,
  likec4-text.ts:12-58) → kind defaults (`workspace.elementKind`) → tags /
  links / metadata via `applyKindDefaults` (extend-merge.ts:121-127: kind
  tags first, own links else kind links) then `mergeContributions` with every
  `extend` block (extend-merge.ts:137-158, port of LikeC4 `MergedExtends`).
  Bodies are read by `readContribution` (LikeC4 order, normalized) and
  `readDeclared` (source order, as written) (extend-merge.ts:51-97); only the
  first `metadata {}` block counts (extend-merge.ts:104-108).
- Document order: `mergeOrder` sorts by normalized path with
  `compareNaturalHierarchically('/')` (workspace-index.ts:778-813); kind specs
  merged last-document-wins, within a doc last element kind / first relation
  kind wins (workspace-index.ts:213-236).
- Reads are per file (`C4Query` per document, aggregated by `LikeC4Mutator`,
  mutator.ts:154-198) over a shared `WorkspaceIndex` rebuilt after every edit
  (mutator.ts:754-764).

### A2. Write pipeline

- Each op: value checks first (`write-checks.ts`: `checkElementName`,
  `checkKind` element|relationship, `checkTags`, `checkStyle`
  element|relationship, `checkReferenceForm`, view checks) throwing
  `InvalidWriteError(field, detail)` (write-checks.ts:38-48); then semantic
  checks against the index (duplicate FQN, mutator.ts:254-262; endpoints
  resolved by `resolveWritten` → `resolveReferenceText`, mutator.ts:896-912;
  `isSameHierarchy` parent/child rejection, mutator.ts:474-481).
- `addElement` re-resolves every reference after writing and rolls back when
  one changes target (`referenceResolutions` / `rejectChangedReferences`,
  mutator.ts:263-276, 915-956). The reference list
  (`resolveDocumentReferences`, workspace-index.ts:514-558) explicitly
  excludes the deployment model (workspace-index.ts:511-512).
- Edits: op builders return `TextEdit[]` against the current parse
  (text-edit.ts:8-59, end→start application, overlap check). Multi-file ops
  collect `Map<file, TextEdit[]>` and apply atomically
  (`applyEditGroups`, mutator.ts:803-818); every file is reparsed and
  brace-checked, failure restores the snapshot (`applyEditsToFile`,
  mutator.ts:1077-1100; `snapshot/restore` 1027-1036). New text uses `\n` and
  gets the file's line ending (`withLineEnding`, text-edit.ts:68-81).
- Insertion layout: `BodyInsertions` (body-layout.ts:42-120): `forBody(node)`
  needs a `{}` body and uses `node.body.elements` as "first child" anchor for
  properties; `forBlock(cst)` for `model {}` / `views {}`; `prepend` (tags),
  `addProperty`, `append`. Bodyless node: one combined snippet creates the body
  (element-ops.ts:254-302).
- Per-field rules in `updateElementEdit` (element-ops.ts:157-247): title
  inline+every body title (element-ops.ts:449-489), inline summary/technology
  positional strings (491-510), body string props rewrite every declaration
  (512-547), tags REPLACE (602-657), links REPLACE (cst-helpers.ts:250+),
  style MERGE in place in the first `style {}` (style-ops.ts:115-141),
  metadata MERGE + `null` delete (metadata-ops.ts:205, 324).
- `extend` handling on update: patched tags/links/metadata keys are stripped
  from every `extend X` of exactly X (`clearExtendContributionsEdits`,
  element-ops.ts:401-422; mutator.ts:323-343); `tags/links/metadata` updates
  are rejected while any file has syntax errors (`rejectWhileSyntaxErrors`,
  mutator.ts:786-797).
- Removal cascade (`removeElement`, mutator.ts:375-435): removes dependent
  relations one by one, orphaned `extend a -> b`, all `extend` blocks of the
  subtree, then the element. **It does not look at `instanceOf`**: spike 07 C
  shows `removeElement('app.api')` succeeds and LikeC4 then reports
  `Could not resolve reference to Referenceable named 'api'`.
- File choice: root elements and relations → first file with a `model` block
  (`findFileWithModel`, mutator.ts:1052-1059); views → first file with a
  `views` block (1066-1071). No top-level block is ever created (coverage row
  `LikeC4Grammar`, docs/likec4-coverage.md:60).
- `apply`: `parseMutationsFile` validates the whole file first
  (mutations-file.ts:530); `MUTATION_FIELDS` per op (mutations-file.ts:335-391)
  with a compile-time exhaustiveness check against the TS interfaces
  (393-401); form checks reuse the library checks and map `InvalidWriteError`
  fields to `mutations[i].<path>` (`formChecks`/`mutationFieldPath`,
  mutations-file.ts:224-244); dispatch in `cli.ts:476-578`; any error exits 1
  before writing (cli.ts:464-473, 594-597).

### A3. Reusable pieces vs model-specific

Reusable as is (verified on deployment ASTs in spike 07 B or by grammar):
- `readContribution` / `readDeclared` on node and instance bodies (spike 07 B:
  tags, links, metadata read correctly) and `mergeContributions` (LikeC4 uses
  the same `MergedExtends` class for deployment extends, LS:3427-3475,
  3491, 3555).
- `readKindSpec(node, file, false)` on `SpecificationDeploymentNodeKind`
  (spike 07 B; LikeC4 parses deployment kinds with the same
  `parseElementSpecificationNode` and `Object.assign`, LS:6295-6304, merged
  across docs with `Object.assign`, LS:3184-3190 → same last-wins rule as
  element kinds).
- Body editing helpers: deployment node and instance bodies use the same
  property rules as element bodies — `ElementProperty`
  (`ElementStringProperty | ElementStyleProperty | LinkProperty | IconProperty
  | MetadataProperty`), `tags`, `elements` (grammar: `DeploymentNodeBody`,
  `DeployedInstanceBody`; spike 01 shows `ElementStringProperty`,
  `MetadataBody`, `LinkProperty`). Deployment relation body = `RelationProperty`
  as model relations (`DeploymentRelationBody`). `ExtendDeploymentBody` props =
  `ExtendElementProperty` (link, metadata) like `ExtendElementBody`. So
  `BodyInsertions.forBody`, tag/link/metadata/style builders,
  `clearExtendContributionsEdits`, `buildRemovalEdit`, codegen helpers
  (`generateStyleBlock`, `generateMetadataBlock`, `formatTag`, …) apply.
- `checkStyle(…, 'element'|'relationship')`, `checkTags`, `checkKind` pattern.

Model-specific (must be generalized or duplicated):
- `buildTitleEdits` / inline strings anchor on `node.kind.$refNode`
  (element-ops.ts:449-510). A `DeploymentNode` in `kind name` form has the
  name after the kind; an instance has no kind (anchor = `target`). Deployment
  nodes and instances have inline `title summary?` only — **no inline
  technology** (grammar `DeploymentNode`, `DeployedInstance`).
- `readStrictFqnRef` reads `.el` (fqn.ts:478-488); `ExtendDeployment` uses
  `StrictFqnRef` whose segments are in `.value` (spike 01: `targetType
  StrictFqnRef`; grammar `StrictFqnRef`).
- `checkKind` knows only `element|relationship` (write-checks.ts:84-101).
- `addElementEdit` / `findFileWithModel` / `forEachElementDeclaration` /
  `buildFqnIndex` walk `ast.models` only.
- `getSpecification` / `specificationKinds` ignore `deploymentNodes`
  (query.ts:123-157, kind-specs.ts:351-363); spike 07 A.
- Relationship ops assume `Relation` (inline description/technology are
  read by LikeC4 for model relations but **ignored** for deployment relations,
  see B2).

Reference resolver: `EndpointResolver` (workspace-index.ts:600-708) +
`computeLocalScope` (720-749) mirror `processContainer` / `computeScope` for
`Element` refs only. The deployment scope (B3) has the same skeleton
(container local scopes with unique descendants, `this`/`it`, extend frames,
document scope, project roots, qualified segments via unique descendants) but
a different index (nodes + instances, `DeploymentsIndex` LS:3056-3110), a
two-pass type order (nodes before instances) and qualified segments that can
step from an instance into its element's model tree. It can be built on the
same pattern as a separate `DeploymentIndex` + resolver; extending
`EndpointResolver` in place would mix two indices.
`resolveReferenceText(ast, ws, ref, 'views')` already equals the `instanceOf`
target scope (no container contributes `Element` names; document scope + root
elements) — ASSUMPTION that this equivalence holds in every position inside a
deployment block (spike 03 cases 10/11 show `instanceOf api` / `instanceOf
sub` resolve via unique descendants, consistent with it; not checked against
the library function).

### A4. Test helpers

`tests/helpers/likec4-model.ts`: `buildLikeC4Model(files)` returns
`diagnostics, errors, elements ($data.elements), relations ($data.relations),
views` (likec4-model.ts:102-123); `validateLikeC4` = errors + layout
(155-169); `expectValidLikeC4` (172-174); `expectSameValues` /
`expectAgreesWithLikeC4` / `expectRelationshipsAgreeWithLikeC4` compare the
data layer (187-287). **Deployments are not exposed.** The computed model has
`$data.deployments.elements` / `$data.deployments.relations` and
`$data.specification.deployments` (LS:3666-3670, 3655; spike 02), plus the
`LikeC4Model` getters `model.deployment.element(id)` /
`model.deployment.relationships()` (spike 02, 06).

---

## B. LikeC4 1.59.4 deployment semantics

### B1. AST / grammar (`npx tsx scripts/grammar-rules.ts`)

```
ModelDeployments  : name='deployment' '{' elements+=(DeploymentNode | DeploymentRelation | ExtendDeployment)* '}'
DeploymentNode    : ((kind=[DeploymentNodeKind:Id] name=Id) | (name=Id Eq kind=[DeploymentNodeKind:Id])) (title=String summary=String?)? body=DeploymentNodeBody?
DeploymentNodeBody: '{' tags=Tags? props+=ElementProperty* elements+=(DeployedInstance | DeploymentRelation | DeploymentNode)* '}'
DeployedInstance  : (name=Id Eq)? 'instanceOf' target=ElementRef (title=String summary=String?)? body=DeployedInstanceBody? ';'?
DeployedInstanceBody: '{' tags=Tags? props+=ElementProperty* elements+=DeploymentRelation* '}'
ExtendDeployment  : 'extend' deploymentNode=StrictFqnRef body=ExtendDeploymentBody
ExtendDeploymentBody: '{' tags=Tags? props+=ExtendElementProperty* elements+=(DeployedInstance | DeploymentRelation | DeploymentNode)* '}'
DeploymentRelation: ((source=FqnRef) | (source=FqnRef?)) RelationConnector target=FqnRef (title=String (description=String technology=String?)?)? tags=Tags? body=DeploymentRelationBody?
DeploymentRelationBody: '{' tags=Tags? props+=RelationProperty* '}'
RelationConnector : dotKind=RelationKindDotRef | '-[' kind=[RelationshipKind] (']<->' | ']->') | '<->' | '->'
SpecificationDeploymentNodeKind: 'deploymentNode' kind=DeploymentNodeKind ('{' tags=Tags? props+=(SpecificationElementStringProperty | LinkProperty | ElementStyleProperty)* '}')?
```
- `LikeC4Grammar.deployments`; a file may hold several `deployment` blocks.
- Parsed shape (spike 01): `DeploymentNode {name, kind.$refText, title,
  summary, body}`, `DeployedInstance {name?, target: ElementRef{modelElement:
  FqnRef}, title, summary, body}`, `DeploymentRelation {source?, target,
  kind | dotKind.kind, isBidirectional, title, description, technology, tags,
  body}` with `$container` `ModelDeployments | DeploymentNodeBody |
  DeployedInstanceBody | ExtendDeploymentBody`, `ExtendDeployment
  {deploymentNode: StrictFqnRef (.value), body}`.
- There is no `extend` for deployment relations in the grammar
  (`ExtendRelation` is model-only); a sourceless relation inside an `extend`
  body is a **parse error** (spike 03 #19).
- Body order: tags, then props, then nested elements (all three body rules);
  `extend` bodies accept no string/style/icon props (spike 03 #36: `title`
  in extend → parse error).

### B2. Computed model

Ids (spike 02, 04; `DeploymentsIndex` LS:3083-3110; `LikeC4NameProvider`
LS:7289-7293):
- Node id = parent path + name (`prod.vm1`). Instance id = node path + its
  name; an unnamed instance's name is the `$refText` of the **last segment**
  of the written `instanceOf` reference (`app.api` → `api`; `instanceOf api`
  → `api`) (LS:7292). Children of `extend X { … }` are children of X
  (LS:3101-3105; spike 03 #37 `prod.vm1.api` declared in an extend of
  `prod.vm1`).
- Instances are leaves of the deployment index (LS:3092).

Nodes (data layer `toDeploymentElement`, LS:3266-3299, then
`MergedExtends.applyExtended`, LS:3561-3564; getters `DeploymentNodeModel`, CORE):
- `{...kindSpec, ...own}`: kind summary / description / technology / links
  apply when the node has none; own links **replace** kind links (spike 02
  `staging`). Style: per-field `{...kind.style, ...own.style}` (spike 06
  `ownTags` → `{color green, shape queue}`).
- Title: own (`parseBaseProps`: inline beats body, LS:5407-5418,
  5463-5486), else name; then if `title === name` and the kind has a title →
  kind title (LS:3282). So `zone named 'named'` gets the kind title, `zone
  prod ''` / `title ''` keeps `''` (spike 06 `selfNamed`, `emptyInline`,
  `emptyBody`) — unlike elements, whose empty title falls back.
- Tags, **data**: own tags replace kind tags (`staging`: `["own","ext2",
  "ext1"]`, no `zonekind`); without own tags the kind's (`prod`:
  `["zonekind"]`). **Getter** `tags` = `unique([...data.tags, ...kindTags])`
  (CORE `DeploymentNodeModel.tags`): `staging` → `["own","ext2","ext1",
  "zonekind"]`; `ownTags` (`#k2, #own`, kind `#k1, #k2`) →
  `["own","k2","k1"]` (spike 06). Within a body, comma groups are read
  last-group-first (`#k1, #k2` → `["k2","k1"]`) as `readContribution` does.
- `extend <node>` (data, `MergedExtends`): tags union, links concatenated,
  metadata merged, declaration first, extends in document order —
  `a/z.c4` before `b.c4`: owner `["ops","ext-az","ext-b"]` (spike 02).
  Only nodes are extended (`isDeploymentNode(el) ? applyExtended : el`,
  LS:3563). An extend that only adds children contributes nothing
  (`parseExtendDeployment` returns null without tags/links/metadata,
  LS:5511-5518). An extend body can contain nodes, instances, relations.
- Metadata: first `metadata {}` block only (spike 06 `ownTags`: `{a:'1'}`,
  second block ignored; LS:5470).

Instances (data `parseDeployedInstance`, LS:5488-5509: own values only;
inheritance only in getters `DeployedInstanceModel`, CORE):
- `title = own ?? element.title` — `''` is kept (spike 06 `host.i1`,
  `host.i2` title `''`).
- `summary = preferSummary(own) ?? preferSummary(element)`, `description =
  preferDescription(own) ?? preferDescription(element)` where
  `preferSummary(e) = e.summary ?? e.description` (core `types.mjs`) — so the
  getter falls back **across** summary/description (spike 06 `host.i3`:
  description shows the inline summary).
- `technology = own ?? element.technology` (element technology includes its
  kind default: `prod.vm1.api` → `Go`); links `own ?? element.links`
  (replace); metadata `own ?? element.metadata` (**replace whole map**:
  `api2` → `{region:'eu'}` only); tags `unique([...own, ...element.tags])`
  (own first: `["inst","svc","own"]`, spike 02). Style: element style then own
  per field (spike 06 `host.i2`: `color amber`, `shape browser`, `icon
  tech:go`).
- The docs example lists instance tags element-first (`#next, #gamma`,
  https://likec4.dev/llms-full.txt "Filtering Deployment Views by Tags");
  the 1.59.4 getter returns own-first (spike 02). The spike is authoritative.
- Inline `title summary` beat body props (spike 06 `host.i3`).
- `extend` cannot target an instance: `Could not resolve reference …` +
  `ExtendDeployment allows only DeploymentNode` (spike 03 #20; LS:4329-4337).

Deployment relations (`parseDeploymentRelation`, LS:5531-5567;
`toDeploymentRelation`, LS:3301-3325):
- `parseBaseProps(bodyProps, { title: astNode.title })` — the inline
  **description and technology are parsed but ignored** (spike 02: `'reads'
  'inline description' 'inline technology'` → no description/technology).
- Tags: line tags else body tags (LS:5539); both present is **not** an error
  in deployment (spike 03 #39), unlike model relations.
- Kind (`-[k]->` or `.k`): `{...kindSpec (minus multiple, tags),
  ...own}`; kind tags prepended (`unique([...specTags, ...tags])`); kind title
  / description / technology apply when own absent (spike 06). Getter
  `technology`: empty own (`''`) falls back to the kind technology (spike 06
  `host.i1 -> host.i3`: data `""`, getter `Kind tech`); getter `title` is
  `null` for `''`.
- Endpoints: `{deployment}` or `{deployment, element}` when the reference
  steps into the element of an instance (`prod.api.sub` →
  `{deployment:'prod.api', element:'app.api.sub'}`, spike 04 F; LS:5708-5737).
- Sourceless source = the enclosing node / instance (LS:5525-5529, spike 04
  E1/E3); relations whose endpoints are missing are dropped; relation id =
  hash(doc, astPath, source, target) (LS:5553).
- No `extend` of deployment relations (grammar; docs "deployment relationships
  cannot be extended" — quoted in the issue).
- Style / navigateTo / links / metadata in the body as for model relations
  (spike 03 #35).

Specification: `$data.specification.deployments[kind]` = title, summary,
description, technology, tags, links, style (spike 02).

### B3. Validation and reference scoping

Validator (spike 03; `deployment-checks.ts` LS:4230-4339):

| Case | Result |
| --- | --- |
| two unnamed `instanceOf app.api` in one node; unnamed + `api = instanceOf app.api` | `Duplicate instance name "prod.api"` (both) |
| two differently named instances of one element | valid |
| instance named like a sibling node | `Duplicate node name` + `Duplicate instance name` |
| same root node in two files; extend child duplicating a base child | `Duplicate node name` (workspace-wide `byFqn`) |
| unknown node kind / unresolved `instanceOf` / `instanceOf` a node | `Could not resolve reference …` |
| `instanceOf api` / `instanceOf sub` (unique descendants) | valid |
| endpoint is a model FQN (`app.db`) | not resolvable at all in a deployment block (`Could not resolve …`, `target … not resolved`) |
| self, node → own descendant, instance → ancestor | `Invalid parent-child relationship` (`isSameHierarchy` of the deployment parts, LS:4325) |
| endpoint into an instance's element (`prod.api.sub`) | valid |
| undeclared relation kind / tag | `Could not resolve reference to RelationshipKind/Tag` |
| `<->` | valid |
| sourceless relation in `extend` body | parse error |
| reserved names (`this`, `it`) | `Reserved word: …` |
| empty `deployment {}`, empty `extend prod {}` | valid |
| node kind named like an element kind | valid |
| all props on nodes / instances / relations (icon, style, multiple, link, metadata) | valid |

Scope rules (LS:7460-7487 `processDeployments`, LS:7575-7647 scope provider;
spike 04):
- Local scope of a container (deployment block, node body, instance body,
  extend body): named direct children (nodes **and** instances) plus deeper
  names unique within the subtree and not shadowed (same algorithm as
  `computeLocalScope`). Node and instance bodies bind `this`/`it`.
- Parentless reference = **two passes**: all `DeploymentNode` candidates
  (container chain outwards, extend frames, document scope, project root
  nodes) first, then `DeployedInstance` candidates (LS:7600-7612). So a root
  node `api` beats a closer instance `prod.api` (spike 04 A), and `it` inside
  an **instance** body resolves to the enclosing **node** (spike 04 E2 →
  `prod -> prod.db`, rejected as parent-child).
- Extend body adds the extended node (by name, `this`/`it` not added) and its
  unique descendants across the workspace (LS:7580-7584; spike 04 G).
- Document scope = names unique across the document's deployment blocks
  (spike 04 D2, H); project scope = root nodes of every file
  (`exportDeployments` exports only root `DeploymentNode`s, LS:7394-7402;
  spike 04 D1/D3).
- Qualified `a.b`: `b` among the unique descendants of `a` in the deployment
  index (`prod.api` → `prod.vm1.api`, spike 04 B; ambiguous → unresolved,
  spike 04 C); when `a` is an instance, among the unique descendants of its
  element in the model (spike 04 F).
- `extend X`: strict path, each segment a direct child **node**
  (LS:7575-7579).
- `instanceOf X`: `Element` scope (LS:7601) — no deployment container
  contributes elements, so document model scope + root elements.

### B4. Deployment views and removal

- Deployment view rules reference nodes / instances by `FqnRef` (both
  deployment and element candidates inside a deployment view body,
  LS:7609); `include`, `exclude`, relation predicates and `style` targets all
  break when the referenced node is removed (spike 05 B: `Could not resolve`
  + `Validation failed: Element "prod.vm1" is not resolved` per rule);
  `include prod.**` survives when `prod` stays.
- Removing a model element referenced by `instanceOf` breaks the deployment
  (spike 05 C); the current `removeElement` does it silently (spike 07 C), and
  `addElement` can make an existing `instanceOf api` ambiguous without being
  rejected (spike 07 D: accepted, LikeC4 then `Could not resolve reference
  … 'api'`), because `resolveDocumentReferences` skips deployment.

### B5. Properties allowed where

- Node and instance bodies: tags, `title/summary/description/technology`,
  `icon`, `link`, `style {}` (same `StyleProperty` set as elements incl.
  `multiple`), `metadata` (grammar `ElementProperty`; spike 03 #33, #34).
- Deployment relation bodies: `RelationProperty` (strings, `navigateTo`,
  `style {}` with `RelationshipStyleProperty`, link, metadata).
- Node kind spec: tags, string props, links, `style {}` (no metadata).
- `extend <node>` body: tags, link, metadata, nested nodes / instances /
  relations (with explicit source).

### B6. Multi-file

- Several files with `deployment` blocks; root node names must be unique
  workspace-wide (spike 03 #6). `extend` in another file merges in LikeC4
  document order (spike 02) and may add children addressable as
  `<node>.<child>` from any file (spike 03 #37, 04 G).

---

## Design implications (what the spec must decide)

1. **Addressing.** Use the LikeC4 deployment id (`prod.vm1.api`) as the
   primary address of nodes and instances: it is unique in any valid model
   (duplicates are validator errors, B3). The issue's "node path + element FQN
   (+ name)" can be an alternative selector, but must resolve to one id;
   duplicates in an invalid workspace → explicit ambiguity error.
2. **Which layer is "effective".** The data layer and the LikeC4Model getters
   differ for node tags (kind tags appended by the getter), instance
   inheritance (getter only) and relation technology `''`. Recommended:
   report the getter semantics for title/technology/tags/links/metadata/style
   (what diagrams and `where` filters use) but per-field summary/description
   (`own ?? element`) without the getter's summary↔description cross-fallback,
   and document it; keep `declared` / `extendedBy` / `fromSpecification`
   provenance; for instances add an `element` (target FQN) and `inherited`
   values. Extend the test helper to expose `$data.deployments` and the
   getters.
3. **Mirror the quirks exactly** (spikes 02/06): node `''` title stays `''`;
   node titled with its own name takes the kind title; own tags/links replace
   kind data then getter appends kind tags; instance metadata replaces the
   element's; relation inline description/technology ignored.
4. **Writes never produce ignored or invalid text:** no inline
   description/technology on deployment relations; no technology inline on
   nodes/instances; no sourceless relation in `extend` bodies; no
   string/style props in `extend` bodies.
5. **Separate `DeploymentIndex` + resolver** mirroring B3 (two-pass node →
   instance, extend frames, document/project scopes, instance → element
   descent), reusing the `WorkspaceIndex` pattern. Add deployment references
   (relation endpoints, `extend` targets, deployment-view rule refs,
   `instanceOf`) to the reference-stability check so every add/rename is
   checked, and close the two existing gaps (spike 07 C/D) — decide whether
   in scope (they are model ops but break deployment).
6. **Rejections to implement** (all from B3): unknown node kind; duplicate
   node / instance id workspace-wide (incl. extend children, unnamed
   instance name = last ref segment); reserved names; unresolved
   `instanceOf`; endpoints must resolve to deployment elements (model FQNs
   rejected); `isSameHierarchy` on the deployment parts; undeclared
   relation kind / tags; extend target must be a node path.
7. **Relationship identity/selector:** no extend, so selection = source id,
   target id (+ optional `element` part), kind, title, direction; ambiguity
   explicit. Recommend default placement top-level in the first `deployment`
   block of the chosen file (sourceless nested forms need no writer).
8. **Block and file choice.** Default for new root nodes / relations: the
   first file (load order) with a `deployment` block; when none, create
   `deployment { }` — recommend an explicit optional `file` option and a
   documented default (first file with a `model` block, appended at file
   end), compatible with the stage 3+4 file-choice option. Children go into
   the parent's declaration body (or a chosen `extend` block if requested).
9. **Removal policy:** cascade deployment relations touching or inside the
   subtree; reject (naming them) when deployment views or relations outside the
   subtree reference it; extend blocks of the subtree removed like
   `removeElement` does.
10. **Generalize, don't fork:** reuse body editing helpers with a
    node-kind-agnostic inline-string anchor (after `kind`/`name`/`target`);
    add `checkKind(…, 'deploymentNode')`; `readStrictFqnRef` variant for
    `StrictFqnRef.value`; `getSpecification()` gains `deploymentNodeKinds`
    (additive) plus `KindDefaults`-like access (with style, since kinds carry
    it).
11. **Structured style read** (issue A): none exists today (ElementInfo has
    no style). Use `parseStyleProperty`-compatible keys of `ElementStyle` /
    `RelationshipStyle`; effective style = kind/element style merged per field
    with own (B2).
12. **`apply`:** new ops with `MUTATION_FIELDS` entries under the existing
    exhaustiveness check; `mutationFieldPath` mapping for any renamed fields.
