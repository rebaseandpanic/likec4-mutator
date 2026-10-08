/**
 * Text-edit operations that target model elements.
 *
 * Each function accepts a pre-parsed document plus contextual arguments and
 * returns one or more TextEdits that, when applied to the source string, produce
 * the desired structural change.
 */
import type { ParsedDocument } from '../parser/types.js';
import { buildFqnIndex, readStrictFqnRef } from '../query/fqn.js';
import type { ExtendElementNode } from '../query/workspace-index.js';
import type { ExtendRelationNode } from '../query/relation-extends.js';
import type { TextEdit } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import {
  generateElement,
  generateStyleBlock,
  generateMetadataBlock,
  escapeString,
  formatLinkUrl,
  formatTag,
  type ElementStyle,
} from './codegen.js';
import {
  findClosingBraceOffset,
  buildInsertBeforeChildrenEdit,
  insertionPointBeforeBrace,
  expandRangeToConsumeSurroundingNewlines,
  buildInsertBodySnippet,
  buildRemovalEdit,
  buildReplaceLinksEdit as buildReplaceLinksEditShared,
  collectLeaves,
  type BodyOwnerNode,
} from './cst-helpers.js';
import {
  buildReplaceMetadataEditOnNode,
  buildStripMetadataKeysEdits,
  collectMetadataUpserts,
  type MetadataPatch,
} from './metadata-ops.js';

/**
 * Minimal structural interface for AST element nodes accessed by the private
 * helpers in this module.  Extends {@link BodyOwnerNode} with element-specific
 * fields (`kind`) and the optional CST `content` array used by
 * {@link collectLeaves}.
 */
interface AstElementNode extends BodyOwnerNode {
  $cstNode?: BodyOwnerNode['$cstNode'] & { content?: unknown[] };
  kind?: {
    $refText?: string;
    /** Langium reference CST node — present when the reference resolved or carried any token. */
    $refNode?: { offset: number; end: number };
  };
}

/**
 * Patch payload accepted by {@link updateElementEdit} and
 * {@link LikeC4Mutator.updateElement}.  Each field is optional — only
 * specified fields are applied; absent fields are preserved.
 */
export interface UpdateElementPatch {
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  style?: ElementStyle;
  metadata?: MetadataPatch;
}

export interface AddElementOpts {
  /** Local identifier for the new element */
  name: string;
  /** Element kind reference, e.g. 'service' */
  kind: string;
  /** Optional inline title */
  title?: string;
  /** Optional short summary shown on diagrams */
  summary?: string;
  /** Optional description */
  description?: string;
  /** Optional technology label */
  technology?: string;
  /** Optional tags — each tag name will be prefixed with `#` in the DSL */
  tags?: string[];
  /** Optional hyperlinks */
  links?: Array<{ url: string; label?: string }>;
  /** Optional visual style properties */
  style?: ElementStyle;
  /**
   * Optional metadata key/value pairs.  Each value may be a string or string[].
   * Empty arrays are not accepted by the LikeC4 grammar.
   */
  metadata?: Record<string, string | string[]>;
}

/**
 * Build a TextEdit that inserts a new element inside a parent element's body,
 * or at model level when `parentFqn` is null/empty.
 *
 * The new element is inserted just before the closing `}` of the target block.
 *
 * @param doc       - Parsed document
 * @param parentFqn - FQN of the container element, or empty/null for model-level
 * @param opts      - Properties for the new element
 * @returns TextEdit to insert the element text
 */
