import { Router } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';
import { resolveTenant, requireTenant, requireMembership } from '../middleware/tenant.js';
import { getModule, getAllModules, getInstalledModules, installModuleForTenant } from '../../modules/index.js';
import { createAssetSyncService } from '../../services/assetSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.resolve(__dirname, '../../../storage/tenants');

const router = Router();

router.use('/:slug', resolveTenant(), requireTenant);

router.use('/:slug', (req, _res, next) => {
  const slug = req.tenant?.slug || req.params.slug;
  req.schemaName = `tenant_${slug.replace(/-/g, '_')}`;
  next();
});

router.get('/:slug', requireAuth, requireMembership(), async (req, res) => {
  const installed = await getInstalledModules(req.tenant.slug);
  const available = getAllModules().map(m => ({
    id: m.id,
    name: m.name,
    version: m.version,
    installed: installed.includes(m.id)
  }));

  const assetRecords = await req.db('tenant_module_assets')
    .where({ tenant_id: req.tenant.id });
  
  const assetSources = {};
  assetRecords.forEach(a => { assetSources[a.module_id] = a; });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({
      tenant: req.tenant,
      membership: req.membership || null,
      modules: available
    });
  }

  res.render('tenants/portal', {
    user: req.user,
    tenant: req.tenant,
    membership: req.membership || null,
    modules: available,
    assetSources,
    flash: req.session?.flash,
    flashType: req.session?.flashType
  });
  req.session.flash = null;
  req.session.flashType = null;
});

router.post('/:slug/modules/:moduleId/install', requireAuth, requireMembership('owner'), async (req, res) => {
  const { moduleId } = req.params;
  const module = getModule(moduleId);
  
  if (!module) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(404).json({ error: 'Module not found' });
    }
    req.session.flash = 'Module not found.';
    req.session.flashType = 'error';
    return res.redirect(`/t/${req.tenant.slug}`);
  }

  try {
    await installModuleForTenant(req.tenant.slug, module);
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, module: moduleId });
    }
    req.session.flash = `Module "${module.name}" installed successfully!`;
    req.session.flashType = 'success';
    res.redirect(`/t/${req.tenant.slug}`);
  } catch (err) {
    console.error('Module install error:', err);
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to install module' });
    }
    req.session.flash = 'Failed to install module.';
    req.session.flashType = 'error';
    res.redirect(`/t/${req.tenant.slug}`);
  }
});

router.get('/:slug/modules/:moduleId/ui-source', requireAuth, requireMembership('owner'), async (req, res) => {
  const { moduleId } = req.params;
  
  const assetRecord = await req.db('tenant_module_assets')
    .where({ tenant_id: req.tenant.id, module_id: moduleId })
    .first();

  res.json({
    module_id: moduleId,
    source: assetRecord || null,
    storage_path: path.join(STORAGE_ROOT, req.tenant.slug, moduleId)
  });
});

router.post('/:slug/modules/:moduleId/ui-source', requireAuth, requireMembership('owner'), async (req, res) => {
  const { moduleId } = req.params;
  const { repo_url, branch = 'main' } = req.body;
  const isJson = req.headers.accept?.includes('application/json');

  if (!repo_url) {
    if (isJson) return res.status(400).json({ error: 'repo_url is required' });
    req.session.flash = 'Repository URL is required.';
    req.session.flashType = 'error';
    return res.redirect(`/t/${req.tenant.slug}`);
  }

  try {
    let assetRecord = await req.db('tenant_module_assets')
      .where({ tenant_id: req.tenant.id, module_id: moduleId })
      .first();

    if (assetRecord) {
      await req.db('tenant_module_assets')
        .where({ id: assetRecord.id })
        .update({ repo_url, branch, status: 'pending', updated_at: new Date() });
    } else {
      [assetRecord] = await req.db('tenant_module_assets')
        .insert({
          tenant_id: req.tenant.id,
          module_id: moduleId,
          source_type: 'github',
          repo_url,
          branch,
          status: 'pending'
        })
        .returning('*');
    }

    if (isJson) return res.json({ success: true, asset: assetRecord });
    req.session.flash = 'UI source configured. Click "Sync Now" to deploy.';
    req.session.flashType = 'success';
    res.redirect(`/t/${req.tenant.slug}`);
  } catch (err) {
    console.error('Set UI source error:', err);
    if (isJson) return res.status(500).json({ error: 'Failed to set UI source' });
    req.session.flash = 'Failed to set UI source.';
    req.session.flashType = 'error';
    res.redirect(`/t/${req.tenant.slug}`);
  }
});

