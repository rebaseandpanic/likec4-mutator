/**
 * The test oracle `validateLikeC4` / `expectValidLikeC4` (tests/helpers)
 * must reject exactly what `likec4 validate` of LikeC4 1.59.4 rejects, so
 * that a mutation result checked with it is known to pass the command.
 *
 * Each case is a small project.  The expected `<file>:<line>` locations (1-based)
 * of the errors were taken from running `likec4 validate --json` of the
 * `likec4@1.59.4` npm package on the same sources; an empty list means the
 * command exited with 0.  Cases cover valid sources, warnings only, syntax
 * errors, unresolved references, duplicates, view predicates and
 * `navigateTo`, dynamic and deployment views.
 */
import { describe, expect, it } from 'vitest';
import { expectValidLikeC4, validateLikeC4 } from '../helpers/likec4-model.js';

const spec = `specification {
  element actor
  element service
  element database
  deploymentNode node
  deploymentNode zone
  relationship async
  tag internal
}
`;

const model = `model {
  user = actor 'User'
  app = service 'App' {
    api = service 'API'
    db = database 'DB'
  }
  user -> app.api 'uses'
  app.api -> app.db 'reads'
}
`;

const base = (extra: string): Record<string, string> => ({ 'model.c4': spec + model + extra });

const samples: Record<string, Record<string, string>> = {
  'valid': base(`views {
  view index {
    include *
  }
}
`),
  'empty-file': { 'model.c4': '' },
  'syntax-error': base(`model {
  x =
}
`),
  'unresolved-relation-target': base(`model {
  user -> missing 'x'
}
`),
  'duplicate-element-name': base(`model {
  user = actor 'User again'
}
`),
  'duplicate-element-name-two-files': {
    'a.c4': spec + model,
    'b.c4': `model {
  user = actor 'Dup'
}
`,
  },
  'unknown-element-kind': base(`model {
  x = unknownkind 'X'
}
`),
  'unknown-tag': base(`model {
  y = service 'Y' {
    #undeclared
  }
}
`),
  'unknown-relationship-kind': base(`model {
  user -[nosuchkind]-> app 'x'
}
`),
  'self-relation': base(`model {
  user -> user 'self'
}
`),
  'parent-child-relation': base(`model {
  app -> app.api 'inner'
}
`),
  'duplicate-spec-kind': {
    'model.c4': spec + `specification {
  element service
}
` + model,
  },
  'extend-unknown-element': base(`model {
  extend missing {
    #internal
  }
}
`),
  'duplicate-view-id': base(`views {
  view index {
    include *
  }
  view index {
    include *
  }
}
`),
  'view-of-unknown-element': base(`views {
  view v of missing {
    include *
  }
}
`),
  'view-predicate-unknown-element': base(`views {
  view v {
    include missing.*
  }
}
`),
  'view-predicate-unknown-relation-endpoint': base(`views {
  view v {
    include user -> missing
  }
}
`),
  'navigate-to-unknown-view': base(`views {
  view v {
    include app with {
      navigateTo nosuchview
    }
  }
}
`),
  'navigate-to-existing-view': base(`views {
  view index {
    include *
  }
  view v {
    include app with {
      navigateTo index
    }
  }
}
`),
  'dynamic-view-valid': base(`views {
  dynamic view d {
    user -> app.api 'call'
    app.api -> app.db 'query'
  }
}
`),
  'dynamic-view-unknown-element': base(`views {
  dynamic view d {
    user -> missing 'call'
  }
}
`),
  'dynamic-view-step-without-model-relation': base(`views {
  dynamic view d {
    app.db -> user 'notify'
  }
}
`),
  'dynamic-view-parent-child-step': base(`views {
  dynamic view d {
    app -> app.api 'inner'
  }
}
`),
  'deployment-valid': base(`deployment {
  node prod {
    a = instanceOf app.api
    b = instanceOf app.db
  }
}
views {
  deployment view dv {
    include prod.**
  }
}
`),
  'deployment-two-unnamed-instances-same-element': base(`deployment {
  node prod {
    instanceOf app.api
    instanceOf app.api
  }
}
`),
  'deployment-two-named-instances-same-element': base(`deployment {
  node prod {
    a1 = instanceOf app.api
    a2 = instanceOf app.api
  }
}
`),
  'deployment-instance-of-unknown': base(`deployment {
  node prod {
    instanceOf missing
  }
}
`),
  'deployment-unknown-node-kind': base(`deployment {
  nosuchnode prod {
  }
}
`),
  'deployment-duplicate-node-name': base(`deployment {
  node prod
  node prod
}
`),
  'deployment-view-includes-model-element-ref': base(`deployment {
  node prod {
    a = instanceOf app.api
  }
}
views {
  deployment view dv {
    include missing
  }
}
`),
  'deployment-relation-unknown': base(`deployment {
  node prod {
    a = instanceOf app.api
  }
  prod.a -> prod.missing 'x'
}
`),
  'element-style-unknown-color': base(`model {
  z = service 'Z' {
    style {
      color nosuchcolor
    }
  }
}
`),
  'relation-in-view-predicate-with-unknown-tag': base(`views {
  view v {
    include * where tag is #nosuchtag
  }
}
`),
  'metadata-duplicate-key': base(`model {
  m = service 'M' {
    metadata {
      k 'a'
      k 'b'
    }
  }
}
`),
  'extend-relation-kind-title-warning': {
    'model.c4': `specification {
  element service
  relationship async {
    title 'Asynchronous'
  }
  tag t
}
model {
  a = service 'A'
  b = service 'B'
  a -[async]-> b
  extend a -[async]-> b 'Asynchronous' {
    #t
  }
}
`,
  },
};

