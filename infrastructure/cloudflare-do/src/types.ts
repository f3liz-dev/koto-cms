export interface TenantConfig {
  /** GitHub repo slug "owner/repo". */
  repo: string;
  /** Bot token used for all GitHub API calls. */
  githubToken: string;
  /** Comma-separated fediverse handles permitted to log in. */
  documentEditors: string;
  /** Default base branch. */
  defaultBranch: string;
}

export interface WorkerEnv {
  KOTO_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** JSON map keyed by "owner/repo". */
  TENANTS: string;
  /** HS256 signing key for the gateway session JWT. */
  GATEWAY_SECRET: string;
  /** Optional override for gateway session lifetime. Default 24. */
  GATEWAY_TTL_HOURS?: string;
  DEFAULT_BRANCH?: string;
  APP_NAME?: string;
}

export interface GatewayClaims {
  fedi_handle: string;
  author_name: string;
  author_email: string;
  custom_email?: string;
  created_at: number;
  exp: number;
}

export interface Author {
  name: string;
  email: string;
  handle: string;
}

export interface GithubFileEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  sha: string;
}

export interface GithubFileResponse {
  path: string;
  content: string;
  sha: string;
}

export interface PrInfo {
  branchName: string;
  prNumber: number | null;
  prUrl: string | null;
  prState: 'draft' | 'open' | 'none';
}

export interface KotoConfig {
  include?: string[];
  exclude?: string[];
  preview?: {
    trustedUsers?: string[];
    urlPatterns?: string[];
  };
  i18n?: {
    mode: 'none' | 'directory' | 'suffix';
    locales: string[];
    directoryPrefix?: string;
    suffixSeparator?: string;
  };
}
