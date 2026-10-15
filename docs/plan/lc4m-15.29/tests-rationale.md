# Test plan rationale: Read and edit LikeC4 views and dynamic view steps

- **R-1 Oracle independence.**
  - Every expected value is one of:
    - LikeC4 running on the same text (`parsedViews`, the computed-view accessor, `linkedViewReferences`, `validateLikeC4`);
    - a spike or probe literal;
    - a spec rule;
    - the test's own input text, including a hand-written expected view text that LikeC4 computes (CMP).
  - The library's output is never the expected value.
  - Read-backs through `getView` in writer rows are the subject under test, compared against the request or the oracle; they are not the expected value.
  - The helper has no standalone test. Its INV-4 exceptions are each shown by an OP inside a product row (I-2), so a helper defect breaks an OP.
  - T002 exposes the computed view data through a separate accessor and leaves `buildLikeC4Model(...).views[id]` as `{ title, folder }` (row 35).
- **R-2 Why there are rows on single classes (10, 16) and a full row (22).** The plan builds the rule reader (T007) and the step reader (T008) before the public API (T009). Each gets its class comparison in its own file, so that the file can be embedded in its task. Row 22 is the only full field-by-field comparison and is the T009 gate.
- **R-3 LikeC4 outcomes verified by probe** (verified; 1.59.4; `validateLikeC4`-equivalent from `spikes/_lc4.mts`; scripts `/tmp/zsa/zdox-lc4m-15.29/scratch-tests-author/p1.mts` and `p2.mts`).

  Real output:

  | Construct | Result |
  |---|---|
  | `par { }` after a step | `[]` (no error, no warning); computed edges `["step-01"]` — the block is dropped |
  | `par { opt { } }` | `[]`; edges `["step-01"]` — dropped |
  | `par { app.api -> app.db  opt { } }` | `[]`; edges `["step-01:par.01"]` |
  | `par { if { … } }` | `"if" alternative branch must be inside "alt"`; edges `["step-01"]` |
  | `with { color nosuch }` (element and relation `with`) | `Could not resolve reference to CustomColor named 'nosuch'.` |
  | `icon file:///x.png` | `Icon URI must not start with file://` |
  | `icon aws:nope-nope` | `Could not resolve reference to LibIcon named 'aws:nope-nope'.` |
  | `icon tech:react`, declared color `brand` | `[]` |
  | `opacity 150%` | no error, **warning** `Value ignored, must be between 0% and 100%` |
  | dynamic `include app.api -> app.db` | `[]` and no warning (silently ignored) |
  | `app.db <-[async]- app.api` | parse errors (no grammar form; D38) |
  | `view v { include a with { navigateTo v } }` (p2) | `[]` — a self-`navigateTo` from an element `with` is valid |
  | `dynamic view d { a -> b { navigateTo d } }` (p2) | `[]` — a self-`navigateTo` from a step is valid |

  Consequences:
  - The two non-contributing `par` forms can be in the valid fixtures. The stray-`if` form cannot, so it is inline (row 19).
  - The opacity and D34 rejections cannot be discriminated by `expectValidLikeC4`. Rows 53 and 54 assert LikeC4's warning, or its computed result, on the literal rejected text as OP.
  - The self-reference inputs of row 94 are valid, so its acceptance half can be Wv.
- **R-4 Direct mechanism tests vs consumer wiring.**
  - Rows 1–8 (resolver), 9 (reverse index) and 43–46 (snapshot) test product modules directly. Other product code calls these modules, so §5 allows the direct tests.
  - They prove the mechanism, not its wiring.
  - Wiring is proved by these consumer rows:

    | Consumer | Mechanism | Rows |
    |---|---|---|
    | Rule reader | resolver | 15 |
    | Step reader | resolver, `contributesSteps` | 19, 21 |
    | `ViewInfo` | resolver (`of`, `extends`) | 31 |
    | `addView` | `checkViewRule`, `extends` walk, snapshot | 52–54, 56 |
    | Rule writers | `checkViewRule` at the insertion place | 70, 71 |
    | Step writers | resolver (document scope), step-spec check | 76, 81 |
    | `removeView` | reverse index, D43 exclusion of the removed declaration's own text | 63, 94 |
    | Move / remove / `addViewParallel` | `contributesSteps` | 85, 87 |

  - Each consumer guard row holds a rejection and its accepted counterpart in one obligation. A missing guard and an always-rejecting guard therefore both go red in the same row.
