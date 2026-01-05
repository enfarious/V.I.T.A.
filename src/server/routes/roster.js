import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT id, display_name, email, created_at FROM users ORDER BY display_name ASC').all();
  const rolesByUser = db.prepare('SELECT user_id, role FROM user_roles').all();
  const identities = db.prepare('SELECT user_id, provider, handle, verified FROM external_identities').all();

  const roleMap = rolesByUser.reduce((acc, row) => {
    acc[row.user_id] = acc[row.user_id] || [];
    acc[row.user_id].push(row.role);
    return acc;
  }, {});

  const identityMap = identities.reduce((acc, row) => {
    acc[row.user_id] = acc[row.user_id] || [];
    acc[row.user_id].push(row);
    return acc;
  }, {});

  const roster = users.map((u) => ({
    ...u,
    roles: roleMap[u.id] || [],
    identities: identityMap[u.id] || []
  }));

  res.render('roster/index', { roster });
});

export default router;
