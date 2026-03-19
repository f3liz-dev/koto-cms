# PowerShell deployment script for Windows
param(
    [Parameter(Mandatory=$true)]
    [string]$BucketName,
    
    [string]$Region = "us-ashburn-1",
    [string]$FrontendDir = "public"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying frontend to OCI Object Storage..." -ForegroundColor Cyan
Write-Host "Bucket: $BucketName"
Write-Host "Region: $Region"

if (-not (Test-Path $FrontendDir)) {
    Write-Error "Frontend directory not found: $FrontendDir. Run 'npm run build' first."
    exit 1
}

# Upload to OCI Object Storage
oci os object bulk-upload `
    --bucket-name $BucketName `
    --src-dir $FrontendDir `
    --overwrite `
    --content-type-detection `
    --region $Region

Write-Host "✓ Frontend uploaded successfully" -ForegroundColor Green
