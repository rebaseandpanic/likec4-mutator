/**
 * `moveElement` (lc4m-15.30 US-3; FR-004, FR-010, FR-011, FR-020, D76, D85,
 * D92, D98, D99, D110, D114; rows 94–106 of the test matrix): the
 * declaration moves as text with its leading comments to its new place;
 * every reference whose target σ changes, and every reference in the moved
 * text, links to σ of its old target; what cannot be moved rejects the
 * move with nothing changed.
 *
 * Expected values come from the spec and the inputs: σ is a literal per
 * test, expected texts are the inputs with literal edits, and the targets
 * and computed views are LikeC4's own (`expectSigmaImage`,
 * `linkedCatalogueReferences`, `computedViews`).
 *
 * Abbreviations of the matrix: SIG (`expectSigmaImage` with a literal σ),
 * AWB (the accepted-write bundle), BI (an `InvalidWriteError` on the named
 * field, sources and reads unchanged), REL (`error.related` equals a
 * literal list), P (a precondition asserted first).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import {
  computedViews,
  expectAcceptedWrite,
  expectSigmaImage,
  expectValidLikeC4,
  linkedCatalogueReferences,
  type LinkedCatalogueReference,
} from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;

/** `text` with each `[from, to]` replaced; every `from` must occur in it, all its occurrences are replaced. */
function replaced(text: string, replacements: ReadonlyArray<readonly [string, string]>): string {
  return replacements.reduce((current, [from, to]) => {
    if (!current.includes(from)) throw new Error(`test input: '${from}' not found`);
    return current.split(from).join(to);
  }, text);
}

/** Every read the mutator offers, for BI. */
function reads(mutator: LikeC4Mutator): string {
  return JSON.stringify([
    mutator.listElements(),
    mutator.getRelationships(),
    mutator.listDeploymentNodes(),
    mutator.listDeploymentInstances(),
    mutator.listDeploymentRelationships(),
    mutator.listViews(),
  ]);
}

/** BI: `write` throws an `InvalidWriteError` on `field`; the sources and the reads are unchanged. */
function expectRejected(mutator: LikeC4Mutator, write: () => unknown, field: string): InvalidWriteError {
  const sources = mutator.serialize();
  const before = reads(mutator);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(mutator.serialize()).toEqual(sources);
  expect(reads(mutator)).toBe(before);
  return error as InvalidWriteError;
}

