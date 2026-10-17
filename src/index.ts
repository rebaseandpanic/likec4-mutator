export { C4Parser } from './parser/parser.js';
export { C4Query } from './query/query.js';
export { buildFqnIndex, resolveFqnRef } from './query/fqn.js';
export { WorkspaceIndex } from './query/workspace-index.js';
export type { ParsedDocument, ParseError } from './parser/types.js';
export type {
  WorkspaceDocument,
  WorkspaceDocumentAst,
  ExtendBlockRef,
  ExtendElementNode,
  ExtendRelationBlockRef,
} from './query/workspace-index.js';
export type { ExtendRelationNode, RelationIdentity } from './query/relation-extends.js';
export type {
  DeploymentInstanceFilter,
  DeploymentNodeFilter,
  DeploymentRelationshipFilter,
} from './query/deployment-query.js';
export type {
  DeploymentEndpoint,
  DeploymentInstanceInfo,
  DeploymentNodeInfo,
  DeploymentNodeKindDefaults,
  DeploymentRelationshipInfo,
  ElementDecorations,
  ElementInfo,
  ExtendContribution,
  KindDefaults,
  RelationshipInfo,
  SourceRange,
  SpecificationInfo,
  ViewAutoLayout,
  ViewElementExpression,
  ViewInfo,
  ViewLayoutDirection,
  ViewOpaqueRuleKind,
  ViewPredicateItem,
  ViewReference,
  ViewRelationExpression,
  ViewRelationKind,
  ViewRuleAddress,
  ViewRuleInfo,
  ViewRuleKind,
  ViewStepAddress,
  ViewStepBody,
  ViewStepInfo,
  ViewStepStatementBase,
  ViewStepStatementInfo,
  ViewStepWriteResult,
  ViewText,
  ViewType,
  ViewWhereCondition,
  ViewWhereLeaf,
  ViewWithProperties,
  ViewWriteResult,
} from './query/types.js';
export type { DeploymentTarget, LinkedTarget } from './query/deployment-resolver.js';

// Mutation layer — public classes and option types
export { LikeC4Mutator } from './mutator/mutator.js';
export { InvalidWriteError, ReferencedRemovalError } from './mutator/write-checks.js';
export { RelationshipAmbiguityError } from './mutator/relationship-selector.js';
export type { RelatedConstruct, RemovalReference, RemovalReferenceRole, ViewRuleText } from './mutator/write-checks.js';
export type {
  AddDeploymentExtendOpts,
  AddDeploymentInstanceOpts,
  AddDeploymentNodeOpts,
  AddDeploymentRelationshipOpts,
  AddElementOpts,
  AddViewOpts,
  CascadedReference,
  RemoveOptions,
  UpdateViewPatch,
  ViewStepPatch,
  ViewStepSpec,
  DeploymentExtendSelector,
  DeploymentRelationshipSelector,
  RemoveDeploymentExtendResult,
  RemoveDeploymentInstanceResult,
  RemoveDeploymentNodeResult,
  RemoveDeploymentRelationshipResult,
  RemoveElementResult,
  RenameElementResult,
  RemoveRelationshipResult,
  RelationshipCandidate,
  RelationshipPosition,
  RelationshipSelector,
  UpdateDeploymentInstancePatch,
  UpdateDeploymentInstanceResult,
  UpdateDeploymentNodePatch,
  UpdateDeploymentNodeResult,
  UpdateDeploymentRelationshipPatch,
  UpdateDeploymentRelationshipResult,
  UpdateElementResult,
  UpdateElementPatch,
  UpdateRelationshipMatcher,
  UpdateRelationshipPatch,
  UpdateRelationshipResult,
} from './mutator/mutator.js';
export type { ElementStyle, RelationshipStyle } from './mutator/codegen.js';
export type { MetadataMap, MetadataPatch } from './mutator/metadata-ops.js';

// Codegen helpers — useful for consumers that want to preview generated text
export { generateElement, generateRelationship, generateView } from './mutator/codegen.js';
export type {
  GenerateElementOpts,
  GenerateRelationshipOpts,
  GenerateViewOpts,
} from './mutator/codegen.js';
