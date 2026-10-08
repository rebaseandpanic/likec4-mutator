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
  generateMetadataBlock,
  escapeString,
  formatLinkUrl,
  formatTag,
  type RelationshipStyle,
} from './codegen.js';
import {
  findClosingBraceOffset,
  insertionPointBeforeBrace,
  expandRangeToConsumeSurroundingNewlines,
  buildRemovalEdit,
  buildInsertBodySnippet,
  buildReplaceLinksEdit,
  collectLeaves,
  type BodyOwnerNode,
} from './cst-helpers.js';
import {
  buildReplaceMetadataEditOnNode,
  collectMetadataUpserts,
  type MetadataPatch,
} from './metadata-ops.js';

/**
 * Build a TextEdit that inserts a new relationship at model level,
 * appended just before the model block's closing `}`.
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

  const closingBrace = findClosingBraceOffset(model.$cstNode);
  const indent = '  ';

  const snippet = generateRelationship({
    indent,
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
  const insertAt = insertionPointBeforeBrace(fullText, closingBrace);
  const braceLine = fullText.substring(insertAt, closingBrace + 1);
  const newText = '\n' + snippet + braceLine;

  return { offset: insertAt, end: closingBrace + 1, newText };
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

/** Patch payload for {@link updateRelationshipEdit}. */
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
 * Build TextEdits that update an existing relationship in `doc`.
 *
 * The matcher selects exactly one relation: source/target FQNs are compared
 * after FQN resolution (so `app.api -> app.db` matches the implicit-source
 * relation written `api -> db` inside `app { ... }`).  When more than one
 * relation matches, `matchKind` / `matchTitle` may be supplied to disambiguate.
 *
 * The patch is empty-checked up-front: when no update field is specified the
 * function throws `nothing to update` so the caller sees the error before any
 * source text is parsed.
 *
 * @returns A list of TextEdits — empty when no patch field actually produces a
 *          change (e.g. tags === [] for a relation that has no tags).
 */
