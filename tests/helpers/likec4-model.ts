/**
 * Independent reference for tests: builds the LikeC4 model of a set of
 * in-memory `.c4` files with LikeC4's own language services (linking,
 * validation and `ModelBuilder`), the way the language server does for a
 * workspace.  Used to compare what the library reports against what LikeC4
 * computes from the same sources.
 */
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { AstUtils, URI, type AstNode, type LangiumDocument } from 'langium';
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

/** Style data of the computed LikeC4 model (`style` of an element, node or kind): opacity is a number there. */
export type LikeC4ModelStyle = Record<string, string | number | boolean | undefined>;

/**
 * A deployment node or instance of the computed LikeC4 model
 * (`$data.deployments.elements`), as far as the tests read it.  Nodes carry
 * `kind`; instances carry `element`, the FQN of the element they deploy, and
 * only their own values (inheritance from the element is a getter rule).
 */
export interface LikeC4DeploymentElement extends LikeC4ModelElement {
  id: string;
  kind?: string;
  element?: string;
  style?: LikeC4ModelStyle;
}

/** An endpoint of a computed deployment relation: the deployment id, plus the element FQN when it steps into an instance's element. */
export interface LikeC4DeploymentEndpoint {
  deployment: string;
  element?: string;
}

/** A deployment relation of the computed LikeC4 model (`$data.deployments.relations`): style fields are top-level there. */
export interface LikeC4DeploymentRelation extends LikeC4ModelElement {
  id: string;
  source: LikeC4DeploymentEndpoint;
  target: LikeC4DeploymentEndpoint;
  kind?: string;
  isBidirectional?: boolean;
  line?: string;
  color?: string;
  head?: string;
  tail?: string;
}

/** A deployment node kind of the computed specification (`$data.specification.deployments`). */
export interface LikeC4DeploymentKind extends LikeC4ModelElement {
  style?: LikeC4ModelStyle;
}

/**
 * The values LikeC4's model getters (`model.deployment.element(id)`,
 * `model.deployment.relationships()`) report — what diagrams and view
 * filters use.  Rich text is reduced to its source text, `null` to absent.
 */
export interface LikeC4DeploymentGetters {
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags: readonly string[];
  links: ReadonlyArray<{ url: string; title?: string }>;
  metadata: Record<string, string | string[]>;
}

/** The deployment model of {@link LikeC4ModelResult}. */
export interface LikeC4DeploymentModel {
  /** Nodes and instances by deployment id (`$data` layer). */
  elements: Record<string, LikeC4DeploymentElement>;
  /** Deployment relations, in the order of the model (`$data` layer). */
  relations: LikeC4DeploymentRelation[];
  /** Deployment node kinds by name. */
  specification: Record<string, LikeC4DeploymentKind>;
  /** Getter values by deployment id, for every node and instance. */
  getters: Record<string, LikeC4DeploymentGetters>;
  /** Getter values by relation id, for every deployment relation. */
  relationGetters: Record<string, LikeC4DeploymentGetters>;
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
  /** The computed deployment model. */
  deployments: LikeC4DeploymentModel;
}

/** Project configuration for {@link buildLikeC4Model}, as in `likec4.config.json`. */
export interface LikeC4ProjectOptions {
  /** LikeC4's `implicitViews` setting: generate a view for every element without one. */
  implicitViews?: boolean;
  /**
   * LikeC4's `inferTechnologyFromIcon` setting (default `true`): an element
   * without a technology takes one derived from its icon.  It reaches the
   * model builder through `MergedSpecification` (LS:3486).
   */
  inferTechnologyFromIcon?: boolean;
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
  const deployments: LikeC4DeploymentModel = {
    elements: (model?.$data?.deployments?.elements ?? {}) as unknown as Record<string, LikeC4DeploymentElement>,
    relations: Object.values(model?.$data?.deployments?.relations ?? {}) as unknown as LikeC4DeploymentRelation[],
    specification: (model?.$data?.specification?.deployments ?? {}) as unknown as Record<string, LikeC4DeploymentKind>,
    getters: {},
    relationGetters: {},
  };
  if (model) {
    for (const id of Object.keys(deployments.elements)) {
      deployments.getters[id] = getterValues(model.deployment.element(id) as unknown as DeploymentGetterSource);
    }
    for (const relation of model.deployment.relationships()) {
      deployments.relationGetters[relation.id] = getterValues(relation as unknown as DeploymentGetterSource);
    }
  }
  return { diagnostics, errors, elements, relations, views, deployments };
}

/** The getters of a LikeC4 deployment node, instance or relation model that {@link getterValues} reads. */
interface DeploymentGetterSource {
  title: string | null;
  summary: { $source: LikeC4ModelString | null };
  description: { $source: LikeC4ModelString | null };
  technology: string | null;
  tags: readonly string[];
  links: ReadonlyArray<{ url: string; title?: string }>;
  metadata: Record<string, string | string[]>;
}

/** Snapshot the getter values of one deployment model object. */
function getterValues(source: DeploymentGetterSource): LikeC4DeploymentGetters {
  return {
    title: source.title ?? undefined,
    summary: plainText(source.summary.$source ?? undefined),
    description: plainText(source.description.$source ?? undefined),
    technology: source.technology ?? undefined,
    tags: source.tags,
    links: source.links,
    metadata: source.metadata,
  };
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

/** Where a linked reference points, as LikeC4's linker resolved it. */
export type LinkedTarget = { model: string } | { deployment: string } | { deployment: string; element: string };

/** One reference of a linked LikeC4 workspace — see {@link linkedReferences}. */
export interface LinkedReference {
  /** `<file>:<line>` of the reference (1-based line). */
  at: string;
  /** `instanceOf` target, `extend <node>` target, or a reference in a deployment view body. */
  role: 'instanceOf' | 'extend' | 'deploymentView';
  /** The reference as written. */
  text: string;
  /** The target LikeC4 resolved it to; `null` when LikeC4 left it unresolved, an ambiguous name included. */
  target: LinkedTarget | null;
}

/** A Langium cross-reference as the linked AST holds it. */
interface LinkedRef {
  ref?: AstNode;
}

/** A `FqnRef` / `StrictFqnRef` of the linked AST: `a.b.c` is `c` with the parent chain `b`, `a`. */
interface FqnRefNode extends AstNode {
  value: LinkedRef;
  parent?: FqnRefNode;
}

/**
 * The references of `files` that LikeC4's linker resolves, with their
 * targets: every `instanceOf` target, every `extend <node>` target and every
 * topmost reference in a deployment view body (include / exclude, relation
 * predicates and style rules alike).  Independent of the library: the
 * targets are what LikeC4's own linker bound
 * (`services.likec4.FqnIndex.resolve`, LS:2917-2921).  A reference to an
 * element through an instance (`prod.api.sub`) reports the instance's
 * deployment id with the element's FQN.  References are listed per file in
 * the order of the source.
 */
export async function linkedReferences(
  files: Record<string, string>,
  project?: LikeC4ProjectOptions,
): Promise<LinkedReference[]> {
  const { services, documents } = await buildWorkspace(files, project);
  const fqnIndex = services.likec4.FqnIndex;
  const fqn = (node: AstNode): string => fqnIndex.resolve(node as Parameters<typeof fqnIndex.resolve>[0]);
  const targetOf = (ref: FqnRefNode): LinkedTarget | null => {
    const resolved = ref.value.ref;
    if (!resolved) return null;
    if (resolved.$type === 'DeploymentNode' || resolved.$type === 'DeployedInstance') {
      return { deployment: fqn(resolved) };
    }
    for (let step = ref.parent; step; step = step.parent) {
      const via = step.value.ref;
      if (via?.$type === 'DeployedInstance') return { deployment: fqn(via), element: fqn(resolved) };
    }
    return { model: fqn(resolved) };
  };
  const result: LinkedReference[] = [];
  const report = (document: LangiumDocument, role: LinkedReference['role'], ref: FqnRefNode, written: AstNode): void => {
    const cst = written.$cstNode!;
    result.push({
      at: `${document.uri.path.slice(SOURCES.length)}:${cst.range.start.line + 1}`,
      role,
      text: cst.text,
      target: targetOf(ref),
    });
  };
  for (const document of documents) {
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
      if (node.$type === 'DeployedInstance') {
        const target = (node as AstNode & { target?: AstNode & { modelElement?: FqnRefNode } }).target;
        if (target?.modelElement) report(document, 'instanceOf', target.modelElement, target);
      } else if (node.$type === 'ExtendDeployment') {
        const ref = (node as AstNode & { deploymentNode?: FqnRefNode }).deploymentNode;
        if (ref) report(document, 'extend', ref, ref);
      } else if (
        node.$type === 'FqnRef' &&
        node.$container?.$type !== 'FqnRef' &&
        AstUtils.getContainerOfType(node, (n): n is AstNode => n.$type === 'DeploymentView')
      ) {
        report(document, 'deploymentView', node as FqnRefNode, node);
      }
    }
  }
  return result;
}

