/**
 * Style reads of elements and model relationships (lc4m-15.30 US-11; D74,
 * D88, D89; rows 160–162 of the test matrix): own, kind and effective
 * styles equal LikeC4's computed model before theme defaults (`$data`),
 * opacity as LikeC4's number against the written percentage.
 *
 * Expected values come from LikeC4 (`expectElementStylesAgreeWithLikeC4`,
 * `expectRelationshipsAgreeWithLikeC4` with style compared,
 * `likec4RelationshipKinds`) and, for the facts spike 01 records, from its
 * output.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { ElementInfo } from '../../src/query/types.js';
import {
  buildLikeC4Model,
  expectElementStylesAgreeWithLikeC4,
  expectRelationshipsAgreeWithLikeC4,
  likec4RelationshipKinds,
} from '../helpers/likec4-model.js';

const SLOW = { timeout: 120_000 };

/** Every style field of an element in LikeC4's grammar, as the library names them. */
const ELEMENT_STYLE_FIELDS = [
  'shape',
  'color',
  'icon',
  'opacity',
  'border',
  'multiple',
  'size',
  'padding',
  'textSize',
  'iconPosition',
  'iconColor',
  'iconSize',
] as const;

/** One style block with every field of the grammar. */
const EVERY_FIELD = `style {
      shape cylinder
      color amber
      icon tech:go
      opacity 40%
      border dashed
      multiple true
      size large
      padding sm
      textSize xl
      iconPosition right
      iconColor red
      iconSize md
    }`;

const ELEMENTS = {
  'spec.c4': `specification {
  element full {
    ${EVERY_FIELD}
  }
  element plain
  element partial {
    style {
      shape browser
      color amber
    }
  }
}
`,
  'model.c4': `model {
  kindOnly = full 'Kind only'
  ownOnly = plain 'Own only' {
    ${EVERY_FIELD}
  }
  combined = partial 'Combined' {
    style {
      color green
      opacity 40%
      multiple true
    }
  }
  bodyIcon = partial 'Body icon' {
    icon tech:go
  }
  bodyOverStyle = partial 'Body icon over style icon' {
    icon tech:go
    style {
      icon tech:java
    }
  }
  repeated = plain 'Repeated' {
    style {
      color red
      color blue
    }
  }
  overridden = full 'Overridden' {
    style {
      shape person
      opacity 10%
    }
  }
}
`,
};

/** The library's styles of an element, in the shape the oracle reads. */
const reported = (element: ElementInfo) => ({
  fqn: element.fqn,
  ownStyle: element.ownStyle,
  kindStyle: element.fromSpecification?.style,
  style: element.style,
});

describe('element styles (row 160)', SLOW, () => {
  it('reports own, kind and effective styles of every grammar field as LikeC4 computes them', async () => {
    const elements = LikeC4Mutator.fromFiles(ELEMENTS).listElements();
    // P: every style field of the grammar occurs as an own and as a kind value.
    const fields = (pick: (e: ElementInfo) => object | undefined): string[] =>
      [...new Set(elements.flatMap((e) => Object.keys(pick(e) ?? {})))].sort();
    expect(fields((e) => e.ownStyle)).toEqual([...ELEMENT_STYLE_FIELDS].sort());
    expect(fields((e) => e.fromSpecification?.style)).toEqual([...ELEMENT_STYLE_FIELDS].sort());

    await expectElementStylesAgreeWithLikeC4(ELEMENTS, elements.map(reported));
  });

  it('lets a body icon win over style { icon } (spike 01 s4)', async () => {
    // P: LikeC4 warns about the redundant style icon and uses the body icon (spike 01).
    const model = await buildLikeC4Model(ELEMENTS);
    expect(model.diagnostics.some((d) => d.includes('Redundant as icon defined on element'))).toBe(true);
    expect(model.elements['bodyOverStyle']?.style?.['icon']).toBe('tech:go');

    const element = LikeC4Mutator.fromFiles(ELEMENTS).getElement('bodyOverStyle')!;
    expect(element.ownStyle?.icon).toBe('tech:go');
    expect(element.style?.icon).toBe('tech:go');
  });
});

