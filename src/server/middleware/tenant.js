import { usePostgres } from '../../db/client.js';
import { tenantDb } from '../db/tenantScope.js';
import { ROLE_LIST } from '../roles.js';

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
      // Governance: enforce tenant-bound access by requiring a membership on the same tenant_id.
      const membership = await req
        .db('memberships')
        .select('id', 'user_id', 'tenant_id', 'role', 'created_at')
        .where({ user_id: req.user.id, tenant_id: req.tenant.id })
        .first();

      if (!membership || !ROLE_LIST.includes(membership.role) || (roles.length > 0 && !roles.includes(membership.role))) {
        if ((req.get('accept') || '').includes('text/html')) {
          return res.status(403).render('error', { title: 'Access denied', message: 'You do not have access to this tenant.', user: req.user });
        }
        return res.status(403).json({ error: 'forbidden' });
      }

      req.membership = membership;
      req.tenantDb = tenantDb(req.db, req.tenant.id);

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
