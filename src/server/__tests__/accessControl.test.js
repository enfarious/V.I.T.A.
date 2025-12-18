import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccess, AccessReasons, clampVisibility } from '../access/canAccess.js';

const tenantResource = { tenant_id: 1, visibility: 'public' };

test('allows public access', () => {
  const res = evaluateAccess({}, tenantResource, { visibility: 'public' });
  assert.equal(res.allowed, true);
  assert.equal(res.reason, AccessReasons.ALLOW_PUBLIC);
});

test('denies tenant scope mismatch', () => {
  const res = evaluateAccess({ tenant_id: 2 }, { tenant_id: 1 }, { visibility: 'public' });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, AccessReasons.TENANT_SCOPE_MISMATCH);
});

test('denies member-only without membership', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5 },
    { tenant_id: 1 },
    { visibility: 'member' }
  );
  assert.equal(res.allowed, false);
  assert.equal(res.reason, AccessReasons.MEMBERSHIP_REQUIRED);
});

test('denies banned even for public', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5, membership: { status: 'banned' } },
    { tenant_id: 1 },
    { visibility: 'public' }
  );
  assert.equal(res.allowed, false);
  assert.equal(res.reason, AccessReasons.MEMBERSHIP_BANNED);
});

test('allows member visibility with active membership', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5, membership: { status: 'active' } },
    { tenant_id: 1 },
    { visibility: 'member' }
  );
  assert.equal(res.allowed, true);
  assert.equal(res.reason, AccessReasons.ALLOW_MEMBER);
});

test('denies on explicit role deny', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5, membership: { status: 'active', roles: ['admin'] } },
    { tenant_id: 1 },
    {
      visibility: 'role',
      permissions: [{ permission_type: 'deny_role', tenant_role_id: 'admin' }]
    }
  );
  assert.equal(res.allowed, false);
  assert.equal(res.reason, AccessReasons.EXPLICIT_DENY_ROLE);
});

test('allows role-based permit', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5, membership: { status: 'active', roles: ['admin'] } },
    { tenant_id: 1 },
    {
      visibility: 'role',
      permissions: [{ permission_type: 'allow_role', tenant_role_id: 'admin' }]
    }
  );
  assert.equal(res.allowed, true);
  assert.equal(res.reason, AccessReasons.ALLOW_EXPLICIT_ROLE);
});

test('denies when no allow matches custom', () => {
  const res = evaluateAccess(
    { tenant_id: 1, user_id: 5, membership: { status: 'active', roles: ['member'] } },
    { tenant_id: 1 },
    { visibility: 'custom', permissions: [] }
  );
  assert.equal(res.allowed, false);
  assert.equal(res.reason, AccessReasons.NO_ALLOW_MATCH);
});

test('clamps module visibility to parent strictness', () => {
  const effective = clampVisibility('public', 'member');
  assert.equal(effective, 'member');
});
