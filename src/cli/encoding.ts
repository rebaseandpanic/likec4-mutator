/**
 * Command-line flags of operation fields: from a field's value kind (see
 * {@link FieldKind}), the commander option(s) that carry it and the decoder
 * that turns the option values back into the field's value, and the
 * translation of a rejection's mutation path into the flag.
 *
 * Encoding, by kind (each lossless for every value the operation accepts):
 * - `string`: `--f <text>`, the text taken literally (`--f null` is the
 *   four-letter text, `--f ''` the empty string);
 * - `nullableString`: the same, plus `--unset-f`, which passes `null`; both
 *   together are a rejection;
 * - `presenceBoolean`: `--f`, which passes `true`; absent, the field is not given;
 * - `valueBoolean`: `--f <true|false>`; any other spelling is a rejection;
 * - `number`: `--f <number>`, a JSON number;
 * - `tags`: a value that is, as a whole, a JSON array of strings is that
 *   array (`'[]'` the empty list); any other value is a comma-separated list,
 *   segments trimmed and empty segments dropped; the empty value means the
 *   field is not given;
 * - `json`: a JSON value given as the flag's string.
 *
 * A flag given twice takes its last value, for every kind (commander's
 * handling of a repeated option).  Decoding checks only the encoding: the
 * shape and the value of a field are the operation's rules, checked by
 * `validateMutation` as for `apply`.
 */
import type { Command } from 'commander';
import { type FieldKind, type FieldSpec, type Mutation, MutationsFileError, mutationFieldPath } from '../mutations-file.js';
import { InvalidWriteError } from '../mutator/write-checks.js';

/** The flags every operation command has besides its fields. */
export const SHARED_FLAGS = ['dir', 'output', 'json'] as const;

/** The flag of one field. */
export interface FieldFlag {
  /** The field of the mutation object */
  readonly field: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  /** The flag's name without `--`: the field in kebab-case, unless renamed */
  readonly flag: string;
}

/** `viewId` → `view-id`. */
export function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The key commander stores a flag's value under: `view-id` → `viewId`. */
function optionKey(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function unsetFlag(flag: string): string {
  return `unset-${flag}`;
}

/**
 * The flags of an operation's fields, in the order of `fields`.  A field's
 * flag is its name in kebab-case, or `renames[field]` when given (a kept
 * flag name such as `--label`).  Fails when two flags collide, a flag
 * collides with a shared flag ({@link SHARED_FLAGS}) or would read as
 * commander's negation (`--no-…`), or a name does not survive the
 * round trip through commander's option key.
 */
export function fieldFlags(
  fields: Readonly<Record<string, FieldSpec>>,
  renames: Readonly<Record<string, string>> = {},
): FieldFlag[] {
  const flags = Object.entries(fields).map(([field, spec]): FieldFlag => ({
    field,
    kind: spec.kind,
    required: spec.required === true,
    flag: renames[field] ?? kebabCase(field),
  }));
  const taken = new Set<string>(SHARED_FLAGS);
  for (const { field, kind, flag } of flags) {
    const names = kind === 'nullableString' ? [flag, unsetFlag(flag)] : [flag];
    for (const name of names) {
      if (taken.has(name)) throw new Error(`The flag --${name} of field '${field}' collides with another flag`);
      if (name.startsWith('no-')) throw new Error(`The flag --${name} of field '${field}' would read as a negation`);
      if (!/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/.test(name)) throw new Error(`The flag --${name} of field '${field}' is not kebab-case`);
      taken.add(name);
    }
    if (renames[field] === undefined && optionKey(flag) !== field) {
      throw new Error(`The field '${field}' does not map back from its flag --${flag}`);
    }
  }
  return flags;
}

/** The value placeholder of a flag of `kind` (none for a presence flag). */
const PLACEHOLDERS: Readonly<Record<Exclude<FieldKind, 'presenceBoolean'>, string>> = {
  string: '<text>',
  nullableString: '<text>',
  valueBoolean: '<true|false>',
  number: '<number>',
  tags: '<tags>',
  json: '<json>',
};

/** How a flag of `kind` reads its value, for option descriptions. */
const KIND_NOTES: Readonly<Record<FieldKind, string>> = {
  string: 'text, taken literally',
  nullableString: 'text, taken literally',
  presenceBoolean: 'flag',
  valueBoolean: 'true or false',
  number: 'a number',
  tags: "a JSON array of strings, or a comma-separated list; '' means not given",
  json: 'a JSON value',
};

/**
 * Add the options of `flags` to `command`.  `describe` gives the
 * description of a field's flag; the encoding of its kind is appended.  A
 * flag named in `requiredOptions` becomes a required option of commander;
 * other required fields are checked with the operation's rules.
 */
export function addFieldOptions(
  command: Command,
  flags: readonly FieldFlag[],
  describe: (flag: FieldFlag) => string,
  requiredOptions: ReadonlySet<string> = new Set(),
): void {
  for (const flag of flags) {
    const description = `${describe(flag)} (${KIND_NOTES[flag.kind]}${flag.required ? '; required' : ''})`;
    const syntax = flag.kind === 'presenceBoolean' ? `--${flag.flag}` : `--${flag.flag} ${PLACEHOLDERS[flag.kind]}`;
    if (requiredOptions.has(flag.flag)) command.requiredOption(syntax, description);
    else command.option(syntax, description);
    if (flag.kind === 'nullableString') {
      command.option(`--${unsetFlag(flag.flag)}`, `Remove: pass null for ${flag.field} (not together with --${flag.flag})`);
    }
  }
}

/** A rejection of a flag's value. */
function flagError(flag: string, detail: string): Error {
  return new Error(`--${flag}: ${detail}`);
}

const JSON_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

function decodeJson(flag: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw flagError(flag, `expected a JSON value, got ${JSON.stringify(text)} (${err instanceof Error ? err.message : String(err)})`);
  }
}

