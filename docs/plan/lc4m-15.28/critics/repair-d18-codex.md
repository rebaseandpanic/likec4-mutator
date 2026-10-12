# Targeted re-critique: D18 repair

Scope: commit `41730a5`, C1/C2 only. Reviewed `spec.md`, `tests.md`, `plan.md`, the triggering report, and installed `@likec4/language-server` 1.59.4 source. No tests or builds run. No tracker writes. Other decisions are not reopened.

## Assessment

D18 is a coherent product choice for a write-oriented style shape. INV-4 and SC-002 now explicitly permit raw opacity and icon values. D10 remains a separate exception: disabling icon-derived technology does not disable URL resolution. Per-field style inheritance in US-1–US-4 and MERGE semantics in US-6/US-7/US-9/US-10 can operate on raw values without changing their precedence rules.

The repair is incomplete in its downstream oracle and documentation requirements. In particular, a raw icon value is not a portable computed image location, and an unchanged string does not guarantee an unchanged rendered icon after materializing inherited style into another file.

## Findings

### 1. MAJOR — The style oracle still requires the computed values D18 excludes

**Place:** `plan.md:60`, `plan.md:135–138` (T002); `tests.md:22` (Wv), rows 10, 13, 17, 19, 24.

**Why:** T002 still says there are only two documented exceptions and compares style to the data layer with numeric opacity converted to `'N%'`. Row 17 says all style fields are compared with `$data`. These rules cannot establish D18 for relative/root-relative icons or image aliases: LikeC4 `parseIconProperty` (`module.mjs:5276–5301`) resolves them, and `parseImageAlias` (`:5303–5317`) uses project configuration, including the default `@` alias. Disabling technology inference does not change either branch. Also, numeric conversion cannot prove that opacity retains its written spelling: `parseAstOpacityProperty` (`:68–69`) delegates to `parseFloat` and clamping (`:61–67`), which loses lexical information.

**Proposal:** Explicitly encode D18 in T002 and Wv and qualify the affected rows. Compare nonexception fields with LikeC4; assert raw opacity/icon expectations independently from fixture source literals, including inherited values and body-icon precedence. Add discriminators that show raw versus computed results for a relative path, a root-relative path, the default image alias, and a noncanonical accepted percentage spelling. Assert the LikeC4 side first, then the library's raw value. Preserve those checks after writes rather than skipping entire style objects. Update the Changelog claim that the oracle convention is unchanged: the opacity conversion alone does not cover D18.

### 2. MAJOR — D18's round-trip rationale omits context-dependent icon behaviour

**Place:** `spec.md:116` (D18 rationale); US-6/US-7/US-9/US-10 style writes; `spec.md:193` (SC-006); `plan.md:404` (T043).

**Why:** LikeC4 resolves a relative icon using the URI of the document containing the icon property (`module.mjs:5296`). Therefore a kind or logical element in `kinds/base.c4` with `icon './icon.svg'`, inherited by a node/instance in `deployment.c4`, can have a different computed icon after the caller writes the returned effective style into that node/instance unchanged. This follows directly from the inspected resolution and write-placement rules; it is not a claimed runtime test result. The returned icon is also unsuitable as a resolved image URL for a third-party renderer without external context. D18 states that paths are raw, but its unqualified “a read value can be written back unchanged” rationale can be read as semantic round-trip safety. SC-006 and the actual T043 body still mandate only D2/D10 documentation, despite the Changelog promising D18 documentation.

**Proposal:** Keep the raw-value decision, but explicitly distinguish value round-trip from computed/rendered equivalence. Require public documentation that relative paths remain relative to the contributing declaration and may resolve differently when copied into another document, while aliases/root paths require the consumer's project configuration. Qualify write-back availability by existing style validation: raw values recovered from invalid input are not guaranteed accepted writes. Add D18 to SC-006 and the T043 body, with a cross-file inherited-relative-icon example and read-back test that observes both the unchanged raw string and the context-dependent LikeC4 URL. No URL-resolving API is required by this proposal.

### 3. MINOR — Scenario exception wording is stale

**Place:** `spec.md:48` (US-3), `plan.md:60`, `plan.md:135`; spec introductory decision range at line 6.

**Why:** US-3 explicitly lists “Exceptions (D2, D10)” and says “Both documented”, even though D18 applies to inherited element/instance style too. The global INV-4 resolves the intended contract, so this is not an independent architectural contradiction, but these local statements encourage consumers and implementers to overlook the third exception. The plan's “Equals LikeC4's data layer” explanation likewise omits it.

**Proposal:** Add D18 to US-3's exception wording, explicitly reference D18 for style in US-1–US-4, qualify the plan equality statements, and extend the decision identifier range to include D18. References already citing INV-4/SC-002 need no wholesale rewrite.

## FRICTION

- No MCP blocker: actual Skein identity and Context7 library-resolution calls succeeded.
- No tests run, as instructed. Runtime behaviour examples above are identified as consequences of inspected source, not observed execution.
- Raw opacity/icon reads are acceptable as an explicit public contract; this critique does not demand reversing D18, enabling project-settings loading, or changing existing logical reads.
- The principal remaining friction is contradictory oracle guidance and missing consumer-facing context semantics, rather than the choice of raw representation itself.

## Verdict: NOT-READY

Numbered must-fix:

1. Align T002, Wv and the style comparison rows with D18, with independent raw/computed discriminators for opacity and icon paths/aliases.
2. State the limits of unchanged-value write-back for inherited relative icons, and make D18 documentation mandatory in SC-006/T043.

Finding 3 is a minor consistency correction that can be folded into those edits.
