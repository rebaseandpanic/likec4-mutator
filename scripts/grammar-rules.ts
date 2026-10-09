/**
 * Lists the rules of the LikeC4 grammar shipped in the installed
 * `@likec4/language-server`, and checks a coverage document against them.
 *
 *   npx tsx scripts/grammar-rules.ts
 *     Prints the LikeC4 version and, for every parser rule: its sort, its
 *     fingerprint, its definition, and the facets the document must name
 *     (keywords, assigned features, AST types created by actions); then the
 *     terminal rules.
 *
 *   npx tsx scripts/grammar-rules.ts --check docs/likec4-coverage.md
 *     Exits with code 1 when the document does not match the grammar (see
 *     `check` below for the full list of conditions).
 *
 *   npx tsx scripts/grammar-rules.ts --update-fingerprints docs/likec4-coverage.md Rule1 Rule2 ...
 *     Writes the current fingerprint into the main row of each NAMED rule,
 *     after its rows have been reviewed.  Rules are never refreshed without
 *     being named, and naming a rule whose fingerprint is already current is
 *     an error, so the command cannot mark a row as reviewed by accident.
 *
 * Document format.  A grammar row names its rule in backticks in the first
 * cell: `Rule` for the main row of the rule, `Rule` › ... for a sub-row (an
 * alternative, keyword, property or AST type of the rule).  The main row ends
 * its Notes cell with `<!-- grammar-hash: <fingerprint> -->`.  Other table
 * rows (e.g. constructs outside the grammar) are not checked.
 *
 * The grammar is taken from the language services of the installed package
 * (`likec4.Grammar`), never from this library's sources: the document is
 * compared with what LikeC4 itself parses.  Nothing about the grammar is
 * hard-coded here.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';

const STATUSES: ReadonlySet<string> = new Set(['yes', 'partial', 'text', 'no', 'n/a']);
/** Columns of a coverage row: Rule | DSL example | Read | Add | Update | Remove | Notes */
const STATUS_COLUMNS = [2, 3, 4, 5] as const;
const NOTES_COLUMN = 6;
/** Bracket keywords only delimit blocks; every other keyword is a facet. */
const STRUCTURAL_KEYWORDS: ReadonlySet<string> = new Set(['{', '}', '(', ')', '[', ']']);
const HASH_COMMENT = /\s*<!--\s*grammar-hash:\s*([0-9a-f]*)\s*-->/;
const ROW_LABEL = /^`([A-Za-z_][A-Za-z0-9_]*)`(?:\s*›\s*(.+))?$/;

type ParserRuleSort = 'entry' | 'fragment' | 'datatype' | 'rule';

interface ParserRule {
  readonly name: string;
  readonly sort: ParserRuleSort;
  /** Readable form of the definition, printed when the rule changes. */
  readonly definition: string;
  /** First 12 hex digits of the SHA-256 of the canonical rule node. */
  readonly fingerprint: string;
  readonly keywords: readonly string[];
  readonly features: readonly string[];
  /** AST types created by actions of this rule that no rule is named after. */
  readonly actionTypes: readonly string[];
  /** Rules whose definition calls this one. */
  readonly callers: readonly string[];
}

interface Grammar {
  readonly parser: readonly ParserRule[];
  readonly terminals: ReadonlyArray<{ readonly name: string; readonly hidden: boolean }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Name of the target of a Langium cross-reference (`{ ref, $refText }`). */
function refName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const ref = value['ref'];
  return (isRecord(ref) ? str(ref['name']) : undefined) ?? str(value['$refText']);
}

function isReference(value: Record<string, unknown>): boolean {
  return 'ref' in value && !('$type' in value);
}

/** Child grammar nodes: own properties not starting with `$`, references excluded. */
function children(node: Record<string, unknown>): unknown[] {
  return Object.keys(node)
    .filter((k) => !k.startsWith('$'))
    .map((k) => node[k]);
}

