# Spike 06-library-today

S6: what `LikeC4Mutator.addView` does today (current `src/`).

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/06-library-today.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
A: Error: No file with a views block found
B dup id: InvalidWriteError: Invalid id: a view 'first' is already declared (in a loaded file)
B exclude smuggled: InvalidWriteError: Invalid includes[0]: "* exclude app" is not exactly one include rule of a element view: expected its predicates, such as '*' or 'app.api, app.db'
B step as include: no error
--- b.c4 after addView x3 ---
views {
  view first {
    include *
  }
  view scoped of app {
    title 'Scoped'
    include api
    include ext
    autoLayout LeftRight
  }
  dynamic view flow {
    include app.api
    autoLayout TopBottom
  }
  deployment view deploy {
    include prod.**
  }
  dynamic view x2 {
    include app.web -> app.api
    autoLayout TopBottom
  }
}

views 'Second' {
  view second {
    include *
  }
}

--- c.c4 unchanged: true
validate(): []
computed x2 (dynamic, include of a relation predicate): {"rules":[{"include":[]},{"direction":"TB"}],"nodes":[]}
```

Conclusion:

- No views block anywhere -> `Error: No file with a views block found`; otherwise the view is appended at the end of the FIRST views block of the FIRST file that has one (here `b.c4`, block without folder), never in a later block or file.
- Generated text: `title` then one `include` per item, then `autoLayout` (default `TopBottom`, `''` omits it); element view without includes gets `include *`. Duplicate ids and smuggled `exclude` are rejected.
- A relation predicate in a dynamic view include (`include app.web -> app.api`) is accepted by the library and by `validate()`, but LikeC4 parses it to `{include: []}` (no nodes).
