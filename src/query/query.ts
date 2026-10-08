import { buildFqnIndex, type FqnEntry } from './fqn.js';
import { WorkspaceIndex, resolveRelations, type ResolvedRelation } from './workspace-index.js';
import { mergeRelationContributions, relationIdentity } from './relation-extends.js';
import type { ElementInfo, ExtendContribution, RelationshipInfo, SpecificationInfo } from './types.js';
import { applyKindDefaults, mergeContributions, readContribution, readDeclared } from './extend-merge.js';
import { relationDecorationSource, relationKind, type RelationNodeLike } from './relation-node.js';
import {
  markdownAsString,
  markdownOrString,
  readMarkdownOrString,
  removeIndent,
  toSingleLine,
  type MarkdownOrString,
} from './likec4-text.js';
import { toSourceRange } from './source-range.js';

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
  private readonly workspace: WorkspaceIndex;

  /**
   * @param ast       - Root AST of the document to query
   * @param workspace - Index of every document of the project (must include
   *                    `ast`), used to resolve relationship endpoints that
   *                    refer to elements declared in other files and to merge
   *                    the `extend` blocks of other files into element
   *                    properties.  Defaults to an index of `ast` alone: then
   *                    only the `extend` blocks of `ast` are merged and
   *                    `ElementInfo.extendedBy[].file` is absent.
   */
  constructor(ast: LikeC4DocumentAst, workspace?: WorkspaceIndex) {
    this.ast = ast;
    this.fqnIndex = buildFqnIndex(ast);
    this.workspace = workspace ?? new WorkspaceIndex([ast]);
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
   * Relationships nested inside element bodies and `extend` bodies are included.
   *
   * `sourceFqn` / `targetFqn` are absolute FQNs, resolved with LikeC4's scoping
   * rules: `api -> db` written inside `app { ... }` is reported as
   * `app.api -> app.db`, `this` / `it` and sourceless `-> x` resolve to the
   * enclosing element.  A reference that cannot be resolved (unknown or
   * ambiguous name) is reported as written.
   */
  getRelationships(opts?: { sourceFqn?: string; targetFqn?: string }): RelationshipInfo[] {
    const relations = resolveRelations(this.ast, this.workspace).map((r) =>
      toRelationshipInfo(r, this.workspace),
    );

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

    // Named body properties (ElementStringProperty nodes).  LikeC4 folds them
    // into an object, so of a repeated key the last declaration counts.
    const body: Partial<Record<string, MarkdownOrString>> = {};
    if (node.body?.props) {
      for (const prop of node.body.props) {
        if (prop.$type !== 'ElementStringProperty') continue;
        body[prop.key as string] = readMarkdownOrString(prop);
      }
    }

    // Positional props written after the kind: `name = kind 'title' 'summary'
    // 'technology'`.  LikeC4 (`parseBaseProps`) prefers them over the body: a
    // title and a technology whenever written (an empty one included), a
    // summary when non-empty.  Values are normalized as LikeC4 does.
    const [inlineTitle, inlineSummary, inlineTechnology] = (Array.isArray(node.props) ? node.props : []) as unknown[];
    const ownTitle = typeof inlineTitle === 'string' ? removeIndent(inlineTitle) : markdownAsString(body['title']);
    const ownSummary =
      typeof inlineSummary === 'string' && inlineSummary !== ''
        ? removeIndent(inlineSummary)
        : markdownOrString(body['summary']);
    const ownDescription = markdownOrString(body['description']);
    const ownTechnology =
      typeof inlineTechnology === 'string' ? toSingleLine(inlineTechnology) : markdownAsString(body['technology']);

    // Defaults of the element's kind (`MergedSpecification.toModelElement`):
    // a summary, description or technology the element does not have; the
    // kind title — else the element name — for an empty title.
    const kindName = node.kind?.$refText ?? '';
    const kind = this.workspace.elementKind(kindName);
    const defaults = kind?.defaults;
    const title = ownTitle || defaults?.title || entry.name;
    const summary = ownSummary ?? defaults?.summary;
    const description = ownDescription ?? defaults?.description;
    const technology = ownTechnology ?? defaults?.technology;

    // Tags / links / metadata: the kind's defaults, then the declaration,
    // merged with every `extend` block of the element, as LikeC4 does.
    const blocks = this.workspace.extendBlocks(entry.fqn);
    const effective = mergeContributions(
      applyKindDefaults(readContribution(node.body), kind?.contribution),
      blocks.map((b) => readContribution(b.node.body)),
    );
    const extendedBy = blocks.map((b): ExtendContribution => ({
      ...(b.file !== undefined && { file: b.file }),
      sourceRange: toSourceRange(b.node.$cstNode),
      ...readDeclared(b.node.body),
    }));

    return {
      fqn: entry.fqn,
      name: entry.name,
      kind: kindName,
      title,
      summary,
      description,
      technology,
      tags: effective.tags,
      links: effective.links,
      metadata: effective.metadata,
      ...(defaults && { fromSpecification: structuredClone(defaults) }),
      declared: readDeclared(node.body),
      extendedBy,
      // Children declared in `extend` blocks of other documents count too.
      children: this.workspace.children(entry.fqn),
      parentFqn: entry.parentFqn,
      sourceRange: toSourceRange(cst),
    };
  }
}

