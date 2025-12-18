import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveTenant, requireTenant, requireMembership } from '../middleware/tenant.js';
import { tenantDb } from '../db/tenantScope.js';
import { normalizeSlug } from '../middleware/tenant.js';
import { evaluateAccess } from '../access/canAccess.js';

const router = Router();
const wantsHTML = (req) => (req.get('accept') || '').includes('text/html');
const ADMIN_ROLES = ['owner', 'admin'];

async function loadPageWithPolicy(db, tenantId, slug) {
  const page = await db('tenant_pages').where({ tenant_id: tenantId, slug }).first();
  if (!page) return null;
  const permissions = await db('tenant_page_permissions')
    .leftJoin('tenant_roles', 'tenant_page_permissions.tenant_role_id', 'tenant_roles.id')
    .select(
      'tenant_page_permissions.id',
      'tenant_page_permissions.permission_type',
      'tenant_page_permissions.user_id',
      'tenant_page_permissions.tenant_role_id',
      'tenant_roles.slug as role_slug'
    )
    .where({ 'tenant_page_permissions.page_id': page.id });
  const modules = await db('tenant_page_modules')
    .where({ tenant_id: tenantId, page_id: page.id, is_enabled: true })
    .orderBy('sort_order', 'asc');
  return { page, permissions, modules };
}

function buildSubject(req) {
  return {
    tenant_id: req.tenant?.id,
    user_id: req.user?.id,
    membership: req.membership
  };
}

router.use('/:slug', resolveTenant(), requireTenant);

router.get('/:slug', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    // Tenant-scoped access must use the tenantDb helper to ensure tenant_id predicates.
    req.tenantDb = tenantDb(req.db, req.tenant.id);
    if (wantsHTML(req)) {
      return res.render('tenant/dashboard', {
        tenant: req.tenant,
        membership: req.membership,
        user: req.user,
        currentTenant: req.tenant
      });
    }
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
    membership: { role: req.membership.role, roles: req.membership.roles || [] }
  });
});

// Example tenant-scoped query route: always use tenantDb table() or where().
router.get('/:slug/_debug/memberships', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    const memberships = await req
      .db('memberships as m')
      .leftJoin('tenant_member_roles as tmr', 'm.id', 'tmr.tenant_membership_id')
      .leftJoin('tenant_roles as tr', 'tmr.tenant_role_id', 'tr.id')
      .select(
        'm.id',
        'm.user_id',
        'm.tenant_id',
        'm.role',
        'm.status',
        'm.created_at',
        'tr.slug as tenant_role'
      )
      .where('m.tenant_id', req.tenant.id);
    res.json({ ok: true, memberships });
  } catch (err) {
    next(err);
  }
});

