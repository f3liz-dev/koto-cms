# IAM Setup

## Overview

This project uses **IAM Dynamic Groups + Policies** for authentication. No manual auth token management required.

## How It Works

```
Build Pipeline (Resource Principal)
       │
       │ Authenticated via Dynamic Group
       ▼
IAM Policy (Automatic)
       │
       │ Grants OCIR push access
       ▼
OCI Container Registry
```

## Automatic Configuration

Terraform/Resource Manager creates:

### Dynamic Group

**Name:** `f3liz-cms-devops-dg`

**Matching Rule:**
```
ALL {
  resource.type = 'devopsbuildpipeline',
  resource.compartment.id = '<your-compartment-id>'
}
```

### IAM Policy

**Name:** `f3liz-cms-devops-policy`

**Key Permissions:**
```hcl
# OCIR (no auth token needed)
Allow dynamic-group f3liz-cms-devops-dg to manage repos in tenancy
Allow dynamic-group f3liz-cms-devops-dg to read repos in tenancy
Allow dynamic-group f3liz-cms-devops-dg to use repos in tenancy

# Object Storage
Allow dynamic-group f3liz-cms-devops-dg to manage objects in compartment id <id> where target.bucket.name='f3liz-cms-frontend'

# Functions
Allow dynamic-group f3liz-cms-devops-dg to manage functions-family in compartment id <id>

# DevOps
Allow dynamic-group f3liz-cms-devops-dg to manage devops-family in compartment id <id>
```

## Usage in Build Pipeline

```yaml
# build_spec.yaml
- type: Command
  name: "Push to OCIR"
  command: |
    # No docker login needed!
    # Authentication happens automatically via IAM
    docker push <region>.ocir.io/namespace/image:tag
```

## Verification

```bash
# Check dynamic group
oci iam dynamic-group list --compartment-id <tenancy-ocid>

# Check policy
oci iam policy list --compartment-id <compartment-id>

# Test OCIR access
oci artifacts container image list \
  --compartment-id <compartment-id> \
  --auth resource_principal
```

## Troubleshooting

### "Permission denied" when pushing to OCIR

**Solution:** Verify policy exists and includes tenancy-level OCIR permissions

```bash
oci iam policy get --policy-id <policy-ocid>
```

### "Authentication failed"

**Solution:** Ensure build pipeline uses resource principal

```yaml
# Correct:
--auth resource_principal

# Incorrect:
--auth api_key
```

### "repos not found in tenancy"

**Solution:** OCIR policies must be at tenancy level, not compartment level

```hcl
# Correct:
Allow dynamic-group <name> to manage repos in tenancy

# Incorrect:
Allow dynamic-group <name> to manage repos in compartment id <id>
```

## Security Best Practices

1. **Least Privilege** - Grant only required permissions
2. **Audit Logging** - Enable OCI Audit for IAM changes
3. **Regular Review** - Review policies quarterly
4. **Compartment Isolation** - Separate dev/staging/prod

## References

- [OCI Dynamic Groups](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingdynamicgroups.htm)
- [Resource Principal Authentication](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdk_authentication_methods.htm#sdk_authentication_methods_resource_principal)
- [OCIR Authentication](https://docs.oracle.com/en-us/iaas/Content/Registry/Tasks/registrypushingimagesusingthedockercli.htm)
