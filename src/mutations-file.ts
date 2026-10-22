/**
 * Shape and validation of the JSON file consumed by the CLI `apply` command.
 *
 * The file is untrusted input: `JSON.parse` gives no type guarantees, and a
 * value of the wrong type (e.g. `"tags": "internal"` instead of an array) would
 * otherwise flow into the mutator and be misinterpreted — a string is iterable
 * and would become one tag per character.  {@link parseMutationsFile} checks
 * every field the `apply` command reads, rejects fields it does not know (a
 * misspelled field would otherwise be silently ignored) and reports the first
 * violation with its JSON path, e.g. `mutations[2].links[0].url`.
 */
import type { ElementStyle, RelationshipStyle } from './mutator/codegen.js';
import { checkEndpointForm, checkSelectorForm, type DeploymentRelationshipSelector } from './mutator/deployment-ops.js';
import type { MetadataPatch } from './mutator/metadata-ops.js';
import type { DeploymentEndpoint, ViewRuleAddress, ViewStepAddress } from './query/types.js';
import type { ViewStepPatch, ViewStepSpec } from './mutator/step-ops.js';
import {
  InvalidWriteError,
  checkAutoLayout,
  checkLinks,
  type ViewRuleText,
  checkElementName,
  checkKind,
  checkMetadata,
  checkReferenceForm,
  checkStyle,
  checkTags,
  checkViewId,
  checkViewIncludes,
} from './mutator/write-checks.js';

export interface LinkSpec {
  url: string;
  label?: string;
}

export interface AddElementMutation {
  op: 'addElement';
  /** FQN of the parent element; absent (or empty) adds a model-level element */
  parent?: string;
  kind: string;
  id: string;
  /** Absent: LikeC4 shows the kind's title, else the name */
  title?: string;
  /** Model-level elements only: the loaded file to write into */
  file?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: Record<string, string | string[]>;
}

export interface AddRelationshipMutation {
  op: 'addRelationship';
  source: string;
  target: string;
  label?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: Record<string, string | string[]>;
  style?: RelationshipStyle;
  /** A declared relationship kind (lc4m-15.30 US-8) */
  kind?: string;
  /** How `kind` is written: `bracket` (`-[kind]->`, default) or `dot` (`.kind`) */
  kindForm?: 'bracket' | 'dot';
  /** Written `<->` */
  bidirectional?: boolean;
  /** `top` (default) or `nested` in the source's declaration body */
  placement?: 'top' | 'nested';
  /** The loaded file of a top-level relationship */
  file?: string;
  /** Accept an existing `extend a -> b` block of the same identity (D83) */
  shared?: boolean;
}

export interface AddViewMutation {
  op: 'addView';
  id: string;
  type: 'element' | 'dynamic' | 'deployment';
  target?: string;
  title?: string;
  /** Include rules, one `include` statement each; see `GenerateViewOpts.includes`. */
  includes?: string[];
  /** Layout directive; `''` or `null` writes none (see `LikeC4Mutator.addView`) */
  autoLayout?: string | null;
  description?: string;
  /** The element view the new element view extends */
  extends?: string;
  /** The loaded file the view is written to */
  file?: string;
}

/** `LikeC4Mutator.updateView`: `null` removes `title`, `description`, `autoLayout`. */
export interface UpdateViewMutation {
  op: 'updateView';
  id: string;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  links?: LinkSpec[];
  autoLayout?: string | null;
}

export interface AddViewRuleMutation {
  op: 'addViewRule';
  id: string;
  rule: ViewRuleText;
  before?: ViewRuleAddress;
}

export interface ReplaceViewRuleMutation {
  op: 'replaceViewRule';
  id: string;
  address: ViewRuleAddress;
  rule: ViewRuleText;
}

export interface RemoveViewRuleMutation {
  op: 'removeViewRule';
  id: string;
  address: ViewRuleAddress;
}

export interface RemoveViewMutation {
  op: 'removeView';
  id: string;
  /** Remove the referring constructs instead of rejecting (lc4m-15.30 FR-001) */
  cascade?: boolean;
}

export interface AddViewStepMutation {
  op: 'addViewStep';
  id: string;
  step: ViewStepSpec;
  path?: number[];
}

export interface UpdateViewStepMutation {
  op: 'updateViewStep';
  id: string;
  address: ViewStepAddress;
  patch: ViewStepPatch;
}

export interface MoveViewStepMutation {
  op: 'moveViewStep';
  id: string;
  from: ViewStepAddress;
  to: number[];
}

export interface RemoveViewStepMutation {
  op: 'removeViewStep';
  id: string;
  address: ViewStepAddress;
}

export interface AddViewParallelMutation {
  op: 'addViewParallel';
  id: string;
  path?: number[];
  statements?: number[][];
  steps?: ViewStepSpec[];
}

export interface UpdateElementMutation {
  op: 'updateElement';
  fqn: string;
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: MetadataPatch;
}

/** The 1-based start `{ file, line, column }` of a relationship's declaration, as an ambiguity error prints it. */
export interface RelationshipPositionSpec {
  file: string;
  line: number;
  column: number;
}

export interface UpdateRelationshipMutation {
  op: 'updateRelationship';
  source: string;
  target: string;
  matchKind?: string;
  matchTitle?: string;
  matchBidirectional?: boolean;
  /** Refers to the sources after the preceding mutations (D102) */
  position?: RelationshipPositionSpec;
  label?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: MetadataPatch;
  style?: RelationshipStyle;
}

export interface RemoveElementMutation {
  op: 'removeElement';
  fqn: string;
  /** Remove the referring constructs instead of rejecting (lc4m-15.30 FR-001) */
  cascade?: boolean;
}

/** `addElementExtend` (lc4m-15.30 US-10): the library's `addElementExtend(fqn, { file, … })`. */
export interface AddElementExtendMutation {
  op: 'addElementExtend';
  fqn: string;
  file: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: Record<string, string | string[]>;
}

/** `addRelationshipExtend` (lc4m-15.30 US-10): the selector of `updateRelationship`, then the block's file and contributions. */
export interface AddRelationshipExtendMutation {
  op: 'addRelationshipExtend';
  source: string;
  target: string;
  matchKind?: string;
  matchTitle?: string;
  matchBidirectional?: boolean;
  /** Refers to the sources after the preceding mutations (D102) */
  position?: RelationshipPositionSpec;
  file: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: Record<string, string | string[]>;
  shared?: boolean;
}

/** A kind type of the specification writes (lc4m-15.30 US-6). */
export type KindTypeName = 'element' | 'relationship' | 'deploymentNode';

