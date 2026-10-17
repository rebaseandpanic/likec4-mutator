/**
 * `updateElement({ style: { icon } })` on an element with a body-level
 * `icon` (lc4m-15.30 US-11, D75; rows 164 and 165 of the test matrix): the
 * body `icon` is rewritten and no `style { icon }` is written, so the write
 * introduces no `Redundant as icon defined on element` warning; a
 * `style { icon }` already there stays byte for byte.
 *
 * Expected values come from the inputs (literal texts) and from LikeC4: the
 * effective icon is LikeC4's (`expectElementStylesAgreeWithLikeC4`), and
 * the accepted-write bundle checks the warning.
 */
import { describe, expect, it } from 'vitest';
import { LikeC4Mutator } from '../../src/mutator/mutator.js';
import type { ElementInfo } from '../../src/query/types.js';
import { buildLikeC4Model, expectAcceptedWrite, expectElementStylesAgreeWithLikeC4 } from '../helpers/likec4-model.js';

const SLOW = { timeout: 120_000 };

const SPEC = 'specification {\n  element system\n}\n';

const reported = (element: ElementInfo) => ({
  fqn: element.fqn,
  ownStyle: element.ownStyle,
  kindStyle: element.fromSpecification?.style,
  style: element.style,
});

describe('a style icon goes into the body icon (row 164)', SLOW, () => {
  it('rewrites the body icon and writes no style { icon }', async () => {
    // P: a body icon next to a style icon is what LikeC4 warns about (spike 01 s4), so AWB detects a redundant write.
    const redundant = await buildLikeC4Model({
      'm.c4': `${SPEC}model {\n  s = system 'S' {\n    icon tech:go\n    style {\n      icon tech:java\n    }\n  }\n}\n`,
    });
    expect(redundant.diagnostics.some((d) => d.includes('Redundant as icon defined on element'))).toBe(true);

    const before = { 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    icon tech:go\n    style {\n      color red\n    }\n  }\n}\n` };
    const m = LikeC4Mutator.fromFiles(before);
    m.updateElement('a', { style: { icon: 'tech:java' } });
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    icon tech:java\n    style {\n      color red\n    }\n  }\n}\n` });
    await expectAcceptedWrite(before, after);
    expect(m.getElement('a')!.style?.icon).toBe('tech:java');
    await expectElementStylesAgreeWithLikeC4(after, [reported(m.getElement('a')!)]);
  });

  it('writes the other style fields into the style block as before', async () => {
    const before = { 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    icon tech:go\n  }\n}\n` };
    const m = LikeC4Mutator.fromFiles(before);
    m.updateElement('a', { style: { icon: 'tech:java', color: 'green' } });
    const after = m.serialize();
    expect(after['m.c4']).toContain('    icon tech:java\n');
    expect(after['m.c4']).not.toMatch(/style \{[^}]*icon/);
    await expectAcceptedWrite(before, after);
    await expectElementStylesAgreeWithLikeC4(after, [reported(m.getElement('a')!)]);
  });
});

describe('text kept as written (row 165)', SLOW, () => {
  it('leaves a style { icon } next to the body icon byte for byte', async () => {
    const styleBlock = '    style {\n      icon tech:java\n      color red\n    }\n';
    const before = { 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    icon tech:go\n${styleBlock}  }\n}\n` };
    const m = LikeC4Mutator.fromFiles(before);
    m.updateElement('a', { style: { icon: 'tech:aws-lambda' } });
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    icon tech:aws-lambda\n${styleBlock}  }\n}\n` });
    await expectAcceptedWrite(before, after);
    await expectElementStylesAgreeWithLikeC4(after, [reported(m.getElement('a')!)]);
  });

  it('writes the icon into the style block of an element without a body icon', async () => {
    const before = { 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    style {\n      color red\n    }\n  }\n}\n` };
    const m = LikeC4Mutator.fromFiles(before);
    m.updateElement('a', { style: { icon: 'tech:go' } });
    const after = m.serialize();
    expect(after).toEqual({ 'm.c4': `${SPEC}model {\n  a = system 'A' {\n    style {\n      color red\n      icon tech:go\n    }\n  }\n}\n` });
    await expectAcceptedWrite(before, after);
  });
});
