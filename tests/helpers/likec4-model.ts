/**
 * Independent reference for tests: builds the LikeC4 model of a set of
 * in-memory `.c4` files with LikeC4's own language services (linking,
 * validation and `ModelBuilder`), the way the language server does for a
 * workspace.  Used to compare what the library reports against what LikeC4
 * computes from the same sources.
 */
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { URI } from 'langium';
import { expect } from 'vitest';

/** A string value of the LikeC4 model: plain, or `{ md }` / `{ txt }` for Markdown-or-string properties. */
export type LikeC4ModelString = string | { md?: string; txt?: string };

/** The plain text of a LikeC4 model string value. */
export function plainText(value: LikeC4ModelString | undefined): string | undefined {
  return typeof value === 'object' ? (value.md ?? value.txt) : value;
}

/** Element data of the computed LikeC4 model, as far as the tests read it. */
export interface LikeC4ModelElement {
  title?: string;
  summary?: LikeC4ModelString;
  description?: LikeC4ModelString;
  technology?: string;
  tags?: readonly string[] | null;
  links?: ReadonlyArray<{ url: string; title?: string }> | null;
  metadata?: Record<string, string | string[]>;
}

/** Relation data of the computed LikeC4 model, as far as the tests read it. */
export interface LikeC4ModelRelation extends LikeC4ModelElement {
  source: { model: string };
  target: { model: string };
  kind?: string;
  isBidirectional?: boolean;
}

/** Result of {@link buildLikeC4Model}. */
export interface LikeC4ModelResult {
  /** `<file>:<line>: <message>` for every diagnostic LikeC4 reported. */
  diagnostics: string[];
  /** The same for diagnostics of severity error only. */
  errors: string[];
  /** Computed elements by FQN. */
  elements: Record<string, LikeC4ModelElement>;
  /** Computed relations, in the order of the model. */
  relations: LikeC4ModelRelation[];
  /** Computed views by id: the title LikeC4 shows and the folder path the title puts the view in (`''` for none). */
  views: Record<string, { title: string | null; folder: string }>;
}

/** Project configuration for {@link buildLikeC4Model}, as in `likec4.config.json`. */
export interface LikeC4ProjectOptions {
  /** LikeC4's `implicitViews` setting: generate a view for every element without one. */
  implicitViews?: boolean;
}

/** Project name used when {@link LikeC4ProjectOptions} are given. */
const PROJECT = 'test';

const WORKSPACE = 'file:///test/workspace';
const SOURCES = '/test/workspace/src/';

/** LikeC4 language services with `files` loaded and built, validation included. */
async function buildWorkspace(files: Record<string, string>, project?: LikeC4ProjectOptions) {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
  const folder = { name: 'test', uri: WORKSPACE };
  services.shared.workspace.WorkspaceManager.initialize({
    capabilities: {},
    processId: null,
    rootUri: folder.uri,
    workspaceFolders: [folder],
  });
  await services.shared.workspace.WorkspaceManager.initializeWorkspace([folder]);
  if (project) {
    await services.shared.workspace.ProjectsManager.registerProject({
      config: { name: PROJECT, ...project },
      folderUri: URI.parse(WORKSPACE),
    });
  }

  const documents = Object.entries(files).map(([name, text]) => {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
      text,
      URI.parse(`${WORKSPACE}/src/${name}`),
    );
    services.shared.workspace.LangiumDocuments.addDocument(document);
    return document;
  });
  await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
  return { services, documents };
}

/**
 * Build the LikeC4 model of `files` (file name → source).  File names are
 * resolved below one workspace folder, so they order exactly as LikeC4 orders
 * documents of a project.  With `project`, the folder is registered as a
 * project with that configuration (as a `likec4.config.json` would);
 * without it, the files form LikeC4's default project.
 */
export async function buildLikeC4Model(
  files: Record<string, string>,
  project?: LikeC4ProjectOptions,
): Promise<LikeC4ModelResult> {
  const { services, documents } = await buildWorkspace(files, project);
  const format = (onlyErrors: boolean): string[] =>
    documents.flatMap((d) =>
      (d.diagnostics ?? [])
        .filter((x) => !onlyErrors || x.severity === 1)
        .map((x) => `${d.uri.path.slice(SOURCES.length)}:${x.range.start.line + 1}: ${x.message}`),
    );
  const diagnostics = format(false);
  const errors = format(true);
  const model = project
    ? await services.likec4.ModelBuilder.computeModel(PROJECT as Parameters<typeof services.likec4.ModelBuilder.computeModel>[0])
    : await services.likec4.ModelBuilder.computeModel();
  const elements = (model?.$data?.elements ?? {}) as unknown as Record<string, LikeC4ModelElement>;
  const relations = Object.values(model?.$data?.relations ?? {}) as unknown as LikeC4ModelRelation[];
  const views: LikeC4ModelResult['views'] = {};
  for (const view of model?.views() ?? []) views[view.id] = { title: view.title, folder: view.folder.path };
  return { diagnostics, errors, elements, relations, views };
}