const RELATIONSHIPS = {
  'spec.c4': `specification {
  element system
  relationship async {
    color red
    line dotted
    head diamond
    multiple true
  }
  relationship plain
}
`,
  'model.c4': `model {
  a = system 'A'
  b = system 'B'
  a -[async]-> b 'kind only'
  a -> b 'own only' {
    style {
      line solid
      color blue
      head crow
      tail open
    }
  }
  a -[async]-> b 'kind and own' {
    style {
      color green
    }
  }
  a <-> b 'bidirectional'
  a -[async]<-> b 'bidirectional with a kind head'
  a <-> b 'bidirectional with a tail' {
    style {
      tail odot
    }
  }
  a -[plain]-> b 'kind without style'
}
`,
};

describe('relationship styles (row 161)', SLOW, () => {
  it('reports own, kind and effective styles, the bidirectional tail and the kind’s multiple as LikeC4 computes them', async () => {
    // P: for a bidirectional relationship without a written tail, LikeC4 reports `tail: normal` (spike 01).
    const model = await buildLikeC4Model(RELATIONSHIPS);
    const bidirectional = model.relations.find((r) => r.title === 'bidirectional');
    expect([bidirectional?.isBidirectional, bidirectional?.tail]).toEqual([true, 'normal']);

    const relationships = LikeC4Mutator.fromFiles(RELATIONSHIPS).getRelationships();
    await expectRelationshipsAgreeWithLikeC4(RELATIONSHIPS, relationships);

    const kinds = await likec4RelationshipKinds(RELATIONSHIPS);
    for (const relationship of relationships.filter((r) => r.kind !== undefined)) {
      // LikeC4 holds the kind's `multiple` in its style; the library reports it beside the style (D89).
      const { multiple, ...style } = kinds[relationship.kind!]?.style ?? {};
      expect(relationship.fromSpecification?.style ?? {}, relationship.title).toEqual(style);
      expect(relationship.fromSpecification?.multiple, relationship.title).toBe(multiple);
    }
    // P: the loop above saw a kind with `multiple` and one without.
    expect(relationships.map((r) => r.fromSpecification?.multiple)).toContain(true);
    expect(relationships.map((r) => r.fromSpecification?.multiple)).toContain(undefined);

    const own = relationships.find((r) => r.title === 'own only')!;
    expect(own.ownStyle).toEqual({ line: 'solid', color: 'blue', head: 'crow', tail: 'open' });
  });
});

describe('no theme or configured defaults (row 162)', SLOW, () => {
  const FILES = {
    'm.c4': "specification {\n  element system\n  relationship calls\n}\nmodel {\n  a = system 'A'\n  b = system 'B'\n  a -[calls]-> b 'plain'\n}\n",
  };

  it('reports no style for an element and a relationship that LikeC4’s $data gives none', async () => {
    // P: LikeC4's model holds no style value for them before theme defaults.
    const model = await buildLikeC4Model(FILES);
    expect(model.elements['a']?.style ?? {}).toEqual({});
    const [relation] = model.relations;
    expect([relation?.line, relation?.color, relation?.head, relation?.tail]).toEqual([undefined, undefined, undefined, undefined]);

    const m = LikeC4Mutator.fromFiles(FILES);
    const element = m.getElement('a')!;
    expect([element.ownStyle, element.style, element.fromSpecification?.style]).toEqual([undefined, undefined, undefined]);
    const [relationship] = m.getRelationships();
    expect([relationship!.ownStyle, relationship!.style, relationship!.fromSpecification?.style]).toEqual([undefined, undefined, undefined]);
    await expectElementStylesAgreeWithLikeC4(FILES, [reported(element)]);
    await expectRelationshipsAgreeWithLikeC4(FILES, [relationship!]);
  });
});
