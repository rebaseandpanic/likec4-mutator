/**
 * The `likec4-mutator` command-line program, built on injected output
 * streams: actions write to `io.stdout` / `io.stderr` and return an exit
 * code, and commander's own errors (an unknown option, a missing required
 * option) and its help and version output are routed through the same
 * streams and become exit codes instead of ending the process.
 */
import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LikeC4Mutator } from '../mutator/mutator.js';
import { mutationFieldPath, parseMutationsFile } from '../mutations-file.js';
import { InvalidWriteError } from '../mutator/write-checks.js';
import { runOperation } from '../operations/run-operation.js';
import { likec4FileExtensionList, loadDirectory, writeOutput } from './files.js';
import { addOperationCommands } from './operation-commands.js';
import { addReadCommands } from './read-commands.js';
import { addValidateCommand } from './validate-command.js';

/** A stream the program writes text to (`process.stdout`, or a test's collector). */
export interface CliWriter {
  write(chunk: string): unknown;
}

/** The output streams of a program. */
export interface CliIO {
  stdout: CliWriter;
  stderr: CliWriter;
}

export interface BuildProgramOptions {
  /** The version `--version` prints; without it the program has no `--version` */
  version?: string;
}

/** A built program; it runs once. */
export interface CliProgram {
  /**
   * Run the program on the user's arguments (`process.argv` without the
   * node and script paths) and resolve to the exit code.
   */
  run(args: readonly string[]): Promise<number>;
}

/** Build the program writing to `io`. */
export function buildProgram(io: CliIO, options: BuildProgramOptions = {}): CliProgram {
  let exitCode = 0;
  /** An action recording its handler's exit code; commander awaits it. */
  const action =
    <A extends unknown[]>(handler: (...args: A) => number | Promise<number>) =>
    async (...args: A): Promise<void> => {
      exitCode = await handler(...args);
    };
  const extensions = likec4FileExtensionList();
  const dirDescription = `Directory containing LikeC4 files (${extensions})`;

  // Set before the commands are added: subcommands copy both settings.
  const program = new Command()
    .name('likec4-mutator')
    .description('Programmatic mutation of LikeC4 files')
    .exitOverride()
    .configureOutput({
      writeOut: (str) => io.stdout.write(str),
      writeErr: (str) => io.stderr.write(str),
    });
  if (options.version !== undefined) program.version(options.version);

  // ---------------------------------------------------------------------------
  // validate
  // ---------------------------------------------------------------------------

  addValidateCommand(program, { io, dirDescription, action });

  // ---------------------------------------------------------------------------
  // The read commands, from the read table
  // ---------------------------------------------------------------------------

  addReadCommands(program, { io, dirDescription, action });

  // ---------------------------------------------------------------------------
  // The single-operation commands, generated from the operation table
  // ---------------------------------------------------------------------------

  addOperationCommands(program, { io, dirDescription, action });

  // ---------------------------------------------------------------------------
  // apply
  // ---------------------------------------------------------------------------

  program
    .command('apply')
    .description('Apply a batch of mutations from a JSON file')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--mutations <file>', 'Path to JSON file containing mutations')
    .option('--output <path>', 'Output directory for mutated files')
    .option('--in-place', 'Write results back to the source directory')
    .action(action((opts: {
      dir: string;
      mutations: string;
      output?: string;
      inPlace?: boolean;
    }) => {
      try {
        // Load and parse mutations file
        const mutationsRaw = readFileSync(resolve(opts.mutations), 'utf-8');
        // Validate the whole file before touching any LikeC4 source.
        const mutationsFile = parseMutationsFile(JSON.parse(mutationsRaw));

        // Load source files and create mutator
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);

        // Apply each mutation in order, printing its result lines.  A value
        // rejected by the library is reported with the JSON path of the
        // mutation field; nothing is written.
        let applied = 0;
        for (const [index, mutation] of mutationsFile.mutations.entries()) {
          try {
            const { lines } = runOperation(mutator, mutation);
            for (const line of lines) io.stdout.write(`${line}\n`);
            applied++;
          } catch (err) {
            if (err instanceof InvalidWriteError) {
              throw new Error(`${mutationFieldPath(mutation.op, `mutations[${index}]`, err.field)}: ${err.detail}`);
            }
            throw err;
          }
        }

        // Determine output destination
        const outDir = opts.output ?? (opts.inPlace ? opts.dir : undefined);
        if (!outDir) {
          io.stderr.write('Error: specify --output <path> or --in-place\n');
          return 1;
        }

        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Applied ${applied} mutation(s) successfully\n`);
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  return {
    async run(args) {
      try {
        await program.parseAsync([...args], { from: 'user' });
      } catch (err) {
        // Help, version and commander's own rejections have been written already.
        if (err instanceof CommanderError) return err.exitCode;
        throw err;
      }
      return exitCode;
    },
  };
}
