import { Api, type BranchInfo, type NewBranchResult } from '../api';

export interface BranchesApi {
  readonly branches: BranchInfo[];
  selectedBranch: string;
  setBranches: (next: BranchInfo[]) => void;
  loadBranches: () => Promise<void>;
  createBranch: () => Promise<NewBranchResult>;
}

export function useBranches(): BranchesApi {
  let branches = $state<BranchInfo[]>([]);
  let selectedBranch = $state('');

  async function loadBranches() {
    const prs = (await Api.listPrs()) as BranchInfo[];
    branches = prs;
  }

  async function createBranch(): Promise<NewBranchResult> {
    const result = await Api.newBranch();
    await loadBranches();
    return result;
  }

  return {
    get branches() {
      return branches;
    },
    get selectedBranch() {
      return selectedBranch;
    },
    set selectedBranch(next: string) {
      selectedBranch = next;
    },
    setBranches(next: BranchInfo[]) {
      branches = next;
    },
    loadBranches,
    createBranch,
  };
}