/** A style as the library reports it: opacity as written (`'40%'`). */
export type ReportedStyle = Record<string, string | boolean | undefined>;

/** A deployment node or instance as the library reports it, as far as the comparison reads it. */
export interface ReportedDeploymentElement extends EffectiveValues {
  id: string;
  /** The library's `ElementStyle` (an interface, so typed as an object) */
  style?: object;
}

/** A deployment relationship endpoint as the library reports it. */
export interface ReportedDeploymentEndpoint {
  id: string;
  element?: string;
}

/** A deployment relationship as the library reports it, as far as the comparison reads it. */
export interface ReportedDeploymentRelationship extends Omit<EffectiveValues, 'summary'> {
  source: ReportedDeploymentEndpoint;
  target: ReportedDeploymentEndpoint;
  kind?: string;
  bidirectional?: boolean;
  /** The library's `RelationshipStyle` (an interface, so typed as an object) */
  style?: object;
}

/**
 * The reference for the deployment comparisons: `files` built with
 * `inferTechnologyFromIcon: false` — the library derives no technology from
 * icons (D10) — and without errors.
 */
async function deploymentReference(files: Record<string, string>): Promise<LikeC4ModelResult> {
  const reference = await buildLikeC4Model(files, { inferTechnologyFromIcon: false });
  expect(reference.errors).toEqual([]);
  return reference;
}

/** A computed style in the library's shape: opacity `N` is `'N%'`; no field → absent. */
function reportedStyle(style: LikeC4ModelStyle | undefined): ReportedStyle | undefined {
  const result: ReportedStyle = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    if (value === undefined) continue;
    result[key] = key === 'opacity' && typeof value === 'number' ? `${value}%` : (value as string | boolean);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** LikeC4 links in the library's shape (`title` is `label`); none → absent. */
function reportedLinks(
  links: ReadonlyArray<{ url: string; title?: string }> | null | undefined,
): Array<{ url: string; label?: string }> | undefined {
  if (!links || links.length === 0) return undefined;
  return links.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, label: l.title }));
}

/**
 * Assert a reported node or instance style against LikeC4's computed
 * `$data` style, with the written form of D18: the same fields; `opacity`
 * is a written percent (`'40%'`, `'040%'`, `'150%'`) whose value, clamped
 * to 0…100 as LikeC4 does, is LikeC4's number; `icon` equals LikeC4's for a
 * library icon, `none` and an absolute URL, and for an icon LikeC4 resolves
 * to a file of the project (a relative or root-relative path, an image
 * alias) it is a path or alias as written, not resolved.  The exact written
 * spelling of such values is asserted against the input literals by the
 * tests that write them.
 */
function expectSameStyle(actual: object | undefined, computed: LikeC4ModelStyle | undefined, id: string): void {
  const expected = reportedStyle(computed);
  expect(Object.keys(actual ?? {}).sort(), `${id} style fields`).toEqual(Object.keys(expected ?? {}).sort());
  for (const [key, value] of Object.entries(actual ?? {})) {
    const lc4 = computed![key];
    if (key === 'opacity') {
      expect(value, `${id} style.opacity`).toMatch(/^\d+%$/);
      expect(Math.min(100, Math.max(0, parseFloat(value as string))), `${id} style.opacity`).toBe(lc4);
    } else if (key === 'icon' && typeof lc4 === 'string' && lc4.startsWith('file:')) {
      expect(value, `${id} style.icon`).toMatch(/^(\.{1,2}\/|\/|@)/);
    } else {
      expect(value, `${id} style.${key}`).toBe(lc4);
    }
  }
}

/** Assert one reported deployment node or instance against its expected values; `id` names it in failures. */
function expectSameDeploymentValues(
  actual: ReportedDeploymentElement,
  expected: Omit<ReportedDeploymentElement, 'id' | 'style'> & { style?: LikeC4ModelStyle },
  id: string,
): void {
  expect(actual.title, `${id} title`).toBe(expected.title);
  expect(actual.summary, `${id} summary`).toBe(expected.summary);
  expect(actual.description, `${id} description`).toBe(expected.description);
  expect(actual.technology, `${id} technology`).toBe(expected.technology);
  expect(actual.tags, `${id} tags`).toEqual(expected.tags);
  expect(actual.links, `${id} links`).toEqual(expected.links);
  expect(actual.metadata, `${id} metadata`).toEqual(expected.metadata);
  if (expected.metadata) expect(Object.keys(actual.metadata!), `${id} metadata order`).toEqual(Object.keys(expected.metadata));
  expectSameStyle(actual.style, expected.style, id);
}

/** Getter tags / metadata in the library's shape: none → absent. */
function nonEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

/**
 * Assert that `actual` — every deployment node the library reports for
 * `files` — has exactly the ids of LikeC4's computed nodes, and each node's
 * effective values equal LikeC4's (`files` must build without errors):
 * - title, technology, tags (kind tags appended), links and metadata as the
 *   getters report them;
 * - summary and description per field from the `$data` layer (D2: no
 *   fallback between the two, which the getters add);
 * - style from the `$data` layer (kind style overridden per field by own
 *   style), no theme defaults; opacity and icon in their written form (D18,
 *   see `expectSameStyle`).
 * The reference is built without icon inference (D10).  An empty tag list,
 * link list, metadata map or style compares as absent.
 */
export async function expectDeploymentNodesAgreeWithLikeC4(
  files: Record<string, string>,
  actual: ReportedDeploymentElement[],
): Promise<void> {
  const reference = await deploymentReference(files);
  const nodes = Object.values(reference.deployments.elements).filter((e) => e.element === undefined);
  expect(actual.map((n) => n.id).sort()).toEqual(nodes.map((n) => n.id).sort());
  for (const node of nodes) {
    const getters = reference.deployments.getters[node.id]!;
    expectSameDeploymentValues(
      actual.find((n) => n.id === node.id)!,
      {
        title: getters.title,
        summary: plainText(node.summary),
        description: plainText(node.description),
        technology: getters.technology,
        tags: nonEmpty([...getters.tags]),
        links: reportedLinks(getters.links),
        metadata: nonEmpty(getters.metadata),
        style: node.style,
      },
      node.id,
    );
  }
}

/**
 * Assert that `actual` — every deployment instance the library reports for
 * `files` — has exactly the ids of LikeC4's computed instances, and each
 * instance's effective values equal LikeC4's (`files` must build without
 * errors):
 * - title, technology, tags (own then the element's), links and metadata
 *   (own map, else the element's whole map) as the getters report them;
 * - summary and description per field, own else the element's, from the
 *   `$data` layer (D2: the getters fall back between the two);
 * - technology from a build without icon inference (D10);
 * - style: the element's `$data` style overridden per field by the
 *   instance's; opacity and icon in their written form (D18, see
 *   `expectSameStyle`).
 * An empty tag list, link list, metadata map or style compares as absent.
 */
