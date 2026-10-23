/**
 * The single-operation commands, generated from the operation table
 * (`MUTATION_FIELDS`): one command per `apply` operation, with a flag per
 * field (see `encoding.ts`) and the shared flags `--dir`, `--output`,
 * `--json`.  A command is named by its operation in kebab-case
 * (`addView` → `add-view`), except that the five commands older than the
 * table ({@link KEPT_COMMANDS}) keep their names, required options and
 * success lines.
 *
 * A command builds the mutation object `apply` reads, checks it with
 * `validateMutation` and runs it with the shared runner, so it accepts the
 * same fields, applies the same rules and writes the same files as `apply`
 * with that one mutation.
 */
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { LikeC4Mutator } from '../mutator/mutator.js';
import { MUTATION_FIELDS, type Mutation, validateMutation } from '../mutations-file.js';
import { type OperationOutcome, runOperation } from '../operations/run-operation.js';
import { addFieldOptions, asFlagError, COMMAND_ROOT, decodeFieldOptions, type FieldFlag, fieldFlags, kebabCase } from './encoding.js';
import { loadDirectory, writeOutput } from './files.js';
import type { CliIO } from './program.js';

/** What an operation command needs from its program. */
export interface OperationCommandContext {
  io: CliIO;
  /** The description of `--dir` */
  dirDescription: string;
  /** Wrap a handler returning an exit code (or its promise) into a commander action */
  action: <A extends unknown[]>(handler: (...args: A) => number | Promise<number>) => (...args: A) => Promise<void>;
}

/** The interface a command kept from before the operation table. */
interface KeptCommand<Op extends Mutation['op']> {
  name: string;
  description: string;
  /** Flags commander requires */
  requiredOptions: readonly string[];
  /** Descriptions of the flags the command had, by field */
  descriptions: Readonly<Record<string, string>>;
  /** The text output of a success */
  successLines(mutation: Extract<Mutation, { op: Op }>, outcome: OperationOutcome): string[];
}

type RemovedElement = ReturnType<LikeC4Mutator['removeElement']>;

/**
 * The five commands older than the operation table: their names, required
 * options and success lines are kept; every other field of their operation
 * is a flag as for the generated commands.
 */
const KEPT_COMMANDS: { readonly [Op in 'addElement' | 'addRelationship' | 'updateElement' | 'removeElement' | 'removeRelationship']: KeptCommand<Op> } = {
  addElement: {
    name: 'add-element',
    description: 'Add a new element, at the model level or as a child of --parent',
    requiredOptions: ['kind', 'id'],
    descriptions: {
      parent: 'FQN of the parent element (omitted: the model level)',
      kind: 'Element kind',
      id: 'Local identifier for the new element',
      title: "Title of the new element (omitted: the kind's title, else the name)",
      summary: 'Short summary shown on diagrams',
      description: 'Description of the new element',
      technology: 'Technology label for the new element',
      tags: 'Tags of the new element (e.g. internal,backend)',
    },
    successLines: (_, outcome) => [`Created element '${outcome.result as string}'`],
  },
  addRelationship: {
    name: 'add-relationship',
    description: 'Add a relationship between two elements',
    requiredOptions: ['source', 'target'],
    descriptions: { source: 'FQN of the source element', target: 'FQN of the target element', label: 'Relationship label' },
    successLines: (m) => [`Relationship '${m.source}' -> '${m.target}' added successfully`],
  },
  updateElement: {
    name: 'update-element',
    description: 'Update properties of an existing element',
    requiredOptions: ['fqn'],
    descriptions: {
      fqn: 'Fully qualified name of the element to update',
      title: 'New title for the element',
      summary: 'New summary for the element',
      description: 'New description for the element',
      technology: 'New technology label for the element',
      tags: 'Tags replacing all tags of the element, including those added by extend blocks (e.g. internal,backend)',
    },
    successLines: (m) => [`Element '${m.fqn}' updated successfully`],
  },
  removeElement: {
    name: 'remove-element',
    description: 'Remove an element (and its entire body) from the model',
    requiredOptions: ['fqn'],
    descriptions: { fqn: 'Fully qualified name of the element to remove' },
    successLines: (m, outcome) => {
      const { removedRelationships } = outcome.result as RemovedElement;
      const lines = [`Removed element '${m.fqn}'`];
      if (removedRelationships.length > 0) {
        lines.push(`Also removed ${removedRelationships.length} relationship(s):`);
        for (const r of removedRelationships) lines.push(`  ${r.source} -> ${r.target}${r.title ? ` '${r.title}'` : ''}`);
      }
      return [...lines, ...outcome.cascadeLines];
    },
  },
  removeRelationship: {
    name: 'remove-relationship',
    description: 'Remove a relationship between two elements',
    requiredOptions: ['source', 'target'],
    descriptions: { source: 'Source element FQN or local name', target: 'Target element FQN or local name' },
    successLines: (m) => [`Relationship '${m.source}' -> '${m.target}' removed successfully`],
  },
};

