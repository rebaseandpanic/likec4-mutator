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

/**
 * Rethrow an {@link InvalidWriteError} of a standalone command naming the
 * command-line option that carried the value (`name` is given as `--id`, a
 * tag as `--tags`); other errors unchanged.
 */
function asOptionError(err: unknown): unknown {
  if (!(err instanceof InvalidWriteError)) return err;
  const field = err.field === 'name' ? 'id' : err.field.replace(/[[.].*$/, '');
  return new Error(`--${field}: ${err.detail}`);
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
  // add-element
  // ---------------------------------------------------------------------------

  program
    .command('add-element')
    .description('Add a new element as a child of an existing element')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--parent <fqn>', 'FQN of the parent element')
    .requiredOption('--kind <kind>', 'Element kind (e.g. service, database)')
    .requiredOption('--id <id>', 'Local identifier for the new element')
    .requiredOption('--title <title>', 'Title of the new element')
    .option('--summary <text>', 'Short summary shown on diagrams')
    .option('--description <text>', 'Description of the new element')
    .option('--technology <text>', 'Technology label for the new element')
    .option('--tags <tags>', 'Comma-separated list of tags (e.g. internal,backend)')
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .action(action((opts: {
      dir: string;
      parent: string;
      kind: string;
      id: string;
      title: string;
      summary?: string;
      description?: string;
      technology?: string;
      tags?: string;
      output?: string;
    }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        const parsedTags = opts.tags ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        let createdFqn: string;
        try {
          createdFqn = mutator.addElement(opts.parent, {
            name: opts.id,
            kind: opts.kind,
            title: opts.title,
            summary: opts.summary,
            description: opts.description,
            technology: opts.technology,
            tags: parsedTags,
          });
        } catch (err) {
          throw asOptionError(err);
        }
        const outDir = opts.output ?? opts.dir;
        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Created element '${createdFqn}'\n`);
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // add-relationship
  // ---------------------------------------------------------------------------

  program
    .command('add-relationship')
    .description('Add a relationship between two elements')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--source <fqn>', 'FQN of the source element')
    .requiredOption('--target <fqn>', 'FQN of the target element')
    .option('--label <text>', 'Relationship label')
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .action(action((opts: {
      dir: string;
      source: string;
      target: string;
      label?: string;
      output?: string;
    }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        try {
          mutator.addRelationship(opts.source, opts.target, opts.label);
        } catch (err) {
          throw asOptionError(err);
        }
        const outDir = opts.output ?? opts.dir;
        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Relationship '${opts.source}' -> '${opts.target}' added successfully\n`);
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // update-element
  // ---------------------------------------------------------------------------

  program
    .command('update-element')
    .description('Update properties of an existing element')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--fqn <fqn>', 'Fully qualified name of the element to update')
    .option('--title <text>', 'New title for the element')
    .option('--summary <text>', 'New summary for the element')
    .option('--description <text>', 'New description for the element')
    .option('--technology <text>', 'New technology label for the element')
    .option('--tags <tags>', 'Comma-separated list of tags replacing all tags of the element, including those added by extend blocks (e.g. internal,backend)')
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .action(action((opts: {
      dir: string;
      fqn: string;
      title?: string;
      summary?: string;
      description?: string;
      technology?: string;
      tags?: string;
      output?: string;
    }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        const parsedTags = opts.tags ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        try {
          mutator.updateElement(opts.fqn, {
            title: opts.title,
            summary: opts.summary,
            description: opts.description,
            technology: opts.technology,
            tags: parsedTags,
          });
        } catch (err) {
          throw asOptionError(err);
        }
        const outDir = opts.output ?? opts.dir;
        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Element '${opts.fqn}' updated successfully\n`);
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // remove-element
  // ---------------------------------------------------------------------------

  program
    .command('remove-element')
    .description('Remove an element (and its entire body) from the model')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--fqn <fqn>', 'Fully qualified name of the element to remove')
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .action(action((opts: { dir: string; fqn: string; output?: string }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        const { removedRelationships } = mutator.removeElement(opts.fqn);
        const outDir = opts.output ?? opts.dir;
        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Removed element '${opts.fqn}'\n`);
        if (removedRelationships.length > 0) {
          io.stdout.write(
            `Also removed ${removedRelationships.length} relationship(s):\n`,
          );
          for (const r of removedRelationships) {
            const titlePart = r.title ? ` '${r.title}'` : '';
            io.stdout.write(`  ${r.source} -> ${r.target}${titlePart}\n`);
          }
        }
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // remove-relationship
  // ---------------------------------------------------------------------------

  program
    .command('remove-relationship')
    .description('Remove a relationship between two elements')
    .requiredOption('--dir <path>', dirDescription)
    .requiredOption('--source <fqn>', 'Source element FQN or local name')
    .requiredOption('--target <fqn>', 'Target element FQN or local name')
    .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
    .action(action((opts: { dir: string; source: string; target: string; output?: string }) => {
      try {
        const files = loadDirectory(opts.dir);
        const mutator = LikeC4Mutator.fromFiles(files);
        mutator.removeRelationship(opts.source, opts.target);
        const outDir = opts.output ?? opts.dir;
        writeOutput(mutator, resolve(outDir));
        io.stdout.write(`Relationship '${opts.source}' -> '${opts.target}' removed successfully\n`);
        return 0;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));

  // ---------------------------------------------------------------------------
  // The commands of the other operations, generated from the operation table
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
