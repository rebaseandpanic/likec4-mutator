/**
 * Lists the rules of the LikeC4 grammar shipped in the installed
 * `@likec4/language-server`, and checks a coverage document against them.
 *
 *   npx tsx scripts/grammar-rules.ts
 *     Prints the LikeC4 version, every parser rule (with its sort) and every
 *     terminal rule.
 *
 *   npx tsx scripts/grammar-rules.ts --check docs/likec4-coverage.md
 *     Compares the parser rules with the rows of the document's tables (a row
 *     names its rule in backticks in the first cell) and exits with code 1
 *     when a rule has no row, a row names a rule the grammar does not have,
 *     a rule has more than one row, a status cell is not one of
 *     yes / partial / no / n/a, a row other than all-`no` has no notes, or the
 *     document's title does not name the installed LikeC4 version.
 *
 * The grammar is taken from the language services of the installed package
 * (`likec4.Grammar`), never from this library's sources: the document is
 * compared with what LikeC4 itself parses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';

const STATUSES: ReadonlySet<string> = new Set(['yes', 'partial', 'no', 'n/a']);
/** Columns of a coverage row: Rule | DSL example | Read | Add | Update | Remove | Notes */
const STATUS_COLUMNS = [2, 3, 4, 5] as const;
const NOTES_COLUMN = 6;

type ParserRuleSort = 'entry' | 'fragment' | 'datatype' | 'rule';

interface GrammarRules {
  readonly parser: ReadonlyArray<{ readonly name: string; readonly sort: ParserRuleSort }>;
  readonly terminals: ReadonlyArray<{ readonly name: string; readonly hidden: boolean }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function languageServerVersion(): string {
  const path = fileURLToPath(import.meta.resolve('@likec4/language-server/package.json'));
  const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(pkg) || typeof pkg['version'] !== 'string') {
    throw new Error(`${path}: no version field`);
  }
  return pkg['version'];
}

function grammarRules(): GrammarRules {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts });
  const grammar: unknown = services.likec4.Grammar;
  if (!isRecord(grammar) || !Array.isArray(grammar['rules'])) {
    throw new Error('likec4.Grammar has no rules array');
  }
  const parser: Array<{ name: string; sort: ParserRuleSort }> = [];
  const terminals: Array<{ name: string; hidden: boolean }> = [];
  for (const rule of grammar['rules'] as unknown[]) {
    if (!isRecord(rule) || typeof rule['name'] !== 'string') {
      throw new Error('likec4.Grammar has a rule without a name');
    }
    const name = rule['name'];
    if (rule['$type'] === 'ParserRule') {
      const sort: ParserRuleSort =
        rule['entry'] === true ? 'entry' : rule['fragment'] === true ? 'fragment' : rule['dataType'] !== undefined ? 'datatype' : 'rule';
      parser.push({ name, sort });
    } else if (rule['$type'] === 'TerminalRule') {
      terminals.push({ name, hidden: rule['hidden'] === true });
    } else {
      throw new Error(`likec4.Grammar rule ${name} has unexpected type ${String(rule['$type'])}`);
    }
  }
  return { parser, terminals };
}

/** Splits a Markdown table row into trimmed cells, honouring `\|` escapes. */
function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

interface DocRow {
  readonly line: number;
  readonly rule: string;
  readonly cells: readonly string[];
}

function documentRows(text: string): DocRow[] {
  const rows: DocRow[] = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trimStart().startsWith('|')) return;
    const cells = tableCells(line);
    const rule = /^`([A-Za-z_][A-Za-z0-9_]*)`$/.exec(cells[0] ?? '')?.[1];
    if (rule !== undefined) rows.push({ line: i + 1, rule, cells });
  });
  return rows;
}

function check(docPath: string, version: string, rules: GrammarRules): string[] {
  const text = readFileSync(docPath, 'utf8');
  const problems: string[] = [];

  const title = text.split('\n').find((l) => l.startsWith('# '));
  if (title === undefined || !title.includes(version)) {
    problems.push(`title does not name the installed LikeC4 ${version}: ${title ?? '(no "# " title)'}`);
  }

  const grammarNames = new Set(rules.parser.map((r) => r.name));
  const rows = documentRows(text);
  const seen = new Map<string, number>();
  for (const row of rows) {
    const first = seen.get(row.rule);
    if (first !== undefined) {
      problems.push(`line ${row.line}: rule ${row.rule} already has a row at line ${first}`);
    } else {
      seen.set(row.rule, row.line);
    }
    if (!grammarNames.has(row.rule)) {
      problems.push(`line ${row.line}: rule ${row.rule} is not in the LikeC4 ${version} grammar`);
    }
    if (row.cells.length !== NOTES_COLUMN + 1) {
      problems.push(`line ${row.line}: ${row.rule} has ${row.cells.length} cells, expected ${NOTES_COLUMN + 1}`);
      continue;
    }
    const statuses = STATUS_COLUMNS.map((c) => row.cells[c] ?? '');
    for (const status of statuses) {
      if (!STATUSES.has(status)) {
        problems.push(`line ${row.line}: ${row.rule} has status "${status}", expected yes / partial / no / n/a`);
      }
    }
    if (statuses.some((s) => s !== 'no') && (row.cells[NOTES_COLUMN] ?? '') === '') {
      problems.push(`line ${row.line}: ${row.rule} has a status other than "no" but no notes`);
    }
  }
  for (const rule of rules.parser) {
    if (!seen.has(rule.name)) problems.push(`missing row for rule ${rule.name} (${rule.sort})`);
  }
  return problems;
}

function main(argv: readonly string[]): number {
  const version = languageServerVersion();
  const rules = grammarRules();

  if (argv[0] === '--check') {
    const docPath = argv[1];
    if (docPath === undefined) {
      console.error('usage: grammar-rules.ts [--check <coverage.md>]');
      return 2;
    }
    const problems = check(docPath, version, rules);
    if (problems.length > 0) {
      console.error(`${docPath}: ${problems.length} problem(s) against LikeC4 ${version}:`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    console.log(`${docPath}: all ${rules.parser.length} parser rules of LikeC4 ${version} have exactly one row`);
    return 0;
  }
  if (argv.length > 0) {
    console.error('usage: grammar-rules.ts [--check <coverage.md>]');
    return 2;
  }

  console.log(`LikeC4 grammar from @likec4/language-server ${version}`);
  console.log(`\nParser rules (${rules.parser.length}):`);
  for (const r of rules.parser) console.log(r.sort === 'rule' ? `  ${r.name}` : `  ${r.name} (${r.sort})`);
  console.log(`\nTerminal rules (${rules.terminals.length}, not tracked in the coverage document):`);
  for (const t of rules.terminals) console.log(t.hidden ? `  ${t.name} (hidden)` : `  ${t.name}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
