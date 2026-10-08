/**
 * Metadata read/merge/write helpers shared by element-ops and relationship-ops.
 *
 * LikeC4 grammar:
 *
 *   MetadataAttribute: key=Id ':'? (value=MetadataValue | boolValue=BOOLEAN) ';'?
 *   MetadataValue:     MarkdownOrString | MetadataArray
 *   MetadataArray:     '[' values+=MarkdownOrString (',' values+=MarkdownOrString)* ']'
 *   MarkdownOrString:  markdown=MarkdownString | text=String
 *
 * These helpers expose a single in-memory read representation
 * (`Record<string, string | string[]>`) plus a patch type that allows `null`
 * to mean "delete this key".  Booleans read as `'true'` / `'false'` and
 * markdown strings read as their content, matching how LikeC4 itself exposes
 * metadata.  Writing never round-trips through the read representation:
 * attributes the patch does not touch are copied from the source verbatim.
 */
import type { TextEdit } from './text-edit.js';
import { removeIndent } from '../query/likec4-text.js';
import { formatMetadataValue, generateMetadataBlock, validateMetadataKey } from './codegen.js';
import {
  expandRangeToConsumeSurroundingNewlines,
  buildInsertBodySnippet,
  buildRemovalEdit,
  findClosingBraceOffset,
  type BodyOwnerNode,
} from './cst-helpers.js';

/**
 * Read API representation: every value is either a string or string[].
 * Maps produced by this module have a `null` prototype, so every LikeC4
 * identifier — including `__proto__` and `constructor` — is an own data key.
 */
export type MetadataMap = Record<string, string | string[]>;

/**
 * Create an empty prototype-less metadata map.  Assigning `__proto__` on a
 * plain `{}` would invoke the prototype setter instead of storing the key.
 */
function createMetadataMap(): MetadataMap {
  return Object.create(null) as MetadataMap;
}

/**
 * Patch representation: `string` / `string[]` upserts the key, `null` deletes
 * the key.  Keys absent from the patch are preserved verbatim from the
 * existing metadata block.
 */
export type MetadataPatch = Record<string, string | string[] | null>;

// ---------------------------------------------------------------------------
// Read existing metadata block
// ---------------------------------------------------------------------------

interface MarkdownOrStringShape {
  $type?: string;
  text?: string;
  markdown?: string;
}

interface MetadataAttributeShape {
  $type?: string;
  $cstNode?: { offset: number; end: number; text?: string };
  key?: string;
  boolValue?: boolean;
  value?: MarkdownOrStringShape & {
    values?: MarkdownOrStringShape[];
  };
}

interface MetadataBodyShape {
  $type?: string;
  $cstNode?: { offset: number; end: number };
  props?: MetadataAttributeShape[];
}

/** Content of a `MarkdownOrString` node, or undefined when the parser recovered without one. */
function readMarkdownOrString(node: MarkdownOrStringShape | undefined): string | undefined {
  if (typeof node?.text === 'string') return node.text;
  if (typeof node?.markdown === 'string') return node.markdown;
  return undefined;
}

/** Read the value of one metadata attribute, or undefined when it is incomplete. */
function readMetadataValue(attr: MetadataAttributeShape): string | string[] | undefined {
  const value = attr.value;
  if (!value) {
    // `boolValue` is only meaningful when no `value` was parsed: Langium
    // initialises boolean features to `false` on every attribute.
    return typeof attr.boolValue === 'boolean' ? String(attr.boolValue) : undefined;
  }
  if (value.$type === 'MetadataArray') {
    const items = (value.values ?? []).map(readMarkdownOrString);
    if (items.length === 0 || items.some((item) => item === undefined)) return undefined;
    return items as string[];
  }
  return readMarkdownOrString(value);
}

/**
 * Extract `key → string | string[]` pairs from a parsed `MetadataBody` AST node.
 * Attributes whose value is incomplete (parser error recovery) are omitted.
 */
export function readMetadataBlock(metaBody: MetadataBodyShape): MetadataMap {
  const out = createMetadataMap();
  for (const attr of metaBody.props ?? []) {
    if (!attr.key) continue;
    const value = readMetadataValue(attr);
    if (value !== undefined) out[attr.key] = value;
  }
  return out;
}

