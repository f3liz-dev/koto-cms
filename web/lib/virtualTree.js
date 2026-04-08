/**
 * virtualTree.js — Pure functions for building a CMS virtual tree
 * with i18n grouping from a flat list of GitHub file entries.
 */

/**
 * Extract locale and content key from a real file path.
 * @param {string} realPath
 * @param {object|undefined} i18n - i18n config from .koto.json
 * @returns {{ locale: string|null, contentKey: string }}
 */
export function extractLocale(realPath, i18n) {
  if (!i18n || i18n.mode === "none") {
    return { locale: null, contentKey: realPath };
  }

  if (i18n.mode === "directory") {
    const prefix = i18n.directoryPrefix ?? "";
    let rel = realPath;
    if (prefix && rel.startsWith(prefix)) {
      rel = rel.slice(prefix.length);
    }
    const slashIdx = rel.indexOf("/");
    if (slashIdx < 0) return { locale: null, contentKey: realPath };
    const first = rel.slice(0, slashIdx);
    if (i18n.locales.includes(first)) {
      return { locale: first, contentKey: prefix + rel.slice(slashIdx + 1) };
    }
    return { locale: null, contentKey: realPath };
  }

  if (i18n.mode === "suffix") {
    const sep = i18n.suffixSeparator ?? ".";
    const slashIdx = realPath.lastIndexOf("/");
    const dir = slashIdx >= 0 ? realPath.slice(0, slashIdx + 1) : "";
    const filename = slashIdx >= 0 ? realPath.slice(slashIdx + 1) : realPath;

    const extIdx = filename.lastIndexOf(".");
    if (extIdx <= 0) return { locale: null, contentKey: realPath };
    const ext = filename.slice(extIdx);
    const base = filename.slice(0, extIdx);

    const sepIdx = base.lastIndexOf(sep);
    if (sepIdx <= 0) return { locale: null, contentKey: realPath };
    const candidate = base.slice(sepIdx + sep.length);
    if (i18n.locales.includes(candidate)) {
      const cleanBase = base.slice(0, sepIdx);
      return { locale: candidate, contentKey: dir + cleanBase + ext };
    }
    return { locale: null, contentKey: realPath };
  }

  return { locale: null, contentKey: realPath };
}

/**
 * Build a virtual tree from flat file entries and a KotoConfig.
 * @param {Array<{path:string, name:string, type:string, sha:string}>} files
 * @param {object} config - KotoConfig
 * @returns {{ nodes: Array, contentGroups: Map<string, Map<string, object>> }}
 */
export function buildVirtualTree(files, config) {
  const i18n = config.i18n;
  const nodes = [];
  const contentGroups = new Map();

  for (const file of files) {
    const { locale, contentKey } = extractLocale(file.path, i18n);
    const node = {
      realPath: file.path,
      displayPath: contentKey,
      name: contentKey.split("/").pop() || file.name,
      type: file.type,
      sha: file.sha,
      locale,
      contentKey,
    };
    nodes.push(node);

    if (locale) {
      if (!contentGroups.has(contentKey)) {
        contentGroups.set(contentKey, new Map());
      }
      contentGroups.get(contentKey).set(locale, node);
    }
  }

  return { nodes, contentGroups };
}

/**
 * Convert a flat list of virtual nodes into a nested directory tree.
 * @param {Array} flatNodes - nodes with displayPath
 * @returns {Array} nested tree: { name, displayPath, realPath, type, sha, locale, contentKey, children? }
 */
export function nestTree(flatNodes) {
  const root = { children: new Map() };

  for (const node of flatNodes) {
    const parts = node.displayPath.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Leaf file node — deduplicate by contentKey (only show once per content group)
        if (!current.children.has(part)) {
          current.children.set(part, { ...node, name: part });
        }
      } else {
        // Directory node
        if (!current.children.has(part)) {
          const dirPath = parts.slice(0, i + 1).join("/");
          current.children.set(part, {
            name: part,
            displayPath: dirPath,
            realPath: dirPath,
            type: "dir",
            children: new Map(),
          });
        }
        current = current.children.get(part);
      }
    }
  }

  function mapToSorted(node) {
    if (!node.children) return node;
    const entries = [...node.children.values()].map(mapToSorted);
    const dirs = entries.filter((e) => e.type === "dir");
    const files = entries.filter((e) => e.type !== "dir");
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { ...node, children: [...dirs, ...files] };
  }

  const sorted = mapToSorted(root);
  return sorted.children || [];
}
