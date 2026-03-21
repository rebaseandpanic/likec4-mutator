# likec4-mutator

TypeScript library + CLI for programmatic mutation of LikeC4 `.c4` files. Parses `.c4` via `@likec4/language-server` (Langium), mutates through CST-position-based text replacement, serializes back preserving formatting.

## Library API

```typescript
import { LikeC4Mutator } from 'likec4-mutator';

const mutator = LikeC4Mutator.fromFiles({
  'model.c4': `
specification {
  element service
  element database
}
model {
  app = service 'My App'
}
views {
  view index {
    include *
  }
}
`});

// Query
const el = mutator.getElement('app');
const all = mutator.listElements({ kind: 'service' });
const rels = mutator.getRelationships({ sourceFqn: 'app' });

// Mutate
mutator.addElement('app', {
  name: 'db',
  kind: 'database',
  title: 'PostgreSQL',
  description: 'Main database',
  technology: 'PostgreSQL 16',
});

mutator.addRelationship('app', 'app.db', 'reads/writes');

mutator.addView({
  id: 'appView',
  type: 'element',
  target: 'app',
  title: 'App Overview',
});

// Update
mutator.updateElement('app.db', { description: 'Updated description' });

// Remove
mutator.removeElement('app.db');

// Validate & serialize
const errors = mutator.validate(); // [] = valid
const files = mutator.serialize(); // { 'model.c4': '...' }
```

## CLI

```bash
# Validate .c4 files
likec4-mutator validate --dir ./c4

# List elements
likec4-mutator list-elements --dir ./c4 --json
likec4-mutator list-elements --dir ./c4 --kind service

# Get element
likec4-mutator get-element --dir ./c4 --fqn app.api --json
likec4-mutator get-element --dir ./c4 --fqn app.api --source

# Add element
likec4-mutator add-element --dir ./c4 \
  --parent app --kind service --id myApi --title 'My API' \
  --description 'REST API' --technology 'TypeScript' \
  --output ./out

# Add relationship
likec4-mutator add-relationship --dir ./c4 \
  --source app.myApi --target app.db --label 'reads' \
  --output ./out

# Batch mutations from JSON
likec4-mutator apply --dir ./c4 --mutations mutations.json --output ./out
```

### Batch mutations format

```json
{
  "mutations": [
    {
      "op": "addElement",
      "parent": "app",
      "kind": "service",
      "id": "newApi",
      "title": "New API",
      "description": "REST API",
      "technology": "TypeScript"
    },
    {
      "op": "addRelationship",
      "source": "app.newApi",
      "target": "app.db",
      "label": "reads"
    },
    {
      "op": "addView",
      "id": "newApiView",
      "type": "element",
      "target": "app.newApi",
      "title": "New API"
    }
  ]
}
```

## How it works

1. **Parse** — `.c4` source → AST + CST via `@likec4/language-server` (Langium standalone, no LSP)
2. **Query** — find elements by FQN, walk AST, build index
3. **Mutate** — compute text edits from CST positions (`$cstNode.offset`/`end`)
4. **Apply** — splice edits into source text (end → start to preserve offsets)
5. **Reparse** — verify result is valid `.c4`

## Build

```bash
npm install
npm run build    # tsup → ESM + TypeScript declarations
npm test         # vitest, 144 tests
npm run lint     # tsc --noEmit
```

## License

MIT