/** The node as plain JSON with sorted keys and references replaced by their target's name. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  if (isReference(value)) return { $ref: refName(value) ?? null };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (key.startsWith('$') && key !== '$type') continue;
    if (value[key] === undefined) continue;
    out[key] = canonical(value[key]);
  }
  return out;
}

function readable(node: unknown): string {
  if (!isRecord(node)) return '?';
  const card = str(node['cardinality']) ?? '';
  const elements = Array.isArray(node['elements']) ? node['elements'] : [];
  switch (node['$type']) {
    case 'Keyword':
      return `'${str(node['value']) ?? ''}'${card}`;
    case 'RuleCall':
    case 'TerminalRuleCall':
      return `${refName(node['rule']) ?? '?'}${card}`;
    case 'CrossReference': {
      const terminal = node['terminal'] === undefined ? '' : `:${readable(node['terminal'])}`;
      return `[${refName(node['type']) ?? '?'}${terminal}]${card}`;
    }
    case 'Assignment':
      return `${str(node['feature']) ?? '?'}${str(node['operator']) ?? ''}${readable(node['terminal'])}${card}`;
    case 'Group':
      return `(${elements.map(readable).join(' ')})${card}`;
    case 'Alternatives':
      return `(${elements.map(readable).join(' | ')})${card}`;
    case 'UnorderedGroup':
      return `(${elements.map(readable).join(' & ')})${card}`;
    case 'Action': {
      const feature = str(node['feature']);
      return `{${actionType(node) ?? '?'}${feature === undefined ? '' : `.${feature}${str(node['operator']) ?? ''}current`}}`;
    }
    default:
      return `<${String(node['$type'])}>${card}`;
  }
}

function actionType(node: Record<string, unknown>): string | undefined {
  const inferred = node['inferredType'];
  return (isRecord(inferred) ? str(inferred['name']) : undefined) ?? refName(node['type']);
}

interface Facets {
  readonly keywords: Set<string>;
  readonly features: Set<string>;
  readonly actions: Set<string>;
  readonly calls: Set<string>;
}

function collectFacets(node: unknown, facets: Facets): void {
  if (Array.isArray(node)) {
    for (const child of node) collectFacets(child, facets);
    return;
  }
  if (!isRecord(node) || isReference(node)) return;
  const type = node['$type'];
  const value = str(node['value']);
  const feature = str(node['feature']);
  if (type === 'Keyword' && value !== undefined && !STRUCTURAL_KEYWORDS.has(value)) facets.keywords.add(value);
  if (type === 'Assignment' && feature !== undefined) facets.features.add(feature);
  if (type === 'Action') {
    const name = actionType(node);
    if (name !== undefined) facets.actions.add(name);
  }
  if (type === 'RuleCall') {
    const name = refName(node['rule']);
    if (name !== undefined) facets.calls.add(name);
  }
  for (const child of children(node)) collectFacets(child, facets);
}

function languageServerVersion(): string {
  return packageVersion(fileURLToPath(import.meta.resolve('@likec4/language-server/package.json')));
}

function packageVersion(path: string): string {
  const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(pkg) || typeof pkg['version'] !== 'string') {
    throw new Error(`${path}: no version field`);
  }
  return pkg['version'];
}

function loadGrammar(): Grammar {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts });
  const grammar: unknown = services.likec4.Grammar;
  if (!isRecord(grammar) || !Array.isArray(grammar['rules'])) {
    throw new Error('likec4.Grammar has no rules array');
  }
  const rules: unknown[] = grammar['rules'];
  const parserNodes: Array<Record<string, unknown> & { name: string }> = [];
  const terminals: Array<{ name: string; hidden: boolean }> = [];
  for (const rule of rules) {
    if (!isRecord(rule) || typeof rule['name'] !== 'string') {
      throw new Error('likec4.Grammar has a rule without a name');
    }
    const name = rule['name'];
    if (rule['$type'] === 'ParserRule') parserNodes.push({ ...rule, name });
    else if (rule['$type'] === 'TerminalRule') terminals.push({ name, hidden: rule['hidden'] === true });
    else throw new Error(`likec4.Grammar rule ${name} has unexpected type ${String(rule['$type'])}`);
  }

  const ruleNames = new Set(parserNodes.map((r) => r.name));
  const callers = new Map<string, Set<string>>();
  const collected = parserNodes.map((rule) => {
    const facets: Facets = { keywords: new Set(), features: new Set(), actions: new Set(), calls: new Set() };
    collectFacets(rule['definition'], facets);
    for (const callee of facets.calls) {
      const set = callers.get(callee) ?? new Set<string>();
      set.add(rule.name);
      callers.set(callee, set);
    }
    return { rule, facets };
  });

  const parser = collected.map(({ rule, facets }): ParserRule => {
    const sort: ParserRuleSort =
      rule['entry'] === true ? 'entry' : rule['fragment'] === true ? 'fragment' : rule['dataType'] !== undefined ? 'datatype' : 'rule';
    return {
      name: rule.name,
      sort,
      definition: readable(rule['definition']),
      fingerprint: createHash('sha256').update(JSON.stringify(canonical(rule))).digest('hex').slice(0, 12),
      keywords: [...facets.keywords],
      features: [...facets.features],
      actionTypes: [...facets.actions].filter((a) => !ruleNames.has(a)),
      callers: [...(callers.get(rule.name) ?? [])],
    };
  });
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
  /** Text after `›`; undefined for the main row of the rule. */
  readonly sub: string | undefined;
  readonly cells: readonly string[];
  readonly hash: string | undefined;
  /** Backtick spans of the label and the Notes cell. */
  readonly spans: readonly string[];
}

