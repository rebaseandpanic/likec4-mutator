/**
 * Writes of `specification` blocks (lc4m-15.30 US-6): new kind and tag
 * declarations, and the defaults of an existing kind with the semantics of
 * the element updates (D33): a string replaces every declaration of its key
 * and `null` removes them, `tags` and `links` replace the written ones.
 * The style, notation, `multiple` and colors of a kind are never touched.
 */
import { GrammarUtils, type CstNode } from 'langium';
import type { ParsedDocument } from '../parser/types.js';
import { BodyInsertions } from './body-layout.js';
import { escapeString, formatLinkUrl, formatTag, generateBody } from './codegen.js';
import { removalEditsForRanges, type CstNodeLike } from './cst-helpers.js';
import { getNodeIndent } from './indent.js';
import type { TextEdit } from './text-edit.js';

/** The type of a kind: its specification keyword and its name space (D67). */
export type KindType = 'element' | 'relationship' | 'deploymentNode';

/** A hyperlink default of a kind. */
export interface KindLink {
  url: string;
  label?: string;
}

/** Defaults of a new kind (lc4m-15.30 US-6). */
export interface AddKindOpts {
  /** The loaded file whose first `specification` block takes the kind; FR-021 default when absent */
  file?: string;
  title?: string;
  /** Element and deployment node kinds only (LikeC4's grammar has no relationship kind summary) */
  summary?: string;
  description?: string;
  technology?: string;
  /** Declared tags, without `#` */
  tags?: string[];
  links?: KindLink[];
}

/**
 * A change of a kind's defaults (D33): a string replaces the kind's value,
 * `null` removes it; `tags` and `links` replace the written ones (`[]`
 * removes them).  Absent fields are kept.
 */
export interface UpdateKindPatch {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  technology?: string | null;
  tags?: string[];
  links?: KindLink[];
}

/** The string defaults a kind can have, in the order they are written. */
export const KIND_STRING_KEYS = ['title', 'summary', 'description', 'technology'] as const;

/** Structural view of a kind declaration node (`SpecificationElementKind` and its siblings). */
export interface KindNode {
  $type?: string;
  $cstNode?: CstNodeLike & CstNode;
  kind?: { name?: string; $cstNode?: CstNodeLike };
  tags?: TagsNode;
  props?: Array<{ $type?: string; key?: string; $cstNode?: CstNodeLike & CstNode }>;
}

/** A `prev`-linked `Tags` node of a body. */
interface TagsNode {
  $cstNode?: CstNodeLike;
  prev?: TagsNode;
}

/** The AST property of a `specification` block holding the declarations of each type. */
const SPECIFICATION_PROPERTY: Readonly<Record<KindType | 'tag', string>> = {
  element: 'elements',
  relationship: 'relationships',
  deploymentNode: 'deploymentNodes',
  tag: 'tags',
};

/** The string property node type of a kind's body. */
const STRING_PROPERTY: Readonly<Record<KindType, string>> = {
  element: 'SpecificationElementStringProperty',
  deploymentNode: 'SpecificationElementStringProperty',
  relationship: 'SpecificationRelationshipStringProperty',
};

/** The declarations of `name` of `type` (a kind type, or `tag`) in the `specification` blocks of `ast`, in source order. */
export function specificationDeclarations(
  ast: { specifications?: unknown[] },
  type: KindType | 'tag',
  name: string,
): KindNode[] {
  const found: KindNode[] = [];
  for (const raw of ast.specifications ?? []) {
    for (const node of ((raw as Record<string, unknown>)[SPECIFICATION_PROPERTY[type]] ?? []) as Array<
      KindNode & { tag?: { name?: string } }
    >) {
      const declared = type === 'tag' ? node.tag?.name : node.kind?.name;
      if (declared === name) found.push(node);
    }
  }
  return found;
}

/** The text of a new kind declaration on a line indented by `indent`: the keyword, the name and a body with the defaults. */
export function generateKind(type: KindType, name: string, opts: Omit<AddKindOpts, 'file'>, indent: string): string {
  return `${type} ${name}${generateBody(indent, {
    ...(opts.tags !== undefined && { tags: opts.tags }),
    strings: KIND_STRING_KEYS.map((key) => [key, opts[key]]),
    ...(opts.links !== undefined && { links: opts.links }),
  })}`;
}

/** The text of a new tag declaration. */
export function generateTag(name: string): string {
  return `tag ${name}`;
}

/**
 * The edits that write `patch` into the kind declaration `node` of `doc`
 * (D33).  A kind without a body is given one after its name.  Every other
 * line of the body — style, notation, `multiple`, other keys — is kept.
 */
export function updateKindEdits(node: KindNode, type: KindType, doc: ParsedDocument, patch: UpdateKindPatch): TextEdit[] {
  const { fullText } = doc;
  const cst = node.$cstNode;
  const nameCst = node.kind?.$cstNode;
  if (!cst || !nameCst) throw new Error('internal: a kind declaration without a position');
  const indent = getNodeIndent(node, fullText);

  if (!fullText.slice(nameCst.end, cst.end).includes('{')) {
    const body = generateBody(indent, {
      ...(patch.tags !== undefined && { tags: patch.tags }),
      strings: KIND_STRING_KEYS.map((key) => [key, patch[key] ?? undefined]),
      ...(patch.links !== undefined && { links: patch.links }),
    });
    return body === '' ? [] : [{ offset: cst.end, end: cst.end, newText: body }];
  }

  const inserts = BodyInsertions.forBlock(cst, fullText, indent);
  const inner = inserts.innerIndent;
  const edits: TextEdit[] = [];
  const removed: Array<{ offset: number; end: number }> = [];
  const props = node.props ?? [];

  for (const key of KIND_STRING_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const existing = props.filter((prop) => prop.$type === STRING_PROPERTY[type] && prop.key === key);
    if (value === null) {
      for (const prop of existing) if (prop.$cstNode) removed.push(prop.$cstNode);
    } else if (existing.length > 0) {
      for (const prop of existing) {
        const valueCst = GrammarUtils.findNodeForProperty(prop.$cstNode, 'value');
        if (!valueCst) throw new Error(`internal: the ${key} of a kind has no value`);
        edits.push({ offset: valueCst.offset, end: valueCst.end, newText: `'${escapeString(value)}'` });
      }
    } else {
      inserts.append(`${inner}${key} '${escapeString(value)}'\n`);
    }
  }
  if (patch.tags !== undefined) {
    for (let tags = node.tags; tags; tags = tags.prev) if (tags.$cstNode) removed.push(tags.$cstNode);
    if (patch.tags.length > 0) inserts.prepend(`${inner}${patch.tags.map(formatTag).join(' ')}\n`);
  }
  if (patch.links !== undefined) {
    for (const prop of props) if (prop.$type === 'LinkProperty' && prop.$cstNode) removed.push(prop.$cstNode);
    for (const link of patch.links) {
      inserts.append(`${inner}link ${formatLinkUrl(link.url)}${link.label ? ` '${escapeString(link.label)}'` : ''}\n`);
    }
  }
  return inserts.apply([...edits, ...removalEditsForRanges(fullText, removed)]);
}