export function updateRelationshipEdit(
  doc: ParsedDocument,
  matcher: UpdateRelationshipMatcher,
  patch: UpdateRelationshipPatch,
  workspace?: WorkspaceIndex,
): TextEdit[] {
  // Empty-patch guard.
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

  // Validate metadata empty-array up-front.
  if (patch.metadata) {
    for (const [k, v] of Object.entries(patch.metadata)) {
      if (Array.isArray(v) && v.length === 0) {
        throw new Error(
          `Invalid metadata patch for key '${k}': empty array not allowed by LikeC4 grammar`,
        );
      }
    }
  }

  const { ast, fullText } = doc;

  // Locate the matching relation.
  const matched = matchRelations(ast, matcher, workspace);

  // Disambiguate.
  if (matched.length === 0) {
    throw new Error(formatNotFoundError(matcher));
  }
  if (matched.length > 1) {
    throw new Error(formatAmbiguousError(matched, matcher));
  }

  const rel = matched[0] as RelationAstNode;
  const indent = getNodeIndent(rel, fullText);
  const edits: TextEdit[] = [];

  // label — replace inline title token, or insert when missing.
  if (patch.label !== undefined) {
    const labelEdit = buildLabelEdit(rel, patch.label);
    if (labelEdit) edits.push(labelEdit);
  }

  // Description and technology written after the title are what LikeC4
  // reads (`parseBaseProps` overrides): a technology whenever written, a
  // description when non-empty.  They are replaced there.  An empty
  // description no longer overrides the body, so it goes into the body too.
  if (patch.technology !== undefined && rel.technology !== undefined) {
    edits.push(buildInlineStringEdit(rel, INLINE_TECHNOLOGY, patch.technology));
    patch = { ...patch, technology: undefined };
  }
  if (patch.description !== undefined && rel.description) {
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

  // Body exists — emit per-field edits.
  if (patch.description !== undefined) {
    edits.push(...buildRelationStringPropEdits(rel, indent, 'description', patch.description));
  }
  if (patch.technology !== undefined) {
    edits.push(...buildRelationStringPropEdits(rel, indent, 'technology', patch.technology));
  }
  if (patch.tags !== undefined || clearBodyTags) {
    const e = buildRelationReplaceTagsEdit(rel, fullText, indent, patch.tags ?? []);
    if (e) edits.push(e);
  }
  if (patch.links !== undefined) {
    edits.push(...buildReplaceLinksEdit(rel as BodyOwnerNode, fullText, indent, patch.links));
  }
  if (patch.metadata !== undefined && Object.keys(patch.metadata).length > 0) {
    edits.push(...buildReplaceMetadataEditOnNode(rel as BodyOwnerNode, fullText, indent, patch.metadata));
  }
  if (patch.style !== undefined && Object.keys(patch.style).length > 0) {
    const e = buildReplaceRelationStyleEdit(rel, fullText, indent, patch.style);
    if (e) edits.push(e);
  }

  return edits;
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

interface RelationAstNode {
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
 * reference text (`api -> db`) still find it.  `matchKind` / `matchTitle`
 * filter both lists.
 *
 * @param workspace - Index of all documents of the project (defaults to an
 *                    index of `ast` alone)
 */
export function findMatchingRelations(
  ast: unknown,
  matcher: UpdateRelationshipMatcher,
  workspace?: WorkspaceIndex,
): { byFqn: ResolvedRelation[]; byText: ResolvedRelation[] } {
  const docAst = ast as { models?: Array<{ elements?: unknown[] }> };
  const resolved = resolveRelations(docAst, workspace ?? new WorkspaceIndex([docAst]));
  const byFqn: ResolvedRelation[] = [];
  const byText: ResolvedRelation[] = [];
  for (const rel of resolved) {
    const r = rel.node as RelationAstNode;
    if (matcher.matchKind !== undefined && relationKind(r) !== matcher.matchKind) continue;
    if (matcher.matchTitle !== undefined && r.title !== matcher.matchTitle) continue;
    if (rel.sourceFqn === matcher.source && rel.targetFqn === matcher.target) {
      byFqn.push(rel);
    } else if (rel.sourceText === matcher.source && rel.targetText === matcher.target) {
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

export function formatNotFoundError(matcher: UpdateRelationshipMatcher): string {
  const clauses: string[] = [`source=${matcher.source}`, `target=${matcher.target}`];
  if (matcher.matchKind !== undefined) clauses.push(`kind=${matcher.matchKind}`);
  if (matcher.matchTitle !== undefined) clauses.push(`title='${matcher.matchTitle}'`);
  return `Relationship not found: ${clauses.map((c, i) => (i < 2 ? c : `[${c}]`)).join(' ')}`;
}

function formatAmbiguousError(
  matched: RelationAstNode[],
  _matcher: UpdateRelationshipMatcher,
): string {
  const found = matched
    .map((m) => {
      const k = relationKind(m) ?? 'null';
      const t = m.title === undefined ? 'null' : `'${m.title}'`;
      return `[kind=${k} title=${t}]`;
    })
    .join(', ');
  return `Multiple relationships match (${matched.length} found). Specify matchKind and/or matchTitle to disambiguate. Found: ${found}`;
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
  indent: string,
  key: 'description' | 'technology',
  value: string,
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
  const innerIndent = indent + '  ';
  const closingBrace = findClosingBraceOffset(rel.body.$cstNode);
  return [
    {
      offset: closingBrace,
      end: closingBrace,
      newText: `${innerIndent}${key} ${newValueText}\n`,
    },
  ];
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
 * Replace (or insert / clear) the tags block on a Relation.  Tags live on
 * `body.tags` as a single `Tags` node.  Empty array clears all tags.
 */
function buildRelationReplaceTagsEdit(
  rel: RelationAstNode,
  fullText: string,
  indent: string,
  tags: string[],
): TextEdit | null {
  const innerIndent = indent + '  ';
  const tagLines = tags.map((t) => `${innerIndent}${formatTag(t)}`).join('\n');

  const existingTagsCst = rel.body?.tags?.$cstNode;

  if (!existingTagsCst) {
    if (tags.length === 0) return null;
    if (!rel.body?.$cstNode) {
      throw new Error(
        'internal: buildRelationReplaceTagsEdit called without body — caller should have routed via the combined-insert path',
      );
    }
    const bodyCst = rel.body.$cstNode;
    const openingBrace = bodyCst.offset;
    if (fullText[openingBrace] !== '{') {
      const targetText = (rel.target as { value?: { $refText?: string } } | undefined)?.value
        ?.$refText;
      const ctx = targetText ? ` (relation -> ${targetText})` : '';
      throw new Error(`Expected opening brace at relation body CST offset${ctx}`);
    }
    return { offset: openingBrace + 1, end: openingBrace + 1, newText: '\n' + tagLines + '\n' };
  }

  if (tags.length === 0) {
    const { offset, end, newText } = buildRemovalEdit(
      fullText,
      existingTagsCst.offset,
      existingTagsCst.end,
    );
    return { offset, end, newText };
  }
  const { offset, end } = expandRangeToConsumeSurroundingNewlines(
    fullText,
    existingTagsCst.offset,
    existingTagsCst.end,
  );
  return { offset, end, newText: '\n' + tagLines + '\n' };
}

/**
 * Build a TextEdit that merges per-field updates into an existing relation
 * `style { ... }` block or inserts a fresh one.  Keys not in the patch are
 * preserved.
 */
function buildReplaceRelationStyleEdit(
  rel: RelationAstNode,
  fullText: string,
  indent: string,
  patch: RelationshipStyle,
): TextEdit | null {
  const innerIndent = indent + '  ';
  const existingStyle = rel.body?.props?.find((p) => p.$type === 'RelationStyleProperty');
  if (!existingStyle?.$cstNode) {
    return buildInsertBodySnippet(rel as BodyOwnerNode, fullText, indent, (ii) =>
      generateRelationshipStyleBlock(patch, ii),
    );
  }

  const existing = readRelationStyleProps(existingStyle, fullText);
  const merged: RelationshipStyle = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (merged as Record<string, unknown>)[k] = v;
  }

  const cst = existingStyle.$cstNode;
  const { offset, end } = expandRangeToConsumeSurroundingNewlines(fullText, cst.offset, cst.end);
  return {
    offset,
    end,
    newText: '\n' + generateRelationshipStyleBlock(merged, innerIndent),
  };
}

/**
 * Read existing relationship-style key/value pairs.  Keyword-typed values
 * (where AST.value is undefined) are recovered from raw CST text as a
 * trimmed substring after the key token.
 */
function readRelationStyleProps(
  styleProp: { props?: Array<unknown> },
  fullText: string,
): RelationshipStyle {
  const out: Record<string, unknown> = {};
  for (const sp of styleProp.props ?? []) {
    const p = sp as {
      key?: string;
      name?: string;
      value?: unknown;
      $cstNode?: { offset: number; end: number };
    };
    const key = p.key ?? p.name;
    if (!key) continue;
    let value: unknown;
    const rawValue = p.value;
    if (rawValue && typeof rawValue === 'object') {
      const obj = rawValue as { text?: unknown; value?: unknown };
      value = obj.text ?? obj.value;
    } else if (rawValue !== undefined && rawValue !== null) {
      value = rawValue;
    }
    if (value === undefined || value === null) {
      const cst = p.$cstNode;
      if (cst) {
        const text = fullText.substring(cst.offset, cst.end).trim();
        const space = text.indexOf(' ');
        if (space !== -1) value = text.substring(space + 1).trim();
      }
    }
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out as RelationshipStyle;
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

