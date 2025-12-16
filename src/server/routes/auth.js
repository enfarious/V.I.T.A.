import express from 'express';
import bcrypt from 'bcryptjs';

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('auth/register');
});

router.post('/register', async (req, res) => {
  const db = req.app.locals.db;
  const { email, display_name, password } = req.body;
  if (!email || !display_name || !password) {
    req.session.flash = 'All fields are required.';
    return res.redirect('/auth/register');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    req.session.flash = 'Email already registered.';
    return res.redirect('/auth/register');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
    .run(email, password_hash, display_name);

  const userId = result.lastInsertRowid;
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, 'member');

  req.session.userId = userId;
  res.redirect('/');
});

router.get('/login', (req, res) => {
  res.render('auth/login');
});

router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user) {
    req.session.flash = 'Invalid credentials.';
    return res.redirect('/auth/login');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    req.session.flash = 'Invalid credentials.';
    return res.redirect('/auth/login');
  }

  req.session.userId = user.id;
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default router;
