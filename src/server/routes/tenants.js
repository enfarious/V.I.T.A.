import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { normalizeSlug } from '../middleware/tenant.js';
import { usePostgres } from '../../db/client.js';
import { ROLES, assertValidRole } from '../roles.js';
import { bootstrapTenant } from '../services/tenantBootstrap.js';

const router = Router();
const wantsHTML = (req) => (req.get('accept') || '').includes('text/html');

router.post('/', requireAuth, async (req, res, next) => {
  const { name, slug } = req.body || {};
  const slugValue = normalizeSlug(slug || name || '');
  if (!name || !slugValue) {
    if (wantsHTML(req)) {
      req.session.flash = 'Name is required.';
      return res.redirect('/tenants');
    }
    return res.status(400).json({ error: 'invalid_tenant_payload' });
  }

  try {
    const existing = await req.db('tenants').where({ slug: slugValue }).first();
    if (existing) {
      if (wantsHTML(req)) {
        req.session.flash = 'Tenant slug already exists.';
        return res.redirect('/tenants');
      }
      return res.status(409).json({ error: 'tenant_exists' });
    }

    const insertQuery = req
      .db('tenants')
      .insert({ name, slug: slugValue, status: 'trial', plan: 'free' });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const tenantId = Array.isArray(inserted)
      ? typeof inserted[0] === 'object'
        ? inserted[0].id
        : inserted[0]
      : inserted;

    const membershipInsertQuery = req.db('memberships').insert({
      user_id: req.user.id,
      tenant_id: tenantId,
      role: assertValidRole(ROLES.OWNER),
      status: 'active'
    });
    const membershipInserted = usePostgres ? await membershipInsertQuery.returning(['id']) : await membershipInsertQuery;
    const membershipId = Array.isArray(membershipInserted)
      ? typeof membershipInserted[0] === 'object'
        ? membershipInserted[0].id
        : membershipInserted[0]
      : membershipInserted;

    await bootstrapTenant({ db: req.db, tenantId, membershipId, actorUserId: req.user.id });

    // Governance enforcement: audit tenant creation with actor + tenant scope.
    await req.db('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: req.user.id,
      action: 'tenant_created',
      entity: 'tenant',
      entity_id: String(tenantId),
      meta_json: JSON.stringify({ slug: slugValue, name })
    });

    if (wantsHTML(req)) {
      req.session.flash = 'Tenant created.';
      return res.redirect(`/t/${slugValue}`);
    }

    res.status(201).json({
      tenant: { id: tenantId, name, slug: slugValue, status: 'trial', plan: 'free' },
      membership: { user_id: req.user.id, tenant_id: tenantId, role: ROLES.OWNER }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
