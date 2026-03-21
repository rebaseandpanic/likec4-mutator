/**
 * Script 05: Explore LikeC4 AST types
 *
 * Goals:
 * 1. List all AST types from language-server
 * 2. Map them to categories: elements, relationships, views, deployments
 * 3. Check what @likec4/core exports for model types
 */

async function exploreAstTypes() {
  console.log("=== AST Types from @likec4/language-server ===\n");

  try {
    // The language-server re-exports from internal module.d.mts
    // Let's try to get the AST module
    const ls = await import("@likec4/language-server");

    console.log("All exports from @likec4/language-server:");
    const exports = Object.keys(ls).sort();
    for (const key of exports) {
      const val = (ls as any)[key];
      const type =
        typeof val === "function"
          ? `function(${val.length})`
          : typeof val === "object" && val !== null
            ? `object[${Object.keys(val).length}]`
            : typeof val;
      console.log(`  ${key}: ${type}`);
    }
  } catch (e: any) {
    console.log("Error importing language-server:", e.message);
  }

  console.log("\n\n=== Core Types from @likec4/core ===\n");

  try {
    const core = await import("@likec4/core");
    const exports = Object.keys(core).sort();
    console.log(`Total exports: ${exports.length}`);
    console.log("\nType guards (is* functions):");
    for (const key of exports.filter((k) => k.startsWith("is"))) {
      console.log(`  ${key}`);
    }

    console.log("\nKey type-related exports:");
    const typeKeywords = [
      "Element",
      "Relation",
      "View",
      "Deploy",
      "Fqn",
      "Node",
      "Edge",
      "Tag",
      "Specification",
      "Model",
    ];
    for (const kw of typeKeywords) {
      const matching = exports.filter(
        (k) => k.includes(kw) && !k.startsWith("is"),
      );
      if (matching.length > 0) {
        console.log(`\n  ${kw}-related:`);
        for (const m of matching) {
          console.log(`    ${m}`);
        }
      }
    }
  } catch (e: any) {
    console.log("Error importing core:", e.message);
  }

  console.log("\n\n=== @likec4/core/model exports ===\n");

  try {
    const model = await import("@likec4/core/model");
    const exports = Object.keys(model).sort();
    console.log(`Total exports: ${exports.length}`);
    for (const key of exports) {
      const val = (model as any)[key];
      const type =
        typeof val === "function"
          ? `function(${val.length})`
          : typeof val;
      console.log(`  ${key}: ${type}`);
    }
  } catch (e: any) {
    console.log("Error importing core/model:", e.message);
  }

  console.log("\n\n=== @likec4/core/types exports (sample) ===\n");

  try {
    const types = await import("@likec4/core/types");
    const exports = Object.keys(types).sort();
    console.log(`Total exports: ${exports.length}`);
    console.log("First 50:");
    for (const key of exports.slice(0, 50)) {
      console.log(`  ${key}`);
    }
    if (exports.length > 50) {
      console.log(`  ... and ${exports.length - 50} more`);
    }
  } catch (e: any) {
    console.log("Error importing core/types:", e.message);
  }

  console.log("\n\n=== @likec4/core/builder exports ===\n");

  try {
    const builder = await import("@likec4/core/builder");
    const exports = Object.keys(builder).sort();
    console.log(`Total exports: ${exports.length}`);
    for (const key of exports) {
      const val = (builder as any)[key];
      const type =
        typeof val === "function"
          ? `function(${val.length})`
          : typeof val;
      console.log(`  ${key}: ${type}`);
    }
  } catch (e: any) {
    console.log("Error importing core/builder:", e.message);
  }
}

