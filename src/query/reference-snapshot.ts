/**
 * Reference snapshots: every reference of a workspace with what it links to,
 * keyed so that the same surviving reference can be paired across a write.
 *
 * A write must not change what a surviving reference links to (a new name
 * can make a reference ambiguous, unresolved or re-targeted).  The snapshot
 * taken before a write is compared with the one taken after it:
 *
 *  - **Key.**  A reference is keyed by its file, its frame path, its role,
 *    its text and its occurrence among the references with the same key
 *    prefix.  The frame path lists every enclosing block that bears on
 *    resolution, from the top-level block inwards, each as a descriptor
 *    (`model`, `deployment`, `views`, `el:<fqn>`, `extend:<target>`,
 *    `node:<id>`, `inst:<id>`, `dextend:<path>`, `view:<name>`) with its
 *    ordinal among the siblings with the same descriptor in the parent
 *    frame.  So equal reference texts in two `extend` scopes, and repeated
 *    same-target `extend` blocks, keep distinct keys.
 *  - **Removal.**  A removing write passes the AST nodes it deletes; the
 *    references inside them are left out, and ordinals count the surviving
 *    items only, so a survivor keeps its key.
 *  - **Comparison.**  Every surviving reference must find its key after the
 *    write, and every reference found only after the write must lie in text
 *    the write inserted; anything else is an internal error.  A survivor
 *    that resolved before and now resolves differently is a change.
 *
 * References covered: logical relationship endpoints, `extend a -> b`
 * endpoints, `extend X` targets and view `of` targets (see
 * `resolveDocumentReferences`); `instanceOf` targets, deployment
 * relationship endpoints (including the element part of an endpoint that
 * steps into an instance's element), `extend <node>` targets and the
 * references of deployment view rules (see `DeploymentResolver`).  With the
 * opt-in `views` option (taken by view writes only, so existing writes keep
 * their behaviour): the element references in the bodies of element and
 * dynamic views (rules, step endpoints), every `navigateTo` and every
 * `extends` (see `ViewReferenceResolver`).  A step's key has no path, so a
 * step moved into or out of a `par` block keeps its key.
 */
import { readStrictFqnRef, resolveFqnRef } from './fqn.js';
import type { DeploymentIndex } from './deployment-index.js';
import { DeploymentResolver, type LinkedTarget } from './deployment-resolver.js';
import type { ViewDeclaration, ViewIndex } from './view-index.js';
import { ViewReferenceResolver, type ViewTargetRole } from './view-resolver.js';
import { resolveDocumentReferences, type WorkspaceDocumentAst, type WorkspaceIndex } from './workspace-index.js';

/** What a reference links to. */
export interface ReferenceTarget {
  /** Identity of the target; equal keys mean the same target */
  key: string;
  /** The target for messages, quoted, e.g. `'app.api'` */
  display: string;
}

/** One reference occurrence of a snapshot. */
export interface ReferenceRecord {
  /** Key that pairs the same reference across two snapshots */
  key: string;
  /** File the reference is written in */
  file: string;
  /** What the reference is, e.g. `relationship source`, `instanceOf target` */
  role: string;
  /** The reference as written */
  text: string;
  /** What it links to; undefined when it does not resolve */
  target: ReferenceTarget | undefined;
  /** Offset of the AST node the reference is written in */
  offset: number | undefined;
}

/** Every surviving reference of a workspace at one point in time. */
export interface ReferenceSnapshot {
  records: readonly ReferenceRecord[];
  byKey: ReadonlyMap<string, ReferenceRecord>;
}

/** A range of a file's text, `[offset, end)`. */
export interface TextRange {
  offset: number;
  end: number;
}

/** A surviving reference that a write re-targeted or left unresolved. */
export interface ReferenceChange {
  file: string;
  role: string;
  text: string;
  /** What it linked to before the write */
  before: ReferenceTarget;
  /** What it links to after the write; undefined when it no longer resolves */
  after: ReferenceTarget | undefined;
}

/** A document of the workspace. */
export interface SnapshotDocument {
  file: string;
  ast: WorkspaceDocumentAst;
}

/** Options of {@link takeReferenceSnapshot}. */
export interface ReferenceSnapshotOptions {
  /**
   * The view index of the same documents: also snapshot the references of
   * view bodies, `navigateTo` and `extends` (INV-8).  Opt-in: an existing
   * write that changes such a reference is not rejected (INV-7).
   */
  views?: ViewIndex;
}

