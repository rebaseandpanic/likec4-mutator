/**
 * Shared spike helper: builds in-memory `.c4` files with LikeC4 1.59.4's own
 * language services (linking, validation, ModelBuilder), the same way
 * tests/helpers/likec4-model.ts does, and exposes the computed model.
 */
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { URI } from 'langium';

const WORKSPACE = 'file:///test/workspace';
const SOURCES = '/test/workspace/src/';

export async function build(files: Record<string, string>) {
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
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(text, URI.parse(`${WORKSPACE}/src/${name}`));
    services.shared.workspace.LangiumDocuments.addDocument(document);
    return document;
  });
  await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
  const diagnostics = documents.flatMap((d) =>
    (d.diagnostics ?? []).map(
      (x) => `${x.severity === 1 ? 'ERROR' : 'warn'} ${d.uri.path.slice(SOURCES.length)}:${x.range.start.line + 1}: ${x.message.split('\n')[0]}`,
    ),
  );
  const model = await services.likec4.ModelBuilder.computeModel();
  return { services, diagnostics, model: model as any };
}

/** Print a compact JSON line. */
export function show(label: string, value: unknown): void {
  console.log(`${label}: ${JSON.stringify(value)}`);
}

/** Effective (LikeC4Model getter) values of a deployment element. */
export function effective(el: any) {
  if (!el) return null;
  const base: Record<string, unknown> = {
    id: el.id,
    title: el.title,
    summary: el.summary?.text ?? el.summary?.md ?? null,
    description: el.description?.text ?? el.description?.md ?? null,
    technology: el.technology,
    tags: [...el.tags],
    links: el.links,
    metadata: el.metadata,
  };
  if (el.isInstance?.()) base.element = el.element.id;
  if (el.isDeploymentNode?.()) base.kind = el.kind;
  return base;
}
