/**
 * Text-edit operations that target model relationships.
 */
import type { ParsedDocument } from '../parser/types.js';
import type { resolveFqnRef } from '../query/fqn.js';
import { WorkspaceIndex, resolveRelations, type ResolvedRelation } from '../query/workspace-index.js';
import type { ExtendRelationNode } from '../query/relation-extends.js';
import { relationKind } from '../query/relation-node.js';
import type { TextEdit } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import {
  generateRelationship,
  generateRelationshipStyleBlock,
  relationshipStyleEntries,
  generateMetadataBlock,
  escapeString,
  formatLinkUrl,
  formatTag,
  type RelationshipStyle,
} from './codegen.js';
import { BodyInsertions } from './body-layout.js';
import { buildMergeStyleEdits } from './style-ops.js';
import {
  buildRemovalEdit,
  buildInsertBodySnippet,
  buildReplaceLinksEdit,
  buildReplaceTagsInPlaceEdit,
  collectLeaves,
  type BodyOwnerNode,
} from './cst-helpers.js';
import {
  buildReplaceMetadataEditOnNode,
  collectMetadataUpserts,
  type MetadataPatch,
} from './metadata-ops.js';

/**
 * Build a TextEdit that inserts a new relationship at model level, on its
 * own line at the end of the first model block.
 *
 * @param doc    - Parsed document
 * @param source - Source element identifier (local name or FQN)
 * @param target - Target element identifier (local name or FQN)
 * @param label  - Optional relationship label
 * @returns TextEdit to insert the relationship
 */
export function addRelationshipEdit(
  doc: ParsedDocument,
  source: string,
  target: string,
  label?: string,
  opts?: {
    description?: string;
    technology?: string;
    tags?: string[];
    links?: Array<{ url: string; label?: string }>;
    metadata?: Record<string, string | string[]>;
    style?: RelationshipStyle;
  },
): TextEdit {
  const { ast, fullText } = doc;

  const model = ast.models?.[0];
  if (!model?.$cstNode) {
    throw new Error('No model block found in document');
  }

  const inserts = BodyInsertions.forBlock(model.$cstNode, fullText, getNodeIndent(model, fullText));
  const snippet = generateRelationship({
    indent: inserts.innerIndent,
    source,
    target,
    label,
    description: opts?.description,
    technology: opts?.technology,
    tags: opts?.tags,
    links: opts?.links,
    metadata: opts?.metadata,
    style: opts?.style,
  });
  inserts.append(snippet + '\n');
  const [edit] = inserts.apply([]);
  if (!edit) throw new Error('internal: no edit for the new relationship');
  return edit;
}

/**
 * Build a TextEdit that removes a relationship matching the given source and
 * target.  Endpoints are matched as described for {@link matchRelations}.
 * Only the first matching relationship is removed.
 *
 * @param doc       - Parsed document
 * @param source    - Source FQN (or reference text as written) to match
 * @param target    - Target FQN (or reference text as written) to match
 * @param workspace - Index of all documents of the project, used to resolve
 *                    references to elements declared in other files
 *                    (defaults to an index of `doc` alone)
 * @returns TextEdit that deletes the relationship line
 */
export function removeRelationshipEdit(
  doc: ParsedDocument,
  source: string,
  target: string,
  workspace?: WorkspaceIndex,
): TextEdit {
  const { ast, fullText } = doc;

  const [rel] = matchRelations(ast, { source, target }, workspace);
  if (!rel) {
    throw new Error(`Relationship '${source} -> ${target}' not found`);
  }
  if (!rel.$cstNode) throw new Error(`Relationship '${source} -> ${target}' has no CST node`);

  return removeRelationNodeEdit(fullText, rel);
}

/**
 * Build a TextEdit that deletes one `Relation` node, together with its
 * leading indentation / newline and trailing newline.
 *
 * @param fullText - Text of the document the node belongs to
 * @param node     - The `Relation` AST node to delete
 */
export function removeRelationNodeEdit(fullText: string, node: unknown): TextEdit {
  const cst = (node as RelationAstNode).$cstNode;
  if (!cst) throw new Error('Relationship has no CST node');

  const { offset, end, newText } = buildRemovalEdit(fullText, cst.offset, cst.end);
  return { offset, end, newText };
}