/** Structural view of an AST node. */
interface AstLike {
  $type?: string;
  $cstNode?: { offset: number };
  name?: string;
  [k: string]: unknown;
}

/** A reference attached to the AST node it is written in. */
interface Attached {
  role: string;
  text: string;
  target: ReferenceTarget | undefined;
}

/**
 * Take the reference snapshot of `documents`.
 *
 * @param documents   - Every loaded document
 * @param workspace   - Element index of the same documents
 * @param deployments - Deployment index of the same documents
 * @param removed     - AST nodes the write deletes (taken before the write);
 *                      the references inside them are not surviving
 * @param options     - `views`: include the view references
 */
export function takeReferenceSnapshot(
  documents: Iterable<SnapshotDocument>,
  workspace: WorkspaceIndex,
  deployments: DeploymentIndex,
  removed: ReadonlySet<object> = new Set(),
  options: ReferenceSnapshotOptions = {},
): ReferenceSnapshot {
  const attached = new Map<object, Attached[]>();
  const attach = (node: object, reference: Attached): void => {
    const list = attached.get(node);
    if (list) list.push(reference);
    else attached.set(node, [reference]);
  };

  const ids = new Map<object, string>();
  const resolver = new DeploymentResolver(deployments, workspace);
  for (const id of deployments.ids()) {
    for (const declaration of deployments.declarations(id)) {
      ids.set(declaration.node, id);
      if (declaration.type !== 'instance') continue;
      const ref = (declaration.node['target'] as { modelElement?: unknown } | undefined)?.modelElement;
      if (!ref) continue;
      const fqn = resolver.instanceElement(declaration.node);
      attach(declaration.node, { role: 'instanceOf target', text: resolveFqnRef(ref), target: fqn === undefined ? undefined : element(fqn) });
    }
  }
  for (const relation of deployments.relations()) {
    for (const role of ['source', 'target'] as const) {
      const ref = relation.node[role];
      if (!ref) continue;
      attach(relation.node, {
        role: `deployment relationship ${role}`,
        text: resolveFqnRef(ref),
        target: linked(resolver.resolveReference(ref as Parameters<DeploymentResolver['resolveReference']>[0])),
      });
    }
  }
  for (const extend of deployments.allExtendBlocks()) {
    const path = resolver.extendTarget(extend);
    attach(extend.node, { role: 'deployment extend target', text: extend.target, target: path === undefined ? undefined : deployment(path) });
  }
  deployments.documents.forEach((_, document) => {
    for (const reference of resolver.viewReferences(document)) {
      attach(reference.node, { role: 'deployment view reference', text: reference.text, target: linked(reference.target) });
    }
  });
  if (options.views) attachViewReferences(options.views, workspace, deployments, attach);

  const records: ReferenceRecord[] = [];
  const byKey = new Map<string, ReferenceRecord>();
  for (const { file, ast } of documents) {
    for (const reference of resolveDocumentReferences(ast, workspace)) {
      attach(reference.node, {
        role: reference.role,
        text: reference.text,
        target: reference.fqn === undefined ? undefined : element(reference.fqn),
      });
    }
    const occurrences = new Map<string, number>();
    walk(ast as unknown as AstLike, [], new Map(), '', (node, frames) => {
      for (const reference of attached.get(node) ?? []) {
        const prefix = JSON.stringify([file, frames, reference.role, reference.text]);
        const occurrence = occurrences.get(prefix) ?? 0;
        occurrences.set(prefix, occurrence + 1);
        const record: ReferenceRecord = {
          key: `${prefix}#${occurrence}`,
          file,
          role: reference.role,
          text: reference.text,
          target: reference.target,
          offset: node.$cstNode?.offset,
        };
        records.push(record);
        byKey.set(record.key, record);
      }
    });
  }
  return { records, byKey };

  /**
   * Visit the AST nodes below `node` that are not removed, with the frame
   * path that encloses each.  `counters` counts the frame descriptors already
   * seen in the enclosing frame; `owner` is the FQN that prefixes the names
   * of elements declared directly in it.
   */
  function walk(
    node: AstLike,
    frames: readonly string[],
    counters: Map<string, number>,
    owner: string,
    visit: (node: AstLike, frames: readonly string[]) => void,
  ): void {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (!child || typeof child !== 'object' || '$refText' in child || !('$type' in child)) continue;
        if (removed.has(child)) continue;
        const item = child as AstLike;
        visit(item, frames);
        const frame = describeFrame(item, owner);
        if (frame === undefined) {
          walk(item, frames, counters, owner, visit);
          continue;
        }
        const ordinal = counters.get(frame.descriptor) ?? 0;
        counters.set(frame.descriptor, ordinal + 1);
        walk(item, [...frames, `${frame.descriptor}#${ordinal}`], new Map(), frame.owner ?? owner, visit);
      }
    }
  }

  /** The frame `node` opens, with the FQN owning the elements declared in it; undefined when it opens none. */
  function describeFrame(node: AstLike, owner: string): { descriptor: string; owner?: string } | undefined {
    switch (node.$type) {
      case 'Model':
        return { descriptor: 'model', owner: '' };
      case 'ModelDeployments':
        return { descriptor: 'deployment' };
      case 'ModelViews':
        return { descriptor: 'views' };
      case 'Element': {
        const fqn = owner ? `${owner}.${node.name ?? ''}` : (node.name ?? '');
        return { descriptor: `el:${fqn}`, owner: fqn };
      }
      case 'ExtendElement': {
        const target = readStrictFqnRef(node['element']) ?? '';
        return { descriptor: `extend:${target}`, owner: target };
      }
      case 'DeploymentNode':
        return { descriptor: `node:${ids.get(node) ?? node.name ?? ''}` };
      case 'DeployedInstance':
        return { descriptor: `inst:${ids.get(node) ?? node.name ?? ''}` };
      case 'ExtendDeployment':
        return { descriptor: `dextend:${readStrictFqnRef(node['deploymentNode']) ?? ''}` };
      case 'ElementView':
      case 'DynamicView':
      case 'DeploymentView':
        return { descriptor: `view:${node.name ?? ''}` };
      default:
        return undefined;
    }
  }
}

