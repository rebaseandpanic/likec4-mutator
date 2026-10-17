/**
 * The reference catalogue (`buildReferenceCatalogue`) against LikeC4's own
 * linker (rows 2–4 of lc4m-15.30): every FR-001 role is present, the
 * catalogue equals `linkedCatalogueReferences` one to one on
 * (file, offset, role, text, target, unmodelled), resolved and unresolved,
 * and text the parser could not recover stays outside both.
 *
 * FX are the reference fixtures `refs-catalog`, `refs-flows` and
 * `refs-import` (D116, D118); each gets an unresolved copy in which a few
 * declarations are renamed, so references into them stop resolving.  The
 * expected side is LikeC4 only: the linked AST walked by the oracle, its
 * lexer and parse tree for the unrecovered tokens.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { compareNaturalHierarchically } from '@likec4/core/utils';
import { CstUtils } from 'langium';
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { DeploymentIndex } from '../../src/query/deployment-index.js';
import { buildReferenceCatalogue, type CatalogueEntry } from '../../src/query/reference-catalogue.js';
import { ViewIndex } from '../../src/query/view-index.js';
import { WorkspaceIndex } from '../../src/query/workspace-index.js';
import {
  expectValidLikeC4,
  linkedCatalogueReferences,
  linkedKindReferences,
  linkedReferences,
  linkedViewReferences,
  validateLikeC4,
  type LinkedCatalogueReference,
} from '../helpers/likec4-model.js';

/** The FR-001 role enum of lc4m-15.30 (`unrecovered` is not a catalogue role, D113). */
const ROLES = [
  'relationship-endpoint',
  'extend-element-target',
  'extend-relationship-endpoint',
  'deployment-relationship-endpoint',
  'extend-node-target',
  'instance-of',
  'view-of',
  'view-extends',
  'predicate-item',
  'navigate-to',
  'step-endpoint',
  'style-target',
  'rank-target',
  'opaque-flow',
  'global-or-import',
] as const;

/** A workspace: its files in load order, and the folders LikeC4 registers as projects. */
interface Workspace {
  name: string;
  files: Record<string, string>;
  projects?: readonly string[];
}

/** The files of a fixture, keyed by `/`-separated path, loaded in byte order of the paths. */
function readFixture(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const paths: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else paths.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return Object.fromEntries(paths.sort().map((path) => [path, readFileSync(join(root, ...path.split('/')), 'utf8')]));
}

/** `files` with `from` replaced by `to` in `file`; `from` must occur there exactly once. */
function edited(files: Record<string, string>, file: string, from: string, to: string): Record<string, string> {
  const source = files[file];
  expect(source?.split(from).length, `'${from}' once in ${file}`).toBe(2);
  return { ...files, [file]: source!.replace(from, to) };
}

const FX: Workspace[] = [
  { name: 'refs-catalog', files: readFixture('refs-catalog') },
  { name: 'refs-flows', files: readFixture('refs-flows') },
  { name: 'refs-import', files: readFixture('refs-import'), projects: ['main', 'other'] },
];
const [CATALOG, FLOWS, IMPORT] = FX as [Workspace, Workspace, Workspace];

/** Copies of FX in which an element, a deployment node or a view and the references into them stop resolving. */
const UNRESOLVED: Workspace[] = [
  {
    name: 'refs-catalog, unresolved',
    files: [
      ['model9.c4', "api = service 'API' {", "apiGone = service 'API' {"],
      ['views.c4', 'view shopView of shop', 'view shopGone of shop'],
      ['deployment.c4', 'host secondary', 'host gone'],
    ].reduce((files, [file, from, to]) => edited(files, file!, from!, to!), CATALOG.files),
  },
  {
    name: 'refs-flows, unresolved',
    files: [
      ['model.c4', "worker = component 'Worker'", "workerGone = component 'Worker'"],
      ['views2.c4', 'dynamic view checkout', 'dynamic view checkoutGone'],
      ['deployment.c4', 'pod back', 'pod gone'],
    ].reduce((files, [file, from, to]) => edited(files, file!, from!, to!), FLOWS.files),
  },
  {
    name: 'refs-import, unresolved',
    files: edited(IMPORT.files, 'other/model.c4', "peer = unit 'Peer'", "peerGone = unit 'Peer'"),
    projects: IMPORT.projects,
  },
];

