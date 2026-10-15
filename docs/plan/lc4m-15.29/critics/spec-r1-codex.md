# Specification review: lc4m-15.29, round 1

Reviewed the complete specification, task description and acceptance criteria, decision comments D21–D34, the preceding specification, README, the testing section of CLAUDE.md, RECON and spike outputs 00–06. Grounded the review in the current view writer, CLI apply path, reference snapshot, existing view tests and installed language-server parser. No tracked source was changed and no tracker writes were made.

## Findings

### 1. MAJOR · Hat 1 · Class: new — Preservation invariant forbids intentional view removal

**Location:** INV-9, US-8, SC-004.

**Why:** INV-9 says every previously computed view remains computed after every accepted write. Removing an unreferenced, explicitly declared view necessarily violates that requirement. SC-004 also imposes preservation after rule and step writes without distinguishing declared views from generated views. For example, adding a declared `index` can replace the synthesized `index`, and unnamed view ids depend on AST positions (D28). The current wording does not distinguish preservation of a surviving declaration from preservation of a computed id.

**Proposed requirement:** State preservation in terms of surviving declared views, explicitly exempt the view intentionally removed, and define how generated views and unnamed views whose generated identities shift are treated. Retain the prohibition on silently losing surviving declared views through invalid inheritance. Include a successful removal acceptance example consistent with this invariant.

### 2. MAJOR · Hat 1 · Class: new — addView's inherited validation contradicts the new validity guarantee

**Location:** US-5 rejection list, US-7, INV-1, INV-7, API/event surface, SC-006.

**Why:** US-7 requires semantic validation of every reference in a newly written rule, but US-5 merely inherits today's addView rejections plus D34 and inheritance restrictions. INV-7 explicitly limits behaviour changes to those listed restrictions and placement. Today's `addView` checks rule syntax, not references within includes (`src/mutator/mutator.ts:923–944`; `src/mutator/write-checks.ts:190`). A scratch probe confirmed that `addView` with `includes: ['missing']` accepts and writes `include missing`. The same unchecked path is used by CLI apply (`src/cli.ts:515`). Consequently preserving current behaviour conflicts with INV-1 and the task's rejection requirements. This is a missed sibling mutation path, not a request to change D25.

**Proposed requirement:** Explicitly apply the new rule semantic/reference checks to includes written through addView and apply addView, including their actual destination file and inherited view scope. List these additional rejections as compatibility changes, and include both entry paths in acceptance and regression exceptions. Cover unresolved elements/navigation, undeclared kinds/tags and deployment/model restrictions, rather than only D34's silent-drop cases.

### 3. MAJOR · Hat 2 · Class: new — Move destinations have no observable indexing contract

**Location:** US-9, US-11, D24.

**Why:** In a view whose top-level statements are `[A, B, C]`, moving `[0]` to `[2]` can mean insertion before original C (`[B, A, C]`) or insertion at index 2 after source removal (`[B, C, A]`). Moving an earlier top-level statement into a later par also changes the par's path. The specification defines insertion addresses but never states which state supplies a move destination. Both results can validate while changing interaction order differently. The lead confirmed through the run mailbox that no existing decision fixes this and asked that it be reported.

**Proposed requirement:** Resolve both source and destination against the pre-move state, with destination identifying the original insertion boundary; define appending explicitly, including at top level. Specify same-position moves, destinations inside the moved statement, and source-before-destination moves within one par and across top-level/par boundaries. Acceptance examples must fix the resulting sequence. This specifies behaviour only, not a mechanism.

### 4. MAJOR · Hat 2 · Class: new — Backward-step endpoint meanings are ambiguous across reads and writes

**Location:** US-4, US-9, US-10, INV-4.

**Why:** US-4 asks for source and target as written and resolved, and also equivalence to LikeC4's parsed step. These differ for a backward step. Verified with installed 1.59.4: `app.web <- app.api` parses to source `app.api`, target `app.web`, `isBackward: true` (`module.mjs:6648–6660`). US-9 accepts source, target and direction without stating whether endpoints mean written positions or semantic arrow endpoints. A consumer reading a backward step and reusing its fields to add another can therefore reverse the interaction while every individual value remains valid. Returning chain segments have an additional implicit backward flag, so direction alone cannot disambiguate the two endpoint conventions.

