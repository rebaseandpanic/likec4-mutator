/**
 * Shared spike helper for lc4m-15.29 (views).  Builds in-memory `.c4` files
 * with LikeC4 1.59.4's own language services (linking, validation,
 * ModelBuilder) the way tests/helpers/likec4-model.ts does, and exposes:
 *  - diagnostics of every severity (`ERROR`/`warn` + file:line + message),
 *  - the parsed model (`ModelBuilder.parseModel()`) and computed model
 *    (`ModelBuilder.computeModel()`),
 *  - `validate()`: the same check as `validateLikeC4` of the test helper
 *    (`LanguageServices.getErrors()` + `LanguageServices.diagrams()`), copied
 *    here because the helper imports vitest.
 * Also re-exports a fixture shared by the spikes.
 * Note: deployment views are absent from `model.$data.views`; read them from
 * `services.likec4.LanguageServices.diagrams()`.
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
  const parsed = (await services.likec4.ModelBuilder.parseModel()) as any;
  const model = (await services.likec4.ModelBuilder.computeModel()) as any;
  return { services, documents, diagnostics, parsed, model };
}

/** What `likec4 validate` reports (same as tests/helpers/likec4-model.ts validateLikeC4). */
export async function validate(files: Record<string, string>): Promise<string[]> {
  const { services } = await build(files);
  const errors = services.likec4.LanguageServices.getErrors().map(
    (e: any) => `${e.sourceFsPath.slice(SOURCES.length)}:${e.line + 1}: ${e.message}`,
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

/** Print a compact JSON line. */
export function show(label: string, value: unknown): void {
  console.log(`${label}: ${JSON.stringify(value)}`);
}

export const SPEC = `specification {
  element system
  element container
  element component
  element actor
  relationship async
  tag next
  tag deprecated
  deploymentNode env
  deploymentNode vm
}
`;

export const MODEL = `model {
  user = actor 'User'
  ext = system 'External'
  app = system 'App' {
    web = container 'Web'
    api = container 'API' {
      #next
    }
    db = container 'DB'
  }
  user -> app.web 'uses'
  app.web -> app.api 'calls'
  app.api -> app.db 'reads'
  app.api -[async]-> ext 'notifies'
}
deployment {
  env prod {
    vm vm1 {
      instanceOf app.api
      instanceOf app.db
    }
  }
}
`;
