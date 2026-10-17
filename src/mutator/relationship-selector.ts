/**
 * The relationship selector of `updateRelationship` and `removeRelationship`
 * (lc4m-15.30, D70, D81, D87, D102, D106): one rule that addresses exactly
 * one model relationship of the workspace, or rejects.
 *
 *  - **Fields.**  `source` and `target` (absolute FQNs, else the reference
 *    text as written; a bidirectional relationship matches them in either
 *    order), `matchKind` (the kind as written), `matchTitle` (the raw inline
 *    title, as `updateRelationship` has always matched it),
 *    `matchBidirectional`, and `position`: the start of the relationship's
 *    declaration as `{ file, line, column }`, 1-based, the form every
 *    ambiguity error prints.
 *  - **Outcome.**  Exactly one match is selected.  None is an
 *    `InvalidWriteError` on `position` when a position was given, else on
 *    `source`.  More than one is a {@link RelationshipAmbiguityError} on
 *    `source` listing every candidate, so a caller can pass one candidate's
 *    position back.
 *
 * Deployment relationships keep their own selector (D105).
 */
import type { ParsedDocument } from '../parser/types.js';
import { relationKind } from '../query/relation-node.js';
import { relationIdentity } from '../query/relation-extends.js';
import type { ResolvedRelation, WorkspaceIndex } from '../query/workspace-index.js';
import { findMatchingRelations, type UpdateRelationshipMatcher } from './relationship-ops.js';
import { InvalidWriteError } from './write-checks.js';

/** The start of a relationship's declaration, 1-based, as ambiguity errors print it. */
export interface RelationshipPosition {
  file: string;
  /** 1-based line */
  line: number;
  /** 1-based column */
  column: number;
}

/**
 * Selects one model relationship: the matcher of `updateRelationship`, plus
 * `matchBidirectional` and a `position` for relationships no other field
 * tells apart.
 */
export type RelationshipSelector = UpdateRelationshipMatcher & {
  /** Only match bidirectional (`true`) or one-way (`false`) relationships */
  matchBidirectional?: boolean;
  /** Only match the relationship whose declaration starts here (a candidate's position, passed back unchanged) */
  position?: RelationshipPosition;
};

/** One relationship a selector matched, as an ambiguity error lists it. */
export interface RelationshipCandidate extends RelationshipPosition {
  /** The kind as written; absent when none */
  kind?: string;
  /** The inline title as written; absent when none */
  title?: string;
  /** The title LikeC4 reads, when it differs from the written one: the kind's title for an untitled relationship */
  effectiveTitle?: string;
  bidirectional: boolean;
}

/**
 * More than one relationship matches a selector.  `candidates` lists them in
 * LikeC4's document order, then source order; passing one candidate's
 * position back (with the same other fields) selects it.
 */
export class RelationshipAmbiguityError extends InvalidWriteError {
  readonly candidates: RelationshipCandidate[];

  constructor(field: string, candidates: RelationshipCandidate[]) {
    super(
      field,
      `${candidates.length} relationships match; select one by its position: ` +
        candidates.map((c) => `${c.file}:${c.line}:${c.column}${describe(c)}`).join(', '),
    );
    this.name = 'RelationshipAmbiguityError';
    this.candidates = candidates;
  }
}

/** The relationship a selector addresses. */
export interface SelectedRelationship {
  file: string;
  relation: ResolvedRelation;
}

/** A relationship node as far as the selector reads it. */
interface RelationNode {
  title?: string;
  isBidirectional?: boolean;
  $cstNode?: { offset: number; range: { start: { line: number; character: number } } };
}

/**
 * Select the one relationship `selector` addresses among `documents` (in
 * LikeC4's document order).  Endpoints match by absolute FQN; only when no
 * relationship of the workspace matches that way are they compared with
 * the reference text as written.
 *
 * @throws {InvalidWriteError} on `position` (a position was given) or
 *   `source` when nothing matches
 * @throws {RelationshipAmbiguityError} on `source` when more than one matches
 */
export function selectRelationship(
  documents: ReadonlyArray<{ file: string; doc: ParsedDocument }>,
  selector: RelationshipSelector,
  workspace: WorkspaceIndex,
): SelectedRelationship {
  const byFqn: SelectedRelationship[] = [];
  const byText: SelectedRelationship[] = [];
  for (const { file, doc } of documents) {
    const found = findMatchingRelations(doc.ast, selector, workspace);
    byFqn.push(...found.byFqn.map((relation) => ({ file, relation })));
    byText.push(...found.byText.map((relation) => ({ file, relation })));
  }
  let matches = byFqn.length > 0 ? byFqn : byText;
  const { position } = selector;
  if (position !== undefined) {
    matches = matches.filter((match) => {
      const at = positionOf(match);
      return at.file === position.file && at.line === position.line && at.column === position.column;
    });
  }
  if (matches.length === 0) {
    throw new InvalidWriteError(position !== undefined ? 'position' : 'source', notFound(selector));
  }
  if (matches.length > 1) {
    throw new RelationshipAmbiguityError('source', matches.map((match) => candidateOf(match, workspace)));
  }
  return matches[0]!;
}

/** The 1-based start of the declaration of a selected relationship. */
export function positionOf({ file, relation }: SelectedRelationship): RelationshipPosition {
  const start = (relation.node as RelationNode).$cstNode?.range.start;
  if (!start) throw new Error(`Internal error: a relationship in '${file}' has no position`);
  return { file, line: start.line + 1, column: start.character + 1 };
}

function candidateOf(match: SelectedRelationship, workspace: WorkspaceIndex): RelationshipCandidate {
  const node = match.relation.node as RelationNode & Parameters<typeof relationKind>[0];
  const kind = relationKind(node);
  const title = node.title;
  const effective = workspace.effectiveIdentity(relationIdentity(match.relation)).title;
  return {
    ...positionOf(match),
    ...(kind !== undefined && { kind }),
    ...(title !== undefined && { title }),
    ...((title ?? '') === '' && effective !== '' && { effectiveTitle: effective }),
    bidirectional: node.isBidirectional === true,
  };
}

/** The kind, title and direction of a candidate, for the message. */
function describe(candidate: RelationshipCandidate): string {
  const parts = [
    candidate.kind !== undefined ? `kind ${candidate.kind}` : undefined,
    candidate.title !== undefined ? `title '${candidate.title}'` : undefined,
    candidate.effectiveTitle !== undefined ? `effective title '${candidate.effectiveTitle}'` : undefined,
    candidate.bidirectional ? 'bidirectional' : undefined,
  ].filter((part) => part !== undefined);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function notFound(selector: RelationshipSelector): string {
  const clauses: string[] = [`source=${selector.source}`, `target=${selector.target}`];
  if (selector.matchKind !== undefined) clauses.push(`[kind=${selector.matchKind}]`);
  if (selector.matchTitle !== undefined) clauses.push(`[title='${selector.matchTitle}']`);
  if (selector.matchBidirectional !== undefined) clauses.push(`[bidirectional=${selector.matchBidirectional}]`);
  if (selector.position !== undefined) {
    clauses.push(`[position=${selector.position.file}:${selector.position.line}:${selector.position.column}]`);
  }
  return `Relationship not found: ${clauses.join(' ')}`;
}
