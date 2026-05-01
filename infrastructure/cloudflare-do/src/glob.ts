/**
 * Port of the glob matcher in lib/koto_cms/github.ex (`glob_match?/2`).
 * Semantics:
 *   `**`  → matches any number of path segments (greedy: .*)
 *   `*`   → matches any characters except `/`
 *   `?`   → matches a single character except `/`
 * Anchored full-string match.
 */
export function globMatch(path: string, pattern: string): boolean {
  const escaped = pattern
    .split('**')
    .map((chunk) =>
      chunk
        .split('*')
        .map(regexEscape)
        .join('[^/]*')
        .replace(/\\\?/g, '[^/]'),
    )
    .join('.*');
  try {
    return new RegExp(`^${escaped}$`).test(path);
  } catch {
    return false;
  }
}

function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
