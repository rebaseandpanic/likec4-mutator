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
  parseViewRule,
  type IncludeViewType,
  type ParsedAstNode,
  type ParsedStyleProperty,
  type ViewRuleKeyword,
} from '../parser/grammar.js';
import { resolveFqnRef } from '../query/fqn.js';
import type { CatalogueRole } from '../query/reference-catalogue.js';
import type { KindPlaceRole } from '../query/kind-places.js';
import type { ViewBodyPlace, ViewReferenceResolver } from '../query/view-resolver.js';
import type { WorkspaceIndex } from '../query/workspace-index.js';
import { isLinkUrl, viewIncludeExpression, type ElementStyle, type RelationshipStyle } from './codegen.js';

/**
 * A write was rejected before anything changed because a value it would
 * introduce is not valid LikeC4.  `field` names the value in the terms of the
 * call's options — `name`, `kind`, `tags[1]`, `style.color`, `includes[0]`,
 * `source`, ... — and `detail` says what is wrong with it.
 */
export class InvalidWriteError extends Error {
  readonly field: string;
  readonly detail: string;
  /**
   * The constructs the rejection is about, when it names some besides the
   * offending value (D114): a deployment path, an `extend` block, a `where`
   * condition or a relationship.  Absent otherwise.
   */
  readonly related?: readonly RelatedConstruct[];

  constructor(field: string, detail: string, related?: readonly RelatedConstruct[]) {
    super(`Invalid ${field}: ${detail}`);
    this.name = 'InvalidWriteError';
    this.field = field;
    this.detail = detail;
    if (related !== undefined) this.related = related;
  }
}

/** A construct named by a rejection (see {@link InvalidWriteError.related}); positions are 1-based. */
export interface RelatedConstruct {
  file: string;
  line: number;
  column: number;
  construct: 'deployment-path' | 'extend-block' | 'where-condition' | 'relationship';
}

/**
 * Where a reference that a removal is about is written: the place's FR-001
 * role (see {@link CatalogueRole}); for a kind or tag removal, the FR-002
 * place name `<construct>:<context>` (see {@link KindPlaceRole}, D128); or
 * `unrecovered` for a name in text the parser could not recover.
 */
export type RemovalReferenceRole = CatalogueRole | KindPlaceRole | 'unrecovered';

/** One reference listed by a {@link ReferencedRemovalError}; positions are 1-based. */
export interface RemovalReference {
  file: string;
  line: number;
  column: number;
  role: RemovalReferenceRole;
  /**
   * True when the removal with `cascade` removes the referencing construct;
   * false when the reference blocks the removal in both modes
   */
  cascadable: boolean;
  /** The id of the view the reference is written in, when it lies in a named view */
  view?: string;
}

/**
 * A removal was rejected because of references to what it removes
 * (lc4m-15.30 US-1, US-2; D54, D111, D113).  `references` lists every such
 * reference: without `cascade` all of them, each marked whether a cascade
 * would remove it; with `cascade` the references that block the removal
 * (`cascadable: false`) together with those the cascade would have removed.
 * `field` is the removal's target field (`fqn`, `id`).  An unknown target or
 * an edit that would not parse is a plain {@link InvalidWriteError}.
 */
export class ReferencedRemovalError extends InvalidWriteError {
  readonly references: readonly RemovalReference[];