export async function expectDeploymentInstancesAgreeWithLikeC4(
  files: Record<string, string>,
  actual: ReportedDeploymentElement[],
): Promise<void> {
  const reference = await deploymentReference(files);
  const instances = Object.values(reference.deployments.elements).filter((e) => e.element !== undefined);
  expect(actual.map((i) => i.id).sort()).toEqual(instances.map((i) => i.id).sort());
  for (const instance of instances) {
    const getters = reference.deployments.getters[instance.id]!;
    const element = reference.elements[instance.element!] as LikeC4ModelElement & { style?: LikeC4ModelStyle };
    expect(element, `${instance.id} element ${instance.element}`).toBeDefined();
    expectSameDeploymentValues(
      actual.find((i) => i.id === instance.id)!,
      {
        title: getters.title,
        summary: plainText(instance.summary) ?? plainText(element.summary),
        description: plainText(instance.description) ?? plainText(element.description),
        technology: getters.technology,
        tags: nonEmpty([...getters.tags]),
        links: reportedLinks(getters.links),
        metadata: nonEmpty(getters.metadata),
        style: { ...element.style, ...instance.style },
      },
      instance.id,
    );
  }
}

/**
 * Assert that the library reports the same deployment relationships as
 * LikeC4 computes for `files` (which must build without errors), compared as
 * a multiset: endpoints `{ id, element? }`, kind, bidirectional flag (absent
 * is `false`), and
 * - title and technology as the getters report them (an own `''` title is
 *   no title; an own `''` technology falls back to the kind's);
 * - description, tags (kind tags prepended, line tags over body tags),
 *   links and metadata from the `$data` layer;
 * - style from the `$data` layer's `line`, `color`, `head` and `tail`.
 * An empty tag list, link list, metadata map or style compares as absent.
 */
export async function expectDeploymentRelationshipsAgreeWithLikeC4(
  files: Record<string, string>,
  actual: ReportedDeploymentRelationship[],
): Promise<void> {
  const reference = await deploymentReference(files);
  const endpoint = (e: LikeC4DeploymentEndpoint): ReportedDeploymentEndpoint =>
    e.element === undefined ? { id: e.deployment } : { id: e.deployment, element: e.element };
  const canonical = (r: ReportedDeploymentRelationship): string =>
    JSON.stringify([
      r.source.id,
      r.source.element ?? null,
      r.target.id,
      r.target.element ?? null,
      r.kind ?? null,
      r.bidirectional ?? false,
      r.title ?? null,
      r.description ?? null,
      r.technology ?? null,
      r.tags ?? null,
      r.links ?? null,
      r.metadata ?? null,
      r.metadata ? Object.keys(r.metadata) : null,
      r.style ? Object.entries(r.style).filter(([, v]) => v !== undefined).sort() : null,
    ]);
  const expected = reference.deployments.relations.map((r) => {
    const getters = reference.deployments.relationGetters[r.id]!;
    return canonical({
      source: endpoint(r.source),
      target: endpoint(r.target),
      kind: r.kind,
      bidirectional: r.isBidirectional === true,
      title: getters.title,
      description: plainText(r.description),
      technology: getters.technology,
      tags: r.tags && r.tags.length > 0 ? [...r.tags] : undefined,
      links: reportedLinks(r.links),
      metadata: r.metadata && Object.keys(r.metadata).length > 0 ? r.metadata : undefined,
      style: reportedStyle({ line: r.line, color: r.color, head: r.head, tail: r.tail }),
    });
  });
  expect(actual.map(canonical).sort()).toEqual(expected.sort());
}

// ---------------------------------------------------------------------------
// Views: LikeC4's parsed, computed and linked views, and the comparisons of
// the library's view reads against them.
//
// The `Reported*` interfaces below are the shape the comparisons read from
// the library: the public view read types must stay assignable to them.
// Every expected value is taken from LikeC4 only (its parsed views, computed
// views and linked AST); the library's values are mapped onto LikeC4's
// parsed form, and each INV-4 exception is a separate, labelled branch.
// ---------------------------------------------------------------------------

/** A view of LikeC4's per-document parse (`c4Views`, before `extends` resolution), as far as the tests read it. */
export interface LikeC4ParsedView {
  _type: 'element' | 'dynamic' | 'deployment';
  /** Declared name, or the id LikeC4 generates for an unnamed view */
  id: string;
  /** AST path of the declaration inside its document */
  astPath: string;
  /** Title: the folder prefix added, single line; `null` when none is written and there is no folder */
  title: string | null;
  description: { md: string } | { txt: string } | null;
  tags: string[] | null;
  links: Array<{ url: string; title?: string }> | null;
  viewOf?: string;
  extends?: string;
  /** Block-level styles of the enclosing `views` block first (see {@link ParsedViewEntry.prepended}), then the view's own rules */
  rules: unknown[];
  /** Dynamic views only */
  steps?: unknown[];
}

/** One view of {@link parsedViews}. */
export interface ParsedViewEntry {
  /** File name of the declaration */
  file: string;
  /** The view as LikeC4 parsed it */
  view: LikeC4ParsedView;
  /** The declaration has a name (an unnamed element view gets an id generated by LikeC4) */
  named: boolean;
  /** The folder string of the enclosing `views` block as LikeC4's AST holds it; absent when none or blank */
  folder?: string;
  /**
   * The rules LikeC4 prepends to the view's rules from the enclosing
   * `views { style … }` block, as LikeC4 parses them (element and dynamic
   * views; none for deployment views, LS:6411).
   */
  prepended: unknown[];
}

/** LikeC4's document parser, as far as {@link parsedViews} uses it. */
interface LikeC4DocumentParser {
  parseViewRuleStyleOrGlobalRef(node: AstNode): unknown;
}

/** A `views { … }` block of LikeC4's AST, as far as the view helpers read it. */
interface ViewsBlockNode extends AstNode {
  folder?: string;
  styles: AstNode[];
  views: AstNode[];
}

/**
 * LikeC4's per-document parsed views of `files`, in LikeC4's document
 * order and, within a file, in declaration order: `c4Views` of
 * `services.likec4.ModelParser.parse(doc)` (LS:6850-6855), which come
 * before `extends` resolution and title defaulting (LS:3590-3632).  A view
 * declared without a body is not among them (LikeC4 builds no view from it);
 * neither is a view LikeC4 drops while parsing.
 */
export async function parsedViews(files: Record<string, string>, project?: LikeC4ProjectOptions): Promise<ParsedViewEntry[]> {
  const { services, documents } = await buildWorkspace(files, project);
  const modelParser = services.likec4.ModelParser as unknown as {
    parse(doc: LangiumDocument): { c4Views: LikeC4ParsedView[] };
    forDocument(doc: LangiumDocument): LikeC4DocumentParser;
  };
  const locator = services.workspace.AstNodeLocator;
  const result: ParsedViewEntry[] = [];
  for (const document of documents) {
    const parser = modelParser.forDocument(document);
    const root = document.parseResult.value;
    for (const view of modelParser.parse(document).c4Views) {
      const node = locator.getAstNode(root, view.astPath);
      const block = node && AstUtils.getContainerOfType(node, (n): n is ViewsBlockNode => n.$type === 'ModelViews');
      const folder = block?.folder && block.folder.trim() !== '' ? block.folder : undefined;
      const prepended =
        view._type === 'deployment' || !block ? [] : block.styles.flatMap((s) => [parser.parseViewRuleStyleOrGlobalRef(s)].flat());
      const named = Boolean((node as (AstNode & { name?: string }) | undefined)?.name);
      result.push({ file: fileName(document), view, named, ...(folder !== undefined && { folder }), prepended });
    }
  }
  return result;
}

/** The file name of a workspace document, as given to the helpers. */
function fileName(document: LangiumDocument): string {
  return document.uri.path.slice(SOURCES.length);
}

/** One step of a computed dynamic view, taken from its computed edge. */
export interface LikeC4ComputedStep {
  /** LikeC4's positional id: `step-NN`, `step-NN:par.MM`, or a deeper id inside a stage-6 block (`step-NN:opt.MM`, …) */
  id: string;
  /** `NN` of the id */
  step: number;
  /** `MM` when the id is `step-NN:par.MM` */
  parallel?: number;
  source: string;
  target: string;
  /** The edge label: the step's title, else the title LikeC4 takes from the relationship it finds; `null` when none */
  title: string | null;
  /** The step's kind, else the kind of the relationship LikeC4 finds for it */
  kind?: string;
  /**
   * LikeC4's computed backward flag (`dir: 'back'`): the target's actor
   * comes before the source's in the computed actor order — not the parsed
   * direction of the step (`isBackward` of {@link parsedViews})
   */
  backward: boolean;
}

