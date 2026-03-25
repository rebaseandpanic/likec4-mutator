import { describe, it, expect } from 'vitest';
import { applyEdits, type TextEdit } from '../../src/mutator/text-edit.js';

describe('applyEdits', () => {
  it('should apply a single insertion', () => {
    const source = 'Hello World';
    const edits: TextEdit[] = [{ offset: 5, end: 5, newText: ',' }];
    expect(applyEdits(source, edits)).toBe('Hello, World');
  });

  it('should apply a single replacement', () => {
    const source = 'Hello World';
    const edits: TextEdit[] = [{ offset: 6, end: 11, newText: 'LikeC4' }];
    expect(applyEdits(source, edits)).toBe('Hello LikeC4');
  });

  it('should apply a single deletion', () => {
    const source = 'Hello World';
    const edits: TextEdit[] = [{ offset: 5, end: 6, newText: '' }];
    expect(applyEdits(source, edits)).toBe('HelloWorld');
  });

  it('should apply multiple non-overlapping edits in reverse order', () => {
    const source = 'aaa bbb ccc';
    const edits: TextEdit[] = [
      { offset: 0, end: 3, newText: 'AAA' },
      { offset: 8, end: 11, newText: 'CCC' },
    ];
    expect(applyEdits(source, edits)).toBe('AAA bbb CCC');
  });

  it('should not mutate the original edits array order', () => {
    const source = 'abcdef';
    const edits: TextEdit[] = [
      { offset: 0, end: 2, newText: 'XX' },
      { offset: 4, end: 6, newText: 'YY' },
    ];
    const original = [...edits];
    applyEdits(source, edits);
    expect(edits[0]).toEqual(original[0]);
    expect(edits[1]).toEqual(original[1]);
  });

  it('should handle insertion at start', () => {
    const source = 'world';
    const edits: TextEdit[] = [{ offset: 0, end: 0, newText: 'hello ' }];
    expect(applyEdits(source, edits)).toBe('hello world');
  });

  it('should handle insertion at end', () => {
    const source = 'hello';
    const edits: TextEdit[] = [{ offset: 5, end: 5, newText: ' world' }];
    expect(applyEdits(source, edits)).toBe('hello world');
  });

  it('should return original string when edits list is empty', () => {
    const source = 'unchanged';
    expect(applyEdits(source, [])).toBe('unchanged');
  });

  it('should handle multiline source with newline insertion', () => {
    const source = 'line1\nline3';
    const edits: TextEdit[] = [{ offset: 6, end: 6, newText: 'line2\n' }];
    expect(applyEdits(source, edits)).toBe('line1\nline2\nline3');
  });

  it('should preserve insertion order for same-offset edits', () => {
    // Two insertions at the same offset: the first edit in the input array should
    // end up first in the output (stable sort semantics).
    const source = 'XZ';
    const edits: TextEdit[] = [
      { offset: 1, end: 1, newText: 'Y1' },
      { offset: 1, end: 1, newText: 'Y2' },
    ];
    // First edit (Y1) should appear before second edit (Y2)
    expect(applyEdits(source, edits)).toBe('XY1Y2Z');
  });

  it('documents overlapping edits behavior: last applied (highest offset sorted first) wins for overlapping ranges', () => {
    // applyEdits does NOT detect overlapping edits — callers must ensure edits
    // are non-overlapping.  This test documents what actually happens when two
    // edits cover overlapping byte ranges so that future maintainers understand
    // the semantics rather than being surprised by the output.
    //
    // Edits are sorted by descending offset, so the edit with the higher offset
    // is applied first to the original string, after which the remaining edits
    // are applied to a string whose layout has already changed.  When ranges
    // overlap the second (lower-offset) edit will overwrite part of what the
    // first applied.
    const source = 'abcde'; // offsets 0-4
    // Edit A: replace [1,4) with 'XYZ'  → 'aXYZe'
    // Edit B: replace [2,3) with '!'    → both overlap on index 2 of the original
    const edits: TextEdit[] = [
      { offset: 1, end: 4, newText: 'XYZ' }, // lower offset → applied second
      { offset: 2, end: 3, newText: '!' },    // higher offset → applied first
    ];
    // After applying edit B first: 'ab!de'
    // After applying edit A (offset 1, end 4) to 'ab!de': 'aXYZe'
    // The documented (not necessarily desired) result:
    expect(applyEdits(source, edits)).toBe('aXYZe');
  });
});
