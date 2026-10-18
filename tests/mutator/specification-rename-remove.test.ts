/**
 * Renames and removals of kinds and tags (lc4m-15.30 US-7; FR-002, FR-004,
 * D78, D79, D94, D109, D111, D113, D114, D128; rows 118–127 of the test
 * matrix): `renameKind`, `renameTag`, `removeKind` and `removeTag` on every
 * FR-002 place, positive and negated, with the declaration in one file and
 * the place in another.
 *
 * Expected values come from the inputs and from LikeC4: an expected text is
 * the input written with the new name; the computed model of the result
 * reports the new name on the same elements, relationships, nodes and view
 * contents as the computed model of the input reports the old one; the
 * positions of a removal's uses are those of LikeC4's linker
 * (`linkedKindReferences`).
 *
 * Abbreviations of the matrix: AWB (the accepted-write bundle), BI (an
 * `InvalidWriteError` on the named field, sources and reads unchanged), RRE
 * (BI with a `ReferencedRemovalError`), REFS (`error.references` equals a
 * literal list), REL (`error.related` equals a literal list), P (a
 * precondition asserted first).
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { KindType } from '../../src/mutator/specification-ops.js';
import { InvalidWriteError, ReferencedRemovalError, type RemovalReference } from '../../src/mutator/write-checks.js';
import {
  buildLikeC4Model,
  computedViews,
  expectAcceptedWrite,
  expectAgreesWithLikeC4,
  expectDeploymentNodesAgreeWithLikeC4,
  expectRelationshipsAgreeWithLikeC4,
  linkedKindReferences,
} from '../helpers/likec4-model.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 120_000 };

type Files = Record<string, string>;
type NameType = KindType | 'tag';

/** Every read the mutator offers, for BI. */
function reads(mutator: LikeC4Mutator): string {
  return JSON.stringify([
    mutator.getSpecification(),
    mutator.listElements(),
    mutator.getRelationships(),
    mutator.listDeploymentNodes(),
    mutator.listViews(),
  ]);
}

/** BI: `write` throws an `InvalidWriteError` on `field`; the sources and the reads are unchanged. */
function expectRejected(mutator: LikeC4Mutator, write: () => unknown, field: string): InvalidWriteError {
  const sources = mutator.serialize();
  const before = reads(mutator);
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(mutator.serialize()).toEqual(sources);
  expect(reads(mutator)).toBe(before);
  return error as InvalidWriteError;
}

/** RRE: BI where the error is a `ReferencedRemovalError`. */
function expectReferencedRemoval(mutator: LikeC4Mutator, write: () => unknown, field: string): ReferencedRemovalError {
  const error = expectRejected(mutator, write, field);
  expect(error).toBeInstanceOf(ReferencedRemovalError);
  return error as ReferencedRemovalError;
}

const rename = (m: LikeC4Mutator, type: NameType, from: string, to: string): unknown =>
  type === 'tag' ? m.renameTag(from, to) : m.renameKind(type, from, to);
const remove = (m: LikeC4Mutator, type: NameType, name: string): unknown =>
  type === 'tag' ? m.removeTag(name) : m.removeKind(type, name);

/** A computed LikeC4 model of `files`, as far as kind and tag names on it are compared. */
async function namedModel(files: Files): Promise<{
  elements: Record<string, { kind: string; tags: string[] }>;
  relations: string[];
  deployments: Record<string, { kind?: string; tags: string[] }>;
  deploymentRelations: string[];
  views: Record<string, { nodes: string[]; edges: Array<{ source: string; target: string }> }>;
}> {
  const model = await buildLikeC4Model(files);
  const tags = (value: { tags?: readonly string[] | null }): string[] => [...(value.tags ?? [])].sort();
  const views = await computedViews(files);
  return {
    elements: Object.fromEntries(
      Object.entries(model.elements).map(([id, e]) => [id, { kind: (e as unknown as { kind: string }).kind, tags: tags(e) }]),
    ),
    relations: model.relations.map((r) => JSON.stringify([r.source.model, r.target.model, r.title ?? '', r.kind ?? null, tags(r)])).sort(),
    deployments: Object.fromEntries(
      Object.entries(model.deployments.elements).map(([id, e]) => [id, { ...(e.kind !== undefined && { kind: e.kind }), tags: tags(e) }]),
    ),
    deploymentRelations: model.deployments.relations
      .map((r) => JSON.stringify([r.source, r.target, r.title ?? '', r.kind ?? null, tags(r)]))
      .sort(),
    views: Object.fromEntries(Object.entries(views).map(([id, v]) => [id, { nodes: v.nodes, edges: v.edges }])),
  };
}

