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
 * Callback for {@link forEachElementDeclaration}.
 *
 * @param node      - The `Element` AST node
 * @param fqn       - Its fully qualified name
 * @param parentFqn - FQN of the element it is nested under (undefined for a
 *                    root element)
 */
export type ElementDeclarationVisitor = (node: any, fqn: string, parentFqn: string | undefined) => void;

/**
 * Visit every element declaration of a document, parents before children, in
 * source order, with the FQN LikeC4 assigns to it.
 *
 * Mirrors the language-server `FqnIndex`: elements of a `model` block are
 * roots, elements of an element body are its children, and elements declared
 * inside `extend X { ... }` are children of X (whichever document declares X).
 * An `extend` whose target cannot be read is skipped.
 */
export function forEachElementDeclaration(ast: any, visit: ElementDeclarationVisitor): void {
  for (const model of ast?.models ?? []) {
    for (const item of model.elements ?? []) {
      if (item.$type === 'Element') {
        walkDeclaration(item, undefined, visit);
      } else if (item.$type === 'ExtendElement') {
        const extended = readStrictFqnRef(item.element);
        if (!extended) continue;
        for (const child of item.body?.elements ?? []) {
          if (child.$type === 'Element') walkDeclaration(child, extended, visit);
        }
      }
    }
  }
}

function walkDeclaration(node: any, parentFqn: string | undefined, visit: ElementDeclarationVisitor): void {
  if (!node.name) return;
  const fqn = parentFqn ? `${parentFqn}.${node.name}` : node.name;
  visit(node, fqn, parentFqn);
  for (const child of node.body?.elements ?? []) {
    if (child.$type === 'Element') walkDeclaration(child, fqn, visit);
  }
}

/**
 * Build a Map from FQN string to FqnEntry for every element declared in the
 * document, including elements declared inside `extend` bodies (see
 * {@link forEachElementDeclaration}).  `children` lists the children declared
 * in this document only.
 */
export function buildFqnIndex(ast: any): Map<string, FqnEntry> {
  const index = new Map<string, FqnEntry>();
  forEachElementDeclaration(ast, (node, fqn, parentFqn) => {
    index.set(fqn, { fqn, name: node.name, node, parentFqn, children: [] });
    if (parentFqn) index.get(parentFqn)?.children.push(fqn);
  });
  return index;
}

/**
 * Read the FQN written in a `StrictFqnElementRef` (the target of
 * `extend a.b.c`).  Returns undefined when any segment is missing.
 */
export function readStrictFqnRef(ref: any): string | undefined {
  const parts: string[] = [];
  let current = ref;
  while (current) {
    const text = current.el?.$refText;
    if (!text) return undefined;
    parts.unshift(text);
    current = current.parent;
  }
  return parts.length > 0 ? parts.join('.') : undefined;
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
