import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../../config.js';
import { usePostgres } from '../../db/client.js';

const router = Router();

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';

router.get('/auth/discord', async (req, res) => {
  if (!config.discord.clientId) {
    req.session.flash = 'Discord OAuth is not configured.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const isPopup = req.query.popup === '1';

  try {
    await req.db('login_tokens').insert({
      token: state,
      email: isPopup ? 'oauth_state_popup' : 'oauth_state',
      expires_at: expiresAt,
      ip_address: req.ip
    });
  } catch (err) {
    console.error('Failed to store OAuth state:', err);
    req.session.flash = 'Failed to initialize login. Please try again.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify email',
    state
  });

  res.redirect(`${DISCORD_AUTH_URL}?${params}`);
});

function sendPopupClose(res, success) {
  res.send(`<!DOCTYPE html>
<html><head><title>Login Complete</title></head>
<body>
<script>
  if (window.opener && window.opener.onOAuthComplete) {
    window.opener.onOAuthComplete(${success});
  }
  window.close();
  setTimeout(function() {
    window.location.href = '${success ? '/' : '/auth/login'}';
  }, 500);
</script>
<p>Login ${success ? 'successful' : 'failed'}. This window should close automatically.</p>
</body></html>`);
}

router.get('/auth/discord/callback', async (req, res) => {
  const { code, state, error } = req.query;

  console.log('[Discord OAuth] Callback received:', { 
    hasCode: !!code, 
    hasState: !!state, 
    error: error || null,
    fullQuery: req.query
  });

  const stateRecord = await req.db('login_tokens')
    .where({ token: state })
    .whereIn('email', ['oauth_state', 'oauth_state_popup'])
    .whereNull('consumed_at')
    .where('expires_at', '>', new Date())
    .first();

  const isPopup = stateRecord?.email === 'oauth_state_popup';

  if (error) {
    console.log('[Discord OAuth] Error from Discord:', error);
    req.session.flash = `Discord login failed: ${error}`;
    req.session.flashType = 'error';
    if (isPopup) return sendPopupClose(res, false);
    return res.redirect('/auth/login');
  }

  if (!code || !state) {
    console.log('[Discord OAuth] Missing code or state');
    req.session.flash = 'Invalid OAuth request. Please try again.';
    req.session.flashType = 'error';
    if (isPopup) return sendPopupClose(res, false);
    return res.redirect('/auth/login');
  }

  if (!stateRecord) {
    req.session.flash = 'OAuth session expired or invalid. Please try again.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  await req.db('login_tokens').where({ id: stateRecord.id }).update({ consumed_at: new Date() });

  try {
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discord.redirectUri
      })
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      console.error('[Discord OAuth] Token exchange failed:', tokens.error);
      throw new Error(tokens.error_description || tokens.error);
    }

    const userRes = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const discordUser = await userRes.json();

    if (!discordUser.id) {
      throw new Error('Failed to get Discord user info');
    }

    const existingProvider = await req.db('auth_providers')
      .where({ provider: 'discord', provider_user_id: discordUser.id })
      .first();

    if (existingProvider) {
      await req.db('auth_providers')
        .where({ id: existingProvider.id })
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          profile_json: JSON.stringify(discordUser)
        });

      const user = await req.db('users').where({ id: existingProvider.user_id }).first();
      
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          req.session.flash = 'Login failed. Please try again.';
          req.session.flashType = 'error';
          if (isPopup) return sendPopupClose(res, false);
          return res.redirect('/auth/login');
        }
        req.session.userId = existingProvider.user_id;
        req.session.flash = `Welcome back, ${user?.display_name || discordUser.username}!`;
        req.session.flashType = 'success';
        req.session.save(() => {
          if (isPopup) return sendPopupClose(res, true);
          res.redirect('/');
        });
      });
      return;
    }

    const email = discordUser.email;
    const emailVerified = discordUser.verified === true;

    if (!email || !emailVerified) {
      req.session.pendingDiscordUser = {
        id: discordUser.id,
        username: discordUser.username,
        global_name: discordUser.global_name,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in
      };
      return res.redirect('/auth/complete-discord');
    }

    let user = await req.db('users').where({ email }).first();

    if (!user) {
      const display_name = discordUser.global_name || discordUser.username;
      const insertQuery = req.db('users').insert({ 
        email,
        display_name,
        email_verified: true
      });
      const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
      const userId = Array.isArray(inserted)
        ? typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]
        : inserted;
      user = { id: userId, display_name };
    }

    await req.db('auth_providers').insert({
      user_id: user.id,
      provider: 'discord',
      provider_user_id: discordUser.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      profile_json: JSON.stringify(discordUser)
    });

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        req.session.flash = 'Login failed. Please try again.';
        req.session.flashType = 'error';
        if (isPopup) return sendPopupClose(res, false);
        return res.redirect('/auth/login');
      }
      req.session.userId = user.id;
      req.session.flash = `Welcome to VITA Frontier, ${user.display_name}!`;
      req.session.flashType = 'success';
      req.session.save(() => {
        if (isPopup) return sendPopupClose(res, true);
        res.redirect('/');
      });
    });

  } catch (err) {
    console.error('Discord OAuth error:', err);
    req.session.flash = 'Discord login failed. Please try again.';
    req.session.flashType = 'error';
    if (isPopup) return sendPopupClose(res, false);
    res.redirect('/auth/login');
  }
});

