# Architecture Overview

Koto CMS on OCI Container Instances (ARM A1) - Simple, serverless-like deployment without the complexity.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
└────────┬────────────────────────────────────────────────────┘
         │
         ├─── Static Assets (HTML/JS/CSS) ──────────────────┐
         │                                                   │
         │                                              ┌────▼────┐
         │                                              │   OCI   │
         │                                              │ Object  │
         │                                              │ Storage │
         │                                              └─────────┘
         │
         └─── API Requests (/api, /auth, /miauth) ─────┐
                                                        │
                                                   ┌────▼────┐
                                                   │Container│
                                                   │Instance │
                                                   │(ARM64)  │
                                                   │Public IP│
                                                   └────┬────┘
                                                        │
                                                   ┌────▼────┐
                                                   │ GitHub  │
                                                   │   API   │
                                                   └─────────┘
```

## Components

### Container Instance (ARM A1)
- **Type:** OCI Container Instances
- **Architecture:** ARM64 (Ampere Altra)
- **Resources:** 1 OCPU, 2GB RAM (configurable)
- **Network:** Public IP on port 3000
- **Runtime:** Deno compiled binary
- **Cost:** FREE (within ARM A1 free tier)

### Object Storage
- **Purpose:** Frontend static assets
- **Access:** Public read
- **Content:** HTML, CSS, JavaScript, images
- **Cost:** ~$0.03/month

### OCI Vault
- **Purpose:** Secure secret storage
- **Secrets:** GitHub token, session secret
- **Access:** Resource Principal
- **Cost:** Included in free tier

### IAM
- **Dynamic Group:** Container Instance
- **Policies:** Read secrets from Vault
- **Authentication:** Resource Principal

## Data Flow

### User Authentication
```
1. User clicks "Login"
2. Browser → Container: GET /auth/login?handle=@user@instance
3. Container validates handle against allowlist
4. Container generates MiAuth session URL
5. Browser redirects to Misskey instance
6. User authorizes on Misskey
7. Misskey redirects to: Container /miauth/callback
8. Container verifies MiAuth session
9. Container issues signed JWT cookie
10. Browser stores cookie (HttpOnly, SameSite)
```

### Content Management
```
1. User edits document in browser
2. Browser → Container: PUT /api/file (with JWT cookie)
3. Container validates JWT
4. Container checks user in allowlist
5. Container → GitHub: Create/update file via API
6. GitHub creates commit (bot as author, user in trailer)
7. GitHub creates/updates PR
8. Container → Browser: Success response
```

### Static Asset Serving
```
1. Browser requests: /index.html
2. Browser → Object Storage: Direct HTTPS request
3. Object Storage returns file
4. Browser renders page
```

## Security Model

### Authentication
- **MiAuth:** Fediverse-based authentication
- **JWT:** Signed session tokens (HS256)
- **Allowlist:** Explicit user authorization

### Secrets
- **Storage:** OCI Vault (encrypted at rest)
- **Access:** Resource Principal (no credentials in code)
- **Rotation:** Supported via Vault

### Network
- **Container:** Public IP with security list
- **Object Storage:** Public read only
- **GitHub:** HTTPS API calls

### Container
- **User:** Non-root (uid 1000)
- **Image:** Minimal OracleLinux 9 slim
- **Binary:** Compiled Deno (no runtime)

## Deployment Model

### Infrastructure (Terraform)
```
terraform apply
  ↓
Creates:
  - Container Instance
  - Object Storage bucket
  - OCI Vault + secrets
  - Dynamic Group
  - IAM policies
```

### Application (Manual)
```
./deploy.sh
  ↓
1. Build frontend (npm run build)
2. Upload to Object Storage
3. Build ARM64 Docker image
4. Push to OCI Container Registry
5. Update Container Instance
```

## Scaling

### Vertical Scaling
```bash
# Update terraform.tfvars
container_cpus = 2
container_memory_gb = 4

# Apply
terraform apply
```

### Horizontal Scaling
- Not supported natively
- Would require Load Balancer + multiple containers
- Current design: Single container (sufficient for CMS use case)

## High Availability

### Container
- **Restart Policy:** ALWAYS
- **Health Checks:** HTTP /health every 30s
- **Auto-restart:** On failure

### Data
- **GitHub:** Source of truth (no local state)
- **Sessions:** Stateless JWT (no database)
- **Secrets:** OCI Vault (replicated)

### Recovery
- Container failure → Auto-restart
- Complete failure → Redeploy with Terraform

## Performance

### Response Times
- **Health check:** <10ms
- **API requests:** <50ms
- **Static assets:** <100ms (Object Storage)

### Throughput
- **Single container:** ~200 req/s
- **Typical CMS:** <10 req/s
- **Headroom:** 20x capacity

### Cold Starts
- **None** - Container is always running

## Cost Breakdown

### Monthly Costs
```
Container Instance:
  1 OCPU × 730 hours = FREE (ARM A1 free tier)
  2 GB RAM × 730 hours = FREE (ARM A1 free tier)

Object Storage:
  1 GB storage = $0.0255
  10,000 GET requests = $0.004

OCI Vault:
  2 secrets = FREE (included)

Total: ~$0.03/month
```

### Free Tier Limits
- **Compute:** 4 OCPUs + 24GB RAM (always free)
- **Storage:** 20 GB (always free)
- **Egress:** 10 TB/month (always free)

## Comparison with Alternatives

### vs OCI Functions
- **Pros:** No cold starts, simpler, cheaper
- **Cons:** No auto-scaling, manual deployment

### vs Kubernetes (OKE)
- **Pros:** Much simpler, much cheaper, no overhead
- **Cons:** No orchestration, single container

### vs VM (Compute)
- **Pros:** Faster deployment, container-native, cheaper
- **Cons:** Less control, container-only

## Monitoring

### Health Checks
- **Endpoint:** /health
- **Interval:** 30 seconds
- **Timeout:** 10 seconds
- **Threshold:** 3 failures

### Logs
- **Location:** OCI Logging service
- **Retention:** Configurable
- **Access:** OCI CLI or Console

### Metrics
- **CPU utilization**
- **Memory utilization**
- **Network traffic**
- **Health check status**

## Disaster Recovery

### Backup
- **Code:** GitHub repository
- **Infrastructure:** Terraform state
- **Secrets:** OCI Vault (replicated)

### Recovery
```bash
# Complete rebuild
cd infrastructure
terraform apply
./deploy.sh <region> <namespace>
```

**RTO:** ~15 minutes  
**RPO:** 0 (no data loss, GitHub is source of truth)
