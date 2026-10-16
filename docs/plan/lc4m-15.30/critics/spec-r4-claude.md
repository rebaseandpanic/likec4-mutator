# Spec critique, round 4 (claude) — lc4m-15.30

Subject: `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17, after round 3, commit 9e136f5). I checked it against:
- Skein task lc4m-15.30: description, acceptanceCriteria, and the decision comments. I listed the thread index with `commentsLimit: 0`, then read D76, D95–D96, D97–D99, D100–D105 and the round-3 comment (FR-010, D106–D109) in full;
- the round-3 critiques `critics/spec-r3-claude.md` and `critics/spec-r3-grok.md` and their must-fix lists;
- spike 06 and the helper `spikes/_lc4.mts`;
- the code: `src/query/deployment-index.ts`, `src/query/types.ts` (`SourceRange`), the line printing in `src/mutator/deployment-ops.ts`;
- the LikeC4 1.59.4 AST typings (`node_modules/@likec4/language-server/dist/chunks/module.d.mts`).

How I verified: I ran read-only spikes against LikeC4 1.59.4 through `spikes/_lc4.mts`. The scripts were in the session scratchpad, outside the repository. A finding marked **verified** quotes those runs. Anything else is marked ASSUMPTION. Context7 was not used: every library fact here is LikeC4 behaviour, and I ran it on the installed package.

## Coherence of the round-3 fixes

| Notion | Places checked | Result |
|---|---|---|
| σ (FR-010) | US-3, INV-3, D58, D76, D97, FR-011, SC-003, data flow | Every user now cites FR-010. FR-010 does not define σ for a path whose element leaves the instance's element (F4). |
| D97 sibling collision | US-3 rejections and acceptance, D97 row, FR-010 | Consistent. Siblings declared in `extend <node>` bodies are not named (F3). |
| FR-002 (predicate connectors, step 2, `element.kind` in deployment views, US-7 has no list, SC-006) | FR-002, US-7, SC-006, D95 | Consistent. US-7 says twice that it keeps no list (F7, cosmetic). |
| D109 | US-7 acceptance, D109 row | The exception covers style targets only. LikeC4 drops the view for predicates as well (F5). |
| FR-020, SC-005, SC-012, US-5 (D98, D103) | FR-020, US-3, US-5, SC-005, SC-012, D98 row, edge case "Move that changes neither parent nor file" | Consistent. Round-3 must-fix (claude #4, grok #1) closed. |
| FR-004 addition clause (D101, D107) | FR-004, US-4, D61, D92, D101, D107, INV-8, SC-004 | FR-004 and D107 agree. D92 and US-4 still state the wider rule, and no acceptance item pins the narrowing (F2). Limiting the clause to additions leaves the new name of a rename or move unchecked (F1). |
| FR-003 inherited content (D108) | FR-003, D77, D108, US-1 acceptance, edge cases, SC-001, SC-012 | FR-003 carries D108. Acceptance, edge cases and SC-012 do not (F6). |
| Positions (US-9, D106) | US-9, D81, D102, D106, SC-008 | Consistent. No acceptance item covers the 1-based round trip (F8). |
| SC-004 | SC-004, US-4 | Consistent (grok r3 #3 closed). |

---

## Findings

### F1 — BLOCKER · Hat 1 · consequence of fix spec-r3-grok.md#3
**Place:** FR-004 ("blocks remove, rename and move when it names the affected element …; blocks an addition … when it names the new name"); D107 ("only for element, deployment node, instance and view additions"); D101; US-4 Expected; US-3 rejections ("a reference into the subtree sits in a construct the library does not model").

**Why:** A rename gives an element a new name, and a move gives it a new place, just as an addition does. A reference inside an opaque flow block can be captured by that new name. FR-004 checks a rename or a move only for the old, affected name. The new-name check of D101 and D107 is limited to additions. The stability check (INV-3) does not see opaque blocks. So nothing in the spec covers this, and a planner who follows the spec ships it.

Verified on 1.59.4. The model is `app = e { api = e }`, `other = e { foo = e }` and `app.api -> other`, with `dynamic view d { opt { api -> other } }`. It validates, and the step in `opt` computes as `app.api > other`.
- **Rename.** `renameElement('other.foo', 'api')`: the opaque text does not contain `foo`, so FR-004 does not block, and the result fails validate with `Could not resolve reference to Referenceable named 'api'` and `Source not found`. An accepted write breaks INV-1, which is the lc4m-17 hazard reached through a rename.
- **Move.** Take the same model and move the element to the top level with the name `api` (the model becomes `api = e 'F'` at the top level). It validates with no diagnostics, and view `d` now computes `api > other`. The step silently changed target. INV-3 is broken, and nobody sees it.

The same applies to any new name a write creates. For a move, a subtree that lands in another frame or file can also change which bare names resolve. That part is ASSUMPTION: I did not get a clean valid-before fixture for the cross-file document-scope case.

**Proposal:** State that the FR-004 new-name rule (D107: a bare identifier or a leading segment) applies to every name a write makes newly visible. This covers the addition, the new name of a rename, and the moved element's name at its destination (and in its destination file, if that is a different file). Name it in the US-3 rejections and in INV-8. Add the two fixtures above (the rename into an `opt` capture, and the move that retargets an `opt` step) to US-3's acceptance and to SC-003 or SC-004.

### F2 — MINOR · Hat 2 · consequence of fix spec-r3-grok.md#3
**Place:** D92 row ("An unmodelled construct blocks a write when it contains the name as a whole identifier token or dotted segment"); US-4 Expected ("An addition whose new name appears in a construct the library does not model … is rejected"); US-4 acceptance; SC-004.

**Why:**
- D92 still states the dotted-segment rule for every write. US-4 still says "appears". Both contradict D107's narrower addition rule.
- No acceptance item checks the narrowing. A plan that keeps the dotted-segment rule for additions, or that also blocks kind and tag additions, passes US-4 and SC-004 unchanged.

**Proposal:**
- D92 is limited to removals, renames and moves, and refers to D107 for new names.
- US-4 uses FR-004's wording.
- US-4's acceptance adds two negative cases: `addElement(…, { name: 'api' })` is accepted while an `opt` block names `x.api` only as a non-leading segment, and a kind or tag addition is not blocked by an opaque block that spells its name.

### F3 — MINOR · Hat 1 · incomplete closure spec-r3-claude.md#2
**Place:** US-3 rejection ("any sibling's id in its deployment node — another deployment node, a named or an unnamed instance"); D97 row; US-3 acceptance (sibling node and named-instance fixtures).

**Why:** A node's children can also be declared in `extend <node> { … }` bodies, in any file. Verified on 1.59.4: `node prod { svc = instanceOf app.x }` in `a.c4`, together with `extend prod { instanceOf app.svc }` in `b.c4`, gives `Duplicate instance name "prod.svc"` in both files. An unnamed instance inside an `extend` body gets the id `prod.svc` (the computed deployment model lists `prod.svc`).

So a rename can create the collision across files. The library's deployment index already treats `extend` children as children of the node (`src/query/deployment-index.ts` header), so this is a gap in the text and the acceptance, not in the mechanism.

**Proposal:** In the D97 rejection, siblings include the nodes and instances declared in `extend` blocks of that node in every loaded file. Add a cross-file `extend`-body fixture to US-3's acceptance.

### F4 — MINOR · Hat 1 · consequence of fix spec-r3-claude.md#3
**Place:** FR-010 ("Deployment paths … their element segments follow the element mapping, and their instance segment follows the instance mapping"); FR-011 ("else write the full FQN of σ(target)"); US-3 rejections.

**Why:** A move can take a child out of the subtree of the element an instance deploys. Then a deployment path through that instance has no σ image.

Verified on 1.59.4: `node prod { instanceOf app.api  o = instanceOf app.other  prod.api.h -> prod.o }` validates. After `h` moves from `app.api` to `app.other`, it fails with `Could not resolve reference to Referenceable named 'h'` and `DeploymentRelation source not resolved`.

FR-010's "element segments follow the element mapping" gives `app.other.h`, which cannot be written under `prod.api`. FR-011's "full FQN of σ(target)" is undefined for a deployment path. The rejection is probably what is meant (FR-011 ends with "else reject"), but the σ definition reads as if every path had an image.

**Proposal:** FR-010 states that a deployment path whose element part leaves the deployed element's subtree has no σ image, and that a move creating one is rejected, listing the path. Add this to US-3's rejections and acceptance. A removal is already covered (FR-001 row "deployment relationship endpoint through an instance").

### F5 — MINOR · Hat 2 · new
**Place:** D109 row ("For deployment-view style targets by `element.kind` / `element.tag`"); US-7 acceptance ("deployment-view style targets by kind or tag: written text and `expectValidLikeC4` only").

**Why:** LikeC4 also drops the view when the kind or tag expression is in an include or exclude predicate. Verified on 1.59.4, in a deployment view over instances of elements of kind `e` tagged `#t`:
- `include element.kind = e`, `include * / exclude element.kind = e`, `include element.tag = #t` and `include * / style element.tag = #t { … }` all produce no diagnostics, and `LanguageServices.diagrams()` returns only `index`. The deployment view is missing.
- `include * where kind is e` is computed (`dv: prod.a, prod.b`).

