# Spike 00-grammar

View-related rules of the installed grammar, printed by `scripts/grammar-rules.ts`.

Command (from the repository root):

```bash
npx tsx docs/plan/lc4m-15.29/spikes/00-grammar.mts
```

Real output (LikeC4 / @likec4/language-server 1.59.4):

```text
LikeC4 grammar from @likec4/language-server 1.59.4
Tags (rule)
    (values+=TagRef+ ({Tags.prev=current} ',' values+=TagRef*)* ';'?)
ModelViews (rule)
    (name='views' folder=String? '{' (views+=LikeC4ViewRule | styles+=ViewRuleStyleOrGlobalRef)* '}')
ElementView (rule)
    ('view' name=Id? (('extends' extends=ElementViewRef) | ('of' viewOf=ElementRef))? body=ElementViewBody?)
DynamicView (rule)
    ('dynamic' 'view' name=Id body=DynamicViewBody?)
ElementViewBody (rule)
    ('{' tags=Tags? props+=ViewProperty* rules+=ViewRule* '}')
DynamicViewBody (rule)
    ('{' tags=Tags? props+=DynamicViewProperty* (steps+=StepStatement | rules+=DynamicViewRule)* '}')
ViewProperty (rule)
    (ViewStringProperty | ViewOrderProperty | LinkProperty)
ViewStringProperty (rule)
    (key=('title' | 'description') ':'? value=MarkdownOrString ';'?)
ViewOrderProperty (rule)
    (key='order' value=Number ';'?)
ViewRule (rule)
    (ViewRulePredicate | ViewRuleGlobalPredicateRef | ViewRuleGroup | ViewRuleStyleOrGlobalRef | ViewRuleAutoLayout | ViewRuleRank)
ViewRuleGroup (rule)
    ('group' title=String? '{' props+=(ColorProperty | BorderProperty | OpacityProperty)* groupRules+=(ViewRulePredicate | ViewRuleGlobalPredicateRef | ViewRuleGroup)* '}')
DynamicViewRule (rule)
    (DynamicViewIncludePredicate | DynamicViewGlobalPredicateRef | ViewRuleStyleOrGlobalRef | ViewRuleAutoLayout)
ViewRulePredicate (rule)
    ((isInclude?='include' | 'exclude') exprs=Expressions)
DynamicViewIncludePredicate (rule)
    ('include' exprs=Expressions)
ViewRuleAutoLayout (rule)
    ('autoLayout' direction=ViewLayoutDirection (rankSep=Number nodeSep=Number?)?)
CustomElementProperties (rule)
    ('{' props+=(NavigateToProperty | ElementStringProperty | NotationProperty | NotesProperty | StyleProperty)* '}')
CustomRelationProperties (rule)
    ('{' props+=(RelationNavigateToProperty | RelationStringProperty | NotationProperty | NotesProperty | RelationshipStyleProperty | MultipleProperty)* '}')
NavigateToProperty (rule)
    (key='navigateTo' value=ViewRef)
RelationNavigateToProperty (rule)
    (key='navigateTo' value=DynamicViewRef)
Expressions (rule)
    (value=ExpressionV2 ({Expressions.prev=current} ',' value=ExpressionV2?)*)
FqnExprOrWith (rule)
    (FqnExprOrWhere ({FqnExprWith.subject=current} 'with' custom=CustomElementProperties?)?)
RelationExprOrWith (rule)
    (RelationExprOrWhere ({RelationExprWith.subject=current} 'with' custom=CustomRelationProperties?)?)
StepStatement (rule)
    (SubflowStep | AltSteps | TryStep | StepSeries)
SubflowKind (rule)
    ('opt' | 'par' | 'parallel' | 'loop' | 'when' | 'if' | 'else' | 'break')
SubflowStep (rule)
    (kind=SubflowKind title=String? StepsBlockFragment)
FinallyBlock (rule)
    (CatchBlock ({FinallyBlock.tryCatch=current} 'finally' title=String? finally=StepsBlock)?)
CatchBlock (rule)
    (TryBlock ({CatchBlock.try=current} 'catch' title=String? catch=StepsBlock)?)
TryBlock (rule)
    ('try' title=String? StepsBlockFragment)
AltSteps (rule)
    ('alt' title=String? '{' branches+=SubflowStep* '}')
StepSeries (rule)
    (Step ({StepSeries.source=current} (dotKind=RelationKindDotRef | '->' | ('-[' kind=[RelationshipKind] ']->')) target=ElementRef title=String? custom=CustomRelationProperties?)*)
Step (rule)
    (source=ElementRef (isBackward?='<-' | dotKind=RelationKindDotRef | '->' | ('-[' kind=[RelationshipKind] ']->')) target=ElementRef title=String? custom=CustomRelationProperties?)
DeploymentView (rule)
    ('deployment' 'view' name=Id body=DeploymentViewBody?)
DeploymentViewBody (rule)
    ('{' tags=Tags? props+=ViewProperty* rules+=DeploymentViewRule* '}')
DeploymentViewRule (rule)
    (DeploymentViewRulePredicate | DeploymentViewRuleStyle | ViewRuleAutoLayout | ViewRuleAncestors)
DeploymentViewRulePredicate (rule)
    ((isInclude?='include' | 'exclude') expr=Expressions)
LinkProperty (rule)
    (key='link' ':'? value=Uri title=String? ';'?)
```

Conclusion:

- Body order is fixed by the grammar: `tags` first, then `props`, then `rules` (element and deployment views); a dynamic body is `tags`, `props`, then `steps` and `rules` freely interleaved.
- `Expressions` and `Tags` are left-recursive lists (`prev`); a trailing `,` is allowed (`value=ExpressionV2?`). Deployment predicates use the feature `expr`, element/dynamic predicates `exprs`.
- A step body is `CustomRelationProperties`; its `navigateTo` is a `DynamicViewRef`, while `with { navigateTo }` on an element predicate is a `ViewRef` (any view).
