/**
 * github.ts
 *
 * GitHub REST API — server-side only. Token never reaches the browser.
 *
 * Write workflow:
 *   1. createWorkingBranch()  — new cms/{handle}/{date}-{rand} branch
 *   2. commitFile()           — commit to that branch
 *   3. ensureDraftPr()        — open draft PR if none exists yet
 *   4. markPrReady()          — convert draft → ready for review
 */

export interface FileEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  sha: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}

export interface BranchStatus {
  branchName: string;
  prNumber: number | null;
  prUrl: string | null;
  prState: "draft" | "open" | "none";
}

export interface PrResult {
  prUrl: string;
  prNumber: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────

function cfg() {
  const token  = Deno.env.get("GITHUB_BOT_TOKEN");
  const repo   = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";
  if (!token) throw new Error("GITHUB_BOT_TOKEN is not set");
  if (!repo)  throw new Error("GITHUB_REPO is not set (owner/repo)");
  return { token, repo, branch };
}

function hdrs(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "f3liz-cms/1.0",
  };
}

async function gh(path: string, init?: RequestInit): Promise<Response> {
  const { token } = cfg();
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...hdrs(token), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status} ${init?.method ?? "GET"} ${path}: ${body}`);
  }
  return res;
}

// ── Branch helpers ─────────────────────────────────────────────────────────────

export function handleSlug(fediHandle: string): string {
  return fediHandle.replace(/^@/, "").replace(/@/g, "-").replace(/\./g, "-");
}

export function newBranchName(fediHandle: string): string {
  const slug = handleSlug(fediHandle);
  const date = new Date().toISOString().slice(0, 10);
  const rand = crypto.randomUUID().slice(0, 6);
  return `cms/${slug}/${date}-${rand}`;
}

async function getLatestSha(repo: string, branch: string): Promise<string> {
  const data = (await (await gh(`/repos/${repo}/git/refs/heads/${branch}`)).json()) as {
    object: { sha: string };
  };
  return data.object.sha;
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function listFiles(dirPath = "", ref?: string): Promise<FileEntry[]> {
  const { repo, branch } = cfg();
  const useRef = ref ?? branch;
  const p = dirPath
    ? `/repos/${repo}/contents/${dirPath}?ref=${useRef}`
    : `/repos/${repo}/contents?ref=${useRef}`;
  const data = (await (await gh(p)).json()) as Array<{
    name: string; path: string; type: string; sha: string;
  }>;
  return data
    .map((f) => ({ path: f.path, name: f.name, type: (f.type === "dir" ? "dir" : "file") as "file" | "dir", sha: f.sha }))
    .sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));
}

export async function getFile(filePath: string, ref?: string): Promise<FileContent> {
  const { repo, branch } = cfg();
  const data = (await (await gh(`/repos/${repo}/contents/${filePath}?ref=${ref ?? branch}`)).json()) as {
    path: string; content: string; sha: string;
  };
  const decoded = new TextDecoder().decode(
    Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
  );
  return { path: data.path, content: decoded, sha: data.sha };
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function createWorkingBranch(fediHandle: string): Promise<string> {
  const { repo, branch: base } = cfg();
  const name = newBranchName(fediHandle);
  const sha  = await getLatestSha(repo, base);
  await gh(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
  });
  return name;
}

export async function commitFile(
  filePath: string,
  content: string,
  sha: string | undefined,
  message: string,
  branchName: string,
): Promise<void> {
  const { repo } = cfg();
  const encoded  = btoa(unescape(encodeURIComponent(content)));
  const body: Record<string, unknown> = { message, content: encoded, branch: branchName };
  if (sha) body.sha = sha;
  await gh(`/repos/${repo}/contents/${filePath}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteFileOnBranch(
  filePath: string,
  sha: string,
  message: string,
  branchName: string,
): Promise<void> {
  const { repo } = cfg();
  await gh(`/repos/${repo}/contents/${filePath}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch: branchName }),
  });
}

// ── PR management ──────────────────────────────────────────────────────────────

export async function findPrForBranch(
  branchName: string,
): Promise<{ number: number; html_url: string; draft: boolean } | null> {
  const { repo, branch: base } = cfg();
  const owner = repo.split("/")[0];
  const data  = (await (await gh(
    `/repos/${repo}/pulls?state=open&head=${owner}:${branchName}&base=${base}`,
  )).json()) as Array<{ number: number; html_url: string; draft: boolean }>;
  return data[0] ?? null;
}

export async function listUserPrs(fediHandle: string): Promise<BranchStatus[]> {
  const { repo, branch: base } = cfg();
  const slug   = handleSlug(fediHandle);
  const prefix = `cms/${slug}/`;

  const prs = (await (await gh(
    `/repos/${repo}/pulls?state=open&base=${base}&per_page=50`,
  )).json()) as Array<{ number: number; html_url: string; draft: boolean; head: { ref: string } }>;

  const prMap = new Map(
    prs.filter((p) => p.head.ref.startsWith(prefix)).map((p) => [p.head.ref, p]),
  );

  const branches = (await (await gh(
    `/repos/${repo}/git/matching-refs/heads/${prefix}`,
  )).json()) as Array<{ ref: string }>;

  return branches
    .map(({ ref }) => {
      const branchName = ref.replace("refs/heads/", "");
      const pr         = prMap.get(branchName);
      return {
        branchName,
        prNumber: pr?.number ?? null,
        prUrl:    pr?.html_url ?? null,
        prState:  pr ? (pr.draft ? "draft" : "open") : "none",
      } as BranchStatus;
    })
    .sort((a, b) => b.branchName.localeCompare(a.branchName));
}

export async function ensureDraftPr(
  branchName: string,
  fediHandle: string,
): Promise<PrResult> {
  const { repo, branch: base } = cfg();
  const existing = await findPrForBranch(branchName);
  if (existing) return { prUrl: existing.html_url, prNumber: existing.number };

  const date  = new Date().toISOString().slice(0, 10);
  const data  = (await (await gh(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `[Draft] CMS edit by \`${fediHandle}\` on ${date}`,
      body:  `Draft PR created by f3liz CMS.\n\nAuthor: \`${fediHandle}\`\nDate: ${date}`,
      head:  branchName,
      base,
      draft: true,
    }),
  })).json()) as { number: number; html_url: string };

  // Add cms label if it exists (ignore if not)
  await gh(`/repos/${repo}/issues/${data.number}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: ["cms"] }),
  }).catch(() => {});

  return { prUrl: data.html_url, prNumber: data.number };
}

export async function markPrReady(
  prNumber: number,
  title: string,
  body: string,
): Promise<PrResult> {
  const { repo } = cfg();
  const data = (await (await gh(`/repos/${repo}/pulls/${prNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ title, body, draft: false }),
  })).json()) as { number: number; html_url: string };
  return { prUrl: data.html_url, prNumber: data.number };
}

// ── Commit message ─────────────────────────────────────────────────────────────

export function commitMessage(
  action: "create" | "update" | "delete",
  path: string,
  author: { name: string; email: string; handle: string },
): string {
  return `content: ${action} ${path}\n\nCo-authored-by: ${author.name} <${author.email}>\nFediverse: \`${author.handle}\``;
}
