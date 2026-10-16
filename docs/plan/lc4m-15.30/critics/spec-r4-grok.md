# Spec critique, round 4 — grok

**Artifact:** `docs/plan/lc4m-15.30/spec.md` (draft, 2026-10-17, after round 3).
**Task:** lc4m-15.30 (project lc4m). Description, acceptance criteria, and the decision comments were read from Skein (`skein_show` with `commentsLimit: 0`, then `skein_comment_get` on the round-3 decision FR-010 / D106–D109). Round-3 must-fix lists were read from `critics/spec-r3-grok.md` and `critics/spec-r3-claude.md`.
**Role:** critic of the spec. No implementation is proposed.

LikeC4 facts below were executed on the installed `@likec4/language-server` 1.59.4 through `docs/plan/lc4m-15.30/spikes/_lc4.mts`. The scripts stayed outside the repository. A claim marked verified quotes those runs. Context7 was not available (see FRICTION).

## Coherence of the round-3 fixes

Walked every place the round-3 changes are mentioned.

| Notion | Places checked | Result |
|---|---|---|
| σ (FR-010): elements, unnamed instance ids, paths under instances | US-3 expected, guarantee and acceptance; INV-3; D58; D76; D97; FR-011; SC-003; data flow | Every user cites FR-010. The definition matches the library's deployment index (`src/query/deployment-index.ts`: an unnamed instance is named after the last segment of `instanceOf` as written; an `extend` child belongs to that node). Two unnamed instances whose references end in the same segment are `Duplicate instance name "prod.api"` (verified). A path whose element leaves the deployed subtree is not given a rejection of its own (F4). |
| D97 collision with any sibling id | US-3 rejection and acceptance; D97 | The rejection names a node, a named instance and an unnamed instance. The acceptance names the node and the named instance; the unnamed case stays inside "each rejection above is a test". Siblings written in `extend` bodies are not named (F3). |
| FR-002 predicate connectors, step 2, deployment-view `element.kind`, US-7 without a list, SC-006 | FR-002; US-7 (both sentences); D78; D95; D109; SC-006 | Connectors of include and exclude predicates are in FR-002. Verified: a deployment view `exclude prod.a -[async]-> prod.b` and `exclude prod.a .async prod.b` validate; after the kind is removed, validate reports `Could not resolve reference to RelationshipKind named 'async'`. A style target `a -[async]-> b` does not parse (`Expecting token of type '{' but found '-['`), in a view and in the `views` block, so omitting it is right. Step 2 is limited to element and deployment node kinds. US-7 keeps no place list. SC-006 points at FR-002. `element.kind` in a deployment view names an element kind (verified: `style element.kind = node` fails with `Could not resolve reference to ElementKind named 'node'`). The D109 oracle covers style targets only (F5). |
| FR-020, SC-005, SC-012, US-5, D103 (D98) | FR-020; US-3; US-5 acceptance; SC-005; SC-012; D62; D98; the edge case "Move that changes neither parent nor file" | Consistent. A top-level move without `file` goes to the first `model` block of the element's current file. `moveElement` is outside the D62 load-order test. US-5 cites D71 and D103. Two `model` blocks in one file validate; LikeC4 warns `Prefer one model per document`, and INV-2 does not have to list that warning because this feature does not create a second block. Round-3 must-fix claude #4 and grok #1 are closed. |
| FR-004 addition clause (D101, D107) | FR-004; D107; D101; D92; D61; US-4; INV-8; SC-004 | FR-004 and D107 agree (bare identifier or leading segment; element, deployment node, instance and view only). D92, D61, D101 and US-4 still state the wider rule, and nothing requires the narrowing to be the one that ships (F2). The same new-name rule is not applied to a rename (F1). |
| FR-003 inherited content (D108) | FR-003; D77; D108; US-1; the content edge case; SC-001; SC-012 | FR-003 and D108 agree. Acceptance, the edge case and SC-012 do not carry D108 (F6). |
| Positions (US-9, D106) | US-9; D81; D102; D106; SC-008; `SourceRange` in `src/query/types.ts` | Consistent. `SourceRange.line` and `.column` are documented 0-based; ambiguity lines in the library are printed with `line + 1` (`src/mutator/deployment-ops.ts`, `src/cli.ts`). No acceptance item requires the printed position to round-trip into the selector (F7). |
| SC-004 | SC-004; US-4 acceptance | Consistent. The `opt` and `alt` fixtures are in both. Grok r3 must-fix #3, finding 3, is closed. |

