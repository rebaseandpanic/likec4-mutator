#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';
import { LikeC4Mutator } from './mutator/mutator.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Recursively load all .c4 files from a directory tree.
 * Returns a record mapping relative paths to file contents.
 */
function loadDirectory(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const absDir = resolve(dir);

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extname(entry) === '.c4') {
        const relPath = relative(absDir, fullPath);
        files[relPath] = readFileSync(fullPath, 'utf-8');
      }
    }
  }

  walk(absDir);
  return files;
}

/**
 * Write mutator's serialized files to the given output directory,
 * preserving the relative path structure.
 */
function writeOutput(mutator: LikeC4Mutator, outputDir: string) {
  const files = mutator.serialize();
  mkdirSync(outputDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    const outPath = join(outputDir, filename);
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(outPath, content, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Mutation operation types for the `apply` command
// ---------------------------------------------------------------------------

interface AddElementMutation {
  op: 'addElement';
  parent: string;
  kind: string;
  id: string;
  title: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  metadata?: Record<string, string>;
}

interface AddRelationshipMutation {
  op: 'addRelationship';
  source: string;
  target: string;
  label?: string;
  description?: string;
}

interface AddViewMutation {
  op: 'addView';
  id: string;
  type: 'element' | 'dynamic' | 'deployment';
  target?: string;
  title?: string;
}

interface UpdateElementMutation {
  op: 'updateElement';
  fqn: string;
  title?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  metadata?: Record<string, string>;
}

interface RemoveElementMutation {
  op: 'removeElement';
  fqn: string;
}

interface RemoveRelationshipMutation {
  op: 'removeRelationship';
  source: string;
  target: string;
}

type Mutation =
  | AddElementMutation
  | AddRelationshipMutation
  | AddViewMutation
  | UpdateElementMutation
  | RemoveElementMutation
  | RemoveRelationshipMutation;

interface MutationsFile {
  mutations: Mutation[];
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command()
  .name('likec4-mutator')
  .version('0.1.0')
  .description('Programmatic mutation of LikeC4 .c4 files');

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

program
  .command('validate')
  .description('Parse and validate all .c4 files in a directory')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .action((opts: { dir: string }) => {
    try {
      const files = loadDirectory(opts.dir);
      if (Object.keys(files).length === 0) {
        process.stderr.write(`No .c4 files found in ${opts.dir}\n`);
        process.exit(1);
      }
      const mutator = LikeC4Mutator.fromFiles(files);
      const errors = mutator.validate();
      if (errors.length === 0) {
        process.stdout.write(`All files are valid (${Object.keys(files).length} file(s) checked)\n`);
        process.exit(0);
      } else {
        for (const err of errors) {
          process.stderr.write(`${err}\n`);
        }
        process.exit(1);
      }
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// list-elements
// ---------------------------------------------------------------------------

program
  .command('list-elements')
  .description('List all elements across .c4 files in a directory')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .option('--kind <kind>', 'Filter by element kind')
  .option('--parent <fqn>', 'Filter by parent FQN')
  .option('--json', 'Output as JSON array')
  .action((opts: { dir: string; kind?: string; parent?: string; json?: boolean }) => {
    try {
      const files = loadDirectory(opts.dir);
      const mutator = LikeC4Mutator.fromFiles(files);
      const elements = mutator.listElements({
        kind: opts.kind,
        parentFqn: opts.parent,
      });

      if (opts.json) {
        process.stdout.write(JSON.stringify(elements, null, 2) + '\n');
      } else {
        if (elements.length === 0) {
          process.stdout.write('No elements found\n');
        } else {
          for (const el of elements) {
            const parts = [el.fqn, `[${el.kind}]`];
            if (el.title) parts.push(`"${el.title}"`);
            if (el.technology) parts.push(`(${el.technology})`);
            process.stdout.write(parts.join('  ') + '\n');
          }
        }
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// get-element
// ---------------------------------------------------------------------------

program
  .command('get-element')
  .description('Get a single element by its fully qualified name')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .requiredOption('--fqn <fqn>', 'Fully qualified name of the element')
  .option('--json', 'Output as JSON')
  .option('--source', 'Output raw DSL source text')
  .action((opts: { dir: string; fqn: string; json?: boolean; source?: boolean }) => {
    try {
      const files = loadDirectory(opts.dir);
      const mutator = LikeC4Mutator.fromFiles(files);

      if (opts.source) {
        const src = mutator.getElementSource(opts.fqn);
        if (src === null) {
          process.stderr.write(`Element '${opts.fqn}' not found\n`);
          process.exit(1);
        }
        process.stdout.write(src + '\n');
      } else if (opts.json) {
        const el = mutator.getElement(opts.fqn);
        if (el === null) {
          process.stderr.write(`Element '${opts.fqn}' not found\n`);
          process.exit(1);
        }
        process.stdout.write(JSON.stringify(el, null, 2) + '\n');
      } else {
        const el = mutator.getElement(opts.fqn);
        if (el === null) {
          process.stderr.write(`Element '${opts.fqn}' not found\n`);
          process.exit(1);
        }
        process.stdout.write(`FQN:         ${el.fqn}\n`);
        process.stdout.write(`Name:        ${el.name}\n`);
        process.stdout.write(`Kind:        ${el.kind}\n`);
        if (el.title) process.stdout.write(`Title:       ${el.title}\n`);
        if (el.description) process.stdout.write(`Description: ${el.description}\n`);
        if (el.technology) process.stdout.write(`Technology:  ${el.technology}\n`);
        if (el.parentFqn) process.stdout.write(`Parent:      ${el.parentFqn}\n`);
        if (el.children.length > 0) process.stdout.write(`Children:    ${el.children.join(', ')}\n`);
        if (el.tags && el.tags.length > 0) process.stdout.write(`Tags:        ${el.tags.join(', ')}\n`);
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// add-element
// ---------------------------------------------------------------------------

program
  .command('add-element')
  .description('Add a new element as a child of an existing element')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .requiredOption('--parent <fqn>', 'FQN of the parent element')
  .requiredOption('--kind <kind>', 'Element kind (e.g. service, database)')
  .requiredOption('--id <id>', 'Local identifier for the new element')
  .requiredOption('--title <title>', 'Title of the new element')
  .option('--description <text>', 'Description of the new element')
  .option('--technology <text>', 'Technology label for the new element')
  .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
  .action((opts: {
    dir: string;
    parent: string;
    kind: string;
    id: string;
    title: string;
    description?: string;
    technology?: string;
    output?: string;
  }) => {
    try {
      const files = loadDirectory(opts.dir);
      const mutator = LikeC4Mutator.fromFiles(files);
      mutator.addElement(opts.parent, {
        name: opts.id,
        kind: opts.kind,
        title: opts.title,
        description: opts.description,
        technology: opts.technology,
      });
      const outDir = opts.output ?? opts.dir;
      writeOutput(mutator, resolve(outDir));
      process.stdout.write(`Element '${opts.parent}.${opts.id}' added successfully\n`);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// add-relationship
// ---------------------------------------------------------------------------

program
  .command('add-relationship')
  .description('Add a relationship between two elements')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .requiredOption('--source <fqn>', 'FQN of the source element')
  .requiredOption('--target <fqn>', 'FQN of the target element')
  .option('--label <text>', 'Relationship label')
  .option('--output <path>', 'Output directory (defaults to --dir for in-place)')
  .action((opts: {
    dir: string;
    source: string;
    target: string;
    label?: string;
    output?: string;
  }) => {
    try {
      const files = loadDirectory(opts.dir);
      const mutator = LikeC4Mutator.fromFiles(files);
      mutator.addRelationship(opts.source, opts.target, opts.label);
      const outDir = opts.output ?? opts.dir;
      writeOutput(mutator, resolve(outDir));
      process.stdout.write(`Relationship '${opts.source}' -> '${opts.target}' added successfully\n`);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

program
  .command('apply')
  .description('Apply a batch of mutations from a JSON file')
  .requiredOption('--dir <path>', 'Directory containing .c4 files')
  .requiredOption('--mutations <file>', 'Path to JSON file containing mutations')
  .option('--output <path>', 'Output directory for mutated files')
  .option('--in-place', 'Write results back to the source directory')
  .action((opts: {
    dir: string;
    mutations: string;
    output?: string;
    inPlace?: boolean;
  }) => {
    try {
      // Load and parse mutations file
      const mutationsRaw = readFileSync(resolve(opts.mutations), 'utf-8');
      const mutationsFile = JSON.parse(mutationsRaw) as MutationsFile;

      if (!Array.isArray(mutationsFile.mutations)) {
        process.stderr.write('Error: mutations file must contain a "mutations" array\n');
        process.exit(1);
      }

      // Load source files and create mutator
      const files = loadDirectory(opts.dir);
      const mutator = LikeC4Mutator.fromFiles(files);

      // Apply each mutation in order
      let applied = 0;
      for (const mutation of mutationsFile.mutations) {
        switch (mutation.op) {
          case 'addElement': {
            const m = mutation as AddElementMutation;
            mutator.addElement(m.parent, {
              name: m.id,
              kind: m.kind,
              title: m.title,
              description: m.description,
              technology: m.technology,
              tags: m.tags,
              links: m.links,
              metadata: m.metadata,
            });
            applied++;
            break;
          }
          case 'addRelationship': {
            const m = mutation as AddRelationshipMutation;
            mutator.addRelationship(m.source, m.target, m.label, m.description);
            applied++;
            break;
          }
          case 'addView': {
            const m = mutation as AddViewMutation;
            mutator.addView({
              id: m.id,
              type: m.type,
              target: m.target,
              title: m.title,
            });
            applied++;
            break;
          }
          case 'updateElement': {
            const m = mutation as UpdateElementMutation;
            mutator.updateElement(m.fqn, {
              title: m.title,
              description: m.description,
              technology: m.technology,
              tags: m.tags,
              links: m.links,
              metadata: m.metadata,
            });
            applied++;
            break;
          }
          case 'removeElement': {
            const m = mutation as RemoveElementMutation;
            mutator.removeElement(m.fqn);
            applied++;
            break;
          }
          case 'removeRelationship': {
            const m = mutation as RemoveRelationshipMutation;
            mutator.removeRelationship(m.source, m.target);
            applied++;
            break;
          }
          default: {
            const op = (mutation as { op: string }).op;
            process.stderr.write(`Warning: unknown mutation op '${op}', skipping\n`);
          }
        }
      }

      // Determine output destination
      const outDir = opts.output ?? (opts.inPlace ? opts.dir : undefined);
      if (!outDir) {
        process.stderr.write('Error: specify --output <path> or --in-place\n');
        process.exit(1);
      }

      writeOutput(mutator, resolve(outDir));
      process.stdout.write(`Applied ${applied} mutation(s) successfully\n`);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

program.parse(process.argv);
