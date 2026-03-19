# Infrastructure Setup

This directory contains infrastructure-as-code and deployment scripts for the f3liz CMS.

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ├─── Static Assets ────────┐
       │                          │
       │                     ┌────▼────────────┐
       │                     │  OCI Object     │
       │                     │  Storage        │
       │                     │  (Frontend)     │
       │                     └─────────────────┘
       │
       └─── API Requests ─────────┐
                                  │
                             ┌────▼────────────┐
                             │  OCI API        │
                             │  Gateway        │
                             └────┬────────────┘
                                  │
                             ┌────▼────────────┐
                             │  OCI Functions  │
                             │  (Backend)      │
                             └────┬────────────┘
                                  │
                             ┌────▼────────────┐
                             │  GitHub API     │
                             └─────────────────┘
```

## Directory Structure

```
infrastructure/
├── resource-manager/   # OCI Resource Manager (推奨)
│   ├── stack.tf       # 完全なインフラ定義
│   ├── schema.yaml    # UI用変数定義
│   ├── README.md      # 詳細ガイド
│   └── create-stack.sh # Stack作成スクリプト
├── terraform/          # 従来のTerraform（ローカル実行）
│   ├── main.tf        # Core infrastructure
│   ├── devops.tf      # DevOps pipelines
│   ├── variables.tf   # Input variables
│   └── outputs.tf     # Output values
├── oci-devops/        # CI/CD pipeline definitions
│   ├── build_spec.yaml    # Build pipeline steps
│   ├── deploy_spec.yaml   # Deployment pipeline steps
│   ├── README.md          # Detailed setup guide
│   └── manual-deploy.sh   # Manual deployment script
└── scripts/           # Helper scripts
    ├── upload-frontend.sh   # Bash script
    ├── upload-frontend.js   # Node.js script
    └── deploy.ps1           # PowerShell script
```

## Deployment

### OCI Resource Manager (Recommended)

**Fully managed - simplest approach**

```bash
cd infrastructure/resource-manager
./create-stack.sh
# Upload stack.zip to OCI Console
```

**Features:**
- ✅ No Terraform CLI needed
- ✅ OCI Console workflow
- ✅ Automatic state management
- ✅ Provisioned Concurrency (2 warm instances)
- ✅ Environment variables only (no Vault)
- ✅ IAM-based auth (no tokens)

Details: [resource-manager/README.md](./resource-manager/README.md)

### Terraform CLI (Alternative)

**Linux/Mac:**
```bash
npm run build
./scripts/upload-frontend.sh <bucket-name> <region>
```

**Windows:**
```powershell
npm run build
.\scripts\deploy.ps1 -BucketName <bucket-name> -Region <region>
```

## Environment Variables

### Required for Backend

| Variable | Description |
|----------|-------------|
| `GITHUB_BOT_TOKEN` | GitHub PAT with repo access |
| `GITHUB_REPO` | Repository in format `owner/repo` |
| `SESSION_SECRET` | 32+ character random string |
| `DOCUMENT_EDITORS` | Comma-separated Fediverse handles |
| `MIAUTH_CALLBACK_URL` | Public callback URL |
| `FRONTEND_URL` | Object Storage bucket URL |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_BRANCH` | `main` | Base branch |
| `SESSION_TTL_HOURS` | `8` | Session lifetime |
| `APP_NAME` | `f3liz CMS` | Display name |
| `CMS_PORT` | `3000` | Server port |

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Vite + Preact | Static SPA |
| Backend | Deno + TypeScript | Serverless API |
| Storage | OCI Object Storage | Frontend assets |
| Compute | OCI Functions | Backend runtime |
| Gateway | OCI API Gateway | HTTP routing |
| Registry | OCI Container Registry | Docker images |
| IaC | Terraform | Infrastructure provisioning |
| CI/CD | OCI DevOps | Build and deployment pipelines |

## Cost Optimization

**Estimated Monthly Cost (Low Traffic):**

