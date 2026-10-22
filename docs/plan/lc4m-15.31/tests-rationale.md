# Test-plan rationale: lc4m-15.31, v4 (for executors; not for critics)

Matrix: `tests-v4.md`. v4 follows test-plan critique round 1 and the spec/plan repair D161–D166 (plan order T001 → T002 → T004 → T003). This file explains choices; the checks themselves are in the matrix.

## Ownership projection (stage 5)

| Test file | Rows | Waits for code | Projection |
|---|---|---|---|
| `tests/cli/cli-apply-views.test.ts` | 1 | T002 | embedded in T002 (existing file, new row; no helper needed) |
| `tests/cli/cli-program.test.ts` | 2, 3, 5–7 | T003 | row 4 moved to T007 (needs optional `--parent`/`--title`, completeness critic); rows 2–3 need `tests/helpers/likec4-model.ts` (T004, before T003 by D161) → embedded in T003 |
| `tests/cli/cli-operation-commands.test.ts` | 8–16 | T005, T006 | two tasks → test task after T006 |
| `tests/cli/cli-standalone-commands.test.ts` | 4, 17–26 | T007 | embedded in T007 |
| `tests/cli/cli-read-commands.test.ts` | 27–31 | T008 | embedded in T008 |
| `tests/likec4-validate-oracle.test.ts` | 32–38 | T009 | embedded in T009 |
| `tests/cli/cli-validate.test.ts` | 39–43 | T010 | embedded in T010 |
| `tests/integration/validation.test.ts` | 44 | T011 | embedded in T011 |

`tests/cli/cli-tables.test.ts` (old row 35) is gone: D166 moves the README table check to review.

Four checks: each file's rows are all `wave`; no `final` rows; no task in "Waits for code" / "Needed for the run" depends on the owner of its row (the only test task sits after T006 and nothing in the plan depends on it); each row is in exactly one file.

## Why the encoding is tested through commands, not on the decoder (T005) — now plan D162

The plan gates T005 with "decoder only" tests on `src/cli/encoding.ts`. That module is internal and, at T005's commit, no product code calls it yet (T006 is the first caller). CLAUDE_TEST_GUIDELINES §5 allows testing an internal unit only when other product code already calls it, and the contract the spec states is "flags → same files as `apply`" (US-1 acceptance), visible only through a command. Testing through the generated commands (rows 13–16) checks the same cases once, at the level the spec defines, and avoids a decoder test plus a command test of the same cases. Consequence (plan D162): T005 is gated by build and lint; its code is verified by rows 13–16 (generated commands, test task of `cli-operation-commands.test.ts`) and 17, 20, 23, 24 (kept commands, T007).

## Expected sides

- "Equals `apply`": the spec's acceptance defines parity with `apply`; `apply` is not the code under test of these rows (the command layer is). Because both go through the shared runner, the oracle `expectValidLikeC4` is added as an independent check.
- `--json` result: the library method called directly, not the CLI.
- Row 26 (kept success lines): D137 makes today's lines the contract; the literal lines are the spec's contract, not a snapshot of new output.
- Row 32/36: `cliErrorLocations` (recorded from the `likec4` 1.59.4 CLI before this run).
- Row 33/39 column 8: the 1-based column of `ghost` in the sample text. Probe at stage 4 (LikeC4 services, `range.start`): `{"line":3,"character":7}` for both diagnostics — consistent with the text.
- Row 44: end-of-file positions computed by hand from the spec rule.
- Row 34 input (probed at stage 4 with the LikeC4 services from source):
  ```
  specification { element actor
   element service }
  model { u = actor { v = actor }
   s = service
   u.v -> s }
  views { dynamic view d { variant sequence
   u.v -> s
   u -> s } }
  ```
  `getErrors()` is empty; `diagrams()` returns `index` and `d`, and `d` carries its sequence layout; `Sequence view does not support nested actors` goes to stderr. It comes from `console.error` in `@likec4/layouts` `calcSequenceLayout` (`dist/chunks/sequence.mjs`): the layout skips the edge with a nested actor and goes on. So it is a warning of a view that is laid out, not a per-view layout failure; by D165 all console output LikeC4's code writes during the check stays off the CLI's streams, so this input is the discriminating sample: row 34 (library: no record) and row 43 (CLI subprocess: nothing on stderr, stdout only the success line / `[]`). Without the console capture of T004 row 43 is red (the message goes to stderr, probed). A genuine per-view layout failure (D150 "logged, not an error") still has no known input; it is covered by D165's wider rule through this sample, not by a sample of its own. With only the `u.v -> s` step nothing is printed (also probed), so the sample needs both steps.