router.get('/auth/magic-link', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/magic-link', { 
    error: null, 
    success: null,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.post('/auth/magic-link', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.render('auth/magic-link', { error: 'Email is required.', success: null });
  }

  try {
    let user = await req.db('users').whereRaw('lower(email) = lower(?)', [email]).first();
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + config.magicLinkExpiryMinutes * 60 * 1000);

    await req.db('login_tokens').insert({
      user_id: user?.id || null,
      email: email.toLowerCase(),
      token,
      expires_at: expiresAt,
      ip_address: req.ip
    });

    const magicLink = `${config.baseUrl}/auth/verify?token=${token}`;

    if (config.env === 'development') {
      console.log(`[DEV] Magic link token generated for ${email}`);
    }

    res.render('auth/magic-link', { 
      error: null, 
      success: `A login link has been sent to ${email}. It expires in ${config.magicLinkExpiryMinutes} minutes. Check your email inbox.`
    });

  } catch (err) {
    console.error('Magic link error:', err);
    res.render('auth/magic-link', { error: 'An error occurred. Please try again.', success: null });
  }
});

router.get('/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.flash = 'Invalid or missing token.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  try {
    const result = await req.db('login_tokens')
      .where({ token })
      .whereNull('consumed_at')
      .where('expires_at', '>', new Date())
      .update({ consumed_at: new Date() });

    if (result === 0) {
      req.session.flash = 'This link has expired or already been used.';
      req.session.flashType = 'error';
      return res.redirect('/auth/login');
    }

    const loginToken = await req.db('login_tokens').where({ token }).first();

    let user;
    if (loginToken.user_id) {
      user = await req.db('users').where({ id: loginToken.user_id }).first();
    } else {
      const display_name = loginToken.email.split('@')[0];
      const insertQuery = req.db('users').insert({ 
        email: loginToken.email,
        display_name,
        email_verified: true
      });
      const inserted = usePostgres ? await insertQuery.returning(['id', 'display_name']) : await insertQuery;
      const userId = Array.isArray(inserted)
        ? typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]
        : inserted;
      user = { id: userId, display_name };
    }

    if (user && !user.email_verified) {
      await req.db('users').where({ id: user.id }).update({ email_verified: true });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        req.session.flash = 'Login failed. Please try again.';
        req.session.flashType = 'error';
        return res.redirect('/auth/login');
      }
      req.session.userId = user.id;
      req.session.flash = `Welcome${loginToken.user_id ? ' back' : ''}, ${user.display_name}!`;
      req.session.flashType = 'success';
      res.redirect('/');
    });

  } catch (err) {
    console.error('Token verification error:', err);
    req.session.flash = 'An error occurred. Please try again.';
    req.session.flashType = 'error';
    res.redirect('/auth/login');
  }
});

router.get('/auth/complete-discord', (req, res) => {
  if (!req.session.pendingDiscordUser) {
    return res.redirect('/auth/login');
  }
  res.render('auth/complete-discord', { 
    error: null,
    discordUser: req.session.pendingDiscordUser
  });
});

router.post('/auth/complete-discord', async (req, res) => {
  const pendingDiscordUser = req.session.pendingDiscordUser;
  if (!pendingDiscordUser) {
    return res.redirect('/auth/login');
  }

  const { email } = req.body || {};
  if (!email) {
    return res.render('auth/complete-discord', { 
      error: 'Email is required.',
      discordUser: pendingDiscordUser
    });
  }

  try {
    const existing = await req.db('users').whereRaw('lower(email) = lower(?)', [email]).first();
    if (existing) {
      const existingProvider = await req.db('auth_providers')
        .where({ user_id: existing.id, provider: 'discord' })
        .first();
      
      if (existingProvider) {
        return res.render('auth/complete-discord', { 
          error: 'This email is already linked to another Discord account.',
          discordUser: pendingDiscordUser
        });
      }

      await req.db('auth_providers').insert({
        user_id: existing.id,
        provider: 'discord',
        provider_user_id: pendingDiscordUser.id,
        access_token: pendingDiscordUser.access_token,
        refresh_token: pendingDiscordUser.refresh_token || null,
        expires_at: pendingDiscordUser.expires_in ? new Date(Date.now() + pendingDiscordUser.expires_in * 1000) : null,
        profile_json: JSON.stringify(pendingDiscordUser)
      });

      delete req.session.pendingDiscordUser;
      
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          req.session.flash = 'Login failed. Please try again.';
          req.session.flashType = 'error';
          return res.redirect('/auth/login');
        }
        req.session.userId = existing.id;
        req.session.flash = `Discord linked! Welcome back, ${existing.display_name}!`;
        req.session.flashType = 'success';
        res.redirect('/');
      });
      return;
    }

    const display_name = pendingDiscordUser.global_name || pendingDiscordUser.username;
    const insertQuery = req.db('users').insert({ 
      email,
      display_name,
      email_verified: false
    });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const userId = Array.isArray(inserted)
      ? typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]
      : inserted;

    await req.db('auth_providers').insert({
      user_id: userId,
      provider: 'discord',
      provider_user_id: pendingDiscordUser.id,
      access_token: pendingDiscordUser.access_token,
      refresh_token: pendingDiscordUser.refresh_token || null,
      expires_at: pendingDiscordUser.expires_in ? new Date(Date.now() + pendingDiscordUser.expires_in * 1000) : null,
      profile_json: JSON.stringify(pendingDiscordUser)
    });

    delete req.session.pendingDiscordUser;

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        req.session.flash = 'Account creation failed. Please try again.';
        req.session.flashType = 'error';
        return res.redirect('/auth/login');
      }
      req.session.userId = userId;
      req.session.flash = `Welcome to VITA Frontier, ${display_name}!`;
      req.session.flashType = 'success';
      res.redirect('/');
    });

  } catch (err) {
    console.error('Complete Discord error:', err);
    res.render('auth/complete-discord', { 
      error: 'An error occurred. Please try again.',
      discordUser: pendingDiscordUser
    });
  }
});

export default router;