/** Error locations `likec4 validate --json` reported per sample (lines converted to 1-based). */
const cliErrorLocations: Record<string, readonly string[]> = {
  'valid': [],
  'empty-file': [],
  'syntax-error': ['model.c4:21'],
  'unresolved-relation-target': ['model.c4:20'],
  'duplicate-element-name': ['model.c4:11', 'model.c4:20'],
  'duplicate-element-name-two-files': ['a.c4:11', 'b.c4:2'],
  'unknown-element-kind': ['model.c4:20'],
  'unknown-tag': ['model.c4:21'],
  'unknown-relationship-kind': ['model.c4:20'],
  'self-relation': ['model.c4:20'],
  'parent-child-relation': ['model.c4:20'],
  'duplicate-spec-kind': ['model.c4:3', 'model.c4:11'],
  'extend-unknown-element': ['model.c4:20'],
  'duplicate-view-id': ['model.c4:20', 'model.c4:23'],
  'view-of-unknown-element': ['model.c4:20'],
  'view-predicate-unknown-element': ['model.c4:21'],
  'view-predicate-unknown-relation-endpoint': ['model.c4:21'],
  'navigate-to-unknown-view': ['model.c4:22'],
  'navigate-to-existing-view': [],
  'dynamic-view-valid': [],
  'dynamic-view-unknown-element': ['model.c4:21'],
  'dynamic-view-step-without-model-relation': [],
  'dynamic-view-parent-child-step': ['model.c4:21'],
  'deployment-valid': [],
  'deployment-two-unnamed-instances-same-element': ['model.c4:21', 'model.c4:22'],
  'deployment-two-named-instances-same-element': [],
  'deployment-instance-of-unknown': ['model.c4:21'],
  'deployment-unknown-node-kind': ['model.c4:20'],
  'deployment-duplicate-node-name': ['model.c4:20', 'model.c4:21'],
  'deployment-view-includes-model-element-ref': ['model.c4:26'],
  'deployment-relation-unknown': ['model.c4:23'],
  'element-style-unknown-color': ['model.c4:22'],
  'relation-in-view-predicate-with-unknown-tag': ['model.c4:21'],
  'metadata-duplicate-key': [],
  'extend-relation-kind-title-warning': [],
};

describe('validateLikeC4 agrees with likec4 validate', () => {
  it.each(Object.entries(cliErrorLocations))('%s', async (name, locations) => {
    const errors = await validateLikeC4(samples[name]!);
    const reported = [...new Set(errors.map((e) => /^[^:]*:\d+/.exec(e)?.[0]))];
    expect(reported).toEqual(locations);
  });

  it('expectValidLikeC4 passes valid sources and fails invalid ones', async () => {
    await expect(expectValidLikeC4(samples['extend-relation-kind-title-warning']!)).resolves.toBeUndefined();
    await expect(expectValidLikeC4(samples['self-relation']!)).rejects.toThrow();
  });
});
