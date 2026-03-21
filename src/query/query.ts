import { buildFqnIndex, resolveFqnRef, type FqnEntry } from './fqn.js';
import type { ElementInfo, RelationshipInfo, SpecificationInfo } from './types.js';

/**
 * Query layer over a parsed LikeC4 AST.
 *
 * Provides read-only access to elements, relationships, and specification
 * data without modifying the original AST.
 */
export class C4Query {
  private readonly ast: any;
  private readonly fqnIndex: Map<string, FqnEntry>;

  constructor(ast: any) {
    this.ast = ast;
    this.fqnIndex = buildFqnIndex(ast);
  }

  /**
   * Look up a single element by its fully qualified name.
   * Returns null if no element with that FQN exists.
   */
  getElement(fqn: string): ElementInfo | null {
    const entry = this.fqnIndex.get(fqn);
    if (!entry) return null;
    return this.toElementInfo(entry);
  }

  /**
   * Return the raw CST source text for an element, including its body.
   * Returns null if the element does not exist or has no CST node.
   */
  getElementSource(fqn: string): string | null {
    const entry = this.fqnIndex.get(fqn);
    if (!entry?.node.$cstNode) return null;
    return entry.node.$cstNode.text as string;
  }

  /**
   * List elements, optionally filtered by parent FQN and/or kind.
   *
   * @param opts.parentFqn - Only return direct children of this FQN
   * @param opts.kind      - Only return elements with this kind (e.g. 'service')
   */
  listElements(opts?: { parentFqn?: string; kind?: string }): ElementInfo[] {
    const results: ElementInfo[] = [];

    for (const entry of this.fqnIndex.values()) {
      if (opts?.parentFqn !== undefined && entry.parentFqn !== opts.parentFqn) {
        continue;
      }
      if (opts?.kind !== undefined) {
        const kind = entry.node.kind?.$refText ?? '';
        if (kind !== opts.kind) continue;
      }
      results.push(this.toElementInfo(entry));
    }

    return results;
  }

  /**
   * Return all relationships in the model, optionally filtered by source/target FQN.
   * Relationships nested inside element bodies are included.
   */
  getRelationships(opts?: { sourceFqn?: string; targetFqn?: string }): RelationshipInfo[] {
    const relations: RelationshipInfo[] = [];

    for (const model of this.ast.models ?? []) {
      this.collectRelations(model.elements ?? [], '', relations);
    }

    return relations.filter((r) => {
      if (opts?.sourceFqn !== undefined && r.sourceFqn !== opts.sourceFqn) return false;
      if (opts?.targetFqn !== undefined && r.targetFqn !== opts.targetFqn) return false;
      return true;
    });
  }

  /**
   * Extract summary information from the specification block.
   */
  getSpecification(): SpecificationInfo {
    const elementKinds: string[] = [];
    const tags: string[] = [];
    const relationshipKinds: string[] = [];

    for (const spec of this.ast.specifications ?? []) {
      // spec.elements contains SpecificationElementKind nodes
      for (const item of spec.elements ?? []) {
        if (item.kind?.name) {
          elementKinds.push(item.kind.name);
        }
      }

      // spec.tags contains SpecificationTag nodes
      for (const item of spec.tags ?? []) {
        if (item.tag?.name) {
          tags.push(item.tag.name);
        }
      }

      // spec.relationships contains SpecificationRelationshipKind nodes
      for (const item of spec.relationships ?? []) {
        if (item.kind?.name) {
          relationshipKinds.push(item.kind.name);
        }
      }
    }

    return { elementKinds, tags, relationshipKinds };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toElementInfo(entry: FqnEntry): ElementInfo {
    const node = entry.node;
    const cst = node.$cstNode;

    let description: string | undefined;
    let technology: string | undefined;
    let title: string | undefined;

    // Named body properties (ElementStringProperty nodes)
    if (node.body?.props) {
      for (const prop of node.body.props) {
        if (prop.$type !== 'ElementStringProperty') continue;
        const value = extractStringValue(prop);
        switch (prop.key) {
          case 'description':
            description = value;
            break;
          case 'technology':
            technology = value;
            break;
          case 'title':
            title = value;
            break;
        }
      }
    }

    // Positional props: first string is the title (e.g. `app = system 'My App'`)
    if (!title && Array.isArray(node.props) && node.props.length > 0) {
      const first = node.props[0];
      if (typeof first === 'string') {
        title = first;
      }
    }

    return {
      fqn: entry.fqn,
      name: entry.name,
      kind: node.kind?.$refText ?? '',
      title,
      description,
      technology,
      children: [...entry.children],
      parentFqn: entry.parentFqn,
      sourceRange: cst
        ? {
            offset: cst.offset as number,
            end: cst.end as number,
            line: (cst.range?.start?.line ?? 0) as number,
            column: (cst.range?.start?.character ?? 0) as number,
          }
        : { offset: 0, end: 0, line: 0, column: 0 },
    };
  }

  /**
   * Recursively collect Relation nodes from a flat elements array.
   * parentFqn is the FQN context for implicit-source relations.
   */
  private collectRelations(
    elements: any[],
    parentFqn: string,
    results: RelationshipInfo[],
  ): void {
    for (const item of elements) {
      if (item.$type === 'Relation') {
        // source is undefined when the relation is inside an element body
        const sourceFqn = item.source ? resolveFqnRef(item.source) : parentFqn;
        const targetFqn = resolveFqnRef(item.target);

        const cst = item.$cstNode;

        // title is a direct string property on Relation
        let title: string | undefined = item.title;
        let technology: string | undefined;
        let description: string | undefined;

        // Named properties live in body.props as RelationStringProperty nodes
        if (item.body?.props) {
          for (const prop of item.body.props) {
            if (prop.$type !== 'RelationStringProperty') continue;
            const value = extractStringValue(prop);
            switch (prop.key) {
              case 'technology':
                technology = value;
                break;
              case 'description':
                description = value;
                break;
              case 'title':
                if (!title) title = value;
                break;
            }
          }
        }

        results.push({
          sourceFqn,
          targetFqn,
          title,
          technology,
          description,
          sourceRange: cst
            ? {
                offset: cst.offset as number,
                end: cst.end as number,
                line: (cst.range?.start?.line ?? 0) as number,
                column: (cst.range?.start?.character ?? 0) as number,
              }
            : { offset: 0, end: 0, line: 0, column: 0 },
        });
      } else if (item.$type === 'Element') {
        const fqn = parentFqn ? `${parentFqn}.${item.name}` : item.name;
        if (item.body?.elements) {
          this.collectRelations(item.body.elements, fqn, results);
        }
      }
    }
  }
}

/**
 * Extract the string value from a property node.
 * Body string properties store their value as `MarkdownOrString { text: string }`.
 */
function extractStringValue(prop: any): string | undefined {
  if (typeof prop.value === 'string') return prop.value;
  if (prop.value?.text) return prop.value.text as string;
  if (prop.value?.value) return prop.value.value as string;
  return undefined;
}
