# Spec critique, round 3 (claude) — lc4m-15.30

Subject: `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17, after round 2). I checked it against:
- Skein task lc4m-15.30: description, acceptanceCriteria, and the decision comments up to D105 (D95–D96, D97–D99, D100–D105, and the D68/D55 amendment);
- the round-2 critiques `critics/spec-r2-claude.md` and `critics/spec-r2-grok.md` and their must-fix lists;
- spikes 01–05 and the recon files;
- the code (`src/query/types.ts`, `src/query/view-index.ts`, `src/mutator/deployment-ops.ts`) and the LikeC4 1.59.4 AST typings (`node_modules/@likec4/language-server/dist/chunks/module.d.mts`).

Verification: I ran read-only spikes against LikeC4 1.59.4 through `spikes/_lc4.mts`. The scripts were in the session scratchpad, outside the repository. The repository has no new files except this report. A finding marked **verified** quotes those runs. Anything else is marked ASSUMPTION.

## Coherence of the round-2 fixes

| Notion | Places checked | Result |
|---|---|---|
| FR-002 (D78, D79, D95) | US-6, US-7, D78, D95, SC-006 | Shared-name guard and negated forms are consistent. The closed place list misses one grammar position (F1). SC-006 still points to "US-7" places (F8). |
| FR-003 (D55, D61, D77, D96) | FR-001 rows, US-1, D55, D61, D77, Edge cases, SC-001 | Consistent. `parallel`, `break`, the `alt` branches and `try`/`catch`/`finally` match the grammar's `DynamicViewFlowKeyword`. One boundary question remains (F7). |
| D97 (unnamed instances) | US-3, US-3 rejections, US-3 acceptance, D97 | σ definitions in D58 and INV-3 were not updated (F3). The collision guard is too narrow (F2). |
| D98 (move without file) | US-3, US-5 acceptance, D62 row, D98 | FR-020 and SC-005 still say D62 (F4). |
| D99 (relative icons and links) | US-3 rejections, D85, D99 | Consistent. |
| D100 (relationship kind title) | US-6 rejections, D100 | Consistent. |
| D101 (FR-004 for additions) | US-4, D61, FR-004, INV-8 | Consistent across places. Scope and strength are open (F6). |
| D102 (position) | US-9, D81, D102, SC-008 | Consistent. Position base and its link to reads are undefined (F5). |
| D103 (`extend a -> b` file) | US-10, D103, SC-005 | Consistent. US-5's acceptance cites only D71 (F4). |
| D104 (remove errors) | INV-4, INV-8, FOR-PLAN | Consistent. |
| D105 (deployment selector) | Scope "Unchanged", SC-008 | Consistent. |
| US-3 narrowing note, SC-012 | US-3, SC-012 | Consistent. SC-012 now carries the D84 README sentence. |

---

## Findings

### F1 — BLOCKER · Hat 1 · new
**Place:** FR-002 (the "closed" place list), US-7 Expected (its repeated list), SC-006.

**Why:** FR-002 lists relationship connectors only for model, deployment and `extend` relationships and for dynamic steps. A view predicate can also name a relationship kind, through its connector: `include a -[k]-> b`, `exclude a -[k]-> *`, or the dot form `a .k b`. In the LikeC4 AST, `OutgoingRelationExpr.kind: Reference<RelationshipKind>` (with `RelationKindDotRef`) is separate from `WhereRelationKind`. The library already reads it: `ViewRelationKind` in `src/query/types.ts` is "a relationship kind written in a predicate or a step".

Verified on 1.59.4:
- `exclude a -[async]-> b` and `exclude a .async b` validate cleanly while `relationship async` is declared.
- After the kind is renamed to `msg`, with every FR-002 place rewritten, both `exclude a -[async]-> b` and `exclude a -[async]-> *` fail validate with `Could not resolve reference to RelationshipKind named 'async'`.
- A deployment view predicate `exclude n.a -[async]-> n.b` also validates. So the position exists in deployment views too.

Consequences:
- A relationship kind rename that follows FR-002 breaks INV-1.
- A removal treats a kind used only in a predicate connector as unused. The removal is accepted, and the model no longer validates.

US-7's acceptance ("a test per reference place of FR-002") cannot catch either case, because the place is not in the list. D95 says the list is closed, so a planner will not add the place.

**Proposal:** Add relationship kinds written in predicate connectors to FR-002, in both bracket and dot forms. This covers relation predicates in include and exclude rules (element, dynamic and deployment views, inside `group`), in style targets where the grammar allows relation expressions, and in the `views` block, and their kind type is relationship. Add the place to US-7's list, and require a rename test and a removal-rejection test for it.

### F2 — MAJOR · Hat 1 · consequence of fix spec-r2-claude.md#1
**Place:** US-3 rejection "a rename that would give two deployment instances in one node the same id"; D97 row.

**Why:** After a rename, an unnamed instance's id can also clash with a sibling deployment node. Verified on 1.59.4:
- `node prod { node svc  instanceOf app.svc }` gives `Duplicate node name "prod.svc"` and `Duplicate instance name "prod.svc"`. This is what renaming `app.api` to `svc` produces when `node prod { node svc  instanceOf app.api }` exists.
- `node prod { svc = instanceOf app.x  instanceOf app.svc }`, a named and an unnamed instance, gives `Duplicate instance name` on both lines.

The node case is not covered by "two deployment instances". The named-instance case is covered only if "instance" includes named instances, and the text does not say so. In both cases INV-1 breaks on an accepted rename. No reference changes resolution here, so the stability check (INV-3) cannot see the collision.

**Proposal:** State the D97 rejection as follows: a rename is rejected when an unnamed instance's new id equals the id of any sibling in its deployment node. Siblings are deployment nodes, named instances and unnamed instances. Add the node and named-instance fixtures to US-3's acceptance.

### F3 — MAJOR · Hat 2 · incomplete closure spec-r2-claude.md#1
**Place:** INV-3 ("σ is the identity except for the renamed or moved subtree"); D58 ("old FQN → new FQN for the subtree"); D76 row ("σ-equality of elements"); against D97 and US-3.

**Why:** D97 extends σ to the ids of unnamed instances and their contents (for example `prod.api` → `prod.svc`, and `prod.api.h` → `prod.svc.h`, verified to resolve). These are deployment ids, not part of the element subtree. INV-3 is the stability check every write runs, and its σ is still the old one.

Read literally, a deployment view reference `include prod.api` resolved to `prod.api` before the rename. After the rename it is rewritten to `prod.svc`, which is not σ(`prod.api`) under INV-3's σ. The stability check then rejects every rename D97 is meant to accept. Or, if the planner follows D97 and not INV-3, the invariant is wrong.

D76's row and SC-003 also speak only of elements, while US-3's guarantee paragraph names "deployment elements".

**Proposal:** Define σ in one place, covering the element subtree and the D97 instance ids with everything under them. INV-3, D58 and D76 then refer to that definition. SC-003 names the deployment elements and the unnamed-instance fixture of US-3's acceptance.

### F4 — MAJOR · Hat 2 · incomplete closure spec-r2-claude.md#6
**Place:** FR-020 ("to the end of the first `model` block of the chosen file (created if absent; default file D62)"); SC-005; US-5 acceptance ("its `file` is required, D71").

**Why:**
- FR-020 still sends a top-level move without `file` to D62's default. D98, US-3 ("stays in the element's current file") and US-5's acceptance say the current file. A planner reading the placement requirement implements the rejected option.
- FR-020 also says nothing about where a non-root element moved to the top level of its current file goes. The current file can hold several `model` blocks.
- SC-005 asks for every operation that gains file choice to be tested "with the default file (on a project whose load order differs from document order)". That test does not apply to `moveElement`, whose default is the current file.
- US-5's acceptance cites D71 for `extend` creation, but relationship blocks are required by D103.

**Proposal:**
- FR-020: without `file`, the destination is the element's current file (D98). Name which `model` block of that file receives it.
- SC-005: state the move's default as the current file and exclude it from the load-order test.
- US-5: cite D71 and D103.

### F5 — MINOR · Hat 2 · consequence of fix spec-r2-claude.md#8
**Place:** US-9, D81, D102 ("the start (file, line and column) of the relationship's declaration").

**Why:**
- The spec does not say whether line and column are 0-based or 1-based. `RelationshipInfo.sourceRange.line` and `.column` are 0-based (`src/query/types.ts`). The library's errors print `line + 1` (`src/mutator/deployment-ops.ts`, `src/cli.ts`). A caller who copies a position from an ambiguity error into a selector, or from `getRelationships()`, can address the wrong relationship or nothing. On one line, a column off by one may still land inside the other declaration's span.
- Inside `apply`, positions refer to the intermediate state (D102). So the ambiguity error for mutation *i* lists positions the caller has never seen, and the caller cannot reuse them directly.

**Proposal:**
- State that the selector's position equals the `sourceRange` start the reads report (with its base), and that ambiguity errors print it in a form that can be passed back unchanged.
- State that an `apply` ambiguity error names the state its positions refer to.

### F6 — MINOR · Hat 1 · consequence of fix spec-r2-claude.md#7
**Place:** FR-004 ("blocks an addition when it names the new name"); D101; D92; INV-8.

**Why:**
1. **Scope.** FR-004 says "an addition" with no limit. US-4 and INV-8 limit D101 to `addElement`, `addView`, `addDeploymentNode` and `addDeploymentInstance`. Read against FR-004, kind and tag additions (US-6) would also be blocked by any `global` block that spells the new name.
2. **Strength.** For a removal or a rename, the name can sit in any dotted segment. An addition, though, can only change the resolution of a reference's leading segment or of a bare name. ASSUMPTION, based on LikeC4's scoping as the library mirrors it (lc4m-15.29 D25), not spiked this round: `app.api` resolves `api` as a child of `app`, so a new `other.api` cannot capture it.

   With the dotted-segment rule, `addElement(parent, { name: 'api' })` is rejected whenever any `opt` / `alt` / `loop` block anywhere names `x.api`. The rejection gives no way forward short of a manual edit, because cascade does not apply to opaque blocks.

**Proposal:** Limit FR-004's addition clause to the writes INV-8 names. Then decide one of the following for additions: (a) only a bare identifier or a leading segment equal to the new name blocks; or (b) keep the dotted-segment rule and document in the README that additions are rejected by any flow block naming the name. → [USER-DECISION] L1.

### F7 — MINOR · Hat 1 · new
**Place:** FR-003 "Content-producing statements"; D77.

**Why:** FR-003 counts only a view's own `include` rules, steps and dynamic `include` rules. A view can also get content from its `extends` parent or from a `global predicate` reference.

Verified: `view base { include a }` and `view child extends base { exclude b }` computes `child` = `["a"]`. Removing `b` with `cascade` from `view child extends base { include b }` leaves a child that still shows `base`'s content. D77 rejects this write, although the meaning change it guards against (fallback to the `of` element or to nothing) does not happen.

This is on the safe side, but the spec does not say whether it is intended.

**Proposal:** Either state that inherited (`extends`) and global-predicate content does not count, so such cascades are rejected on purpose (and say so in the README), or count it as content. The lead decides. → [USER-DECISION] L2.

### F8 — MINOR · Hat 2 · consequence of fix spec-r2-grok.md#2
**Place:** SC-006 ("every reference place of US-7"); FR-002 step 2 ("the other of the element / deployment node kind types"); US-7 Expected (a second copy of the list).

**Why:**
- D95 makes FR-002 the single rule. SC-006 still points to US-7's places, and US-7 still carries a parallel list, which is the drift D95 was written to stop. The F1 omission is in both lists.
- Step 2 says it does not apply to tags, but says nothing about relationship kinds, for which "the other type" is undefined.

**Proposal:**
- SC-006 refers to FR-002's places.
- US-7 points to FR-002 instead of repeating the list.
- Step 2 says that it applies only to element and deployment node kinds.

### F9 — MINOR · Hat 2 · new
**Place:** FR-002 ("in style rule targets (element, dynamic and deployment views …)"); US-7 acceptance ("LikeC4's computed model reports the new kind and tag names").

**Why:** Verified on 1.59.4: a deployment view containing `style element.kind = vm { … }`, `style element.kind = e { … }` or `style element.tag = #t { … }` produces no diagnostics. `likec4 validate` reports nothing, and the view is missing from `LanguageServices.diagrams()`, while the same view with `style host { … }` is computed.

