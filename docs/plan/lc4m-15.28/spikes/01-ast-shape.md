# Spike 01-ast-shape

AST shape of deployment constructs as produced by the library's standalone parser (`C4Parser`, no linking): field names of `DeploymentNode`, `DeployedInstance`, `DeploymentRelation`, `ExtendDeployment`, `specification.deploymentNodes`.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/01-ast-shape.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
parse errors: 0
root keys with deployments: [
  'specifications',
  'models',
  'deployments',
  'globals',
  'imports',
  'likec4lib',
  'views'
]
deployments blocks: 1 name field: deployment
DeploymentNode {"name":"prod","kind":"zone","title":"Production","summary":"Prod summary","bodyProps":["ElementStringProperty:technology"],"bodyTags":["#edge"]}
  DeploymentNode {"name":"vm1","kind":"vm","bodyProps":[]}
    DeployedInstance {"targetType":"ElementRef","target":"app.api"}
    DeployedInstance {"name":"primary","targetType":"ElementRef","target":"app.db","title":"Primary DB"}
      DeploymentRelation {"target":"prod.vm1.api","isBidirectional":false,"title":"pings","container":"DeployedInstanceBody"}
    DeploymentRelation {"source":"api","target":"primary","isBidirectional":false,"title":"reads","description":"desc inline","technology":"tech inline","lineTags":["#edge"],"bodyProps":["RelationStringProperty:description"],"container":"DeploymentNodeBody"}
DeploymentRelation {"source":"prod.vm1.api","target":"prod.vm1.primary","kind":"calls","isBidirectional":false,"container":"ModelDeployments"}
DeploymentRelation {"source":"prod.vm1.api","target":"prod.vm1.primary","dotKind":"calls","isBidirectional":false,"container":"ModelDeployments"}
DeploymentRelation {"source":"prod.vm1.api","target":"prod.vm1.primary","isBidirectional":true,"container":"ModelDeployments"}
ExtendDeployment {"targetType":"StrictFqnRef","target":"prod.vm1","bodyType":"ExtendDeploymentBody","bodyProps":["LinkProperty","MetadataBody"]}
  DeploymentNode {"name":"extra","kind":"vm"}
specification.deploymentNodes: [
  'SpecificationDeploymentNodeKind:zone',
  'SpecificationDeploymentNodeKind:vm'
]
```