const oracle = (workspace: Workspace): Promise<LinkedCatalogueReference[]> =>
  linkedCatalogueReferences(workspace.files, workspace.projects ? { projects: workspace.projects } : {});

/** The library's catalogue of `files`, parsed standalone. */
function catalogue(files: Record<string, string>): readonly CatalogueEntry[] {
  const documents = Object.entries(files).map(([file, source]) => ({ file, ast: new C4Parser().parse(source).ast }));
  return buildReferenceCatalogue(new WorkspaceIndex(documents), new DeploymentIndex(documents), new ViewIndex(documents)).entries();
}

/** The compared tuple of a reference, `null` for an unresolved target. */
function tuple(reference: Pick<LinkedCatalogueReference, 'file' | 'offset' | 'role' | 'text' | 'unmodelled'> & { target?: unknown }): string {
  return JSON.stringify([reference.file, reference.offset, reference.role, reference.text, reference.target ?? null, reference.unmodelled]);
}

/** The 1-based lines of the block opened on the line holding `marker`, through its closing brace. */
function blockLines(source: string, marker: string): Set<number> {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(marker));
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const indent = lines[start]!.length - lines[start]!.trimStart().length;
  let end = start + 1;
  while (end < lines.length && !lines[end]!.startsWith(`${' '.repeat(indent)}}`)) end++;
  return new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i + 1));
}

/** The oracle's references of `file` on `lines`; there must be some. */
function referencesIn(references: LinkedCatalogueReference[], file: string, lines: Set<number>): LinkedCatalogueReference[] {
  const found = references.filter((r) => r.file === file && lines.has(r.line));
  expect(found.length, `${file}:${[...lines][0]}`).toBeGreaterThan(0);
  return found;
}

describe('catalogue role coverage (row 2)', () => {
  it('finds every FR-001 role in LikeC4 on FX and their unresolved copies, then in the catalogue', async () => {
    // P: the fixtures are valid, generic, mixed in line endings, and loaded out of document order.
    for (const workspace of FX) {
      expect(Object.keys(workspace.files).length, workspace.name).toBeGreaterThan(0);
      await expectValidLikeC4(workspace.files, workspace.projects ? { projects: workspace.projects } : {});
      expect(Object.values(workspace.files).some((source) => source.includes('\r\n')), `${workspace.name} has a CRLF file`).toBe(true);
      const loadOrder = Object.keys(workspace.files);
      expect([...loadOrder].sort(compareNaturalHierarchically('/')), `${workspace.name} document order`).not.toEqual(loadOrder);
    }
    const names = async (workspace: Workspace): Promise<Set<string>> =>
      new Set((await linkedKindReferences(workspace.files)).flatMap((r) => (r.target === null ? [] : [`${r.kindType === 'tag' ? 'tag' : 'kind'}:${r.target}`])));
    const [catalogNames, flowsNames] = [await names(CATALOG), await names(FLOWS)];
    expect(catalogNames.size).toBeGreaterThan(0);
    expect(flowsNames.size).toBeGreaterThan(0);
    expect([...catalogNames].filter((name) => flowsNames.has(name)), 'kind and tag names shared by the two specifications').toEqual([]);

    const fxOracle = (await Promise.all(FX.map(oracle))).flat();
    const copiesOracle = (await Promise.all(UNRESOLVED.map(oracle))).flat();
    expect(ROLES.filter((role) => !fxOracle.some((r) => r.role === role)), 'roles missing in LikeC4 on FX').toEqual([]);
    expect(ROLES.filter((role) => !copiesOracle.some((r) => r.role === role)), 'roles missing in LikeC4 on the copies').toEqual([]);
    const extendTargets = copiesOracle.filter((r) => r.role === 'extend-element-target');
    expect(extendTargets.some((r) => r.target !== null), 'a resolved extend target').toBe(true);
    expect(extendTargets.some((r) => r.target === null), 'an unresolved extend target').toBe(true);

    const fxCatalogue = FX.flatMap((workspace) => catalogue(workspace.files));
    const copiesCatalogue = UNRESOLVED.flatMap((workspace) => catalogue(workspace.files));
    expect(ROLES.filter((role) => !fxCatalogue.some((e) => e.role === role)), 'roles missing in the catalogue on FX').toEqual([]);
    expect(ROLES.filter((role) => !copiesCatalogue.some((e) => e.role === role)), 'roles missing in the catalogue on the copies').toEqual([]);
  });
});

