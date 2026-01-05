/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const isPg = knex.client.config.client === 'pg';

  const hasTenantModuleAssets = await knex.schema.hasTable('tenant_module_assets');
  if (!hasTenantModuleAssets) {
    await knex.schema.createTable('tenant_module_assets', (table) => {
      table.increments('id').primary();
      table
        .integer('tenant_id')
        .unsigned()
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE');
      table.string('module_id').notNullable();
      table.string('source_type').notNullable().defaultTo('github');
      table.string('repo_url');
      table.string('branch').defaultTo('main');
      table.string('current_version');
      table.string('current_commit');
      table.string('asset_path');
      table.string('status').notNullable().defaultTo('pending');
      table.text('last_error');
      table.timestamp('last_synced_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'module_id']);
      table.index('status');
    });
  }

  const hasWalletAddress = await knex.schema.hasColumn('users', 'wallet_address');
  if (!hasWalletAddress) {
    await knex.schema.alterTable('users', (table) => {
      table.string('wallet_address');
      table.boolean('wallet_verified').defaultTo(false);
      table.string('player_status');
      table.timestamp('wallet_verified_at');
    });
  }

  const hasProvisioningGates = await knex.schema.hasTable('provisioning_gates');
  if (!hasProvisioningGates) {
    await knex.schema.createTable('provisioning_gates', (table) => {
      table.increments('id').primary();
      table.string('gate_type').notNullable();
      table.boolean('enabled').notNullable().defaultTo(true);
      if (isPg) {
        table.jsonb('config_json');
      } else {
        table.text('config_json');
      }
      table.integer('priority').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    await knex('provisioning_gates').insert([
      { gate_type: 'discord_verified', enabled: true, priority: 1, config_json: JSON.stringify({}) },
      { gate_type: 'wallet_verified', enabled: true, priority: 2, config_json: JSON.stringify({ require_player_status: true }) }
    ]);
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('provisioning_gates');
  await knex.schema.dropTableIfExists('tenant_module_assets');
  
  const hasWalletAddress = await knex.schema.hasColumn('users', 'wallet_address');
  if (hasWalletAddress) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('wallet_address');
      table.dropColumn('wallet_verified');
      table.dropColumn('player_status');
      table.dropColumn('wallet_verified_at');
    });
  }
}
