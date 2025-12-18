/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const hasWalletAddress = await knex.schema.hasColumn('users', 'wallet_address');
  const hasDisplayName = await knex.schema.hasColumn('users', 'display_name');
  const hasLastLogin = await knex.schema.hasColumn('users', 'last_login_at');
  const client = knex.client.config.client;

  await knex.schema.alterTable('users', (table) => {
    if (!hasWalletAddress) {
      table.string('wallet_address');
    }
    if (!hasDisplayName) {
      table.string('display_name');
    }
    if (!hasLastLogin) {
      table.timestamp('last_login_at');
    }
  });

  if (!hasWalletAddress) {
    const users = await knex('users').select('id');
    for (const u of users) {
      await knex('users').where({ id: u.id }).update({ wallet_address: `legacy-${u.id}` });
    }
    await knex.schema.alterTable('users', (table) => {
      table.unique(['wallet_address']);
      if (client === 'pg') {
        table.string('wallet_address').notNullable().alter();
      }
    });
  }

  const hasPassword = await knex.schema.hasColumn('users', 'password_hash');
  if (hasPassword) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('password_hash');
    });
  }

  const hasNonces = await knex.schema.hasTable('auth_nonces');
  if (!hasNonces) {
    await knex.schema.createTable('auth_nonces', (table) => {
      table.increments('id').primary();
      table.string('nonce').notNullable().unique();
      table.text('message_to_sign');
      table.timestamp('issued_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('expires_at').notNullable();
      table.timestamp('used_at');
      table.string('ip_hash');
      table.string('user_agent_hash');
      table.index(['nonce']);
    });
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const hasNonces = await knex.schema.hasTable('auth_nonces');
  if (hasNonces) {
    await knex.schema.dropTableIfExists('auth_nonces');
  }

  const hasWalletAddress = await knex.schema.hasColumn('users', 'wallet_address');
  if (hasWalletAddress) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('wallet_address');
      table.dropColumn('display_name');
      table.dropColumn('last_login_at');
      table.string('password_hash');
    });
  }
}
