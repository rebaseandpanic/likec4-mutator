/**
 * Checks of the values a write call introduces, run before anything is
 * written.
 *
 * Two kinds of checks live here:
 *  - form checks: an identifier, a reference, a layout or a style value must
 *    be written the way the LikeC4 grammar accepts it as exactly one token or
 *    property, so that a string parameter cannot add any other DSL;
 *  - declaration checks: a tag, a kind or a custom color must be declared by a
 *    specification of the loaded files (LikeC4 reports `Could not resolve
 *    reference to ...` otherwise).  They run only when a workspace index is
 *    given.
 *
 * Every check throws {@link InvalidWriteError} naming the offending field.
 */
import {
  deploymentIncludeUsesWith,
  grammarKeywords,
  isDeclarableName,
  isLikeC4Id,
  containsComment,
  isReferenceForm,
  libraryIconNames,
  parseAutoLayout,
  parseStyleProperty,
  type IncludeViewType,
  type ParsedStyleProperty,
} from '../parser/grammar.js';
import type { WorkspaceIndex } from '../query/workspace-index.js';
import { viewIncludeExpression, type ElementStyle, type RelationshipStyle } from './codegen.js';

/**
 * A write was rejected before anything changed because a value it would
 * introduce is not valid LikeC4.  `field` names the value in the terms of the
 * call's options — `name`, `kind`, `tags[1]`, `style.color`, `includes[0]`,
 * `source`, ... — and `detail` says what is wrong with it.
 */
export class InvalidWriteError extends Error {
  readonly field: string;
  readonly detail: string;

  constructor(field: string, detail: string) {
    super(`Invalid ${field}: ${detail}`);
    this.name = 'InvalidWriteError';
    this.field = field;
    this.detail = detail;
  }
}

const quote = (value: unknown): string => JSON.stringify(value);

const ID_RULE =
  "a single LikeC4 identifier (letters, digits, '_' or '-', not starting with a digit or '-', no '.', not a reserved keyword such as true, false or title)";

/** Name of a new element: one `Id` token, not a reserved word. */
export function checkElementName(name: string, field = 'name'): void {
  if (typeof name !== 'string' || !isDeclarableName(name)) {
    throw new InvalidWriteError(field, `${quote(name)} is not ${ID_RULE}, and not this, it, self, super, likec4lib or global`);
  }
}

/** Id of a new view: one `Id` token, not a reserved word. */
export function checkViewId(id: string, field = 'id'): void {
  if (typeof id !== 'string' || !isDeclarableName(id)) {
    throw new InvalidWriteError(field, `${quote(id)} is not ${ID_RULE}, and not this, it, self, super, likec4lib or global`);
  }
}

/** An element reference (relationship endpoint, view target): dot-separated `Id` tokens. */
export function checkReferenceForm(reference: string, field: string): void {
  if (typeof reference !== 'string' || !isReferenceForm(reference)) {
    throw new InvalidWriteError(
      field,
      `${quote(reference)} is not an element reference: expected LikeC4 identifiers joined by '.' (e.g. app.api)`,
    );
  }
}

/**
 * A kind reference: one `Id` token and — when `workspace` is given — declared
 * by a specification of the loaded files.  Relationship kinds are checked the
 * same way against `relationship` declarations.
 */
export function checkKind(
  kind: string,
  of: 'element' | 'relationship',
  workspace: WorkspaceIndex | undefined,
  field = 'kind',
): void {
  if (typeof kind !== 'string' || !isLikeC4Id(kind)) {
    throw new InvalidWriteError(field, `${quote(kind)} is not ${ID_RULE}`);
  }
  if (!workspace) return;
  const declared = of === 'element' ? workspace.elementKind(kind) : workspace.relationshipKind(kind);
  if (declared === undefined) {
    throw new InvalidWriteError(
      field,
      `${of} kind '${kind}' is not declared by a specification of the loaded files (\`specification { ${of} ${kind} }\`)`,
    );
  }
}

/**
 * Tags: each one `Id` token after an optional leading `#` and — when
 * `workspace` is given — declared by a specification (`tag name`).
 */
export function checkTags(tags: readonly string[] | undefined, workspace: WorkspaceIndex | undefined, field = 'tags'): void {
  tags?.forEach((tag, i) => {
    const name = typeof tag === 'string' && tag.startsWith('#') ? tag.slice(1) : tag;
    if (typeof name !== 'string' || !isLikeC4Id(name)) {
      throw new InvalidWriteError(`${field}[${i}]`, `${quote(tag)} is not a tag name: expected ${ID_RULE}`);
    }
    if (workspace && !workspace.hasTag(name)) {
      throw new InvalidWriteError(
        `${field}[${i}]`,
        `tag '${name}' is not declared by a specification of the loaded files (\`specification { tag ${name} }\`)`,
      );
    }
  });
}

/**
 * The `autoLayout` value of a new view: a direction keyword optionally
 * followed by numeric rankSep and nodeSep (`LeftRight`, `TopBottom 120 40`).
 * An empty value means "no directive" and is accepted.
 */
export function checkAutoLayout(value: string | null | undefined, field = 'autoLayout'): void {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || parseAutoLayout(value) === undefined) {
    throw new InvalidWriteError(
      field,
      `${quote(value)} is not an autoLayout value: expected one of ${grammarKeywords('ViewLayoutDirection').join(', ')}, optionally followed by a numeric rankSep and nodeSep (e.g. LeftRight 120 40)`,
    );
  }
}

/**
 * `includes` items of a new view: each must form exactly one `include` rule of
 * the view's type (see {@link viewIncludeExpression}); a deployment view's
 * item must not customize with `with { ... }` — LikeC4 documents that `with`
 * does not work in deployment views and ignores it there.
 */
