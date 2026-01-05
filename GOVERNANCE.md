# Governance

VITA Frontier is multi-tenant infrastructure. Governance keeps autonomy, safety, and exit rights intact.

## Principles
- Tenant sovereignty: data belongs to the tenant; exit and export must remain possible.
- Neutral spine: no tenant receives special code paths; features ship to all.
- Least privilege: roles grant only what is necessary; cross-tenant access is forbidden by default.
- Transparency: changes, incidents, and policies are documented in-repo and announced to tenants.
- Boring reliability beats novelty; operational stability is the priority.

## Roles and Authority
- **Owners**: ultimate decision for their tenant; can invite/remove members and set roles.
- **Admins**: manage memberships and configuration within their tenant; no cross-tenant authority.
- **Members**: operate within assigned tenant scope.
- **Core Maintainers**: steward shared spine, migrations, and release gates; cannot access tenant data without explicit, logged approval.
- **Auditors**: read-only access to logs/metrics when required by policy or contract.

## Decision-Making
- Technical changes follow the ADR/PR process with clear tradeoffs and rollback notes.
- Schema changes must include migrations, backfill/forward-compat plan, and tenant impact notes.
- Breaking changes require deprecation notice and grace periods; provide compatibility shims when feasible.
- Security fixes may bypass normal cadence but must be post-mortemed and backported.

## Data Ownership and Portability
- Tenants own their data; exports must be available without penalties.
- Hosting entitlements (when enabled) may limit resources, not features; expiry degrades to read-only plus export.
- No dark-pattern lock-in: no proprietary schemas, no withheld migrations.

## Access and Privacy
- Default deny for cross-tenant access; every tenant-scoped query must use `tenant_id`.
- Operational access to production data requires time-bound approval and audit logging.
- Secrets are environment-scoped; rotation is documented and automated when possible.

## Incident Response
- Define severity levels; page on Sev1/Sev2 affecting availability or data integrity.
- Contain first, communicate early to affected tenants, then remediate and document.
- Run post-incident reviews with action items and owners; track until closure.

## AI Oversight
- AI may surface anomalies and suggestions; it cannot execute irreversible actions or change policy.
- Human approval is required for any AI-proposed remediation.

## Dispute Resolution
- Tenant-level disputes are resolved by tenant owners.
- Platform-level disputes escalate to Core Maintainers; decisions and rationales are documented.

## Change Logging
- Maintain CHANGELOG or release notes per deployment.
- Governance updates are committed to `GOVERNANCE.md`; changes require review and explicit acknowledgment in release notes.
