# Spec critique round 2 — grok

**Artifact:** `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17)
**Task:** lc4m-15.30 (project lc4m). Description, acceptance criteria, and decision comments D53–D94 were read from Skein. Round-1 must-fix lists were read from `critics/spec-r1-grok.md`, `spec-r1-codex.md`, and `spec-r1-claude.md`.
**Checked against:** the spec, those decisions, `spikes/` (recon-a, recon-bce, recon-df, spikes 01–04 and their outputs), `src/query/view-index.ts`, `src/mutator/deployment-ops.ts`, `src/query/style-read.ts`, and LikeC4 1.59.4 as installed. Extra read-only probes were run through `spikes/_lc4.mts` from `/tmp` (not written into the repo).

The round-1 fixes are present in the spec body for the notions this round was told to re-check. Two of them still accept a write whose result is a different fact from the one the caller asked for, or a source set LikeC4 1.59.4 then rejects. One leaves the new selector unable to name a relationship LikeC4 accepts.

## Coherence of the round-1 fixes

Walked every place the changed notions are stated (scenario, acceptance, FR, decision table, success criterion, scope, invariants, API table). Closed, with the mismatches called out as findings:

| Notion | Places that agree | Mismatch |
|---|---|---|
| Rename / move guarantee (D76) | US-3 guarantee and acceptance, SC-003, SC-012, D76 row, edge cases, INV-3 (references), INV-9 (view ids) | none |
| FR-001 additions (dynamic `include`, `rank`, `views`-block style, `group`, flow blocks; D55, D61, D77, D80) | include row names element, dynamic and deployment views and `group`; US-1 and SC-002 list dynamic `include`, `rank`, both style places, `group`; D77 fixtures are the scoped and unscoped element views; empty `group` is removed | flow inventory (finding 1); `rank` placed in the `views` block (finding 4); D55's spike citation (finding 6) |
| Kind rename (negated forms, style and rank targets, D78, D79) | US-7 lists positive and negated predicate forms and style / `rank` targets; SC-006 requires both; D78 row and the `vm` / `vm` acceptance match the decision comment | D78's trigger omits the negated spellings (finding 2); `rank` in the `views` block (finding 4) |
| One relationship selector (D70, D81, D87) | US-9, API table, INV-8, SC-008, SC-012, D70 / D81 / D87 rows: update, remove and `extend` creation share endpoints, `matchKind`, `matchTitle`, `matchBidirectional`, position; ambiguity and not-found are `InvalidWriteError` | file + line is not unique (finding 3); deployment selector not named as unchanged (finding 8) |
| Nested relationship spellings (US-8, D68) | US-8, SC-007 and the spec's D68 row: sourceless `->`, `<->`, `-[kind]->`, `-[kind]<->`, `.kind`; dot form plus bidirectional rejected; US-10 writes the bracket connector | decision comment D68 still says only `-> target` (finding 5) |
| `extend` creation (D71, D72, D82, D83, D86, FR-050) | US-10, US-8's D83 rejection, FR-050, SC-009, INV-2, the decision rows. `shared` with a single match is accepted. A relationship whose only title is the kind default is rejected. A metadata key already present on the declaration or any block is rejected. Tags and links already in the target block are not repeated; identical links in other blocks stay | none. Probes: explicit title equal to the kind title applies with no warning; the same relationship with the title omitted warns and does not apply; declaration metadata `k` plus an extend `k` becomes `["first","second"]` |
| Moves (D85, FR-020, D90) | US-3 rejections, FR-020, edge cases, D90 out of scope, D85 row: root-to-root file change, no-op rejected, `file` only for a root target, parent target is the declaration body, relative icon rejected | none. Style-block `icon ./icon.svg` resolves to a `file://` URL under that file (`file:///test/workspace/src/icon.svg`), same class as a body icon |
| File choice (D84, US-5, SC-005) | Scope "Unchanged", US-5 acceptance, SC-005, D62 / D84: this run's new `file` is root `addElement`, top-level `addRelationship`, kind and tag additions, root `moveElement`; `extend` `file` is required; earlier view and deployment creators stay as they are; the default-file test uses load order different from document order | SC-012 does not carry D84's README sentence (finding 7) |
| Styles (D74, D88, D89, SC-010) | US-11, SC-010, INV-7, API table, D88 / D89: pre-theme `$data`, opacity as LikeC4's number against the written percentage, kind style and `multiple` on the element or relationship, `getSpecification()` names only, deployment readers unchanged, value types shared | none. A second element `style { }` block is ignored by 1.59.4 (`color green` kept, `opacity 40%` dropped), which matches "the first `style { }` block" |
| INV-1 / D91, INV-2, INV-3 / D93, D94, SC-012 | INV-1 is `.c4` sources; manual layouts are out of scope and named in SC-012. INV-3 and US-4 leave previously unresolved references unchecked (D93); the old "reject if a dead reference starts resolving" sentence is gone. D94 rejects update / rename / remove of a duplicated kind or tag and keeps an empty `specification { }` | D55 citation only (finding 6). An empty `specification { }` alone validates with no warning; two specification blocks in one file warn `Prefer one specification per document` (INV-2). Two files with one block each do not (spike 01) |