export function addElementEdit(
  doc: ParsedDocument,
  parentFqn: string | null,
  opts: AddElementOpts,
): TextEdit {
  const { ast, fullText } = doc;
  const index = buildFqnIndex(ast);

  let closingBraceOffset: number;
  let innerIndent: string;

  if (parentFqn) {
    const entry = index.get(parentFqn);
    if (!entry) {
      throw new Error(`Parent element '${parentFqn}' not found`);
    }
    const parentNode = entry.node;
    if (!parentNode.body?.$cstNode) {
      throw new Error(`Parent element '${parentFqn}' has no body`);
    }
    closingBraceOffset = findClosingBraceOffset(parentNode.body.$cstNode);
    // Inner indent = parent element indent + one level
    innerIndent = getNodeIndent(parentNode, fullText) + '  ';
  } else {
    // Model level: first model block
    const model = ast.models?.[0];
    if (!model?.$cstNode) {
      throw new Error('No model block found in document');
    }
    closingBraceOffset = findClosingBraceOffset(model.$cstNode);
    innerIndent = '  ';
  }

  const snippet = generateElement({ indent: innerIndent, ...opts });
  const insertAt = insertionPointBeforeBrace(fullText, closingBraceOffset);
  // The closing brace line (indent + }) must be preserved after the insertion.
  // We extract the brace line (from insertAt to closingBraceOffset+1) and rebuild it.
  const braceLine = fullText.substring(insertAt, closingBraceOffset + 1);
  const newText = '\n' + snippet + braceLine;

  return { offset: insertAt, end: closingBraceOffset + 1, newText };
}

/**
 * Build TextEdits that update one or more string properties on an existing
 * element.  If a property already exists its value is replaced in-place;
 * otherwise it is appended inside the body block.
 *
 * @param doc   - Parsed document
 * @param fqn   - FQN of the element to update
 * @param props - Properties to set (undefined values are skipped)
 * @returns List of TextEdits (may be empty if nothing changed)
 */
export function updateElementEdit(
  doc: ParsedDocument,
  fqn: string,
  props: UpdateElementPatch,
): TextEdit[] {
  const { ast, fullText } = doc;
  const index = buildFqnIndex(ast);
  const entry = index.get(fqn);
  if (!entry) throw new Error(`Element '${fqn}' not found`);

  const node = entry.node;
  const edits: TextEdit[] = [];

  // Handle title update.  A title can be declared inline
  // (`name = kind 'title'`) and/or as a `title '...'` body property.  Every
  // existing declaration is rewritten so the effective title is the new one
  // whichever declaration takes precedence; a new inline title is only added
  // when no declaration exists at all.
  if (props.title !== undefined) {
    edits.push(...buildTitleEdits(node, props.title));
  }

  // For body-targeting fields, when the element has no body and the patch
  // touches multiple body fields, emit ONE combined snippet that creates the
  // body and includes every field (matches the strategy used in
  // {@link relationship-ops.updateRelationshipEdit}).  Avoids the latent
  // multi-edit bug where two body-creation edits could each emit `' { ... } '`
  // at the same offset and produce two adjacent body blocks.
  const bodyTargeting =
    props.summary !== undefined ||
    props.description !== undefined ||
    props.technology !== undefined ||
    props.tags !== undefined ||
    props.links !== undefined ||
    (props.style !== undefined && Object.keys(props.style).length > 0) ||
    (props.metadata !== undefined && Object.keys(props.metadata).length > 0);

  if (bodyTargeting && !node.body?.$cstNode) {
    const insertEdit = buildCombinedBodyInsertElement(node, fullText, props);
    if (insertEdit) edits.push(insertEdit);
    return edits;
  }

  // Body exists — emit per-field edits.

  // Handle body string properties: summary / description / technology
  for (const key of ['summary', 'description', 'technology'] as const) {
    if (props[key] === undefined) continue;
    const value = props[key] as string;
    const propEdit = buildBodyPropEdit(node, fullText, key, value);
    if (propEdit) edits.push(propEdit);
  }

  // Handle tags — REPLACE semantics (v0.4.0 BREAKING change): every existing
  // tag in the body is removed, and the supplied set is inserted right after
  // the opening `{`.  An empty array clears all tags.
  if (props.tags !== undefined) {
    const tagEdit = buildReplaceTagsEdit(node, fullText, props.tags);
    if (tagEdit) edits.push(tagEdit);
  }

  // Handle links — replace ALL existing link lines, or insert if none exist.
  // Semantics: updateElement with links = "replace links entirely".
  if (props.links !== undefined) {
    edits.push(...buildReplaceLinksEdit(node, fullText, props.links));
  }

  // Handle style — MERGE per-field (v0.4.0 BREAKING change): each provided
  // field overwrites the corresponding existing value; absent fields are
  // preserved.  An empty patch object is a no-op.
  if (props.style !== undefined && Object.keys(props.style).length > 0) {
    const styleEdit = buildReplaceStyleEdit(node, fullText, props.style);
    if (styleEdit) edits.push(styleEdit);
  }

  // Handle metadata — MERGE + null-deletion: each key in the patch upserts
  // (string / string[]) or deletes (null); keys absent from the patch are
  // preserved.  An empty patch is a no-op.
  if (props.metadata !== undefined && Object.keys(props.metadata).length > 0) {
    edits.push(...buildReplaceMetadataEdit(node, fullText, props.metadata));
  }

  return edits;
}

