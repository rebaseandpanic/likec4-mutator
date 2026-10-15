# Spike 05-write-feasibility

S5: view writes as text edits located by the library's unlinked parse (CST offsets), each checked with the `likec4 validate` equivalent and the computed view.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/05-write-feasibility.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
base validate(): []

# A. include ext before trailing autoLayout
  | view idx {
  |     include app.api
  |     include ext
  |     autoLayout LeftRight
  |   }
  validate(): []
  {"nodes":["app","app.api","ext"],"autoLayout":{"direction":"LR"}}

# B1. dynamic: include ext before trailing autoLayout
  | dynamic view flow {
  |     user -> app.web
  |     include app.db
  |     app.web -> app.api
  |     app.api -> app.db
  |     par {
  |       app.api -> ext
  |     }
  |     include ext
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"nodes":["app.db","ext","user","app.web","app.api"],"autoLayout":{"direction":"TB"}}

# B2. dynamic: include between steps 2 and 3
  | dynamic view flow {
  |     user -> app.web
  |     include app.db
  |     app.web -> app.api
  |     include user
  |     app.api -> app.db
  |     par {
  |       app.api -> ext
  |     }
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"nodes":["app.db","user","app.web","app.api","ext"],"autoLayout":{"direction":"TB"}}

# C1. step inserted before steps[1]
  | dynamic view flow {
  |     user -> app.web
  |     include app.db
  |     app.web -> ext
  |     app.web -> app.api
  |     app.api -> app.db
  |     par {
  |       app.api -> ext
  |     }
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"edges":["step-01:user->app.web @/steps@0","step-02:app.web->ext @/steps@1","step-03:app.web->app.api @/steps@2","step-04:app.api->app.db @/steps@3","step-05:par.01:app.api->ext @/steps@4/steps@0"]}

# C2. step appended inside par
  | dynamic view flow {
  |     user -> app.web
  |     include app.db
  |     app.web -> app.api
  |     app.api -> app.db
  |     par {
  |       app.api -> ext
  |       app.api -> app.db
  |     }
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"edges":["step-01:user->app.web @/steps@0","step-02:app.web->app.api @/steps@1","step-03:app.api->app.db @/steps@2","step-04:par.01:app.api->ext @/steps@3/steps@0","step-04:par.02:app.api->app.db @/steps@3/steps@1"]}

# D. wrap steps[1..2] (consecutive in source) into a new par
  | dynamic view flow {
  |     user -> app.web
  |     include app.db
  |     par {
  |       app.web -> app.api
  |       app.api -> app.db
  |     }
  |     par {
  |       app.api -> ext
  |     }
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"edges":["step-01:user->app.web @/steps@0","step-02:par.01:app.web->app.api @/steps@1/steps@0","step-02:par.02:app.api->app.db @/steps@1/steps@1","step-03:par.01:app.api->ext @/steps@2/steps@0"]}

# D2. wrap steps[0..1] with an include between them (rule ends up inside par)
  | dynamic view flow {
  |     par {
  |       user -> app.web
  |       include app.db
  |       app.web -> app.api
  |     }
  validate(): ["a.c4:50: Expecting token of type '}' but found `include`.","a.c4:53: Expecting token of type '}' but found `app`.","a.c4:57: Expecting token of type 'EOF' but found `autoLayout`."]

# E1. tags, title, description, link into a body without props
  | view bare {
  |     #next
  |     title 'New'
  |     description 'D'
  |     link https://example.com/doc 'Doc'
  |     include *
  |   }
  validate(): []
  {"title":"New","description":{"txt":"D"},"tags":["next"],"links":[{"url":"https://example.com/doc","title":"Doc"}]}

# E2. tags first, before an existing title
  | view titled {
  |     #next, #deprecated
  |     title 'T'
  |     include *
  |   }
  validate(): []
  {"tags":["deprecated","next"]}

# E2-neg. tags after the title (wrong place)
  | view titled {
  |     title 'T'
  |     #next
  |     include *
  |   }
  validate(): ["a.c4:45: Expecting token of type '}' but found `#`."]

# E3. link after last prop, before first rule
  | view titled {
  |     title 'T'
  |     link https://example.com/x
  |     include *
  |   }
  validate(): []
  {"links":[{"url":"https://example.com/x"}]}

# E4. dynamic: title before the first step
  | dynamic view flow {
  |     title 'Flow'
  |     user -> app.web
  |     include app.db
  |     app.web -> app.api
  |     app.api -> app.db
  |     par {
  |       app.api -> ext
  |     }
  |     autoLayout TopBottom
  |   }
  validate(): []
  {"title":"Flow"}
```

Conclusion:

- All tried placements validate: include before a trailing `autoLayout`; include among interleaved dynamic steps; step at a position; step inside `par`; wrapping consecutive steps in a new `par`; tags/title/description/link at body start; link after the last prop.
- Placement rules that matter: tags must be first (tags after a title is a parse error), props before any rule/step; wrapping steps that have a rule between them in source moves the rule into `par` (parse error).
- Computed step edge ids are positional (`step-NN`, `step-NN:par.MM`) and `astPath` is `/steps@i`: inserting a step renumbers every later step.
