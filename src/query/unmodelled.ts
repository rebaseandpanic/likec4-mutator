/**
 * The unmodelled-name inventory (lc4m-15.30, RES-spec-1): every identifier
 * reference written where the library does not resolve references, and the
 * rule that decides whether a name occurs there (FR-004, D61, D101, D107).
 *
 *  - **Unmodelled places** are those of the reference catalogue's boundary
 *    (`isUnmodelledPlace`): a flow block of a dynamic view other than
 *    `par` / `parallel`, an `alt`, `try` / `catch` / `finally`, a `global`
 *    block, an `import`.
 *  - **Inventory, recovered text.**  Every Langium cross-reference in those
 *    subtrees, classed by the reference type the grammar declares for it
 *    (the property's `referenceType` in `AstReflection.getTypeMetaData`):
 *    element and deployment references
 *    (`Referenceable`, `Element`) — an `FqnRef` / `StrictFqnRef` /
 *    `StrictFqnElementRef` chain joined into one dotted name with the
 *    position of each segment; view references; element, deployment node,
 *    shared and relationship kinds; tags.  Reference types that name none of
 *    these (custom colors, library icons, global style and predicate ids) are
 *    ignored by an explicit list; any other type is an internal error, so a
 *    new grammar class cannot pass silently.
 *  - **Inventory, unrecovered text.**  In a file with parse errors, the
 *    lexer tokens no CST leaf covers, plus the tokens in the ranges of the
 *    parser errors.  Identifier tokens joined by `.` tokens form dotted
 *    names of unknown class, which match every class.  Comments are hidden
 *    tokens and strings are string tokens, so neither is a name.
 *  - **New mode** (additions, D107): a name occurs when it equals a bare
 *    name or the leading segment of a dotted name of its own class or of
 *    unknown class.
 *  - **Affected mode** (removals, renames, moves; D92): a name occurs when
 *    it equals a bare name or any segment of a dotted name of its own class
 *    or of unknown class.  A longer identifier that merely contains it does
 *    not match: segments are whole tokens.
 */
import { CstUtils, type CstNode } from 'langium';
import { getServices } from '../parser/services.js';
import type { ParsedDocument } from '../parser/types.js';
import { isUnmodelledPlace } from './reference-catalogue.js';

/** The class of a name in the inventory. */
export type UnmodelledNameClass =
  /** An element, deployment node or instance (one class: deployment references are `Referenceable` too) */
  | 'element'
  | 'view'
  | 'elementKind'
  | 'deploymentNodeKind'
  /** A kind name that is an element kind or a deployment node kind (`where kind is …`) */
  | 'sharedKind'
  | 'relationshipKind'
  | 'tag';

/** One segment of a name, with its offset in the file. */
export interface NameSegment {
  name: string;
  offset: number;
}

/** One name written at an unmodelled place, or in text the parser could not recover. */
export interface UnmodelledName {
  file: string;
  /** 1-based line of its first segment */
  line: number;
  /** Its segments, in order: one for a bare name */
  segments: NameSegment[];
  /** Its class; undefined for unrecovered text, which matches every class */
  nameClass: UnmodelledNameClass | undefined;
  /**
   * Where it is written: a flow block of a dynamic view (`opaque-flow`), a
   * `global` block or an import (`global-or-import`), or text the parser
   * could not recover (`unrecovered`)
   */
  place: 'opaque-flow' | 'global-or-import' | 'unrecovered';
}

/** The class of each reference type of the grammar that names something the library adds, renames or removes. */
const REFERENCE_CLASSES: Readonly<Record<string, UnmodelledNameClass>> = {
  Referenceable: 'element',
  Element: 'element',
  LikeC4View: 'view',
  DynamicView: 'view',
  ElementView: 'view',
  ElementKind: 'elementKind',
  DeploymentNodeKind: 'deploymentNodeKind',
  DeploymentNodeOrElementKind: 'sharedKind',
  RelationshipKind: 'relationshipKind',
  Tag: 'tag',
};

