import { Router } from 'express';
import { config } from '../../config.js';
import { createChainAdapter } from '../../core/chain/index.js';
import { installDefaultModules } from '../../modules/index.js';
import { createProvisioningGateService } from '../../services/provisioningGates.js';
import { createAssetSyncService } from '../../services/assetSync.js';

const router = Router();
const chain = createChainAdapter(config.chain.adapter, config.chain.sui);

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: config.version,
    commit: config.commit,
    chain: config.chain.adapter
  });
});

router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const memberships = await req.db('memberships')
    .join('tenants', 'memberships.tenant_id', 'tenants.id')
    .where('memberships.user_id', req.user.id)
    .select('tenants.id as tenant_id', 'tenants.name', 'tenants.slug', 'memberships.role', 'memberships.created_at as joined_at');

  res.json({
    id: req.user.id,
    email: req.user.email,
    display_name: req.user.display_name,
    created_at: req.user.created_at,
    memberships
  });
});

router.get('/tenants', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tenants = await req.db('memberships')
    .join('tenants', 'memberships.tenant_id', 'tenants.id')
    .where('memberships.user_id', req.user.id)
    .select('tenants.*', 'memberships.role');

  res.json({ tenants });
});

router.get('/tenants/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const tenant = await req.db('tenants').where({ slug }).first();
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  let membership = null;
  if (req.user) {
    membership = await req.db('memberships')
      .where({ tenant_id: tenant.id, user_id: req.user.id })
      .first();
  }

  const memberCount = await req.db('memberships')
    .where({ tenant_id: tenant.id })
    .count('* as count')
    .first();

  res.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    created_at: tenant.created_at,
    member_count: parseInt(memberCount?.count || 0),
    my_role: membership?.role || null
  });
});

router.get('/tenants/:slug/members', async (req, res) => {
  const { slug } = req.params;
  
  const tenant = await req.db('tenants').where({ slug }).first();
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const members = await req.db('memberships')
    .join('users', 'memberships.user_id', 'users.id')
    .where({ tenant_id: tenant.id })
    .select(
      'users.id',
      'users.display_name',
      'users.email',
      'memberships.role',
      'memberships.created_at as joined_at'
    );

  res.json({ members });
});

router.get('/provisioning/check', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await req.db('users')
      .where({ id: req.user.id })
      .first();

    const authProviders = await req.db('auth_providers')
      .where({ user_id: req.user.id });
    
    user.auth_providers = authProviders;

    const gateService = createProvisioningGateService(req.db);
    const result = await gateService.checkGates(user);

    res.json(result);
  } catch (err) {
    console.error('Provisioning check error:', err);
    res.status(500).json({ error: 'Failed to check provisioning gates' });
  }
});

router.post('/tenants', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { name, slug, reason } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'Name and slug are required' });
  }

  const existing = await req.db('tenants').where({ slug }).first();
  if (existing) {
    return res.status(409).json({ error: 'Slug already exists' });
  }

  const pendingRequest = await req.db('tenant_requests')
    .where({ slug, status: 'pending' })
    .first();
  if (pendingRequest) {
    return res.status(409).json({ error: 'A request for this slug is already pending' });
  }

  try {
    const user = await req.db('users').where({ id: req.user.id }).first();
    const authProviders = await req.db('auth_providers').where({ user_id: req.user.id });
    user.auth_providers = authProviders;

    const gateService = createProvisioningGateService(req.db);
    const gateResult = await gateService.checkGates(user);

    if (!gateResult.passed) {
      return res.status(403).json({
        error: 'Provisioning requirements not met',
        blockers: gateResult.blockers.map(b => ({
          gate: b.gate,
          message: b.message,
          action: b.action
        }))
      });
    }

    if (user.is_platform_admin) {
      const [tenant] = await req.db('tenants')
        .insert({ name, slug, status: 'active' })
        .returning('*');

      await req.db('memberships').insert({
        user_id: req.user.id,
        tenant_id: tenant.id,
        role: 'owner'
      });

      try {
        await installDefaultModules(slug);
      } catch (err) {
        console.warn('Failed to install default modules:', err.message);
      }

      return res.status(201).json(tenant);
    }

    const [request] = await req.db('tenant_requests')
      .insert({ 
        user_id: req.user.id, 
        name, 
        slug, 
        reason: reason || null,
        status: 'pending' 
      })
      .returning('*');

    res.status(202).json({ 
      message: 'Tenant request submitted for approval',
      request: {
        id: request.id,
        name: request.name,
        slug: request.slug,
        status: request.status,
        created_at: request.created_at
      }
    });
  } catch (err) {
    console.error('Create tenant error:', err);
    res.status(500).json({ error: 'Failed to create tenant request' });
  }
});

