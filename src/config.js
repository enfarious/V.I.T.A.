import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env;
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkgJson = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : {};

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT) || 3000,
  sessionSecret: env.SESSION_SECRET || '',
  databaseUrl: env.DATABASE_URL || '',
  dbPath: env.DB_PATH || path.resolve('data', 'vita.db'),
  sessionCookieSecure: (env.SESSION_COOKIE_SECURE || '').toLowerCase() === 'true' || env.NODE_ENV === 'production',
  subdomainTenancyEnabled: (env.SUBDOMAIN_TENANCY || '').toLowerCase() === 'true',
  version: pkgJson.version || '0.0.0',
  commit: env.GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || env.REPLIT_GIT_COMMIT || null
};

if (!config.sessionSecret) {
  throw new Error('SESSION_SECRET is required for server boot.');
}
