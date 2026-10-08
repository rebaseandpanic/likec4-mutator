/**
 * Effective tags / links / metadata of an element whose declaration is
 * extended by `extend X { ... }` blocks.
 *
 * Mirrors LikeC4 1.59.4: the language-server document parser reads each
 * body (`parseTags`: tags without duplicates; `parseLinks`: links as written;
 * `getMetadata`: values grouped per key), `MergedExtends.merge` accumulates
 * the `extend` contributions in document order and `MergedExtends.applyExtended`
 * merges them onto the declaration — the declaration always first.
 */
import { readMetadataBlock, readMetadataGrouped, type MetadataMap } from '../mutator/metadata-ops.js';

/** Link as reported by the read API. */
export interface LinkValue {
  url: string;
  label?: string;
}

/** Tags, links and metadata of one body, or the merged result. */
export interface Decorations {
  tags?: string[];
  links?: LinkValue[];
  metadata?: MetadataMap;
}

/**
 * One comma-separated group of a `Tags` node.  LikeC4 grammar:
 * `Tags: (values+=TagRef)+ ({infer Tags.prev=current} ',' (values+=TagRef)*)* ';'?`
 * — the body holds the last group, each group links to the one before it
 * through `prev`.
 */
interface TagsLike {
  values?: Array<{ $cstNode?: { text?: string }; $refText?: string }>;
  prev?: TagsLike;
}

/** Minimal structural view of an element or `extend` body. */
interface BodyLike {
  tags?: TagsLike;
  props?: unknown[];
}

/**
 * Read the tags, links and metadata of one body as LikeC4 does before
 * merging: tags of every comma group in LikeC4 order without duplicates, links in source order, metadata of the
 * first `metadata { ... }` block grouped per key.
 */
export function readContribution(body: unknown): Decorations {
  const out: Decorations = {};
  if (!body) return out;
  const b = body as BodyLike;

  const tags = readTagGroups(b).flat();
  if (tags.length > 0) out.tags = unique(tags);

  const links = readLinks(b);
  if (links.length > 0) out.links = links;

  const metaBody = (b.props ?? []).find(
    (p) => (p as { $type?: string }).$type === 'MetadataBody',
  ) as Parameters<typeof readMetadataGrouped>[0] | undefined;
  if (metaBody) {
    const metadata = readMetadataGrouped(metaBody);
    if (Object.keys(metadata).length > 0) out.metadata = metadata;
  }
  return out;
}

/**
 * Read tags, links and metadata of one body as declared (see
 * `ElementDecorations`): tags (of every comma group) and links in source
 * order, metadata as written — the last value of a repeated key, arrays
 * kept as arrays.
 */
export function readDeclared(body: unknown): Decorations {
  const out: Decorations = {};
  if (!body) return out;
  const b = body as BodyLike;

  const tags = readTagGroups(b).reverse().flat();
  if (tags.length > 0) out.tags = tags;

  const links = readLinks(b);
  if (links.length > 0) out.links = links;

  for (const prop of b.props ?? []) {
    if ((prop as { $type?: string }).$type !== 'MetadataBody') continue;
    const metadata = readMetadataBlock(prop as Parameters<typeof readMetadataBlock>[0]);
    if (Object.keys(metadata).length > 0) out.metadata = metadata;
  }
  return out;
}

/**
 * Merge the contributions of `extend` blocks (in LikeC4 merge order) onto
 * the declaration's own contribution.  Port of `MergedExtends.merge` +
 * `applyExtended`.
 */
export function mergeContributions(declaration: Decorations, extensions: Decorations[]): Decorations {
  // MergedExtends.merge: accumulate every extend block of the element.
  let extTags: string[] = [];
  const extLinks: LinkValue[] = [];
  let extMetadata = createMap();
  for (const ext of extensions) {
    if (ext.links) extLinks.push(...ext.links);
    if (ext.tags) extTags = unique([...extTags, ...ext.tags]);
    if (ext.metadata) extMetadata = mergeMetadata(extMetadata, ext.metadata);
  }

  // MergedExtends.applyExtended: the declaration comes first.
  const tags = declaration.tags?.length ? unique([...declaration.tags, ...extTags]) : extTags;
  const links = declaration.links?.length ? [...declaration.links, ...extLinks] : extLinks;
  const metadata = declaration.metadata ? mergeMetadata(declaration.metadata, extMetadata) : extMetadata;

  const out: Decorations = {};
  if (tags.length > 0) out.tags = tags;
  if (links.length > 0) out.links = links.map((l) => ({ ...l }));
  if (Object.keys(metadata).length > 0) out.metadata = metadata;
  return out;
}

/**
 * `MergedExtends.mergeMetadata`: a key new to `existing` is taken as is; a
 * key present in both gets the values of both without duplicates — a string
 * when one value remains, an array otherwise.
 */
function mergeMetadata(existing: MetadataMap, incoming: MetadataMap): MetadataMap {
  const result = createMap();
  for (const [key, value] of Object.entries(existing)) result[key] = copy(value);
  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = result[key];
    if (existingValue === undefined) {
      result[key] = copy(incomingValue);
      continue;
    }
    const merged = unique([...toArray(existingValue), ...toArray(incomingValue)]);
    result[key] = merged.length === 1 ? merged[0]! : merged;
  }
  return result;
}

/**
 * Tag names of every comma-separated group of the body, in the order LikeC4
 * `parseTags` visits them: the last group first, then each earlier one.
 * Reverse the result for source order.
 */
function readTagGroups(body: BodyLike): string[][] {
  const groups: string[][] = [];
  for (let group = body.tags; group; group = group.prev) {
    // The standalone parser does not resolve cross-references, so tag names
    // are recovered from the leading-`#` CST text of each TagRef.
    const names: string[] = [];
    for (const tagRef of group.values ?? []) {
      const txt = tagRef?.$cstNode?.text ?? tagRef?.$refText;
      if (typeof txt !== 'string') continue;
      names.push(txt.startsWith('#') ? txt.slice(1) : txt);
    }
    groups.push(names);
  }
  return groups;
}

function readLinks(body: BodyLike): LinkValue[] {
  const links: LinkValue[] = [];
  for (const rawProp of body.props ?? []) {
    const prop = rawProp as {
      $type?: string;
      value?: string;
      title?: string;
    };
    if (prop.$type !== 'LinkProperty' || typeof prop.value !== 'string' || prop.value === '') continue;
    const link: LinkValue = { url: prop.value };
    if (typeof prop.title === 'string') link.label = prop.title;
    links.push(link);
  }
  return links;
}

function createMap(): MetadataMap {
  return Object.create(null) as MetadataMap;
}

function copy(value: string | string[]): string | string[] {
  return Array.isArray(value) ? [...value] : value;
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
