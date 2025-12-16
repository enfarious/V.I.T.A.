import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const identities = db
    .prepare('SELECT id, provider, handle, canonical_id, verified, created_at FROM external_identities WHERE user_id = ?')
    .all(req.user.id);
  res.render('me/index', { identities });
});

router.post('/identities', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { provider, handle } = req.body;
  if (!provider || !handle) {
    req.session.flash = 'Provider and handle are required.';
    return res.redirect('/me');
  }

  db.prepare(
    'INSERT INTO external_identities (user_id, provider, handle, verified) VALUES (?, ?, ?, 0)'
  ).run(req.user.id, provider, handle);

  req.session.flash = 'Identity added. You can verify it now.';
  res.redirect('/me');
});

router.post('/identities/:id/verify', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const chainAdapter = req.app.locals.chainAdapter;
  const identity = db
    .prepare('SELECT id, provider, handle FROM external_identities WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!identity) {
    req.session.flash = 'Identity not found.';
    return res.redirect('/me');
  }

  let canonicalId = null;
  const resolved = await chainAdapter.resolveIdentity({
    provider: identity.provider,
    handle: identity.handle
  });
  if (resolved?.canonicalId) {
    canonicalId = resolved.canonicalId;
  }

  db.prepare(
    'UPDATE external_identities SET verified = 1, canonical_id = COALESCE(?, canonical_id) WHERE id = ?'
  ).run(canonicalId, identity.id);

  req.session.flash = resolved ? 'Identity verified via adapter.' : 'Marked verified (manual).';
  res.redirect('/me');
});

export default router;
