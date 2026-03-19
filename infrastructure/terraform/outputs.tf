output "bucket_name" {
  description = "Frontend bucket name"
  value       = oci_objectstorage_bucket.frontend.name
}

output "bucket_url" {
  description = "Frontend bucket URL"
  value       = "https://objectstorage.${var.region}.oraclecloud.com/n/${var.namespace}/b/${oci_objectstorage_bucket.frontend.name}/o"
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

output "build_pipeline_id" {
  description = "Build Pipeline OCID"
  value       = oci_devops_build_pipeline.cms.id
}

output "deploy_pipeline_id" {
  description = "Deploy Pipeline OCID"
  value       = oci_devops_deploy_pipeline.cms.id
}

output "container_registry_url" {
  description = "OCI Container Registry URL"
  value       = "${var.region}.ocir.io/${var.namespace}/${var.project_name}"
}
