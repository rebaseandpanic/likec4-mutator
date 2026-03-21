# TypeScript Reviewer Report — 2026-03-21

**Operation:** review
**Scope:** changed (11 files)
**Project:** /workspaces/likec4-mutator
**Stack:** TypeScript

---

## Critical

### src/mutator/mutator.ts:142 / src/mutator/mutator.ts:169 / src/mutator/mutator.ts:186
**Issue:** Non-null assertion (`!`) on `this.documents.get(filename)` after `findFileContaining` / `findFileWithModel` / `findFileWithViews`. If the internal state ever becomes inconsistent — for example if `reparse` fails silently and the document is not stored — the `!` will cause an uncaught `TypeError: Cannot read properties of undefined` at runtime rather than a descriptive error.
**Fix:** Replace the non-null assertion with an explicit guard:
```ts
const doc = this.documents.get(filename);
if (!doc) throw new Error(`Internal error: document for '${filename}' not found in cache`);
```

### src/mutator/mutator.ts:291-296 / src/mutator/mutator.ts:323-328
**Issue:** `reparse` and `applyEditsToFile` use the non-null assertion `this.sources.get(filename)!` without a guard. If an unknown filename is passed (which is possible because both helpers are `private` but called with any `filename` string returned by the `find*` helpers), this silently passes `undefined` to `parse()`, likely causing a crash or corrupt state instead of a clear error.
**Fix:** Guard the read:
```ts
const text = source ?? this.sources.get(filename);
if (text === undefined) throw new Error(`No source registered for '${filename}'`);
```

### src/mutator/relationship-ops.ts:142
**Issue:** `Object.create(item)` is used to attach a `_parentFqn` property to a relation node without modifying the original. This approach uses prototype-chain mutation on AST nodes whose shape is not owned by this codebase. If the upstream Langium AST ever seals objects (`Object.freeze`, `Proxy`, or non-extensible prototypes) this will throw silently or produce incorrect behavior. More practically, iterating `Object.keys` on a `Proxy`-backed AST node can skip inherited properties, making `_parentFqn` invisible to consumers.
**Fix:** Spread into a plain object instead:
```ts
results.push({ ...item, _parentFqn: parentFqn });
```
Type the relation collection with a proper interface rather than `any[]`.

---

## Warning

### src/mutator/element-ops.ts:299 / src/mutator/element-ops.ts:334 / src/mutator/element-ops.ts:381 / src/mutator/element-ops.ts:414 / src/mutator/element-ops.ts:441
**Issue:** Every private helper function (`buildTitleEdit`, `buildBodyPropEdit`, `buildInsertTagsAfterOpeningBrace`, `buildInsertBodySnippet`, `collectLeaves`) uses `node: any` as the parameter type for AST nodes. This defeats TypeScript's type safety across the most complex logic in the codebase — the same functions that perform precise offset arithmetic. A single incorrect property access (`node.body?.props`, `node.kind?.$refText`, `node.$cstNode`) will silently return `undefined` instead of failing at compile time.
**Fix:** Define an internal AST element interface (even a minimal structural one) or import the concrete Langium-generated node type from `@likec4/language-server`. At minimum, extract a `CstAwareNode` interface:
```ts
interface CstAwareNode {
  $cstNode?: { offset: number; end: number };
  body?: { $cstNode?: { offset: number; end: number }; props?: Array<{ key: string; value?: { $cstNode?: { offset: number; end: number } } }>; elements?: unknown[] };
  kind?: { $refText?: string };
  name?: string;
}
```

### src/mutator/relationship-ops.ts:82 / src/mutator/relationship-ops.ts:138
**Issue:** `relations: any[]` and the `collectRelations` signature use `any` throughout. The `$type` discriminator comparison (`item.$type === 'Relation'`) is a magic string with no type narrowing.
**Fix:** Define a minimal `AstRelation` / `AstElement` discriminated union. At minimum, extract the magic strings to named constants:
```ts
const AST_TYPE_RELATION = 'Relation' as const;
const AST_TYPE_ELEMENT = 'Element' as const;
```

### src/cli.ts:360
**Issue:** `JSON.parse(mutationsRaw) as MutationsFile` is an unsafe cast. The file may contain any JSON shape. Only `mutationsFile.mutations` being an array is checked (line 362), but individual mutation objects are never validated — their `op` field is trusted directly. A malformed input like `{ "op": null }` or `{ "op": "addElement", "parent": null }` will pass the `switch` and crash inside the mutator with a confusing error message rather than a clear validation error at the point of parsing.
**Fix:** Add a runtime schema validation step (e.g. using `zod`) or at minimum add explicit type checks per mutation op before passing values to `mutator.*` methods.