/** A computed LikeC4 view, as far as the tests read it. */
export interface LikeC4ComputedView {
  id: string;
  type: 'element' | 'dynamic' | 'deployment';
  /** Node ids in LikeC4's order */
  nodes: string[];
  /** Edge endpoints in LikeC4's order */
  edges: Array<{ source: string; target: string }>;
  /** The step sequence of a dynamic view (one entry per computed edge, in order); empty for other views */
  steps: LikeC4ComputedStep[];
  /** The layout LikeC4 computes the view with (`autoLayout` of the computed view) */
  autoLayout: { direction: string; rankSep?: number; nodeSep?: number };
  /** The view each node navigates to, for the nodes that have a `navigateTo` */
  navigateTo: Record<string, string>;
}

/** A computed edge, as far as {@link computedViews} reads it. */
interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  label: string | null;
  kind?: string;
  dir?: string;
}

/**
 * LikeC4's computed views of `files` by id (`model.views()` of
 * `ModelBuilder.computeModel()`), generated views included.  Separate from
 * {@link buildLikeC4Model}, whose `views` keep their `{ title, folder }`
 * shape.
 */
export async function computedViews(
  files: Record<string, string>,
  project?: LikeC4ProjectOptions,
): Promise<Record<string, LikeC4ComputedView>> {
  const { services } = await buildWorkspace(files, project);
  const model = project
    ? await services.likec4.ModelBuilder.computeModel(PROJECT as Parameters<typeof services.likec4.ModelBuilder.computeModel>[0])
    : await services.likec4.ModelBuilder.computeModel();
  const result: Record<string, LikeC4ComputedView> = {};
  for (const view of model?.views() ?? []) {
    const computed = view.$view as unknown as {
      _type: LikeC4ComputedView['type'];
      nodes: ReadonlyArray<{ id: string; navigateTo?: string | null }>;
      edges: readonly ComputedEdge[];
      autoLayout: LikeC4ComputedView['autoLayout'];
    };
    const steps: LikeC4ComputedStep[] = [];
    if (computed._type === 'dynamic') {
      for (const edge of computed.edges) {
        const match = /^step-(\d+)(?::par\.(\d+))?/.exec(edge.id);
        expect(match, `computed step id ${edge.id}`).not.toBeNull();
        steps.push({
          id: edge.id,
          step: Number(match![1]),
          ...(match![2] !== undefined && { parallel: Number(match![2]) }),
          source: edge.source,
          target: edge.target,
          title: edge.label,
          ...(edge.kind !== undefined && { kind: edge.kind }),
          backward: edge.dir === 'back',
        });
      }
    }
    result[view.id] = {
      id: view.id,
      type: computed._type,
      nodes: computed.nodes.map((n) => n.id),
      edges: computed.edges.map((e) => ({ source: e.source, target: e.target })),
      steps,
      autoLayout: computed.autoLayout,
      navigateTo: Object.fromEntries(computed.nodes.flatMap((n) => (n.navigateTo ? [[n.id, n.navigateTo]] : []))),
    };
  }
  return result;
}

/** The names of the views declared in `files` (named declarations only, with or without a body). */
async function declaredViewNames(files: Record<string, string>): Promise<Set<string>> {
  const { documents } = await buildWorkspace(files);
  const names = new Set<string>();
  for (const document of documents) {
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
      if (node.$type === 'ElementView' || node.$type === 'DynamicView' || node.$type === 'DeploymentView') {
        const name = (node as AstNode & { name?: string }).name;
        if (name) names.add(name);
      }
    }
  }
  return names;
}

/**
 * Assert INV-9: every named view LikeC4 computes for `before` is still among
 * the views it computes for `after`, except `removedId` (the view a
 * `removeView` removes on purpose).  Views LikeC4 generates (an `index`
 * that is not declared, implicit views) and unnamed views are exempt: only
 * computed ids that are declared names of `before` are checked.
 */
export async function expectComputedViewsSurvive(
  before: Record<string, string>,
  after: Record<string, string>,
  removedId?: string,
): Promise<void> {
  const declared = await declaredViewNames(before);
  const was = Object.keys(await computedViews(before)).filter((id) => declared.has(id) && id !== removedId);
  const now = new Set(Object.keys(await computedViews(after)));
  expect(was.filter((id) => !now.has(id)), 'named views LikeC4 no longer computes').toEqual([]);
}

/** Where a linked view reference points: a model element, a deployment target, or a view (`{ view: id }`). */
export type LinkedViewTarget = LinkedTarget | { view: string };

/** The role of one {@link LinkedViewReference}. */
export type LinkedViewReferenceRole =
  /** `view … of <element>` */
  | 'of'
  /** `view … extends <view>` */
  | 'extends'
  /** a topmost element or deployment reference in a view rule (include / exclude, `with`, `where`, style, group, rank targets) */
  | 'rule'
  /** a step endpoint of a dynamic view, inside stage-6 blocks too */
  | 'step'
  /** `navigateTo` in an element predicate's `with { … }` */
  | 'elementWithNavigateTo'
  /** `navigateTo` in a relation predicate's `with { … }` */
  | 'relationWithNavigateTo'
  /** `navigateTo` in a dynamic step body */
  | 'stepNavigateTo'
  /** `navigateTo` in a model relationship body */
  | 'relationshipNavigateTo'
  /** `navigateTo` in a deployment relationship body */
  | 'deploymentRelationshipNavigateTo';

/** One reference of {@link linkedViewReferences}. */
export interface LinkedViewReference {
  /** File the reference is written in */
  file: string;
  /** `<file>:<line>` of the reference (1-based line) */
  at: string;
  /** Name of the view the reference is written in; `null` outside a view or in an unnamed view */
  view: string | null;
  role: LinkedViewReferenceRole;
  /** The reference as written */
  text: string;
  /** The target LikeC4's linker bound it to; `null` when it left the reference unresolved, an ambiguous name included */
  target: LinkedViewTarget | null;
}

/** Where a `navigateTo` property sits: the role of its reference. */
function navigateToRole(node: AstNode): LinkedViewReferenceRole | undefined {
  for (let up = node.$container; up; up = up.$container) {
    switch (up.$type) {
      case 'FqnExprWith':
        return 'elementWithNavigateTo';
      case 'RelationExprWith':
        return 'relationWithNavigateTo';
      case 'Step':
      case 'StepSeries':
        return 'stepNavigateTo';
      case 'DeploymentRelation':
        return 'deploymentRelationshipNavigateTo';
      case 'Relation':
        return 'relationshipNavigateTo';
    }
  }
  return undefined;
}

/** The view declaration `node` is written in, if any. */
function enclosingView(node: AstNode): (AstNode & { name?: string }) | undefined {
  return AstUtils.getContainerOfType(
    node,
    (n): n is AstNode & { name?: string } =>
      n.$type === 'ElementView' || n.$type === 'DynamicView' || n.$type === 'DeploymentView',
  );
}

/**
 * The view references of `files` with the targets LikeC4's linker bound
 * them to: every `of` and `extends` target, every topmost element or
 * deployment reference in a view body (role `rule`, or `step` for a step
 * endpoint), and every `navigateTo` in each of its five places.  Element
 * and deployment targets as in {@link linkedReferences}; a view target is
 * `{ view: <name> }`.  References are listed per file in source order.
 * Independent of the library.
 */