router.post('/:slug/modules/:moduleId/ui-sync', requireAuth, requireMembership('owner'), async (req, res) => {
  const { moduleId } = req.params;
  const isJson = req.headers.accept?.includes('application/json');

  const assetRecord = await req.db('tenant_module_assets')
    .where({ tenant_id: req.tenant.id, module_id: moduleId })
    .first();

  if (!assetRecord || !assetRecord.repo_url) {
    if (isJson) return res.status(400).json({ error: 'No UI source configured. Set repo_url first.' });
    req.session.flash = 'No UI source configured. Set repo URL first.';
    req.session.flashType = 'error';
    return res.redirect(`/t/${req.tenant.slug}`);
  }

  try {
    const syncService = createAssetSyncService(req.db);
    const result = await syncService.syncFromGitHub(
      req.tenant.id,
      moduleId,
      assetRecord.repo_url,
      assetRecord.branch || 'main'
    );

    if (isJson) return res.json({ success: true, ...result });
    req.session.flash = 'UI synced successfully!';
    req.session.flashType = 'success';
    res.redirect(`/t/${req.tenant.slug}`);
  } catch (err) {
    console.error('UI sync error:', err);
    if (isJson) return res.status(500).json({ error: err.message || 'Failed to sync UI' });
    req.session.flash = `Sync failed: ${err.message}`;
    req.session.flashType = 'error';
    res.redirect(`/t/${req.tenant.slug}`);
  }
});

async function serveTenantAsset(req, res, assetPath, fallbackPath) {
  const urlPath = (req.path || '').replace(/^\//, '');
  
  const isStaticAsset = urlPath.startsWith('assets/') || 
    urlPath.match(/\.(js|css|png|jpg|svg|ico|woff|woff2|ttf|map|json)$/);

  if (isStaticAsset) {
    const tenantFile = path.join(assetPath, urlPath);
    try {
      await fs.access(tenantFile);
      return res.sendFile(tenantFile);
    } catch {
      if (fallbackPath) {
        const fallbackFile = path.join(fallbackPath, urlPath);
        try {
          await fs.access(fallbackFile);
          return res.sendFile(fallbackFile);
        } catch {}
      }
    }
    return null;
  }

  const isApiRoute = ['members', 'ranks', 'settings', 'access-lists', 'me', 'join', 'join-requests']
    .some(route => urlPath === route || urlPath.startsWith(route + '/'));
  
  if (isApiRoute) {
    return null;
  }

  const tenantIndex = path.join(assetPath, 'index.html');
  try {
    await fs.access(tenantIndex);
    return res.sendFile(tenantIndex);
  } catch {
    if (fallbackPath) {
      const fallbackIndex = path.join(fallbackPath, 'index.html');
      try {
        await fs.access(fallbackIndex);
        return res.sendFile(fallbackIndex);
      } catch {}
    }
  }

  return null;
}

router.use('/:slug/m/:moduleId', async (req, res, next) => {
  const { moduleId } = req.params;
  const module = getModule(moduleId);
  
  if (!module) {
    return res.status(404).json({ error: 'Module not found' });
  }

  const tenantAssetPath = path.join(STORAGE_ROOT, req.tenant.slug, moduleId);
  const fallbackPath = module.publicDir || null;

  const served = await serveTenantAsset(req, res, tenantAssetPath, fallbackPath);
  if (served !== null) return;

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (module.createRoutes) {
    const moduleRouter = module.createRoutes();
    return moduleRouter(req, res, next);
  }

  next();
});

export default router;
