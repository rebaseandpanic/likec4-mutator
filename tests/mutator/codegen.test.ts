import { describe, it, expect } from 'vitest';
import {
  generateElement,
  generateRelationship,
  generateView,
  generateStyleBlock,
  escapeString,
} from '../../src/mutator/codegen.js';

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
      links: [{ url: 'https://example.com', label: 'Docs' }],
    });
    expect(result).toContain("    description 'Backend'");
    expect(result).toContain("    technology 'TypeScript'");
    expect(result).toContain("    link https://example.com 'Docs'");
    expect(result).toContain('  }');
  });

  it('should include a link without a label when links[].label is absent', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      links: [{ url: 'https://repo.example.com' }],
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

  it('should emit tags with # prefix inside the body', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      tags: ['internal', 'backend'],
    });
    expect(result).toContain('  svc = service {');
    expect(result).toContain('    #internal');
    expect(result).toContain('    #backend');
    expect(result).toContain('  }');
  });

  it('should emit multiple links in order', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      links: [
        { url: 'https://example.com/docs', label: 'Docs' },
        { url: 'https://example.com/repo' },
      ],
    });
    expect(result).toContain("    link https://example.com/docs 'Docs'");
    expect(result).toContain('    link https://example.com/repo');
    expect(result).not.toMatch(/link https:\/\/example\.com\/repo '/);
  });

  it('should emit a metadata block with key/value pairs', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      metadata: { owner: 'team-alpha', env: 'prod' },
    });
    expect(result).toContain('    metadata {');
    expect(result).toContain("      owner 'team-alpha'");
    expect(result).toContain("      env 'prod'");
    expect(result).toContain('    }');
  });

  it('should emit all fields in the correct order when all are provided', () => {
    const result = generateElement({
      indent: '',
      name: 'api',
      kind: 'service',
      title: 'My API',
      tags: ['public'],
      description: 'Handles requests',
      technology: 'Node.js',
      links: [{ url: 'https://api.example.com', label: 'API Docs' }],
      metadata: { team: 'platform' },
    });
    const tagPos = result.indexOf('#public');
    const descPos = result.indexOf('description');
    const techPos = result.indexOf('technology');
    const linkPos = result.indexOf('link');
    const metaPos = result.indexOf('metadata');
    // Verify ordering: tags < description < technology < links < metadata
    expect(tagPos).toBeLessThan(descPos);
    expect(descPos).toBeLessThan(techPos);
    expect(techPos).toBeLessThan(linkPos);
    expect(linkPos).toBeLessThan(metaPos);
    expect(result).toContain("api = service 'My API' {");
    expect(result).toContain('#public');
    expect(result).toContain("description 'Handles requests'");
    expect(result).toContain("technology 'Node.js'");
    expect(result).toContain("link https://api.example.com 'API Docs'");
    expect(result).toContain('metadata {');
    expect(result).toContain("  team 'platform'");
  });

  it('should emit summary before description when both are provided', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      summary: 'Short text',
      description: 'Long detailed text',
    });
    expect(result).toContain("    summary 'Short text'");
    expect(result).toContain("    description 'Long detailed text'");
    const summaryPos = result.indexOf('summary');
    const descPos = result.indexOf('description');
    expect(summaryPos).toBeLessThan(descPos);
  });

  it('should produce a body block when only summary is provided', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      title: 'My Service',
      summary: 'Quick overview',
    });
    expect(result).toContain("  svc = service 'My Service' {");
    expect(result).toContain("    summary 'Quick overview'");
    expect(result).toContain('  }');
    expect(result).not.toContain('description');
  });

  it('should emit a style block with shape and color', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      style: { shape: 'browser', color: 'blue' },
    });
    expect(result).toContain('    style {');
    expect(result).toContain('      shape browser');
    expect(result).toContain('      color blue');
    expect(result).toContain('    }');
  });

  it('should emit a style block with shape, color, and icon', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      style: { shape: 'browser', color: 'blue', icon: 'tech:react' },
    });
    expect(result).toContain('      shape browser');
    expect(result).toContain('      color blue');
    expect(result).toContain('      icon tech:react');
  });

  it('should emit all style sub-properties when fully specified', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      style: {
        shape: 'browser',
        color: 'blue',
        icon: 'tech:react',
        opacity: '40%',
        border: 'dashed',
        multiple: true,
        size: 'sm',
        padding: 'md',
        textSize: 'lg',
        iconPosition: 'top',
        iconColor: 'amber',
        iconSize: 'sm',
      },
    });
    expect(result).toContain('  style {');
    expect(result).toContain('    shape browser');
    expect(result).toContain('    color blue');
    expect(result).toContain('    icon tech:react');
    expect(result).toContain('    opacity 40%');
    expect(result).toContain('    border dashed');
    expect(result).toContain('    multiple true');
    expect(result).toContain('    size sm');
    expect(result).toContain('    padding md');
    expect(result).toContain('    textSize lg');
    expect(result).toContain('    iconPosition top');
    expect(result).toContain('    iconColor amber');
    expect(result).toContain('    iconSize sm');
    expect(result).toContain('  }');
  });

  it('should not emit a style block when style object is empty', () => {
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      title: 'My Service',
      style: {},
    });
    expect(result).toBe("  svc = service 'My Service'");
    expect(result).not.toContain('style');
  });

  it('should emit style block after links and before metadata', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      links: [{ url: 'https://example.com' }],
      style: { color: 'red' },
      metadata: { owner: 'team' },
    });
    const linkPos = result.indexOf('link');
    const stylePos = result.indexOf('style');
    const metaPos = result.indexOf('metadata');
    expect(linkPos).toBeLessThan(stylePos);
    expect(stylePos).toBeLessThan(metaPos);
  });

  it('should emit summary + style + all other fields in correct order', () => {
    const result = generateElement({
      indent: '',
      name: 'api',
      kind: 'service',
      title: 'My API',
      tags: ['public'],
      summary: 'Short overview',
      description: 'Long description',
      technology: 'Node.js',
      links: [{ url: 'https://api.example.com', label: 'API Docs' }],
      style: { shape: 'browser', color: 'blue' },
      metadata: { team: 'platform' },
    });
    const tagPos = result.indexOf('#public');
    const summaryPos = result.indexOf('summary');
    const descPos = result.indexOf('description');
    const techPos = result.indexOf('technology');
    const linkPos = result.indexOf('link');
    const stylePos = result.indexOf('style');
    const metaPos = result.indexOf('metadata');
    // Verify full ordering: tags < summary < description < technology < links < style < metadata
    expect(tagPos).toBeLessThan(summaryPos);
    expect(summaryPos).toBeLessThan(descPos);
    expect(descPos).toBeLessThan(techPos);
    expect(techPos).toBeLessThan(linkPos);
    expect(linkPos).toBeLessThan(stylePos);
    expect(stylePos).toBeLessThan(metaPos);
    expect(result).toContain("summary 'Short overview'");
    expect(result).toContain("description 'Long description'");
    expect(result).toContain('shape browser');
    expect(result).toContain('color blue');
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

  it('should emit a body block when description is provided', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      label: 'reads',
      description: 'Queries the database',
    });
    expect(result).toContain("  api -> db 'reads' {");
    expect(result).toContain("    description 'Queries the database'");
    expect(result).toContain('  }');
  });

  it('should emit a body block with description and no label', () => {
    const result = generateRelationship({
      indent: '',
      source: 'a',
      target: 'b',
      description: 'Sends data',
    });
    expect(result).toContain('a -> b {');
    expect(result).toContain("  description 'Sends data'");
    expect(result).toContain('}');
  });

  it('should emit a body block with technology', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      technology: 'REST API',
    });
    expect(result).toContain('  api -> db {');
    expect(result).toContain("    technology 'REST API'");
    expect(result).toContain('  }');
  });

  it('should emit tags with # prefix inside the body', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      tags: ['async', 'internal'],
    });
    expect(result).toContain('  api -> db {');
    expect(result).toContain('    #async');
    expect(result).toContain('    #internal');
    expect(result).toContain('  }');
  });

  it('should emit link statements inside the body', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      links: [
        { url: 'https://docs.api.com', label: 'API Docs' },
        { url: 'https://repo.example.com' },
      ],
    });
    expect(result).toContain("    link https://docs.api.com 'API Docs'");
    expect(result).toContain('    link https://repo.example.com');
    expect(result).not.toMatch(/link https:\/\/repo\.example\.com '/);
  });

  it('should emit a style block with line and color', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      style: { line: 'dashed', color: 'red' },
    });
    expect(result).toContain('    style {');
    expect(result).toContain('      line dashed');
    expect(result).toContain('      color red');
    expect(result).toContain('    }');
  });

  it('should emit a style block with head and tail', () => {
    const result = generateRelationship({
      indent: '',
      source: 'a',
      target: 'b',
      style: { head: 'diamond', tail: 'none' },
    });
    expect(result).toContain('  style {');
    expect(result).toContain('    head diamond');
    expect(result).toContain('    tail none');
    expect(result).toContain('  }');
  });

  it('should emit a metadata block inside the body', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      metadata: { sla: '99.9%', owner: 'team-api' },
    });
    expect(result).toContain('    metadata {');
    expect(result).toContain("      sla '99.9%'");
    expect(result).toContain("      owner 'team-api'");
    expect(result).toContain('    }');
  });

  it('should emit all properties combined in correct order', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      label: 'fetches',
      tags: ['async'],
      description: 'Fetches user data',
      technology: 'REST',
      links: [{ url: 'https://docs.api.com', label: 'API Docs' }],
      style: { line: 'dashed', color: 'red' },
      metadata: { sla: '99.9%' },
    });
    // Header
    expect(result).toContain("  api -> db 'fetches' {");
    // All body fields present
    expect(result).toContain('    #async');
    expect(result).toContain("    description 'Fetches user data'");
    expect(result).toContain("    technology 'REST'");
    expect(result).toContain("    link https://docs.api.com 'API Docs'");
    expect(result).toContain('    style {');
    expect(result).toContain('      line dashed');
    expect(result).toContain('      color red');
    expect(result).toContain('    }');
    expect(result).toContain('    metadata {');
    expect(result).toContain("      sla '99.9%'");
    // Ordering: tags < description < technology < links < style < metadata
    const tagPos = result.indexOf('#async');
    const descPos = result.indexOf('description');
    const techPos = result.indexOf('technology');
    const linkPos = result.indexOf('link ');
    const stylePos = result.indexOf('style {');
    const metaPos = result.indexOf('metadata {');
    expect(tagPos).toBeLessThan(descPos);
    expect(descPos).toBeLessThan(techPos);
    expect(techPos).toBeLessThan(linkPos);
    expect(linkPos).toBeLessThan(stylePos);
    expect(stylePos).toBeLessThan(metaPos);
    expect(result).toContain('  }');
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

