# Specification critique, round 1 — Codex

Reviewed `spec.md`, lc4m-15.30's description and acceptance criteria, its decision comments D53–D75, the supplied reconnaissance and spikes, and the existing reference, placement, query and style contracts. Findings concern requirements and decisions, not implementation design.

Additional checks used the installed LikeC4 1.59.4 through the existing `spikes/_lc4.mts` helper, invoked with inline `npx tsx -e` experiments. No experiment file was written. The observations below are actual diagnostics and computed-model results. Current [official model documentation](https://likec4.dev/dsl/model/) was also consulted; version-specific conclusions below come from the installed package.

## 1. MAJOR · Hat 2 · CLASS: new — Rank references have no removal policy

**Place:** FR-001; US-1, US-3 and US-4; SC-001–SC-003.

**Why:** The table enumerates include/exclude items, styles and steps but omits view rank targets. LikeC4's `ViewRuleRank.targets` is `FqnExpressions` (`node_modules/@likec4/language-server/dist/chunks/module.d.mts:1260`). Existing fixtures already contain `rank same { app.api, app.db }` (`tests/mutator/view-rules-write.test.ts:86`). This is a sister surface of style-rule targets, not an unsupported project-global construct.

**Verified scenario:** A model containing `a` and `b`, with `view v { include * rank same { a, b } }`, has no diagnostics. Removing declaration `a` while retaining the rank rule produces both `Could not resolve reference to Referenceable named 'a'.` and `Validation failed: Element "a" is not resolved`. SC-001 can nevertheless pass if it tests only the table's listed rows. There is no requirement deciding what cascade removes from this rank rule or when its remaining target list becomes meaningless.

**Proposal:** Add rank targets explicitly to the reference inventory and define default rejection, cascade granularity and empty/single-target behaviour. Require rename, move and insertion-stability coverage for this surface, including kind/tag expressions allowed in its targets. Check nested group predicates explicitly as another location of the existing predicate policy.

## 2. MAJOR · Hat 1 · CLASS: new — Preserving a selector's target does not preserve a moved view's contents

**Place:** US-3 acceptance; FR-011; INV-3; SC-003.

**Why:** US-3 promises identical computed view contents under the FQN substitution. FR-011 instead retains text whenever its base reference still resolves to the same target. A selector's membership depends on hierarchy, not merely the identity of that base. Moving a child affects predicates naming the old and new parents even when neither parent belongs to the moved subtree. There is no decision for this consequence and no rejection condition covering it.

**Verified scenario:** Start with `app.api`, empty `other`, and a view whose only rule is `include app.*`. LikeC4 computes view `v` with node `app.api`. Move the declaration to `other.api`, leaving the rule unchanged as FR-011 requires: `app` still resolves to `app`. LikeC4 reports no diagnostics but computes node `app` instead. That is not the promised substitution of `app.api` to `other.api`. Reference stability and continued existence of `v` both pass while the diagram's contents change.

**Proposal:** Decide whether a move must preserve computed membership for hierarchy-sensitive predicates or whether such changes are an explicitly documented effect of moving. If preservation remains required, specify what happens when it cannot coexist with written-form preservation, including rejection. Acceptance must cover selectors on both parents and implicit hierarchy-dependent view contents, rather than only references into the moved subtree.

## 3. MAJOR · Hat 1 · CLASS: new — Kind renaming is not a one-target substitution when namespaces overlap

**Place:** US-6 namespace rule; US-7; D67; INV-3 and INV-7.

**Why:** Separate kind namespaces are correctly permitted, but some conditions compare a kind name across element and deployment-node categories. The installed AST explicitly uses `DeploymentNodeOrElementKind` for `WhereElementKind.value` and participant-kind conditions (`module.d.mts:1296,1358`). The current reader checks either namespace (`src/query/view-resolver.ts:185–187`). US-7 says to rewrite every reference without deciding what a condition means when it denotes both categories. Keeping or replacing the spelling can each lose part of its original meaning.

**Verified scenario:** Declare both element kind `shared` and deployment-node kind `shared`; declare element `a`, deployment node `prod` containing its instance, and deployment view `v` with `include * where kind is shared`. The computed node ids are `prod` and `prod.a`. Rename only the element kind to `renamed` and its declaration use. Keeping the condition `shared` produces only `prod`; changing it to `renamed` produces only `prod.a`. All three source sets have no diagnostics. Neither textual choice preserves the original selected population.

**Proposal:** Define rename semantics for conditions that match more than one kind category, including whether preserving their population is required and when rename is refused. Also define the corresponding used-kind check and behaviour when an addition creates a previously absent overlapping name. Require computed deployment-view assertions for overlapping names; declaration validity alone does not establish safe rename semantics.

## 4. MAJOR · Hat 1 · CLASS: new — Cross-file moves can silently change an icon's resource

**Place:** US-3's same-properties acceptance; FR-020; out-of-scope body-icon writes; INV-5 and INV-7.

**Why:** A move relocates declaration text to another file while preserving stage-6 text as written. Relative resource values are file-dependent. The existing style reader explicitly documents that LikeC4 resolves relative icons against the project while the library reports the spelling (`src/query/style-read.ts:18–21`). The D18 read exception does not decide whether a mutation may change the actual resource.

**Verified scenario:** The identical declaration `app = e { icon ./icon.svg }` in `one/a.c4` computes icon `file:///test/workspace/src/one/icon.svg`; in `two/a.c4` it computes `file:///test/workspace/src/two/icon.svg`. Both builds have no diagnostics. A textual cross-file move therefore changes an effective property without changing any model-element reference. This contradicts US-3's preservation promise and escapes FR-011.

**Proposal:** Specify resource preservation or explicit rejection for file-relative values during cross-file moves, and state how that requirement interacts with the prohibition on changing body-icon text. Cover relative icons in both body and style positions. Do not treat the read representation exception as permission to change their effective resource.

## 5. MAJOR · Hat 2 · CLASS: new — Same-parent rejection forbids the promised file-only move

**Place:** US-3; FR-020; Edge cases, “move to the same parent”.

**Why:** US-3 allows movement to the root of a chosen file, and the task explicitly includes target-file movement. The edge-case rule rejects every move to the same parent as “nothing to change”. A root declaration moved from `a.c4` to `b.c4` still has the root as its parent, but the requested file change is real. The contract gives opposite answers for this normal placement operation. It also does not say whether a file argument accompanying a non-root destination is rejected, as `addElement` explicitly does.

**Proposal:** Define no-op movement using both effective parent and destination file, consciously decide whether root-to-root file relocation is supported, and specify file-option validation for non-root moves. Include acceptance for a file-only move, a true no-op, and a conflicting file/parent request.

## 6. MINOR · Hat 2 · CLASS: new — Rename preservation does not account for an implicit title

**Place:** US-3 acceptance; SC-003.

**Why:** US-3 requires the same element properties after rename. Existing reads use the element name when no own or kind-default title exists (`src/query/query.ts:197`), consistent with the official model documentation. Renaming such an element naturally changes its computed title even when its declaration's properties are untouched. The spec does not distinguish authored properties from derived properties here. A literal acceptance test would demand preserving an old title, while the stated rename operation changes only the identifier and references.

**Proposal:** Define whether name-derived titles follow the new identifier or are preserved, and qualify the same-properties assertion accordingly. Include the title-less case and the kind-default-title case in rename acceptance.

## Scope and regression observations

The specification consciously defers deployment/view rename, element-kind changes, specific extend-block deletion and specification-style writes. Existing view/deployment placement already has a file-choice contract (`src/mutator/block-placement.ts`), so these are not additional unserved creating operations merely because US-5 focuses on new model/specification writes. Existing relationship-selector semantics and extend identities are grounded in separate contracts; the spec deliberately inherits raw-title matching from model `updateRelationship`, rather than deployment relationships' effective-title selection.

No implementation mechanism is proposed by this report. The concrete failures above concern observable outcomes and unresolved product requirements.

## [USER-DECISION]

No owner-only decision is requested: the task explicitly authorizes the lead to make and record product decisions. Findings 2–4 require those decisions before planning; this report does not choose an alternative on the lead's behalf.

FRICTION: The spec simultaneously says unresolved references are untouched (INV-3), defines surviving references to exclude rewritten references, and says that a rename making a previously unresolved reference resolve is rejected by the stability check (Edge cases). These statements do not define one consistent acceptance boundary. The report uses US-3's explicit preservation promise for the scenarios above; that promise needs to remain testable for rewritten references too.

VERDICT: NOT-READY

Must fix:
1. Add an explicit rank-target reference policy and acceptance coverage (#1).
2. Resolve computed-view preservation versus hierarchy-sensitive selector semantics on move (#2).
3. Decide kind-rename behaviour for overlapping element/deployment kind names (#3).
4. Decide relative-resource preservation on cross-file moves (#4).
5. Reconcile same-parent rejection with file-only movement and file-option validation (#5).
6. Define the title-fallback exception or preservation rule for rename (#6).
