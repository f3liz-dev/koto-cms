#!/bin/bash
set -euo pipefail

# Manual deployment script for OCI
# Usage: ./manual-deploy.sh [region] [namespace]

REGION="${1:-us-ashburn-1}"
NAMESPACE="${2:-}"
PROJECT_NAME="koto-cms"

if [ -z "$NAMESPACE" ]; then
  echo "Error: OCI namespace required"
  echo "Usage: $0 [region] <namespace>"
  exit 1
fi

echo "=== Koto Manual Deployment ==="
echo "Region: $REGION"
echo "Namespace: $NAMESPACE"
echo ""

# Step 1: Build Frontend
echo "Step 1/5: Building frontend..."
npm ci
npm run build
echo "✓ Frontend built"

# Step 2: Upload to Object Storage
echo "Step 2/5: Uploading frontend to Object Storage..."
BUCKET_NAME="${PROJECT_NAME}-frontend"
oci os object bulk-upload \
  --bucket-name "$BUCKET_NAME" \
  --src-dir public/ \
  --overwrite \
  --content-type-detection \
  --region "$REGION"
echo "✓ Frontend uploaded"

# Step 3: Build Docker Image
echo "Step 3/5: Building backend Docker image..."
IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE_NAME="${REGION}.ocir.io/${NAMESPACE}/${PROJECT_NAME}:${IMAGE_TAG}"
IMAGE_LATEST="${REGION}.ocir.io/${NAMESPACE}/${PROJECT_NAME}:latest"

docker build \
  -f Dockerfile.backend \
  -t "$IMAGE_NAME" \
  -t "$IMAGE_LATEST" \
  .
echo "✓ Image built: $IMAGE_NAME"

# Step 4: Push to OCI Container Registry
echo "Step 4/5: Pushing to OCI Container Registry..."
echo "Please ensure you're logged in: docker login ${REGION}.ocir.io"
docker push "$IMAGE_NAME"
docker push "$IMAGE_LATEST"
echo "✓ Image pushed"

# Step 5: Update Function
echo "Step 5/5: Updating OCI Function..."
APP_NAME="${PROJECT_NAME}-app"
FUNCTION_NAME="${PROJECT_NAME}-function"

fn deploy --app "$APP_NAME" --verbose

echo ""
echo "=== Deployment Complete ==="
echo "Image: $IMAGE_NAME"
echo "Frontend: https://objectstorage.${REGION}.oraclecloud.com/n/${NAMESPACE}/b/${BUCKET_NAME}/o/index.html"
echo ""
echo "Test the deployment:"
echo "  curl https://your-gateway-url/health"
