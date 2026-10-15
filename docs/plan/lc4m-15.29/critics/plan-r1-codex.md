# Implementation plan review — round 1

Task: lc4m-15.29  
Reviewed: `docs/plan/lc4m-15.29/plan.md`  
Requirements: `spec.md`, including its Changelog and FOR-PLAN backlog; decision comments D21–D42, including the D40 refinement.

## Findings

### 1. MAJOR — T007 cannot meet its gate before T008 and T009

**CLASS:** `new`  
**Location:** `plan.md:205–230`, especially the T007 gate at line 212; build order at line 402.

T007 introduces `listViews` / `getView` and requires every declared view in both T001 fixtures to equal the parsed-view oracle field by field through `expectViewsAgreeWithLikeC4`. Its public `ViewInfo` contract includes `rules` and `steps` (T003). Both fixtures deliberately contain predicates and dynamic steps. However, the rule/predicate builder belongs to T008 and the step builder belongs to T009, and the declared dependency order is T007 → T008 → T009.

This is an acceptance condition supplied by later tasks. T004's AST index and T005's resolver do not supply the missing public rule and step representations. The present helper also supplies neither: `tests/helpers/likec4-model.ts:197–198` exposes only computed title and folder, so there is no existing complete builder to reuse. Returning empty lists or suppressing those oracle assertions would leave the published T007 API incomplete and would weaken its stated gate.

**Proposal:** build and verify the internal rule and step readers before the task that publishes the complete `ViewInfo` API. Give each internal reader task a gate limited to the class it implements, then publish `listViews` / `getView`, their documentation and the full-view comparison together. Alternatively, combine the complete read builder and its public contract into one explicitly atomic task. Update the task dependencies and group order accordingly. The full field-by-field requirement must remain enforced when the public read API lands.

### 2. MAJOR — The shared rule checker omits semantic checks for properties inside `with`

**CLASS:** `new`  
**Location:** `plan.md:101` (the complete `checkViewRule` algorithm), T005 at lines 182–188, T010 at lines 233–237, and its consumers T015/T018.

The enumerated checker parses one rule, rejects structural D34 forms, resolves references through `ViewReferenceResolver`, then checks declared kinds and tags. T005 defines resolution for elements, deployments, views, tags and kinds; it does not cover custom colors or property semantics. Neither task assigns validation of `with` style values. By contrast, T019 explicitly assigns `checkStyle('relationship')` for step writes.

The gap is observable on the installed LikeC4 1.59.4. The temporary check at `/tmp/zsa/zdox-lc4m-15.29/scratch-critic-plan-r1/rule-style.mts` calls the existing `isSingleIncludeRule` and LikeC4's linked/validated workspace builder on the same expressions:

| Expression | One include rule parses | LikeC4 diagnostic |
|---|---|---|
| `app.api with { color absentColor }` | `true` | `Could not resolve reference to CustomColor named 'absentColor'.` |
| `app.api with { icon file:///tmp/icon.svg }` | `true` | `Icon URI must not start with file://` |

The element reference resolves in both cases, and neither expression contains a D34 structural form or an undeclared kind/tag. Following the listed algorithm therefore has no check that rejects these inputs. A parse-only post-edit check and a reference-stability snapshot do not detect the icon restriction. Accepted output would violate INV-1 through `addView`, `addViewRule` and `replaceViewRule`, including their `apply` forms.

Existing reusable validation is already present: `src/mutator/write-checks.ts:266–293` checks custom-color declarations, library icons, forbidden icon URIs and opacity; `checkStyle` begins at line 302. No new dependency or runtime linker is required.

**Proposal:** make semantic validation of every property in a parsed `with` body an explicit responsibility of T010, reusing the existing parsed-style checks for the appropriate element/relation property class. Include custom-color resolution and icon restrictions, with `InvalidWriteError` mapped to the rule expression field. Add class-level acceptance for invalid property values and valid declared values through all shared rule-writing entry points, including `addView` includes and `apply`, with byte-identical rejection and LikeC4 validation of accepted output. Preserve the raw expression text; validation need not regenerate it.

## Other review results

- The traceability table assigns US-1–US-12, INV-1–INV-9, SC-001–SC-008, D21–D42 and all nine FOR-PLAN entries. No FR requirement is declared in the specification. The findings above concern whether the assigned mechanisms and gates actually satisfy those mappings.
- One stream is appropriate for this repository. G7's solo task has a concrete exhaustiveness/atomic-commit rationale. The written dependency graph is acyclic; finding 1 concerns its semantic feasibility.
- The general seams are grounded in current code: block placement in `deployment-ops.ts:242–286`, body insertion in `body-layout.ts`, the include probe in `parser/grammar.ts:106–128`, and reference snapshots in `reference-snapshot.ts:115–292`. The opt-in reference extension respects the existing-operation constraint of INV-7.
- The oracle entry point is real: LikeC4's `ViewsParser` populates per-document views before inheritance resolution. The installed parser also confirms the stated bodyless-view and non-contributing flow-block behavior. D40's refined rejection and literal-empty auto-removal are carried through the plan.
- Public-method tasks carry documentation in the same commit, with T023 consolidating it later. The plan introduces no dependency, source-grep test, snapshot test or mutation-testing tool.
- Context7 was queried for LikeC4 dynamic-view/parallel syntax. Its current examples include chain syntax that differs from the installed grammar, so version-specific conclusions above use the installed 1.59.4 code and executed checks. Reference: [LikeC4 dynamic-view documentation](https://github.com/likec4/likec4/blob/main/apps/docs/src/content/docs/dsl/Views/dynamic.mdx).
- Verification was limited to reading and temporary in-memory probes. The implementation does not exist yet; a full project test run was not performed. No repository source file or tracker record was changed.

## Friction

The launch prompt assigns two different mandatory first actions: real MCP probes and the startup mail command. I sent the explicitly prescribed startup mail first, then made real `skein_whoami` and Context7 `resolve-library-id` calls before reviewing task artifacts. Both succeeded. A single prescribed startup sequence would remove this conflict.

## Verdict: NOT-READY

Must-fix:

1. Make the complete read-API publication task depend on implemented rule and step readers, with gates achievable in each atomic commit (finding 1).
2. Assign semantic `with` property validation to the shared rule checker and gate the entire affected write class, including `addView` and `apply` (finding 2).
