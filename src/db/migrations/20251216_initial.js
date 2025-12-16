/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const isPg = knex.client.config.client === 'pg';

  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    await knex.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email').notNullable().unique();
      table.string('password_hash').notNullable();
      table.string('display_name');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  const hasTenants = await knex.schema.hasTable('tenants');
  if (!hasTenants) {
    await knex.schema.createTable('tenants', (table) => {
      table.increments('id').primary();
      table.string('slug').notNullable().unique();
      table.string('name').notNullable();
      table.string('status').notNullable().defaultTo('active');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  const hasMemberships = await knex.schema.hasTable('memberships');
  if (!hasMemberships) {
    await knex.schema.createTable('memberships', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table.string('role').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'tenant_id']);
    });
  }

  const hasAudit = await knex.schema.hasTable('audit_log');
  if (!hasAudit) {
    await knex.schema.createTable('audit_log', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table
        .integer('actor_user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.string('action').notNullable();
      table.string('entity').notNullable();
      table.string('entity_id');
      if (isPg) {
        table.jsonb('meta_json');
      } else {
        table.text('meta_json');
      }
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['tenant_id', 'created_at']);
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('memberships');
  await knex.schema.dropTableIfExists('tenants');
  await knex.schema.dropTableIfExists('users');
}