/** `addKind` (lc4m-15.30 US-6): the library's `addKind(type, name, { file, … })`. */
export interface AddKindMutation {
  op: 'addKind';
  type: KindTypeName;
  name: string;
  file?: string;
  title?: string;
  /** Element and deployment node kinds only */
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
}

/** `updateKind` (lc4m-15.30 US-6): the library's `updateKind(type, name, patch)`; `null` removes a string. */
export interface UpdateKindMutation {
  op: 'updateKind';
  type: KindTypeName;
  name: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  technology?: string | null;
  tags?: string[];
  links?: LinkSpec[];
}

/** `addTag` (lc4m-15.30 US-6): the library's `addTag(name, { file })`. */
export interface AddTagMutation {
  op: 'addTag';
  name: string;
  file?: string;
}

/** `renameKind` (lc4m-15.30 US-7): the library's `renameKind(type, name, newName)`. */
export interface RenameKindMutation {
  op: 'renameKind';
  type: KindTypeName;
  name: string;
  newName: string;
}

/** `removeKind` (lc4m-15.30 US-7): the library's `removeKind(type, name)`. */
export interface RemoveKindMutation {
  op: 'removeKind';
  type: KindTypeName;
  name: string;
}

/** `renameTag` (lc4m-15.30 US-7): the library's `renameTag(name, newName)`; names without `#`. */
export interface RenameTagMutation {
  op: 'renameTag';
  name: string;
  newName: string;
}

/** `removeTag` (lc4m-15.30 US-7): the library's `removeTag(name)`; the name without `#`. */
export interface RemoveTagMutation {
  op: 'removeTag';
  name: string;
}

/** `renameElement` (lc4m-15.30 US-3): the library's `renameElement(fqn, newName)`. */
export interface RenameElementMutation {
  op: 'renameElement';
  fqn: string;
  newName: string;
}

/** `moveElement` (lc4m-15.30 US-3): the library's `moveElement(fqn, { parent, file })`. */
export interface MoveElementMutation {
  op: 'moveElement';
  fqn: string;
  /** The new parent's FQN, or `null` for the top level of a `model` block */
  parent: string | null;
  /** With `parent: null`: the loaded file to move to; the element's current file when absent */
  file?: string;
}

export interface RemoveRelationshipMutation {
  op: 'removeRelationship';
  source: string;
  target: string;
  matchKind?: string;
  matchTitle?: string;
  matchBidirectional?: boolean;
  /** Refers to the sources after the preceding mutations (D102) */
  position?: RelationshipPositionSpec;
}

/** `addDeploymentNode`: a root node without `parent`, else a child of `parent`. */
export interface AddDeploymentNodeMutation {
  op: 'addDeploymentNode';
  parent?: string;
  name: string;
  kind: string;
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: Record<string, string | string[]>;
  file?: string;
}

export interface UpdateDeploymentNodeMutation {
  op: 'updateDeploymentNode';
  id: string;
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: MetadataPatch;
}

export interface RemoveDeploymentNodeMutation {
  op: 'removeDeploymentNode';
  id: string;
  /** Remove the referring constructs instead of rejecting (lc4m-15.30 FR-001) */
  cascade?: boolean;
}

/** `addDeploymentInstance`: an instance of `element` in node `node`. */
export interface AddDeploymentInstanceMutation {
  op: 'addDeploymentInstance';
  node: string;
  element: string;
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: Record<string, string | string[]>;
}

export interface UpdateDeploymentInstanceMutation {
  op: 'updateDeploymentInstance';
  id: string;
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  style?: ElementStyle;
  metadata?: MetadataPatch;
}

export interface RemoveDeploymentInstanceMutation {
  op: 'removeDeploymentInstance';
  id: string;
  /** Remove the referring constructs instead of rejecting (lc4m-15.30 FR-001) */
  cascade?: boolean;
}

export interface AddDeploymentRelationshipMutation {
  op: 'addDeploymentRelationship';
  source: DeploymentEndpoint;
  target: DeploymentEndpoint;
  kind?: string;
  bidirectional?: boolean;
  title?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: Record<string, string | string[]>;
  style?: RelationshipStyle;
  file?: string;
}

/**
 * `updateDeploymentRelationship`: the selector is `source`, `target` and
 * the optional `matchKind` / `matchTitle` (the library's selector `kind` /
 * `title`, renamed as in `updateRelationship` because `title` is also a
 * patch field); the rest is the patch.
 */
export interface UpdateDeploymentRelationshipMutation {
  op: 'updateDeploymentRelationship';
  source: DeploymentEndpoint;
  target: DeploymentEndpoint;
  matchKind?: string;
  matchTitle?: string;
  title?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: MetadataPatch;
  style?: RelationshipStyle;
}

/** `removeDeploymentRelationship`: the selector of `updateDeploymentRelationship`. */
export interface RemoveDeploymentRelationshipMutation {
  op: 'removeDeploymentRelationship';
  source: DeploymentEndpoint;
  target: DeploymentEndpoint;
  matchKind?: string;
  matchTitle?: string;
}

/** `addDeploymentExtend`: an `extend <node>` block in `file`. */
export interface AddDeploymentExtendMutation {
  op: 'addDeploymentExtend';
  node: string;
  file: string;
  tags?: string[];
  links?: LinkSpec[];
  metadata?: Record<string, string | string[]>;
}

export interface RemoveDeploymentExtendMutation {
  op: 'removeDeploymentExtend';
  node: string;
  file: string;
  occurrence?: number;
}

export type Mutation =
  | AddElementMutation
  | AddRelationshipMutation
  | AddViewMutation
  | UpdateElementMutation
  | UpdateRelationshipMutation
  | RemoveElementMutation
  | RenameElementMutation
  | MoveElementMutation
  | AddKindMutation
  | AddElementExtendMutation
  | AddRelationshipExtendMutation
  | UpdateKindMutation
  | AddTagMutation
  | RenameKindMutation
  | RemoveKindMutation
  | RenameTagMutation
  | RemoveTagMutation
  | RemoveRelationshipMutation
  | AddDeploymentNodeMutation
  | UpdateDeploymentNodeMutation
  | RemoveDeploymentNodeMutation
  | AddDeploymentInstanceMutation
  | UpdateDeploymentInstanceMutation
  | RemoveDeploymentInstanceMutation
  | AddDeploymentRelationshipMutation
  | UpdateDeploymentRelationshipMutation
  | RemoveDeploymentRelationshipMutation
  | AddDeploymentExtendMutation
  | RemoveDeploymentExtendMutation
  | UpdateViewMutation
  | AddViewRuleMutation
  | ReplaceViewRuleMutation
  | RemoveViewRuleMutation
  | RemoveViewMutation
  | AddViewStepMutation
  | UpdateViewStepMutation
  | MoveViewStepMutation
  | RemoveViewStepMutation
  | AddViewParallelMutation;

