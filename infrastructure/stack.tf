# OCI Container Instances Stack (ARM A1)
# Simplified deployment without Load Balancer

terraform {
  required_version = ">= 1.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

# Variables
variable "region" {
  description = "OCI region"
  type        = string
}

variable "compartment_id" {
  description = "OCI compartment OCID"
  type        = string
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "subnet_id" {
  description = "Subnet OCID for Container Instance (can be public or private)"
  type        = string
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "koto-cms"
}

variable "container_image" {
  description = "Docker image override. Defaults to <region>.ocir.io/<namespace>/<project_name>:latest"
  type        = string
  default     = ""
}

variable "container_memory_gb" {
  description = "Container memory in GB"
  type        = number
  default     = 2
}

variable "container_cpus" {
  description = "Container CPU count"
  type        = number
  default     = 1
}

variable "assign_public_ip" {
  description = "Assign public IP to container"
  type        = bool
  default     = true
}

# Environment Variables
variable "github_bot_token" {
  description = "GitHub PAT for bot"
  type        = string
  sensitive   = true
}

variable "content_repo" {
  description = "Content repository (owner/repo)"
  type        = string
}

variable "github_branch" {
  description = "Default GitHub branch"
  type        = string
  default     = "main"
}

variable "session_secret" {
  description = "Session signing secret (32+ chars)"
  type        = string
  sensitive   = true
}

variable "document_editors" {
  description = "Comma-separated Fediverse handles"
  type        = string
}

variable "app_name" {
  description = "Application display name"
  type        = string
  default     = "Koto"
}

# Provider
provider "oci" {
  region = var.region
}

# Data sources
data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_id
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

locals {
  container_image = var.container_image != "" ? var.container_image : "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${var.project_name}:latest"
  frontend_url = "https://objectstorage.${var.region}.oraclecloud.com/n/${data.oci_objectstorage_namespace.ns.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o"
}

# Object Storage Bucket for Frontend
resource "oci_objectstorage_bucket" "frontend" {
  compartment_id = var.compartment_id
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "${var.project_name}-frontend"
  access_type    = "ObjectRead"
  versioning     = "Disabled"
}

# OCI Vault for Secrets
resource "oci_kms_vault" "cms" {
  compartment_id = var.compartment_id
  display_name   = "${var.project_name}-vault"
  vault_type     = "DEFAULT"
}

resource "oci_kms_key" "cms" {
  compartment_id = var.compartment_id
  display_name   = "${var.project_name}-key"
  
  key_shape {
    algorithm = "AES"
    length    = 32
  }
  
  management_endpoint = oci_kms_vault.cms.management_endpoint
}

# Vault Secrets
resource "oci_vault_secret" "github_bot_token" {
  compartment_id = var.compartment_id
  vault_id       = oci_kms_vault.cms.id
  key_id         = oci_kms_key.cms.id
  secret_name    = "${var.project_name}-github-bot-token"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.github_bot_token)
  }
}

resource "oci_vault_secret" "session_secret" {
  compartment_id = var.compartment_id
  vault_id       = oci_kms_vault.cms.id
  key_id         = oci_kms_key.cms.id
  secret_name    = "${var.project_name}-session-secret"
  
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.session_secret)
  }
}

# Container Instance (ARM A1)
resource "oci_container_instances_container_instance" "cms" {
  compartment_id      = var.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "${var.project_name}-instance"
  
  shape = "CI.Standard.A1.Flex"
  shape_config {
    ocpus         = var.container_cpus
    memory_in_gbs = var.container_memory_gb
  }
  
  vnics {
    subnet_id             = var.subnet_id
    is_public_ip_assigned = var.assign_public_ip
  }
  
  containers {
    display_name = "${var.project_name}-container"
    image_url    = local.container_image
    
    environment_variables = {
      CMS_PORT                     = "3000"
      CMS_HOST                     = "0.0.0.0"
      GITHUB_BOT_TOKEN_SECRET_OCID = oci_vault_secret.github_bot_token.id
      SESSION_SECRET_OCID          = oci_vault_secret.session_secret.id
      GITHUB_REPO                  = var.content_repo
      GITHUB_BRANCH                = var.github_branch
      DOCUMENT_EDITORS             = var.document_editors
      MIAUTH_CALLBACK_URL          = "http://${oci_container_instances_container_instance.cms.vnics[0].public_ip}/miauth/callback"
      APP_NAME                     = var.app_name
      FRONTEND_URL                 = local.frontend_url
    }
    
    resource_config {
      memory_limit_in_gbs = var.container_memory_gb
      vcpus_limit         = var.container_cpus
    }
    
    health_checks {
      health_check_type   = "HTTP"
      path                = "/health"
      port                = 3000
      interval_in_seconds = 30
      timeout_in_seconds  = 10
      failure_threshold   = 3
    }
  }
  
  container_restart_policy = "ALWAYS"
}

# Dynamic Group for Container Instance
resource "oci_identity_dynamic_group" "container" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-container-dg"
  description    = "Dynamic group for Container Instance"
  matching_rule  = "ALL {resource.type = 'computecontainerinstance', resource.compartment.id = '${var.compartment_id}'}"
}

# Policy for Container Instance
resource "oci_identity_policy" "container" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-container-policy"
  description    = "Policy for Container Instance to access secrets"
  
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.container.name} to read secret-family in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.container.name} to read vaults in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.container.name} to read keys in compartment id ${var.compartment_id}",
  ]
}

# Outputs
output "bucket_name" {
  description = "Frontend bucket name"
  value       = oci_objectstorage_bucket.frontend.name
}

output "bucket_url" {
  description = "Frontend bucket URL"
  value       = local.frontend_url
}

output "container_public_ip" {
  description = "Container Instance public IP"
  value       = var.assign_public_ip ? oci_container_instances_container_instance.cms.vnics[0].public_ip : null
}

output "container_private_ip" {
  description = "Container Instance private IP"
  value       = oci_container_instances_container_instance.cms.vnics[0].private_ip
}

output "container_url" {
  description = "Container Instance URL"
  value       = var.assign_public_ip ? "http://${oci_container_instances_container_instance.cms.vnics[0].public_ip}" : null
}

output "container_instance_id" {
  description = "Container Instance OCID"
  value       = oci_container_instances_container_instance.cms.id
}

output "container_registry_url" {
  description = "OCI Container Registry URL"
  value       = "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${var.project_name}"
}

output "miauth_callback_url" {
  description = "MiAuth callback URL (use this in your configuration)"
  value       = var.assign_public_ip ? "http://${oci_container_instances_container_instance.cms.vnics[0].public_ip}/miauth/callback" : null
}

output "namespace" {
  description = "Object Storage namespace"
  value       = data.oci_objectstorage_namespace.ns.namespace
}
