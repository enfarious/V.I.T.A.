import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { usePostgres } from '../../db/client.js';

const router = Router();

function wantsHTML(req) {
  return (req.get('accept') || '').includes('text/html');
}

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

router.use(authLimiter);

router.post('/register', async (req, res, next) => {
  const { email, display_name, password } = req.body || {};
  if (!email || !display_name || !password) {
    if (wantsHTML(req)) {
      req.session.flash = 'Missing fields';
      return res.redirect('/auth/register');
    }
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const existing = await req.db('users').whereRaw('lower(email) = lower(?)', [email]).first();
    if (existing) {
      if (wantsHTML(req)) {
        req.session.flash = 'Email already in use';
        return res.redirect('/auth/register');
      }
      return res.status(409).json({ error: 'email_in_use' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const insertQuery = req.db('users').insert({ email, password_hash, display_name });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const userId = Array.isArray(inserted)
      ? typeof inserted[0] === 'object'
        ? inserted[0].id
        : inserted[0]
      : inserted;

    req.session.userId = userId;
    if (wantsHTML(req)) {
      req.session.flash = 'Welcome aboard.';
      return res.redirect('/');
    }
    res.status(201).json({ ok: true, user: { id: userId, email, display_name } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    if (wantsHTML(req)) {
      req.session.flash = 'Missing credentials';
      return res.redirect('/auth/login');
    }
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const user = await req.db('users').select('id', 'password_hash', 'display_name', 'email').where({ email }).first();
    if (!user) {
      if (wantsHTML(req)) {
        req.session.flash = 'Invalid credentials';
        return res.redirect('/auth/login');
      }
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      if (wantsHTML(req)) {
        req.session.flash = 'Invalid credentials';
        return res.redirect('/auth/login');
      }
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    req.session.userId = user.id;
    if (wantsHTML(req)) {
      req.session.flash = 'Welcome back.';
      return res.redirect('/');
    }
    res.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    if (wantsHTML(req)) {
      return res.redirect('/auth/login');
    }
    res.json({ ok: true });
  });
});

export default router;
