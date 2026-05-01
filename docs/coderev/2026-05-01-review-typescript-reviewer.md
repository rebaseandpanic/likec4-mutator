# TypeScript Reviewer Report — 2026-05-01

**Operation:** review
**Scope:** changed (20 files)
**Project:** /workspaces/likec4-mutator
**Stack:** TypeScript (library, vitest tests)
**Files analyzed:** 20

---

## Critical

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:282
**Issue:** `buildTitleEdit` locates the `kind` leaf by `leaves.findIndex((l) => l.text === kindText)`. `collectLeaves` walks **all** leaf tokens of the element, including the local name token and the title string literal. If `name === kindText` (e.g. element written `service = service` for any reason — admittedly unusual but legal in the Langium grammar), `findIndex` will match the **name** token first, then the search "for the next quoted string after the kind token" will start at the wrong index. More plausibly, when the element has no inline title and a sibling property leaf happens to match `kindText` (e.g. `service` appearing inside a `description` value would not be a leaf, so this is tighter than it looks — but the assumption "the first leaf with text equal to the kind reference is the kind keyword" is undocumented and fragile when the kind name is something common).
**Fix:** Use the `node.kind?.$cstNode` offset directly — Langium attaches CST nodes to cross-reference fields. Replace the `findIndex` scan with `kindCst.end` as the post-kind offset, e.g.:
```ts
const kindCst = (node.kind as { $cstNode?: { offset: number; end: number } } | undefined)?.$cstNode;
if (!kindCst) return null;
const kindEnd = kindCst.end;
```
Then iterate `leaves` filtering by `leaf.offset >= kindEnd` to find the title literal. This eliminates ambiguity entirely and removes the `findIndex` heuristic.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:380
**Issue:** The arrow-leaf detection regex `/^-+>$|^-\.|^\.->$/` is structurally broken:
- `^-\.` matches any token **starting with** `-.` — there is no end anchor, so a leaf token that just happens to begin with `-.` (none in stock LikeC4, but the regex is a sloppy tool) is accepted.
- The alternative `^\.->$` matches only the literal `.->` which is not a real LikeC4 arrow — relationship-kind syntax in LikeC4 is `-.kind.->` (compound), and individual leaves of that compound form will not be `\.->`.
- The fallback `|| l.text === '->'` is in fact what does all the work in practice; the regex contributes nothing reliable.

If the parser ever emits a kinded relation as multiple leaves (`-`, `.`, kindRef, `.`, `->`), `arrowIdx` may point to the wrong leaf or `-1`, making `buildLabelEdit` silently return `null` (and the patch field is silently dropped — there is no caller-level error).
**Fix:** Either (a) iterate from the end of the relation CST and locate the last leaf that starts with `'` or `"` between `r.target.$cstNode.end` and the body opening brace — same approach as the kind-CST anchor recommended for `buildTitleEdit`; or (b) anchor from `rel.target.$cstNode?.end` rather than the arrow leaf at all. `r.target` is an Astro reference for which Langium attaches `$cstNode`, so `target.$cstNode.end` is the precise insert point. The current implementation has no test coverage for kinded relations (`a -.calls.-> b`), so the bug is currently latent.

### /workspaces/likec4-mutator/src/mutator/mutator.ts:298
**Issue:** `countFileMatches` is duplicate logic that re-implements `matchRelations` (in `relationship-ops.ts`) and re-implements `collectAllRelations` (in `cst-helpers.ts`) inline using `any[]`. The two implementations can drift; in particular `countFileMatches` does not normalize parentFqn the same way (here it passes `''`, but `matchRelations` uses `parentFqn` from the walker correctly via `collectAllRelations`). For a relation written inside `app { api -> db }`, this `walk('')` invocation passes `parentFqn: ''` to the helper, then **descends** into element bodies and sets `parentFqn = item.name` correctly — so this **does** work today, but it's only a coincidence that the duplicated logic agrees with the canonical version.
**Fix:** Replace `countFileMatches` body with a call to a small exported helper that wraps `matchRelations`, e.g.:
```ts
import { matchRelationsForFile } from './relationship-ops.js';
function countFileMatches(doc: ParsedDocument, m: UpdateRelationshipMatcher): number {
  return matchRelationsForFile(doc.ast, m).length;
}
```
and export `matchRelations` (renamed to make it public) from `relationship-ops.ts`. That keeps a single source of truth for the matcher predicate.

---

## Warning

