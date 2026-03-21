# Manual Deployment Guide

Step-by-step instructions for deploying Koto CMS to OCI Container Instances (ARM64).

## Prerequisites

- OCI account with ARM A1 free tier available
- OCI CLI installed and configured (`oci setup config`)
- Docker with buildx support
- Node.js 18+ and npm
- Git

## Architecture

```
Browser → OCI Object Storage (static files)
        → Container Instance (API on port 3000)
          → GitHub API
```

## Step 1: Prepare OCI Infrastructure

### 1.1 Get Your OCI Information

```bash
# Get your tenancy OCID
oci iam compartment list --all | grep tenancy

# Get your compartment OCID (or use root compartment)
oci iam compartment list --all

# Get your Object Storage namespace
oci os ns get

# Get your subnet OCID (you need a VCN with a public subnet)
oci network subnet list --compartment-id <your-compartment-ocid>
```

### 1.2 Create Configuration File

Create `infrastructure/terraform.tfvars`:

```hcl
# OCI Configuration
region              = "us-ashburn-1"
compartment_id      = "ocid1.compartment.oc1..xxxxx"
tenancy_ocid        = "ocid1.tenancy.oc1..xxxxx"
subnet_id           = "ocid1.subnet.oc1..xxxxx"

# Application Configuration
project_name        = "koto-cms"
content_repo        = "owner/content-repo"
github_bot_token    = "ghp_xxxxx"
session_secret      = "generate-with-openssl-rand-base64-32"
document_editors    = "@user@instance.social"
app_name            = "Koto"

# Optional: Resource Configuration
container_cpus      = 1
container_memory_gb = 2
assign_public_ip    = true
```

Generate session secret:
```bash
openssl rand -base64 32
```

## Step 2: Deploy Infrastructure with Terraform

```bash
cd infrastructure

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Deploy infrastructure
terraform apply

# Save important outputs
terraform output -json > outputs.json
```

This creates:
- Container Instance (ARM64, 1 CPU, 2GB RAM)
- Object Storage bucket for frontend
- OCI Vault with secrets
- IAM policies for Resource Principal

## Step 3: Build and Deploy Application

### 3.1 Build Frontend

```bash
cd ..  # back to project root
npm ci
npm run build
```

This creates static files in `public/` directory.

### 3.2 Upload Frontend to Object Storage

```bash
# Get bucket name and namespace from Terraform
BUCKET_NAME=$(cd infrastructure && terraform output -raw bucket_name)
NAMESPACE=$(cd infrastructure && terraform output -raw namespace)

# Upload all files
find public/ -type f | while read -r file; do
  # Determine content type
  case "${file##*.}" in
    html) mime="text/html" ;;
    css) mime="text/css" ;;
    js) mime="application/javascript" ;;
    json) mime="application/json" ;;
    png) mime="image/png" ;;
    jpg|jpeg) mime="image/jpeg" ;;
    svg) mime="image/svg+xml" ;;
    woff2) mime="font/woff2" ;;
    ico) mime="image/x-icon" ;;
    *) mime="application/octet-stream" ;;
  esac
  
  # Upload file
  oci os object put \
    --bucket-name "$BUCKET_NAME" \
    --namespace "$NAMESPACE" \
    --file "$file" \
    --name "${file#public/}" \
    --content-type "$mime" \
    --force
done
```

### 3.3 Build ARM64 Docker Image

```bash
# Create buildx builder for ARM64 (first time only)
docker buildx create --name arm64-builder --use

# Build ARM64 image
REGION=$(cd infrastructure && terraform output -raw region)
NAMESPACE=$(cd infrastructure && terraform output -raw namespace)
PROJECT_NAME="koto-cms"
IMAGE="${REGION}.ocir.io/${NAMESPACE}/${PROJECT_NAME}"

docker buildx build \
  --platform linux/arm64 \
  -f Dockerfile.arm64 \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:$(date +%Y%m%d-%H%M%S)" \
  --load \
  .
```

### 3.4 Push to OCI Container Registry

```bash
# Login to OCIR
# Username format: <namespace>/<oci-username>
# Password: Use Auth Token (not your OCI password)
# Generate Auth Token: OCI Console → User Settings → Auth Tokens

docker login ${REGION}.ocir.io

# Push image
docker push "${IMAGE}:latest"
```

