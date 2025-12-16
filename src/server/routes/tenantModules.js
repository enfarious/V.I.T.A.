import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveTenant, requireTenant, requireMembership } from '../middleware/tenant.js';

const router = Router();

router.use('/:slug', resolveTenant(), requireTenant);

router.get('/:slug', requireAuth, requireMembership(), async (req, res, next) => {
  try {
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

router.get('/:slug/:module', requireAuth, requireMembership(), (req, res) => {
  res.json({
    ok: true,
    tenant: req.tenant,
    membership: req.membership || null,
    module: req.params.module,
    status: 'placeholder'
  });
});

export default router;
