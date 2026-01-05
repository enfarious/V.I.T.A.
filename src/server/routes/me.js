import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const memberships = await req
      .db('memberships')
      .join('tenants', 'memberships.tenant_id', 'tenants.id')
      .select(
        'memberships.role',
        'memberships.created_at',
        'tenants.id as tenant_id',
        'tenants.slug',
        'tenants.name',
        'tenants.status'
      )
      .where('memberships.user_id', req.user.id);

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.display_name
      },
      memberships
    });
  } catch (err) {
    next(err);
  }
});

export default router;
