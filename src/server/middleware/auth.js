import { assertValidRole } from '../roles.js';
import { isPlatformAdmin } from '../services/platformAdmins.js';

export function loadUser() {
  return async (req, _res, next) => {
    const userId = req.session?.userId;
    if (!userId || !req.db) {
      req.user = null;
      return next();
    }

    try {
      const user = await req
        .db('users')
        .select('id', 'email', 'wallet_address', 'display_name')
        .where({ id: userId })
        .first();
      if (!user) {
        req.session.userId = null;
        req.user = null;
        return next();
      }
      const platform_admin = user?.wallet_address
        ? await isPlatformAdmin(req.db, user.wallet_address)
        : false;
      req.user = { ...user, platform_admin };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    if ((req.get('accept') || '').includes('text/html')) {
      if (req.session) req.session.flash = 'Please sign in.';
      return res.redirect('/auth/login');
    }
    return res.status(401).json({ error: 'auth_required' });
  }
  next();
}

export function requireRole(roles = []) {
  const roleList = (Array.isArray(roles) ? roles : [roles]).filter(Boolean).map(assertValidRole);
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const hasRole =
      roleList.length === 0 ||
      req.membership.roles?.some((r) => roleList.includes(r)) ||
      (req.membership.role && roleList.includes(req.membership.role));
    if (!hasRole || req.membership.status !== 'active') {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

export const requireOwner = requireRole(['owner']);

export function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.platform_admin) {
    if ((req.get('accept') || '').includes('text/html')) {
      if (req.session) req.session.flash = 'Platform admin access required.';
      return res.status(403).render('error', { title: 'Access denied', message: 'Platform admin only.', user: req.user });
    }
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
