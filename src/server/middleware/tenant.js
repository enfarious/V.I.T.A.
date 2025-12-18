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
      const membership = await loadMembershipWithRoles(req.db, req.user.id, req.tenant.id);
      const allowedRoles = (Array.isArray(roles) ? roles : [roles]).filter(Boolean);
      const hasRequiredRole =
        allowedRoles.length === 0 ||
        membership?.roles?.some((r) => allowedRoles.includes(r)) ||
        (membership?.role && allowedRoles.includes(membership.role));

      if (
        !membership ||
        membership.status !== 'active' ||
        (!ROLE_LIST.includes(membership.role) && (membership.roles || []).length === 0) ||
        !hasRequiredRole
      ) {
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

export async function loadMembershipWithRoles(db, userId, tenantId) {
  if (!userId || !tenantId) return null;
  const membership = await db('memberships')
    .select('id', 'user_id', 'tenant_id', 'role', 'status', 'created_at')
    .where({ user_id: userId, tenant_id: tenantId })
    .first();
  if (!membership) return null;
  const roles = await db('tenant_member_roles')
    .join('tenant_roles', 'tenant_member_roles.tenant_role_id', 'tenant_roles.id')
    .select('tenant_roles.slug', 'tenant_roles.name', 'tenant_roles.priority')
    .where('tenant_member_roles.tenant_membership_id', membership.id)
    .orderBy('tenant_roles.priority', 'desc');
  membership.roles = roles.map((r) => r.slug);
  membership.role = membership.roles[0] || membership.role; // primary role hint for legacy fields/UI
  return membership;
}
