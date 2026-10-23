/**
 * The LikeC4 check: what `likec4 validate` of LikeC4 1.60.0 reports for a set
 * of in-memory files, computed with LikeC4's own language services.
 *
 * The command (`validate` in `likec4/dist/cli/index.mjs`) loads the
 * workspace, builds every document with validation and fails on every
 * diagnostic of severity error (`LikeC4.getErrors()`; warnings never fail
 * it), then — unless `--no-layout` — computes and lays out the views
 * (`LikeC4.diagrams()`), failing on an exception escaping that step.  A view
 * LikeC4 fails to lay out is only logged.  The check does the same with
 * fresh services per call; manual layouts are not read, so the command's
 * layout-drift failure cannot occur.
 *
 * Internal module: the package entry exports only {@link ValidationRecord},
 * the record of `LikeC4Mutator.validateModel`, which runs this check.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';
import { URI, UriUtils } from 'langium';

/** One failure of the check. */
export interface ValidationRecord {
  /** `language-services`: an error diagnostic; `views`: an exception escaping view computation and layout */
  origin: 'language-services' | 'views';
  message: string;
  /** The file name as loaded (located records only) */
  file?: string;
  /** 1-based line of the diagnostic's range start (located records only) */
  line?: number;
  /** 1-based column of the diagnostic's range start (located records only) */
  column?: number;
}

export interface LikeC4CheckOptions {
  /** Compute and lay out the views (default `true`), as `likec4 validate` without `--no-layout` */
  layout?: boolean;
  /**
   * Top-level folders of the files to register as projects of that name (as
   * a `likec4.config.json` in each would), so that `import` between them
   * resolves; the views of every named project are laid out.
   */
  projects?: readonly string[];
}

const WORKSPACE = URI.parse('file:///workspace');
const SOURCES = UriUtils.joinPath(WORKSPACE, 'src');

/**
 * The document URI of a loaded file name (or of a project folder): one path
 * segment per `/`-separated part, so any other character stays in its
 * segment.  Every segment gets the prefix `_` because joining normalizes
 * empty, `.` and `..` segments, which would give two distinct names one URI
 * (`a//b.c4` and `a/b.c4`, `a/../b.c4` and `b.c4`); with the prefix no
 * segment is special, and the prefix being the same for all keeps the
 * documents in the order of their names.
 */
function documentUri(name: string): URI {
  return UriUtils.joinPath(SOURCES, ...name.split('/').map((segment) => `_${segment}`));
}

/** LSP severity of an error diagnostic. */
const ERROR_SEVERITY = 1;

/**
 * Run the check on `files` (file name → source).  Records are the error
 * diagnostics in document order, then at most one unlocated `views` record.
 * Console output written by LikeC4's code while the check runs is discarded.
 */
export async function checkLikeC4(files: Record<string, string>, options: LikeC4CheckOptions = {}): Promise<ValidationRecord[]> {
  return withConsoleDiscarded(() => runCheck(files, options));
}

async function runCheck(files: Record<string, string>, options: LikeC4CheckOptions): Promise<ValidationRecord[]> {
  const services = createLanguageServices({ ...NoFileSystem, ...NoLikeC4ManualLayouts }).likec4;
  const workspace = services.shared.workspace;
  const folder = { name: 'workspace', uri: WORKSPACE.toString() };
  workspace.WorkspaceManager.initialize({ capabilities: {}, processId: null, rootUri: folder.uri, workspaceFolders: [folder] });
  await workspace.WorkspaceManager.initializeWorkspace([folder]);
  const projects = options.projects ?? [];
  for (const name of projects) {
    await workspace.ProjectsManager.registerProject({ config: { name }, folderUri: documentUri(name) });
  }

  const names = new Map<string, string>();
  const documents = Object.entries(files).map(([name, text]) => {
    const uri = documentUri(name);
    names.set(uri.toString(), name);
    const document = workspace.LangiumDocumentFactory.fromString(text, uri);
    workspace.LangiumDocuments.addDocument(document);
    return document;
  });
  await workspace.DocumentBuilder.build(documents, { validation: true });

  const records: ValidationRecord[] = [];
  for (const document of workspace.LangiumDocuments.userDocuments) {
    const file = names.get(document.uri.toString());
    if (file === undefined) continue;
    for (const diagnostic of document.diagnostics ?? []) {
      if (diagnostic.severity !== ERROR_SEVERITY) continue;
      records.push({
        origin: 'language-services',
        // LSP 3.18 allows a markup message; its text is the message.
        message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
        file,
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
      });
    }
  }

  if (options.layout !== false) {
    type ProjectId = Parameters<typeof services.likec4.LanguageServices.diagrams>[0];
    const projectIds: ProjectId[] = projects.length > 0 ? projects.map((p) => p as ProjectId) : [undefined];
    try {
      for (const projectId of projectIds) await services.likec4.LanguageServices.diagrams(projectId);
    } catch (e) {
      records.push({ origin: 'views', message: e instanceof Error ? e.message : String(e) });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------

const CONSOLE_METHODS = ['debug', 'dir', 'error', 'info', 'log', 'table', 'trace', 'warn'] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];

/** Set inside the async context of a running check. */
const insideCheck = new AsyncLocalStorage<true>();

/** The console methods replaced while at least one check runs, and how many run. */
let capture: { originals: Record<ConsoleMethod, Console[ConsoleMethod]>; wrappers: Record<ConsoleMethod, Console[ConsoleMethod]>; active: number } | undefined;

/**
 * Run `work` with console output of its own async context discarded.  The
 * console methods are wrapped while any check runs; a call made outside every
 * check's context (the caller's own output, also during an overlapping check)
 * goes to the original method.  The last check to finish restores the
 * originals, on every exit path, unless something else has replaced a method
 * since.
 */
async function withConsoleDiscarded<T>(work: () => Promise<T>): Promise<T> {
  if (!capture) {
    const originals = {} as Record<ConsoleMethod, Console[ConsoleMethod]>;
    const wrappers = {} as Record<ConsoleMethod, Console[ConsoleMethod]>;
    for (const method of CONSOLE_METHODS) {
      const original = console[method];
      originals[method] = original;
      wrappers[method] = function (this: Console, ...args: unknown[]): void {
        if (insideCheck.getStore()) return;
        (original as (...a: unknown[]) => void).apply(this, args);
      } as Console[ConsoleMethod];
      console[method] = wrappers[method] as never;
    }
    capture = { originals, wrappers, active: 0 };
  }
  const current = capture;
  current.active++;
  try {
    return await insideCheck.run(true, work);
  } finally {
    current.active--;
    if (current.active === 0) {
      for (const method of CONSOLE_METHODS) {
        if (console[method] === current.wrappers[method]) console[method] = current.originals[method] as never;
      }
      capture = undefined;
    }
  }
}
