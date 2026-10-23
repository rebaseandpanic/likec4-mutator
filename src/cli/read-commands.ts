/**
 * The read commands, from the read table: one command per public model read
 * of the mutator (`serialize` and the lower-level `C4Query` aside), with a
 * flag per parameter of the method (its filter fields, or the addressed id;
 * see `encoding.ts`) and the shared flags `--dir` and `--json`.
 *
 * Output: readable text, or with `--json` the method's value unchanged.  A
 * `get-*` command whose construct does not exist exits 1 with the reason on
 * stderr and nothing on stdout; `get-specification` of a model without a
 * specification and an empty list succeed.
 *
 * The table is tied to the mutator at compile time: every public method is
 * an `apply` operation, a read entry, or named in {@link NOT_READ}.
 */
import type { Command } from 'commander';
import { LikeC4Mutator } from '../mutator/mutator.js';
import type { Mutation } from '../mutations-file.js';
import type { DeploymentEndpoint, ElementInfo } from '../query/types.js';
import { addFieldOptions, decodeFieldOptions, type FieldFlag, fieldFlags } from './encoding.js';
import { loadDirectory } from './files.js';
import type { OperationCommandContext } from './operation-commands.js';

/** The public methods of the mutator. */
type PublicMethod = { [K in keyof LikeC4Mutator]: LikeC4Mutator[K] extends (...args: never[]) => unknown ? K : never }[keyof LikeC4Mutator];

/** How a read method takes its parameters. */
type ReadForm =
  /** No parameter */
  | 'none'
  /** One parameter, the addressed construct; required */
  | 'address'
  /** One optional filter object; each field a parameter */
  | 'filter';

/** One read command: the method it calls, its parameters and its text output. */
export interface ReadCommand<M extends PublicMethod = PublicMethod> {
  readonly command: string;
  readonly method: M;
  readonly description: string;
  readonly form: ReadForm;
  /**
   * The parameters, by the name the method gives them (the field of the
   * filter, or the address); each one string flag, named by the parameter in
   * kebab-case unless `flag` is given.
   */
  readonly params: readonly { readonly name: string; readonly flag?: string; readonly description: string }[];
  /** The reason a `get-*` command prints when the method finds nothing (`null`), naming the address */
  readonly notFound?: (address: string) => string;
  /** The text of a `null` value that is not a failure (`get-specification` of a model without one) */
  readonly nullText?: string;
  /** The text output of the method's value (a found value, for a `get-*` command) */
  readonly render: (value: NonNullable<ReturnType<LikeC4Mutator[M]>>) => string[];
}

/** A read entry, typed by its method. */
function read<M extends PublicMethod>(entry: ReadCommand<M>): ReadCommand<M> {
  return entry;
}

/** `"title"` when there is one. */
function quoted(text: string | undefined): string[] {
  return text ? [`"${text}"`] : [];
}

/** A list rendered one line per item, or `No <what> found`. */
function listed<T>(what: string, line: (item: T) => string): (items: T[]) => string[] {
  return (items) => (items.length === 0 ? [`No ${what} found`] : items.map(line));
}

