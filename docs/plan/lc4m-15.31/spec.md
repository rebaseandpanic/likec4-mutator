# Spec: CLI parity with apply, semantic validation like `likec4 validate`, `.likec4` / `.like-c4` in the CLI

**Date** 2026-10-22 · **Status** draft · **Task**: lc4m-15.31 (with lc4m-28) · **Affects**: likec4-mutator (library and CLI)
**Type**: feature · **Based on**: lc4m-15.30 spec (error contract D111–D114, write checks), the in-process validation oracle (`tests/helpers/likec4-model.ts`, audit of 35 samples against the `likec4` 1.59.4 CLI)

## Problem / Goal

The CLI covers a fraction of the library: 5 of 39 `apply` operations have a command, the existing commands lack fields their `apply` operations accept, and most read methods have no command. `validate` reports syntax errors only, so a model LikeC4 rejects (unresolved reference, duplicate name, undeclared kind or tag, invalid relationship) is reported valid. The CLI loads only `.c4` files, so `.likec4` and `.like-c4` files of a project are silently left out. A syntax error at the end of a file is reported at position `NaN:NaN` (lc4m-28).

Goal: every library operation is usable from the CLI with the same fields and the same rejections as `apply`; the library and the CLI report what `likec4 validate` 1.59.4 reports; the CLI reads and writes all three LikeC4 file extensions.

## Scope

**In:**
- A single-purpose command for every `apply` operation, with every field of that operation (US-1, US-2).
- Read commands for every public read method of the library (US-3).
- One documented table of operations and commands; a test that the table, the command set and the `apply` operation set agree (US-4).
- An asynchronous semantic validation method in the library (US-5) and a CLI `validate` built on it (US-6).
- Loading and writing `.c4`, `.likec4` and `.like-c4` files in every CLI command (US-7).
- Real positions for syntax errors at the end of a file (US-8, lc4m-28).
- README, CHANGELOG, coverage rows named in the task, version 0.12.0 prepared (not published).

**Not in:**
- LikeC4 project configuration (`likec4.config.json`, include / exclude, nested projects): lc4m-15.32. The CLI keeps walking the whole `--dir` tree (documented).
- Validation after every write command: write operations already reject what they would introduce (README "Rejected writes"); the CLI `validate` command is the way to check a whole model.
- New library write operations or new fields of existing operations.
- A new runtime dependency (the spike shows none is needed, `spikes/01-semantic-validate-node.ts`).

**Deferred:** none.

## Scenarios and acceptance

### US-1 — Every `apply` operation has a command (P1)
The command name is the kebab-case form of the operation name (`addView` → `add-view`, `updateViewStep` → `update-view-step`). Its flags are the operation's fields, kebab-case (`--view-id`, `--match-kind`). A command runs exactly the library call the same `apply` operation runs, with the same field rules (D135).
- **Field encoding (D136):** a string, number or boolean field is a plain flag; a list of strings is a comma-separated value or a JSON array; any other value (object, array of objects: links, metadata, style, rules, steps, selector, position, inline rule bodies) is a JSON value given as the flag's string. A value that is not valid JSON where JSON is required, or that has the wrong shape, is a rejection naming the flag.
- **Acceptance:** Given a model and the fields of any `apply` operation, when the command runs with the same fields, then the written files are byte-identical to what `apply` with that one operation writes. Given an invalid field, when the command runs, then it exits 1, prints the reason naming the flag (`--<flag>`), and no file changes. The class covers every operation: the parity of commands and `apply` operations is held by one field table (INV-2), not per command.

### US-2 — Existing commands keep their interface and reach field parity (P1)
`add-element`, `add-relationship`, `update-element`, `remove-element`, `remove-relationship` keep their names and existing flags (`--id`, `--label`, `--tags` as a comma list) (D137). They gain every field their `apply` operation accepts that they lack (links, metadata, style, `file`, `placement`, kinds, direction, `cascade`, the relationship selector and position).
- **Acceptance:** for each of the five, every field of the matching `apply` operation is reachable by a flag; existing invocations behave as before (Current = Expected for every existing flag).
- **Current / Expected / Unchanged:** Current — 5 commands with a subset of fields. Expected — the same 5 with all fields. Unchanged — existing flag names, defaults (write in place without `--output`), output lines.

### US-3 — Read commands (P1)
Every public read method of the library has a command with human-readable output and `--json` (D138): relationships, the specification, views (with rules and dynamic steps), deployment nodes, node kinds, instances, deployment relationships, next to the existing `list-elements` / `get-element`. `--json` prints the value the library method returns, unchanged.
- **Acceptance:** Given a model, when a read command runs with `--json`, then its output parses to the value the library method returns for the same arguments. A missing addressed construct (`get-*`) exits 1 with a reason; an empty list exits 0.

### US-4 — One table of operations and commands (P2)
The README states the policy (every operation has a command; `apply` remains the way to run several operations atomically) and lists every operation with its command. A test fails when an `apply` operation has no command, a command has no `apply` operation, or the README table and the set differ.
- **Acceptance:** adding an `apply` operation without its command, or removing a row of the table, turns the test red.

