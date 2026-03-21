/**
 * Script 1: Verify standalone parsing capability with Langium (without LSP)
 *
 * Goal: confirm that we can create a parser and obtain AST/CST
 * without starting a Language Server
 */

import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  type Module,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type PartialLangiumCoreServices,
  inject,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';

// Try using likec4 language server as an example of a real Langium language
import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } from '@likec4/language-server/module';

async function main() {
  console.log('=== Script 01: Langium Standalone Parse ===\n');

  // --- Approach: Use likec4 language services ---
  console.log('--- Approach: Creating LikeC4 language services ---');

  try {
    const services = createLanguageServices({
      ...NoFileSystem,
      ...NoLikeC4ManualLayouts,
      ...NoMCPServer,
    });

    console.log('OK: LikeC4 services created successfully');
    console.log('  Type:', typeof services);
    console.log('  Keys:', Object.keys(services));

    // Get likec4 language service
    const likec4 = services.likec4;
    console.log('  likec4 keys:', Object.keys(likec4));

    // Use parseHelper for parsing
    const parse = parseHelper(likec4);

    const testInput = `
specification {
  element component
  element service
}
model {
  customer = component 'Customer' {
    description 'A customer'
  }
  backend = service 'Backend API' {
    description 'REST API'
  }
}
views {
  view index {
    include *
  }
}
`;

    console.log('\nParsing LikeC4 text...');
    const document = await parse(testInput);

    console.log('OK: Parsing successful!');
    console.log('  document.parseResult.value.$type:', document.parseResult.value.$type);
    console.log('  Parser errors:', document.parseResult.parserErrors.length);
    console.log('  Lexer errors:', document.parseResult.lexerErrors.length);

    if (document.parseResult.parserErrors.length > 0) {
      console.log('  First errors:', document.parseResult.parserErrors.slice(0, 3).map(e => e.message));
    }

    // Check for CST presence
    const cstNode = document.parseResult.value.$cstNode;
    console.log('\n  Has $cstNode:', !!cstNode);
    if (cstNode) {
      console.log('  cstNode.text length:', cstNode.text.length);
      console.log('  cstNode.offset:', cstNode.offset);
      console.log('  cstNode.length:', cstNode.length);
      console.log('  cstNode.end:', cstNode.end);
    }

  } catch (error: any) {
    console.log('FAIL: Error:', error.message);
    console.log('  Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(console.error);
