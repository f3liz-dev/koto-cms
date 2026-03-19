// Secrets cache - fetch once at cold start, reuse across invocations
import { getSecret } from "./vault.ts";

export interface Secrets {
  githubBotToken: string;
  sessionSecret: string;
  githubAccessToken: string;
}

let cache: Secrets | null = null;

/**
 * Initialize secrets from OCI Vault
 * Fetches all secrets in parallel and caches them for the lifetime of the container
 * @returns Object containing all secret values
 */
export async function initSecrets(): Promise<Secrets> {
  if (cache) return cache;

  const githubBotTokenOcid = Deno.env.get("GITHUB_BOT_TOKEN_SECRET_OCID");
  const sessionSecretOcid = Deno.env.get("SESSION_SECRET_OCID");
  const githubAccessTokenOcid = Deno.env.get("GITHUB_ACCESS_TOKEN_SECRET_OCID");

  if (!githubBotTokenOcid || !sessionSecretOcid || !githubAccessTokenOcid) {
    throw new Error(
      "Missing secret OCIDs in environment. Ensure vault.tf is deployed correctly."
    );
  }

  const [githubBotToken, sessionSecret, githubAccessToken] = await Promise.all([
    getSecret(githubBotTokenOcid),
    getSecret(sessionSecretOcid),
    getSecret(githubAccessTokenOcid),
  ]);

  cache = { githubBotToken, sessionSecret, githubAccessToken };
  return cache;
}

/**
 * Clear the secrets cache (useful for testing or forced refresh)
 */
export function clearSecretsCache(): void {
  cache = null;
}
