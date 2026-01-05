import { db } from '../db/client.js';

export async function ensureTenantSchema(tenantSlug) {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  
  await db.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  
  return schemaName;
}

export async function runModuleMigrations(tenantSlug, moduleId, migrations) {
  const schemaName = await ensureTenantSchema(tenantSlug);
  
  const trackingTable = `${schemaName}.module_migrations`;
  await db.raw(`
    CREATE TABLE IF NOT EXISTS ${trackingTable} (
      id SERIAL PRIMARY KEY,
      module_id VARCHAR(255) NOT NULL,
      migration_name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(module_id, migration_name)
    )
  `);

  const executed = await db.raw(`
    SELECT migration_name FROM ${trackingTable} 
    WHERE module_id = ?
  `, [moduleId]);
  
  const executedNames = new Set(executed.rows.map(r => r.migration_name));

  for (const migration of migrations) {
    if (executedNames.has(migration.name)) {
      continue;
    }

    console.log(`[Module:${moduleId}] Running migration: ${migration.name} for tenant: ${tenantSlug}`);
    
    await migration.up(db, schemaName);
    
    await db.raw(`
      INSERT INTO ${trackingTable} (module_id, migration_name)
      VALUES (?, ?)
    `, [moduleId, migration.name]);
  }
}

export async function installModuleForTenant(tenantSlug, module) {
  if (!module || !module.migrations) {
    return;
  }
  
  await runModuleMigrations(tenantSlug, module.id, module.migrations);
}

export async function getInstalledModules(tenantSlug) {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  
  try {
    const result = await db.raw(`
      SELECT DISTINCT module_id FROM ${schemaName}.module_migrations
    `);
    return result.rows.map(r => r.module_id);
  } catch (err) {
    return [];
  }
}
