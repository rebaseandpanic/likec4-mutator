# TypeScript Reviewer Report — 2026-03-21 (round 2)

**Operation:** review
**Scope:** changed (4 files)
**Project:** /workspaces/likec4-mutator
**Stack:** TypeScript

---

## Critical

None

---

## Warning

### W1 — Unsafe cast of parsed JSON (`src/cli.ts:476`)
`JSON.parse(mutationsRaw) as MutationsFile` silently casts unvalidated external input. The structural checks immediately below (`Array.isArray`, `typeof m.op !== 'string'`) are partial: they confirm the array and the `op` field exist, but every per-mutation property (`parent`, `source`, `target`, `fqn`, `id`, `kind`, `title`, etc.) is accessed without any existence or type guard. A malformed JSON payload reaches `mutator.addElement` / `mutator.addRelationship` etc. with `undefined` arguments, which the mutator layer may or may not handle gracefully. A runtime schema validator (zod, valibot) or at minimum explicit required-field checks per `op` branch should be used.

### W2 — `(err as Error).message` swallows non-Error throws (`src/cli.ts:175,218,269,322,355,399,427,452,583`)
All nine `catch` blocks cast `err` to `Error` unconditionally. In JavaScript any value can be thrown; when a non-Error is thrown the expression `(err as Error).message` yields `undefined` and the user sees `Error: undefined`. The standard pattern is `err instanceof Error ? err.message : String(err)`.

### W3 — Path traversal risk in `writeOutput` (`src/cli.ts:48-52`)
`filename` keys in `mutator.serialize()` are ultimately derived from user-supplied relative paths (loaded from disk via `loadDirectory`). `join(outputDir, filename)` is not normalised or validated before use. A crafted `.c4` file stored at a path containing `../../` could cause output files to be written outside the intended output directory. At minimum `path.resolve` the result and assert it starts with `resolve(outputDir)`.

### W4 — Link URL is emitted verbatim without any sanitisation (`src/mutator/codegen.ts:103-106, 218-221`)
`lnk.url` / `link.url` is inserted directly into the generated DSL without escaping or validation. URLs that contain single quotes or newlines will silently produce syntactically broken or ambiguous output. The `escapeString` helper is already applied to labels but is bypassed for the URL itself. The same risk exists for metadata keys (line 116) which also receive no escaping.

### W5 — Metadata keys are injected without escaping (`src/mutator/codegen.ts:116, 236`)
In both `generateElement` and `generateRelationship`, `Object.entries(metadata)` emits keys literally. A key such as `foo 'bar'` or a key containing `}` would corrupt the generated block. Keys should either be validated against `[A-Za-z0-9_-]+` or escaped consistently.

### W6 — `assertNever` is reached at runtime despite compile-time exhaustiveness (`src/cli.ts:497-569`)
The `switch` over `mutation.op` looks exhaustive at compile time only because `mutationsFile.mutations` is typed as `Mutation[]` after the unsafe cast (W1). At runtime any string `op` value will fall through to the `default` branch, call `assertNever`, and throw an uncaught error inside the `try/catch` that prints `Error: Unhandled mutation op: <value>`. This is acceptable behaviour but it is a consequence of the missing runtime validation, not a true exhaustiveness guarantee.

### W7 — `multiple: false` is suppressed by truthiness check (`src/mutator/codegen.ts:329`)
`if (style.multiple !== undefined)` is the correct guard and is used. However `style.multiple` is of type `boolean | undefined`. In the upstream `AddElementMutation` interface (`src/cli.ts:84`), the `style` field is typed as `ElementStyle` which itself defines `multiple?: boolean`. This is consistent — but other boolean-like string style values (`border`, `opacity`) are still compared with implicit truthiness (`if (style.border)`), which would silently skip emission for the empty string `""`. If callers can supply `""` (e.g., via the JSON `apply` command), those properties would be omitted from output without warning.

### W8 — No validation that `--dir` / `--mutations` paths exist before use (`src/cli.ts` — all commands)
`loadDirectory` calls `readdirSync` and `statSync` which throw ENOENT errors. These are caught and printed via the `catch` block, but the raw Node.js error message (e.g., `ENOENT: no such file or directory, scandir '/nonexistent'`) is surfaced directly. A pre-check with an explicit human-friendly message would improve UX and reduce surprise.

