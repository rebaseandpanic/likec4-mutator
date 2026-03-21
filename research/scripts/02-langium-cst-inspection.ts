/**
 * Script 2: CST (Concrete Syntax Tree) inspection in Langium
 *
 * Goal: check whether CST preserves positions, whitespace, comments
 */

import { parseHelper } from 'langium/test';
import {
  type CstNode,
  type CompositeCstNode,
  type LeafCstNode,
  isCompositeCstNode,
  isLeafCstNode,
  isRootCstNode,
  CstUtils,
} from 'langium';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } from '@likec4/language-server/module';

function printCstTree(node: CstNode, depth = 0, maxDepth = 4) {
  const indent = '  '.repeat(depth);
  const hidden = node.hidden ? ' [HIDDEN]' : '';
  const type = isLeafCstNode(node) ? `LEAF(${node.tokenType.name})` :
               isRootCstNode(node) ? 'ROOT' :
               isCompositeCstNode(node) ? 'COMPOSITE' : 'UNKNOWN';

  const textPreview = node.text.length > 60
    ? node.text.substring(0, 60).replace(/\n/g, '\\n') + '...'
    : node.text.replace(/\n/g, '\\n');

  console.log(`${indent}${type}${hidden} [${node.offset}:${node.end}] "${textPreview}"`);

  if (isCompositeCstNode(node) && depth < maxDepth) {
    for (const child of node.content) {
      printCstTree(child, depth + 1, maxDepth);
    }
  }
}

async function main() {
  console.log('=== Script 02: Langium CST Inspection ===\n');

  const services = createLanguageServices({
    ...NoFileSystem,
    ...NoLikeC4ManualLayouts,
    ...NoMCPServer,
  });

  const parse = parseHelper(services.likec4);

  const testInput = `// This is a comment
specification {
  element component
  element service
}
/* Multi-line
   comment */
model {
  // Inline comment
  customer = component 'Customer Frontend' {
    description 'A customer-facing app'
    #tag1, #tag2
  }
}`;

  const document = await parse(testInput);
  const root = document.parseResult.value.$cstNode!;

  // 1. CST tree
  console.log('--- 1. CST Tree (depth=3) ---');
  printCstTree(root, 0, 3);

  // 2. All leaf nodes (tokens)
  console.log('\n--- 2. All leaf nodes ---');
  const leaves = CstUtils.flattenCst(root);
  let leafCount = 0;
  for (const leaf of leaves) {
    leafCount++;
    const hidden = leaf.hidden ? ' [HIDDEN]' : '';
    const text = leaf.text.replace(/\n/g, '\\n');
    console.log(
      `  ${leaf.tokenType.name}${hidden} [${leaf.offset}:${leaf.end}] "${text}"`
    );
  }
  console.log(`  Total leaves: ${leafCount}`);

  // 3. Check for whitespace tokens
  console.log('\n--- 3. Searching for whitespace/hidden tokens ---');
  let hiddenCount = 0;
  let commentCount = 0;
  for (const leaf of CstUtils.flattenCst(root)) {
    if (leaf.hidden) {
      hiddenCount++;
      if (leaf.tokenType.name.includes('COMMENT') || leaf.tokenType.name.includes('comment') ||
          leaf.text.startsWith('//') || leaf.text.startsWith('/*')) {
        commentCount++;
        console.log(`  Comment: [${leaf.offset}:${leaf.end}] "${leaf.text.replace(/\n/g, '\\n')}"`);
      }
    }
  }
  console.log(`  Hidden tokens: ${hiddenCount}`);
  console.log(`  Comment tokens: ${commentCount}`);

  // 4. Check if original text can be recovered from CST
  console.log('\n--- 4. Text recovery from RootCstNode ---');
  if (isRootCstNode(root)) {
    console.log('  root.fullText === testInput:', root.fullText === testInput);
    console.log('  root.fullText length:', root.fullText.length);
    console.log('  testInput length:', testInput.length);
  }

  // 5. Check positions for a specific AST node
  console.log('\n--- 5. AST node positions ---');
  const astRoot = document.parseResult.value as any;
  console.log('  Root $type:', astRoot.$type);

  // Try to find elements in specification
  if (astRoot.specification) {
    console.log('  specification.$cstNode offset:', astRoot.specification.$cstNode?.offset);
    console.log('  specification.$cstNode end:', astRoot.specification.$cstNode?.end);
    console.log('  specification.$cstNode range:', JSON.stringify(astRoot.specification.$cstNode?.range));
  }

  // Walk through the model
  if (astRoot.models && astRoot.models.length > 0) {
    const model = astRoot.models[0];
    console.log('  model.$type:', model.$type);
    console.log('  model.$cstNode offset:', model.$cstNode?.offset);
    console.log('  model.$cstNode range:', JSON.stringify(model.$cstNode?.range));

    if (model.elements && model.elements.length > 0) {
      for (const el of model.elements) {
        console.log(`  element: ${el.name || el.$type}`);
        console.log(`    $cstNode offset: ${el.$cstNode?.offset}`);
        console.log(`    $cstNode end: ${el.$cstNode?.end}`);
        console.log(`    $cstNode text: "${el.$cstNode?.text.replace(/\n/g, '\\n')}"`);
        console.log(`    $cstNode range: ${JSON.stringify(el.$cstNode?.range)}`);
      }
    }
  }

  // 6. Check range (line/column)
  console.log('\n--- 6. Range contains line/character ---');
  const firstLeaf = CstUtils.flattenCst(root).head();
  if (firstLeaf) {
    console.log('  First leaf range:', JSON.stringify(firstLeaf.range));
    console.log('  Type of range.start:', typeof firstLeaf.range.start);
    console.log('  range.start.line:', firstLeaf.range.start.line);
    console.log('  range.start.character:', firstLeaf.range.start.character);
  }
}

main().catch(console.error);