## Findings

### 1. BLOCKER · Hat 1 and Hat 2 · `new`

- **Place:** FR-004 (the new-name check is only "an addition of an element, deployment node, deployment instance or view"); D107; D101; US-3 rejections (the unmodelled case is "a reference into the subtree"); US-4 (the re-check is FR-001 plus the addition sentence); INV-3.
- **Why:** A rename introduces a new name the same way an addition does. FR-004, on a rename, looks for the old name. D107's new-name check is limited to additions. Opaque flow blocks are outside the catalogue (FR-003, FR-004), so INV-3 does not see them. Nothing in the spec rejects the write, and the result fails `likec4 validate`.

  Verified on 1.59.4. The model is `app = e { api = e 'A' }`, `other = e { foo = e 'F' }`, `app.api -> other`, and `dynamic view d { opt { api -> other } }`. It validates. View `d` computes the step `app.api > other`. The text after `renameElement('other.foo', 'api')` does not validate: `Could not resolve reference to Referenceable named 'api'` and `Source not found`, and view `d` has no nodes. The opaque text contains `api` and does not contain `foo`, so FR-004 does not block. An accepted rename breaks INV-1. This is the lc4m-17 hazard reached by a rename.

  The same shape holds for a leading segment. Two elements named `box` make `opt { box.api -> other }` fail the same way (`Could not resolve reference to Referenceable named 'box'`). Renaming some other element to `box` produces that state, and FR-004 again looks for the old name.

  A move does not introduce a new spelling, and it is not this hole. Verified boundaries: two nested elements already named `api` make `opt { api -> other }` fail before any move; moving `app.api` itself to the top level keeps the step on that same element (`app.api > other` before, `api > other` after). The requirement is the rename's new name.
- **Proposal:** The FR-004 new-name rule (D107: a bare identifier, or the leading segment of a dotted name) also applies to the new name of a rename of an element, a deployment node, a deployment instance or a view. US-3 lists that rejection. The acceptance includes the fixture above: the rename is rejected before writing, in the library and in `apply`, and the sources stay byte-identical. INV-8 lists the rejection. D101 and D107 say the rule covers that rename.

### 2. MINOR · Hat 2 · `incomplete closure spec-r3-grok.md#3`

- **Place:** US-4 Expected ("An addition whose new name appears in a construct the library does not model (FR-004) is rejected the same way (D101)"); D61 (additions, citing D101 only); D92 (a whole identifier or any dotted segment, for a write); D101 (additions, "for the new name", with no limit); US-4 acceptance; SC-004.
- **Why:** FR-004 and D107 limit an addition to a bare identifier or a leading segment, and to an element, a deployment node, a deployment instance or a view. US-4 still says the new name "appears", and cites D101. D92 still states the dotted-segment rule for every write. D61 and D101 do not point at D107. US-4's acceptance and SC-004 use the lc4m-17 repro inside `opt` and inside an `alt` branch. In that repro the name is a bare identifier, so the wide rule and the narrow rule both reject it. A plan that blocks on any dotted segment, or that also blocks a kind or tag addition, passes every acceptance item and contradicts D107. D107's rejected alternative was exactly that over-blocking.
- **Proposal:** US-4, D61 and D101 state the D107 rule and cite it. D92 is limited to removals, renames and moves, and points at D107 for a new name. US-4's acceptance adds two cases that must be accepted: an `opt` block contains only `x.api` as a non-leading segment while an element named `api` is added, and an opaque block that spells a new kind or tag name does not block that kind or tag addition.

### 3. MINOR · Hat 1 · `incomplete closure spec-r3-claude.md#2`