/**
 * The computed model of `after` reports `to` where the computed model of
 * `before` reports the `type` name `from`, on the same elements,
 * relationships, deployment nodes and instances, and the views compute the
 * same nodes and edges.  `from` must occur in `before`'s model.
 */
async function expectRenamedInModel(before: Files, after: Files, type: NameType, from: string, to: string): Promise<void> {
  const [old, now] = [await namedModel(before), await namedModel(after)];
  const name = (t: NameType, value: string | null | undefined): string | null | undefined => (t === type && value === from ? to : value);
  const renamedTags = (list: string[]): string[] => list.map((tag) => name('tag', tag)!).sort();
  const elements = Object.fromEntries(
    Object.entries(old.elements).map(([id, e]) => [id, { kind: name('element', e.kind), tags: renamedTags(e.tags) }]),
  );
  const relations = old.relations
    .map((json) => {
      const [source, target, title, kind, list] = JSON.parse(json) as [string, string, string, string | null, string[]];
      return JSON.stringify([source, target, title, name('relationship', kind), renamedTags(list)]);
    })
    .sort();
  const deployments = Object.fromEntries(
    Object.entries(old.deployments).map(([id, e]) => [id, { ...(e.kind !== undefined && { kind: name('deploymentNode', e.kind) }), tags: renamedTags(e.tags) }]),
  );
  const deploymentRelations = old.deploymentRelations
    .map((json) => {
      const [source, target, title, kind, list] = JSON.parse(json) as [unknown, unknown, string, string | null, string[]];
      return JSON.stringify([source, target, title, name('relationship', kind), renamedTags(list)]);
    })
    .sort();
  // P: the old name is reported somewhere, so the comparison observes the rename.
  const reported = JSON.stringify(old);
  expect(reported.includes(`"${from}"`) || reported.includes(`\\"${from}\\"`), `'${from}' in the computed model before`).toBe(true);
  expect(now.elements).toEqual(elements);
  expect(now.relations).toEqual(relations);
  expect(now.deployments).toEqual(deployments);
  expect(now.deploymentRelations).toEqual(deploymentRelations);
  expect(now.views).toEqual(old.views);
}

// ----- FR-002 places ---------------------------------------------------------

/**
 * One FR-002 place: the name of type `type` written there, in the model file.
 * Each fragment is a function of the name (`#name` for a tag) and is written
 * into its block of the workspace.
 */
interface PlaceCase {
  label: string;
  type: NameType;
  /** The FR-002 place name (D128) */
  role: string;
  negated: boolean;
  /** The view the place lies in, when it lies in a named view */
  view?: string;
  spec?: (n: string) => string;
  model?: (n: string) => string;
  deployment?: (n: string) => string;
  views?: (n: string) => string;
}

const view = (body: string): string => `  view v {\n${body}  }\n`;
const elementView = (rule: string): string => view(`    ${rule}\n`);

