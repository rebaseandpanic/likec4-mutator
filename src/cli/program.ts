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
  /** An action recording its handler's exit code. */
  const action =
    <A extends unknown[]>(handler: (...args: A) => number) =>
    (...args: A): void => {
      exitCode = handler(...args);
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

  program
    .command('validate')
    .description('Parse and validate all LikeC4 files in a directory')
    .requiredOption('--dir <path>', dirDescription)
    .action(action((opts: { dir: string }) => {
      try {
        const files = loadDirectory(opts.dir);
        if (Object.keys(files).length === 0) {
          io.stderr.write(`No LikeC4 files (${extensions}) found in ${opts.dir}\n`);
          return 1;
        }
        const mutator = LikeC4Mutator.fromFiles(files);
        const errors = mutator.validate();
        if (errors.length === 0) {
          io.stdout.write(`All files are valid (${Object.keys(files).length} file(s) checked)\n`);
          return 0;
        } else {
          for (const err of errors) {
            io.stderr.write(`${err}\n`);
          }
          return 1;
        }
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // list-elements
  // ---------------------------------------------------------------------------

  program
    .command('list-elements')
    .description('List all elements across the LikeC4 files in a directory')
    .requiredOption('--dir <path>', dirDescription)
    .option('--kind <kind>', 'Filter by element kind')
    .option('--parent <fqn>', 'Filter by parent FQN')
    .option('--json', 'Output as JSON array')
    .action(action((opts: { dir: string; kind?: string; parent?: string; json?: boolean }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        const elements = mutator.listElements({
          kind: opts.kind,
          parentFqn: opts.parent,
        });

        if (opts.json) {
          io.stdout.write(JSON.stringify(elements, null, 2) + '\n');
        } else {
          if (elements.length === 0) {
            io.stdout.write('No elements found\n');
          } else {
            for (const el of elements) {
              const parts = [el.fqn, `[${el.kind}]`];
              if (el.title) parts.push(`"${el.title}"`);
              if (el.technology) parts.push(`(${el.technology})`);
              io.stdout.write(parts.join('  ') + '\n');
            }
          }
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // get-element
  // ---------------------------------------------------------------------------

  program
    .command('get-element')
    .description('Get a single element by its fully qualified name')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--fqn <fqn>', 'Fully qualified name of the element')
    .option('--json', 'Output as JSON')
    .option('--source', 'Output raw DSL source text')
    .action(action((opts: { dir: string; fqn: string; json?: boolean; source?: boolean }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);

        if (opts.source) {
          const src = mutator.getElementSource(opts.fqn);
          if (src === null) {
            io.stderr.write(`Element '${opts.fqn}' not found\n`);
            return 1;
          }
          io.stdout.write(src + '\n');
        } else if (opts.json) {
          const el = mutator.getElement(opts.fqn);
          if (el === null) {
            io.stderr.write(`Element '${opts.fqn}' not found\n`);
            return 1;
          }
          io.stdout.write(JSON.stringify(el, null, 2) + '\n');
        } else {
          const el = mutator.getElement(opts.fqn);
          if (el === null) {
            io.stderr.write(`Element '${opts.fqn}' not found\n`);
            return 1;
          }
          io.stdout.write(`FQN:         ${el.fqn}\n`);
          io.stdout.write(`Name:        ${el.name}\n`);
          io.stdout.write(`Kind:        ${el.kind}\n`);
          if (el.title) io.stdout.write(`Title:       ${el.title}\n`);
          if (el.summary) io.stdout.write(`Summary:     ${el.summary}\n`);
          if (el.description) io.stdout.write(`Description: ${el.description}\n`);
          if (el.technology) io.stdout.write(`Technology:  ${el.technology}\n`);
          if (el.parentFqn) io.stdout.write(`Parent:      ${el.parentFqn}\n`);
          if (el.children.length > 0) io.stdout.write(`Children:    ${el.children.join(', ')}\n`);
          if (el.tags && el.tags.length > 0) io.stdout.write(`Tags:        ${el.tags.join(', ')}\n`);
          if (el.fromSpecification) {
            // 1-based line of the kind declaration whose defaults apply.
            const spec = el.fromSpecification;
            io.stdout.write(`Kind spec:   ${spec.file ?? '<unnamed>'}:${spec.sourceRange.line + 1}\n`);
          }
          if (el.extendedBy.length > 0) {
            // 1-based line of each `extend` block that contributes to the element.
            const places = el.extendedBy.map((e) => `${e.file ?? '<unnamed>'}:${e.sourceRange.line + 1}`);
            io.stdout.write(`Extended by: ${places.join(', ')}\n`);
          }
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

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
