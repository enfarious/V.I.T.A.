import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const doctrines = db.prepare('SELECT slug, title FROM doctrine_pages ORDER BY updated_at DESC LIMIT 3').all();
  const aars = db
    .prepare(
      `SELECT id, title, visibility, created_at 
       FROM after_action_reports 
       WHERE visibility = 'public' OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = ? AND ur.role = 'member')
       ORDER BY created_at DESC LIMIT 3`
    )
    .all(req.user?.id || 0);
  const events = db
    .prepare(
      `SELECT id, title, starts_at, visibility 
       FROM events 
       WHERE visibility = 'public' OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = ? AND ur.role = 'member')
       ORDER BY starts_at ASC LIMIT 3`
    )
    .all(req.user?.id || 0);

  res.render('home', {
    doctrines,
    aars,
    events
  });
});

export default router;