export function checkViewIncludes(
  includes: readonly string[] | undefined,
  type: IncludeViewType,
  field = 'includes',
): void {
  includes?.forEach((item, i) => {
    const expression = typeof item === 'string' ? viewIncludeExpression(item, type) : undefined;
    if (expression === undefined) {
      throw new InvalidWriteError(
        `${field}[${i}]`,
        `${quote(item)} is not exactly one include rule of a ${type} view: expected its predicates, such as '*' or 'app.api, app.db'`,
      );
    }
    if (type === 'deployment' && deploymentIncludeUsesWith(expression)) {
      throw new InvalidWriteError(
        `${field}[${i}]`,
        `${quote(item)} uses 'with', which LikeC4 does not apply in deployment views`,
      );
    }
  });
}

/** Grammar datatype rule whose keywords are the values of a style field. */
const KEYWORD_RULE: Readonly<Record<string, string>> = {
  shape: 'ElementShape',
  border: 'BorderStyleValue',
  size: 'SizeValue',
  padding: 'SizeValue',
  textSize: 'SizeValue',
  iconSize: 'SizeValue',
  iconPosition: 'IconPositionValue',
  line: 'LineOptions',
  head: 'ArrowType',
  tail: 'ArrowType',
};

const COLOR_FIELDS: ReadonlySet<string> = new Set(['color', 'iconColor']);

/** Style fields of each target (`ElementStyle`, `RelationshipStyle`). */
const STYLE_FIELDS: Readonly<Record<'element' | 'relationship', ReadonlySet<string>>> = {
  element: new Set([
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
  ] satisfies ReadonlyArray<keyof ElementStyle>),
  relationship: new Set(['line', 'color', 'head', 'tail'] satisfies ReadonlyArray<keyof RelationshipStyle>),
};

/** What a style field accepts, for an error message. */
function expectedStyleValue(key: string): string {
  if (COLOR_FIELDS.has(key)) {
    return `a theme color (${grammarKeywords('ThemeColor').join(', ')}) or a custom color declared by a specification`;
  }
  if (key === 'opacity') return 'a percentage between 0% and 100% (e.g. 40%)';
  if (key === 'icon') return "a library icon (e.g. tech:postgresql), a URI ('https://…', '/…', './…', '../…', '@alias/…') or none";
  const rule = KEYWORD_RULE[key];
  return rule ? `one of ${grammarKeywords(rule).join(', ')}` : 'a value LikeC4 accepts';
}

/**
 * The checks LikeC4 applies to a parsed style property beyond its form:
 * a custom color must be declared, a library icon must exist, an icon URI
 * must not use `file://` (error), an opacity must lie in 0%..100% (otherwise
 * LikeC4 ignores it with a warning).  See language-server 1.59.4
 * `src/validation/property-checks.ts`.
 */
function checkParsedStyleValue(
  property: ParsedStyleProperty,
  key: string,
  value: string,
  workspace: WorkspaceIndex | undefined,
  field: string,
): void {
  const fail = (): never => {
    throw new InvalidWriteError(field, `${quote(value)} is not ${expectedStyleValue(key)}`);
  };
  const custom = property.customColor?.$refText;
  if (custom !== undefined && workspace && !workspace.hasCustomColor(custom)) {
    throw new InvalidWriteError(
      field,
      `${quote(value)} is neither a theme color (${grammarKeywords('ThemeColor').join(', ')}) nor a custom color declared by a specification of the loaded files`,
    );
  }
  const icon = property.libicon?.$refText;
  if (icon !== undefined && !libraryIconNames().has(icon)) {
    throw new InvalidWriteError(field, `${quote(value)} is not an icon of the LikeC4 icon library`);
  }
  if (property.$type === 'IconProperty' && typeof property.value === 'string' && property.value.startsWith('file://')) {
    throw new InvalidWriteError(field, `${quote(value)}: LikeC4 does not accept icon URIs starting with file://`);
  }
  if (property.$type === 'OpacityProperty') {
    const opacity = Number.parseFloat(String(property.value));
    if (Number.isNaN(opacity) || opacity < 0 || opacity > 100) fail();
  }
}

/**
 * Style values of an element or a relationship: each field must be exactly one
 * property value the grammar accepts for it (keyword sets, colors, a
 * percentage, an icon, a boolean), plus the checks of
 * {@link checkParsedStyleValue}.  Empty strings are treated as unset, as the
 * code generator does.
 */
export function checkStyle(
  style: ElementStyle | RelationshipStyle | undefined,
  target: 'element' | 'relationship',
  workspace: WorkspaceIndex | undefined,
  field = 'style',
): void {
  if (!style) return;
  for (const [key, value] of Object.entries(style) as Array<[string, unknown]>) {
    if (value === undefined) continue;
    const path = `${field}.${key}`;
    if (!STYLE_FIELDS[target].has(key)) {
      throw new InvalidWriteError(path, `unknown ${target} style field; expected one of ${[...STYLE_FIELDS[target]].join(', ')}`);
    }
    if (key === 'multiple') {
      if (typeof value !== 'boolean') throw new InvalidWriteError(path, `${quote(value)} is not a boolean`);
      continue;
    }
    if (typeof value !== 'string') throw new InvalidWriteError(path, `${quote(value)} is not a string`);
    if (value === '') continue;
    if (containsComment(value)) {
      throw new InvalidWriteError(path, `${quote(value)} contains a comment; expected the style value alone`);
    }
    const property = parseStyleProperty(target, key, value);
    if (!property) throw new InvalidWriteError(path, `${quote(value)} is not ${expectedStyleValue(key)}`);
    checkParsedStyleValue(property, key, value, workspace, path);
  }
}
