import { describe, it, expect } from 'vitest';
import { generateElement, generateRelationship, generateView } from '../../src/mutator/codegen.js';

// ---------------------------------------------------------------------------
// generateElement
// ---------------------------------------------------------------------------

describe('generateElement', () => {
  it('should produce a single-line declaration with title only (no body)', () => {
    const result = generateElement({ indent: '  ', name: 'api', kind: 'service', title: 'My API' });
    expect(result).toBe("  api = service 'My API'");
  });

  it('should produce a single-line declaration with no title and no body', () => {
    const result = generateElement({ indent: '  ', name: 'worker', kind: 'service' });
    expect(result).toBe('  worker = service');
  });

  it('should produce a block body when description is provided', () => {
    const result = generateElement({
      indent: '  ',
      name: 'api',
      kind: 'service',
      title: 'My API',
      description: 'Handles HTTP requests',
    });
    expect(result).toContain("  api = service 'My API' {");
    expect(result).toContain("    description 'Handles HTTP requests'");
    expect(result).toContain('  }');
    expect(result).not.toContain('technology');
  });

  it('should include description, technology, and link when all are provided', () => {
    const result = generateElement({
      indent: '  ',
      name: 'api',
      kind: 'service',
      title: 'API',
      description: 'Backend',
      technology: 'TypeScript',
      link: { url: 'https://example.com', title: 'Docs' },
    });
    expect(result).toContain("    description 'Backend'");
    expect(result).toContain("    technology 'TypeScript'");
    expect(result).toContain("    link https://example.com 'Docs'");
    expect(result).toContain('  }');
  });

  it('should include a link without a title when link.title is absent', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      link: { url: 'https://repo.example.com' },
    });
    expect(result).toContain('link https://repo.example.com');
    expect(result).not.toMatch(/link https:\/\/repo\.example\.com '/);
  });

  it('should handle an empty title string (no title suffix on the declaration)', () => {
    const result = generateElement({ indent: '', name: 'svc', kind: 'service', title: '' });
    // Empty string is falsy — should not append any title
    expect(result).toBe('svc = service');
  });

  it('should escape single quotes in the title', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      title: "It's alive",
    });
    expect(result).toContain("'It\\'s alive'");
  });

  it('should escape backslashes in the title', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      title: 'path\\to\\file',
    });
    expect(result).toContain("'path\\\\to\\\\file'");
  });

  it('should preserve unicode characters in the description', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      description: 'Système de gestion \u2014 overview',
    });
    expect(result).toContain("description 'Système de gestion \u2014 overview'");
  });

  it('should use the supplied indent for the outer line and indent+2-spaces for inner lines', () => {
    const result = generateElement({
      indent: '\t',
      name: 'db',
      kind: 'database',
      description: 'Stores data',
    });
    // Outer declaration uses the supplied indent
    expect(result.startsWith('\tdb = database {')).toBe(true);
    // Inner properties use indent + two spaces (the codegen always adds '  ')
    expect(result).toContain('\t  description');
    expect(result).toContain('\t}');
  });
});

// ---------------------------------------------------------------------------
// generateRelationship
// ---------------------------------------------------------------------------

describe('generateRelationship', () => {
  it('should produce a plain arrow without label', () => {
    const result = generateRelationship({ indent: '  ', source: 'api', target: 'db' });
    expect(result).toBe('  api -> db');
  });

  it('should append a quoted label when provided', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      label: 'reads/writes',
    });
    expect(result).toBe("  api -> db 'reads/writes'");
  });

  it('should escape single quotes inside the label', () => {
    const result = generateRelationship({
      indent: '',
      source: 'a',
      target: 'b',
      label: "it's important",
    });
    expect(result).toContain("'it\\'s important'");
  });

  it('should support FQN source and target', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'app.api',
      target: 'app.db',
    });
    expect(result).toBe('  app.api -> app.db');
  });
});

// ---------------------------------------------------------------------------
// generateView
// ---------------------------------------------------------------------------

describe('generateView', () => {
  it('should produce a scoped element view when target is provided', () => {
    const result = generateView({ indent: '  ', id: 'apiView', type: 'element', target: 'app.api' });
    expect(result).toContain('  view apiView of app.api {');
    expect(result).toContain('  }');
  });

  it('should produce an unscoped element view when target is absent', () => {
    const result = generateView({ indent: '  ', id: 'globalView', type: 'element' });
    expect(result).toContain('  view globalView {');
    expect(result).not.toContain(' of ');
  });

  it('should produce a dynamic view', () => {
    const result = generateView({ indent: '  ', id: 'flow1', type: 'dynamic' });
    expect(result).toContain('  dynamic view flow1 {');
  });

  it('should produce a deployment view', () => {
    const result = generateView({ indent: '  ', id: 'deploy1', type: 'deployment' });
    expect(result).toContain('  deployment view deploy1 {');
  });

  it('should include a title declaration inside the body', () => {
    const result = generateView({
      indent: '  ',
      id: 'v1',
      type: 'element',
      title: 'My View',
    });
    expect(result).toContain("    title 'My View'");
  });

  it('should emit include statements for every entry in the includes array', () => {
    const result = generateView({
      indent: '  ',
      id: 'v2',
      type: 'element',
      includes: ['*', 'app.api'],
    });
    expect(result).toContain('    include *');
    expect(result).toContain('    include app.api');
  });

  it('should always include autoLayout TopBottom', () => {
    const result = generateView({ indent: '', id: 'v3', type: 'element' });
    expect(result).toContain('autoLayout TopBottom');
  });

  it('should not emit an include block when includes is undefined', () => {
    const result = generateView({ indent: '', id: 'v4', type: 'element' });
    expect(result).not.toContain('include');
  });

  it('should not emit an include block when includes is an empty array', () => {
    const result = generateView({ indent: '', id: 'v5', type: 'element', includes: [] });
    expect(result).not.toContain('include');
  });
});