- **Place:** US-3 rejection ("any sibling's id in its deployment node — another deployment node, a named or an unnamed instance"); D97; US-3 acceptance (a sibling node and a named instance).
- **Why:** A node's children can be declared in `extend <node>` bodies, in any loaded file. The deployment index already records those children under the node (`src/query/deployment-index.ts`). Verified on 1.59.4: `node prod { svc = instanceOf app.x }` in `a.c4` together with `extend prod { instanceOf app.svc }` in `b.c4` reports `Duplicate instance name "prod.svc"` in both files. A rename can create that collision. The rejection's word "sibling" can be read as the model's children, which includes them, but the acceptance fixtures are only declarations inside the node body. A check that walks that body and not the `extend` blocks accepts the rename and breaks INV-1.
- **Proposal:** The D97 rejection states that siblings include nodes and instances declared in `extend` blocks of that node, in every loaded file. US-3's acceptance includes the cross-file fixture above.

### 4. MINOR · Hat 1 · `consequence of fix spec-r3-grok.md#2`

- **Place:** FR-010 (deployment paths: "their element segments follow the element mapping"); FR-011; US-3 rejections.
- **Why:** FR-010 maps every deployment path under an instance. A move can take the element out of the subtree that instance deploys. The path then has no image under that instance.

  Verified on 1.59.4. `node prod { instanceOf app.api   o = instanceOf app.other }` and `prod.api.h -> prod.o`, with `h` nested under `app.api`, validate with no diagnostics. After `h` is nested under `app.other` instead, validate reports `Could not resolve reference to Referenceable named 'h'` and `DeploymentRelation source not resolved`.

  "Element segments follow the element mapping" has no exception for this. Rewriting the segment `h` in place leaves `prod.api.h`, which does not resolve. Writing the element's FQN does not resolve in a deployment relationship. Chasing `h` onto `prod.o` would retarget the relationship onto another instance. FR-011 ends in "else reject", and US-3 rejects a reference that cannot be rewritten to its new target, so a careful reading rejects the move. The rejection list does not name this case, and no acceptance fixture forces it. A plan that keeps the old path text accepts a write INV-1 forbids.
- **Proposal:** FR-010 states that a deployment path whose element leaves the subtree of the element that instance deploys has no σ image. The move is rejected, and the error lists the path. The relationship is not retargeted onto another instance. US-3's rejections and acceptance include the fixture above.

### 5. MAJOR · Hat 2 · `new`

- **Place:** D109 ("deployment-view style targets by `element.kind` / `element.tag`"); US-7 acceptance (the computed-model sentence, with that style-target exception only); SC-006 (a rename test per FR-002 place).
- **Why:** LikeC4 drops the whole deployment view for `element.kind` and `element.tag` expressions in predicates, the same way it drops it for style targets. Verified on 1.59.4, each with no diagnostics, and `LanguageServices.diagrams()` returning only `index`:
  - `deployment view dv { include element.kind = e }`
  - `deployment view dv { include *  exclude element.kind = e }`
  - `deployment view dv { include element.tag = #t }`
  - `deployment view dv { include *  style element.tag = #t { color red } }`

  An unresolved name still fails validate (`include element.kind = missing` reports `Could not resolve reference to ElementKind named 'missing'`, and that view stays in `diagrams()`). So a missed rewrite is caught by `expectValidLikeC4`. The computed view cannot show that the new name was written.

  US-7 requires the computed model to report the new kind and tag names for every FR-002 place, with the exception limited to style targets. `element.kind` / `element.tag` predicate items are FR-002 places (the expressions bullet). For those places the acceptance cannot be met. `include * where kind is e` is a different form: it validates and the deployment view is computed. `include * where element.kind is e` does not parse in a deployment view (`Expecting token of type '}' but found 'element.kind'`), so it is not a place.
- **Proposal:** Widen D109, and the US-7 exception, to every `element.kind` and `element.tag` expression in a deployment view: include and exclude predicates, and style targets. The oracle for those places is `expectValidLikeC4` plus the written text. `where … kind is` and `where … tag is` stay on the computed-model oracle. SC-006 cites that exception. The README notes the LikeC4 behaviour.

