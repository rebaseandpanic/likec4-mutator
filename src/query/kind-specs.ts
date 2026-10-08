/**
 * Kind declarations of `specification` blocks and the defaults they write,
 * read the way LikeC4 1.59.4 does (language-server
 * `SpecificationParser.parseSpecification` / `parseElementSpecificationNode`):
 * tags (`parseTags`), links (`parseLinks`) and the string properties through
 * `parseBaseProps` — the last declaration of a key counts.  A relationship
 * kind has no summary (`parseSpecification` drops it).
 */
import { readContribution, readDeclared, type Decorations } from './extend-merge.js';
import { markdownAsString, markdownOrString, readMarkdownOrString, type MarkdownOrString } from './likec4-text.js';
import { toSourceRange } from './source-range.js';
import type { KindDefaults } from './types.js';

/** A kind declaration as the read API reports it and as merging uses it. */
export interface KindSpec {
  /** Provenance and defaults as reported (`fromSpecification`) */
  defaults: KindDefaults;
  /** Tags (LikeC4 order, without duplicates) and links (labels normalized) as LikeC4 applies them */
  contribution: Decorations;
}

/** Structural view of a `SpecificationElementKind` / `SpecificationRelationshipKind` node. */
interface KindNode {
  kind?: { name?: string };
  tags?: unknown;
  props?: unknown[];
  $cstNode?: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } };
}

/** Element and relationship kind declarations of one document, in source order. */
export function specificationKinds(ast: { specifications?: unknown[] }): {
  elements: KindNode[];
  relationships: KindNode[];
} {
  const elements: KindNode[] = [];
  const relationships: KindNode[] = [];
  for (const raw of ast.specifications ?? []) {
    const spec = raw as { elements?: KindNode[]; relationships?: KindNode[] };
    elements.push(...(spec.elements ?? []).filter((k) => k.kind?.name));
    relationships.push(...(spec.relationships ?? []).filter((k) => k.kind?.name));
  }
  return { elements, relationships };
}

/**
 * Read one kind declaration.
 *
 * @param node         - The kind node
 * @param file         - File of its document, when named
 * @param relationship - True for a relationship kind (no summary)
 */
export function readKindSpec(node: KindNode, file: string | undefined, relationship: boolean): KindSpec {
  const stringType = relationship ? 'SpecificationRelationshipStringProperty' : 'SpecificationElementStringProperty';
  const body: Partial<Record<string, MarkdownOrString>> = {};
  for (const raw of node.props ?? []) {
    const prop = raw as { $type?: string; key?: string };
    if (prop.$type !== stringType || prop.key === undefined) continue;
    body[prop.key] = readMarkdownOrString(prop);
  }
  const title = markdownAsString(body['title']);
  const summary = relationship ? undefined : markdownOrString(body['summary']);
  const description = markdownOrString(body['description']);
  const technology = markdownAsString(body['technology']);
  const declared = readDeclared(node);
  const defaults: KindDefaults = {
    kind: node.kind!.name!,
    ...(file !== undefined && { file }),
    sourceRange: toSourceRange(node.$cstNode),
    ...(title !== undefined && { title }),
    ...(summary !== undefined && { summary }),
    ...(description !== undefined && { description }),
    ...(technology !== undefined && { technology }),
    ...(declared.tags && { tags: declared.tags }),
    ...(declared.links && { links: declared.links }),
  };
  const { tags, links } = readContribution(node);
  return { defaults, contribution: { ...(tags && { tags }), ...(links && { links }) } };
}
