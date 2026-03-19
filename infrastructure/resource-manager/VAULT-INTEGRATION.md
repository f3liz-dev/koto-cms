# OCI Vault Integration Guide

## Architecture Overview

```
Secrets never travel as plain values. Only OCIDs (pointers) move through the system.
The actual values stay inside Vault and are fetched at runtime by the Function.

DevOps Pipeline
      │
      │  passes OCIDs only (never values)
      ▼
OCI Functions (Deno)
      │
      │  fetch at startup via REST + Resource Principal
      ▼
OCI Vault  ──  returns decrypted secret value
```

## How It Works

### 1. Terraform Creates Vault Secrets

Three secrets are stored in Vault, encrypted with your master key:

```hcl
resource "oci_vault_secret" "github_bot_token" {
  compartment_id = var.compartment_id
  vault_id       = var.vault_id
  key_id         = var.vault_key_id
  secret_name    = "${var.project_name}-github-bot-token"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.github_bot_token)
  }
}
```

**Security Note:** `var.github_bot_token` gets written into `terraform.tfstate`. Mitigate by:
- Storing state in OCI Object Storage with server-side encryption enabled
- Using Resource Manager (state is automatically encrypted)

### 2. IAM Permissions

Functions need permission to read from Vault using Resource Principals:

```hcl
resource "oci_identity_dynamic_group" "functions" {
  matching_rule = "ALL {resource.type = 'fnfunc', resource.compartment.id = '${var.compartment_id}'}"
}

resource "oci_identity_policy" "vault_access" {
  statements = [
    # secret-bundles only — Functions only need to read values, not create/rotate
    "Allow dynamic-group ${...} to read secret-bundles in compartment id ${...}",
    "Allow dynamic-group ${...} to read vaults in compartment id ${...}",
  ]
}
```

**Why `secret-bundles` instead of `secret-family`?**
- Functions only need to read secret values
- More restrictive = better security
- Prevents accidental secret creation/deletion

### 3. Functions Config - OCIDs Only

```hcl
resource "oci_functions_application" "cms" {
  config = {
    GITHUB_BOT_TOKEN_SECRET_OCID    = oci_vault_secret.github_bot_token.id
    SESSION_SECRET_OCID             = oci_vault_secret.session_secret.id
    GITHUB_ACCESS_TOKEN_SECRET_OCID = oci_vault_secret.github_access_token.id
  }
}
```

These OCIDs are visible in OCI Console — that's fine. An OCID alone is harmless without IAM permission to call Vault.

### 4. Deno Runtime - Fetching Secrets

OCI SDK doesn't support Deno, so we call the Vault REST API directly using `crypto.subtle` for RSA-SHA256 request signing.

**Resource Principal credentials** are injected automatically by the Functions runtime as environment variables:
- `OCI_RESOURCE_PRINCIPAL_RPST` - Resource Principal Session Token
- `OCI_RESOURCE_PRINCIPAL_PRIVATE_PEM` - Private key for signing
- `OCI_RESOURCE_PRINCIPAL_REGION` - Region

#### vault.ts - Fetch Secret from Vault

```typescript
export async function getSecret(secretOcid: string): Promise<string> {
  const region = Deno.env.get("OCI_RESOURCE_PRINCIPAL_REGION") ?? "ap-tokyo-1";
  const endpoint = `https://secrets.vaults.${region}.oci.oraclecloud.com`;
  const url = `${endpoint}/20190301/secretbundles/${secretOcid}`;
  
  const signer = await buildResourcePrincipalSigner();
  const req = await signer.sign(new Request(url));
  const res = await fetch(req);
  
  if (!res.ok) throw new Error(`Vault error: ${res.status}`);
  
  const bundle = await res.json();
  return atob(bundle.secretBundleContent.content);
}
```

#### secrets.ts - Cache at Cold Start

```typescript
let cache: Secrets | null = null;