const PLACES: PlaceCase[] = [
  // declarations
  { label: 'element declaration', type: 'element', role: 'declaration:element', negated: false, model: (n) => `  f = ${n} 'F'\n` },
  { label: 'deployment node declaration', type: 'deploymentNode', role: 'declaration:deploymentNode', negated: false, deployment: (n) => `  ${n} edge\n` },
  // connectors
  { label: 'model relationship', type: 'relationship', role: 'connector:model-relationship', negated: false, model: (n) => `  b -[${n}]-> a 'back'\n` },
  { label: 'model relationship, dot form', type: 'relationship', role: 'connector:model-relationship', negated: false, model: (n) => `  b .${n} a 'dotted'\n` },
  {
    label: 'deployment relationship',
    type: 'relationship',
    role: 'connector:deployment-relationship',
    negated: false,
    deployment: (n) => `  prod.ib -[${n}]-> prod.ia 'deployed'\n`,
  },
  {
    label: 'extend relationship',
    type: 'relationship',
    role: 'connector:extend-relationship',
    negated: false,
    model: (n) => `  extend a -[${n}]-> b 'second' {\n    #base\n  }\n`,
  },
  {
    label: 'dynamic step',
    type: 'relationship',
    role: 'connector:step',
    negated: false,
    view: 'dv',
    views: (n) => `  dynamic view dv {\n    a -[${n}]-> b\n  }\n`,
  },
  { label: 'relation predicate', type: 'relationship', role: 'connector:predicate', negated: false, view: 'v', views: (n) => elementView(`include a -[${n}]-> b`) },
  // tags lists
  { label: 'element tags', type: 'tag', role: 'tags:element', negated: false, model: (n) => `  g = sys 'G' {\n    ${n}\n  }\n` },
  { label: 'relationship tags', type: 'tag', role: 'tags:relationship', negated: false, model: (n) => `  b -> a 'tagged' {\n    ${n}\n  }\n` },
  { label: 'deployment node tags', type: 'tag', role: 'tags:deploymentNode', negated: false, deployment: (n) => `  env tagged {\n    ${n}\n  }\n` },
  {
    label: 'instance tags',
    type: 'tag',
    role: 'tags:instance',
    negated: false,
    deployment: (n) => `  env other {\n    ic = instanceOf a {\n      ${n}\n    }\n  }\n`,
  },
  {
    label: 'deployment relationship tags',
    type: 'tag',
    role: 'tags:deployment-relationship',
    negated: false,
    deployment: (n) => `  prod.ib -> prod.ia 'back' {\n    ${n}\n  }\n`,
  },
  { label: 'view tags', type: 'tag', role: 'tags:view', negated: false, view: 'v', views: (n) => view(`    ${n}\n    include *\n`) },
  { label: 'extend block tags', type: 'tag', role: 'tags:extend', negated: false, model: (n) => `  extend a {\n    ${n}\n  }\n` },
  { label: 'kind default tags', type: 'tag', role: 'tags:kind-default', negated: false, spec: (n) => `  element tagged {\n    ${n}\n  }\n` },
  // element.kind and element.tag
  ...(['=', '!='] as const).flatMap((op): PlaceCase[] => [
    { label: `element.kind ${op} in an include`, type: 'element', role: 'element.kind:predicate', negated: op === '!=', view: 'v', views: (n) => elementView(`include element.kind ${op} ${n}`) },
    { label: `element.tag ${op} in an exclude`, type: 'tag', role: 'element.tag:predicate', negated: op === '!=', view: 'v', views: (n) => view(`    include *\n    exclude element.tag ${op} ${n}\n`) },
    {
      label: `element.kind ${op} as a style target`,
      type: 'element',
      role: 'element.kind:style-target',
      negated: op === '!=',
      view: 'v',
      views: (n) => view(`    include *\n    style element.kind ${op} ${n} {\n      color red\n    }\n`),
    },
    {
      label: `element.tag ${op} as a style target of the views block`,
      type: 'tag',
      role: 'element.tag:style-target',
      negated: op === '!=',
      views: (n) => `  style element.tag ${op} ${n} {\n    color red\n  }\n`,
    },
    {
      label: `element.kind ${op} as a rank target`,
      type: 'element',
      role: 'element.kind:rank-target',
      negated: op === '!=',
      view: 'v',
      views: (n) => view(`    include *\n    rank same {\n      element.kind ${op} ${n}\n    }\n`),
    },
    {
      label: `element.tag ${op} as a rank target`,
      type: 'tag',
      role: 'element.tag:rank-target',
      negated: op === '!=',
      view: 'v',
      views: (n) => view(`    include *\n    rank same {\n      element.tag ${op} ${n}\n    }\n`),
    },
  ]),
  // where conditions
  ...(['is', 'is not'] as const).flatMap((op): PlaceCase[] => {
    const negated = op === 'is not';
    return [
      { label: `where kind ${op}, element kind`, type: 'element', role: 'where-kind:predicate', negated, view: 'v', views: (n) => elementView(`include * where kind ${op} ${n}`) },
      {
        label: `where kind ${op} in a deployment view, deployment node kind`,
        type: 'deploymentNode',
        role: 'where-kind:predicate',
        negated,
        view: 'dv',
        views: (n) => `  deployment view dv {\n    include * where kind ${op} ${n}\n  }\n`,
      },
      {
        label: `where tag ${op} in a group`,
        type: 'tag',
        role: 'where-tag:predicate',
        negated,
        view: 'v',
        views: (n) => view(`    group 'G' {\n      include * where tag ${op} ${n}\n    }\n`),
      },
      {
        label: `where tag ${op} in a dynamic view`,
        type: 'tag',
        role: 'where-tag:predicate',
        negated,
        view: 'dv',
        views: (n) => `  dynamic view dv {\n    include * where tag ${op} ${n}\n    a -> b\n  }\n`,
      },
      { label: `relation where kind ${op}`, type: 'relationship', role: 'relation-where-kind:predicate', negated, view: 'v', views: (n) => elementView(`include * -> * where kind ${op} ${n}`) },
      { label: `relation where tag ${op}`, type: 'tag', role: 'relation-where-tag:predicate', negated, view: 'v', views: (n) => elementView(`include * -> * where tag ${op} ${n}`) },
      {
        label: `participant kind ${op}, element kind`,
        type: 'element',
        role: 'participant-kind:predicate',
        negated,
        view: 'v',
        views: (n) => elementView(`include * -> * where source.kind ${op} ${n}`),
      },
      {
        label: `participant kind ${op} in a deployment view, deployment node kind`,
        type: 'deploymentNode',
        role: 'participant-kind:predicate',
        negated,
        view: 'dv',
        views: (n) => `  deployment view dv {\n    include prod\n    exclude * -> * where target.kind ${op} ${n}\n  }\n`,
      },
      { label: `participant tag ${op}`, type: 'tag', role: 'participant-tag:predicate', negated, view: 'v', views: (n) => elementView(`include * -> * where target.tag ${op} ${n}`) },
    ];
  }),
  { label: 'where not (tag is …)', type: 'tag', role: 'where-tag:predicate', negated: true, view: 'v', views: (n) => elementView(`include * where not (tag is ${n})`) },
];