describe('catalogue equals the linker (row 3)', () => {
  it('checks the oracle facts the equality relies on', async () => {
    // P: an unresolved reference is null.
    const copy = await oracle(UNRESOLVED[0]!);
    expect(copy.find((r) => r.file === 'model10.c4' && r.role === 'extend-element-target' && r.text === 'shop.api')?.target).toBeNull();

    // P: `par` / `parallel` are modelled; `opt`, `alt`, `try`, a stray `when`, `global` and an import are not.
    const flows = await oracle(FLOWS);
    const views = FLOWS.files['views2.c4']!;
    for (const marker of ['par {', "parallel 'Fan-out' {"]) {
      expect(referencesIn(flows, 'views2.c4', blockLines(views, marker)).map((r) => r.unmodelled), marker).not.toContain(true);
    }
    for (const marker of ["opt 'Maybe' {", "alt 'Outcome' {", 'try {']) {
      expect(referencesIn(flows, 'views2.c4', blockLines(views, marker)).map((r) => r.unmodelled), marker).not.toContain(false);
    }
    const global = referencesIn(flows, 'specification.c4', blockLines(FLOWS.files['specification.c4']!, 'global {'));
    expect(global.map((r) => r.unmodelled)).not.toContain(false);
    const stray = { name: 'refs-flows, stray when', files: edited(FLOWS.files, 'views2.c4', "    break 'Stop' {", "    when 'stray' {\n      client -> platform.api\n    }\n    break 'Stop' {") };
    expect(await validateLikeC4(stray.files)).not.toEqual([]);
    const strayWhen = referencesIn(await oracle(stray), 'views2.c4', blockLines(stray.files['views2.c4']!, "when 'stray' {"));
    expect(strayWhen.map((r) => r.unmodelled)).not.toContain(false);
    const imports = (await oracle(IMPORT)).filter((r) => IMPORT.files[r.file]!.split(/\r?\n/)[r.line - 1]!.startsWith('import'));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.map((r) => r.unmodelled)).not.toContain(false);

    // P: on the roles they share, the oracle agrees with the legacy helpers; by design a step or
    // `navigateTo` in an opaque block is `opaque-flow`, and a `navigateTo` in a `global` block `global-or-import`.
    for (const workspace of [CATALOG, FLOWS]) {
      const references = await oracle(workspace);
      const legacy = (await linkedReferences(workspace.files)).map((r) => ({ ...r, group: r.role as string }));
      expect(
        unmatched(legacy, references, { instanceOf: ['instance-of'], extend: ['extend-node-target'], deploymentView: ['predicate-item', 'style-target'] }, [
          'instance-of',
          'extend-node-target',
        ]),
        `${workspace.name}: linkedReferences`,
      ).toEqual({ legacyOnly: [], oracleOnly: [] });
      const navigate = ['navigate-to', 'opaque-flow', 'global-or-import'];
      const viewLegacy = (await linkedViewReferences(workspace.files)).map((r) => ({ ...r, group: r.role as string }));
      expect(
        unmatched(
          viewLegacy,
          references,
          {
            of: ['view-of'],
            extends: ['view-extends'],
            rule: ['predicate-item', 'style-target', 'rank-target'],
            step: ['step-endpoint', 'opaque-flow'],
            elementWithNavigateTo: navigate,
            relationWithNavigateTo: navigate,
            stepNavigateTo: navigate,
            relationshipNavigateTo: navigate,
            deploymentRelationshipNavigateTo: navigate,
          },
          ['view-of', 'view-extends', 'predicate-item', 'rank-target', 'step-endpoint', 'navigate-to', 'opaque-flow'],
        ),
        `${workspace.name}: linkedViewReferences`,
      ).toEqual({ legacyOnly: [], oracleOnly: [] });
    }
  });

  it.each([...FX, ...UNRESOLVED].map((workspace) => [workspace.name, workspace] as const))(
    'equals the oracle one to one on %s',
    async (_, workspace) => {
      const expected = (await oracle(workspace)).map(tuple).sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(catalogue(workspace.files).map(tuple).sort()).toEqual(expected);
    },
  );
});

