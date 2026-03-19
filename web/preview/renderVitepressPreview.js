import MarkdownIt from "markdown-it";
import markdownItContainer from "markdown-it-container";
import { sfcPlugin } from "@mdit-vue/plugin-sfc";
import parseFrontMatter from "front-matter";
import DOMPurify from "dompurify";
import { useData } from "./mock-vitepress.js";

const TEMPLATE_RE = /<template>([\s\S]*?)<\/template>/i;

const ALLOWED_TAGS = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "code", "dd", "del", "details",
  "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "kbd", "li", "main", "mark", "ol", "p", "pre", "s", "section", "small",
  "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);

const URL_ATTRS = new Set(["href", "src"]);
const ALLOWED_ATTRS = new Set(["class", "id", "title", "alt", "width", "height", "target", "rel", "aria-label", "aria-hidden", "hidden", "data-sync-placeholder"]);

const CUSTOM_BLOCK_TITLES = {
  info: "Info",
  tip: "Tip",
  warning: "Warning",
  danger: "Danger",
  details: "Details",
};

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// Use @mdit-vue/plugin-sfc for script setup extraction
markdown.use(sfcPlugin);

// Register container plugins for VitePress-style custom blocks
["info", "tip", "warning", "danger"].forEach((type) => {
  markdown.use(markdownItContainer, type, {
    render: (tokens, idx) => {
      if (tokens[idx].nesting === 1) {
        return `<div class="custom-block ${type}"><p class="custom-block-title">${CUSTOM_BLOCK_TITLES[type]}</p>\n`;
      }
      return "</div>\n";
    },
  });
});

markdown.use(markdownItContainer, "details", {
  render: (tokens, idx) => {
    if (tokens[idx].nesting === 1) {
      return '<details class="custom-block details"><summary>Details</summary>\n';
    }
    return "</details>\n";
  },
});

// Intercept vp-vue fenced blocks so their content is NOT wrapped in <pre><code>.
// Mustaches will already be replaced on the raw string before this renderer runs.
const defaultFenceRenderer =
  markdown.renderer.rules.fence?.bind(markdown.renderer.rules) ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === "vp-vue") {
    return `<div class="vp-vue-block">${token.content}</div>`;
  }
  return defaultFenceRenderer(tokens, idx, options, env, self);
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizePath(path) {
  if (!path || typeof path !== "string") return "";
  return path.trim().replace(/^\/+/, "");
}

function parseBindings(scriptSource, filePath, warnings, dataOverrides = {}) {
  if (!scriptSource.trim()) return {};

  const bindings = {};
  const importOk = /import\s*\{\s*useData\s*\}\s*from\s*["']vitepress["']\s*;?/m.test(scriptSource);
  if (!importOk) {
    warnings.push("Only `import { useData } from 'vitepress'` is supported in preview scripts.");
    return bindings;
  }

  const useDataMatch = scriptSource.match(/const\s*\{([^}]+)\}\s*=\s*useData\s*\(\s*\)\s*;?/m);
  if (!useDataMatch) {
    warnings.push("No supported `const { ... } = useData()` binding was found.");
    return bindings;
  }

  const rawBindings = useDataMatch[1].split(",").map((item) => item.trim()).filter(Boolean);
  const data = useData();

  const normalizedPath = normalizePath(filePath || "index.md");
  if (normalizedPath) {
    if (data.page?.value && typeof data.page.value === "object") {
      data.page.value.relativePath = normalizedPath;
    }
  }

  const frontmatterValue = dataOverrides.frontmatter;
  if (frontmatterValue && typeof frontmatterValue === "object") {
    if (data.frontmatter?.value && typeof data.frontmatter.value === "object") {
      data.frontmatter.value = frontmatterValue;
    }
    if (data.page?.value && typeof data.page.value === "object") {
      data.page.value.frontmatter = frontmatterValue;
    }
  }

  for (const entry of rawBindings) {
    const [left, right] = entry.split(":").map((x) => x?.trim());
    const sourceKey = right ? left : left;
    const targetKey = right || left;
    if (!sourceKey || !targetKey) continue;

    const source = data[sourceKey];
    if (source && typeof source === "object" && "value" in source) {
      bindings[targetKey] = source.value;
    } else if (source !== undefined) {
      bindings[targetKey] = source;
    } else {
      warnings.push(`Unknown useData binding: ${sourceKey}`);
    }
  }

  return bindings;
}