/** The written form of the name `name` of type `type` at a place: `#name` for a tag. */
const written = (type: NameType, name: string): string => (type === 'tag' ? `#${name}` : name);

/** The declaration of `name` for `type` in a specification. */
const declaration = (type: NameType, name: string): string => (type === 'tag' ? `tag ${name}` : `${type} ${name}`);

/**
 * The workspace of `place` with the name `name`: the declaration in
 * `spec.c4`, the place in `model.c4`.  With `use`, the model also uses the
 * name outside the place (an element, node, relationship or tagged element),
 * so the computed model reports it.
 */
function workspace(place: PlaceCase, name: string, use: boolean): Files {
  const n = written(place.type, name);
  const uses: Partial<Record<NameType, { model?: string; deployment?: string }>> = use
    ? {
        element: { model: `  d = ${name} 'D'\n` },
        deploymentNode: { deployment: `  ${name} stage {\n    ix = instanceOf a\n  }\n` },
        relationship: { model: `  a -[${name}]-> b 'second'\n` },
        tag: { model: `  e = sys 'E' {\n    #${name}\n  }\n` },
      }
    : {};
  return {
    'spec.c4':
      `specification {\n  element sys\n  deploymentNode env\n  relationship uses\n  tag base\n  ${declaration(place.type, name)}\n` +
      `${place.spec?.(n) ?? ''}}\n`,
    'model.c4':
      `model {\n  a = sys 'A'\n  b = sys 'B'\n  a -[uses]-> b 'calls'\n${uses[place.type]?.model ?? ''}${place.model?.(n) ?? ''}}\n` +
      `deployment {\n  env prod {\n    ia = instanceOf a\n    ib = instanceOf b\n  }\n${uses[place.type]?.deployment ?? ''}${place.deployment?.(n) ?? ''}}\n` +
      `views {\n${place.views?.(n) ?? ''}}\n`,
  };
}

/** The column (1-based) of `offset` in `text`. */
function column(text: string, offset: number): number {
  return offset - (text.lastIndexOf('\n', offset - 1) + 1) + 1;
}

describe('rename at every FR-002 place (row 118)', SLOW, () => {
  it.each(PLACES.map((place) => [place.label, place] as const))('%s', async (_label, place) => {
    const before = workspace(place, 'old', true);
    // P: LikeC4 links the place to the declaration, with the case's negation.
    const linked = (await linkedKindReferences(before)).filter((r) => r.file === 'model.c4' || r.file === 'spec.c4');
    const atPlace = linked.filter((r) => `${r.place.construct}:${r.place.context}` === place.role && r.target === 'old');
    expect(atPlace.length, 'the place in LikeC4').toBeGreaterThan(0);
    expect(atPlace.every((r) => r.negated === place.negated), 'negation').toBe(true);

    const m = LikeC4Mutator.fromFiles(before);
    rename(m, place.type, 'old', 'fresh');
    const after = m.serialize();
    expect(after).toEqual(workspace(place, 'fresh', true));
    await expectAcceptedWrite(before, after);
    await expectRenamedInModel(before, after, place.type, 'old', 'fresh');
  });
});

describe('removal of a kind or tag used at one FR-002 place (row 120)', SLOW, () => {
  it.each(PLACES.map((place) => [place.label, place] as const))('%s', async (_label, place) => {
    const files = workspace(place, 'old', false);
    // P: LikeC4 links exactly one reference to the declaration, at the place.
    const linked = (await linkedKindReferences(files)).filter((r) => r.target === 'old');
    expect(linked.map((r) => `${r.place.construct}:${r.place.context}`)).toEqual([place.role]);
    const [use] = linked;

    const m = LikeC4Mutator.fromFiles(files);
    const error = expectReferencedRemoval(m, () => remove(m, place.type, 'old'), 'name');
    const expected: RemovalReference[] = [
      {
        file: use!.file,
        line: use!.line,
        column: column(files[use!.file]!, use!.offset),
        role: place.role as RemovalReference['role'],
        cascadable: false,
        ...(place.view !== undefined && { view: place.view }),
      },
    ];
    expect(error.references).toEqual(expected);
  });
});