router.get('/tenant-requests', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  const requests = await req.db('tenant_requests')
    .leftJoin('users as requester', 'tenant_requests.user_id', 'requester.id')
    .leftJoin('users as reviewer', 'tenant_requests.reviewed_by', 'reviewer.id')
    .select(
      'tenant_requests.*',
      'requester.display_name as requester_name',
      'requester.discord_id as requester_discord',
      'reviewer.display_name as reviewer_name'
    )
    .orderBy('tenant_requests.created_at', 'desc');

  res.json({ requests });
});

router.get('/my-tenant-requests', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const requests = await req.db('tenant_requests')
    .where({ user_id: req.user.id })
    .orderBy('created_at', 'desc');

  res.json({ requests });
});

router.post('/tenant-requests/:id/approve', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  const { id } = req.params;
  const { note } = req.body || {};

  const request = await req.db('tenant_requests').where({ id }).first();
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request is no longer pending' });
  }

  try {
    const [tenant] = await req.db('tenants')
      .insert({ name: request.name, slug: request.slug, status: 'active' })
      .returning('*');

    await req.db('memberships').insert({
      user_id: request.user_id,
      tenant_id: tenant.id,
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
    } catch (err) {
      console.warn('Failed to install default modules:', err.message);
    }

    res.json({ message: 'Request approved', tenant });
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

router.post('/tenant-requests/:id/deny', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await req.db('users').where({ id: req.user.id }).first();
  if (!user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  const { id } = req.params;
  const { note } = req.body || {};

  const request = await req.db('tenant_requests').where({ id }).first();
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request is no longer pending' });
  }

  await req.db('tenant_requests').where({ id }).update({
    status: 'denied',
    reviewed_by: req.user.id,
    review_note: note || null,
    reviewed_at: new Date()
  });

  res.json({ message: 'Request denied' });
});

router.delete('/tenants/:slug', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { slug } = req.params;
  const { confirm } = req.body || {};

  if (confirm !== slug) {
    return res.status(400).json({ 
      error: 'Confirmation required', 
      message: 'Send { "confirm": "<slug>" } in request body to confirm deletion' 
    });
  }
  
  const tenant = await req.db('tenants').where({ slug }).first();
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const membership = await req.db('memberships')
    .where({ tenant_id: tenant.id, user_id: req.user.id })
    .first();

  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can delete tenants' });
  }

  try {
    await req.db('audit_log').insert({
      tenant_id: tenant.id,
      actor_user_id: req.user.id,
      action: 'tenant_deleted',
      entity: 'tenant',
      entity_id: String(tenant.id),
      meta_json: JSON.stringify({ slug, name: tenant.name, deleted_at: new Date().toISOString() })
    }).catch(() => {});

    const schemaName = `tenant_${slug.replace(/-/g, '_')}`;
    await req.db.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    
    await req.db('memberships').where({ tenant_id: tenant.id }).del();
    await req.db('tenants').where({ id: tenant.id }).del();

    res.json({ success: true, deleted: slug });
  } catch (err) {
    console.error('Delete tenant error:', err);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

router.get('/chain/identity/:address', async (req, res) => {
  const { address } = req.params;
  
  try {
    await chain.connect();
    const identity = await chain.resolveIdentity({ address });
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }
    res.json(identity);
  } catch (err) {
    console.error('Chain identity error:', err);
    res.status(500).json({ error: 'Chain lookup failed' });
  }
});

router.get('/chain/tribe/:tribeId', async (req, res) => {
  const { tribeId } = req.params;
  
  try {
    await chain.connect();
    const tribe = await chain.getTribeInfo(tribeId);
    if (!tribe) {
      return res.status(404).json({ error: 'Tribe not found' });
    }
    res.json(tribe);
  } catch (err) {
    console.error('Chain tribe error:', err);
    res.status(500).json({ error: 'Chain lookup failed' });
  }
});

export default router;
