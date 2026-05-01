export interface User {
  handle: string;
  avatar?: string | null;
  [key: string]: unknown;
}

export interface RepoInfo {
  repo: string;
}

export interface TenantSummary {
  slug: string;
  repo: string;
}

export interface CmsI18nConfig {
  mode: 'none' | 'directory' | 'suffix';
  locales: string[];
  directoryPrefix?: string;
  suffixSeparator?: string;
}

export type FrontmatterFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'string[]';

export interface FrontmatterFieldSchema {
  name: string;
  label?: string;
  type: FrontmatterFieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: string[];
}

export interface CmsConfig {
  include?: string[];
  exclude?: string[];
  i18n?: CmsI18nConfig;
  frontmatter?: {
    fields?: FrontmatterFieldSchema[];
  };
}

export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  sha: string;
}

export interface FileResponse {
  path: string;
  content: string;
  sha: string | null;
}

export interface SaveFileResult {
  sha?: string | null;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  [key: string]: unknown;
}

export interface Branch {
  name: string;
  [key: string]: unknown;
}

export type PrState = 'draft' | 'open' | 'none';

export interface BranchInfo {
  branchName: string;
  prNumber: number | null;
  prUrl: string | null;
  prState: PrState;
}

export interface BootstrapUser {
  fedi_handle: string;
  author_name: string;
  author_email: string;
  custom_email?: string | null;
}

export interface DraftEntry {
  path: string;
  content: string;
  sha: string | null;
  savedAt: number;
}

export interface PublishResult {
  branchName: string;
  prUrl: string;
  prNumber: number;
  files: string[];
}

export type BootstrapResponse =
  | { kind: 'unauthenticated' }
  | { kind: 'tenant-select'; user: BootstrapUser; tenants: TenantSummary[] }
  | {
      kind: 'ready';
      user: BootstrapUser;
      repo: string;
      defaultBranch: string;
      config: CmsConfig;
      tree: FileEntry[];
      branches: BranchInfo[];
      drafts: DraftEntry[];
    };

export interface NewBranchResult {
  branchName: string;
}

export interface PrReadyResult {
  prUrl: string;
  [key: string]: unknown;
}

export interface PrPreview {
  previewUrl: string | null;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isConflictError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 409 || err.status === 422);
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const Api = {
  async loginInit(handle: string): Promise<{ url: string; [k: string]: unknown }> {
    const url = `/auth/login?handle=${encodeURIComponent(handle)}`;
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  },
  logout(): Promise<unknown> {
    return request('POST', '/auth/logout');
  },
  me(): Promise<User> {
    return request<User>('GET', '/api/me');
  },
  async bootstrap(): Promise<BootstrapResponse> {
    try {
      const res = await fetch('/api/bootstrap', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) return { kind: 'unauthenticated' };
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        throw new ApiError(message, res.status);
      }
      return (await res.json()) as BootstrapResponse;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err instanceof Error ? err.message : String(err), 0);
    }
  },
  repo(): Promise<RepoInfo> {
    return request<RepoInfo>('GET', '/api/repo');
  },
  listTenants(): Promise<TenantSummary[]> {
    return request<TenantSummary[]>('GET', '/api/tenants');
  },
  selectTenant(slug: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('POST', '/api/tenant/select', { slug });
  },
  updateMe(patch: Partial<User>): Promise<User> {
    return request<User>('PATCH', '/api/me', patch);
  },
  getConfig(ref?: string): Promise<CmsConfig> {
    const q = new URLSearchParams();
    if (ref) q.set('ref', ref);
    return request<CmsConfig>('GET', `/api/config?${q}`);
  },
  getTree(ref?: string): Promise<FileEntry[]> {
    const q = new URLSearchParams();
    if (ref) q.set('ref', ref);
    return request<FileEntry[]>('GET', `/api/tree?${q}`);
  },
  listFiles(path = '', ref?: string): Promise<FileEntry[]> {
    const q = new URLSearchParams();
    if (path) q.set('path', path);
    if (ref) q.set('ref', ref);
    return request<FileEntry[]>('GET', `/api/files?${q}`);
  },
  getFile(path: string, ref?: string): Promise<FileResponse> {
    const q = new URLSearchParams({ path });
    if (ref) q.set('ref', ref);
    return request<FileResponse>('GET', `/api/file?${q}`);
  },
  saveFile(
    path: string,
    content: string,
    sha: string | null,
    branchName: string | null,
  ): Promise<SaveFileResult> {
    return request<SaveFileResult>('PUT', '/api/file', {
      path,
      content,
      sha,
      branchName: branchName ?? '',
    });
  },
  deleteFile(path: string, sha: string, branch: string): Promise<unknown> {
    const q = new URLSearchParams({ path, sha, branch });
    return request('DELETE', `/api/file?${q}`);
  },
  uploadAsset(input: {
    dir: string;
    filename: string;
    contentType: string;
    contentBase64: string;
    branch: string;
  }): Promise<{ path: string }> {
    return request<{ path: string }>('POST', '/api/asset', input);
  },
  listPrs(): Promise<unknown[]> {
    return request<unknown[]>('GET', '/api/prs');
  },
  newBranch(): Promise<NewBranchResult> {
    return request<NewBranchResult>('POST', '/api/pr-new');
  },
  markPrReady(prNumber: number, title: string, body: string): Promise<PrReadyResult> {
    return request<PrReadyResult>('POST', '/api/pr-ready', { prNumber, title, body });
  },
  getPrPreview(prNumber: number): Promise<PrPreview> {
    return request<PrPreview>('GET', `/api/pr-preview?prNumber=${prNumber}`);
  },
  saveDraft(input: {
    path: string;
    content: string;
    sha: string | null;
  }): Promise<{ ok: true; savedAt: number }> {
    return request<{ ok: true; savedAt: number }>('PUT', '/api/draft', input);
  },
  listDrafts(): Promise<DraftEntry[]> {
    return request<DraftEntry[]>('GET', '/api/drafts');
  },
  deleteDraft(path: string): Promise<{ ok: true }> {
    const q = new URLSearchParams({ path });
    return request<{ ok: true }>('DELETE', `/api/draft?${q}`);
  },
  publish(): Promise<PublishResult> {
    return request<PublishResult>('POST', '/api/publish');
  },
};