- **R-5 INV-8 guard: the rejection half is not observable through view writes** (reasoning; to be confirmed by the critic).
  - A surviving reference changes its target only if a declaration it resolves to, or a scope it resolves through, is added, removed or renamed. View writes:
    - add no element or deployment declaration;
    - cannot remove a view referenced from outside itself (D26, rows 63, 94);
    - cannot touch an ambiguous id (INV-3);
    - change no `of`, `extends` or id (rename is out of scope).
  - Self-references removed with their view (D43) are inside text removed on purpose, so they are not survivors.
  - So no accepted view write is known to re-target a survivor.
  - INV-8 is therefore checked as a property after every accepted write (LINK in Wv). The guard's rejection half is covered only directly (row 46). Its acceptance half is covered through `addView` (row 56: unresolved → resolved). Its opt-in scope is covered by row 47.
  - No artificial re-targeting write is invented.
- **R-6 Existing-test inventory (how it was found).**
  - Search commands:
    - `grep -rn "addView\|generateView" tests`: 15 files.
    - `grep -rn -i "views block\|No file with" tests`: the three pinned throws in `edge-cases.test.ts` (:219-224, :509-514, :634-639) and no others.
    - `grep -rn "type: 'dynamic'" tests | grep -i include`: only `codegen.test.ts:595` (`includes: []`). No existing test pins a dynamic relation-predicate include, so D34 rewrites nothing.
    - `grep -rln "^views\|views {" tests/fixtures`: views blocks in two files only in `cloud-system`, which no `addView` test uses. Every `addView` caller has exactly one file with a `views` block, so D41 changes no existing test (row 40).
    - `grep -rn "\.views\b\|views\[" tests`: `title-slash.test.ts:35-37,71-72` `toEqual` the computed `views[id]` record (row 35).
  - Every existing include item was checked by reading the test sources against the new scope rules. All of them still resolve, so row 37 is "must stay unchanged":
    - `view-includes.test.ts:31-34, 74-77`;
    - `cli-apply-view-includes.test.ts:53-63`;
    - `write-value-checks.test.ts:170, 385, 415`;
    - `line-endings.test.ts:122`.
  - `edge-cases.test.ts:634` uses `MODEL_ONLY` with undeclared kinds, so LikeC4 errors exist before the write. Its rewrite is Wi, not Wv (row 41).
  - `line-endings.test.ts` owns "written text uses the file's line ending", but the plan names no task that extends its `OPS` table with view writers. CRLF is therefore checked inside each writer's own file (rows 49, 60, 64, 77, 84), which keeps one test file per task.
- **R-7 Discriminating question (reasoning only).**
  - *Absent / not wired:* the oracle comparisons on per-rule cases, plus the consumer rows of R-4.
  - *Unconditional guard:* the acceptance halves inside rows 52, 53, 54, 62, 70, 76, 80, 87 and 94.
  - *Wrong key or order:* rows 29 and 48(c) (load order ≠ document order); rows 43 and 45 (snapshot keys); row 82 (pre-move vs post-removal indices); rows 17 and 74 (LikeC4's sense vs written positions); row 24 (tag order); row 94 (exclusion keyed on the removed declaration's range, not on the target id).
  - *Disabling threshold:* no numeric threshold exists. The closest analogue is literal emptiness vs contribution (rows 19, 85, 87).
- **R-8 Message fragments.** Rows 63 and 94 assert that the `detail` names each outside referrer's file and line, and row 94 also asserts that the self-reference's line is absent. US-8 records "listing each reference with file and position" as the contract. No other row asserts message text. Rejections are asserted by `InvalidWriteError.field`, or by `mutations[i].<path>` for `apply`.
- **R-9 Sample limits.**
  - Pattern `tests/fixtures/views-*`. Does not give:
    - invalid LikeC4 inputs (inline in rows 19, 29, 31, 56, 62);
    - syntax errors (rows 33, 62);
    - ambiguity (rows 1–4, 15, 21, 47, 53, 70, 76);
    - one-line and bodyless bodies (rows 57, 66, 77);
    - `implicitViews` (row 28);
    - load order ≠ document order (rows 29, 48);
    - self-references (row 94, inline).
  - Pattern `tests/fixtures/views-flows/` (rows 73, 74). Does not give: step forms that only the catalog fixture has. Row 74 therefore runs 2F.
  - Wi rows do not compare survivors with the oracle, because LikeC4's model of an invalid input is best effort.
- **R-10 D43 (row 94).** Self-references are covered in two roles: an element `with` and a step. A relation `with { navigateTo self }` needs a dynamic target and is the same exclusion path, so it is not a separate case. The mixed case (a self-reference plus one outside referrer) is the discriminator, because it separates "exclude references inside the removed range" from "ignore every reference to this id". The row is numbered 94 so that the existing row numbers stay stable for cross-references.
