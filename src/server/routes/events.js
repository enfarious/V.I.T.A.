import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const canSeeMembers = req.user?.roles?.includes('member');
  const events = db
    .prepare(
      `SELECT e.*, u.display_name as creator
       FROM events e
       LEFT JOIN users u ON u.id = e.created_by_user_id
       WHERE e.visibility = 'public' ${canSeeMembers ? "OR e.visibility = 'members'" : ''}
       ORDER BY e.starts_at ASC`
    )
    .all();
  res.render('events/index', { events, canSeeMembers });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db
    .prepare(
      `SELECT e.*, u.display_name as creator 
       FROM events e
       LEFT JOIN users u ON u.id = e.created_by_user_id
       WHERE e.id = ?`
    )
    .get(req.params.id);

  if (!event) {
    return res.status(404).render('error', { message: 'Event not found.' });
  }

  const canSeeMembers = req.user?.roles?.includes('member');
  if (event.visibility === 'members' && !canSeeMembers) {
    return res.status(403).render('error', { message: 'Members-only event.' });
  }

  const html = req.app.locals.renderMarkdown(event.description_markdown);
  res.render('events/show', { event, html });
});

export default router;
