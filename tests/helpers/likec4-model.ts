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

/** Element data of the computed LikeC4 model, as far as the tests read it. */
export interface LikeC4ModelElement {
  tags?: readonly string[] | null;
  links?: ReadonlyArray<{ url: string; title?: string }> | null;
  metadata?: Record<string, string | string[]>;
}

/** Relation data of the computed LikeC4 model, as far as the tests read it. */
export interface LikeC4ModelRelation extends LikeC4ModelElement {
  source: { model: string };
  target: { model: string };
  title?: string;
  kind?: string;
  isBidirectional?: boolean;
}

/** Result of {@link buildLikeC4Model}. */
export interface LikeC4ModelResult {
  /** `<file>:<line>: <message>` for every diagnostic LikeC4 reported. */
  diagnostics: string[];
  /** Computed elements by FQN. */
  elements: Record<string, LikeC4ModelElement>;
  /** Computed relations, in the order of the model. */
  relations: LikeC4ModelRelation[];
}

const WORKSPACE = 'file:///test/workspace';

/**
 * Build the LikeC4 model of `files` (file name → source).  File names are
 * resolved below one workspace folder, so they order exactly as LikeC4 orders
 * documents of a project.
 */
export async function buildLikeC4Model(files: Record<string, string>): Promise<LikeC4ModelResult> {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
  const folder = { name: 'test', uri: WORKSPACE };
  services.shared.workspace.WorkspaceManager.initialize({
    capabilities: {},
    processId: null,
    rootUri: folder.uri,
    workspaceFolders: [folder],
  });
  await services.shared.workspace.WorkspaceManager.initializeWorkspace([folder]);

  const documents = Object.entries(files).map(([name, text]) => {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
      text,
      URI.parse(`${WORKSPACE}/src/${name}`),
    );
    services.shared.workspace.LangiumDocuments.addDocument(document);
    return document;
  });
  await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });

  const diagnostics = documents.flatMap((d) =>
    (d.diagnostics ?? []).map(
      (x) => `${d.uri.path.slice(`/test/workspace/src/`.length)}:${x.range.start.line + 1}: ${x.message}`,
    ),
  );
  const model = await services.likec4.ModelBuilder.computeModel();
  const elements = (model?.$data?.elements ?? {}) as unknown as Record<string, LikeC4ModelElement>;
  const relations = Object.values(model?.$data?.relations ?? {}) as unknown as LikeC4ModelRelation[];
  return { diagnostics, elements, relations };
}

/** Effective values of an element as the library reports them. */
export interface EffectiveValues {
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  metadata?: Record<string, string | string[]>;
}

/**
 * Assert that `actual` — the library's effective tags, links and metadata of
 * `fqn` — equal what LikeC4 computes for `files`, which must build without
 * diagnostics.  Only the API shape is mapped: LikeC4's link `title` is the
 * library's `label`, LikeC4's `null` is an absent value.
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
 * Assert that `actual` — the library's effective tags, links and metadata of
 * one relationship — equal `expected`, a relation (or element) of the LikeC4
 * model, with the API shape mapped as for {@link expectAgreesWithLikeC4}.
 */
export function expectSameValues(actual: EffectiveValues, expected: LikeC4ModelElement): void {
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
 * Assert that the library reports the same relationships — endpoints, kind
 * and effective tags, links and metadata — as LikeC4 computes for `files`,
 * which must build without diagnostics.  Relationships are compared as a
 * multiset (the two sides list them in different orders); metadata key order
 * counts.  Titles are not compared: LikeC4 substitutes the title of a
 * relationship kind's specification, the library reports titles as written.
 */
export async function expectRelationshipsAgreeWithLikeC4(
  files: Record<string, string>,
  actual: ReportedRelationship[],
): Promise<void> {
  const reference = await buildLikeC4Model(files);
  expect(reference.diagnostics).toEqual([]);
  const canonical = (r: {
    source: string;
    target: string;
    kind?: string;
    tags?: readonly string[] | null;
    links?: ReadonlyArray<{ url: string; label?: string }> | null;
    metadata?: Record<string, string | string[]>;
  }): string =>
    JSON.stringify([r.source, r.target, r.kind ?? null, r.tags ?? null, r.links ?? null, r.metadata ?? null]);
  const expected = reference.relations.map((r) =>
    canonical({
      source: r.source.model,
      target: r.target.model,
      kind: r.kind,
      tags: r.tags,
      links: r.links?.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, label: l.title })),
      metadata: r.metadata,
    }),
  );
  const reported = actual.map((r) => canonical({ ...r, source: r.sourceFqn, target: r.targetFqn }));
  expect(reported.sort()).toEqual(expected.sort());
}
