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
import { formatMetadataValue, generateMetadataBlock, validateMetadataKey } from './codegen.js';
import {
  expandRangeToConsumeSurroundingNewlines,
  buildInsertBodySnippet,
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
 * Build a TextEdit that applies a metadata patch to a body-owning node
 * (element or relation).
 *
 * Behaviour:
 *  - When the node has no `metadata { ... }` block and the patch only
 *    deletes keys, returns null (nothing to do).
 *  - When the node has no metadata block but the patch has at least one
 *    upsert, a fresh block is inserted before the closing brace.
 *  - When a metadata block exists, it is rewritten attribute by attribute:
 *    attributes whose key the patch does not mention are copied verbatim
 *    from the source (any value form — string, markdown, boolean, array —
 *    with its original formatting); a patched key is regenerated at the
 *    position of its first occurrence or dropped when the patch maps it to
 *    `null`; new keys are appended in patch order.
 *  - When nothing remains, the existing block is deleted entirely (along
 *    with the surrounding newlines).
 *
 * @param bodyOwner - Element or Relation AST node
 * @param fullText  - Full source text
 * @param indent    - Indent of the bodyOwner declaration line
 * @param patch     - Per-key upsert / null-delete map
 */
export function buildReplaceMetadataEditOnNode(
  bodyOwner: BodyOwnerNode,
  fullText: string,
  indent: string,
  patch: MetadataPatch,
): TextEdit | null {
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

  // Locate the existing MetadataBody.
  const existingMeta = bodyOwner.body?.props?.find(
    (p) => p.$type === 'MetadataBody',
  ) as MetadataBodyShape | undefined;

  // Case 1: no existing metadata block.  Pure deletes are no-ops.
  if (!existingMeta?.$cstNode) {
    if (Object.keys(upserts).length === 0) return null;
    return buildInsertBodySnippet(bodyOwner, fullText, indent, (ii) =>
      generateMetadataBlock(upserts, ii),
    );
  }

  // Case 2: existing block — rewrite it attribute by attribute.
  const isPatched = (key: string): boolean => Object.prototype.hasOwnProperty.call(patch, key);
  const regenerated = new Set<string>();
  const entries: string[] = [];
  for (const attr of existingMeta.props ?? []) {
    const key = attr.key;
    if (key !== undefined && isPatched(key)) {
      // Deleted, or a duplicate of a key already regenerated above.
      if (patch[key] === null || regenerated.has(key)) continue;
      regenerated.add(key);
      entries.push(`${key} ${formatMetadataValue(upserts[key]!, entryIndent)}`);
      continue;
    }
    if (!attr.$cstNode) continue;
    entries.push(fullText.substring(attr.$cstNode.offset, attr.$cstNode.end));
  }
  for (const [key, value] of Object.entries(upserts)) {
    if (regenerated.has(key)) continue;
    entries.push(`${key} ${formatMetadataValue(value, entryIndent)}`);
  }

  // Nothing left → delete the entire block.  Pass `consumeTrailingNewline:
  // false` so the trailing `\n` after the block stays intact — otherwise both
  // surrounding newlines collapse and adjacent body content (e.g.
  // `description 'd'` on the previous line, the body's closing `}` on the
  // following line) ends up squashed onto a single line.
  const cst = existingMeta.$cstNode;
  if (entries.length === 0) {
    const { offset, end } = expandRangeToConsumeSurroundingNewlines(
      fullText,
      cst.offset,
      cst.end,
      { consumeTrailingNewline: false },
    );
    return { offset, end, newText: '' };
  }

  let block = `\n${innerIndent}metadata {\n`;
  for (const entry of entries) {
    block += `${entryIndent}${entry}\n`;
  }
  block += `${innerIndent}}\n`;

  const { offset, end } = expandRangeToConsumeSurroundingNewlines(fullText, cst.offset, cst.end);
  return { offset, end, newText: block };
}
