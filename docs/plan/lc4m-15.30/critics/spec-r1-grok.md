# Spec critique round 1 — grok

**Artifact:** `docs/plan/lc4m-15.30/spec.md` (DRAFT, 2026-10-17)
**Task:** lc4m-15.30 (project lc4m), acceptance criteria and description read from Skein; decisions D53–D75 read from the decision comments on that task.
**Checked against:** the spec, those decisions, `docs/plan/lc4m-15.30/spikes/` (recon-a, recon-bce, recon-df, spikes 01 and 02 and their outputs), the library sources under `src/`, and LikeC4 1.59.4 as installed (`@likec4/language-server` / `@likec4/core` 1.59.4). Extra read-only probes were run with the spike helper `spikes/_lc4.mts` (outputs not committed). Context7 was not available (see FRICTION).

The spec covers the six parts of the task (A–F), lc4m-17 (D53, US-4), and decisions D53–D75. The gaps below are places where a literal reading either accepts a write LikeC4 1.59.4 then rejects, or accepts a write whose computed view or metadata is a different fact from the one the caller asked for.

## Findings

### 1. Cascade removal of the last predicate changes what a scoped view shows

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `new`
- **Place:** D55; FR-001 row "include / exclude predicate item"; US-1 acceptance ("exactly the constructs of the table are gone"); edge cases do not mention a predicate-less view.
- **Why:** D55 removes an include/exclude rule when its last item is removed, because `include` with no items does not parse (spike 02, confirmed). LikeC4 1.59.4 still parses a view with no predicates, and the computed diagram changes meaning:
  - `view one of app { include api }` computes nodes `[app.api]`.
  - `view bare of app { }` computes nodes `[app]` (the scope element, not the children).
  - `view empty { }` (no `of`, no predicates) computes nodes `[]`. `view one { include a }` computes `[a]`.
  - `view none of app { include api exclude api }` computes `[app]`.
  So cascade-removing element `api` from `view v of app { include api }` (the view's `of` is `app`, so D56 does not reject) deletes the rule and the view then shows `app` instead of `app.api`. An unscoped view with only that include becomes an empty diagram. US-1's acceptance checks dangling references and deleted constructs; it does not check computed view membership, so both results pass the written acceptance. The task forbids a view changing meaning unless the caller chooses that change. Cascade chooses "remove the referencing construct", not "show the parent".
- **Proposal:** A requirement must state the computed membership after the last include/exclude predicate of an element view is removed. The product choice is in [USER-DECISION]. Until that choice is written into FR-001 and into US-1 / SC-001, the removal policy is not implementable safely. Whichever choice is made, the acceptance fixture is the pair above: scoped `view of app { include api }` and unscoped `view { include a }`, both modes, with expected node ids.

### 2. Three reference kinds fail validation and are not in the policy table

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `new`
- **Place:** FR-001; US-1 ("One test per reference kind of FR-001"); US-4 (the stability check covers "every reference kind of FR-001"); problem statement "every reference kind of the DSL".
- **Why:** The table's include row is limited to "element and deployment views". These three are element references, and LikeC4 1.59.4 reports `Could not resolve reference` / `Element "…" is not resolved` when the target is missing (`likec4 validate` fails):
  1. **Dynamic-view `include`.** `dynamic view d { a -> b include gone }` fails validation. FR-001 lists dynamic step endpoints and does not list `DynamicViewIncludePredicate` (grammar: container `DynamicViewBody` or a global dynamic-predicate group).
  2. **`rank` targets.** The parsed form is `rank { a }` (`rank a` does not parse). `rank { gone }` fails validation. `rank { }` also fails to parse (same class as a style rule with no target, spike 02). `ViewRuleRank` exists only on element views. The table has style-rule targets and no rank row.
  3. **A style rule on the `views` block itself**, not inside a view: `views { style gone { color red } view v { include a } }` fails validation. That node is a `ViewRuleStyle` whose container is `ModelViews`. The table splits "view style rule target" (cascade) from "global predicates and styles" (always reject, D61). A `views`-block style rule is neither a `GlobalStyle` nor a rule inside a view body.
  An accepted `removeElement` / `cascade` that follows the table leaves these in place, so INV-1 fails. US-4's widened check inherits the same list, so `addElement` can shadow a dynamic `include` or a `rank` target and still succeed.
- **Proposal:** FR-001 gains a row for each, with the same default (reject and list the reference) and a cascade rule. Cascade of a dynamic `include` item follows the include-item row (the rule goes when it was the last item). Cascade of a `rank` target removes the target, and removes the `rank` rule when it was the last target, because an empty `rank` block does not parse. The `views`-block style rule is classified explicitly (cascade like a view style rule, or always reject like D61). US-1 and US-4 each require one test for these three. Global predicate bodies stay on the D61 row.

### 3. Kind and tag rename misses negated predicates

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `new`
- **Place:** US-7 expected list (`where tag is #t`, `where kind is k`, `element.tag = #t`, `element.kind = k`, "relation `where` kind and tag conditions, participant conditions").
- **Why:** LikeC4 1.59.4 accepts all of the following in one view (no diagnostics): `where kind is not system`, `where tag is not #next`, `element.kind != container`, `element.tag != #next`. The AST carries them as `isEqual: false` (`ElementKindExpression`, `ElementTagExpression`) or `not: true` (`WhereElementKind`, `WhereElementTag`, `WhereRelationKind`, `WhereRelationTag`, `WhereRelationParticipantKind`, `WhereRelationParticipantTag`). US-7 names only the positive spelling. After the declaration is renamed, an unrewritten negated reference still says the old name. LikeC4 then reports an unresolved kind or tag (the same class of error as spike 01's `where kind is gone`). INV-1 fails, and SC-006's "every reference place of US-7" does not include these places.
- **Proposal:** US-7's reference list includes the negated form of every place it already lists (`is not` / `not` flag, and `!=` on `element.kind` / `element.tag` and on relation and participant conditions). SC-006 requires a rename test per negated place, across two files, with the predicate still resolving to the renamed declaration.

### 4. `where kind is` and `element.kind =` do not name the same kind when the names collide

- **Severity:** BLOCKER
- **Hat:** 1
- **Class:** `new`
- **Place:** US-7; D67 (element kinds and deployment-node kinds are separate namespaces and may share a name; spike 02 shows that model validates).
- **Why:** With both `element vm` and `deploymentNode vm` declared, LikeC4 1.59.4 links `where kind is vm` to the **deployment node kind** and `element.kind = vm` to the **element kind**. Swapping the declaration order does not change those targets. With only `element vm`, `where kind is vm` links to the element kind. US-7 rewrites both spellings for "the kind" being renamed. Renaming the element kind `vm` to `guest` while the deployment-node kind `vm` remains would rewrite `where kind is vm`, which does not refer to the element kind, and would leave `element.kind = vm` as the only reference that must move. The predicate would then name a kind that is gone, or it would stop selecting the deployment nodes it selects today. The reverse rename (deployment-node kind only) is the mirror image.
- **Proposal:** A kind or tag reference is rewritten only when it resolves to the declaration being renamed. US-7 states the collision rule in those words: `where kind is` may resolve to an element kind or a deployment-node kind; `element.kind` resolves to an element kind; a same-spelling neighbour is left untouched. Acceptance: one model where both kinds are named `vm`, rename each kind in turn, and the predicate that resolved to the other kind is byte-identical and still resolves to it.

### 5. Nested relationships can carry a kind and a direction; the written form does not say so

- **Severity:** MAJOR
- **Hat:** 2
- **Class:** `new`
- **Place:** US-8; D68 ("nested placement writes `-> target`").
- **Why:** US-8 accepts `kind`, `bidirectional`, and nested placement on the same call, and rejects only dot-form-plus-bidirectional and `file` plus nested placement. LikeC4 1.59.4 accepts, inside an element body, `<-> b` and `-[async]<-> b` (both computed as one bidirectional relationship; the second has kind `async`). It also accepts `.async b` (spike 01). It rejects `.async <-> b`. The spec's only nested spelling is `-> target`. A caller who asks for a nested bidirectional relationship, or a nested kind, has no required text. Spike 01 also shows `extend a -[async]-> b` matches a relationship written `a .async b` (tags applied, no warning), so the extend block's connector form is not part of identity, but US-10 still does not say which connector is written.
- **Proposal:** US-8 states the nested spelling for every accepted combination: sourceless `->`, `<->`, `-[kind]->`, `-[kind]<->`, and `.kind` when the caller asks for the dot form; dot form plus bidirectional stays rejected. Label, tags, links, metadata, description, technology and style are written as they are for a top-level relationship. US-10 states that the relationship extend block is written with the bracket connector of that relationship's kind and direction (the form that also matches a dot-form relationship).

### 6. Nested relationships inside an `extend` body are neither required nor excluded

- **Severity:** MAJOR
- **Hat:** 1
- **Class:** `new`
- **Place:** US-8 ("inside the source element's declaration body"); task description coverage row `Relation` › nested in an element or `extend` body (Add); scope "In scope" / "Not in scope" do not mention it.
- **Why:** The grammar of `ExtendElementBody` allows nested `Relation` and nested `Element` in an `extend` block (recon B/C/E §7). The task's coverage row to update names that construct. US-8 only creates the relationship in the source's declaration body (creating that body when absent, D64). A source whose relationships live in an `extend` block in another file cannot receive one there. The row would be marked done while that construct still cannot be written.
- **Proposal:** The scope lists this surface explicitly. Either nested placement may target an existing `extend` block of the source in a chosen file, with the same body-creation and reference rules as the declaration body, and US-8 tests it; or it is out of scope and the coverage note for "nested in an `extend` body" stays `no`. Silence is not a choice.

### 7. `removeRelationship` learns direction; `updateRelationship` does not

- **Severity:** MAJOR
- **Hat:** 1
- **Class:** `new`
- **Place:** US-9; D70; API table row `removeRelationship`. `updateRelationship` is not mentioned.
- **Why:** Today `updateRelationship` already rejects more than one match and disambiguates with `matchKind` and `matchTitle` (`src/mutator/mutator.ts` around the `matches.length > 1` check). Endpoint comparison does not swap a bidirectional pair (`findMatchingRelations` in `src/mutator/relationship-ops.ts`: `sourceFqn === matcher.source && targetFqn === matcher.target`). US-9 adds `matchBidirectional` and either-order matching to `removeRelationship` only. After US-8, `a -> b 'x'` and `a <-> b 'x'` are a legal pair. `removeRelationship(b, a, { matchBidirectional: true })` removes the bidirectional one. `updateRelationship` from `b` to `a`, or without a direction field, still cannot single it out: `matchKind` and `matchTitle` are equal, so the update stays on the "multiple matches" error and the caller's tags or title cannot be written. The feature creates a state the existing update path cannot address. The same pair also diverges on endpoint order. Separately, update's ambiguity is a plain `Error` today, while INV-4 requires `InvalidWriteError` for the new remove rejections; the spec does not say that this split is intentional.
- **Proposal:** The requirement states the selector contract for both operations. `updateRelationship` matches a bidirectional relationship in either endpoint order and accepts the same `matchBidirectional` field as remove, with the same "still more than one match is an error" rule. If update is deliberately unchanged, the spec says that a bidirectional twin cannot be updated in this run and names that as a limitation in the README. The error type of update's existing ambiguity is either brought under INV-4 or listed in INV-8 as unchanged.

### 8. "Equal to LikeC4's computed style" contradicts D74

- **Severity:** MAJOR
- **Hat:** 2
- **Class:** `new`
- **Place:** SC-010; US-11 acceptance ("compared with LikeC4's computed model"); D74; INV-7.
- **Why:** D74 and US-11 say theme defaults and configured `styles.defaults` are not applied. INV-7 repeats that exception. SC-010 says style reads equal LikeC4's computed element and relationship styles, with no exception. On `a <-> b { style { head diamond } }`, the pre-theme relation value is `head: diamond`, `tail: diamond` (the D74 tail rule, also `applyBidirectional` in `@likec4/language-server` 1.59.4: `tail: rel.tail ?? rel.head ?? "normal"`). The model getter for the same relationship reports `line: dashed` and `color: gray` on top of that head and tail. Those two are the theme defaults, not anything written in the file. An implementation that satisfies SC-010 reports theme defaults; an implementation that satisfies D74 fails SC-010. Own style is defined as written (D18). `$data` stores opacity as a number (`opacity 40%` becomes `40` in spike 01); the written form and the pre-theme value differ there too.
- **Proposal:** SC-010 and the US-11 acceptance name the comparison target as the pre-theme values: kind style overridden by own style, body `icon` winning over `style.icon`, bidirectional absent `tail` equal to the effective `head` otherwise `normal`, no theme and no configured defaults. Own values stay the written forms (D18), and the acceptance says how opacity is compared (written percent versus LikeC4's number) so the two sides of US-11 cannot be read as the same string.

### 9. A metadata key that already exists on another `extend` block becomes an array

- **Severity:** MAJOR
- **Hat:** 1
- **Class:** `new`
- **Place:** D71; US-10 rejection "a metadata key already present in the target block"; FR-050.
- **Why:** D71 rejects a key that is already in the block being merged into, because an overwrite is an update. It does not look at other blocks. Two blocks in one file:
  `extend a { metadata { k 'first' } }` and `extend a { metadata { k 'second' m 'only2' } }`
  compute metadata `k: ["first", "second"]`, `m: "only2"` (LikeC4 1.59.4, `$data`). Adding `k` into the first block when the second block already has `k` is allowed by the written rule (the key is not in the target block) and the effective value becomes an array of both. The caller asked to add one string. Tags in FR-050 are not repeated; metadata has no such rule across blocks. US-10's acceptance compares effective values with ModelBuilder only for "an existing block" in the chosen file, which a test can satisfy with a single block.
- **Proposal:** The requirement defines a key that is already present on any `extend` block of that element (any loaded file), not only on the merge target. The product choice, reject versus union-into-an-array, is in [USER-DECISION]. FR-050 and US-10 name the chosen effective value, with a fixture of two blocks. The same sentence states duplicate links: LikeC4 keeps both copies (`link https://example.com 'L'` written twice is two links). FR-050 may keep that, but it has to say so, because tags in the same paragraph are deduplicated.

### 10. Emptied compound steps and groups are specified only for `par`

- **Severity:** MAJOR
- **Hat:** 2
- **Class:** `new`
- **Place:** D55; FR-001 rows for dynamic steps and for include items; edge case "Chains" and the `par` sentence.
- **Why:** D55 removes an emptied `par` because an empty `par` parses and means nothing (spike 02). The same file parses with empty `alt`, `opt`, `loop`, `try` and `par` together, and an empty `group 'g' { }` parses. None of those are in the cascade rule. A chain or a step nested in `alt` / `loop` / `try` is one statement; cascade removes the statement (the chain rule) and can leave the compound empty. An include that is the only item inside `group 'g' { include a }` is a predicate item the table does not say is walked. That view computes nodes `['@gr1', 'a']` (a group plus the element). After the item is removed, the spec does not say whether the group stays, so two implementations can both claim FR-001 and produce different diagrams. US-3's "same computed view contents" has the same hole for groups.
- **Proposal:** FR-001 names every compound whose body can become empty: `par`, `alt`, `opt`, `loop`, `try` / `catch` / `finally`, and view `group`. Emptied compounds are removed under the same rule as `par` (they parse, they add nothing the caller asked to keep). Include and exclude items inside a `group` are the same predicate items as top-level ones, and the group's computed node is part of the view-contents comparison in US-1 and US-3. A cascade test uses a multi-hop chain inside `alt` where only the last hop's endpoint is removed, and a `group` whose only include is removed.

### 11. File choice for views and deployment is dropped without a word

- **Severity:** MAJOR
- **Hat:** 1
- **Class:** `new`
- **Place:** Scope B; US-5; D62; SC-005. Task description section B lists target-file on root `addElement`, `addRelationship`, `addView` and views-block creation, deployment node / block creation, `extend` creation, and `specification` creation. Acceptance B: the missing-block, chosen-file, and default-file cases are tested for each creating operation.
- **Why:** US-5 and SC-005 list `addElement`, `addRelationship`, kind and tag additions, and `extend` creation. They do not mention the operations that already take `file`, and they do not say those contracts stay. In the current library, `addView` uses `chooseBlockPlacement` (document order: first file with the block, else first file with a `model` block, else the first file — `src/mutator/block-placement.ts`). `addDeploymentNode` takes `file` for a root node and rejects it for a child (`src/mutator/mutator.ts`, the `parentId !== null && opts.file` check). `addDeploymentRelationship` takes `file`. `addDeploymentExtend` requires `file`. `addDeploymentInstance` rejects `file` because the instance is written in its node's declaration. D62 says the new rule is "the same rule as `addView`" but never says `addView` and the deployment writers are unchanged. A planner can treat the task's list as still open, or can "unify" placement and change the deployment child/`file` rejection.
- **Proposal:** The scope names each of those operations: unchanged in this run, including the child-node and instance rejections of `file`, and the existing tests are the ones that satisfy the task's "each creating operation" line for them. SC-005's parenthetical list is that full set, split into "gains `file` now" and "already has `file`, behaviour unchanged".

### 12. `file` on a non-root move is undefined

- **Severity:** MAJOR
- **Hat:** 2
- **Class:** `new`
- **Place:** US-3 (`moveElement(fqn, newParent | root, file?)`); FR-020; D65 (for `addElement`, `file` with a parent is rejected).
- **Why:** FR-020 says the declaration moves to the end of the new parent's body, or, for a root target, to the first `model` block of the chosen file. It does not say what `file` means together with a parent. D65 already rejects that combination for `addElement`, because the parent decides the file. A parent can also have children only inside an `extend` block in another file; "create the body if absent" creates it on the declaration (D64's rule for `addElement`), so the moved element does not join those siblings. None of this is stated for move, and US-3's rejection list does not include "`file` with a parent".
- **Proposal:** `file` is accepted only for a move to the root; with a parent it is rejected, naming `file`, and the declaration is inserted in the parent's declaration body (created if that body is absent), not into an `extend` of the parent. US-3 tests both the rejection and a parent whose only current children live in an `extend` block.

### 13. The default-file breaking change has no fixture where the two orders differ

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `new`
- **Place:** D62; INV-8; SC-005.
- **Why:** INV-8 records a behaviour change: root `addElement` and top-level `addRelationship` move from `findFileWithModel` (load order, `src/mutator/mutator.ts`) to LikeC4 document order. The change is visible only when those orders differ. SC-005 requires a default-file test, which a one-file model satisfies without ever exercising the change.
- **Proposal:** SC-005 includes one project of at least two files whose load order is not document order, and the default file of a root `addElement` and of a top-level `addRelationship` is the document-order file.

### 14. A cascade rejection does not say which references cascade cannot remove

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `new`
- **Place:** US-1; D56; FR-001 "`of`" / `extends` / D61 rows; "Every rejection lists every reference".
- **Why:** D56 rejects in both modes when a view `of` or `extends` would lose its target. The audit a1 model (`view of app.api` plus `include app.api` plus a dynamic step) is therefore rejected even with `cascade`, because of `of`. The spec lists every reference in one list. The include and the step would have been removed by cascade; `of` blocks the whole write. The caller cannot tell those apart, and the one-step path D54 describes does not exist for a1.
- **Proposal:** When `cascade` is set and the write is still rejected, the error splits references that block cascade (`of`, `extends`, D61) from references cascade would have removed. US-2's `extends` chain keeps naming every view on the chain, not only the nearest extender.

### 15. Unmodelled-text rejection is not a defined match

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `new`
- **Place:** FR-004; D61; edge case "Files with syntax errors".
- **Why:** FR-004 rejects remove, rename and move when a `global` block, an import, or a file the parser could not recover "names the affected element, node, view, kind or tag as text". "As text" does not say identifier token versus substring, nor whether a comment or a string counts. A kind named `red` can be blocked by the letters `red` inside an unrelated broken region. The rejection is the safe direction (nothing is written), and it is not defined tightly enough to test.
- **Proposal:** The match is a whole identifier token equal to the name, or a dotted segment equal to it. A match inside a line comment or a string counts only when the parser did not recover that region. The rejection names the file and the line. US-3 / US-7 include one such rejection and one non-match (the name as a substring of a longer identifier) that must still succeed.

### 16. Kind style and `multiple` have two homes in the API table

- **Severity:** MINOR
- **Hat:** 2
- **Class:** `new`
- **Place:** API table, rows `getSpecification()` ("unchanged") and "Reads" ("kinds + style and (relationship kinds) `multiple`"); US-11.
- **Why:** `getSpecification()` today returns names only (recon B/C/E §4). US-11 reports kind style on the element and the relationship, and the kind's `multiple` "with the kind's values". The table both freezes `getSpecification()` and adds style to kinds. Spike 01 shows relationship `multiple` on the specification relationship (`style.multiple: true`) and not as a field of the computed relationship. An element `multiple true` is on the element style. A planner can add style to `getSpecification()` and violate "unchanged", or omit `multiple` from kind reads and still match the element paragraph of US-11.
- **Proposal:** The table states one home: element and relationship reads gain own style, kind style and effective style; relationship-kind `multiple` is reported on the kind's values (and is not a per-relationship field); `getSpecification()` stays names only. US-11's acceptance points at that home.

## FRICTION

Context7 `resolve-library-id` for LikeC4 returned "Monthly quota reached" on 2026-10-17, so this review did not use Context7. LikeC4 behaviour cited above was executed on the pinned 1.59.4 in `node_modules` through `docs/plan/lc4m-15.30/spikes/_lc4.mts`, and the view-predicate overview was cross-read from `https://likec4.dev/dsl/views/predicates/` and `https://likec4.dev/dsl/views/`. No LikeC4 fact in the findings is a substitute for a failed probe. Decisions D53–D75 were taken from the Skein comments on lc4m-15.30 (the task `design` field is only the zdox stage-1 recap).

## [USER-DECISION]

1. **Predicate-less view after cascade** (finding 1). LikeC4 1.59.4 already behaves as follows, measured on 1.59.4: a scoped view with no predicates shows the `of` element; an unscoped view with no predicates shows nothing. D55 removes the last include/exclude rule because an empty `include` does not parse, and does not say what the diagram must show afterwards.
   - **(a)** Cascade that would leave an element view with no include/exclude predicates is rejected, naming the view. The caller removes or edits the view explicitly. Recommended, because it keeps the "no view changes meaning unless chosen" rule intact for the scoped case, where the diagram switches from the child to the parent.
   - **(b)** That fallback is accepted and specified: scoped → the `of` element; unscoped → no nodes. US-1 tests both. The README tells the caller that cascade can change the diagram to the scope element.
2. **Metadata key already present on a different `extend` block** (finding 9). LikeC4 unions the values into an array (`k` becomes `["first","second"]`).
   - **(a)** Reject when any block of that element, in any loaded file, already has the key. Same rationale as D71 (a second value is not an add). Recommended.
   - **(b)** Allow it and require the effective array, including order, in US-10.

## VERDICT

NOT-READY

Must-fix before planning:

1. Finding 1 — state what a view shows after cascade removes its last predicate, and lock it with the scoped and unscoped fixtures.
2. Finding 2 — add dynamic-view `include`, `rank` targets, and `views`-block style rules to FR-001, with cascade rules and tests.
3. Finding 3 — rewrite negated kind and tag predicates on rename.
4. Finding 4 — rewrite a kind reference only when it resolves to the declaration being renamed, including the `vm` / `vm` collision.
5. Finding 5 — specify the nested relationship spelling for kind, direction and dot form, and the extend connector spelling.
6. Finding 6 — put nested relationships in an `extend` body in scope or explicitly out of scope.
7. Finding 7 — give `updateRelationship` the same direction selector as remove, or document the stuck update as a limitation.
8. Finding 8 — point SC-010 at the pre-theme style values from D74.
9. Finding 9 — define a metadata key that already exists on another block of the same element.
10. Finding 10 — treat emptied `alt` / `opt` / `loop` / `try` / `group` as D55 treats `par`, and walk predicates inside groups.
11. Finding 11 — say that view and deployment file choice is unchanged, and list those operations under SC-005.
12. Finding 12 — `file` on a move is root-only; a parent move writes the parent's declaration body.
