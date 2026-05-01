import { buildFqnIndex, resolveFqnRef, type FqnEntry } from './fqn.js';
import type { ElementInfo, RelationshipInfo, SpecificationInfo } from './types.js';
import { readMetadataBlock } from '../mutator/metadata-ops.js';

/**
 * Minimal structural shape of the parsed LikeC4 document AST consumed by
 * {@link C4Query}.  Each root array is optional because a document may omit
 * any of `models`, `views`, or `specifications`.
 */
interface LikeC4DocumentAst {
  models?: Array<{ elements?: unknown[]; [k: string]: unknown }>;
  views?: Array<unknown>;
  specifications?: Array<unknown>;
}

/**
 * Query layer over a parsed LikeC4 AST.
 *
 * Provides read-only access to elements, relationships, and specification
 * data without modifying the original AST.
 */
export class C4Query {
  private readonly ast: LikeC4DocumentAst;
  private readonly fqnIndex: Map<string, FqnEntry>;

  constructor(ast: LikeC4DocumentAst) {
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

    for (const rawSpec of this.ast.specifications ?? []) {
      const spec = rawSpec as {
        elements?: Array<{ kind?: { name?: string } }>;
        tags?: Array<{ tag?: { name?: string } }>;
        relationships?: Array<{ kind?: { name?: string } }>;
      };
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

    // Body-level decorations: tags / links / metadata
    const decorations = extractBodyDecorations(node.body);

    return {
      fqn: entry.fqn,
      name: entry.name,
      kind: node.kind?.$refText ?? '',
      title,
      description,
      technology,
      tags: decorations.tags,
      links: decorations.links,
      metadata: decorations.metadata,
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
    elements: unknown[],
    parentFqn: string,
    results: RelationshipInfo[],
  ): void {
    for (const raw of elements) {
      const item = raw as {
        $type?: string;
        name?: string;
        source?: unknown;
        target?: unknown;
        title?: string;
        kind?: { $refText?: string };
        body?: { props?: unknown[]; elements?: unknown[]; [k: string]: unknown };
        $cstNode?: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } };
      };
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
          for (const rawProp of item.body.props) {
            const prop = rawProp as { $type?: string; key?: string; value?: unknown };
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

        const kind: string | undefined = item.kind?.$refText ?? undefined;
        const decorations = extractBodyDecorations(item.body);

        results.push({
          sourceFqn,
          targetFqn,
          title,
          kind,
          technology,
          description,
          tags: decorations.tags,
          links: decorations.links,
          metadata: decorations.metadata,
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
        const fqn = parentFqn ? `${parentFqn}.${item.name ?? ''}` : (item.name ?? '');
        if (item.body?.elements) {
          this.collectRelations(item.body.elements, fqn, results);
        }
      }
    }
  }
}

/**
 * Extract body-level decorations (tags / links / metadata) from an element or
 * relation body node.  Returns undefined for fields that are absent so that
 * the caller can omit them from the resulting Info object.
 */
function extractBodyDecorations(body: unknown): {
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  metadata?: Record<string, string | string[]>;
} {
  const out: {
    tags?: string[];
    links?: Array<{ url: string; label?: string }>;
    metadata?: Record<string, string | string[]>;
  } = {};
  if (!body) return out;
  const b = body as {
    tags?: { values?: Array<{ $cstNode?: { text?: string }; $refText?: string }> };
    props?: unknown[];
  };

  // Tags live on body.tags as a single Tags { values: TagRef[] } node.  The
  // standalone parser does not resolve cross-references, so tag names are
  // recovered from the leading-`#` CST text of each TagRef.
  const tagsNode = b.tags;
  if (tagsNode && Array.isArray(tagsNode.values) && tagsNode.values.length > 0) {
    const tagNames: string[] = [];
    for (const tagRef of tagsNode.values) {
      const txt: string | undefined = tagRef?.$cstNode?.text ?? tagRef?.$refText;
      if (typeof txt !== 'string') continue;
      tagNames.push(txt.startsWith('#') ? txt.slice(1) : txt);
    }
    if (tagNames.length > 0) out.tags = tagNames;
  }

  // Links and metadata live on body.props
  const links: Array<{ url: string; label?: string }> = [];
  for (const rawProp of b.props ?? []) {
    const prop = rawProp as {
      $type?: string;
      url?: string;
      value?: { text?: string; value?: string };
      $cstNode?: { text?: string };
      title?: string | { text?: string; value?: string };
      label?: string;
    };
    if (prop.$type === 'LinkProperty') {
      const url: string | undefined = prop.url ?? prop.value?.text ?? prop.value?.value;
      // Try CST text fallback when AST shape does not expose url directly:
      let resolvedUrl = url;
      if (!resolvedUrl && prop.$cstNode?.text) {
        // CST text is "link <url> ['label']"
        const m = /^link\s+(\S+)/.exec(prop.$cstNode.text);
        if (m) resolvedUrl = m[1];
      }
      if (!resolvedUrl) continue;
      const label: string | undefined =
        (typeof prop.title === 'object' ? prop.title?.text ?? prop.title?.value : prop.title) ??
        prop.label;
      const linkEntry: { url: string; label?: string } = { url: resolvedUrl };
      if (typeof label === 'string') linkEntry.label = label;
      links.push(linkEntry);
    }
    if (prop.$type === 'MetadataBody') {
      const metadata = readMetadataBlock(prop as Parameters<typeof readMetadataBlock>[0]);
      if (Object.keys(metadata).length > 0) {
        out.metadata = metadata;
      }
    }
  }
  if (links.length > 0) out.links = links;

  return out;
}

/**
 * Extract the string value from a property node.
 * Body string properties store their value as `MarkdownOrString { text: string }`.
 */
function extractStringValue(prop: unknown): string | undefined {
  const p = prop as { value?: string | { text?: string; value?: string } };
  if (typeof p.value === 'string') return p.value;
  if (typeof p.value === 'object' && p.value) {
    if (typeof p.value.text === 'string') return p.value.text;
    if (typeof p.value.value === 'string') return p.value.value;
  }
  return undefined;
}
