/**
 * Text-edit operations that target model elements.
 *
 * Each function accepts a pre-parsed document plus contextual arguments and
 * returns one or more TextEdits that, when applied to the source string, produce
 * the desired structural change.
 */
import type { ParsedDocument } from '../parser/types.js';
import { buildFqnIndex } from '../query/fqn.js';
import type { TextEdit } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import { generateElement, generateStyleBlock, escapeString, type ElementStyle } from './codegen.js';

/**
 * Minimal structural interface for AST element nodes accessed by the private
 * helpers in this module.  Avoids relying on `any` for the shape used in
 * `buildTitleEdit`, `buildBodyPropEdit`, `buildReplaceLinksEdit`,
 * `buildReplaceStyleEdit`, `buildReplaceMetadataEdit`,
 * `buildInsertTagsAfterOpeningBrace`, and `buildInsertBodySnippet`.
 */
interface AstElementNode {
  $cstNode?: { offset: number; end: number; content?: unknown[] };
  body?: {
    $cstNode?: { offset: number; end: number };
    props?: Array<{
      $type?: string;
      $cstNode?: { offset: number; end: number };
      key?: string;
      name?: string;
      value?: { $cstNode?: { offset: number; end: number }; text?: string; value?: string };
      props?: Array<{
        key?: string;
        name?: string;
        value?: { text?: string; value?: string };
      }>;
    }>;
  };
  kind?: { $refText?: string };
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
  /** Optional metadata key/value pairs */
  metadata?: Record<string, string>;
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
    const bodyCst = parentNode.body.$cstNode;
    // The closing } is the last non-whitespace character of the body block.
    // bodyCst.end points one past the }, so bodyCst.end - 1 is the }.
    closingBraceOffset = findClosingBrace(fullText, bodyCst.offset, bodyCst.end);
    // Inner indent = parent element indent + one level
    innerIndent = getNodeIndent(parentNode, fullText) + '  ';
  } else {
    // Model level: first model block
    const model = ast.models?.[0];
    if (!model?.$cstNode) {
      throw new Error('No model block found in document');
    }
    const modelCst = model.$cstNode;
    closingBraceOffset = findClosingBrace(fullText, modelCst.offset, modelCst.end);
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
  props: Partial<{
    title: string;
    summary: string;
    description: string;
    technology: string;
    tags: string[];
    links: Array<{ url: string; label?: string }>;
    style: ElementStyle;
    metadata: Record<string, string>;
  }>,
): TextEdit[] {
  const { ast, fullText } = doc;
  const index = buildFqnIndex(ast);
  const entry = index.get(fqn);
  if (!entry) throw new Error(`Element '${fqn}' not found`);

  const node = entry.node;
  const edits: TextEdit[] = [];

  // Handle title update — title lives as the first positional prop in the
  // inline `name = kind 'title'` syntax.  We need to find its CST position
  // by scanning the element's own CST token stream.
  if (props.title !== undefined) {
    const titleEdit = buildTitleEdit(node, fullText, props.title);
    if (titleEdit) edits.push(titleEdit);
  }

  // Handle body string properties: summary / description / technology
  for (const key of ['summary', 'description', 'technology'] as const) {
    if (props[key] === undefined) continue;
    const value = props[key] as string;
    const propEdit = buildBodyPropEdit(node, fullText, key, value);
    if (propEdit) edits.push(propEdit);
  }

  // Handle tags — insert each tag as `#tagname` right after the opening `{` of
  // the element body (before any string props), because the LikeC4 grammar
  // requires tag references to appear before property declarations.
  if (props.tags !== undefined && props.tags.length > 0) {
    const tagEdit = buildInsertTagsAfterOpeningBrace(node, fullText, props.tags);
    if (tagEdit) edits.push(tagEdit);
  }

  // Handle links — replace ALL existing link lines, or insert if none exist.
  // Semantics: updateElement with links = "replace links entirely".
  if (props.links !== undefined) {
    const linkEdit = buildReplaceLinksEdit(node, fullText, props.links);
    if (linkEdit) edits.push(linkEdit);
  }

  // Handle style — replace existing `style { ... }` block if present, otherwise insert.
  // Semantics: updateElement with style = "replace style entirely".
  if (props.style !== undefined && Object.keys(props.style).length > 0) {
    const styleEdit = buildReplaceStyleEdit(node, fullText, props.style);
    if (styleEdit) edits.push(styleEdit);
  }

  // Handle metadata — replace existing `metadata { ... }` block if present (merging
  // keys: new values overwrite, keys absent from new payload are preserved), otherwise insert.
  // Semantics: updateElement with metadata = "replace metadata entirely".
  if (props.metadata !== undefined && Object.keys(props.metadata).length > 0) {
    const metaEdit = buildReplaceMetadataEdit(node, fullText, props.metadata);
    if (metaEdit) edits.push(metaEdit);
  }

  return edits;
}

