import { useState, useCallback } from "preact/hooks";
import { Api } from "../api.js";

export function useBranches() {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");

  const loadBranches = useCallback(async () => {
    const prs = await Api.listPrs();
    setBranches(prs);
  }, []);

  const createBranch = useCallback(async () => {
    const result = await Api.newBranch();
    await loadBranches();
    return result;
  }, [loadBranches]);

  return {
    branches,
    selectedBranch,
    setSelectedBranch,
    loadBranches,
    createBranch,
  };
}
