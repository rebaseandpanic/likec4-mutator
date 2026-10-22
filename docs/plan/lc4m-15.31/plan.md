# Plan: CLI parity with `apply`, semantic validation like `likec4 validate`, `.likec4` / `.like-c4` in the CLI

**Date** 2026-10-23 · **Requirements source**: `docs/plan/lc4m-15.31/spec.md` (READY) · **Task**: lc4m-15.31 (with lc4m-28)

## Summary

Requirements by id: every `apply` operation gets a command with every field (US-1, US-2, D135–D137, D145, D147, D156), read commands for every public read method (US-3, D138, D148, D149), one documented table of operations and read commands with a test holding it (US-4, D151), an asynchronous semantic validation method and a CLI `validate` built on it (US-5, US-6, D139–D142, D146, D150, D152–D154), the three LikeC4 file extensions in every CLI command (US-7, D143), a numeric end-of-file position in `validate()` (US-8, D155).

Technical approach: parity is built, not tested in. The field table and per-operation validator that `apply` already uses (`MUTATION_FIELDS`, `validateMutation` in `src/mutations-file.ts`) become the exported single source; each field gets a value kind tied to the mutation interfaces at compile time. The `apply` dispatch (`applyMutation` inside `src/cli.ts`) is lifted into a shared operation runner that returns the library value and the lines `apply` prints. A command is then: flags → (encoding by value kind) → mutation object → the same validator → the same runner → write. `apply` and the 39 commands run one code path, so "same fields → same files" (INV-2) holds by construction. Read commands come from a read table that is tied to the public methods of `LikeC4Mutator` at compile time. The LikeC4 check (`tests/helpers/likec4-model.ts` `validateLikeC4`) moves into product code; the library method and the test oracle both call it. The CLI is restructured into a program builder with injected output and exit code, so most CLI tests run in process; the entry file only wires it to `process`.

## Technical context

- One repository: `likec4-mutator` (TypeScript, ESM, Node ≥ 22.22.3), stream = this repository.
- Runtime deps unchanged: `@likec4/language-server` 1.59.4, `@likec4/core`, `commander` ^15, `bundle-require`, `esbuild`, `strip-indent`. `langium` 3.5.0 is a devDependency; `tsdown` bundles it into `dist` (verified: `dist/mutator-*.mjs` has no `from "langium"` import, runtime langium code is inlined). The LikeC4 check needs `URI` from langium (as the spike and the oracle do), so the bundled copy must interoperate with the language server's own langium instance — see Risks.
- LikeC4 file extensions are available as `services.likec4.LanguageMetaData.fileExtensions` of the existing `getServices()` (verified by probe: `[ '.c4', '.likec4', '.like-c4' ]`).
- LikeC4 reports the US-8 sample (`model {\n  x = service {\n`) at a numeric range (verified by probe: `range.start` = line 1, character 15, 0-based); `validate()` today prints `b.c4:NaN:NaN: …` (verified by probe; `C4Parser.parse` reads `token.startLine`, which is `NaN` for the end-of-file token).
- commander 15 (Context7, `/tj/commander.js/v15.0.0`): `exitOverride()`, `configureOutput({ writeOut, writeErr })`, `parseAsync()` for async actions, `Option` with `argParser`.
- Contracts touched: CLI commands and flags (additive except the INV-6 exceptions), library public API (additive: semantic method, its record type), `apply` mutations file (unchanged).

## Multi-repo and contracts

Not applicable: one repository. The internal contracts that later tasks consume (operation table + validator, operation runner, CLI program builder and loader, LikeC4 check) are foundational tasks closed before their consumers (Phase Foundational).

## Invariant check (gate before decomposition)