US-7's acceptance requires the computed model to report the new names for every FR-002 place, except style targets. For these predicate places that check is impossible. A tester either writes a check that can never observe the place, or fails acceptance.

**Proposal:** Widen D109 and the US-7 exception to every `element.kind` / `element.tag` expression in a deployment view (include and exclude predicates and style targets). The `where … kind is` / `tag is` forms stay on the computed-model oracle. The README notes the LikeC4 behaviour.

### F6 — MINOR · Hat 2 · new
**Place:** D108 / FR-003 ("such a cascade is rejected on purpose, and the README says so"), against US-1 acceptance (D77 fixtures), the edge case "A cascade that removes a view's last content-producing statement", SC-001 and SC-012.

**Why:**
- D108 is a deliberate rejection with a README sentence. No fixture requires it: US-1 lists scoped, unscoped and dynamic fixtures, but none with `extends` or `global predicate`.
- The edge case does not mention inherited content.
- SC-012's README list does not mention D108.

A plan that counts inherited content passes every acceptance item, and the README sentence can be left out without failing SC-012.

**Proposal:**
- Add a D77 fixture `view child extends base { include b }`, rejected under `cascade` when `b` is removed.
- Mention D108 in the edge case.
- Add D108 to SC-012's README list.

### F7 — MINOR · Hat 2 · new
**Place:** Header "Based on" (spikes 01–05); US-7 (two sentences saying US-7 keeps no list of its own).