/** `{ file, line, column }` of the first `needle` in `files[file]` (1-based), from the test's own input. */
function at(files: Files, file: string, needle: string): { file: string; line: number; column: number } {
  const text = files[file]!;
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`test input: '${needle}' not found in ${file}`);
  const before = text.slice(0, offset);
  return { file, line: before.split('\n').length, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

/** The target LikeC4 links the reference written as `text` on the line holding `marker` in `file` to. */
async function linkedAt(files: Files, file: string, marker: string, text: string): Promise<LinkedCatalogueReference['target']> {
  const line = files[file]!.split('\n').findIndex((l) => l.includes(marker)) + 1;
  expect(line, marker).toBeGreaterThan(0);
  const found = (await linkedCatalogueReferences(files)).filter((r) => r.file === file && r.line === line && r.text === text);
  expect(found.length, `${file}:${line} ${text}`).toBe(1);
  return found[0]!.target;
}

const SPEC = `specification {
  element system
  element service
  deploymentNode vm
}
`;

/** Every FR-001 reference kind that a move rewrites, into `app.api` and below it, across two files. */
const KINDS: Files = {
  'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
      handler -> db 'loads'
      -> web 'notifies'
    }
    db = service 'DB'
    web = service 'Web'
    web -> api 'calls'
  }
  core = system 'Core'
  other = system 'Other'
  other -> app.api 'uses'
  app.api -> app.db 'stores'
}
deployment {
  vm prod {
    gw = instanceOf app.api
    instanceOf app.db
    gw -> db 'writes'
  }
  vm edge {
    instanceOf app.web
  }
  prod.gw.handler -> prod.db 'queries'
  edge.web -> prod.gw 'routes'
}
`,
  'b.c4': `model {
  extend app.api {
    worker = service 'Worker'
    worker -> handler 'feeds'
  }
  extend app.api -> app.db 'stores' {
    link https://example.com/stores
  }
  app.api.worker -> other 'reports'
}
views {
  style app.api, other {
    color amber
  }
  view index {
    include *
    include app.api, app.api.*
    group 'Inner' {
      include app.api.handler
    }
    style app.api {
      color green
    }
    rank same {
      app.api.handler, app.api.worker
    }
  }
  view apiView of app.api {
    include *, handler
  }
  dynamic view flow {
    include app.api
    other -> app.api 'asks'
    app.web -> app.api -> app.db
    par {
      app.api -> app.db
    }
  }
  deployment view deployed {
    include prod.**
    include prod.gw
  }
}
`,
};

describe('σ-equality over every reference kind (row 94)', () => {
  it('moves app.api referenced through every rewritable FR-001 kind in two files under core', SLOW, async () => {
    // P: valid input with every rewritable role into the subtree, in both files.
    await expectValidLikeC4(KINDS);
    const into = (await linkedCatalogueReferences(KINDS)).filter((r) => {
      const t = r.target;
      return t !== null && !('view' in t) && ('model' in t ? t.model : (t.element ?? '')).startsWith('app.api');
    });
    const roles = new Set<string>(into.map((r) => r.role));
    for (const role of [
      'relationship-endpoint',
      'extend-element-target',
      'extend-relationship-endpoint',
      'deployment-relationship-endpoint',
      'instance-of',
      'view-of',
      'predicate-item',
      'step-endpoint',
      'style-target',
      'rank-target',
    ]) {
      expect(roles.has(role), role).toBe(true);
    }
    expect(new Set(into.map((r) => r.file))).toEqual(new Set(['a.c4', 'b.c4']));

    const mutator = LikeC4Mutator.fromFiles(KINDS);
    expect(mutator.moveElement('app.api', { parent: 'core' })).toEqual({ fqn: 'core.api', changedFiles: ['a.c4', 'b.c4'] });
    const after = mutator.serialize();
    await expectSigmaImage(KINDS, after, { 'app.api': 'core.api', 'app.api.handler': 'core.api.handler', 'app.api.worker': 'core.api.worker' });
    await expectAcceptedWrite(KINDS, after);
  });
});

describe('block ordinals and files (row 95)', () => {
  it('moves an element from a later model block into an earlier one', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  a = system 'A'
}
model {
  b = system 'B' {
    c = service 'C'
    c -> x 'calls'
  }
  x = system 'X'
}
views {
  view v {
    include b.c, x
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('b.c', { parent: 'a' });
    const after = mutator.serialize();
    await expectSigmaImage(before, after, { 'b.c': 'a.c' });
    await expectAcceptedWrite(before, after);
  });

  it('moves a root element to the top level of another file', SLOW, async () => {
    const before: Files = {
      'a.c4': `${SPEC}model {
  x = system 'X' {
    y = service 'Y'
  }
  z = system 'Z'
  z -> x.y 'uses'
}
`,
      'b.c4': `model {
  w = system 'W'
}
views {
  view v of x {
    include *, y
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    expect(mutator.moveElement('x', { parent: null, file: 'b.c4' })).toEqual({ fqn: 'x', changedFiles: ['a.c4', 'b.c4'] });
    const after = mutator.serialize();
    expect(after['b.c4']).toContain("  x = system 'X' {\n    y = service 'Y'\n  }\n}\n");
    await expectSigmaImage(before, after, {});
    await expectAcceptedWrite(before, after);
  });
});

describe('the hierarchy effect (row 96)', () => {
  it('shows app.api in `include app.*` before the move and app after it (spike 03)', SLOW, async () => {
    const before: Files = {
      'a.c4': `specification { element e }
model { app = e 'App' { api = e 'Api' }
other = e 'Other' }
views { view v { include app.* } }`,
    };
    expect((await computedViews(before))['v']!.nodes).toEqual(['app.api']);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'other' });
    const after = mutator.serialize();
    expect((await computedViews(after))['v']!.nodes).toEqual(['app']);
    await expectAcceptedWrite(before, after);
  });
});