---

## Info

### I1 — Non-null assertions (`!`) used for already-narrowed variables (`src/mutator/codegen.ts:92,101,110,115`)
`tags!`, `links!`, `style!`, `metadata!` are used after the `hasTags`, `hasLinks`, `hasStyle`, `hasMetadata` boolean guards confirm they are non-empty. TypeScript does not narrow through these intermediate boolean variables, so the `!` is necessary for compilation — but the pattern is fragile. Structuring the conditions as direct `if (tags && tags.length > 0)` checks would eliminate the need for non-null assertions and is more idiomatic.

### I2 — `createRequire` to load `package.json` (`src/cli.ts:9-10`)
Using `createRequire(import.meta.url)` to import JSON is a CommonJS-interop workaround. In modern TypeScript / Node.js ESM with `"resolveJsonModule": true` (or `--experimental-require-module`), a static `import pkg from '../package.json' assert { type: 'json' }` (or the `with` syntax in newer runtimes) is cleaner. The current approach works but is worth aligning with the rest of the toolchain.

### I3 — `escapeString` is documented to not handle newlines/tabs but tests confirm the passthrough (`src/mutator/codegen.ts:309-312`, `tests/mutator/codegen.test.ts:639-650`)
The function comment says "callers should strip or reject them before calling this function," and tests explicitly verify the passthrough. No enforcement exists at the call sites, however. A defensive `replace(/[\n\t]/g, ' ')` inside `escapeString`, or a separate validation function called before every `escapeString` use, would prevent silent generation of invalid DSL.

### I4 — `apply` command: `applied` counter is incremented even for operations that may throw (`src/cli.ts:495-570`)
The `applied++` increment is inside each `case` branch but after the call to the mutator. If the mutator call throws, the catch block runs and `process.exit(1)` is called — so the incorrect count is never printed. The counter is therefore harmless, but it is subtly misleading during code review. Moving `applied++` outside the switch (unconditional, after the switch) or removing it in favour of `mutationsFile.mutations.length` would be cleaner.

### I5 — Missing test coverage for `generateStyleBlock` in isolation (`tests/mutator/codegen.test.ts`)
`generateStyleBlock` is exported from `codegen.ts` but is tested only indirectly through `generateElement`. A focused unit test for `generateStyleBlock` (all properties, empty object, `multiple: false`) would improve coverage and make regressions easier to locate.

### I6 — Missing test coverage for `generateRelationship` style ordering relative to metadata (`tests/mutator/codegen.test.ts`)
The combined ordering test for `generateRelationship` verifies `style < metadata` (line 514-515). However there is no test confirming that an empty `style` object (`{}`) does not emit a `style { }` block for relationships, unlike the analogous test for `generateElement` (line 272-282). The behaviour is implemented correctly in the code (`Object.keys(style).length > 0` check at line 225) but is not tested.

### I7 — `autoLayout TopBottom` is a hardcoded magic string (`src/mutator/codegen.ts:294`)
The layout directive is always emitted unconditionally. If LikeC4 gains additional layout options, or if callers need to suppress the directive, the string will need to be found and changed. Accepting an optional `autoLayout?: string` in `GenerateViewOpts` (defaulting to `'TopBottom'`) would make the API more flexible and eliminate the magic string.

### I8 — README documents `title` as required for `addElement` but the TypeScript type marks it as optional (`README.md:209` vs `src/cli.ts:64`)
The README states `title` is required for `addElement` in the batch JSON format. The `AddElementMutation` interface has `title: string` (not optional), which is consistent — but `GenerateElementOpts.title` is `title?: string` (optional). The CLI `add-element` command marks `--title` as `.requiredOption`. The codegen layer accepting `title?: string` while the CLI and docs treat it as required creates a silent gap: via the library API, an element can be added without a title; the CLI enforces it; the batch format enforces it via the TypeScript interface but not at runtime (see W1).

---

**Summary:** 0 critical, 8 warning, 8 info