### src/cli.ts:376 / src/cli.ts:393 / src/cli.ts:406 / src/cli.ts:417 / src/cli.ts:432 / src/cli.ts:438
**Issue:** Inside the `apply` command's `switch` block, each `case` re-casts the already-narrowed `mutation` to its specific type (e.g. `const m = mutation as AddElementMutation`). This re-cast is unnecessary when `mutation` is already typed as the discriminated union `Mutation`; TypeScript's narrowing via the `switch (mutation.op)` should handle this automatically, but it does not here because the `Mutation` union's discriminant is `op: string` literals and the type is declared correctly. The re-cast pattern is still a code smell that suggests the author was unsure the narrowing worked — and indeed, in the `default` case, a second cast to `{ op: string }` is required, which reveals that the `Mutation` type does not carry an exhaustive union check.
**Fix:** Add a `never`-based exhaustive check helper to catch unhandled ops at compile time:
```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled mutation op: ${(x as { op: string }).op}`);
}
// In default: assertNever(mutation);
```

### src/mutator/codegen.ts:109-120 / src/mutator/element-ops.ts:169-181
**Issue:** Style block generation is duplicated verbatim across `generateElement` (codegen.ts lines 107-121) and `updateElementEdit`'s inline lambda (element-ops.ts lines 166-183). Both iterate the same `ElementStyle` properties in the same order. Any future addition of a style property must be updated in two places.
**Fix:** Extract a shared `generateStyleBlock(style: ElementStyle, innerIndent: string): string` helper into `codegen.ts` and call it from both sites.

### src/mutator/element-ops.ts:155-159 / src/mutator/element-ops.ts:192-195
**Issue:** Link label escaping and metadata value escaping are inline in lambdas rather than using the module-private `escapeString` function that already exists in `codegen.ts`. The escape logic (replace `\` then `'`) is repeated three times across the codebase — once in `buildTitleEdit`, once in `buildBodyPropEdit`, once inline in the `updateElementEdit` link/metadata lambdas — creating a risk of divergence.
**Fix:** Export `escapeString` from `codegen.ts` (or move it to a shared `string-utils.ts`) and import it in `element-ops.ts`.

### src/mutator/mutator.ts:199-222
**Issue:** The `addRelationship` method accepts `optsOrDesc?: string | { ... }` for backward compatibility with a legacy string API. The docstring comment says "legacy description string for backward compatibility with the previous API", but there is no deprecation marker (`@deprecated`) and the string overload is actively used in `tests/mutator/mutator.test.ts:312` (`m.addRelationship('app', 'external', 'calls', 'Calls the external system')`). Undocumented legacy behavior in a public API accumulates quietly.
**Fix:** Add `@deprecated` JSDoc to the string path and/or remove the `string` branch if this is a new library with no existing consumers.

### src/mutator/mutator.ts:305-316
**Issue:** `findFileWithModel` returns the first file whose `ast.models?.length > 0`. This means relationships and root-level elements are always inserted into the first such file regardless of the user's intent when multiple files are loaded. `findFileWithViews` has the same issue. There is no mechanism for the caller to specify a target file.
**Fix:** This is an architectural limitation worth documenting explicitly in the JSDoc. Consider adding an optional `targetFile?: string` parameter to `addRelationship` and `addView`, defaulting to the current heuristic.

