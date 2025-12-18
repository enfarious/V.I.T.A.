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
      req.user = user;
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
    if (roleList.length > 0 && !roleList.includes(req.membership.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

export const requireOwner = requireRole(['owner']);
import { assertValidRole } from '../roles.js';
