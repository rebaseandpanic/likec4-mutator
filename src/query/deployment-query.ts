/**
 * Read API of the deployment model: deployment nodes and instances with
 * their effective values and provenance.
 *
 * Effective values are LikeC4 1.59.4's computed model (language-server
 * `DeploymentModelParser.parseDeploymentNode` / `parseDeployedInstance`,
 * `MergedSpecification.toDeploymentElement`, `MergedExtends`, and the
 * `DeploymentNodeModel` / `DeployedInstanceModel` getters of
 * `@likec4/core`), except that summary and description are reported per
 * field, without the getters' fallback from one to the other (D2), and that
 * an instance inherits the library's element values, which derive no
 * technology from an icon (D10).
 */
import type { DeploymentAstNode, DeploymentDeclaration, DeploymentIndex } from './deployment-index.js';
import type { DeploymentResolver } from './deployment-resolver.js';
import { mergeContributions, readContribution, readDeclared, type Decorations } from './extend-merge.js';
import { markdownAsString, markdownOrString, readMarkdownOrString, removeIndent, type MarkdownOrString } from './likec4-text.js';
import { toSourceRange } from './source-range.js';
import { mergeStyle, readElementStyle } from './style-read.js';
import type {
  DeploymentInstanceInfo,
  DeploymentNodeInfo,
  DeploymentNodeKindDefaults,
  ElementInfo,
  ExtendContribution,
} from './types.js';
import type { WorkspaceIndex } from './workspace-index.js';
import type { ElementStyle } from '../mutator/codegen.js';

/** Own strings of a node or instance declaration, read as LikeC4 `parseBaseProps` reads them. */
interface OwnStrings {
  title?: string;
  summary?: string;
  description?: string;
  technology?: string;
}

/** Filters of {@link DeploymentQuery.listNodes}. */
export interface DeploymentNodeFilter {
  /** Only nodes of this kind, as written */
  kind?: string;
  /** Only the direct children of this node */
  parentId?: string;
}

/** Filters of {@link DeploymentQuery.listInstances}. */
export interface DeploymentInstanceFilter {
  /** Only the instances directly in this node */
  nodeId?: string;
  /** Only the instances of this element (absolute FQN, as resolved) */
  element?: string;
}

/** The logical elements an instance inherits from. */
export interface DeploymentElementSource {
  /** Effective values of the element with this FQN, as the library reads them; null when there is none */
  info(fqn: string): ElementInfo | null;
  /** The `Element` AST node of the element with this FQN, for its style */
  node(fqn: string): unknown;
}

/** Reads of the deployment model over a {@link DeploymentIndex}. */
export class DeploymentQuery {
  /**
   * @param index     - Deployment index of the workspace
   * @param workspace - Element index of the same documents (specification kinds)
   * @param resolver  - Resolver of the same documents (`instanceOf` targets)
   * @param elements  - The logical elements of the same documents
   */
  constructor(
    private readonly index: DeploymentIndex,
    private readonly workspace: WorkspaceIndex,
    private readonly resolver: DeploymentResolver,
    private readonly elements: DeploymentElementSource,
  ) {}

  /**
   * The node with deployment id `id`; null when no node has it.  When the id
   * is declared more than once (a LikeC4 error), the first declaration in
   * LikeC4 document order is reported.
   */
  node(id: string): DeploymentNodeInfo | null {
    if (!this.isReported(id)) return null;
    const declaration = this.index.declarations(id).find((d) => d.type === 'node');
    return declaration ? this.toNodeInfo(declaration) : null;
  }

  /**
   * Every node, in LikeC4 document order (a parent before its children),
   * optionally filtered.  An id declared more than once is reported once
   * per declaration.
   */
  listNodes(filter?: DeploymentNodeFilter): DeploymentNodeInfo[] {
    const out: DeploymentNodeInfo[] = [];
    for (const id of this.index.ids()) {
      if (!this.isReported(id)) continue;
      for (const declaration of this.index.declarations(id)) {
        if (declaration.type !== 'node') continue;
        if (filter?.parentId !== undefined && declaration.parentId !== filter.parentId) continue;
        if (filter?.kind !== undefined && kindOf(declaration.node) !== filter.kind) continue;
        out.push(this.toNodeInfo(declaration));
      }
    }
    return out;
  }

