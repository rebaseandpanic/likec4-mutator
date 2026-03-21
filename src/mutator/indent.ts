/**
 * Indentation detection and extraction utilities.
 */

/**
 * Detect the indentation unit used in a source file by looking at the first
 * indented line. Falls back to two spaces if no indented line is found.
 *
 * @param source - Full source text
 * @returns Indentation string (e.g. '  ' or '\t')
 */
export function detectIndent(source: string): string {
  const match = source.match(/\n(\s+)\S/);
  return match ? match[1] : '  ';
}

/**
 * Get the leading whitespace of the line on which an AST node starts.
 *
 * @param node     - Any AST node that has a $cstNode
 * @param fullText - Full source text of the document
 * @returns Indentation string for that node's line
 */
export function getNodeIndent(node: any, fullText: string): string {
  const cst = node.$cstNode;
  if (!cst) return '  ';
  const lineStart = fullText.lastIndexOf('\n', cst.offset);
  if (lineStart === -1) return '';
  const textBefore = fullText.substring(lineStart + 1, cst.offset);
  const match = textBefore.match(/^(\s*)/);
  return match ? match[1] : '';
}
