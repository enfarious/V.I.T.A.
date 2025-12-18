import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { tenantDb } from '../db/tenantScope.js';
import { loadMembershipWithRoles } from '../middleware/tenant.js';

const router = Router();

function wantsHTML(req) {
  return (req.get('accept') || '').includes('text/html');
}

router.get('/', async (req, res, next) => {
  if (!req.user) {
    return res.render('home', { tenants: [], memberships: [] });
  }
  try {
    const baseMemberships = await req
      .db('memberships')
      .join('tenants', 'memberships.tenant_id', 'tenants.id')
      .select(
        'tenants.id as tenant_id',
        'tenants.slug',
        'tenants.name',
        'memberships.role',
        'memberships.status',
        'memberships.id as membership_id',
        'memberships.created_at'
      )
      .where('memberships.user_id', req.user.id)
      .orderBy('memberships.created_at', 'desc');
    const memberships = [];
    for (const m of baseMemberships) {
      const enriched = await loadMembershipWithRoles(req.db, req.user.id, m.tenant_id);
      memberships.push({
        ...m,
        roles: enriched?.roles || [],
        role: enriched?.role || m.role,
        status: enriched?.status || m.status
      });
    }
    res.render('home', { memberships });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/login', (req, res) => {
  res.render('auth/login');
});

router.get('/auth/register', (req, res) => {
  res.render('auth/register');
});

router.get('/tenants', requireAuth, async (req, res, next) => {
  try {
    const baseMemberships = await req
      .db('memberships')
      .join('tenants', 'memberships.tenant_id', 'tenants.id')
      .select(
        'tenants.id as tenant_id',
        'tenants.slug',
        'tenants.name',
        'tenants.status',
        'tenants.plan',
        'memberships.role',
        'memberships.status',
        'memberships.id as membership_id'
      )
      .where('memberships.user_id', req.user.id)
      .orderBy('tenants.created_at', 'desc');
    const memberships = [];
    for (const m of baseMemberships) {
      const enriched = await loadMembershipWithRoles(req.db, req.user.id, m.tenant_id);
      memberships.push({
        ...m,
        roles: enriched?.roles || [],
        role: enriched?.role || m.role,
        status: enriched?.status || m.status
      });
    }
    res.render('tenants/index', { memberships });
  } catch (err) {
    next(err);
  }
});

router.get('/t/:slug', requireAuth, async (req, res, next) => {
  // let tenantModules handle auth/membership; just forward if HTML not requested here.
  if (!wantsHTML(req)) return next();
  return next(); // tenantModules route will render HTML for dashboard
});

export default router;
