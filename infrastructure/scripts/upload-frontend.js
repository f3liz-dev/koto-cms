#!/usr/bin/env node

/**
 * Cross-platform frontend upload script
 * Usage: node upload-frontend.js <bucket-name> [region]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const bucketName = process.argv[2];
const region = process.argv[3] || 'us-ashburn-1';
const frontendDir = path.join(__dirname, '..', '..', 'public');

if (!bucketName) {
  console.error('Error: Bucket name required');
  console.error('Usage: node upload-frontend.js <bucket-name> [region]');
  process.exit(1);
}

if (!fs.existsSync(frontendDir)) {
  console.error(`Error: Frontend directory not found: ${frontendDir}`);
  console.error('Run "npm run build" first');
  process.exit(1);
}

console.log('Uploading frontend to OCI Object Storage...');
console.log(`Bucket: ${bucketName}`);
console.log(`Region: ${region}`);

try {
  execSync(
    `oci os object bulk-upload --bucket-name ${bucketName} --src-dir ${frontendDir} --overwrite --content-type-detection --region ${region}`,
    { stdio: 'inherit' }
  );
  console.log('✓ Frontend uploaded successfully');
} catch (error) {
  console.error('Upload failed:', error.message);
  process.exit(1);
}
