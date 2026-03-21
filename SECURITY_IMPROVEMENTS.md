# Security Improvements

## Session Configuration from Environment

### Changes Made

Updated the Phoenix endpoint configuration to pull session secrets from environment variables instead of hardcoding them.

### Before
```elixir
# lib/koto_cms_web/endpoint.ex
@session_options [
  store: :cookie,
  key: "_koto_cms_key",
  signing_salt: "changeme",  # ❌ Hardcoded
  same_site: "Lax"
]
```

### After
```elixir
# lib/koto_cms_web/endpoint.ex
@session_options [
  store: :cookie,
  key: System.get_env("SESSION_COOKIE_KEY") || "_koto_cms_key",
  signing_salt: System.get_env("SESSION_SIGNING_SALT") || 
                raise("SESSION_SIGNING_SALT environment variable is required"),
  same_site: "Lax"
]
```

## New Environment Variables

### Required
- `SESSION_SIGNING_SALT` - Session cookie signing salt (generate with `mix phx.gen.secret`)

### Optional
- `SESSION_COOKIE_KEY` - Session cookie name (default: `_koto_cms_key`)
- `LIVEVIEW_SIGNING_SALT` - LiveView signing salt (default: `dev_liveview_salt` in dev)

## Configuration Files Updated

### 1. lib/koto_cms_web/endpoint.ex
- Session signing salt now from environment
- Session cookie key now from environment
- Raises error if SESSION_SIGNING_SALT is missing

### 2. config/config.exs
- LiveView signing salt now from environment (with dev default)

### 3. config/dev.exs
- SECRET_KEY_BASE now from environment (with dev default)

### 4. .env.example
- Added SESSION_SIGNING_SALT
- Added SESSION_COOKIE_KEY
- Added documentation

### 5. docker-compose.yml
- Added SESSION_SIGNING_SALT to environment
- Added SESSION_COOKIE_KEY to environment

## Security Benefits

### 1. No Hardcoded Secrets
- All secrets now come from environment variables
- No secrets committed to version control
- Different secrets per environment

### 2. Explicit Requirements
- Application fails fast if SESSION_SIGNING_SALT is missing
- Clear error message guides configuration

### 3. Environment Isolation
- Development, staging, and production use different secrets
- Secrets can be rotated without code changes

### 4. Container Security
- Secrets injected at runtime via environment
- No secrets baked into Docker images
- Compatible with secret management systems

## Migration Guide

### For Existing Deployments

1. Generate a new signing salt:
   ```bash
   mix phx.gen.secret
   ```

2. Add to your environment:
   ```bash
   export SESSION_SIGNING_SALT="<generated-secret>"
   ```

3. Update .env file:
   ```bash
   SESSION_SIGNING_SALT=<generated-secret>
   ```

4. Restart the application

### For New Deployments

1. Copy .env.example to .env:
   ```bash
   cp .env.example .env
   ```

2. Generate all required secrets:
   ```bash
   # Generate three secrets
   mix phx.gen.secret  # For SESSION_SECRET
   mix phx.gen.secret  # For SECRET_KEY_BASE
   mix phx.gen.secret  # For SESSION_SIGNING_SALT
   ```

3. Update .env with generated values

4. Start the application:
   ```bash
   mix phx.server
   ```

### For Docker Deployments

1. Update docker-compose.yml or pass via command line:
   ```bash
   docker run -e SESSION_SIGNING_SALT="<secret>" ...
   ```

2. Or use .env file:
   ```bash
   docker compose up
   ```

### For OCI Container Instances

1. Add to Terraform variables:
   ```hcl
   variable "session_signing_salt" {
     type      = string
     sensitive = true
   }
   ```

2. Pass to container:
   ```hcl
   environment_variables = {
     SESSION_SIGNING_SALT = var.session_signing_salt
   }
   ```

3. Or use OCI Vault (recommended):
   ```hcl
   # Store in vault
   resource "oci_vault_secret" "session_signing_salt" {
     # ...
   }
   ```

## Verification

### Check Configuration
```bash
# Verify environment variable is set
echo $SESSION_SIGNING_SALT

# Verify application starts
mix phx.server

# Should see no errors about missing SESSION_SIGNING_SALT
```

### Test Session Functionality
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test login flow
curl "http://localhost:3000/auth/login?handle=@user@instance"

# Verify session cookie is set correctly
```

## Rollback Plan

If issues occur, you can temporarily use a default value:

```elixir
# lib/koto_cms_web/endpoint.ex (temporary)
signing_salt: System.get_env("SESSION_SIGNING_SALT") || "temporary_default_salt"
```

But this should only be used for debugging. Always use environment variables in production.

## Best Practices

### 1. Secret Generation
```bash
# Always use mix phx.gen.secret
mix phx.gen.secret

# Never use weak secrets like "changeme" or "secret"
```

### 2. Secret Storage
- Use environment variables for local development
- Use secret management systems for production (OCI Vault, AWS Secrets Manager, etc.)
- Never commit secrets to version control
- Add .env to .gitignore

### 3. Secret Rotation
```bash
# Generate new secret
NEW_SALT=$(mix phx.gen.secret)

# Update environment
export SESSION_SIGNING_SALT="$NEW_SALT"

# Restart application
# Note: This will invalidate all existing sessions
```

### 4. Multiple Environments
```bash
# Development
SESSION_SIGNING_SALT=dev_salt_xxx

# Staging
SESSION_SIGNING_SALT=staging_salt_xxx

# Production
SESSION_SIGNING_SALT=prod_salt_xxx
```

## Security Checklist

- ✅ No hardcoded secrets in code
- ✅ Secrets from environment variables
- ✅ Application fails if secrets missing
- ✅ Different secrets per environment
- ✅ Secrets not in version control
- ✅ .env in .gitignore
- ✅ Documentation updated
- ✅ Docker configuration updated
- ✅ Example configuration provided

## Related Security Measures

This change complements existing security measures:

1. **JWT Sessions** - Stateless, signed tokens
2. **HMAC Signing** - Session integrity verification
3. **HttpOnly Cookies** - XSS protection
4. **SameSite=Lax** - CSRF protection
5. **Secure Headers** - X-Frame-Options, CSP, etc.
6. **Rate Limiting** - Brute force protection
7. **Allowlist** - Access control

## References

- [Phoenix Security Guide](https://hexdocs.pm/phoenix/security.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [12-Factor App: Config](https://12factor.net/config)