export interface MutationsFile {
  mutations: Mutation[];
}

/** Thrown by {@link parseMutationsFile}; `path` locates the offending value. */
export class MutationsFileError extends Error {
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`${path}: ${detail}`);
    this.name = 'MutationsFileError';
  }
}

// ---------------------------------------------------------------------------
// Field checkers — each throws MutationsFileError naming the JSON path.
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Reject every key of `obj` that is not in `allowed`.  A misspelled field
 * (e.g. `tag` for `tags`) would otherwise be ignored and the mutation would
 * silently do less than asked.
 */
function rejectUnknownFields(
  obj: JsonObject,
  allowed: ReadonlyArray<string>,
  path: string,
  owner: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new MutationsFileError(
        path === '' ? key : `${path}.${key}`,
        `unknown field '${key}' for ${owner}; expected one of ${allowed.join(', ')}`,
      );
    }
  }
}

function requireString(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== 'string' || value === '') {
    throw new MutationsFileError(
      `${path}.${key}`,
      value === undefined || value === ''
        ? 'required non-empty string is missing'
        : `expected a non-empty string, got ${describeValue(value)}`,
    );
  }
}

function optionalString(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== 'string') {
    throw new MutationsFileError(
      `${path}.${key}`,
      `expected a string, got ${describeValue(value)}`,
    );
  }
}

function optionalBoolean(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== 'boolean') {
    throw new MutationsFileError(
      `${path}.${key}`,
      `expected a boolean, got ${describeValue(value)}`,
    );
  }
}

const POSITION_FIELDS = ['file', 'line', 'column'] as const;

/** `position`, when present: `{ file, line, column }` with a non-empty file and 1-based integers. */
function optionalPosition(obj: JsonObject, path: string): void {
  const value = obj['position'];
  if (value === undefined) return;
  const positionPath = `${path}.position`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MutationsFileError(positionPath, `expected a position { file, line, column }, got ${describeValue(value)}`);
  }
  const position = value as JsonObject;
  rejectUnknownFields(position, POSITION_FIELDS, positionPath, 'a position');
  requireString(position, 'file', positionPath);
  for (const key of ['line', 'column'] as const) {
    const n = position[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      throw new MutationsFileError(
        `${positionPath}.${key}`,
        n === undefined ? 'required 1-based integer is missing' : `expected a 1-based integer, got ${describeValue(n)}`,
      );
    }
  }
}

function optionalStringArray(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new MutationsFileError(
      `${path}.${key}`,
      `expected an array of strings, got ${describeValue(value)}`,
    );
  }
  value.forEach((item, i) => {
    if (typeof item !== 'string') {
      throw new MutationsFileError(
        `${path}.${key}[${i}]`,
        `expected a string, got ${describeValue(item)}`,
      );
    }
  });
}

function optionalPositiveInteger(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && !(typeof value === 'number' && Number.isInteger(value) && value >= 1)) {
    throw new MutationsFileError(
      `${path}.${key}`,
      `expected a whole number from 1, got ${typeof value === 'number' ? value : describeValue(value)}`,
    );
  }
}

const ENDPOINT_FIELDS = ['id', 'element'] as const satisfies ReadonlyArray<keyof DeploymentEndpoint>;

/** A deployment relationship endpoint `{ id, element? }` at `obj[key]`. */
function requireEndpoint(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  const endpointPath = `${path}.${key}`;
  if (!isObject(value)) {
    throw new MutationsFileError(
      endpointPath,
      value === undefined
        ? 'required endpoint { id, element? } is missing'
        : `expected an endpoint { id, element? }, got ${describeValue(value)}`,
    );
  }
  rejectUnknownFields(value, ENDPOINT_FIELDS, endpointPath, 'an endpoint');
  requireString(value, 'id', endpointPath);
  optionalString(value, 'element', endpointPath);
}

/**
 * The JSON path of a field named by an {@link InvalidWriteError} raised for a
 * mutation of `op` at `path`.  The library names fields after the options of
 * its calls; `apply` names the element of addElement `id`, the selector
 * `kind` / `title` of a deployment relationship `matchKind` / `matchTitle`,
 * and the parts of a step address under `address` / `from`.
 */
export function mutationFieldPath(op: Mutation['op'], path: string, field: string): string {
  let jsonField = field;
  if (op === 'addElement' && (field === 'name' || field.startsWith('name.'))) jsonField = `id${field.slice(4)}`;
  // The step writers name the parts of their own step address alone.
  if ((op === 'updateViewStep' || op === 'removeViewStep') && ['path', 'segment', 'text'].includes(field)) jsonField = `address.${field}`;
  if (op === 'moveViewStep' && ['segment', 'text'].includes(field)) jsonField = `from.${field}`;
  if (op === 'updateDeploymentRelationship' || op === 'removeDeploymentRelationship') {
    if (field === 'kind') jsonField = 'matchKind';
    if (field === 'title') jsonField = 'matchTitle';
  }
  return `${path}.${jsonField}`;
}

/**
 * Run the library's value checks that need no loaded files (identifier and
 * reference form, style values, include rules), reporting a violation with its
 * JSON path.  Checks that depend on the loaded files (declared tags and kinds,
 * duplicate names, resolved endpoints) run when the mutation is applied.
 */
function formChecks(op: Mutation['op'], path: string, run: () => void): void {
  try {
    run();
  } catch (err) {
    if (err instanceof InvalidWriteError) throw new MutationsFileError(mutationFieldPath(op, path, err.field), err.detail);
    throw err;
  }
}

const LINK_FIELDS = ['url', 'label'] as const;

function optionalLinks(obj: JsonObject, path: string): void {
  const value = obj.links;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new MutationsFileError(
      `${path}.links`,
      `expected an array of { url, label? } objects, got ${describeValue(value)}`,
    );
  }
  value.forEach((link, i) => {
    const linkPath = `${path}.links[${i}]`;
    if (!isObject(link)) {
      throw new MutationsFileError(
        linkPath,
        `expected a { url, label? } object, got ${describeValue(link)}`,
      );
    }
    rejectUnknownFields(link, LINK_FIELDS, linkPath, 'a link');
    requireString(link, 'url', linkPath);
    optionalString(link, 'label', linkPath);
  });
}

