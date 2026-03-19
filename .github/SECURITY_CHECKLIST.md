# Pre-Deployment Security Checklist

Use this checklist before deploying to production.

## Secrets Management

- [ ] All secrets stored in OCI Vault (not environment variables)
- [ ] `SESSION_SECRET` is at least 32 characters of random data
- [ ] `SESSION_SECRET` is unique per environment (dev/staging/prod)
- [ ] GitHub PAT has minimal required scopes (repo, read:user only)
- [ ] GitHub PAT is for a dedicated bot account (not personal)
- [ ] No secrets committed to git (check with `git log -p | grep -i secret`)
- [ ] `.env` files are in `.gitignore`

## Infrastructure Security

- [ ] Terraform state stored in encrypted remote backend
- [ ] OCI Functions run with non-root user (UID 1000)
- [ ] API Gateway has rate limiting configured
- [ ] Container images scanned for vulnerabilities
- [ ] Dynamic groups use least-privilege IAM policies
- [ ] Object Storage bucket for frontend is public read-only
- [ ] VCN security lists restrict unnecessary ports
- [ ] Subnet is private (if possible) with NAT gateway

## Application Security

- [ ] `DOCUMENT_EDITORS` allowlist is up-to-date
- [ ] `MIAUTH_CALLBACK_URL` uses HTTPS (not HTTP)
- [ ] Session TTL is appropriate (default: 8 hours)
- [ ] `SESSION_TOKEN_VERSION` is set (for revocation capability)
- [ ] CORS is properly configured (if needed)
- [ ] Rate limiting is enabled (60 req/min general, 10 req/min auth)

## Monitoring & Logging

- [ ] OCI Monitoring enabled for Functions
- [ ] Alerts configured for:
  - [ ] Failed authentication attempts (>10/min)
  - [ ] Rate limit violations
  - [ ] Function errors (>5% error rate)
  - [ ] High latency (>2s p95)
- [ ] Logs are retained for at least 30 days
- [ ] Log aggregation configured (if multi-region)

## Network Security

- [ ] API Gateway uses HTTPS only
- [ ] TLS 1.2+ enforced (no TLS 1.0/1.1)
- [ ] Custom domain with valid SSL certificate (optional)
- [ ] DNS CAA records configured (optional)
- [ ] DDoS protection enabled (OCI WAF optional)

## Code Security

- [ ] Dependencies are up-to-date (`npm audit`, `deno cache --reload`)
- [ ] No known vulnerabilities in dependencies
- [ ] Security headers are enabled (X-Frame-Options, CSP, etc.)
- [ ] DOMPurify sanitization is enabled for preview
- [ ] Input validation on all API endpoints
- [ ] Path traversal protection enabled

## Access Control

- [ ] Allowlist contains only authorized editors
- [ ] GitHub bot account has 2FA enabled
- [ ] OCI user accounts have 2FA enabled
- [ ] API tokens are rotated regularly (every 90 days)
- [ ] Unused API tokens are revoked
- [ ] Principle of least privilege applied to all IAM policies

## Backup & Recovery

- [ ] GitHub repository has branch protection rules
- [ ] Terraform state has versioning enabled
- [ ] Disaster recovery plan documented
- [ ] Backup of allowlist and configuration
- [ ] Tested restore procedure

## Compliance

- [ ] Privacy policy updated (if collecting user data)
- [ ] Terms of service updated
- [ ] GDPR compliance reviewed (if EU users)
- [ ] Data retention policy defined
- [ ] Incident response plan documented

## Testing

- [ ] Security headers verified (`curl -I https://your-api`)
- [ ] Authentication flow tested end-to-end
- [ ] Authorization bypass attempts tested
- [ ] XSS prevention tested in preview
- [ ] CSRF protection tested
- [ ] Rate limiting tested
- [ ] Session revocation tested
- [ ] Error handling tested (no information disclosure)

## Documentation

- [ ] README.md is up-to-date
- [ ] SECURITY.md is complete
- [ ] Deployment guide is accurate
- [ ] Runbook for common issues
- [ ] Contact information for security issues

## Post-Deployment

- [ ] Verify all endpoints return correct security headers
- [ ] Test authentication flow in production
- [ ] Verify rate limiting is working
- [ ] Check logs for errors
- [ ] Monitor for unusual activity (first 24 hours)
- [ ] Schedule first security audit (30 days)

## Emergency Contacts

- Security Team: [Add email]
- On-Call Engineer: [Add contact]
- OCI Support: [Add ticket URL]
- GitHub Support: [Add ticket URL]

## Incident Response

If a security incident is detected:

1. **Immediate Actions**
   - Rotate `SESSION_SECRET` or increment `SESSION_TOKEN_VERSION`
   - Revoke compromised GitHub PAT
   - Review access logs for unauthorized access
   - Document timeline of events

2. **Investigation**
   - Identify scope of compromise
   - Check for data exfiltration
   - Review all commits in affected timeframe
   - Analyze logs for attack patterns

3. **Remediation**
   - Apply security patches
   - Update allowlist if needed
   - Strengthen affected controls
   - Test fixes in staging

4. **Communication**
   - Notify affected users (if applicable)
   - Update security documentation
   - Post-mortem analysis
   - Implement preventive measures

## Sign-Off

- [ ] Security review completed by: _________________ Date: _______
- [ ] Infrastructure review by: _________________ Date: _______
- [ ] Code review by: _________________ Date: _______
- [ ] Approved for production by: _________________ Date: _______

---

**Last Updated:** [Date]
**Next Review:** [Date + 90 days]
