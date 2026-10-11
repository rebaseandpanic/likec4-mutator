# Spike 03-validation-matrix

40 small workspaces checked with LikeC4 1.59.4 language services (validation on); each line lists the diagnostics (ERROR = what fails `likec4 validate`).

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/03-validation-matrix.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
01 valid baseline: OK (no diagnostics)
02 two unnamed instances of one element: ["ERROR m.c4:20: Duplicate instance name \"prod.api\"","ERROR m.c4:21: Duplicate instance name \"prod.api\""]
03 unnamed + explicitly named "api" of one element: ["ERROR m.c4:20: Duplicate instance name \"prod.api\"","ERROR m.c4:21: Duplicate instance name \"prod.api\""]
04 two named instances of one element: OK (no diagnostics)
05 instance named like a sibling node: ["ERROR m.c4:20: Duplicate node name \"prod.api\"","ERROR m.c4:21: Duplicate instance name \"prod.api\""]
06 same root node in two files: ["ERROR a.c4:18: Duplicate node name \"prod\"","ERROR b.c4:1: Duplicate node name \"prod\""]
07 node in extend body duplicating a base child: ["ERROR m.c4:20: Duplicate node name \"prod.vm1\"","ERROR m.c4:23: Duplicate node name \"prod.vm1\""]
08 unknown node kind: ["ERROR m.c4:19: Could not resolve reference to DeploymentNodeKind named 'nosuch'."]
09 instanceOf unresolved: ["ERROR m.c4:20: Could not resolve reference to Referenceable named 'missing'."]
10 instanceOf by unique short name (api): OK (no diagnostics)
11 instanceOf nested short name (sub): OK (no diagnostics)
12 relation endpoint is a model element FQN: ["ERROR m.c4:22: Could not resolve reference to Referenceable named 'app'.","ERROR m.c4:22: Could not resolve reference to Referenceable named 'db'.","ERROR m.c4:22: DeploymentRelation target 'app.db' not resolved"]
13 relation node -> own child instance: ["ERROR m.c4:22: Invalid parent-child relationship"]
14 relation self: ["ERROR m.c4:22: Invalid parent-child relationship"]
15 relation to nested element of an instance: OK (no diagnostics)
16 relation kind undeclared: ["ERROR m.c4:23: Could not resolve reference to RelationshipKind named 'nosuch'."]
17 tag undeclared on node: ["ERROR m.c4:20: Could not resolve reference to Tag named '#nosuch'."]
18 bidirectional <->: OK (no diagnostics)
19 sourceless relation in extend body: ["ERROR m.c4:24: Expecting: one of these possible Token sequences:","ERROR m.c4:24: Expecting token of type '}' but found `->`.","ERROR m.c4:24: Expecting: one of these possible Token sequences:","ERROR m.c4:24: Expecting token of type '}' but found `->`."]
20 extend targeting an instance: ["ERROR m.c4:22: Could not resolve reference to Referenceable named 'api'.","ERROR m.c4:22: ExtendDeployment allows only DeploymentNode"]
21 extend of unknown node: ["ERROR m.c4:19: Could not resolve reference to Referenceable named 'nosuch'.","ERROR m.c4:19: ExtendDeployment allows only DeploymentNode"]
22 extend of nested node: OK (no diagnostics)
23 relation between instances in different nodes: OK (no diagnostics)
24 relation instance -> ancestor node: ["ERROR m.c4:24: Invalid parent-child relationship"]
25 relative names inside a node body: OK (no diagnostics)
26 this -> x inside node body: OK (no diagnostics)
27 sourceless relation in instance body: OK (no diagnostics)
28 reserved instance / node names: ["ERROR m.c4:20: Reserved word: this","ERROR m.c4:21: Reserved word: it"]
29 relation with source inside extend body: OK (no diagnostics)
30 empty extend and empty deployment: OK (no diagnostics)
31 empty deployment block: OK (no diagnostics)
32 node kind named like an element kind: OK (no diagnostics)
33 node with icon, style, metadata, link, all string props: OK (no diagnostics)
34 instance with all props: OK (no diagnostics)
35 relation with style: OK (no diagnostics)
36 extend body with style / string property: ["ERROR m.c4:21: Expecting token of type '}' but found `title`."]
37 instance inside extend body: ["ERROR m.c4:25: Invalid parent-child relationship"]
38 relation from node to instance in other node: OK (no diagnostics)
39 relation tags on line and in body: OK (no diagnostics)
40 instance target is not an element (a node): ["ERROR m.c4:21: Could not resolve reference to Referenceable named 'prod'."]
```
