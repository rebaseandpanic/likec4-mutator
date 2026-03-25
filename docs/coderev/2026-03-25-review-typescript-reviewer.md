# TypeScript Reviewer Report — 2026-03-25

**Operation:** review
**Scope:** changed
**Project:** /workspaces/likec4-mutator
**Stack:** TypeScript
**Files analyzed:** 7

---

## Critical

(none)

---

## Warning

### src/mutator/element-ops.ts:232-274
**Issue:** `findClosingBrace` skips single-quoted strings but does not skip double-quoted strings or `//` line comments. The LikeC4 DSL primarily uses single-quoted strings, but if a double-quoted string or a comment contains `{` or `}`, the brace counter will be thrown off. The same gap exists in `checkBraceBalance` at `src/mutator/mutator.ts:402-438`.
**Fix:** Add handling for `"` (double-quoted string skip) and `//` (skip to end of line) in both brace-scanning loops, or document explicitly that these are unsupported and add a guard.

### src/mutator/element-ops.ts:313,346,397,481,517,585,621,647
**Issue:** Heavy use of `any` types for AST node parameters across all private helper functions (`buildTitleEdit`, `buildBodyPropEdit`, `buildReplaceLinksEdit`, `buildReplaceStyleEdit`, `buildReplaceMetadataEdit`, `buildInsertTagsAfterOpeningBrace`, `buildInsertBodySnippet`, `collectLeaves`). This bypasses TypeScript's type system entirely, making it easy to silently access wrong property names (e.g., `node.body?.props` vs `node.body?.elements`). The `any` is likely there because the Langium AST types are complex, but typed alternatives (such as importing the generated types from `@likec4/language-server` or defining a local structural interface) would catch regressions at compile time.
**Fix:** Define a minimal structural interface (e.g., `interface ElementAstNode { $cstNode?: CstNode; body?: { $cstNode?: CstNode; props?: any[] }; kind?: { $refText?: string } }`) and use it instead of `any`. At minimum, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments to acknowledge the debt.

### src/mutator/element-ops.ts:543-551
**Issue:** In `buildReplaceMetadataEdit`, parsing existing metadata key/value pairs uses a fragile chain: `mp.key ?? mp.name` and `mp.value?.text ?? mp.value?.value ?? mp.value`. If the Langium AST shape changes across `@likec4/language-server` versions, this will silently produce `undefined` and discard existing metadata entries without warning, leading to data loss during update.
**Fix:** Add a defensive check that logs or throws when a metadata attribute has a key but the value extraction produces `undefined`, instead of silently skipping.

### src/mutator/mutator.ts:374-389
**Issue:** `applyEditsToFile` performs rollback by throwing on parse errors, which is correct, but it does not check brace balance on the post-edit text. A structurally damaged edit that the parser happens to accept (the exact scenario `checkBraceBalance` was added to `validate()` for) would be silently committed. The brace check only runs in `validate()`, so a mutation that introduces silent structural damage will not be caught until `validate()` is explicitly called.
**Fix:** Run `checkBraceBalance` inside `applyEditsToFile` as well (after the parse-error check), or extract it to a shared utility and call it in both places.

### src/mutator/element-ops.ts:249-261
**Issue:** In `findClosingBrace`, the escape handling inside single-quoted strings (`i += 2`) does not bounds-check against `endExclusive`. If a string literal ends with `\'` at the very boundary of the scan range, `i` could overshoot `endExclusive`, reading past the intended range (though still within the string, so no crash — just incorrect scanning).
**Fix:** Change `i += 2` to `i = Math.min(i + 2, endExclusive)` or add a bounds check after the increment.

---

## Info

### src/mutator/text-edit.ts:31-32
**Issue:** The stable-sort implementation annotates edits with `_idx` by spreading into a new object. This creates a new object per edit on every call. For the typical workload (1-5 edits) this is negligible, but worth noting the allocation pattern.
**Fix:** No change needed for current usage. If performance becomes critical at scale, use an index array instead of object copies.

### src/mutator/element-ops.ts:354
**Issue:** `node.body?.props?.find((p: any) => p.key === key)` — the `.find()` callback uses strict equality on `p.key`, but the `key` parameter is typed as a union of literal strings. If the AST ever represents the property key differently (e.g., as an enum or a capitalized string), this match will silently fail and the function will fall through to the "insert new" path, duplicating the property.
**Fix:** Consider a case-insensitive match or adding a debug assertion when `existingProp` is null but the body block actually contains a node whose `$type` matches the expected property type.

### tests/mutator/text-edit.test.ts
**Issue:** No test covers overlapping edits (which the doc comment says "must not overlap"). If overlapping edits are passed, `applyEdits` will silently produce corrupted output. A test asserting that overlapping edits throw (or at least documenting the undefined behavior) would improve robustness.
**Fix:** Add a test case with overlapping edits that either asserts an error is thrown or documents the expected behavior.

### tests/mutator/element-ops.test.ts:446-566
**Issue:** The "replace existing blocks" test suite for metadata, links, and style tests replacement of single existing blocks, but does not test the edge case where an element has multiple metadata or style blocks (malformed input). If someone manually edits a `.c4` file and introduces duplicate blocks, the code would only replace the first one found by `.find()`, leaving the second intact.
**Fix:** Add a test with duplicate blocks to document the behavior (or add code to handle/warn about duplicates).

### tests/integration/mutation-scenarios.test.ts:529-569
**Issue:** The `validate() structural checks` test crafts a broken source with `{ // extra unclosed brace` — the test passes because either the parser or the brace check catches it, but the assertion `errors.length > 0` is loose. It would be more robust to assert on the specific error message containing "brace" or "imbalance" to ensure the right check is triggered.
**Fix:** Tighten the assertion: `expect(errors.some(e => e.includes('Brace imbalance') || e.includes('brace'))).toBe(true)`.

---

**Summary:** 0 critical, 5 warning, 5 info
