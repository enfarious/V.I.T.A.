import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const canSeeMembers = req.user?.roles?.includes('member');
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.visibility, a.created_at, u.display_name as author
       FROM after_action_reports a
       LEFT JOIN users u ON u.id = a.author_user_id
       WHERE a.visibility = 'public' ${canSeeMembers ? "OR a.visibility = 'members'" : ''}
       ORDER BY a.created_at DESC`
    )
    .all();
  res.render('aars/index', { reports: rows, canSeeMembers });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const report = db
    .prepare(
      `SELECT a.*, u.display_name as author 
       FROM after_action_reports a 
       LEFT JOIN users u ON u.id = a.author_user_id
       WHERE a.id = ?`
    )
    .get(req.params.id);

  if (!report) {
    return res.status(404).render('error', { message: 'AAR not found.' });
  }

  const canSeeMembers = req.user?.roles?.includes('member');
  if (report.visibility === 'members' && !canSeeMembers) {
    return res.status(403).render('error', { message: 'Members-only AAR.' });
  }

  const html = req.app.locals.renderMarkdown(report.body_markdown);
  res.render('aars/show', { report, html });
});

export default router;
