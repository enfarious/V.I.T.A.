import knex from 'knex';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

const usePostgres = Boolean(config.databaseUrl);

const baseConfig = {
  client: usePostgres ? 'pg' : 'better-sqlite3',
  connection: usePostgres
    ? config.databaseUrl
    : {
        filename: config.dbPath
      },
  useNullAsDefault: !usePostgres,
  pool: usePostgres
    ? { min: 1, max: 10 }
    : {
        min: 1,
        max: 1
      },
  migrations: {
    directory: path.resolve('src', 'db', 'migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.resolve('src', 'db', 'seeds')
  }
};

if (!usePostgres) {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const db = knex(baseConfig);
export { usePostgres };

export function getMigrationConfig() {
  return baseConfig;
}