function decodeTags(text: string): string[] | undefined {
  if (text === '') return undefined;
  let whole: unknown;
  try {
    whole = JSON.parse(text);
  } catch {
    whole = undefined;
  }
  if (Array.isArray(whole) && whole.every((item) => typeof item === 'string')) return whole as string[];
  return text.split(',').map((segment) => segment.trim()).filter(Boolean);
}

/** The value of one flag from commander's option values, `undefined` when not given. */
function decodeFlag(flag: FieldFlag, options: Readonly<Record<string, unknown>>): unknown {
  const value = options[optionKey(flag.flag)];
  if (flag.kind === 'presenceBoolean') return value === true ? true : undefined;
  if (flag.kind === 'nullableString' && options[optionKey(unsetFlag(flag.flag))] === true) {
    if (value !== undefined) throw flagError(flag.flag, `cannot be given together with --${unsetFlag(flag.flag)}`);
    return null;
  }
  if (value === undefined) return undefined;
  const text = value as string;
  switch (flag.kind) {
    case 'string':
    case 'nullableString':
      return text;
    case 'valueBoolean':
      if (text === 'true') return true;
      if (text === 'false') return false;
      throw flagError(flag.flag, `expected true or false, got ${JSON.stringify(text)}`);
    case 'number':
      if (!JSON_NUMBER.test(text)) throw flagError(flag.flag, `expected a number, got ${JSON.stringify(text)}`);
      return Number(text);
    case 'tags':
      return decodeTags(text);
    case 'json':
      return decodeJson(flag.flag, text);
  }
}

/**
 * The fields given by `options` (commander's option values of a command
 * with `flags`), decoded by kind; a field not given is absent.  Throws an
 * error naming the flag (`--<flag>: <detail>`) when a value does not fit its
 * encoding.
 */
export function decodeFieldOptions(
  flags: readonly FieldFlag[],
  options: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const flag of flags) {
    const value = decodeFlag(flag, options);
    if (value !== undefined) fields[flag.field] = value;
  }
  return fields;
}

/** The root path the commands validate a mutation under; never printed. */
export const COMMAND_ROOT = '$';

/**
 * The text of a rejection at mutation path `path` (under
 * {@link COMMAND_ROOT}): the flag of the field in place of the mutation path
 * (`$.tags[1]` → `--tags[1]`), then the detail; a rejection of the whole
 * operation (the path is the root) is the detail alone.
 */
function rejectionText(flags: readonly FieldFlag[], path: string, detail: string): string {
  if (path === COMMAND_ROOT) return detail;
  const rest = path.startsWith(`${COMMAND_ROOT}.`) ? path.slice(COMMAND_ROOT.length + 1) : path;
  const field = /^[A-Za-z0-9]+/.exec(rest)?.[0] ?? '';
  const flag = flags.find((f) => f.field === field)?.flag ?? kebabCase(field);
  return `--${flag}${rest.slice(field.length)}: ${detail}`;
}

/**
 * Translate a rejection of an operation command into an error naming the
 * flag: a {@link MutationsFileError} of `validateMutation` under
 * {@link COMMAND_ROOT}, or an {@link InvalidWriteError} the library raised
 * while applying `op` (its field mapped as `apply` maps it, through
 * `mutationFieldPath`).  Other errors are returned unchanged.
 */
export function asFlagError(err: unknown, op: Mutation['op'], flags: readonly FieldFlag[]): unknown {
  if (err instanceof MutationsFileError) return new Error(rejectionText(flags, err.path, err.detail));
  if (err instanceof InvalidWriteError) {
    return new Error(rejectionText(flags, mutationFieldPath(op, COMMAND_ROOT, err.field), err.detail));
  }
  return err;
}
