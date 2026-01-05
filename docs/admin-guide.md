# Platform Admin Guide

This guide is for **platform administrators** who manage the VITA Frontier instance.

## Becoming a Platform Admin

Platform admin status is set via database flag:

```sql
UPDATE users SET is_platform_admin = true WHERE email = 'your@email.com';
```

Or by user ID:
```sql
UPDATE users SET is_platform_admin = true WHERE id = 1;
```

---

## Admin Dashboard

Access the admin dashboard at `/admin`

### Features

- View pending tenant requests
- Approve or deny requests
- See recent request history
- Quick stats on platform usage

---

## Tenant Request Approval

### Viewing Requests

The dashboard shows all pending requests with:
- Requester's name and Discord info
- Requested tenant name and slug
- Reason for creation
- Request date

### Approving a Request

1. Review the request details
2. Click **Approve**
3. Optionally add a note
4. The tenant is created automatically
5. The requester becomes the owner
6. Default modules are installed

### Denying a Request

1. Click **Deny** on the request
2. Add a reason (optional but recommended)
3. The request is marked as denied
4. The user can submit a new request later

---

## Direct Tenant Creation

As a platform admin, you can create tenants instantly:

1. Go to the **Tenants** page
2. Fill out the creation form
3. Submit - no approval needed
4. You become the owner

---

## API Endpoints for Admins

### List All Requests
```
GET /api/tenant-requests
```
Returns all pending requests (admin only).

### Approve Request
```
POST /api/tenant-requests/:id/approve
Body: { "note": "Welcome aboard!" }
```

### Deny Request
```
POST /api/tenant-requests/:id/deny
Body: { "note": "Please provide more details." }
```

---

## Database Management

### Session Store

Sessions are stored in PostgreSQL:
- Table: `session`
- Auto-created on startup
- 30-day expiry

### Tenant Schemas

Each tenant gets an isolated schema:
- Schema name: `tenant_{slug}` (with hyphens replaced by underscores)
- Contains module-specific tables
- Dropped when tenant is deleted

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | All platform users |
| `tenants` | Tenant records |
| `memberships` | User-to-tenant relationships |
| `tenant_requests` | Pending/processed requests |
| `tenant_module_assets` | UI source configuration |
| `session` | PostgreSQL session store |

---

## Monitoring

### Health Check
```
GET /api/health
```
Returns:
```json
{
  "ok": true,
  "version": "0.1.0",
  "adapter": "mock",
  "timestamp": "2026-01-05T..."
}
```

### Server Logs

Key log patterns:
- `VITA Frontier spine listening on...` - Server started
- `[Discord OAuth] Callback received` - Login attempts
- `[AssetSync] Found build at...` - UI sync activity
- `Module install error` - Module issues

---

## Troubleshooting

### User Can't Login

1. Check Discord OAuth is configured (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET)
2. Verify callback URL matches production domain
3. Check session table exists in database

### Tenant Schema Missing

If module features fail:
1. Check if schema exists: `SELECT schema_name FROM information_schema.schemata`
2. Re-install the module to trigger migration
3. Check console for migration errors

### Session Issues

If users keep getting logged out:
1. Verify PostgreSQL session store is connected
2. Check `session` table has records
3. Ensure SESSION_SECRET hasn't changed
