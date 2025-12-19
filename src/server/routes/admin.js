import { Router } from 'express';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';

const router = Router();
const wantsHTML = (req) => (req.get('accept') || '').includes('text/html');

router.use(requireAuth, requirePlatformAdmin);

router.get('/', async (req, res, next) => {
  try {
    const tenants = await req.db('tenants').select('*').orderBy('created_at', 'desc');
    const admins = await req.db('platform_admins').select('*').orderBy('created_at', 'desc');
    if (wantsHTML(req)) {
      return res.render('admin/index', { tenants, admins, user: req.user });
    }
    res.json({ ok: true, tenants, admins });
  } catch (err) {
    next(err);
  }
});

router.post('/tenants/:id/status', async (req, res, next) => {
  const tenantId = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ['active', 'disabled'];
  if (!tenantId || !allowed.includes(status)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  try {
    await req.db('tenants').where({ id: tenantId }).update({ status });
    if (wantsHTML(req)) {
      req.session.flash = `Tenant ${status}.`;
      return res.redirect('/admin');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
