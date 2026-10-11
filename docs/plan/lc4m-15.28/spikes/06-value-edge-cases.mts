/**
 * Spike 06: edge cases of effective values — empty titles, a node titled with
 * its own name, kind-tag order and duplicates, style merge with the kind,
 * repeated metadata blocks, relation kind defaults vs own values, and
 * `extend <node>` on a nested node declared in another file.
 */
import { build, effective, show } from './_lc4.mts';

const files = {
  'm.c4': `
specification {
  element service {
    style { shape browser; color red }
  }
  deploymentNode zone {
    #k1, #k2
    title 'Kind title'
    style { color green; shape cylinder }
  }
  deploymentNode vm
  relationship calls {
    title 'Kind rel title'
    description 'Kind rel description'
    technology 'Kind tech'
  }
  tag k1
  tag k2
  tag own
}
model {
  app = service 'App' {
    api = service 'API' {
      style { icon tech:go }
    }
  }
}
deployment {
  zone emptyInline ''
  zone emptyBody {
    title ''
  }
  zone selfNamed 'selfNamed'
  zone ownTags {
    #k2, #own
    style { shape queue }
    metadata { a '1' }
    metadata { b '2' }
  }
  vm host {
    i1 = instanceOf app.api ''
    i2 = instanceOf app.api {
      title ''
      style { color amber }
    }
    i3 = instanceOf app.api 'Inline' 'inline summary' {
      summary 'body summary'
    }
  }
  host.i1 -[calls]-> host.i2
  host.i1 -[calls]-> host.i3 'Own title' {
    technology ''
  }
  host.i2 -> host.i3 ''
  host.i2 .calls host.i1 {
    title 'body'
  }
}
`,
  'z.c4': `
deployment {
  extend host {
    #own
    vm inner
  }
}
`,
};

const { diagnostics, model } = await build(files);
show('diagnostics', diagnostics);
console.log('--- $data.deployments.elements');
for (const [id, el] of Object.entries(model.$data.deployments.elements)) show(id, el);
console.log('--- LikeC4Model getters');
for (const id of Object.keys(model.$data.deployments.elements)) {
  const el = model.deployment.element(id);
  show(id, { ...effective(el), style: el.style });
}
console.log('--- relations ($data, then getters)');
for (const rel of Object.values(model.$data.deployments.relations) as any[]) {
  const { id: _i, astPath: _a, ...rest } = rel;
  show('data', rest);
}
for (const rel of model.deployment.relationships()) {
  show('getter', {
    source: rel.source.id,
    target: rel.target.id,
    kind: rel.kind,
    title: rel.title,
    description: rel.description?.text ?? null,
    technology: rel.technology,
  });
}
