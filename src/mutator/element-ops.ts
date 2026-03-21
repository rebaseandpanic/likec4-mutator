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

  // Handle links — insert each as `link <url> ['label']` before closing brace
  if (props.links !== undefined && props.links.length > 0) {
    const linkEdit = buildInsertBodySnippet(node, fullText, (innerIndent) =>
      props.links!
        .map((lnk) => {
          const escaped = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
          return `${innerIndent}link ${lnk.url}${escaped}`;
        })
        .join('\n') + '\n',
    );
    if (linkEdit) edits.push(linkEdit);
  }

  // Handle style — insert a `style { ... }` block before closing brace
  if (props.style !== undefined && Object.keys(props.style).length > 0) {
    const styleEdit = buildInsertBodySnippet(node, fullText, (innerIndent) =>
      generateStyleBlock(props.style!, innerIndent),
    );
    if (styleEdit) edits.push(styleEdit);
  }

  // Handle metadata — insert a `metadata { key 'value' }` block before closing brace
  if (props.metadata !== undefined && Object.keys(props.metadata).length > 0) {
    const metaEdit = buildInsertBodySnippet(node, fullText, (innerIndent) => {
      const innerInnerIndent = innerIndent + '  ';
      let block = `${innerIndent}metadata {\n`;
      for (const [key, value] of Object.entries(props.metadata!)) {
        block += `${innerInnerIndent}${key} '${escapeString(value)}'\n`;
      }
      block += `${innerIndent}}\n`;
      return block;
    });
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
 * Find the offset of the closing `}` within a range of the source text.
 * Scans backwards from `endExclusive` to locate the `}` character.
 * Returns the offset of the `}` character itself.
 */
function findClosingBrace(fullText: string, _startOffset: number, endExclusive: number): number {
  // The body CST end is exclusive and should point just past the `}`.
  // Scan backwards from endExclusive - 1.
  for (let i = endExclusive - 1; i >= _startOffset; i--) {
    if (fullText[i] === '}') return i;
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
function buildTitleEdit(node: any, fullText: string, newTitle: string): TextEdit | null {
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
  node: any,
  fullText: string,
  key: 'summary' | 'description' | 'technology',
  value: string,
): TextEdit | null {
  const newValueText = `'${escapeString(value)}'`;

  // Check if the property already exists in body.props
  const existingProp = node.body?.props?.find((p: any) => p.key === key);
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
 * Build a TextEdit that inserts `#tagname` references right after the opening `{`
 * of an element's body.  Tag references MUST precede property declarations in the
 * LikeC4 grammar, so we cannot simply append them at the end of the block.
 *
 * If the element has no body block yet, one is created with the tags inside.
 */
function buildInsertTagsAfterOpeningBrace(
  node: any,
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
  node: any,
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
