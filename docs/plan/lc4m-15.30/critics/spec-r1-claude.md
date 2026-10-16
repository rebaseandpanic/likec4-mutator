# Spec critique, round 1 (claude) — lc4m-15.30

Subject: `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17), checked against the Skein task lc4m-15.30 (description, acceptanceCriteria, decisions D53–D75), lc4m-17, the recon files and spikes in `spikes/`, and the code in `src/`.

Verification: I ran four read-only spikes against LikeC4 1.59.4. They use `spikes/_lc4.mts` from a scratchpad location and are not committed. Each finding marked **verified** comes from those runs, quoted from their output. Anything not verified is marked ASSUMPTION.

---

## Findings

### F1 — BLOCKER · Hat 1 · new
**Place:** US-3 Acceptance; SC-003 (copied from the task's acceptance criterion A.3).
**Why:** The acceptance says that after a rename or move, LikeC4's computed model has "the same elements under σ-mapped FQNs with the same properties, the same relationships …, and the same computed view contents (σ-mapped)". LikeC4 semantics make this impossible in two cases:
1. **Move changes the hierarchy, and computed views depend on the hierarchy.** References *to the parent* are not references to the moved element, so σ does not rewrite them. Their meaning still changes. Examples: `include app.*`, `include app.**`, `include *` in `view of app`, `app._`, and implicit relationships aggregated to ancestors. Move `app.api` out of `app`, and every view that shows `app.*` loses `api`. That view is not σ-equal, yet the write is correct by every other rule of the spec.
2. **Rename of an element without a title changes its computed title.** Verified: `model { api = e }` computes `{"id":"api","title":"api"}`. LikeC4 uses the name as the title. After `renameElement(api → svc)` the title is `svc`, so the "same properties" acceptance fails. The alternative is a rename that writes an explicit title, and the spec never decides that.

The planner and test writer cannot derive the tests. They would have to either weaken the acceptance silently or invent the equivalence themselves.
**Proposal (requirement level):** Define what equivalence a rename and a move guarantee:
- which computed facts are compared: elements and their own properties, explicit relationships, view rule references;
- which facts are allowed to change, and how the change is documented: membership produced by wildcards and descendants, aggregated relationships, titles derived from the name.

Decide whether a rename of a title-less element keeps the displayed title (by writing it) or changes it (documented). Then align SC-003 with that definition. → [USER-DECISION] U1 if the owner's acceptance wording must change.

### F2 — MAJOR · Hat 1 · new
**Place:** FR-001 row "view `style` rule target"; US-7 rename/remove reference list; D60 / Component boundaries "Reference catalogue".
**Why:** Two sister reference places are not explicitly in scope:
- **`views { style … }` rules at block level, outside any view.** Verified: `views { style app.api { color red } style element.tag = #t { color green } … }` is valid. When `app.api` or `#t` is gone, LikeC4 errors with `Could not resolve reference to Referenceable named 'api'`, `Could not resolve reference to Tag named '#t'` and `Element "app.api" is not resolved`. Recon B/C/E §6 says the rules of a `views { style … }` block are not listed by `view-query`. Recon A §2 says the snapshot covers only references inside view bodies. FR-001 says "view `style` rule target" and does not say whether block-level rules count. FR-004 / D61 cover `global` only.
- **Kind and tag references in style rule targets** (`style element.tag = #t`, `style element.kind = k`, in views, in the `views` block and in deployment views). US-7 lists "view predicates" and never names style targets. Recon B/C/E §6 says these targets are not parsed into items. A tag rename that misses them violates INV-1. A tag removal that misses them accepts a used tag as unused.

**Proposal:** List block-level `views { style … }` rules and style rule targets (element, kind and tag forms, in element, dynamic and deployment views) explicitly. They belong in FR-001 (remove, cascade, rename/move) and in the US-7 rename/remove list, each with a test. Alternatively, put them explicitly under FR-004 as a rejection.

### F3 — MAJOR · Hat 1 · new
**Place:** D67 / US-6 "separate name spaces"; US-7 rename of `where kind is k`.
**Why:** `where kind is X` references the union type `DeploymentNodeOrElementKind`. Verified in a model with both `element vm` and `deploymentNode vm`:
- `where kind is vm` in an element view **links to the deploymentNode kind** (`WhereElementKind vm DeploymentNodeKind SpecificationDeploymentNodeKind`);
- LikeC4's computation still **matches element `a` of element kind `vm` by name** (view `v` → `["a"]`).

Take `renameKind(element, vm → vmx)`:
- If the catalogue resolves the reference the way LikeC4 links it (to the deploymentNode kind), it leaves `where kind is vm` alone. View `v` silently loses `a`, and `likec4 validate` still passes.
- If it rewrites the reference, a deployment-view predicate on that name changes its meaning.

This is a concrete silent meaning change that INV-1 and the stability check do not catch. It breaks the task's hard constraint that no view silently changes meaning.
**Proposal:** Add a requirement for kind names shared between element kinds and deployment node kinds. It must cover rename and remove when a `where kind is` (or `element.kind`) reference to that name exists: either reject with the places listed, or apply a defined rewrite rule for both types. → [USER-DECISION] U2.

### F4 — MAJOR · Hat 1 (scope inheritance) · new
**Place:** Scope; US-12; API surface table.
**Why:** The CLI also has single-purpose commands that wrap the changed operations: `add-element`, `add-relationship`, `remove-element`, `remove-relationship` (`src/cli.ts:236`, `:293`, `:380`, `:414`). The spec covers only `apply`.
- With the new default rejection, `remove-element` loses its only way to complete a removal: there is no `--cascade`.
- With the new ambiguity error, `remove-relationship` can no longer remove anything that has a parallel relationship: it has no selector flags.
- `add-element` and `add-relationship` gain nothing: no root `file`, no `kind`, no `bidirectional`.

This is a regression for CLI users. Nothing in the spec says it was decided.
**Proposal:** State explicitly, for each single-purpose command, whether it gains the new options (`cascade`, selector, `file`, `kind`, `bidirectional`) or stays as it is with its new behaviour documented in README and CHANGELOG.

### F5 — MAJOR · Hat 1 · new
**Place:** US-9 / D70 "more than one match without a selector that singles one out is a rejection".
**Why:** LikeC4 accepts relationships that are identical in every selector field. Verified: two `a -> b 'x'` in one model validate cleanly. For such a pair no `matchKind` / `matchTitle` / `matchBidirectional` combination singles one out. Under the new rule neither of them can ever be removed through the library. Today the first one is removed, so this is a regression with no way forward. It contradicts D54's own reasoning that the caller should "still have a one-step path".
**Proposal:** Add a requirement for indistinguishable candidates. Options: address one by position (file and line, already in the candidate list), allow an explicit remove-all, or reject with a documented manual-edit path. → [USER-DECISION] U3.

### F6 — MAJOR · Hat 1 (wrong assumption) · new
**Place:** US-10 (identity taken from the selected relationship; the block matching nothing "cannot arise from a selected relationship"); D72; INV-2; INV-7.
**Why:** For a relationship whose title comes from its **kind's default title**, LikeC4 1.59.4's validator and its merge disagree. Verified with `relationship r { title 'kt' }` and `a -[r]-> b`:
- `extend a -[r]-> b { #t }`: no warning, but the tag is **not applied** (computed `[{"title":"kt"}]`);
- `extend a -[r]-> b 'kt' { #t }`: the tag **is applied**, but LikeC4 warns `This extend does not match any relation (by source, kind, target, title, and directionality)`.

Whichever title the writer chooses, the spec fails one of its own requirements:
- the block with the title introduces the warning that INV-2 forbids;
- the block without the title has no effect, so its effective values differ from what the caller asked for, and INV-7 / SC-009 fail.

The spec's claim that such a block cannot arise from a selected relationship is false.
**Proposal:** Add a decision for relationships whose title comes from their kind: reject creation, naming the reason, or accept one of the two outcomes and document it. → [USER-DECISION] U4.

### F7 — MAJOR · Hat 1 · new
**Place:** US-8 (`addRelationship` new forms); task D ("`extend a -> b` matching stays correct for the new forms"); US-10 `shared` rule.
**Why:** A block applies to every relationship of its identity. Verified: one `extend a -> b 'x' { #t }` tags both `a -> b 'x'` relationships. So `addRelationship` can create a relationship whose identity equals an existing block's identity, for example a new `<->` or `-[k]->` matching a block written for another relationship. The new relationship silently inherits that block's tags, links and metadata. US-10 demands an explicit `shared` before a block may cover more than one relationship. The reverse path, a new relationship joining an existing block, is silent. The policy is inconsistent and contradicts "no silent meaning change". The spec has no requirement here.
**Proposal:** Add a requirement for `addRelationship` (all forms) when the new relationship's identity matches an existing `extend a -> b` block. Options: report the inherited contributions, reject unless the caller opts in, or document it as accepted LikeC4 behaviour. In each case add a test.

### F8 — MAJOR · Hat 2 · new
**Place:** US-3 / FR-020 / Edge cases ("move to the same parent: rejected as nothing to change").
**Why:** The task says "Move changes the parent, **target file included**". Two cases are left undefined:
1. A root element moved to another file has the same parent (root) and a different file. Read literally, the spec rejects it as "nothing to change".
2. A non-root element can only reach another file by being placed in an `extend <parent> { }` body there. FR-020 places moved declarations only into the parent's own body or the top level of `model`. The spec neither supports this case nor puts it out of scope.

It also does not say whether `file` is rejected together with a non-root target parent. US-5 states that rejection for `addElement`, but not for move.
**Proposal:** Define move semantics for (a) root → root in another file, (b) a non-root element moving to another file (supported through an `extend` body, or explicitly out of scope with a coverage note), and (c) `file` given with a non-root parent (rejection).

### F9 — MINOR · Hat 1 · new
**Place:** INV-1; US-3; US-1.
**Why:** Element FQNs change on rename and move, and nodes disappear on remove. LikeC4 keeps manual layouts in `*.likec4.snap` keyed by view and node ids. `likec4 validate` reports layout drift, and the test helper counts drift as an error. The tests use `NoLikeC4ManualLayouts`, so they cannot see this. INV-1 ("a file set that passed `likec4 validate` before passes after") is then not true on projects with manual layouts. The coverage document (row "Manual layouts") already records the gap for views. The spec does not mention it for elements.
**Proposal:** Scope INV-1 to `.c4` sources and record the manual-layout gap for rename, move and remove in "Not in scope" and in the README.

### F10 — MINOR · Hat 2 · new
**Place:** US-11 ("the style representation is the one deployment nodes and instances already use") vs "own style … kind's style … effective".
**Why:** Deployment reads report the effective `style` plus `fromSpecification.style` and no own style (`src/query/types.ts:376-380`, `:450-454`, `:510-521`). Elements would report three values, deployment nodes two. The task's criterion is "the style representation is shared with deployment nodes and instances", and "deployment readers keep reporting the same values" freezes the divergence.
**Proposal:** State whether deployment reads also gain the own style, or say that only the value type is shared, not the set of fields.

### F11 — MINOR · Hat 2 · new
**Place:** US-5 acceptance list of creating operations; D71 vs task B.
**Why:**
- The task's criterion is that "missing block, chosen file and default rule are tested for **each** creating operation". The spec lists only `addElement`, `addRelationship`, kind and tag additions, and `extend` creation. `addView` and the deployment creating operations are left out, without saying they are already covered by earlier stages.
- D71 makes `file` **required** for `extend` creation. The task text says an optional target file whose default stays "first file with the block". The owner did delegate forks to the lead, but the deviation from the task text, and the inapplicable "default rule" test, should be stated where the acceptance is mapped.

**Proposal:** List every creating operation, each with "tested here" or "already covered by <stage>". Note D71 as a conscious deviation from task B and from the acceptance criterion.

### F12 — MINOR · Hat 2 · new
**Place:** SC-011; Scope bullet "README, CHANGELOG".
**Why:** The task's acceptance names README sections explicitly: the reference policy **table**, placement and file choice, "Specification defaults → Writing" rewritten, "`extend` blocks → Writing", relationships, styles. The spec requires only that the README "describe every behaviour change of INV-8". Traceability from the acceptance to the spec is lost.
**Proposal:** Enumerate the README sections in a success criterion, including that FR-001 appears as a README table.

### F13 — MINOR · Hat 2 · new
**Place:** US-10 rejections ("unless the caller states it explicitly (`shared`), in which case the error lists the other matches when the flag is absent").
**Why:** The sentence contradicts itself. It cannot tell the reader what happens with the flag and what happens without it.
**Proposal:** Rephrase as two rules: without `shared`, a rejection listing the other matches; with `shared`, the block is created. Also state what happens when `shared` is given but the identity matches only one relationship.

### F14 — MINOR · Hat 1 · new
**Place:** D67 rationale (task comment); US-6 rejection "a keyword LikeC4 cannot parse as one — spike 02".
**Why:** The decision comment says spike 02 showed `element model` to be a parse error. That is wrong. Verified: `specification { element model } model { a = model 'A' }` and `tag model` both parse with no diagnostics. Only `element view` fails, and that is where spike 02's error sits (line 2, "but found: 'view'"). The spec text is neutral, but a plan built on the decision comment would reject valid names.
**Proposal:** Correct the rationale. Require that name validity is "accepted by LikeC4's grammar in that position", with tests for at least one keyword that is accepted and one that is not.

### F15 — MINOR · Hat 2 · new
**Place:** US-6 / US-7; US-10 "nothing to add".
**Why:** Four cases are left unspecified:
- whether removing the last kind or tag leaves an empty `specification { }` block (D-style decisions exist for `with { }` and `model`);
- what "update edits the one existing declaration" does when the loaded files already declare the kind twice (verified: a duplicate of any kind type is a LikeC4 error, so the input is invalid, but the write still needs a defined outcome);
- whether a link already present in the target `extend` block counts as "nothing to add", the way tags do (the element merge keeps duplicate links);
- what happens to the `with { … }` of a cascaded relation-predicate item (`include a -> b with { … }`) is covered, but what happens to a `where` that follows a removed item is not stated.

**Proposal:** Define each of these outcomes in one line.

### F16 — MINOR · Hat 1 · new
**Place:** US-9 / D70 "consistent with `updateRelationship`".
**Why:** `removeRelationship` gains matching in either endpoint order for `<->` and `matchBidirectional`. `updateRelationship` keeps a plain `source === source && target === target` match (recon D/F §3). US-10 also uses "the US-9 selector". After this change the three selectors differ, while the task asks for them to be consistent.
**Proposal:** State whether `updateRelationship` gains the same bidirectional matching and `matchBidirectional`, or document the difference.

### F17 — MINOR · Hat 2 · new
**Place:** Non-functional constraints.
**Why:** "No per-reference reparse loop that grows quadratically … beyond what the existing removals do" is unquantified. It is silent about `apply` batches, where every declaration-changing mutation now builds a full reference catalogue across all files with views included.
**Proposal:** Name the expected cost model, for example one catalogue per mutation, or say explicitly that no bound is set.

---

## [FOR-PLAN]
- The snapshot does not cover block-level `views { style … }` rules, and `view-query` does not parse style rule targets (recon A §2, recon B/C/E §6). The catalogue for F2 needs a source for both.
- Extend relation identity must use the title LikeC4's merge uses (the effective title, kind default included). The plan must say which title the written block carries, after F6 is decided.
- "Moves with its comments" (FR-020): which leading comments belong to a declaration.
- `matchTitle` today compares the raw inline title only, while the deployment selector compares the effective title. Candidate lists and extend identity should use one of them on purpose.

---

## [USER-DECISION]
- **U1 (F1):** What rename and move guarantee about computed views and titles. Option (a): σ-equality only for explicit references; changes driven by wildcards and hierarchy are allowed and documented; a title-less rename changes the title. Option (b): rename writes the old name as an explicit title. Option (c): reject moves that would change wildcard membership. The task's acceptance wording ("same … view contents") needs amending under (a).
- **U2 (F3):** Kind names shared by an element kind and a deployment node kind, referenced by `where kind is` / `element.kind`. Option (a): reject rename and remove while such references exist. Option (b): rewrite them, documented as affecting both types.
- **U3 (F5):** Removing one of several relationships that no selector can tell apart. Option (a): address one by file and line. Option (b): explicit remove-all. Option (c): reject and document a manual edit.
- **U4 (F6):** `extend a -> b` creation for a relationship whose title is its kind's default. Option (a): reject. Option (b): write the title, so the block applies and LikeC4 warns. Option (c): omit the title, so there is no warning and the block has no effect. Only (a) satisfies both INV-2 and INV-7.

---

FRICTION:
- The task description cites `findFileWithModel` at `src/mutator/mutator.ts:897` and `:225` / `:418`, and the throw at `element-ops.ts:129`. Recon B/C/E finds them at `mutator.ts:2858-2863`, `:569-578`, `:796-797` and `element-ops.ts:191-193`. The task's line numbers are stale.
- The task text uses "Stage 0a" for the declaration checks. Recon B/C/E §5 reports that the string appears nowhere in `src` or `docs`. I had to infer that it means `write-checks.ts`.
- Decision D67's rationale misquotes spike 02 (F14). The spike's own output contradicts the decision record.
- The prompt asks me to read the three CLAUDE files "in full". They were already loaded into my context by the harness, so I did not re-read them from disk.

VERDICT: NOT-READY

Must-fix:
1. F1 — define the equivalence rename and move guarantee (wildcards, hierarchy, title-less names); align US-3 and SC-003 (U1).
2. F2 — put block-level `views { style … }` rules and style rule targets (element, kind, tag) into FR-001 and US-7, or explicitly under FR-004.
3. F3 — requirement for kind names shared between element kinds and deployment node kinds in `where kind is` (U2).
4. F4 — scope the single-purpose CLI commands explicitly.
5. F5 — a way forward for indistinguishable relationships in `removeRelationship` (U3).
6. F6 — decision for `extend a -> b` creation when the title comes from the kind (U4); fix the "cannot arise" claim.
7. F7 — requirement for `addRelationship` creating a relationship that joins an existing `extend a -> b` identity.
8. F8 — move semantics across files (root → root, non-root, `file` with a parent).
