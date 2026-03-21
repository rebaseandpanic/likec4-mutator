export { C4Parser } from './parser/parser.js';
export { C4Query } from './query/query.js';
export { buildFqnIndex, resolveFqnRef } from './query/fqn.js';
export type { ParsedDocument, ParseError, DocumentPosition } from './parser/types.js';
export type { ElementInfo, RelationshipInfo, SpecificationInfo } from './query/types.js';

// Mutation layer
export { LikeC4Mutator } from './mutator/mutator.js';
export type { AddElementOpts, AddViewOpts } from './mutator/mutator.js';
export { applyEdits } from './mutator/text-edit.js';
export type { TextEdit } from './mutator/text-edit.js';
export { detectIndent, getNodeIndent } from './mutator/indent.js';
export { generateElement, generateRelationship, generateView } from './mutator/codegen.js';
export type {
  GenerateElementOpts,
  GenerateRelationshipOpts,
  GenerateViewOpts,
} from './mutator/codegen.js';
export { addElementEdit, updateElementEdit, removeElementEdit } from './mutator/element-ops.js';
export { addRelationshipEdit, removeRelationshipEdit } from './mutator/relationship-ops.js';
export { addViewEdit } from './mutator/view-ops.js';
