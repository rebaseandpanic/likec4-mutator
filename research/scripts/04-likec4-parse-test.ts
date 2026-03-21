/**
 * Script 04: Test parsing .c4 source with LikeC4 APIs
 *
 * Goals:
 * 1. Try LikeC4.fromSource() API
 * 2. Check what model data we get back
 * 3. Check if AST with positions is accessible
 */

// Test 1: LikeC4.fromSource() from the main 'likec4' package
async function testFromSource() {
  console.log("=== Test 1: LikeC4.fromSource() ===\n");

  try {
    const { LikeC4 } = await import("likec4");

    const source = `
specification {
  element system
  element service
  element database
  tag deprecated
}

model {
  customer = system "Customer" {
    description "A customer of the system"
  }

  backend = system "Backend System" {
    api = service "API Service" {
      technology "Node.js"
    }
    db = database "Database" {
      technology "PostgreSQL"
    }
  }

  customer -> backend.api "Uses API" {
    technology "HTTPS"
  }
}

views {
  view index {
    include *
  }
}
`;

    console.log("Calling LikeC4.fromSource()...");
    const likec4 = await LikeC4.fromSource(source, {
      printErrors: false,
      logger: false,
    });

    console.log("Success! LikeC4 instance created.");
    console.log("Document count:", likec4.documentCount());
    console.log("Has errors:", likec4.hasErrors());

    if (likec4.hasErrors()) {
      const errors = likec4.getErrors();
      console.log("Errors:", errors.slice(0, 5));
    }

    // Try to get computed model
    try {
      const model = likec4.syncComputedModel();
      console.log("\nComputed model obtained!");
      console.log("Model type:", typeof model);
      console.log("Model keys:", Object.keys(model).slice(0, 20));

      // Try to access elements
      if (model.elements) {
        console.log("\nElements:");
        for (const el of model.elements()) {
          console.log(`  - ${el.id}: ${el.title} (kind: ${el.kind})`);
        }
      }

      // Try to access relationships
      if (model.relationships) {
        console.log("\nRelationships:");
        for (const rel of model.relationships()) {
          console.log(`  - ${rel.source.id} -> ${rel.target.id}: ${rel.title}`);
        }
      }

      // Try to access views
      if (model.views) {
        console.log("\nViews:");
        for (const view of model.views()) {
          console.log(`  - ${view.id}: ${view.title ?? '(no title)'}`);
        }
      }
    } catch (e: any) {
      console.log("Error getting computed model:", e.message);
    }

    // Check projects
    try {
      const projects = likec4.projects();
      console.log("\nProjects:", projects);
    } catch (e: any) {
      console.log("Error getting projects:", e.message);
    }

    await likec4.dispose();
    console.log("\nDisposed successfully.");
  } catch (e: any) {
    console.log("Error:", e.message);
    console.log("Stack:", e.stack?.split("\n").slice(0, 5).join("\n"));
  }
}

// Test 2: Try to access lower-level parser via createLanguageServices
async function testLanguageServices() {
  console.log("\n\n=== Test 2: createLanguageServices() ===\n");

  try {
    const { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } =
      await import("@likec4/language-server");

    console.log("Imported createLanguageServices successfully");
    console.log("Available context factories:");
    console.log("  - NoFileSystem:", typeof NoFileSystem);
    console.log("  - NoLikeC4ManualLayouts:", typeof NoLikeC4ManualLayouts);
    console.log("  - NoMCPServer:", typeof NoMCPServer);

    // Try to create services without filesystem
    console.log("NoFileSystem value:", JSON.stringify(NoFileSystem).substring(0, 200));
    console.log("NoLikeC4ManualLayouts value:", JSON.stringify(NoLikeC4ManualLayouts).substring(0, 200));
    console.log("NoMCPServer value:", JSON.stringify(NoMCPServer).substring(0, 200));

    const services = createLanguageServices({
      ...NoFileSystem,
      ...NoLikeC4ManualLayouts,
      ...NoMCPServer,
    });

    console.log("\nServices created successfully!");
    console.log("shared keys:", Object.keys(services.shared).slice(0, 10));
    console.log("likec4 keys:", Object.keys(services.likec4).slice(0, 10));

    // Check if parser is available
    const parser = services.likec4.parser;
    console.log("\nParser available:", !!parser);
    console.log("Parser keys:", parser ? Object.keys(parser) : "N/A");

    // Check LangiumParser
    const langiumParser = services.likec4.parser;
    console.log("Langium parser type:", langiumParser?.constructor?.name);

    // Check if ModelParser is available
    const modelParser = (services.likec4 as any).likec4?.ModelParser;
    console.log("ModelParser available:", !!modelParser);

    // Try to parse text using Langium's built-in parser
    const langParser = services.likec4.parser.LangiumParser;
    console.log("LangiumParser:", !!langParser);

    if (langParser) {
      const testSource = `
specification {
  element system
}
model {
  sys = system "My System"
}
`;
      const parseResult = langParser.parse(testSource);
      console.log("\nParse result type:", typeof parseResult);
      console.log("Parse result keys:", Object.keys(parseResult));

      if (parseResult.value) {
        const ast = parseResult.value as any;
        console.log("AST $type:", ast.$type);
        console.log("AST specifications:", ast.specifications?.length);
        console.log("AST models:", ast.models?.length);

        if (ast.models?.[0]) {
          const model = ast.models[0];
          console.log("Model elements:", model.elements?.length);
          if (model.elements?.[0]) {
            const el = model.elements[0];
            console.log("First element $type:", el.$type);
            console.log("First element name:", el.name);
            console.log("First element kind:", el.kind?.$refText);
            console.log("First element props:", el.props);

            // Check CST node (positions!)
            const cstNode = el.$cstNode;
            if (cstNode) {
              console.log("\nCST Node available!");
              console.log("  offset:", cstNode.offset);
              console.log("  length:", cstNode.length);
              console.log("  range:", JSON.stringify(cstNode.range));
              console.log("  text:", cstNode.text?.substring(0, 100));
            }
          }
        }
      }

      if (parseResult.lexerErrors?.length) {
        console.log("Lexer errors:", parseResult.lexerErrors.length);
      }
      if (parseResult.parserErrors?.length) {
        console.log("Parser errors:", parseResult.parserErrors.length);
      }
    }
  } catch (e: any) {
    console.log("Error:", e.message);
    console.log("Stack:", e.stack?.split("\n").slice(0, 5).join("\n"));
  }
}

// Run all tests
(async () => {
  await testFromSource();
  await testLanguageServices();
})();
