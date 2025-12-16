export function attachUser(db) {
  return (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.locals.user = null;
      return next();
    }

    const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(userId);
    if (!user) {
      req.session.userId = null;
      res.locals.user = null;
      return next();
    }

    const roles = db
      .prepare('SELECT role FROM user_roles WHERE user_id = ?')
      .all(userId)
      .map((r) => r.role);

    res.locals.user = { ...user, roles };
    req.user = res.locals.user;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/auth/login');
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/auth/login');
    }
    const hasRole = Array.isArray(req.user.roles) && req.user.roles.includes(role);
    if (!hasRole) {
      return res.status(403).render('error', { message: 'Insufficient permissions.' });
    }
    next();
  };
}
