import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Configure test env before loading the app
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DB_PATH = ':memory:';

let app;
let agentA;
let agentB;
let userA;

before(async () => {
  const { createApp } = await import('../../server/index.js');
  app = await createApp();
  agentA = request.agent(app);
  agentB = request.agent(app);
});

async function register(agent, email) {
  const res = await agent
    .post('/auth/register')
    .send({ email, display_name: email.split('@')[0], password: 'secret123' });
  assert.equal(res.statusCode, 201);
  return res.body.user;
}

async function createTenant(agent, name, slug) {
  const res = await agent.post('/tenants').send({ name, slug });
  assert.equal(res.statusCode, 201);
  return res.body.tenant;
}

test('user cannot access another tenant and reads stay scoped', async () => {
  userA = await register(agentA, 'userA@example.com');
  const tenantA = await createTenant(agentA, 'Tenant A', 'tenant-a');

  await register(agentB, 'userB@example.com');
  const tenantB = await createTenant(agentB, 'Tenant B', 'tenant-b');

  const resA = await agentA.get('/t/tenant-a/_debug/tenant');
  assert.equal(resA.statusCode, 200);
  assert.equal(resA.body.tenant.slug, tenantA.slug);
  assert.equal(resA.body.tenant.id, tenantA.id);
  assert.equal(resA.body.user.id, userA.id);
  assert.equal(resA.body.membership.role, 'owner');

  const resForbidden = await agentA.get('/t/tenant-b/_debug/tenant');
  assert.equal(resForbidden.statusCode, 403);

  const me = await agentA.get('/me');
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.memberships.length, 1);
  assert.equal(me.body.memberships[0].tenant_id, tenantA.id);
  assert.equal(me.body.memberships[0].slug, tenantA.slug);

  const membershipsDebug = await agentA.get('/t/tenant-a/_debug/memberships');
  assert.equal(membershipsDebug.statusCode, 200);
  assert.equal(membershipsDebug.body.memberships.length, 1);
  assert.equal(membershipsDebug.body.memberships[0].tenant_id, tenantA.id);
});
