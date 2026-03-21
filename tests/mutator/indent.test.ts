import { describe, it, expect } from 'vitest';
import { detectIndent, getNodeIndent } from '../../src/mutator/indent.js';

// ---------------------------------------------------------------------------
// detectIndent
// ---------------------------------------------------------------------------

describe('detectIndent', () => {
  it('should detect 2-space indentation', () => {
    const source = 'model {\n  app = system\n}';
    expect(detectIndent(source)).toBe('  ');
  });

  it('should detect 4-space indentation', () => {
    const source = 'model {\n    app = system\n}';
    expect(detectIndent(source)).toBe('    ');
  });

  it('should detect tab indentation', () => {
    const source = 'model {\n\tapp = system\n}';
    expect(detectIndent(source)).toBe('\t');
  });

  it('should return the default 2-space indent when no indented line is present', () => {
    const source = 'model {}';
    expect(detectIndent(source)).toBe('  ');
  });

  it('should return the default 2-space indent for an empty string', () => {
    expect(detectIndent('')).toBe('  ');
  });

  it('should return the leading whitespace of the first indented line only', () => {
    // First indented line has 2 spaces, second has 4 — should return 2
    const source = 'block {\n  item1\n    nested\n}';
    expect(detectIndent(source)).toBe('  ');
  });
});

// ---------------------------------------------------------------------------
// getNodeIndent
// ---------------------------------------------------------------------------

describe('getNodeIndent', () => {
  it('should return empty string for a node at the very start of the file (no preceding newline)', () => {
    // cst.offset = 0, so lastIndexOf('\n', -1) === -1 → returns ''
    const node = { $cstNode: { offset: 0 } };
    const fullText = 'app = system';
    expect(getNodeIndent(node, fullText)).toBe('');
  });

  it('should return 2-space indent for a 2-space indented node', () => {
    const fullText = 'model {\n  app = system\n}';
    // 'app' starts at offset 10 (after 'model {\n  ')
    const offset = fullText.indexOf('app');
    const node = { $cstNode: { offset } };
    expect(getNodeIndent(node, fullText)).toBe('  ');
  });

  it('should return 4-space indent for a doubly nested node', () => {
    const fullText = 'model {\n  parent = system {\n    child = service\n  }\n}';
    const offset = fullText.indexOf('child');
    const node = { $cstNode: { offset } };
    expect(getNodeIndent(node, fullText)).toBe('    ');
  });

  it('should return tab indent for a tab-indented node', () => {
    const fullText = 'model {\n\tapp = system\n}';
    const offset = fullText.indexOf('app');
    const node = { $cstNode: { offset } };
    expect(getNodeIndent(node, fullText)).toBe('\t');
  });

  it('should return default 2-space indent when the node has no $cstNode', () => {
    const node = {};
    expect(getNodeIndent(node, 'anything')).toBe('  ');
  });

  it('should return empty string when the node begins exactly at a newline boundary with no leading whitespace', () => {
    const fullText = 'model {\napp = system\n}';
    const offset = fullText.indexOf('app');
    const node = { $cstNode: { offset } };
    expect(getNodeIndent(node, fullText)).toBe('');
  });
});
