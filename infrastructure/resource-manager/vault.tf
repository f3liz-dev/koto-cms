# OCI Vault Integration for Secrets Management
# Replaces plain-text variables with encrypted vault secrets

# Uncomment to enable Vault integration:

# variable "vault_id" {
#   description = "OCI Vault OCID for secrets"
#   type        = string
# }

# variable "vault_key_id" {
#   description = "OCI Vault Master Encryption Key OCID"
#   type        = string
# }

# # GitHub Bot Token Secret
# resource "oci_vault_secret" "github_bot_token" {
#   compartment_id = var.compartment_id
#   vault_id       = var.vault_id
#   key_id         = var.vault_key_id
#   secret_name    = "${var.project_name}-github-bot-token"
#   
#   secret_content {
#     content_type = "BASE64"
#     content      = base64encode(var.github_bot_token)
#   }
# }

# # Session Secret
# resource "oci_vault_secret" "session_secret" {
#   compartment_id = var.compartment_id
#   vault_id       = var.vault_id
#   key_id         = var.vault_key_id
#   secret_name    = "${var.project_name}-session-secret"
#   
#   secret_content {
#     content_type = "BASE64"
#     content      = base64encode(var.session_secret)
#   }
# }

# # GitHub Access Token Secret
# resource "oci_vault_secret" "github_access_token" {
#   compartment_id = var.compartment_id
#   vault_id       = var.vault_id
#   key_id         = var.vault_key_id
#   secret_name    = "${var.project_name}-github-access-token"
#   
#   secret_content {
#     content_type = "BASE64"
#     content      = base64encode(var.github_access_token)
#   }
# }

# # Update Functions Application to use Vault secrets
# # Replace the config block in stack.tf with:
# # config = {
# #   GITHUB_BOT_TOKEN    = oci_vault_secret.github_bot_token.id
# #   SESSION_SECRET      = oci_vault_secret.session_secret.id
# #   # ... other non-secret configs
# # }

# # Add Vault access policy
# resource "oci_identity_policy" "vault_access" {
#   compartment_id = var.compartment_id
#   name           = "${var.project_name}-vault-policy"
#   description    = "Allow Functions to read secrets from Vault"
#   
#   statements = [
#     "Allow dynamic-group ${var.project_name}-functions-dg to read secret-family in compartment id ${var.compartment_id}",
#     "Allow dynamic-group ${var.project_name}-functions-dg to read vaults in compartment id ${var.compartment_id}",
#   ]
# }

# # Dynamic Group for Functions
# resource "oci_identity_dynamic_group" "functions" {
#   compartment_id = var.tenancy_ocid
#   name           = "${var.project_name}-functions-dg"
#   description    = "Dynamic group for Functions to access Vault"
#   matching_rule  = "ALL {resource.type = 'fnfunc', resource.compartment.id = '${var.compartment_id}'}"
# }
