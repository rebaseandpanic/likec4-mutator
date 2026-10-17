/**
 * Reference snapshots: every reference of a workspace with what it links to,
 * keyed so that the same surviving reference can be paired across a write.
 *
 * A write must not change what a surviving reference links to (a new name
 * can make a reference ambiguous, unresolved or re-targeted).  The snapshot
 * taken before a write is compared with the one taken after it:
 *
 *  - **Records.**  One record per entry of the reference catalogue (see
 *    `buildReferenceCatalogue`): every reference kind of FR-001, view bodies,
 *    `navigateTo` in every container, `extends`, `views`-block style
 *    targets, `global` references and imports included.
 *  - **Key.**  A reference is keyed by its file, its frame path, its kind
 *    (the catalogue entry's description), its text and its occurrence among
 *    the references with the same key prefix.  The frame path lists every
 *    enclosing block that bears on resolution, from the top-level block
 *    inwards, each as a descriptor (`model`, `deployment`, `views`,
 *    `el:<fqn>`, `extend:<target>`, `node:<id>`, `inst:<id>`,
 *    `dextend:<path>`, `view:<name>`) with its ordinal among the siblings
 *    with the same descriptor in the parent frame.  So equal reference texts
 *    in two `extend` scopes, and repeated same-target `extend` blocks, keep
 *    distinct keys.  A step's key has no path, so a step moved into or out
 *    of a `par` block keeps its key.
 *  - **Removal.**  A removing write passes the AST nodes it deletes; the
 *    references inside them are left out, and ordinals count the surviving
 *    items only, so a survivor keeps its key.
 *  - **Comparison.**  Every surviving reference must find its key after the
 *    write, and every reference found only after the write must lie in text
 *    the write inserted; anything else is an internal error.  A survivor
 *    that resolved before and now resolves differently is a change.
 */
import { readStrictFqnRef } from './fqn.js';
import type { DeploymentIndex } from './deployment-index.js';
import type { CatalogueEntry, ReferenceCatalogue } from './reference-catalogue.js';

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
  /** Offset of the written reference */
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

/** Structural view of an AST node. */
interface AstLike {
  $type?: string;
  $cstNode?: { offset: number };
  name?: string;
  [k: string]: unknown;
}

/**
 * Take the reference snapshot of the references of `catalogue`.
 *
 * @param catalogue   - Reference catalogue of the workspace
 * @param deployments - Deployment index of the same generation (frame descriptors of nodes and instances)
 * @param removed     - AST nodes the write deletes (taken before the write);
 *                      the references inside them are not surviving
 */
export function takeReferenceSnapshot(
  catalogue: ReferenceCatalogue,
  deployments: DeploymentIndex,
  removed: ReadonlySet<object> = new Set(),
): ReferenceSnapshot {
  const ids = new Map<object, string>();
  for (const id of deployments.ids()) {
    for (const declaration of deployments.declarations(id)) ids.set(declaration.node, id);
  }
  const byDocument = new Map<number, CatalogueEntry[]>();
  for (const entry of catalogue.entries()) {
    const list = byDocument.get(entry.document);
    if (list) list.push(entry);
    else byDocument.set(entry.document, [entry]);
  }

  const records: ReferenceRecord[] = [];
  const byKey = new Map<string, ReferenceRecord>();
  catalogue.documents.forEach(({ file, ast }, document) => {
    const framesOf = new Map<object, readonly string[]>();
    walk(ast as AstLike, [], new Map(), '', (node, frames) => framesOf.set(node, frames));
    const occurrences = new Map<string, number>();
    for (const entry of byDocument.get(document) ?? []) {
      const frames = framesOf.get(anchor(entry.node as AstLike));
      if (frames === undefined) continue; // inside a removed node
      const prefix = JSON.stringify([file, frames, entry.description, entry.text]);
      const occurrence = occurrences.get(prefix) ?? 0;
      occurrences.set(prefix, occurrence + 1);
      const record: ReferenceRecord = {
        key: `${prefix}#${occurrence}`,
        file,
        role: entry.description,
        text: entry.text,
        target: referenceTarget(entry),
        offset: entry.offset,
      };
      records.push(record);
      byKey.set(record.key, record);
    }
  });
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

/** The properties of a frame-opening node that hold its header references, outside its own frame. */
const HEADER_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  DeployedInstance: ['target'],
  ExtendElement: ['element'],
  ExtendDeployment: ['deploymentNode'],
  ElementView: ['viewOf', 'extends'],
};

/**
 * The node whose enclosing frames key the reference `node`: the construct
 * when the reference is in its header (`instanceOf`, `extend` targets, view
 * `of` and `extends`), so that an unnamed instance's id, which follows its
 * `instanceOf`, does not key its own target; the reference itself otherwise.
 */
function anchor(node: AstLike): AstLike {
  for (let child = node, up = node['$container'] as AstLike | undefined; up; child = up, up = up['$container'] as AstLike | undefined) {
    const header = HEADER_PROPERTIES[up.$type ?? ''];
    if (header?.some((property) => up![property] === child)) return up;
  }
  return node;
}

/**
 * The snapshot target of a catalogue entry.  A logical element reached from
 * the deployment model or a deployment view is shown as `element '…'`, as
 * the deployment messages name it.
 */
function referenceTarget(entry: CatalogueEntry): ReferenceTarget | undefined {
  const target = entry.target;
  if (target === undefined) return undefined;
  if ('view' in target) return { key: `view:${target.view}`, display: `view '${target.view}'` };
  if ('model' in target) {
    const deploymentPlace = entry.role === 'deployment-relationship-endpoint' || entry.view?.type === 'deployment';
    return { key: `element:${target.model}`, display: deploymentPlace ? `element '${target.model}'` : `'${target.model}'` };
  }
  if (target.element === undefined) return { key: `deployment:${target.deployment}`, display: `'${target.deployment}'` };
  return {
    key: `deployment:${target.deployment}/element:${target.element}`,
    display: `'${target.deployment}' (element '${target.element}')`,
  };
}