/**
 * Build a TextEdit that removes an element and the newline(s) surrounding it.
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

  // Expand the deletion range to consume the preceding newline (and any
  // trailing whitespace on the same line) so we do not leave blank lines.
  let offset = cst.offset;
  let end = cst.end;

  // Walk back past indentation on the same line to include the leading newline
  const prevNewline = fullText.lastIndexOf('\n', offset - 1);
  if (prevNewline !== -1) {
    // Check that everything between prevNewline+1 and offset is whitespace
    const between = fullText.substring(prevNewline + 1, offset);
    if (/^\s*$/.test(between)) {
      offset = prevNewline; // include the \n before the indent
    }
  }

  // Also consume trailing newline after the element
  if (fullText[end] === '\n') {
    end += 1;
  }

  return { offset, end, newText: '' };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Find the offset of the matching closing `}` for the opening `{` at `startOffset`.
 *
 * Uses a forward brace-counting algorithm starting from the `{` character at
 * `startOffset`.  Braces inside single-quoted string literals are ignored.
 * This guarantees the correct closing brace is found even when the block
 * contains deeply nested child elements.
 *
 * @param fullText    - Full source text
 * @param startOffset - Offset of the opening `{` character
 * @param endExclusive - Exclusive end of the range to scan (used as upper bound)
 * @returns Offset of the matching `}` character
 */