// ---------------------------------------------------------------------------
// updateRelationship
// ---------------------------------------------------------------------------

/** Match clause used to locate a relationship to update. */
export interface UpdateRelationshipMatcher {
  /** Source FQN (or reference text as written, see {@link matchRelations}) — required */
  source: string;
  /** Target FQN (or reference text as written, see {@link matchRelations}) — required */
  target: string;
  /** Optional: only match relations whose `kind` reference text equals this */
  matchKind?: string;
  /** Optional: only match relations whose inline title equals this */
  matchTitle?: string;
}

/** Patch payload for {@link selectedRelationshipPatchEdits}. */
export interface UpdateRelationshipPatch {
  /** New inline label.  REPLACE semantics. */
  label?: string;
  /** New description text.  REPLACE semantics. */
  description?: string;
  /** New technology label.  REPLACE semantics. */
  technology?: string;
  /** New tag set.  REPLACE.  Empty array clears all existing tags. */
  tags?: string[];
  /** New link set.  REPLACE.  Empty array clears all existing links. */
  links?: Array<{ url: string; label?: string }>;
  /**
   * Metadata patch — MERGE semantics with `null` deletion.  Keys absent from
   * the patch are preserved; keys mapped to `null` are deleted; everything
   * else is upserted.
   */
  metadata?: MetadataPatch;
  /** Style patch — MERGE per-field. Keys absent from the patch are preserved. */
  style?: RelationshipStyle;
}

/**
 * Build the TextEdits that apply `patch` to the selected relation `node` of
 * `doc` (see {@link relationPatchEdits}), after checking the patch: a patch
 * without any field is `nothing to update`, an empty metadata array is
 * rejected.
 */
export function selectedRelationshipPatchEdits(doc: ParsedDocument, node: unknown, patch: UpdateRelationshipPatch): TextEdit[] {
  checkRelationshipPatch(patch);
  return relationPatchEdits(node as RelationAstNode, doc.fullText, patch, { inlineStrings: 'rewrite' });
}

/** Throw `nothing to update` for a patch without any field, and for an empty metadata array. */
function checkRelationshipPatch(patch: UpdateRelationshipPatch): void {
  const hasAny =
    patch.label !== undefined ||
    patch.description !== undefined ||
    patch.technology !== undefined ||
    patch.tags !== undefined ||
    patch.links !== undefined ||
    patch.metadata !== undefined ||
    patch.style !== undefined;
  if (!hasAny) {
    throw new Error('nothing to update');
  }
  if (patch.metadata) {
    for (const [k, v] of Object.entries(patch.metadata)) {
      if (Array.isArray(v) && v.length === 0) {
        throw new Error(
          `Invalid metadata patch for key '${k}': empty array not allowed by LikeC4 grammar`,
        );
      }
    }
  }
}

/** Options of {@link relationPatchEdits}. */
export interface RelationPatchOptions {
  /**
   * Where a patched description or technology goes when the relation line
   * already has one: `'rewrite'` replaces the line's string (model
   * relationships: LikeC4 reads it over the body); `'body-only'` leaves the
   * line as written and writes the body (deployment relationships: LikeC4
   * parses the line's strings but ignores them).
   */
  inlineStrings: 'rewrite' | 'body-only';
}

/**
 * Build the TextEdits that apply `patch` to the relation `rel` (a model or
 * deployment relationship) of a document whose text is `fullText`: the
 * title is replaced or inserted inline, strings REPLACE every declaration
 * LikeC4 reads, tags and links REPLACE, metadata MERGE with `null`
 * deleting a key, style MERGE per field.
 *
 * @returns A list of TextEdits — empty when no patch field actually produces a
 *          change (e.g. tags === [] for a relation that has no tags).
 */
