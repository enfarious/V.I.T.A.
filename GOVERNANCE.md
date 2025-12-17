# Governance (Current State)

This document describes what the V.I.T.A. spine enforces today: boundaries, roles, and data responsibilities. It is intentionally direct and free of marketing language.

## Purpose
- Provide a path-based, multi-tenant backend for tribes/alliances.
- Enforce tenant isolation and authenticated membership checks.
- Host optional: the code is open; self-hosting is permitted. Stripe/chain logic is not included.

## Authority Layers
- **Platform (V.I.T.A. as host)**: may run the spine and disable hosting for operational/safety reasons. Does not gain silent access to tenant data; access must be explicit and logged.
- **Tenant (tribe/alliance)**: controls its own membership and data; operates only within its tenant boundary.

## Roles & Permissions (enforced by code)
- Roles are stored on `memberships.role` and validated against `owner`, `admin`, `member`.
- `requireMembership` gates tenant routes: user must have a membership matching `tenant_id`.
- `requireRole([...])` gates role-specific actions; invalid roles are rejected.
- **Owner**: created by default when a tenant is created. Intended to manage settings/roles; no API yet to demote/remove owners. Future role changes must not remove the last owner (TODO).
- **Admin**: intended to manage tenant-scoped data but not ownership/tenant deletion. No admin assignment flow exists yet.
- **Member**: standard tenant participant; access limited to routes that allow any membership.

## Data Ownership & Isolation
- Tenants own their data. Tables that are tenant-scoped must include `tenant_id`.
- Tenant isolation is enforced by middleware (`resolveTenant` + `requireTenant` + `requireMembership`) and tenant-scoped DB helper (`tenantDb`).
- Exports/forks: code is open; tenants can self-host to retrieve or migrate data. No UI guarantees yet.

## Auditing & Accountability
- `audit_log` records tenant-level events (currently tenant creation with actor/tenant scope). No sensitive data is logged by default.
- Purpose: accountability for actions affecting tenant state. Future events should include actor, tenant_id, action, entity, metadata.

## Moderation & Enforcement Boundaries
- Platform operators can disable hosting or refuse service for safety/legal reasons.
- Platform operators are not entitled to silent data access; any access must be explicit and auditable.
- No automated content moderation is present in code today.

## Fork & Exit Rights
- The spine is open-source; self-hosting is permitted.
- Hosted service is optional; tenants retain the right to export/fork by running their own instance.
