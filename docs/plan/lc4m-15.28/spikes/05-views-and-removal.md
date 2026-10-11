# Spike 05-views-and-removal

What breaks when a deployment node subtree or an `instanceOf` element is removed while deployment views / instances still reference it.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.28/spikes/05-views-and-removal.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
== A. all present
  (no diagnostics)
== B. prod.vm1 subtree (and its relation) removed, views unchanged
  ERROR m.c4:23: Could not resolve reference to Referenceable named 'vm1'.
  ERROR m.c4:23: Could not resolve reference to Referenceable named 'api'.
  ERROR m.c4:24: Could not resolve reference to Referenceable named 'vm1'.
  ERROR m.c4:24: Could not resolve reference to Referenceable named 'api'.
  ERROR m.c4:25: Could not resolve reference to Referenceable named 'vm1'.
  ERROR m.c4:26: Could not resolve reference to Referenceable named 'vm1'.
  ERROR m.c4:23: Validation failed: Element "prod.vm1.api" is not resolved
  ERROR m.c4:24: Validation failed: Element "prod.vm1.api" is not resolved
  ERROR m.c4:24: Validation failed: Element "prod.vm1.api" is not resolved
  ERROR m.c4:24: Validation failed: Element "prod.vm1.api" is not resolved
  ERROR m.c4:25: Validation failed: Element "prod.vm1" is not resolved
  ERROR m.c4:26: Validation failed: Element "prod.vm1" is not resolved
== C. element app.api removed from the model, deployment unchanged
  ERROR m.c4:16: Could not resolve reference to Referenceable named 'api'.
```