### 3.5 Update Container Instance

```bash
# Get container instance OCID
INSTANCE_ID=$(cd infrastructure && terraform output -raw container_instance_id)

# Stop container
oci container-instances container-instance stop \
  --container-instance-id "$INSTANCE_ID" \
  --wait-for-state STOPPED

# Start container (it will pull the new image)
oci container-instances container-instance start \
  --container-instance-id "$INSTANCE_ID" \
  --wait-for-state RUNNING
```

## Step 4: Verify Deployment

```bash
# Get container IP
CONTAINER_IP=$(cd infrastructure && terraform output -raw container_public_ip)

# Test health endpoint
curl http://${CONTAINER_IP}:3000/health

# Open in browser
echo "Application URL: http://${CONTAINER_IP}:3000/"
```

## Step 5: Configure MiAuth Callback

The MiAuth callback URL is automatically configured, but verify it:

```bash
cd infrastructure
terraform output miauth_callback_url
```

This URL should be: `http://<container-ip>:3000/miauth/callback`

## Updating the Application

### Update Code Only

```bash
# 1. Build frontend
npm run build

# 2. Upload to Object Storage
# (repeat Step 3.2)

# 3. Build and push new Docker image
# (repeat Steps 3.3 and 3.4)

# 4. Restart container
oci container-instances container-instance restart \
  --container-instance-id "$INSTANCE_ID"
```

### Update Infrastructure

```bash
cd infrastructure

# Modify terraform.tfvars
# Then apply changes
terraform apply
```

## Monitoring

### View Container Logs

```bash
# Get compartment ID
COMPARTMENT_ID=$(cd infrastructure && terraform output -raw compartment_id)

# Search logs
oci logging-search search-logs \
  --search-query "search \"${COMPARTMENT_ID}/container-instances\""
```

### Check Container Status

```bash
oci container-instances container-instance get \
  --container-instance-id "$INSTANCE_ID"
```

### Monitor Metrics

```bash
# CPU utilization
oci monitoring metric-data summarize-metrics-data \
  --namespace oci_computecontainerinstance \
  --query-text "CpuUtilization[1m].mean()"

# Memory utilization
oci monitoring metric-data summarize-metrics-data \
  --namespace oci_computecontainerinstance \
  --query-text "MemoryUtilization[1m].mean()"
```

## Troubleshooting

### Container won't start

```bash
# Check container logs
oci logging-search search-logs \
  --search-query "search \"${COMPARTMENT_ID}/container-instances\""

# Verify image exists
oci artifacts container image list \
  --compartment-id "$COMPARTMENT_ID" \
  --repository-name koto-cms
```

### Can't access application

```bash
# Verify public IP is assigned
terraform output container_public_ip

# Check security list allows port 3000
# OCI Console → Networking → Virtual Cloud Networks → Security Lists

# Test from within VCN
PRIVATE_IP=$(terraform output -raw container_private_ip)
curl http://${PRIVATE_IP}:3000/health
```

### ARM64 build fails

```bash
# Verify buildx is installed
docker buildx version

# Recreate builder
docker buildx rm arm64-builder
docker buildx create --name arm64-builder --use

# Try build again
docker buildx build --platform linux/arm64 -f Dockerfile.arm64 .
```

## Cost Estimate

Monthly cost (ARM A1 Free Tier):
- Compute: FREE (1 OCPU × 2GB within free tier)
- Object Storage: ~$0.03
- Total: ~$0.03/month

## Cleanup

To destroy all infrastructure:

```bash
cd infrastructure
terraform destroy
```

This removes:
- Container Instance
- Object Storage bucket (and all files)
- OCI Vault and secrets
- IAM policies and dynamic groups

## Security Notes

- Container runs as non-root user (uid 1000)
- Secrets stored in OCI Vault (encrypted)
- Resource Principal authentication (no credentials in code)
- Public IP can be disabled (set `assign_public_ip = false`)
- Use security lists to restrict access to port 3000

## Next Steps

- Set up custom domain with OCI Load Balancer
- Configure HTTPS with Let's Encrypt
- Set up monitoring alerts
- Configure log retention policies
- Implement backup strategy for Object Storage
