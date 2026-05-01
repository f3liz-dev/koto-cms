import { Api, type FileEntry } from '../api';

function normalizeDirPath(path: string | null | undefined): string {
  return (path ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function parentDir(path: string): string {
  const normalized = normalizeDirPath(path);
  if (!normalized) return '';
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
}

export interface FileTreeApi {
  readonly dirPath: string;
  readonly files: FileEntry[];
  activeTreePath: string;
  loadTree: (ref: string, nextDir?: string) => Promise<void>;
  navigateUp: (ref: string) => Promise<void>;
}

export function useFileTree(): FileTreeApi {
  let dirPath = $state('');
  let files = $state<FileEntry[]>([]);
  let activeTreePath = $state('');

  async function loadTree(ref: string, nextDir = '') {
    const normalized = normalizeDirPath(nextDir);
    dirPath = normalized;
    files = [];
    const list = await Api.listFiles(normalized, ref);
    files = list;
  }

  async function navigateUp(ref: string) {
    await loadTree(ref, parentDir(dirPath));
  }

  return {
    get dirPath() {
      return dirPath;
    },
    get files() {
      return files;
    },
    get activeTreePath() {
      return activeTreePath;
    },
    set activeTreePath(next: string) {
      activeTreePath = next;
    },
    loadTree,
    navigateUp,
  };
}
