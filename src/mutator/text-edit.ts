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
 * Edits are applied in descending offset order so that later offsets are
 * patched first and prior offsets remain stable.
 *
 * Several edits may start at the same offset when at most one of them
 * replaces text: the inserted texts (zero-width edits) come first, in the
 * order of the list, then the replacement.  A zero-width edit at the end of
 * a replaced range lands after the replacement.
 *
 * @param source  - Original source text
 * @param edits   - List of edits to apply (must not overlap)
 * @returns Updated source string
 */
export function applyEdits(source: string, edits: TextEdit[]): string {
  const indexed = edits.map((e, i) => ({ ...e, _idx: i }));
  // Descending offset; at the same offset the replacement is applied first
  // and the insertions after it in reverse list order, so that each
  // insertion lands before the text of the ones applied earlier.
  const sorted = indexed.sort(
    (a, b) => b.offset - a.offset || b.end - a.end || b._idx - a._idx,
  );
  let result = source;
  for (const { offset, end, newText } of sorted) {
    result = result.substring(0, offset) + newText + result.substring(end);
  }
  return result;
}
