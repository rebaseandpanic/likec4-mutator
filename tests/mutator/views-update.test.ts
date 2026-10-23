/**
 * `updateView` (US-6, D33, D42; rows 57–62 of the lc4m-15.29 test matrix):
 * strings, tags, links and `autoLayout` REPLACE, placement in the body,
 * untouched text, view addressing and writes next to errors.
 *
 * Expected texts come from the request and the input; expected values from
 * LikeC4 1.60.0's parse and computed views; every accepted write passes the
 * conventions of `view-writes.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import { InvalidWriteError } from '../../src/mutator/write-checks.js';
import { computedViews, expectValidLikeC4, linkedViewReferences, parsedViews } from '../helpers/likec4-model.js';
import { expectValidViewWrite, expectViewWriteOnInvalidInput } from '../helpers/view-writes.js';

// Each accepted write is checked against several LikeC4 builds.
const SLOW = { timeout: 60_000 };

/** The write is rejected on `field` and changes nothing (BI). */
function expectRejected(m: LikeC4Mutator, write: () => unknown, field: string): void {
  const files = m.serialize();
  const views = m.listViews();
  let error: unknown;
  try {
    write();
  } catch (err) {
    error = err;
  }
  expect(error, 'the write is rejected').toBeInstanceOf(InvalidWriteError);
  expect((error as InvalidWriteError).field).toBe(field);
  expect(m.serialize()).toEqual(files);
  expect(m.listViews()).toEqual(views);
}

const MODEL = `specification {
  element system
  tag next
  tag beta
}
model {
  a = system
  b = system
  a -> b
}
`;

/** `MODEL` with `views` as its views block. */
const files = (views: string): Record<string, string> => ({ 'm.c4': `${MODEL}views {\n${views}}\n` });

// ---------------------------------------------------------------------------
// Row 57: strings and placement
// ---------------------------------------------------------------------------

describe('strings and placement (row 57)', SLOW, () => {
  it('replaces title and description', async () => {
    const before = files("  view v {\n    title 'Old'\n    description 'Old text'\n    include *\n  }\n");
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.updateView('v', { title: 'New', description: 'New text' })).toEqual({ changedFiles: ['m.c4'] });
    expect(m.serialize()).toEqual(files("  view v {\n    title 'New'\n    description 'New text'\n    include *\n  }\n"));
    expect(m.getView('v')).toMatchObject({ title: 'New', description: { txt: 'New text' } });
    await expectValidViewWrite(m, before);
  });

  it('removes title and description given null', async () => {
    const before = files("  view v {\n    title 'Old'\n    description 'Old text'\n    include *\n  }\n");
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('v', { title: null, description: null });
    expect(m.serialize()).toEqual(files('  view v {\n    include *\n  }\n'));
    expect(m.getView('v')!.title).toBeUndefined();
    expect(m.getView('v')!.description).toBeUndefined();
    await expectValidViewWrite(m, before);
  });

  it("writes '' as an empty title, not as a removal", async () => {
    const before = files("  view v {\n    title 'Old'\n    include *\n  }\n");
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('v', { title: '' });
    const after = m.serialize();
    expect(after).toEqual(files("  view v {\n    title ''\n    include *\n  }\n"));
    // OP: LikeC4 parses the empty title as ''.
    expect((await parsedViews(after)).find((e) => e.view.id === 'v')!.view.title).toBe('');
    expect(m.getView('v')!.title).toBe('');
    await expectValidViewWrite(m, before);
  });

  it('inserts a title after the tags and before the first rule of an element view', async () => {
    const before = files('  view v {\n    #next\n    include a\n    include b\n  }\n');
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('v', { title: 'T', description: 'D' });
    expect(m.serialize()).toEqual(files("  view v {\n    #next\n    title 'T'\n    description 'D'\n    include a\n    include b\n  }\n"));
    await expectValidViewWrite(m, before);
  });

  it('inserts a title before the first step of a dynamic view whose rule follows a step', async () => {
    const before = files('  dynamic view d {\n    a -> b\n    include a\n  }\n');
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('d', { title: 'Flow' });
    expect(m.serialize()).toEqual(files("  dynamic view d {\n    title 'Flow'\n    a -> b\n    include a\n  }\n"));
    await expectValidViewWrite(m, before);
  });

  it('gives a bodyless view a body, which LikeC4 then makes a view', async () => {
    const before = files('  view v\n  view w {\n    include *\n  }\n');
    await expectValidLikeC4(before);
    // OP: LikeC4 makes no view of `view v` before the write.
    expect(Object.keys(await computedViews(before))).not.toContain('v');
    const m = LikeC4Mutator.fromFiles(before);
    expect(m.getView('v')!.inModel).toBe(false);
    m.updateView('v', { title: 'Now a view' });
    const after = m.serialize();
    expect(after).toEqual(files("  view v {\n    title 'Now a view'\n  }\n  view w {\n    include *\n  }\n"));
    expect(m.getView('v')).toMatchObject({ inModel: true, title: 'Now a view' });
    // OP: it is among LikeC4's views after the write.
    expect(Object.keys(await computedViews(after))).toContain('v');
    await expectValidViewWrite(m, before);
  });
});

