/**
 * Metadata read/merge/write helpers shared by element-ops and relationship-ops.
 *
 * The metadata block in the LikeC4 grammar accepts both scalar string values
 * (`key 'value'`) and array values (`key ['v1', 'v2']`).  These helpers expose
 * a single in-memory representation (`Record<string, string | string[]>`) plus
 * a patch type that allows `null` to mean "delete this key".
 */
import type { TextEdit } from './text-edit.js';
import { formatMetadataValue, generateMetadataBlock, validateMetadataKey } from './codegen.js';
import {
  expandRangeToConsumeSurroundingNewlines,
  buildInsertBodySnippet,
  type BodyOwnerNode,
} from './cst-helpers.js';

/** Read API representation: every value is either a string or string[]. */
export type MetadataMap = Record<string, string | string[]>;

/**
 * Patch representation: `string` / `string[]` upserts the key, `null` deletes
 * the key.  Keys absent from the patch are preserved verbatim from the
 * existing metadata block.
 */
export type MetadataPatch = Record<string, string | string[] | null>;

// ---------------------------------------------------------------------------
// Read existing metadata block
// ---------------------------------------------------------------------------

interface MetadataAttributeShape {
  $type?: string;
  $cstNode?: { offset: number; end: number; text?: string };
  key?: string;
  name?: string;
  value?: {
    $type?: string;
    text?: string;
    value?: string;
    values?: Array<{ text?: string; value?: string }>;
    $cstNode?: {
      offset: number;
      end: number;
      text?: string;
      range?: {
        start?: { line?: number };
        end?: { line?: number };
      };
    };
  };
}

interface MetadataBodyShape {
  $type?: string;
  $cstNode?: { offset: number; end: number };
  props?: MetadataAttributeShape[];
}

/**
 * Extract `key → string | string[]` pairs from a parsed `MetadataBody` AST node.
 * Both scalar (`MarkdownOrString`) and array (`MetadataArray`) value shapes are
 * supported.  Entries whose value cannot be extracted are silently omitted.
 */
export function readMetadataBlock(metaBody: MetadataBodyShape): MetadataMap {
  const out: MetadataMap = {};
  for (const attr of metaBody.props ?? []) {
    const key = attr.key ?? attr.name;
    if (!key) continue;
    const value = attr.value;
    if (!value) continue;
    if (value.$type === 'MetadataArray' && Array.isArray(value.values)) {
      const items = value.values.map((v) => v.text ?? v.value ?? '');
      out[key] = items;
      continue;
    }
    // MarkdownOrString or older shape — text or value
    if (typeof value.text === 'string') {
      out[key] = value.text;
      continue;
    }
    if (typeof value.value === 'string') {
      out[key] = value.value;
      continue;
    }
    if (typeof attr.value === 'string') {
      out[key] = attr.value as unknown as string;
      continue;
    }
    // Silent skip — value cannot be extracted, entry is omitted.
  }
  return out;
}

/**
 * Merge `existing` with `patch`.  `null` in the patch deletes the key; any
 * other value upserts it.  Keys absent from `patch` are preserved verbatim.
 */
export function mergeMetadata(existing: MetadataMap, patch: MetadataPatch): MetadataMap {
  const merged: MetadataMap = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
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
 *  - When a metadata block exists, the merged result replaces the existing
 *    block.  Keys that the patch did not touch are preserved with their
 *    original CST text (round-trip stability for multi-line vs inline arrays).
 *  - When the merged result is empty, the existing block is deleted entirely
 *    (along with the surrounding newlines).
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

  // Validate up-front that no upsert value is an empty array — this is a
  // grammar limitation we surface early so the caller sees the error before
  // any other edits run.
  for (const [key, value] of Object.entries(patch)) {
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

  // Case 1: no existing metadata block.
  if (!existingMeta?.$cstNode) {
    // Drop pure deletes — they are no-ops.
    const upserts: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null) upserts[k] = v;
    }
    if (Object.keys(upserts).length === 0) return null;
    return buildInsertBodySnippet(bodyOwner, fullText, indent, (ii) =>
      generateMetadataBlock(upserts, ii),
    );
  }

  // Case 2: existing block — read keys, capture per-key CST text for round-trip
  // stability of array literal formatting.
  const existing = readMetadataBlock(existingMeta);
  const merged = mergeMetadata(existing, patch);

  // Sub-case: merged is empty → delete the entire block.  Pass
  // `consumeTrailingNewline: false` so the trailing `\n` after the block stays
  // intact — otherwise both surrounding newlines collapse and adjacent body
  // content (e.g. `description 'd'` on the previous line, the body's closing
  // `}` on the following line) ends up squashed onto a single line.
  const cst = existingMeta.$cstNode!;
  if (Object.keys(merged).length === 0) {
    const { offset, end } = expandRangeToConsumeSurroundingNewlines(
      fullText,
      cst.offset,
      cst.end,
      { consumeTrailingNewline: false },
    );
    return { offset, end, newText: '' };
  }

  // Build the per-key CST-text override map: keys that the patch did NOT touch
  // and that have a usable CST text are emitted verbatim, preserving e.g.
  // multi-line vs inline array formatting.
  const verbatim: Record<string, string> = {};
  for (const attr of existingMeta.props ?? []) {
    const k = attr.key ?? attr.name;
    if (!k) continue;
    if (Object.prototype.hasOwnProperty.call(patch, k)) continue; // patched, regenerate
    const valueCst = attr.value?.$cstNode;
    const keyCst = attr.$cstNode;
    if (!valueCst || !keyCst) continue;
    // Verbatim text = the slice of fullText covering the key+value range.
    verbatim[k] = fullText.substring(keyCst.offset, valueCst.end);
  }

  // Generate the merged block with verbatim overrides.
  let block = `\n${innerIndent}metadata {\n`;
  for (const [key, value] of Object.entries(merged)) {
    if (Object.prototype.hasOwnProperty.call(verbatim, key)) {
      block += `${entryIndent}${verbatim[key]}\n`;
    } else {
      validateMetadataKey(key);
      const formatted = formatMetadataValue(value, entryIndent);
      block += `${entryIndent}${key} ${formatted}\n`;
    }
  }
  block += `${innerIndent}}\n`;

  const { offset, end } = expandRangeToConsumeSurroundingNewlines(fullText, cst.offset, cst.end);
  return { offset, end, newText: block };
}

