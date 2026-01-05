
# Architecture

## Design Philosophy

The system is intentionally divided:

- **Web2 layer**: humans, usability, iteration
- **Chain layer**: proof, ownership, transparency

These layers must never be tightly coupled.

---

## Core Rule: Adapters Only

All blockchain interaction passes through a **Chain Adapter**.

All hosting entitlement checks pass through an **Entitlement Provider**.

The core application must remain chain-agnostic and entitlement-agnostic.

---

## Multi-Tenancy

Multi-tenancy is a first-class feature.

- A **Tenant** is an organizational boundary (tribe/corp).
- Data is strictly isolated per tenant.
- Users can belong to multiple tenants with different roles.

Implementation expectations:
- Every tenant-scoped table includes `tenant_id`.
- Every request is scoped through tenant middleware.
- Cross-tenant access is forbidden by default.

---

## Hosted vs Self-Hosted

Self-host:
- Full control, full autonomy
- Same features

Hosted (optional):
- You pay for operational convenience (uptime, backups, maintenance)
- No proprietary feature gating
- Limits are resource-based only (storage/compute/users), not artificial scarcity

Non-negotiables for hosted:
- One-click export
- Read-only grace period on entitlement expiry
- No schema traps

---

## EVE: Frontier / Sui

EVE: Frontier operates on **Sui**.

This project will integrate via:
- read-heavy queries
- identity resolution
- proof verification

No chain logic is embedded directly in the core app.

---

## On-Chain Entitlements (Future)

When enabled, hosted tenancy may be represented on-chain as an entitlement object (or equivalent):

- tenant_id
- tier / limits
- expires_at

The server verifies entitlement via the Entitlement Provider (cached/indexed).
Expiration must degrade gracefully: read-only + export, not data hostage-taking.

---

## AI Oversight

AI systems may:
- audit logs
- flag anomalies
- propose actions

AI systems may **not**:
- execute irreversible actions
- bypass human approval
- modify governance rules

AI is an observer and advisor, not a ruler.

---

## Final Note

If this architecture feels boring, good.

Boring systems survive frontiers.

---

## Repo Audit (spine refactor)
- **Stack**: Node + Express (ESM), cookie sessions, Knex for Postgres or SQLite fallback.
- **Data**: Tenants, users, memberships, audit_log tables with migrations; dev seed inserts demo tenant + owner.
- **Routing**: Path-based tenancy (`/t/:slug`); middleware for tenant resolution, auth, membership/role enforcement.
- **APIs**: `/health`, auth register/login/logout, `/me`, `/tenants` (create), `/t/:slug` dashboard placeholder, `/t/:slug/:module` placeholders.
- **Security**: SESSION_SECRET required; httpOnly + SameSite=Lax cookies; centralized error + request logging; rate limit on auth endpoints.
- **DX**: `.env.example`, npm scripts for dev/start/migrate/seed/test placeholder, README with env + tenant routing notes.