// Test: Parse + inspect AST structure in detail
async function inspectAstStructure() {
  console.log("\n\n=== Detailed AST Inspection ===\n");

  try {
    const { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts, NoMCPServer } =
      await import("@likec4/language-server");

    const { likec4: services } = createLanguageServices({
      ...NoFileSystem,
      ...NoLikeC4ManualLayouts,
      ...NoMCPServer,
    });

    const parser = services.parser.LangiumParser;

    const source = `
specification {
  element system
  element service
  element database
  relationship uses
  tag deprecated
  deploymentNode env
}

model {
  customer = system "Customer" {
    description "End user"
    technology "Browser"
    style {
      shape person
      color green
    }
  }

  backend = system "Backend" {
    api = service "API" {
      technology "Node.js"
    }
    db = database "DB" {
      #deprecated
    }
  }

  customer -> backend.api "Makes requests" {
    technology "HTTPS"
  }

  backend.api -> backend.db "Reads/Writes" {
    technology "SQL"
  }
}

deployment {
  prod = env "Production" {
    api_instance = instanceOf backend.api
    db_instance = instanceOf backend.db
  }
}

views {
  view overview {
    title "System Overview"
    include *
    style customer {
      color green
    }
    autoLayout TopBottom
  }

  view backend_detail of backend {
    include *
    exclude backend.db
  }

  dynamic view flow {
    customer -> backend.api "Step 1"
    backend.api -> backend.db "Step 2"
  }

  deployment view prod_view {
    include *
  }
}
`;

    const result = parser.parse(source);
    const ast = result.value as any;

    console.log("Root AST node ($type):", ast.$type);
    console.log("Root keys:", Object.keys(ast).filter((k) => !k.startsWith("$")));

    // Specifications
    console.log("\n--- Specifications ---");
    for (const spec of ast.specifications || []) {
      console.log("Spec elements:", spec.elements?.length);
      for (const el of spec.elements || []) {
        console.log(`  element kind: ${el.kind?.name} ($type: ${el.$type})`);
      }
      console.log("Spec relationships:", spec.relationships?.length);
      for (const rel of spec.relationships || []) {
        console.log(`  relationship kind: ${rel.kind?.name}`);
      }
      console.log("Spec tags:", spec.tags?.length);
      for (const tag of spec.tags || []) {
        console.log(`  tag: ${tag.tag?.name}`);
      }
      console.log("Spec deploymentNodes:", spec.deploymentNodes?.length);
    }

    // Model
    console.log("\n--- Model ---");
    for (const model of ast.models || []) {
      console.log("Model elements:", model.elements?.length);
      for (const el of model.elements || []) {
        console.log(`  $type: ${el.$type}`);
        if (el.$type === "Element") {
          console.log(`    name: ${el.name}, kind: ${el.kind?.$refText}, props: ${JSON.stringify(el.props)}`);
          // Check body
          if (el.body) {
            console.log(`    body elements: ${el.body.elements?.length}`);
            console.log(`    body props: ${el.body.props?.length}`);
            if (el.body.tags) {
              console.log(`    body tags: ${JSON.stringify(el.body.tags)}`);
            }
            for (const child of el.body.elements || []) {
              if (child.$type === "Element") {
                console.log(`      child: ${child.name} (${child.kind?.$refText})`);
              } else if (child.$type === "Relation") {
                console.log(`      relation: ${child.source?.value?.$refText || '(this)'} -> ${child.target?.value?.$refText}`);
              }
            }
          }
          // CST position check
          if (el.$cstNode) {
            console.log(`    CST range: L${el.$cstNode.range.start.line}:${el.$cstNode.range.start.character} - L${el.$cstNode.range.end.line}:${el.$cstNode.range.end.character}`);
          }
        } else if (el.$type === "Relation") {
          console.log(`    ${el.source?.value?.$refText} -> ${el.target?.value?.$refText}: "${el.title}"`);
          if (el.$cstNode) {
            console.log(`    CST range: L${el.$cstNode.range.start.line}:${el.$cstNode.range.start.character} - L${el.$cstNode.range.end.line}:${el.$cstNode.range.end.character}`);
          }
        }
      }
    }

    // Deployments
    console.log("\n--- Deployments ---");
    for (const depl of ast.deployments || []) {
      console.log("Deployment elements:", depl.elements?.length);
      for (const el of depl.elements || []) {
        console.log(`  $type: ${el.$type}, name: ${el.name}`);
      }
    }

    // Views
    console.log("\n--- Views ---");
    for (const viewBlock of ast.views || []) {
      console.log("Views count:", viewBlock.views?.length);
      for (const view of viewBlock.views || []) {
        console.log(`  $type: ${view.$type}, name: ${view.name}`);
        if (view.body) {
          console.log(`    rules: ${view.body.rules?.length || 0}`);
          console.log(`    props: ${view.body.props?.length || 0}`);
          console.log(`    steps: ${view.body.steps?.length || 0}`);
        }
        if (view.viewOf) {
          console.log(`    viewOf: ${view.viewOf?.modelElement?.value?.$refText}`);
        }
        if (view.$cstNode) {
          console.log(`    CST range: L${view.$cstNode.range.start.line}:${view.$cstNode.range.start.character} - L${view.$cstNode.range.end.line}:${view.$cstNode.range.end.character}`);
        }
      }
    }

    // Errors
    if (result.parserErrors?.length) {
      console.log("\nParser errors:", result.parserErrors.length);
      for (const err of result.parserErrors.slice(0, 5)) {
        console.log(`  ${err.message}`);
      }
    }
    if (result.lexerErrors?.length) {
      console.log("\nLexer errors:", result.lexerErrors.length);
    }
  } catch (e: any) {
    console.log("Error:", e.message);
    console.log("Stack:", e.stack?.split("\n").slice(0, 8).join("\n"));
  }
}

(async () => {
  await exploreAstTypes();
  await inspectAstStructure();
})();
