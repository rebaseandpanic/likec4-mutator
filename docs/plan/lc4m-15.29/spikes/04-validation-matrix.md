# Spike 04-validation-matrix

S4: exact LikeC4 diagnostics (or "valid") for view constructs.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/04-validation-matrix.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
# parent-child step app -> app.api
  ERROR a.c4:37: Invalid parent-child relationship
# self step app.api -> app.api
  valid
# chain after backward user <- app.web -> app.api
  ERROR a.c4:37: Invalid chain after backward step
# chain returning to previous source (a -> b -> a)
  valid
# nested par (par in par)
  ERROR a.c4:38: Nested parallel blocks are not allowed
# par in loop (not nested par)
  valid
# empty par {}
  valid
# if outside alt
  ERROR a.c4:37: "if" alternative branch must be inside "alt"
# opt inside alt
  ERROR a.c4:38: "opt" can not be used as an alternative branch, only "if", "when" or "else" are allowed
# step with unknown element
  ERROR a.c4:37: Could not resolve reference to Referenceable named 'nope'.
  ERROR a.c4:37: Target not found (not parsed/indexed yet)
# dynamic view without steps
  valid
# empty element view body
  valid
# element view without body
  valid
# with inside exclude
  ERROR a.c4:38: Invalid usage inside "exclude"
# with on element.kind expr
  ERROR a.c4:37: Invalid target (expect reference to specific element)
# with on element.tag expr
  ERROR a.c4:37: Invalid target (expect reference to specific element)
# with on wildcard (element view)
  valid
# with on app.* (element view)
  valid
# with in dynamic include on wildcard
  warn a.c4:38: Predicate is ignored, as not supported in dynamic views
# with in deployment view include
  valid
# trailing comma include a, b,
  valid
# title after include
  ERROR a.c4:38: Expecting token of type '}' but found `title`.
# link after include
  ERROR a.c4:38: Expecting token of type '}' but found `link`.
# tags after title
  ERROR a.c4:38: Expecting token of type '}' but found `#`.
# title twice
  valid
# dynamic: title after a step
  ERROR a.c4:38: Expecting token of type '}' but found `title`.
# dynamic: variant after include
  ERROR a.c4:38: Expecting token of type '}' but found `variant`.
  ERROR a.c4:39: Expecting: one of these possible Token sequences:
  ERROR a.c4:38: Could not resolve reference to Referenceable named 'sequence'.
  ERROR a.c4:38: Source not found (not parsed/indexed yet)
  ERROR a.c4:38: Target not found (not parsed/indexed yet)
# variant in element view
  ERROR a.c4:37: Expecting token of type '}' but found `variant`.
# two views same id, two files (element + dynamic)
  ERROR a.c4:36: Duplicate view 'v'
  ERROR b.c4:2: Duplicate view 'v'
View "v2" extends from "v1" which creates a cycle
# extends cycle v1 <-> v2
  valid
View "v1" extends from "v1" which creates a cycle
# extends self
  valid
# view of + extends together
  ERROR a.c4:39: Expecting token of type '}' but found `extends`.
  ERROR a.c4:42: Expecting end of file but found `}`.
# navigateTo target removed (with)
  ERROR a.c4:37: Could not resolve reference to LikeC4View named 'gone'.
# navigateTo target removed (step)
  ERROR a.c4:37: Could not resolve reference to DynamicView named 'gone'.
# extends target removed
  ERROR a.c4:36: Could not resolve reference to ElementView named 'gone'.
# view id reserved word (this)
  ERROR a.c4:36: Reserved word: this
View "v2" extends from "v1" which creates a cycle
# extends cycle: computed view ids ["index"]
View "v2" extends from "v1" which creates a cycle
# extends cycle: validate() []
```

Conclusion:

- Step errors: parent-child, chain after backward, nested par, `if` outside `alt`, non-branch in `alt`; self step, empty `par {}`, `a -> b -> a`, a dynamic view without steps are valid.
- Props/tags after rules, tags after a prop, `variant` outside the head of a dynamic view: parse errors. `with` in `exclude` and on kind/tag expressions: errors; `with` in a deployment include: valid.
- Duplicate view ids across files and view types: `Duplicate view 'v'` in both files. An `extends` cycle reports NO diagnostic and `validate()` is clean, but both views silently disappear from the computed model. Removing a navigateTo/extends target leaves a linker error at the referrer.
