import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { C4Parser } from '../../src/parser/parser.js';

const parser = new C4Parser();

function readFixture(dir: string, file: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', 'fixtures', dir, file), 'utf-8');
}

describe('C4Parser', () => {
  it('should parse minimal specification', () => {
    const doc = parser.parse(`
specification {
  element component
}
`);
    expect(doc.errors).toHaveLength(0);
    expect(doc.ast.$type).toBe('LikeC4Grammar');
    expect(doc.ast.specifications).toHaveLength(1);
  });

  it('should parse element with properties', () => {
    const doc = parser.parse(`
specification {
  element service
}
model {
  myService = service 'My Service' {
    description 'A test service'
    technology 'TypeScript'
  }
}
`);
    expect(doc.errors).toHaveLength(0);
    expect(doc.ast.models).toHaveLength(1);
    const model = doc.ast.models[0];
    expect(model.elements.length).toBeGreaterThan(0);
  });

  it('should parse relationships', () => {
    const doc = parser.parse(`
specification {
  element service
  element database
}
model {
  api = service 'API' {
    db = database 'Database'
  }
  api -> api.db 'reads from'
}
`);
    expect(doc.errors).toHaveLength(0);
  });

  it('should parse views', () => {
    const doc = parser.parse(`
specification {
  element system
}
model {
  app = system 'App'
}
views {
  view index {
    include *
  }
}
`);
    expect(doc.errors).toHaveLength(0);
    expect(doc.ast.views).toHaveLength(1);
  });

  it('should preserve CST positions and fullText', () => {
    const source = `specification {
  element component
}`;
    const doc = parser.parse(source);
    expect(doc.fullText).toBe(source);
    expect(doc.cst).toBeDefined();
    expect(typeof doc.cst.offset).toBe('number');
    expect(typeof doc.cst.end).toBe('number');
  });

  it('should return errors for invalid syntax', () => {
    const doc = parser.parse(`specification { invalid syntax here`);
    expect(doc.errors.length).toBeGreaterThan(0);
  });

  it('should parse comments without errors', () => {
    const doc = parser.parse(`
// Line comment
specification {
  /* Block comment */
  element component
}
`);
    expect(doc.errors).toHaveLength(0);
  });

  it('should parse deployment', () => {
    const doc = parser.parse(`
specification {
  element service
  deploymentNode environment
  deploymentNode kubernetes
}
model {
  api = service 'API'
}
deployment {
  prod = environment 'Production' {
    k8s = kubernetes 'K8s' {
      instanceOf api
    }
  }
}
`);
    expect(doc.errors).toHaveLength(0);
    expect(doc.ast.deployments).toHaveLength(1);
  });

  it('should parse tags', () => {
    const doc = parser.parse(`
specification {
  element service
  tag deprecated
}
model {
  old = service 'Old Service' {
    #deprecated
  }
}
`);
    expect(doc.errors).toHaveLength(0);
  });

  describe('fixture files', () => {
    it('should parse minimal/model.c4', () => {
      const source = readFixture('minimal', 'model.c4');
      const doc = parser.parse(source);
      if (doc.errors.length > 0) {
        console.log('Parse errors:', JSON.stringify(doc.errors, null, 2));
      }
      expect(doc.errors).toHaveLength(0);
    });

    it('should parse minimal/spec.c4', () => {
      const source = readFixture('minimal', 'spec.c4');
      const doc = parser.parse(source);
      expect(doc.errors).toHaveLength(0);
    });

    it('should parse cloud-system/spec.c4', () => {
      const source = readFixture('cloud-system', 'spec.c4');
      const doc = parser.parse(source);
      expect(doc.errors).toHaveLength(0);
    });

    it('should parse cloud-system/model.c4', () => {
      const source = readFixture('cloud-system', 'model.c4');
      const doc = parser.parse(source);
      expect(doc.errors).toHaveLength(0);
    });

    it('should parse boutique/spec.c4', () => {
      const source = readFixture('boutique', 'spec.c4');
      const doc = parser.parse(source);
      expect(doc.errors).toHaveLength(0);
    });

    it('should parse boutique/model.c4', () => {
      const source = readFixture('boutique', 'model.c4');
      const doc = parser.parse(source);
      expect(doc.errors).toHaveLength(0);
    });
  });
});
