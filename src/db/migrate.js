import { db, getMigrationConfig, usePostgres } from './client.js';
import { config } from '../config.js';

export async function migrateLatest() {
  await db.migrate.latest(getMigrationConfig());
}

export async function seedDev() {
  if (config.env === 'production') return;
  await db.seed.run(getMigrationConfig());
}

export async function closeDb() {
  if (usePostgres) {
    await db.destroy();
  } else {
    // better-sqlite3 adapter closes on destroy as well
    await db.destroy();
  }
}
