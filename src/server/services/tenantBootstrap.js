import { usePostgres } from '../../db/client.js';

const DEFAULT_ROLES = [
  { slug: 'owner', name: 'Owner', priority: 100 },
  { slug: 'admin', name: 'Admin', priority: 80 },
  { slug: 'member', name: 'Member', priority: 50 }
];

const DEFAULT_MODULES = ['tribe_banner', 'media_carousel', 'activity_feed', 'message_of_cycle', 'galaxy_window'];

/**
 * Idempotently create baseline roles, pages, modules, and theme for a tenant.
 * Also ensures the given membership is granted the owner role.
 */
export async function bootstrapTenant({ db, tenantId, membershipId, actorUserId }) {
  if (!tenantId) throw new Error('tenantId is required for bootstrapTenant');

  const isPg = usePostgres;

  // Roles
  const roleIds = {};
  for (const role of DEFAULT_ROLES) {
    const existing = await db('tenant_roles').where({ tenant_id: tenantId, slug: role.slug }).first();
    if (existing) {
      roleIds[role.slug] = existing.id;
      continue;
    }
    const insertQuery = db('tenant_roles').insert({
      tenant_id: tenantId,
      slug: role.slug,
      name: role.name,
      priority: role.priority
    });
    const inserted = isPg ? await insertQuery.returning(['id']) : await insertQuery;
    const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    roleIds[role.slug] = id;
  }

  // Theme
  const theme = await db('tenant_themes').where({ tenant_id: tenantId }).first();
  if (!theme) {
    await db('tenant_themes').insert({
      tenant_id: tenantId,
      theme_key: 'ef_default',
      settings_json: isPg ? db.raw("'{}'::jsonb") : '{}'
    });
  }

  // Pages (Home, Member Deck, Admin)
  async function ensurePage(slug, title, visibility, sortOrder) {
    const existing = await db('tenant_pages').where({ tenant_id: tenantId, slug }).first();
    if (existing) return existing.id;
    const insertQuery = db('tenant_pages').insert({
      tenant_id: tenantId,
      slug,
      title,
      visibility,
      sort_order: sortOrder
    });
    const inserted = isPg ? await insertQuery.returning(['id']) : await insertQuery;
    return Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
  }

  const homeId = await ensurePage('home', 'Home', 'public', 1);
  const deckId = await ensurePage('member-deck', 'Member Deck', 'member', 2);
  const adminId = await ensurePage('admin', 'Admin', 'role', 3);

  // Admin page permissions: allow owner + admin
  if (adminId) {
    const allowOwner = await db('tenant_page_permissions')
      .where({ page_id: adminId, tenant_role_id: roleIds.owner, permission_type: 'allow_role' })
      .first();
    if (!allowOwner && roleIds.owner) {
      await db('tenant_page_permissions').insert({
        tenant_id: tenantId,
        page_id: adminId,
        tenant_role_id: roleIds.owner,
        permission_type: 'allow_role'
      });
    }
    const allowAdmin = await db('tenant_page_permissions')
      .where({ page_id: adminId, tenant_role_id: roleIds.admin, permission_type: 'allow_role' })
      .first();
    if (!allowAdmin && roleIds.admin) {
      await db('tenant_page_permissions').insert({
        tenant_id: tenantId,
        page_id: adminId,
        tenant_role_id: roleIds.admin,
        permission_type: 'allow_role'
      });
    }
  }

  // Home default modules
  if (homeId) {
    const existingModules = await db('tenant_page_modules')
      .where({ tenant_id: tenantId, page_id: homeId })
      .first();
    if (!existingModules) {
      for (let i = 0; i < DEFAULT_MODULES.length; i++) {
        await db('tenant_page_modules').insert({
          tenant_id: tenantId,
          page_id: homeId,
          type_key: DEFAULT_MODULES[i],
          sort_order: i,
          config_json: isPg ? db.raw("'{}'::jsonb") : '{}'
        });
      }
    }
  }

  // Grant owner role to creator membership
  if (membershipId && roleIds.owner) {
    const existingGrant = await db('tenant_member_roles')
      .where({ tenant_membership_id: membershipId, tenant_role_id: roleIds.owner })
      .first();
    if (!existingGrant) {
      await db('tenant_member_roles').insert({
        tenant_id: tenantId,
        tenant_membership_id: membershipId,
        tenant_role_id: roleIds.owner,
        granted_by_user_id: actorUserId || null
      });
    }
    await db('memberships').where({ id: membershipId }).update({ role: 'owner', status: 'active' });
  }

  return {
    roleIds,
    pageIds: { homeId, deckId, adminId }
  };
}