/**
 * When an element has no body and the patch contains body-targeting fields,
 * emit ONE combined snippet that creates the body and inserts every patched
 * field at once.  The order inside the body follows the LikeC4 grammar:
 * tags first, then string props, links, style, metadata.
 */
function buildCombinedBodyInsertElement(
  node: AstElementNode,
  fullText: string,
  patch: UpdateElementPatch,
): TextEdit | null {
  const cst = node.$cstNode;
  if (!cst) return null;
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  let body = '';

  // Tags must come first per grammar.
  if (patch.tags && patch.tags.length > 0) {
    body += patch.tags.map((t) => `${innerIndent}${formatTag(t)}\n`).join('');
  }
  if (patch.summary !== undefined) {
    body += `${innerIndent}summary '${escapeString(patch.summary)}'\n`;
  }
  if (patch.description !== undefined) {
    body += `${innerIndent}description '${escapeString(patch.description)}'\n`;
  }
  if (patch.technology !== undefined) {
    body += `${innerIndent}technology '${escapeString(patch.technology)}'\n`;
  }
  if (patch.links && patch.links.length > 0) {
    for (const lnk of patch.links) {
      const escapedLabel = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
      body += `${innerIndent}link ${formatLinkUrl(lnk.url)}${escapedLabel}\n`;
    }
  }
  if (patch.style && Object.keys(patch.style).length > 0) {
    body += generateStyleBlock(patch.style, innerIndent);
  }
  if (patch.metadata) {
    const upserts = collectMetadataUpserts(patch.metadata);
    if (Object.keys(upserts).length > 0) {
      body += generateMetadataBlock(upserts, innerIndent);
    }
  }

  if (body === '') return null;

  const insertion = ' {\n' + body + `${indent}}`;
  return { offset: cst.end, end: cst.end, newText: insertion };
}

/**
 * Build a TextEdit that removes an element.  When the element occupies its
 * lines alone those lines are deleted; otherwise only the element text is cut
 * out.  Neighbouring lines are never joined (see {@link buildRemovalEdit}).
 *
 * @param doc - Parsed document
 * @param fqn - FQN of the element to remove
 * @returns TextEdit that deletes the element
 */
export function removeElementEdit(doc: ParsedDocument, fqn: string): TextEdit {
  const { ast, fullText } = doc;
  const index = buildFqnIndex(ast);
  const entry = index.get(fqn);
  if (!entry) throw new Error(`Element '${fqn}' not found`);

  const cst = entry.node.$cstNode;
  if (!cst) throw new Error(`Element '${fqn}' has no CST node`);

  const { offset, end, newText } = buildRemovalEdit(fullText, cst.offset, cst.end);
  return { offset, end, newText };
}

/** An `extend X { ... }` block of a document, with the FQN it extends. */
export interface ExtendBlock {
  /** FQN written after `extend` */
  target: string;
  /** Source range of the whole block */
  range: { offset: number; end: number };
}

/**
 * List the `extend X { ... }` blocks of a document whose target is `fqn` or
 * one of its descendants, in source order.
 *
 * @param doc - Parsed document
 * @param fqn - FQN of the element whose subtree is matched
 */
export function findExtendBlocks(doc: ParsedDocument, fqn: string): ExtendBlock[] {
  const blocks: ExtendBlock[] = [];
  for (const model of doc.ast.models ?? []) {
    for (const item of model.elements ?? []) {
      if (item.$type !== 'ExtendElement' || !item.$cstNode) continue;
      const target = readStrictFqnRef(item.element);
      if (target === undefined || (target !== fqn && !target.startsWith(fqn + '.'))) continue;
      blocks.push({ target, range: { offset: item.$cstNode.offset, end: item.$cstNode.end } });
    }
  }
  return blocks;
}

