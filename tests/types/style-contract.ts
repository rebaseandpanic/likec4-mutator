/**
 * Compile-time contract between the public element style type and the test
 * oracle (checked by `npm run lint`, never run): the library's
 * `ElementStyle` and `RelationshipStyle` must be assignable to the shapes
 * `expectElementStylesAgreeWithLikeC4` and `expectRelationshipsAgreeWithLikeC4`
 * read, so that the oracle compares every field the library publishes.
 */
import type { ElementStyle, RelationshipStyle } from '../../src/index.js';
import type { ReportedElementStyle, ReportedRelationshipStyle } from '../helpers/likec4-model.js';

/** Compiles only when `A` is assignable to `B`. */
type Assignable<A extends B, B> = A;

export type StyleContract = [Assignable<ElementStyle, ReportedElementStyle>, Assignable<RelationshipStyle, ReportedRelationshipStyle>];
