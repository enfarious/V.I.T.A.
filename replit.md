# VITA Frontier

## Overview
VITA Frontier is a Web2-first, Web3-ready multi-tenant application with a chain adapter boundary architecture. It provides user authentication, tenant management, and role-based access control.

## Project Architecture

### Tech Stack
- **Runtime**: Node.js 20 (ES Modules)
- **Framework**: Express 5.x
- **Database**: PostgreSQL (via Knex.js ORM) - falls back to SQLite if no DATABASE_URL
- **Templating**: EJS (for future frontend views)
- **Session**: express-session with secure cookies

### Directory Structure
```
src/
├── config.js          # Centralized configuration from env vars
├── core/
│   └── chain/         # Chain adapter abstraction (Web3 boundary)
├── db/
│   ├── client.js      # Knex database client setup
│   ├── migrate.js     # Migration runner
│   ├── migrations/    # Database migrations
│   └── seeds/         # Development seed data
└── server/
    ├── index.js       # Express app bootstrap
    ├── middleware/    # Auth, error handling, tenant resolution
    ├── public/        # Static assets (CSS)
    ├── routes/        # API route handlers
    └── views/         # EJS templates
```

### View Routes (HTML)
- `GET /` - Home page
- `GET /about` - About page with hosting matrix explaining trust boundaries
- `GET /auth/login` - Login page with Discord OAuth, magic link, and password options
- `GET /auth/register` - User registration
- `GET /auth/discord` - Discord OAuth flow
- `GET /me` - Current user profile
- `/tenants` - Tenant management
- `/t/:slug/*` - Tenant-scoped module routes

### API Routes (JSON)
All API routes are prefixed with `/api` and return JSON. CORS-enabled for BYO frontends.

- `GET /api/health` - Health check with version and chain adapter info
- `GET /api/me` - Current authenticated user with memberships
- `GET /api/tenants` - List user's tenants
- `POST /api/tenants` - Create new tenant
- `GET /api/tenants/:slug` - Get tenant details
- `GET /api/tenants/:slug/members` - List tenant members
- `DELETE /api/tenants/:slug` - Delete tenant (owner only, drops schema)
- `GET /api/chain/identity/:address` - Resolve chain identity
- `GET /api/chain/tribe/:tribeId` - Get tribe info from chain

See `docs/openapi.yaml` for full API specification.

### Authentication
**Discord OAuth Only** - Requires DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET
- OAuth state is stored in database (not session) for cross-origin compatibility
- Opens in popup window (auto-closes on completion) for better UX
- Sessions persist via PostgreSQL store (30-day cookies)
- Email/password and magic link authentication have been removed

### Custom Domain
- Production: `https://ef-vita.net`
- BASE_URL is set in production environment for correct OAuth callbacks

## Environment Variables

### Required
- `SESSION_SECRET` - Secure random string for session encryption (stored as Replit Secret)

### Automatically Set
- `PORT` - Server port (set to 5000 for Replit)
- `DATABASE_URL` - PostgreSQL connection string (provided by Replit)
- `NODE_ENV` - Environment mode (development/production)

### Optional
- `SESSION_COOKIE_SECURE` - Enable secure cookies (auto-enabled in production)
- `SUBDOMAIN_TENANCY` - Enable subdomain-based tenant resolution
- `DB_PATH` - SQLite database path (fallback if no DATABASE_URL)
- `DISCORD_CLIENT_ID` - Discord OAuth application client ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth application client secret
- `MAGIC_LINK_EXPIRY_MINUTES` - Magic link expiry time (default: 15 minutes)

## Development

### Running Locally
```bash
npm install
npm run dev
```

### Database Commands
```bash
npm run migrate  # Run migrations
npm run seed     # Seed development data
```

### Default Dev Credentials
- Email: admin@example.com
- Password: admin123

## Module System (Schema-per-Tenant)

VITA Frontier uses a plug-and-play module architecture. Modules provide tenant-scoped functionality with isolated database schemas.

### Architecture
```
src/modules/
├── index.js           # Module loader and exports
├── registry.js        # Module registration
├── migrator.js        # Schema-per-tenant migrations
└── basic_tribe_ui/    # Default tribe UI module
    ├── index.js       # Module config + routes
    └── migrations.js  # Module migrations
```

### How It Works
1. **Tenant creation** auto-installs default modules
2. Each tenant gets isolated schema: `tenant_<slug>`
3. Module migrations run per-tenant on install
4. Module routes are scoped: `/t/:slug/m/:moduleId/*`

### Module API Routes
- `GET /t/:slug` - List installed modules
- `POST /t/:slug/modules/:moduleId/install` - Install module (owner only)
- `GET /t/:slug/m/basic_tribe_ui/members` - Module members
- `GET /t/:slug/m/basic_tribe_ui/ranks` - Module ranks
- `GET /t/:slug/m/basic_tribe_ui/access-lists` - Access lists
- `GET /t/:slug/m/basic_tribe_ui/settings` - Tribe settings

### Adding New Modules
```javascript
// src/modules/my_module/index.js
export const moduleConfig = {
  id: 'my_module',
  name: 'My Module',
  version: '0.1.0',
  migrations: [...]
};

export function createRoutes() {
  const router = Router();
  // Define routes...
  return router;
}

// Register in src/modules/index.js
import { moduleConfig, createRoutes } from './my_module/index.js';
registerModule(moduleConfig.id, { ...moduleConfig, createRoutes });
```

### Pulling External Modules
Modules can be pulled from Git repos and registered:
1. Clone module to `src/modules/<module_id>/`
2. Register in `src/modules/index.js`
3. Restart spine - migrations run automatically

