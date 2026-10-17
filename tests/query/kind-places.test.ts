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
