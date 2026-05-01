/**
 * Text-edit operations that target model relationships.
 */
import type { ParsedDocument } from '../parser/types.js';
import { resolveFqnRef } from '../query/fqn.js';
import type { TextEdit } from './text-edit.js';
import { getNodeIndent } from './indent.js';
import {
  generateRelationship,
  generateRelationshipStyleBlock,
  generateMetadataBlock,
  escapeString,
  type RelationshipStyle,
} from './codegen.js';
import {
  findClosingBrace,
  insertionPointBeforeBrace,
  expandRangeToConsumeSurroundingNewlines,
  buildInsertBodySnippet,
  buildReplaceLinksEdit,
  collectAllRelations,
  collectLeaves,
  type BodyOwnerNode,
} from './cst-helpers.js';
import {
  buildReplaceMetadataEditOnNode,
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

  const modelCst = model.$cstNode;
  const closingBrace = findClosingBrace(fullText, modelCst.offset, modelCst.end);
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
 * target FQNs (or local names).  Only the first matching relationship is removed.
 *
 * @param doc    - Parsed document
 * @param source - Source FQN (or local name) to match
 * @param target - Target FQN (or local name) to match
 * @returns TextEdit that deletes the relationship line
 */
export function removeRelationshipEdit(
  doc: ParsedDocument,
  source: string,
  target: string,
): TextEdit {
  const { ast, fullText } = doc;

  // Collect all relations across every model block.
  const all = collectAllRelations(ast as { models?: Array<{ elements?: unknown[] }> });
  const matched = all.find(({ node, parentFqn }) => {
    const r = node as RelationAstNode;
    const relSource = r.source ? resolveFqnRef(r.source) : parentFqn;
    const relTarget = resolveFqnRef(r.target);
    return relSource === source && relTarget === target;
  });

  if (!matched) {
    throw new Error(`Relationship '${source} -> ${target}' not found`);
  }

  const rel = matched.node as RelationAstNode;
  const cst = rel.$cstNode;
  if (!cst) throw new Error(`Relationship '${source} -> ${target}' has no CST node`);

  // Expand range to include leading newline + indent and trailing newline
  let offset = cst.offset;
  let end = cst.end;

  const prevNewline = fullText.lastIndexOf('\n', offset - 1);
  if (prevNewline !== -1) {
    const between = fullText.substring(prevNewline + 1, offset);
    if (/^\s*$/.test(between)) {
      offset = prevNewline;
    }
  }

  if (fullText[end] === '\n') end += 1;

  return { offset, end, newText: '' };
}

// ---------------------------------------------------------------------------
// updateRelationship
// ---------------------------------------------------------------------------

/** Match clause used to locate a relationship to update. */
export interface UpdateRelationshipMatcher {
  /** Source FQN (or local name) — required */
  source: string;
  /** Target FQN (or local name) — required */
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

  // Locate the matching relation using collectAllRelations.
  const matched = matchRelations(ast, matcher);

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

  // For body-targeting fields, when the relation has no body and we have
  // multiple body-touching patch fields, we want to insert ONE combined body
  // block (not several conflicting body-creation snippets).  The strategy:
  //   - If body exists, build an edit per field as usual.
  //   - If body is absent, build a single combined snippet and emit one edit
  //     that creates the body and includes all fields.
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
    const e = buildRelationStringPropEdit(rel, fullText, indent, 'description', patch.description);
    if (e) edits.push(e);
  }
  if (patch.technology !== undefined) {
    const e = buildRelationStringPropEdit(rel, fullText, indent, 'technology', patch.technology);
    if (e) edits.push(e);
  }
  if (patch.tags !== undefined) {
    const e = buildRelationReplaceTagsEdit(rel, fullText, indent, patch.tags);
    if (e) edits.push(e);
  }
  if (patch.links !== undefined) {
    const e = buildReplaceLinksEdit(rel as BodyOwnerNode, fullText, indent, patch.links);
    if (e) edits.push(e);
  }
  if (patch.metadata !== undefined && Object.keys(patch.metadata).length > 0) {
    const e = buildReplaceMetadataEditOnNode(
      rel as BodyOwnerNode,
      fullText,
      indent,
      patch.metadata,
    );
    if (e) edits.push(e);
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
  kind?: { $refText?: string };
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
  _parentFqn?: string;
}

export function matchRelations(
  ast: unknown,
  matcher: UpdateRelationshipMatcher,
): RelationAstNode[] {
  const all = collectAllRelations(ast as { models?: Array<{ elements?: unknown[] }> });
  const results: RelationAstNode[] = [];
  for (const { node, parentFqn } of all) {
    const r = node as RelationAstNode;
    const relSource = r.source ? resolveFqnRef(r.source) : parentFqn;
    const relTarget = resolveFqnRef(r.target);
    if (relSource !== matcher.source) continue;
    if (relTarget !== matcher.target) continue;
    if (matcher.matchKind !== undefined && r.kind?.$refText !== matcher.matchKind) continue;
    if (matcher.matchTitle !== undefined && r.title !== matcher.matchTitle) continue;
    results.push(r);
  }
  return results;
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
      const k = m.kind?.$refText ?? 'null';
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

/**
 * Replace (or insert) a `description` / `technology` body string property on
 * a Relation.  Mirrors `buildBodyPropEdit` for elements.  Caller guarantees
 * that the relation has a body (no-body case is handled by the combined
 * insert path).
 */
function buildRelationStringPropEdit(
  rel: RelationAstNode,
  fullText: string,
  indent: string,
  key: 'description' | 'technology',
  value: string,
): TextEdit | null {
  const newValueText = `'${escapeString(value)}'`;
  const existingProp = rel.body?.props?.find(
    (p) => p.$type === 'RelationStringProperty' && p.key === key,
  );
  if (existingProp) {
    const v = existingProp.value;
    const valueCst = v && typeof v === 'object' && v !== null
      ? (v as { $cstNode?: { offset: number; end: number } }).$cstNode
      : undefined;
    if (valueCst) {
      return { offset: valueCst.offset, end: valueCst.end, newText: newValueText };
    }
  }
  if (!rel.body?.$cstNode) {
    throw new Error(
      'internal: buildRelationStringPropEdit called without body — caller should have routed via the combined-insert path',
    );
  }
  const innerIndent = indent + '  ';
  const bodyCst = rel.body.$cstNode;
  const closingBrace = findClosingBrace(fullText, bodyCst.offset, bodyCst.end);
  return {
    offset: closingBrace,
    end: closingBrace,
    newText: `${innerIndent}${key} ${newValueText}\n`,
  };
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
  const cleaned = tags.map((t) => (t.startsWith('#') ? t.slice(1) : t));
  const tagLines = cleaned.map((t) => `${innerIndent}#${t}`).join('\n');

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

  const { offset, end } = expandRangeToConsumeSurroundingNewlines(
    fullText,
    existingTagsCst.offset,
    existingTagsCst.end,
  );
  if (tags.length === 0) {
    return { offset, end, newText: '' };
  }
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
    const cleaned = patch.tags.map((t) => (t.startsWith('#') ? t.slice(1) : t));
    body += cleaned.map((t) => `${innerIndent}#${t}\n`).join('');
  }
  if (patch.description !== undefined) {
    body += `${innerIndent}description '${escapeString(patch.description)}'\n`;
  }
  if (patch.technology !== undefined) {
    body += `${innerIndent}technology '${escapeString(patch.technology)}'\n`;
  }
  if (patch.links && patch.links.length > 0) {
    const sanitizeUrl = (u: string) => u.replace(/[\n\r']/g, '');
    for (const lnk of patch.links) {
      const escapedLabel = lnk.label ? ` '${escapeString(lnk.label)}'` : '';
      body += `${innerIndent}link ${sanitizeUrl(lnk.url)}${escapedLabel}\n`;
    }
  }
  if (patch.style && Object.keys(patch.style).length > 0) {
    body += generateRelationshipStyleBlock(patch.style, innerIndent);
  }
  if (patch.metadata) {
    const upserts: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(patch.metadata)) {
      if (v !== null) upserts[k] = v;
    }
    if (Object.keys(upserts).length > 0) {
      body += generateMetadataBlock(upserts, innerIndent);
    }
  }

  if (body === '') return null;

  const insertion = ' {\n' + body + `${indent}}`;
  return { offset: cst.end, end: cst.end, newText: insertion };
}

