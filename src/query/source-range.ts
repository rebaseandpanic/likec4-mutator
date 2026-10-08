import type { SourceRange } from './types.js';

/** Source range of a CST node; all zero when the node has none. */
export function toSourceRange(
  cst: { offset: number; end: number; range?: { start?: { line?: number; character?: number } } } | undefined,
): SourceRange {
  return cst
    ? {
        offset: cst.offset,
        end: cst.end,
        line: cst.range?.start?.line ?? 0,
        column: cst.range?.start?.character ?? 0,
      }
    : { offset: 0, end: 0, line: 0, column: 0 };
}