export async function linkedViewReferences(
  files: Record<string, string>,
  project?: LikeC4ProjectOptions,
): Promise<LinkedViewReference[]> {
  const { services, documents } = await buildWorkspace(files, project);
  const fqnIndex = services.likec4.FqnIndex;
  const fqn = (node: AstNode): string => fqnIndex.resolve(node as Parameters<typeof fqnIndex.resolve>[0]);
  const elementTarget = (ref: FqnRefNode): LinkedTarget | null => {
    const resolved = ref.value.ref;
    if (!resolved) return null;
    if (resolved.$type === 'DeploymentNode' || resolved.$type === 'DeployedInstance') return { deployment: fqn(resolved) };
    for (let step = ref.parent; step; step = step.parent) {
      const via = step.value.ref;
      if (via?.$type === 'DeployedInstance') return { deployment: fqn(via), element: fqn(resolved) };
    }
    return { model: fqn(resolved) };
  };
  const viewTarget = (ref: LinkedRef & { $refText?: string }): LinkedViewTarget | null => {
    const name = (ref.ref as (AstNode & { name?: string }) | undefined)?.name;
    return name ? { view: name } : null;
  };
  const result: LinkedViewReference[] = [];
  for (const document of documents) {
    const file = fileName(document);
    // AST order lists a dynamic body's rules before its steps; references are sorted by offset.
    const found: Array<{ offset: number; reference: LinkedViewReference }> = [];
    const report = (written: AstNode, role: LinkedViewReferenceRole, target: LinkedViewTarget | null): void => {
      const cst = written.$cstNode!;
      found.push({ offset: cst.offset, reference: {
        file,
        at: `${file}:${cst.range.start.line + 1}`,
        view: enclosingView(written)?.name ?? null,
        role,
        text: cst.text,
        target,
      } });
    };
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
      switch (node.$type) {
        case 'ElementView': {
          const view = node as AstNode & { viewOf?: AstNode & { modelElement: FqnRefNode }; extends?: AstNode & { view: LinkedRef } };
          if (view.viewOf) report(view.viewOf, 'of', elementTarget(view.viewOf.modelElement));
          if (view.extends) report(view.extends, 'extends', viewTarget(view.extends.view));
          break;
        }
        case 'NavigateToProperty':
        case 'RelationNavigateToProperty': {
          const value = (node as AstNode & { value?: AstNode & { view: LinkedRef } }).value;
          const role = navigateToRole(node);
          if (value && role) report(value, role, viewTarget(value.view));
          break;
        }
        case 'FqnRef': {
          if (node.$container?.$type === 'FqnRef') break;
          const body = AstUtils.getContainerOfType(
            node,
            (n): n is AstNode =>
              n.$type === 'ElementViewBody' || n.$type === 'DynamicViewBody' || n.$type === 'DeploymentViewBody',
          );
          if (!body) break;
          const endpoint = node.$container?.$type === 'ElementRef' && /^(Step|StepSeries)$/.test(node.$container.$container?.$type ?? '');
          report(node, endpoint ? 'step' : 'rule', elementTarget(node as FqnRefNode));
          break;
        }
      }
    }
    result.push(...found.sort((a, b) => a.offset - b.offset).map((f) => f.reference));
  }
  return result;
}

// ----- the library's view reads, as the comparisons read them --------------

/** A Markdown-or-string value as LikeC4 parses it: `{ md }` for `'''…'''`, `{ txt }` for a plain string. */
export type ReportedText = { md: string } | { txt: string };

/** A reference as written, with the target the library resolved it to (`null` when unresolved). */
export interface ReportedReference<T = string> {
  /** The reference as written */
  text: string;
  /** The resolved target — an element FQN or a view id; a `LinkedTarget` in deployment views — or `null` */
  target: T | null;
}

/** A relationship kind of a predicate or step: its name, and the form it is written in (`-[k]->` / `.k`). */
export interface ReportedRelationKind {
  name: string;
  form: 'bracket' | 'dot';
}

/** An element expression of a view predicate (US-3). Kinds and tags are names (no `#`). */
export type ReportedElementExpression =
  | { type: 'wildcard' }
  | {
      type: 'element';
      ref: ReportedReference | ReportedReference<LinkedTarget>;
      selector?: 'children' | 'descendants' | 'expanded';
    }
  | { type: 'elementKind'; operator: '=' | '!='; kind: string }
  | { type: 'elementTag'; operator: '=' | '!='; tag: string };

/** A relation expression of a view predicate (US-3); each endpoint is an element expression. */
export type ReportedRelationExpression =
  | {
      type: 'direct';
      source: ReportedElementExpression;
      target: ReportedElementExpression;
      kind?: ReportedRelationKind;
      bidirectional: boolean;
    }
  | { type: 'incoming'; target: ReportedElementExpression }
  | { type: 'outgoing'; source: ReportedElementExpression; kind?: ReportedRelationKind; bidirectional: boolean }
  | { type: 'inOut'; element: ReportedElementExpression };

/** A leaf of a `where` condition: tag, kind or metadata, optionally of the relation's `source` / `target`. */
export interface ReportedWhereLeaf {
  field: 'tag' | 'kind' | 'metadata';
  participant?: 'source' | 'target';
  /** Metadata key */
  key?: string;
  /** Absent for a metadata key without a value */
  operator?: '=' | '!=' | 'is' | 'is not';
  /** Tag or kind name (no `#`), or the metadata value */
  value?: string | boolean;
}

/** A `where` condition tree. */
export type ReportedWhereCondition =
  | { and: ReportedWhereCondition[] }
  | { or: ReportedWhereCondition[] }
  | { not: ReportedWhereCondition }
  | ReportedWhereLeaf;

/** The properties written in a `with { … }` block; style values in their written form (D18). */
export interface ReportedWithProperties {
  title?: string;
  /** LikeC4 keeps the last `description` or `summary` as the description */
  description?: ReportedText;
  technology?: string;
  notation?: string;
  notes?: ReportedText;
  navigateTo?: ReportedReference;
  /** Element style fields (element `with`, `multiple` included) or relationship style fields (relation `with`): the library's `ElementStyle` / `RelationshipStyle` (interfaces, so typed as an object) */
  style?: object;
  /** Relation `with` only */
  multiple?: boolean;
}

/** One item of an include / exclude rule (US-3). */
export interface ReportedPredicateItem {
  expression: ReportedElementExpression | ReportedRelationExpression;
  where?: ReportedWhereCondition;
  with?: ReportedWithProperties;
}

/** The stage-6 rule kinds reported as opaque positions (D30). */
export type ReportedOpaqueRuleKind = 'style' | 'group' | 'rank' | 'globalPredicate' | 'globalStyle' | 'includeAncestors';

/** One rule of a view (US-2). */
export interface ReportedViewRule {
  kind: 'include' | 'exclude' | 'autoLayout' | ReportedOpaqueRuleKind;
  /** include / exclude only */
  items?: ReportedPredicateItem[];
  /** autoLayout only; `direction` is the keyword as written (`TopBottom`, …) */
  autoLayout?: { direction: string; rankSep?: number; nodeSep?: number };
}

/** A step body (US-4); style values in their written form. */
export interface ReportedStepBody {
  title?: string;
  description?: ReportedText;
  technology?: string;
  notes?: ReportedText;
  notation?: string;
  navigateTo?: ReportedReference;
  /** `color`, `line`, `head`, `tail`: the library's `RelationshipStyle` (an interface, so typed as an object) */
  style?: object;
}

/** One step or chain segment (US-4); source and target in LikeC4's sense (D36). */
export interface ReportedViewStep {
  source: ReportedReference;
  target: ReportedReference;
  direction: 'forward' | 'backward';
  kind?: ReportedRelationKind;
  /** The title written after the target */
  title?: string;
  body?: ReportedStepBody;
  /** Position in LikeC4's step sequence: `step-NN[:par.MM]`; absent when LikeC4's parse drops the step */
  sequence?: { step: number; parallel?: number };
}

/** A step statement of a dynamic view (US-4). */
export type ReportedStepStatement =
  | { type: 'step'; step: ReportedViewStep }
  | { type: 'chain'; segments: ReportedViewStep[] }
  | {
      type: 'parallel';
      title?: string;
      /** False when the block contributes no LikeC4 step (D40) */
      inModel: boolean;
      statements: ReportedStepStatement[];
    }
  | {
      type: 'opaque';
      /** Keyword as written: `opt`, `loop`, `alt`, `try`, `break`, or a stray `if` / `when` / `else` */
      keyword: string;
      /** False when LikeC4 drops the block; absent means true */
      inModel?: boolean;
    };