| Service | Usage | Cost |
|---------|-------|------|
| Object Storage | 1 GB + 10K requests | ~$0.03 |
| Functions | 100K invocations, 512MB, 1s avg | ~$2.00 |
| API Gateway | 100K requests | ~$0.35 |
| DevOps | 100 build minutes | ~$1.00 |
| **Total** | | **~$3-5/month** |

**Tips:**
- Functions auto-scale to zero (no idle cost)
- Object Storage is dirt cheap for static assets
- API Gateway caches responses (reduces function calls)
- DevOps only charges for build time

## Security Best Practices

1. **Secrets Management**
   - Use OCI Vault for sensitive values (SESSION_SECRET, tokens)
   - Never commit secrets to git
   - Rotate credentials regularly

2. **Network Security**
   - Functions in private subnet
   - API Gateway in public subnet (SSL termination)
   - Object Storage bucket: public read only

3. **Authentication**
   - MiAuth for user authentication
   - Resource principal for service-to-service
   - Rate limiting in application code

4. **CORS Configuration**
   - Configure API Gateway CORS policies
   - Restrict origins in production

5. **Audit Logging**
   - Enable OCI Audit for all API calls
   - Monitor DevOps pipeline logs
   - Track function invocations

## Monitoring & Observability

### Function Logs
```bash
# Via OCI CLI
fn logs get <app-name> <function-name>

# Via OCI Console
Functions → Applications → f3liz-cms-app → Logs
```

### DevOps Logs
```bash
# Build logs
oci devops build-run get --build-run-id <build-run-ocid>

# Deployment logs
oci devops deployment get --deployment-id <deployment-ocid>
```

### Metrics
```bash
# Function metrics (invocations, duration, errors)
oci monitoring metric-data summarize-metrics-data \
  --namespace oci_faas \
  --query-text "FunctionInvocationCount[1m].sum()"
```

## Troubleshooting

### Frontend not loading
```bash
# Check bucket is public
oci os bucket get --bucket-name f3liz-cms-frontend

# Test direct access
curl https://objectstorage.us-ashburn-1.oraclecloud.com/n/namespace/b/f3liz-cms-frontend/o/index.html

# Verify FRONTEND_URL in function config
oci fn application get --application-id <app-ocid>
```

### Backend errors
```bash
# Check function logs
fn logs get f3liz-cms-app f3liz-cms-function

# Test health endpoint
curl https://your-gateway-url/health

# Verify environment variables
oci fn application get --application-id <app-ocid> | jq '.data.config'
```

### Build pipeline fails
```bash
# Check build logs
oci devops build-run get --build-run-id <build-run-ocid>

# Verify IAM policies
oci iam policy get --policy-id <policy-ocid>

# Check dynamic group membership
oci iam dynamic-group get --dynamic-group-id <dg-ocid>
```

### Deployment fails
```bash
# Check deployment logs
oci devops deployment get --deployment-id <deployment-ocid>

# Verify function exists
oci fn function get --function-id <function-ocid>

# Check image in OCIR
oci artifacts container image list --compartment-id <compartment-ocid>
```

### Authentication issues
```bash
# Test MiAuth callback URL
curl https://your-gateway-url/miauth/callback?session=test

# Verify SESSION_SECRET is set
oci fn application get --application-id <app-ocid> | jq '.data.config.SESSION_SECRET'

# Check allowlist
echo $DOCUMENT_EDITORS
```

## Common Issues

**Issue:** "Permission denied" in build pipeline  
**Solution:** Check DevOps dynamic group policies

**Issue:** Frontend shows 404  
**Solution:** Verify FRONTEND_URL points to correct bucket

**Issue:** Function timeout  
**Solution:** Increase timeout in Terraform (default 30s)

**Issue:** CORS errors  
**Solution:** Configure API Gateway CORS policies

**Issue:** Image push fails  
**Solution:** Verify OCI auth token in build parameters
