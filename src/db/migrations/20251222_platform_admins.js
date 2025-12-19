/**
 * Platform-level admins (by wallet). Used to gate tenant creation and future operator console.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('platform_admins');
  if (!hasTable) {
    await knex.schema.createTable('platform_admins', (table) => {
      table.increments('id').primary();
      table.string('wallet_address').notNullable().unique();
      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_admins');
}
