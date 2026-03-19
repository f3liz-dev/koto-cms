# OCI DevOps Setup

This directory contains OCI DevOps pipeline configurations for automated CI/CD.

## Architecture

```
GitHub Repository
       │
       │ (mirror sync)
       ▼
OCI Code Repository
       │
       │ (trigger on push)
       ▼
Build Pipeline
  ├─ Build Frontend → Upload to Object Storage
  ├─ Build Backend Docker Image
  ├─ Push to OCI Container Registry
  └─ Trigger Deployment Pipeline
       │
       ▼
Deployment Pipeline
  └─ Update OCI Function with new image
```

## Setup Instructions

### 1. Prerequisites

- OCI CLI configured
- Terraform installed
- GitHub repository with code
- OCI Container Registry namespace created

### 2. Deploy Infrastructure with Terraform

```bash
cd infrastructure/terraform

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
region              = "us-ashburn-1"
compartment_id      = "ocid1.compartment.oc1..xxxxx"
tenancy_ocid        = "ocid1.tenancy.oc1..xxxxx"
namespace           = "your-namespace"
subnet_id           = "ocid1.subnet.oc1..xxxxx"
github_repo         = "owner/repo"
github_access_token = "ghp_xxxxx"
github_bot_token    = "ghp_xxxxx"
session_secret      = "$(openssl rand -base64 32)"
document_editors    = "@user@instance"
miauth_callback_url = "https://your-gateway-url/miauth/callback"
function_image      = "us-ashburn-1.ocir.io/namespace/f3liz-cms:latest"
EOF

# Deploy everything (including DevOps)
terraform init
terraform plan
terraform apply
```

This will create:
- Object Storage bucket for frontend
- OCI Functions application and function
- API Gateway
- DevOps project
- Build pipeline
- Deployment pipeline
- Code repository (mirrored from GitHub)
- Triggers
- IAM policies

### 3. Verify IAM Policies

The Terraform configuration automatically creates:

**Dynamic Group:**
```
ALL {resource.type = 'devopsbuildpipeline', resource.compartment.id = '<compartment-id>'}
```

**Policies (No Auth Token Needed!):**
```
Allow dynamic-group f3liz-cms-devops-dg to manage repos in tenancy
Allow dynamic-group f3liz-cms-devops-dg to read repos in tenancy
Allow dynamic-group f3liz-cms-devops-dg to use repos in tenancy
```

This allows the build pipeline to push to OCIR using **resource principal authentication** - no manual auth token creation required!

### 4. Trigger First Build

```bash
# Option 1: Push to GitHub (auto-triggers via mirror sync)
git push origin main

# Option 2: Manual trigger via OCI Console
# DevOps → Projects → Build Pipelines → Run Pipeline

# Option 3: Via OCI CLI
oci devops build-run create \
  --build-pipeline-id <pipeline-ocid>
```

## Pipeline Stages

### Build Pipeline

1. **Install Node.js** - Sets up Node.js 22
2. **Build Frontend** - Runs `npm ci && npm run build`
3. **Upload Frontend** - Uploads `public/` to Object Storage
4. **Build Docker Image** - Builds backend container
5. **Push to OCIR** - Pushes image to OCI Container Registry
6. **Trigger Deploy** - Starts deployment pipeline

### Deployment Pipeline

1. **Deploy to Functions** - Updates function with new image
2. **Verify Deployment** - Health check on `/health` endpoint
3. **Notify** - Logs deployment status

## Monitoring

### View Build Logs

```bash
# Via OCI Console
DevOps → Projects → Build Pipelines → Build Runs → View Logs

# Via OCI CLI
oci devops build-run get --build-run-id <build-run-ocid>
```

### View Deployment Logs

```bash
# Via OCI Console
DevOps → Projects → Deployments → View Logs

# Via OCI CLI
oci devops deployment get --deployment-id <deployment-ocid>
```

### Function Logs

```bash
# Via OCI CLI
fn logs get <app-name> <function-name>

# Via OCI Console
Functions → Applications → f3liz-cms-app → Logs
```

## Customization

### Modify Build Steps

Edit `build_spec.yaml` to add/remove build steps:

```yaml
steps:
  - type: Command
    name: "Your Custom Step"
    command: |
      echo "Custom build logic here"
```

### Add Environment Variables

Update `infrastructure/terraform/main.tf`:

```hcl
resource "oci_functions_application" "cms" {
  config = {
    # Add your variables here
    NEW_VAR = "value"
  }
}
```

### Change Trigger Conditions

Modify trigger in `devops.tf`:

```hcl
resource "oci_devops_trigger" "main_branch" {
  actions {
    filter {
      include {
        head_ref = "refs/heads/develop"  # Change branch
      }
    }
  }
}
```

## Troubleshooting

### Build fails with "Permission denied"

Check IAM policies for DevOps dynamic group:

```bash
oci iam policy get --policy-id <policy-ocid>
```

### Frontend not uploading to Object Storage

Verify bucket name in build parameters:

```bash
oci devops build-pipeline get --build-pipeline-id <pipeline-ocid>
```

### Function deployment fails

Check function configuration:

```bash
oci fn function get --function-id <function-ocid>
```

### Image push fails

Verify OCIR authentication:

```bash
docker login <region>.ocir.io
# Username: <namespace>/oracleidentitycloudservice/<username>
# Password: <auth-token>
```

## Cost Optimization

- Build pipelines: ~$0.01 per build minute
- Deployments: Free
- Storage: ~$0.0255 per GB/month
- Functions: Pay per invocation
- Estimated cost: $10-30/month for typical usage

## Security Best Practices

1. **Use OCI Vault** for secrets (auth tokens, API keys)
2. **Limit IAM policies** to minimum required permissions
3. **Enable audit logging** for DevOps events
4. **Use private subnets** for Functions
5. **Rotate auth tokens** regularly

## Migration from GitHub Actions

If you were using GitHub Actions before:

1. Remove `.github/workflows/deploy.yml`
2. Keep `.github/workflows/pr-check.yml` for PR validation
3. All deployments now happen via OCI DevOps
4. GitHub → OCI mirror sync happens automatically

## Next Steps

- Set up notifications (email/Slack) via ONS topic
- Add approval gates for production deployments
- Configure blue/green deployments
- Set up automated rollback on failure