/**
 * Build a TextEdit that removes a whole `extend` block (see
 * {@link findExtendBlocks}), with the same line handling as
 * {@link removeElementEdit}.
 */
export function removeExtendBlockEdit(doc: ParsedDocument, block: ExtendBlock): TextEdit {
  const { offset, end, newText } = buildRemovalEdit(doc.fullText, block.range.offset, block.range.end);
  return { offset, end, newText };
}

/** What {@link clearExtendContributionsEdits} removes from an `extend` block. */
export interface ExtendClearing {
  /** Remove the block's tags */
  tags: boolean;
  /** Remove every `link` of the block */
  links: boolean;
  /**
   * Remove these metadata keys from every `metadata` block (see
   * `buildStripMetadataKeysEdits` for when an emptied block goes)
   */
  metadataKeys: string[];
}

/**
 * Build the TextEdits that remove tags, links and/or metadata keys from an
 * `extend X { ... }` block (or an `extend a -> b { ... }` block), so that
 * the block no longer contributes them to X.  Nested elements and relations, other properties and comments outside
 * the removed constructs are left as they are; a block that ends up empty
 * stays in place.
 *
 * @param doc        - Parsed document holding the block
 * @param node       - The `ExtendElement` / `ExtendRelation` AST node
 * @param clear      - What to remove
 * Every construct is removed with {@link buildRemovalEdit} (whole lines when
 * it stands alone on its lines), so the edits never overlap and everything
 * else in the block keeps its exact text.
 *
 * @returns Edits for the block (empty when it has nothing to remove)
 */
