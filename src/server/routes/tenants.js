import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { normalizeSlug } from '../middleware/tenant.js';
import { usePostgres } from '../../db/client.js';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  const { name, slug } = req.body || {};
  const slugValue = normalizeSlug(slug || name || '');
  if (!name || !slugValue) {
    return res.status(400).json({ error: 'invalid_tenant_payload' });
  }

  try {
    const existing = await req.db('tenants').where({ slug: slugValue }).first();
    if (existing) {
      return res.status(409).json({ error: 'tenant_exists' });
    }

    const insertQuery = req.db('tenants').insert({ name, slug: slugValue, status: 'active' });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const tenantId = Array.isArray(inserted)
      ? typeof inserted[0] === 'object'
        ? inserted[0].id
        : inserted[0]
      : inserted;

    await req.db('memberships').insert({
      user_id: req.user.id,
      tenant_id: tenantId,
      role: 'owner'
    });

    await req.db('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: req.user.id,
      action: 'tenant_created',
      entity: 'tenant',
      entity_id: String(tenantId),
      meta_json: JSON.stringify({ slug: slugValue, name })
    });

    res.status(201).json({
      tenant: { id: tenantId, name, slug: slugValue, status: 'active' },
      membership: { user_id: req.user.id, tenant_id: tenantId, role: 'owner' }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
