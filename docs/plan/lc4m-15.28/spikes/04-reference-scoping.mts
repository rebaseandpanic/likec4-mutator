/**
 * Spike 04: how LikeC4 1.59.4 links the endpoints of deployment relations
 * (parentless names, qualified names, node vs instance precedence, `this`,
 * `extend` bodies, other files, references into an instance's element).
 * Each relation carries a distinct title; the resolved endpoints are read
 * from `$data.deployments.relations`.
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
    api = service {
      sub = service
    }
    db = service
    cache = service
  }
}
`;

async function run(label: string, files: Record<string, string>): Promise<void> {
  const { diagnostics, model } = await build(files);
  console.log(`== ${label}`);
  console.log(`diagnostics: ${JSON.stringify(diagnostics)}`);
  for (const rel of Object.values(model.$data.deployments.relations) as any[]) {
    console.log(`  '${rel.title ?? ''}': ${JSON.stringify(rel.source)} -> ${JSON.stringify(rel.target)}`);
  }
}

await run('A. node named like a closer instance (node wins or instance wins?)', {
  'm.c4': SPEC + `
deployment {
  zone api
  zone prod {
    instanceOf app.api
    instanceOf app.db
    api -> db 'A1'
  }
}`,
});

await run('B. qualified name through a unique descendant (prod.api where api is in prod.vm1)', {
  'm.c4': SPEC + `
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
    instanceOf app.db
  }
  prod.api -> prod.db 'B1'
}`,
});

await run('C. ambiguous descendant name (two vms each with api)', {
  'm.c4': SPEC + `
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
    vm vm2 {
      instanceOf app.api
    }
    instanceOf app.db
  }
  prod.api -> prod.db 'C1'
}`,
});

await run('D. parentless root node of another file; non-root of another file', {
  'a.c4': SPEC + `
deployment {
  zone prod {
    instanceOf app.api
  }
  zone dr {
    instanceOf app.db
    db -> prod 'D1'
    db -> api 'D2-api-is-non-root-of-this-file-but-unique-in-document'
  }
}`,
  'b.c4': `
deployment {
  zone edge {
    instanceOf app.cache
  }
  edge.cache -> prod.api 'D3'
  edge.cache -> cache 'D4-self-ignored'
}`,
});

await run('E. this / it and sourceless in node and instance bodies', {
  'm.c4': SPEC + `
deployment {
  zone prod {
    instanceOf app.db
    instanceOf app.api {
      -> db 'E1-sourceless-in-instance'
      it -> db 'E2-it-in-instance'
    }
    -> dr 'E3-sourceless-in-node'
  }
  zone dr
}`,
});

await run('F. reference into the element of an instance', {
  'm.c4': SPEC + `
deployment {
  zone prod {
    instanceOf app.api
    instanceOf app.db
  }
  prod.db -> prod.api.sub 'F1'
}`,
});

await run('G. extend body: names of the extended node, its descendants in other files', {
  'a.c4': SPEC + `
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
  }
}`,
  'b.c4': `
deployment {
  extend prod {
    instanceOf app.db
    api -> db 'G1'
    prod -> dr 'G2-extended-node-by-name'
  }
  zone dr
}`,
});

await run('H. document scope: name unique in this document deployment', {
  'm.c4': SPEC + `
deployment {
  zone prod {
    vm vm1 {
      instanceOf app.api
    }
  }
  zone dr {
    instanceOf app.db
  }
  api -> db 'H1-top-level-short-names'
}`,
});