// ---------------------------------------------------------------------------
// Edge-case tests
// ---------------------------------------------------------------------------

describe('generateElement edge cases', () => {
  it('should NOT produce a double ## prefix when a tag already starts with #', () => {
    // Tags are user-supplied names — if the caller passes '#internal' instead of
    // 'internal', the output must not be '##internal'.
    const result = generateElement({
      indent: '  ',
      name: 'svc',
      kind: 'service',
      tags: ['#already-prefixed'],
    });
    // The codegen strips a leading '#' before adding its own prefix, so the
    // output must be '#already-prefixed', never '##already-prefixed'.
    expect(result).toContain('#already-prefixed');
    expect(result).not.toContain('##already-prefixed');
  });

  it('should handle a link URL that contains spaces — no label', () => {
    // URLs with spaces are unusual but the codegen emits them verbatim
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      links: [{ url: 'https://example.com/path with spaces' }],
    });
    expect(result).toContain('link https://example.com/path with spaces');
  });

  it('should escape single quotes in link labels', () => {
    const result = generateElement({
      indent: '',
      name: 'svc',
      kind: 'service',
      links: [{ url: 'https://example.com', label: "It's a doc" }],
    });
    expect(result).toContain("link https://example.com 'It\\'s a doc'");
  });
});

// ---------------------------------------------------------------------------
// escapeString edge cases (Task 3)
// ---------------------------------------------------------------------------