/**
 * Read a `MetadataBody` the way LikeC4 builds an element's metadata from it
 * (language-server `getMetadata`): array values are flattened, every string
 * value is dedented and trimmed (`removeIndent`), empty values are dropped,
 * every remaining value of a key repeated inside the block is kept in source
 * order, and a key with exactly one value maps to a string, otherwise to an
 * array.  So `k ['v1']` reads as `'v1'`, `k 'a'` followed by `k 'b'` as
 * `['a', 'b']`, `k ' x '` as `'x'`, and `k ''` not at all.
 *
 * {@link readMetadataBlock} instead returns the block as declared.
 */
export function readMetadataGrouped(metaBody: MetadataBodyShape): MetadataMap {
  const grouped = new Map<string, string[]>();
  for (const attr of metaBody.props ?? []) {
    if (!attr.key) continue;
    const value = readMetadataValue(attr);
    if (value === undefined) continue;
    // Booleans read as 'true' / 'false', which LikeC4 does not normalize.
    const normalized = attr.value
      ? (Array.isArray(value) ? value : [value]).map(removeIndent).filter((v) => v !== '')
      : [value as string];
    if (normalized.length === 0) continue;
    const values = grouped.get(attr.key) ?? [];
    values.push(...normalized);
    grouped.set(attr.key, values);
  }
  const out = createMetadataMap();
  for (const [key, values] of grouped) {
    out[key] = values.length === 1 ? values[0]! : values;
  }
  return out;
}

/**
 * The upserts of a patch (entries whose value is not `null`), as a
 * prototype-less map that keeps keys such as `__proto__` as data.
 */
export function collectMetadataUpserts(patch: MetadataPatch): MetadataMap {
  const upserts = createMetadataMap();
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null) upserts[key] = value;
  }
  return upserts;
}

// ---------------------------------------------------------------------------
// Write: build a TextEdit that applies a metadata patch
// ---------------------------------------------------------------------------

/**
 * Build the TextEdits that apply a metadata patch to a body-owning node
 * (element or relation).
 *
 * LikeC4 reads only the first `metadata { ... }` block of a body — even an
 * empty one (`getMetadata(body.props.find(isMetadataProperty))`); later
 * blocks are ignored.  The patch is therefore applied to that first block,
 * and every patched key is also removed from the later blocks, so that no
 * copy of it is left to resurface.
 *
 * Behaviour:
 *  - When the node has no `metadata { ... }` block and the patch only
 *    deletes keys, returns no edit.
 *  - When the node has no metadata block but the patch has at least one
 *    upsert, a fresh block is inserted before the closing brace.
 *  - When the first block holds a patched key or the patch has an upsert,
 *    the first block is edited attribute by attribute: a patched key is
 *    replaced in place at its first occurrence (later occurrences are
 *    removed) or removed when the patch maps it to `null`; new keys are
 *    added in patch order — on their own lines above the closing brace of a
 *    multi-line block, after the last attribute of a one-line block.
 *    Everything else — attributes whose key the patch does not mention (any
 *    value form, with its original formatting), comments, spacing — keeps
 *    its exact text.  Otherwise the first block is left as is.
 *  - Later blocks lose the attributes with patched keys (see
 *    {@link buildStripMetadataKeysEdits}); everything else in them stays
 *    byte-for-byte.
 *  - When nothing remains in the first block, it is deleted entirely (along
 *    with the surrounding newlines) — unless a later block still has
 *    attributes: then the first block stays, emptied, so that LikeC4 keeps
 *    ignoring the later one.
 *
 * @param bodyOwner - Element or Relation AST node
 * @param fullText  - Full source text
 * @param indent    - Indent of the bodyOwner declaration line
 * @param patch     - Per-key upsert / null-delete map
 * @returns Non-overlapping edits (empty when nothing changes)
 */
