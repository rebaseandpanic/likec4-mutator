/**
 * `extend a -> b { ... }` blocks (`ExtendRelation`) and how LikeC4 1.59.4
 * applies them to relationships (language-server `relationFingerprint`,
 * `ModelParser.parseExtendRelation` and the relation step of
 * `buildModelData`).
 *
 * A block applies to every relationship with the same fingerprint: source
 * and target FQN, kind (`default` when none), title and direction — the
 * endpoints of a bidirectional relationship are compared in either order.
 */
import type { Decorations, LinkValue } from './extend-merge.js';
import { removeIndent } from './likec4-text.js';

/** Source range of an AST node, as Langium's CST node exposes it. */
interface CstRange {
  offset: number;
  end: number;
  text?: string;
  range?: { start?: { line?: number; character?: number } };
}

/**
 * Structural view of an `extend a -> b 'title' { ... }` AST node
 * (`ExtendRelation`), as far as the library reads it.  It only occurs
 * directly in a `model` block.
 */
export interface ExtendRelationNode {
  $type: 'ExtendRelation';
  $cstNode?: CstRange;
  /** Reference to the source element (`FqnRef`) */
  source?: unknown;
  /** Reference to the target element (`FqnRef`) */
  target?: unknown;
  /** Kind written as `-[kind]->` */
  kind?: { $refText?: string };
  /** Kind written as `.kind` */
  dotKind?: { kind?: { $refText?: string } };
  /** Title as written */
  title?: string;
  /** True for `<->` */
  isBidirectional?: boolean;
  /** The block body: tags and properties (links, metadata) */
  body?: {
    $cstNode?: CstRange;
    tags?: unknown;
    props?: Array<{
      $type?: string;
      $cstNode?: CstRange;
      key?: string;
      value?: unknown;
      props?: unknown[];
    }>;
  };
}

/** What identifies the relationships an `extend` block applies to. */
export interface RelationIdentity {
  /** Absolute FQN of the source */
  sourceFqn: string;
  /** Absolute FQN of the target */
  targetFqn: string;
  /** Relationship kind; undefined for none */
  kind?: string;
  /** Title as LikeC4 compares it (dedented and trimmed); '' for none */
  title: string;
  /** True for a bidirectional relationship */
  isBidirectional: boolean;
}

/**
 * Port of `relationFingerprint`: a key equal for a relationship and every
 * `extend` block that applies to it.
 */
export function relationFingerprint(id: RelationIdentity): string {
  let source = id.sourceFqn;
  let target = id.targetFqn;
  if (id.isBidirectional && target < source) [source, target] = [target, source];
  return JSON.stringify([source, target, id.kind ?? 'default', id.title, id.isBidirectional]);
}

/** Minimal structural view of a `Relation` node, for its title. */
interface RelationTitleSource {
  title?: string;
  body?: { props?: unknown[] };
}

/**
 * Title of a relationship as LikeC4 compares it before the kind's
 * specification is consulted (`parseBaseProps`): the title written after the
 * target, otherwise the body's `title` property (the last one), dedented and
 * trimmed; '' when there is none.
 */
export function relationTitle(node: RelationTitleSource): string {
  if (node.title !== undefined) return removeIndent(node.title);
  let bodyTitle: string | undefined;
  for (const raw of node.body?.props ?? []) {
    const prop = raw as { $type?: string; key?: string; value?: { text?: string; markdown?: string } };
    if (prop.$type !== 'RelationStringProperty' || prop.key !== 'title' || !prop.value) continue;
    const text = prop.value.text ?? prop.value.markdown;
    if (text !== undefined) bodyTitle = text;
  }
  return bodyTitle === undefined ? '' : removeIndent(bodyTitle);
}

/**
 * Merge the contributions of the `extend` blocks applying to a relationship
 * (in LikeC4 merge order) onto the relationship's own contribution.  Port of
 * the relation step of `buildModelData`: tags as a union; links of a block
 * appended unless one with the same url and label is already present (the
 * relationship's own duplicates stay); metadata per key, values of a key
 * present in more than one body without duplicates — a string when one value
 * remains, an array otherwise.
 */
export function mergeRelationContributions(own: Decorations, extensions: Decorations[]): Decorations {
  const tags = [...(own.tags ?? [])];
  const links: LinkValue[] = (own.links ?? []).map((l) => ({ ...l }));
  const metadata = Object.create(null) as Record<string, string | string[]>;
  for (const [key, value] of Object.entries(own.metadata ?? {})) metadata[key] = copy(value);

  for (const ext of extensions) {
    if (ext.tags) tags.push(...ext.tags);
    for (const link of ext.links ?? []) {
      const present = links.some((l) => l.url === link.url && (l.label ?? '') === (link.label ?? ''));
      if (!present) links.push({ ...link });
    }
    for (const [key, value] of Object.entries(ext.metadata ?? {})) {
      const existing = metadata[key];
      if (existing === undefined) {
        metadata[key] = copy(value);
        continue;
      }
      const merged = [...new Set([...toArray(existing), ...toArray(value)])];
      metadata[key] = merged.length === 1 ? merged[0]! : merged;
    }
  }

  const out: Decorations = {};
  const uniqueTags = [...new Set(tags)];
  if (uniqueTags.length > 0) out.tags = uniqueTags;
  if (links.length > 0) out.links = links;
  if (Object.keys(metadata).length > 0) out.metadata = metadata;
  return out;
}

function copy(value: string | string[]): string | string[] {
  return Array.isArray(value) ? [...value] : value;
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