/** A view declaration as the library reports it (US-1), as far as the comparisons read it. */
export interface ReportedView {
  /** `null` for an unnamed element view (D28) */
  id: string | null;
  type: 'element' | 'dynamic' | 'deployment';
  of?: ReportedReference;
  extends?: ReportedReference;
  /** Own title, without the folder prefix */
  title?: string;
  description?: ReportedText;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  /** Folder string of the enclosing `views` block */
  folder?: string;
  file: string;
  sourceRange: { offset: number };
  /** False for a declaration LikeC4 builds no view from (no body) */
  inModel: boolean;
  rules: ReportedViewRule[];
  /** Dynamic views only */
  steps?: ReportedStepStatement[];
}

/** The fields {@link expectRulesAgreeWithLikeC4} reads. */
export type ReportedViewRules = Pick<ReportedView, 'id' | 'type' | 'file' | 'sourceRange' | 'inModel' | 'rules'>;

/** The fields {@link expectStepsAgreeWithLikeC4} reads. */
export type ReportedViewSteps = Pick<ReportedView, 'id' | 'type' | 'file' | 'sourceRange' | 'inModel' | 'steps'>;

// ----- mapping the library's values onto LikeC4's parsed form ----------------

/** LikeC4's spelling of a size token (LS `parseAstSizeValue`). */
const SIZE_TOKENS: Record<string, string> = { xsmall: 'xs', small: 'sm', medium: 'md', large: 'lg', xlarge: 'xl' };
const SIZE_KEYS = new Set(['size', 'padding', 'textSize', 'iconSize']);
/** Stands for an icon path / alias on both sides: LikeC4 resolves it to a `file:` URI, the library reports it as written. */
const ICON_PATH = '<icon path>';

/**
 * INV-4 exception: D18 written forms of style values.  A written value is
 * mapped onto LikeC4's parsed value: opacity `'40%'` → `40` (clamped to
 * 0…100), a long size token → the short one, an icon path or alias → a
 * marker that LikeC4's `file:` icon is mapped to as well.
 */
function writtenStyleValue(key: string, value: string | boolean | undefined): unknown {
  if (typeof value !== 'string') return value;
  if (key === 'opacity') return Math.min(100, Math.max(0, parseFloat(value)));
  if (SIZE_KEYS.has(key)) return SIZE_TOKENS[value] ?? value;
  if (key === 'icon' && /^(\.{1,2}\/|\/|@)/.test(value)) return ICON_PATH;
  return value;
}

/** LikeC4's `file:` icon, mapped as {@link writtenStyleValue} maps a written path. */
function computedIcon<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, v) => (key === 'icon' && typeof v === 'string' && v.startsWith('file:') ? ICON_PATH : v)),
  ) as T;
}

/** A resolved reference target, or a marker that fails every comparison. */
function resolved<T>(ref: ReportedReference<T>): T | string {
  return ref.target ?? `<unresolved ${ref.text}>`;
}

/** An element expression in LikeC4's parsed form. */
function lc4ElementExpr(expr: ReportedElementExpression): unknown {
  switch (expr.type) {
    case 'wildcard':
      return { wildcard: true };
    case 'element': {
      const target = resolved(expr.ref as ReportedReference<unknown>);
      const ref = typeof target === 'string' ? { model: target } : target;
      return expr.selector ? { ref, selector: expr.selector } : { ref };
    }
    case 'elementKind':
      return { elementKind: expr.kind, isEqual: expr.operator === '=' };
    case 'elementTag':
      return { elementTag: expr.tag, isEqual: expr.operator === '=' };
  }
}

/** A where leaf operator in LikeC4's form. */
function lc4Equals(leaf: ReportedWhereLeaf, value: unknown): unknown {
  return leaf.operator === '!=' || leaf.operator === 'is not' ? { neq: value } : { eq: value };
}

/** A `where` condition in LikeC4's parsed form: `and` / `or` chains flattened as LikeC4 flattens them (LS `createBinaryOperator`). */
function lc4Condition(condition: ReportedWhereCondition): unknown {
  if ('and' in condition) return { and: condition.and.flatMap((c) => flattened('and', c)) };
  if ('or' in condition) return { or: condition.or.flatMap((c) => flattened('or', c)) };
  if ('not' in condition) return { not: lc4Condition(condition.not) };
  const operator =
    condition.field === 'metadata'
      ? {
          metadata: {
            key: condition.key,
            ...(condition.value !== undefined && { value: lc4Equals(condition, String(condition.value)) }),
          },
        }
      : { [condition.field]: lc4Equals(condition, condition.value) };
  return condition.participant ? { participant: condition.participant, operator } : operator;
}

/** Operands of a flattened `and` / `or`. */
function flattened(op: 'and' | 'or', condition: ReportedWhereCondition): unknown[] {
  const mapped = lc4Condition(condition) as Record<string, unknown[]>;
  return op in mapped ? mapped[op]! : [mapped];
}

/** LikeC4's `where` wrapper for an inline relationship kind and / or a written condition (LS `parseRelationExprWhere`). */
function lc4Where(expr: unknown, kind: ReportedRelationKind | undefined, where: ReportedWhereCondition | undefined): unknown {
  const kindCondition = kind ? { kind: { eq: kind.name } } : undefined;
  const written = where ? lc4Condition(where) : undefined;
  if (!kindCondition && !written) return expr;
  const condition =
    kindCondition && written
      ? { and: [kindCondition, ...('and' in (written as object) ? (written as { and: unknown[] }).and : [written])] }
      : (kindCondition ?? written);
  return { where: { expr, condition } };
}

/** `with` properties in LikeC4's parsed form (`custom` / `customRelation` members). */
function lc4WithProps(props: ReportedWithProperties): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (props.title !== undefined) result.title = props.title;
  if (props.description !== undefined) result.description = props.description;
  if (props.technology !== undefined) result.technology = props.technology;
  if (props.notation !== undefined) result.notation = props.notation;
  if (props.notes !== undefined) result.notes = props.notes;
  if (props.navigateTo !== undefined) result.navigateTo = resolved(props.navigateTo);
  for (const [key, value] of Object.entries((props.style ?? {}) as Record<string, string | boolean | undefined>)) {
    if (value !== undefined) result[key] = writtenStyleValue(key, value);
  }
  if (props.multiple !== undefined) result.multiple = props.multiple;
  return result;
}

/** One predicate item in LikeC4's parsed form; `undefined` when LikeC4 drops it. */
function lc4PredicateItem(item: ReportedPredicateItem, viewType: ReportedView['type']): unknown {
  const expr = item.expression;
  if (expr.type === 'direct' || expr.type === 'incoming' || expr.type === 'outgoing' || expr.type === 'inOut') {
    // INV-4 exception: D34 constructs LikeC4 drops.  A relation predicate in
    // a dynamic view's include is dropped by LikeC4's parser (LS:6579-6590
    // keeps `FqnExprOrWith` items only); the library reports it as written.
    if (viewType === 'dynamic') return undefined;
    let base: unknown;
    let kind: ReportedRelationKind | undefined;
    switch (expr.type) {
      case 'direct':
        base = { source: lc4ElementExpr(expr.source), target: lc4ElementExpr(expr.target), isBidirectional: expr.bidirectional };
        kind = expr.kind;
        break;
      case 'incoming':
        base = { incoming: lc4ElementExpr(expr.target) };
        break;
      case 'outgoing':
        // INV-4 exception: source-only field.  The bidirectional flag of an
        // outgoing expression (`a ->` / `a <->`) is not kept by LikeC4's
        // parse (LS `parseRelationExpr` writes `{ outgoing }` only), so it
        // cannot be compared here; the tests that read outgoing expressions
        // assert it against the written connector.
        base = { outgoing: lc4ElementExpr(expr.source) };
        kind = expr.kind;
        break;
      case 'inOut':
        base = { inout: lc4ElementExpr(expr.element) };
        break;
    }
    const subject = lc4Where(base, kind, item.where);
    return item.with ? { customRelation: { ...lc4WithProps(item.with), expr: subject } } : subject;
  }
  const element = lc4ElementExpr(expr);
  const subject = item.where ? { where: { expr: element, condition: lc4Condition(item.where) } } : element;
  return item.with ? { custom: { expr: subject, ...lc4WithProps(item.with) } } : subject;
}