/** `<label>: <value>` lines for the values given, labels padded to one width. */
function fields(entries: ReadonlyArray<readonly [string, string | undefined]>): string[] {
  const given = entries.filter((entry): entry is readonly [string, string] => entry[1] !== undefined && entry[1] !== '');
  const width = Math.max(...given.map(([label]) => label.length)) + 2;
  return given.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`);
}

function endpoint(e: DeploymentEndpoint): string {
  return e.element !== undefined ? `${e.id} (${e.element})` : e.id;
}

/** The text of an element, as `get-element` has printed it. */
function elementLines(el: ElementInfo): string[] {
  const lines = [`FQN:         ${el.fqn}`, `Name:        ${el.name}`, `Kind:        ${el.kind}`];
  if (el.title) lines.push(`Title:       ${el.title}`);
  if (el.summary) lines.push(`Summary:     ${el.summary}`);
  if (el.description) lines.push(`Description: ${el.description}`);
  if (el.technology) lines.push(`Technology:  ${el.technology}`);
  if (el.parentFqn) lines.push(`Parent:      ${el.parentFqn}`);
  if (el.children.length > 0) lines.push(`Children:    ${el.children.join(', ')}`);
  if (el.tags && el.tags.length > 0) lines.push(`Tags:        ${el.tags.join(', ')}`);
  if (el.fromSpecification) {
    // 1-based line of the kind declaration whose defaults apply.
    const spec = el.fromSpecification;
    lines.push(`Kind spec:   ${spec.file ?? '<unnamed>'}:${spec.sourceRange.line + 1}`);
  }
  if (el.extendedBy.length > 0) {
    // 1-based line of each `extend` block that contributes to the element.
    const places = el.extendedBy.map((e) => `${e.file ?? '<unnamed>'}:${e.sourceRange.line + 1}`);
    lines.push(`Extended by: ${places.join(', ')}`);
  }
  return lines;
}

/**
 * The read commands, in the order the program lists them.  `get-element`
 * has a second mode, `--source`, reading `getElementSource` (see
 * {@link NOT_READ}).
 */
export const READ_COMMANDS = [
  read({
    command: 'list-elements',
    method: 'listElements',
    description: 'List all elements across the LikeC4 files in a directory',
    form: 'filter',
    params: [
      { name: 'kind', description: 'Filter by element kind' },
      { name: 'parentFqn', flag: 'parent', description: 'Filter by parent FQN' },
    ],
    render: listed('elements', (el) => [el.fqn, `[${el.kind}]`, ...quoted(el.title), ...(el.technology ? [`(${el.technology})`] : [])].join('  ')),
  }),
  read({
    command: 'get-element',
    method: 'getElement',
    description: 'Get a single element by its fully qualified name',
    form: 'address',
    params: [{ name: 'fqn', description: 'Fully qualified name of the element' }],
    notFound: (fqn) => `Element '${fqn}' not found`,
    render: elementLines,
  }),
  read({
    command: 'get-relationships',
    method: 'getRelationships',
    description: 'List the relationships of the model, optionally by source and target',
    form: 'filter',
    params: [
      { name: 'sourceFqn', description: 'Filter by source element FQN' },
      { name: 'targetFqn', description: 'Filter by target element FQN' },
    ],
    render: listed('relationships', (r) => [`${r.sourceFqn} -> ${r.targetFqn}`, ...(r.kind ? [`[${r.kind}]`] : []), ...quoted(r.title)].join('  ')),
  }),
  read({
    command: 'get-specification',
    method: 'getSpecification',
    description: 'Show the kinds and tags the specification declares',
    form: 'none',
    params: [],
    nullText: 'No specification',
    render: (spec) =>
      fields([
        ['Element kinds', spec.elementKinds.join(', ') || '(none)'],
        ['Relationship kinds', spec.relationshipKinds.join(', ') || '(none)'],
        ['Deployment node kinds', spec.deploymentNodeKinds?.join(', ')],
        ['Tags', spec.tags.join(', ') || '(none)'],
      ]),
  }),
  read({
    command: 'list-views',
    method: 'listViews',
    description: 'List the views, optionally by type and file',
    form: 'filter',
    params: [
      { name: 'type', description: 'Filter by view type (element, dynamic or deployment)' },
      { name: 'file', description: 'Filter by the loaded file the view is declared in' },
    ],
    render: listed('views', (v) => [v.id ?? '<unnamed>', `[${v.type}]`, ...quoted(v.title), `(${v.file})`].join('  ')),
  }),
  read({
    command: 'get-view',
    method: 'getView',
    description: 'Get a single view by its id',
    form: 'address',
    params: [{ name: 'id', description: 'Id of the view' }],
    notFound: (id) => `View '${id}' not found`,
    render: (v) =>
      fields([
        ['ID', v.id ?? undefined],
        ['Type', v.type],
        ['Title', v.title],
        ['Of', v.of?.text],
        ['Extends', v.extends?.text],
        ['Tags', v.tags?.join(', ')],
        ['File', `${v.file}:${v.sourceRange.line + 1}`],
        ['Rules', String(v.rules.length)],
        ['Steps', v.steps === undefined ? undefined : String(v.steps.length)],
      ]),
  }),
  read({
    command: 'list-deployment-nodes',
    method: 'listDeploymentNodes',
    description: 'List the deployment nodes, optionally by kind and parent',
    form: 'filter',
    params: [
      { name: 'kind', description: 'Filter by deployment node kind' },
      { name: 'parentId', description: 'Filter by the id of the parent node' },
    ],
    render: listed('deployment nodes', (n) => [n.id, `[${n.kind}]`, ...quoted(n.title)].join('  ')),
  }),
  read({
    command: 'get-deployment-node',
    method: 'getDeploymentNode',
    description: 'Get a single deployment node by its id',
    form: 'address',
    params: [{ name: 'id', description: 'Id of the deployment node' }],
    notFound: (id) => `Deployment node '${id}' not found`,
    render: (n) =>
      fields([
        ['ID', n.id],
        ['Kind', n.kind],
        ['Title', n.title],
        ['Summary', n.summary],
        ['Description', n.description],
        ['Technology', n.technology],
        ['Parent', n.parentId],
      ]),
  }),
  read({
    command: 'get-deployment-node-kind',
    method: 'getDeploymentNodeKind',
    description: 'Get the declaration of a deployment node kind',
    form: 'address',
    params: [{ name: 'kind', description: 'Name of the deployment node kind' }],
    notFound: (kind) => `Deployment node kind '${kind}' not found`,
    render: (k) =>
      fields([
        ['Kind', k.kind],
        ['Title', k.title],
        ['Summary', k.summary],
        ['Description', k.description],
        ['Technology', k.technology],
        ['Tags', k.tags?.join(', ')],
        ['File', k.file === undefined ? undefined : `${k.file}:${k.sourceRange.line + 1}`],
      ]),
  }),
  read({
    command: 'list-deployment-instances',
    method: 'listDeploymentInstances',
    description: 'List the deployed instances, optionally by node and element',
    form: 'filter',
    params: [
      { name: 'nodeId', description: 'Filter by the id of the node holding the instance' },
      { name: 'element', description: 'Filter by the FQN of the deployed element' },
    ],
    render: listed('deployment instances', (i) => [i.id, `[instanceOf ${i.element}]`, ...quoted(i.title)].join('  ')),
  }),
  read({
    command: 'get-deployment-instance',
    method: 'getDeploymentInstance',
    description: 'Get a single deployed instance by its id',
    form: 'address',
    params: [{ name: 'id', description: 'Id of the deployed instance' }],
    notFound: (id) => `Deployment instance '${id}' not found`,
    render: (i) =>
      fields([
        ['ID', i.id],
        ['Element', i.element],
        ['Title', i.title],
        ['Summary', i.summary],
        ['Description', i.description],
        ['Technology', i.technology],
        ['Parent', i.parentId],
      ]),
  }),
  read({
    command: 'list-deployment-relationships',
    method: 'listDeploymentRelationships',
    description: 'List the deployment relationships, optionally by source, target and kind',
    form: 'filter',
    params: [
      { name: 'source', description: 'Filter by source node or instance id' },
      { name: 'target', description: 'Filter by target node or instance id' },
      { name: 'kind', description: 'Filter by relationship kind' },
    ],
    render: listed('deployment relationships', (r) =>
      [`${endpoint(r.source)} ${r.bidirectional ? '<->' : '->'} ${endpoint(r.target)}`, ...(r.kind ? [`[${r.kind}]`] : []), ...quoted(r.title)].join('  '),
    ),
  }),
] as const;

/**
 * The public methods of the mutator that are neither an `apply` operation
 * nor a read entry: `serialize` (the files, not the model), `validate` (the
 * `validate` command) and `getElementSource`, read by `get-element --source`.
 */
export const NOT_READ = ['serialize', 'validate', 'getElementSource'] as const satisfies readonly PublicMethod[];

/** The public methods the tables do not classify; must be none. */
type Unclassified = Exclude<PublicMethod, Mutation['op'] | (typeof READ_COMMANDS)[number]['method'] | (typeof NOT_READ)[number]>;

// Fails to compile, naming the method, when a public method of the mutator is unclassified.
const EVERY_METHOD_CLASSIFIED: [Unclassified] extends [never] ? true : { unclassified: Unclassified } = true;
void EVERY_METHOD_CLASSIFIED;

/** The flags of a read command's parameters. */
export function readFlags(entry: ReadCommand): FieldFlag[] {
  const specs = Object.fromEntries(entry.params.map((p) => [p.name, { kind: 'string' as const, ...(entry.form === 'address' && { required: true as const }) }]));
  const renames = Object.fromEntries(entry.params.flatMap((p) => (p.flag !== undefined ? [[p.name, p.flag]] : [])));
  return fieldFlags(specs, renames);
}

/** Add the command of `entry` to `program`. */
function addReadCommand(program: Command, entry: ReadCommand, context: OperationCommandContext): void {
  const { io } = context;
  const flags = readFlags(entry);
  const command = program.command(entry.command).description(entry.description).requiredOption('--dir <path>', context.dirDescription);
  const descriptions = new Map(entry.params.map((p) => [p.name, p.description]));
  addFieldOptions(command, flags, (flag) => descriptions.get(flag.field) ?? flag.field, new Set(entry.form === 'address' ? flags.map((f) => f.flag) : []));
  const sourceMode = entry.method === 'getElement';
  if (sourceMode) command.option('--source', 'Output the raw DSL source text of the element (getElementSource)');
  command
    .option('--json', 'Output the value the library returns, as JSON')
    .action(context.action((opts: Record<string, unknown> & { dir: string; json?: boolean; source?: boolean }) => {
      try {
        const given = decodeFieldOptions(flags, opts);
        const args = entry.form === 'none' ? [] : entry.form === 'address' ? [given[flags[0].field]] : [given];
        const mutator = LikeC4Mutator.fromFiles(loadDirectory(opts.dir));
        const method = sourceMode && opts.source ? 'getElementSource' : entry.method;
        const value = (mutator[method] as (...a: unknown[]) => unknown).apply(mutator, args);
        if (value === null && entry.notFound) {
          io.stderr.write(`${entry.notFound(String(args[0]))}\n`);
          return 1;
        }
        if (opts.json) {
          io.stdout.write(JSON.stringify(value, null, 2) + '\n');
        } else if (method === 'getElementSource') {
          io.stdout.write(`${value as string}\n`);
        } else if (value === null) {
          io.stdout.write(`${entry.nullText}\n`);
        } else {
          for (const line of (entry.render as (v: unknown) => string[])(value)) io.stdout.write(`${line}\n`);
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));
}

/** Add the read commands to `program`, in table order. */
export function addReadCommands(program: Command, context: OperationCommandContext): void {
  for (const entry of READ_COMMANDS) addReadCommand(program, entry as ReadCommand, context);
}