describe('top-level placement (row 97)', () => {
  const BEFORE: Files = {
    'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
}
model {
  more = system 'More'
}
`,
    'b.c4': `model {
  b = system 'B'
}
model {
  bb = system 'BB'
}
`,
    'c.c4': `views {
  view index {
    include *
  }
}
`,
  };
  it.each([
    [
      'a chosen file with a model block: the end of its first block',
      { parent: null, file: 'b.c4' },
      {
        'a.c4': replaced(BEFORE['a.c4']!, [["  app = system 'App' {\n    api = service 'API'\n  }", "  app = system 'App' {\n  }"]]),
        'b.c4': replaced(BEFORE['b.c4']!, [["  b = system 'B'\n", "  b = system 'B'\n  api = service 'API'\n"]]),
      },
    ],
    [
      'a chosen file without a model block: a new block',
      { parent: null, file: 'c.c4' },
      {
        'a.c4': replaced(BEFORE['a.c4']!, [["  app = system 'App' {\n    api = service 'API'\n  }", "  app = system 'App' {\n  }"]]),
        'c.c4': `${BEFORE['c.c4']}\nmodel {\n  api = service 'API'\n}\n`,
      },
    ],
    [
      'no file: the end of the first model block of the current file (D98)',
      { parent: null },
      {
        'a.c4': replaced(BEFORE['a.c4']!, [
          ["  app = system 'App' {\n    api = service 'API'\n  }\n}", "  app = system 'App' {\n  }\n  api = service 'API'\n}"],
        ]),
      },
    ],
  ] as const)('places at %s', SLOW, async (_, target, changed) => {
    await expectValidLikeC4(BEFORE);
    const mutator = LikeC4Mutator.fromFiles(BEFORE);
    mutator.moveElement('app.api', target);
    const after = mutator.serialize();
    expect(after).toEqual({ ...BEFORE, ...changed });
    await expectAcceptedWrite(BEFORE, after);
  });
});

describe('a bodiless parent (row 98)', () => {
  it('creates the body of the new parent, keeping its declaration form', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  service cache 'Cache'
}
`,
    };
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'cache' });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(before['m.c4']!, [
        ["  app = system 'App' {\n    api = service 'API'\n  }", "  app = system 'App' {\n  }"],
        ["  service cache 'Cache'\n", "  service cache 'Cache' {\n    api = service 'API'\n  }\n"],
      ]),
    );
    await expectAcceptedWrite(before, after);
  });
});

describe('leading comments, indentation and line endings (row 99)', () => {
  it('moves contiguous comment lines and a trailing comment, keeps a separated one, re-indents, and uses CRLF', SLOW, async () => {
    const before: Files = {
      'a.c4': `${SPEC}model {
  app = system 'App' {
    // about the file

    // the API
    /* serves requests */
    api = service 'API' {
      handler = service 'Handler'
    } // end of api
  }
}
`,
      'b.c4': 'model {\r\n  core = system \'Core\' {\r\n    inner = system \'Inner\'\r\n  }\r\n}\r\n',
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'core.inner' });
    const after = mutator.serialize();
    expect(after['a.c4']).toBe(
      replaced(before['a.c4']!, [
        [
          "    // about the file\n\n    // the API\n    /* serves requests */\n    api = service 'API' {\n      handler = service 'Handler'\n    } // end of api\n",
          '    // about the file\n\n',
        ],
      ]),
    );
    expect(after['b.c4']).toBe(
      "model {\r\n  core = system 'Core' {\r\n    inner = system 'Inner' {\r\n" +
        "      // the API\r\n      /* serves requests */\r\n      api = service 'API' {\r\n        handler = service 'Handler'\r\n      } // end of api\r\n" +
        '    }\r\n  }\r\n}\r\n',
    );
    await expectAcceptedWrite(before, after);
  });
});

describe('what counts as a leading comment (row 99)', () => {
  it('leaves a sibling above that ends with a comment in place', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    db = service 'DB' /* database */
    api = service 'API'
  }
  core = system 'Core'
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'core' });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(before['m.c4']!, [
        ["    api = service 'API'\n", ''],
        ["  core = system 'Core'\n", "  core = system 'Core' {\n    api = service 'API'\n  }\n"],
      ]),
    );
    await expectSigmaImage(before, after, { 'app.api': 'core.api' });
    await expectAcceptedWrite(before, after);
  });

  it('moves a multi-line block comment whose inner lines do not start with *', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    db = service 'DB'
    /* the API,
       which serves requests */
    api = service 'API'
  }
  core = system 'Core'
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'core' });
    const after = mutator.serialize();
    expect(after['m.c4']).toBe(
      replaced(before['m.c4']!, [
        ["    /* the API,\n       which serves requests */\n    api = service 'API'\n", ''],
        ["  core = system 'Core'\n", "  core = system 'Core' {\n    /* the API,\n       which serves requests */\n    api = service 'API'\n  }\n"],
      ]),
    );
    await expectSigmaImage(before, after, { 'app.api': 'core.api' });
    await expectAcceptedWrite(before, after);
  });
});

