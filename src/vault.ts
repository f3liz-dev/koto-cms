// OCI Vault integration for Deno Functions
// Fetches secrets using Resource Principal authentication

/**
 * Fetch a secret value from OCI Vault using Resource Principal
 * @param secretOcid - The OCID of the vault secret
 * @returns Decrypted secret value
 */
export async function getSecret(secretOcid: string): Promise<string> {
  const region = Deno.env.get("OCI_RESOURCE_PRINCIPAL_REGION") ?? "ap-tokyo-1";
  const endpoint = `https://secrets.vaults.${region}.oci.oraclecloud.com`;
  const url = `${endpoint}/20190301/secretbundles/${secretOcid}`;

  const signer = await buildResourcePrincipalSigner();
  const req = await signer.sign(new Request(url));
  const res = await fetch(req);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Vault error: ${res.status} - ${errorText}`);
  }

  const bundle = await res.json();
  return atob(bundle.secretBundleContent.content);
}

/**
 * Build a request signer using OCI Resource Principal credentials
 * Resource Principal env vars are injected by OCI Functions runtime
 */
async function buildResourcePrincipalSigner() {
  const rpst = Deno.env.get("OCI_RESOURCE_PRINCIPAL_RPST");
  const pemKey = Deno.env.get("OCI_RESOURCE_PRINCIPAL_PRIVATE_PEM");

  if (!rpst || !pemKey) {
    throw new Error(
      "Resource Principal credentials not found. Ensure function is running in OCI Functions."
    );
  }

  const keyId = `ST$${rpst}`;

  // Import RSA private key for signing
  const raw = Uint8Array.from(
    atob(pemKey.replace(/-----.*?-----|\s/g, "")),
    (c) => c.charCodeAt(0)
  );
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return {
    async sign(request: Request): Promise<Request> {
      const url = new URL(request.url);
      const date = new Date().toUTCString();
      const signingString = [
        `(request-target): get ${url.pathname}${url.search}`,
        `host: ${url.hostname}`,
        `date: ${date}`,
      ].join("\n");

      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(signingString)
      );
      const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

      const headers = new Headers(request.headers);
      headers.set("Date", date);
      headers.set(
        "Authorization",
        `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",` +
          `headers="(request-target) host date",signature="${b64}"`
      );
      return new Request(request, { headers });
    },
  };
}