// ---------------------------------------------------------------------------
// Row 58: tags and links
// ---------------------------------------------------------------------------

describe('tags and links REPLACE (row 58)', SLOW, () => {
  const BEFORE = files("  view v {\n    #next\n    link https://example.com/old 'Old'\n    include *\n  }\n");

  it('replaces the tags and the links', async () => {
    await expectValidLikeC4(BEFORE);
    const m = LikeC4Mutator.fromFiles(BEFORE);
    m.updateView('v', {
      tags: ['beta', 'next'],
      links: [{ url: 'https://example.com/a', label: 'A' }, { url: '/docs/b.md' }],
    });
    const after = m.serialize();
    expect(after).toEqual(
      files("  view v {\n    #beta\n    #next\n    link https://example.com/a 'A'\n    link /docs/b.md\n    include *\n  }\n"),
    );
    // Tags in LikeC4's parse order, links with URL and title.
    const parsed = (await parsedViews(after)).find((e) => e.view.id === 'v')!.view as { tags?: string[] | null; links?: Array<{ url: string; title?: string }> | null };
    expect(m.getView('v')!.tags).toEqual(parsed.tags);
    expect(m.getView('v')!.links).toEqual([{ url: 'https://example.com/a', label: 'A' }, { url: '/docs/b.md' }]);
    expect(parsed.links!.map((l) => [l.url, l.title])).toEqual([
      ['https://example.com/a', 'A'],
      ['/docs/b.md', undefined],
    ]);
    await expectValidViewWrite(m, BEFORE);
  });

  it('removes tags and links given []', async () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    m.updateView('v', { tags: [], links: [] });
    expect(m.serialize()).toEqual(files('  view v {\n    include *\n  }\n'));
    await expectValidViewWrite(m, BEFORE);
  });

  it('rejects an undeclared tag on tags[i]', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.updateView('v', { tags: ['next', 'nope'] }), 'tags[1]');
  });

  it('rejects an invalid link on links[i].url with an InvalidWriteError', () => {
    const m = LikeC4Mutator.fromFiles(BEFORE);
    expectRejected(m, () => m.updateView('v', { links: [{ url: 'https://example.com/ok' }, { url: 'not a url' }] }), 'links[1].url');
  });
});

// ---------------------------------------------------------------------------
// Row 59: one effective autoLayout
// ---------------------------------------------------------------------------

describe('one effective autoLayout (row 59)', SLOW, () => {
  const TWO = files('  view v {\n    include *\n    autoLayout TopBottom\n    exclude b\n    autoLayout BottomTop\n  }\n');

  it('replaces the last of two rules in place and leaves the first unchanged', async () => {
    await expectValidLikeC4(TWO);
    const m = LikeC4Mutator.fromFiles(TWO);
    m.updateView('v', { autoLayout: 'LeftRight 120 40' });
    const after = m.serialize();
    expect(after).toEqual(files('  view v {\n    include *\n    autoLayout TopBottom\n    exclude b\n    autoLayout LeftRight 120 40\n  }\n'));
    // OP: LikeC4 computes the view with the requested layout.
    expect((await computedViews(after)).v!.autoLayout).toMatchObject({ direction: 'LR', rankSep: 120, nodeSep: 40 });
    await expectValidViewWrite(m, TWO);
  });

  it('appends one as the last rule of a view without one', async () => {
    const before = files('  dynamic view d {\n    include a\n    a -> b\n  }\n');
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('d', { autoLayout: 'RightLeft' });
    const after = m.serialize();
    expect(after).toEqual(files('  dynamic view d {\n    include a\n    a -> b\n    autoLayout RightLeft\n  }\n'));
    expect(m.getView('d')!.rules.map((r) => r.kind)).toEqual(['include', 'autoLayout']);
    expect((await computedViews(after)).d!.autoLayout.direction).toBe('RL');
    await expectValidViewWrite(m, before);
  });

  it('removes every autoLayout rule given null', async () => {
    const m = LikeC4Mutator.fromFiles(TWO);
    m.updateView('v', { autoLayout: null });
    expect(m.serialize()).toEqual(files('  view v {\n    include *\n    exclude b\n  }\n'));
    await expectValidViewWrite(m, TWO);
  });

  it.each(['Sideways', 'LeftRight x', 'LeftRight 10 20 30', ''])('rejects %j on autoLayout', (autoLayout) => {
    const m = LikeC4Mutator.fromFiles(TWO);
    expectRejected(m, () => m.updateView('v', { autoLayout }), 'autoLayout');
  });
});

