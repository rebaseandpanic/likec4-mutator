/**
 * Rename and move of an element (lc4m-15.30 US-3): the substitution σ
 * (FR-010), the expected prefixes that pair a reference across the write
 * (the pairing rule of the plan), and the written form of a rewritten
 * reference (FR-011).
 *
 *  - **σ.**  Every FQN of the renamed or moved subtree maps to its FQN after
 *    the write; an instance written without a name takes its id from the
 *    last segment of its `instanceOf` text, so its id maps too when that
 *    segment changes (D97).  A deployment path under an instance maps its
 *    instance through the instance map and its element through the element
 *    map.  Every other target maps to itself.
 *  - **Expected prefix.**  A reference keeps its file, role and frame path
 *    across the write, with the frame descriptors that name elements
 *    (`el:`, `extend:`) mapped once the declarations are written and those
 *    that name instances (`inst:`) mapped once the `instanceOf` texts are
 *    rewritten; its text is the text written for it, or the old one.
 *  - **Written form.**  The old text when it resolves at its place to the
 *    new target; else the text with the segments that name a renamed part
 *    replaced — for a move, the segments up to the moved element written as
 *    its new path; else the full id of the new target; else none.
 *  - **Moved text.**  A moved declaration keeps its leading comments and is
 *    written at the indentation of its new place; a value LikeC4 resolves
 *    relative to the declaring file (an `icon` or a `link` starting with
 *    `./` or `../`, as LikeC4 1.59.4 tells relative paths apart) pins it to
 *    its file.
 */
import { commentRanges, multiLineTokenRanges } from '../parser/grammar.js';
import type { CatalogueEntry, CatalogueTarget, ReferenceCatalogue } from '../query/reference-catalogue.js';
import type { DeploymentIndex } from '../query/deployment-index.js';
import { referencePrefix, type ReferenceRecord } from '../query/reference-snapshot.js';
import type { WorkspaceIndex } from '../query/workspace-index.js';
import type { TextEdit } from './text-edit.js';

/** The substitution σ of a rename or move (FR-010). */
export class Substitution {
  /**
   * @param elements    - Old element FQN → new FQN, for every element of the subtree
   * @param deployments - Old instance id → new id, for the instances whose id changes (D97)
   */
  constructor(
    readonly elements: ReadonlyMap<string, string>,
    readonly deployments: ReadonlyMap<string, string>,
  ) {}

  element(fqn: string): string {
    return this.elements.get(fqn) ?? fqn;
  }

  deployment(id: string): string {
    return this.deployments.get(id) ?? id;
  }

  /** σ of a reference target. */
  target(target: CatalogueTarget): CatalogueTarget {
    if ('view' in target) return target;
    if ('model' in target) return { model: this.element(target.model) };
    if (target.element !== undefined) return { deployment: this.deployment(target.deployment), element: this.element(target.element) };
    return { deployment: this.deployment(target.deployment) };
  }

  /** Whether σ changes `target`. */
  changes(target: CatalogueTarget): boolean {
    return targetKey(this.target(target)) !== targetKey(target);
  }

  /** σ of a snapshot target key (`element:…`, `deployment:…`, `deployment:…/element:…`, `view:…`). */
  key(key: string): string {
    const path = /^deployment:(.*)\/element:(.*)$/.exec(key);
    if (path) return `deployment:${this.deployment(path[1]!)}/element:${this.element(path[2]!)}`;
    if (key.startsWith('element:')) return `element:${this.element(key.slice('element:'.length))}`;
    if (key.startsWith('deployment:')) return `deployment:${this.deployment(key.slice('deployment:'.length))}`;
    return key;
  }
}

/** An instance written without a name whose id σ changes (D97). */
export interface RenamedInstance {
  id: string;
  newId: string;
  /** The node it is declared in (an `extend` body counts as the extended node) */
  parentId: string | undefined;
  /** File of its declaration */
  file: string | undefined;
  /** Offset of its declaration */
  offset: number;
}

/**
 * The element part of σ: every FQN of the subtree of `fqn` (declared in a
 * body or an `extend` block of the workspace) mapped to the same path below
 * `newFqn`.
 */
export function elementSubstitution(workspace: WorkspaceIndex, fqn: string, newFqn: string): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (old: string): void => {
    map.set(old, newFqn + old.slice(fqn.length));
    for (const child of workspace.children(old)) visit(child);
  };
  visit(fqn);
  return map;
}

/**
 * The instances written without a name (`instanceOf a.b`) whose `instanceOf`
 * links into the domain of `elements` and whose id changes, because the last
 * segment of the element's FQN changes: LikeC4 names such an instance after
 * that segment (spike 05, D97).
 */
