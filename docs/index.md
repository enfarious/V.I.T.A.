# VITA Frontier Documentation

Welcome to VITA Frontier - a Web2-first, Web3-ready platform for tribe and alliance management.

## Choose Your Path

### For Tribe Members
**[User Guide](./user-guide.md)** - Join a tribe, login with Discord, manage your profile.

### For Tribe Owners
**[Tenant Portal Guide](./tenant-portal.md)** - Create and manage your tribe, install modules, deploy custom UIs.

### For Platform Admins
**[Admin Guide](./admin-guide.md)** - Approve tenant requests, manage the platform.

### For Developers
**[Developer Guide](./developer-guide.md)** - Build custom frontends, integrate with the API.

**[API Reference](./openapi.yaml)** - Full OpenAPI specification.

---

## Quick Overview

VITA Frontier uses a **tenant-per-tribe** model:

1. **Tenants** = Tribes/Alliances with their own isolated space
2. **Modules** = Features installed per-tenant (e.g., member management, rankings)
3. **Spine** = The core backend handling auth, tenants, and module orchestration
4. **BYO Frontend** = Optional custom UI that connects to the spine API

### Trust Boundaries

| Hosting Level | Who Controls | Trust Level |
|--------------|--------------|-------------|
| **Full SaaS** | Platform runs everything | Highest trust in platform |
| **Self-Hosted Spine** | You run the spine, we provide modules | Medium trust |
| **Fully Self-Hosted** | You run everything | Zero external trust |

---

## Key Concepts

### Discord Authentication
All users authenticate via Discord OAuth. This provides:
- Verified identity tied to Discord account
- Avatar and display name from Discord profile
- Secure session management (30-day cookies)

### Modules
Modules are plug-and-play features for tenants:
- **Basic Tribe UI** - Member management, ranks, access lists
- Modules have isolated database schemas per tenant
- Tenant owners can deploy custom module UIs from GitHub

### Tenant Portal
Each tenant has a management portal at `/t/{slug}` where owners can:
- View and install modules
- Configure custom UI sources
- Sync frontend builds from GitHub
- Manage tenant settings

---

## Getting Help

- Check the relevant guide for your role above
- Review the [API Reference](./openapi.yaml) for endpoint details
- Contact platform admins for account issues