// ----- isolation of same-spelled names of another type ----------------------

/**
 * Two types sharing a spelling (row 119).  `files(a, b)` writes the renamed
 * type's name as `a` and the other type's as `b`; the rename of the first
 * type's `x` must leave every byte of the other type's declaration and uses.
 */
interface IsolationCase {
  label: string;
  type: NameType;
  files: (a: string, b: string) => Files;
  /** The other type's values as LikeC4 computes them, compared through the library's reads */
  check: (m: LikeC4Mutator, files: Files) => Promise<void>;
}

const VM = (a: string, b: string): Files => ({
  'spec.c4': `specification {\n  element sys\n  element ${a}\n  deploymentNode ${b}\n}\n`,
  'model.c4':
    `model {\n  web = sys 'Web'\n  m = ${a} 'M'\n}\ndeployment {\n  ${b} host {\n    iw = instanceOf web\n  }\n  ${b} spare\n}\n` +
    `views {\n  view ev {\n    include element.kind = ${a}\n  }\n  deployment view dv {\n    include host\n  }\n}\n`,
});
const VM_NODES = (a: string, b: string): Files => ({
  'spec.c4': `specification {\n  element sys\n  deploymentNode ${a}\n  element ${b}\n}\n`,
  'model.c4':
    `model {\n  web = sys 'Web'\n  m = ${b} 'M'\n}\ndeployment {\n  ${a} host {\n    iw = instanceOf web\n  }\n}\n` +
    `views {\n  view ev {\n    include element.kind = ${b}\n  }\n  deployment view dv {\n    include host\n  }\n}\n`,
});
const REL_ELEMENT = (a: string, b: string): Files => ({
  'spec.c4': `specification {\n  element sys\n  element ${b}\n  relationship ${a}\n}\n`,
  'model.c4':
    `model {\n  web = sys 'Web'\n  m = ${b} 'M'\n  web -[${a}]-> m 'calls'\n}\nviews {\n  view ev {\n    include element.kind = ${b}, * -> * where kind is ${a}\n` +
    `    include * where kind is ${b}\n  }\n}\n`,
});
const ELEMENT_REL = (a: string, b: string): Files => REL_ELEMENT(b, a);
const TAG_KIND = (a: string, b: string): Files => ({
  'spec.c4': `specification {\n  element sys\n  element ${b}\n  tag ${a}\n}\n`,
  'model.c4': `model {\n  web = sys 'Web' {\n    #${a}\n  }\n  m = ${b} 'M'\n}\nviews {\n  view ev {\n    include element.kind = ${b}, element.tag = #${a}\n  }\n}\n`,
});
const KIND_TAG = (a: string, b: string): Files => TAG_KIND(b, a);

const ISOLATION: IsolationCase[] = [
  {
    label: 'element kind x beside deployment node kind x',
    type: 'element',
    files: VM,
    check: (m, files) => expectDeploymentNodesAgreeWithLikeC4(files, m.listDeploymentNodes()),
  },
  {
    label: 'deployment node kind x beside element kind x',
    type: 'deploymentNode',
    files: VM_NODES,
    check: (m, files) => expectAgreesWithLikeC4(files, 'm', m.getElement('m')!),
  },
  {
    label: 'relationship kind x beside element kind x',
    type: 'relationship',
    files: REL_ELEMENT,
    check: (m, files) => expectAgreesWithLikeC4(files, 'm', m.getElement('m')!),
  },
  {
    label: 'element kind x beside relationship kind x',
    type: 'element',
    files: ELEMENT_REL,
    check: (m, files) => expectRelationshipsAgreeWithLikeC4(files, m.getRelationships()),
  },
  {
    label: 'tag x beside element kind x',
    type: 'tag',
    files: TAG_KIND,
    check: (m, files) => expectAgreesWithLikeC4(files, 'm', m.getElement('m')!),
  },
  {
    label: 'element kind x beside tag x',
    type: 'element',
    files: KIND_TAG,
    check: (m, files) => expectAgreesWithLikeC4(files, 'web', m.getElement('web')!),
  },
];

describe('a rename leaves a same-spelled name of another type (row 119)', SLOW, () => {
  it.each(ISOLATION.map((c) => [c.label, c] as const))('%s', async (_label, c) => {
    const before = c.files('x', 'x');
    const m = LikeC4Mutator.fromFiles(before);
    rename(m, c.type, 'x', 'y');
    const after = m.serialize();
    expect(after).toEqual(c.files('y', 'x'));
    await expectAcceptedWrite(before, after);
    await expectRenamedInModel(before, after, c.type, 'x', 'y');
    await c.check(m, after);
  });
});

