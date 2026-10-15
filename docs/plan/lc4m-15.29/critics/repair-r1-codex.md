# Targeted specification re-review: repair 00b188d

Scope: the D40–D42 repair and its consistency with US-9, US-11, D34, D37, INV-4, INV-7, INV-9, SC-004 and SC-005. The feature design was not reopened. Read the corresponding Skein decision comments; no tracker writes were made.

## Verified facts

- Installed `@likec4/language-server` is 1.59.4. At `dist/chunks/module.mjs:6725–6726`, the nonempty check applies to the result of `parseSteps(node.steps)`, rather than the number of source statements. `tryMap` at 5183–5198 catches failures and omits the statement.
- A temporary probe using the existing spike helper and LikeC4's real language services returned no diagnostics and no validation errors for `par {}`; its parsed step list was empty and the named dynamic view remained computed. The new INV-4 exception is justified; removing an emptied wrapper need not violate INV-9.
- `src/mutator/mutator.ts:2219–2224` iterates the document Map directly to choose a views file; `parseAll` populates it from the source Map. LikeC4's document collection orders documents with `compareByUri` (`module.mjs:298–303`). D41 correctly identifies a behavior change, and INV-7 now acknowledges it. US-5 and the clarification agree.
- The existing syntax-error guard explicitly protects values contributed by `extend` blocks (`mutator.ts:1709–1743`). Views have no such declaration-extension blocks. D42 concerns own view properties, consistent with D21; the edited-file parse rejection remains explicit. No additional defect found in this change.
- D37's pre-move destination rule remains compatible with automatic removal of a literally emptied source wrapper. US-9 still permits insertion into an already-written empty block. SC-004 checks computed sequences and surviving views; SC-005 includes US-11 and D34 rejections.

## Finding 1

**Severity: MAJOR**  
**CLASS: consequence of fix 00b188d**  
**Location:** `spec.md:92–93` (US-11 and “No empty par”), D40 at line 124, INV-4 at line 144, and the empty-block clarification.

**Why:** D40 defines emptiness through source statements, but LikeC4 tests the parsed steps remaining after discarded statements. A nonempty source block can therefore still be silently dropped. Opaque stage-6 statements are explicitly part of the step tree (US-4), and US-11 permits removing another statement while leaving them untouched.

Concrete scenario, verified against 1.59.4:

```c4
specification { element component }
model { app = component api = component }
views {
  dynamic view flow {
    par {
      app -> api
      opt {}
    }
  }
}
```

This has no diagnostics or validation errors; LikeC4 parses a `par` with one interaction. Remove `[0, 0]`, the `app -> api` statement. The remaining `opt {}` is still a source statement, so the new last-statement rule does not remove the wrapper. The resulting `par { opt {} }` also has no diagnostics or validation errors, but LikeC4's parsed step list is empty: the entire `par` is discarded. The named view survives, so INV-9 alone does not catch this. The same failure can occur when creating a wrapper from an existing dropped opaque statement. This defeats D40's stated D34 rationale even though the source block is not literally empty.

Probe observations (each also had `computed: true`, `diagnostics: []`, and `validation: []`):

| Written body | Parsed steps |
|---|---|
| `par {}` | `[]` |
| `opt {}` | `[]` |
| `par { opt {} }` | `[]` |
| `par { app -> api opt {} }` | one `par` containing `app -> api` |

**Requirement-level proposal:** Define D40's acceptance condition in terms of a block contributing at least one parsed LikeC4 step, including when opaque source statements remain. Reject creation of a block that LikeC4 would discard. Specify a safe outcome for removal or move-out that leaves only discarded opaque statements: preserve the opaque text and reject the operation if fulfilling the no-dropped-block condition would otherwise delete it without explicit authorization. Keep literal last-statement auto-removal as decided. Align the read marker/exception with semantically empty blocks and add this case to SC-004/SC-005 so validation success cannot stand in for block survival.

## FRICTION

The prompt mandates two distinct first actions: real MCP calls and the startup mail command. I sent the startup mail first, then made both real MCP calls before substantive review. Both servers responded successfully. This did not prevent the review.

## VERDICT NOT-OK

Must-fix: Finding 1 — distinguish source-level nonemptiness from nonempty parsed LikeC4 steps, and specify preservation/rejection when opaque statements remain.