/**
 * The surviving references of `before` whose target changed in `after`.
 * References that did not resolve before are not considered: a write does
 * not change them.
 *
 * The references of one key prefix (file, frames, role, text) are paired in
 * order.  A reference of `after` outside the inserted text is a survivor and
 * takes the next reference of `before`.  One inside it is the write's own,
 * unless the references of `before` still to be paired outnumber the
 * survivors still to come — text a write rewrites around its insertion (a
 * one-line body laid out again) holds survivors too.  So a reference
 * inserted before an equal one does not take its place.
 *
 * @param insertedRanges - Per file, the ranges of the post-write text that
 *                         the write inserted or rewrote
 * @throws {Error} (internal) when a surviving reference has no counterpart
 *   after the write, or a reference found only after the write lies outside
 *   the inserted text
 */
export function compareReferenceSnapshots(
  before: ReferenceSnapshot,
  after: ReferenceSnapshot,
  insertedRanges: ReadonlyMap<string, readonly TextRange[]>,
): ReferenceChange[] {
  const inserted = (record: ReferenceRecord): boolean =>
    (insertedRanges.get(record.file) ?? []).some(
      (range) => record.offset !== undefined && record.offset >= range.offset && record.offset < range.end,
    );
  const prefixOf = (record: ReferenceRecord): string => record.key.slice(0, record.key.lastIndexOf('#'));
  const group = (records: readonly ReferenceRecord[]): Map<string, ReferenceRecord[]> => {
    const groups = new Map<string, ReferenceRecord[]>();
    for (const record of records) {
      const list = groups.get(prefixOf(record));
      if (list) list.push(record);
      else groups.set(prefixOf(record), [record]);
    }
    return groups;
  };
  const was = group(before.records);
  const now = group(after.records);

  const changes: ReferenceChange[] = [];
  for (const [prefix, olds] of was) {
    const news = now.get(prefix) ?? [];
    // Once per group: which references lie in inserted text, and how many
    // outside it follow each position (one backward pass).
    const isInserted = news.map(inserted);
    const outsideAfter = new Array<number>(news.length + 1).fill(0);
    for (let i = news.length - 1; i >= 0; i--) outsideAfter[i] = outsideAfter[i + 1]! + (isInserted[i] ? 0 : 1);
    let next = 0;
    news.forEach((record, i) => {
      if (isInserted[i]) {
        if (olds.length - next <= outsideAfter[i + 1]!) return;
      } else if (next >= olds.length) {
        throw new Error(`Internal error: the ${record.role} '${record.text}' in '${record.file}' appeared outside the written text`);
      }
      const old = olds[next++]!;
      if (old.target !== undefined && record.target?.key !== old.target.key) {
        changes.push({ file: old.file, role: old.role, text: old.text, before: old.target, after: record.target });
      }
    });
    if (next < olds.length) {
      const old = olds[next]!;
      throw new Error(`Internal error: the ${old.role} '${old.text}' in '${old.file}' is not found after the write`);
    }
  }
  for (const [prefix, news] of now) {
    if (was.has(prefix)) continue;
    const outside = news.find((record) => !inserted(record));
    if (outside) {
      throw new Error(`Internal error: the ${outside.role} '${outside.text}' in '${outside.file}' appeared outside the written text`);
    }
  }
  return changes;
}