**Why:**
- FR-002, D97, D109 and US-3 cite spike 06, but the header's source list stops at 05.
- US-7 says twice that it has no list: "US-7 keeps no list of its own" and "This rename set is FR-002; US-7 adds no places of its own". This is harmless, but it is the duplication D95 meant to remove.

**Proposal:** List spike 06 in the header, and keep one of the two US-7 sentences.

### F8 — MINOR · Hat 2 · new
**Place:** US-9 acceptance; SC-008; D106.

**Why:** D106 exists so that a caller can copy a position from an ambiguity error into a selector. The reads stay 0-based (`SourceRange.line` / `.column` are documented as 0-based in `src/query/types.ts`), while the selector is 1-based. No acceptance item requires the round trip. A plan that accepts the 0-based form, or that prints a different form than it accepts, passes US-9 and SC-008.

**Proposal:** US-9's acceptance and SC-008 require that a position printed by an ambiguity error, passed back unchanged as the selector, addresses that candidate, in the library and inside `apply` (where the error names the mutation, D106).

---

## [FOR-PLAN]
- F1: the new-name check for renames and moves can reuse the D107 token test over the same unmodelled-text sources used for additions. One routine for "names this write makes visible" keeps additions, renames and moves aligned.
- F3: `DeploymentIndex` already records `extend`-body children under the node id. The collision check reads the post-rename id set from it.
- F5: for deployment views, the test helper reads views from `LanguageServices.diagrams()`, not `model.$data.views` (the helper note added in round 3).

## [USER-DECISION]
None. F1 extends a rule already decided (D101 and D107) to the writes the spec has already scoped (rename and move). The direction, rejection on the safe side, is the existing one.

FRICTION:
- Per the lead's override I ran as a subagent and skipped `zsa-say`, `zsa-ask` and the MCP report line. Skein MCP answered (`skein_whoami`, `skein_show`, `skein_comment_get`). The task file says "report is committed"; the override says do not commit. I did not commit.
- The task file names the engine placeholder as "grok or codex". The override sets it to `claude`, which matches the existing `spec-r3-claude.md`.
- The round-3 decision comment on Skein abbreviates D107 as "(not of a kind and not of a tag)" (quoted in translation) right after listing "kind-or-view word" as a view. In Russian, the word means both kind and view, so the comment is ambiguous on its own. The spec text ("not of a kind or tag") resolves it. I followed the spec.
- The class rule ties `consequence of fix` to a previous-round must-fix number. D108 and D109 came from round-3 findings that were not on any must-fix list (claude F7 and F9), so their follow-ups are classed `new`, although they are consequences of round-3 edits.

VERDICT: NOT-READY

Must-fix:
1. F1: apply the FR-004 new-name rule (D107) to the new name of a rename and to the moved element at its destination, with the verified `opt` capture fixtures in US-3 and in the SC.
2. F2: align D92 and US-4 with D107, and add the negative acceptance cases (non-leading segment; kind and tag additions).
3. F3–F8 (recommended in the same pass): `extend`-body siblings in D97; no σ image for paths leaving the deployed subtree; D109 widened to deployment-view predicates; D108 in acceptance, edge cases and SC-012; spike 06 in the header; the D106 round-trip in acceptance.
