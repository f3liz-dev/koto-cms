import { Api, type PrReadyResult, type SaveFileResult } from '../api';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx']);
const VUE_EXTENSIONS = new Set(['vue']);

function getFileExtension(path: string | null | undefined): string {
  const normalized = (path ?? '').toLowerCase().trim();
  if (!normalized) return '';
  const lastSegment = normalized.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return '';
  return lastSegment.slice(dotIndex + 1);
}

export type PrState = 'none' | 'draft' | 'open';

export interface PrInfo {
  url: string;
  number: number | null;
  state: PrState;
}

export interface FileEditorApi {
  readonly filePath: string;
  readonly fileSha: string | null;
  setFileSha: (next: string | null) => void;
  readonly originalContent: string;
  readonly draftContent: string;
  setDraftContent: (next: string) => void;
  readonly statusText: string;
  setStatusText: (next: string) => void;
  readonly prInfo: PrInfo;
  setPrInfo: (next: PrInfo) => void;
  readonly fileOpen: boolean;
  readonly isMarkdown: boolean;
  readonly isVue: boolean;
  readonly isPreviewable: boolean;
  readonly isDirty: boolean;
  readonly editorKey: string;
  openFile: (path: string, branch: string) => Promise<unknown>;
  createNewFile: (path: string) => void;
  saveFile: (branch: string | null) => Promise<SaveFileResult | undefined>;
  deleteFile: (branch: string) => Promise<void>;
  markPrReady: (title: string, body?: string) => Promise<PrReadyResult | undefined>;
  closeFile: () => void;
}

export function useFileEditor(): FileEditorApi {
  let filePath = $state('');
  let fileSha = $state<string | null>(null);
  let originalContent = $state('');
  let draftContent = $state('');
  let statusText = $state('');
  let prInfo = $state<PrInfo>({ url: '', number: null, state: 'none' });

  const fileOpen = $derived(Boolean(filePath));
  const extension = $derived(getFileExtension(filePath));
  const isMarkdown = $derived(MARKDOWN_EXTENSIONS.has(extension));
  const isVue = $derived(VUE_EXTENSIONS.has(extension));
  const isPreviewable = $derived(isMarkdown || isVue);
  const isDirty = $derived(fileOpen && draftContent !== originalContent);
  const editorKey = $derived(filePath ? `${filePath}|${fileSha ?? 'new'}` : 'none');

  async function openFile(path: string, branch: string) {
    statusText = 'Loading…';
    const file = await Api.getFile(path, branch);
    filePath = file.path;
    fileSha = file.sha;
    originalContent = file.content;
    draftContent = file.content;
    statusText = '';
    return file;
  }

  function createNewFile(path: string) {
    filePath = path;
    fileSha = null;
    originalContent = '';
    draftContent = '';
    statusText = '';
  }

  async function saveFile(branch: string | null): Promise<SaveFileResult | undefined> {
    if (!filePath) return undefined;
    statusText = 'Saving…';
    const result = await Api.saveFile(filePath, draftContent, fileSha, branch);
    fileSha = null;
    originalContent = draftContent;
    statusText = 'Saved ✓';
    if (result.prUrl) {
      prInfo = {
        url: result.prUrl,
        number: typeof result.prNumber === 'number' ? result.prNumber : null,
        state: 'draft',
      };
    }
    setTimeout(() => {
      statusText = '';
    }, 2500);
    return result;
  }

  async function deleteFile(branch: string) {
    if (!filePath || !fileSha || !branch) return;
    await Api.deleteFile(filePath, fileSha, branch);
    filePath = '';
    fileSha = null;
    originalContent = '';
    draftContent = '';
    statusText = '';
  }

  async function markPrReady(title: string, body = ''): Promise<PrReadyResult | undefined> {
    if (!prInfo.number) return undefined;
    const result = await Api.markPrReady(prInfo.number, title, body);
    prInfo = { url: result.prUrl, number: prInfo.number, state: 'open' };
    return result;
  }

  function closeFile() {
    filePath = '';
    fileSha = null;
    originalContent = '';
    draftContent = '';
    statusText = '';
  }

  return {
    get filePath() {
      return filePath;
    },
    get fileSha() {
      return fileSha;
    },
    setFileSha(next: string | null) {
      fileSha = next;
    },
    get originalContent() {
      return originalContent;
    },
    get draftContent() {
      return draftContent;
    },
    setDraftContent(next: string) {
      draftContent = next;
    },
    get statusText() {
      return statusText;
    },
    setStatusText(next: string) {
      statusText = next;
    },
    get prInfo() {
      return prInfo;
    },
    setPrInfo(next: PrInfo) {
      prInfo = next;
    },
    get fileOpen() {
      return fileOpen;
    },
    get isMarkdown() {
      return isMarkdown;
    },
    get isVue() {
      return isVue;
    },
    get isPreviewable() {
      return isPreviewable;
    },
    get isDirty() {
      return isDirty;
    },
    get editorKey() {
      return editorKey;
    },
    openFile,
    createNewFile,
    saveFile,
    deleteFile,
    markPrReady,
    closeFile,
  };
}
