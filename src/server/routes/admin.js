import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/doctrine/:slug/edit', (req, res) => {
  const db = req.app.locals.db;
  const page = db.prepare('SELECT * FROM doctrine_pages WHERE slug = ?').get(req.params.slug);
  res.render('admin/doctrine-edit', { page, slug: req.params.slug });
});

router.post('/doctrine/:slug/edit', (req, res) => {
  const db = req.app.locals.db;
  const { title, body_markdown } = req.body;
  const slug = req.params.slug;
  if (!title || !body_markdown) {
    req.session.flash = 'Title and body are required.';
    return res.redirect(`/admin/doctrine/${slug}/edit`);
  }

  const existing = db.prepare('SELECT id FROM doctrine_pages WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare(
      'UPDATE doctrine_pages SET title = ?, body_markdown = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).run(title, body_markdown, slug);
  } else {
    db.prepare('INSERT INTO doctrine_pages (slug, title, body_markdown) VALUES (?, ?, ?)').run(
      slug,
      title,
      body_markdown
    );
  }
  req.session.flash = 'Doctrine saved.';
  res.redirect(`/doctrine/${slug}`);
});

router.get('/aars/new', (req, res) => {
  res.render('admin/aar-new');
});

router.post('/aars/new', (req, res) => {
  const db = req.app.locals.db;
  const { title, body_markdown, visibility } = req.body;
  if (!title || !body_markdown) {
    req.session.flash = 'Title and body are required.';
    return res.redirect('/admin/aars/new');
  }

  const vis = visibility === 'members' ? 'members' : 'public';
  const result = db
    .prepare(
      'INSERT INTO after_action_reports (title, body_markdown, author_user_id, visibility) VALUES (?, ?, ?, ?)'
    )
    .run(title, body_markdown, req.user.id, vis);

  res.redirect(`/aars/${result.lastInsertRowid}`);
});

router.get('/events/new', (req, res) => {
  res.render('admin/event-new');
});

router.post('/events/new', (req, res) => {
  const db = req.app.locals.db;
  const { title, description_markdown, starts_at, ends_at, location_text, visibility } = req.body;
  if (!title || !description_markdown || !starts_at || !ends_at || !location_text) {
    req.session.flash = 'All fields are required.';
    return res.redirect('/admin/events/new');
  }

  const vis = visibility === 'members' ? 'members' : 'public';
  const result = db
    .prepare(
      'INSERT INTO events (title, description_markdown, starts_at, ends_at, location_text, created_by_user_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(title, description_markdown, starts_at, ends_at, location_text, req.user.id, vis);

  res.redirect(`/events/${result.lastInsertRowid}`);
});

export default router;
