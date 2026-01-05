import { Router } from 'express';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import migrations from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const moduleConfig = {
  id: 'basic_tribe_ui',
  name: 'Basic Tribe UI',
  version: '0.1.0',
  description: 'Simple tribe management UI - members, roles, ranks',
  migrations,
  hasUI: true,
  publicDir: path.join(__dirname, 'public')
};

export function createRoutes() {
  const router = Router();

  router.use('/assets', express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true
  }));

  router.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ 
          error: 'Module UI not built',
          message: 'Run build to generate frontend assets',
          api_available: true
        });
      }
    });
  });

  router.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    res.sendFile(adminPath, (err) => {
      if (err) {
        res.status(404).json({ error: 'Admin page not found' });
      }
    });
  });

  router.get('/me', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const ownerCheck = await db('tenant_memberships')
        .where({ tenant_id: tenant.id, user_id: user.id })
        .first();

      const memberResult = await db.raw(`
        SELECT m.*, r.name as rank_name, r.permissions
        FROM ${schemaName}.tribe_members m
        LEFT JOIN ${schemaName}.tribe_ranks r ON m.rank_id = r.id
        WHERE m.user_id = ?
      `, [user.id]);
      
      let membership = memberResult.rows[0] || null;

      if (!membership) {
        const pendingResult = await db.raw(`
          SELECT * FROM ${schemaName}.join_requests
          WHERE user_id = ? AND status = 'pending'
        `, [user.id]);
        
        if (pendingResult.rows[0]) {
          membership = { status: 'pending', ...pendingResult.rows[0] };
        }
      }

      if (ownerCheck?.role === 'owner' && membership) {
        membership.role = 'owner';
      } else if (ownerCheck?.role === 'owner' && !membership) {
        membership = { role: 'owner', rank_name: 'Owner', status: 'active' };
      }

      res.json({ 
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        user: { id: user.id, display_name: user.display_name },
        membership 
      });
    } catch (err) {
      console.error('Module /me error:', err);
      res.status(500).json({ error: 'Failed to fetch membership' });
    }
  });

  router.post('/join', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { character_name, wallet_address, note } = req.body;
    
    if (!character_name || character_name.trim().length < 2) {
      return res.status(400).json({ error: 'Character name is required (min 2 chars)' });
    }

    try {
      const existingMember = await db.raw(`
        SELECT id FROM ${schemaName}.tribe_members WHERE user_id = ?
      `, [user.id]);
      
      if (existingMember.rows[0]) {
        return res.status(400).json({ error: 'Already a member of this tribe' });
      }

      const existingRequest = await db.raw(`
        SELECT id, status FROM ${schemaName}.join_requests WHERE user_id = ?
      `, [user.id]);
      
      if (existingRequest.rows[0]) {
        const status = existingRequest.rows[0].status;
        if (status === 'pending') {
          return res.status(400).json({ error: 'You already have a pending request' });
        }
        if (status === 'denied') {
          await db.raw(`DELETE FROM ${schemaName}.join_requests WHERE user_id = ?`, [user.id]);
        }
      }

      await db.raw(`
        INSERT INTO ${schemaName}.join_requests (user_id, character_name, wallet_address, note)
        VALUES (?, ?, ?, ?)
      `, [user.id, character_name.trim(), wallet_address || null, note || null]);

      res.status(201).json({ success: true, message: 'Join request submitted' });
    } catch (err) {
      console.error('Join request error:', err);
      res.status(500).json({ error: 'Failed to submit join request' });
    }
  });

  router.get('/join-requests', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const ownerCheck = await db('tenant_memberships')
      .where({ tenant_id: tenant.id, user_id: user.id })
      .first();
    
    if (!ownerCheck || !['owner', 'admin'].includes(ownerCheck.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    try {
      const result = await db.raw(`
        SELECT jr.*, u.display_name, u.discord_id, u.discord_avatar
        FROM ${schemaName}.join_requests jr
        LEFT JOIN users u ON jr.user_id = u.id
        WHERE jr.status = 'pending'
        ORDER BY jr.created_at ASC
      `);
      
      const requests = result.rows.map(r => ({
        ...r,
        avatar_url: r.discord_avatar 
          ? `https://cdn.discordapp.com/avatars/${r.discord_id}/${r.discord_avatar}.png`
          : null
      }));

      res.json({ requests });
    } catch (err) {
      console.error('List join requests error:', err);
      res.status(500).json({ error: 'Failed to fetch join requests' });
    }
  });

  router.post('/join-requests/:id/approve', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    const { id } = req.params;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const ownerCheck = await db('tenant_memberships')
      .where({ tenant_id: tenant.id, user_id: user.id })
      .first();
    
    if (!ownerCheck || !['owner', 'admin'].includes(ownerCheck.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    try {
      const request = await db.raw(`
        SELECT jr.*, u.discord_id, u.discord_avatar
        FROM ${schemaName}.join_requests jr
        LEFT JOIN users u ON jr.user_id = u.id
        WHERE jr.id = ? AND jr.status = 'pending'
      `, [id]);
      
      if (!request.rows[0]) {
        return res.status(404).json({ error: 'Request not found or already processed' });
      }

      const jr = request.rows[0];

      const defaultRank = await db.raw(`
        SELECT id FROM ${schemaName}.tribe_ranks WHERE name = 'Member' LIMIT 1
      `);
      const rankId = defaultRank.rows[0]?.id || null;

      const avatarUrl = jr.discord_avatar 
        ? `https://cdn.discordapp.com/avatars/${jr.discord_id}/${jr.discord_avatar}.png`
        : null;

      await db.raw(`
        INSERT INTO ${schemaName}.tribe_members (user_id, character_name, wallet_address, avatar_url, rank_id, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `, [jr.user_id, jr.character_name, jr.wallet_address, avatarUrl, rankId]);

      await db.raw(`
        UPDATE ${schemaName}.join_requests 
        SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?
      `, [user.id, id]);

      res.json({ success: true, message: 'Member approved' });
    } catch (err) {
      console.error('Approve request error:', err);
      res.status(500).json({ error: 'Failed to approve request' });
    }
  });

  router.post('/join-requests/:id/deny', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    const { id } = req.params;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const ownerCheck = await db('tenant_memberships')
      .where({ tenant_id: tenant.id, user_id: user.id })
      .first();
    
    if (!ownerCheck || !['owner', 'admin'].includes(ownerCheck.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    try {
      const result = await db.raw(`
        UPDATE ${schemaName}.join_requests 
        SET status = 'denied', reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ? AND status = 'pending'
        RETURNING *
      `, [user.id, id]);
      
      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Request not found or already processed' });
      }

      res.json({ success: true, message: 'Request denied' });
    } catch (err) {
      console.error('Deny request error:', err);
      res.status(500).json({ error: 'Failed to deny request' });
    }
  });

  router.get('/members', async (req, res) => {
    const { tenant, schemaName, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    try {
      const members = await db.raw(`
        SELECT m.*, u.display_name, u.discord_id, u.discord_avatar, r.name as rank_name
        FROM ${schemaName}.tribe_members m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN ${schemaName}.tribe_ranks r ON m.rank_id = r.id
        WHERE m.status = 'active'
        ORDER BY m.rank_order ASC, m.joined_at ASC
      `);
      
      const formattedMembers = members.rows.map(m => ({
        ...m,
        avatar_url: m.avatar_url || (m.discord_avatar 
          ? `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.discord_avatar}.png`
          : null)
      }));

      res.json({ members: formattedMembers });
    } catch (err) {
      console.error('Module members error:', err);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  router.get('/ranks', async (req, res) => {
    const { tenant, schemaName, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    try {
      const ranks = await db.raw(`
        SELECT * FROM ${schemaName}.tribe_ranks
        ORDER BY rank_order ASC
      `);
      res.json({ ranks: ranks.rows });
    } catch (err) {
      console.error('Module ranks error:', err);
      res.status(500).json({ error: 'Failed to fetch ranks' });
    }
  });

  router.post('/ranks', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { name, permissions, rank_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
      const result = await db.raw(`
        INSERT INTO ${schemaName}.tribe_ranks (name, permissions, rank_order)
        VALUES (?, ?, ?)
        RETURNING *
      `, [name, JSON.stringify(permissions || []), rank_order || 999]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create rank error:', err);
      res.status(500).json({ error: 'Failed to create rank' });
    }
  });

  router.get('/access-lists', async (req, res) => {
    const { tenant, schemaName, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    try {
      const lists = await db.raw(`
        SELECT * FROM ${schemaName}.access_lists
        ORDER BY name ASC
      `);
      res.json({ access_lists: lists.rows });
    } catch (err) {
      console.error('Module access lists error:', err);
      res.status(500).json({ error: 'Failed to fetch access lists' });
    }
  });

  router.get('/settings', async (req, res) => {
    const { tenant, schemaName, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    try {
      const settings = await db.raw(`
        SELECT * FROM ${schemaName}.tribe_settings
        LIMIT 1
      `);
      res.json(settings.rows[0] || { visibility: 'public', join_policy: 'approval' });
    } catch (err) {
      console.error('Module settings error:', err);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  router.post('/settings', async (req, res) => {
    const { tenant, schemaName, user, db } = req;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const ownerCheck = await db('tenant_memberships')
      .where({ tenant_id: tenant.id, user_id: user.id })
      .first();
    
    if (!ownerCheck || !['owner', 'admin'].includes(ownerCheck.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { join_policy, visibility } = req.body;

    try {
      const existing = await db.raw(`SELECT id FROM ${schemaName}.tribe_settings LIMIT 1`);
      
      if (existing.rows[0]) {
        await db.raw(`
          UPDATE ${schemaName}.tribe_settings
          SET join_policy = ?, visibility = ?, updated_at = NOW()
          WHERE id = ?
        `, [join_policy || 'approval', visibility || 'public', existing.rows[0].id]);
      } else {
        await db.raw(`
          INSERT INTO ${schemaName}.tribe_settings (join_policy, visibility)
          VALUES (?, ?)
        `, [join_policy || 'approval', visibility || 'public']);
      }

      res.json({ success: true, join_policy, visibility });
    } catch (err) {
      console.error('Save settings error:', err);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  return router;
}
