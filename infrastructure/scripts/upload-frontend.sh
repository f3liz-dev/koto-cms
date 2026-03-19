#!/bin/bash
set -euo pipefail

# Upload frontend to OCI Object Storage
# Usage: ./upload-frontend.sh <bucket-name> <region>

BUCKET_NAME="${1:-}"
REGION="${2:-us-ashburn-1}"
FRONTEND_DIR="public"

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Bucket name required"
  echo "Usage: $0 <bucket-name> [region]"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "Error: Frontend directory not found: $FRONTEND_DIR"
  echo "Run 'npm run build' first"
  exit 1
fi

echo "Uploading frontend to OCI Object Storage..."
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"

oci os object bulk-upload \
  --bucket-name "$BUCKET_NAME" \
  --src-dir "$FRONTEND_DIR" \
  --overwrite \
  --content-type-detection \
  --region "$REGION"

echo "✓ Frontend uploaded successfully"
