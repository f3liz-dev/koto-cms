# Simplified Architecture

## Stack Overview

**Fully Serverless + OCI Native**

- ✅ No servers to manage
- ✅ Auto-scaling (including to zero)
- ✅ Pay only for what you use
- ✅ Single cloud provider
- ✅ Integrated CI/CD

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    OCI Cloud                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend:  Object Storage (static files)               │
│  Backend:   Functions (serverless Deno)                 │
│  Gateway:   API Gateway (HTTP routing)                  │
│  Registry:  Container Registry (Docker images)          │
│  IaC:       Resource Manager (infrastructure)           │
│  CI/CD:     DevOps (build + deploy pipelines)           │
│  Auth:      IAM Dynamic Group (no tokens)               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Deployment Flow

```
1. git push origin main
   ↓
2. OCI DevOps detects push
   ↓
3. Build Pipeline:
   - npm run build
   - Upload to Object Storage
   - docker build (Deno compiled binary)
   - Push to OCIR (IAM auth, no token)
   ↓
4. Deployment Pipeline:
   - Update Function with new image
   ↓
5. Done! ✓
```

## Cost Breakdown

| Service | Monthly Cost |
|---------|--------------|
| Object Storage (1 GB) | $0.03 |
| Functions (100K calls) | $2.00 |
| Provisioned Concurrency (2) | Free |
| API Gateway (100K req) | $0.35 |
| DevOps (100 min build) | $1.00 |
| Container Registry | Free tier |
| **Total** | **~$3-5** |

## One Command Deployment

```bash
cd infrastructure/resource-manager
./create-stack.sh
# Upload stack.zip to OCI Console
# Fill in variables → Apply
```

Then:
```bash
git push origin main
# Auto-deploys via OCI DevOps
```

## Features

- ✅ Automatic deployments on git push
- ✅ Frontend served from Object Storage
- ✅ Backend scales automatically (including to zero)
- ✅ Provisioned Concurrency (2 warm instances)
- ✅ No servers to patch or maintain
- ✅ Built-in monitoring and logs
- ✅ IAM-based authentication (no tokens)
- ✅ All in OCI Console