/** Step nodes: their element references are endpoints, their `navigateTo` a step's. */
const STEP_TYPES: ReadonlySet<string> = new Set(['Step', 'StepSeries']);

/**
 * Attach the view references of every declaration of `views`: `extends`
 * targets; the element references of element and dynamic view bodies
 * (`view rule reference`, or `view step endpoint` inside a step) — those of
 * deployment views are the `deployment view reference`s; every `navigateTo`
 * by its place (an element `with` accepts any view, a relation `with` and a
 * step a dynamic view).
 */
function attachViewReferences(
  views: ViewIndex,
  workspace: WorkspaceIndex,
  deployments: DeploymentIndex,
  attach: (node: object, reference: Attached) => void,
): void {
  const resolver = new ViewReferenceResolver(workspace, deployments, views);
  for (const view of views.declarations()) {
    const extendsNode = view.node.extends as AstLike | undefined;
    const extendsText = resolver.extendsText(view);
    if (extendsNode && extendsText !== undefined) {
      attach(extendsNode, { role: 'view extends', text: extendsText, target: viewTarget(resolver.resolveViewText(extendsText, 'element')) });
    }
    if (view.body) visit(view, view.body as AstLike, false);
  }

  function visit(view: ViewDeclaration, node: AstLike, inStep: boolean): void {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (!child || typeof child !== 'object' || '$refText' in child || !('$type' in child)) continue;
        const item = child as AstLike;
        if (item.$type === 'FqnRef') {
          if (view.type === 'deployment') continue;
          const fqn = resolver.resolveElementRef(view, item);
          attach(item, {
            role: inStep ? 'view step endpoint' : 'view rule reference',
            text: resolveFqnRef(item),
            target: fqn === undefined ? undefined : element(fqn),
          });
          continue;
        }
        if (item.$type === 'NavigateToProperty' || item.$type === 'RelationNavigateToProperty') {
          const ref = item['value'] as AstLike | undefined;
          const text = (ref?.['view'] as { $refText?: string } | undefined)?.$refText;
          if (ref && text !== undefined) {
            const [role, accepts]: [string, ViewTargetRole] =
              item.$type === 'NavigateToProperty'
                ? ['element with navigateTo', 'any']
                : inStep
                  ? ['step navigateTo', 'dynamic']
                  : ['relation with navigateTo', 'dynamic'];
            attach(ref, { role, text, target: viewTarget(resolver.resolveViewText(text, accepts)) });
          }
          continue;
        }
        visit(view, item, inStep || STEP_TYPES.has(item.$type ?? ''));
      }
    }
  }
}

function viewTarget(id: string | undefined): ReferenceTarget | undefined {
  return id === undefined ? undefined : { key: `view:${id}`, display: `view '${id}'` };
}

function element(fqn: string): ReferenceTarget {
  return { key: `element:${fqn}`, display: `'${fqn}'` };
}

function deployment(id: string): ReferenceTarget {
  return { key: `deployment:${id}`, display: `'${id}'` };
}

function linked(target: LinkedTarget | undefined): ReferenceTarget | undefined {
  if (target === undefined) return undefined;
  if ('model' in target) return { key: `element:${target.model}`, display: `element '${target.model}'` };
  if (target.element === undefined) return deployment(target.deployment);
  return {
    key: `deployment:${target.deployment}/element:${target.element}`,
    display: `'${target.deployment}' (element '${target.element}')`,
  };
}