describe('a relationship kind never takes a shared condition (row 119)', SLOW, () => {
  // `where kind is x` names element and deployment node kinds only (FR-002): the element kind `x` here.
  const files = (relationship: boolean): Files => ({
    'spec.c4': `specification {\n  element sys\n  element x\n${relationship ? '  relationship x\n' : ''}}\n`,
    'model.c4': "model {\n  web = sys 'Web'\n  m = x 'M'\n}\nviews {\n  view ev {\n    include * where kind is x\n  }\n}\n",
  });

  it('removes an unused relationship kind beside an element kind of that name used in a condition', async () => {
    const before = files(true);
    const m = LikeC4Mutator.fromFiles(before);
    m.removeKind('relationship', 'x');
    const after = m.serialize();
    expect(after).toEqual(files(false));
    await expectAcceptedWrite(before, after);
    await expectAgreesWithLikeC4(after, 'm', m.getElement('m')!);
  });
});

// ----- removal of an unused kind or tag --------------------------------------

describe('removal of an unused kind or tag (row 121)', SLOW, () => {
  const OTHERS = `specification {\n  element sys\n  relationship uses\n}\nmodel {\n  a = sys 'A'\n  b = sys 'B'\n  a -[uses]-> b\n}\nviews {\n  view v {\n    include *\n  }\n}\n`;
  it.each([
    ['element', 'element spare'],
    ['deploymentNode', 'deploymentNode spare'],
    ['relationship', 'relationship spare'],
    ['tag', 'tag spare {\n    color #ff0000\n  }'],
  ] as const)('removes the %s declaration and keeps the other declarations', async (type, text) => {
    const before = { 'spec.c4': `specification {\n  element keep\n  ${text}\n  tag keepTag\n}\n`, 'model.c4': OTHERS };
    const m = LikeC4Mutator.fromFiles(before);
    remove(m, type, 'spare');
    const after = m.serialize();
    expect(after).toEqual({ 'spec.c4': 'specification {\n  element keep\n  tag keepTag\n}\n', 'model.c4': OTHERS });
    await expectAcceptedWrite(before, after);
  });

  it.each(['element', 'deploymentNode', 'relationship', 'tag'] as const)('keeps the emptied specification block after the %s removal', async (type) => {
    const before = { 'spec.c4': `specification {\n  ${declaration(type, 'last')}\n}\n`, 'model.c4': OTHERS };
    const m = LikeC4Mutator.fromFiles(before);
    remove(m, type, 'last');
    const after = m.serialize();
    expect(after).toEqual({ 'spec.c4': 'specification {\n}\n', 'model.c4': OTHERS });
    await expectAcceptedWrite(before, after);
  });
});

// ----- affected mode ---------------------------------------------------------

describe('a kind or tag at an unmodelled place blocks the rename and the removal (row 122)', SLOW, () => {
  const OPAQUE: Files = {
    'spec.c4': 'specification {\n  element sys\n  relationship old\n}\n',
    'model.c4':
      "model {\n  a = sys 'A'\n  b = sys 'B'\n  a -> b\n}\nviews {\n  dynamic view d {\n    a -> b\n    opt {\n      a -[old]-> b\n    }\n  }\n}\n",
  };
  const GLOBAL: Files = {
    'spec.c4': 'specification {\n  element sys\n  tag old\n}\n',
    'model.c4': "model {\n  a = sys 'A'\n}\nglobal {\n  predicateGroup tagged {\n    include * where tag is #old\n  }\n}\n",
  };

  it.each([
    ['a relationship kind in an opaque step connector', 'relationship', OPAQUE, { file: 'model.c4', line: 10, column: 11, role: 'opaque-flow', cascadable: false, view: 'd' }],
    ['a tag in a global predicate', 'tag', GLOBAL, { file: 'model.c4', line: 6, column: 28, role: 'global-or-import', cascadable: false }],
  ] as const)('%s', async (_label, type, files, reference) => {
    // P: LikeC4 links the name there to the declaration.
    const linked = (await linkedKindReferences(files)).filter((r) => r.target === 'old');
    expect(linked.map((r) => [r.unmodelled, r.line, column(files[r.file]!, r.offset)])).toEqual([[true, reference.line, reference.column]]);

    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, () => rename(m, type, 'old', 'fresh'), 'name');
    const error = expectReferencedRemoval(m, () => remove(m, type, 'old'), 'name');
    expect(error.references).toEqual([reference]);
  });
});

