/**
 * US-12: the existing logical writes keep the deployment references intact.
 *
 *  - `addElement` is rejected (field `name`, sources unchanged) when the new
 *    element would make an `instanceOf` target, the element part of a
 *    deployment relationship endpoint or a deployment view rule reference
 *    ambiguous, unresolved or re-targeted; the safe neighbouring call is
 *    accepted (row 32).
 *  - `removeElement` is rejected (field `fqn`, sources unchanged) while an
 *    instance deploys the element or an element of its subtree, or an
 *    endpoint steps into one through an instance; an unreferenced
 *    neighbour is removed (row 36).
 *
 * The re-target of every rejection is confirmed by LikeC4 1.60.0 on the
 * hand-written text the write would produce: the targets its linker bound
 * (`linkedReferences`), its deployment relations and its diagnostics.
 */
import { describe, expect, it } from 'vitest';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import {
  buildLikeC4Model,
  expectAgreesWithLikeC4,
  expectDeploymentInstancesAgreeWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectDeploymentRelationshipsAgreeWithLikeC4,
  expectValidLikeC4,
  linkedReferences,
  type LinkedTarget,
} from '../helpers/likec4-model.js';

const SPEC = `specification {
  element service
  deploymentNode vm
}
`;

/** Run `write`, expect an InvalidWriteError on `field`, and no file changed. */
function expectRejected(m: LikeC4Mutator, field: string, write: () => unknown): InvalidWriteError {
  const before = m.serialize();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(before);
  return error as InvalidWriteError;
}

/** Wv: the output is valid and every deployment read agrees with LikeC4. */
async function expectValidWrite(m: LikeC4Mutator): Promise<void> {
  const files = m.serialize();
  await expectValidLikeC4(files);
  await expectDeploymentNodesAgreeWithLikeC4(files, m.listDeploymentNodes());
  await expectDeploymentInstancesAgreeWithLikeC4(files, m.listDeploymentInstances());
  await expectDeploymentRelationshipsAgreeWithLikeC4(files, m.listDeploymentRelationships());
}

/** The target LikeC4's linker bound to the reference of `role` written as `text`; it must be listed once. */
async function linkedTarget(files: Record<string, string>, role: 'instanceOf' | 'deploymentView', text: string): Promise<LinkedTarget | null> {
  const found = (await linkedReferences(files)).filter((r) => r.role === role && r.text === text);
  expect(found, `${role} ${text}`).toHaveLength(1);
  return found[0]!.target;
}

/** The source of LikeC4's deployment relation titled `title`; undefined when LikeC4 dropped it. */
async function relationSource(files: Record<string, string>, title: string) {
  const { deployments } = await buildLikeC4Model(files);
  return deployments.relations.find((r) => r.title === title)?.source;
}

interface AdditionCase {
  name: string;
  input: string;
  /** Parent of the rejected and of the accepted element */
  parent: string;
  rejected: string;
  accepted: string;
  /** The text the rejected call would write: `input` with the element declared */
  written: (input: string) => string;
  /** LikeC4's target of the guarded reference in `files` */
  observe: (files: Record<string, string>) => Promise<unknown>;
  /** What the guarded reference links to before the write */
  before: unknown;
}

const ADDITIONS: AdditionCase[] = [
  {
    name: '(a) an instanceOf target written as a short name (spike 07 D)',
    input: `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
}
deployment {
  vm prod {
    instanceOf api
  }
}
`,
    parent: 'other',
    rejected: 'api',
    accepted: 'db',
    written: (input) => input.replace('  other = service {\n', '  other = service {\n    api = service\n'),
    observe: (files) => linkedTarget(files, 'instanceOf', 'api'),
    before: { model: 'app.api' },
  },
  {
    name: '(b) the element part of a deployment relationship endpoint',
    input: `${SPEC}model {
  app = service {
    api = service {
      x = service {
      }
      y = service {
        sub = service
      }
    }
  }
  other = service
}
deployment {
  vm prod {
    a = instanceOf app.api
    b = instanceOf other
  }
  prod.a.sub -> prod.b 'R'
}
`,
    parent: 'app.api.x',
    rejected: 'sub',
    accepted: 'other',
    written: (input) => input.replace('      x = service {\n', '      x = service {\n        sub = service\n'),
    observe: (files) => relationSource(files, 'R'),
    before: { deployment: 'prod.a', element: 'app.api.y.sub' },
  },
  {
    name: '(c) a deployment view style rule reached through the logical-element pass',
    input: `${SPEC}model {
  app = service {
    api = service
  }
  other = service {
  }
}
deployment {
  vm prod {
    a = instanceOf app.api
  }
}
views {
  deployment view dv {
    include prod.**
    style api {
      color red
    }
  }
}
`,
    parent: 'other',
    rejected: 'api',
    accepted: 'db',
    written: (input) => input.replace('  other = service {\n', '  other = service {\n    api = service\n'),
    observe: (files) => linkedTarget(files, 'deploymentView', 'api'),
    before: { model: 'app.api' },
  },
];