function findClosingBrace(fullText: string, startOffset: number, endExclusive: number): number {
  // Find the opening brace at or after startOffset
  let openIdx = startOffset;
  while (openIdx < endExclusive && fullText[openIdx] !== '{') {
    openIdx++;
  }
  if (openIdx >= endExclusive) {
    throw new Error('Could not find opening brace in range');
  }

  let depth = 0;
  let i = openIdx;
  while (i < endExclusive) {
    const ch = fullText[i];
    if (ch === "'") {
      // Skip over a single-quoted string literal
      i++;
      while (i < endExclusive) {
        const sc = fullText[i];
        if (sc === '\\') {
          // Guard against overshooting endExclusive on the last character
          i = Math.min(i + 2, endExclusive);
          continue;
        }
        if (sc === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      // Skip over a double-quoted string literal
      i++;
      while (i < endExclusive) {
        const sc = fullText[i];
        if (sc === '\\') {
          i = Math.min(i + 2, endExclusive);
          continue;
        }
        if (sc === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '/' && fullText[i + 1] === '/') {
      // Skip a line comment — advance to the end of the line
      i += 2;
      while (i < endExclusive && fullText[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  throw new Error('Could not find closing brace in range');
}

/**
 * Find the insertion offset for new content inside a block whose closing `}`
 * is at `closingBraceOffset`.
 *
 * The `}` is typically preceded by `\n<indent>`, e.g. `\n  }`.  To keep the
 * indentation of the closing brace intact after the insertion we insert at the
 * newline that immediately precedes the brace indent, not at the brace itself.
 *
 * For example, given:
 *   ...content\n  }
 *                ^-- we want to insert here (at the \n), not at the }
 *
 * This way the result is:
 *   ...content\n  <new element>\n  }
 */
function insertionPointBeforeBrace(
  fullText: string,
  closingBraceOffset: number,
): number {
  // Walk back from the } to find the preceding newline.
  // Everything between that newline and the } should be whitespace (the indent).
  let i = closingBraceOffset - 1;
  while (i >= 0 && (fullText[i] === ' ' || fullText[i] === '\t')) {
    i--;
  }
  // If we stopped at a newline, that newline is the insertion point.
  if (i >= 0 && fullText[i] === '\n') {
    return i; // insert at (and including) this newline
  }
  // Fallback: insert right before the }
  return closingBraceOffset;
}

/**
 * Build a TextEdit that replaces the inline title string of an element.
 * Returns null if no title token can be located.
 */
function buildTitleEdit(node: AstElementNode, fullText: string, newTitle: string): TextEdit | null {
  // The element CST contains `name = kind 'title'` as leaf tokens.
  // We look for a string literal (quoted) leaf that comes after the kind token.
  const cst = node.$cstNode;
  if (!cst) return null;

  const leaves = collectLeaves(cst);

  // Find the kind token index
  const kindText = node.kind?.$refText ?? '';
  const kindIdx = leaves.findIndex((l) => l.text === kindText);
  if (kindIdx === -1) return null;

  // Look for the next quoted string leaf after the kind token (and before any {)
  for (let i = kindIdx + 1; i < leaves.length; i++) {
    const leaf = leaves[i];
    if (leaf.text === '{') break;
    if (leaf.text.startsWith("'") || leaf.text.startsWith('"')) {
      // Replace this token
      return { offset: leaf.offset, end: leaf.end, newText: `'${escapeString(newTitle)}'` };
    }
  }

  // No existing title — insert after the kind token
  const kindLeaf = leaves[kindIdx];
  return { offset: kindLeaf.end, end: kindLeaf.end, newText: ` '${escapeString(newTitle)}'` };
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
    const valueCst = existingProp.value?.$cstNode;
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
  const bodyCst = node.body.$cstNode;
  const closingBrace = findClosingBrace(fullText, bodyCst.offset, bodyCst.end);
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';
  const newText = `${innerIndent}${key} ${newValueText}\n`;
  return { offset: closingBrace, end: closingBrace, newText };
}

/**
 * Build a TextEdit that replaces all existing `link ...` lines in the element body
 * with a new set of link lines derived from `links`.
 *
 * If the element already has link entries they are all deleted and the new links
 * are inserted in a single edit before the closing `}`.  If no existing links are
 * present the new links are simply inserted (same as the old behaviour).
 *
 * If `links` is an empty array and existing links are present, the existing links
 * are deleted and nothing is inserted.
 */
function buildReplaceLinksEdit(
  node: AstElementNode,
  fullText: string,
  links: Array<{ url: string; label?: string }>,
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  // Collect existing LinkProperty CST nodes from body
  const existingLinks: Array<{ offset: number; end: number }> = [];
  if (node.body?.props) {
    for (const prop of node.body.props) {
      if (prop.$type === 'LinkProperty' && prop.$cstNode) {
        existingLinks.push({ offset: prop.$cstNode.offset, end: prop.$cstNode.end });
      }
    }
  }

  if (existingLinks.length === 0) {
    // No existing links — insert new ones before closing brace (or create body)
    if (links.length === 0) return null;
    return buildInsertBodySnippet(node, fullText, (ii) =>
      links
        .map((lnk) => {
          const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
          return `${ii}link ${lnk.url}${escaped}`;
        })
        .join('\n') + '\n',
    );
  }

  // Existing links found: sort by offset ascending, then delete each one (expanding
  // to consume the surrounding newline), and insert the new set before the closing `}`.
  // We produce one replacement edit per existing link (deletes) plus one insert.
  // However, since we need to return a single TextEdit from this function, we instead
  // build a replacement that covers the range from the first to last existing link and
  // puts the new link lines in their place — but only when the links are contiguous.
  // In practice, LikeC4 link lines are always adjacent, so we can replace the range.

  // Sort ascending
  existingLinks.sort((a, b) => a.offset - b.offset);

  // Expand each link's range to consume its preceding newline + indent so we do not
  // leave blank lines.  Merge the expanded ranges into one contiguous replacement.
  let mergedStart = existingLinks[0].offset;
  let mergedEnd = existingLinks[existingLinks.length - 1].end;

  // Walk back from the first link to consume the leading newline
  let i = mergedStart - 1;
  while (i >= 0 && (fullText[i] === ' ' || fullText[i] === '\t')) i--;
  if (i >= 0 && fullText[i] === '\n') {
    mergedStart = i; // include the \n
  }

  // Consume trailing newline after the last link
  if (fullText[mergedEnd] === '\n') {
    mergedEnd += 1;
  }

  // Generate replacement text
  let newText: string;
  if (links.length === 0) {
    newText = '';
  } else {
    newText =
      '\n' +
      links
        .map((lnk) => {
          const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
          return `${innerIndent}link ${lnk.url}${escaped}`;
        })
        .join('\n') +
      '\n';
  }

  return { offset: mergedStart, end: mergedEnd, newText };
}

/**
 * Build a TextEdit that replaces an existing `style { ... }` block entirely, or
 * inserts a new one if none exists.
 *
 * Merge semantics: the new `style` object completely replaces the old block.
 */
function buildReplaceStyleEdit(
  node: AstElementNode,
  fullText: string,
  style: ElementStyle,
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  // Find existing ElementStyleProperty CST node
  const existingStyle = node.body?.props?.find((p) => p.$type === 'ElementStyleProperty');
  if (!existingStyle?.$cstNode) {
    // No existing style — insert before closing brace
    return buildInsertBodySnippet(node, fullText, (ii) => generateStyleBlock(style, ii));
  }

  // Replace the existing block
  const cst = existingStyle.$cstNode;
  // Expand to consume the leading newline + indent
  let start = cst.offset;
  let end = cst.end;
  let j = start - 1;
  while (j >= 0 && (fullText[j] === ' ' || fullText[j] === '\t')) j--;
  if (j >= 0 && fullText[j] === '\n') {
    start = j;
  }
  if (fullText[end] === '\n') end += 1;

  const newText = '\n' + generateStyleBlock(style, innerIndent);
  return { offset: start, end, newText };
}

/**
 * Build a TextEdit that replaces an existing `metadata { ... }` block entirely,
 * merging keys (new values overwrite, keys absent from new payload are preserved),
 * or inserts a new block if none exists.
 */
function buildReplaceMetadataEdit(
  node: AstElementNode,
  fullText: string,
  metadata: Record<string, string>,
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';
  const innerInnerIndent = innerIndent + '  ';

  // Find existing MetadataBody CST node
  const existingMeta = node.body?.props?.find((p) => p.$type === 'MetadataBody');
  if (!existingMeta?.$cstNode) {
    // No existing metadata block — insert before closing brace
    return buildInsertBodySnippet(node, fullText, (ii) => {
      const iii = ii + '  ';
      let block = `${ii}metadata {\n`;
      for (const [key, value] of Object.entries(metadata)) {
        block += `${iii}${key} '${escapeString(value)}'\n`;
      }
      block += `${ii}}\n`;
      return block;
    });
  }

  // Parse existing key/value pairs from the AST node.
  // MetadataAttribute nodes have .key (string) and .value (MarkdownOrString with .text field).
  const existingPairs: Record<string, string> = {};
  if (existingMeta.props) {
    for (const mp of existingMeta.props) {
      const key = mp.key ?? mp.name;
      // MarkdownOrString node: actual string is in .text
      const val = mp.value?.text ?? mp.value?.value ?? mp.value;
      if (key && typeof val === 'string') {
        existingPairs[key] = val;
      } else if (key) {
        // The key exists in the AST but its value could not be extracted as a
        // string (e.g. the AST shape changed or the node is malformed).
        // Log a warning so callers can diagnose issues rather than silently
        // dropping the entry.
        console.warn(
          `[likec4-mutator] buildReplaceMetadataEdit: could not extract string value for metadata key '${key}' — entry will be omitted from the merged block`,
        );
      }
    }
  }

  // Merge: existing keys that are NOT in the new payload are preserved
  const merged: Record<string, string> = { ...existingPairs, ...metadata };

  // Replace the existing block
  const cst = existingMeta.$cstNode;
  let start = cst.offset;
  let end = cst.end;
  let j = start - 1;
  while (j >= 0 && (fullText[j] === ' ' || fullText[j] === '\t')) j--;
  if (j >= 0 && fullText[j] === '\n') {
    start = j;
  }
  if (fullText[end] === '\n') end += 1;

  let block = `\n${innerIndent}metadata {\n`;
  for (const [key, value] of Object.entries(merged)) {
    block += `${innerInnerIndent}${key} '${escapeString(value)}'\n`;
  }
  block += `${innerIndent}}\n`;

  return { offset: start, end, newText: block };
}

/**
 * Build a TextEdit that inserts `#tagname` references right after the opening `{`
 * of an element's body.  Tag references MUST precede property declarations in the
 * LikeC4 grammar, so we cannot simply append them at the end of the block.
 *
 * If the element has no body block yet, one is created with the tags inside.
 */
function buildInsertTagsAfterOpeningBrace(
  node: AstElementNode,
  fullText: string,
  tags: string[],
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';
  const snippet = tags.map((t) => `${innerIndent}#${t}`).join('\n') + '\n';

  if (!node.body?.$cstNode) {
    // No body — create one and put the tags inside it
    const cst = node.$cstNode;
    if (!cst) return null;
    const insertion = ' {\n' + snippet + `${indent}}`;
    return { offset: cst.end, end: cst.end, newText: insertion };
  }

  // Body exists — insert the tags right after the opening `{`
  const bodyCst = node.body.$cstNode;
  // Find the opening brace offset within the body CST
  const openingBrace = bodyCst.offset; // the { is the first char of the body CST
  if (fullText[openingBrace] !== '{') {
    throw new Error('Expected opening brace at body CST offset');
  }
  // Insert right after the `{` character
  const insertAt = openingBrace + 1;
  return { offset: insertAt, end: insertAt, newText: '\n' + snippet };
}

/**
 * Build a TextEdit that inserts a generated snippet just before the closing `}`
 * of an element's body.  If the element has no body block yet, one is created.
 *
 * The `snippetFn` receives the inner indent string and must return the text to
 * insert (including a trailing newline).
 */
function buildInsertBodySnippet(
  node: AstElementNode,
  fullText: string,
  snippetFn: (innerIndent: string) => string,
): TextEdit | null {
  const indent = getNodeIndent(node, fullText);
  const innerIndent = indent + '  ';

  if (!node.body?.$cstNode) {
    // No body block — append one after the element's inline portion
    const cst = node.$cstNode;
    if (!cst) return null;
    const snippet = snippetFn(innerIndent);
    const insertion = ' {\n' + snippet + `${indent}}`;
    return { offset: cst.end, end: cst.end, newText: insertion };
  }

  // Body exists — insert before the closing `}`
  const bodyCst = node.body.$cstNode;
  const closingBrace = findClosingBrace(fullText, bodyCst.offset, bodyCst.end);
  const snippet = snippetFn(innerIndent);
  return { offset: closingBrace, end: closingBrace, newText: snippet };
}

/**
 * Collect all leaf CST nodes in document order from a composite node.
 */
function collectLeaves(node: any): Array<{ offset: number; end: number; text: string }> {
  const result: Array<{ offset: number; end: number; text: string }> = [];
  function walk(n: any) {
    if (n.content) {
      for (const child of n.content) walk(child);
    } else {
      result.push({ offset: n.offset, end: n.end, text: n.text as string });
    }
  }
  walk(node);
  return result;
}