- Row 43: subprocess because `console.error` / direct stream writes of LikeC4 bypass the injected writers of the in-process program.
- Row 20 literals: stage-4 run of today's CLI on `tests/fixtures/minimal`: `apply` prints `Error: mutations[0].fqn: "does.not.exist" is not an element declared in the loaded files` and `Error: mutations[0].source: Relationship not found: source=ghost target=phantom`; `remove-element` / `remove-relationship` print `Error: Invalid fqn: …` / `Error: Invalid source: …`. The row asserts the relation to `apply`'s line (detail text taken from `apply` at test time), not these texts as literals.

## Existing tests searched (transitive)

- Callers of `src/cli.ts` (subprocess): all `tests/cli/*.test.ts`, `tests/mutator/add-element-references.test.ts` (apply only). Only `cli-standalone-commands.test.ts` asserts a changed text: `--tags:` for the two `update-element --tags` rejections → row 17 (fix). Others assert exit status, `toContain` of kept lines, or `apply` output (unchanged, T002 gate).
- `validate` CLI: only `tests/cli/cli.test.ts` (`toContain('valid')` on `fixtures/minimal`; probe: LikeC4 reports no error for it → stays green).
- `get-element --source`: `cli.test.ts` without `--json` (unchanged).
- `remove-element` / `remove-relationship` rejections: `cli-standalone-commands.test.ts`, `cli-apply-relationship-selector.test.ts` row 142 — status only, not text → unaffected by INV-6 exc. 5.
- "No .c4 files found", brace-balance line in CLI output, `NaN`: no test asserts them.
- `validate()` tests (`tests/integration/validation.test.ts`, `mutation-scenarios.test.ts`): regex `^bad\.c4:\d+:\d+:` and brace checks; T011 does not break them.
- Oracle helper `tests/helpers/likec4-model.ts` (used by 52 test files): T004 keeps `validateLikeC4` / `expectValidLikeC4` output format → no fix rows; T004's gate is these files green unchanged.

## v4 additions (critique round 1)

- Literal models for rows 1, 9, 22 (recorded with today's CLI at stage 4, `apply --output` to a directory outside `--dir`):
  - model A (rows 1, 9 `removeView`): `specification { element system }`, `model { app, other, app -> other }`, views `base` (`include app, other`), `nav` (`include app with { navigateTo base }`, `base` at 15:18), `dynamic view flow { parallel { app -> other } app -> other }`; exact text as in the stage-4 probe: lines 1–3 specification, 4–8 model, 9–25 views. `removeView base cascade` → `  removeView: removed 'base'` / `  removeView: cascade removed model.c4:15:18 (navigate-to)`.
  - model B (rows 1, 9 `removeViewStep`): A without `nav`; `removeViewStep flow { path: [0, 0] }` → `  removeViewStep: removed the emptied par block(s) [0]`.
  - model C (rows 1, 22): spec + `model { app = system; other = system }` + `view base { include app, other }` (line 10, `other` at column 18); `removeElement other cascade` → `  removeElement: removed 'other'` / `  removeElement: cascade removed model.c4:10:18 (predicate-item)`.
  The executor writes these models literally into the tests; the positions are the 1-based positions of the reference in that text, so a different layout needs re-derived literals.
- Row 22: the spec says cascade lines follow the kept lines "in the same form `apply` lists them"; the literal keeps `apply`'s two-space indent and `removeElement:` prefix. The kept `Removed element 'other'` line is not followed by `apply`'s `removed 'other'` line (only cascaded constructs are listed).
- Row 7 (path traversal): no CLI input reaches the guard; the row calls `writeOutput` from `src/cli/files.ts`, which product code (the program) calls — allowed by CLAUDE_TEST_GUIDELINES §5. ASSUMPTION: `LikeC4Mutator.fromFiles` accepts the key `../outside.c4` (it takes an arbitrary record); if it does not, the executor builds the mutator from a valid key and reports the obstacle rather than opening access.
- Row 37: vitest workers redirect `console` (ASSUMPTION from vitest's worker design; not probed), so a spy on `process.stderr.write` inside the test is not a reliable channel; the script is written to a temp directory at runtime (no repository path), imports `<repo>/src/index.ts` by absolute path and runs with `cwd` = repository root so `@likec4/*` resolve.
- Row 38: `caf\u00e9.c4` is written with a `\u` escape in the test source (public repository, English-only text). The six keys include two pairs that naive URI building collapses or confuses (`dir/a.c4` vs `dir\\a.c4`, `a b.c4` vs `a%20b.c4`).
- Row 31: list-elements text literals recorded at stage 4 from today's `src/cli.ts` on `tests/fixtures/minimal`.
- Row 13 discriminates `json` from `tags` for `includes`: `'*, app.api -> app.db'` is invalid JSON (rejection) but a valid two-item comma list under `tags` (would succeed with two include rules).
