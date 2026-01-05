import { Router } from 'express';
import { config } from '../../config.js';
import { usePostgres } from '../../db/client.js';
import { installDefaultModules } from '../../modules/index.js';

const router = Router();

router.get('/about', (req, res) => {
  res.render('about', { 
    user: req.user,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.get('/', async (req, res) => {
  let tenants = [];
  if (req.user) {
    tenants = await req.db('memberships')
      .join('tenants', 'memberships.tenant_id', 'tenants.id')
      .where('memberships.user_id', req.user.id)
      .select('tenants.*', 'memberships.role');
  }
  res.render('home', { 
    user: req.user, 
    tenants,
    version: config.version,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.get('/auth/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { 
    error: null,
    discordEnabled: Boolean(config.discord?.clientId),
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});


router.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

router.get('/me', async (req, res) => {
  if (!req.user) {
    req.session.flash = 'Please login to view your profile.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  const memberships = await req.db('memberships')
    .join('tenants', 'memberships.tenant_id', 'tenants.id')
    .where('memberships.user_id', req.user.id)
    .select('tenants.name', 'tenants.slug', 'memberships.role', 'memberships.created_at');

  res.render('me/index', { 
    user: req.user, 
    memberships,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.get('/tenants', async (req, res) => {
  const tenants = await req.db('tenants').select('*').orderBy('created_at', 'desc');
  res.render('tenants/index', { 
    user: req.user, 
    tenants,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.post('/tenants', async (req, res) => {
  if (!req.user) {
    req.session.flash = 'Please login to create a tenant.';
    req.session.flashType = 'error';
    return res.redirect('/auth/login');
  }

  const { name, slug, reason } = req.body || {};
  if (!name || !slug) {
    req.session.flash = 'Name and slug are required.';
    req.session.flashType = 'error';
    return res.redirect('/tenants');
  }

  try {
    const existing = await req.db('tenants').where({ slug }).first();
    if (existing) {
      req.session.flash = 'A tenant with this slug already exists.';
      req.session.flashType = 'error';
      return res.redirect('/tenants');
    }

    const pendingRequest = await req.db('tenant_requests')
      .where({ slug, status: 'pending' })
      .first();
    if (pendingRequest) {
      req.session.flash = 'A request for this slug is already pending.';
      req.session.flashType = 'error';
      return res.redirect('/tenants');
    }

    const user = await req.db('users').where({ id: req.user.id }).first();

    if (user.is_platform_admin) {
      const insertQuery = req.db('tenants').insert({ name, slug, status: 'active' });
      const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
      const tenantId = Array.isArray(inserted)
        ? typeof inserted[0] === 'object'
          ? inserted[0].id
          : inserted[0]
        : inserted;

      await req.db('memberships').insert({
        user_id: req.user.id,
        tenant_id: tenantId,
        role: 'owner'
      });

      req.session.flash = `Tenant "${name}" created successfully!`;
      req.session.flashType = 'success';
      return res.redirect('/tenants');
    }

    await req.db('tenant_requests').insert({ 
      user_id: req.user.id, 
      name, 
      slug, 
      reason: reason || null,
      status: 'pending' 
    });

    req.session.flash = `Request for "${name}" submitted. Awaiting admin approval.`;
    req.session.flashType = 'success';
    res.redirect('/tenants');
  } catch (err) {
    console.error('Tenant creation error:', err);
    req.session.flash = 'An error occurred. Please try again.';
    req.session.flashType = 'error';
    res.redirect('/tenants');
  }
});

router.get('/admin', async (req, res) => {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    req.session.flash = 'Platform admin access required.';
    req.session.flashType = 'error';
    return res.redirect('/');
  }

  const pendingRequests = await req.db('tenant_requests')
    .leftJoin('users', 'tenant_requests.user_id', 'users.id')
    .where('tenant_requests.status', 'pending')
    .select(
      'tenant_requests.*',
      'users.display_name as requester_name',
      'users.discord_id as requester_discord'
    )
    .orderBy('tenant_requests.created_at', 'desc');

  const recentRequests = await req.db('tenant_requests')
    .leftJoin('users as requester', 'tenant_requests.user_id', 'requester.id')
    .leftJoin('users as reviewer', 'tenant_requests.reviewed_by', 'reviewer.id')
    .whereNot('tenant_requests.status', 'pending')
    .select(
      'tenant_requests.*',
      'requester.display_name as requester_name',
      'reviewer.display_name as reviewer_name'
    )
    .orderBy('tenant_requests.reviewed_at', 'desc')
    .limit(20);

  res.render('admin/index', { 
    user: req.user, 
    pendingRequests,
    recentRequests,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.post('/admin/tenant-requests/:id/approve', async (req, res) => {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    req.session.flash = 'Platform admin access required.';
    req.session.flashType = 'error';
    return res.redirect('/');
  }

  const { id } = req.params;
  const { note } = req.body || {};

  try {
    const request = await req.db('tenant_requests').where({ id }).first();
    if (!request || request.status !== 'pending') {
      req.session.flash = 'Request not found or already processed.';
      req.session.flashType = 'error';
      return res.redirect('/admin');
    }

    const insertQuery = req.db('tenants').insert({ name: request.name, slug: request.slug, status: 'active' });
    const inserted = usePostgres ? await insertQuery.returning(['id']) : await insertQuery;
    const tenantId = Array.isArray(inserted)
      ? typeof inserted[0] === 'object'
        ? inserted[0].id
        : inserted[0]
      : inserted;

    await req.db('memberships').insert({
      user_id: request.user_id,
      tenant_id: tenantId,
      role: 'owner'
    });

    await req.db('tenant_requests').where({ id }).update({
      status: 'approved',
      reviewed_by: req.user.id,
      review_note: note || null,
      reviewed_at: new Date()
    });

    try {
      await installDefaultModules(request.slug);
    } catch (moduleErr) {
      console.warn('Failed to install default modules:', moduleErr.message);
    }

    req.session.flash = `Approved: ${request.name}`;
    req.session.flashType = 'success';
  } catch (err) {
    console.error('Approve error:', err);
    req.session.flash = 'Failed to approve request.';
    req.session.flashType = 'error';
  }
  res.redirect('/admin');
});

router.post('/admin/tenant-requests/:id/deny', async (req, res) => {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    req.session.flash = 'Platform admin access required.';
    req.session.flashType = 'error';
    return res.redirect('/');
  }

  const { id } = req.params;
  const { note } = req.body || {};

  try {
    const request = await req.db('tenant_requests').where({ id }).first();
    if (!request || request.status !== 'pending') {
      req.session.flash = 'Request not found or already processed.';
      req.session.flashType = 'error';
      return res.redirect('/admin');
    }

    await req.db('tenant_requests').where({ id }).update({
      status: 'denied',
      reviewed_by: req.user.id,
      review_note: note || null,
      reviewed_at: new Date()
    });

    req.session.flash = `Denied: ${request.name}`;
    req.session.flashType = 'success';
  } catch (err) {
    console.error('Deny error:', err);
    req.session.flash = 'Failed to deny request.';
    req.session.flashType = 'error';
  }
  res.redirect('/admin');
});

export default router;
