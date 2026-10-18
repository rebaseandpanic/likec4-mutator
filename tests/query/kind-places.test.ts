/**
 * The FR-002 place catalogue (`kindPlaces`) against LikeC4's own linker
 * (row 117 of lc4m-15.30): on the reference fixtures `refs-catalog` and
 * `refs-flows` (FX) it equals `linkedKindReferences` one to one on
 * (file, offset, text, kind type, place, negation), with unmodelled places
 * excluded on both sides, and every `where … kind is` and participant kind
 * condition has the shared kind type.  The expected side is LikeC4 only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4Parser } from '../../src/parser/parser.js';
import { kindPlaces } from '../../src/query/kind-places.js';
import { linkedKindReferences, type LinkedKindReference } from '../helpers/likec4-model.js';

/** The files of a fixture, keyed by `/`-separated path, loaded in byte order of the paths. */
function readFixture(name: string): Record<string, string> {
  const root = join(import.meta.dirname, '..', 'fixtures', name);
  const paths: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else paths.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return Object.fromEntries(paths.sort().map((path) => [path, readFileSync(join(root, ...path.split('/')), 'utf8')]));
}

const FX = ['refs-catalog', 'refs-flows'].map((name) => ({ name, files: readFixture(name) }));

/** The oracle's place name of a reference, in the `<construct>:<context>` form of D128. */
const placeName = (reference: LinkedKindReference): string => `${reference.place.construct}:${reference.place.context}`;

describe('FR-002 place catalogue (row 117)', () => {
  it('equals LikeC4’s linked kind and tag references on FX, unmodelled places excluded', async () => {
    // P: FX has unmodelled kind or tag places, which the comparison leaves out.
    const unmodelled = (await Promise.all(FX.map(({ files }) => linkedKindReferences(files)))).flat().filter((r) => r.unmodelled);
    expect(unmodelled.length).toBeGreaterThan(0);
    for (const { name, files } of FX) {
      const linked = await linkedKindReferences(files);
      const modelled = linked.filter((reference) => !reference.unmodelled);
      // P: the fixture has modelled places, negated ones and shared ones.
      expect(modelled.length, `${name}: modelled places`).toBeGreaterThan(0);
      expect(modelled.some((reference) => reference.negated), `${name}: a negated place`).toBe(true);
      expect(modelled.some((reference) => reference.kindType === 'shared'), `${name}: a shared place`).toBe(true);

      const expected = modelled.map((reference) =>
        JSON.stringify([reference.file, reference.offset, reference.text, reference.kindType, placeName(reference), reference.negated]),
      );
      const documents = Object.entries(files).map(([file, source]) => ({ file, parsed: new C4Parser().parse(source) }));
      const actual = kindPlaces(documents).map((place) =>
        JSON.stringify([place.file, place.offset, place.text, place.kindType, place.role, place.negated]),
      );
      expect(actual, name).toEqual(expected);
    }
  });

  it('gives every `where … kind is` and participant kind condition the shared kind type', async () => {
    for (const { name, files } of FX) {
      const conditions = (await linkedKindReferences(files)).filter(
        (reference) => !reference.unmodelled && ['where-kind', 'participant-kind'].includes(reference.place.construct),
      );
      // P: both conditions, positive and negated, occur in the fixture.
      expect(new Set(conditions.map((reference) => `${reference.place.construct}:${reference.negated}`)).size, name).toBe(4);
      const documents = Object.entries(files).map(([file, source]) => ({ file, parsed: new C4Parser().parse(source) }));
      const places = kindPlaces(documents).filter((place) => /^(where-kind|participant-kind):/.test(place.role));
      expect(places.length, name).toBe(conditions.length);
      expect(places.filter((place) => place.kindType !== 'shared'), name).toEqual([]);
    }
  });
});

describe('negation by the != and !== operators (row 117)', () => {
  // LikeC4 reads an operator starting with `!=` as not-equal (`parseEquals`), so `!==` negates like `!=`.
  const files = {
    'm.c4':
      "specification {\n  element x\n  tag t\n}\nmodel {\n  a = x 'A'\n}\nviews {\n  view v {\n" +
      '    include * where kind !== x, * where tag !== #t, * where kind != x\n' +
      '    include * -> * where source.kind !== x and target.tag !== #t\n  }\n}\n',
  };

  it('marks every != and !== condition negated, as LikeC4 does', async () => {
    const linked = (await linkedKindReferences(files)).filter((reference) => reference.place.construct !== 'declaration');
    expect(linked.map((reference) => reference.negated)).toEqual([true, true, true, true, true]);
    const places = kindPlaces([{ file: 'm.c4', parsed: new C4Parser().parse(files['m.c4']) }]).filter((place) => !place.role.startsWith('declaration'));
    expect(places.map((place) => [place.role, place.negated])).toEqual([
      ['where-kind:predicate', true],
      ['where-tag:predicate', true],
      ['where-kind:predicate', true],
      ['participant-kind:predicate', true],
      ['participant-tag:predicate', true],
    ]);
  });
});

describe('a kind on a later hop of a step chain (row 117)', () => {
  const files = {
    'm.c4':
      "specification {\n  element x\n  relationship k\n}\nmodel {\n  a = x 'A'\n  b = x 'B'\n  c = x 'C'\n}\nviews {\n  dynamic view d {\n    a -> b -[k]-> c\n  }\n}\n",
  };

  it('lists the kind of the second hop as a step connector, as LikeC4 links it', async () => {
    const linked = (await linkedKindReferences(files)).filter((reference) => !reference.unmodelled && reference.place.construct !== 'declaration');
    // P: LikeC4 links the k of the second hop as a step connector.
    expect(linked.map((reference) => [reference.text, placeName(reference)])).toEqual([['k', 'connector:step']]);
    const expected = linked.map((reference) => JSON.stringify([reference.file, reference.offset, reference.text, reference.kindType, placeName(reference)]));
    const places = kindPlaces([{ file: 'm.c4', parsed: new C4Parser().parse(files['m.c4']) }]).filter((place) => !place.role.startsWith('declaration'));
    expect(places.map((place) => JSON.stringify([place.file, place.offset, place.text, place.kindType, place.role]))).toEqual(expected);
  });
});
