/**
 * Spike 02: what LikeC4 1.59.4 computes for deployment nodes, instances and
 * relationships — the raw data layer (`$data.deployments`) and the
 * LikeC4Model getters (`model.deployment.element(id)`), with node kind
 * defaults, element inheritance, `extend <node>` merges and two files.
 */
import { build, effective, show } from './_lc4.mts';

const files = {
  'a.c4': `
specification {
  element service {
    #svc
    technology 'Go'
    link https://example.com/svc-kind 'svc kind'
  }
  deploymentNode zone {
    #zonekind
    title 'Zone kind title'
    summary 'Zone kind summary'
    description 'Zone kind description'
    technology 'Zone kind tech'
    link https://example.com/zone-kind
    style { color green }
  }
  deploymentNode vm
  relationship calls {
    #relkind
    title 'calls kind title'
    technology 'HTTP'
  }
  tag svc
  tag zonekind
  tag own
  tag ext1
  tag ext2
  tag inst
  tag relkind
}
model {
  app = service 'App' {
    api = service 'API' {
      #own
      summary 'api summary'
      description 'api description'
      link https://example.com/api
      metadata { owner 'team-a'; tier 'one' }
      style { shape browser; color red }
    }
    db = service 'DB'
  }
}
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
      api2 = instanceOf app.api 'API copy' {
        #inst
        technology 'Rust'
        metadata { region 'eu' }
        style { color blue }
      }
      instanceOf app.db
    }
  }
  zone staging 'Staging' {
    #own
    link https://example.com/staging
    metadata { owner 'ops' }
  }
  zone named 'named'
  prod.vm1.api -[calls]-> prod.vm1.db
  prod.vm1.api -> prod.vm1.db 'reads' 'inline description' 'inline technology'
  prod.vm1.api2 -> prod.vm1.db {
    #own
    title 'body title'
    description 'body description'
    technology 'body tech'
    metadata { k 'v' }
  }
}
`,
  'b.c4': `
deployment {
  extend staging {
    #ext1
    link https://example.com/ext-b
    metadata { owner 'ext-b'; extra 'x' }
  }
}
`,
  'a/z.c4': `
deployment {
  extend staging {
    #ext2
    metadata { owner 'ext-az' }
  }
}
`,
};

const { diagnostics, model } = await build(files);
show('diagnostics', diagnostics);
const data = model.$data.deployments;
console.log('--- $data.deployments.elements');
for (const [id, el] of Object.entries(data.elements)) show(id, el);
console.log('--- $data.deployments.relations');
for (const rel of Object.values(data.relations) as any[]) {
  const { id: _id, astPath: _a, ...rest } = rel;
  show('relation', rest);
}
console.log('--- $data.specification.deployments');
show('spec', model.$data.specification.deployments);
console.log('--- LikeC4Model getters (model.deployment)');
for (const id of Object.keys(data.elements)) show(id, effective(model.deployment.element(id)));
for (const rel of model.deployment.relationships()) {
  show('relationship', {
    source: rel.source.id,
    target: rel.target.id,
    kind: rel.kind,
    title: rel.title,
    technology: rel.technology,
    description: rel.description?.text ?? null,
    tags: rel.tags,
    metadata: rel.metadata,
  });
}