describe('multi-line strings in the moved text (row 99)', () => {
  it('keeps the lines inside a multi-line string as written, so its value does not change', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    inner = system 'Inner' {
      api = service 'API' {
        description 'one
            two'
        summary \'\'\'
          First
            second
        \'\'\'
      }
    }
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.inner.api', { parent: null });
    const after = mutator.serialize();
    // The declaration lines move two levels out; the string lines after the first stay byte for byte.
    expect(after['m.c4']).toContain("  api = service 'API' {\n    description 'one\n            two'\n    summary \'\'\'\n          First\n            second\n        \'\'\'\n  }\n");
    await expectSigmaImage(before, after, { 'app.inner.api': 'api' });
    await expectAcceptedWrite(before, after);
  });
});

describe('multi-line strings of a declaration that shares its line (row 99)', () => {
  it('keeps the continuation lines of a quoted string when the moved declaration starts after other code', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    inner = system 'Inner' { api = service 'API' {
        description 'one
            two'
      }
    }
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.inner.api', { parent: null });
    const after = mutator.serialize();
    // The body lines lose the indentation of the line the declaration started on; the string's second line stays.
    expect(after['m.c4']).toContain("  api = service 'API' {\n      description 'one\n            two'\n    }\n}\n");
    await expectSigmaImage(before, after, { 'app.inner.api': 'api' });
    await expectAcceptedWrite(before, after);
  });
});

describe('references inside the moved body (row 100)', () => {
  it('keeps a relative text between two children and rewrites one that would link elsewhere', SLOW, async () => {
    const before: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
      store = service 'Store'
      handler -> store 'keeps'
      -> db 'reads'
    }
    db = service 'DB'
  }
  core = system 'Core' {
    db = service 'Core DB'
  }
}
`,
    };
    await expectValidLikeC4(before);
    // P: written unchanged under core, `db` links to core.db.
    const handWritten = {
      'm.c4': replaced(before['m.c4']!, [
        [
          "    api = service 'API' {\n      handler = service 'Handler'\n      store = service 'Store'\n      handler -> store 'keeps'\n      -> db 'reads'\n    }\n",
          '',
        ],
        [
          "    db = service 'Core DB'\n",
          "    db = service 'Core DB'\n    api = service 'API' {\n      handler = service 'Handler'\n      store = service 'Store'\n      handler -> store 'keeps'\n      -> db 'reads'\n    }\n",
        ],
      ]),
    };
    expect(await linkedAt(handWritten, 'm.c4', "'reads'", 'db')).toEqual({ model: 'core.db' });

    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('app.api', { parent: 'core' });
    const after = mutator.serialize();
    expect(after).toEqual({ 'm.c4': replaced(handWritten['m.c4'], [["-> db 'reads'", "-> app.db 'reads'"]]) });
    await expectSigmaImage(before, after, { 'app.api': 'core.api', 'app.api.handler': 'core.api.handler', 'app.api.store': 'core.api.store' });
  });
});

describe('a move between files (row 101)', () => {
  it('leaves the emptied model block in place and rewrites extend blocks in other files', SLOW, async () => {
    const before: Files = {
      'a.c4': `${SPEC}model {
  app = system 'App'
}
`,
      'b.c4': `model {
  solo = system 'Solo'
}
`,
      'c.c4': `model {
  extend solo {
    link https://example.com/solo
  }
}
`,
    };
    await expectValidLikeC4(before);
    const mutator = LikeC4Mutator.fromFiles(before);
    mutator.moveElement('solo', { parent: 'app' });
    const after = mutator.serialize();
    expect(after).toEqual({
      'a.c4': replaced(before['a.c4']!, [["  app = system 'App'\n", "  app = system 'App' {\n    solo = system 'Solo'\n  }\n"]]),
      'b.c4': 'model {\n}\n',
      'c.c4': replaced(before['c.c4']!, [['extend solo', 'extend app.solo']]),
    });
    await expectAcceptedWrite(before, after);
  });
});

describe('move rejections (row 102)', () => {
  const FILES: Files = {
    'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
    }
  }
  core = system 'Core' {
    api = service 'Core API'
  }
  solo = system 'Solo'
}
`,
    'b.c4': 'model {\n}\n',
  };
  it.each([
    ['file with a parent target', 'app.api', { parent: 'core', file: 'b.c4' }, 'file'],
    ['the same parent', 'app.api', { parent: 'app' }, 'parent'],
    ['a root move without file', 'solo', { parent: null }, 'parent'],
    ['a root move into its own file', 'solo', { parent: null, file: 'a.c4' }, 'file'],
    ['the element itself as the parent', 'app.api', { parent: 'app.api' }, 'parent'],
    ['its own subtree as the parent', 'app.api', { parent: 'app.api.handler' }, 'parent'],
    ['a name taken at the target', 'app.api', { parent: 'core' }, 'parent'],
    ['an unknown fqn', 'app.nope', { parent: 'core' }, 'fqn'],
    ['an unknown parent', 'app.api', { parent: 'nowhere' }, 'parent'],
    ['a file that is not loaded', 'app.api', { parent: null, file: 'z.c4' }, 'file'],
  ] as const)('rejects %s', (_, fqn, target, field) => {
    const mutator = LikeC4Mutator.fromFiles(FILES);
    expectRejected(mutator, () => mutator.moveElement(fqn, target), field);
  });
});