export function clearExtendContributionsEdits(
  doc: ParsedDocument,
  node: ExtendElementNode | ExtendRelationNode,
  clear: ExtendClearing,
): TextEdit[] {
  const { fullText } = doc;
  const edits: TextEdit[] = [];
  if (!node.body?.$cstNode) return edits;
  if (clear.tags) {
    const tagEdit = buildReplaceTagsEdit(node, fullText, []);
    if (tagEdit) edits.push(tagEdit);
  }
  if (clear.links) {
    edits.push(...buildReplaceLinksEdit(node, fullText, []));
  }
  if (clear.metadataKeys.length > 0) {
    edits.push(...buildStripMetadataKeysEdits(node, fullText, new Set(clear.metadataKeys)));
  }
  return edits;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Build the TextEdits that set the title of an element.
 *
 * - The inline title string (`name = kind 'title'`) is replaced when present.
 * - The value of a `title '...'` body property is replaced when present.
 * - When neither exists, an inline title is inserted right after the kind.
 *
 * Uses the kind reference's CST node directly as an anchor so the inline
 * lookup is not confused when `name === kindText` (a legal — if unusual —
 * case in the grammar).
 */
function buildTitleEdits(node: AstElementNode, newTitle: string): TextEdit[] {
  const newText = `'${escapeString(newTitle)}'`;
  const edits: TextEdit[] = [];

  const kindCst = node.kind?.$refNode;
  let inlineInsertAt: number | null = null;
  if (node.$cstNode && kindCst) {
    const kindEnd = kindCst.end;
    inlineInsertAt = kindEnd;
    // Look for the next quoted string leaf after kindEnd (and before any `{`).
    for (const leaf of collectLeaves(node.$cstNode)) {
      if (leaf.offset < kindEnd) continue;
      if (leaf.text === '{') break;
      if (leaf.text.startsWith("'") || leaf.text.startsWith('"')) {
        edits.push({ offset: leaf.offset, end: leaf.end, newText });
        inlineInsertAt = null;
        break;
      }
    }
  }

  // A body may declare `title` more than once; rewrite every declaration so
  // no stale title is left behind, whichever one a reader picks.
  let bodyTitleFound = false;
  for (const prop of node.body?.props ?? []) {
    if (prop.$type !== 'ElementStringProperty' || prop.key !== 'title') continue;
    const value = prop.value;
    const valueCst =
      value && typeof value === 'object'
        ? (value as { $cstNode?: { offset: number; end: number } }).$cstNode
        : undefined;
    if (!valueCst) continue;
    edits.push({ offset: valueCst.offset, end: valueCst.end, newText });
    bodyTitleFound = true;
  }
  if (!bodyTitleFound && inlineInsertAt !== null) {
    // No existing title anywhere — insert an inline one after the kind.
    edits.push({ offset: inlineInsertAt, end: inlineInsertAt, newText: ` ${newText}` });
  }
  return edits;
}

/**
 * Build a TextEdit that sets a body string property (summary / description / technology).
 * Replaces the existing value if present, otherwise appends before the closing `}`.
 */
function buildBodyPropEdit(
  node: AstElementNode,
  fullText: string,
  key: 'summary' | 'description' | 'technology',
  value: string,
): TextEdit | null {
  const newValueText = `'${escapeString(value)}'`;

  // Check if the property already exists in body.props
  const existingProp = node.body?.props?.find((p) => p.key === key);
  if (existingProp) {
    const v = existingProp.value as
      | { $cstNode?: { offset: number; end: number } }
      | string
      | number
      | boolean
      | null
      | undefined;
    const valueCst =
      v && typeof v === 'object' ? (v as { $cstNode?: { offset: number; end: number } }).$cstNode : undefined;
    if (valueCst) {
      return { offset: valueCst.offset, end: valueCst.end, newText: newValueText };
    }
  }

  // Property does not exist — ensure the element has a body
  if (!node.body?.$cstNode) {
    // The element has no body block at all; we need to add one.
    // Find the end of the element's inline portion (after title / kind)
    const cst = node.$cstNode;
    if (!cst) return null;
    const nodeEnd = cst.end;
    const indent = getNodeIndent(node, fullText);
    const innerIndent = indent + '  ';
    const insertion =
      ' {\n' + `${innerIndent}${key} ${newValueText}\n` + `${indent}}`;
    return { offset: nodeEnd, end: nodeEnd, newText: insertion };
  }

  // Body exists but property is missing — insert before the closing `}`
  // (or, when the body has child elements, before the first child, to keep
  // the LikeC4 grammar `(properties* tags*) children*` ordering valid).
  const closingBrace = findClosingBraceOffset(node.body.$cstNode);
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';
  const snippet = `${innerIndent}${key} ${newValueText}\n`;
  return buildInsertBeforeChildrenEdit(node, fullText, closingBrace, snippet);
}

/**
 * Element-scoped wrapper around the shared {@link buildReplaceLinksEditShared}
 * helper.  Computes the parent indent automatically from the element's CST
 * position.
 */
function buildReplaceLinksEdit(
  node: AstElementNode,
  fullText: string,
  links: Array<{ url: string; label?: string }>,
): TextEdit[] {
  const indent = getNodeIndent(node, fullText);
  return buildReplaceLinksEditShared(node, fullText, indent, links);
}

/**
 * Build a TextEdit that merges per-field updates into an existing
 * `style { ... }` block, or inserts a fresh block if none exists.
 *
 * Merge semantics: each style key in `patch` overwrites the corresponding
 * existing value; keys absent from `patch` are preserved with their original
 * value.  The block is fully regenerated from the merged map (so reordering
 * or stylistic differences from the original CST text are not preserved —
 * only the surviving key/value pairs).
 */
function buildReplaceStyleEdit(
  node: AstElementNode,
  fullText: string,
  patch: ElementStyle,
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  const existingStyle = node.body?.props?.find((p) => p.$type === 'ElementStyleProperty');
  if (!existingStyle?.$cstNode) {
    return buildInsertBodySnippet(node, fullText, indent, (ii) =>
      generateStyleBlock(patch, ii),
    );
  }

  const existing = readElementStyleProps(existingStyle, fullText);
  const merged: ElementStyle = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (merged as Record<string, unknown>)[k] = v;
  }

  const cst = existingStyle.$cstNode;
  const { offset, end } = expandRangeToConsumeSurroundingNewlines(fullText, cst.offset, cst.end);
  const newText = '\n' + generateStyleBlock(merged, innerIndent);
  return { offset, end, newText };
}

/**
 * Read existing element-style key/value pairs from a parsed
 * `ElementStyleProperty` AST node.  When the AST `value` field is undefined
 * (which happens for keyword-typed values such as `color blue`) the value is
 * recovered by parsing the raw CST text of the property.
 */