US-1's sentence that a D77 outcome is a rejection "in both modes" does not change the result: without `cascade` the references themselves are already a rejection. D77's include row also covers dynamic and deployment views. A dynamic view whose `include` only names a step participant shows the same node ids with and without that `include` (`[a,b,c]` either way). Rejecting that cascade is the strict reading of D77, and it does not publish a wrong diagram.

## Findings

### 1. Cascade and the opaque-block rule miss `parallel` and `break`

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `incomplete closure spec-r1-grok.md#10`
- **Place:** FR-001 rows "dynamic step endpoint (… inside `par`)" and "reference inside a stage-6 flow block (`alt`, `opt`, `loop`, `try` and branches)"; D55; D61.
- **Why:** The library already splits dynamic-view flow in two (`src/query/view-index.ts` around the `SubflowStep` case). `par` and `parallel` are one modeled form. Everything else in that statement is opaque, and the comment on that type names the keywords: `opt`, `loop`, `alt`, `try`, `break`, `if`, `when`, `else`. LikeC4's own current dynamic-view page documents `parallel` / `par` as the same construct and `break` as its own block. On 1.59.4:
  - `parallel { a -> b }` validates with no diagnostics.
  - `parallel { a -> gone }` fails validate: `Could not resolve reference to Referenceable named 'gone'` and `Target not found`.
  - `break { a -> b }` validates with no diagnostics.
  - `break { a -> gone }` fails validate with the same two messages.
  - `alt { if 'x' { a -> gone } }` and `alt { when 'x' { a -> gone } }` fail the same way.
  FR-001 cascades a step inside `par` and blocks a reference inside `alt` / `opt` / `loop` / `try`. A cascade that follows that list leaves a `parallel` block and a `break` block in place. SC-001 tests each row of the table, so those two constructs are never required. INV-1 then fails on a model the table treats as handled. `if` / `when` / `else` are legal only as `alt` branches in a file that already validates (`if` outside `alt` is itself a validate error), and the row's word "branches" can be read as covering them only if those keywords are named.
- **Proposal:** FR-001 and D55 treat `parallel` as the same modeled block as `par`: cascade removes the step statement, and removes the block when it is emptied. FR-001, D61 and FR-004 name the opaque set the library already uses, including `break` and the `alt` branch keywords `if`, `when` and `else`. US-1 / SC-001 require one default and one `cascade` test for `parallel` and one blocking test for `break`.

### 2. A shared kind name is still renamed through `where kind is not`

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `consequence of fix spec-r1-grok.md#3`
- **Place:** US-7 paragraph "Shared element and deployment node kind names" (D78); the D78 row. D79 and the bullet above that paragraph already list `is not` and negated participant conditions as reference places.
- **Why:** D78 rejects a rename or removal while `where kind is <name>` or a participant-kind condition names a kind that exists as both an element kind and a deployment node kind. The negated spellings name that same kind, and LikeC4 matches them by name against both kinds. Measured on 1.59.4 with element kind `vm`, deployment node kind `vm`, element `a = vm`, element `b` of another kind, and deployment nodes `host` (`instanceOf a`) and `other` (`instanceOf b`):
  - `where kind is vm`: element view nodes `[a]`; deployment view nodes `[host, other, host.a]`.
  - `where kind is not vm`: element view nodes `[b]`; deployment view nodes `[other.b]`.
  Rename the element kind to `guest` and rewrite `is not vm` to `is not guest` (the D79 rule, which D78 does not block). Deployment nodes `host` and `other` stay kind `vm`, so they stop being excluded and appear in the deployment view. Leave the text as `is not vm` and element `a` (now kind `guest`) stops being excluded in the element view. Both source sets validate. Neither choice keeps the selected set. That is the silent meaning change D78 exists to refuse, on the spelling D79 added.
