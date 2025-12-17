import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveTenant, requireTenant, requireMembership } from '../middleware/tenant.js';
import { tenantDb } from '../db/tenantScope.js';

const router = Router();

router.use('/:slug', resolveTenant(), requireTenant);

router.get('/:slug', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    // Tenant-scoped access must use the tenantDb helper to ensure tenant_id predicates.
    req.tenantDb = tenantDb(req.db, req.tenant.id);
    res.json({
      ok: true,
      tenant: req.tenant,
      membership: req.membership || null,
      message: 'Tenant dashboard placeholder.'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/_debug/tenant', requireAuth, requireMembership(), (req, res) => {
  req.tenantDb = tenantDb(req.db, req.tenant.id);
  res.json({
    ok: true,
    tenant: { id: req.tenant.id, slug: req.tenant.slug },
    user: { id: req.user.id, email: req.user.email },
    membership: { role: req.membership.role }
  });
});

// Example tenant-scoped query route: always use tenantDb table() or where().
router.get('/:slug/_debug/memberships', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    const tdb = tenantDb(req.db, req.tenant.id);
    const memberships = await tdb
      .table('memberships')
      .select('id', 'user_id', 'tenant_id', 'role', 'created_at');
    res.json({ ok: true, memberships });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/:module', requireAuth, requireMembership(), (req, res) => {
  tenantDb(req.db, req.tenant.id); // enforce tenant-scoped queries if any are added here
  res.json({
    ok: true,
    tenant: req.tenant,
    membership: req.membership || null,
    module: req.params.module,
    status: 'placeholder'
  });
});

export default router;