/** LikeC4's direction of an `autoLayout` keyword (LS `toAutoLayout`). */
const LAYOUT_DIRECTIONS: Record<string, string> = { TopBottom: 'TB', BottomTop: 'BT', LeftRight: 'LR', RightLeft: 'RL' };

/** How LikeC4's parsed form of each opaque rule kind is recognized (the keys its parser writes). */
const OPAQUE_RULE_SHAPES: Record<ReportedOpaqueRuleKind, (rule: Record<string, unknown>) => boolean> = {
  style: (r) => 'targets' in r && 'style' in r && !('rank' in r),
  group: (r) => 'groupRules' in r,
  rank: (r) => 'rank' in r,
  globalPredicate: (r) => 'predicateId' in r,
  globalStyle: (r) => 'styleId' in r,
  includeAncestors: (r) => 'includeAncestors' in r,
};

/** Assert the library's rules of one view against LikeC4's parsed rules of that view (prepended block styles already removed). */
function expectSameRules(actual: ReportedViewRule[], expected: unknown[], viewType: ReportedView['type'], name: string): void {
  expect(actual.map((r) => r.kind), `${name} rule kinds`).toHaveLength(expected.length);
  actual.forEach((rule, i) => {
    const lc4 = computedIcon(expected[i]) as Record<string, unknown>;
    const where = `${name} rules[${i}]`;
    switch (rule.kind) {
      case 'include':
      case 'exclude': {
        const items = (rule.items ?? []).map((item) => lc4PredicateItem(item, viewType)).filter((x) => x !== undefined);
        expect({ [rule.kind]: items }, where).toEqual(lc4);
        break;
      }
      case 'autoLayout': {
        const layout = rule.autoLayout!;
        expect(
          {
            direction: LAYOUT_DIRECTIONS[layout.direction] ?? layout.direction,
            ...(layout.rankSep !== undefined && { rankSep: layout.rankSep }),
            ...(layout.nodeSep !== undefined && { nodeSep: layout.nodeSep }),
          },
          where,
        ).toEqual(lc4);
        break;
      }
      default:
        // Opaque stage-6 rules (D30): only the kind is compared.
        expect(OPAQUE_RULE_SHAPES[rule.kind](lc4), `${where} is LikeC4's ${rule.kind} rule: ${JSON.stringify(lc4)}`).toBe(true);
    }
  });
}

/** A parsed LikeC4 step, as far as the comparisons read it. */
interface LikeC4ParsedStep {
  source: string;
  target: string;
  isBackward?: boolean;
  title?: string;
  kind?: string;
  description?: ReportedText;
  technology?: string;
  notes?: ReportedText;
  notation?: string;
  navigateTo?: string;
  color?: string;
  line?: string;
  head?: string;
  tail?: string;
}

/** A parsed LikeC4 step statement: a step, or a `_type`d block. */
type LikeC4StepNode = LikeC4ParsedStep & {
  _type?: string;
  steps?: LikeC4StepNode[];
  title?: string;
  branches?: LikeC4StepNode[];
  try?: { steps: LikeC4StepNode[] };
  catch?: { steps: LikeC4StepNode[] };
  finally?: { steps: LikeC4StepNode[] };
};

/** The content of one step as the comparisons see it. */
function stepContent(step: LikeC4ParsedStep, sequence: { step: number; parallel?: number } | undefined): Record<string, unknown> {
  const content: Record<string, unknown> = {
    source: step.source,
    target: step.target,
    backward: step.isBackward === true,
    sequence,
  };
  for (const key of ['title', 'kind', 'description', 'technology', 'notes', 'notation', 'navigateTo', 'color', 'line', 'head', 'tail'] as const) {
    if (step[key] !== undefined) content[key] = step[key];
  }
  return content;
}

/** How many computed edges a parsed statement yields (inner steps of every block counted). */
function edgeCount(node: LikeC4StepNode): number {
  if (node._type === undefined) return 1;
  const children = [
    ...(node.steps ?? []),
    ...(node.branches ?? []),
    ...(node.try?.steps ?? []),
    ...(node.catch?.steps ?? []),
    ...(node.finally?.steps ?? []),
  ];
  return children.reduce((n, child) => n + edgeCount(child), 0);
}

/**
 * The expected statements of a dynamic view: LikeC4's parsed steps, each
 * step with its position in LikeC4's computed sequence.  Parsed steps and
 * computed edges are walked together in order; the endpoints of each pair
 * must agree, so a misalignment fails instead of shifting positions.
 */
function expectedStatements(steps: LikeC4StepNode[], edges: LikeC4ComputedStep[], name: string): unknown[] {
  let next = 0;
  const take = (step: LikeC4ParsedStep): { step: number; parallel?: number } => {
    const edge = edges[next++];
    expect(edge, `${name}: computed edge for parsed step ${step.source} -> ${step.target}`).toBeDefined();
    expect([edge!.source, edge!.target], `${name}: computed edge ${edge!.id}`).toEqual([step.source, step.target]);
    return edge!.parallel === undefined ? { step: edge!.step } : { step: edge!.step, parallel: edge!.parallel };
  };
  const statement = (node: LikeC4StepNode): unknown => {
    switch (node._type) {
      case undefined:
        return { type: 'step', step: stepContent(node, take(node)) };
      case 'series':
        return { type: 'chain', segments: node.steps!.map((s) => stepContent(s, take(s))) };
      case 'par':
        return { type: 'parallel', ...(node.title !== undefined && { title: node.title }), statements: node.steps!.map(statement) };
      default:
        next += edgeCount(node);
        return { type: 'opaque', keyword: node._type };
    }
  };
  const result = steps.map(statement);
  expect(next, `${name}: computed edges consumed`).toBe(edges.length);
  return result;
}

/** The content of one library step, mapped onto LikeC4's parsed step. */
function reportedStepContent(step: ReportedViewStep): Record<string, unknown> {
  const body = step.body ?? {};
  const parsed: LikeC4ParsedStep = {
    source: String(resolved(step.source)),
    target: String(resolved(step.target)),
    ...(step.direction === 'backward' && { isBackward: true }),
    // LikeC4 keeps one title: the body's `title` overrides the one written after the target.
    ...((body.title ?? step.title) !== undefined && { title: body.title ?? step.title }),
    ...(step.kind && { kind: step.kind.name }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.technology !== undefined && { technology: body.technology }),
    ...(body.notes !== undefined && { notes: body.notes }),
    ...(body.notation !== undefined && { notation: body.notation }),
    ...(body.navigateTo !== undefined && { navigateTo: String(resolved(body.navigateTo)) }),
  };
  const content = stepContent(parsed, step.sequence);
  for (const [key, value] of Object.entries((body.style ?? {}) as Record<string, string | undefined>)) {
    if (value !== undefined) content[key] = writtenStyleValue(key, value);
  }
  return content;
}

/**
 * The library's statements mapped onto the expected form.  Source-only
 * fields (addresses, source text, written arrow, kind form, keyword
 * spelling, segment numbers) are not mapped: LikeC4 does not keep them.
 */
