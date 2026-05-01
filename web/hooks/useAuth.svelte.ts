import {
  Api,
  ApiError,
  type BootstrapUser,
  type BranchInfo,
  type CmsConfig,
  type DraftEntry,
  type FileEntry,
  type TenantSummary,
} from '../api';

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'tenant-select'; user: BootstrapUser; tenants: TenantSummary[] }
  | {
      kind: 'authenticated';
      user: BootstrapUser;
      repo: string;
      defaultBranch: string;
      config: CmsConfig;
      tree: FileEntry[];
      branches: BranchInfo[];
      drafts: DraftEntry[];
    };

export interface AuthApi {
  readonly state: AuthState;
  readonly user: BootstrapUser | null;
  readonly repo: string;
  readonly loading: boolean;
  readonly isAuthenticated: boolean;
  selectTenant(slug: string): Promise<void>;
  logout(): Promise<void>;
}

async function legacyBootstrap(): Promise<AuthState> {
  // Fallback path if /api/bootstrap fails — keep the old me/repo flow alive so a
  // transient bootstrap error doesn't lock the user out of editing.
  let user: BootstrapUser;
  try {
    user = (await Api.me()) as unknown as BootstrapUser;
  } catch {
    return { kind: 'unauthenticated' };
  }
  try {
    const info = await Api.repo();
    return {
      kind: 'authenticated',
      user,
      repo: info.repo,
      defaultBranch: 'main',
      config: {},
      tree: [],
      branches: [],
      drafts: [],
    };
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 401)) {
      return { kind: 'unauthenticated' };
    }
  }
  let tenants: TenantSummary[];
  try {
    tenants = await Api.listTenants();
  } catch {
    return { kind: 'unauthenticated' };
  }
  if (tenants.length === 1) {
    try {
      await Api.selectTenant(tenants[0].slug);
      const info = await Api.repo();
      return {
        kind: 'authenticated',
        user,
        repo: info.repo,
        defaultBranch: 'main',
        config: {},
        tree: [],
        branches: [],
        drafts: [],
      };
    } catch {
      return { kind: 'tenant-select', user, tenants };
    }
  }
  return { kind: 'tenant-select', user, tenants };
}

export function useAuth(): AuthApi {
  let state = $state<AuthState>({ kind: 'loading' });

  async function bootstrap() {
    try {
      const resp = await Api.bootstrap();
      if (resp.kind === 'unauthenticated') {
        state = { kind: 'unauthenticated' };
        return;
      }
      if (resp.kind === 'tenant-select') {
        state = { kind: 'tenant-select', user: resp.user, tenants: resp.tenants };
        return;
      }
      state = {
        kind: 'authenticated',
        user: resp.user,
        repo: resp.repo,
        defaultBranch: resp.defaultBranch,
        config: resp.config,
        tree: resp.tree,
        branches: resp.branches,
        drafts: resp.drafts,
      };
    } catch {
      state = await legacyBootstrap();
    }
  }

  bootstrap().catch(() => {
    state = { kind: 'unauthenticated' };
  });

  async function selectTenant(slug: string) {
    if (state.kind !== 'tenant-select') return;
    await Api.selectTenant(slug);
    await bootstrap();
  }

  async function logout() {
    try {
      await Api.logout();
    } catch {
      // ignore
    }
    state = { kind: 'unauthenticated' };
  }

  return {
    get state() {
      return state;
    },
    get user() {
      return state.kind === 'authenticated' || state.kind === 'tenant-select'
        ? state.user
        : null;
    },
    get repo() {
      return state.kind === 'authenticated' ? state.repo : 'unknown/unknown';
    },
    get loading() {
      return state.kind === 'loading';
    },
    get isAuthenticated() {
      return state.kind === 'authenticated';
    },
    selectTenant,
    logout,
  };
}
