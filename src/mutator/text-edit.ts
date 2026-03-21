/**
 * Core primitive for text-level mutations.
 *
 * A TextEdit describes a replacement of a byte range in the source string.
 * Edits must not overlap; applyEdits will sort them in reverse offset order
 * so that applying each edit does not shift the positions of earlier ones.
 */
export interface TextEdit {
  /** Inclusive start offset (0-based) */
  offset: number;
  /** Exclusive end offset */
  end: number;
  /** Replacement text (empty string = deletion) */
  newText: string;
}

/**
 * Apply a list of non-overlapping TextEdits to a source string.
 * Edits are sorted in descending offset order before application so that
 * later offsets are patched first and prior offsets remain stable.
 *
 * @param source  - Original source text
 * @param edits   - List of edits to apply (must not overlap)
 * @returns Updated source string
 */
export function applyEdits(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = source;
  for (const { offset, end, newText } of sorted) {
    result = result.substring(0, offset) + newText + result.substring(end);
  }
  return result;
}