/** The command name of an operation: its kept name, else the operation in kebab-case (`addView` → `add-view`). */
export function operationCommandName(op: Mutation['op']): string {
  return op in KEPT_COMMANDS ? KEPT_COMMANDS[op as keyof typeof KEPT_COMMANDS].name : kebabCase(op);
}

/** Add the command of `op` to `program`. */
function addOperationCommand(program: Command, op: Mutation['op'], context: OperationCommandContext): void {
  const { io } = context;
  const kept = op in KEPT_COMMANDS ? (KEPT_COMMANDS[op as keyof typeof KEPT_COMMANDS] as KeptCommand<Mutation['op']>) : undefined;
  const flags = fieldFlags(MUTATION_FIELDS[op]);
  const command = program
    .command(operationCommandName(op))
    .description(kept?.description ?? `The apply operation ${op}, its fields given as flags`)
    .requiredOption('--dir <path>', context.dirDescription);
  const describe = (flag: FieldFlag): string => kept?.descriptions[flag.field] ?? `Field ${flag.field} of ${op}`;
  addFieldOptions(command, flags, describe, new Set(kept?.requiredOptions));
  command
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .option('--json', 'Print {"operation", "result"} as JSON instead of text')
    .action(context.action((opts: Record<string, unknown> & { dir: string; output?: string; json?: boolean }) => {
      try {
        let mutation: Mutation;
        let outcome: OperationOutcome;
        let mutator: LikeC4Mutator;
        try {
          const fields = { op, ...decodeFieldOptions(flags, opts) };
          validateMutation(fields, COMMAND_ROOT);
          mutation = fields as Mutation;
          mutator = LikeC4Mutator.fromFiles(loadDirectory(opts.dir));
          outcome = runOperation(mutator, mutation);
        } catch (err) {
          throw asFlagError(err, op, flags);
        }
        writeOutput(mutator, resolve(opts.output ?? opts.dir));
        if (opts.json) {
          io.stdout.write(JSON.stringify({ operation: op, result: outcome.result }, null, 2) + '\n');
        } else {
          const lines = kept ? kept.successLines(mutation, outcome) : outcome.lines.length > 0 ? outcome.lines : [`${op}: done`];
          for (const line of lines) io.stdout.write(`${line}\n`);
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));
}

/**
 * Add the command of every operation to `program`: first the five kept
 * ones, in their former order, then the others in table order.
 */
export function addOperationCommands(program: Command, context: OperationCommandContext): void {
  const kept = Object.keys(KEPT_COMMANDS) as Mutation['op'][];
  for (const op of kept) addOperationCommand(program, op, context);
  for (const op of Object.keys(MUTATION_FIELDS) as Mutation['op'][]) {
    if (!kept.includes(op)) addOperationCommand(program, op, context);
  }
}