- **Proposal:** D78's rejection covers every condition that names the shared kind, positive and negated: `where kind is` / `is not`, and participant-kind conditions with and without `not`. `element.kind` / `element.kind !=` stay as they are (they resolve to element kinds only). The `vm` / `vm` acceptance includes `where kind is not vm` on an element view and a deployment view, for rename of each kind.

### 3. File and line do not tell two relationships on one line apart

- **Severity:** MAJOR
- **Hat:** 2
- **Class:** `incomplete closure spec-r1-claude.md#5`
- **Place:** US-9; D81; SC-008.
- **Why:** D81's way forward for relationships that match on every other selector field is the file and line of the declaration. LikeC4 1.59.4 accepts two copies on one line: `a -> b 'x' a -> b 'x'` validates and computes two relationships. Both have the same file and the same line, so the position field as specified matches both, and the ambiguity error lists the same `file:line` twice. The caller still cannot remove or update one of them. SC-008 can pass with the two declarations on different lines and never see this input.
- **Proposal:** The position requirement identifies one declaration even when several share a line. The acceptance includes two identical relationships written on one line: the selector removes or updates exactly one of them, and the ambiguity error's candidate list distinguishes them.

### 4. `rank` is not a rule of the `views` block

- **Severity:** MINOR
- **Hat:** 1
- **Class:** `consequence of fix spec-r1-grok.md#2`
- **Place:** US-7, "the same expressions in style rule targets and `rank` targets (in views and in the `views` block)".
- **Why:** `ViewRuleRank` is contained only by an element view body. `views { rank { a } view v { include * } }` does not parse (`Expecting token of type '}' but found rank`). `rank { element.kind = vm }` and `rank { element.tag = #t }` inside an element view do parse, and so do `style element.kind = …` in an element view, a deployment view, and the `views` block. SC-006 asks for a rename test of every place in that list, including a `rank` target in the `views` block, which cannot be written. The style half of the parenthetical is right.
- **Proposal:** US-7 places `rank` targets, including `element.kind` and `element.tag`, in element views only. Style targets stay in element views, dynamic views, deployment views, and the `views` block.

### 5. Decision comment D68 still allows only one nested spelling

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `consequence of fix spec-r1-grok.md#5`
- **Place:** Skein comment `decision D68–D70` on lc4m-15.30, against US-8 and the spec's D68 row. The spec says the decisions of this run are those comments.
- **Why:** The comment says nested placement writes `-> target`. US-8 and the spec's D68 row require the sourceless form for every accepted combination (`->`, `<->`, `-[kind]->`, `-[kind]<->`, `.kind`). No later decision comment amends D68. A reader who treats the comment as the decision drops the other four spellings that SC-007 requires.
- **Proposal:** Amend that decision comment so its nested-placement sentence lists the same spellings as US-8.

### 6. D55 cites spikes that do not contain an empty `rank` or an empty style target list

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `consequence of fix spec-r1-grok.md#2`
- **Place:** D55 row, "LikeC4 rejects empty `include`, style and `rank` targets (spikes 02, 04)". The same citation is in the D80 decision comment.
- **Why:** Spike 02 shows `include` with no items failing to parse, and a style rule whose target name is missing failing validate. Spike 04 shows valid `rank { a }` and `rank same { a, b }`. Neither file has `rank { }` or `style { color red }` with no target. Those two forms do fail to parse on 1.59.4 (probed this round), so the cascade rule is right and the citation is not. The current public rank page says non-existent rank targets are ignored; that is not what 1.59.4 does (`rank { gone }` fails validate). A planner who opens the cited spike, or the public page, can drop the rule.
- **Proposal:** Point D55 at the forms that were actually checked, and state that the empty-target fact is for LikeC4 1.59.4. The cascade rule itself stays: an empty `include`, style rule, or `rank` rule is removed because it does not parse.

