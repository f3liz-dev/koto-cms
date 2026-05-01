const FRONTMATTER_BLOCK_RE = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;

export const MARKDOC_FENCE_LANG = 'markdoc';

export interface FrontmatterSplit {
  hasFrontmatter: boolean;
  frontmatter: string;
  body: string;
}

export function splitFrontmatter(markdown: string | null | undefined): FrontmatterSplit {
  const source = markdown ?? '';
  const sourceWithoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const match = sourceWithoutBom.match(FRONTMATTER_BLOCK_RE);
  if (!match) return { hasFrontmatter: false, frontmatter: '', body: source };

  const consumedPrefixLength = source.length - sourceWithoutBom.length;
  const consumedLength = consumedPrefixLength + match[0].length;

  return {
    hasFrontmatter: true,
    frontmatter: (match[1] ?? '').replace(/\r/g, '').replace(/\n$/, ''),
    body: source.slice(consumedLength),
  };
}

export function mergeFrontmatter(
  hasFrontmatter: boolean,
  frontmatter: string,
  body: string,
): string {
  if (!hasFrontmatter) return body;
  const fm = (frontmatter ?? '').replace(/\r/g, '');
  const content = body ?? '';
  return `---\n${fm}\n---\n${content}`;
}

/**
 * Walk up from the editor root to find the first actually-scrollable ancestor.
 * In normal mode that's .editor-textarea-wrap; in focus mode it's .app-body.
 */
export function findScrollContainer(root: Element | null): Element {
  let el: Element | null = root?.parentElement ?? null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflow = style.overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    if (overflow === 'auto' || overflow === 'scroll') {
      return el;
    }
    el = el.parentElement;
  }
  return document.documentElement;
}

function wrapAsFence(lines: string[], lang = ''): string[] {
  const head = lang ? `\`\`\`${lang}` : '```';
  return [head, ...lines, '```'];
}

interface MarkdocOpen {
  tag: string;
  selfClose: boolean;
}

// Open: `{% tag %}` or `{% tag attr=value %}`
// Self-close: `{% tag /%}` or `{% tag attr=value /%}`
// Close: `{% /tag %}`
// All must be on their own line (with optional leading whitespace) for block handling.
function parseMarkdocBlockOpen(line: string): MarkdocOpen | null {
  if (/^\s*\{%\s*\//.test(line)) return null;
  const selfClose = line.match(/^\s*\{%\s*([a-zA-Z][\w-]*)(?:\s+[^%]*?)?\s*\/%\}\s*$/);
  if (selfClose) return { tag: selfClose[1], selfClose: true };
  const open = line.match(/^\s*\{%\s*([a-zA-Z][\w-]*)(?:\s+[^%]*?)?\s*%\}\s*$/);
  if (open) return { tag: open[1], selfClose: false };
  return null;
}

function isMarkdocBlockClose(line: string, tag: string): boolean {
  const re = new RegExp(`^\\s*\\{%\\s*/\\s*${tag}\\s*%\\}\\s*$`);
  return re.test(line);
}

function consumeMarkdocTag(
  lines: string[],
  start: number,
): { end: number; output: string[] } | null {
  const open = parseMarkdocBlockOpen(lines[start]);
  if (!open) return null;
  if (open.selfClose) {
    return { end: start, output: wrapAsFence([lines[start]], MARKDOC_FENCE_LANG) };
  }
  let depth = 1;
  let end = start;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const nested = parseMarkdocBlockOpen(line);
    if (nested && nested.tag === open.tag && !nested.selfClose) {
      depth += 1;
      continue;
    }
    if (isMarkdocBlockClose(line, open.tag)) {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (depth !== 0) return null;
  return { end, output: wrapAsFence(lines.slice(start, end + 1), MARKDOC_FENCE_LANG) };
}

function isMarkdocTagBlock(lines: string[]): boolean {
  if (!Array.isArray(lines) || !lines.length) return false;
  const open = parseMarkdocBlockOpen(lines[0]);
  if (!open) return false;
  if (open.selfClose) return lines.length === 1;
  const consumed = consumeMarkdocTag(lines, 0);
  return Boolean(consumed && consumed.end === lines.length - 1);
}

export function encodeSpecialBlocksForEditor(content: string | null | undefined): string {
  const source = String(content ?? '').replace(/\r/g, '');
  const lines = source.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceSize = 0;
  let changed = false;
  const output: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^([`~]{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const markerChar = marker[0];
      const markerSize = marker.length;
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
        fenceSize = markerSize;
      } else if (
        markerChar === fenceChar &&
        markerSize >= fenceSize &&
        /^\s*$/.test(fenceMatch[2] ?? '')
      ) {
        inFence = false;
        fenceChar = '';
        fenceSize = 0;
      }
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    const markdoc = consumeMarkdocTag(lines, i);
    if (markdoc) {
      changed = true;
      output.push(...markdoc.output);
      i = markdoc.end;
      continue;
    }
    output.push(line);
  }
  if (!changed) return source;
  const normalized = output.join('\n');
  return source.endsWith('\n') ? `${normalized}\n` : normalized;
}

interface FenceStart {
  markerChar: string;
  markerSize: number;
  lang: string;
}

function parseFenceStart(line: string): FenceStart | null {
  const match = line.match(/^([`~]{3,})\s*([A-Za-z0-9_-]+)?\s*$/);
  if (!match) return null;
  return {
    markerChar: match[1][0],
    markerSize: match[1].length,
    lang: (match[2] || '').toLowerCase(),
  };
}

function isFenceClose(line: string, markerChar: string, markerSize: number): boolean {
  const close = line.match(/^([`~]{3,})\s*$/);
  if (!close) return false;
  return close[1][0] === markerChar && close[1].length >= markerSize;
}

export function decodeSpecialBlocksFromEditor(content: string | null | undefined): string {
  const source = String(content ?? '').replace(/\r/g, '');
  const lines = source.split('\n');
  const output: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const start = parseFenceStart(lines[i]);
    if (!start) {
      output.push(lines[i]);
      continue;
    }

    let end = i + 1;
    let foundClose = false;
    for (; end < lines.length; end += 1) {
      if (isFenceClose(lines[end], start.markerChar, start.markerSize)) {
        foundClose = true;
        break;
      }
    }

    if (!foundClose) {
      output.push(lines[i]);
      continue;
    }

    const inner = lines.slice(i + 1, end);
    const markdocFence = start.lang === MARKDOC_FENCE_LANG && isMarkdocTagBlock(inner);

    if (markdocFence) {
      changed = true;
      output.push(...inner);
    } else {
      output.push(...lines.slice(i, end + 1));
    }
    i = end;
  }

  if (!changed) return source;
  const decoded = output.join('\n');
  return source.endsWith('\n') ? `${decoded}\n` : decoded;
}