/** Reference types that name none of the classes: not names of the inventory. */
const IGNORED_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  'CustomColor',
  'LibIcon',
  'GlobalStyleId',
  'GlobalPredicateGroup',
  'GlobalDynamicPredicateGroup',
]);

/** Reference chains whose segments are joined into one dotted name: the chain type and its segment property. */
const CHAINS: Readonly<Record<string, string>> = {
  FqnRef: 'value',
  StrictFqnRef: 'value',
  StrictFqnElementRef: 'el',
};

/** An identifier as the lexer sees it: keywords that name things included. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Structural view of an AST node of the standalone parse. */
interface AstLike {
  $type?: string;
  $container?: AstLike;
  $cstNode?: CstNode;
  [k: string]: unknown;
}

/** A Langium cross-reference as the standalone parse holds it. */
interface RefLike {
  $refText?: string;
  $refNode?: CstNode;
}

/**
 * The inventory of `documents`: per file, the names at unmodelled places in
 * source order, then those of unrecovered text.
 *
 * @throws {Error} (internal) for a reference type the inventory does not know
 */
export function unmodelledInventory(documents: Iterable<{ file: string; parsed: ParsedDocument }>): UnmodelledName[] {
  const services = getServices();
  const reflection = services.shared.AstReflection;
  const names: UnmodelledName[] = [];
  for (const { file, parsed } of documents) {
    const found: UnmodelledName[] = [];
    let place: UnmodelledName['place'] = 'opaque-flow';
    const add = (segments: NameSegment[], nameClass: UnmodelledNameClass | undefined, line: number): void => {
      if (segments.length > 0) found.push({ file, line, segments, nameClass, place });
    };

    walk(parsed.ast as AstLike, undefined, (node, property, ref, at) => {
      place = at;
      const type = reflection.getTypeMetaData(node.$type ?? '').properties[property]?.referenceType;
      if (type === undefined) throw new Error(`Internal error: ${node.$type}.${property} is not a reference in '${file}'`);
      if (IGNORED_REFERENCE_TYPES.has(type)) return;
      const nameClass = REFERENCE_CLASSES[type];
      if (!nameClass) throw new Error(`Internal error: unknown reference type '${type}' of ${node.$type}.${property} in '${file}'`);
      const chain = CHAINS[node.$type ?? ''];
      if (chain === property) {
        // Only the topmost node of a chain reports, with every segment.
        if (node.$container?.$type === node.$type && (node.$container as AstLike)['parent'] === node) return;
        const segments = chainSegments(node, chain);
        add(segments, nameClass, lineOf(parsed.fullText, segments[0]?.offset ?? 0));
        return;
      }
      const text = (ref.$refText ?? '').replace(/^#/, '');
      const offset = ref.$refNode?.offset ?? node.$cstNode?.offset ?? 0;
      if (text !== '') add([{ name: text, offset: offset + (ref.$refText?.startsWith('#') ? 1 : 0) }], nameClass, lineOf(parsed.fullText, offset));
    });
    found.sort((a, b) => a.segments[0]!.offset - b.segments[0]!.offset);
    names.push(...found);
    if (parsed.errors.length > 0) names.push(...unrecoveredNames(file, parsed));
  }
  return names;
}

/** The names of the inventory that a new name `name` of class `nameClass` would capture (new mode, D107). */
export function newNameCaptures(inventory: readonly UnmodelledName[], name: string, nameClass: UnmodelledNameClass): UnmodelledName[] {
  return inventory.filter(
    (entry) => (entry.nameClass === undefined || entry.nameClass === nameClass) && entry.segments[0]!.name === name,
  );
}

/**
 * The names of the inventory that the removal, rename or move of a thing
 * named `names` of class `nameClass` affects (affected mode, D92): a bare
 * name or any segment of a dotted name equals one of `names`.
 */
export function affectedNameHits(
  inventory: readonly UnmodelledName[],
  names: ReadonlySet<string>,
  nameClass: UnmodelledNameClass,
): UnmodelledName[] {
  return inventory.filter(
    (entry) => (entry.nameClass === undefined || entry.nameClass === nameClass) && entry.segments.some((segment) => names.has(segment.name)),
  );
}

/** Where a reference below an unmodelled place is written. */
type RecoveredPlace = 'opaque-flow' | 'global-or-import';

/**
 * Visit every cross-reference held by a node at an unmodelled place below
 * `node`, with the node, the property holding it and the kind of place
 * (`at`: undefined while `node` is not at an unmodelled place).
 */
function walk(
  node: AstLike,
  at: RecoveredPlace | undefined,
  visit: (node: AstLike, property: string, ref: RefLike, at: RecoveredPlace) => void,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child || typeof child !== 'object') continue;
      if ('$refText' in child) {
        if (at) visit(node, key, child as RefLike, at);
        continue;
      }
      const type = (child as AstLike).$type;
      if (typeof type !== 'string') continue;
      const place =
        at ?? (isUnmodelledPlace(child as AstLike) ? (type === 'Globals' || type === 'ImportsFromPoject' ? 'global-or-import' : 'opaque-flow') : undefined);
      walk(child as AstLike, place, visit);
    }
  }
}

