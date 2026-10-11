/**
 * Spike 07: what the library (current src/) does with deployment content
 * today, and whether its body readers work unchanged on deployment ASTs.
 *  A. reads: getSpecification / getRelationships on a workspace with deployment.
 *  B. generic readers (readContribution, readDeclared, readKindSpec) applied
 *     to a DeploymentNode body, a DeployedInstance body and a
 *     SpecificationDeploymentNodeKind.
 *  C. removeElement of an element referenced by `instanceOf`.
 *  D. addElement whose new name changes what an `instanceOf` reference links to.
 */
import { LikeC4Mutator } from '../../../../src/mutator/mutator.js';
import { C4Parser } from '../../../../src/parser/parser.js';
import { readContribution, readDeclared } from '../../../../src/query/extend-merge.js';
import { readKindSpec } from '../../../../src/query/kind-specs.js';
import { build } from './_lc4.mts';

const src = `
specification {
  element service
  deploymentNode zone {
    #k1
    title 'Zone'
    technology 'K8s'
    link https://example.com/zone
  }
  tag k1
  tag own
}
model {
  app = service {
    api = service
  }
  other = service {
  }
}
deployment {
  zone prod {
    #own
    link https://example.com/prod 'Prod'
    metadata { owner 'ops' }
    instanceOf api {
      #own
      metadata { tier ['a', 'b'] }
    }
  }
  prod.api -> prod
}
`;

const m = LikeC4Mutator.fromFiles({ 'm.c4': src });
console.log('A. getSpecification:', JSON.stringify(m.getSpecification()));
console.log('A. getRelationships count:', m.getRelationships().length);
console.log('A. validate():', JSON.stringify(m.validate()));

const ast = new C4Parser().parse(src).ast as any;
const node = ast.deployments[0].elements[0];
const instance = node.body.elements[0];
console.log('B. node readContribution:', JSON.stringify(readContribution(node.body)));
console.log('B. node readDeclared:', JSON.stringify(readDeclared(node.body)));
console.log('B. instance readContribution:', JSON.stringify(readContribution(instance.body)));
console.log('B. instance readDeclared:', JSON.stringify(readDeclared(instance.body)));
const kind = ast.specifications[0].deploymentNodes[0];
const spec = readKindSpec(kind, 'm.c4', false);
console.log('B. readKindSpec(deploymentNode zone):', JSON.stringify({ defaults: { ...spec.defaults, sourceRange: undefined }, contribution: spec.contribution }));

// C. removeElement of app.api (referenced by `instanceOf api`)
const c = LikeC4Mutator.fromFiles({ 'm.c4': src.replace('  prod.api -> prod\n', '') });
const removed = c.removeElement('app.api');
console.log('C. removeElement(app.api) returned:', JSON.stringify(removed));
console.log('C. LikeC4 on the result:', JSON.stringify((await build(c.serialize())).diagnostics));

// D. addElement('other', { name: 'api' }) makes the short name `api` ambiguous
const d = LikeC4Mutator.fromFiles({ 'm.c4': src.replace('  prod.api -> prod\n', '') });
let outcome: string;
try {
  d.addElement('other', { name: 'api', kind: 'service' });
  outcome = 'accepted';
} catch (err) {
  outcome = `rejected: ${(err as Error).message}`;
}
console.log('D. addElement(other.api):', outcome);
if (outcome === 'accepted') console.log('D. LikeC4 on the result:', JSON.stringify((await build(d.serialize())).diagnostics));