  /**
   * The instance with deployment id `id`; null when no instance has it.
   * When the id is declared more than once (a LikeC4 error), the first
   * declaration in LikeC4 document order is reported.
   */
  instance(id: string): DeploymentInstanceInfo | null {
    if (!this.isReported(id)) return null;
    const declaration = this.index.declarations(id).find((d) => d.type === 'instance');
    return declaration ? this.toInstanceInfo(declaration) : null;
  }

  /**
   * Every instance, in LikeC4 document order, optionally filtered.  An id
   * declared more than once is reported once per declaration.
   */
  listInstances(filter?: DeploymentInstanceFilter): DeploymentInstanceInfo[] {
    const out: DeploymentInstanceInfo[] = [];
    for (const id of this.index.ids()) {
      if (!this.isReported(id)) continue;
      for (const declaration of this.index.declarations(id)) {
        if (declaration.type !== 'instance') continue;
        if (filter?.nodeId !== undefined && declaration.parentId !== filter.nodeId) continue;
        const info = this.toInstanceInfo(declaration);
        if (filter?.element !== undefined && info.element !== filter.element) continue;
        out.push(info);
      }
    }
    return out;
  }

  /**
   * True when `id` is part of the model: declared — an instance with an
   * `instanceOf` target that resolves — and its parent (if any) is part of
   * the model.  LikeC4 drops an instance whose target does not resolve, and
   * a declaration whose parent is not in its model (`No parent found`), e.g.
   * one inside an `extend` block of a node that does not exist.
   */
  private isReported(id: string): boolean {
    const [declaration] = this.index.declarations(id);
    if (!declaration) return false;
    if (declaration.type === 'instance' && this.resolver.instanceElement(declaration.node) === undefined) return false;
    return declaration.parentId === undefined || this.isReported(declaration.parentId);
  }

  private toInstanceInfo(declaration: DeploymentDeclaration): DeploymentInstanceInfo {
    const { id, name, node } = declaration;
    const fqn = this.resolver.instanceElement(node)!;
    const element = this.elements.info(fqn);
    const own = readOwnStrings(node);
    const contribution = readContribution(node.body);

    // `DeployedInstanceModel`: own value, else the element's; the own tags
    // first, then the element's; an own metadata map replaces the element's.
    const tags = unique([...(contribution.tags ?? []), ...(element?.tags ?? [])]);
    const style = mergeStyle(this.elementStyle(fqn), readElementStyle(node.body?.['props'] as unknown[] | undefined));

    return {
      id,
      name,
      parentId: declaration.parentId!,
      element: fqn,
      title: own.title ?? element?.title ?? name,
      summary: own.summary ?? element?.summary,
      description: own.description ?? element?.description,
      technology: own.technology ?? element?.technology,
      tags: tags.length > 0 ? tags : undefined,
      links: contribution.links ?? copy(element?.links),
      metadata: contribution.metadata ?? copy(element?.metadata),
      ...(style && { style }),
      declared: readDeclared(node.body),
      ...(declaration.file !== undefined && { file: declaration.file }),
      sourceRange: toSourceRange(cstOf(node)),
    };
  }

  /** The style of an element: its kind's style overridden per field by its own (body `icon` included). */
  private elementStyle(fqn: string): ElementStyle | undefined {
    const node = this.elements.node(fqn) as { kind?: { $refText?: string }; body?: { props?: unknown[] } } | undefined;
    if (!node) return undefined;
    const kind = this.workspace.elementKind(node.kind?.$refText ?? '');
    return mergeStyle(kind?.style as ElementStyle | undefined, readElementStyle(node.body?.props));
  }