export async function initSecrets(): Promise<Secrets> {
  if (cache) return cache;
  
  const [githubBotToken, sessionSecret, githubAccessToken] = await Promise.all([
    getSecret(Deno.env.get("GITHUB_BOT_TOKEN_SECRET_OCID")!),
    getSecret(Deno.env.get("SESSION_SECRET_OCID")!),
    getSecret(Deno.env.get("GITHUB_ACCESS_TOKEN_SECRET_OCID")!),
  ]);
  
  cache = { githubBotToken, sessionSecret, githubAccessToken };
  return cache;
}
```

**Why cache?**
- Secrets are fetched once at cold start
- Reused across all invocations in the same container
- Reduces Vault API calls and latency

#### server.ts - Initialize Before Serving

```typescript
if (import.meta.main) {
  const vaultMode = !!Deno.env.get("GITHUB_BOT_TOKEN_SECRET_OCID");
  
  if (vaultMode) {
    secrets = await initSecrets();
    log("info", "Secrets loaded from Vault");
  } else {
    // Local dev fallback
    secrets = {
      githubBotToken: Deno.env.get("GITHUB_BOT_TOKEN")!,
      sessionSecret: Deno.env.get("SESSION_SECRET")!,
      githubAccessToken: Deno.env.get("GITHUB_ACCESS_TOKEN")!,
    };
  }
  
  Deno.serve({ handler: handleRequest });
}
```

## What Goes Where - Summary

| Thing | Location | Visible in Console? |
|-------|----------|---------------------|
| Secret values | OCI Vault only | No |
| Secret OCIDs | Function config env vars | Yes — harmless |
| Vault key OCID | Terraform vars | Yes — harmless |
| terraform.tfstate | OCI Object Storage, SSE on | No |
| Build log | DevOps (no secrets used) | N/A |

## Local Development

For local development without Vault:

```bash
export GITHUB_BOT_TOKEN="ghp_..."
export SESSION_SECRET="your-32-char-secret"
export GITHUB_ACCESS_TOKEN="ghp_..."
export GITHUB_REPO="owner/repo"

deno run --allow-all src/server.ts
```

The code automatically detects the absence of `*_SECRET_OCID` env vars and falls back to plain environment variables.

## Secret Rotation

### Manual Rotation

1. **OCI Console** → **Vault** → **Secrets**
2. Select the secret to rotate
3. **Create New Version**
4. Enter new value
5. Functions automatically use the new version on next cold start

### Force Immediate Rotation

Redeploy the function to force all containers to restart:

```bash
oci fn function update \
  --function-id <function-ocid> \
  --force-new-deployment
```

### Automatic Rotation (Advanced)

Add `rotation_config` block to `oci_vault_secret`:

```hcl
resource "oci_vault_secret" "github_bot_token" {
  # ... existing config ...
  
  rotation_config {
    target_system_details {
      target_system_type = "FUNCTION"
      function_id        = oci_functions_function.rotate_secret.id
    }
    rotation_interval = "P30D"  # Rotate every 30 days
  }
}
```

## What's Not Covered Yet

1. **Cache invalidation** - If a secret rotates, the cold-start cache needs a way to refresh
   - Simplest: Redeploy the function
   - Advanced: Implement TTL-based cache refresh

2. **Error handling** - Retry logic for transient Vault API failures
   - Currently fails fast on Vault errors
   - Consider exponential backoff for production

3. **Monitoring** - Track secret access and rotation events
   - Enable Vault audit logs
   - Set up OCI Monitoring alarms for failed secret fetches

## Security Best Practices

1. **Least Privilege** - Use `secret-bundles` permission, not `secret-family`
2. **Rotate Regularly** - Set up automatic rotation for sensitive tokens
3. **Audit Logs** - Enable Vault audit logging to track access
4. **Encrypt State** - Always use encrypted Object Storage for Terraform state
5. **No Logging** - Never log secret values (OCIDs are fine)

## Troubleshooting

### "Resource Principal credentials not found"

**Cause:** Running locally or outside OCI Functions  
**Solution:** Use plain env vars for local dev (code auto-detects)

### "Vault error: 401"

**Cause:** IAM policy missing or incorrect  
**Solution:** Verify Dynamic Group and Policy are deployed correctly

### "Vault error: 404"

**Cause:** Secret OCID is wrong or secret doesn't exist  
**Solution:** Check Function config env vars match Vault secret OCIDs

### Secrets not updating after rotation

**Cause:** Container is still warm with old cached values  
**Solution:** Redeploy function or wait for natural container recycling

## Cost

| Resource | Cost |
|----------|------|
| Vault | Free (Always Free) |
| Master Encryption Key | Free (Always Free) |
| Secret (per secret) | $0.03/month |
| Secret version | $0.03/month/version |
| API calls | First 10,000/month free, then $0.03/10,000 |

**Total for 3 secrets:** ~$0.09/month

## References

- [OCI Vault Documentation](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/home.htm)
- [OCI Functions Resource Principal](https://docs.oracle.com/en-us/iaas/Content/Functions/Tasks/functionsaccessingociresources.htm)
- [Vault REST API](https://docs.oracle.com/en-us/iaas/api/#/en/secretretrieval/20190301/)
