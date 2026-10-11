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
  style?: ReportedStyle;
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
  style?: ReportedStyle;
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

/** Assert one reported deployment node or instance against its expected values; `id` names it in failures. */
function expectSameDeploymentValues(
  actual: ReportedDeploymentElement,
  expected: Omit<ReportedDeploymentElement, 'id'>,
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
  expect(actual.style, `${id} style`).toEqual(expected.style);
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
 *   style), opacity `N` as `'N%'`; no theme defaults.
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
        style: reportedStyle(node.style),
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
 *   instance's, opacity `N` as `'N%'`.
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
        style: reportedStyle({ ...element.style, ...instance.style }),
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