  private toNodeInfo(declaration: DeploymentDeclaration): DeploymentNodeInfo {
    const { id, name, node } = declaration;
    const kindName = kindOf(node);
    const kind = this.workspace.deploymentNodeKind(kindName);
    const defaults = kind?.defaults;
    const own = readOwnStrings(node);

    // `parseDeploymentNode` falls back to the node name;
    // `toDeploymentElement` replaces a title equal to the name by the kind's.
    let title = own.title ?? name;
    if (title === name && defaults?.title) title = defaults.title;

    // Tags, links and metadata: own (or the kind's when there are none),
    // then the `extend` blocks (`MergedExtends`); the getter appends the
    // kind's tags.
    const blocks = this.index.extendBlocks(id);
    const effective = mergeContributions(
      ownOrKind(readContribution(node.body), kind?.contribution),
      blocks.map((b) => readContribution(b.node.body)),
    );
    const tags = unique([...(effective.tags ?? []), ...(kind?.contribution.tags ?? [])]);

    const extendedBy = blocks.map((b): ExtendContribution => ({
      ...(b.file !== undefined && { file: b.file }),
      sourceRange: toSourceRange(cstOf(b.node)),
      ...readDeclared(b.node.body),
    }));
    const children = this.index.children(id).filter((c) => this.isReported(c));
    const style = mergeStyle(kind?.style as ElementStyle | undefined, readElementStyle(node.body?.['props'] as unknown[] | undefined));
    const fromSpecification: DeploymentNodeKindDefaults | undefined = kind && {
      ...structuredClone(kind.defaults),
      ...(kind.style && { style: structuredClone(kind.style as ElementStyle) }),
    };

    return {
      id,
      name,
      kind: kindName,
      ...(declaration.parentId !== undefined && { parentId: declaration.parentId }),
      title,
      summary: own.summary ?? defaults?.summary,
      description: own.description ?? defaults?.description,
      technology: own.technology ?? defaults?.technology,
      tags: tags.length > 0 ? tags : undefined,
      links: effective.links,
      metadata: effective.metadata,
      ...(style && { style }),
      ...(fromSpecification && { fromSpecification }),
      declared: readDeclared(node.body),
      extendedBy,
      children: children.filter((c) => this.typeOf(c) === 'node'),
      instances: children.filter((c) => this.typeOf(c) === 'instance'),
      ...(declaration.file !== undefined && { file: declaration.file }),
      sourceRange: toSourceRange(cstOf(node)),
    };
  }

  private typeOf(id: string): DeploymentDeclaration['type'] | undefined {
    return this.index.declarations(id)[0]?.type;
  }
}

/** Kind of a node declaration as written. */
function kindOf(node: DeploymentAstNode): string {
  return (node['kind'] as { $refText?: string } | undefined)?.$refText ?? '';
}

function cstOf(node: DeploymentAstNode): Parameters<typeof toSourceRange>[0] {
  return node['$cstNode'] as Parameters<typeof toSourceRange>[0];
}

/**
 * Title, summary, description and technology of a node or instance as
 * LikeC4 `parseBaseProps` reads them: the title written after the kind or
 * target (an empty one included), otherwise the body `title`; the summary
 * written there when non-empty, otherwise the body `summary`; description
 * and technology from the body.  Of a repeated body key the last counts.
 */
export function readOwnStrings(node: DeploymentAstNode): OwnStrings {
  const body: Partial<Record<string, MarkdownOrString>> = {};
  for (const raw of (node.body?.['props'] as unknown[] | undefined) ?? []) {
    const prop = raw as { $type?: string; key?: string };
    if (prop.$type !== 'ElementStringProperty' || prop.key === undefined) continue;
    body[prop.key] = readMarkdownOrString(prop);
  }
  const inlineTitle = node['title'];
  const inlineSummary = node['summary'];
  const title = typeof inlineTitle === 'string' ? removeIndent(inlineTitle) : markdownAsString(body['title']);
  const summary =
    typeof inlineSummary === 'string' && inlineSummary !== ''
      ? removeIndent(inlineSummary)
      : markdownOrString(body['summary']);
  const description = markdownOrString(body['description']);
  const technology = markdownAsString(body['technology']);
  return {
    ...(title !== undefined && { title }),
    ...(summary !== undefined && { summary }),
    ...(description !== undefined && { description }),
    ...(technology !== undefined && { technology }),
  };
}

/**
 * The tags and links of a node before any `extend` block
 * (`toDeploymentElement`: `{ ...kind, ...own }`): its own, or the kind's
 * when it has none.  Metadata is its own (a kind declares none).
 */
function ownOrKind(own: Decorations, kind: Decorations | undefined): Decorations {
  return {
    ...own,
    ...(!own.tags && kind?.tags && { tags: [...kind.tags] }),
    ...(!own.links && kind?.links && { links: kind.links.map((l) => ({ ...l })) }),
  };
}

function copy<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
