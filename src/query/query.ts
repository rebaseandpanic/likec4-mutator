import { buildFqnIndex, type FqnEntry } from './fqn.js';
import { WorkspaceIndex, resolveRelations, type ResolvedRelation } from './workspace-index.js';
import { mergeRelationContributions, relationIdentity } from './relation-extends.js';
import type { ElementInfo, ExtendContribution, RelationshipInfo, SourceRange, SpecificationInfo } from './types.js';
import { mergeContributions, readContribution, readDeclared } from './extend-merge.js';
import { relationDecorationSource, relationKind, type RelationNodeLike } from './relation-node.js';
import { removeIndent, toSingleLine } from './likec4-text.js';

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
    const title = typeof inlineTitle === 'string' ? removeIndent(inlineTitle) : markdownAsString(body['title']);
    const summary =
      typeof inlineSummary === 'string' && inlineSummary !== ''
        ? removeIndent(inlineSummary)
        : markdownOrString(body['summary']);
    const description = markdownOrString(body['description']);
    const technology =
      typeof inlineTechnology === 'string' ? toSingleLine(inlineTechnology) : markdownAsString(body['technology']);

    // Tags / links / metadata: the declaration merged with every `extend`
    // block of the element, as LikeC4 does.
    const blocks = this.workspace.extendBlocks(entry.fqn);
    const effective = mergeContributions(
      readContribution(node.body),
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
      kind: node.kind?.$refText ?? '',
      title,
      summary,
      description,
      technology,
      tags: effective.tags,
      links: effective.links,
      metadata: effective.metadata,
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
  const title = item.title !== undefined ? removeIndent(item.title) : markdownAsString(body['title']);
  const description = item.description ? removeIndent(item.description) : markdownOrString(body['description']);
  const technology =
    item.technology !== undefined ? toSingleLine(item.technology) : markdownAsString(body['technology']);

  const kind = relationKind(item as RelationNodeLike);
  const decorationSource = relationDecorationSource(item as RelationNodeLike);

  // Tags / links / metadata: the relationship merged with every `extend`
  // block that applies to it, as LikeC4 does.  A relationship with an
  // unresolved endpoint is not part of LikeC4's model; nothing applies to it.
  const blocks = resolved.resolved ? workspace.extendRelationBlocks(relationIdentity(resolved)) : [];
  const effective = mergeRelationContributions(
    readContribution(decorationSource),
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
    declared: readDeclared(decorationSource),
    extendedBy,
    sourceRange: toSourceRange(cst),
  };
}

/** Source range of a CST node; all zero when the node has none. */
function toSourceRange(
  cst: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } } | undefined,
): SourceRange {
  return cst
    ? {
        offset: cst.offset,
        end: cst.end,
        line: cst.range?.start?.line ?? 0,
        column: cst.range?.start?.character ?? 0,
      }
    : { offset: 0, end: 0, line: 0, column: 0 };
}

/** A `MarkdownOrString` value: a plain string in `text` or a triple-quoted Markdown string in `markdown`. */
interface MarkdownOrString {
  text?: string;
  markdown?: string;
}

/** The `MarkdownOrString` value of a body string property, if it has one. */
function readMarkdownOrString(prop: unknown): MarkdownOrString | undefined {
  const value = (prop as { value?: unknown }).value;
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as { text?: unknown; markdown?: unknown };
  return {
    ...(typeof v.text === 'string' && { text: v.text }),
    ...(typeof v.markdown === 'string' && { markdown: v.markdown }),
  };
}

/**
 * A body `title` / `technology` as LikeC4 reads it
 * (`removeIndent(parseMarkdownAsString(value))`): the Markdown content, or
 * the plain string when the Markdown string is empty or absent, without
 * indentation and trimmed.
 */
function markdownAsString(value: MarkdownOrString | undefined): string | undefined {
  const text = value?.markdown || value?.text;
  return text === undefined ? undefined : removeIndent(text);
}

/**
 * A body `summary` / `description` as LikeC4 reads it
 * (`parseMarkdownOrString`): the Markdown content, otherwise the plain
 * string, without indentation and trimmed; the empty string for a value
 * that holds neither.
 */
function markdownOrString(value: MarkdownOrString | undefined): string | undefined {
  if (value === undefined) return undefined;
  return removeIndent(value.markdown ?? value.text ?? '');
}
