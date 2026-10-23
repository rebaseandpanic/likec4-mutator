/**
 * The single-operation commands generated from the operation table
 * (`MUTATION_FIELDS`): one command per `apply` operation, named by the
 * operation in kebab-case (`addView` → `add-view`), with a flag per field
 * (see `encoding.ts`) and the shared flags `--dir`, `--output`, `--json`.
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
import { runOperation } from '../operations/run-operation.js';
import { addFieldOptions, asFlagError, COMMAND_ROOT, decodeFieldOptions, fieldFlags, kebabCase } from './encoding.js';
import { loadDirectory, writeOutput } from './files.js';
import type { CliIO } from './program.js';

/** The operations whose commands keep the interface they had before the table (see `program.ts`). */
export const KEPT_OPERATIONS = ['addElement', 'addRelationship', 'updateElement', 'removeElement', 'removeRelationship'] as const;

/** What an operation command needs from its program. */
export interface OperationCommandContext {
  io: CliIO;
  /** The description of `--dir` */
  dirDescription: string;
  /** Wrap a handler returning an exit code into a commander action */
  action: <A extends unknown[]>(handler: (...args: A) => number) => (...args: A) => void;
}

/** The command name of an operation: `addView` → `add-view`. */
export function operationCommandName(op: Mutation['op']): string {
  return kebabCase(op);
}

/** Add the command of `op` to `program`. */
function addOperationCommand(program: Command, op: Mutation['op'], context: OperationCommandContext): void {
  const { io } = context;
  const flags = fieldFlags(MUTATION_FIELDS[op]);
  const command = program
    .command(operationCommandName(op))
    .description(`The apply operation ${op}, its fields given as flags`)
    .requiredOption('--dir <path>', context.dirDescription);
  addFieldOptions(command, flags, (flag) => `Field ${flag.field} of ${op}`);
  command
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .option('--json', 'Print {"operation", "result"} as JSON instead of text')
    .action(context.action((opts: Record<string, unknown> & { dir: string; output?: string; json?: boolean }) => {
      try {
        let outcome: ReturnType<typeof runOperation>;
        let mutator: LikeC4Mutator;
        try {
          const mutation = { op, ...decodeFieldOptions(flags, opts) };
          validateMutation(mutation, COMMAND_ROOT);
          mutator = LikeC4Mutator.fromFiles(loadDirectory(opts.dir));
          outcome = runOperation(mutator, mutation as Mutation);
        } catch (err) {
          throw asFlagError(err, op, flags);
        }
        writeOutput(mutator, resolve(opts.output ?? opts.dir));
        if (opts.json) {
          io.stdout.write(JSON.stringify({ operation: op, result: outcome.result }, null, 2) + '\n');
        } else {
          const lines = outcome.lines.length > 0 ? outcome.lines : [`${op}: done`];
          for (const line of lines) io.stdout.write(`${line}\n`);
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));
}

/** Add the command of every operation but the kept ones ({@link KEPT_OPERATIONS}) to `program`, in table order. */
export function addOperationCommands(program: Command, context: OperationCommandContext): void {
  const kept: readonly string[] = KEPT_OPERATIONS;
  for (const op of Object.keys(MUTATION_FIELDS) as Mutation['op'][]) {
    if (!kept.includes(op)) addOperationCommand(program, op, context);
  }
}
