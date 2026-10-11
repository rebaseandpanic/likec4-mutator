/**
 * Spike 01: AST shape of the deployment constructs as the library's own
 * standalone parser (C4Parser, no linking) produces it.
 */
import { C4Parser } from '../../../../src/parser/parser.js';

const src = `
specification {
  element service
  deploymentNode zone
  deploymentNode vm
  relationship calls
  tag edge
}
model {
  app = service {
    api = service
    db = service
  }
}
deployment {
  zone prod 'Production' 'Prod summary' {
    #edge
    technology 'K8s'
    vm1 = vm {
      instanceOf app.api
      primary = instanceOf app.db 'Primary DB' { -> prod.vm1.api 'pings' }
      api -> primary 'reads' 'desc inline' 'tech inline' #edge { description 'body desc' }
    }
  }
  prod.vm1.api -[calls]-> prod.vm1.primary
  prod.vm1.api .calls prod.vm1.primary
  prod.vm1.api <-> prod.vm1.primary
  extend prod.vm1 {
    #edge
    link https://example.com/runbook 'Runbook'
    metadata { owner 'ops' }
    vm extra
  }
}
`;

const doc = new C4Parser().parse(src);
console.log('parse errors:', doc.errors.length);
const ast = doc.ast as any;
console.log('root keys with deployments:', Object.keys(ast).filter((k) => !k.startsWith('$')));
console.log('deployments blocks:', ast.deployments.length, 'name field:', ast.deployments[0].name);

function walk(node: any, depth: number): void {
  const pad = '  '.repeat(depth);
  const t = node.$type;
  const info: Record<string, unknown> = {};
  if (t === 'DeploymentNode') {
    info.name = node.name;
    info.kind = node.kind?.$refText;
    info.title = node.title;
    info.summary = node.summary;
    info.bodyProps = node.body?.props?.map((p: any) => p.$type + (p.key ? ':' + p.key : ''));
    info.bodyTags = node.body?.tags?.values?.map((v: any) => v.$cstNode?.text);
  } else if (t === 'DeployedInstance') {
    info.name = node.name;
    info.targetType = node.target?.$type;
    info.target = refText(node.target?.modelElement);
    info.title = node.title;
  } else if (t === 'DeploymentRelation') {
    info.source = node.source ? refText(node.source) : undefined;
    info.target = refText(node.target);
    info.kind = node.kind?.$refText;
    info.dotKind = node.dotKind?.kind?.$refText;
    info.isBidirectional = node.isBidirectional;
    info.title = node.title;
    info.description = node.description;
    info.technology = node.technology;
    info.lineTags = node.tags?.values?.map((v: any) => v.$cstNode?.text);
    info.bodyProps = node.body?.props?.map((p: any) => p.$type + (p.key ? ':' + p.key : ''));
    info.container = node.$container?.$type;
  } else if (t === 'ExtendDeployment') {
    info.targetType = node.deploymentNode?.$type;
    info.target = refText(node.deploymentNode);
    info.bodyType = node.body?.$type;
    info.bodyProps = node.body?.props?.map((p: any) => p.$type);
  }
  console.log(`${pad}${t} ${JSON.stringify(info)}`);
  for (const child of node.body?.elements ?? node.elements ?? []) walk(child, depth + 1);
}
function refText(ref: any): string {
  const parts: string[] = [];
  for (let r = ref; r; r = r.parent) parts.unshift(r.value?.$refText);
  return parts.join('.');
}
for (const block of ast.deployments) for (const el of block.elements) walk(el, 0);
const spec = ast.specifications[0];
console.log('specification.deploymentNodes:', spec.deploymentNodes.map((k: any) => `${k.$type}:${k.kind.name}`));
