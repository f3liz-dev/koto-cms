# OCI Vault Integration for Secrets Management
# Replaces plain-text variables with encrypted vault secrets

variable "vault_id" {
  description = "OCI Vault OCID for secrets"
  type        = string
}

variable "vault_key_id" {
  description = "OCI Vault Master Encryption Key OCID"
  type        = string
}

# GitHub Bot Token Secret
resource "oci_vault_secret" "github_bot_token" {
  compartment_id = var.compartment_id
  vault_id       = var.vault_id
  key_id         = var.vault_key_id
  secret_name    = "${var.project_name}-github-bot-token"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.github_bot_token)
  }
  
  lifecycle {
    ignore_changes = [secret_content]
    # After initial creation, update secrets via Vault Console or create new version
    # This prevents destroy/recreate which causes "pending deletion" conflicts
  }
}

# Session Secret
resource "oci_vault_secret" "session_secret" {
  compartment_id = var.compartment_id
  vault_id       = var.vault_id
  key_id         = var.vault_key_id
  secret_name    = "${var.project_name}-session-secret"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.session_secret)
  }
  
  lifecycle {
    ignore_changes = [secret_content]
  }
}

# GitHub Access Token Secret
resource "oci_vault_secret" "github_access_token" {
  compartment_id = var.compartment_id
  vault_id       = var.vault_id
  key_id         = var.vault_key_id
  secret_name    = "${var.project_name}-github-access-token"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.github_access_token)
  }
  
  lifecycle {
    ignore_changes = [secret_content]
  }
}

# Dynamic Group for Functions
resource "oci_identity_dynamic_group" "functions" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-functions-dg"
  description    = "Dynamic group for Functions to access Vault"
  matching_rule  = "ALL {resource.type = 'fnfunc', resource.compartment.id = '${var.compartment_id}'}"
}

# Vault access policy (secret-bundles only, not secret-family)
resource "oci_identity_policy" "vault_access" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-vault-policy"
  description    = "Allow Functions to read secrets from Vault"
  
  statements = [
    # secret-bundles only — Functions only need to read values, not create or rotate secrets
    "Allow dynamic-group ${oci_identity_dynamic_group.functions.name} to read secret-bundles in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.functions.name} to read vaults in compartment id ${var.compartment_id}",
  ]
}
