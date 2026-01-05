export function loadUser() {
  return async (req, _res, next) => {
    const userId = req.session?.userId;
    if (!userId || !req.db) {
      req.user = null;
      return next();
    }

    try {
      const user = await req.db('users').select('id', 'email', 'display_name', 'is_platform_admin', 'discord_id', 'discord_avatar').where({ id: userId }).first();
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
    return res.status(401).json({ error: 'auth_required' });
  }
  next();
}

export function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (roles.length > 0 && !roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