export function buildReplaceMetadataEditOnNode(
  bodyOwner: BodyOwnerNode,
  fullText: string,
  indent: string,
  patch: MetadataPatch,
): TextEdit[] {
  const innerIndent = indent + '  ';
  const entryIndent = innerIndent + '  ';

  // Validate every upsert up-front (key syntax, non-empty arrays) so the
  // caller sees the error before any other edits run.
  const upserts = collectMetadataUpserts(patch);
  for (const [key, value] of Object.entries(upserts)) {
    validateMetadataKey(key);
    if (Array.isArray(value) && value.length === 0) {
      throw new Error(
        `Invalid metadata patch for key '${key}': empty array not allowed by LikeC4 grammar`,
      );
    }
  }
  const hasUpserts = Object.keys(upserts).length > 0;
  const isPatched = (key: string | undefined): boolean =>
    key !== undefined && Object.prototype.hasOwnProperty.call(patch, key);

  const [first, ...later] = metadataBlocks(bodyOwner);

  // Case 1: no existing metadata block.  Pure deletes are no-ops.
  if (!first) {
    if (!hasUpserts) return [];
    const edit = buildInsertBodySnippet(bodyOwner, fullText, indent, (ii) =>
      generateMetadataBlock(upserts, ii),
    );
    return edit ? [edit] : [];
  }

  const { edits, laterKeepAttributes } = stripLaterBlocks(later, fullText, isPatched);

  // Case 2: the first block is untouched by the patch.
  const firstAttrs = first.props ?? [];
  if (!hasUpserts && !firstAttrs.some((attr) => isPatched(attr.key))) return edits;

  // Case 3: edit the first block attribute by attribute.  A patched key is
  // replaced in place at its first occurrence (later occurrences are
  // removed) or removed when the patch maps it to `null`; new keys are added
  // after the last attribute.  Everything else in the block — attributes the
  // patch does not mention, comments, spacing — keeps its exact text.
  const cst = first.$cstNode;
  const regenerated = new Set<string>();
  const removed: MetadataAttributeShape[] = [];
  const replaced: Array<{ attr: MetadataAttributeShape; key: string }> = [];
  for (const attr of firstAttrs) {
    const key = attr.key;
    if (key === undefined || !isPatched(key)) continue;
    if (patch[key] === null || regenerated.has(key)) {
      removed.push(attr);
      continue;
    }
    regenerated.add(key);
    replaced.push({ attr, key });
  }
  const added = Object.entries(upserts).filter(([key]) => !regenerated.has(key));

  if (removed.length === firstAttrs.length && added.length === 0) {
    if (laterKeepAttributes) {
      // Keep the first block, emptied: LikeC4 then still ignores the later
      // blocks instead of reading the next one.
      edits.push(...removeAttributes(firstAttrs, fullText));
      return edits;
    }
    // Nothing left → delete the entire block.  Pass `consumeTrailingNewline:
    // false` so the trailing `\n` after the block stays intact — otherwise
    // both surrounding newlines collapse and adjacent body content (e.g.
    // `description 'd'` on the previous line, the body's closing `}` on the
    // following line) ends up squashed onto a single line.
    const { offset, end } = expandRangeToConsumeSurroundingNewlines(
      fullText,
      cst.offset,
      cst.end,
      { consumeTrailingNewline: false },
    );
    edits.push({ offset, end, newText: '' });
    return edits;
  }

  const survivors = firstAttrs.filter((attr) => !removed.includes(attr));
  const ownLineIndent = (offset: number): string | undefined => {
    const lineStart = fullText.lastIndexOf('\n', offset - 1) + 1;
    const leading = fullText.substring(lineStart, offset);
    return /^[ \t]*$/.test(leading) ? leading : undefined;
  };
  const lastOnOwnLine = [...survivors].reverse().find((a) => a.$cstNode && ownLineIndent(a.$cstNode.offset) !== undefined);
  const closingBrace = findClosingBraceOffset(cst);
  const closingIndent = ownLineIndent(closingBrace);
  const attrIndent =
    (lastOnOwnLine?.$cstNode && ownLineIndent(lastOnOwnLine.$cstNode.offset)) ??
    (closingIndent !== undefined ? closingIndent + '  ' : entryIndent);

  edits.push(...removeAttributes(removed, fullText));
  for (const { attr, key } of replaced) {
    if (!attr.$cstNode) continue;
    const indentHere = ownLineIndent(attr.$cstNode.offset) ?? attrIndent;
    edits.push({
      offset: attr.$cstNode.offset,
      end: attr.$cstNode.end,
      newText: `${key} ${formatMetadataValue(upserts[key]!, indentHere)}`,
    });
  }
  if (added.length > 0) {
    const entries = added.map(([key, value]) => `${key} ${formatMetadataValue(value, attrIndent)}`);
    if (closingIndent !== undefined) {
      // Multi-line block: new lines just above the closing brace.
      const lineStart = closingBrace - closingIndent.length;
      edits.push({ offset: lineStart, end: lineStart, newText: entries.map((e) => `${attrIndent}${e}\n`).join('') });
    } else {
      // One-line block: on the same line, after the last attribute kept.
      const lastKept = survivors[survivors.length - 1]?.$cstNode;
      const at = lastKept ? lastKept.end : fullText.indexOf('{', cst.offset) + 1;
      const trailing = fullText[at] === '}' ? ' ' : '';
      edits.push({ offset: at, end: at, newText: ` ${entries.join(' ')}${trailing}` });
    }
  }
  return edits;
}

