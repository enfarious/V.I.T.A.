import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Configure test env before loading the app
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DB_PATH = ':memory:';
process.env.BASE_URL = 'http://localhost:3000';

let app;
let agentA;
let agentB;
let kpA;
let kpB;
let walletA;
async function walletLogin(agent, privKey) {
  const kp = privKey;
  const wallet_address = kp.toSuiAddress();

  const nonceRes = await agent.get('/auth/wallet/nonce');
  assert.equal(nonceRes.statusCode, 200);
  const { nonce_id, message_to_sign } = nonceRes.body;
  const msgBytes = new TextEncoder().encode(message_to_sign);
  const { signature } = await kp.signPersonalMessage(msgBytes);

  const verifyRes = await agent.post('/auth/wallet/verify').send({ nonce_id, address: wallet_address, signature });
  assert.equal(verifyRes.statusCode, 200);
  return wallet_address;
}

async function createTenant(agent, name, slug) {
  const res = await agent.post('/tenants').send({ name, slug });
  assert.equal(res.statusCode, 201);
  return res.body.tenant;
}

before(async () => {
  const { createApp } = await import('../../server/index.js');
  app = await createApp();
  agentA = request.agent(app);
  agentB = request.agent(app);
  kpA = Ed25519Keypair.generate();
  kpB = Ed25519Keypair.generate();
  walletA = await walletLogin(agentA, kpA);
  await walletLogin(agentB, kpB);
});

test('user cannot access another tenant and reads stay scoped', async () => {
  const tenantA = await createTenant(agentA, 'Tenant A', 'tenant-a');
  await createTenant(agentB, 'Tenant B', 'tenant-b');

  const resA = await agentA.get('/t/tenant-a/_debug/tenant');
  assert.equal(resA.statusCode, 200);
  assert.equal(resA.body.tenant.slug, tenantA.slug);
  assert.equal(resA.body.tenant.id, tenantA.id);
  assert.equal(resA.body.user.id > 0, true);
  assert.equal(resA.body.membership.role, 'owner');

  const resForbidden = await agentA.get('/t/tenant-b/_debug/tenant');
  assert.equal(resForbidden.statusCode, 403);

  const me = await agentA.get('/me');
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.memberships.length, 1);
  assert.equal(me.body.memberships[0].tenant_id, tenantA.id);
  assert.equal(me.body.memberships[0].slug, tenantA.slug);
  assert.equal(me.body.user.wallet_address, walletA);

  const membershipsDebug = await agentA.get('/t/tenant-a/_debug/memberships');
  assert.equal(membershipsDebug.statusCode, 200);
  assert.equal(membershipsDebug.body.memberships.length, 1);
  assert.equal(membershipsDebug.body.memberships[0].tenant_id, tenantA.id);
});