function backtickSpans(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
}

function documentRows(lines: readonly string[]): DocRow[] {
  const rows: DocRow[] = [];
  lines.forEach((line, i) => {
    if (!line.trimStart().startsWith('|')) return;
    const cells = tableCells(line);
    const label = ROW_LABEL.exec(cells[0] ?? '');
    if (label?.[1] === undefined) return;
    const notes = cells[NOTES_COLUMN] ?? '';
    const hash = HASH_COMMENT.exec(notes)?.[1];
    const cleanNotes = notes.replace(HASH_COMMENT, '');
    const cleanCells = cells.map((c, idx) => (idx === NOTES_COLUMN ? cleanNotes : c));
    rows.push({
      line: i + 1,
      rule: label[1],
      sub: label[2],
      cells: cleanCells,
      hash,
      spans: [...backtickSpans(cells[0] ?? ''), ...backtickSpans(cleanNotes)],
    });
  });
  return rows;
}

/** Whether `token` is named in one of `spans`: as a whole word if it is an identifier, else as a substring. */
function named(token: string, spans: readonly string[]): boolean {
  if (/^[A-Za-z0-9_]+$/.test(token)) {
    const word = new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`);
    return spans.some((s) => word.test(s));
  }
  return spans.some((s) => s.includes(token));
}

/**
 * Problems of the document against the grammar, empty when it matches:
 * - the title must name the installed LikeC4 version, and every
 *   `likec4-mutator X.Y.Z` must name the version in package.json;
 * - every parser rule has exactly one main row, every row names a rule of the
 *   grammar, no two rows have the same label;
 * - the main row carries the rule's current fingerprint (a changed rule body
 *   fails with "rule X changed"); sub-rows carry none;
 * - every keyword (brackets excepted), assigned feature and action-created AST
 *   type of a rule is named in backticks in the label or Notes of the rule's
 *   rows (identifiers as whole words, symbols as substrings), and every
 *   action-created AST type that has no rule of its own has a sub-row whose
 *   label names it, under each rule that creates it;
 * - a rule no other rule calls (not the entry rule) says `Unused` in Notes;
 * - status cells are yes / partial / text / no / n/a, and a row with any
 *   status other than `no` has notes.
 */
function check(lines: readonly string[], ownVersion: string, version: string, grammar: Grammar): string[] {
  const problems: string[] = [];

  const title = lines.find((l) => l.startsWith('# '));
  if (title === undefined || !title.includes(version)) {
    problems.push(`title does not name the installed LikeC4 ${version}: ${title ?? '(no "# " title)'}`);
  }
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/likec4-mutator (\d+\.\d+\.\d+)/g)) {
      if (m[1] !== ownVersion) problems.push(`line ${i + 1}: names likec4-mutator ${m[1]}, package.json has ${ownVersion}`);
    }
  });

  const byName = new Map(grammar.parser.map((r) => [r.name, r]));
  const rows = documentRows(lines);
  const rowsOf = new Map<string, DocRow[]>();
  const labels = new Map<string, number>();
  for (const row of rows) {
    const label = row.cells[0] ?? '';
    const first = labels.get(label);
    if (first !== undefined) problems.push(`line ${row.line}: row ${label} already exists at line ${first}`);
    else labels.set(label, row.line);

    const rule = byName.get(row.rule);
    if (rule === undefined) {
      problems.push(`line ${row.line}: rule ${row.rule} is not in the LikeC4 ${version} grammar`);
      continue;
    }
    rowsOf.set(row.rule, [...(rowsOf.get(row.rule) ?? []), row]);

    if (row.cells.length !== NOTES_COLUMN + 1) {
      problems.push(`line ${row.line}: ${label} has ${row.cells.length} cells, expected ${NOTES_COLUMN + 1}`);
      continue;
    }
    const statuses = STATUS_COLUMNS.map((c) => row.cells[c] ?? '');
    for (const status of statuses) {
      if (!STATUSES.has(status)) {
        problems.push(`line ${row.line}: ${label} has status "${status}", expected yes / partial / text / no / n/a`);
      }
    }
    if (statuses.some((s) => s !== 'no') && (row.cells[NOTES_COLUMN] ?? '') === '') {
      problems.push(`line ${row.line}: ${label} has a status other than "no" but no notes`);
    }
    if (row.sub !== undefined && row.hash !== undefined) {
      problems.push(`line ${row.line}: sub-row ${label} carries a grammar-hash; only the main row \`${row.rule}\` does`);
    }
  }

  for (const rule of grammar.parser) {
    const own = rowsOf.get(rule.name) ?? [];
    const main = own.find((r) => r.sub === undefined);
    if (main === undefined) {
      problems.push(
        `missing main row \`${rule.name}\` (${rule.sort}) — write its row(s), then run ` +
          `--update-fingerprints <doc> ${rule.name}. Definition: ${rule.definition}`,
      );
      continue;
    }
    if (main.hash !== rule.fingerprint) {
      problems.push(
        `rule ${rule.name} changed (row grammar-hash ${main.hash ?? 'missing'} is not the current fingerprint) — ` +
          `re-review its row(s) at line(s) ${own.map((r) => r.line).join(', ')}, then run ` +
          `--update-fingerprints <doc> ${rule.name}. Definition now: ${rule.definition}`,
      );
    }
    const spans = own.flatMap((r) => r.spans);
    for (const keyword of rule.keywords) {
      if (!named(keyword, spans)) problems.push(`rule ${rule.name}: keyword \`${keyword}\` is not named in its rows (label or Notes, in backticks)`);
    }
    for (const feature of rule.features) {
      if (!named(feature, spans)) problems.push(`rule ${rule.name}: assigned feature \`${feature}\` is not named in its rows (label or Notes, in backticks)`);
    }
    for (const type of rule.actionTypes) {
      const subLabels = own.filter((r) => r.sub !== undefined).flatMap((r) => backtickSpans(r.sub ?? ''));
      if (!subLabels.includes(type)) problems.push(`rule ${rule.name}: AST type ${type} (created by an action) has no sub-row \`${rule.name}\` › \`${type}\``);
    }
    if (rule.sort !== 'entry' && rule.callers.length === 0 && !/\bUnused\b/.test(main.cells[NOTES_COLUMN] ?? '')) {
      problems.push(`rule ${rule.name}: no rule calls it, but its row does not say "Unused"`);
    }
  }
  return problems;
}

