import type { CmsConfig, CmsI18nConfig, FileEntry } from '../api';

export interface VirtualNode {
  realPath: string;
  displayPath: string;
  name: string;
  type: 'file' | 'dir';
  sha?: string;
  locale: string | null;
  contentKey: string;
  children?: VirtualNode[];
}

type MutableTreeNode = {
  name?: string;
  displayPath?: string;
  realPath?: string;
  type?: 'file' | 'dir';
  sha?: string;
  locale?: string | null;
  contentKey?: string;
  children: Map<string, MutableTreeNode>;
};

export function extractLocale(
  realPath: string,
  i18n: CmsI18nConfig | undefined,
): { locale: string | null; contentKey: string } {
  if (!i18n || i18n.mode === 'none') {
    return { locale: null, contentKey: realPath };
  }

  if (i18n.mode === 'directory') {
    const prefix = i18n.directoryPrefix ?? '';
    let rel = realPath;
    if (prefix && rel.startsWith(prefix)) {
      rel = rel.slice(prefix.length);
    }
    const slashIdx = rel.indexOf('/');
    if (slashIdx < 0) return { locale: null, contentKey: realPath };
    const first = rel.slice(0, slashIdx);
    if (i18n.locales.includes(first)) {
      return { locale: first, contentKey: prefix + rel.slice(slashIdx + 1) };
    }
    return { locale: null, contentKey: realPath };
  }

  if (i18n.mode === 'suffix') {
    const sep = i18n.suffixSeparator ?? '.';
    const slashIdx = realPath.lastIndexOf('/');
    const dir = slashIdx >= 0 ? realPath.slice(0, slashIdx + 1) : '';
    const filename = slashIdx >= 0 ? realPath.slice(slashIdx + 1) : realPath;

    const extIdx = filename.lastIndexOf('.');
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

export function buildVirtualTree(
  files: FileEntry[],
  config: CmsConfig,
): { nodes: VirtualNode[]; contentGroups: Map<string, Map<string, VirtualNode>> } {
  const i18n = config.i18n;
  const nodes: VirtualNode[] = [];
  const contentGroups = new Map<string, Map<string, VirtualNode>>();

  for (const file of files) {
    const { locale, contentKey } = extractLocale(file.path, i18n);
    const node: VirtualNode = {
      realPath: file.path,
      displayPath: contentKey,
      name: contentKey.split('/').pop() || file.name,
      type: file.type,
      sha: file.sha,
      locale,
      contentKey,
    };
    nodes.push(node);

    if (locale) {
      let group = contentGroups.get(contentKey);
      if (!group) {
        group = new Map();
        contentGroups.set(contentKey, group);
      }
      group.set(locale, node);
    }
  }

  return { nodes, contentGroups };
}

export function nestTree(flatNodes: VirtualNode[]): VirtualNode[] {
  const root: MutableTreeNode = { children: new Map() };

  for (const node of flatNodes) {
    const parts = node.displayPath.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (!current.children.has(part)) {
          current.children.set(part, {
            ...node,
            name: part,
            children: new Map(),
          });
        }
      } else {
        let child = current.children.get(part);
        if (!child) {
          const dirPath = parts.slice(0, i + 1).join('/');
          child = {
            name: part,
            displayPath: dirPath,
            realPath: dirPath,
            type: 'dir',
            locale: null,
            contentKey: dirPath,
            children: new Map(),
          };
          current.children.set(part, child);
        }
        current = child;
      }
    }
  }

  function mapToSorted(node: MutableTreeNode): VirtualNode {
    const entries = [...node.children.values()].map(mapToSorted);
    const dirs = entries.filter((e) => e.type === 'dir');
    const files = entries.filter((e) => e.type !== 'dir');
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return {
      name: node.name ?? '',
      displayPath: node.displayPath ?? '',
      realPath: node.realPath ?? '',
      type: node.type ?? 'dir',
      sha: node.sha,
      locale: node.locale ?? null,
      contentKey: node.contentKey ?? '',
      children: [...dirs, ...files],
    };
  }

  const sorted = mapToSorted(root);
  return sorted.children ?? [];
}
