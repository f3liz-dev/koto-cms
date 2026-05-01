import type {
  Author,
  GithubFileEntry,
  GithubFileResponse,
  KotoConfig,
  PrInfo,
  TenantConfig,
} from './types';
import { globMatch } from './glob';

const BASE = 'https://api.github.com';

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class GitHub {
  constructor(private tenant: TenantConfig) {}

  private async request<T = unknown>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.tenant.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'koto-cms/1.0',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new GitHubError(`GitHub ${res.status}: ${text}`, res.status);
    }
    return data as T;
  }

  private get repo() {
    return this.tenant.repo;
  }

  private get baseBranch() {
    return this.tenant.defaultBranch;
  }

  async listFiles(path = '', ref?: string): Promise<GithubFileEntry[]> {
    const branch = ref || this.baseBranch;
    const url = `${BASE}/repos/${this.repo}/contents/${path}?ref=${branch}`;
    const data = await this.request<unknown>('GET', url);
    if (!Array.isArray(data)) return [];
    const files: GithubFileEntry[] = data.map((f) => {
      const entry = f as Record<string, unknown>;
      return {
        path: String(entry.path ?? ''),
        name: String(entry.name ?? ''),
        type: entry.type === 'dir' ? 'dir' : 'file',
        sha: String(entry.sha ?? ''),
      };
    });
    files.sort((a, b) => {
      const aDir = a.type === 'dir' ? 0 : 1;
      const bDir = b.type === 'dir' ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name);
    });
    return files;
  }

  async getFile(path: string, ref?: string): Promise<GithubFileResponse> {
    const branch = ref || this.baseBranch;
    const url = `${BASE}/repos/${this.repo}/contents/${path}?ref=${branch}`;
    const data = await this.request<Record<string, unknown>>('GET', url);
    const encoded = String(data.content ?? '').replace(/\n/g, '');
    const decoded = decodeBase64(encoded);
    return {
      path: String(data.path ?? path),
      content: decoded,
      sha: String(data.sha ?? ''),
    };
  }

  async getConfig(ref?: string): Promise<KotoConfig> {
    try {
      const file = await this.getFile('.koto.json', ref);
      try {
        return JSON.parse(file.content) as KotoConfig;
      } catch {
        return {};
      }
    } catch {
      return {};
    }
  }

  async listTree(ref?: string): Promise<GithubFileEntry[]> {
    const branch = ref || this.baseBranch;
    const sha = await this.getLatestSha(this.repo, branch);
    const url = `${BASE}/repos/${this.repo}/git/trees/${sha}?recursive=1`;
    const data = await this.request<{ tree?: Array<Record<string, unknown>> }>('GET', url);
    const out: GithubFileEntry[] = [];
    for (const entry of data.tree ?? []) {
      if (entry.type !== 'blob') continue;
      const path = String(entry.path ?? '');
      const name = path.split('/').pop() ?? '';
      out.push({ path, name, type: 'file', sha: String(entry.sha ?? '') });
    }
    return out;
  }

  async listFilteredTree(config: KotoConfig, ref?: string): Promise<GithubFileEntry[]> {
    const files = await this.listTree(ref);
    const include = config.include?.length ? config.include : ['**'];
    const exclude = config.exclude ?? [];
    return files.filter((f) => {
      const included = include.some((p) => globMatch(f.path, p));
      const excluded = exclude.some((p) => globMatch(f.path, p));
      return included && !excluded;
    });
  }

  async findOrCreateDraftBranch(fediHandle: string): Promise<string> {
    const prs = await this.listUserPrs(fediHandle);
    const draft = prs.find((p) => p.prState === 'draft');
    if (draft) return draft.branchName;
    return await this.createWorkingBranch(fediHandle);
  }

  async createWorkingBranch(fediHandle: string): Promise<string> {
    const branchName = newBranchName(fediHandle);
    const baseSha = await this.getLatestSha(this.repo, this.baseBranch);
    const url = `${BASE}/repos/${this.repo}/git/refs`;
    await this.request('POST', url, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    return branchName;
  }

  async commitFile(
    path: string,
    content: string,
    sha: string | null,
    message: string,
    branch: string,
  ): Promise<unknown> {
    const url = `${BASE}/repos/${this.repo}/contents/${path}`;
    const body: Record<string, unknown> = {
      message,
      content: encodeBase64(content),
      branch,
    };
    if (sha) body.sha = sha;
    return await this.request('PUT', url, body);
  }

  /** Commit an already-base64-encoded blob (e.g. an uploaded image). */
  async commitBlob(
    path: string,
    contentBase64: string,
    sha: string | null,
    message: string,
    branch: string,
  ): Promise<Record<string, unknown>> {
    const url = `${BASE}/repos/${this.repo}/contents/${path}`;
    const body: Record<string, unknown> = { message, content: contentBase64, branch };
    if (sha) body.sha = sha;
    return await this.request<Record<string, unknown>>('PUT', url, body);
  }

  async deleteFile(
    path: string,
    sha: string,
    message: string,
    branch: string,
  ): Promise<unknown> {
    const url = `${BASE}/repos/${this.repo}/contents/${path}`;
    return await this.request('DELETE', url, { message, sha, branch });
  }

  async listUserPrs(fediHandle: string): Promise<PrInfo[]> {
    const base = this.baseBranch;
    const slug = handleSlug(fediHandle);
    const prefix = `cms/${slug}/`;

    const prsUrl = `${BASE}/repos/${this.repo}/pulls?state=open&base=${base}&per_page=50`;
    const prs = await this.request<Array<Record<string, unknown>>>('GET', prsUrl);
    const branches = await this.getBranches(prefix);

    const prByBranch = new Map<string, Record<string, unknown>>();
    for (const pr of prs) {
      const head = (pr.head as Record<string, unknown> | undefined)?.ref;
      if (typeof head === 'string') prByBranch.set(head, pr);
    }

    const results: PrInfo[] = branches.map((branch) => {
      const pr = prByBranch.get(branch);
      let state: PrInfo['prState'] = 'none';
      if (pr) state = pr.draft ? 'draft' : 'open';
      return {
        branchName: branch,
        prNumber: (pr?.number as number | undefined) ?? null,
        prUrl: (pr?.html_url as string | undefined) ?? null,
        prState: state,
      };
    });
    results.sort((a, b) => b.branchName.localeCompare(a.branchName));
    return results;
  }

  async ensureDraftPr(
    branch: string,
    fediHandle: string,
  ): Promise<{ prUrl: string; prNumber: number }> {
    const existing = await this.findPrForBranch(branch);
    if (existing) {
      return {
        prUrl: String(existing.html_url),
        prNumber: Number(existing.number),
      };
    }
    return await this.createDraftPr(branch, fediHandle);
  }

  async markPrReady(
    prNumber: number,
    title: string,
    body: string,
  ): Promise<{ prUrl: string; prNumber: number }> {
    const url = `${BASE}/repos/${this.repo}/pulls/${prNumber}`;
    const data = await this.request<Record<string, unknown>>('PATCH', url, {
      title,
      body,
      draft: false,
    });
    return {
      prUrl: String(data.html_url),
      prNumber: Number(data.number),
    };
  }

  async getPreviewUrl(prNumber: number, config: KotoConfig): Promise<string | null> {
    const trustedUsers = config.preview?.trustedUsers ?? [];
    const urlPatterns = config.preview?.urlPatterns ?? [];
    if (!trustedUsers.length || !urlPatterns.length) return null;

    const url = `${BASE}/repos/${this.repo}/issues/${prNumber}/comments?per_page=100`;
    const comments = await this.request<Array<Record<string, unknown>>>('GET', url);
    for (const comment of comments) {
      const user = comment.user as Record<string, unknown> | undefined;
      const login = user?.login as string | undefined;
      if (!login || !trustedUsers.includes(login)) continue;
      const body = (comment.body as string | undefined) ?? '';
      for (const u of extractUrls(body)) {
        if (urlPatterns.some((p) => globMatch(u, p))) return u;
      }
    }
    return null;
  }

  commitMessage(action: 'create' | 'update' | 'delete', path: string, author: Author): string {
    const subject = `${capitalize(action)} ${path}`;
    return [
      subject,
      '',
      'Edited via Koto CMS.',
      '',
      `Co-authored-by: ${author.name} <${author.email}>`,
      `Fediverse-handle: ${author.handle}`,
      '',
    ].join('\n');
  }

  // ── private ───────────────────────────────────────────────────

  private async getLatestSha(repo: string, branch: string): Promise<string> {
    const url = `${BASE}/repos/${repo}/git/refs/heads/${branch}`;
    const data = await this.request<{ object?: { sha?: string } }>('GET', url);
    return String(data.object?.sha ?? '');
  }

  private async findPrForBranch(branch: string): Promise<Record<string, unknown> | null> {
    const base = this.baseBranch;
    const [owner] = this.repo.split('/');
    const url = `${BASE}/repos/${this.repo}/pulls?state=open&head=${owner}:${branch}&base=${base}`;
    const prs = await this.request<Array<Record<string, unknown>>>('GET', url);
    return prs.length ? prs[0] : null;
  }

  private async createDraftPr(
    branch: string,
    fediHandle: string,
  ): Promise<{ prUrl: string; prNumber: number }> {
    const base = this.baseBranch;
    const date = new Date().toISOString().slice(0, 10);
    const url = `${BASE}/repos/${this.repo}/pulls`;
    const body = [
      'Content edits drafted via Koto CMS.',
      '',
      `Author: ${fediHandle}`,
      `Created: ${date}`,
    ].join('\n');
    const data = await this.request<Record<string, unknown>>('POST', url, {
      title: `Content edits by ${fediHandle}`,
      body,
      head: branch,
      base,
      draft: true,
    });
    const prNumber = Number(data.number);
    // Fire-and-forget label; ignore failure.
    try {
      await this.request('POST', `${BASE}/repos/${this.repo}/issues/${prNumber}/labels`, {
        labels: ['cms'],
      });
    } catch {
      // tolerate missing label permissions
    }
    return {
      prUrl: String(data.html_url),
      prNumber,
    };
  }

  private async getBranches(prefix: string): Promise<string[]> {
    const url = `${BASE}/repos/${this.repo}/git/matching-refs/heads/${prefix}`;
    const refs = await this.request<Array<Record<string, unknown>>>('GET', url);
    return refs.map((r) => String(r.ref ?? '').replace('refs/heads/', ''));
  }
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function handleSlug(handle: string): string {
  return handle.replace(/^@/, '').replace(/@/g, '-').replace(/\./g, '-');
}

function newBranchName(fediHandle: string): string {
  const slug = handleSlug(fediHandle);
  const date = new Date().toISOString().slice(0, 10);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `cms/${slug}/${date}-${rand}`;
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"'\)\]]+/g;
  return Array.from(text.matchAll(re)).map((m) => m[0]);
}

function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64(input: string): string {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
