/**
 * Reading parts of a `Relation` AST node the way LikeC4 1.59.4 does
 * (language-server `ModelParser.parseRelation`).
 */

/** Minimal structural view of a `Relation` (or `ExtendRelation`) node. */
export interface RelationNodeLike {
  /** `-[kind]->` */
  kind?: { $refText?: string };
  /** `.kind` */
  dotKind?: { kind?: { $refText?: string } };
  /** Tags written on the relation line, after the title */
  tags?: unknown;
  body?: { tags?: unknown; props?: unknown[] };
}

/**
 * Relationship kind as written, in either form: `-[kind]->` or `.kind`
 * (`(kind ?? dotKind?.kind)` in LikeC4).
 */
export function relationKind(node: RelationNodeLike): string | undefined {
  return node.kind?.$refText ?? node.dotKind?.kind?.$refText;
}

/**
 * The tags / props LikeC4 reads for a relation: tags written on the relation
 * line when there are any, otherwise those of the body
 * (`parseTags(relation) ?? parseTags(relation.body)`); props of the body.
 */
export function relationDecorationSource(node: RelationNodeLike): { tags?: unknown; props?: unknown[] } {
  return { tags: node.tags ?? node.body?.tags, props: node.body?.props };
}
