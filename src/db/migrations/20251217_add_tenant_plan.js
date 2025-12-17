/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const hasPlan = await knex.schema.hasColumn('tenants', 'plan');
  if (!hasPlan) {
    await knex.schema.alterTable('tenants', (table) => {
      table.string('plan').notNullable().defaultTo('free');
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const hasPlan = await knex.schema.hasColumn('tenants', 'plan');
  if (hasPlan) {
    await knex.schema.alterTable('tenants', (table) => {
      table.dropColumn('plan');
    });
  }
}
