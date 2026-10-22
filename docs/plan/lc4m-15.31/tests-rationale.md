# Test-plan rationale: lc4m-15.31, v3 (for executors; not for critics)

Matrix: `tests-v3.md`. v3 follows the spec/plan repair D161–D165 (plan order T001 → T002 → T004 → T003). This file explains choices; the checks themselves are in the matrix.

## Ownership projection (stage 5)

| Test file | Rows | Waits for code | Projection |
|---|---|---|---|
| `tests/cli/cli-program.test.ts` | 1–4 | T003 | rows 1–2 need `tests/helpers/likec4-model.ts`; its supplier is T004 (it changes the file), which by D161 now precedes T003 → supplier not later than the anchor T003 → embedded in T003 |
| `tests/cli/cli-operation-commands.test.ts` | 5–12 | T005, T006 | two tasks → test task after T006 (G2) |
| `tests/cli/cli-standalone-commands.test.ts` | 13–20 | T007 | embedded in T007 |
| `tests/cli/cli-read-commands.test.ts` | 21–23 | T008 | embedded in T008 |
| `tests/likec4-validate-oracle.test.ts` | 24–28 | T009 | embedded in T009 (the 35 samples and `cliErrorLocations` already live in this file; a new describe reuses them, so no shared sample module is needed) |
| `tests/cli/cli-validate.test.ts` | 29–33 | T010 | embedded in T010 |
| `tests/integration/validation.test.ts` | 34 | T011 | embedded in T011 |
| `tests/cli/cli-tables.test.ts` | 35 | T012 | embedded in T012; needs T001, T006, T008 (all earlier) |

Four checks: each file's rows are all `wave`; no `final` rows; no task in "Waits for code" / "Needed for the run" depends on the owner of its row (the only test task sits after T006 and nothing in the plan depends on it); each row is in exactly one file.

## Why the encoding is tested through commands, not on the decoder (T005) — now plan D162

The plan gates T005 with "decoder only" tests on `src/cli/encoding.ts`. That module is internal and, at T005's commit, no product code calls it yet (T006 is the first caller). CLAUDE_TEST_GUIDELINES §5 allows testing an internal unit only when other product code already calls it, and the contract the spec states is "flags → same files as `apply`" (US-1 acceptance), visible only through a command. Testing through the generated commands (rows 9–12) checks the same cases once, at the level the spec defines, and avoids a decoder test plus a command test of the same cases. Consequence (plan D162): T005 is gated by build and lint; its code is verified by rows 9–12 (generated commands, test task of `cli-operation-commands.test.ts`) and 13, 16, 19 (kept commands, T007).

## Expected sides

- "Equals `apply`": the spec's acceptance defines parity with `apply`; `apply` is not the code under test of these rows (the command layer is). Because both go through the shared runner, the oracle `expectValidLikeC4` is added as an independent check.
- `--json` result: the library method called directly, not the CLI.
- Row 20 (kept success lines): D137 makes today's lines the contract; the literal lines are the spec's contract, not a snapshot of new output.
- Row 24/28: `cliErrorLocations` (recorded from the `likec4` 1.59.4 CLI before this run).
- Row 25/29 column 8: the 1-based column of `ghost` in the sample text. Probe at stage 4 (LikeC4 services, `range.start`): `{"line":3,"character":7}` for both diagnostics — consistent with the text.
- Row 34: end-of-file positions computed by hand from the spec rule.
- Row 26 input (probed at stage 4 with the LikeC4 services from source):
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
  `getErrors()` is empty; `diagrams()` returns `index` and `d`, and `d` carries its sequence layout; `Sequence view does not support nested actors` goes to stderr. It comes from `console.error` in `@likec4/layouts` `calcSequenceLayout` (`dist/chunks/sequence.mjs`): the layout skips the edge with a nested actor and goes on. So it is a warning of a view that is laid out, not a per-view layout failure; by D165 all console output LikeC4's code writes during the check stays off the CLI's streams, so this input is the discriminating sample: row 26 (library: no record) and row 33 (CLI subprocess: nothing on stderr, stdout only the success line / `[]`). Without the console capture of T004 row 33 is red (the message goes to stderr, probed). A genuine per-view layout failure (D150 "logged, not an error") still has no known input; it is covered by D165's wider rule through this sample, not by a sample of its own. With only the `u.v -> s` step nothing is printed (also probed), so the sample needs both steps.
- Row 33: subprocess because `console.error` / direct stream writes of LikeC4 bypass the injected writers of the in-process program.
- Row 16 literals: stage-4 run of today's CLI on `tests/fixtures/minimal`: `apply` prints `Error: mutations[0].fqn: "does.not.exist" is not an element declared in the loaded files` and `Error: mutations[0].source: Relationship not found: source=ghost target=phantom`; `remove-element` / `remove-relationship` print `Error: Invalid fqn: …` / `Error: Invalid source: …`. The row asserts the relation to `apply`'s line (detail text taken from `apply` at test time), not these texts as literals.

## Existing tests searched (transitive)

- Callers of `src/cli.ts` (subprocess): all `tests/cli/*.test.ts`, `tests/mutator/add-element-references.test.ts` (apply only). Only `cli-standalone-commands.test.ts` asserts a changed text: `--tags:` for the two `update-element --tags` rejections → row 13 (fix). Others assert exit status, `toContain` of kept lines, or `apply` output (unchanged, T002 gate).
- `validate` CLI: only `tests/cli/cli.test.ts` (`toContain('valid')` on `fixtures/minimal`; probe: LikeC4 reports no error for it → stays green).
- `get-element --source`: `cli.test.ts` without `--json` (unchanged).
- `remove-element` / `remove-relationship` rejections: `cli-standalone-commands.test.ts`, `cli-apply-relationship-selector.test.ts` row 142 — status only, not text → unaffected by INV-6 exc. 5.
- "No .c4 files found", brace-balance line in CLI output, `NaN`: no test asserts them.
- `validate()` tests (`tests/integration/validation.test.ts`, `mutation-scenarios.test.ts`): regex `^bad\.c4:\d+:\d+:` and brace checks; T011 does not break them.
- Oracle helper `tests/helpers/likec4-model.ts` (used by 52 test files): T004 keeps `validateLikeC4` / `expectValidLikeC4` output format → no fix rows; T004's gate is these files green unchanged.
