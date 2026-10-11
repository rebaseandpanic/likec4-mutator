# Test plan rationale: Read and edit the LikeC4 deployment model


- **R-1 Oracle independence.** Expected values come from three sources, all LikeC4's own linker, validator and model builder running on the same text, never the library's code:
  - `buildLikeC4Model` (`$data` and getters);
  - `linkedReferences` (`FqnIndex.resolve` on linked documents);
  - `validateLikeC4`.

  The helper has no standalone test of its own. Its assumptions are documented as review evidence (I-2 to I-4: spike outputs and plan code facts). Each product row that relies on an oracle fact asserts it as a precondition (OP: rows 7–9, 13, 21, 22). Rows 14, 20 and 25 compare the library directly with spike literals, which do not pass through the helper. So a helper defect either breaks an OP precondition or disagrees with a spike literal. Provenance rows (15, 23, 84) compare with positions of the test's own input text. The legacy `tests/likec4-validate-oracle.test.ts` stays unchanged.
- **R-2 INV-7 (row 12).** Comparing the library with itself on a logical-only input would break §6. The row uses the existing logical oracle helpers on the full fixtures, plus a leak check on counts.
- **R-3 Deployment views and logical elements** (verified, probe in the session scratchpad, no repository change). The probe used `validateLikeC4` with node `prod`, instance `a = instanceOf app.api` and element `app.api.sub`. Real output:
  - `include app.api`, `exclude app.api` and `include other` each gave `Deployment view predicate must reference deployment model`;
  - `include prod.a.sub` gave `Must reference deployment nodes or instances, but not internals`;
  - `style app.api {…}`, `style prod.a.sub {…}` and `style api {…}` gave `[]`;
  - after adding `other.api`, `style api` gave `Could not resolve reference to Referenceable named 'api'` and `Validation failed: Element "api" is not resolved`.

  So logical-element and element-part references in deployment views are only valid in `style` rules (plan T001).
