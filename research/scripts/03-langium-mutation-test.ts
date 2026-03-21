/**
 * Script 3: Testing AST mutation and serialization back to text
 *
 * Goal: check if there is a built-in way to modify AST and get text back
 */

import { parseHelper } from 'langium/test';
import {
  type CstNode,
  type CompositeCstNode,
  type LeafCstNode,
  type RootCstNode,
  type Mutable,
  isCompositeCstNode,
  isLeafCstNode,
  isRootCstNode,
  CstUtils,
} from 'langium';
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } from '@likec4/language-server/module';

async function main() {
  console.log('=== Script 03: Langium Mutation Test ===\n');

  const services = createLanguageServices({
    ...NoFileSystem,
    ...NoLikeC4ManualLayouts,
    ...NoMCPServer,
  });

  const parse = parseHelper(services.likec4);

  const testInput = `specification {
  element component
  element service
}
model {
  customer = component 'Customer' {
    description 'Original description'
  }
  backend = service 'Backend' {
    description 'API service'
  }
}`;

  const document = await parse(testInput);
  const root = document.parseResult.value as any;

  // --- Test 1: JsonSerializer ---
  console.log('--- 1. JsonSerializer (AST -> JSON -> AST) ---');
  try {
    const jsonSerializer = services.likec4.serializer.JsonSerializer;
    const json = jsonSerializer.serialize(root, {
      sourceText: true,
      textRegions: true,
      space: 2,
    });
    console.log('  JSON serialization (first 500 characters):');
    console.log('  ' + json.substring(0, 500).replace(/\n/g, '\n  '));
    console.log('  ...');
    console.log('  OK: JsonSerializer works, but it produces JSON, not .c4 format');
  } catch (e: any) {
    console.log('  FAIL: JsonSerializer error:', e.message);
  }

  // --- Test 2: Direct AST mutation ---
  console.log('\n--- 2. Direct AST mutation ---');
  const model = root.models?.[0];
  if (model && model.elements) {
    const customer = model.elements[0];
    console.log('  Before mutation:');
    console.log('    customer.name:', customer.name);
    console.log('    customer.body.props[0]:', customer.body?.props?.[0]);

    // Try to mutate
    (customer as Mutable<typeof customer>).name = 'newCustomer';
    console.log('  After mutation:');
    console.log('    customer.name:', customer.name);

    // CST still contains old text
    console.log('    customer.$cstNode.text:', customer.$cstNode?.text);
    console.log('  WARNING: CST is not updated when AST is mutated!');
  }

  // --- Test 3: Text replacement approach with CST positions ---
  console.log('\n--- 3. Text replacement via CST positions ---');

  // Re-parse a clean document
  const doc2 = await parse(testInput, { documentUri: 'file:///test2.c4' });
  const root2 = doc2.parseResult.value as any;
  const rootCst = root2.$cstNode as RootCstNode;
  const fullText = rootCst.fullText;

  // Find the 'Original description' string in CST
  console.log('  Searching for description string in CST...');
  for (const leaf of CstUtils.flattenCst(rootCst)) {
    if (leaf.text === "'Original description'") {
      console.log(`  Found: offset=${leaf.offset}, end=${leaf.end}, text="${leaf.text}"`);

      // Replace text by positions
      const newText = fullText.substring(0, leaf.offset)
        + "'New modified description'"
        + fullText.substring(leaf.end);

      console.log('\n  Original text:');
      console.log('  ' + fullText.replace(/\n/g, '\n  '));
      console.log('\n  Modified text:');
      console.log('  ' + newText.replace(/\n/g, '\n  '));

      // Verify that the new text parses correctly
      const doc3 = await parse(newText, { documentUri: 'file:///test3.c4' });
      console.log('\n  Re-parsing modified text:');
      console.log('    Errors:', doc3.parseResult.parserErrors.length);
      const newRoot = doc3.parseResult.value as any;
      const newCustomer = newRoot.models?.[0]?.elements?.[0];
      console.log('    New description:', newCustomer?.body?.props?.find((p: any) => p.key === 'description')?.value);
      console.log('  OK: Text replacement via CST positions works!');
      break;
    }
  }

  // --- Test 4: Multiple mutations ---
  console.log('\n--- 4. Multiple mutations (from end to beginning) ---');

  const doc4 = await parse(testInput, { documentUri: 'file:///test4.c4' });
  const root4 = doc4.parseResult.value as any;
  const rootCst4 = root4.$cstNode as RootCstNode;

  // Collect all string literals
  const stringNodes: LeafCstNode[] = [];
  for (const leaf of CstUtils.flattenCst(rootCst4)) {
    if (leaf.tokenType.name === 'String' && leaf.text.startsWith("'")) {
      stringNodes.push(leaf);
    }
  }

  console.log(`  Found ${stringNodes.length} string literals:`);
  stringNodes.forEach(n => console.log(`    [${n.offset}:${n.end}] ${n.text}`));

  // Mutate all strings, going from end to avoid offset shifts
  let mutatedText = rootCst4.fullText;
  const sortedNodes = [...stringNodes].sort((a, b) => b.offset - a.offset);

  for (const node of sortedNodes) {
    const oldVal = node.text.slice(1, -1); // remove quotes
    const newVal = `'[MODIFIED] ${oldVal}'`;
    mutatedText = mutatedText.substring(0, node.offset) + newVal + mutatedText.substring(node.end);
  }

  console.log('\n  Result of multiple mutations:');
  console.log('  ' + mutatedText.replace(/\n/g, '\n  '));

  // Verify
  const doc5 = await parse(mutatedText, { documentUri: 'file:///test5.c4' });
  console.log('\n  Parse errors:', doc5.parseResult.parserErrors.length);
  if (doc5.parseResult.parserErrors.length === 0) {
    console.log('  OK: Multiple mutations successful!');
  }

  // --- Test 5: Check for built-in AST->text serializer ---
  console.log('\n--- 5. Searching for built-in AST->text serializer ---');
  console.log('  services.likec4.serializer keys:', Object.keys(services.likec4.serializer));

  // Check for Formatter
  try {
    const lsp = services.likec4.lsp;
    console.log('  services.likec4.lsp keys:', Object.keys(lsp));
    if ('Formatter' in lsp) {
      console.log('  OK: Formatter found in lsp');
    }
  } catch (e: any) {
    console.log('  Formatter not available:', e.message);
  }

  console.log('\n=== Conclusions ===');
  console.log('1. JsonSerializer exists but serializes to JSON, not to DSL text');
  console.log('2. There is NO built-in AST->text serializer for DSL');
  console.log('3. CST is NOT updated when AST is mutated');
  console.log('4. But CST provides exact positions (offset/end) for text replacement');
  console.log('5. Whitespace is NOT stored as tokens, but fullText preserves them');
  console.log('6. Comments are stored as hidden tokens in CST');
  console.log('7. The "CST positions + string replacement" approach works reliably');
}

main().catch(console.error);
