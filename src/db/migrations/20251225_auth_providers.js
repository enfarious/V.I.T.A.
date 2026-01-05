/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const isPg = knex.client.config.client === 'pg';

  const hasAuthProviders = await knex.schema.hasTable('auth_providers');
  if (!hasAuthProviders) {
    await knex.schema.createTable('auth_providers', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.string('provider').notNullable();
      table.string('provider_user_id').notNullable();
      table.text('access_token');
      table.text('refresh_token');
      table.timestamp('expires_at');
      if (isPg) {
        table.jsonb('profile_json');
      } else {
        table.text('profile_json');
      }
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['provider', 'provider_user_id']);
      table.index('user_id');
    });
  }

  const hasLoginTokens = await knex.schema.hasTable('login_tokens');
  if (!hasLoginTokens) {
    await knex.schema.createTable('login_tokens', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.string('email');
      table.string('token').notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.timestamp('consumed_at');
      table.string('ip_address');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['token', 'expires_at']);
    });
  }

  const hasEmailVerified = await knex.schema.hasColumn('users', 'email_verified');
  if (!hasEmailVerified) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('email_verified').defaultTo(false);
    });
  }

  if (isPg) {
    const result = await knex.raw(`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_hash'
    `);
    const isNullable = result.rows[0]?.is_nullable === 'YES';
    if (!isNullable) {
      await knex.raw('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
    }
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('login_tokens');
  await knex.schema.dropTableIfExists('auth_providers');
  
  const hasEmailVerified = await knex.schema.hasColumn('users', 'email_verified');
  if (hasEmailVerified) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('email_verified');
    });
  }
}
