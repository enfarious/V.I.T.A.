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
- `SESSION_SECRET` (required) — session signing.
- `PORT` — default 3000.
- `DATABASE_URL` — Postgres URL; if absent, uses SQLite at `DB_PATH`.
- `DB_PATH` — SQLite file path (dev fallback).
- `SUBDOMAIN_TENANCY` — optional flag if subdomain routing is added later.
- `SESSION_COOKIE_SECURE` — `true` to require secure cookies.

## Tenant routing
- Default path-based: `/t/:tenantSlug/...`
- All tenant-scoped queries must use `tenant_id` (slug resolves to id).
- Middleware: `resolveTenant` attaches `req.tenant`; `requireTenant` 404s; `requireAuth` 401s; `requireMembership` enforces membership/role (403).

## Health
- `GET /health` → `{ ok: true, version, commit, timestamp }`

## Minimal API surface (spine)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`
- Tenants: `POST /tenants` (creates tenant; creator becomes owner), `GET /t/:slug` (placeholder dashboard)
- Placeholders: `GET /t/:slug/:module` for future modules.

## Notes
- No Stripe or chain integrations in this spine.
- Sessions are cookie-based with `httpOnly` and `SameSite=Lax`.
- Dev seed inserts demo tenant + owner user (`admin@example.com` / `admin123`) in non-production only.
