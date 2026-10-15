/**
 * Spike 00: the view-related rules of the installed LikeC4 grammar, as printed
 * by the repository's own `scripts/grammar-rules.ts` (which reads
 * `likec4.Grammar` from @likec4/language-server).  Filters the definitions of
 * the rules the other spikes rely on.
 */
import { execFileSync } from 'node:child_process';

const RULES = [
  'ModelViews', 'ElementView', 'DynamicView', 'DeploymentView',
  'ElementViewBody', 'DynamicViewBody', 'DeploymentViewBody',
  'ViewProperty', 'ViewStringProperty', 'ViewOrderProperty', 'LinkProperty', 'Tags',
  'ViewRule', 'DynamicViewRule', 'DeploymentViewRule', 'ViewRulePredicate', 'DynamicViewIncludePredicate',
  'DeploymentViewRulePredicate', 'ViewRuleGroup', 'ViewRuleAutoLayout', 'Expressions',
  'FqnExprOrWith', 'RelationExprOrWith', 'CustomElementProperties', 'CustomRelationProperties',
  'NavigateToProperty', 'RelationNavigateToProperty',
  'StepStatement', 'Step', 'StepSeries', 'SubflowStep', 'SubflowKind', 'AltSteps', 'TryBlock', 'CatchBlock', 'FinallyBlock',
];
const out = execFileSync('npx', ['tsx', 'scripts/grammar-rules.ts'], { encoding: 'utf8' });
const lines = out.split('\n');
console.log(lines[0]);
for (let i = 0; i < lines.length; i++) {
  const m = lines[i]!.match(/^  ([A-Za-z]+) \(/);
  if (m && RULES.includes(m[1]!)) console.log(lines[i]!.trim().replace(/ grammar-hash .*/, '') + '\n    ' + lines[i + 1]!.trim());
}