export function renamedInstances(
  catalogue: ReferenceCatalogue,
  deployments: DeploymentIndex,
  elements: ReadonlyMap<string, string>,
): RenamedInstance[] {
  const declarationOf = new Map<object, { id: string; parentId?: string; file?: string }>();
  for (const id of deployments.ids()) {
    for (const declaration of deployments.declarations(id)) declarationOf.set(declaration.node, declaration);
  }
  const renamed: RenamedInstance[] = [];
  for (const entry of catalogue.entries()) {
    if (entry.role !== 'instance-of' || entry.target === undefined || !('model' in entry.target)) continue;
    const newFqn = elements.get(entry.target.model);
    if (newFqn === undefined || lastSegment(newFqn) === lastSegment(entry.target.model)) continue;
    const instance = entry.node.$container?.$container;
    if (!instance || instance['name'] !== undefined) continue;
    const declaration = declarationOf.get(instance);
    if (!declaration) continue;
    const newName = lastSegment(newFqn);
    renamed.push({
      id: declaration.id,
      newId: declaration.parentId === undefined ? newName : `${declaration.parentId}.${newName}`,
      parentId: declaration.parentId,
      file: declaration.file,
      offset: instance.$cstNode?.offset ?? entry.offset,
    });
  }
  return renamed;
}

/** How far a write has got, for the expected prefix of a reference (see {@link expectedPrefix}). */
export interface PairingStage {
  sigma: Substitution;
  /** The declarations are written: frames that name elements (`el:`, `extend:`) are σ-mapped */
  declarations: boolean;
  /** The `instanceOf` texts are rewritten: frames that name instances (`inst:`) are σ-mapped */
  instances: boolean;
  /** The text written for a reference so far, by its record before the write */
  texts: ReadonlyMap<ReferenceRecord, string>;
  /**
   * The references written in moved declaration text, with the file and
   * the frames they have at their new place (read from the state the
   * declaration was written to)
   */
  moved?: ReadonlyMap<ReferenceRecord, { file: string; frames: readonly string[] }>;
}

/**
 * The prefix a reference of the snapshot before the write is expected to
 * have at `stage` (the pairing rule): its file, its frames with the
 * descriptors `stage` maps, its role and its text as written by then.
 */
export function expectedPrefix(record: ReferenceRecord, stage: PairingStage): string {
  const moved = stage.moved?.get(record);
  if (moved) return referencePrefix(moved.file, moved.frames, record.role, stage.texts.get(record) ?? record.text);
  const frames = record.frames.map((frame) => {
    const hash = frame.lastIndexOf('#');
    const descriptor = frame.slice(0, hash);
    const colon = descriptor.indexOf(':');
    if (colon === -1) return frame;
    const kind = descriptor.slice(0, colon);
    const value = descriptor.slice(colon + 1);
    if ((kind === 'el' || kind === 'extend') && stage.declarations) return `${kind}:${stage.sigma.element(value)}${frame.slice(hash)}`;
    if (kind === 'inst' && stage.instances) return `inst:${stage.sigma.deployment(value)}${frame.slice(hash)}`;
    return frame;
  });
  return referencePrefix(record.file, frames, record.role, stage.texts.get(record) ?? record.text);
}

/** One segment of a written reference chain. */
export interface WrittenSegment {
  name: string;
  /** Range of the segment's name token in its file */
  offset: number;
  end: number;
}

/** The segments of the reference chain whose topmost node is `node`, outermost first. */
export function writtenSegments(node: CatalogueEntry['node']): WrittenSegment[] {
  const property = node.$type === 'StrictFqnElementRef' ? 'el' : 'value';
  const segments: WrittenSegment[] = [];
  for (let step: CatalogueEntry['node'] | undefined = node; step; step = step['parent'] as CatalogueEntry['node'] | undefined) {
    const ref = step[property] as { $refText?: string; $refNode?: { offset: number; end: number } } | undefined;
    if (!ref?.$refText || !ref.$refNode) return [];
    segments.push({ name: ref.$refText, offset: ref.$refNode.offset, end: ref.$refNode.end });
  }
  return segments.reverse();
}

/** The text written for a reference and the edits that write it into its file. */
export interface WrittenForm {
  text: string;
  /** Edits of the reference's file; empty when the text is kept */
  edits: TextEdit[];
}

/**
 * The written form of a reference whose target σ changes, or that a move
 * carries to another place (FR-011): the text it has at `current` (its place
 * in the state being rewritten) when that resolves there to σ of its old
 * target; else that text with the segments that name a renamed or moved
 * part replaced, a segment naming a part when the text up to it resolves, at
 * the reference's place before the write, to an element or instance σ
 * changes — by its new name when σ changes its last segment (a rename),
 * else, with the segments before it, by the full id of its image (a move);
 * else the full id of the new target; undefined when none of them resolves
 * there.
 *
 * @param before  - The reference in the catalogue before the write
 * @param current - The same reference in `currentCatalogue`
 * @param fullOf  - The full id of σ of a target before the write ({@link fullText})
 */
