/**
 * Structured style of elements, deployment nodes, instances and
 * relationships, read the way LikeC4 1.59.4 builds the data layer of its
 * model (language-server `parseElementStyle` / `parseStyleProps` and
 * `toRelationshipStyle`), without theme defaults:
 *
 * - an element body: the first `style { ... }` block, later properties
 *   overriding earlier ones, then a body-level `icon` property overriding
 *   `style.icon`;
 * - an element or deployment node kind: the first `style { ... }` block of the
 *   kind (a kind has no body-level `icon`);
 * - a relationship body: the first `style { ... }` block;
 * - a relationship kind: the style properties written directly in the kind
 *   (`color`, `line`, `head`, `tail`).
 *
 * Values are reported as written, with three exceptions that follow LikeC4:
 * an empty value is no value, a size alias is reported as its token
 * (`small` → `sm`), and `multiple` is a boolean.  Opacity keeps its written
 * form (`'40%'`); an icon is the library icon name or the value as written
 * (LikeC4 resolves relative paths and image aliases against the project, the
 * library does not).  A color written as a hex or rgb value inside a style
 * block is no theme or custom color and is ignored, as LikeC4 ignores it.
 */
import type { ElementStyle, RelationshipStyle } from '../mutator/codegen.js';

/** Structural view of a style property node. */
interface StylePropNode {
  $type?: string;
  key?: string;
  value?: unknown;
  themeColor?: string;
  customColor?: { $refText?: string };
  libicon?: { $refText?: string };
  props?: unknown[];
}

/** LikeC4 `parseAstSizeValue`: the long aliases map to the short tokens. */
const SIZE_TOKENS: Readonly<Record<string, string>> = {
  xs: 'xs',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
  xsmall: 'xs',
  small: 'sm',
  medium: 'md',
  large: 'lg',
  xlarge: 'xl',
};

const ELEMENT_SIZE_FIELDS: Readonly<Record<string, 'size' | 'padding' | 'textSize' | 'iconSize'>> = {
  ShapeSizeProperty: 'size',
  PaddingSizeProperty: 'padding',
  TextSizeProperty: 'textSize',
  IconSizeProperty: 'iconSize',
};

/**
 * Style of an element, deployment node or instance body: the first
 * `style { ... }` block, with a body-level `icon` property overriding its
 * icon.  Undefined when no field is set.
 *
 * @param props - The body's properties (`body.props`)
 */
export function readElementStyle(props: readonly unknown[] | undefined): ElementStyle | undefined {
  const style = readElementStyleBlock(props);
  const iconProp = (props ?? []).find((p) => (p as StylePropNode).$type === 'IconProperty') as StylePropNode | undefined;
  const icon = iconProp && readIcon(iconProp);
  return nonEmpty(icon ? { ...style, icon } : style);
}

/**
 * Style of an element or deployment node kind: the first `style { ... }`
 * block of the kind declaration.  Undefined when no field is set.
 *
 * @param props - The kind declaration's properties (`props`)
 */
export function readKindElementStyle(props: readonly unknown[] | undefined): ElementStyle | undefined {
  return nonEmpty(readElementStyleBlock(props));
}

/**
 * Style of a relationship body (logical or deployment): the first
 * `style { ... }` block.  Undefined when no field is set.
 *
 * @param props - The relationship body's properties (`body.props`)
 */
export function readRelationshipStyle(props: readonly unknown[] | undefined): RelationshipStyle | undefined {
  const block = (props ?? []).find((p) => (p as StylePropNode).$type === 'RelationStyleProperty') as
    | StylePropNode
    | undefined;
  return nonEmpty(relationshipStyleOf(block?.props));
}

/**
 * Style of a relationship kind: the style properties written directly in the
 * kind declaration.  Undefined when no field is set.
 *
 * @param props - The kind declaration's properties (`props`)
 */
export function readKindRelationshipStyle(props: readonly unknown[] | undefined): RelationshipStyle | undefined {
  return nonEmpty(relationshipStyleOf(props));
}

/**
 * Merge two styles field by field: every field set in `own` overrides the
 * same field of `base`.  Undefined when neither sets a field.
 */
export function mergeStyle<T extends ElementStyle | RelationshipStyle>(
  base: T | undefined,
  own: T | undefined,
): T | undefined {
  return nonEmpty({ ...base, ...own } as T);
}

function readElementStyleBlock(props: readonly unknown[] | undefined): ElementStyle {
  const block = (props ?? []).find((p) => (p as StylePropNode).$type === 'ElementStyleProperty') as
    | StylePropNode
    | undefined;
  return elementStyleOf(block?.props);
}

/**
 * Element style fields written directly in a property list, as in a view
 * predicate's `with { ... }` block: later properties override earlier ones.
 * Undefined when no field is set.
 *
 * @param props - The properties (`custom.props`); non-style properties are skipped
 */
export function readElementStyleProps(props: readonly unknown[] | undefined): ElementStyle | undefined {
  return nonEmpty(elementStyleOf(props));
}

function elementStyleOf(props: readonly unknown[] | undefined): ElementStyle {
  const style: ElementStyle = {};
  for (const raw of props ?? []) {
    const prop = raw as StylePropNode;
    const value = typeof prop.value === 'string' && prop.value !== '' ? prop.value : undefined;
    switch (prop.$type) {
      case 'BorderProperty':
        if (value) style.border = value;
        break;
      case 'ColorProperty': {
        const color = readColor(prop);
        if (color) style.color = color;
        break;
      }
      case 'ShapeProperty':
        if (value) style.shape = value;
        break;
      case 'IconProperty': {
        const icon = readIcon(prop);
        if (icon) style.icon = icon;
        break;
      }
      case 'IconColorProperty': {
        const color = readColor(prop);
        if (color) style.iconColor = color;
        break;
      }
      case 'IconPositionProperty':
        if (value) style.iconPosition = value;
        break;
      case 'OpacityProperty':
        if (value) style.opacity = value;
        break;
      case 'MultipleProperty':
        style.multiple = prop.value === true;
        break;
      default: {
        const field = prop.$type === undefined ? undefined : ELEMENT_SIZE_FIELDS[prop.$type];
        if (field && value) style[field] = SIZE_TOKENS[value] ?? value;
      }
    }
  }
  return style;
}

function relationshipStyleOf(props: readonly unknown[] | undefined): RelationshipStyle {
  const style: RelationshipStyle = {};
  for (const raw of props ?? []) {
    const prop = raw as StylePropNode;
    const value = typeof prop.value === 'string' && prop.value !== '' ? prop.value : undefined;
    switch (prop.$type) {
      case 'ColorProperty': {
        const color = readColor(prop);
        if (color) style.color = color;
        break;
      }
      case 'LineProperty':
        if (value) style.line = value;
        break;
      case 'ArrowProperty':
        if (value && (prop.key === 'head' || prop.key === 'tail')) style[prop.key] = value;
        break;
    }
  }
  return style;
}

/** LikeC4 `toColor`: a theme color name or a custom color reference. */
function readColor(prop: StylePropNode): string | undefined {
  return prop.themeColor || prop.customColor?.$refText || undefined;
}

/** A library icon name (`tech:go`), or the value as written (`none`, a URL, a path). */
function readIcon(prop: StylePropNode): string | undefined {
  if (prop.libicon) return prop.libicon.$refText || undefined;
  return typeof prop.value === 'string' && prop.value !== '' ? prop.value : undefined;
}

function nonEmpty<T extends object>(style: T): T | undefined {
  return Object.values(style).some((v) => v !== undefined) ? style : undefined;
}