// ----- element and deployment node kinds sharing a name (D78) ---------------

/**
 * The D78 fixture: element kind `vm` and deployment node kind `vm`, with the
 * rule `rule` (a function of the kind name) in the element view (`ev`) or
 * the deployment view (`dv`); line 12 of `model.c4` holds the element
 * view's rule, line 15 the deployment view's.
 */
function sharedVm(element: string, node: string, at: 'ev' | 'dv' | undefined, rule: (name: string) => string): Files {
  return {
    'spec.c4': `specification {\n  element sys\n  element ${element}\n  deploymentNode ${node}\n}\n`,
    'model.c4':
      `model {\n  a = sys 'A'\n  m = ${element} 'M'\n}\ndeployment {\n  ${node} host {\n    ia = instanceOf a\n  }\n}\nviews {\n` +
      `  view ev {\n    ${at === 'ev' ? rule('vm') : 'include *'}\n  }\n  deployment view dv {\n    ${at === 'dv' ? rule('vm') : 'include host'}\n  }\n}\n`,
  };
}

describe('the D78 matrix (row 123)', SLOW, () => {
  const conditions = [
    ['where kind is vm', (n: string) => `include * where kind is ${n}`],
    ['where kind is not vm', (n: string) => `include * where kind is not ${n}`],
  ] as const;

  it.each(
    (['element', 'deploymentNode'] as const).flatMap((type) =>
      conditions.flatMap(([label, rule]) => (['ev', 'dv'] as const).map((at) => [`${type}, ${label} in ${at}`, type, at, rule] as const)),
    ),
  )('rejects the rename: %s', async (_label, type, at, rule) => {
    const files = sharedVm('vm', 'vm', at, rule);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.renameKind(type, 'vm', 'other'), 'name');
    expect(error.related).toEqual([{ file: 'model.c4', line: at === 'ev' ? 12 : 15, column: 21, construct: 'where-condition' }]);
  });

  it.each(['element', 'deploymentNode'] as const)('accepts the %s rename without a condition', async (type) => {
    const before = sharedVm('vm', 'vm', undefined, () => '');
    const m = LikeC4Mutator.fromFiles(before);
    m.renameKind(type, 'vm', 'other');
    const after = m.serialize();
    expect(after).toEqual(type === 'element' ? sharedVm('other', 'vm', undefined, () => '') : sharedVm('vm', 'other', undefined, () => ''));
    await expectAcceptedWrite(before, after);
  });
});

describe('a rename into the name of the other type while a condition names it (row 124)', SLOW, () => {
  it('rejects the element kind rename on newName, listing the condition', () => {
    const files = sharedVm('app', 'vm', 'ev', (n) => `include * where kind is ${n}`);
    const m = LikeC4Mutator.fromFiles(files);
    const error = expectRejected(m, () => m.renameKind('element', 'app', 'vm'), 'newName');
    expect(error.related).toEqual([{ file: 'model.c4', line: 12, column: 21, construct: 'where-condition' }]);
  });
});

// ----- D109 ------------------------------------------------------------------

describe('element.kind and element.tag in a deployment view (row 125)', SLOW, () => {
  const D109 = (type: 'element' | 'tag', name: string): Files => {
    const n = type === 'tag' ? `#${name}` : name;
    const expression = type === 'tag' ? 'element.tag' : 'element.kind';
    return {
      'spec.c4': `specification {\n  element sys\n  deploymentNode env\n  ${declaration(type, name)}\n}\n`,
      'model.c4':
        `model {\n  a = sys 'A'${type === 'tag' ? ` {\n    ${n}\n  }` : `\n  b = ${name} 'B'`}\n}\ndeployment {\n  env prod {\n    ia = instanceOf a\n  }\n}\n` +
        `views {\n  deployment view dv {\n    include prod\n    include ${expression} = ${n}\n    exclude ${expression} != ${n}\n` +
        `    style ${expression} = ${n} {\n      color red\n    }\n  }\n}\n`,
    };
  };

  it.each(['element', 'tag'] as const)('renames the %s in the rules of a view LikeC4 does not compute', async (type) => {
    const before = D109(type, 'old');
    // P: LikeC4 drops the view from its computed views (spike 06).
    expect(Object.keys(await computedViews(before))).not.toContain('dv');
    const m = LikeC4Mutator.fromFiles(before);
    rename(m, type, 'old', 'fresh');
    const after = m.serialize();
    await expectAcceptedWrite(before, after);
    const e = type === 'tag' ? 'element.tag' : 'element.kind';
    const n = type === 'tag' ? '#fresh' : 'fresh';
    expect(m.getView('dv')!.rules.map((rule) => rule.text)).toEqual([
      'include prod',
      `include ${e} = ${n}`,
      `exclude ${e} != ${n}`,
      `style ${e} = ${n} {\n      color red\n    }`,
    ]);
  });
});

