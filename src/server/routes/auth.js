import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { usePostgres } from '../../db/client.js';
import { verifyWalletSignature, describePayload } from '../auth/verifyWalletSignature.js';
import { config } from '../../config.js';
import { ensureRootWalletAdmins, upsertPlatformAdminUser } from '../services/platformAdmins.js';

const router = Router();

const walletRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const NONCE_TTL_MS = 5 * 60 * 1000;

function buildMessageToSign({ nonceId, nonce, issuedAt, expiresAt }) {
  return [
    'VITA Login',
    `Domain: ${config.baseUrl}`,
    `Nonce ID: ${nonceId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
    'Chain: frontier (TODO confirm provider identifier)'
  ].join('\n');
}

router.use(walletRateLimiter);

router.get('/wallet/nonce', async (req, res, next) => {
  try {
    const nonceBytes = crypto.randomBytes(32);
    const nonce = nonceBytes.toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
    const ipHash = crypto.createHash('sha256').update(req.ip || '').digest('hex');
    const uaHash = crypto.createHash('sha256').update(req.get('user-agent') || '').digest('hex');

    const message_to_sign = buildMessageToSign({
      nonceId: 'pending',
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    const insertQuery = req.db('auth_nonces').insert({
      nonce,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      ip_hash: ipHash,
      user_agent_hash: uaHash,
      message_to_sign
    });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const nonceId = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;

    const message = buildMessageToSign({
      nonceId,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    await req.db('auth_nonces').where({ id: nonceId }).update({ message_to_sign: message });

    res.json({ nonce_id: nonceId, nonce, message_to_sign: message, issued_at: issuedAt.toISOString(), expires_at: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/wallet/debug-echo', (req, res) => {
  if (!config.authDebug) {
    return res.status(404).json({ error: 'not_found' });
  }
  const info = describePayload(req.body || {});
  res.json({
    receivedKeys: info.keys,
    inferredEncodings: {
      signatureIsBase64: info.signatureIsBase64,
      publicKeyIsBase64: info.publicKeyIsBase64
    },
    lengths: {
      signatureLength: info.signatureLength,
      publicKeyLength: (req.body?.publicKey || '').length || 0,
      messageLength: (req.body?.message || req.body?.message_to_sign || '').length || 0
    },
    sample: {
      signaturePrefix: (req.body?.signature || '').toString().slice(0, 8),
      signatureSuffix: (req.body?.signature || '').toString().slice(-8)
    }
  });
});

router.post('/wallet/verify', async (req, res, next) => {
  const { nonce_id, wallet_address, signature, display_name, address, publicKey, bytes } = req.body || {};
  if (!nonce_id || (!wallet_address && !address)) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  try {
    await ensureRootWalletAdmins(req.db);
    await req.db.transaction(async (trx) => {
      const nonceRow = await trx('auth_nonces').where({ id: nonce_id }).first();
      if (!nonceRow) {
        const err = new Error('NONCE_INVALID');
        err.status = 400;
        throw err;
      }
      const now = Date.now();
      if (nonceRow.used_at) {
        const err = new Error('NONCE_USED');
        err.status = 400;
        throw err;
      }
      if (new Date(nonceRow.expires_at).getTime() < now) {
        const err = new Error('NONCE_EXPIRED');
        err.status = 400;
        throw err;
      }

      const message = nonceRow.message_to_sign;

      const payloadForVerify = {
        address: address || wallet_address,
        wallet_address,
        signature,
        publicKey,
        bytes
      };

      if (config.authDebug) {
        console.log('[auth debug] verify payload', describePayload(payloadForVerify));
      }

      const verifyResult = await verifyWalletSignature({ payload: payloadForVerify, message, authDebug: config.authDebug });

      await trx('auth_nonces').where({ id: nonceRow.id }).update({ used_at: new Date().toISOString() });

      const normalizedAddress = (address || wallet_address).toLowerCase();

      let user = await trx('users').where({ wallet_address: normalizedAddress }).first();
      if (!user) {
        const insertUser = trx('users').insert({
          wallet_address: normalizedAddress,
          email: `${normalizedAddress}@wallet`,
          display_name: display_name || null,
          last_login_at: new Date().toISOString()
        });
        const inserted = usePostgres ? await insertUser.returning(['id', 'wallet_address', 'display_name']) : await insertUser;
        const id = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
        user = { id, wallet_address, display_name: display_name || null };
      } else {
        await trx('users').where({ id: user.id }).update({ last_login_at: new Date().toISOString() });
      }

      await upsertPlatformAdminUser(trx, normalizedAddress, user.id);

      req.session.userId = user.id;
    });

    const payload = { ok: true, redirect: '/auth/success' };
    if ((req.get('accept') || '').includes('text/html')) {
      req.session.flash = 'Wallet connected.';
      return res.redirect('/');
    }
    res.json(payload);
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || 'internal_error';
    if (config.authDebug) {
      console.error('[auth debug] verify failed', { code, message: err?.message, debug: err?.debug });
    }
    if (code === 'SIGNATURE_INVALID' || code === 'ADDRESS_MISMATCH' || code === 'UNSUPPORTED_SIGNATURE_FORMAT') {
      return res.status(401).json({
        error: code,
        message_to_sign: err?.debug?.message_to_sign,
        wallet_address: err?.debug?.provided,
        details: err?.debug
      });
    }
    if (code === 'NONCE_EXPIRED' || code === 'NONCE_USED' || code === 'NONCE_INVALID') {
      return res.status(400).json({ error: code });
    }
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    if ((req.get('accept') || '').includes('text/html')) {
      return res.redirect('/');
    }
    res.json({ ok: true });
  });
});

export default router;