The place is real and must be rewritten. The US-7 acceptance cannot observe it through the computed model, though, and INV-9 has nothing to compare for such a view.

**Proposal:** State that for deployment-view style targets with `element.kind` / `element.tag` the oracle is `expectValidLikeC4` plus the written text, not the computed view. The README can note the LikeC4 behaviour as a known gap.

---

## [FOR-PLAN]
- F1: the view reader's `ViewRelationKind` already captures predicate connectors in both forms. The catalogue can bind to it for element and dynamic views, and needs a source for deployment views and for style targets the reader leaves opaque.
- F2: the deployment index already detects duplicate ids per node. The rename check needs the post-rename id set per node.
- F5: one position type for reads, selectors and errors avoids base conversions in three places.

## [USER-DECISION]
The owner delegated product forks to the lead (Clarifications), so these go to the lead's decision log:
- **L1 (F6):** For additions, does an unmodelled construct block only on a bare or leading-segment match of the new name, or on any dotted segment (documented over-blocking)?
- **L2 (F7):** Should content from `extends` and global predicates count for D77, or are such cascades rejected on purpose?

FRICTION:
- The task file asks for the `zsa-say` / `zsa-ask` mail commands and an MCP report line. Per the lead's override I ran as a subagent and skipped them. Skein MCP answered: I read `skein_show lc4m-15.30` and its decision comments.
- The task file says the report is committed. The lead's override says do not commit. I did not commit it.
- `skein_show` returned only the last 12 of 38 comments. D53–D77 were read through the spec's decision table, not from their comments.
- In spikes, deployment views are absent from `model.$data.views` but present in `LanguageServices.diagrams()`. A spike that reads deployment-view nodes from `$data.views` sees `[]` and can draw a wrong conclusion. The spike helper does not say so.

VERDICT: NOT-READY

Must-fix:
1. F1: add relationship kinds in view predicate connectors (bracket and dot forms; element, dynamic and deployment views) to FR-002 and US-7, with tests.
2. F2: widen the D97 collision rejection to any sibling id in the deployment node (nodes, named and unnamed instances).
3. F3: define σ once, including the D97 instance ids, and make INV-3, D58, D76 and SC-003 use it.
4. F4: align FR-020 and SC-005 with D98 (current file, and which `model` block), and cite D103 in US-5.