/**
 * Build the TextEdits that remove every attribute whose key is in `keys`
 * from every `metadata { ... }` block of a body, so that the body no longer
 * contributes those keys.  Everything else keeps its exact text.
 *
 * A later block whose attributes all go is removed.  The first block — the
 * only one LikeC4 reads — is removed when its attributes all go, unless a
 * later block still has attributes: then it stays, emptied, so that LikeC4
 * keeps ignoring the later block.
 *
 * @returns Non-overlapping edits (empty when no block holds such a key)
 */
export function buildStripMetadataKeysEdits(
  bodyOwner: BodyOwnerNode,
  fullText: string,
  keys: ReadonlySet<string>,
): TextEdit[] {
  const isStripped = (key: string | undefined): boolean => key !== undefined && keys.has(key);
  const [first, ...later] = metadataBlocks(bodyOwner);
  if (!first) return [];
  const { edits, laterKeepAttributes } = stripLaterBlocks(later, fullText, isStripped);

  const attrs = first.props ?? [];
  const removed = attrs.filter((attr) => isStripped(attr.key));
  if (removed.length === 0) return edits;
  if (removed.length === attrs.length && !laterKeepAttributes) {
    const { offset, end, newText } = buildRemovalEdit(fullText, first.$cstNode.offset, first.$cstNode.end);
    edits.push({ offset, end, newText });
  } else {
    edits.push(...removeAttributes(removed, fullText));
  }
  return edits;
}

/** A `metadata { ... }` block with a source position. */
type PositionedMetadataBody = MetadataBodyShape & { $cstNode: { offset: number; end: number } };

/** Every `metadata { ... }` block of the body that has a source position, in source order. */
function metadataBlocks(bodyOwner: BodyOwnerNode): PositionedMetadataBody[] {
  return (bodyOwner.body?.props ?? []).filter(
    (p): p is typeof p & PositionedMetadataBody => p.$type === 'MetadataBody' && p.$cstNode !== undefined,
  ) as PositionedMetadataBody[];
}

/**
 * Remove the attributes `isRemoved` selects from blocks after the first: a
 * block left without attributes is removed as a whole.
 *
 * @returns The edits, and whether any later block still has attributes.
 */
function stripLaterBlocks(
  later: PositionedMetadataBody[],
  fullText: string,
  isRemoved: (key: string | undefined) => boolean,
): { edits: TextEdit[]; laterKeepAttributes: boolean } {
  const edits: TextEdit[] = [];
  let laterKeepAttributes = false;
  for (const block of later) {
    const attrs = block.props ?? [];
    const removed = attrs.filter((attr) => isRemoved(attr.key));
    if (removed.length < attrs.length) laterKeepAttributes = true;
    if (removed.length === 0) continue;
    if (removed.length === attrs.length) {
      const { offset, end, newText } = buildRemovalEdit(fullText, block.$cstNode.offset, block.$cstNode.end);
      edits.push({ offset, end, newText });
    } else {
      edits.push(...removeAttributes(removed, fullText));
    }
  }
  return { edits, laterKeepAttributes };
}

/** Removal edits for the given metadata attributes (whole lines when they stand alone). */
function removeAttributes(attrs: MetadataAttributeShape[], fullText: string): TextEdit[] {
  return attrs.flatMap((attr) => {
    if (!attr.$cstNode) return [];
    const { offset, end, newText } = buildRemovalEdit(fullText, attr.$cstNode.offset, attr.$cstNode.end);
    return [{ offset, end, newText }];
  });
}
