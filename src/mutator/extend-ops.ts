/**
 * Creation of `extend` blocks (lc4m-15.30 US-10): `extend <element> { … }`
 * and `extend <source> -[kind]-> <target> 'title' { … }` contributing tags,
 * links and metadata, written into a chosen file — or merged into the
 * file's first block of the same target (FR-050): new tags after the
 * block's tags, new links and metadata keys at its end, nothing the block
 * already has repeated.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { Decorations } from '../query/extend-merge.js';
import type { RelationIdentity } from '../query/relation-extends.js';
import { BodyInsertions } from './body-layout.js';
import type { BodyOwnerNode } from './cst-helpers.js';
import { escapeString, formatLinkUrl, formatTag, generateBody } from './codegen.js';
import { getNodeIndent } from './indent.js';
import { buildReplaceMetadataEditOnNode } from './metadata-ops.js';
import type { TextEdit } from './text-edit.js';

/** What an `extend` block contributes. */
export interface ExtendContributions {
  /** Declared tags, without `#` */
  tags?: string[];
  links?: Array<{ url: string; label?: string }>;
  /** Metadata keys the element or relationship has nowhere yet (D86) */
  metadata?: Record<string, string | string[]>;
}

/** Options of `addElementExtend` (lc4m-15.30 US-10, D71). */
export interface AddElementExtendOpts extends ExtendContributions {
  /** The loaded file the block is written to (required) */
  file: string;
}

/** Options of `addRelationshipExtend` (lc4m-15.30 US-10, D72, D103). */
export interface AddRelationshipExtendOpts extends ExtendContributions {
  /** The loaded file the block is written to (required) */
  file: string;
  /**
   * Accept an identity that other relationships share: the block then
   * applies to all of them, as LikeC4 matches blocks by identity (D72)
   */
  shared?: boolean;
}

/** Whether `contributions` contribute anything. */
export function contributesAnything(contributions: ExtendContributions): boolean {
  return (contributions.tags?.length ?? 0) > 0 || (contributions.links?.length ?? 0) > 0 || Object.keys(contributions.metadata ?? {}).length > 0;
}

/**
 * The part of `contributions` a block that already holds `existing` does
 * not have (FR-050): its tags and links are not repeated, and a tag or link
 * given twice is written once.  Metadata keys are all new (D86).
 */
export function newContributions(existing: Decorations | undefined, contributions: ExtendContributions): ExtendContributions {
  const tags = [...new Set(contributions.tags ?? [])].filter((tag) => !(existing?.tags ?? []).includes(tag));
  const sameLink = (a: { url: string; label?: string }, b: { url: string; label?: string }): boolean =>
    a.url === b.url && (a.label ?? '') === (b.label ?? '');
  const links: Array<{ url: string; label?: string }> = [];
  for (const link of contributions.links ?? []) {
    if ((existing?.links ?? []).some((other) => sameLink(other, link)) || links.some((other) => sameLink(other, link))) continue;
    links.push(link);
  }
  return {
    ...(tags.length > 0 && { tags }),
    ...(links.length > 0 && { links }),
    ...(contributions.metadata && Object.keys(contributions.metadata).length > 0 && { metadata: contributions.metadata }),
  };
}

/** The text of a new `extend <fqn> { … }` block on a line indented by `indent`. */
export function generateElementExtend(indent: string, fqn: string, contributions: ExtendContributions): string {
  return `${indent}extend ${fqn}${generateBody(indent, contributions)}`;
}

/**
 * The header of an `extend` block of the relationships of `identity`:
 * the endpoints as absolute FQNs, the connector — `-[kind]->` with the
 * kind, `->` without, `<->` for a bidirectional relationship, which
 * LikeC4 1.59.4's grammar writes without a kind — and the title when there
 * is one.
 */
export function relationExtendHeader(identity: RelationIdentity): string {
  const kind = identity.kind;
  const arrow = identity.isBidirectional ? '<->' : kind ? `-[${kind}]->` : '->';
  return `${identity.sourceFqn} ${arrow} ${identity.targetFqn}${identity.title !== '' ? ` '${escapeString(identity.title)}'` : ''}`;
}

/** The text of a new `extend a -> b { … }` block on a line indented by `indent`. */
export function generateRelationExtend(indent: string, identity: RelationIdentity, contributions: ExtendContributions): string {
  return `${indent}extend ${relationExtendHeader(identity)}${generateBody(indent, contributions)}`;
}

/** An `extend` block node with its body. */
type ExtendBlockNode = BodyOwnerNode & { body?: { tags?: { $cstNode?: { end: number } } } };

/**
 * The edits that merge `contributions` (already reduced by
 * {@link newContributions}) into the existing block `block` of `doc`
 * (FR-050): tags after the block's last tag (else opening the body), links
 * at its end, metadata keys into its first `metadata { }` block (created
 * at the end when it has none).
 */
export function mergeIntoExtendEdits(block: ExtendBlockNode, doc: ParsedDocument, contributions: ExtendContributions): TextEdit[] {
  const { fullText } = doc;
  const indent = getNodeIndent(block, fullText);
  const inserts = BodyInsertions.forBody(block, fullText, indent);
  const edits: TextEdit[] = [];
  const tags = contributions.tags ?? [];
  if (tags.length > 0) {
    const tagsEnd = block.body?.tags?.$cstNode?.end;
    if (tagsEnd !== undefined) edits.push({ offset: tagsEnd, end: tagsEnd, newText: ` ${tags.map(formatTag).join(' ')}` });
    else inserts.prepend(`${inserts.innerIndent}${tags.map(formatTag).join(' ')}\n`);
  }
  for (const link of contributions.links ?? []) {
    inserts.append(`${inserts.innerIndent}link ${formatLinkUrl(link.url)}${link.label ? ` '${escapeString(link.label)}'` : ''}\n`);
  }
  if (contributions.metadata && Object.keys(contributions.metadata).length > 0) {
    edits.push(...buildReplaceMetadataEditOnNode(block, fullText, indent, contributions.metadata, inserts));
  }
  return inserts.apply(edits);
}
