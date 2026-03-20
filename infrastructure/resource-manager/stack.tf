# OCI Resource Manager Stack Configuration
# Upload this as a .zip to OCI Console → Resource Manager → Stacks

terraform {
  required_version = ">= 1.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

# Variables will be provided via Resource Manager UI
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

# namespace is auto-fetched via data source - no variable needed

variable "subnet_id" {
  description = "Subnet OCID for Functions"
  type        = string
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "koto-cms"
}

variable "function_image" {
  description = "Docker image override. Defaults to <region>.ocir.io/<namespace>/<project_name>:latest"
  type        = string
  default     = ""
}

# Environment Variables (Simple - No Vault)
variable "github_bot_token" {
  description = "GitHub PAT for bot"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository for DevOps mirroring (owner/repo)"
  type        = string
}

variable "content_repo" {
  description = "記事を管理するGitHubリポジトリ (owner/repo)"
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

variable "miauth_callback_url" {
  description = "Public MiAuth callback URL"
  type        = string
}

variable "app_name" {
  description = "Application display name"
  type        = string
  default     = "Koto"
}

variable "github_access_token" {
  description = "GitHub personal access token for repository mirroring"
  type        = string
  sensitive   = true
}

# Provider configuration
provider "oci" {
  region = var.region
}

# Auto-fetch Object Storage namespace from tenancy
data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_id
}

locals {
  function_image = var.function_image != "" ? var.function_image : "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${var.project_name}:latest"
}

# Object Storage Bucket for Frontend
resource "oci_objectstorage_bucket" "frontend" {
  compartment_id = var.compartment_id
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "${var.project_name}-frontend"
  access_type    = "ObjectRead"
  versioning     = "Disabled"
}

# OCI Functions Application
resource "oci_functions_application" "cms" {
  compartment_id = var.compartment_id
  display_name   = "${var.project_name}-app"
  subnet_ids     = [var.subnet_id]

  # Environment variables - OCIDs only (secrets fetched at runtime)
  config = {
    GITHUB_BOT_TOKEN_SECRET_OCID    = oci_vault_secret.github_bot_token.id
    SESSION_SECRET_OCID             = oci_vault_secret.session_secret.id
    GITHUB_ACCESS_TOKEN_SECRET_OCID = oci_vault_secret.github_access_token.id
    GITHUB_REPO                     = var.content_repo  # Content repository
    GITHUB_BRANCH                   = var.github_branch
    DOCUMENT_EDITORS                = var.document_editors
    MIAUTH_CALLBACK_URL             = var.miauth_callback_url
    APP_NAME                        = var.app_name
    FRONTEND_URL                    = "https://objectstorage.${var.region}.oraclecloud.com/n/${data.oci_objectstorage_namespace.ns.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o"
  }
}

# OCI Function with Provisioned Concurrency
resource "oci_functions_function" "cms" {
  application_id     = oci_functions_application.cms.id
  display_name       = "${var.project_name}-function"
  image              = local.function_image  # Defaults to <region>.ocir.io/<namespace>/<project_name>:latest
  memory_in_mbs      = 512
  timeout_in_seconds = 30

  # Provisioned Concurrency (warm instances)
  # 2 instances × 512MB × 25% = ~324,000 GB-seconds/month
  # Free tier: 400,000 GB-seconds/month → within free tier
  # provisioned_concurrency_config {
  #   strategy = "CONSTANT"
  #   count    = 2  # Keep 2 instances warm (within free tier)
  # }
}

# API Gateway
resource "oci_apigateway_gateway" "cms" {
  compartment_id = var.compartment_id
  endpoint_type  = "PUBLIC"
  subnet_id      = var.subnet_id
  display_name   = "${var.project_name}-gateway"
}

# API Gateway Deployment
resource "oci_apigateway_deployment" "cms" {
  compartment_id = var.compartment_id
  gateway_id     = oci_apigateway_gateway.cms.id
  path_prefix    = "/"
  display_name   = "${var.project_name}-deployment"

  specification {
    # API routes
    routes {
      path    = "/api/{path*}"
      methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    # Auth routes
    routes {
      path    = "/auth/{path*}"
      methods = ["GET", "POST", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    # MiAuth routes
    routes {
      path    = "/miauth/{path*}"
      methods = ["GET", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    # Health check
    routes {
      path    = "/health"
      methods = ["GET"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    # Frontend static assets (Object Storage)
    routes {
      path    = "/{path*}"
      methods = ["GET"]
      backend {
        type = "HTTP_BACKEND"
        url  = "https://objectstorage.${var.region}.oraclecloud.com/n/${data.oci_objectstorage_namespace.ns.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o/$${request.path[path]}"
      }
    }
  }
}

# DevOps Project
resource "oci_devops_project" "cms" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-devops"
  description    = "DevOps project for Koto"
  
  notification_config {
    topic_id = oci_ons_notification_topic.devops.id
  }
}

# Notification Topic
resource "oci_ons_notification_topic" "devops" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-devops-notifications"
}

# Code Repository (mirror from GitHub - for DevOps)
resource "oci_devops_repository" "cms" {
  name           = "${var.project_name}-repo"
  project_id     = oci_devops_project.cms.id
  repository_type = "MIRRORED"
  
  mirror_repository_config {
    connector_id = oci_devops_connection.github.id
    repository_url = "https://github.com/${var.github_repo}.git"  # DevOps repository
    trigger_schedule {
      schedule_type = "DEFAULT"
    }
  }
}

resource "oci_devops_connection" "github" {
  project_id      = oci_devops_project.cms.id
  connection_type = "GITHUB_ACCESS_TOKEN"
  access_token    = oci_vault_secret.github_access_token.id
  display_name    = "GitHub Connection"
}

# Build Pipeline
resource "oci_devops_build_pipeline" "cms" {
  project_id   = oci_devops_project.cms.id
  display_name = "${var.project_name}-build"
  description  = "Build and push CMS container image"

  build_pipeline_parameters {
    items {
      name          = "OCI_REGION"
      default_value = var.region
      description   = "OCI region"
    }
    items {
      name          = "OCI_NAMESPACE"
      default_value = data.oci_objectstorage_namespace.ns.namespace
      description   = "Object Storage namespace"
    }
    items {
      name          = "OCI_BUCKET_NAME"
      default_value = "${var.project_name}-frontend"
      description   = "Frontend Object Storage bucket"
    }
    items {
      name          = "OCI_COMPARTMENT_ID"
      default_value = var.compartment_id
      description   = "OCI compartment OCID"
    }
  }
}

# Build Stage
resource "oci_devops_build_pipeline_stage" "build" {
  build_pipeline_id = oci_devops_build_pipeline.cms.id
  display_name      = "Build and Push"
  description       = "Build frontend, upload to Object Storage, build and push Docker image"
  
  build_pipeline_stage_type = "BUILD"
  build_spec_file           = "infrastructure/oci-devops/build_spec.yaml"
  image                     = "OL8_X86_64_STANDARD_10"
  
  build_source_collection {
    items {
      connection_type = "DEVOPS_CODE_REPOSITORY"
      repository_id   = oci_devops_repository.cms.id
      repository_url  = oci_devops_repository.cms.http_url
      branch          = var.github_branch
      name            = "primary"
    }
  }
  
  build_pipeline_stage_predecessor_collection {
    items {
      id = oci_devops_build_pipeline.cms.id
    }
  }
}

# Deliver Artifact Stage
resource "oci_devops_build_pipeline_stage" "deliver" {
  build_pipeline_id = oci_devops_build_pipeline.cms.id
  display_name      = "Deliver Artifacts"
  description       = "Deliver Docker image to artifact registry"
  
  build_pipeline_stage_type = "DELIVER_ARTIFACT"
  
  deliver_artifact_collection {
    items {
      artifact_id   = oci_devops_deploy_artifact.docker_image.id
      artifact_name = "docker_image"
    }
  }
  
  build_pipeline_stage_predecessor_collection {
    items {
      id = oci_devops_build_pipeline_stage.build.id
    }
  }
}

# Trigger Deployment Stage
resource "oci_devops_build_pipeline_stage" "trigger_deploy" {
  build_pipeline_id = oci_devops_build_pipeline.cms.id
  display_name      = "Trigger Deployment"
  description       = "Trigger deployment pipeline"
  
  build_pipeline_stage_type      = "TRIGGER_DEPLOYMENT_PIPELINE"
  deploy_pipeline_id             = oci_devops_deploy_pipeline.cms.id
  is_pass_all_parameters_enabled = true
  
  build_pipeline_stage_predecessor_collection {
    items {
      id = oci_devops_build_pipeline_stage.deliver.id
    }
  }
}

# Deploy Artifact
resource "oci_devops_deploy_artifact" "docker_image" {
  project_id           = oci_devops_project.cms.id
  display_name         = "CMS Docker Image"
  deploy_artifact_type = "DOCKER_IMAGE"
  
  deploy_artifact_source {
    deploy_artifact_source_type = "OCIR"
    image_uri                   = "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${var.project_name}:$${DOCKER_IMAGE_TAG}"
  }
  
  argument_substitution_mode = "SUBSTITUTE_PLACEHOLDERS"
}

# Deployment Pipeline
resource "oci_devops_deploy_pipeline" "cms" {
  project_id   = oci_devops_project.cms.id
  display_name = "${var.project_name}-deploy"
  description  = "Deploy CMS to OCI Functions"
}

# Deploy Stage
resource "oci_devops_deploy_stage" "function" {
  deploy_pipeline_id = oci_devops_deploy_pipeline.cms.id
  display_name       = "Deploy to Functions"
  description        = "Update OCI Function with new image"
  
  deploy_stage_type               = "DEPLOY_FUNCTION"
  function_deploy_environment_id  = oci_devops_deploy_environment.function.id
  docker_image_deploy_artifact_id = oci_devops_deploy_artifact.docker_image.id
  
  deploy_stage_predecessor_collection {
    items {
      id = oci_devops_deploy_pipeline.cms.id
    }
  }
}

# Deploy Environment
resource "oci_devops_deploy_environment" "function" {
  project_id              = oci_devops_project.cms.id
  deploy_environment_type = "FUNCTION"
  display_name            = "CMS Function Environment"
  function_id             = oci_functions_function.cms.id
}

# Build Trigger
resource "oci_devops_trigger" "main_branch" {
  project_id     = oci_devops_project.cms.id
  display_name   = "Main Branch Push"
  description    = "Trigger build on push to main branch"
  trigger_source = "DEVOPS_CODE_REPOSITORY"
  repository_id  = oci_devops_repository.cms.id
  
  actions {
    type              = "TRIGGER_BUILD_PIPELINE"
    build_pipeline_id = oci_devops_build_pipeline.cms.id
    
    filter {
      trigger_source = "DEVOPS_CODE_REPOSITORY"
      events         = ["PUSH"]
      
      include {
        head_ref = "refs/heads/${var.github_branch}"
      }
    }
  }
}

# Dynamic Group for DevOps (Build and Deploy Pipelines)
resource "oci_identity_dynamic_group" "devops" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-devops-dg"
  description    = "Dynamic group for DevOps build and deploy pipelines"
  matching_rule  = "ANY {resource.type = 'devopsbuildpipeline', resource.type = 'devopsdeploypipeline', resource.compartment.id = '${var.compartment_id}'}"
}

# Policy for DevOps (with OCIR push access - no auth token needed)
resource "oci_identity_policy" "devops" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-devops-policy"
  description    = "Policy for DevOps pipelines with OCIR access"
  
  statements = [
    # DevOps resources
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage repos in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to read secret-family in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage devops-family in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage generic-artifacts in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to use ons-topics in compartment id ${var.compartment_id}",
    
    # Object Storage
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage buckets in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage objects in compartment id ${var.compartment_id}",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to read objectstorage-namespaces in compartment id ${var.compartment_id}",
    
    # Functions
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage functions-family in compartment id ${var.compartment_id}",
    
    # OCIR (Container Registry) - No auth token needed!
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage repos in tenancy",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to read repos in tenancy",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to use repos in tenancy",
  ]
}

# Outputs
output "bucket_name" {
  description = "Frontend bucket name"
  value       = oci_objectstorage_bucket.frontend.name
}

output "bucket_url" {
  description = "Frontend bucket URL"
  value       = "https://objectstorage.${var.region}.oraclecloud.com/n/${data.oci_objectstorage_namespace.ns.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o"
}

output "api_gateway_url" {
  description = "API Gateway endpoint"
  value       = oci_apigateway_gateway.cms.hostname
}

output "function_id" {
  description = "Function OCID"
  value       = oci_functions_function.cms.id
}

output "devops_project_id" {
  description = "DevOps Project OCID"
  value       = oci_devops_project.cms.id
}

output "container_registry_url" {
  description = "OCI Container Registry URL"
  value       = "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${var.project_name}"
}

output "namespace" {
  description = "Object Storage namespace (auto-detected)"
  value       = data.oci_objectstorage_namespace.ns.namespace
}
