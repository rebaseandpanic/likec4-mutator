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
});