### tests/cli/cli-apply-extended.test.ts:8-13
**Issue:** `runCli` calls `execSync` with a hard-coded absolute path `/workspaces/likec4-mutator` as `cwd`. This couples the tests to a single workspace path and will fail on any machine (CI, other developer's environment) where the repo is checked out elsewhere.
**Fix:** Replace with a path computed relative to `import.meta.dirname` or the project root:
```ts
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
// ...
cwd: PROJECT_ROOT,
```

### tests/cli/cli-apply-extended.test.ts:52-53 / :86-88 / :119-123
**Issue:** Several tests read the fixture file using the hard-coded absolute path `/workspaces/likec4-mutator/tests/fixtures/minimal/model.c4`. The same portability issue as above applies. The `readFixture` helper in `tests/mutator/element-ops.test.ts` correctly uses `import.meta.dirname`, but the CLI tests do not.
**Fix:** Use a `readFixture` helper based on `import.meta.dirname`.

### tests/mutator/mutator.test.ts:289-290 / tests/mutator/mutator.test.ts:300
**Issue:** Tests for `addRelationship` verify that a relationship to the identifier `'external'` is inserted and queryable, but the fixture model has no element with FQN `'external'`. The relationship refers to a non-existent target. This tests that the mutator inserts the text (which it does) but does not validate that the resulting document parses without semantic errors (only that it parses without syntax errors via `m.validate()`). In other words, the test passes even though the model would be invalid in a full LikeC4 toolchain.
**Fix:** Either use a real target FQN from the fixture (`'app.db'`), or explicitly note in the test name that it tests insertion of a forward reference and also assert that `m.validate()` is clean.

---

## Info

### src/cli.ts:131-134
**Issue:** The CLI version `'0.1.0'` is hard-coded as a magic string. If the `package.json` version is bumped the CLI version will silently diverge.
**Fix:** Import version from `package.json`:
```ts
import { version } from '../../package.json' assert { type: 'json' };
// ...
.version(version)
```

### src/mutator/codegen.ts:312-314
**Issue:** `escapeString` is a module-private function. It handles `\` and `'` escaping but does not handle other characters that may be meaningful in the LikeC4 DSL string literal grammar (e.g. newlines embedded in a value would produce invalid single-line string tokens). There is no test covering multi-line or tab-containing strings.
**Fix:** Document the scope of escaping explicitly. Add tests for `\n` and `\t` in string values, and consider stripping or rejecting them if the grammar does not support multi-line string literals.

### src/mutator/relationship-ops.ts:43
**Issue:** The `indent` constant for relationships is hard-coded to `'  '` (two spaces). This is appropriate for top-level model block content but will produce incorrect indentation if the `addRelationshipEdit` function is ever used to insert relationships inside nested element bodies.
**Fix:** Accept `indent` as a parameter (same pattern as `generateRelationship`'s `opts.indent`) rather than hard-coding it.

### src/mutator/element-ops.ts:401
**Issue:** The comment `// the { is the first char of the body CST` assumes that the `bodyCst.offset` always points at the `{` character. This is a fragile assumption — if the Langium CST for a body block includes preceding whitespace in its range, the insertion point will be wrong. There is no assertion or test for this assumption.
**Fix:** Add an assertion: `if (fullText[openingBrace] !== '{') throw new Error(...)` or scan forward from `bodyCst.offset` to find the actual `{`.

### src/mutator/mutator.ts:23
**Issue:** `export interface AddViewOpts extends Omit<GenerateViewOpts, 'indent'> {}` — using an empty `extends` interface is redundant. TypeScript treats it identically to a type alias. The empty braces signal to readers that the type may have been intended to diverge but never did.
**Fix:** Replace with a type alias:
```ts
export type AddViewOpts = Omit<GenerateViewOpts, 'indent'>;
```

### src/index.ts:10
**Issue:** `applyEdits` and `TextEdit` are exported from `index.ts`, making low-level text-edit primitives part of the public API. This couples consumers to internal implementation details.
**Fix:** If these are intentionally public, document them clearly. If not, remove them from `index.ts`.

### src/index.ts:12-13
**Issue:** `detectIndent`, `getNodeIndent`, `generateElement`, `generateRelationship`, `generateView` and all associated option types are exported publicly. These are internal codegen helpers; exposing them complicates the public API surface without documented use-cases.
**Fix:** Audit which exports are genuinely needed by consumers vs. exposed opportunistically. Consider re-exporting only `LikeC4Mutator` and the primary option/result types.

### tests/mutator/codegen.test.ts (no specific line)
**Issue:** There are no negative/error-path tests for `generateElement` or `generateRelationship`. All tests assert on valid inputs. Missing cases: empty `name`, empty `kind`, `indent` containing characters other than spaces/tabs, `tags` array containing a tag name that already includes a `#` prefix (would produce `##tagname`), `links[].url` containing whitespace or single quotes.
**Fix:** Add tests for edge-case inputs, particularly the `##tag` double-prefix scenario.

### tests/mutator/element-ops.test.ts (no specific line)
**Issue:** `updateElementEdit` is tested for adding new properties to existing elements, but there is no test for updating an existing `summary` property that already exists in the body (only adding a new one). The "replace existing value in-place" path for `summary` is exercised only indirectly through `description` and `technology` tests.
**Fix:** Add a test where an element already has a `summary` property and `updateElementEdit` replaces it.

### README.md:189
**Issue:** The README states `npm test # vitest, 306 tests`. This count will become stale immediately as tests are added or removed. Hardcoded test counts in documentation are frequently incorrect and erode trust.
**Fix:** Remove the specific count and write `vitest` only, or generate it dynamically via a CI badge.

---

**Summary:** 3 critical, 12 warning, 8 info
