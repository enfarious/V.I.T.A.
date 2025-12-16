import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const pages = db.prepare('SELECT slug, title, updated_at FROM doctrine_pages ORDER BY title ASC').all();
  res.render('doctrine/index', { pages });
});

router.get('/:slug', (req, res) => {
  const db = req.app.locals.db;
  const page = db.prepare('SELECT slug, title, body_markdown, updated_at FROM doctrine_pages WHERE slug = ?').get(req.params.slug);
  if (!page) {
    return res.status(404).render('error', { message: 'Doctrine page not found.' });
  }
  const html = req.app.locals.renderMarkdown(page.body_markdown);
  res.render('doctrine/show', { page, html });
});

export default router;
