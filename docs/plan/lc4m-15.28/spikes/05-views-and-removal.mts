/**
 * Spike 05: what references deployment nodes / instances outside the
 * `deployment` block (deployment views), and what LikeC4 1.59.4 reports when
 * a referenced node, instance or `instanceOf` element is missing — i.e. what
 * a removal must handle or reject.
 */
import { build } from './_lc4.mts';

const SPEC = `
specification {
  element service
  deploymentNode zone
  deploymentNode vm
}
model {
  app = service {
    api = service
    db = service
  }
}
`;

const DEPLOYMENT_FULL = `
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
    instanceOf app.db
  }
  prod.vm1.api -> prod.db
}
`;
const DEPLOYMENT_WITHOUT_VM1 = `
deployment {
  zone prod {
    instanceOf app.db
  }
}
`;

const VIEWS = `
views {
  deployment view d1 {
    include prod.**
    include prod.vm1.api
    include prod.vm1.api -> prod.db
    exclude prod.vm1
    style prod.vm1 {
      color red
    }
  }
  view e1 of app {
    include *
  }
}
`;

for (const [label, files] of [
  ['A. all present', { 'm.c4': SPEC + DEPLOYMENT_FULL + VIEWS }],
  ['B. prod.vm1 subtree (and its relation) removed, views unchanged', { 'm.c4': SPEC + DEPLOYMENT_WITHOUT_VM1 + VIEWS }],
  [
    'C. element app.api removed from the model, deployment unchanged',
    { 'm.c4': SPEC.replace('    api = service\n', '') + DEPLOYMENT_FULL },
  ],
] as Array<[string, Record<string, string>]>) {
  const { diagnostics } = await build(files);
  console.log(`== ${label}`);
  for (const d of diagnostics) console.log(`  ${d}`);
  if (diagnostics.length === 0) console.log('  (no diagnostics)');
}
