import { usePostgres } from '../../db/client.js';

export function resolveTenant() {
  return async (req, res, next) => {
    const slug = req.params.slug || req.params.tenantSlug;
    if (!slug) return next();
    try {
      const tenant = await req.db('tenants').where({ slug }).first();
      if (tenant) {
        req.tenant = tenant;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireTenant(req, res, next) {
  if (!req.tenant) {
    return res.status(404).json({ error: 'tenant_not_found' });
  }
  next();
}

export function requireMembership(roles = []) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (!req.tenant) {
      return res.status(404).json({ error: 'tenant_not_found' });
    }

    try {
      const membership = await req
        .db('memberships')
        .select('id', 'user_id', 'tenant_id', 'role', 'created_at')
        .where({ user_id: req.user.id, tenant_id: req.tenant.id })
        .first();

      if (!membership) {
        return res.status(403).json({ error: 'forbidden' });
      }

      req.membership = membership;
      if (roles.length > 0 && !roles.includes(membership.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function normalizeSlug(input = '') {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
