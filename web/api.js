async function request(method, path, body) {
  const init = {
    method,
    credentials: "include",
    headers: {},
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const Api = {
  async loginInit(handle) {
    const url = `/auth/login?handle=${encodeURIComponent(handle)}`;
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  },
  logout() {
    return request("POST", "/auth/logout");
  },
  me() {
    return request("GET", "/api/me");
  },
  repo() {
    return request("GET", "/api/repo");
  },
  updateMe(patch) {
    return request("PATCH", "/api/me", patch);
  },
  getConfig(ref) {
    const q = new URLSearchParams();
    if (ref) q.set("ref", ref);
    return request("GET", `/api/config?${q}`);
  },
  getTree(ref) {
    const q = new URLSearchParams();
    if (ref) q.set("ref", ref);
    return request("GET", `/api/tree?${q}`);
  },
  listFiles(path = "", ref) {
    const q = new URLSearchParams();
    if (path) q.set("path", path);
    if (ref) q.set("ref", ref);
    return request("GET", `/api/files?${q}`);
  },
  getFile(path, ref) {
    const q = new URLSearchParams({ path });
    if (ref) q.set("ref", ref);
    return request("GET", `/api/file?${q}`);
  },
  saveFile(path, content, sha, branchName) {
    return request("PUT", "/api/file", { path, content, sha, branchName });
  },
  deleteFile(path, sha, branch) {
    const q = new URLSearchParams({ path, sha, branch });
    return request("DELETE", `/api/file?${q}`);
  },
  listPrs() {
    return request("GET", "/api/prs");
  },
  newBranch() {
    return request("POST", "/api/pr-new");
  },
  markPrReady(prNumber, title, body) {
    return request("POST", "/api/pr-ready", { prNumber, title, body });
  },
  getPrPreview(prNumber) {
    return request("GET", `/api/pr-preview?prNumber=${prNumber}`);
  },
};
