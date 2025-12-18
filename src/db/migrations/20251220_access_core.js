/**
 * Access + pages/roles/module schema foundations.
 * Aligns with .codex/DB_SCHEMA_NOTES.md and ACCESS_CONTROL_SPEC.md
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const isPg = knex.client.config.client === 'pg';

  // memberships.status for lifecycle + bans
  const hasMembershipStatus = await knex.schema.hasColumn('memberships', 'status');
  if (!hasMembershipStatus) {
    await knex.schema.alterTable('memberships', (table) => {
      table.string('status').notNullable().defaultTo('active');
    });
    await knex('memberships').update({ status: 'active' });
  }

  // tenant_roles
  const hasTenantRoles = await knex.schema.hasTable('tenant_roles');
  if (!hasTenantRoles) {
    await knex.schema.createTable('tenant_roles', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('slug').notNullable();
      table.string('color');
      table.integer('priority');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'slug']);
      table.index(['tenant_id', 'priority']);
    });
  }

  // tenant_member_roles (many-to-many membership -> roles)
  const hasTenantMemberRoles = await knex.schema.hasTable('tenant_member_roles');
  if (!hasTenantMemberRoles) {
    await knex.schema.createTable('tenant_member_roles', (table) => {
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table
        .integer('tenant_membership_id')
        .unsigned()
        .references('id')
        .inTable('memberships')
        .onDelete('CASCADE');
      table
        .integer('tenant_role_id')
        .unsigned()
        .references('id')
        .inTable('tenant_roles')
        .onDelete('CASCADE');
      table.timestamp('granted_at').defaultTo(knex.fn.now());
      table
        .integer('granted_by_user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.primary(['tenant_membership_id', 'tenant_role_id']);
      table.index(['tenant_id']);
    });
  }

  // tenant_pages
  const hasTenantPages = await knex.schema.hasTable('tenant_pages');
  if (!hasTenantPages) {
    await knex.schema.createTable('tenant_pages', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table.string('title').notNullable();
      table.string('slug').notNullable();
      table.text('description');
      table.string('visibility').notNullable().defaultTo('public'); // public|member|role|custom
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('is_enabled').notNullable().defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'slug']);
      table.index(['tenant_id', 'visibility', 'is_enabled']);
    });
  }

  // tenant_page_permissions
  const hasTenantPagePerms = await knex.schema.hasTable('tenant_page_permissions');
  if (!hasTenantPagePerms) {
    await knex.schema.createTable('tenant_page_permissions', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table
        .integer('page_id')
        .unsigned()
        .references('id')
        .inTable('tenant_pages')
        .onDelete('CASCADE');
      table
        .integer('tenant_role_id')
        .unsigned()
        .references('id')
        .inTable('tenant_roles')
        .onDelete('CASCADE');
      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.string('permission_type').notNullable(); // allow_role, deny_role, allow_user, deny_user
      table.index(['page_id', 'permission_type']);
    });
  }

  // tenant_page_modules
  const hasTenantPageModules = await knex.schema.hasTable('tenant_page_modules');
  if (!hasTenantPageModules) {
    await knex.schema.createTable('tenant_page_modules', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table
        .integer('page_id')
        .unsigned()
        .references('id')
        .inTable('tenant_pages')
        .onDelete('CASCADE');
      table.string('type_key').notNullable();
      table.string('title');
      if (isPg) {
        table.jsonb('config_json');
        table.jsonb('layout_json');
      } else {
        table.text('config_json');
        table.text('layout_json');
      }
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('is_enabled').notNullable().defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'page_id', 'sort_order']);
    });
  }

  // tenant_themes
  const hasTenantThemes = await knex.schema.hasTable('tenant_themes');
  if (!hasTenantThemes) {
    await knex.schema.createTable('tenant_themes', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
        .unique();
      table.string('theme_key').notNullable().defaultTo('ef_default');
      if (isPg) {
        table.jsonb('settings_json');
      } else {
        table.text('settings_json');
      }
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // tenant_posts (manual feed v1)
  const hasTenantPosts = await knex.schema.hasTable('tenant_posts');
  if (!hasTenantPosts) {
    await knex.schema.createTable('tenant_posts', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table
        .integer('author_user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.string('visibility').notNullable().defaultTo('member'); // public|member|role|custom
      table.string('title');
      table.text('body');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'visibility', 'created_at']);
    });
  }

  // Bootstrap defaults for any existing tenants/memberships so the new tables are usable immediately.
  const tenants = await knex('tenants').select('id', 'slug', 'name');
  const roleCache = new Map(); // key: `${tenantId}:${slug}` -> roleId

  async function ensureRole(tenantId, slug, name, priority) {
    const key = `${tenantId}:${slug}`;
    if (roleCache.has(key)) return roleCache.get(key);
    const existing = await knex('tenant_roles').where({ tenant_id: tenantId, slug }).first();
    if (existing) {
      roleCache.set(key, existing.id);
      return existing.id;
    }
    const insertQuery = knex('tenant_roles').insert({
      tenant_id: tenantId,
      slug,
      name,
      priority
    });
    const inserted = isPg ? await insertQuery.returning(['id']) : await insertQuery;
    const roleId = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    roleCache.set(key, roleId);
    return roleId;
  }

  for (const tenant of tenants) {
    const ownerRoleId = await ensureRole(tenant.id, 'owner', 'Owner', 100);
    const adminRoleId = await ensureRole(tenant.id, 'admin', 'Admin', 80);
    const memberRoleId = await ensureRole(tenant.id, 'member', 'Member', 50);

    // Membership role mapping
    const memberships = await knex('memberships').where({ tenant_id: tenant.id });
    for (const m of memberships) {
      const roleSlug = m.role || 'member';
      const targetRoleId =
        roleSlug === 'owner' ? ownerRoleId : roleSlug === 'admin' ? adminRoleId : memberRoleId;
      const existing = await knex('tenant_member_roles')
        .where({ tenant_membership_id: m.id, tenant_role_id: targetRoleId })
        .first();
      if (!existing) {
        await knex('tenant_member_roles').insert({
          tenant_id: tenant.id,
          tenant_membership_id: m.id,
          tenant_role_id: targetRoleId
        });
      }
      if (!m.status) {
        await knex('memberships').where({ id: m.id }).update({ status: 'active' });
      }
    }

    // Theme default
    const theme = await knex('tenant_themes').where({ tenant_id: tenant.id }).first();
    if (!theme) {
      await knex('tenant_themes').insert({
        tenant_id: tenant.id,
        theme_key: 'ef_default',
        settings_json: isPg ? knex.raw("'{}'::jsonb") : '{}'
      });
    }

    // Default pages (idempotent)
    const pages = await knex('tenant_pages').where({ tenant_id: tenant.id });
    const pagesBySlug = new Set(pages.map((p) => p.slug));
    const pageIds = {};
    async function ensurePage(slug, title, visibility, sortOrder) {
      if (pagesBySlug.has(slug)) {
        const existing = pages.find((p) => p.slug === slug);
        pageIds[slug] = existing?.id;
        return existing?.id;
      }
      const insertQuery = knex('tenant_pages').insert({
        tenant_id: tenant.id,
        slug,
        title,
        visibility,
        sort_order: sortOrder
      });
      const inserted = isPg ? await insertQuery.returning(['id']) : await insertQuery;
      const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
      pagesBySlug.add(slug);
      pageIds[slug] = id;
      return id;
    }

    const homeId = await ensurePage('home', 'Home', 'public', 1);
    const deckId = await ensurePage('member-deck', 'Member Deck', 'member', 2);
    const adminId = await ensurePage('admin', 'Admin', 'role', 3);

    // Admin page permissions: allow owner + admin roles
    if (adminId) {
      const adminAllows = await knex('tenant_page_permissions')
        .where({ page_id: adminId, permission_type: 'allow_role' })
        .pluck('tenant_role_id');
      if (!adminAllows.includes(ownerRoleId)) {
        await knex('tenant_page_permissions').insert({
          tenant_id: tenant.id,
          page_id: adminId,
          tenant_role_id: ownerRoleId,
          permission_type: 'allow_role'
        });
      }
      if (!adminAllows.includes(adminRoleId)) {
        await knex('tenant_page_permissions').insert({
          tenant_id: tenant.id,
          page_id: adminId,
          tenant_role_id: adminRoleId,
          permission_type: 'allow_role'
        });
      }
    }

    // Default modules on Home (idempotent)
    const existingModules = await knex('tenant_page_modules').where({
      tenant_id: tenant.id,
      page_id: homeId
    });
    if (existingModules.length === 0 && homeId) {
      const moduleTypes = [
        'tribe_banner',
        'media_carousel',
        'activity_feed',
        'message_of_cycle',
        'galaxy_window'
      ];
      for (let i = 0; i < moduleTypes.length; i++) {
        await knex('tenant_page_modules').insert({
          tenant_id: tenant.id,
          page_id: homeId,
          type_key: moduleTypes[i],
          sort_order: i,
          config_json: isPg ? knex.raw("'{}'::jsonb") : '{}'
        });
      }
    }
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('tenant_posts');
  await knex.schema.dropTableIfExists('tenant_themes');
  await knex.schema.dropTableIfExists('tenant_page_modules');
  await knex.schema.dropTableIfExists('tenant_page_permissions');
  await knex.schema.dropTableIfExists('tenant_pages');
  await knex.schema.dropTableIfExists('tenant_member_roles');
  await knex.schema.dropTableIfExists('tenant_roles');

  const hasMembershipStatus = await knex.schema.hasColumn('memberships', 'status');
  if (hasMembershipStatus) {
    await knex.schema.alterTable('memberships', (table) => {
      table.dropColumn('status');
    });
  }
}