### Module UI Assets
Modules can serve static frontend assets:

**Structure:**
```
src/modules/basic_tribe_ui/
├── index.js           # Module config + routes
├── migrations.js      # DB migrations
└── public/            # Static assets (built frontend)
    ├── index.html     # Entry point
    ├── assets/        # JS, CSS, images
    └── ...
```

**URL Mapping:**
- `GET /t/:slug/m/basic_tribe_ui/` → serves `public/index.html`
- `GET /t/:slug/m/basic_tribe_ui/assets/*` → serves static assets
- `GET /t/:slug/m/basic_tribe_ui/members` → API endpoint (JSON)

**Build & Deploy Flow:**
1. Build frontend: `npm run build` (outputs to `dist/`)
2. Copy to module: `cp -r dist/* src/modules/basic_tribe_ui/public/`
3. Restart spine or push to git
4. Spine serves the new assets immediately

**For BYO Frontends:**
Frontend connects to spine API at `{SPINE_URL}/t/{slug}/m/basic_tribe_ui/*` with `credentials: 'include'` for session cookies.

### Tenant-Owned UI Deployment (Hot-Swap)
Tenant owners can deploy their own UI from a GitHub repo without spine restart:

**API Flow:**
1. Register source: `POST /t/:slug/modules/:moduleId/ui-source` with `{ repo_url, branch }`
2. Sync assets: `POST /t/:slug/modules/:moduleId/ui-sync`
3. Check status: `GET /t/:slug/modules/:moduleId/ui-source`

**Storage Structure:**
```
storage/tenants/<slug>/<module>/
├── index.html
└── assets/
```

**Requirements:**
- GitHub repo must contain built assets (dist/, public/, or build/ with index.html)
- Max 50MB per sync
- Owner role required

## Provisioning Gates

Tenant creation requires passing verification checks:

**Current Gates:**
1. `discord_verified` - Must have linked Discord account
2. `wallet_verified` - Must link and verify Eve Frontier wallet

**API:**
- `GET /api/provisioning/check` - Check current user's gate status
- `POST /api/tenants` - Fails with 403 if gates not passed

**Configuration:**
Gates are stored in `provisioning_gates` table and can be enabled/disabled per-deployment.

## Platform Admin & Tenant Approval

Tenant creation requires platform admin approval:

**Flow:**
1. User submits tenant request via `/tenants` (POST)
2. Request enters `tenant_requests` table with status `pending`
3. Platform admin reviews at `/admin` and approves/denies
4. On approval, tenant is created and requester becomes owner

**Platform Admin Flag:**
- `users.is_platform_admin` boolean column
- Platform admins can create tenants instantly (bypass approval)
- Set via SQL: `UPDATE users SET is_platform_admin = true WHERE id = <user_id>`

**API Endpoints:**
- `GET /api/tenant-requests` - List all requests (admin only)
- `GET /api/my-tenant-requests` - List user's own requests
- `POST /api/tenant-requests/:id/approve` - Approve request (admin only)
- `POST /api/tenant-requests/:id/deny` - Deny request (admin only)

**View Routes:**
- `GET /admin` - Platform admin dashboard
- `POST /admin/tenant-requests/:id/approve` - Form-based approval
- `POST /admin/tenant-requests/:id/deny` - Form-based denial

## Chain Adapter (Web3 Boundary)

VITA Frontier uses a chain adapter abstraction to bridge Web2 and Web3:

### Eve Frontier Chain Architecture
Eve Frontier runs on **Pyrope**, a modified Layer 2 EVM chain using the **MUD framework**:
- **MUD (Multi-User Dungeon)** - Framework for on-chain game state
- **Smart Object Framework (SOF)** - Abstraction layer for entities (Characters, Objects, Classes)
- **World API** - REST API for querying on-chain data (https://docs.evefrontier.com/SwaggerWorldApi)
- **Meta-transactions** - ERC-2771 pattern for gas-free gameplay

Key npm packages: `@eveworld/smart-object-framework`, `@eveworld/world`, `@latticexyz/world`

### Architecture
```
src/core/chain/
├── index.js           # Factory function and exports
├── ChainAdapter.js    # Base interface
├── MockChainAdapter.js # Development/testing adapter
└── EveFrontierAdapter.js # Eve Frontier MUD/Pyrope adapter (TODO)
```

### Adapter Interface
- `connect()` - Establish connection to chain
- `resolveIdentity(payload)` - Resolve wallet/address to canonical identity
- `getMembership(payload)` - Query tribe/corp membership
- `verifyBadge(payload)` - Verify badge ownership
- `getPublicProfile(payload)` - Fetch public profile data
- `getTribeInfo(tribeId)` - Get tribe/corp information

### Configuration
- `CHAIN_ADAPTER` - Adapter type: 'mock' (default) or 'evefrontier'
- `EVE_WORLD_API` - Eve Frontier World API endpoint
- `EVE_RPC_URL` - Pyrope RPC endpoint (optional, for direct chain calls)
- `EVE_WORLD_ADDRESS` - MUD World contract address

### Usage
```javascript
import { createChainAdapter } from './core/chain/index.js';

const chain = createChainAdapter(config.chain.adapter, config.chain.eve);
await chain.connect();
const identity = await chain.resolveIdentity({ address: '0x...' });
```

## Deployment Notes
- Server binds to `0.0.0.0:5000` for Replit compatibility
- Uses PostgreSQL in production via DATABASE_URL
- Session cookies are secure in production mode
- Trust proxy is enabled for proper client IP detection
