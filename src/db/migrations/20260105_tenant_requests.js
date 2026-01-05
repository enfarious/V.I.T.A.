/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const isPg = knex.client.config.client === 'pg';

  const hasColumn = await knex.schema.hasColumn('users', 'is_platform_admin');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('is_platform_admin').defaultTo(false);
    });
  }

  const hasTable = await knex.schema.hasTable('tenant_requests');
  if (!hasTable) {
    await knex.schema.createTable('tenant_requests', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('slug').notNullable();
      table.string('name').notNullable();
      table.text('reason');
      table.string('status').notNullable().defaultTo('pending');
      table.integer('reviewed_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.text('review_note');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('reviewed_at');
      table.unique(['slug', 'status']);
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('tenant_requests');
  
  const hasColumn = await knex.schema.hasColumn('users', 'is_platform_admin');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('is_platform_admin');
    });
  }
}
