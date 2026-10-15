# Specification review: lc4m-15.29, round 2

Reviewed the complete specification, the round-1 review, task description and acceptance criteria, decision comments D21–D37, the preceding deployment specification (including D4/D11/D18), README, CLAUDE.md testing rules, RECON and recorded spike outputs 00–06. Checked the installed LikeC4 1.59.4 parser and grammar, current addView writer and code generator, apply dispatch and validation, reference snapshots, and existing library/CLI view-includes tests. No source files or tracker records were changed.

## Findings

### 1. MAJOR · Hat 1 — Backward steps and explicit kinds have an undefined combination

**CLASS:** consequence of fix spec-r1-codex.md#4

**Location:** US-9, US-10, D36, SC-005.

**Why:** US-9 accepts a direction and an optional relationship kind, promising the same source, target and direction on readback. US-10 allows patching direction or kind independently. D36 now explicitly requires a backward single step to be written as `target <- source`. However, the installed `Step` grammar makes `<-`, `.kind` and `-[kind]->` mutually exclusive alternatives; `CustomRelationProperties` has no kind property (spike 00). Thus adding a backward step with a declared kind, setting a kind on an existing backward step, or changing an existing kind-bearing forward step to backward has no specified outcome that preserves the requested fields. Silently dropping the kind or changing direction loses user intent; writing an invented connector introduces a parse error. A returning chain segment can already have both a kind and LikeC4's inferred backward flag, so the restriction must distinguish single-step writes from D31's allowed chain property edits.

**Evidence:** Installed `module.mjs:6648–6660` swaps endpoints for the literal backward form. A disposable probe confirmed the valid backward step's parsed source/target and confirmed that a reverse kind connector and a `kind` body property are rejected by the installed parser. The lead confirmed via the run mailbox: no existing decision covers this combination; report it for amendment after the round.

**Proposed requirement:** Explicitly reject an add or update whose resulting single step requires both backward direction and an explicit kind, naming the incompatible field and preserving sources. An update may succeed when its patch also removes the conflicting kind or changes direction to a compatible value. Preserve the existing D31 allowance for kind edits on returning chain segments. Carry this rule into apply, rejection acceptance and documentation. This is an observable contract requirement, not a representation proposal.

### 2. MINOR · Hat 2 — Written tag order contradicts parsed-layer equality

**CLASS:** new

**Location:** US-1 own values, INV-4, D21, SC-002.

**Why:** US-1 promises tags unique in written order while also claiming those own values equal LikeC4's per-document parsed view. INV-4's updated exception list does not exempt tag ordering. Installed `parseTags` (`module.mjs:5248`) visits comma-linked groups from the last group backwards. A fresh probe of `view v { #next, #deprecated include * }` produced parsed tags `["deprecated","next"]`, with no diagnostics. The recorded spike 05 E2 already shows the same order. A source-order implementation and an oracle-order implementation therefore cannot both satisfy the current acceptance text.

**Proposed requirement:** Consistent with D21, define view tags in LikeC4's parsed order and correct US-1's written-order claim. Include a comma-separated multi-group example in SC-002. If source order is intentionally retained instead, record it explicitly as an oracle exception and document that choice; do not leave both equality claims in force.

### 3. MINOR · Hat 2 — Removal acceptance still compares computed identities without the generated-view exception

**CLASS:** incomplete closure spec-r1-codex.md#1

**Location:** SC-004's final clause, relative to US-8 and INV-9.

**Why:** INV-9 now correctly limits preservation to surviving named declarations and excludes generated/unnamed views. SC-004 still says that after removeView “exactly the removed view is gone” in the computed-model comparison. Removing the unreferenced declaration `view index { include app.api }` is allowed by US-8, but LikeC4 synthesizes another computed `index`. A fresh probe confirmed declared ids change from `["index"]` to `[]` while computed ids remain `["index"]` and diagnostics stay empty. Unnamed ids can also change after an earlier declaration is removed. Consequently a literal computed-id difference check contradicts the new invariant's exceptions and could reject a legitimate removal.