### 7. The README checklist drops the standalone CLI pointer

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `incomplete closure spec-r1-claude.md#4`
- **Place:** SC-012, against Scope "Unchanged in this run" and D84.
- **Why:** D84 says the standalone commands keep their options, gain the library's new rejections, and the README points to `apply` for the new options. SC-012 lists the README sections and does not include that pointer. A test plan that traces SC-012 will not require it. The scope sentence is the only place it appears.
- **Proposal:** SC-012 includes the D84 README sentence: standalone commands keep their current options, and the new options are documented on `apply`.

### 8. Deployment relationship selection is not said to stay as it is

- **Severity:** MINOR
- **Hat:** 1
- **Class:** `new`
- **Place:** Scope "Unchanged in this run"; US-9. Sister of the model selector.
- **Why:** `selectDeploymentRelationship` already rejects an ambiguous selector and already tells the caller that identical endpoints, kind and title cannot be told apart (`src/mutator/deployment-ops.ts`, the `matches.length > 1` branch). It has no position field. US-9 gives model relationships that way forward and does not say the deployment operations are out of scope. The unchanged-scope list names file choice, not this selector. A planner can either leave identical deployment relationships stuck, or copy D81 onto them, and both readings fit the spec.
- **Proposal:** State that `updateDeploymentRelationship` and `removeDeploymentRelationship` keep today's selector and do not gain a position in this run. Identical deployment relationships remain unaddressable by a selector; the coverage note says so.

## [FOR-PLAN]

- The step index already classifies `par` / `parallel` as one form and `opt`, `loop`, `alt`, `try`, `break`, `if`, `when`, `else` as opaque (`src/query/view-index.ts`). The catalogue for finding 1 binds to that split.
- A model relationship's source range is what makes two same-line declarations different. The requirement is uniqueness; which component of the range is stored is the plan's choice.
- Deployment view style rules are a different AST node (`DeploymentViewRuleStyle`) from element and dynamic view style rules, and `style element.kind = e` inside a deployment view parses. The US-7 list, once finding 4 is applied, still has to include that node.

## [USER-DECISION]

None. Findings 1–3 complete decisions the lead already recorded (modeled blocks cascade, opaque blocks block, shared kind names are refused, indistinguishable relationships are addressed by position). They do not open a new product fork.

## FRICTION

- Context7 `resolve-library-id` for LikeC4 returned "Monthly quota reached" on 2026-10-17, so this review did not use Context7. LikeC4 facts above were executed on the installed 1.59.4 through `docs/plan/lc4m-15.30/spikes/_lc4.mts`. The public pages `https://likec4.dev/dsl/views/dynamic/` and `https://likec4.dev/dsl/views/predicates/` were fetched the same day: they document `parallel` / `par` and `break`, and they say a missing rank target is ignored. Installed 1.59.4 reports `Could not resolve reference` for `rank { gone }`. Where those disagree, the findings follow the installed package.
- `CLAUDE.md` was read in full, including `## Testing (project section)`. `CLAUDE_DEV_GUIDELINES.md` and `CLAUDE_TEST_GUIDELINES.md` were read from the start through the HTTP, container, and test-kind rules. The rest of those two files is the same generic standard. The spec's Testing clarification matches the project testing section (unit plus the coverage-table check). No rule in the part I read conflicts with the spec.

VERDICT: NOT-READY

Must-fix:

1. Finding 1 — put `parallel` with `par`, and name `break` (and the `alt` branch keywords) in the opaque set, with tests.
2. Finding 2 — D78 rejects rename and removal when a negated `where kind is` or participant-kind condition names the shared kind.
3. Finding 3 — position distinguishes two identical relationships on the same line.
4. Findings 4–8 — correct in the same pass: `rank` only in element views; amend the D68 comment; fix the D55 spike citation; add the CLI README sentence to SC-012; say deployment relationship selection is unchanged.
