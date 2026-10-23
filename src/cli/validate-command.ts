/**
 * The `validate` command: the records `LikeC4Mutator.validateModel` gives
 * for the files loaded from `--dir`, which is what `likec4 validate` of
 * LikeC4 1.59.4 reports for those files.
 *
 * Text output: one line per record on stderr — `file:line:column: message`
 * for a located record (1-based), the message alone for an unlocated one —
 * and exit 1; with no record, the success line counting the loaded files
 * on stdout and exit 0.  With `--json`, stdout carries only the array of
 * records.  `--no-layout` skips the view step.  A failure to run the check
 * prints `Error: <reason>` on stderr and exits 1.
 */
import type { Command } from 'commander';
import { LikeC4Mutator } from '../mutator/mutator.js';
import type { ValidationRecord } from '../validation/likec4-check.js';
import { likec4FileExtensionList, loadDirectory } from './files.js';
import type { OperationCommandContext } from './operation-commands.js';

/** The line of a record. */
function recordLine(record: ValidationRecord): string {
  return record.file !== undefined ? `${record.file}:${record.line}:${record.column}: ${record.message}` : record.message;
}

/** Add the `validate` command to `program`. */
export function addValidateCommand(program: Command, context: OperationCommandContext): void {
  const { io } = context;
  program
    .command('validate')
    .description('Validate all LikeC4 files in a directory as likec4 validate does')
    .requiredOption('--dir <path>', context.dirDescription)
    .option('--no-layout', 'Skip the computation and layout of the views')
    .option('--json', 'Output the records as a JSON array')
    .action(context.action(async (opts: { dir: string; layout: boolean; json?: boolean }) => {
      try {
        const files = loadDirectory(opts.dir);
        if (Object.keys(files).length === 0) {
          io.stderr.write(`No LikeC4 files (${likec4FileExtensionList()}) found in ${opts.dir}\n`);
          return 1;
        }
        const records = await LikeC4Mutator.fromFiles(files).validateModel({ layout: opts.layout });
        if (opts.json) {
          io.stdout.write(JSON.stringify(records, null, 2) + '\n');
        } else if (records.length === 0) {
          io.stdout.write(`All files are valid (${Object.keys(files).length} file(s) checked)\n`);
        } else {
          for (const record of records) io.stderr.write(`${recordLine(record)}\n`);
        }
        return records.length === 0 ? 0 : 1;
      } catch (err) {
        io.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    }));
}
