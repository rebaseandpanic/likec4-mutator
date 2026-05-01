export { C4Parser } from './parser/parser.js';
export { C4Query } from './query/query.js';
export { buildFqnIndex, resolveFqnRef } from './query/fqn.js';
export type { ParsedDocument, ParseError } from './parser/types.js';
export type { ElementInfo, RelationshipInfo, SpecificationInfo } from './query/types.js';

// Mutation layer — public classes and option types
export { LikeC4Mutator } from './mutator/mutator.js';
export type {
  AddElementOpts,
  AddViewOpts,
  RemoveElementResult,
  UpdateElementPatch,
  UpdateRelationshipMatcher,
  UpdateRelationshipPatch,
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
