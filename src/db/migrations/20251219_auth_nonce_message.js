/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const hasMessage = await knex.schema.hasColumn('auth_nonces', 'message_to_sign');
  if (!hasMessage) {
    await knex.schema.alterTable('auth_nonces', (table) => {
      table.text('message_to_sign');
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const hasMessage = await knex.schema.hasColumn('auth_nonces', 'message_to_sign');
  if (hasMessage) {
    await knex.schema.alterTable('auth_nonces', (table) => {
      table.dropColumn('message_to_sign');
    });
  }
}