// Roles CRUD
router.get('/:slug/roles', requireAuth, requireMembership(ADMIN_ROLES), async (req, res, next) => {
  try {
    const roles = await req
      .db('tenant_roles')
      .where({ tenant_id: req.tenant.id })
      .orderBy('priority', 'desc');
    res.json({ ok: true, roles });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/roles', requireAuth, requireMembership(ADMIN_ROLES), async (req, res, next) => {
  const { name, slug, color, priority } = req.body || {};
  const roleSlug = normalizeSlug(slug || name || '');
  if (!roleSlug || !name) {
    return res.status(400).json({ error: 'invalid_role_payload' });
  }
  try {
    const existing = await req.db('tenant_roles').where({ tenant_id: req.tenant.id, slug: roleSlug }).first();
    if (existing) {
      return res.status(409).json({ error: 'role_exists' });
    }
    const insertQuery = req.db('tenant_roles').insert({
      tenant_id: req.tenant.id,
      slug: roleSlug,
      name,
      color: color || null,
      priority: priority ?? 0
    });
    const inserted = insertQuery.returning ? await insertQuery.returning(['id']) : await insertQuery;
    const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    res.status(201).json({ ok: true, role: { id, slug: roleSlug, name, color, priority: priority ?? 0 } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:slug/roles/:roleId/assign',
  requireAuth,
  requireMembership(ADMIN_ROLES),
  async (req, res, next) => {
    const { user_id } = req.body || {};
    const roleId = Number(req.params.roleId);
    if (!user_id || Number.isNaN(roleId)) {
      return res.status(400).json({ error: 'invalid_assign_payload' });
    }
    try {
      const membership = await req
        .db('memberships')
        .where({ tenant_id: req.tenant.id, user_id })
        .first();
      if (!membership) {
        return res.status(404).json({ error: 'membership_not_found' });
      }
      const role = await req.db('tenant_roles').where({ tenant_id: req.tenant.id, id: roleId }).first();
      if (!role) {
        return res.status(404).json({ error: 'role_not_found' });
      }
      const existing = await req
        .db('tenant_member_roles')
        .where({
          tenant_id: req.tenant.id,
          tenant_membership_id: membership.id,
          tenant_role_id: roleId
        })
        .first();
      if (!existing) {
        await req.db('tenant_member_roles').insert({
          tenant_id: req.tenant.id,
          tenant_membership_id: membership.id,
          tenant_role_id: roleId,
          granted_by_user_id: req.user.id
        });
        await req.db('memberships').where({ id: membership.id }).update({ role: role.slug });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/roles/:roleId/unassign',
  requireAuth,
  requireMembership(ADMIN_ROLES),
  async (req, res, next) => {
    const { user_id } = req.body || {};
    const roleId = Number(req.params.roleId);
    if (!user_id || Number.isNaN(roleId)) {
      return res.status(400).json({ error: 'invalid_assign_payload' });
    }
    try {
      const membership = await req
        .db('memberships')
        .where({ tenant_id: req.tenant.id, user_id })
        .first();
      if (!membership) {
        return res.status(404).json({ error: 'membership_not_found' });
      }
      await req
        .db('tenant_member_roles')
        .where({
          tenant_id: req.tenant.id,
          tenant_membership_id: membership.id,
          tenant_role_id: roleId
        })
        .del();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Pages CRUD
router.get('/:slug/pages', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    const pages = await req.db('tenant_pages').where({ tenant_id: req.tenant.id }).orderBy('sort_order', 'asc');
    if (wantsHTML(req)) {
      return res.render('tenant/pages', {
        tenant: req.tenant,
        membership: req.membership,
        pages,
        user: req.user,
        currentTenant: req.tenant
      });
    } else {
      const pageIds = pages.map((p) => p.id);
      const perms = await req
        .db('tenant_page_permissions')
        .whereIn('page_id', pageIds.length ? pageIds : [-1]);
      return res.json({
        ok: true,
        pages: pages.map((p) => ({
          ...p,
          permissions: perms.filter((pr) => pr.page_id === p.id)
        }))
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/pages', requireAuth, requireMembership(ADMIN_ROLES), async (req, res, next) => {
  const { title, slug, description, visibility = 'public', sort_order = 0, is_enabled = true } = req.body || {};
  const pageSlug = normalizeSlug(slug || title || '');
  if (!pageSlug || !title) {
    return res.status(400).json({ error: 'invalid_page_payload' });
  }
  if (!['public', 'member', 'role', 'custom'].includes(visibility)) {
    return res.status(400).json({ error: 'invalid_visibility' });
  }
  try {
    const existing = await req.db('tenant_pages').where({ tenant_id: req.tenant.id, slug: pageSlug }).first();
    if (existing) {
      return res.status(409).json({ error: 'page_exists' });
    }
    const insertQuery = req.db('tenant_pages').insert({
      tenant_id: req.tenant.id,
      title,
      slug: pageSlug,
      description: description || null,
      visibility,
      sort_order,
      is_enabled
    });
    const inserted = insertQuery.returning ? await insertQuery.returning(['id']) : await insertQuery;
    const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    res.status(201).json({ ok: true, page: { id, title, slug: pageSlug, visibility, sort_order, is_enabled } });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:slug/pages/:pageId',
  requireAuth,
  requireMembership(ADMIN_ROLES),
  async (req, res, next) => {
    const pageId = Number(req.params.pageId);
    if (Number.isNaN(pageId)) {
      return res.status(400).json({ error: 'invalid_page_id' });
    }
    const allowedVisibilities = ['public', 'member', 'role', 'custom'];
    const updates = {};
    if (req.body.title) updates.title = req.body.title;
    if (req.body.slug) updates.slug = normalizeSlug(req.body.slug);
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.visibility && allowedVisibilities.includes(req.body.visibility)) updates.visibility = req.body.visibility;
    if (req.body.sort_order !== undefined) updates.sort_order = req.body.sort_order;
    if (req.body.is_enabled !== undefined) updates.is_enabled = !!req.body.is_enabled;
    updates.updated_at = new Date();
    try {
      const existing = await req.db('tenant_pages').where({ id: pageId, tenant_id: req.tenant.id }).first();
      if (!existing) {
        return res.status(404).json({ error: 'page_not_found' });
      }
      if (updates.slug) {
        const slugClash = await req
          .db('tenant_pages')
          .where({ tenant_id: req.tenant.id, slug: updates.slug })
          .andWhereNot({ id: pageId })
          .first();
        if (slugClash) return res.status(409).json({ error: 'page_exists' });
      }
      await req.db('tenant_pages').where({ id: pageId }).update(updates);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Module placement CRUD
router.get(
  '/:slug/pages/:pageId/modules',
  requireAuth,
  requireMembership(),
  async (req, res, next) => {
    const pageId = Number(req.params.pageId);
    if (Number.isNaN(pageId)) return res.status(400).json({ error: 'invalid_page_id' });
    try {
      const page = await req.db('tenant_pages').where({ id: pageId, tenant_id: req.tenant.id }).first();
      if (!page) return res.status(404).json({ error: 'page_not_found' });
      const modules = await req
        .db('tenant_page_modules')
        .where({ tenant_id: req.tenant.id, page_id: pageId })
        .orderBy('sort_order', 'asc');
      res.json({ ok: true, modules });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/pages/:pageId/modules',
  requireAuth,
  requireMembership(ADMIN_ROLES),
  async (req, res, next) => {
    const pageId = Number(req.params.pageId);
    const { type_key, title, config_json = {}, sort_order = 0, is_enabled = true } = req.body || {};
    if (!type_key) return res.status(400).json({ error: 'invalid_module_payload' });
    try {
      const page = await req.db('tenant_pages').where({ id: pageId, tenant_id: req.tenant.id }).first();
      if (!page) return res.status(404).json({ error: 'page_not_found' });
      const insertQuery = req.db('tenant_page_modules').insert({
        tenant_id: req.tenant.id,
        page_id: pageId,
        type_key,
        title: title || null,
        config_json: JSON.stringify(config_json),
        sort_order,
        is_enabled
      });
      const inserted = insertQuery.returning ? await insertQuery.returning(['id']) : await insertQuery;
      const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
      res.status(201).json({ ok: true, module: { id, type_key, title, sort_order, is_enabled } });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:slug/pages/:pageId/modules/:moduleId',
  requireAuth,
  requireMembership(ADMIN_ROLES),
  async (req, res, next) => {
    const pageId = Number(req.params.pageId);
    const moduleId = Number(req.params.moduleId);
    if (Number.isNaN(pageId) || Number.isNaN(moduleId)) return res.status(400).json({ error: 'invalid_module_id' });
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.sort_order !== undefined) updates.sort_order = req.body.sort_order;
    if (req.body.is_enabled !== undefined) updates.is_enabled = !!req.body.is_enabled;
    if (req.body.config_json !== undefined) updates.config_json = JSON.stringify(req.body.config_json);
    updates.updated_at = new Date();
    try {
      const module = await req
        .db('tenant_page_modules')
        .where({ id: moduleId, page_id: pageId, tenant_id: req.tenant.id })
        .first();
      if (!module) return res.status(404).json({ error: 'module_not_found' });
      await req.db('tenant_page_modules').where({ id: moduleId }).update(updates);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:slug/pages/:pageSlug', requireAuth, requireMembership(), async (req, res, next) => {
  try {
    const { pageSlug } = req.params;
    const data = await loadPageWithPolicy(req.db, req.tenant.id, pageSlug);
    if (!data) return res.status(404).render('error', { title: 'Not found', message: 'Page not found', user: req.user });

    const access = evaluateAccess(buildSubject(req), { tenant_id: req.tenant.id }, { visibility: data.page.visibility, permissions: data.permissions });
    if (!access.allowed) {
      if (wantsHTML(req)) {
        return res.status(403).render('error', { title: 'Access denied', message: 'You do not have access to this page.', user: req.user });
      }
      return res.status(403).json({ error: access.reason });
    }

    const modules = (data.modules || []).map((m) => ({
      ...m,
      config: safeParseJson(m.config_json)
    }));

    if (wantsHTML(req)) {
      return res.render('tenant/page', {
        tenant: req.tenant,
        membership: req.membership,
        page: data.page,
        modules,
        permissions: data.permissions,
        user: req.user,
        currentTenant: req.tenant
      });
    }

    res.json({
      ok: true,
      page: data.page,
      modules,
      permissions: data.permissions
    });
  } catch (err) {
    next(err);
  }
});

function safeParseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

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
