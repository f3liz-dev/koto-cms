# Terraform Backend Configuration
# Store state in OCI Object Storage with encryption

terraform {
  backend "s3" {
    # OCI Object Storage S3-compatible endpoint
    bucket   = "terraform-state"
    key      = "f3liz-cms/terraform.tfstate"
    region   = "us-ashburn-1"
    endpoint = "https://[namespace].compat.objectstorage.[region].oraclecloud.com"
    
    # Disable AWS-specific features
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
    
    # Use OCI credentials
    # Set these environment variables:
    # AWS_ACCESS_KEY_ID     = <OCI Customer Secret Key ID>
    # AWS_SECRET_ACCESS_KEY = <OCI Customer Secret Key>
  }
}

# To enable:
# 1. Create Object Storage bucket: terraform-state
# 2. Generate Customer Secret Keys in OCI Console
# 3. Replace [namespace] and [region] with your values
# 4. Run: terraform init -migrate-state
