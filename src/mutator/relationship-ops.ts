/**
 * Text-edit operations that target model relationships.
 */
import type { ParsedDocument } from '../parser/types.js';
import { buildFqnIndex, resolveFqnRef } from '../query/fqn.js';
import type { TextEdit } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import { generateRelationship } from './codegen.js';

/**
 * Build a TextEdit that inserts a new relationship at model level,
 * appended just before the model block's closing `}`.
 *
 * @param doc    - Parsed document
 * @param source - Source element identifier (local name or FQN)
 * @param target - Target element identifier (local name or FQN)
 * @param label  - Optional relationship label
 * @returns TextEdit to insert the relationship
 */
export function addRelationshipEdit(
  doc: ParsedDocument,
  source: string,
  target: string,
  label?: string,
): TextEdit {
  const { ast, fullText } = doc;

  const model = ast.models?.[0];
  if (!model?.$cstNode) {
    throw new Error('No model block found in document');
  }

  const modelCst = model.$cstNode;
  const closingBrace = findClosingBrace(fullText, modelCst.offset, modelCst.end);
  const indent = '  ';

  const snippet = generateRelationship({ indent, source, target, label });
  const insertAt = insertionPointBeforeBrace(fullText, closingBrace);
  const braceLine = fullText.substring(insertAt, closingBrace + 1);
  const newText = '\n' + snippet + braceLine;

  return { offset: insertAt, end: closingBrace + 1, newText };
}

/**
 * Build a TextEdit that removes a relationship matching the given source and
 * target FQNs (or local names).  Only the first matching relationship is removed.
 *
 * @param doc    - Parsed document
 * @param source - Source FQN (or local name) to match
 * @param target - Target FQN (or local name) to match
 * @returns TextEdit that deletes the relationship line
 */
export function removeRelationshipEdit(
  doc: ParsedDocument,
  source: string,
  target: string,
): TextEdit {
  const { ast, fullText } = doc;
  const index = buildFqnIndex(ast);

  // Collect all relations from all model elements (recursively)
  const relations: any[] = [];
  for (const model of ast.models ?? []) {
    collectRelations(model.elements ?? [], '', relations);
  }

  // Find the matching relation node using exact FQN comparison only
  const rel = relations.find((r) => {
    const relSource = r.source ? resolveFqnRef(r.source) : r._parentFqn ?? '';
    const relTarget = resolveFqnRef(r.target);
    return relSource === source && relTarget === target;
  });

  if (!rel) {
    throw new Error(`Relationship '${source} -> ${target}' not found`);
  }

  const cst = rel.$cstNode;
  if (!cst) throw new Error(`Relationship '${source} -> ${target}' has no CST node`);

  // Expand range to include leading newline + indent and trailing newline
  let offset = cst.offset;
  let end = cst.end;

  const prevNewline = fullText.lastIndexOf('\n', offset - 1);
  if (prevNewline !== -1) {
    const between = fullText.substring(prevNewline + 1, offset);
    if (/^\s*$/.test(between)) {
      offset = prevNewline;
    }
  }

  if (fullText[end] === '\n') end += 1;

  return { offset, end, newText: '' };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function findClosingBrace(fullText: string, _start: number, endExclusive: number): number {
  for (let i = endExclusive - 1; i >= _start; i--) {
    if (fullText[i] === '}') return i;
  }
  throw new Error('Could not find closing brace');
}

function insertionPointBeforeBrace(fullText: string, closingBraceOffset: number): number {
  let i = closingBraceOffset - 1;
  while (i >= 0 && (fullText[i] === ' ' || fullText[i] === '\t')) {
    i--;
  }
  if (i >= 0 && fullText[i] === '\n') return i;
  return closingBraceOffset;
}

function collectRelations(elements: any[], parentFqn: string, results: any[]): void {
  for (const item of elements) {
    if (item.$type === 'Relation') {
      // Attach parent context for implicit-source relations
      const enriched = Object.create(item);
      enriched._parentFqn = parentFqn;
      results.push(enriched);
    } else if (item.$type === 'Element') {
      const fqn = parentFqn ? `${parentFqn}.${item.name}` : item.name;
      if (item.body?.elements) {
        collectRelations(item.body.elements, fqn, results);
      }
    }
  }
}