/**
 * What `likec4 validate` of LikeC4 1.59.4 reports for `files`, in process:
 * an empty array means the command would exit with 0.
 *
 * The command (`validate` in `likec4/dist/cli/index.mjs`) loads the
 * workspace, builds every document with validation, and fails on
 * - every diagnostic of severity error in a source file
 *   (`LikeC4.getErrors()`); warnings, hints and infos never fail it;
 * - unless `--no-layout` is given: an exception while laying out the views
 *   (`Layout validation failed: ...`) and a view whose manual layout drifted
 *   from the model (`Layout drift detected on view '...'`).  A view that
 *   graphviz fails to lay out is only logged, not reported.
 *
 * Both are done here the same way, with the same language services: errors
 * from `LanguageServices.getErrors()`, layout from
 * `LanguageServices.diagrams()`, which resolves the project with
 * `ensureProjectId` and then calls `Views.diagrams(projectId)` — the path the
 * command takes through `LikeC4.diagrams(project)` without `--project`.
 * Errors are `<file>:<line>: <message>` (1-based line, as in
 * {@link LikeC4ModelResult.errors}).
 *
 * Limits.  The sources are one in-memory workspace folder, so there is one
 * project and no project configuration (`likec4.config.json`, its `include` /
 * `exclude`, multi-project `import`); `--project` and `--file` are not
 * implemented.  The two layout branches are not exercised by any test: the
 * language services are built with `NoLikeC4ManualLayouts`, so a drift cannot
 * occur, and no fixture is known that makes `diagrams()` throw (a view that
 * fails to lay out, e.g. a sequence view with nested actors, is only logged by
 * both the command and this function).
 */
export async function validateLikeC4(files: Record<string, string>): Promise<string[]> {
  const { services } = await buildWorkspace(files);
  const errors = services.likec4.LanguageServices.getErrors().map(
    (e) => `${e.sourceFsPath.slice(SOURCES.length)}:${e.line + 1}: ${e.message}`,
  );
  const layout: string[] = [];
  try {
    for (const view of await services.likec4.LanguageServices.diagrams()) {
      if (view.drifts && view.drifts.length > 0) layout.push(`Layout drift detected on view '${view.id}'`);
    }
  } catch (e) {
    layout.push(`Layout validation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return [...errors, ...layout];
}

/** Assert that `files` pass `likec4 validate` of LikeC4 1.59.4 — see {@link validateLikeC4}. */
export async function expectValidLikeC4(files: Record<string, string>): Promise<void> {
  expect(await validateLikeC4(files)).toEqual([]);
}

/** Effective values of an element as the library reports them. */
export interface EffectiveValues {
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  metadata?: Record<string, string | string[]>;
}

/**
 * Assert that `actual` — the library's effective title, summary,
 * description, technology, tags, links and metadata of `fqn` — equal what
 * LikeC4 computes for `files`, which must build without diagnostics.  Only
 * the API shape is mapped: LikeC4's link `title` is the library's `label`,
 * LikeC4's `null` is an absent value, a `{ md }` / `{ txt }` value is its
 * text.
 */
export async function expectAgreesWithLikeC4(
  files: Record<string, string>,
  fqn: string,
  actual: EffectiveValues,
): Promise<void> {
  const reference = await buildLikeC4Model(files);
  expect(reference.diagnostics).toEqual([]);
  const expected = reference.elements[fqn];
  expect(expected).toBeDefined();
  expectSameValues(actual, expected!);
}

/**
 * Assert that `actual` — the library's effective values of one element —
 * equal `expected`, an element of the LikeC4 model, with the API shape
 * mapped as for {@link expectAgreesWithLikeC4}.
 */
export function expectSameValues(actual: EffectiveValues, expected: LikeC4ModelElement): void {
  expect(actual.title).toBe(expected.title);
  expect(actual.summary).toBe(plainText(expected.summary));
  expect(actual.description).toBe(plainText(expected.description));
  expect(actual.technology).toBe(expected.technology);
  expect(actual.tags).toEqual(expected.tags ?? undefined);
  expect(actual.links).toEqual(
    expected.links?.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, label: l.title })) ??
      undefined,
  );
  expect(actual.metadata).toEqual(expected.metadata);
  if (expected.metadata) expect(Object.keys(actual.metadata!)).toEqual(Object.keys(expected.metadata));
}

/** A relationship as the library reports it, as far as the comparison reads it. */
export interface ReportedRelationship extends EffectiveValues {
  sourceFqn: string;
  targetFqn: string;
  kind?: string;
}

/**
 * Assert that the library reports the same relationships — endpoints, kind,
 * effective title, description, technology, tags, links and metadata — as
 * LikeC4 computes for `files`,
 * which must build without errors.  Warnings are allowed: LikeC4's validator
 * warns about an `extend a -> b` block whose relationship takes its title from
 * the kind's specification, although the model builder applies it.  Relationships are compared as a
 * multiset (the two sides list them in different orders); metadata key order
 * counts.  A relationship without a title has the title '' in LikeC4's
 * model and none in the library's: both compare as ''.
 */
export async function expectRelationshipsAgreeWithLikeC4(
  files: Record<string, string>,
  actual: ReportedRelationship[],
): Promise<void> {
  const reference = await buildLikeC4Model(files);
  expect(reference.errors).toEqual([]);
  const canonical = (r: {
    source: string;
    target: string;
    kind?: string;
    title?: string;
    description?: string;
    technology?: string;
    tags?: readonly string[] | null;
    links?: ReadonlyArray<{ url: string; label?: string }> | null;
    metadata?: Record<string, string | string[]>;
  }): string =>
    JSON.stringify([
      r.source,
      r.target,
      r.kind ?? null,
      r.title ?? '',
      r.description ?? null,
      r.technology ?? null,
      r.tags ?? null,
      r.links ?? null,
      r.metadata ?? null,
    ]);
  const expected = reference.relations.map((r) =>
    canonical({
      source: r.source.model,
      target: r.target.model,
      kind: r.kind,
      title: r.title,
      description: plainText(r.description),
      technology: r.technology,
      tags: r.tags,
      links: r.links?.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, label: l.title })),
      metadata: r.metadata,
    }),
  );
  const reported = actual.map((r) => canonical({ ...r, source: r.sourceFqn, target: r.targetFqn }));
  expect(reported.sort()).toEqual(expected.sort());
}
