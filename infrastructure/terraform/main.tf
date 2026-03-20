terraform {
  required_version = ">= 1.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

provider "oci" {
  region = var.region
}

# Object Storage Bucket for Frontend
resource "oci_objectstorage_bucket" "frontend" {
  compartment_id = var.compartment_id
  namespace      = var.namespace
  name           = "${var.project_name}-frontend"
  access_type    = "ObjectRead"

  versioning = "Disabled"
}

# OCI Functions Application
resource "oci_functions_application" "cms" {
  compartment_id = var.compartment_id
  display_name   = "${var.project_name}-app"
  subnet_ids     = [var.subnet_id]

  # Simple environment variables (no Vault)
  config = {
    GITHUB_BOT_TOKEN    = var.github_bot_token
    GITHUB_REPO         = var.content_repo  # Content repository
    GITHUB_BRANCH       = var.github_branch
    SESSION_SECRET      = var.session_secret
    DOCUMENT_EDITORS    = var.document_editors
    MIAUTH_CALLBACK_URL = var.miauth_callback_url
    APP_NAME            = var.app_name
    FRONTEND_URL        = "https://objectstorage.${var.region}.oraclecloud.com/n/${data.oci_objectstorage_namespace.ns.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o"
  }
}

# API Gateway
resource "oci_apigateway_gateway" "cms" {
  compartment_id = var.compartment_id
  endpoint_type  = "PUBLIC"
  subnet_id      = var.subnet_id
  display_name   = "${var.project_name}-gateway"
}

resource "oci_apigateway_deployment" "cms" {
  compartment_id = var.compartment_id
  gateway_id     = oci_apigateway_gateway.cms.id
  path_prefix    = "/"
  display_name   = "${var.project_name}-deployment"

  specification {
    routes {
      path    = "/api/{path*}"
      methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    routes {
      path    = "/auth/{path*}"
      methods = ["GET", "POST", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    routes {
      path    = "/miauth/{path*}"
      methods = ["GET", "OPTIONS"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    routes {
      path    = "/health"
      methods = ["GET"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }

    routes {
      path    = "/{path*}"
      methods = ["GET"]
      backend {
        type        = "ORACLE_FUNCTIONS_BACKEND"
        function_id = oci_functions_function.cms.id
      }
    }
  }
}

resource "oci_functions_function" "cms" {
  application_id = oci_functions_application.cms.id
  display_name   = "${var.project_name}-function"
  image          = var.function_image
  memory_in_mbs  = 512
  timeout_in_seconds = 30
}