// ---------------------------------------------------------------------------
// Row 60: untouched text (INV-5)
// ---------------------------------------------------------------------------

describe('untouched text (row 60)', SLOW, () => {
  it('patches every property of a one-line body in a CRLF file, keeping the rest byte for byte', async () => {
    const head = `${MODEL}views {\n  // the first view\n  view other {\n    include a // keep\n    // between rules\n    exclude b\n  }\n`.replace(/\n/g, '\r\n');
    const target = '  view v { include a /* keep */ include b }';
    const tail = '\r\n}\r\n';
    const before = { 'm.c4': head + target + tail };
    await expectValidLikeC4(before);
    const m = LikeC4Mutator.fromFiles(before);
    const result = m.updateView('v', {
      title: 'T',
      description: 'D',
      tags: ['next'],
      links: [{ url: 'https://example.com/x', label: 'X' }],
      autoLayout: 'LeftRight',
    });
    expect(result).toEqual({ changedFiles: ['m.c4'] });
    const text = m.serialize()['m.c4']!;
    expect(text.startsWith(head + '  view v {')).toBe(true);
    expect(text.endsWith(tail)).toBe(true);
    expect(text.slice(head.length, text.length - tail.length)).toBe(
      "  view v {\r\n    #next\r\n    title 'T'\r\n    description 'D'\r\n    link https://example.com/x 'X'\r\n    include a /* keep */ include b\r\n    autoLayout LeftRight\r\n  }",
    );
    expect(/(?<!\r)\n/.test(text)).toBe(false);
    await expectValidViewWrite(m, before);
  });
});

// ---------------------------------------------------------------------------
// Row 61: view addressing
// ---------------------------------------------------------------------------

describe('updateView addresses one named view (row 61)', () => {
  it('rejects an unknown id', () => {
    const m = LikeC4Mutator.fromFiles(files('  view v {\n    include *\n  }\n'));
    expectRejected(m, () => m.updateView('nope', { title: 'T' }), 'id');
  });

  it('rejects an id declared in two files', () => {
    const m = LikeC4Mutator.fromFiles({ ...files('  view v {\n    include *\n  }\n'), 'n.c4': 'views {\n  view v {\n    include *\n  }\n}\n' });
    expectRejected(m, () => m.updateView('v', { title: 'T' }), 'id');
  });

  it("rejects the id LikeC4 generates for an unnamed view", async () => {
    const before = files('  view of a {\n    include *\n  }\n');
    const generated = Object.keys(await computedViews(before)).filter((id) => id !== 'index');
    expect(generated).toHaveLength(1);
    const m = LikeC4Mutator.fromFiles(before);
    expectRejected(m, () => m.updateView(generated[0]!, { title: 'T' }), 'id');
  });
});

// ---------------------------------------------------------------------------
// Row 62: D42 and errors elsewhere
// ---------------------------------------------------------------------------

describe('writes next to errors (row 62)', SLOW, () => {
  const BROKEN = "views {\n  view broken {\n    include *\n  }\n}\nmodel {\n  x = system 'unclosed\n}\n";

  it('updates tags and links of a view in a clean file while another file has a syntax error', async () => {
    const before = { ...files('  view v {\n    include *\n  }\n'), 'z.c4': BROKEN };
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('v', { tags: ['next'], links: [{ url: 'https://example.com/x' }] });
    const after = m.serialize();
    expect(after['z.c4']).toBe(BROKEN);
    expect(after['m.c4']).toBe(files('  view v {\n    #next\n    link https://example.com/x\n    include *\n  }\n')['m.c4']);
    expect(m.getView('v')).toMatchObject({ tags: ['next'], links: [{ url: 'https://example.com/x' }] });
    await expectViewWriteOnInvalidInput(m, before);
  });

  it('refuses the same update of a view in the broken file on id, changing nothing', () => {
    const m = LikeC4Mutator.fromFiles({ ...files('  view v {\n    include *\n  }\n'), 'z.c4': BROKEN });
    expect(m.getView('broken')).not.toBeNull();
    expectRejected(m, () => m.updateView('broken', { tags: ['next'], links: [{ url: 'https://example.com/x' }] }), 'id');
  });

  it('updates view A while view B has an unresolved navigateTo', async () => {
    const before = files('  view v {\n    include *\n  }\n  view w {\n    include a with { navigateTo nope }\n  }\n');
    expect((await linkedViewReferences(before)).find((r) => r.text === 'nope')!.target).toBeNull();
    const m = LikeC4Mutator.fromFiles(before);
    m.updateView('v', { title: 'A' });
    expect(m.getView('v')!.title).toBe('A');
    await expectViewWriteOnInvalidInput(m, before);
  });
});