describe('escapeString', () => {
  it('should escape a single backslash to double backslash', () => {
    expect(escapeString('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('should escape a single quote to backslash-quote', () => {
    expect(escapeString("it's")).toBe("it\\'s");
  });

  it('should replace a newline character with a space', () => {
    // The grammar does not support embedded newlines — escapeString replaces
    // them with spaces to prevent silent generation of invalid DSL.
    const result = escapeString('line1\nline2');
    expect(result).toBe('line1 line2');
  });

  it('should replace a tab character with a space', () => {
    // Same as newline: tabs are replaced with spaces.
    const result = escapeString('col1\tcol2');
    expect(result).toBe('col1 col2');
  });

  it('should return an empty string unchanged', () => {
    expect(escapeString('')).toBe('');
  });

  it('should escape multiple single quotes in sequence', () => {
    expect(escapeString("a'b'c")).toBe("a\\'b\\'c");
  });
});

// ---------------------------------------------------------------------------
// generateView additional edge cases (Task 3)
// ---------------------------------------------------------------------------

describe('generateView additional edge cases', () => {
  it('should produce the correct "dynamic view" header for type dynamic', () => {
    const result = generateView({ indent: '', id: 'dynFlow', type: 'dynamic' });
    expect(result.startsWith('dynamic view dynFlow {')).toBe(true);
  });

  it('should produce the correct "deployment view" header for type deployment', () => {
    const result = generateView({ indent: '', id: 'deployView', type: 'deployment' });
    expect(result.startsWith('deployment view deployView {')).toBe(true);
  });

  it('should produce minimal output (only autoLayout) when title and includes are absent', () => {
    const result = generateView({ indent: '', id: 'bare', type: 'element' });
    // Only the header, autoLayout, and closing brace — no title or include lines
    expect(result).toBe('view bare {\n  autoLayout TopBottom\n}');
  });

  it('should produce a dynamic view with a title inside the body', () => {
    const result = generateView({ indent: '', id: 'df', type: 'dynamic', title: 'Dynamic Flow' });
    expect(result).toContain("title 'Dynamic Flow'");
    expect(result).toContain('dynamic view df {');
  });

  it('should produce a deployment view with includes', () => {
    const result = generateView({
      indent: '  ',
      id: 'prod',
      type: 'deployment',
      includes: ['node.*'],
    });
    expect(result).toContain('  deployment view prod {');
    expect(result).toContain('    include node.*');
  });
});

// ---------------------------------------------------------------------------
// generateRelationship tag-stripping edge case (Task 4)
// ---------------------------------------------------------------------------

describe('generateRelationship tag stripping', () => {
  it('should NOT produce ## when a relationship tag already starts with #', () => {
    const result = generateRelationship({
      indent: '',
      source: 'a',
      target: 'b',
      tags: ['#prefixed'],
    });
    expect(result).toContain('#prefixed');
    expect(result).not.toContain('##prefixed');
  });
});

// ---------------------------------------------------------------------------
// generateStyleBlock focused unit tests (I5)
// ---------------------------------------------------------------------------

describe('generateStyleBlock', () => {
  it('should generate all properties when fully specified', () => {
    const result = generateStyleBlock(
      {
        shape: 'browser',
        color: 'blue',
        icon: 'tech:react',
        opacity: '40%',
        border: 'dashed',
        multiple: true,
        size: 'sm',
        padding: 'md',
        textSize: 'lg',
        iconPosition: 'top',
        iconColor: 'amber',
        iconSize: 'sm',
      },
      '  ',
    );
    expect(result).toContain('  style {');
    expect(result).toContain('    shape browser');
    expect(result).toContain('    color blue');
    expect(result).toContain('    icon tech:react');
    expect(result).toContain('    opacity 40%');
    expect(result).toContain('    border dashed');
    expect(result).toContain('    multiple true');
    expect(result).toContain('    size sm');
    expect(result).toContain('    padding md');
    expect(result).toContain('    textSize lg');
    expect(result).toContain('    iconPosition top');
    expect(result).toContain('    iconColor amber');
    expect(result).toContain('    iconSize sm');
    expect(result).toContain('  }');
  });

  it('should emit a style block with only the closing brace when object is empty', () => {
    // generateStyleBlock is only called when the style object is non-empty;
    // if called with {}, it still emits the outer style block wrapper.
    const result = generateStyleBlock({}, '  ');
    expect(result).toContain('  style {');
    expect(result).toContain('  }');
    // No inner property lines
    expect(result).toBe('  style {\n  }\n');
  });

  it('should emit multiple false', () => {
    const result = generateStyleBlock({ multiple: false }, '');
    expect(result).toContain('multiple false');
  });
});

// ---------------------------------------------------------------------------
// generateRelationship empty style block (I6)
// ---------------------------------------------------------------------------

describe('generateRelationship empty style', () => {
  it('should NOT emit a style block when style object is empty ({})', () => {
    const result = generateRelationship({
      indent: '  ',
      source: 'api',
      target: 'db',
      style: {},
      description: 'Sends data',
    });
    expect(result).not.toContain('style {');
    expect(result).toContain("    description 'Sends data'");
  });
});

// ---------------------------------------------------------------------------
// generateView autoLayout option (I7)
// ---------------------------------------------------------------------------

describe('generateView autoLayout option', () => {
  it('should default to autoLayout TopBottom when autoLayout is not specified', () => {
    const result = generateView({ indent: '', id: 'v', type: 'element' });
    expect(result).toContain('autoLayout TopBottom');
  });

  it('should use a custom autoLayout value when specified', () => {
    const result = generateView({ indent: '', id: 'v', type: 'element', autoLayout: 'LeftRight' });
    expect(result).toContain('autoLayout LeftRight');
    expect(result).not.toContain('autoLayout TopBottom');
  });

  it('should suppress the autoLayout directive when autoLayout is empty string', () => {
    const result = generateView({ indent: '', id: 'v', type: 'element', autoLayout: '' });
    expect(result).not.toContain('autoLayout');
  });

  it('should suppress the autoLayout directive when autoLayout is null', () => {
    const result = generateView({ indent: '', id: 'v', type: 'element', autoLayout: null });
    expect(result).not.toContain('autoLayout');
  });
});
