/**
 * Text normalization LikeC4 1.59.4 applies when it builds its model from
 * string values (language-server `removeIndent` / `toSingleLine`).  Used for
 * effective values only; declarative views keep strings as written.
 */
import { dedent } from 'strip-indent';

/**
 * LikeC4 `removeIndent` for a plain string: drop leading and trailing blank
 * lines, remove the common indentation, then trim.
 */
export function removeIndent(text: string): string {
  return dedent(text).trim();
}

/** LikeC4 `toSingleLine` for a plain string: {@link removeIndent}, then lines joined with a space. */
export function toSingleLine(text: string): string {
  return removeIndent(text).split('\n').join(' ');
}