describe('addElement keeps deployment references (row 32)', () => {
  it.each(ADDITIONS)('$name', async ({ input, parent, rejected, accepted, written, observe, before }) => {
    const files = { 'm.c4': input };
    await expectValidLikeC4(files);
    // OP: LikeC4 links the guarded reference before the write and loses it
    // in the text the rejected call would write.
    expect(await observe(files)).toEqual(before);
    const writtenFiles = { 'm.c4': written(input) };
    expect(writtenFiles['m.c4']).not.toBe(input);
    expect(await observe(writtenFiles)).not.toEqual(before);
    const { diagnostics } = await buildLikeC4Model(writtenFiles);
    expect(diagnostics.some((d) => d.includes('Could not resolve reference'))).toBe(true);

    const rejecting = LikeC4Mutator.fromFiles(files);
    expectRejected(rejecting, 'name', () => rejecting.addElement(parent, { name: rejected, kind: 'service' }));
    expect(rejecting.getElement(`${parent}.${rejected}`)).toBeNull();

    const accepting = LikeC4Mutator.fromFiles(files);
    expect(accepting.addElement(parent, { name: accepted, kind: 'service' })).toBe(`${parent}.${accepted}`);
    await expectValidWrite(accepting);
    await expectAgreesWithLikeC4(accepting.serialize(), `${parent}.${accepted}`, accepting.getElement(`${parent}.${accepted}`)!);
  });
});

describe('removeElement keeps deployment references (row 36)', () => {
  const INPUT = `${SPEC}model {
  app = service {
    api = service
    gateway = service {
      inner = service {
        sub = service
      }
    }
  }
  other = service {
    db = service
  }
}
deployment {
  vm prod {
    instanceOf app.api
    gw = instanceOf app.gateway
    instanceOf other
  }
  prod.gw.sub -> prod.other 'R'
}
`;
  const FILES = { 'm.c4': INPUT };

  it.each([
    { fqn: 'app.api', listed: "'prod.api'", why: 'the element is an instanceOf target' },
    { fqn: 'app', listed: "'prod.api'", why: 'an element of the subtree is an instanceOf target (spike 07 C)' },
    { fqn: 'app.gateway.inner', listed: "'prod.gw.sub'", why: 'an element of the subtree is the element part of an endpoint' },
  ])('rejects $fqn: $why', async ({ fqn, listed }) => {
    await expectValidLikeC4(FILES);
    const { deployments } = await buildLikeC4Model(FILES);
    // OP: LikeC4 deploys app.api as prod.api and links the endpoint into the gateway's element.
    expect(deployments.elements['prod.api']?.element).toBe('app.api');
    expect(deployments.relations.find((r) => r.title === 'R')?.source).toEqual({ deployment: 'prod.gw', element: 'app.gateway.inner.sub' });

    const m = LikeC4Mutator.fromFiles(FILES);
    const error = expectRejected(m, 'fqn', () => m.removeElement(fqn));
    expect(error.detail).toContain(listed);
    expect(m.getElement(fqn)).not.toBeNull();
  });

  it('removes an unreferenced neighbour', async () => {
    const m = LikeC4Mutator.fromFiles(FILES);
    expect(m.removeElement('other.db')).toEqual({ removedRelationships: [] });
    expect(m.getElement('other.db')).toBeNull();
    await expectValidWrite(m);
  });
});
