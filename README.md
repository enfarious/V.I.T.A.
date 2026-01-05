# VITA Frontier

**Web2-first, Web3-ready** multi-tenant platform for tribe and alliance management.

> "VITA is life" - Freedom for everyone from no-code users to engineers who want full control.

## Documentation

| Guide | Audience |
|-------|----------|
| **[User Guide](docs/user-guide.md)** | Tribe members - joining, login, profiles |
| **[Tenant Portal](docs/tenant-portal.md)** | Tribe owners - modules, UI deployment |
| **[Admin Guide](docs/admin-guide.md)** | Platform admins - approvals, management |
| **[Developer Guide](docs/developer-guide.md)** | Developers - API integration, custom UIs |
| **[API Reference](docs/openapi.yaml)** | Full OpenAPI specification |

## Quick Start

### Requirements
- Node.js 20+
- PostgreSQL (or SQLite for dev)
- Discord OAuth app (for authentication)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Discord OAuth credentials

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Session encryption key |
| `DISCORD_CLIENT_ID` | Yes | Discord OAuth app ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth secret |
| `DATABASE_URL` | No | PostgreSQL URL (falls back to SQLite) |
| `PORT` | No | Server port (default: 5000) |

## Architecture

```
VITA Frontier
├── Spine (this repo)
│   ├── Authentication (Discord OAuth)
│   ├── Tenant Management (schema-per-tenant)
│   ├── Module System (plug-and-play features)
│   └── Asset Sync (deploy UIs from GitHub)
│
└── Frontends (BYO or use defaults)
    ├── Spine UI (EJS templates - built-in)
    └── Module UIs (React/Vue/etc - deployable)
```

### Key Concepts

- **Tenants** = Tribes/Alliances with isolated data
- **Modules** = Features installed per-tenant
- **Spine** = Core backend (auth, routing, orchestration)
- **BYO Frontend** = Optional custom UI via API

## Routes

### Spine Routes (EJS)
- `/` - Home
- `/auth/login` - Discord login
- `/me` - User profile
- `/tenants` - Browse tenants
- `/admin` - Platform admin dashboard
- `/t/:slug` - Tenant portal

### Module Routes (SPA)
- `/t/:slug/m/:moduleId/` - Module UI
- `/t/:slug/m/:moduleId/members` - API: members
- `/t/:slug/m/:moduleId/ranks` - API: ranks

### API Routes (JSON)
- `/api/health` - Health check
- `/api/me` - Current user
- `/api/tenants` - Tenant list

## Chain Integration

VITA Frontier is designed to bridge Web2 and Web3:

- **Current**: Mock adapter for development
- **Eve Frontier**: MUD framework on Pyrope (EVM L2)
- **Future**: Sui blockchain support

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## License

AGPL-3.0 - See [LICENSE](LICENSE)