### US-5 — Semantic validation in the library (P1)
A new asynchronous method reports what `likec4 validate` 1.59.4 reports for the loaded files: every diagnostic LikeC4 gives error severity, plus a failure of computing or laying out views (D139, D140). Warnings are not errors. Each record carries the file name as loaded, a 1-based line, a 1-based column when LikeC4 gives one, the message, and its source (syntax / semantic / view). An option skips the layout step (faster; reports only what the language services report).
- `validate()` keeps its current meaning: synchronous, syntax only (INV-3).
- **Acceptance:** on the 35 oracle samples the method's verdict (valid / invalid) and its error locations (file, line) equal the literals recorded from the `likec4` 1.59.4 CLI; it reports nothing on the warning-only samples; a parameterized test covers all of them.

### US-6 — CLI `validate` (P1)
`validate` reports the records of US-5 for the files of `--dir` (D142, D146): one line per record `file:line[:column]: message`, exit 1 when any record exists, exit 0 and the existing success line otherwise. `--json` prints the records as an array. A flag skips the layout step.
- **Acceptance:** Given a model with a semantic error and no syntax error, `validate` exits 1 and prints the error at its file and line; `--json` output parses to the same records; a valid model exits 0.
- **Current / Expected / Unchanged:** Current — syntax errors and a brace-balance check only. Expected — exactly what LikeC4 reports (syntax included). Unchanged — exit codes, the success line, the "no files found" failure.