export function relationPatchEdits(
  rel: RelationAstNode,
  fullText: string,
  patch: UpdateRelationshipPatch,
  options: RelationPatchOptions,
): TextEdit[] {
  const indent = getNodeIndent(rel, fullText);
  const edits: TextEdit[] = [];

  // label — replace inline title token, or insert when missing.
  if (patch.label !== undefined) {
    const labelEdit = buildLabelEdit(rel, patch.label);
    if (labelEdit) edits.push(labelEdit);
  }

  // Description and technology written after the title are what LikeC4
  // reads on a model relationship (`parseBaseProps` overrides): a
  // technology whenever written, a description when non-empty.  They are
  // replaced there.  An empty description no longer overrides the body, so
  // it goes into the body too.
  const rewriteInline = options.inlineStrings === 'rewrite';
  if (rewriteInline && patch.technology !== undefined && rel.technology !== undefined) {
    edits.push(buildInlineStringEdit(rel, INLINE_TECHNOLOGY, patch.technology));
    patch = { ...patch, technology: undefined };
  }
  if (rewriteInline && patch.description !== undefined && rel.description) {
    edits.push(buildInlineStringEdit(rel, INLINE_DESCRIPTION, patch.description));
    if (patch.description !== '') patch = { ...patch, description: undefined };
  }

  // For body-targeting fields, when the relation has no body and we have
  // multiple body-touching patch fields, we want to insert ONE combined body
  // block (not several conflicting body-creation snippets).  The strategy:
  //   - If body exists, build an edit per field as usual.
  //   - If body is absent, build a single combined snippet and emit one edit
  //     that creates the body and includes all fields.
  //
  // Tags written on the relation line (`a -> b 'x' #t`) are what LikeC4
  // reads (`parseTags(relation) ?? parseTags(body)`); they are replaced
  // there.  Tags also in the body (a LikeC4 error) are removed: they would
  // become the relationship's tags once the line has none.
  let clearBodyTags = false;
  if (patch.tags !== undefined && rel.tags?.$cstNode) {
    edits.push(buildReplaceHeaderTagsEdit(rel.tags.$cstNode, fullText, patch.tags));
    clearBodyTags = rel.body?.tags?.$cstNode !== undefined;
    patch = { ...patch, tags: undefined };
  }
  const bodyTargeting =
    patch.description !== undefined ||
    patch.technology !== undefined ||
    patch.tags !== undefined ||
    patch.links !== undefined ||
    patch.metadata !== undefined ||
    patch.style !== undefined;

  if (bodyTargeting && !rel.body?.$cstNode) {
    const insertEdit = buildCombinedBodyInsert(rel, indent, patch);
    if (insertEdit) edits.push(insertEdit);
    return edits;
  }

  if (!rel.body?.$cstNode) return edits;

  // Body exists — emit per-field edits.  New lines are collected in
  // `inserts` and placed once all edits are known.
  const inserts = BodyInsertions.forBody(rel as BodyOwnerNode, fullText, indent);
  if (patch.description !== undefined) {
    edits.push(...buildRelationStringPropEdits(rel, 'description', patch.description, inserts));
  }
  if (patch.technology !== undefined) {
    edits.push(...buildRelationStringPropEdits(rel, 'technology', patch.technology, inserts));
  }
  if (patch.tags !== undefined || clearBodyTags) {
    const e = buildRelationReplaceTagsEdit(rel, fullText, patch.tags ?? [], inserts);
    if (e) edits.push(e);
  }
  if (patch.links !== undefined) {
    edits.push(...buildReplaceLinksEdit(rel as BodyOwnerNode, fullText, indent, patch.links, inserts));
  }
  if (patch.metadata !== undefined && Object.keys(patch.metadata).length > 0) {
    edits.push(
      ...buildReplaceMetadataEditOnNode(rel as BodyOwnerNode, fullText, indent, patch.metadata, inserts),
    );
  }
  if (patch.style !== undefined && Object.keys(patch.style).length > 0) {
    edits.push(...buildReplaceRelationStyleEdits(rel, fullText, indent, patch.style, inserts));
  }

  return inserts.apply(edits);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Shape of an FqnRef-like AST node used as `source` / `target` on a Relation.
 * Carries the CST node for direct anchoring (used by buildLabelEdit) and is
 * compatible with {@link resolveFqnRef}'s `any` parameter.
 */
type FqnRefLike = Parameters<typeof resolveFqnRef>[0] & {
  $cstNode?: { offset: number; end: number };
};

/** A model or deployment relationship AST node, as the patch edits read it. */
export interface RelationAstNode {
  $cstNode?: { offset: number; end: number; content?: unknown[] };
  source?: FqnRefLike;
  target?: FqnRefLike;
  title?: string;
  /** Description written after the title */
  description?: string;
  /** Technology written after the description */
  technology?: string;
  kind?: { $refText?: string };
  dotKind?: { kind?: { $refText?: string } };
  /** Tags written on the relation line, after the title */
  tags?: { $cstNode?: { offset: number; end: number } };
  body?: {
    $cstNode?: { offset: number; end: number };
    props?: Array<{
      $type?: string;
      $cstNode?: { offset: number; end: number };
      key?: string;
      name?: string;
      value?: unknown;
      props?: Array<unknown>;
    }>;
    tags?: { $cstNode?: { offset: number; end: number } };
  };
}

/**
 * Relations of `ast` that match `matcher`, split by how the endpoints matched.
 *
 * `byFqn` holds relations whose resolved absolute source/target FQNs equal
 * `matcher.source` / `matcher.target` (so `app.api -> app.db` finds
 * `api -> db` written inside `app { ... }`).  `byText` holds relations whose
 * endpoints, as written in the source, equal the matcher — the pre-resolution
 * behaviour, kept so that callers addressing a relation by its local
 * reference text (`api -> db`) still find it.  A bidirectional relationship
 * matches its endpoints in either order.  `matchKind` / `matchTitle` /
 * `matchBidirectional` filter both lists.
 *
 * @param workspace - Index of all documents of the project (defaults to an
 *                    index of `ast` alone)
 */
export function findMatchingRelations(
  ast: unknown,
  matcher: UpdateRelationshipMatcher & { matchBidirectional?: boolean },
  workspace?: WorkspaceIndex,
): { byFqn: ResolvedRelation[]; byText: ResolvedRelation[] } {
  const docAst = ast as { models?: Array<{ elements?: unknown[] }> };
  const resolved = resolveRelations(docAst, workspace ?? new WorkspaceIndex([docAst]));
  const byFqn: ResolvedRelation[] = [];
  const byText: ResolvedRelation[] = [];
  const endpoints = (source: string, target: string, bidirectional: boolean): boolean =>
    (source === matcher.source && target === matcher.target) ||
    (bidirectional && source === matcher.target && target === matcher.source);
  for (const rel of resolved) {
    const r = rel.node as RelationAstNode & { isBidirectional?: boolean };
    const bidirectional = r.isBidirectional === true;
    if (matcher.matchKind !== undefined && relationKind(r) !== matcher.matchKind) continue;
    if (matcher.matchTitle !== undefined && r.title !== matcher.matchTitle) continue;
    if (matcher.matchBidirectional !== undefined && bidirectional !== matcher.matchBidirectional) continue;
    if (endpoints(rel.sourceFqn, rel.targetFqn, bidirectional)) {
      byFqn.push(rel);
    } else if (endpoints(rel.sourceText, rel.targetText, bidirectional)) {
      byText.push(rel);
    }
  }
  return { byFqn, byText };
}

/**
 * Relations of `ast` matching `matcher`, with their resolved endpoints: the
 * absolute-FQN matches when there are any, otherwise the matches by
 * reference text as written (see {@link findMatchingRelations}).
 */
export function matchResolvedRelations(
  ast: unknown,
  matcher: UpdateRelationshipMatcher,
  workspace?: WorkspaceIndex,
): ResolvedRelation[] {
  const { byFqn, byText } = findMatchingRelations(ast, matcher, workspace);
  return byFqn.length > 0 ? byFqn : byText;
}

/**
 * Relations of `ast` matching `matcher`: the absolute-FQN matches when there
 * are any, otherwise the matches by reference text as written (see
 * {@link findMatchingRelations}).
 */
export function matchRelations(
  ast: unknown,
  matcher: UpdateRelationshipMatcher,
  workspace?: WorkspaceIndex,
): RelationAstNode[] {
  return matchResolvedRelations(ast, matcher, workspace).map((r) => r.node as RelationAstNode);
}

/**
 * Build the TextEdit that sets the title of an `extend a -> b 'title' { ... }`
 * block: the title string is replaced, or inserted after the target when the
 * block has none.
 */
export function buildExtendRelationTitleEdit(node: ExtendRelationNode, title: string): TextEdit {
  const edit = buildLabelEdit(node as unknown as RelationAstNode, title);
  if (!edit) throw new Error('extend block has no source position');
  return edit;
}

/**
 * Replace the inline title string of a relation, or insert one when absent.
 * The title token sits between the target reference and the opening brace `{`
 * (or the end of the relation when no body exists).
 *
 * Anchored on the target reference's own CST node end so kinded forms such as
 * `a -[sync]-> b` are handled correctly (a regex search for `->` would skip
 * past the target name).
 */
function buildLabelEdit(rel: RelationAstNode, newLabel: string): TextEdit | null {
  const cst = rel.$cstNode;
  if (!cst) return null;
  const targetCst = rel.target?.$cstNode;
  if (!targetCst) return null;
  const afterTarget = targetCst.end;

  const leaves = collectLeaves(cst);

  // Search for an existing title literal between the target end and the body
  // opening brace.
  for (const leaf of leaves) {
    if (leaf.offset < afterTarget) continue;
    if (leaf.text === '{') break;
    if (leaf.text.startsWith("'") || leaf.text.startsWith('"')) {
      return { offset: leaf.offset, end: leaf.end, newText: `'${escapeString(newLabel)}'` };
    }
  }
  // No existing title — insert right after the target reference.
  return { offset: afterTarget, end: afterTarget, newText: ` '${escapeString(newLabel)}'` };
}

/** Position of the description among the strings written after the target. */
const INLINE_DESCRIPTION = 1;
/** Position of the technology among the strings written after the target. */
const INLINE_TECHNOLOGY = 2;

/**
 * Replace the `position`-th string written after the target of a relation
 * (`a -> b 'title' 'description' 'technology'`).  The caller guarantees the
 * string is there (the AST node carries its value).
 */
function buildInlineStringEdit(rel: RelationAstNode, position: number, value: string): TextEdit {
  const cst = rel.$cstNode;
  const targetCst = rel.target?.$cstNode;
  if (cst && targetCst) {
    let index = 0;
    for (const leaf of collectLeaves(cst)) {
      if (leaf.offset < targetCst.end) continue;
      if (leaf.text === '{' || leaf.text.startsWith('#')) break;
      if (!leaf.text.startsWith("'") && !leaf.text.startsWith('"')) continue;
      if (index === position) return { offset: leaf.offset, end: leaf.end, newText: `'${escapeString(value)}'` };
      index++;
    }
  }
  throw new Error('internal: string written after the relation target not found');
}

/**
 * Set a `description` / `technology` body string property on a Relation.  A
 * body may declare the property more than once and LikeC4 reads the last
 * declaration, so every declaration is rewritten; when there is none, the
 * property is inserted.  Mirrors `buildBodyPropEdits` for elements.  Caller
 * guarantees that the relation has a body (no-body case is handled by the
 * combined insert path).
 */
function buildRelationStringPropEdits(
  rel: RelationAstNode,
  key: 'description' | 'technology',
  value: string,
  inserts: BodyInsertions,
): TextEdit[] {
  const newValueText = `'${escapeString(value)}'`;
  const replacements: TextEdit[] = [];
  for (const prop of rel.body?.props ?? []) {
    if (prop.$type !== 'RelationStringProperty' || prop.key !== key) continue;
    const v = prop.value;
    const valueCst =
      v && typeof v === 'object' ? (v as { $cstNode?: { offset: number; end: number } }).$cstNode : undefined;
    if (valueCst) replacements.push({ offset: valueCst.offset, end: valueCst.end, newText: newValueText });
  }
  if (replacements.length > 0) return replacements;
  if (!rel.body?.$cstNode) {
    throw new Error(
      'internal: buildRelationStringPropEdits called without body — caller should have routed via the combined-insert path',
    );
  }
  inserts.addProperty(`${inserts.innerIndent}${key} ${newValueText}\n`);
  return [];
}

/**
 * Replace the tags written on the relation line (`a -> b 'x' #t1 #t2`) with
 * `tags`, in place; an empty array removes them together with the blanks
 * before them.
 */
function buildReplaceHeaderTagsEdit(
  tagsCst: { offset: number; end: number },
  fullText: string,
  tags: string[],
): TextEdit {
  if (tags.length > 0) {
    return { offset: tagsCst.offset, end: tagsCst.end, newText: tags.map((t) => formatTag(t)).join(' ') };
  }
  let start = tagsCst.offset;
  while (start > 0 && (fullText[start - 1] === ' ' || fullText[start - 1] === '\t')) start--;
  return { offset: start, end: tagsCst.end, newText: '' };
}

/**
 * Replace (or insert / clear) the tags block in the body of a Relation.
 * Tags live on `body.tags` as a single `Tags` node.  Empty array clears all
 * tags; new tags are handed to `inserts` to open the body.
 */
function buildRelationReplaceTagsEdit(
  rel: RelationAstNode,
  fullText: string,
  tags: string[],
  inserts: BodyInsertions,
): TextEdit | null {
  const existingTagsCst = rel.body?.tags?.$cstNode;

  if (!existingTagsCst) {
    if (tags.length === 0) return null;
    inserts.prepend(tags.map((t) => `${inserts.innerIndent}${formatTag(t)}\n`).join(''));
    return null;
  }

  if (tags.length === 0) {
    const { offset, end, newText } = buildRemovalEdit(
      fullText,
      existingTagsCst.offset,
      existingTagsCst.end,
    );
    return { offset, end, newText };
  }
  return buildReplaceTagsInPlaceEdit(fullText, existingTagsCst, tags);
}

/**
 * Build the edits that merge per-field updates into the relation's
 * `style { ... }` block (the first one, which LikeC4 reads) in place, or
 * insert a fresh one.  Keys not in the patch, comments, separators and
 * indentation in the block are preserved (see {@link buildMergeStyleEdits}).
 */
function buildReplaceRelationStyleEdits(
  rel: RelationAstNode,
  fullText: string,
  indent: string,
  patch: RelationshipStyle,
  inserts: BodyInsertions,
): TextEdit[] {
  const existingStyle = rel.body?.props?.find((p) => p.$type === 'RelationStyleProperty');
  if (!existingStyle?.$cstNode) {
    const edit = buildInsertBodySnippet(
      rel as BodyOwnerNode,
      indent,
      (ii) => generateRelationshipStyleBlock(patch, ii),
      inserts,
    );
    return edit ? [edit] : [];
  }
  return buildMergeStyleEdits(fullText, existingStyle, relationshipStyleEntries(patch), indent + '    ');
}

/**
 * When a relation has no body and the patch contains body-targeting fields,
 * build ONE combined edit that creates the body and inserts every patched
 * field at once.  Avoids the latent multi-edit bug where two body-creation
 * edits could each emit `' { ... }'` next to one another.
 */
function buildCombinedBodyInsert(
  rel: RelationAstNode,
  indent: string,
  patch: UpdateRelationshipPatch,
): TextEdit | null {
  const cst = rel.$cstNode;
  if (!cst) return null;
  const innerIndent = indent + '  ';

  let body = '';
  // Tags first (grammar requires tags before string props).
  if (patch.tags && patch.tags.length > 0) {
    body += patch.tags.map((t) => `${innerIndent}${formatTag(t)}\n`).join('');
  }
  if (patch.description !== undefined) {
    body += `${innerIndent}description '${escapeString(patch.description)}'\n`;
  }
  if (patch.technology !== undefined) {
    body += `${innerIndent}technology '${escapeString(patch.technology)}'\n`;
  }
  if (patch.links && patch.links.length > 0) {
    for (const lnk of patch.links) {
      const escapedLabel = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
      body += `${innerIndent}link ${formatLinkUrl(lnk.url)}${escapedLabel}\n`;
    }
  }
  if (patch.style && Object.keys(patch.style).length > 0) {
    body += generateRelationshipStyleBlock(patch.style, innerIndent);
  }
  if (patch.metadata) {
    const upserts = collectMetadataUpserts(patch.metadata);
    if (Object.keys(upserts).length > 0) {
      body += generateMetadataBlock(upserts, innerIndent);
    }
  }

  if (body === '') return null;

  const insertion = ' {\n' + body + `${indent}}`;
  return { offset: cst.end, end: cst.end, newText: insertion };
}