function readElementStyleProps(
  styleProp: NonNullable<NonNullable<AstElementNode['body']>['props']>[number],
  fullText: string,
): ElementStyle {
  const out: Record<string, unknown> = {};
  for (const rawSp of styleProp.props ?? []) {
    const sp = rawSp as {
      key?: string;
      name?: string;
      value?: unknown;
      $cstNode?: { offset: number; end: number };
    };
    const key = sp.key ?? sp.name;
    if (!key) continue;
    let value: unknown;
    const rawValue = sp.value;
    if (rawValue && typeof rawValue === 'object') {
      const obj = rawValue as { text?: unknown; value?: unknown };
      value = obj.text ?? obj.value;
    } else if (rawValue !== undefined && rawValue !== null) {
      value = rawValue;
    }
    if (value === undefined || value === null) {
      // Recover from CST text: "<key> <value>"
      const cst = sp.$cstNode;
      if (cst) {
        const text = fullText.substring(cst.offset, cst.end).trim();
        const space = text.indexOf(' ');
        if (space !== -1) value = text.substring(space + 1).trim();
      }
    }
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out as ElementStyle;
}

/**
 * Element-scoped wrapper around the shared metadata-edit helper.  Computes the
 * parent indent automatically from the element's CST position.
 */
function buildReplaceMetadataEdit(
  node: AstElementNode,
  fullText: string,
  patch: MetadataPatch,
): TextEdit[] {
  const indent = getNodeIndent(node, fullText);
  return buildReplaceMetadataEditOnNode(node, fullText, indent, patch);
}

/**
 * Build a TextEdit implementing REPLACE semantics for the body's tag block:
 *
 * - `tags === []` and an existing tag block is present → delete the block.
 * - `tags === []` and no existing block → no-op.
 * - `tags.length > 0` and no existing block → insert `#tag` lines right after
 *   the opening `{` (tags must precede property declarations per the grammar).
 * - `tags.length > 0` and an existing block → replace the existing block in-place.
 *
 * If the element has no body at all, one is created with the tags inside.
 */
function buildReplaceTagsEdit(
  node: AstElementNode,
  fullText: string,
  tags: string[],
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  // Read AST.  body.tags is a single Tags node (when present) covering all
  // tag references.  body is exposed via the structural shape used by other
  // helpers — we widen via a narrow cast for the tags field which is not part
  // of AstElementNode.
  const body = node.body as
    | (NonNullable<AstElementNode['body']> & {
        tags?: { $cstNode?: { offset: number; end: number } };
      })
    | undefined;
  const existingTagsCst = body?.tags?.$cstNode;

  // Build the replacement snippet (without leading newline — that is added by
  // the splice context where appropriate).
  const tagLines = tags.map((t) => `${innerIndent}${formatTag(t)}`).join('\n');

  // Case 1: no existing tag block.
  if (!existingTagsCst) {
    if (tags.length === 0) return null;
    // No body — wrap the tag lines into a fresh body block.
    if (!node.body?.$cstNode) {
      const cst = node.$cstNode;
      if (!cst) return null;
      const insertion = ' {\n' + tagLines + '\n' + `${indent}}`;
      return { offset: cst.end, end: cst.end, newText: insertion };
    }
    // Body exists — insert right after the opening `{` so the tags stay
    // before any property declarations (grammar requirement).
    const bodyCst = node.body.$cstNode;
    const openingBrace = bodyCst.offset;
    if (fullText[openingBrace] !== '{') {
      const kindText = node.kind?.$refText;
      const ctx = kindText ? ` (element kind=${kindText})` : '';
      throw new Error(`Expected opening brace at body CST offset${ctx}`);
    }
    const insertAt = openingBrace + 1;
    return { offset: insertAt, end: insertAt, newText: '\n' + tagLines + '\n' };
  }

  // Case 2: existing tag block.  Clearing deletes it without joining the
  // neighbouring lines; replacing swaps it for the new tag lines.
  if (tags.length === 0) {
    const { offset, end, newText } = buildRemovalEdit(
      fullText,
      existingTagsCst.offset,
      existingTagsCst.end,
    );
    return { offset, end, newText };
  }
  const { offset, end } = expandRangeToConsumeSurroundingNewlines(
    fullText,
    existingTagsCst.offset,
    existingTagsCst.end,
  );
  return { offset, end, newText: '\n' + tagLines + '\n' };
}