### US-7 — `.likec4` and `.like-c4` files (P1)
Every CLI command loads files with the extensions LikeC4 reads (`.c4`, `.likec4`, `.like-c4`, taken from LikeC4's language metadata, not a literal list in the CLI) from the `--dir` tree, and writes each changed file under its own name and extension (D143). A directory mixing extensions is one model: references between files of different extensions resolve, and file order rules (default file of a write) treat them alike.
- **Acceptance:** Given a directory with one file of each extension referring to each other, a read command, a write command and `apply` all see one model; the written files keep their names; the output passes `expectValidLikeC4`.

### US-8 — Syntax error at end of file (P2, lc4m-28)
A syntax error with no token position (for example a file ending inside an open block) is reported at a real 1-based position — the end of the file — never `NaN` (D144).
- **Acceptance:** `model {\n  x = service {\n` in `b.c4` reports `b.c4:<line>:<column>` with numbers; the same through CLI `validate`.

## Architecture overview

### Load-bearing decisions
| Id | Decision | Why | Rejected |
|---|---|---|---|
| D135 | A command per `apply` operation, derived from the operation's field table | parity by construction; a new operation cannot miss its command (US-4 test) | hand-written commands for a subset + apply-only list; one generic `op` command |
| D136 | Scalars as flags, string lists comma or JSON, everything else JSON in the flag | one rule for every field, no mini-syntax per type | repeated `--link url=…` flags; a file per field |
| D137 | The 5 existing commands keep names and flags, gain the missing fields | no breaking change | renaming to the generated form |
| D138 | A read command per public read method, `--json` = the method's value | readers get the library's contract unchanged | one `query <what>` command |
| D139 | `validate()` unchanged; a new async semantic method | not breaking; internal synchronous callers keep working | changing `validate()`; an option on `validate()` |
| D140 | Errors = LikeC4 error-severity diagnostics + view computation and layout failure; layout on by default, skippable | parity with `likec4 validate` verdicts | language services only |
| D141 | One implementation of the LikeC4 check, used by the library and the test oracle | they cannot drift; the 35-sample test keeps an independent expected side (CLI literals) | two copies |
| D143 | Extensions from LikeC4's language metadata; directory walk unchanged | follows LikeC4 when it adds one | a literal list |
| D145 | Write commands print the same success line as `apply` for that operation; `--json` prints the library method's result | scripts can read results without parsing prose | no machine output for writes |
| D146 | CLI `validate` prints LikeC4's records only (no separate brace-balance line) | the verdict equals `likec4 validate`; LikeC4 reports the syntax errors itself | adding the library's own syntax checks to the CLI output |

### Component boundaries
- **CLI** — command definitions, flag parsing and encoding, output formats, directory loading and writing. Owns no field rule.
- **Operation field table and per-operation validation** — today inside the `apply` file parser; becomes the single source for both `apply` and commands (shape checks, unknown-field rejection, file-independent value checks).
- **Library** — operations, reads, `validate()`, the new semantic method.
- **LikeC4 check** — builds LikeC4 language services in memory for the loaded files, collects error diagnostics, computes and lays out views; used by the semantic method and by the test oracle.

### Key invariants
- **INV-1** A rejected command writes nothing: every file is byte-identical, exit code 1.
- **INV-2** For every `apply` operation, its command accepts exactly the operation's fields and applies the same rules; the same fields produce the same files.
- **INV-3** `validate()` keeps its signature and meaning (synchronous, syntax errors).
- **INV-4** The semantic method's verdict and locations equal `likec4 validate` 1.59.4 on the oracle samples; the test's expected side is the recorded CLI output, never the method's own output.
- **INV-5** Generic: no kind, tag, key or color is hard-coded in commands, help texts or examples beyond neutral ones.
- **INV-6** Existing CLI invocations keep their behaviour (names, flags, defaults, output lines, exit codes), except `validate`, which reports more errors (CHANGELOG, Changed).
- **INV-7** A loaded file is written back under its own relative path and extension; files that did not change are written byte-identical (as today).

### Integration points and contracts
| Contract | Consumer | Change |
|---|---|---|
| CLI commands and flags | scripts, users | additive; `validate` reports semantic errors (Changed) |
| `apply` mutations file | scripts | unchanged |
| Library public API | library users | additive: semantic validation method and its record type |
| `@likec4/language-server` in-memory services | the LikeC4 check | already a dependency; no new one |

### Significant non-functional constraints
- No network. No new runtime dependency (spike 01: the services and the wasm layout work from a plain Node process with the current dependencies).
- Semantic validation cost: language services build plus layout; the spike measured about 0.3–0.6 s for two small models on this machine (`spikes/01-semantic-validate-node.ts`). The option to skip layout exists for large models.

### Rejected alternatives
See the decisions table.

## API / CLI surface (from the code)
| Surface | Today | After |
|---|---|---|
| Commands | `validate`, `list-elements`, `get-element`, `add-element`, `add-relationship`, `update-element`, `remove-element`, `remove-relationship`, `apply` | + one command per remaining `apply` operation (34) + read commands (US-3) |
| `apply` operations | 39 | unchanged |
| Library | `validate(): string[]` (sync, syntax) | + async semantic validation returning records |
| Loaded files | `.c4` | `.c4`, `.likec4`, `.like-c4` |

## Data / entities / migrations
No persisted data. The validation record: file (relative name as loaded), line (1-based), column (1-based, optional), message, source.

## Constraints
- Security: write commands keep the existing path-traversal guard of output writing.
- Observability: CLI output only; no logs or metrics (library + CLI, no service).

## Edge cases, failures, concurrency
- A flag given twice: the last value wins, as it does today for the existing commands; the same for every command, documented once.
- A JSON-valued flag with invalid JSON → rejection naming the flag; nothing written.
- A field a command does not have (unknown flag) → rejection by the parser; nothing written.
- `--json` on a read command whose construct is missing → exit 1, reason on stderr, nothing on stdout.
- Validation of files with syntax errors → LikeC4's syntax diagnostics are reported (it parses them itself); views of a broken model may fail to compute → reported as a view record.
- A directory with no LikeC4 files → the existing "no files found" failure, naming the three extensions.
- Two files whose names differ only by extension (`a.c4`, `a.likec4`) → two files of one model, as LikeC4 treats them.
- Concurrency: none (single process, files read once, written at the end).

## Success criteria
- **SC-001** Every `apply` operation has exactly one command and every command except the read commands, `validate` and `apply` maps to one operation; the test of US-4 checks it against the operation set and the README table.
- **SC-002** For each command, a CLI test shows success (files equal the `apply` result for the same fields and pass `expectValidLikeC4`), a validation error (exit 1, nothing written), and `--json` where the command has it.
- **SC-003** The five existing commands accept every field of their operation; their existing flags behave as before.
- **SC-004** On the 35 oracle samples the semantic method's verdict and error locations equal the recorded `likec4` 1.59.4 output; warning-only samples report nothing.
- **SC-005** CLI `validate` exits 1 on a semantic error and prints file:line; `--json` is tested; a valid model exits 0.
- **SC-006** A mixed-extension directory is tested for a read command, a write command and `apply`.
- **SC-007** A syntax error at end of file is reported with numeric positions (library and CLI).
- **SC-008** `npm run lint` and the test suite pass; README, CHANGELOG and the coverage rows named in the task are updated; version 0.12.0 is prepared in package.json, the coverage document and the CHANGELOG, and not published.

## Clarifications
- Q: which operations get a command? → A: all (D135).
- Q: how are structured fields passed? → A: JSON in the flag; string lists comma or JSON (D136).
- Q: does `validate()` change? → A: no; a new async method (D139).
- Q: is layout part of validation? → A: yes by default, skippable (D140).
- Q: run validation after writes? → A: no (Scope).
- Q: is lc4m-28 in this run? → A: yes (D144).
- **Testing:** unit only (vitest; library and CLI on LikeC4's real parser; CLI tests run `npx tsx src/cli.ts` as subprocesses) plus the coverage-table check inside `npm run lint`. Integration, e2e and smoke are not part of the project. Mutation testing runs once at the end of the run (StrykerJS, test VM). The LikeC4 oracle is the reference for every write; for the semantic method the reference is the recorded CLI output.

## Open questions
None.

## Decomposition preview
1. Operation field table and per-operation validation as one shared module (apply and commands).
2. Command generation from the table; field encoding; output and `--json` for writes.
3. Field parity of the five existing commands.
4. Read commands.
5. The LikeC4 check as product code; the semantic method; the oracle switched to it; CLI `validate`.
6. File extensions in loading and writing; lc4m-28 positions.
7. README table and policy, the US-4 test, CHANGELOG, coverage rows, version.

## Known residuals

## FOR-PLAN backlog
