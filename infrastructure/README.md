# Infrastructure

Infrastructure-as-code for deploying Koto CMS to OCI Container Instances (ARM64).

## Quick Start

```bash
cd infrastructure

# 1. Create terraform.tfvars with your configuration
# 2. Deploy infrastructure
terraform init
terraform apply

# 3. Deploy application (see MANUAL_DEPLOY.md for details)
```

## Files

- `stack.tf` - Terraform configuration for OCI resources
- `MANUAL_DEPLOY.md` - Step-by-step deployment instructions
- `ARCHITECTURE.md` - System architecture documentation

## What Gets Deployed

- Container Instance (ARM64, 1 CPU, 2GB RAM) - FREE
- Object Storage bucket (frontend assets) - ~$0.03/month
- OCI Vault (secrets) - FREE
- IAM policies - FREE

Total cost: ~$0.03/month

## Configuration

Create `terraform.tfvars`:

```hcl
region              = "us-ashburn-1"
compartment_id      = "ocid1.compartment.oc1..xxxxx"
tenancy_ocid        = "ocid1.tenancy.oc1..xxxxx"
subnet_id           = "ocid1.subnet.oc1..xxxxx"
content_repo        = "owner/content-repo"
github_bot_token    = "ghp_xxxxx"
session_secret      = "generate-with-openssl-rand-base64-32"
document_editors    = "@user@instance.social"
```

See `MANUAL_DEPLOY.md` for complete deployment instructions.
