# OCI DevOps Resources

# DevOps Project
resource "oci_devops_project" "cms" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-devops"
  description    = "DevOps project for Koto"
  
  notification_config {
    topic_id = oci_ons_notification_topic.devops.id
  }
}

# Notification Topic for DevOps events
resource "oci_ons_notification_topic" "devops" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-devops-notifications"
}

# Code Repository (mirror from GitHub)
resource "oci_devops_repository" "cms" {
  name           = "${var.project_name}-repo"
  project_id     = oci_devops_project.cms.id
  repository_type = "MIRRORED"
  
  mirror_repository_config {
    connector_id    = oci_devops_connection.github.id
    repository_url  = "https://github.com/${var.github_repo}.git"
    trigger_schedule {
      schedule_type = "DEFAULT"
    }
  }
}

# GitHub Connection
resource "oci_devops_connection" "github" {
  project_id      = oci_devops_project.cms.id
  connection_type = "GITHUB_ACCESS_TOKEN"
  access_token    = var.github_access_token
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
      default_value = var.namespace
      description   = "Object Storage namespace"
    }
    items {
      name          = "OCI_BUCKET_NAME"
      default_value = oci_objectstorage_bucket.frontend.name
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
  
  build_spec_file = "infrastructure/oci-devops/build_spec.yaml"
  
  image = "OL8_X86_64_STANDARD_10"
  
  primary_code_repository {
    repository_id    = oci_devops_repository.cms.id
    repository_url   = oci_devops_repository.cms.http_url
    branch           = var.github_branch
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
  
  build_pipeline_stage_type = "TRIGGER_DEPLOYMENT_PIPELINE"
  
  deploy_pipeline_id = oci_devops_deploy_pipeline.cms.id
  is_pass_all_parameters_enabled = true
  
  build_pipeline_stage_predecessor_collection {
    items {
      id = oci_devops_build_pipeline_stage.deliver.id
    }
  }
}

# Deploy Artifact (Docker Image)
resource "oci_devops_deploy_artifact" "docker_image" {
  project_id                 = oci_devops_project.cms.id
  display_name               = "CMS Docker Image"
  deploy_artifact_type       = "DOCKER_IMAGE"
  
  deploy_artifact_source {
    deploy_artifact_source_type = "OCIR"
    image_uri                   = "${var.region}.ocir.io/${var.namespace}/${var.project_name}:$${DOCKER_IMAGE_TAG}"
  }
  
  argument_substitution_mode = "SUBSTITUTE_PLACEHOLDERS"
}

# Deployment Pipeline
resource "oci_devops_deploy_pipeline" "cms" {
  project_id   = oci_devops_project.cms.id
  display_name = "${var.project_name}-deploy"
  description  = "Deploy CMS to OCI Functions"
}

# Deploy Stage - Function
resource "oci_devops_deploy_stage" "function" {
  deploy_pipeline_id = oci_devops_deploy_pipeline.cms.id
  display_name       = "Deploy to Functions"
  description        = "Update OCI Function with new image"
  
  deploy_stage_type = "DEPLOY_FUNCTION"
  
  function_deploy_environment_id = oci_devops_deploy_environment.function.id
  docker_image_deploy_artifact_id = oci_devops_deploy_artifact.docker_image.id
  
  deploy_stage_predecessor_collection {
    items {
      id = oci_devops_deploy_pipeline.cms.id
    }
  }
}

# Deploy Environment - Function
resource "oci_devops_deploy_environment" "function" {
  project_id              = oci_devops_project.cms.id
  deploy_environment_type = "FUNCTION"
  display_name            = "CMS Function Environment"
  
  function_id = oci_functions_function.cms.id
}

# Build Trigger (on push to main)
resource "oci_devops_trigger" "main_branch" {
  project_id     = oci_devops_project.cms.id
  display_name   = "Main Branch Push"
  description    = "Trigger build on push to main branch"
  trigger_source = "DEVOPS_CODE_REPOSITORY"
  
  repository_id = oci_devops_repository.cms.id
  
  actions {
    type               = "TRIGGER_BUILD_PIPELINE"
    build_pipeline_id  = oci_devops_build_pipeline.cms.id
    
    filter {
      trigger_source = "DEVOPS_CODE_REPOSITORY"
      events         = ["PUSH"]
      
      include {
        head_ref = "refs/heads/${var.github_branch}"
      }
    }
  }
}

# Dynamic Group for DevOps (for resource principal auth)
resource "oci_identity_dynamic_group" "devops" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-devops-dg"
  description    = "Dynamic group for DevOps pipelines"
  
  matching_rule = "ALL {resource.type = 'devopsbuildpipeline', resource.compartment.id = '${var.compartment_id}'}"
}

# Policy for DevOps Dynamic Group (with OCIR access - no auth token needed)
resource "oci_identity_policy" "devops" {
  compartment_id = var.compartment_id
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
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage objects in compartment id ${var.compartment_id} where target.bucket.name='${oci_objectstorage_bucket.frontend.name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to read objectstorage-namespaces in compartment id ${var.compartment_id}",
    
    # Functions
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage functions-family in compartment id ${var.compartment_id}",
    
    # OCIR (Container Registry) - No auth token needed!
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to manage repos in tenancy",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to read repos in tenancy",
    "Allow dynamic-group ${oci_identity_dynamic_group.devops.name} to use repos in tenancy",
  ]
}