/** Writes the current fingerprint into the main row of each named rule. */
function updateFingerprints(lines: string[], names: readonly string[], grammar: Grammar): string[] {
  const problems: string[] = [];
  const rows = documentRows(lines);
  for (const name of names) {
    const rule = grammar.parser.find((r) => r.name === name);
    const main = rows.find((r) => r.rule === name && r.sub === undefined);
    if (rule === undefined) {
      problems.push(`${name}: not a parser rule of the installed grammar`);
    } else if (main === undefined) {
      problems.push(`${name}: the document has no main row \`${name}\`; write it first`);
    } else if (main.hash === rule.fingerprint) {
      problems.push(`${name}: fingerprint is already current; nothing to mark as reviewed`);
    } else {
      const old = lines[main.line - 1] ?? '';
      const comment = `<!-- grammar-hash: ${rule.fingerprint} -->`;
      lines[main.line - 1] = HASH_COMMENT.test(old)
        ? old.replace(HASH_COMMENT, ` ${comment}`)
        : old.replace(/\s*\|\s*$/, ` ${comment} |`);
    }
  }
  return problems;
}

const USAGE =
  'usage: grammar-rules.ts [--check <coverage.md> | --update-fingerprints <coverage.md> <Rule>...]';

function main(argv: readonly string[]): number {
  const version = languageServerVersion();
  const grammar = loadGrammar();
  const [mode, docPath, ...names] = argv;

  if (mode === '--check' && docPath !== undefined && names.length === 0) {
    const ownVersion = packageVersion(fileURLToPath(new URL('../package.json', import.meta.url)));
    const lines = readFileSync(docPath, 'utf8').split('\n');
    const problems = check(lines, ownVersion, version, grammar);
    if (problems.length > 0) {
      console.error(`${docPath}: ${problems.length} problem(s) against LikeC4 ${version}:`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    const rows = documentRows(lines);
    const subRows = rows.filter((r) => r.sub !== undefined).length;
    console.log(
      `${docPath}: all ${grammar.parser.length} parser rules of LikeC4 ${version} have a current main row ` +
        `(${rows.length} rows, ${subRows} sub-rows); every keyword, assigned feature and action type is named`,
    );
    return 0;
  }
  if (mode === '--update-fingerprints' && docPath !== undefined) {
    if (names.length === 0) {
      console.error('name the rules whose rows you have reviewed; no fingerprint is refreshed without its rule name');
      return 2;
    }
    const lines = readFileSync(docPath, 'utf8').split('\n');
    const problems = updateFingerprints(lines, names, grammar);
    if (problems.length > 0) {
      console.error(`${docPath}: nothing written:`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    writeFileSync(docPath, lines.join('\n'));
    console.log(`${docPath}: refreshed the fingerprint of ${names.join(', ')}`);
    return 0;
  }
  if (argv.length > 0) {
    console.error(USAGE);
    return 2;
  }

  console.log(`LikeC4 grammar from @likec4/language-server ${version}`);
  console.log(`\nParser rules (${grammar.parser.length}):`);
  for (const r of grammar.parser) {
    console.log(`\n  ${r.name} (${r.sort}${r.callers.length === 0 && r.sort !== 'entry' ? ', unused' : ''}) grammar-hash ${r.fingerprint}`);
    console.log(`    ${r.definition}`);
    if (r.keywords.length > 0) console.log(`    keywords: ${r.keywords.join(' ')}`);
    if (r.features.length > 0) console.log(`    features: ${r.features.join(' ')}`);
    if (r.actionTypes.length > 0) console.log(`    action types: ${r.actionTypes.join(' ')}`);
  }
  console.log(`\nTerminal rules (${grammar.terminals.length}, not tracked in the coverage document):`);
  for (const t of grammar.terminals) console.log(t.hidden ? `  ${t.name} (hidden)` : `  ${t.name}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
