# Test plan rationale: Read and edit the LikeC4 deployment model


- **R-1 Oracle independence.** Expected values come from `buildLikeC4Model` (`$data` and getters), from `linkedReferences` (`FqnIndex.resolve` on linked documents) and from `validateLikeC4`. All three are LikeC4's own linker and model builder on the same text. The oracle is pinned to spike literals by the infrastructure checks I-2 to I-4, so a broken helper cannot agree with a broken library. Provenance rows (15, 23, 84) compare with positions of the test's own input text, not with a getter.
- **R-2 INV-7 (row 12).** Comparing the library with itself on a logical-only input would break §6. The row uses the existing logical oracle helpers on the full fixtures, plus a leak check on counts.
- **R-3 Deployment views and logical elements** (verified, probe in the session scratchpad, no repository change). The probe used `validateLikeC4` with node `prod`, instance `a = instanceOf app.api` and element `app.api.sub`. Real output:
  - `include app.api`, `exclude app.api` and `include other` each gave `Deployment view predicate must reference deployment model`;
  - `include prod.a.sub` gave `Must reference deployment nodes or instances, but not internals`;
  - `style app.api {…}`, `style prod.a.sub {…}` and `style api {…}` gave `[]`;
  - after adding `other.api`, `style api` gave `Could not resolve reference to Referenceable named 'api'` and `Validation failed: Element "api" is not resolved`.

  So logical-element and element-part references in deployment views are only valid in `style` rules (plan T001 amended).
- **R-4 Instance addition vs endpoint** (verified). Workspace: `prod { db = instanceOf app.db }`, `dr { api = instanceOf app.api }`, and top-level `dr.api -> db`. Before: `[]`. With `db2 = instanceOf app.db` in `dr`: `[]`. With an unnamed `instanceOf app.db` in `dr`: `Could not resolve reference to Referenceable named 'db'` and `DeploymentRelation target 'db' not resolved`. Row 62(b) uses exactly this accept/reject pair.
- **R-5 Direct mechanism tests vs consumer wiring.** Rows 6–9 (resolver) and 28–31 (snapshot) test extracted product modules directly. Product code calls them, so §5 allows it. They prove the mechanism is correct, not that it is wired, and stay green if no consumer calls them. Wiring is proved by consumer rows, each of which goes red when its consumer skips the mechanism.

  | Consumer | Mechanism | Rows |
  |---|---|---|
  | Relation reads | resolver | 26, 83 |
  | Instance reads | `instanceOf` scope | 23 |
  | Node reads | strict extend path | 85 |
  | `addDeploymentInstance` | `instanceOf` scope | 58 (#40) |
  | `addDeploymentRelationship` | resolver from the insertion point | 65, 66 |
  | `removeDeploymentNode` | view references | 53 |
  | Snapshot + `addElement` | — | 32–35 |
  | Snapshot + `removeElement` pre-check | — | 36 |
  | Snapshot + `addDeploymentNode` | — | 44, 93 |
  | Snapshot + `removeDeploymentNode` | — | 55 |
  | Snapshot + `addDeploymentInstance` / `removeDeploymentInstance` | — | 62 |
  | Snapshot + `removeDeploymentExtend` | — | 74, 93 |

  Every guard row pairs a rejection with an accepted safe write, so an unconditional guard also goes red.

  Two properties are not observable through any writer. First, strict-path extend targets: no accepted write can re-target them (same path = duplicate id, row 45; target removal cascades, row 52). Second, an extend-scope key collapse that keeps the pairing order: it has no product effect. Both stay unit-only (rows 29, 28), and no re-targeting addition is invented.
- **R-6 Fix rows** were found by code search:
  - the `getSpecification` assertions in `multi-file.test.ts:391,413` and `edge-cases.test.ts:596,605`;
  - `add-element-references.test.ts`;
  - the recursive sweeps in `parse-all` / `round-trip`;
  - the G5 guard files;
  - `line-endings.test.ts`: its `OPS` table is the existing owner of "written text uses the file's line ending", so row 92 extends it instead of opening a second owner.
- **R-7 Discriminating question.**
  - *Absent / not wired*: the oracle comparisons on fixture cases chosen per rule, plus the consumer rows of R-5.
  - *Unconditional or disabled*: the paired acceptances in rows 35, 44, 50, 53, 55, 62, 63, 70, 74 and 93.
  - *Wrong key*: order-sensitive file names (rows 10, 40), the multiplicity and scope rows (30, 55, 74, 93), the written-name row 86, and the id-filter row 27.
  - No numeric threshold exists to disable.
- **R-8 Implicit instance names** (verified, scratchpad probe, `validateLikeC4` on node `prod` with model `app.api.sub`):
  - `instanceOf missing` + `node missing` gave `Could not resolve reference to Referenceable named 'missing'`, `Duplicate instance name "prod.missing"` and `Duplicate node name "prod.missing"`;
  - `instanceOf app.sub` alone gave `[]` (it resolves to `app.api.sub` through a unique descendant);
  - `instanceOf app.sub` + `node sub` gave `Duplicate instance name "prod.sub"` and `Duplicate node name "prod.sub"`.

  For a resolved reference, LikeC4 resolves by the last written segment, so the written and resolved last segments are always the same name. The written-vs-resolved difference is observable only for an unresolved reference (row 86). Row 23 instead distinguishes last vs first segment and resolver use (`app.sub` → `app.api.sub`).
- **R-9 Sample blind spots.** The fixtures are valid, LF-only, unambiguous and use the default project. The library parses without linking while the oracle links. Invalid, CRLF, ambiguous and injection cases are inline. Row 82's sweeps check only parser acceptance and logical element FQNs and counts, so they are not evidence for deployment behaviour.
