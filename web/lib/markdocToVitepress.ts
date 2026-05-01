/**
 * Convert Markdoc source into VitePress-flavored markdown.
 *
 * Mapping:
 *   {% callout type="info" title="..." %}body{% /callout %}  →  :::info ...\nbody\n:::
 *   {% tip %}body{% /tip %}                                   →  :::tip\nbody\n:::
 *   {% warning %}…{% /warning %}                              →  :::warning\n…\n:::
 *   {% danger %}…{% /danger %}                                →  :::danger\n…\n:::
 *   {% details title="x" %}…{% /details %}                    →  :::details x\n…\n:::
 *   {% info %} / {% note %}                                   →  :::info / :::note
 *   {% SomeOther attr=1 %}…{% /SomeOther %}                   →  <SomeOther attr="1">…</SomeOther>
 *   {% image src="x" alt="y" /%}                              →  <image src="x" alt="y" />
 *
 * Assumptions / limits:
 *   - Block tags appear on their own line (opening and closing lines).
 *     This matches how the editor's fence round-trip preserves them.
 *   - Code fences are passed through verbatim.
 *   - Frontmatter is passed through verbatim.
 *   - Attribute values are parsed as string | number | boolean; variable
 *     references and function-call attrs fall back to their bare text.
 */

export interface ConvertOptions {
  /** Tags whose name becomes the VitePress container name. */
  directContainers?: Set<string>;
  /** The tag whose `typeAttr` attribute picks the container name. */
  calloutTag?: string;
  calloutTypeAttr?: string;
}

const DEFAULT_DIRECT_CONTAINERS: ReadonlySet<string> = new Set([
  'tip',
  'info',
  'warning',
  'danger',
  'details',
  'note',
]);
const DEFAULT_CALLOUT_TAG = 'callout';
const DEFAULT_CALLOUT_TYPE_ATTR = 'type';

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*\r?\n/m;

type AttrValue = string | number | boolean;
type Attrs = Record<string, AttrValue>;

type Frame =
  | { kind: 'container'; tag: string }
  | { kind: 'component'; tag: string };

export function markdocToVitepress(source: string, opts: ConvertOptions = {}): string {
  const directContainers = opts.directContainers ?? DEFAULT_DIRECT_CONTAINERS;
  const calloutTag = opts.calloutTag ?? DEFAULT_CALLOUT_TAG;
  const calloutTypeAttr = opts.calloutTypeAttr ?? DEFAULT_CALLOUT_TYPE_ATTR;

  // Preserve frontmatter verbatim.
  let head = '';
  let body = source;
  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch && fmMatch.index === 0) {
    head = fmMatch[0];
    body = source.slice(fmMatch[0].length);
  }

  const lines = body.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  const stack: Frame[] = [];

  let inFence = false;
  let fenceChar = '';
  let fenceSize = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^([`~]{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceSize = marker.length;
      } else if (
        marker[0] === fenceChar &&
        marker.length >= fenceSize &&
        /^\s*$/.test(fenceMatch[2] ?? '')
      ) {
        inFence = false;
        fenceChar = '';
        fenceSize = 0;
      }
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const selfClose = line.match(/^(\s*)\{%\s*([a-zA-Z][\w-]*)(\s+[^%]*?)?\s*\/%\}\s*$/);
    if (selfClose) {
      const indent = selfClose[1];
      const name = selfClose[2];
      const attrs = parseAttrs(selfClose[3] ?? '');
      out.push(`${indent}<${name}${serializeAttrs(attrs)} />`);
      continue;
    }

    const open = line.match(/^(\s*)\{%\s*(?!\/)([a-zA-Z][\w-]*)(\s+[^%]*?)?\s*%\}\s*$/);
    if (open) {
      const indent = open[1];
      const name = open[2];
      const attrs = parseAttrs(open[3] ?? '');

      if (name === calloutTag && attrs[calloutTypeAttr] != null) {
        const type = String(attrs[calloutTypeAttr]);
        const title = attrs.title != null ? ` ${String(attrs.title)}` : '';
        out.push(`${indent}:::${type}${title}`);
        stack.push({ kind: 'container', tag: name });
        continue;
      }
      if (directContainers.has(name)) {
        const title = attrs.title != null ? ` ${String(attrs.title)}` : '';
        out.push(`${indent}:::${name}${title}`);
        stack.push({ kind: 'container', tag: name });
        continue;
      }
      out.push(`${indent}<${name}${serializeAttrs(attrs)}>`);
      stack.push({ kind: 'component', tag: name });
      continue;
    }

    const close = line.match(/^(\s*)\{%\s*\/\s*([a-zA-Z][\w-]*)\s*%\}\s*$/);
    if (close) {
      const indent = close[1];
      const name = close[2];
      const frame = stack.pop();
      if (frame && frame.tag === name) {
        out.push(frame.kind === 'container' ? `${indent}:::` : `${indent}</${name}>`);
        continue;
      }
      // Mismatched close tag — put the frame back and pass through.
      if (frame) stack.push(frame);
      out.push(line);
      continue;
    }

    out.push(line);
  }

  return head + out.join('\n');
}

function parseAttrs(raw: string): Attrs {
  const out: Attrs = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const key = m[1];
    const dq = m[2];
    const sq = m[3];
    const bare = m[4];
    if (dq !== undefined) {
      out[key] = dq;
    } else if (sq !== undefined) {
      out[key] = sq;
    } else if (bare !== undefined) {
      if (bare === 'true') out[key] = true;
      else if (bare === 'false') out[key] = false;
      else if (/^-?\d+(?:\.\d+)?$/.test(bare)) out[key] = Number(bare);
      else out[key] = bare;
    }
  }
  return out;
}

function serializeAttrs(attrs: Attrs): string {
  const entries = Object.entries(attrs);
  if (!entries.length) return '';
  return entries
    .map(([k, v]) => {
      const escaped = String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return ` ${k}="${escaped}"`;
    })
    .join('');
}
