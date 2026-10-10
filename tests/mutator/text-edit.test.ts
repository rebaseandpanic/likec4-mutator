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

  it.each([
    ['two replaced ranges overlap', [{ offset: 1, end: 4, newText: 'XYZ' }, { offset: 2, end: 3, newText: '!' }]],
    ['two replacements start at the same offset', [{ offset: 1, end: 2, newText: 'X' }, { offset: 1, end: 3, newText: 'Y' }]],
    ['an insertion falls inside a replaced range', [{ offset: 1, end: 4, newText: 'XYZ' }, { offset: 2, end: 2, newText: '!' }]],
  ] as Array<[string, TextEdit[]]>)('rejects edits whose result would depend on the order: %s', (_, edits) => {
    expect(() => applyEdits('abcde', edits)).toThrow(/overlapping text edits/);
  });

  it('puts insertions at the start of a replaced range before the replacement, in list order', () => {
    // The replacement is listed between the two insertions; either way the
    // inserted text must survive and precede the replacement's text.
    const edits: TextEdit[] = [
      { offset: 1, end: 1, newText: '1' },
      { offset: 1, end: 3, newText: 'R' },
      { offset: 1, end: 1, newText: '2' },
    ];
    expect(applyEdits('abcde', edits)).toBe('a12Rde');
  });

  it('puts an insertion at the end of a replaced range after the replacement', () => {
    const edits: TextEdit[] = [
      { offset: 3, end: 3, newText: '!' },
      { offset: 1, end: 3, newText: 'R' },
    ];
    expect(applyEdits('abcde', edits)).toBe('aR!de');
  });
});