/**
 * Build the public {@link RelationshipInfo} for a `Relation` AST node whose
 * endpoints have already been resolved to FQNs.
 */
function toRelationshipInfo(resolved: ResolvedRelation, workspace: WorkspaceIndex): RelationshipInfo {
  const { sourceFqn, targetFqn } = resolved;
  const item = resolved.node as {
    title?: string;
    /** Description written after the title */
    description?: string;
    /** Technology written after the description */
    technology?: string;
    kind?: { $refText?: string };
    body?: { props?: unknown[]; [k: string]: unknown };
    $cstNode?: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } };
  };
  const cst = item.$cstNode;

  // Named properties live in body.props as RelationStringProperty nodes; of a
  // repeated key the last declaration counts.
  const body: Partial<Record<string, MarkdownOrString>> = {};
  if (item.body?.props) {
    for (const rawProp of item.body.props) {
      const prop = rawProp as { $type?: string; key?: string; value?: unknown };
      if (prop.$type !== 'RelationStringProperty' || prop.key === undefined) continue;
      const value = readMarkdownOrString(prop);
      // A body title without a value does not replace an earlier one.
      if (prop.key === 'title' && value === undefined) continue;
      body[prop.key] = value;
    }
  }
  // As LikeC4 `parseBaseProps` reads them: the title written after the target
  // (even an empty one), otherwise the body `title`; the description written
  // after the title when non-empty, otherwise the body; the technology written
  // after the description whenever written, otherwise the body.  Values are
  // normalized as LikeC4 does.
  const ownTitle = item.title !== undefined ? removeIndent(item.title) : markdownAsString(body['title']);
  const ownDescription = item.description ? removeIndent(item.description) : markdownOrString(body['description']);
  const ownTechnology =
    item.technology !== undefined ? toSingleLine(item.technology) : markdownAsString(body['technology']);

  const kind = relationKind(item as RelationNodeLike);
  const decorationSource = relationDecorationSource(item as RelationNodeLike);

  // Defaults of a declared kind (`MergedSpecification.toModelRelation`): a
  // description or technology the relationship does not have (an empty own
  // one included counts as present), the kind title for an empty title.
  const kindSpec = kind === undefined ? undefined : workspace.relationshipKind(kind);
  const defaults = kindSpec?.defaults;
  const title = ownTitle ? ownTitle : (defaults?.title ?? ownTitle);
  const description = ownDescription ?? defaults?.description;
  const technology = ownTechnology ?? defaults?.technology;

  // Tags / links / metadata: the kind's defaults, then the relationship's
  // own, merged with every `extend` block that applies to it, as LikeC4
  // does.  A relationship with an unresolved endpoint is not part of
  // LikeC4's model; no block applies to it.
  const blocks = resolved.resolved ? workspace.extendRelationBlocks(relationIdentity(resolved)) : [];
  const effective = mergeRelationContributions(
    applyKindDefaults(readContribution(decorationSource), kindSpec?.contribution),
    blocks.map((b) => readContribution(b.node.body)),
  );
  const extendedBy = blocks.map((b): ExtendContribution => ({
    ...(b.file !== undefined && { file: b.file }),
    sourceRange: toSourceRange(b.node.$cstNode),
    ...readDeclared(b.node.body),
  }));

  return {
    sourceFqn,
    targetFqn,
    title,
    kind,
    technology,
    description,
    tags: effective.tags,
    links: effective.links,
    metadata: effective.metadata,
    ...(defaults && { fromSpecification: structuredClone(defaults) }),
    declared: readDeclared(decorationSource),
    extendedBy,
    sourceRange: toSourceRange(cst),
  };
}
