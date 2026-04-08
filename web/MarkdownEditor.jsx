import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Crepe } from "@milkdown/crepe";
import { LanguageDescription } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import { markdown } from "@codemirror/lang-markdown";

const FRONTMATTER_BLOCK_RE = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;
const VP_DIRECTIVE_FENCE_LANG = "vp-directive";
const VP_VUE_FENCE_LANG = "vp-vue";
const VP_XML_LEGACY_FENCE_LANG = "vp-xml";
const VP_FENCE_LANGUAGES = [VP_DIRECTIVE_FENCE_LANG, VP_VUE_FENCE_LANG, VP_XML_LEGACY_FENCE_LANG];

const VP_FENCE_LANGUAGE_DESCRIPTIONS = VP_FENCE_LANGUAGES.map((name) =>
  LanguageDescription.of({
    name,
    alias: [name],
    load: async () => markdown(),
  }),
);

function buildCodeMirrorLanguageList() {
  const out = [];
  const seen = new Set();
  for (const entry of [...codeMirrorLanguages, ...VP_FENCE_LANGUAGE_DESCRIPTIONS]) {
    const key = String(entry?.name || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function splitFrontmatter(markdown) {
  const source = markdown ?? "";
  const sourceWithoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const match = sourceWithoutBom.match(FRONTMATTER_BLOCK_RE);
  if (!match) return { hasFrontmatter: false, frontmatter: "", body: source };

  const consumedPrefixLength = source.length - sourceWithoutBom.length;
  const consumedLength = consumedPrefixLength + match[0].length;

  return {
    hasFrontmatter: true,
    frontmatter: (match[1] ?? "").replace(/\r/g, "").replace(/\n$/, ""),
    body: source.slice(consumedLength),
  };
}

function mergeFrontmatter(hasFrontmatter, frontmatter, body) {
  if (!hasFrontmatter) return body;
  const fm = (frontmatter ?? "").replace(/\r/g, "");
  const content = body ?? "";
  return `---\n${fm}\n---\n${content}`;
}

/**
 * Find the actual scrolling ancestor of the editor root.
 * In normal mode that's .editor-textarea-wrap; in focus mode the
 * whole panel scrolls via .app-body. We walk up the DOM and return
 * the first element that is actually scrollable.
 */
function findScrollContainer(root) {
  let el = root?.parentElement;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflow = style.overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
    // Also accept elements that overflow but are just slightly larger
    if ((overflow === "auto" || overflow === "scroll")) {
      return el;
    }
    el = el.parentElement;
  }
  return document.documentElement;
}

function wrapAsFence(lines, lang = "") {
  const head = lang ? `\`\`\`${lang}` : "```";
  return [head, ...lines, "```"];
}

function consumeDirectiveContainer(lines, start) {
  const open = lines[start];
  if (!/^:::\s*(?:info|tip|warning|danger|details)\b.*$/.test(open)) return null;
  let end = start + 1;
  for (; end < lines.length; end += 1) {
    if (/^:::\s*$/.test(lines[end])) break;
  }
  if (end >= lines.length) return null;
  return {
    end,
    output: wrapAsFence(lines.slice(start, end + 1), VP_DIRECTIVE_FENCE_LANG),
  };
}

function consumeXmlBlock(lines, start) {
  const line = lines[start];
  const single = line.match(/^\s*<([A-Za-z][\w-]*)(?:\s+[^<>]*)?\/>\s*$/);
  if (single) {
    return { end: start, output: wrapAsFence([line], VP_VUE_FENCE_LANG) };
  }
  const singlePair = line.match(/^\s*<([A-Za-z][\w-]*)(?:\s+[^<>]*)?>[\s\S]*<\/\1>\s*$/);
  if (singlePair) {
    return { end: start, output: wrapAsFence([line], VP_VUE_FENCE_LANG) };
  }
  const open = line.match(/^\s*<([A-Za-z][\w-]*)(?:\s+[^<>]*)?>\s*$/);
  if (!open) return null;
  const tag = open[1];
  const openRe = new RegExp(`^\\s*<${tag}(?:\\s+[^<>]*)?>\\s*$`);
  const closeRe = new RegExp(`^\\s*</${tag}>\\s*$`);
  const selfCloseRe = new RegExp(`^\\s*<${tag}(?:\\s+[^<>]*)?/>\\s*$`);
  let depth = 1;
  let end = start;
  for (let i = start + 1; i < lines.length; i += 1) {
    const cur = lines[i];
    if (selfCloseRe.test(cur)) continue;
    if (openRe.test(cur)) depth += 1;
    if (closeRe.test(cur)) depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  if (depth !== 0) return null;
  return {
    end,
    output: wrapAsFence(lines.slice(start, end + 1), VP_VUE_FENCE_LANG),
  };
}

function encodeSpecialBlocksForEditor(content) {
  const source = String(content || "").replace(/\r/g, "");
  const lines = source.split("\n");
  let inFence = false;
  let fenceChar = "";
  let fenceSize = 0;
  let changed = false;
  const output = [];
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
      } else if (markerChar === fenceChar && markerSize >= fenceSize && /^\s*$/.test(fenceMatch[2] || "")) {
        inFence = false;
        fenceChar = "";
        fenceSize = 0;
      }
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    const directive = consumeDirectiveContainer(lines, i);
    if (directive) {
      changed = true;
      output.push(...directive.output);
      i = directive.end;
      continue;
    }
    const xml = consumeXmlBlock(lines, i);
    if (xml) {
      changed = true;
      output.push(...xml.output);
      i = xml.end;
      continue;
    }
    output.push(line);
  }
  if (!changed) return source;
  const normalized = output.join("\n");
  return source.endsWith("\n") ? `${normalized}\n` : normalized;
}

function parseFenceStart(line) {
  const match = line.match(/^([`~]{3,})\s*([A-Za-z0-9_-]+)?\s*$/);
  if (!match) return null;
  return {
    markerChar: match[1][0],
    markerSize: match[1].length,
    lang: (match[2] || "").toLowerCase(),
  };
}

function isFenceClose(line, markerChar, markerSize) {
  const close = line.match(/^([`~]{3,})\s*$/);
  if (!close) return false;
  return close[1][0] === markerChar && close[1].length >= markerSize;
}

function isDirectiveContainerBlock(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;
  if (!/^:::\s*(?:info|tip|warning|danger|details)\b.*$/.test(lines[0])) return false;
  if (!/^:::\s*$/.test(lines[lines.length - 1])) return false;
  return true;
}

function isXmlNodeBlock(lines) {
  if (!Array.isArray(lines) || !lines.length) return false;
  if (lines.length === 1) {
    const line = lines[0];
    if (/^\s*<([A-Za-z][\w-]*)(?:\s+[^<>]*)?\/>\s*$/.test(line)) return true;
    return /^\s*<([A-Za-z][\w-]*)(?:\s+[^<>]*)?>[\s\S]*<\/\1>\s*$/.test(line);
  }
  const consumed = consumeXmlBlock(lines, 0);
  return Boolean(consumed && consumed.end === lines.length - 1);
}

function decodeSpecialBlocksFromEditor(content) {
  const source = String(content || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const output = [];
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
    const directiveFence = start.lang === VP_DIRECTIVE_FENCE_LANG && isDirectiveContainerBlock(inner);
    const xmlFence = (start.lang === VP_VUE_FENCE_LANG || start.lang === VP_XML_LEGACY_FENCE_LANG) && isXmlNodeBlock(inner);

    if (directiveFence || xmlFence) {
      changed = true;
      output.push(...inner);
    } else {
      output.push(...lines.slice(i, end + 1));
    }
    i = end;
  }

  if (!changed) return source;
  const decoded = output.join("\n");
  return source.endsWith("\n") ? `${decoded}\n` : decoded;
}

export function MarkdownEditor({ value, editorKey, onChange }) {
  const rootRef = useRef(null);
  const parsed = useMemo(() => splitFrontmatter(value), [value]);
  const codeMirrorLanguageList = useMemo(() => buildCodeMirrorLanguageList(), []);
  const [hasFrontmatter, setHasFrontmatter] = useState(parsed.hasFrontmatter);
  const [frontmatter, setFrontmatter] = useState(parsed.frontmatter);
  const frontmatterRef = useRef(parsed.frontmatter);
  const hasFrontmatterRef = useRef(parsed.hasFrontmatter);
  const markdownBodyRef = useRef(parsed.body);
  const lastEmittedContentRef = useRef(value ?? "");

  useEffect(() => {
    setHasFrontmatter(parsed.hasFrontmatter);
    setFrontmatter(parsed.frontmatter);
    frontmatterRef.current = parsed.frontmatter;
    hasFrontmatterRef.current = parsed.hasFrontmatter;
    markdownBodyRef.current = parsed.body;
    lastEmittedContentRef.current = value ?? "";
  }, [parsed.frontmatter, parsed.hasFrontmatter, parsed.body, editorKey]);

  useEffect(() => {
    let editor = null;
    let alive = true;

    (async () => {
      const initialEncodedBody = encodeSpecialBlocksForEditor(parsed.body);
      const initialDecodedBody = decodeSpecialBlocksFromEditor(initialEncodedBody);
      const initialMerged = mergeFrontmatter(parsed.hasFrontmatter, parsed.frontmatter, initialDecodedBody);
      if (lastEmittedContentRef.current !== initialMerged) {
        lastEmittedContentRef.current = initialMerged;
        onChange(initialMerged);
      }

      editor = new Crepe({
        root: rootRef.current,
        defaultValue: initialEncodedBody,
        features: {
          [Crepe.Feature.CodeMirror]: true,
        },
        featureConfigs: {
          [Crepe.Feature.CodeMirror]: {
            languages: codeMirrorLanguageList,
          },
        },
      });

      editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (!alive) return;
          const decoded = decodeSpecialBlocksFromEditor(markdown);
          const merged = mergeFrontmatter(hasFrontmatterRef.current, frontmatterRef.current, decoded);
          markdownBodyRef.current = decoded;
          if (lastEmittedContentRef.current !== merged) {
            lastEmittedContentRef.current = merged;
            onChange(merged);
          }
        });
      });
      await editor.create();
    })().catch((err) => {
      console.error("Milkdown init failed", err);
    });

    return () => {
      alive = false;
      editor?.destroy();
    };
    // onChange intentionally omitted — accessed via closure over refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey, codeMirrorLanguageList]);


  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event) => {
      if (event.ctrlKey) return;
      const container = findScrollContainer(root);
      if (!container) return;
      if (container.scrollHeight <= container.clientHeight) return;
      if (event.deltaY === 0 && event.deltaX === 0) return;
      container.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: "auto" });
      event.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [editorKey]);

  const onFrontmatterInput = (event) => {
    const next = event.currentTarget.value;
    setFrontmatter(next);
    frontmatterRef.current = next;
    const merged = mergeFrontmatter(true, next, markdownBodyRef.current);
    if (lastEmittedContentRef.current !== merged) {
      lastEmittedContentRef.current = merged;
      onChange(merged);
    }
  };

  const onEnableFrontmatter = () => {
    setHasFrontmatter(true);
    setFrontmatter("");
    hasFrontmatterRef.current = true;
    frontmatterRef.current = "";
    const merged = mergeFrontmatter(true, "", markdownBodyRef.current);
    if (lastEmittedContentRef.current !== merged) {
      lastEmittedContentRef.current = merged;
      onChange(merged);
    }
  };

  const onDisableFrontmatter = () => {
    setHasFrontmatter(false);
    hasFrontmatterRef.current = false;
    if (lastEmittedContentRef.current !== markdownBodyRef.current) {
      lastEmittedContentRef.current = markdownBodyRef.current;
      onChange(markdownBodyRef.current);
    }
  };

  return (
    <div class="editor-shell h-full min-h-0 flex flex-col">
      <section class={`frontmatter-wrap${hasFrontmatter ? "" : " frontmatter-wrap-empty"}`}>
        <div class="frontmatter-head">
          <div class="frontmatter-label">Frontmatter</div>
          <button class="frontmatter-toggle" type="button" onClick={hasFrontmatter ? onDisableFrontmatter : onEnableFrontmatter}>
            {hasFrontmatter ? "Remove" : "Add"}
          </button>
        </div>
        {hasFrontmatter ? (
          <textarea class="frontmatter-editor" value={frontmatter} onInput={onFrontmatterInput} spellcheck={false} />
        ) : (
          <p class="frontmatter-hint">No frontmatter block in this file.</p>
        )}
      </section>
      <div class="editor-surface w-full min-h-0 flex-1" ref={rootRef} />
    </div>
  );
}