function getPathValue(scope, expr) {
  const clean = expr.trim();
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(clean)) return undefined;
  const parts = clean.split(".");
  let cur = scope;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function interpolateMustaches(text, scope) {
  if (!text.includes("{{")) return text;
  return text.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_m, expr) => {
    const value = getPathValue(scope, expr);
    if (value === undefined) return "";
    return stableSerialize(value);
  });
}

function interpolateOutsideFences(source, scope) {
  const parts = source.split(/(^[`~]{3,}.*$[\s\S]*?^[`~]{3,}\s*$)/m);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : interpolateMustaches(part, scope)))
    .join("");
}

/**
 * Sanitize rendered HTML using DOMPurify and stamp data-sync-index on every
 * direct element child of the root — matching the indices that syncIndexPlugin
 * stamps on ProseMirror's top-level nodes in the editor.
 */
function sanitizeHtml(unsafe) {
  // Configure DOMPurify with strict security settings
  const clean = DOMPurify.sanitize(unsafe, {
    ALLOWED_TAGS: Array.from(ALLOWED_TAGS),
    ALLOWED_ATTR: Array.from(new Set([...ALLOWED_ATTRS, ...URL_ATTRS])),
    KEEP_CONTENT: true,
    ADD_ATTR: ["data-sync-placeholder"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "base", "link", "meta"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  // Parse the sanitized HTML to add data-sync-index
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__root">${clean}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return "";

  // Stamp data-sync-index on every direct element child of root
  let syncIndex = 0;
  for (const child of root.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      child.setAttribute("data-sync-index", String(syncIndex++));
    }
  }

  return root.innerHTML;
}

function renderMarkdownPreview(source, filePath) {
  const warnings = [];
  const raw = source?.charCodeAt?.(0) === 0xfeff ? source.slice(1) : (source || "");
  let withoutFrontmatter = raw;
  let frontmatter = {};

  try {
    const parsed = parseFrontMatter(raw);
    withoutFrontmatter = parsed.body ?? raw;
    frontmatter = parsed.attributes && typeof parsed.attributes === "object" ? parsed.attributes : {};
  } catch {
    withoutFrontmatter = raw;
    frontmatter = {};
  }

  // Use markdown-it with sfcPlugin to extract script setup
  const env = {};
  markdown.render(withoutFrontmatter, env);
  
  // Extract script from env.sfcBlocks if available (sfcPlugin populates this)
  const scriptBlock = env.sfcBlocks?.scripts?.find(s => s.setup);
  const script = scriptBlock?.content || "";
  const scope = parseBindings(script, filePath, warnings, { frontmatter });
  
  // Interpolate mustaches before rendering markdown
  const interpolated = interpolateOutsideFences(withoutFrontmatter, scope);
  
  // Render the interpolated markdown
  const rendered = markdown.render(interpolated);
  const safeHtml = sanitizeHtml(rendered);

  return { html: safeHtml, warnings };
}

function renderVueSfcPreview(source, filePath) {
  const warnings = [];
  
  // Use sfcPlugin to parse Vue SFC
  const env = {};
  markdown.render(source, env);
  
  const scriptBlock = env.sfcBlocks?.scripts?.find(s => s.setup);
  const script = scriptBlock?.content || "";
  const scope = parseBindings(script, filePath, warnings);

  const templateMatch = source.match(TEMPLATE_RE);
  if (!templateMatch) {
    warnings.push("No <template> block found. Showing escaped source.");
    return {
      html: `<pre>${escapeHtml(source)}</pre>`,
      warnings,
    };
  }

  const interpolated = interpolateMustaches(templateMatch[1], scope);
  const safeHtml = sanitizeHtml(interpolated);
  return { html: safeHtml, warnings };
}

function isMarkdownPath(path) {
  return /\.(md|markdown|mdown|mkd|mkdn|mdx)$/i.test(path || "");
}

function isVuePath(path) {
  return /\.vue$/i.test(path || "");
}

export function renderVitepressPreview(content, filePath) {
  if (isMarkdownPath(filePath)) return renderMarkdownPreview(content || "", filePath);
  if (isVuePath(filePath)) return renderVueSfcPreview(content || "", filePath);
  return { html: "", warnings: [] };
}