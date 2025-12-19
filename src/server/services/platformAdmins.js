import { config } from '../../config.js';

/**
 * Ensure ROOT_WALLETS are present in platform_admins table. Idempotent.
 */
export async function ensureRootWalletAdmins(db) {
  const roots = config.rootWallets || [];
  if (!roots.length) return;
  for (const wallet of roots) {
    const existing = await db('platform_admins').where({ wallet_address: wallet }).first();
    if (!existing) {
      await db('platform_admins').insert({ wallet_address: wallet });
    }
  }
}

export async function isPlatformAdmin(db, walletAddress) {
  if (!walletAddress) return false;
  const addr = walletAddress.toLowerCase();
  if (config.rootWallets.includes(addr)) return true;
  const row = await db('platform_admins').where({ wallet_address: addr }).first();
  return Boolean(row);
}

export async function upsertPlatformAdminUser(db, walletAddress, userId) {
  if (!walletAddress) return;
  const addr = walletAddress.toLowerCase();
  const existing = await db('platform_admins').where({ wallet_address: addr }).first();
  if (existing) {
    if (!existing.user_id && userId) {
      await db('platform_admins').where({ wallet_address: addr }).update({ user_id: userId });
    }
    return;
  }
  await db('platform_admins').insert({ wallet_address: addr, user_id: userId || null });
}
