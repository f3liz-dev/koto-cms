import { useState, useEffect } from "preact/hooks";
import { Api } from "../api.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [repo, setRepo] = useState("unknown/unknown");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await Api.me();
        setUser(me);
        const repoInfo = await Api.repo();
        setRepo(repoInfo.repo);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = async () => {
    await Api.logout().catch(() => {});
    setUser(null);
  };

  return { user, repo, loading, isAuthenticated: !!user, logout };
}
