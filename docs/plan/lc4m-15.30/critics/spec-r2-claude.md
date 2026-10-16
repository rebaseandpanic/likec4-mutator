# Spec critique, round 2 (claude) — lc4m-15.30

Subject: `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17, after round 1). I checked it against:
- Skein task lc4m-15.30: description, acceptanceCriteria, and the decision comments D53–D94;
- the round-1 critiques `critics/spec-r1-{claude,codex,grok}.md` and their must-fix lists;
- the spikes and recon files in `spikes/`;
- the code in `src/`.

Verification: I ran four read-only spikes against LikeC4 1.59.4, through `spikes/_lc4.mts`, from a scratchpad location outside the repository. Nothing was added to the repository except this report. A finding marked **verified** quotes the output of those runs. Anything else is marked ASSUMPTION.

Round-1 closure: most round-1 must-fix items are closed by D76–D94, and the changed text reaches the neighbouring requirements. I checked the following places and found them consistent with each other:
- US-1, FR-001, SC-001 and SC-002 for the new rows (dynamic `include`, `rank`, `views`-block style, `group`, flow blocks);
- US-9, D70, D81, D87, the API table, the contracts table and INV-8 for the selector;
- US-8, D68 and SC-007 for nested spellings;
- US-11, D74, D88, D89 and SC-010 for styles;
- Scope "Unchanged", D84, US-5 and SC-005 for file choice.

The findings below are either new or places where a round-1 fix is incomplete or creates a new hole.

---

## Findings

### F1 — BLOCKER · Hat 1 · new
**Place:** US-3 (rename), D76, INV-3 (σ is "the identity except for the renamed or moved subtree"), US-3 rejection list, FR-001.
**Why:** A deployment instance written without a name takes its name from the element. Renaming the element therefore renames the instance. σ only maps element FQNs, and the spec never mentions this effect. Verified:
- `deployment { node prod { instanceOf app.api } }` computes the deployment elements `["prod","other","prod.api"]`.
- After `api` is renamed to `svc` and every element reference is rewritten, the instance is `prod.svc`. The deployment view's `include prod.api` then fails: `Could not resolve reference to Referenceable named 'api'` and `Element "prod.api" is not resolved`.
- Two instances in one node whose elements end up with the same name are a LikeC4 error: `Duplicate instance name "prod.svc"` on both lines.

Two consequences follow:
1. Every reference to such an instance stops resolving after the rename. This affects deployment view predicates, deployment relationships, `extend prod.api` blocks, and references through the instance (`prod.api.child`). Either INV-3's stability check rejects the rename, which the spec does not state and SC-003 does not test, or a planner treats these references as out of σ and INV-1 breaks.
2. Renaming `a.api` to `svc` while `b.svc` is instantiated without a name in the same node introduces a duplicate-instance error. No rejection in US-3 covers it, and the stability check cannot see it because no reference is involved. This breaks INV-1 on a plausible input.

D76's guarantee is stated for "LikeC4's computed elements" only, and says nothing about the deployment model.

A move does not change the last segment, so moves are not affected.
**Proposal (requirement level):** State what a rename does to instances named implicitly after the element. Two options:
- (a) σ extends to those instance ids, and every reference to them is rewritten like an element reference (FR-011);
- (b) such a rename is rejected while the instance exists, listing the instances.

In both cases, add to the US-3 rejection list "the rename would give two instances in one deployment node the same name". Extend D76 and SC-003 to the deployment elements and deployment views LikeC4 computes, with a fixture of an unnamed instance referenced from a deployment view and a deployment relationship. → [USER-DECISION] L1.

### F2 — MAJOR · Hat 1 · consequence of fix spec-r1-grok.md#1
**Place:** D77; FR-001 include/exclude row ("rejected if the view would have no include or exclude rule left"); US-1 Expected; Edge cases ("empties a view of include and exclude rules"); SC-001.
**Why:** D77's test is "no include **or exclude** rule left". That is the wrong boundary, in two ways.
1. **An exclude-only view has the same fallback D77 was written against.** Verified: `view v of app { exclude app.db }` computes `["app"]`, and the unscoped `view w { exclude app.db }` computes `[]`. Take `view v of app { include app.api  exclude app.db }` and cascade-remove `app.api`. The include rule goes and the exclude stays. D77 accepts the write, and the diagram silently switches from `app.api` to `app`. That is exactly the meaning change D77 rejects.
2. **Dynamic views are outside the test.** A dynamic view's content comes from its steps. Verified: `dynamic view d { }` computes no nodes. Cascade-removing the endpoint of a dynamic view's only step(s) empties the diagram, and D77 does not apply because the view had no include rule to lose. Read literally the other way ("has no include or exclude rule after the cascade"), D77 would reject every cascade on a steps-only dynamic view, including one that leaves other steps in place. Either reading is wrong.

**Proposal:** Restate D77 in terms of the statements that produce content:
- for element and deployment views: the cascade would remove the view's last `include` (top level or in a `group`), whatever excludes remain;
- for dynamic views: the cascade would remove its last step or dynamic `include` while it had at least one.

Update every place that repeats the condition: FR-001, US-1, Edge cases, SC-001. Add fixtures for the exclude-only remainder (scoped and unscoped) and for a dynamic view emptied of steps.

### F3 — MAJOR · Hat 1 · consequence of fix spec-r1-codex.md#3
**Place:** D78; US-7 "Shared element and deployment node kind names"; US-6 / US-7 rejection "new name … already declared for the type".
**Why:** D78 only guards the **old** name, the case where the renamed kind already shares its name with the other type. The **new** name can also create the overlap. A rename into a name the other type declares changes the selected set silently. Verified, with `specification { element server  deploymentNode vm  deploymentNode env }`, an element `a` of kind `server`, an instance of `a` in a `vm` node, and two deployment views using `include * where kind is vm` and `include * where kind is server`:
- before: `byVm: ["prod.n"]`, `byEk: ["prod.n.a"]`;
- after renaming element kind `server` to `vm`, with every reference rewritten: `byVm: ["prod.n","prod.n.a"]`, `byEk: ["prod.n","prod.n.a"]`, no diagnostics.

Both views changed meaning, and `likec4 validate` stays silent. The rename passes D78, because the old name `server` was not shared, and passes the "already declared for the type" check, because `vm` is a deployment node kind, not an element kind. The same holds in the mirror direction, for a deployment node kind renamed to an element kind's name.
**Proposal:** Extend D78 to the target name. Renaming an element kind or a deployment node kind **to** a name declared for the other type is rejected while any `where kind is` or participant-kind condition names the old or the new name, listing the conditions. Add this case to the US-7 rejection list and to SC-006's D78 cases, with the fixture above.

### F4 — MAJOR · Hat 1 · incomplete closure spec-r1-codex.md#4
**Place:** D85; US-3 rejection "a cross-file move of a declaration that contains an icon value LikeC4 resolves relative to the file"; D76 ("the same own … property values").
**Why:** Icons are not the only values LikeC4 resolves against the declaring file. Relative links are resolved the same way. Verified:
- the identical declaration `app = e 'App' { link ./docs/x.md 'D' }` computes `{"url":"./docs/x.md","relative":"src/one/docs/x.md"}` in `one/a.c4`;
- in `two/a.c4` it computes `"relative":"src/two/docs/x.md"`.

A cross-file move of an element with a relative link changes the resource the link points to. This can be the element itself, a nested element, or a nested relationship in the moved body. D76 promises the same own values, and D85 only rejects icons. The library does not report `relative` (no such field in `src/query`), so INV-7 comparisons that use the library's link report cannot catch the change either.
**Proposal:** Widen the D85 rejection from "icon" to every value LikeC4 resolves relative to the declaring file. That means icons (body and `style`) and relative links, in the moved declaration and its whole body. Add a test with a relative link. Name the set in the README section the rejection is documented in.

### F5 — MAJOR · Hat 1 · incomplete closure spec-r1-claude.md#6
**Place:** US-6 "Update a kind's defaults: strings REPLACE (`null` removes)"; D82; INV-2; INV-7; INV-8.
**Why:** D82 settles the kind-default-title conflict only for **creating** `extend a -> b` blocks. A relationship's `extend` identity includes the effective title. A US-6 update of a relationship kind's default `title` therefore changes the identity of every relationship of that kind that has no own title. Verified, with `a -[r]-> b` and `extend a -[r]-> b { #t }`:
- kind `r` without a default title: the relationship computes `{"title":"","tags":["t"]}`;
- after the update `relationship r { title 'kt' }`: it computes `{"title":"kt"}`, **without the tag**, and there are no diagnostics.

So a defaults update silently detaches existing `extend` blocks and drops their tags, links and metadata. The reverse also happens: removing or changing the title, given spike 03's titled block, detaches blocks too, or leaves the "does not match any relation" warning. `updateRelationship` already guards identity changes for an own title (`src/mutator/mutator.ts`, `updateRelationship`: rejection when blocks "would take the new title" or "extend blocks … of the new title would apply to it"). The kind-default path is a new identity-changing write with no such rule. INV-8 does not list it, and US-6's acceptance can pass with a fixture that has no `extend` blocks.
**Proposal:** Add a rejection to US-6. A relationship kind `title` update (set, change or remove) is rejected while an `extend a -> b` block applies to a relationship of that kind that has no own title, or would start or stop applying because of the change, listing the blocks. Add a test with the fixture above.

### F6 — MAJOR · Hat 1 · consequence of fix spec-r1-codex.md#5
**Place:** D62 ("a root `moveElement` without `file`" uses the default file); FR-020; D85 / Edge cases ("Move that changes neither parent nor file: rejected").
**Why:** For a move to the root without `file`, the destination file is D62's default: the first file in document order with a `model` block. It is not the element's own file. This has three consequences:
- `moveElement(x, root)` of a non-root element declared in `b.c4` moves it into `a.c4` whenever `a.c4` comes first. The caller did not ask for a file change, and the move may then hit D85's icon or link rejection (F4) for a file the caller never chose.
- For a root element, the same call without `file` is a no-op and rejected if the element is in the default file, but a silent cross-file relocation if it is not. The D85 "no-op" rule depends on where the element happens to sit.
- `addElement`'s D62 default is harmless, because a new element has no current file. A move does have one.

**Proposal:** Decide the default destination file of a root move without `file`. The element's current file is the evident choice: then a root element without `file` is always a no-op, and a cross-file move needs an explicit `file`. Remove `moveElement` from D62's list if that is the choice, and adjust FR-020, US-5's acceptance list and SC-005. If D62 is kept on purpose, state that a move without `file` can change the file, and test both outcomes. → [USER-DECISION] L2.

### F7 — MAJOR · Hat 1 · consequence of fix spec-r1-grok.md#10
**Place:** US-4 (lc4m-17), D60, D61, FR-004 ("blocks remove, rename and move"), FR-001 row "reference inside a stage-6 flow block".
**Why:** D61 and FR-004 protect references inside flow blocks (and `global` / imports) only against remove, rename and move. US-4 extends the stability check to additions, but it can only check references the catalogue resolves. Flow-block contents are opaque (D30, D61: "the library cannot rewrite or prove it"). The lc4m-17 hazard therefore stays open inside flow blocks. Verified, with `model { app = e { api = e }  other = e }` and a dynamic view `d`:
- `opt { api -> other }` computes the edge `app.api->other` with no diagnostics. After adding `other.api` (the lc4m-17 write), LikeC4 reports `Could not resolve reference to Referenceable named 'api'` and `Source not found`.
- The same happens for `alt { if { api -> other } }`.

FR-004's token rule would catch this if it applied to additions. As written it does not, and US-4's acceptance only names the top-level lc4m-17 repro. INV-1 breaks on an accepted `addElement`. The same reasoning applies to `addDeploymentNode` / `addDeploymentInstance` names appearing in `global` blocks, if a `global` block can hold such names (ASSUMPTION, not verified).
**Proposal:** Extend FR-004 / D61 to every write US-4 covers. An addition whose new name appears as an identifier token or dotted segment inside an unmodelled construct is rejected, naming the file and line. Add a test that repeats the lc4m-17 repro with the step inside `opt` and inside an `alt` branch.

### F8 — MINOR · Hat 2 · consequence of fix spec-r1-claude.md#5
**Place:** D81 / US-9 ("a position (file and line of the relationship's declaration)").
**Why:**
1. File and line do not always identify one relationship. Verified: `a -> b 'x'  a -> b 'x'` on one line parses with no diagnostics and computes 2 relationships. That is exactly the identical pair D81 was written for.
2. The spec does not say which state the position refers to inside an `apply` batch. An earlier mutation in the same batch shifts lines.

**Proposal:** Define the position so that it is unique. For example, a line plus the declaration's ordinal on that line, or a start position. Alternatively, state that identical relationships on one line are rejected as ambiguous, naming the manual edit. Also state that inside `apply`, a position refers to the state after the preceding mutations.

### F9 — MINOR · Hat 2 · new
**Place:** US-10; D71.
**Why:** D71 and US-10 make `file` required for `extend <element>` creation. The `extend a -> b` sentence of US-10 does not say whether `file` is required, optional or defaulted for relationship blocks. Meanwhile SC-005 and US-10's acceptance test "a chosen file" for both kinds of block.
**Proposal:** State the file rule for relationship-block creation explicitly (same as D71, or a named default), and add it to D71.

### F10 — MINOR · Hat 2 · new
**Place:** Header "Type" line; INV-8; US-4.
**Why:**
- US-4 now gives new rejections to **every** write that adds an element, deployment node, instance or view. That includes `addView`, `addDeploymentNode` and `addDeploymentInstance`. INV-8 lists only "`addElement`'s and `addRelationship`'s new rejections". SC-012 makes INV-8 the CHANGELOG list, so the CHANGELOG would miss them.
- The header "Type" line omits the `addElement` rejections, D75 and the D87 error-type change, which INV-8 does list.

**Proposal:** List the new US-4 rejections of every covered write in INV-8, and make the header line match INV-8 (or point to it).

### F11 — MINOR · Hat 2 · new
**Place:** INV-4 ("the error names the field (`InvalidWriteError`)") vs the FOR-PLAN item "The plan decides whether to map them to `InvalidWriteError`".
**Why:** INV-4 and the task's common criterion ("Every rejection … with an error naming the field; `apply` exits 1") require `InvalidWriteError` for every rejection. The FOR-PLAN backlog leaves open whether `removeElement` with an unknown FQN and the leaking `EditRefusedError` become `InvalidWriteError`, and both are removals this feature changes. That is a requirement left to the plan.
**Proposal:** Decide it in the spec: either the remove operations of US-1 and US-2 report every rejection as `InvalidWriteError` (an INV-8 change), or the existing plain errors are named as an exception to INV-4.

### F12 — MINOR · Hat 2 · incomplete closure spec-r1-claude.md#1
**Place:** US-3 / SC-003 vs the task's acceptance A.3 ("same elements under new FQNs, same relationships and view contents").
**Why:** D76 narrows the task's acceptance: hierarchy-derived view contents may change. The decision comment says it "reads" the task wording as option (a). The spec, unlike D71 ("a conscious deviation from the task's optional `file`"), does not flag this where acceptance is mapped. A reviewer at acceptance compares against the task text.
**Proposal:** Mark US-3 / SC-003 as a conscious narrowing of acceptance A.3 (D76), so that the acceptance review sees the mapping.

---

## [FOR-PLAN]
- F1 option (a), if chosen: the catalogue must know which instances take their name implicitly from the element, and resolve deployment references to them.
- F5: the identity check for kind-default title updates can reuse `updateRelationship`'s existing identity-change guard (`countRelationsSharing`, `extendRelationBlocks`). That is a mechanism note only.
- F7: the token scan of FR-004 needs the new name of an addition as input, not only the affected names of a removal.

---

## [USER-DECISION]
The owner delegated product forks to the lead (Clarifications), so these are for the lead's decision log:
- **L1 (F1):** Renaming an element whose instances take their name implicitly from it. Option (a): σ covers the instance ids and their references are rewritten. Option (b): reject while such instances exist. In both cases, reject a resulting duplicate instance name.
- **L2 (F6):** Default destination file of a root `moveElement` without `file`. Option (a): the element's current file, so a cross-file move needs an explicit `file`. Option (b): D62's default, documented as a possible file change.

---

FRICTION:
- D55 and D80 cite spike 04 for "an empty `rank` … does not parse". Spike 04 (`04-blocks.mts` / `.out.txt`) tests `rank same { a, b }` and `rank { a }`, both valid, and never tests an empty `rank`. The claim comes from grok's round-1 run, not from the cited spike.
- D94's rationale cites spike 04 for "an empty block is valid". Spike 04's `emptySpec` case puts an empty and a non-empty `specification` block in one document and gets the warning `Prefer one specification per document`, so it does not isolate the claim. I verified it separately: a file containing only `specification { }` has no diagnostics, so the decision holds, but the evidence cited for it does not show it.
- The prompt's task file asks for `zsa-say` / `zsa-ask` and an MCP report line. Per the lead's override I ran as a subagent and skipped them. The Skein MCP answered: I read `skein_show lc4m-15.30` and the decision comments.

VERDICT: NOT-READY

Must-fix:
1. F1 — define rename behaviour for instances named implicitly after the element, and reject duplicate instance names (L1); extend D76 and SC-003 to the deployment model.
2. F2 — restate D77 by content-producing statements (last `include`; last step of a dynamic view) in D77, FR-001, US-1, Edge cases and SC-001.
3. F3 — extend D78 to a rename **into** a name declared for the other kind type.
4. F4 — widen D85's rejection to every file-relative value (relative links included).
5. F5 — reject relationship-kind `title` default updates that attach or detach `extend` blocks.
6. F6 — decide the default destination file of a root move without `file` (L2), and align D62, FR-020 and the no-op rule.
7. F7 — apply FR-004's unmodelled-text rule to the additions US-4 covers (lc4m-17 inside flow blocks).