describe('unrecovered text stays outside the equality (row 4)', () => {
  const BROKEN = 'model {\n  a -> -> zork.zap\n}\n';

  it.each([CATALOG, FLOWS].map((workspace) => [workspace.name, workspace] as const))(
    'reports no entry for the unrecovered tokens of a broken file added to %s',
    async (_, workspace) => {
      // P: LikeC4's parser fails on the file and its parse tree covers neither identifier.
      const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
      const parsed = services.parser.LangiumParser.parse(BROKEN);
      expect(parsed.parserErrors.length).toBeGreaterThan(0);
      const leaves = [...CstUtils.streamCst(parsed.value.$cstNode!)].filter((node) => !('content' in node));
      const identifiers = services.parser.Lexer.tokenize(BROKEN).tokens.filter((t) => t.image === 'zork' || t.image === 'zap');
      expect(identifiers.map((t) => t.image)).toEqual(['zork', 'zap']);
      for (const token of identifiers) {
        expect(leaves.some((leaf) => leaf.offset <= token.startOffset && token.startOffset < leaf.end), token.image).toBe(false);
      }

      const files = { ...workspace.files, 'broken.c4': BROKEN };
      const references = await oracle({ name: workspace.name, files });
      const entries = catalogue(files);
      const covers = (r: { file: string; offset: number; text: string }): boolean =>
        r.file === 'broken.c4' && identifiers.some((t) => r.offset <= t.startOffset && t.startOffset < r.offset + r.text.length);
      expect(references.filter(covers), 'oracle entries on unrecovered tokens').toEqual([]);
      expect(entries.filter(covers).map(tuple), 'catalogue entries on unrecovered tokens').toEqual([]);
      const others = (list: Array<Parameters<typeof tuple>[0] & { file: string }>): string[] =>
        list.filter((r) => r.file !== 'broken.c4').map(tuple).sort();
      expect(others(references).length).toBeGreaterThan(0);
      expect(others([...entries])).toEqual(others(references));
    },
  );
});

/**
 * Match legacy references with oracle references one to one on file, line,
 * text and target, an oracle role being allowed for each legacy role.
 * Returns the legacy references left without a partner, and the oracle
 * references of `complete` roles (those the legacy helper covers entirely)
 * left without one.
 */
function unmatched(
  legacy: Array<{ at: string; group: string; text: string; target: unknown }>,
  references: LinkedCatalogueReference[],
  allowed: Record<string, readonly string[]>,
  complete: readonly string[],
): { legacyOnly: string[]; oracleOnly: string[] } {
  const key = (at: string, text: string, target: unknown): string => JSON.stringify([at, text, target]);
  const pool = references.map((r) => ({ reference: r, key: key(`${r.file}:${r.line}`, r.text, r.target), used: false }));
  const legacyOnly: string[] = [];
  for (const item of legacy) {
    const roles = allowed[item.group] ?? [];
    const partner = pool.find((p) => !p.used && p.key === key(item.at, item.text, item.target) && roles.includes(p.reference.role));
    if (partner) partner.used = true;
    else legacyOnly.push(`${item.at} ${item.group} ${item.text}`);
  }
  const oracleOnly = pool
    .filter((p) => !p.used && complete.includes(p.reference.role))
    .map((p) => `${p.reference.file}:${p.reference.line} ${p.reference.role} ${p.reference.text}`);
  return { legacyOnly, oracleOnly };
}
