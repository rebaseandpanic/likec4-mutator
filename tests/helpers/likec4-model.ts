/**
 * Independent reference for tests: builds the LikeC4 model of a set of
 * in-memory `.c4` files with LikeC4's own language services (linking,
 * validation and `ModelBuilder`), the way the language server does for a
 * workspace.  Used to compare what the library reports against what LikeC4
 * computes from the same sources.
 */
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { URI } from 'langium';

/** Element data of the computed LikeC4 model, as far as the tests read it. */
export interface LikeC4ModelElement {
  tags?: readonly string[] | null;
  links?: ReadonlyArray<{ url: string; title?: string }> | null;
  metadata?: Record<string, string | string[]>;
}

/** Result of {@link buildLikeC4Model}. */
export interface LikeC4ModelResult {
  /** `<file>:<line>: <message>` for every diagnostic LikeC4 reported. */
  diagnostics: string[];
  /** Computed elements by FQN. */
  elements: Record<string, LikeC4ModelElement>;
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
  return { diagnostics, elements };
}