  constructor(field: string, detail: string, references: readonly RemovalReference[]) {
    super(field, detail);
    this.name = 'ReferencedRemovalError';
    this.references = references;
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
 * by a specification of the loaded files.  Relationship and deployment node
 * kinds are checked the same way against `relationship` and
 * `deploymentNode` declarations.
 */
export function checkKind(
  kind: string,
  of: 'element' | 'relationship' | 'deploymentNode',
  workspace: WorkspaceIndex | undefined,
  field = 'kind',
): void {
  if (typeof kind !== 'string' || !isLikeC4Id(kind)) {
    throw new InvalidWriteError(field, `${quote(kind)} is not ${ID_RULE}`);
  }
  if (!workspace) return;
  const declared =
    of === 'element'
      ? workspace.elementKind(kind)
      : of === 'relationship'
        ? workspace.relationshipKind(kind)
        : workspace.deploymentNodeKind(kind);
  if (declared === undefined) {
    throw new InvalidWriteError(
      field,
      `${of} kind '${kind}' is not declared by a specification of the loaded files (\`specification { ${of} ${kind} }\`)`,
    );
  }
}

/**
 * The file a write is placed in: one of the loaded files.  No file is
 * created.
 *
 * @param loadedFiles - Names of the loaded files
 */
export function checkFile(file: string, loadedFiles: Iterable<string>, field = 'file'): void {
  const loaded = [...loadedFiles];
  if (typeof file !== 'string' || !loaded.includes(file)) {
    const known = loaded.length > 0 ? loaded.map((f) => `'${f}'`).join(', ') : 'none';
    throw new InvalidWriteError(field, `${quote(file)} is not a loaded file (loaded: ${known}); no file is created`);
  }
}

/**
 * Metadata upserts (entries other than `null`): each key one `Id` token,
 * each value a string or a non-empty list of strings (the LikeC4 grammar has
 * no `[]`).  `null` entries — deletions — are not checked: they write no
 * text.
 *
 * @throws {InvalidWriteError} on `<field>.<key>`
 */
export function checkMetadata(
  metadata: Readonly<Record<string, string | readonly string[] | null>> | undefined,
  field = 'metadata',
): void {
  if (metadata === undefined) return;
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null) continue;
    if (!isLikeC4Id(key)) {
      throw new InvalidWriteError(`${field}.${key}`, `${quote(key)} is not a metadata key: expected ${ID_RULE}`);
    }
    if (Array.isArray(value) ? value.length === 0 || value.some((item) => typeof item !== 'string') : typeof value !== 'string') {
      throw new InvalidWriteError(
        `${field}.${key}`,
        `${JSON.stringify(value)} is not a metadata value: a string or a non-empty list of strings (LikeC4 has no empty list)`,
      );
    }
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

/**
 * Links of a view write: each URL one of the LikeC4 URI forms (`scheme://…`,
 * `/…`, `./…`, `../…`, `@alias/…`) without whitespace, each label — when
 * given — a string.  The links of existing operations keep the plain
 * `Error` of `formatLinkUrl`.
 *
 * @throws {InvalidWriteError} on `<field>[i].url` / `<field>[i].label`
 */
export function checkLinks(
  links: ReadonlyArray<{ url: string; label?: string }> | undefined,
  field = 'links',
): void {
  links?.forEach((link, i) => {
    const url: unknown = link?.url;
    if (typeof url !== 'string' || !isLinkUrl(url)) {
      throw new InvalidWriteError(
        `${field}[${i}].url`,
        `${quote(url)} is not a link URL: expected 'scheme://…', a relative path ('/…', './…', '../…') or '@alias/…' without whitespace`,
      );
    }
    const label: unknown = link.label;
    if (label !== undefined && typeof label !== 'string') {
      throw new InvalidWriteError(`${field}[${i}].label`, `${quote(label)} is not a string`);
    }
  });
}

// ---------------------------------------------------------------------------
// View rules
// ---------------------------------------------------------------------------

/** An `include` / `exclude` rule of a view as a write gives it: kind and expression text (D23). */
export interface ViewRuleText {
  kind: ViewRuleKeyword;
  /** The predicates written after the keyword, e.g. `app.api, app.db` or `* where tag is #next` */
  expression: string;
}

/** Rule kinds each view type has (a dynamic view has no `exclude`). */
const RULE_KINDS: Readonly<Record<IncludeViewType, readonly ViewRuleKeyword[]>> = {
  element: ['include', 'exclude'],
  dynamic: ['include'],
  deployment: ['include', 'exclude'],
};

const RELATION_EXPRESSIONS: ReadonlySet<string> = new Set([
  'DirectedRelationExpr',
  'OutgoingRelationExpr',
  'IncomingRelationExpr',
  'InOutRelationExpr',
]);

/** What a cross-reference of a predicate links to, by `<container type>:<property>` (LikeC4 `getReferenceType`). */
type ReferenceRole =
  | 'relationshipKind'
  | 'elementKind'
  /** `where kind is …`: an element kind or a deployment node kind */
  | 'kind'
  | 'tag'
  | 'anyView'
  | 'dynamicView'
  | 'elementView'
  /** custom colors and library icons: checked with the `with` properties */
  | 'style';

const REFERENCE_ROLES: Readonly<Record<string, ReferenceRole>> = {
  'OutgoingRelationExpr:kind': 'relationshipKind',
  'RelationKindDotRef:kind': 'relationshipKind',
  'WhereRelationKind:value': 'relationshipKind',
  'ElementKindExpression:kind': 'elementKind',
  'WhereElementKind:value': 'kind',
  'WhereRelationParticipantKind:value': 'kind',
  'TagRef:tag': 'tag',
  'ViewRef:view': 'anyView',
  'DynamicViewRef:view': 'dynamicView',
  'ElementViewRef:view': 'elementView',
  'ColorProperty:customColor': 'style',
  'IconColorProperty:customColor': 'style',
  'IconProperty:libicon': 'style',
};

/** The references and `with` properties of a parsed rule, in source order. */
interface RuleContents {
  /** Element (or deployment) references: the outermost `FqnRef` of each */
  refs: Array<{ text: string; inRelation: boolean }>;
  /** Kind, tag and view references */
  named: Array<{ role: Exclude<ReferenceRole, 'style'>; text: string }>;
  /** Style properties of `with { … }` bodies, with the style class of their subject */
  styles: Array<{ property: ParsedAstNode; target: 'element' | 'relationship' }>;
  /** The `with { … }` bodies themselves */
  bodies: ParsedAstNode[];
}

/**
 * The admissibility check of an `include` / `exclude` rule written into the
 * body of a view (D23, D34, D35): an existing view's body, or that of a view
 * about to be added (`addView` includes).  In order:
 *
 *  1. form — `rule.expression` parses to exactly one rule of `rule.kind`,
 *     a kind the view type has (element and deployment views: include /
 *     exclude; dynamic views: include), and does not end with a trailing
 *     comma (the next line of the body would join the rule);
 *  2. structure — rejected are what LikeC4 reports or silently drops:
 *     `with` in an `exclude` rule, `with` on `element.kind` /
 *     `element.tag`, a relation predicate in a dynamic view, `with` on a
 *     wildcard, kind or tag in a dynamic view, and `with` in a deployment
 *     view;
 *  3. references — every element reference resolves at the place as LikeC4
 *     scopes it (see {@link ViewReferenceResolver}); in a deployment view
 *     a model reference only inside a relation predicate of an `exclude`
 *     rule, and a reference into an instance's internals only inside a
 *     relation predicate (LikeC4 1.59.4 `checkFqnRefExpr`,
 *     `checkRelationExpr`); every
 *     `navigateTo` names a view of a type its place accepts (any view from
 *     an element `with`, a dynamic view from a relation `with`);
 *  4. declarations — element kinds, tags and relationship kinds are
 *     declared by a specification (`where kind is …` accepts an element or
 *     a deployment node kind);
 *  5. `with` properties — each style property passes the checks of
 *     {@link checkStyle} for the subject's class (declared custom colors,
 *     library icons, no `file://` icon URI, opacity within 0%..100%), and a
 *     body gives an icon at most once.
 *
 * The expression is written as given; nothing is regenerated.
 *
 * @param place     - The view body the rule is written into
 * @param fields    - Error fields: `kind` for the rule kind, `expression` for every other failure
 * @throws {InvalidWriteError} on `fields.kind` or `fields.expression`
 */
export function checkViewRule(
  rule: ViewRuleText,
  place: ViewBodyPlace,
  resolver: ViewReferenceResolver,
  workspace: WorkspaceIndex,
  fields: { kind: string; expression: string },
): void {
  const { kind, expression } = rule;
  const allowed = RULE_KINDS[place.type];
  if (!allowed.includes(kind)) {
    throw new InvalidWriteError(fields.kind, `${quote(kind)} is not a rule kind of a ${place.type} view: expected ${allowed.join(' or ')}`);
  }
  const field = fields.expression;
  const fail = (detail: string): never => {
    throw new InvalidWriteError(field, `${quote(expression)}: ${detail}`);
  };

  // (1) Form
  const parsed = typeof expression === 'string' ? parseViewRule(kind, expression, place.type) : undefined;
  const list = parsed?.exprs ?? parsed?.expr;
  if (!list) {
    throw new InvalidWriteError(
      field,
      `${quote(expression)} is not exactly one ${kind} rule of a ${place.type} view: expected its predicates, such as '*' or 'app.api, app.db'`,
    );
  }
  const items: ParsedAstNode[] = [];
  for (let node: ParsedAstNode | undefined = list; node; node = node.prev as ParsedAstNode | undefined) {
    const value = node.value as ParsedAstNode | undefined;
    if (!value) fail('ends with a trailing comma, which would join the next line of the view body to the rule');
    items.unshift(value!);
  }

  // (2) Structure
  for (const item of items) checkRuleItemStructure(item, kind, place.type, fail);

  const contents: RuleContents = { refs: [], named: [], styles: [], bodies: [] };
  for (const item of items) collectRuleContents(item, false, contents, fail);

  // (3) References
  for (const { text, inRelation } of contents.refs) {
    if (place.type === 'deployment') {
      const target = resolver.resolveDeploymentText(place, text);
      if (!target) fail(`'${text}' does not resolve to a deployment node, instance or element in this view`);
      else if ('model' in target) {
        if (kind === 'include' || !inRelation) {
          fail(`'${text}' is a model reference, which LikeC4 allows in a deployment view only inside a relation predicate of an exclude rule`);
        }
      } else if (target.element !== undefined && !inRelation) {
        fail(`'${text}' refers into the internals of instance '${target.deployment}': expected a deployment node or instance`);
      }
    } else if (resolver.resolveElementText(place, text) === undefined) {
      fail(`'${text}' does not resolve to an element in this view (unknown, or not unique where it is written)`);
    }
  }
  for (const { role, text } of contents.named) {
    if (role !== 'anyView' && role !== 'dynamicView' && role !== 'elementView') continue;
    const viewRole = role === 'anyView' ? 'any' : role === 'dynamicView' ? 'dynamic' : 'element';
    if (resolver.resolveViewText(text, viewRole) === undefined) {
      fail(
        viewRole === 'any'
          ? `navigateTo '${text}' is not a declared view`
          : `navigateTo '${text}' is not a declared ${viewRole} view, which is what LikeC4 accepts here`,
      );
    }
  }

  // (4) Declarations
  for (const { role, text } of contents.named) {
    switch (role) {
      case 'relationshipKind':
        if (!resolver.isRelationshipKind(text)) fail(`relationship kind '${text}' is not declared by a specification of the loaded files`);
        break;
      case 'elementKind':
        if (!resolver.isElementKind(text)) fail(`element kind '${text}' is not declared by a specification of the loaded files`);
        break;
      case 'kind':
        if (!resolver.isElementOrDeploymentNodeKind(text)) {
          fail(`'${text}' is neither an element kind nor a deployment node kind declared by a specification of the loaded files`);
        }
        break;
      case 'tag': {
        const name = text.replace(/^#/, '');
        if (!resolver.isTag(name)) fail(`tag '${name}' is not declared by a specification of the loaded files`);
        break;
      }
    }
  }

  // (5) `with` properties: the property checks of LikeC4 1.59.4
  // (`property-checks.ts`), the one on the body included: an icon is given
  // once (`Icon must be defined once`).
  for (const body of contents.bodies) {
    const icons = ((body.props ?? []) as ParsedAstNode[]).filter((p) => p.$type === 'IconProperty');
    if (icons.length > 1) fail("gives an icon more than once in one 'with' body; LikeC4 reports: Icon must be defined once");
  }
  for (const { property, target } of contents.styles) {
    const key = String(property.key);
    if (!STYLE_FIELDS[target].has(key)) continue;
    const value = (property.$cstNode?.text ?? '').slice(key.length).trim();
    checkParsedStyleValue(property as unknown as ParsedStyleProperty, key, value, workspace, field);
  }
}

/** Step (2) of {@link checkViewRule} for one predicate item. */
function checkRuleItemStructure(
  item: ParsedAstNode,
  kind: ViewRuleKeyword,
  type: IncludeViewType,
  fail: (detail: string) => never,
): void {
  const custom = item.$type === 'FqnExprWith' || item.$type === 'RelationExprWith' ? item : undefined;
  let subject = custom ? (custom.subject as ParsedAstNode) : item;
  if (subject.$type === 'FqnExprWhere' || subject.$type === 'RelationExprWhere') subject = subject.subject as ParsedAstNode;
  if (type === 'dynamic' && RELATION_EXPRESSIONS.has(subject.$type)) {
    fail('a relation predicate, which LikeC4 drops from the include rules of a dynamic view');
  }
  if (!custom) return;
  if (type === 'deployment') fail("uses 'with', which LikeC4 does not apply in deployment views");
  if (kind === 'exclude') fail("uses 'with' in an exclude rule, which LikeC4 reports as invalid");
  const untargeted = subject.$type === 'ElementKindExpression' || subject.$type === 'ElementTagExpression';
  if (type === 'dynamic' && (untargeted || subject.$type === 'WildcardExpression')) {
    fail("uses 'with' on a wildcard, element.kind or element.tag, which LikeC4 ignores in dynamic views");
  }
  if (untargeted) fail("uses 'with' on element.kind or element.tag; LikeC4 expects a reference to a specific element");
}

/** Collect the references and `with` properties below `node` (steps 3 to 5 of {@link checkViewRule}). */
function collectRuleContents(
  node: ParsedAstNode,
  inRelation: boolean,
  contents: RuleContents,
  fail: (detail: string) => never,
): void {
  if (node.$type === 'FqnRef') {
    contents.refs.push({ text: resolveFqnRef(node), inRelation });
    return;
  }
  if (node.$type === 'CustomElementProperties' || node.$type === 'CustomRelationProperties') {
    contents.bodies.push(node);
    const target = node.$type === 'CustomElementProperties' ? 'element' : 'relationship';
    for (const property of (node.props ?? []) as ParsedAstNode[]) contents.styles.push({ property, target });
  }
  const relation = inRelation || RELATION_EXPRESSIONS.has(node.$type);
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (typeof child !== 'object' || child === null) continue;
      if ('$refText' in child) {
        const id = `${node.$type}:${key}`;
        const role = REFERENCE_ROLES[id];
        if (role === undefined) fail(`holds a reference (${id}) that cannot be checked`);
        if (role !== 'style') contents.named.push({ role: role!, text: String((child as { $refText: unknown }).$refText) });
      } else if (typeof (child as { $type?: unknown }).$type === 'string') {
        collectRuleContents(child as ParsedAstNode, relation, contents, fail);
      }
    }
  }
}
