// Spike (lc4m-15.31, stage 2): can LikeC4's in-memory language services report
// error diagnostics and compute/lay out views from a plain Node process (not vitest),
// with only the package's runtime dependencies? Run: npx tsx docs/plan/lc4m-15.31/spikes/01-semantic-validate-node.ts
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { URI } from 'langium';

const WORKSPACE = 'file:///spike/workspace';

async function check(files: Record<string, string>) {
  const started = Date.now();
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
  const folder = { name: 'spike', uri: WORKSPACE };
  services.shared.workspace.WorkspaceManager.initialize({ capabilities: {}, processId: null, rootUri: folder.uri, workspaceFolders: [folder] });
  await services.shared.workspace.WorkspaceManager.initializeWorkspace([folder]);
  const docs = Object.entries(files).map(([name, text]) => {
    const d = services.shared.workspace.LangiumDocumentFactory.fromString(text, URI.parse(`${WORKSPACE}/src/${name}`));
    services.shared.workspace.LangiumDocuments.addDocument(d);
    return d;
  });
  await services.shared.workspace.DocumentBuilder.build(docs, { validation: true });
  const errors = services.likec4.LanguageServices.getErrors().map((e) => ({ file: e.sourceFsPath, line: e.line + 1, message: e.message }));
  const tBuild = Date.now() - started;
  let views = 0;
  let layoutError: string | undefined;
  try {
    views = (await services.likec4.LanguageServices.diagrams()).length;
  } catch (e) {
    layoutError = e instanceof Error ? e.message : String(e);
  }
  return { errors, views, layoutError, msBuild: tBuild, msTotal: Date.now() - started };
}

const valid = {
  'a.likec4': `specification { element system }\nmodel { app = system 'App' { api = system } }\nviews { view index { include * } }\n`,
};
const invalid = {
  'a.c4': `specification { element system }\nmodel { app = system 'App' }\n`,
  'b.like-c4': `model { app -> ghost 'calls' }\nviews { view v { include nothing } }\n`,
};

console.log('valid  ', JSON.stringify(await check(valid)));
console.log('invalid', JSON.stringify(await check(invalid)));
