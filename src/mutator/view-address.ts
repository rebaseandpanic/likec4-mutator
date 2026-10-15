/**
 * The address resolvers shared by the view writers (INV-3): the one named
 * view a write addresses (D28), a rule by index and text guard (D22), and a
 * step statement by path, chain segment and text guard (D24).  Every
 * failure is an {@link InvalidWriteError} naming the field.
 */
import type { ViewRuleAddress, ViewStepAddress } from '../query/types.js';
import type {
  ViewDeclaration,
  ViewIndex,
  ViewRuleEntry,
  ViewStepSegment,
  ViewStepStatementEntry,
} from '../query/view-index.js';
import { stepSegmentText } from '../query/view-query.js';
import { InvalidWriteError } from './write-checks.js';

const quote = (value: unknown): string => JSON.stringify(value);

/** Where a file names the declaration: `file:line`, or the document position when it has no name. */
function location(view: ViewDeclaration): string {
  const line = (view.node.$cstNode?.range?.start?.line ?? 0) + 1;
  return `${view.file ?? `document ${view.document}`}:${line}`;
}

/**
 * The one declaration of the named view `id`.  Unnamed views cannot be
 * addressed (D28): their LikeC4 ids depend on the document and position.
 *
 * @throws {InvalidWriteError} on `field` when no view is declared with the
 *   id, or when more than one is (a LikeC4 error; naming the declarations)
 */
export function namedView(views: ViewIndex, id: string, field = 'id'): ViewDeclaration {
  if (typeof id !== 'string' || id === '') {
    throw new InvalidWriteError(field, `${quote(id)} is not a view id`);
  }
  const declarations = views.declarationsOf(id);
  if (declarations.length === 0) {
    throw new InvalidWriteError(field, `no view '${id}' is declared in the loaded files (unnamed views cannot be addressed)`);
  }
  if (declarations.length > 1) {
    throw new InvalidWriteError(
      field,
      `view '${id}' is declared ${declarations.length} times (${declarations.map(location).join(', ')}); a write cannot tell which one is meant`,
    );
  }
  return declarations[0]!;
}

/**
 * The rule at `address` in `view`: `index` within the view's rules in source
 * order, and — when given — `text` equal to the rule's source text as
 * `getView` reports it.
 *
 * @param field - The address option (`address`, `before`): failures name
 *                `<field>`, `<field>.index` or `<field>.text`
 */
export function ruleAt(view: ViewDeclaration, address: ViewRuleAddress, field: string): ViewRuleEntry {
  if (typeof address !== 'object' || address === null) {
    throw new InvalidWriteError(field, `expected a rule address { index, text? }, got ${quote(address)}`);
  }
  const { index, text } = address;
  if (!Number.isInteger(index) || index < 0 || index >= view.rules.length) {
    throw new InvalidWriteError(
      `${field}.index`,
      `${quote(index)} is not the index of a rule of view '${view.id}', which has ${view.rules.length} rule(s)`,
    );
  }
  const rule = view.rules[index]!;
  if (text !== undefined) {
    const actual = rule.node.$cstNode?.text ?? '';
    if (text !== actual) {
      throw new InvalidWriteError(`${field}.text`, `${quote(text)} does not match rule ${index} of view '${view.id}', which reads ${quote(actual)}`);
    }
  }
  return rule;
}

/** A step statement found by {@link stepAt}. */
export interface AddressedStep {
  statement: ViewStepStatementEntry;
  /** The `par` block holding the statement; undefined at the top level */
  parent?: ViewStepStatementEntry;
  /** The addressed chain segment; undefined when the whole statement is addressed */
  segment?: ViewStepSegment;
}

/**
 * The step statement at `address` in the dynamic view `view`: `path` is
 * `[i]` for the top-level statement `i` or `[i, j]` for statement `j` of the
 * `par` block at `i` (D24); `segment` addresses one segment of a chain; the
 * `text` guard, when given, must equal the statement's source text (or the
 * segment's, from its connector on) as `getView` reports it.  A path into a
 * single step, a chain or a stage-6 block is rejected: their inner parts
 * are not statements.
 *
 * @param field - The address option (`address`, `from`): failures name
 *                `<field>`, `<field>.path`, `<field>.segment` or `<field>.text`
 */
export function stepAt(view: ViewDeclaration, address: ViewStepAddress, field: string): AddressedStep {
  if (typeof address !== 'object' || address === null) {
    throw new InvalidWriteError(field, `expected a step address { path, segment?, text? }, got ${quote(address)}`);
  }
  const { path, segment, text } = address;
  const pathField = `${field}.path`;
  if (view.type !== 'dynamic') {
    throw new InvalidWriteError(pathField, `view '${view.id}' is a ${view.type} view; only dynamic views have steps`);
  }
  if (!Array.isArray(path) || path.length === 0 || path.length > 2 || !path.every((i) => Number.isInteger(i) && i >= 0)) {
    throw new InvalidWriteError(pathField, `${quote(path)} is not a step path: expected [i] or [i, j] with non-negative integers`);
  }
  const [i, j] = path as [number, number | undefined];
  const top = view.steps[i];
  if (!top) {
    throw new InvalidWriteError(pathField, `${quote(path)}: view '${view.id}' has ${view.steps.length} top-level step statement(s)`);
  }
  let statement = top;
  let parent: ViewStepStatementEntry | undefined;
  if (j !== undefined) {
    if (top.form !== 'parallel') {
      const what = top.form === 'opaque' ? `an '${top.keyword ?? 'stage-6'}' block` : top.form === 'chain' ? 'a chain' : 'a single step';
      throw new InvalidWriteError(pathField, `${quote(path)}: the statement at [${i}] is ${what}, whose inner parts are not addressable; only a par block holds addressable statements`);
    }
    const inner = top.statements[j];
    if (!inner) {
      throw new InvalidWriteError(pathField, `${quote(path)}: the par block at [${i}] has ${top.statements.length} statement(s)`);
    }
    statement = inner;
    parent = top;
  }

  let addressed: ViewStepSegment | undefined;
  if (segment !== undefined) {
    if (statement.form !== 'chain') {
      throw new InvalidWriteError(`${field}.segment`, `${quote(segment)}: the statement at ${quote(path)} is not a chain; only chain segments are addressed by number`);
    }
    if (!Number.isInteger(segment) || segment < 0 || segment >= statement.segments.length) {
      throw new InvalidWriteError(`${field}.segment`, `${quote(segment)} is not a segment of the chain at ${quote(path)}, which has ${statement.segments.length}`);
    }
    addressed = statement.segments[segment]!;
  }
  if (text !== undefined) {
    const actual = addressed ? stepSegmentText(addressed) : (statement.node.$cstNode?.text ?? '');
    if (text !== actual) {
      throw new InvalidWriteError(
        `${field}.text`,
        `${quote(text)} does not match the ${addressed ? `segment ${segment} of the chain` : 'step statement'} at ${quote(path)}, which reads ${quote(actual)}`,
      );
    }
  }
  return { statement, ...(parent && { parent }), ...(addressed && { segment: addressed }) };
}
