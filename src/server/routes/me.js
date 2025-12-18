import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loadMembershipWithRoles } from '../middleware/tenant.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const baseMemberships = await req
      .db('memberships')
      .join('tenants', 'memberships.tenant_id', 'tenants.id')
      .select(
        'memberships.role',
        'memberships.status',
        'memberships.created_at',
        'memberships.id as membership_id',
        'tenants.id as tenant_id',
        'tenants.slug',
        'tenants.name',
        'tenants.status'
      )
      .where('memberships.user_id', req.user.id);

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

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        wallet_address: req.user.wallet_address,
        display_name: req.user.display_name
      },
      memberships
    });
  } catch (err) {
    next(err);
  }
});

export default router;