- [x] Read CLAUDE_DEV_GUIDELINES, CLAUDE_TEST_GUIDELINES; no stack guideline applies (TypeScript library; no .NET / Go).
- [x] Business errors → 422: not applicable (no HTTP service). Env without silent fallbacks: no env variables introduced.
- [x] DB + external call in one operation → Transactional Outbox: not applicable (no DB, no external call).
- [x] API change → documentation in the same commit: every CLI command and the new library method are documented in README by the task that adds them (T012 holds the tables and policy; JSDoc on the new method in T009). Metrics: none (library + CLI).
- [x] Logs: no logging is added; LikeC4's own log output during the check must not reach stdout/stderr (T004 gate). No secrets.
- [x] Tests run only through the project test wrapper in parts, sequentially (the project testing section); never two runs at once, `npm run lint` not in parallel with vitest.

## Key design decisions

| Decision | Why | Rejected |
|---|---|---|
| P1. The field table gains a per-field value kind (`string`, `nullableString`, `presenceBoolean`, `valueBoolean`, `number`, `tags`, `json`), checked against the mutation interfaces at compile time like `FieldsNotListed` | the CLI derives flags and encoding from data, owns no field rule (spec Component boundaries); a new field without a kind does not compile | a separate CLI-side field list (drifts from `apply`) |
| P2. Commands build the same mutation object `apply` reads and run `validateMutation` + the shared runner | identical rules, rejections and files by construction (INV-2, D135) | per-command calls of library methods (the current five) |
| P3. Rejection paths are translated once: a validator path `<root>.<field><rest>` and an `InvalidWriteError` field (through `mutationFieldPath`) become `--<kebab-field><rest>`; a rejection of the whole operation (`… requires at least one of …`) is printed without a flag prefix and with `apply`'s detail | one mapping for every command; replaces the ad-hoc `asOptionError` | per-command mapping |
| P4. The five existing commands are generated from the same table plus a compatibility layer: kept `requiredOption`s (`--fqn`, `--source`/`--target`, `--kind`, `--id`), kept success lines, `--parent`/`--title` of `add-element` optional | D137 with no second code path | hand-maintaining the five next to the generated ones |
| P5. Rejections of all single-operation commands use the uniform `Error: --<flag>: <detail>` form, including `remove-element` / `remove-relationship`, which today print the library message (`Invalid fqn: …`) without a flag | US-1 ("rejection naming the flag"); README already promises that the single-purpose commands name the option | keeping the two commands' current wording (contradicts US-1 and README); see Known residuals |
| P6. CLI split into `src/cli/` modules with a program builder that takes `{ stdout, stderr }` writers and returns an exit code; `src/cli.ts` stays the bin entry (`tsdown` entry unchanged) and sets `process.exitCode` instead of calling `process.exit` | in-process CLI tests (see Complexity); `process.exit` right after a large `stdout.write` can truncate piped JSON | keeping one 900-line file with `process.exit` in every action |
| P7. Read table in product code, tied at compile time to `keyof LikeC4Mutator`: every public method is an operation, a read entry, or in an explicit exclusion list (`serialize`, `validate`, the semantic method, `getElementSource` reached as the `--source` mode) | the read-method set of US-4 is checked by the compiler, not by reflection over the class (CLAUDE_TEST_GUIDELINES part III) | enumerating `LikeC4Mutator.prototype` in a test |
| P8. The LikeC4 check is `src/validation/likec4-check.ts`: fresh language services per call, documents from an in-memory copy, `getErrors()` then (unless skipped) `diagrams()` per project; it takes an optional list of top-level folders to register as projects (the oracle's multi-project form, FOR-PLAN) | D141 one implementation; FOR-PLAN; project registration is also the base lc4m-15.32 builds on | keeping the oracle's copy; a test-only hook |
| P9. Library method `validateModel(options?: { layout?: boolean }): Promise<ValidationRecord[]>`; `ValidationRecord` = `{ origin: 'language-services' \| 'views', message }` plus `file`, `line`, `column` (1-based) on located records; CLI flag `--no-layout` (as `likec4 validate --no-layout`) | names the US-5 option and record; matches the reference CLI's flag | an option on `validate()` (D139) |
| P10. lc4m-28 fixed where `validate()` formats a parse error: a parse error without a numeric token position is placed at the end of the file (last line, column after its last character) | D155 limits the fix to `validate()`'s output; `C4Parser` stays as is | changing `C4Parser.parse` (public `ParseError`, also read by `unmodelled.ts` offsets) |

## Complexity Tracking

| Addition | Why | Without it |
|---|---|---|
| Value kind per field in the operation table (P1) | the only way to derive 39 commands' flags without a second field list | a hand-written flag list per command that can drift from `apply` (the defect this task removes) |
| Shared operation runner module (T002) | `apply` and every command must print the same lines and pass the same calls | the dispatch is duplicated or the commands call `apply` through a temporary file |
| CLI program builder with injected writers and exit code (P6, T003) | about 50 commands × success / rejection / `--json` cases; each subprocess test runs `npx tsx src/cli.ts`, and the shared container already crashed under test load | every CLI test is a tsx subprocess (seconds each, heavy on the shared host); a few subprocess tests remain for the bin entry and the built `dist/cli.mjs` |

No new dependency.

## Decomposition by phase

Every task: acceptance = code + `npm run lint` + the matrix rows of its embedded test files (stage 4/5). Test runs only via `safe-vitest.sh` in the documented parts.

### Phase Setup

None: no new dependency, no configuration change. (The project testing section is a local file and already current.)

### Phase Foundational (BLOCKING)

- **T001 — Exported operation table with value kinds and per-operation validator.** `src/mutations-file.ts`. Mechanism: `MUTATION_FIELDS` becomes an exported operation table whose entries give each field its value kind (P1) and whether it is required; a compile-time assertion ties kinds to the mutation interface field types (string / `string | null` / boolean / number / `string[]` tags / other); `validateMutation` is exported as the per-operation validator with a caller-given path root; `parseMutationsFile` uses it unchanged. Requires planning (where the kind assertion lives; `moveElement.parent` is required `string | null`, `addView.autoLayout` / `updateView` strings / `updateKind` strings nullable; `metadata` patches with `null` values are `json`). Gate (class): every one of the 39 operations has a kind for each field and the build fails if a field or kind is missing or mismatched; all existing `apply` CLI tests and `tests/cli/cli-apply-validation.test.ts` stay green unchanged.
- **T002 — Shared operation runner.** `src/operations/run-operation.ts` (new), `src/cli.ts`. Mechanism: the `applyMutation` switch, `writeRemoved`, `writeCascaded`, `writeRemovedBlocks` move into one function `(mutator, mutation) → { result, lines }`, where `result` is the library method's return value (or `null` when it returns nothing) and `lines` are exactly the lines `apply` prints for that operation; `apply` prints them and keeps its summary line and `--in-place` / `--output` rule (INV-6: `apply` unchanged). The exhaustive `assertNever` stays. Gate (class): every `apply` CLI test passes byte-identical stdout; the runner's per-operation output is covered for each operation that prints lines (cascade, emptied `par`, created, removed) by the existing `apply` tests.
- **T003 — CLI program builder, directory loading by LikeC4 extensions, in-process runner.** `src/cli/program.ts`, `src/cli/files.ts` (new), `src/cli.ts`. Mechanism: `buildProgram({ stdout, stderr })` with `exitOverride` + `configureOutput`, `parseAsync`, actions return an exit code; `src/cli.ts` builds the program on `process` and sets `process.exitCode`. `loadDirectory` takes the extension list from `getServices().likec4.LanguageMetaData.fileExtensions` (D143, no literal list), walks the whole `--dir` tree as today; `writeOutput` keeps the path-traversal guard and writes every file under its own relative path (INV-7). Option descriptions and the "no files found" text name the three extensions (INV-6 exception 2). Existing commands moved as is (no behaviour change in this task). Requires planning (exit code with `exitOverride` for commander's own errors such as an unknown option or a missing required option: exit 1, nothing written). Gate (class): all existing CLI tests green; a directory with `.c4`, `.likec4` and `.like-c4` files referring to each other is one model for a read command, a write command and `apply`, files keep their names, the result passes `expectValidLikeC4` (US-7, SC-006); an unknown flag and a missing required flag exit 1 and write nothing (INV-1); the built `dist/cli.mjs` runs (`node dist/cli.mjs --help`).
- **T004 — LikeC4 check in product code; the oracle switched to it.** `src/validation/likec4-check.ts` (new), `tests/helpers/likec4-model.ts`. Mechanism: P8 — services from `@likec4/language-server/module` with `NoFileSystem` and `NoLikeC4ManualLayouts` (D150), one workspace folder, each loaded file name mapped to a document URI and back through an explicit name table (no prefix slicing: names with `\`, spaces or non-ASCII must map back to the loaded key), `DocumentBuilder.build` with validation, error-severity diagnostics as located records (1-based line; column = `range.start.character + 1`), then `diagrams()` per project inside one `try`: an escaping exception is one unlocated record with its message only (D152); drift cannot occur (no manual layouts). LikeC4's log output during the check (a view that fails to lay out is logged) is kept off stdout/stderr. `validateLikeC4` / `expectValidLikeC4` call the check and format records as today (`<file>:<line>: <message>`, layout message prefix unchanged); the multi-project form (`options.projects`) is kept (FOR-PLAN); the other helpers keep their own model-building workspace. No `vitest` import in `src`. Requires planning (how LikeC4's logger is silenced: `configureLanguageServerLogger` from the package root or `@likec4/log` — verify with a probe; how `URI` is obtained so that the bundled langium interoperates — Risks). Gate (class): `tests/likec4-validate-oracle.test.ts` (35 samples, the reference fixtures including `refs-import` with its two projects) passes unchanged against the recorded CLI literals (INV-4); the built `dist` runs the check on a valid and an invalid sample with the same records as the source run; a sample whose view LikeC4 fails to lay out produces no record and no output on stdout/stderr.

### Phase — US-1, US-2, US-3: commands from the tables

- **T005 — Flag encoding by value kind.** `src/cli/encoding.ts` (new). Mechanism: from a field's kind, the commander option(s) and the decoder: `string` → `--f <text>` taken literally (`null`, `''` are text); `nullableString` → plus `--unset-f` (passes `null`; both given → rejection naming `--f`); `presenceBoolean` → presence flag; `valueBoolean` → `--f <true|false>`, any other spelling rejected; `number` → `--f <number>`; `tags` → D156 (whole-value JSON array of strings = that list; else comma list, trimmed, empty segments dropped; `''` = not given; `'[]'` = empty list); `json` → `JSON.parse` of the flag string. Kebab-case names (`viewId` → `--view-id`); a field name colliding with a shared flag (`dir`, `output`, `json`) fails at program build. Rejection path translation P3. Last value wins for a repeated flag (commander default, documented once). Gate (class): one parameterized test per kind over the encoding cases of US-1 and D156 (`''`, `'[]'`, JSON array, comma list, invalid JSON, `--f` with `--unset-f`, misspelled boolean, `--title null`, `--title ''`), each rejection exit 1, flag named, no file changed (INV-1).
- **T006 — The 34 generated write commands and the `--json` envelope.** `src/cli/operation-commands.ts` (new), `src/cli/program.ts`. Mechanism: for each table operation without a hand-kept command, a command named by kebab-case of the operation (`addView` → `add-view`), flags from T005 plus `--dir`, `--output`, `--json`; action: load → build mutation object (`op` + decoded fields) → `validateMutation` with the command root → shared runner (T002) → write in place unless `--output` → text output = the runner's lines, or `<operation>: done` when it has none (no summary line); `--json` → stdout only `{"operation": <apply name>, "result": <value or null>}`; any rejection on stderr only, nothing on stdout, exit 1 (D145). Help texts use neutral examples only (INV-5). Gate (class): for every generated command, a table-driven test: success writes files byte-identical to `apply` with the same single operation and passing `expectValidLikeC4`; a validation rejection exits 1 with nothing written; `--json` parses to the envelope (SC-002). Named cases of US-1 acceptance: an `includes` item containing commas, `update-view --unset-title`, `move-element --unset-parent`, `matchBidirectional` false next to an omitted selector field.
- **T007 — Field parity of the five existing commands.** `src/cli/operation-commands.ts`, `src/cli/program.ts`. Mechanism: P4 — `add-element`, `add-relationship`, `update-element`, `remove-element`, `remove-relationship` generated from the table with their kept flag names, required options and success lines; they gain every field of their operation (links, metadata, style, `file`, `placement`, kinds, direction, `cascade`, selector, position) and `--json`; `add-element --parent` / `--title` optional (model level; kind title, else name); with `--cascade` the runner's cascade lines follow the existing lines; `--tags` by D156 (INV-6 exception 4); `remove-relationship` passes the selector form. Rejections in the uniform form (P5). Gate (class): every existing invocation in `tests/cli/cli-standalone-commands.test.ts` and `tests/cli/cli.test.ts` keeps exit code, files and stdout (INV-6, SC-003); each new field of each of the five writes what `apply` writes; the D156 `--tags` cases on an existing command.
- **T008 — Read table and read commands.** `src/cli/read-commands.ts` (new), `src/cli/program.ts`. Mechanism: P7 read table (command, method, parameters with value kinds, address parameter or filter, text renderer); commands `get-relationships`, `get-specification`, `list-views`, `get-view`, `list-deployment-nodes`, `get-deployment-node`, `get-deployment-node-kind`, `list-deployment-instances`, `get-deployment-instance`, `list-deployment-relationships` next to the kept `list-elements` (`--kind`, `--parent`) and `get-element` (`--fqn`, `--source`); `--json` prints the method's value unchanged; `get-element --source --json` prints the source as a JSON string (D149, INV-6 exception 3); a `get-*` whose construct is missing exits 1 with the reason on stderr, nothing on stdout (D148); `get-specification` without a specification exits 0 (`--json`: `null`); empty lists exit 0. Requires planning (readable text form per read: one generic renderer vs per-command lines; kept text of `list-elements` / `get-element`). Gate (class): every read mode with `--json` parses to the library method's value for the same arguments (SC-008); the exit-code rules for each `get-*`; an unnamed view is in `list-views` and not addressable by `get-view`; the compile-time read/method assertion fails when a public method is unclassified.

### Phase — US-5, US-6, US-8: validation

- **T009 — Semantic validation method.** `src/mutator/mutator.ts`, `src/index.ts`. Mechanism: P9 — `validateModel` copies the current sources synchronously before its first `await` (D153), runs the T004 check on the copy (fresh services per call, so concurrent calls and separate instances are independent), returns the records; `layout: false` skips the view step; a failure to build the services rejects the promise (not a record). `ValidationRecord` exported. JSDoc documents verdict scope (D140, D150, D152). `validate()` untouched (INV-3, D139). Gate (class): the 35 oracle samples run through `validateModel` give verdict and `<file>:<line>` equal to the recorded CLI literals, warnings-only samples report nothing — one parameterized test whose expected side is the recorded literals, never the method's output (SC-004, INV-4); a mutation made while a call runs does not change its result; with `layout: false` only language-service records.
- **T010 — CLI `validate` on the semantic method.** `src/cli/validate-command.ts` (new), `src/cli/program.ts`. Mechanism: loads `--dir` (T003), calls `validateModel`; located record → `file:line:column: message`, unlocated → `message`, on stderr; exit 1 if any record, else exit 0 and the existing success line counting loaded files; `--json` → stdout only the record array (`[]` when valid); `--no-layout`; a failure to run → `Error: <reason>`, exit 1 (D142, D146). Gate (class): semantic error without syntax error → exit 1 with `file:line:column` (1-based column), `--json` parses to the same records; valid → exit 0 (`--json` `[]`); a file failing only on brace balance and accepted by LikeC4 → exit 0 (SC-005, INV-6 exception 1); the US-8 sample prints a numeric location (SC-007); "no files found" exit 1 naming the three extensions.
- **T011 — lc4m-28: end-of-file position in `validate()`.** `src/mutator/mutator.ts` (`fileErrors`). Mechanism: P10 — a parse error whose line or column is not a finite number is reported at the last line of the file (a trailing newline starts an empty last line) and the column after its last character; brace-balance line and messages unchanged (D155). Gate (class): `b.c4` with `model {\n  x = service {\n` → a line starting `b.c4:3:1: `, no `NaN` in any `validate()` output for files ending inside an open block (with and without a final newline, CRLF included) (SC-007, INV-3).

### Phase Polish — documentation, tables test, release preparation

- **T012 — README CLI section: policy, operation table, read table, encoding, validation; the US-4 test.** `README.md`, `tests/cli/cli-tables.test.ts` (new). Mechanism: README states the policy (every operation has a command; `apply` is the way to run several operations atomically), the operation → command table, the read command → method table (with `get-element`'s two modes; `serialize` excluded), the field encoding (D136/D147/D156, last value wins), output and `--json` (D145), `validate` and its parity scope (D154: walk of the whole tree vs LikeC4's skipped directories, project configuration, manual layouts not read), extensions (D143); the stale lines ("every newer option … through `apply` only", "Parse and validate all `.c4` files") replaced; `validateModel` documented in the library section. The test reads the two README tables and compares them with the exported operation table, the exported read table and the command set of `buildProgram()` per the D151 rule. Gate (class): adding an operation without a command, removing a table row, or adding a command missing from the tables turns the test red (US-4, SC-001).
- **T013 — Coverage document rows.** `docs/likec4-coverage.md`. Mechanism: legend bullets on the CLI and on `validate()` (line 14–15), "Outside the grammar: Semantic validation" (`validateModel`, CLI `validate`), "File extensions" (CLI loads all three), the config `include`/`exclude` row's "every `.c4` file" wording, "Planned order of work" (CLI parity done). Gate: `npm run lint` (grammar-rule check) green; no row claims more than the tests show.
- **T014 — CHANGELOG.** `CHANGELOG.md`. Mechanism: a new top section with Added (34 commands, read commands, field parity and `--json` of the five, `validateModel`, `--no-layout`, `.likec4` / `.like-c4`) and Changed listing every INV-6 exception 1–4, the `validate()` end-of-file position (lc4m-28), and the uniform rejection form of `remove-element` / `remove-relationship` (P5). Gate: each INV-6 exception and each Added item has an entry; no internal names (public repository).
- **T015 — Version 0.12.0 prepared, not published (last task).** `package.json`, `docs/likec4-coverage.md` (title paragraph version), `CHANGELOG.md` (section heading `[0.12.0]` with date). Mechanism: version strings only; no tag, no publish. Gate: `npm run lint` green (the coverage check compares the document version with `package.json`); full suite green in the documented parts; `npm run build` produces `dist/cli.mjs` that runs `validate` on a fixture.

## Streams and groups

| Stream | Repository (exactly one) | Group | Tasks in order | Group rationale |
|---|---|---|---|---|
| S1 | likec4-mutator | G1 Foundation | T001, T002, T003, T004 | the shared contracts every later task consumes: operation table and validator, runner, CLI program and loader, LikeC4 check |
| S1 | likec4-mutator | G2 Commands from tables | T005, T006, T007, T008 | one mechanism: a table entry → commander command with encoded flags and uniform output; reads use the same builder and encoding |
| S1 | likec4-mutator | G3 Validation | T009, T010, T011 | the semantic method, its CLI command and `validate()`'s position fix share the validation surface and its tests |
| S1 | likec4-mutator | G4 Docs and release | T012, T013, T014, T015 | documentation of the finished surface, the tables test that reads it, version last |

No solo groups.

## Dependencies and build order

- One stream; groups run sequentially in the order G1 → G2 → G3 → G4 (G3 may run before G2: it depends only on G1).
- Inside G1: T001 → T002 (runner types use the table) → T003 (moves `apply` onto the program builder) → T004 (independent of T001–T003; placed last in the group).
- G2 depends on T001, T002, T003 (external, foundational only). Inside: T005 → T006 → T007 → T008.
- G3 depends on T003, T004 (foundational only). Inside: T009 → T010; T011 independent.
- G4 depends on G2 and G3 (it documents and tests their surface); T015 is the last task of the run.

## Delivery strategy

- STOP & VALIDATE 1 after G1: the whole existing suite green with no expected-side change (apply, standalone commands, oracle) — the refactor is behaviour-neutral except extensions.
- STOP & VALIDATE 2 after G2: the parity table tests over all 39 operations green; `tests/cli` run in the documented part.
- STOP & VALIDATE 3 after G3: oracle samples through `validateModel`; built `dist/cli.mjs validate` on a valid and an invalid fixture.
- MVP = G1 + G2 (commands); G3 is independently shippable on G1.

## Risks and rollback

- Bundled langium in `dist`: the check's `URI` (and other langium values) come from the bundled copy while the services use the language server's langium; a mismatch would show only in the built package. Gate T004/T015 runs the check from `dist`; fallback is to obtain URIs through the language server's own services (no new dependency).
- LikeC4 logging: a layout failure is logged by LikeC4; if the silencing route does not hold in the built CLI, stdout/stderr get extra lines (US-5). T004 probe and gate.
- Test load on the shared host: about 50 commands × 3 cases; the in-process runner (T003) carries them, subprocess tests are kept few; runs only via `safe-vitest.sh`.
- Semantic validation cost (0.3–0.6 s for two small models in spike 01) per `validate` call; `--no-layout` for large models.
- Rollback: each group is a separate set of commits on `main`; G1's refactor is behaviour-neutral and is reverted as a whole if STOP 1 fails.

## Known residuals

- P5 (uniform rejection wording of `remove-element` / `remove-relationship`): resolved upstream — spec INV-6 exception (5), D159 (spec Changelog 2026-10-23); CHANGELOG Changed by T014.
- P8: the check's project-folder parameter is used today only by the test oracle (FOR-PLAN); lc4m-15.32 (project configuration) is its product consumer · class: test-guideline tension (§5 "access opened only for a test") · carrier: plan critique.
- RES-spec-1 (D156 `tags` rule for the five existing commands): honoured by T005 (one decoder for every command) and T007 (gate: D156 cases on an existing command; INV-6 exception 4), CHANGELOG T014 · carrier: plan critique.

## Spec traceability

| Spec id | Task(s) |
|---|---|
| US-1 | T001, T002, T005, T006 |
| US-2 | T007 |
| US-3 | T008 |
| US-4 | T012 (with tables from T001, T008) |
| US-5 | T004, T009 |
| US-6 | T010, T012 (parity scope in README) |
| US-7 | T003 |
| US-8 | T011, T010 (CLI numeric location) |
| INV-1 | T003, T005, T006, T007 |
| INV-2 | T001, T002, T006 |
| INV-3 | T009 (no change to `validate()`), T011 |
| INV-4 | T004, T009 |
| INV-5 | T006, T012 |
| INV-6 | T002, T003, T007, T008, T010, T014 |
| INV-7 | T003 |
| SC-001 | T012 |
| SC-002 | T005, T006 |
| SC-003 | T007 |
| SC-004 | T009 |
| SC-005 | T010 |
| SC-006 | T003 |
| SC-007 | T010, T011 |
| SC-008 | T008 |
| SC-009 | T013, T014, T015 |
| D135 | T001, T006 |
| D136 | T005 |
| D137 | T007 |
| D138 | T008 |
| D139 | T009 |
| D140 | T004, T009 |
| D141 | T004 |
| D142 | T010 |
| D143 | T003, T012 |
| D144 | T011 (lc4m-28 in this run) |
| D145 | T002, T006, T007 |
| D146 | T010 |
| D147 | T005 |
| D148 | T008 |
| D149 | T008 |
| D150 | T004, T009 |
| D151 | T012 |
| D152 | T004, T009 |
| D153 | T009 |
| D154 | T010, T012 |
| D155 | T011 |
| D156 | T005, T007 |
| RES-spec-1 | T005, T007, T014 |
| FOR-PLAN (oracle multi-project form, no test imports in src) | T004 |