/** The segments of the reference chain whose topmost node is `node`, outermost first. */
function chainSegments(node: AstLike, property: string): NameSegment[] {
  const segments: NameSegment[] = [];
  for (let step: AstLike | undefined = node; step; step = step['parent'] as AstLike | undefined) {
    const ref = step[property] as RefLike | undefined;
    if (!ref?.$refText) return [];
    segments.push({ name: ref.$refText, offset: ref.$refNode?.offset ?? step.$cstNode?.offset ?? 0 });
  }
  return segments.reverse();
}

/**
 * The dotted names of the unrecovered text of a file with parse errors:
 * runs of identifier tokens joined by `.` tokens among the tokens no CST
 * leaf covers or that lie in a parser error's range.
 */
function unrecoveredNames(file: string, parsed: ParsedDocument): UnmodelledName[] {
  const tokens = getServices().likec4.parser.Lexer.tokenize(parsed.fullText).tokens;
  const leaves = parsed.cst ? [...CstUtils.streamCst(parsed.cst as CstNode)].filter((node) => !('content' in node)) : [];
  const covered = (offset: number): boolean => leaves.some((leaf) => leaf.offset <= offset && offset < leaf.end);
  const inError = (offset: number): boolean => parsed.errors.some((e) => e.offset <= offset && offset < e.offset + Math.max(e.length, 1));
  const unrecovered = tokens.map((token) => !covered(token.startOffset) || inError(token.startOffset));

  const names: UnmodelledName[] = [];
  let segments: NameSegment[] = [];
  let line = 0;
  let expectName = true;
  const flush = (): void => {
    if (segments.length > 0) names.push({ file, line, segments, nameClass: undefined, place: 'unrecovered' });
    segments = [];
    expectName = true;
  };
  tokens.forEach((token, i) => {
    if (!unrecovered[i]) return flush();
    if (expectName && IDENTIFIER.test(token.image)) {
      if (segments.length === 0) line = token.startLine ?? lineOf(parsed.fullText, token.startOffset);
      segments.push({ name: token.image, offset: token.startOffset });
      expectName = false;
    } else if (!expectName && token.image === '.') {
      expectName = true;
    } else {
      flush();
      if (IDENTIFIER.test(token.image)) {
        line = token.startLine ?? lineOf(parsed.fullText, token.startOffset);
        segments.push({ name: token.image, offset: token.startOffset });
        expectName = false;
      }
    }
  });
  flush();
  return names;
}

/** The 1-based line of `offset` in `text`. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
