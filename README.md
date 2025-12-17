# VITA Frontier Spine

Multi-tenant tribe/alliance management spine for V.I.T.A. Hosting-agnostic, path-based tenancy first.

## Quick start
- Requirements: Node.js (LTS), SQLite (default) or Postgres (via `DATABASE_URL`).
- Copy `.env.example` to `.env` and set `SESSION_SECRET`.
- Install deps: `npm install`
- Run migrations: `npm run migrate`
- Seed demo (non-prod only): `npm run seed`
- Start dev server: `npm run dev` (defaults to http://localhost:3000)

## Environment
- `HOST` - interface binding, default `0.0.0.0` (use `127.0.0.1` for local-only). `BIND_ADDRESS` is also accepted.
- `SESSION_SECRET` (required) - session signing.
- `PORT` - default 3000.
- `DATABASE_URL` - Postgres URL; if absent, uses SQLite at `DB_PATH`.
- `DB_PATH` - SQLite file path (dev fallback).
- `SUBDOMAIN_TENANCY` - optional flag if subdomain routing is added later.
- `SESSION_COOKIE_SECURE` - `true` to require secure cookies.
- Tenant lifecycle fields: status (`trial` | `active` | `past_due` | `canceled`) and plan (string) are stored on tenants for future billing/entitlement checks.

## Tenant isolation rules
- Tenant resolution is path-based: `/t/:slug/...` attaches `req.tenant` via `resolveTenant` + `requireTenant`.
- Access is gated by `requireMembership`, which checks a membership for `tenant_id = req.tenant.id` and the current user.
- Tenant-scoped queries under `/t/:slug` must use the tenant-scoped helper (`tenantDb(req.db, req.tenant.id)`) to ensure `tenant_id` is always applied.
- Do not call raw `db` inside `/t/:slug` routes unless the SQL explicitly filters `tenant_id`; prefer `tenantDb.table('...')`.

## Writing tenant-scoped queries
- Import and construct: `const tdb = tenantDb(req.db, req.tenant.id);`
- Use `tdb.table('memberships').select(...);` — the helper injects `tenant_id = req.tenant.id`.
- For raw SQL, call `tdb.rawScoped(sql, params)`; it throws if `tenant_id` is missing from the SQL.
- Example in code: `src/server/routes/tenantModules.js` (`/_debug/memberships`) shows the expected pattern.

## Tenant routing
- Default path-based: `/t/:tenantSlug/...`
- All tenant-scoped queries must use `tenant_id` (slug resolves to id).
- Middleware: `resolveTenant` attaches `req.tenant`; `requireTenant` 404s; `requireAuth` 401s; `requireMembership` enforces membership/role (403).

## Health
- `GET /health` → `{ ok: true, version, commit, timestamp }`

## Minimal API surface (spine)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`
- Tenants: `POST /tenants` (creates tenant; creator becomes owner), `GET /t/:slug` (placeholder dashboard)
- Tenant debug: `GET /t/:slug/_debug/tenant` (canary for tenant scoping)
- Tenant membership debug: `GET /t/:slug/_debug/memberships` (example tenant-scoped query)
- Placeholders: `GET /t/:slug/:module` for future modules.

## Notes
- No Stripe or chain integrations in this spine.
- Sessions are cookie-based with `httpOnly` and `SameSite=Lax`.
- Dev seed inserts demo tenant + owner user (`admin@example.com` / `admin123`) in non-production only.