describe('values relative to the declaring file (row 103)', () => {
  const FILES = (body: string): Files => ({
    'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      ${body}
    }
  }
  core = system 'Core'
}
`,
    'b.c4': 'model {\n  far = system \'Far\'\n}\n',
  });
  const CASES = [
    ['a relative body icon', 'icon ./icons/api.svg'],
    ['a relative style icon', 'style {\n        icon ../icons/api.svg\n      }'],
    ['a relative link', 'link ./docs/api.md'],
  ] as const;
  it.each(CASES)('rejects moving %s to another file', async (_, body) => {
    const files = FILES(body);
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.moveElement('app.api', { parent: 'far' }), 'parent');
    expectRejected(mutator, () => mutator.moveElement('app.api', { parent: null, file: 'b.c4' }), 'file');
  });
  it.each(CASES)('accepts moving %s within its file', SLOW, async (_, body) => {
    const files = FILES(body);
    const mutator = LikeC4Mutator.fromFiles(files);
    mutator.moveElement('app.api', { parent: 'core' });
    await expectAcceptedWrite(files, mutator.serialize());
  });
});

describe('a deployment path without an image (row 104)', () => {
  it('rejects moving a deployed element’s child out of the instance’s element and lists the paths', async () => {
    const files: Files = {
      'a.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
    }
    db = service 'DB'
  }
}
deployment {
  vm prod {
    gw = instanceOf app.api
    instanceOf app.db
  }
  prod.gw.handler -> prod.db 'queries'
}
`,
      'b.c4': `deployment {
  prod.gw.handler -> prod.db 'reads'
}
`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(mutator, () => mutator.moveElement('app.api.handler', { parent: 'app' }), 'parent');
    expect(error.related).toEqual([
      { ...at(files, 'a.c4', 'prod.gw.handler'), construct: 'deployment-path' },
      { ...at(files, 'b.c4', 'prod.gw.handler'), construct: 'deployment-path' },
    ]);
  });
});

describe('an element and its new ancestor (row 105)', () => {
  it.each([
    ['a relationship', `  app.api -> core 'reports'\n`, ''],
    ['a step', '', `views {\n  dynamic view d {\n    app.api -> core 'reports'\n  }\n}\n`],
  ])('rejects a move that makes %s join the element and its new parent', async (_, relation, views) => {
    const files: Files = {
      'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API'
  }
  core = system 'Core'
${relation}}
${views}`,
    };
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.moveElement('app.api', { parent: 'core' }), 'parent');
  });
});

describe('the moved names at unmodelled places (row 106)', () => {
  /** `app.api` with a child `handler`, `other.handler` beside it, and `text` at `place`. */
  const FILES = (place: 'opaque' | 'global', text: string): Files => ({
    'm.c4': `${SPEC}model {
  app = system 'App' {
    api = service 'API' {
      handler = service 'Handler'
    }
  }
  other = system 'Other' {
    handler = service 'Other handler'
  }
  core = system 'Core'
}
${place === 'global' ? `global {\n  predicateGroup g {\n    include ${text}\n  }\n}\n` : ''}views {
  dynamic view d {
    app.api -> other
${place === 'opaque' ? `    opt {\n      ${text} -> core\n    }\n` : ''}  }
}
`,
  });
  it.each([
    ['the moved name as a whole identifier in an opaque block', FILES('opaque', 'api')],
    ['a subtree name as a later dotted segment in an opaque block', FILES('opaque', 'app.api.handler')],
    ['the moved name as a whole identifier in a global predicate', FILES('global', 'api')],
    ['a subtree name as a later dotted segment in a global predicate', FILES('global', 'api.handler')],
    ['a same-named reference to another element (the conservative side)', FILES('opaque', 'other.handler')],
  ] as const)('rejects the move with %s', async (_, files) => {
    await expectValidLikeC4(files);
    const mutator = LikeC4Mutator.fromFiles(files);
    expectRejected(mutator, () => mutator.moveElement('app.api', { parent: 'core' }), 'fqn');
  });
});