### 6. MINOR · Hat 2 · `new`

- **Place:** FR-003 and D108 ("such a cascade is rejected on purpose, and the README says so"), against US-1 acceptance, the edge case "A cascade that removes a view's last content-producing statement", SC-001 and SC-012.
- **Why:** D108 is a deliberate rejection. US-1's D77 fixtures are a scoped view, an unscoped view and a dynamic view, each with its own include or step. None uses `extends` or a global predicate. The edge case names excludes and opaque blocks, and does not mention inherited content. SC-012's README list does not mention D108. A plan that treats inherited content as content passes every acceptance item, and the README sentence can be omitted without failing SC-012.
- **Proposal:** US-1 and SC-001 include a fixture `view child extends base { include b }`, rejected under `cascade` when `b` is removed, in the library and in `apply`. The edge case states that inherited content does not keep the cascade legal (D108). SC-012's README list includes that sentence.

### 7. MINOR · Hat 2 · `new`

- **Place:** US-9 acceptance; SC-008; D106.
- **Why:** D106 exists so a caller can copy a position out of an ambiguity error and pass it back as the selector. The selector is `{ file, line, column }` 1-based. Reads keep the 0-based `sourceRange` (`src/query/types.ts`). US-9 and SC-008 require that a position selects one of two relationships on one line. They do not require that the text the error prints is the text the selector accepts, nor that an `apply` error names the mutation whose sources the numbers refer to. A plan that accepts the 0-based `sourceRange` numbers, or that prints a different column than it parses, passes both criteria. On one line, a column off by one addresses the other relationship or neither.
- **Proposal:** US-9's acceptance and SC-008 require that a position printed by an ambiguity error, passed back unchanged, selects that candidate, in the library and inside `apply`. The `apply` error names the mutation (D106). A `sourceRange` copied unchanged is not that position.

## [FOR-PLAN]

- Finding 1: the view index already records the statements inside an opaque block (`src/query/view-index.ts`, `form: 'opaque'`, inner `path` undefined). The new-name check can read that text. It stays outside the reference catalogue.
- Finding 3: `DeploymentIndex` already stores `extend`-body children under the node id. The collision check reads the post-rename id set from that index.
- Finding 4: which deployment text, if any, resolves to an element that has left the instance is a search the requirement does not ask for. The requirement is the rejection.
- Finding 5: deployment views are absent from `model.$data.views`. The test helper reads them from `LanguageServices.diagrams()` (`spikes/_lc4.mts`).

## [USER-DECISION]

None. Finding 1 extends the new-name rule already decided in D101 and D107 to a rename, which is the same hazard and the same safe rejection. The move case was measured and does not need a new rule.

## FRICTION

- Context7 `resolve-library-id` for LikeC4 returned "Monthly quota reached" on 2026-10-17. No Context7 fact is used. LikeC4 facts in this report were executed on the installed 1.59.4 package.
- `CLAUDE.md`, `CLAUDE_DEV_GUIDELINES.md` and `CLAUDE_TEST_GUIDELINES.md` were read in full. The spec's Testing clarification matches the project testing section (unit tests plus the coverage-table check). Nothing in those files conflicts with the spec.

VERDICT: NOT-READY

Must-fix:

1. Finding 1 — the FR-004 new-name rule (D107) applies to the new name of a rename, with the verified `opt { api -> other }` fixture rejected in US-3 and in the success criteria.
2. Finding 5 — D109 and the US-7 oracle cover `element.kind` / `element.tag` in deployment-view include and exclude predicates, not only style targets.
3. Finding 2 — US-4, D61, D92 and D101 state the D107 addition rule, with the two accepted negative cases.
4. Findings 3, 4, 6 and 7 in the same pass: `extend`-body siblings on the D97 rejection; a deployment path that leaves the deployed subtree has no σ image and the move is rejected; D108 in the US-1 fixture, the edge case and SC-012; the D106 position round-trip in US-9 and SC-008.