export function writtenForm(
  before: CatalogueEntry,
  beforeCatalogue: ReferenceCatalogue,
  current: CatalogueEntry,
  currentCatalogue: ReferenceCatalogue,
  sigma: Substitution,
  fullOf: (target: CatalogueTarget) => string,
): WrittenForm | undefined {
  const expected = targetKey(sigma.target(before.target!));
  const resolves = (text: string): boolean => {
    const target = currentCatalogue.resolveAt(current.place, text);
    return target !== undefined && targetKey(target) === expected;
  };
  if (resolves(current.text)) return { text: current.text, edits: [] };

  const segments = writtenSegments(before.node);
  const written = writtenSegments(current.node);
  if (segments.length > 0 && written.length === segments.length) {
    const names = segments.map((segment) => segment.name);
    const prefixes = names.map((_, i) => beforeCatalogue.resolveAt(before.place, names.slice(0, i + 1).join('.')));
    const replaced = names.map((name, i) => {
      const prefix = prefixes[i];
      const id = prefix === undefined ? undefined : namedId(prefix);
      if (id === undefined) return name;
      const mapped = 'deployment' in prefix! && prefix.element === undefined ? sigma.deployment(id) : sigma.element(id);
      return lastSegment(mapped) === lastSegment(id) ? name : lastSegment(mapped);
    });
    if (replaced.some((name, i) => name !== names[i])) {
      if (resolves(replaced.join('.'))) {
        return {
          text: replaced.join('.'),
          edits: written.flatMap((segment, i) =>
            replaced[i] === names[i] ? [] : [{ offset: segment.offset, end: segment.end, newText: replaced[i]! }],
          ),
        };
      }
    } else {
      // A move: the first segment whose prefix σ changes is written, with those before it, as its new path.
      const moved = prefixes.findIndex((prefix) => prefix !== undefined && sigma.changes(prefix));
      if (moved !== -1) {
        const head = fullOf(prefixes[moved]!);
        const text = [head, ...names.slice(moved + 1)].join('.');
        if (resolves(text)) {
          return { text, edits: [{ offset: written[0]!.offset, end: written[moved]!.end, newText: head }] };
        }
      }
    }
  }
  const full = fullOf(before.target!);
  if (full !== current.text && resolves(full)) {
    return { text: full, edits: [{ offset: current.offset, end: current.end, newText: full }] };
  }
  return undefined;
}

/**
 * The full id of σ of `target` as a reference text: an element's FQN, a
 * node's or instance's id, or for a path under an instance the instance's
 * id followed by the path from the instance's element down to the element.
 *
 * @param instanceElement - The element an instance deploys, by its id before the write
 */
export function fullText(
  target: CatalogueTarget,
  sigma: Substitution,
  instanceElement: (id: string) => string | undefined,
): string {
  if ('view' in target) return target.view;
  if ('model' in target) return sigma.element(target.model);
  if (target.element === undefined) return sigma.deployment(target.deployment);
  const element = sigma.element(target.element);
  const deployed = instanceElement(target.deployment);
  const base = deployed === undefined ? undefined : sigma.element(deployed);
  const below = base !== undefined && element.startsWith(`${base}.`) ? element.slice(base.length + 1) : element;
  return `${sigma.deployment(target.deployment)}.${below}`;
}

/** Identity of a reference target, for comparisons. */
export function targetKey(target: CatalogueTarget | undefined): string {
  if (target === undefined) return '';
  if ('view' in target) return `view:${target.view}`;
  if ('model' in target) return `element:${target.model}`;
  return target.element !== undefined ? `deployment:${target.deployment}/element:${target.element}` : `deployment:${target.deployment}`;
}

/** The element or deployment id a resolved reference names by its last segment. */
function namedId(target: CatalogueTarget): string | undefined {
  if ('view' in target) return undefined;
  if ('model' in target) return target.model;
  return target.element ?? target.deployment;
}

function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf('.') + 1);
}

/** A value of a declaration that LikeC4 resolves relative to the declaring file. */
export interface RelativeValue {
  kind: 'icon' | 'link';
  value: string;
  /** Offset of the property in its file */
  offset: number;
}

/**
 * The `icon` and `link` values below `node` (the declaration and its whole
 * body, nested declarations and relationships included) that start with
 * `./` or `../`: LikeC4 resolves them against the declaring document
 * (`ufo.isRelative` in its model parser and link provider), so they would
 * point elsewhere from another file (D85, D99).
 */
