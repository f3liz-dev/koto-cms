variable "region" {
  description = "OCI region"
  type        = string
}

variable "compartment_id" {
  description = "OCI compartment OCID"
  type        = string
}

variable "namespace" {
  description = "Object Storage namespace"
  type        = string
}

variable "subnet_id" {
  description = "Subnet OCID for Functions"
  type        = string
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "koto-cms"
}

variable "github_bot_token" {
  description = "GitHub PAT for bot"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository (owner/repo)"
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

variable "function_image" {
  description = "Docker image for function. Defaults to <region>.ocir.io/<namespace>/<project_name>:latest"
  type        = string
  default     = ""
}

variable "github_access_token" {
  description = "GitHub personal access token for repository mirroring"
  type        = string
  sensitive   = true
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}
