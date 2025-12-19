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
  host: env.HOST || env.BIND_ADDRESS || '0.0.0.0',
  baseUrl: env.BASE_URL || `http://localhost:${Number(env.PORT) || 3000}`,
  authDebug: (env.AUTH_DEBUG || '').toLowerCase() === '1' || (env.AUTH_DEBUG || '').toLowerCase() === 'true',
  allowTenantSignup: (env.ALLOW_TENANT_SIGNUP || '').toLowerCase() === '1' || (env.ALLOW_TENANT_SIGNUP || '').toLowerCase() === 'true',
  tenantCreatorAllowlist: (env.ALLOWED_TENANT_CREATORS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
  rootWallets: (env.ROOT_WALLETS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
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
