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
import { viewIncludeExpression, type ElementStyle, type RelationshipStyle } from './mutator/codegen.js';
import type { MetadataPatch } from './mutator/metadata-ops.js';

export interface LinkSpec {
  url: string;
  label?: string;
}

export interface AddElementMutation {
  op: 'addElement';
  parent: string;
  kind: string;
  id: string;
  title: string;
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
}

export interface AddViewMutation {
  op: 'addView';
  id: string;
  type: 'element' | 'dynamic' | 'deployment';
  target?: string;
  title?: string;
  /** Include rules, one `include` statement each; see `GenerateViewOpts.includes`. */
  includes?: string[];
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

export interface UpdateRelationshipMutation {
  op: 'updateRelationship';
  source: string;
  target: string;
  matchKind?: string;
  matchTitle?: string;
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
}

export interface RemoveRelationshipMutation {
  op: 'removeRelationship';
  source: string;
  target: string;
}

export type Mutation =
  | AddElementMutation
  | AddRelationshipMutation
  | AddViewMutation
  | UpdateElementMutation
  | UpdateRelationshipMutation
  | RemoveElementMutation
  | RemoveRelationshipMutation;

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

/**
 * `includes` of addView: an array of strings, each holding an include
 * expression once trimmed and stripped of one leading `include` keyword.
 */
function optionalViewIncludes(obj: JsonObject, path: string): void {
  optionalStringArray(obj, 'includes', path);
  const value = obj.includes as string[] | undefined;
  value?.forEach((item, i) => {
    if (viewIncludeExpression(item) === undefined) {
      throw new MutationsFileError(
        `${path}.includes[${i}]`,
        `expected an include expression such as '*' or 'app.api', got ${JSON.stringify(item)}`,
      );
    }
  });
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

const VIEW_TYPES: ReadonlyArray<AddViewMutation['type']> = ['element', 'dynamic', 'deployment'];

/**
 * Every field each op accepts.  The lists are tied to the mutation interfaces
 * at compile time: `satisfies` rejects a name the interface does not have, and
 * {@link FieldsNotListed} rejects an interface field missing from its list.
 */
const MUTATION_FIELDS = {
  addElement: [
    'op',
    'parent',
    'kind',
    'id',
    'title',
    'summary',
    'description',
    'technology',
    'tags',
    'links',
    'style',
    'metadata',
  ],
  updateElement: [
    'op',
    'fqn',
    'title',
    'summary',
    'description',
    'technology',
    'tags',
    'links',
    'style',
    'metadata',
  ],
  removeElement: ['op', 'fqn'],
  addRelationship: [
    'op',
    'source',
    'target',
    'label',
    'description',
    'technology',
    'tags',
    'links',
    'metadata',
    'style',
  ],
  updateRelationship: [
    'op',
    'source',
    'target',
    'matchKind',
    'matchTitle',
    'label',
    'description',
    'technology',
    'tags',
    'links',
    'metadata',
    'style',
  ],
  removeRelationship: ['op', 'source', 'target'],
  addView: ['op', 'id', 'type', 'target', 'title', 'includes'],
} as const satisfies { [Op in Mutation['op']]: ReadonlyArray<keyof Extract<Mutation, { op: Op }>> };

/** Interface fields absent from {@link MUTATION_FIELDS}; must be `never`. */
type FieldsNotListed = {
  [Op in Mutation['op']]: Exclude<
    keyof Extract<Mutation, { op: Op }>,
    (typeof MUTATION_FIELDS)[Op][number]
  >;
}[Mutation['op']];
type AssertNever<T extends never> = T;
type MutationFieldsAreExhaustive = AssertNever<FieldsNotListed>;

const MUTATIONS_FILE_FIELDS = ['mutations'] as const satisfies ReadonlyArray<keyof MutationsFile>;

function isKnownOp(op: unknown): op is Mutation['op'] {
  return typeof op === 'string' && Object.prototype.hasOwnProperty.call(MUTATION_FIELDS, op);
}

function validateMutation(m: JsonObject, path: string): void {
  if (isKnownOp(m.op)) rejectUnknownFields(m, MUTATION_FIELDS[m.op], path, `op '${m.op}'`);
  switch (m.op) {
    case 'addElement':
      for (const key of ['parent', 'kind', 'id', 'title']) requireString(m, key, path);
      for (const key of ['summary', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, false);
      return;
    case 'updateElement':
      requireString(m, 'fqn', path);
      for (const key of ['title', 'summary', 'description', 'technology'])
        optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'element');
      optionalMetadata(m, path, true);
      return;
    case 'removeElement':
      requireString(m, 'fqn', path);
      return;
    case 'addRelationship':
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      for (const key of ['label', 'description', 'technology']) optionalString(m, key, path);
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, false);
      return;
    case 'removeRelationship':
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      return;
    case 'updateRelationship': {
      requireString(m, 'source', path);
      requireString(m, 'target', path);
      for (const key of ['matchKind', 'matchTitle', 'label', 'description', 'technology']) {
        optionalString(m, key, path);
      }
      optionalStringArray(m, 'tags', path);
      optionalLinks(m, path);
      optionalStyle(m, path, 'relationship');
      optionalMetadata(m, path, true);
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
      optionalViewIncludes(m, path);
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
