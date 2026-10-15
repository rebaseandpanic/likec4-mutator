/**
 * Compile-time contract between the public view read types and the test
 * oracle (checked by `npm run lint`, never run): every type the library
 * reports must be assignable to the shape the comparisons of
 * `tests/helpers/likec4-model.ts` read (`Reported*`), so that the oracle
 * compares exactly what the library publishes.
 */
import type { ViewInfo, ViewPredicateItem, ViewRuleInfo, ViewStepInfo, ViewStepStatementInfo, ViewWhereCondition } from '../../src/index.js';
import type {
  ReportedPredicateItem,
  ReportedStepStatement,
  ReportedView,
  ReportedViewRule,
  ReportedViewRules,
  ReportedViewStep,
  ReportedViewSteps,
  ReportedWhereCondition,
} from '../helpers/likec4-model.js';

/** Compiles only when `A` is assignable to `B`. */
type Assignable<A extends B, B> = A;

export type ViewContract = [
  Assignable<ViewInfo, ReportedView>,
  Assignable<ViewInfo, ReportedViewRules>,
  Assignable<ViewInfo, ReportedViewSteps>,
  Assignable<ViewRuleInfo, ReportedViewRule>,
  Assignable<ViewPredicateItem, ReportedPredicateItem>,
  Assignable<ViewWhereCondition, ReportedWhereCondition>,
  Assignable<ViewStepStatementInfo, ReportedStepStatement>,
  Assignable<ViewStepInfo, ReportedViewStep>,
];
