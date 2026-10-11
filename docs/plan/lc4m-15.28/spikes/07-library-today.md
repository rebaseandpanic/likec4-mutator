# Spike 07-library-today

What the current library (src/) does with deployment content: reads, generic body readers on deployment ASTs, and two existing write paths that silently break `instanceOf` references (removeElement, addElement).

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/07-library-today.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
A. getSpecification: {"elementKinds":["service"],"tags":["k1","own"],"relationshipKinds":[]}
A. getRelationships count: 0
A. validate(): []
B. node readContribution: {"tags":["own"],"links":[{"url":"https://example.com/prod","label":"Prod"}],"metadata":{"owner":"ops"}}
B. node readDeclared: {"tags":["own"],"links":[{"url":"https://example.com/prod","label":"Prod"}],"metadata":{"owner":"ops"}}
B. instance readContribution: {"tags":["own"],"metadata":{"tier":["a","b"]}}
B. instance readDeclared: {"tags":["own"],"metadata":{"tier":["a","b"]}}
B. readKindSpec(deploymentNode zone): {"defaults":{"kind":"zone","file":"m.c4","title":"Zone","technology":"K8s","tags":["k1"],"links":[{"url":"https://example.com/zone"}]},"contribution":{"tags":["k1"],"links":[{"url":"https://example.com/zone"}]}}
C. removeElement(app.api) returned: {"removedRelationships":[]}
C. LikeC4 on the result: ["ERROR m.c4:24: Could not resolve reference to Referenceable named 'api'."]
D. addElement(other.api): accepted
D. LikeC4 on the result: ["ERROR m.c4:26: Could not resolve reference to Referenceable named 'api'."]
```
