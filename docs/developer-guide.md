# Developer Guide

This guide is for developers building custom frontends or integrating with VITA Frontier.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Your Frontend                     │
│              (React, Vue, Svelte, etc.)             │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP API
┌─────────────────────▼───────────────────────────────┐
│                  VITA Spine                          │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │    Auth     │ │   Tenants   │ │   Modules    │  │
│  │  (Discord)  │ │  (Schemas)  │ │  (Features)  │  │
│  └─────────────┘ └─────────────┘ └──────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              PostgreSQL Database                     │
│         (Public schema + tenant schemas)            │
└─────────────────────────────────────────────────────┘
```

---

## Authentication

### Session-Based Auth

VITA uses session cookies, not JWT tokens:

```javascript
// All API calls should include credentials
fetch('/api/me', {
  credentials: 'include'  // Required for session cookie
})
```

### Login Flow

1. Redirect/popup to `/auth/discord`
2. User authorizes with Discord
3. Callback creates session, sets cookie
4. All subsequent requests use the cookie

### Checking Auth State

```javascript
const response = await fetch('/api/me', { credentials: 'include' });
if (response.ok) {
  const user = await response.json();
  // { id, email, display_name, memberships: [...] }
} else {
  // Not authenticated
}
```

---

## API Reference

Base URL: Your spine domain (e.g., `https://your-spine.replit.app`)

### Core Endpoints

#### Health Check
```
GET /api/health
```
Response:
```json
{
  "ok": true,
  "version": "0.1.0",
  "adapter": "mock"
}
```

#### Current User
```
GET /api/me
```
Response:
```json
{
  "id": 1,
  "email": "user@example.com",
  "display_name": "User",
  "memberships": [
    { "tenant_id": 2, "slug": "vita", "role": "owner" }
  ]
}
```

#### List Tenants
```
GET /api/tenants
```

### Tenant-Scoped Endpoints

All tenant endpoints are prefixed with `/t/{slug}`:

#### Tenant Info
```
GET /t/{slug}
Accept: application/json
```
Response:
```json
{
  "tenant": { "id": 2, "name": "VITA", "slug": "vita" },
  "membership": { "role": "owner" },
  "modules": [
    { "id": "basic_tribe_ui", "name": "Basic Tribe UI", "installed": true }
  ]
}
```

### Module Endpoints

Module endpoints are at `/t/{slug}/m/{moduleId}`:

#### Members
```
GET /t/{slug}/m/basic_tribe_ui/members
```

#### Ranks
```
GET /t/{slug}/m/basic_tribe_ui/ranks
```

#### Settings
```
GET /t/{slug}/m/basic_tribe_ui/settings
POST /t/{slug}/m/basic_tribe_ui/settings
```

#### Current Membership
```
GET /t/{slug}/m/basic_tribe_ui/me
```
Response:
```json
{
  "tenant": { "id": 2, "name": "VITA", "slug": "vita" },
  "user": { "id": 1, "display_name": "User" },
  "membership": {
    "rank_name": "Owner",
    "role": "owner",
    "status": "active"
  }
}
```

#### Join Request
```
POST /t/{slug}/m/basic_tribe_ui/join
Content-Type: application/json

{
  "character_name": "MyCharacter",
  "wallet_address": "0x...",
  "note": "I'd like to join!"
}
```

---

## Building a Custom Frontend

### Project Setup

```bash
npm create vite@latest my-tribe-ui -- --template react-ts
cd my-tribe-ui
npm install @tanstack/react-query @tanstack/react-router
```

### Environment Configuration

```env
VITE_API_BASE_URL=https://your-spine.replit.app
```

### API Client

```typescript
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}
```

### React Query Example

```typescript
// src/hooks/useMembers.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export function useMembers(slug: string) {
  return useQuery({
    queryKey: ['members', slug],
    queryFn: () => apiFetch(`/t/${slug}/m/basic_tribe_ui/members`),
  });
}
```

### Router Configuration

For TanStack Router with dynamic basepath:

```typescript
// src/app.tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Detect basepath from URL
const basepath = window.location.pathname.match(
  /^(\/t\/[^/]+\/m\/[^/]+)/
)?.[1] || '/';

export const router = createRouter({
  routeTree,
  basepath,
});
```

---

## Deploying Your Frontend

### Build for Production

```bash
npm run build
```

Ensure your `vite.config.ts` has:
```typescript
export default defineConfig({
  base: './',  // Relative paths for assets
  // ...
});
```

### Deploy to Spine

1. Commit built assets to your repo (in `dist/`, `public/`, or `src/modules/{module}/public/`)
2. Push to GitHub
3. In tenant portal, set UI source to your repo
4. Click "Sync Now"

### Unified Module Format

For a complete module with UI + schema:

```
your-module/
├── modules/
│   └── your_module/
│       ├── schema.hcl      # Database schema
│       └── atlas.hcl       # Migration config
├── src/
│   └── modules/
│       └── your_module/
│           └── public/     # Built UI assets
│               ├── index.html
│               └── assets/
├── src/                    # Frontend source
├── package.json
└── vite.config.ts
```

---

## CORS and Cookies

### Cross-Origin Requests

The spine sets CORS headers automatically:
- `Access-Control-Allow-Origin`: Request origin
- `Access-Control-Allow-Credentials`: true
- `Access-Control-Allow-Methods`: GET, POST, PUT, DELETE, OPTIONS

### Cookie Requirements

For cookies to work cross-origin:
1. Use `credentials: 'include'` in fetch
2. Frontend must be on same domain OR
3. Use `SameSite=None; Secure` (HTTPS only)

---

## TypeScript Types

Generate types from OpenAPI:

```bash
npx openapi-typescript docs/openapi.yaml -o src/api/types.ts
```

---

## Testing

### Local Development

1. Run spine locally: `npm run dev` (port 5000)
2. Run frontend: `npm run dev` (port 5173)
3. Configure proxy in vite.config.ts:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/t': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
    },
  },
});
```

### Authentication in Dev

1. Set up Discord OAuth app with callback URL
2. Configure DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET
3. Login flow works same as production
