# Test plan rationale: Read and edit the LikeC4 deployment model


- **R-1 Oracle independence.** Expected values come from `buildLikeC4Model` (`$data` and getters), from `linkedReferences` (`FqnIndex.resolve` on linked documents) and from `validateLikeC4`. All three run LikeC4's own linker and model builder on the same text, never the library's code. Rows 2–4 pin the oracle to literals recorded in spikes 02/03/04/06, so a broken helper cannot agree with a broken library.
- **R-2 INV-7 (row 12).** The plan states this as "equal to values computed from the logical part alone". Taken literally, that compares the library with itself (§6). The row instead uses the existing logical oracle helpers on the full fixtures, plus a leak check on counts.
- **R-3 Deployment views and logical elements (verified, probe in the scratchpad, no repository change).** The probe used `validateLikeC4` on a workspace with node `prod`, instance `a = instanceOf app.api` and element `app.api.sub`. Real output:
  - `include app.api`, `exclude app.api` and `include other` each gave `Deployment view predicate must reference deployment model`;
  - `include prod.a.sub` gave `Must reference deployment nodes or instances, but not internals`;
  - `style app.api { color red }`, `style prod.a.sub { … }` and `style api { … }` gave `[]` (valid);
  - after adding `other.api`, `style api` gave `Could not resolve reference to Referenceable named 'api'` and `Validation failed: Element "api" is not resolved`.

  So logical-element and element-part references in deployment views are only valid in `style` rules. The T001 fixtures, T008 (row 9) and T019 (row 34) must place them there.
- **R-4 Instance addition vs endpoint (verified).** Workspace: `prod { db = instanceOf app.db }`, `dr { api = instanceOf app.api }`, and `dr.api -> db` at the top level. Before: `[]`. With a named `db2 = instanceOf app.db` in `dr`: `[]`. With an unnamed `instanceOf app.db` in `dr`: `Could not resolve reference to Referenceable named 'db'` and `DeploymentRelation target 'db' not resolved`.
- **R-5 Internal modules tested directly.** `DeploymentResolver` (T008) and the reference snapshot (T019 direct) are internal. Product code (the queries and writers) calls them, so testing their observable output is allowed by §5. Their expectations are still LikeC4 observations, not their own output.
- **R-6 Fix rows.** These were found by code search, not memory:
  - `getSpecification` `toEqual`/`toBeNull`: `multi-file.test.ts:391,413`, `edge-cases.test.ts:596,605`;
  - `add-element-references.test.ts`, which pins the detail wording;
  - the recursive fixture sweeps in `parse-all` / `round-trip`, which pick up the new fixtures with no edit;
  - the unchanged files guarding the G5 refactors.

  No existing test pins the US-12 defects (row 37).
- **R-7 Discriminating question.** Every mechanism row names its own "goes red if". The questions "absent" and "built but not wired" are answered by:
  - the oracle comparisons — an un-wired option or reader leaves a field equal to its default, which differs from the oracle on the fixture case chosen for that rule;
  - "wrong key" by the order-sensitive file names (rows 10, 40) and by the multiplicity rows (30, 55, 74).

  No threshold exists to disable.