function reportedStatements(statements: ReportedStepStatement[]): unknown[] {
  return statements.flatMap((statement): unknown[] => {
    switch (statement.type) {
      // A step or chain without a sequence position is one LikeC4's parse
      // drops (an unresolved endpoint, a chain after a backward step):
      // compared by its absence.
      case 'step':
        return statement.step.sequence ? [{ type: 'step', step: reportedStepContent(statement.step) }] : [];
      case 'chain':
        return statement.segments.every((s) => s.sequence)
          ? [{ type: 'chain', segments: statement.segments.map(reportedStepContent) }]
          : [];
      case 'parallel':
        // INV-4 exception: a `par` statement that contributes no LikeC4 step
        // (`par { }`, `par { opt { } }`) is dropped by LikeC4 (D40); the
        // library reports it with `inModel: false`, compared by its absence.
        if (!statement.inModel) return [];
        return [
          {
            type: 'parallel',
            ...(statement.title !== undefined && { title: statement.title }),
            statements: reportedStatements(statement.statements),
          },
        ];
      case 'opaque':
        if (statement.inModel === false) return [];
        // `try { } catch { } finally { }` is one `try` statement in LikeC4's parse.
        return [{ type: 'opaque', keyword: statement.keyword }];
    }
  });
}

/** A library view and the LikeC4 view it is compared with. */
interface ViewPair<V> {
  actual: V;
  expected: ParsedViewEntry;
  name: string;
}

/**
 * Pair the library's views with LikeC4's parsed views of `files`, file by
 * file in declaration order (the library's by source offset).  Views the
 * library marks `inModel: false` are not paired:
 *
 * INV-4 exception: a view without a body (`view v`, `dynamic view d`) is not
 * turned into a view by LikeC4 — compared by its absence: no parsed view of
 * its file carries its id, and the library reports no rules and no steps.
 */
async function pairViews<V extends Pick<ReportedView, 'id' | 'file' | 'sourceRange' | 'inModel'>>(
  views: V[],
  files: Record<string, string>,
): Promise<ViewPair<V>[]> {
  const parsed = await parsedViews(files);
  const pairs: ViewPair<V>[] = [];
  expect([...new Set(views.map((v) => v.file))].filter((f) => !(f in files)), 'files of the reported views').toEqual([]);
  for (const file of Object.keys(files)) {
    const reported = views.filter((v) => v.file === file).sort((a, b) => a.sourceRange.offset - b.sourceRange.offset);
    const expected = parsed.filter((p) => p.file === file);
    for (const view of reported.filter((v) => !v.inModel)) {
      const name = `${file}: view ${view.id ?? '(unnamed)'}`;
      expect(
        expected.some((p) => p.view.id === view.id),
        `${name} has no body: LikeC4 builds no view from it`,
      ).toBe(false);
      const reportedView = view as unknown as Partial<ReportedView>;
      if (reportedView.rules !== undefined) expect(reportedView.rules, `${name} rules`).toEqual([]);
      if (reportedView.steps !== undefined) expect(reportedView.steps, `${name} steps`).toEqual([]);
    }
    const inModel = reported.filter((v) => v.inModel);
    expect(
      inModel.map((v) => v.id ?? '(unnamed)'),
      `${file}: views LikeC4 parsed`,
    ).toEqual(expected.map((p) => (p.named ? p.view.id : '(unnamed)')));
    inModel.forEach((actual, i) => pairs.push({ actual, expected: expected[i]!, name: `${file}: view ${actual.id ?? expected[i]!.view.id}` }));
  }
  return pairs;
}

/**
 * LikeC4's own rules of a view: its parsed rules without the block-level
 * styles.
 *
 * INV-4 exception: LikeC4 prepends the rules of the enclosing
 * `views { style … }` block to every element and dynamic view of the block;
 * they are not the view's rules, and are compared after removing them from
 * LikeC4's list.  That they are prepended is asserted here.
 */
function ownRules(entry: ParsedViewEntry, name: string): unknown[] {
  const prefix = entry.view.rules.slice(0, entry.prepended.length);
  expect(prefix, `${name}: block-level styles prepended by LikeC4`).toEqual(entry.prepended);
  return entry.view.rules.slice(entry.prepended.length);
}

/**
 * Assert that the library's rules of `views` — every declared view of
 * `files` — equal LikeC4's parsed rules (US-2, US-3), view by view: rule
 * kinds in order; include / exclude items with their structure, references
 * as resolved and `with` / `where` contents; `autoLayout` values; opaque
 * stage-6 rules by kind.  Exceptions (INV-4): block-level styles removed from
 * LikeC4's list; D34 constructs LikeC4 drops; D18 written style values;
 * bodyless views by absence; source-only fields (index, text, ranges, kind
 * form, `#`) ignored.
 */
export async function expectRulesAgreeWithLikeC4(views: ReportedViewRules[], files: Record<string, string>): Promise<void> {
  for (const { actual, expected, name } of await pairViews(views, files)) {
    expect(actual.type, `${name} type`).toBe(expected.view._type);
    expectSameRules(actual.rules, ownRules(expected, name), actual.type, name);
  }
}

/**
 * Assert that the library's steps of `views` — every declared view of
 * `files` — equal LikeC4's parsed steps (US-4) one to one: statement
 * structure (step, chain, `par` with its statements, stage-6 block by
 * kind), and for each step its source, target, backward flag, title, kind,
 * body properties and its position in LikeC4's computed sequence
 * (`step-NN[:par.MM]`).  Exceptions (INV-4): a `par` statement contributing
 * no LikeC4 step compared by its absence; D18 written style values;
 * bodyless views by absence; source-only fields ignored.
 */
export async function expectStepsAgreeWithLikeC4(views: ReportedViewSteps[], files: Record<string, string>): Promise<void> {
  const computed = await computedViews(files);
  for (const { actual, expected, name } of await pairViews(views, files)) {
    expect(actual.type, `${name} type`).toBe(expected.view._type);
    if (expected.view._type !== 'dynamic') {
      expect(actual.steps ?? [], `${name} steps`).toEqual([]);
      continue;
    }
    const edges = computed[expected.view.id]?.steps ?? [];
    expect(
      reportedStatements(actual.steps ?? []),
      `${name} steps`,
    ).toEqual(expectedStatements(computedIcon(expected.view.steps ?? []) as LikeC4StepNode[], edges, name));
  }
}

/**
 * Assert that `views` — every view declaration the library reports for
 * `files` — equal LikeC4's per-document parsed views field by field (US-1 to
 * US-4, INV-4): type; id (named views); `of`, `extends`; title and folder;
 * description; tags in LikeC4's order (D39); links; rules as
 * {@link expectRulesAgreeWithLikeC4}; steps as
 * {@link expectStepsAgreeWithLikeC4}.  Every exception of INV-4 is applied
 * (see the labelled branches); LikeC4's `variant` and `order` are not
 * fields of the library's views.  `files` are expected to have no LikeC4
 * errors.
 */
export async function expectViewsAgreeWithLikeC4(views: ReportedView[], files: Record<string, string>): Promise<void> {
  for (const { actual, expected, name } of await pairViews(views, files)) {
    const lc4 = expected.view;
    expect(actual.type, `${name} type`).toBe(lc4._type);
    expect(actual.of && resolved(actual.of), `${name} of`).toBe(lc4.viewOf);
    expect(actual.extends && resolved(actual.extends), `${name} extends`).toBe(lc4.extends);
    // INV-4 exception: the folder prefix of titles.  LikeC4 writes
    // `<folder> / <title or id>` (LS:6414-6417); the library reports the
    // title and the folder separately, so its values are mapped onto
    // LikeC4's title, and its folder must be present exactly when LikeC4's
    // AST has one.
    expect(actual.folder !== undefined, `${name} folder present`).toBe(expected.folder !== undefined);
    const title = actual.folder !== undefined ? `${actual.folder} / ${actual.title || lc4.id}` : (actual.title ?? null);
    expect(title, `${name} title`).toBe(lc4.title);
    expect(actual.description ?? null, `${name} description`).toEqual(lc4.description);
    expect(actual.tags ?? null, `${name} tags`).toEqual(lc4.tags);
    // A link is its URL and title (US-1); LikeC4's `relative` is derived from the document path.
    expect(
      actual.links?.map((l) => (l.label === undefined ? { url: l.url } : { url: l.url, title: l.label })) ?? null,
      `${name} links`,
    ).toEqual(lc4.links?.map((l) => (l.title === undefined ? { url: l.url } : { url: l.url, title: l.title })) ?? null);
  }
  await expectRulesAgreeWithLikeC4(views, files);
  await expectStepsAgreeWithLikeC4(views, files);
}
