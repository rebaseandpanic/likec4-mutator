/**
 * FQN index entry for a single Element AST node.
 */
export interface FqnEntry {
  /** Fully qualified name, e.g. 'app.api' */
  fqn: string;
  /** Local identifier, e.g. 'api' */
  name: string;
  /** Raw AST Element node */
  node: any;
  /** Parent FQN, undefined for root elements */
  parentFqn?: string;
  /** FQNs of direct children */
  children: string[];
}

/**
 * Build a Map from FQN string to FqnEntry by walking all model elements in the AST.
 * Traverses ast.models[*].elements recursively through element bodies.
 */
export function buildFqnIndex(ast: any): Map<string, FqnEntry> {
  const index = new Map<string, FqnEntry>();

  for (const model of ast.models ?? []) {
    for (const item of model.elements ?? []) {
      if (item.$type === 'Element') {
        walkElement(item, undefined, index);
      }
    }
  }

  return index;
}

function walkElement(
  node: any,
  parentFqn: string | undefined,
  index: Map<string, FqnEntry>,
): void {
  const fqn = parentFqn ? `${parentFqn}.${node.name}` : node.name;

  const entry: FqnEntry = {
    fqn,
    name: node.name,
    node,
    parentFqn,
    children: [],
  };

  index.set(fqn, entry);

  // Register this FQN as a child of its parent
  if (parentFqn) {
    const parent = index.get(parentFqn);
    if (parent) {
      parent.children.push(fqn);
    }
  }

  // Recurse into body elements
  if (node.body?.elements) {
    for (const child of node.body.elements) {
      if (child.$type === 'Element') {
        walkElement(child, fqn, index);
      }
    }
  }
}

/**
 * Convert a FqnRef AST node to a dot-separated FQN string.
 *
 * FqnRef structure: { $type: 'FqnRef', parent?: FqnRef, value: { $refText: string } }
 *
 * Example: `app.api` → FqnRef { parent: FqnRef { value: { $refText: 'app' } }, value: { $refText: 'api' } }
 */
export function resolveFqnRef(ref: any): string {
  if (!ref) return '';

  const parts: string[] = [];
  let current = ref;

  while (current) {
    if (current.value?.$refText) {
      parts.unshift(current.value.$refText);
    } else if (current.$refText) {
      // Fallback for direct reference objects
      parts.unshift(current.$refText);
    }
    current = current.parent;
  }

  return parts.join('.');
}