**Proposed requirement:** Define written endpoint positions and semantic endpoints separately, or unambiguously choose the endpoint convention used by write inputs and their corresponding read fields. State the read-to-write round-trip outcome for `a <- b` and a returning chain segment. Qualify INV-4 where source-level fields deliberately differ from parsed fields.

### 5. MINOR · Hat 2 · Class: new — Parsed-view equivalence lacks required source-level exceptions

**Location:** US-1, US-2, INV-4, SC-002.

**Why:** The spec deliberately excludes block-level styles from a view's own rules and reads bodyless declarations. Its oracle equality exceptions do not account for either. Installed 1.59.4 prepends block-level styles to the per-document parsed element/dynamic rule lists (`module.mjs:6390–6455`, spike 02). It also omits a bodyless `view v` from per-document parsed views (`parseElementView` requires a body). Scratch probes verified both: a block-level `style * { color red }` appears before the body's include in `c4Views`, while `view v` produces no `c4Views` entry, with no diagnostics. Thus SC-002 cannot compare these cases field-for-field as currently required. D21 and D28 remain valid product choices; the equality claim needs boundaries.

**Proposed requirement:** Add explicit oracle exceptions for source-only bodyless declarations and rules contributed by the enclosing views block. State how these examples satisfy SC-002 without inventing a parsed view or exposing inherited/block-level rules as own rules.

## Scope and regression audit

- Checked all three declared view types, named/unnamed/bodyless declarations, multiple blocks and files, rule and step mutations, existing addView and apply addView, property updates and removal.
- Stage-6 rule bodies, flow interiors, folder mutation, rename/type/of/extends changes and snapshots are explicitly deferred; that deferral is consistent with the decisions. Block-level styles need the oracle exception in finding 5, not expanded write scope.
- Reference stability currently covers logical/deployment references and deployment-view rules, but not the complete new view-reference surface (`src/query/reference-snapshot.ts`). The specification explicitly requires extending it. No separate specification finding is raised about that planned mechanism. Removal must still inspect navigation within opaque groups/flow blocks and all loaded files under US-8's existing “any” wording.
- Existing logical addElement/removeElement view-reference policy is explicitly retained by INV-7 and the preceding stage's policy; it is not silently promoted to this feature's new-write guarantee.
- Coverage categories in the task are represented by the read/write scenarios and the explicit stage-6 deferrals. A specific missing write path is identified in finding 2.
- No implementation proposal or [FOR-PLAN] mechanism finding is required for these findings.

## Verification limits

Only focused, disposable probes were run from the authorized scratch directory; no repository test suite was run for this read-only specification review. The probes inspected actual per-document `c4Views` and computed view ids using the existing spike helper. Context7 was queried successfully; its returned current documentation disagrees internally about nested parallel blocks, so installed 1.59.4 code and recorded spikes determine version-specific conclusions here.

## FRICTION

- The move destination contract was absent rather than inferable from D24. A mailbox question was sent with the required run prefix and timeout; the lead confirmed no prior decision exists and requested a finding.
- Context7 returned both claims that parallel blocks can nest and that nesting is forbidden. The installed-version validation evidence was used; no new nesting rule was inferred from current documentation.

## [USER-DECISION]

None escalated to the product owner. Finding 3 proposes an observable requirement for the lead to adopt or amend; the lead has already authorized recording that missing contract for amendment after this round.

## Must-fix

1. Reconcile INV-9 and preservation acceptance with intentional removal and generated identities (finding 1).
2. Cover addView/includes and apply addView with the semantic rule checks and document the compatibility change (finding 2).
3. Define move destination indexing and boundary cases (finding 3).
4. Define backward endpoint conventions and round-trip behaviour (finding 4).
5. Correct the parsed-layer oracle equivalence exceptions (finding 5).

VERDICT: NOT-READY