function optionalMetadata(obj: JsonObject, path: string, allowNull: boolean): void {
  const value = obj.metadata;
  if (value === undefined) return;
  if (!isObject(value)) {
    throw new MutationsFileError(
      `${path}.metadata`,
      `expected an object, got ${describeValue(value)}`,
    );
  }
  const expected = allowNull
    ? 'a string, an array of strings or null'
    : 'a string or an array of strings';
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.metadata.${key}`;
    if (entry === null && allowNull) continue;
    if (typeof entry === 'string') continue;
    if (Array.isArray(entry) && entry.every((item) => typeof item === 'string')) continue;
    throw new MutationsFileError(entryPath, `expected ${expected}, got ${describeValue(entry)}`);
  }
}

const ELEMENT_STYLE_STRING_KEYS = [
  'shape',
  'color',
  'icon',
  'opacity',
  'border',
  'size',
  'padding',
  'textSize',
  'iconPosition',
  'iconColor',
  'iconSize',
] as const;

const RELATIONSHIP_STYLE_STRING_KEYS = ['line', 'color', 'head', 'tail'] as const;

function optionalStyle(obj: JsonObject, path: string, target: 'element' | 'relationship'): void {
  const value = obj.style;
  if (value === undefined) return;
  const stylePath = `${path}.style`;
  if (!isObject(value)) {
    throw new MutationsFileError(stylePath, `expected an object, got ${describeValue(value)}`);
  }
  if (target === 'element') {
    rejectUnknownFields(
      value,
      [...ELEMENT_STYLE_STRING_KEYS, 'multiple'],
      stylePath,
      'an element style',
    );
    for (const key of ELEMENT_STYLE_STRING_KEYS) optionalString(value, key, stylePath);
    optionalBoolean(value, 'multiple', stylePath);
  } else {
    rejectUnknownFields(value, RELATIONSHIP_STYLE_STRING_KEYS, stylePath, 'a relationship style');
    for (const key of RELATIONSHIP_STYLE_STRING_KEYS) optionalString(value, key, stylePath);
  }
}

// ---------------------------------------------------------------------------
// View operations (US-12): addresses, rules, steps and patches.
// ---------------------------------------------------------------------------

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** A string or `null` (a removal) at `obj[key]`, when present. */
function optionalNullableString(obj: JsonObject, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new MutationsFileError(`${path}.${key}`, `expected a string or null, got ${describeValue(value)}`);
  }
}

/** One of `values` at `obj[key]`, when present. */
function optionalEnum(obj: JsonObject, key: string, path: string, values: ReadonlyArray<string>): void {
  const value = obj[key];
  if (value !== undefined && !(typeof value === 'string' && values.includes(value))) {
    throw new MutationsFileError(
      `${path}.${key}`,
      `expected one of ${values.map((v) => `'${v}'`).join(', ')}, got ${typeof value === 'string' ? `'${value}'` : describeValue(value)}`,
    );
  }
}

/** A step path at `obj[key]`: a non-empty array of non-negative integers. */
function pathAt(obj: JsonObject, key: string, path: string, required: boolean): void {
  const value = obj[key];
  const at = `${path}.${key}`;
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || value.length === 0) {
    throw new MutationsFileError(
      at,
      value === undefined ? 'required path is missing' : `expected a path: a non-empty array of non-negative integers, got ${describeValue(value)}`,
    );
  }
  value.forEach((item, i) => {
    if (!isIndex(item)) {
      throw new MutationsFileError(`${at}[${i}]`, `expected a non-negative integer, got ${typeof item === 'number' ? item : describeValue(item)}`);
    }
  });
}

/** The object at `obj[key]`; a missing one only when not required. */
function objectAt(obj: JsonObject, key: string, path: string, shape: string, required: boolean): JsonObject | undefined {
  const value = obj[key];
  if (value === undefined && !required) return undefined;
  if (!isObject(value)) {
    throw new MutationsFileError(
      `${path}.${key}`,
      value === undefined ? `required ${shape} is missing` : `expected ${shape}, got ${describeValue(value)}`,
    );
  }
  return value;
}

const RULE_FIELDS = ['kind', 'expression'] as const satisfies ReadonlyArray<keyof ViewRuleText>;
const RULE_ADDRESS_FIELDS = ['index', 'text'] as const satisfies ReadonlyArray<keyof ViewRuleAddress>;
const STEP_ADDRESS_FIELDS = ['path', 'segment', 'text'] as const satisfies ReadonlyArray<keyof ViewStepAddress>;
const STEP_STRING_FIELDS = [
  'title',
  'description',
  'technology',
  'notes',
  'notation',
  'navigateTo',
  'color',
  'line',
  'head',
  'tail',
] as const satisfies ReadonlyArray<keyof ViewStepSpec>;
const STEP_FIELDS = [
  'source',
  'target',
  'direction',
  'kind',
  'kindForm',
  ...STEP_STRING_FIELDS,
] as const satisfies ReadonlyArray<keyof ViewStepSpec>;
const DIRECTIONS = ['forward', 'backward'] as const;
const KIND_FORMS = ['bracket', 'dot'] as const;

/** A rule `{ kind, expression }` at `obj[key]` (required). */
function requireRule(obj: JsonObject, key: string, path: string): void {
  const rule = objectAt(obj, key, path, 'a rule { kind, expression }', true)!;
  const at = `${path}.${key}`;
  rejectUnknownFields(rule, RULE_FIELDS, at, 'a rule');
  if (rule.kind !== 'include' && rule.kind !== 'exclude') {
    throw new MutationsFileError(
      `${at}.kind`,
      rule.kind === undefined ? 'required rule kind is missing' : `expected 'include' or 'exclude', got ${typeof rule.kind === 'string' ? `'${rule.kind}'` : describeValue(rule.kind)}`,
    );
  }
  if (typeof rule.expression !== 'string') {
    throw new MutationsFileError(
      `${at}.expression`,
      rule.expression === undefined ? 'required rule expression is missing' : `expected a string, got ${describeValue(rule.expression)}`,
    );
  }
}

/** A rule address `{ index, text? }` at `obj[key]`. */
function ruleAddressAt(obj: JsonObject, key: string, path: string, required: boolean): void {
  const address = objectAt(obj, key, path, 'a rule address { index, text? }', required);
  if (!address) return;
  const at = `${path}.${key}`;
  rejectUnknownFields(address, RULE_ADDRESS_FIELDS, at, 'a rule address');
  if (!isIndex(address.index)) {
    throw new MutationsFileError(
      `${at}.index`,
      address.index === undefined ? 'required rule index is missing' : `expected a non-negative integer, got ${typeof address.index === 'number' ? address.index : describeValue(address.index)}`,
    );
  }
  optionalString(address, 'text', at);
}

/** A step address `{ path, segment?, text? }` at `obj[key]` (required). */
function requireStepAddress(obj: JsonObject, key: string, path: string): void {
  const address = objectAt(obj, key, path, 'a step address { path, segment?, text? }', true)!;
  const at = `${path}.${key}`;
  rejectUnknownFields(address, STEP_ADDRESS_FIELDS, at, 'a step address');
  pathAt(address, 'path', at, true);
  if (address.segment !== undefined && !isIndex(address.segment)) {
    throw new MutationsFileError(
      `${at}.segment`,
      `expected a non-negative integer, got ${typeof address.segment === 'number' ? address.segment : describeValue(address.segment)}`,
    );
  }
  optionalString(address, 'text', at);
}

/** A step object at `at`: `source` and `target` strings, enums, optional strings. */
function checkStepObject(step: unknown, at: string): void {
  if (!isObject(step)) {
    throw new MutationsFileError(at, `expected a step { source, target, ... }, got ${describeValue(step)}`);
  }
  rejectUnknownFields(step, STEP_FIELDS, at, 'a step');
  requireString(step, 'source', at);
  requireString(step, 'target', at);
  optionalEnum(step, 'direction', at, DIRECTIONS);
  optionalEnum(step, 'kindForm', at, KIND_FORMS);
  optionalString(step, 'kind', at);
  for (const key of STEP_STRING_FIELDS) optionalString(step, key, at);
}

/** A step patch at `obj[key]` (required): the step fields, `null` removing the optional ones. */
function requireStepPatch(obj: JsonObject, key: string, path: string): void {
  const patch = objectAt(obj, key, path, 'a step patch object', true)!;
  const at = `${path}.${key}`;
  rejectUnknownFields(patch, STEP_FIELDS, at, 'a step patch');
  optionalString(patch, 'source', at);
  optionalString(patch, 'target', at);
  optionalEnum(patch, 'direction', at, DIRECTIONS);
  optionalEnum(patch, 'kindForm', at, KIND_FORMS);
  optionalNullableString(patch, 'kind', at);
  for (const k of STEP_STRING_FIELDS) optionalNullableString(patch, k, at);
}

/** The new steps at `obj.steps`: an array of step objects. */
function optionalSteps(obj: JsonObject, path: string): void {
  const value = obj.steps;
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new MutationsFileError(`${path}.steps`, `expected an array of steps, got ${describeValue(value)}`);
  value.forEach((step, i) => checkStepObject(step, `${path}.steps[${i}]`));
}

/** The statements at `obj.statements`: an array of paths. */
function optionalStatements(obj: JsonObject, path: string): void {
  const value = obj.statements;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new MutationsFileError(`${path}.statements`, `expected an array of paths, got ${describeValue(value)}`);
  }
  value.forEach((item, i) => {
    const at = `${path}.statements[${i}]`;
    if (!Array.isArray(item) || item.length === 0) {
      throw new MutationsFileError(at, `expected a path: a non-empty array of non-negative integers, got ${describeValue(item)}`);
    }
    item.forEach((index, k) => {
      if (!isIndex(index)) {
        throw new MutationsFileError(`${at}[${k}]`, `expected a non-negative integer, got ${typeof index === 'number' ? index : describeValue(index)}`);
      }
    });
  });
}

const VIEW_TYPES: ReadonlyArray<AddViewMutation['type']> = ['element', 'dynamic', 'deployment'];

/**
 * How the value of an operation field is given on the command line (one
 * flag per field; US-1 of lc4m-15.31):
 * - `string`: the flag's text, taken literally;
 * - `nullableString`: as `string`, plus an `--unset-<field>` flag passing `null`;
 * - `presenceBoolean`: a flag without a value, for a boolean that only matters when true;
 * - `valueBoolean`: `true` or `false`, for a boolean whose `false` differs from its absence;
 * - `number`: a number;
 * - `tags`: the identifier list `tags` — a JSON array of strings, or a comma-separated list;
 * - `json`: a JSON value (every other list, every object).
 */
export type FieldKind = 'string' | 'nullableString' | 'presenceBoolean' | 'valueBoolean' | 'number' | 'tags' | 'json';

/** A field of an operation: its value kind, and `required` when the operation cannot omit it. */
export interface FieldSpec {
  readonly kind: FieldKind;
  readonly required?: true;
}

/**
 * The kinds compatible with a field named `K` of type `T` (`undefined`
 * removed).  A relation, not a function of the type: both boolean kinds fit a
 * boolean, and `tags` fits only the `string[]` field named `tags` — every
 * other array, `includes` among them, and every object is `json`.
 */
type KindsFor<K, T> = [T] extends [string]
  ? 'string'
  : [T] extends [string | null]
    ? 'nullableString'
    : [T] extends [boolean]
      ? 'presenceBoolean' | 'valueBoolean'
      : [T] extends [number]
        ? 'number'
        : K extends 'tags'
          ? [T] extends [string[]]
            ? [string[]] extends [T]
              ? 'tags'
              : never
            : never
          : [T] extends [object]
            ? 'json'
            : never;

/** The spec a field `K` of mutation `M` must have: a compatible kind, `required` exactly when `M` requires `K`. */
type FieldSpecFor<M, K extends keyof M> = { readonly kind: KindsFor<K, Exclude<M[K], undefined>> } & ({} extends Pick<M, K>
  ? { readonly required?: never }
  : { readonly required: true });

/** Every field but `op` of every operation, each with a spec fitting its type in the mutation interface. */
type OperationFieldTable = {
  readonly [Op in Mutation['op']]: {
    readonly [K in Exclude<keyof Extract<Mutation, { op: Op }>, 'op'>]-?: FieldSpecFor<Extract<Mutation, { op: Op }>, K>;
  };
};

const str = { kind: 'string' } as const;
const reqStr = { kind: 'string', required: true } as const;
const nullStr = { kind: 'nullableString' } as const;
const reqNullStr = { kind: 'nullableString', required: true } as const;
const presence = { kind: 'presenceBoolean' } as const;
const valueBool = { kind: 'valueBoolean' } as const;
const num = { kind: 'number' } as const;
const tagList = { kind: 'tags' } as const;
const json = { kind: 'json' } as const;
const reqJson = { kind: 'json', required: true } as const;

/**
 * The fields of each operation, `op` aside, in the order `apply` lists them,
 * with their value kinds — the single source of the fields of `apply` and of
 * the operation commands.  The table is tied to the mutation interfaces at
 * compile time: a field missing from it or unknown to the interface, a kind
 * incompatible with the field's type (see {@link KindsFor}) and a `required`
 * mark that differs from the interface do not compile.
 */
export const MUTATION_FIELDS = {
  addElement: {
    parent: str,
    kind: reqStr,
    id: reqStr,
    title: str,
    file: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
  },
  updateElement: {
    fqn: reqStr,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
  },
  removeElement: { fqn: reqStr, cascade: presence },
  renameElement: { fqn: reqStr, newName: reqStr },
  moveElement: { fqn: reqStr, parent: reqNullStr, file: str },
  addKind: {
    type: reqStr,
    name: reqStr,
    file: str,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
  },
  updateKind: {
    type: reqStr,
    name: reqStr,
    title: nullStr,
    summary: nullStr,
    description: nullStr,
    technology: nullStr,
    tags: tagList,
    links: json,
  },
  addTag: { name: reqStr, file: str },
  renameKind: { type: reqStr, name: reqStr, newName: reqStr },
  removeKind: { type: reqStr, name: reqStr },
  renameTag: { name: reqStr, newName: reqStr },
  removeTag: { name: reqStr },
  addElementExtend: { fqn: reqStr, file: reqStr, tags: tagList, links: json, metadata: json },
  addRelationshipExtend: {
    source: reqStr,
    target: reqStr,
    matchKind: str,
    matchTitle: str,
    matchBidirectional: valueBool,
    position: json,
    file: reqStr,
    tags: tagList,
    links: json,
    metadata: json,
    shared: presence,
  },
  addRelationship: {
    source: reqStr,
    target: reqStr,
    label: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    metadata: json,
    style: json,
    kind: str,
    kindForm: str,
    bidirectional: presence,
    placement: str,
    file: str,
    shared: presence,
  },
  updateRelationship: {
    source: reqStr,
    target: reqStr,
    matchKind: str,
    matchTitle: str,
    matchBidirectional: valueBool,
    position: json,
    label: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    metadata: json,
    style: json,
  },
  removeRelationship: {
    source: reqStr,
    target: reqStr,
    matchKind: str,
    matchTitle: str,
    matchBidirectional: valueBool,
    position: json,
  },
  addView: {
    id: reqStr,
    type: reqStr,
    target: str,
    title: str,
    includes: json,
    autoLayout: nullStr,
    description: str,
    extends: str,
    file: str,
  },
  addDeploymentNode: {
    parent: str,
    name: reqStr,
    kind: reqStr,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
    file: str,
  },
  updateDeploymentNode: {
    id: reqStr,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
  },
  removeDeploymentNode: { id: reqStr, cascade: presence },
  addDeploymentInstance: {
    node: reqStr,
    element: reqStr,
    name: str,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
  },
  updateDeploymentInstance: {
    id: reqStr,
    title: str,
    summary: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    style: json,
    metadata: json,
  },
  removeDeploymentInstance: { id: reqStr, cascade: presence },
  addDeploymentRelationship: {
    source: reqJson,
    target: reqJson,
    kind: str,
    bidirectional: presence,
    title: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    metadata: json,
    style: json,
    file: str,
  },
  updateDeploymentRelationship: {
    source: reqJson,
    target: reqJson,
    matchKind: str,
    matchTitle: str,
    title: str,
    description: str,
    technology: str,
    tags: tagList,
    links: json,
    metadata: json,
    style: json,
  },
  removeDeploymentRelationship: { source: reqJson, target: reqJson, matchKind: str, matchTitle: str },
  addDeploymentExtend: { node: reqStr, file: reqStr, tags: tagList, links: json, metadata: json },
  removeDeploymentExtend: { node: reqStr, file: reqStr, occurrence: num },
  updateView: {
    id: reqStr,
    title: nullStr,
    description: nullStr,
    tags: tagList,
    links: json,
    autoLayout: nullStr,
  },
  addViewRule: { id: reqStr, rule: reqJson, before: json },
  replaceViewRule: { id: reqStr, address: reqJson, rule: reqJson },
  removeViewRule: { id: reqStr, address: reqJson },
  removeView: { id: reqStr, cascade: presence },
  addViewStep: { id: reqStr, step: reqJson, path: json },
  updateViewStep: { id: reqStr, address: reqJson, patch: reqJson },
  moveViewStep: { id: reqStr, from: reqJson, to: reqJson },
  removeViewStep: { id: reqStr, address: reqJson },
  addViewParallel: { id: reqStr, path: json, statements: json, steps: json },
} as const satisfies OperationFieldTable;

/** The names `apply` accepts in a mutation of `op`: `op` and the operation's fields. */
function acceptedFields(op: Mutation['op']): string[] {
  return ['op', ...Object.keys(MUTATION_FIELDS[op])];
}

const MUTATIONS_FILE_FIELDS = ['mutations'] as const satisfies ReadonlyArray<keyof MutationsFile>;

/** The kind types of the kind ops (`addKind`, `updateKind`, `renameKind`, `removeKind`). */
const KIND_TYPES: readonly KindTypeName[] = ['element', 'relationship', 'deploymentNode'];

function isKnownOp(op: unknown): op is Mutation['op'] {
  return typeof op === 'string' && Object.prototype.hasOwnProperty.call(MUTATION_FIELDS, op);
}

/** An update op must change something: at least one of `fields` is given. */
function requirePatchField(m: JsonObject, path: string, fields: ReadonlyArray<string>): void {
  if (!fields.some((key) => m[key] !== undefined)) {
    throw new MutationsFileError(path, `${String(m.op)} requires at least one of ${fields.join(', ')}`);
  }
}

/** The library selector of a deployment relationship mutation. */
export function deploymentRelationshipSelector(
  m: JsonObject | UpdateDeploymentRelationshipMutation | RemoveDeploymentRelationshipMutation,
): DeploymentRelationshipSelector {
  return {
    source: m.source as DeploymentEndpoint,
    target: m.target as DeploymentEndpoint,
    ...(m.matchKind !== undefined && { kind: m.matchKind as string }),
    ...(m.matchTitle !== undefined && { title: m.matchTitle as string }),
  };
}

/**
 * Validate one mutation object: its fields and their shapes, unknown fields,
 * and the value checks that need no loaded files.  A violation is a
 * {@link MutationsFileError} whose path starts with `path` (`mutations[2]` in
 * the `apply` file), e.g. `mutations[2].links[0].url`.
 */
export function validateMutation(m: JsonObject, path: string): void {
  if (isKnownOp(m.op)) rejectUnknownFields(m, acceptedFields(m.op), path, `op '${m.op}'`);
  switch (m.op) {
    case 'addElement':
      for (const key of ['kind', 'id']) requireString(m, key, path);
      for (const key of ['parent', 'title', 'file', 'summary', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, false);
      formChecks('addElement', path, () => {
        checkElementName(m.id as string);
        checkKind(m.kind as string, 'element', undefined);
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as ElementStyle | undefined, 'element', undefined);
      });
      return;
    case 'updateElement':
      requireString(m, 'fqn', path);
      for (const key of ['title', 'summary', 'description', 'technology'])
        optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, true);
      formChecks('updateElement', path, () => {
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as ElementStyle | undefined, 'element', undefined);
      });
      return;
    case 'removeElement':
      requireString(m, 'fqn', path);
      optionalBoolean(m, 'cascade', path);
      return;
    case 'renameElement':
      requireString(m, 'fqn', path);
      requireString(m, 'newName', path);
      formChecks('renameElement', path, () => checkElementName(m.newName as string, 'newName'));
      return;
    case 'moveElement':
      requireString(m, 'fqn', path);
      if (m.parent !== null) requireString(m, 'parent', path);
      optionalString(m, 'file', path);
      return;
    case 'addKind':
    case 'updateKind':
    case 'renameKind':
    case 'removeKind': {
      if (!KIND_TYPES.includes(m.type as KindTypeName)) {
        throw new MutationsFileError(
          `${path}.type`,
          `expected one of ${KIND_TYPES.map((t) => `'${t}'`).join(', ')}, got ${typeof m.type === 'string' ? `'${m.type}'` : describeValue(m.type)}`,
        );
      }
      requireString(m, 'name', path);
      if (m.op === 'renameKind') requireString(m, 'newName', path);
      if (m.op === 'renameKind' || m.op === 'removeKind') return;
      const strings = ['title', 'summary', 'description', 'technology'];
      if (m.op === 'addKind') {
        for (const key of [...strings, 'file']) optionalString(m, key, path);
      } else {
        for (const key of strings) optionalNullableString(m, key, path);
        requirePatchField(m, path, [...strings, 'tags', 'links']);
      }
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      formChecks(m.op, path, () => {
        checkTags(m.tags as string[] | undefined, undefined);
        checkLinks(m.links as LinkSpec[] | undefined);
      });
      return;
    }
    case 'addTag':
      requireString(m, 'name', path);
      optionalString(m, 'file', path);
      return;
    case 'renameTag':
      requireString(m, 'name', path);
      requireString(m, 'newName', path);
      return;
    case 'removeTag':
      requireString(m, 'name', path);
      return;
    case 'addElementExtend':
    case 'addRelationshipExtend':
      if (m.op === 'addElementExtend') {
        requireString(m, 'fqn', path);
      } else {
        requireString(m, 'source', path);
        requireString(m, 'target', path);
        optionalString(m, 'matchKind', path);
        optionalString(m, 'matchTitle', path);
        optionalBoolean(m, 'matchBidirectional', path);
        optionalPosition(m, path);
        optionalBoolean(m, 'shared', path);
      }
      requireString(m, 'file', path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalMetadata(m, path, false);
      formChecks(m.op, path, () => {
        if (m.op === 'addElementExtend') checkReferenceForm(m.fqn as string, 'fqn');
        checkTags(m.tags as string[] | undefined, undefined);
        checkLinks(m.links as LinkSpec[] | undefined);
        checkMetadata(m.metadata as Record<string, string | string[]> | undefined);
      });
      return;
    case 'addRelationship':
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      for (const key of ['label', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, false);
      optionalString(m, 'kind', path);
      optionalEnum(m, 'kindForm', path, ['bracket', 'dot']);
      optionalBoolean(m, 'bidirectional', path);
      optionalEnum(m, 'placement', path, ['top', 'nested']);
      optionalString(m, 'file', path);
      optionalBoolean(m, 'shared', path);
      formChecks('addRelationship', path, () => {
        checkReferenceForm(m.source as string, 'source');
        checkReferenceForm(m.target as string, 'target');
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as RelationshipStyle | undefined, 'relationship', undefined);
      });
      return;
    case 'removeRelationship':
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      optionalString(m, 'matchKind', path);
      optionalString(m, 'matchTitle', path);
      optionalBoolean(m, 'matchBidirectional', path);
      optionalPosition(m, path);
      return;
    case 'updateRelationship': {
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      for (const key of ['matchKind', 'matchTitle', 'label', 'description', 'technology']) {
        optionalString(m, key, path);
      }
      optionalBoolean(m, 'matchBidirectional', path);
      optionalPosition(m, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, true);
      formChecks('updateRelationship', path, () => {
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as RelationshipStyle | undefined, 'relationship', undefined);
      });
      const updateFields = [
        'label',
        'description',
        'technology',
        'tags',
        'links',
        'metadata',
        'style',
      ];
      if (!updateFields.some((key) => m[key] !== undefined)) {
        throw new MutationsFileError(
          path,
          `updateRelationship requires at least one of ${updateFields.join(', ')}`,
        );
      }
      return;
    }
    case 'addView':
      requireString(m, 'id', path);
      if (!VIEW_TYPES.includes(m.type as AddViewMutation['type'])) {
        throw new MutationsFileError(
          `${path}.type`,
          `expected one of ${VIEW_TYPES.map((t) => `'${t}'`).join(', ')}, got ${
            typeof m.type === 'string' ? `'${m.type}'` : describeValue(m.type)
          }`,
        );
      }
      optionalString(m, 'target', path);
      optionalString(m, 'title', path);
      optionalStringArray(m, 'includes', path);
      optionalNullableString(m, 'autoLayout', path);
      for (const key of ['description', 'extends', 'file']) optionalString(m, key, path);
      formChecks('addView', path, () => {
        checkViewId(m.id as string);
        if (m.type === 'element' && typeof m.target === 'string' && m.target !== '') {
          checkReferenceForm(m.target, 'target');
        }
        if (typeof m.extends === 'string' && m.extends !== '') checkViewId(m.extends, 'extends');
        checkViewIncludes(m.includes as string[] | undefined, m.type as AddViewMutation['type']);
        checkAutoLayout(m.autoLayout as string | null | undefined);
      });
      return;
    case 'updateView':
      requireString(m, 'id', path);
      optionalNullableString(m, 'title', path);
      optionalNullableString(m, 'description', path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalNullableString(m, 'autoLayout', path);
      formChecks('updateView', path, () => {
        checkTags(m.tags as string[] | undefined, undefined);
        checkLinks(m.links as LinkSpec[] | undefined);
        if (typeof m.autoLayout === 'string' && m.autoLayout !== '') checkAutoLayout(m.autoLayout);
      });
      return;
    case 'addViewRule':
      requireString(m, 'id', path);
      requireRule(m, 'rule', path);
      ruleAddressAt(m, 'before', path, false);
      return;
    case 'replaceViewRule':
      requireString(m, 'id', path);
      ruleAddressAt(m, 'address', path, true);
      requireRule(m, 'rule', path);
      return;
    case 'removeViewRule':
      requireString(m, 'id', path);
      ruleAddressAt(m, 'address', path, true);
      return;
    case 'removeView':
      requireString(m, 'id', path);
      optionalBoolean(m, 'cascade', path);
      return;
    case 'addViewStep':
      requireString(m, 'id', path);
      checkStepObject(m.step, `${path}.step`);
      pathAt(m, 'path', path, false);
      return;
    case 'updateViewStep':
      requireString(m, 'id', path);
      requireStepAddress(m, 'address', path);
      requireStepPatch(m, 'patch', path);
      return;
    case 'moveViewStep':
      requireString(m, 'id', path);
      requireStepAddress(m, 'from', path);
      pathAt(m, 'to', path, true);
      return;
    case 'removeViewStep':
      requireString(m, 'id', path);
      requireStepAddress(m, 'address', path);
      return;
    case 'addViewParallel':
      requireString(m, 'id', path);
      pathAt(m, 'path', path, false);
      optionalStatements(m, path);
      optionalSteps(m, path);
      if (m.statements === undefined && m.steps === undefined) {
        throw new MutationsFileError(`${path}.statements`, 'addViewParallel requires statements, steps or both');
      }
      return;
    case 'addDeploymentNode':
      optionalString(m, 'parent', path);
      requireString(m, 'name', path);
      requireString(m, 'kind', path);
      for (const key of ['title', 'summary', 'description', 'technology', 'file']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, false);
      formChecks('addDeploymentNode', path, () => {
        checkElementName(m.name as string);
        checkKind(m.kind as string, 'deploymentNode', undefined);
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as ElementStyle | undefined, 'element', undefined);
        checkMetadata(m.metadata as Record<string, string | string[]> | undefined);
      });
      return;
    case 'updateDeploymentNode':
    case 'updateDeploymentInstance':
      requireString(m, 'id', path);
      for (const key of ['title', 'summary', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, true);
      formChecks(m.op, path, () => {
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as ElementStyle | undefined, 'element', undefined);
        checkMetadata(m.metadata as MetadataPatch | undefined);
      });
      requirePatchField(m, path, ['title', 'summary', 'description', 'technology', 'tags', 'links', 'style', 'metadata']);
      return;
    case 'removeDeploymentNode':
    case 'removeDeploymentInstance':
      requireString(m, 'id', path);
      optionalBoolean(m, 'cascade', path);
      return;
    case 'addDeploymentInstance':
      requireString(m, 'node', path);
      requireString(m, 'element', path);
      for (const key of ['name', 'title', 'summary', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, false);
      formChecks('addDeploymentInstance', path, () => {
        if (m.name !== undefined) checkElementName(m.name as string);
        checkReferenceForm(m.element as string, 'element');
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as ElementStyle | undefined, 'element', undefined);
        checkMetadata(m.metadata as Record<string, string | string[]> | undefined);
      });
      return;
    case 'addDeploymentRelationship':
      requireEndpoint(m, 'source', path);
      requireEndpoint(m, 'target', path);
      for (const key of ['kind', 'title', 'description', 'technology', 'file']) optionalString(m, key, path);
      optionalBoolean(m, 'bidirectional', path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, false);
      formChecks('addDeploymentRelationship', path, () => {
        checkEndpointForm(m.source as DeploymentEndpoint, 'source');
        checkEndpointForm(m.target as DeploymentEndpoint, 'target');
        if (m.kind !== undefined) checkKind(m.kind as string, 'relationship', undefined);
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as RelationshipStyle | undefined, 'relationship', undefined);
        checkMetadata(m.metadata as Record<string, string | string[]> | undefined);
      });
      return;
    case 'updateDeploymentRelationship':
      requireEndpoint(m, 'source', path);
      requireEndpoint(m, 'target', path);
      for (const key of ['matchKind', 'matchTitle', 'title', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, true);
      formChecks('updateDeploymentRelationship', path, () => {
        checkSelectorForm(deploymentRelationshipSelector(m));
        checkTags(m.tags as string[] | undefined, undefined);
        checkStyle(m.style as RelationshipStyle | undefined, 'relationship', undefined);
        checkMetadata(m.metadata as MetadataPatch | undefined);
      });
      requirePatchField(m, path, ['title', 'description', 'technology', 'tags', 'links', 'metadata', 'style']);
      return;
    case 'removeDeploymentRelationship':
      requireEndpoint(m, 'source', path);
      requireEndpoint(m, 'target', path);
      optionalString(m, 'matchKind', path);
      optionalString(m, 'matchTitle', path);
      formChecks('removeDeploymentRelationship', path, () => checkSelectorForm(deploymentRelationshipSelector(m)));
      return;
    case 'addDeploymentExtend': {
      requireString(m, 'node', path);
      requireString(m, 'file', path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalMetadata(m, path, false);
      formChecks('addDeploymentExtend', path, () => {
        checkReferenceForm(m.node as string, 'node');
        checkTags(m.tags as string[] | undefined, undefined);
        checkMetadata(m.metadata as Record<string, string | string[]> | undefined);
      });
      const contributes =
        (m.tags as string[] | undefined)?.length ||
        (m.links as LinkSpec[] | undefined)?.length ||
        Object.keys((m.metadata as JsonObject | undefined) ?? {}).length;
      if (!contributes) {
        throw new MutationsFileError(path, 'addDeploymentExtend requires at least one tag, link or metadata key');
      }
      return;
    }
    case 'removeDeploymentExtend':
      requireString(m, 'node', path);
      requireString(m, 'file', path);
      optionalPositiveInteger(m, 'occurrence', path);
      formChecks('removeDeploymentExtend', path, () => checkReferenceForm(m.node as string, 'node'));
      return;
    default:
      throw new MutationsFileError(
        `${path}.op`,
        typeof m.op === 'string'
          ? `unknown mutation op '${m.op}'`
          : `expected a string, got ${describeValue(m.op)}`,
      );
  }
}

/**
 * Validate parsed JSON against the `apply` mutations file format.
 *
 * @param data - Result of `JSON.parse` on the mutations file
 * @returns The same value, typed as {@link MutationsFile}
 * @throws {MutationsFileError} on the first value of the wrong shape or type
 */
export function parseMutationsFile(data: unknown): MutationsFile {
  if (!isObject(data)) {
    throw new MutationsFileError(
      '(root)',
      `expected an object with a "mutations" array, got ${describeValue(data)}`,
    );
  }
  rejectUnknownFields(data, MUTATIONS_FILE_FIELDS, '', 'the mutations file');
  if (!Array.isArray(data.mutations)) {
    throw new MutationsFileError(
      'mutations',
      `expected an array, got ${describeValue(data.mutations)}`,
    );
  }
  data.mutations.forEach((mutation: unknown, i: number) => {
    const path = `mutations[${i}]`;
    if (!isObject(mutation)) {
      throw new MutationsFileError(
        path,
        `expected a mutation object, got ${describeValue(mutation)}`,
      );
    }
    validateMutation(mutation, path);
  });
  return data as unknown as MutationsFile;
}
