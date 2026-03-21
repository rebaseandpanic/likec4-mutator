import { describe, it, expect } from 'vitest';
import { buildFqnIndex, resolveFqnRef } from '../../src/query/fqn.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal synthetic AST structures
// ---------------------------------------------------------------------------

/** Build a minimal Element AST node (no CST, no body). */
function makeElement(name: string, children: any[] = []): any {
  return {
    $type: 'Element',
    name,
    body: children.length > 0 ? { elements: children } : undefined,
  };
}

/** Build a minimal AST with one or more models. */
function makeAst(modelElements: any[]): any {
  return {
    models: [{ elements: modelElements }],
  };
}

// ---------------------------------------------------------------------------
// buildFqnIndex
// ---------------------------------------------------------------------------

describe('buildFqnIndex', () => {
  it('should index root-level elements', () => {
    const ast = makeAst([makeElement('app'), makeElement('external')]);
    const index = buildFqnIndex(ast);

    expect(index.has('app')).toBe(true);
    expect(index.has('external')).toBe(true);
    expect(index.get('app')!.fqn).toBe('app');
    expect(index.get('app')!.name).toBe('app');
    expect(index.get('app')!.parentFqn).toBeUndefined();
  });

  it('should build FQN as parent.child for nested elements', () => {
    const child = makeElement('api');
    const parent = makeElement('app', [child]);
    const ast = makeAst([parent]);
    const index = buildFqnIndex(ast);

    expect(index.has('app')).toBe(true);
    expect(index.has('app.api')).toBe(true);
    expect(index.get('app.api')!.fqn).toBe('app.api');
    expect(index.get('app.api')!.name).toBe('api');
    expect(index.get('app.api')!.parentFqn).toBe('app');
  });

  it('should register child FQN in the parent children array', () => {
    const child = makeElement('db');
    const parent = makeElement('app', [child]);
    const ast = makeAst([parent]);
    const index = buildFqnIndex(ast);

    expect(index.get('app')!.children).toContain('app.db');
  });

  it('should handle 3+ levels of nesting', () => {
    const grandchild = makeElement('handler');
    const child = makeElement('router', [grandchild]);
    const parent = makeElement('app', [child]);
    const ast = makeAst([parent]);
    const index = buildFqnIndex(ast);

    expect(index.has('app')).toBe(true);
    expect(index.has('app.router')).toBe(true);
    expect(index.has('app.router.handler')).toBe(true);
    expect(index.get('app.router.handler')!.parentFqn).toBe('app.router');
  });

  it('should return an empty map for a model with no elements', () => {
    const ast = makeAst([]);
    expect(buildFqnIndex(ast).size).toBe(0);
  });

  it('should return an empty map when models array is absent', () => {
    expect(buildFqnIndex({}).size).toBe(0);
  });

  it('should skip non-Element items in the elements array', () => {
    const relation = { $type: 'Relation', source: null, target: null };
    const ast = makeAst([relation, makeElement('app')]);
    const index = buildFqnIndex(ast);

    // Only 'app' should be indexed; the Relation node has no name property
    expect(index.has('app')).toBe(true);
    expect(index.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveFqnRef
// ---------------------------------------------------------------------------

describe('resolveFqnRef', () => {
  it('should return empty string for null input', () => {
    expect(resolveFqnRef(null)).toBe('');
  });

  it('should return empty string for undefined input', () => {
    expect(resolveFqnRef(undefined)).toBe('');
  });

  it('should resolve a simple single-segment ref via value.$refText', () => {
    const ref = { value: { $refText: 'api' }, parent: undefined };
    expect(resolveFqnRef(ref)).toBe('api');
  });

  it('should resolve a dotted two-segment ref', () => {
    const ref = {
      value: { $refText: 'api' },
      parent: { value: { $refText: 'app' }, parent: undefined },
    };
    expect(resolveFqnRef(ref)).toBe('app.api');
  });

  it('should resolve a deep ref (a.b.c.d)', () => {
    const ref = {
      value: { $refText: 'd' },
      parent: {
        value: { $refText: 'c' },
        parent: {
          value: { $refText: 'b' },
          parent: { value: { $refText: 'a' }, parent: undefined },
        },
      },
    };
    expect(resolveFqnRef(ref)).toBe('a.b.c.d');
  });

  it('should fall back to direct $refText property when value is absent', () => {
    // Fallback path: `current.$refText` instead of `current.value.$refText`
    const ref = { $refText: 'standalone', parent: undefined };
    expect(resolveFqnRef(ref)).toBe('standalone');
  });
});
