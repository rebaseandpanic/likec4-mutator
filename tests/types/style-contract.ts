/**
 * Compile-time contract between the public element style type and the test
 * oracle (checked by `npm run lint`, never run): the library's
 * `ElementStyle` must be assignable to the shape
 * `expectElementStylesAgreeWithLikeC4` reads, so that the oracle compares
 * every field the library publishes.
 */
import type { ElementStyle } from '../../src/index.js';
import type { ReportedElementStyle } from '../helpers/likec4-model.js';

/** Compiles only when `A` is assignable to `B`. */
type Assignable<A extends B, B> = A;

export type StyleContract = [Assignable<ElementStyle, ReportedElementStyle>];