**Proposed requirement:** State SC-004's removal check in terms of the removed declaration and surviving named declarations, with the same generated/unnamed exceptions as INV-9. Require a declared-index removal example that permits the synthesized index to appear, without requiring a computed-id set difference of exactly one.

## Round-1 closure and consistency audit

- Must-fix 1: INV-9 is corrected; SC-004 retains the narrow inconsistency in finding 3.
- Must-fix 2: US-5 explicitly inherits every US-7 include check for library and apply, using the destination scope and file. D35, INV-7, integration/API summaries, SC-005/006 and documentation obligations reflect the compatibility change. Closed.
- Must-fix 3: US-11/D37 define pre-move boundaries, appending, same-boundary no-ops, source-before-destination and destinations inside the moved statement; SC-004 explicitly requires D37 examples. Closed.
- Must-fix 4: US-4/9/10, D36, edge cases and clarifications consistently select LikeC4 endpoint meanings and preserve written arrows separately. The original endpoint ambiguity is closed; finding 1 is a consequence of the newly explicit writing contract.
- Must-fix 5: US-1/5, INV-4 and edge cases consistently distinguish bodyless declarations and reject them as extends parents; block-level styles are explicitly removed from oracle comparison. SC-002 accounts for these cases. Closed. Finding 2 is an independently verified ordering contradiction, not a reopening of that source-level-exception finding.

## Scope, regression and call-path audit

- Read surfaces cover element, dynamic and deployment views, named/unnamed/bodyless declarations, multiple files/blocks, source predicates, rule order, chains, parallel blocks and opaque flow positions.
- Write paths cover addView and apply addView, properties, rule add/replace/remove, step add/update/move/remove, par creation/removal and view removal. The backward/kind combinations in finding 1 affect add and partial-update paths, including apply.
- Folder mutation, block-level styles, stage-6 rule contents, flow interiors, rename/type/of/extends changes, generated views and snapshots are explicitly deferred. Task coverage rows map to these included surfaces and explicit deferrals; no additional sibling surface requires silently expanding scope.
- US-8's reference rejection includes navigation in any with block and model/deployment relationships, steps and extends across loaded files. INV-8 covers surviving rule/step/navigation/of/extends references. Existing snapshot coverage is narrower and must be extended under the stated new contract; this is already a planning obligation, not an additional specification finding.
- Existing logical/deployment operations remain under INV-7 and the preceding stage's explicit reference-policy limits. Current addView/include defaults and leading-keyword handling remain protected by compatibility requirements except for the explicitly listed new rejections.
- No additional [FOR-PLAN] mechanism finding is raised. No implementation design is proposed.

## Verification limits

Focused probes were created and run only in `/tmp/zsa/zdox-lc4m-15.29/scratch-critic-spec-r2/`, using the recorded spike helper and installed language services. Inspected actual per-document `c4Views`, diagnostics and computed view ids. No full repository test run was necessary for this read-only specification review. Both required MCP calls succeeded; Context7 was additionally queried for backward-step syntax. Version-specific findings rely on installed 1.59.4 code and actual probe output, rather than current documentation assumptions.

## [USER-DECISION]

None pending from the product owner. The lead confirmed that finding 1 should be recorded for a contract amendment after this round; its proposed requirement remains subject to the lead's decision.

## Must-fix

1. Define the backward-direction/explicit-kind compatibility rule for single-step adds and updates, including apply and chain exceptions (finding 1).
2. Reconcile view tag ordering with parsed-layer equality and its acceptance examples (finding 2).
3. Propagate generated/unnamed identity exceptions into SC-004's removal criterion (finding 3).

## FRICTION

- The backward-plus-kind contract was not inferable from existing decisions. Asked the lead with the required run prefix and timeout; the lead confirmed the gap and requested a finding.
- The first computed-id probe serialized a lazy mapped view collection as `{}`. Corrected the probe to materialize the collection and reran it; only the resulting explicit id arrays support finding 3.

VERDICT: NOT-READY
