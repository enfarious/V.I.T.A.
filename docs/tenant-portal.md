# Tenant Portal Guide

This guide is for **tribe owners** who manage their tribe (tenant) on VITA Frontier.

## Creating a Tribe

### Requesting a Tenant

1. Log in with Discord
2. Navigate to **Tenants** page
3. Fill out the creation form:
   - **Name** - Your tribe's display name
   - **Slug** - URL-friendly identifier (e.g., `my-tribe` for `/t/my-tribe`)
   - **Reason** - Brief description of your tribe
4. Submit the request

### Approval Process

- Platform admins review all tenant requests
- You'll see "pending" status while waiting
- Once approved, you become the **Owner** of your tribe
- Platform admins can create tenants instantly (no approval needed)

---

## The Tenant Portal

Access your tenant portal at `/t/{your-slug}` (e.g., `/t/vita`)

### Portal Features

As an owner, you can:
- View installed modules
- Install new modules
- Configure custom UI sources
- Sync frontend builds from GitHub
- Access tenant settings

---

## Managing Modules

Modules add features to your tribe. The default module is **Basic Tribe UI**.

### Installed Modules

The portal shows all installed modules with:
- Module name and version
- "Open UI" button to access the module's interface
- "Configure" button for settings

### Installing Modules

1. Scroll to "Available Modules" section
2. Click **Install** next to the module you want
3. The module's database schema is created for your tenant
4. The module is now available to your members

---

## Custom UI Deployment

You can deploy your own frontend from a GitHub repository!

### Prerequisites

Your GitHub repo must contain:
- Built frontend assets (not source code)
- An `index.html` file
- Located in one of: `dist/`, `build/`, `public/`, or `src/modules/{module}/public/`

### Setting Up UI Source

1. In the tenant portal, find the module under "Module UI Configuration"
2. Enter your GitHub repo URL (e.g., `https://github.com/you/your-frontend`)
3. Specify the branch (default: `main`)
4. Click **Set Source**

### Syncing Assets

After setting the source:
1. Click **Sync Now** to pull the latest build
2. The system downloads and extracts your repo
3. It finds the build directory automatically
4. Assets are deployed to `/t/{slug}/m/{module}/`

### How Sync Works

The sync process looks for built assets in this order:
1. `src/modules/{module}/public/` (unified module repos)
2. `modules/{module}/public/` (alternative module path)
3. `dist/` (Vite/webpack output)
4. `build/` (Create React App output)
5. `public/` (if it contains built assets)

**Important**: The directory must contain:
- `index.html`
- An `assets/` folder (for Vite builds) OR `.js` files

Source directories (with `src/*.tsx` files) are ignored.

### Checking Sync Status

The portal shows:
- **Source**: GitHub repo URL and branch
- **Status**: `active`, `pending`, `syncing`, or `error`
- **Last synced**: When assets were last updated

---

## Module UI Routing

Once deployed, your module UI is served at:
```
/t/{slug}/m/{module}/
```

### SPA Routing

If your frontend uses client-side routing (React Router, TanStack Router, etc.):
- All non-asset paths serve `index.html`
- Your router handles the paths client-side
- Configure your router with the correct `basepath`

Example for TanStack Router:
```typescript
export const router = createRouter({
  routeTree,
  basepath: "/t/vita/m/basic_tribe_ui"
});
```

### API Endpoints

Your frontend calls module API endpoints at:
```
/t/{slug}/m/{module}/members   // GET members
/t/{slug}/m/{module}/ranks     // GET ranks
/t/{slug}/m/{module}/settings  // GET/POST settings
/t/{slug}/m/{module}/me        // GET current user's membership
```

---

## Member Management

### Approving Join Requests

1. Open your module UI or use the API
2. View pending join requests
3. Approve or deny each request
4. Approved members are added with the default "Member" rank

### Managing Ranks

Create custom ranks for your tribe:
- Define rank names
- Set permissions
- Order ranks by hierarchy
- Assign ranks to members

---

## Best Practices

### Keep Builds Updated

- Set up CI/CD to build on push to main
- Run sync after each frontend deployment
- Test locally before pushing

### Monitor Sync Status

- Check for errors after syncing
- Review console logs if UI doesn't load
- Ensure your build output is correct

### Security

- Only owners can configure UI sources
- Use trusted GitHub repositories
- Don't expose sensitive data in frontend code