// ----- rejections ------------------------------------------------------------

describe('rejections (row 126)', SLOW, () => {
  const FILES: Files = {
    'spec.c4': 'specification {\n  element box\n  element taken\n  deploymentNode env\n  relationship uses\n  tag hot\n  tag cold\n}\n',
    'model.c4': "model {\n  a = box 'A'\n  b = box 'B'\n  a -[uses]-> b\n}\n",
  };
  const TWICE: Files = {
    'spec.c4': 'specification {\n  element box\n  tag hot\n}\n',
    'other.c4': 'specification {\n  element box\n  tag hot\n}\n',
  };

  it.each([
    ['an invalid new element kind name', FILES, (m: LikeC4Mutator) => m.renameKind('element', 'box', 'self'), 'newName'],
    ['a new element kind name with a dot', FILES, (m: LikeC4Mutator) => m.renameKind('element', 'box', 'a.b'), 'newName'],
    ['an invalid new tag name', FILES, (m: LikeC4Mutator) => m.renameTag('hot', '1x'), 'newName'],
    ['a new kind name already declared for the type', FILES, (m: LikeC4Mutator) => m.renameKind('element', 'box', 'taken'), 'newName'],
    ['a new tag name already declared', FILES, (m: LikeC4Mutator) => m.renameTag('hot', 'cold'), 'newName'],
    ['a rename of an undeclared kind', FILES, (m: LikeC4Mutator) => m.renameKind('relationship', 'box', 'crate'), 'name'],
    ['a rename of an undeclared tag', FILES, (m: LikeC4Mutator) => m.renameTag('warm', 'hotter'), 'name'],
    ['a kind type that is not one', FILES, (m: LikeC4Mutator) => m.renameKind('view' as KindType, 'box', 'crate'), 'type'],
    ['a rename of a kind declared twice', TWICE, (m: LikeC4Mutator) => m.renameKind('element', 'box', 'crate'), 'name'],
    ['a rename of a tag declared twice', TWICE, (m: LikeC4Mutator) => m.renameTag('hot', 'warm'), 'name'],
    ['a removal of a kind declared twice', TWICE, (m: LikeC4Mutator) => m.removeKind('element', 'box'), 'name'],
    ['a removal of a tag declared twice', TWICE, (m: LikeC4Mutator) => m.removeTag('hot'), 'name'],
  ] as const)('rejects %s', (_label, files, write, field) => {
    const m = LikeC4Mutator.fromFiles(files);
    expectRejected(m, () => write(m), field);
  });

  it.each([
    ['kind', (m: LikeC4Mutator) => m.removeKind('deploymentNode', 'box')],
    ['tag', (m: LikeC4Mutator) => m.removeTag('box')],
  ] as const)('rejects the removal of an undeclared %s with a plain InvalidWriteError', (_label, write) => {
    const m = LikeC4Mutator.fromFiles(FILES);
    const error = expectRejected(m, () => write(m), 'name');
    expect(error).not.toBeInstanceOf(ReferencedRemovalError);
  });
});

// ----- text kept as written --------------------------------------------------

describe('text kept as written (row 127)', SLOW, () => {
  const FILES = (tag: string, kind: string): Files => ({
    'spec.c4': `specification {\n  element sys\n  element ${kind}\n  tag ${tag} {\n    color #22aa66\n  }\n}\n`,
    'model.c4':
      `model {\n  a = sys 'A' {\n    #${tag}\n    description 'see #old and old'\n  }\n  ${kind} b 'B' {\n    description '''\n      **#old** old\n    '''\n  }\n}\n`,
  });

  it('keeps the color block of a renamed tag and #old inside strings', async () => {
    const before = FILES('old', 'old');
    const m = LikeC4Mutator.fromFiles(before);
    m.renameTag('old', 'fresh');
    const after = m.serialize();
    expect(after).toEqual(FILES('fresh', 'old'));
    await expectAcceptedWrite(before, after);
  });

  it('rewrites the kind token of a kind-first declaration and keeps its name and strings', async () => {
    const before = FILES('old', 'old');
    const m = LikeC4Mutator.fromFiles(before);
    m.renameKind('element', 'old', 'fresh');
    const after = m.serialize();
    expect(after).toEqual(FILES('old', 'fresh'));
    await expectAcceptedWrite(before, after);
    expect(m.getElement('b')).toMatchObject({ kind: 'fresh' });
  });
});