- **R-4 Instance addition vs endpoint** (verified). Workspace: `prod { db = instanceOf app.db }`, `dr { api = instanceOf app.api }`, and top-level `dr.api -> db`. Before: `[]`. With `db2 = instanceOf app.db` in `dr`: `[]`. With an unnamed `instanceOf app.db` in `dr`: `Could not resolve reference to Referenceable named 'db'` and `DeploymentRelation target 'db' not resolved`. Row 62(b) uses exactly this accept/reject pair.
- **R-5 Direct mechanism tests vs consumer wiring.** Rows 6–9 (resolver) and 28–31 (snapshot) test extracted product modules directly. Product code calls them, so §5 allows it. They prove the mechanism is correct, not that it is wired, and stay green if no consumer calls them. Wiring is proved by consumer rows:

  | Consumer | Mechanism | Rows |
  |---|---|---|
  | Relation reads | resolver | 26, 83 |
  | Instance reads | `instanceOf` scope | 23 |
  | Node reads | strict extend path | 85 |
  | `addDeploymentInstance` | `instanceOf` scope | 58 (#40) |
  | `addDeploymentRelationship` | resolver from the insertion point | 65, 66 |
  | `removeDeploymentNode` | view references | 53 |
  | Snapshot + `addElement` | — | 32 |
  | Snapshot + `removeElement` pre-check | — | 36 |
  | Snapshot + `addDeploymentNode` | — | 44, 93 |
  | Snapshot + `removeDeploymentNode` | — | 55 |
  | Snapshot + `addDeploymentInstance` / `removeDeploymentInstance` | — | 62 |
  | Snapshot + `removeDeploymentExtend` | — | 74, 93 |

  Each guard row is one obligation holding both a rejection and a safe acceptance, so a skipped guard and an always-rejecting guard both go red in the same row.

  Two properties are not observable through any writer. First, strict-path extend targets: no accepted write can re-target them (same path = duplicate id, row 45; target removal cascades, row 52). Second, an extend-scope key collapse that keeps the pairing order: it has no product effect. Both stay unit-only (rows 29, 28), and no re-targeting addition is invented.
- **R-6 Fix rows** were found by code search:
  - the `getSpecification` assertions in `multi-file.test.ts:391,413` and `edge-cases.test.ts:596,605`;
  - `add-element-references.test.ts`;
  - the recursive sweeps in `parse-all` / `round-trip`;
  - the G5 guard files;
  - `line-endings.test.ts`: its `OPS` table is the existing owner of "written text uses the file's line ending", so row 92 extends it.

  For Wi, `tests/mutator/semantic-write-checks.test.ts` ("accepts valid writes into a workspace with unrelated LikeC4 errors and adds no error") is the existing precedent for comparing error sets before and after.
- **R-7 Discriminating question (reasoning only).**
  - *Absent / not wired*: the oracle comparisons on fixture cases chosen per rule, plus the consumer rows of R-5.
  - *Unconditional or disabled guard*: the acceptance half inside the same obligation — rows 32, 36, 44, 50, 53, 55, 62, 63, 70, 74 and 93.
  - *Wrong key*: order-sensitive file names (rows 10, 40), the multiplicity and scope rows (30, 55, 74, 93), the written-name row 86, the id-filter row 27, and the endpoint sub-paths (rows 65, 76, 77, 89).
  - *Unsafe input (rows 88–91)*: these show refusal and atomicity for the given inputs. They **cannot** show that a dedicated form check exists or runs: the semantic lookup refuses the same inputs (`resolveReferenceText` splits on dots and compares exact names; a missing id or an unloaded file fails its lookup). No form-only product effect is claimed, and no private call-order, source or message-text assertion is used. If a form-only effect is specified later, it needs its own observable row.
  - No numeric threshold exists to disable.
- **R-8 Implicit instance names** (verified, scratchpad probe, `validateLikeC4` on node `prod` with model `app.api.sub`):
  - `instanceOf missing` + `node missing` gave `Could not resolve reference to Referenceable named 'missing'`, `Duplicate instance name "prod.missing"` and `Duplicate node name "prod.missing"`;
  - `instanceOf app.sub` alone gave `[]`;
  - `instanceOf app.sub` + `node sub` gave `Duplicate instance name "prod.sub"` and `Duplicate node name "prod.sub"`.

  For a resolved reference the written and resolved last segments are always the same name, so the difference is observable only for an unresolved reference (row 86).
- **R-9 Sample blind spots.** The fixtures are valid, LF-only, unambiguous and use the default project. The library parses without linking while the oracle links. Invalid, CRLF, ambiguous and unsafe-input cases are inline. Wi rows do not compare survivors with the oracle, because LikeC4's model of an invalid input is best effort. Row 82's sweeps check only parser acceptance and logical element FQNs and counts.
- **R-10 Text to apply to `plan.md` and the spec** (requested by the lead).
  - **T001 gate**, replace with: "Gate: both fixtures pass `expectValidLikeC4`, asserted as a precondition in the consuming product test files (tests.md convention P); nothing is added to `tests/likec4-validate-oracle.test.ts`."
  - **T002**:
    - Header, replace the file list with: "`tests/helpers/likec4-model.ts`".
    - Gate, replace the whole block with: "Gate: the existing `tests/likec4-validate-oracle.test.ts` is unchanged and green; the helper gets no standalone test. Its assumptions are review evidence (spikes 02, 03, 04 and 06; code facts LS:3486, LS:2917-2921). Every consuming [TEST] task asserts the oracle preconditions it relies on inside its own product rows (tests.md convention OP: rows 7–9, 13, 21, 22)."
  - **T029**, add the bullet: "Accepted writes on a valid input pass `expectValidLikeC4`; the accepted title update under a syntax error (tests.md row 50) is checked by read-back and an unchanged LikeC4 error set (INV-1 introduced-only)."
  - **T033**, replace "two fixtures, oracle values after each write, `expectValidLikeC4`" with: "two fixtures, oracle values after each write on a valid input and `expectValidLikeC4`; on inputs that already have LikeC4 errors (syntax error, ambiguous reference — tests.md rows 62(c), 63) the accepted write is checked by read-back and an unchanged LikeC4 error set (INV-1 introduced-only)".
  - **T037**, replace "two fixtures; oracle and `expectValidLikeC4`" with: "two fixtures; oracle and `expectValidLikeC4` on valid inputs; the accepted update under a syntax error (tests.md row 70) checked by read-back and an unchanged LikeC4 error set (INV-1 introduced-only)".
  - **Delivery strategy, step 4**, replace "oracle values after each write and `expectValidLikeC4` on every output;" with: "oracle values after each write and `expectValidLikeC4` on every output from a valid input; on inputs that already have LikeC4 errors, read-back plus an unchanged LikeC4 error set (INV-1 introduced-only);".
  - **T035**, add the bullet: "Selector errors: a relationship selector that matches nothing or several relationships is reported on `source` (candidates named for several); a malformed selector endpoint is reported on the same sub-paths as T034 (`source.id`, `source.element`, `target.id`, `target.element`)."
  - **T036**, append: "Selector errors as in T035."
  - **Spec SC-003** (if the lead also amends the spec), replace with: "Every successful deployment write in the test suite (and every successful `addElement` / `removeElement` touching deployment references) on a valid input produces files that pass `expectValidLikeC4`; a successful write on an input that already has LikeC4 errors introduces no new error (INV-1)."
