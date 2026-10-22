# Spec: CLI parity with apply, semantic validation like `likec4 validate`, `.likec4` / `.like-c4` in the CLI

**Date** 2026-10-22 · **Status** ready for planning (owner's round limit) · **Task**: lc4m-15.31 (with lc4m-28) · **Affects**: likec4-mutator (library and CLI)
**Type**: feature · **Based on**: lc4m-15.30 spec (error contract D111–D114, write checks), the in-process validation oracle (`tests/helpers/likec4-model.ts`, audit of 35 samples against the `likec4` 1.59.4 CLI)

## Problem / Goal

The CLI covers a fraction of the library: 5 of 39 `apply` operations have a command, the existing commands lack fields their `apply` operations accept, and most read methods have no command. `validate` reports syntax errors only, so a model LikeC4 rejects (unresolved reference, duplicate name, undeclared kind or tag, invalid relationship) is reported valid. The CLI loads only `.c4` files, so `.likec4` and `.like-c4` files of a project are silently left out. A syntax error at the end of a file is reported at position `NaN:NaN` by `validate()` (lc4m-28).

Goal: every library operation is usable from the CLI with the same fields and the same rejections as `apply`; the library and the CLI report what `likec4 validate` 1.59.4 reports for the loaded files; the CLI reads and writes all three LikeC4 file extensions.

## Scope

**In:**
- A single-purpose command for every `apply` operation, with every field of that operation (US-1, US-2).
- Read commands for the library's public model reads (US-3).
- One documented table of operations and commands and one of read commands; a test that the tables, the command set, the `apply` operation set and the read-method set agree (US-4).
- An asynchronous semantic validation method in the library (US-5) and a CLI `validate` built on it (US-6).
- Loading and writing `.c4`, `.likec4` and `.like-c4` files in every CLI command (US-7).
- Numeric positions for a syntax error at the end of a file in `validate()` (US-8, lc4m-28).
- README, CHANGELOG, coverage rows named in the task, version 0.12.0 prepared (not published).

**Not in:**
- LikeC4 project configuration (`likec4.config.json`, include / exclude, nested projects): lc4m-15.32. The CLI keeps walking the whole `--dir` tree (D143); the difference from LikeC4's own directory walk is documented (US-6).
- Validation after every write command: write operations already reject what they would introduce (README "Rejected writes"); `validate` is the way to check a whole model.
- New library write operations or new fields of existing operations.
- A `serialize` command: the CLI writes files; there is no use for printing serialized text separately.
- Manual-layout files (`.likec4.snap` / manual layouts): not read by validation (D150).
- A new runtime dependency (spike 01 shows none is needed).

**Deferred:** none.

## Scenarios and acceptance

### US-1 — Every `apply` operation has a command (P1)
The command name is the kebab-case form of the operation name (`addView` → `add-view`, `updateViewStep` → `update-view-step`). Its flags are the operation's fields in kebab-case (`--view-id`, `--match-kind`) plus the shared CLI flags (`--dir`, `--output`, `--json`). A command runs exactly the library call the same `apply` operation runs, with the same field rules (D135).

**Field encoding (D136, D147)** — lossless for every value the operation accepts:
- a string field: `--field <text>`; the text is taken literally (`--title null` is the four-letter text, `--title ''` the empty string);
- a field that accepts `null` (null removes a property or, for `moveElement.parent`, means the model level): additionally `--unset-field`, which passes `null`; giving both `--field` and `--unset-field` is a rejection;
- a boolean whose `false` differs from its absence (the relationship selector's `matchBidirectional`): `--field <true|false>`; a boolean that only matters when true (`cascade`, `bidirectional`, `shared` and the like): a presence flag;
- a number field: `--field <number>`;
- the `tags` list (its items are identifiers) (D156): a value that is, as a whole, a JSON array of strings is that array; any other value is a comma-separated list, segments trimmed and empty segments dropped — today's parsing; an empty value (`--tags ''`) means the field is not given, as today; the empty list is `--tags '[]'`;
- any other list (view predicates such as `includes`, whose items may contain commas) and every object or list of objects (links, metadata, style, rules, steps, selector, position): a JSON value given as the flag's string.
A value that does not fit its encoding (invalid JSON, wrong shape, `true`/`false` misspelled) is a rejection naming the flag. A rejected field carries the same detail `apply` gives, with the flag (`--<flag>`) in place of the mutation path (`mutations[i].<field>`).

**Output and writing (D145)** — for the single-operation commands (the five existing and the 34 new ones; the batch `apply` command is unchanged, INV-6): without `--output` a command writes in place, as the five existing commands do. Text output of a new command is every line `apply` prints for that operation (including cascade lines and emptied-`par` lines when `apply` prints them), without `apply`'s summary line; when `apply` prints none, one line `<operation>: done`, where `<operation>` is the token `apply` uses. With `--json` (every single-operation command, the five existing ones included) stdout carries only `{"operation": <name>, "result": <the library method's value, or null when it returns nothing>}`, where `<name>` is the operation's `apply` name (`addElement`). A rejection prints its reason on stderr and nothing on stdout, with or without `--json`.

- **Acceptance:** Given a model and the fields of any `apply` operation, when the command runs with the same fields, the written files are byte-identical to what `apply` with that one operation writes. This holds in particular for: an `includes` item containing commas; `--unset-title` on `update-view` (the title is removed); `move-element` with `--unset-parent` (moved to the model level); `matchBidirectional` false next to an omitted selector field. Given an invalid field or encoding, the command exits 1, prints the reason naming the flag (`--<flag>`), and no file changes. Parity is held by one field table shared with `apply` (INV-2), not per command.

### US-2 — Existing commands keep their interface and reach field parity (P1)
`add-element`, `add-relationship`, `update-element`, `remove-element`, `remove-relationship` keep their names, flags and success text (`--id`, `--label`, `--tags` as a comma list; `Created element '…'` and the other existing lines) (D137). They gain every field their `apply` operation accepts that they lack (links, metadata, style, `file`, `placement`, kinds, direction, `cascade`, the relationship selector and position). Flags that `add-element` requires today but its operation does not (`--parent`, `--title`) become optional: omitted, they behave as the operation does without them (model level; kind title, else the name).
The `tags` rule of US-1 (D156) applies to them too: invocations that write files today write the same files (`--tags ''` still means not given, a comma list parses as today); a value that is, as a whole, a JSON array of strings (including `'[]'`) is now accepted as that list (INV-6, exception 4). They also gain `--json` (D145). Their text output stays as today, and with `--cascade` the cascaded constructs are listed after the existing lines in the same form `apply` lists them.
- **Acceptance:** for each of the five, every field of the matching `apply` operation is reachable by a flag and writes what `apply` writes; existing invocations keep their exit code, files and text output (on a tree whose LikeC4 files are all `.c4`, INV-6).
- **Current / Expected / Unchanged:** Current — 5 commands with a subset of fields, two required flags the operation does not require. Expected — the same 5 with all fields, those flags optional. Unchanged — flag names, defaults (write in place without `--output`), output lines, exit codes.

### US-3 — Read commands (P1)
Each public model read of the library (methods of the mutator; `serialize` and the lower-level `C4Query` excluded) has a command (D138): `get-relationships`, `get-specification`, `list-views`, `get-view`, `list-deployment-nodes`, `get-deployment-node`, `get-deployment-node-kind`, `list-deployment-instances`, `get-deployment-instance`, `list-deployment-relationships`, next to the existing `list-elements` / `get-element`. A new command's flags are the method's parameters (its filter fields, or the addressed id), with the encoding of US-1; the existing `list-elements` (`--kind`, `--parent`) and `get-element` (`--fqn`) keep their flag names. Output: readable text, or with `--json` the value the method returns, unchanged. Element source keeps its existing route, `get-element --source` (`getElementSource`; raw text, as today); `--source --json` prints only that text as a JSON string — a change of today's output, where `--source` ignores `--json` (D149, INV-6).
- **Exit codes (D148):** a `get-*` command whose addressed construct does not exist exits 1 with the reason on stderr and nothing on stdout (`get-element`, `get-view`, `get-deployment-node`, `get-deployment-instance`, `get-deployment-node-kind`). `get-specification` on a model with no specification succeeds (exit 0; `--json` prints `null`). An empty list exits 0. An unnamed view is listed by `list-views` and is not addressable by `get-view`.
- **Acceptance:** Given a model, a read command with `--json` prints JSON that parses to the value the library method returns for the same arguments; the exit-code rules above hold.

### US-4 — Tables of operations and read commands (P2)
The README states the policy (every operation has a command; `apply` remains the way to run several operations atomically) and two tables: every `apply` operation with its command, and every read command with its library method. One rule (D151): every `apply` operation has exactly one command; every command other than the read commands, `validate` and `apply` maps to exactly one operation; every read command mode maps to one public read method of the mutator, and every such method has one — `get-element` has two modes (`getElement`, and `getElementSource` with `--source`); `serialize` is excluded. A test fails when the operation table, the read table, the command set, the operation set or the read-method set disagree.
- **Acceptance:** adding an `apply` operation without its command, removing a table row, or adding a command missing from the tables turns the test red.

### US-5 — Semantic validation in the library (P1)
A new asynchronous method (`validateModel`, with an option to skip the view step) reports what `likec4 validate` 1.59.4 reports for the loaded files (D139, D140, D150):
- every diagnostic LikeC4's language services give error severity, as a **located record**: file name as loaded, 1-based line, 1-based column (from the diagnostic's range start), message;
- an exception escaping the computation and layout of views, as an **unlocated record**: the exception's message only — no file or line is invented (D152);
- a view LikeC4 fails to lay out without failing the whole step is logged by LikeC4 and is **not** an error, as for the reference; that log — and any other console output LikeC4's code writes during the check (for example the sequence layout's warning about nested actors) — does not reach the CLI's stdout or stderr (D165); manual-layout drift cannot occur because manual layouts are not read (D150).
Warnings are not errors. Each record says whether it comes from the language services or from view computation. An option skips the view computation and layout step; then only language-service diagnostics are reported.
- The method checks the sources as they are when it is called; mutations made while it runs do not change that result; concurrent calls on one instance and calls on separate instances are independent (D153).
- A failure to run the check itself (the language services cannot be built) rejects the call; it is not a validation record.
- `validate()` keeps its current meaning: synchronous, syntax only (INV-3).
- **Acceptance:** on the 35 oracle samples the method's verdict (valid / invalid) and its error locations (file, line) equal the literals recorded from the `likec4` 1.59.4 CLI; it reports nothing on the warning-only samples; a parameterized test covers all of them.

### US-6 — CLI `validate` (P1)
`validate` reports the records of US-5 for the files the CLI loaded from `--dir` (D142, D146): one line per located record `file:line:column: message` (1-based column), one line per unlocated record `message`, on stderr as today; exit 1 when any record exists, exit 0 and the existing success line (counting the loaded files) otherwise. With `--json`, stdout carries only the array of records (empty when valid; located and unlocated records distinguishable) and stderr stays empty, except `Error: <reason>` when the check cannot run. A flag (`--no-layout`) skips the view step. A failure to run the check prints `Error: <reason>` on stderr and exits 1.
- **Parity scope (D154):** parity with `likec4 validate` is for the files this CLI loaded. LikeC4's own directory walk skips some directories (`node_modules`, `.git`, `.svn`, `.yarn`, `.pnpm`) and applies project configuration; this CLI walks the whole `--dir` tree (D143). Manual-layout files are not read, so layout drift is never reported. A tree that contains such directories, a project configuration or manual layouts can therefore disagree with `likec4 validate`; README states it, and lc4m-15.32 owns project configuration.
- **Acceptance:** Given a model with a semantic error and no syntax error, `validate` exits 1 and prints the error as `file:line:column` (1-based column); `--json` output parses to the same records; a valid model exits 0 (`--json`: `[]`).
- **Current / Expected / Unchanged:** Current — `validate()` text: syntax errors with the library's own messages and a brace-balance line. Expected — exactly LikeC4's records (syntax included, LikeC4's message text, no brace-balance line). Unchanged — exit code 1 on any LikeC4 error, exit 0 and (without `--json`) the success line for a model LikeC4 accepts, the "no files found" failure (exit 1, stderr; its text names the three extensions). A file whose only error under the old `validate` was the brace-balance line and that LikeC4 accepts now exits 0. These are behaviour changes of the CLI (CHANGELOG, Changed; INV-6).

### US-7 — `.likec4` and `.like-c4` files (P1)
Every CLI command loads files with the extensions LikeC4 reads (`.c4`, `.likec4`, `.like-c4`, taken from LikeC4's language metadata, not a literal list in the CLI) from the `--dir` tree, and writes each changed file under its own name and extension (D143). A directory mixing extensions is one model: references between files of different extensions resolve, and file-order rules (default file of a write) treat them alike.
- **Acceptance:** Given a directory with one file of each extension referring to each other, a read command, a write command and `apply` all see one model; the written files keep their names; the output passes `expectValidLikeC4`.

### US-8 — Syntax error at end of file in `validate()` (P2, lc4m-28)
The library's `validate()` reports a syntax error whose token carries no position (a file ending inside an open block) at a real 1-based position — the end of the file: the last line (a trailing newline starts an empty last line) and the column after its last character — in its existing `file:line:column: message` form; it never prints `NaN`. The brace-balance line and the other messages are unchanged (D155). The CLI `validate` reports LikeC4's records for the same file (US-6); the two channels do not have to share message text or column.
- **Acceptance:** for `model {\n  x = service {\n` in `b.c4`, `validate()` returns a line starting `b.c4:3:1: ` and no `NaN`; CLI `validate` prints a numeric location for the same file.

## Architecture overview

### Load-bearing decisions
| Id | Decision | Why | Rejected |
|---|---|---|---|
| D135 | A command per `apply` operation, derived from the operation's field table | parity by construction; a new operation cannot miss its command (US-4 test) | hand-written commands for a subset + apply-only list; one generic `op` command |
| D136, D147, D156 | Lossless flag encoding: literal text, `--unset-<field>` for null, `true`/`false` value flags where false matters, `tags` as JSON array or today's comma parsing (empty = not given, `[]` = empty list), JSON for the rest; rejections carry `apply`'s detail with the flag path | every value the operations accept is expressible, existing invocations unchanged | JSON for every field (unusable for simple fields); a mini-syntax per type; empty value = empty list (changes today's `--tags ''`) |
| D137 | The 5 existing commands keep names, flags and output; gain the missing fields and `--json`; flags the operation does not require become optional | no breaking change | renaming to the generated form; apply-style output for them |
| D138, D148, D149 | A read command per public model read, flags = method parameters, `--json` = the method's value; missing address exit 1, empty specification exit 0; source through `get-element --source` | readers get the library's contract unchanged | one `query <what>` command; a separate source command |
| D139 | `validate()` unchanged; a new async semantic method | not breaking; internal synchronous callers keep working | changing `validate()`; an option on `validate()` |
| D140, D150, D152 | Errors = LikeC4 error-severity diagnostics + an exception escaping view computation and layout; per-view layout failures are not errors; manual layouts are not read; unlocated failures have no invented location | the reference's verdict | treating every layout problem as an error |
| D141 | One implementation of the LikeC4 check, used by the library and the test oracle | they cannot drift; the 35-sample test keeps an independent expected side (CLI literals) | two copies |
| D143, D154 | Extensions from LikeC4's metadata; directory walk unchanged; parity scoped to loaded files | follows LikeC4's extensions; no change to which directories are read until project configuration is supported | adopting LikeC4's directory skip now |
| D145 | New write commands print every line `apply` prints for that operation (cascade lines included), or `<operation>: done`; every single-operation write command (not `apply`) has `--json`: stdout only `{"operation": <name>, "result": <value or null>}`; rejections on stderr only; in-place writing without `--output` | one machine form for every write, including methods that return nothing | the method's raw return value (undefined for void methods) |
| D146 | CLI `validate` prints LikeC4's records only | the verdict equals `likec4 validate` | adding the library's own syntax lines to the CLI output |
| D151 | One rule for the operation and read tables and their test | US-4 and SC-001 must not disagree | two wordings |
| D153 | Validation checks the sources at call time; concurrent calls independent | an async method on a mutable object needs a defined snapshot | unspecified |
| D155 | lc4m-28 is fixed in `validate()`'s own position output; the CLI uses LikeC4's records | the two channels are different sources | one shared formatter |

### Component boundaries
- **CLI** — command definitions, flag parsing and encoding, output formats, directory loading and writing. Owns no field rule.
- **Operation field table and per-operation validation** — today inside the `apply` file parser; becomes the single source for both `apply` and commands (shape checks, unknown-field rejection, file-independent value checks).
- **Library** — operations, reads, `validate()`, the new semantic method.
- **LikeC4 check** — builds LikeC4 language services in memory for the loaded files, collects error diagnostics, computes and lays out views; used by the semantic method and by the test oracle (which also keeps its multi-project form for its existing tests).

### Key invariants
- **INV-1** A rejected command writes nothing: every file is byte-identical, exit code 1.
- **INV-2** For every `apply` operation, its command accepts exactly the operation's fields plus the shared CLI flags (`--dir`, `--output`, `--json`) and applies the same rules; the same fields produce the same files.
- **INV-3** `validate()` keeps its signature and meaning (synchronous, syntax errors, brace balance); only its `NaN` position is fixed (US-8).
- **INV-4** The semantic method's verdict and locations equal `likec4 validate` 1.59.4 on the oracle samples; the test's expected side is the recorded CLI output, never the method's own output.
- **INV-5** Generic: no kind, tag, key or color is hard-coded in commands, help texts or examples beyond neutral ones.
- **INV-6** Existing CLI invocations on a tree whose LikeC4 files are all `.c4` keep their behaviour (names, flags, defaults, files, output lines, exit codes). Exceptions, each listed in CHANGELOG (Changed): (1) `validate` reports LikeC4's records — more errors, LikeC4's message text, no brace-balance line, so a file failing only on brace balance and accepted by LikeC4 now exits 0; (2) every command also loads `.likec4` and `.like-c4` files, so a tree containing them is a different model, the success line of `validate` counts them, and the "no files found" text names the three extensions; (3) `get-element --source --json` prints a JSON string instead of raw text; (5) rejections of the existing commands carry `apply`'s field path with the flag in place of the mutation path (`--fqn: …` for `remove-element` / `remove-relationship`, which print the library's message today; `--tags[1]: …` where today `--tags: …` is printed); (4) a `--tags` value of the five existing commands that is, as a whole, a JSON array of strings (including `'[]'`) is now that list, where today it was split on commas.
- **INV-7** A loaded file is written back under its own relative path and extension; files that did not change are written byte-identical (as today).

### Integration points and contracts
| Contract | Consumer | Change |
|---|---|---|
| CLI commands and flags | scripts, users | additive, except the INV-6 exceptions (Changed) |
| `apply` mutations file | scripts | unchanged |
| Library public API | library users | additive: semantic validation method and its record type |
| `@likec4/language-server` in-memory services | the LikeC4 check | already a dependency; no new one |

### Significant non-functional constraints
- No network. No new runtime dependency (spike 01: services and the wasm layout work from a plain Node process with the current dependencies).
- Semantic validation cost: language services build plus view layout; the spike measured 0.3–0.6 s for two small models on this machine (`spikes/01-semantic-validate-node.ts`). The option to skip the view step exists for large models.

### Rejected alternatives
See the decisions table.

## API / CLI surface (from the code)
| Surface | Today | After |
|---|---|---|
| Commands | `validate`, `list-elements`, `get-element`, `add-element`, `add-relationship`, `update-element`, `remove-element`, `remove-relationship`, `apply` | + one command per remaining `apply` operation (34) + 10 read commands (US-3) |
| `apply` operations | 39 | unchanged |
| Library | `validate(): string[]` (sync, syntax) | + async semantic validation returning records |
| Loaded files | `.c4` | `.c4`, `.likec4`, `.like-c4` |

## Data / entities / migrations
No persisted data. The validation record: origin (language services | view computation), message, and — for a located record — file (relative name as loaded), line (1-based), column (1-based).

## Constraints
- Security: write commands keep the existing path-traversal guard of output writing.
- Observability: CLI output only; no logs or metrics (library + CLI, no service).

## Edge cases, failures, concurrency
- A flag given twice: the last value wins, as it does today for the existing commands; the same for every command, documented once.
- A JSON-valued flag with invalid JSON → rejection naming the flag; nothing written.
- A field a command does not have (unknown flag) → rejection by the parser; nothing written.
- `--field` together with `--unset-field` → rejection naming the flag; nothing written.
- `--json` on a `get-*` command whose construct is missing → exit 1, reason on stderr, nothing on stdout.
- Validation of files with syntax errors → LikeC4's syntax diagnostics are reported (it parses them itself); a failure of the whole view step is an unlocated record.
- A directory with no LikeC4 files → the existing "no files found" failure, naming the three extensions.
- Two files whose names differ only by extension (`a.c4`, `a.likec4`) → two files of one model, as LikeC4 treats them.
- Concurrency: the CLI is single-process; the library method follows D153.

## Success criteria
- **SC-001** Every `apply` operation has exactly one command; every command other than the read commands, `validate` and `apply` maps to exactly one operation; every read command mode maps to one public read method of the mutator and every such method has one (`get-element` has two modes; `serialize` excluded); the US-4 test checks this against the README tables.
- **SC-002** For each write command, a CLI test shows success (files equal the `apply` result for the same fields and pass `expectValidLikeC4`), a validation error (exit 1, nothing written, reason on stderr) and `--json` output (single-operation commands; `apply` unchanged); the encoding cases of US-1 and the `--tags` cases of D156 (`''` not given, `'[]'` empty list, a JSON array, a comma list) are covered.
- **SC-003** The five existing commands accept every field of their operation; their existing flags and output behave as before (INV-6 exceptions aside, including exception 4 for `--tags`).
- **SC-004** On the 35 oracle samples the semantic method's verdict and error locations equal the recorded `likec4` 1.59.4 output; warning-only samples report nothing.
- **SC-005** CLI `validate` exits 1 on a semantic error and prints `file:line:column` (1-based); `--json` is tested; a valid model exits 0. (The brace-balance-only case of US-6 and the unlocated record of D152 have no known input that produces them — probes found none; they are stated as behaviour and not tested.)
- **SC-006** A mixed-extension directory is tested for a read command, a write command and `apply`.
- **SC-007** A syntax error at end of file is reported at the end-of-file position by `validate()` (`b.c4:3:1` for the US-8 sample), and with a numeric location by CLI `validate`.
- **SC-008** Each read command mode is tested with `--json` against its library method's value (`get-element --source --json` against `getElementSource`), and the exit-code rules of US-3 are tested.
- **SC-009** `npm run lint` and the test suite pass; README, CHANGELOG and the coverage rows named in the task are updated; version 0.12.0 is prepared in package.json, the coverage document and the CHANGELOG, and not published.

## Clarifications
- Q: which operations get a command? → A: all (D135).
- Q: how are fields passed? → A: lossless encoding of US-1 (D136, D147, D156).
- Q: does `validate()` change? → A: no, except the `NaN` fix; a new async method (D139, D155).
- Q: what is an error? → A: what `likec4 validate` fails on (D140, D150, D152).
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
7. README tables and policy, the US-4 test, CHANGELOG, coverage rows, version.

## Changelog
- 2026-10-23 · INV-6 gains exception (5): rejections of `remove-element` / `remove-relationship` name the flag like every other command (found while planning: today they print the library message); the method and flag names `validateModel` / `--no-layout` are fixed (US-5, US-6) · why: the plan author found both unnamed · redo below: plan (already written with them), test plan.

- 2026-10-23 · US-5: console output written by LikeC4's code during the check (not only the per-view layout log) stays off the CLI's stdout and stderr (D165) · why: the test-plan author found a real input (a sequence view with a nested actor) where LikeC4's layout code prints a warning with `console.error` · redo below: plan T004, test plan.
- 2026-10-23 · INV-6 exception (5) widened to every rejection of the existing commands carrying `apply`'s field path (`--tags[1]:`); US-6 `--json` stderr stated; SC-005 drops the untestable brace-balance clause and names the untestable D152 case · why: the test-plan author found them (stage 4) · redo below: plan T007/T014 wording, test plan.

## Known residuals
- RES-spec-1 · MAJOR · owner's round limit · stage 2, round 3 · the `tags` rule of D156 had not reached US-2 / SC-003 / INV-6 for the five existing commands (grok r3 #1); fixed in the last round (US-2 note, INV-6 exception 4) — a fix of the last round, not critiqued → carrier: plan critique

## FOR-PLAN backlog
- Keep the test oracle's multi-project validation (used by the `refs-import` fixture test) when it switches to the shared check; product code must not import test-only modules (codex r1, [FOR-PLAN]).
