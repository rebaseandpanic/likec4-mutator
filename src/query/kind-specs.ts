/**
 * Kind declarations of `specification` blocks and the defaults they write,
 * read the way LikeC4 1.60.0 does (language-server
 * `SpecificationParser.parseSpecification` / `parseElementSpecificationNode`):
 * tags (`parseTags`), links (`parseLinks`) and the string properties through
 * `parseBaseProps` — the last declaration of a key counts.  A relationship
 * kind has no summary (`parseSpecification` drops it).  The style of a kind
 * is read by `style-read.ts`.
 */
import { readContribution, readDeclared, type Decorations } from './extend-merge.js';
import { markdownAsString, markdownOrString, readMarkdownOrString, type MarkdownOrString } from './likec4-text.js';
import type { ElementStyle, RelationshipStyle } from '../mutator/codegen.js';
import { toSourceRange } from './source-range.js';
import { readKindElementStyle, readKindRelationshipStyle } from './style-read.js';
import type { KindDefaults } from './types.js';

/** A kind declaration as the read API reports it and as merging uses it. */
export interface KindSpec {
  /** Provenance and defaults as reported (`fromSpecification`) */
  defaults: KindDefaults;
  /** Tags (LikeC4 order, without duplicates) and links (labels normalized) as LikeC4 applies them */
  contribution: Decorations;
  /**
   * Style written by the kind: an element style for an element or deployment
   * node kind, a relationship style for a relationship kind; absent when the
   * kind writes none.  Not part of `defaults`, which logical reads report.
   */
  style?: ElementStyle | RelationshipStyle;
  /** A relationship kind's `multiple` (the first one, as LikeC4 reads it); absent when not written */
  multiple?: boolean;
}

/**
 * Structural view of a `SpecificationElementKind`,
 * `SpecificationRelationshipKind` or `SpecificationDeploymentNodeKind` node.
 */
interface KindNode {
  kind?: { name?: string };
  tags?: unknown;
  props?: unknown[];
  $cstNode?: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } };
}

/** Element, relationship and deployment node kind declarations of one document, in source order. */
export function specificationKinds(ast: { specifications?: unknown[] }): {
  elements: KindNode[];
  relationships: KindNode[];
  deploymentNodes: KindNode[];
} {
  const elements: KindNode[] = [];
  const relationships: KindNode[] = [];
  const deploymentNodes: KindNode[] = [];
  for (const raw of ast.specifications ?? []) {
    const spec = raw as { elements?: KindNode[]; relationships?: KindNode[]; deploymentNodes?: KindNode[] };
    elements.push(...(spec.elements ?? []).filter((k) => k.kind?.name));
    relationships.push(...(spec.relationships ?? []).filter((k) => k.kind?.name));
    deploymentNodes.push(...(spec.deploymentNodes ?? []).filter((k) => k.kind?.name));
  }
  return { elements, relationships, deploymentNodes };
}

/**
 * Read one kind declaration.
 *
 * @param node         - The kind node
 * @param file         - File of its document, when named
 * @param relationship - True for a relationship kind (no summary); false
 *                       for an element or deployment node kind, which LikeC4
 *                       reads alike (`parseElementSpecificationNode`)
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
  const style = relationship ? readKindRelationshipStyle(node.props) : readKindElementStyle(node.props);
  const multiple = relationship
    ? ((node.props ?? []).find((prop) => (prop as { $type?: string }).$type === 'MultipleProperty') as { value?: unknown } | undefined)
    : undefined;
  return {
    defaults,
    contribution: { ...(tags && { tags }), ...(links && { links }) },
    ...(style && { style }),
    ...(multiple && { multiple: multiple.value === true }),
  };
}