### /workspaces/likec4-mutator/src/mutator/mutator.ts:495
**Issue:** Inner `walk` function uses `elements: any[]`. Same shape is already declared as `BodyOwnerNode` and `collectAllRelations` exists in `cst-helpers.ts` exactly for this. Untyped `any[]` defeats the type-safety invariant the rest of the module establishes.
**Fix:** Replace with a call to `collectAllRelations(doc.ast)` followed by the same predicate as `matchRelations`. See the Critical note above — this disappears once `countFileMatches` is consolidated.

### /workspaces/likec4-mutator/src/mutator/mutator.ts:308
**Issue:** Comment says "unreachable" after `updateRelationshipEdit(anyDoc, ...)`, and the function is expected to throw. But `updateRelationshipEdit` throws only when `matched.length === 0` against `anyDoc`, not necessarily against the matcher targeting another doc. If `anyDoc` happens to contain a relation that matches the matcher (cross-file ambiguity case where the **first** doc has the only match but the count detected zero in this doc), the call will mutate `anyDoc` silently. Today this branch only fires when `matches.length === 0` across all files, so by construction `anyDoc` cannot match either — the bug is not reachable, but the reasoning is fragile and the comment is misleading.
**Fix:** Throw a canonical `Relationship not found` error from this branch directly using `formatNotFoundError(matcher)` (you'd need to export that helper), avoiding the bait-and-switch through `updateRelationshipEdit`. That removes the fragile "unreachable" reasoning entirely.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:99
**Issue:** `relations: any[]` and `collectRelations` (line 634) walks with `elements: any[]`, `results: any[]`. Right next to it is the typed equivalent in `cst-helpers.ts` (`collectAllRelations` returning `Array<{ node: unknown; parentFqn: string }>`). This module reaches for `collectAllRelations` in `matchRelations` but reimplements the same walk in `removeRelationshipEdit`'s `collectRelations`.
**Fix:** Use `collectAllRelations` here too, and adapt `removeRelationshipEdit` to consume `{ node, parentFqn }` entries. Drops a redundant walker.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:299-317
**Issue:** `RelationAstNode` interface uses `source?: unknown; target?: unknown` and then casts back to `Parameters<typeof resolveFqnRef>[0]` at every callsite (line 325, 327). The `unknown` plus repeated cast is more verbose than the previous `any` would have been **and** offers no type-safety — `resolveFqnRef`'s parameter type is the right shape; just import and use it.
**Fix:** Define `RelationAstNode.source/target` as `Parameters<typeof resolveFqnRef>[0]` directly (or import the `FqnRef` shape from `query/fqn.ts` if exported). Removes 3 casts.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:592
**Issue:** `buildCombinedBodyInsert` re-implements parts of `generateMetadataBlock` and `generateRelationshipStyleBlock` inline (lines 599-625), generating metadata array literals manually with a duplicated 4-branch match on `value.length`. This logic already exists in `formatMetadataValue` (`codegen.ts:366`) and in `generateMetadataBlock` (`codegen.ts:396`).
**Fix:** Replace lines 602-625 with `generateMetadataBlock(upserts, innerIndent)`, drop the inline branches. The current path also won't apply `validateMetadataKey` to the keys, so an attacker-controlled metadata key could bypass validation in this code path — see Security note below.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:602-625
**Issue (Security/correctness):** As above — this branch builds a metadata block without going through `validateMetadataKey`. A patch like `{ metadata: { 'foo bar': 'x' } }` (key with space) would inject a structurally-broken DSL line `${entryIndent}foo bar 'x'`, which the post-edit reparse would catch (good — rollback fires). But other invalid keys (e.g. `";\n}`) could in principle slip past the reparse if they happen to remain syntactically valid by luck. The other path (`buildReplaceMetadataEditOnNode` in `metadata-ops.ts:208`) does call `validateMetadataKeyOrThrow` — so this is an inconsistency.
**Fix:** Route through `generateMetadataBlock` (which calls `validateMetadataKey` internally on every key).

### /workspaces/likec4-mutator/src/mutator/codegen.ts:342
**Issue:** `validateMetadataKey` is module-private (line 342), but the same regex is duplicated in `metadata-ops.ts:225` as `validateMetadataKeyOrThrow`. Two implementations with the same intent that will drift.
**Fix:** Export `validateMetadataKey` from `codegen.ts` and import it in `metadata-ops.ts`. Or move both to a shared `validation.ts` and have both modules import it.

### /workspaces/likec4-mutator/src/query/query.ts:12,15
**Issue:** `private readonly ast: any` and `constructor(ast: any)`. The AST type is reasonably well-known for the rest of the codebase (LikeC4 grammar gives `LikeC4Document` with `models?`, `views?`, `specifications?`). Nothing else in this file enforces the shape, so a wrong AST passed in would only crash at runtime when `ast.models` or similar is accessed.
**Fix:** Define a `LikeC4DocumentAst` minimal interface (e.g. `{ models?: ModelBlock[]; views?: ViewsBlock[]; specifications?: SpecBlock[] }`) and use it instead of `any`. Even just `unknown` plus localized casts would be safer than `any`.

### /workspaces/likec4-mutator/src/query/query.ts:184-249, 258, 319
**Issue:** `collectRelations(elements: any[], ...)`, `extractBodyDecorations(body: any)`, `extractStringValue(prop: any)`. Same pattern — wide `any` use in AST walkers. The library's read API surface has a contract (returns `ElementInfo` / `RelationshipInfo`), but the internal walker does not enforce it.
**Fix:** Replace `any` with structural interfaces (the `BodyOwnerNode` shape from `cst-helpers.ts` is a good template — extend it or import it).

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:520-531
**Issue:** `collectLeaves` is typed with `node: any` and uses `n.content`, `n.text` without a structural interface. The `cst-helpers.ts` module is the natural home for this helper, and there is already a similar inline `walk` inside `buildLabelEdit` (`relationship-ops.ts:371`) — same code, twice.
**Fix:** Move `collectLeaves` to `cst-helpers.ts` with a typed `CstLeaf` return shape, and consume it from both element-ops and relationship-ops.

### /workspaces/likec4-mutator/src/mutator/metadata-ops.ts:90-92
**Issue:** `console.warn` in library code. The rest of the codebase exclusively uses `throw new Error` — a library should not write to stderr from a read path. Consumers integrating `likec4-mutator` programmatically will see noisy output they cannot suppress easily.
**Fix:** Either (a) silently drop the entry (current behavior says it's omitted anyway), or (b) collect the warnings into the `validate()` result so consumers can opt in. Avoid `console.*` in library code.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:99
**Issue:** `let title: string | undefined = item.title;` (in `query.ts:198`, but the same pattern exists here too for relations). For an `item.title` typed as `string | undefined`, that's fine — but `RelationAstNode.title` is `string | undefined` while at the AST boundary the value can also be `{ text: string }` or `{ value: string }` (the standalone parser shape varies). The pattern of reading through `extractStringValue` exists for element bodies; relations rely directly on `item.title`. Tested in `query.test.ts` via fixture, so probably fine in practice for `LangiumParser.parse()` output, but it is a typing assumption that's not enforced.
**Fix:** Either (a) document the assumption inline ("LangiumParser standalone always emits Relation.title as a flat string"), or (b) route through `extractStringValue` for safety.

### /workspaces/likec4-mutator/src/cli.ts:59
**Issue:** Path-traversal check `outPath.startsWith(absOutputDir + '/')` uses a hardcoded `/`. On Windows (project supports `engines.node >=20`, no platform restriction), `path.resolve` returns paths with `\` separators. The check would then **never** match, and the function would throw "Path traversal detected" for **all** output files when run on Windows.
**Fix:** Use `path.sep` instead of literal `/`, or use `path.relative(absOutputDir, outPath)` and check `!result.startsWith('..')`:
```ts
import { sep } from 'node:path';
if (!outPath.startsWith(absOutputDir + sep) && outPath !== absOutputDir) { ... }
```
Or, more idiomatically:
```ts
const rel = relative(absOutputDir, outPath);
if (rel.startsWith('..') || isAbsolute(rel)) {
  throw new Error(`Path traversal detected: '${filename}'`);
}
```

### /workspaces/likec4-mutator/src/cli.ts:599-694
**Issue:** Each case body uses `const m = mutation as XxxMutation;`. The discriminated union has the discriminant `op`, so TypeScript's narrowing should make these casts unnecessary. The cast adds noise and silently masks real type drift if the union changes.
**Fix:** Remove the cast — the switch already narrows. Replace `const m = mutation as AddElementMutation;` with `const m = mutation;` (after `case 'addElement':` TypeScript already narrows `mutation` to `AddElementMutation`).

### /workspaces/likec4-mutator/src/mutator/mutator.ts:208
**Issue:** Return type `{ removedRelationships: Array<{ source: string; target: string; title?: string }> }` is declared inline at the call site. This shape is a public API surface (consumed by the CLI's `removeElement` output), but it has no name and no JSDoc on the field types.
**Fix:** Extract to an exported interface `RemoveElementResult` and re-export from `index.ts`. Library consumers benefit from a stable named type they can refer to.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:411,439-446
**Issue:** `buildRelationStringPropEdit` is described as "Caller guarantees that the relation has a body (no-body case is handled by the combined insert path)" but at line 434-437 it silently returns `null` if body is missing. A `null` return + `updateRelationshipEdit` ignores it (line 263 conditionally pushes), so a programming error in the caller would manifest as a silent no-op. There's no assertion to catch the misuse.
**Fix:** Throw an `Error('internal: buildRelationStringPropEdit called without body')` when `rel.body?.$cstNode` is missing — surfaces the bug at runtime instead of producing silent no-op.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:471-475
**Issue:** `if (fullText[openingBrace] !== '{') { throw new Error('Expected opening brace at relation body CST offset'); }`. Same string literal exists in `element-ops.ts:498` for elements. The error gives no context (no FQN or relation source/target) to help debug if it ever fires.
**Fix:** Include source identity in the error:
```ts
throw new Error(`Expected opening brace at relation body CST offset for ${matcher.source} -> ${matcher.target}`);
```

### /workspaces/likec4-mutator/src/cli.ts:117,131
**Issue:** `metadata?: Record<string, string | string[] | null>` matches `MetadataPatch`, but `MetadataPatch` is exported from `index.ts` (line 16). The CLI redeclares the shape inline twice instead of importing `MetadataPatch`.
**Fix:** `import type { MetadataPatch } from './mutator/metadata-ops.js'` (or via the public re-export) and reuse.

### /workspaces/likec4-mutator/src/cli.ts:96,132
**Issue:** Inline `style?: { line?: string; color?: string; head?: string; tail?: string }` is an ad-hoc replica of `RelationshipStyle`. Same risk as above — schema drift.
**Fix:** Import `RelationshipStyle` from the public mutator API and reuse.

---

## Info

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:32-57
**Issue:** `AstElementNode` is a hand-written structural interface duplicated structurally with `BodyOwnerNode` from `cst-helpers.ts:128`. The element variant has additional `kind?: { $refText?: string }` and a more elaborate `value` union, but the body-owner part is the same.
**Fix:** Have `AstElementNode extends BodyOwnerNode` and add only the element-specific fields. Reduces drift.

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:272
**Issue:** Parameter `_fullText` is unused (prefixed with `_`, so TS won't complain), and the function does not actually need it — it operates on `node.$cstNode` and `escapeString`.
**Fix:** Drop the unused parameter from the signature; callers pass it for symmetry only.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:367
**Issue:** Same pattern — `_fullText` unused.
**Fix:** Drop the parameter.

### /workspaces/likec4-mutator/src/mutator/mutator.ts:432-436
**Issue:** `findFileWithModel` returns the FIRST file with `models?.length > 0`. Comment acknowledges this is a limitation. With multi-file projects (which is supported by the API), users have no way to choose the destination file. Documented as future work — fine, but worth flagging again.
**Fix:** Add a TODO and consider a `targetFile` option in `addElement` / `addRelationship` / `addView` for v0.5.

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:177-189
**Issue:** Inline `Partial<{ ... }>` type in `updateElementEdit` signature is the same shape as the inline literal in `LikeC4Mutator.updateElement` (`mutator.ts:179-188`). Two inline literals = drift risk.
**Fix:** Define `export interface UpdateElementPatch { ... }` next to `AddElementOpts` and use it in both places. Aligns with `UpdateRelationshipPatch` which is already named.

### /workspaces/likec4-mutator/src/mutator/relationship-ops.ts:319-335
**Issue:** `matchRelations` is module-private but is exactly the kind of helper the `mutator.ts` cross-file count needs (see Critical note about `countFileMatches`).
**Fix:** Export it.

### /workspaces/likec4-mutator/src/mutator/codegen.ts:323-325
**Issue:** `escapeString` replaces `\n` and `\t` with a single space. This is a destructive transformation that drops information silently. Whether this is acceptable depends on intent: if the LikeC4 grammar requires single-line strings, a throw might be safer than silent data loss.
**Fix:** Document the trade-off in the JSDoc (already partially noted) — clarifying "values are silently mangled, callers should pre-validate" — or make it throw. The current behavior is consistent with v0.3.x so no regression.

### /workspaces/likec4-mutator/src/mutator/mutator.ts:62
**Issue:** `static fromFiles(files: Record<string, string>): LikeC4Mutator` and the constructor are both public. Constructor allows the same construction. Two ways to do the same thing — encourages convention divergence.
**Fix:** Document that `fromFiles` is the preferred entry point (it is, per README). Or make the constructor private.

### /workspaces/likec4-mutator/tests/mutator/array-metadata.test.ts:93-102
**Issue:** Test "empty array throws at write time" — good edge case. But missing the symmetric test: `updateRelationship` throws on empty array. The path exists in `relationship-ops.ts:208-215` but no test covers it.
**Fix:** Add a test case to `tests/mutator/update-relationship.test.ts` exercising:
```ts
expect(() => m.updateRelationship({ source: 'a', target: 'b' }, { metadata: { x: [] } }))
  .toThrow(/empty array not allowed/);
```

### /workspaces/likec4-mutator/tests/mutator/update-relationship.test.ts (whole file)
**Issue:** No test for the "no body, multiple body-targeting fields → single combined insert" branch (`relationship-ops.ts:254-258`). This is the critical correctness fix described in the comment ("Avoids the latent multi-edit bug where two body-creation edits could each emit `' { ... }'`"). Worth a regression test.
**Fix:** Add:
```ts
it('combines body-creation edits when relation has no body', () => {
  const src = `specification { element service }
model { a = service 'A'; b = service 'B'; a -> b }
views { view idx { include * } }
`;
  const m = LikeC4Mutator.fromFiles({ 'model.c4': src });
  m.updateRelationship({ source: 'a', target: 'b' }, {
    description: 'desc', technology: 'tech', tags: ['t'], metadata: { x: 'y' }
  });
  // Expect exactly one body block ` { ... }` — not multiple ` { description ... } { technology ... }`.
  const out = m.serialize()['model.c4'];
  expect((out.match(/->\s*b\s*\{/g) || []).length).toBe(1);
  expect(m.validate()).toHaveLength(0);
});
```

### /workspaces/likec4-mutator/tests/mutator/update-relationship.test.ts:29
**Issue:** Test "throws when no relationship matches" expects message format `/Relationship not found.*source=a.*target=c/`. The matcher is documented in code as the canonical "not-found" message, but the assertion is on a regex with `.*` — fine. It's also worth asserting that other test cases produce **no other** parse errors (currently only `validate()` length is checked, which covers it).
**Fix:** None needed — informational.

### /workspaces/likec4-mutator/tests/mutator/round-trip-array.test.ts (whole file)
**Issue:** Excellent coverage of the round-trip stability requirement. Missing: a test that ensures the `verbatim` substring actually preserves CST text **even when the AST `value.text` differs** (e.g. when LikeC4 grammar normalizes a value). Today the helper reads `fullText.substring(keyCst.offset, valueCst.end)` which is the safest possible thing — pure CST. An additional test could lock that behavior in:
```ts
it('preserves whitespace inside an inline array verbatim', () => {
  const source = `... metadata { keep [   'a'  ,   'b'   ]; touch 'old' }...`;
  // patch only `touch`, then assert the exact whitespace inside `keep` is preserved.
});
```
**Fix:** Add the regression test if round-trip stability of arbitrary whitespace matters. Optional.

### /workspaces/likec4-mutator/tests/mutator/element-ops.test.ts:570-615
**Issue:** Test "should not crash and should produce a parseable result when element has two metadata blocks" has an early `return` (line 604) when the parser rejects the malformed input. Vitest will not flag this — the test silently passes without exercising the assertion. If the parser ever starts accepting two metadata blocks, the assertion will run; if it stops, the test silently no-ops.
**Fix:** Use `it.skip(...)` or wrap in `if (doc.errors.length === 0) { ... } else { it.skip('parser rejected fixture'); }`. As-is the test is informational only.

### /workspaces/likec4-mutator/src/cli.ts:163-165
**Issue:** `assertNever(x: never)`: the function reads `(x as { op: string }).op` to format the message. If the unhandled value is not an object, `.op` may be `undefined`. Minor nit.
**Fix:** Format defensively: `String((x as { op?: unknown }).op ?? x)`.

### /workspaces/likec4-mutator/src/mutator/mutator.ts:312-315
**Issue:** Error message `Multiple relationships match (${matches.length} found across files: ${fileList}). Specify matchKind and/or matchTitle to disambiguate.` is helpful, but the cross-file branch does not list which **specific** relations matched (kind, title), unlike the single-file branch in `formatAmbiguousError` (`relationship-ops.ts:344`).
**Fix:** Aggregate `[kind=... title=...]` snippets across files for parity.

### /workspaces/likec4-mutator/src/mutator/element-ops.ts:482, 583
**Issue:** `tags.map((t) => (t.startsWith('#') ? t.slice(1) : t))` is duplicated in element-ops, relationship-ops, and codegen. A trivial helper `cleanTagName(t: string): string` would centralize.
**Fix:** Move to a shared util — minor DRY improvement.

---

**Summary:** 3 critical, 17 warning, 13 info