export function relativeValues(node: object): RelativeValue[] {
  const found: RelativeValue[] = [];
  const visit = (item: { $type?: string; $cstNode?: { offset: number }; [k: string]: unknown }): void => {
    const value = item['value'];
    if ((item.$type === 'IconProperty' || item.$type === 'LinkProperty') && typeof value === 'string' && /^\.\.?\//.test(value)) {
      found.push({ kind: item.$type === 'IconProperty' ? 'icon' : 'link', value, offset: item.$cstNode?.offset ?? 0 });
    }
    for (const [key, child] of Object.entries(item)) {
      if (key.startsWith('$')) continue;
      for (const next of Array.isArray(child) ? child : [child]) {
        if (next && typeof next === 'object' && !('$refText' in next) && typeof (next as { $type?: unknown }).$type === 'string') visit(next as typeof item);
      }
    }
  };
  visit(node as Parameters<typeof visit>[0]);
  return found;
}

/** The text of a declaration that a move carries, and the range of its file it is cut from. */
export interface DeclarationText {
  /**
   * The lines, line breaks as `\n`, with the declaration's own indentation
   * removed — except the lines that start inside a multi-line string, which
   * are part of its value and are kept as written
   */
  text: string;
  /** Indices of the lines of `text` that start inside a multi-line string */
  verbatim: readonly number[];
  /** Start of the cut: the first leading comment, else the declaration */
  offset: number;
  /** End of the cut: after a comment that ends the declaration's last line, else the declaration's end */
  end: number;
}

/**
 * The text a move carries for the declaration at `[offset, end)` of
 * `fullText`: with the comments directly above it and a comment ending its
 * last line, when it stands on lines of its own; the declaration alone when
 * it shares a line with other code.  A comment above belongs to it when it
 * is a comment of LikeC4's lexer that stands on lines of its own (nothing
 * but indentation before it on its first line) and only a line break and
 * indentation separate it from the declaration or from the next such
 * comment — no blank line, no code.
 */
export function declarationText(fullText: string, offset: number, end: number): DeclarationText {
  const lineStart = (at: number): number => fullText.lastIndexOf('\n', at - 1) + 1;
  const declarationLine = lineStart(offset);
  const nextBreak = fullText.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? fullText.length : nextBreak;
  const trailing = /^[ \t]*(\/\/[^\r\n]*|\/\*[^\r\n]*?\*\/[ \t]*)?\r?$/.exec(fullText.slice(end, lineEnd));
  const lineIndent = /^[ \t]*/.exec(fullText.slice(declarationLine))![0];
  if (!/^[ \t]*$/.test(fullText.slice(declarationLine, offset)) || !trailing) {
    return { ...carriedLines(fullText, offset, end, lineIndent), offset, end };
  }
  const cutEnd = trailing[1] ? end + fullText.slice(end, lineEnd).replace(/\r$/, '').length : end;
  const comments = commentRanges(fullText);
  let start = offset;
  for (;;) {
    const comment = comments.filter((c) => c.end <= start).at(-1);
    if (!comment || !/^[ \t]*\r?\n[ \t]*$/.test(fullText.slice(comment.end, start))) break;
    if (!/^[ \t]*$/.test(fullText.slice(lineStart(comment.offset), comment.offset))) break;
    start = comment.offset;
  }
  const first = lineStart(start);
  return { ...carriedLines(fullText, first, cutEnd, lineIndent), offset: first + /^[ \t]*/.exec(fullText.slice(first))![0].length, end: cutEnd };
}

/**
 * The lines of `fullText` from `from` to `to`, line breaks as `\n`, each
 * without up to `indent` of its leading indentation — except the lines that
 * start inside a multi-line token of LikeC4's lexer (a multi-line string),
 * which are part of its value and are kept as written (`verbatim`).
 */
function carriedLines(fullText: string, from: number, to: number, indent: string): { text: string; verbatim: number[] } {
  const strings = multiLineTokenRanges(fullText);
  const verbatim: number[] = [];
  let at = from;
  const text = fullText
    .slice(from, to)
    .split('\n')
    .map((line, i) => {
      const lineOffset = at;
      at += line.length + 1;
      const written = line.replace(/\r$/, '');
      if (strings.some((range) => range.offset < lineOffset && lineOffset < range.end)) {
        verbatim.push(i);
        return written;
      }
      const own = /^[ \t]*/.exec(written)![0];
      return written.slice(Math.min(own.length, indent.length));
    })
    .join('\n');
  return { text, verbatim };
}

/**
 * `text` (lines without their indentation) indented with `indent`; blank
 * lines stay empty, and the lines of `verbatim` (inside a multi-line string)
 * are kept as they are.
 */
export function indented(text: string, indent: string, verbatim: readonly number[] = []): string {
  return text
    .split('\n')
    .map((line, i) => (verbatim.includes(i) ? line : line.trim() === '' ? '' : indent + line))
    .join('\n');
}
