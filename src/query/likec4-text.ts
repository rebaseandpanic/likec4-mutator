/**
 * Text normalization LikeC4 1.60.0 applies when it builds its model from
 * string values (language-server `removeIndent` / `toSingleLine`).  Used for
 * effective values only; declarative views keep strings as written.
 */
import { dedent } from 'strip-indent';

/**
 * LikeC4 `removeIndent` for a plain string: drop leading and trailing blank
 * lines, remove the common indentation, then trim.
 */
export function removeIndent(text: string): string {
  return dedent(text).trim();
}

/** LikeC4 `toSingleLine` for a plain string: {@link removeIndent}, then lines joined with a space. */
export function toSingleLine(text: string): string {
  return removeIndent(text).split('\n').join(' ');
}

/** A `MarkdownOrString` value: a plain string in `text` or a triple-quoted Markdown string in `markdown`. */
export interface MarkdownOrString {
  text?: string;
  markdown?: string;
}

/** The `MarkdownOrString` value of a body string property, if it has one. */
export function readMarkdownOrString(prop: unknown): MarkdownOrString | undefined {
  const value = (prop as { value?: unknown }).value;
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as { text?: unknown; markdown?: unknown };
  return {
    ...(typeof v.text === 'string' && { text: v.text }),
    ...(typeof v.markdown === 'string' && { markdown: v.markdown }),
  };
}

/**
 * A body `title` / `technology` as LikeC4 reads it
 * (`removeIndent(parseMarkdownAsString(value))`): the Markdown content, or
 * the plain string when the Markdown string is empty or absent, without
 * indentation and trimmed.
 */
export function markdownAsString(value: MarkdownOrString | undefined): string | undefined {
  const text = value?.markdown || value?.text;
  return text === undefined ? undefined : removeIndent(text);
}

/**
 * A body `summary` / `description` as LikeC4 reads it
 * (`parseMarkdownOrString`): the Markdown content, otherwise the plain
 * string, without indentation and trimmed; the empty string for a value
 * that holds neither.
 */
export function markdownOrString(value: MarkdownOrString | undefined): string | undefined {
  if (value === undefined) return undefined;
  return removeIndent(value.markdown ?? value.text ?? '');
}

/** LikeC4's `BASIC_ESCAPES` of string literals. */
const BASIC_ESCAPES: Readonly<Record<string, string>> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '0': '\0' };

/**
 * LikeC4 `unescapeKeepingSlash`: the value of a quoted string literal as
 * written (`quoted` with its quotes), unescaped as langium does except that
 * an escaped slash `\/` is kept as is (a title's literal slash).
 */
export function unescapeKeepingSlash(quoted: string): string {
  let result = '';
  for (let i = 1; i < quoted.length - 1; i++) {
    const c = quoted[i]!;
    if (c === '\\') {
      const next = quoted[++i] ?? '';
      result += next === '/' ? '\\/' : (BASIC_ESCAPES[next] ?? next);
    } else result += c;
  }
  return result;
}
