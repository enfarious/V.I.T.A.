const VISIBILITY_ORDER = ['public', 'member', 'role', 'custom'];

export const AccessReasons = {
  TENANT_SCOPE_MISMATCH: 'DENY_TENANT_SCOPE_MISMATCH',
  NOT_AUTHENTICATED: 'DENY_NOT_AUTHENTICATED',
  MEMBERSHIP_REQUIRED: 'DENY_MEMBERSHIP_REQUIRED',
  MEMBERSHIP_INACTIVE: 'DENY_MEMBERSHIP_INACTIVE',
  MEMBERSHIP_BANNED: 'DENY_MEMBERSHIP_BANNED',
  EXPLICIT_DENY_USER: 'DENY_EXPLICIT_USER',
  EXPLICIT_DENY_ROLE: 'DENY_EXPLICIT_ROLE',
  ALLOW_PUBLIC: 'ALLOW_PUBLIC',
  ALLOW_MEMBER: 'ALLOW_MEMBER',
  ALLOW_EXPLICIT_USER: 'ALLOW_EXPLICIT_USER',
  ALLOW_EXPLICIT_ROLE: 'ALLOW_EXPLICIT_ROLE',
  NO_ALLOW_MATCH: 'DENY_NO_ALLOW_MATCH'
};

function visibilityRank(v) {
  const idx = VISIBILITY_ORDER.indexOf(v || 'public');
  return idx === -1 ? VISIBILITY_ORDER.length : idx;
}

function normalizePermissions(policy) {
  const perms = policy?.permissions || policy?.permission_entries || [];
  if (Array.isArray(perms)) return perms;
  return [];
}

export function clampVisibility(moduleVisibility, parentVisibility) {
  if (!parentVisibility) return moduleVisibility;
  const moduleRank = visibilityRank(moduleVisibility);
  const parentRank = visibilityRank(parentVisibility);
  return moduleRank < parentRank ? parentVisibility : moduleVisibility;
}

export function evaluateAccess(subject, resource, policy = {}, opts = {}) {
  const trace = [];
  const { tenant_id: resourceTenantId } = resource || {};
  const { tenant_id: subjectTenantId, membership } = subject || {};
  const visibility = clampVisibility(policy.visibility || resource?.visibility || 'public', policy.parentVisibility);
  const permissions = normalizePermissions(policy);
  const roles = membership?.roles || [];
  const userId = subject?.user_id || subject?.id;

  if (resourceTenantId && subjectTenantId && resourceTenantId !== subjectTenantId) {
    trace.push(AccessReasons.TENANT_SCOPE_MISMATCH);
    return { allowed: false, reason: AccessReasons.TENANT_SCOPE_MISMATCH, trace };
  }

  // Banned members are denied everywhere within the tenant.
  if (membership && membership.status === 'banned') {
    trace.push(AccessReasons.MEMBERSHIP_BANNED);
    return { allowed: false, reason: AccessReasons.MEMBERSHIP_BANNED, trace };
  }

  if (visibility !== 'public') {
    if (!userId || !membership) {
      trace.push(AccessReasons.MEMBERSHIP_REQUIRED);
      return { allowed: false, reason: AccessReasons.MEMBERSHIP_REQUIRED, trace };
    }
    if (membership.status === 'banned') {
      trace.push(AccessReasons.MEMBERSHIP_BANNED);
      return { allowed: false, reason: AccessReasons.MEMBERSHIP_BANNED, trace };
    }
    if (membership.status && membership.status !== 'active') {
      trace.push(AccessReasons.MEMBERSHIP_INACTIVE);
      return { allowed: false, reason: AccessReasons.MEMBERSHIP_INACTIVE, trace };
    }
  }

  // Explicit denies (apply even for public)
  for (const p of permissions) {
    if (p.permission_type === 'deny_user' && p.user_id && userId && p.user_id === userId) {
      trace.push(AccessReasons.EXPLICIT_DENY_USER);
      return { allowed: false, reason: AccessReasons.EXPLICIT_DENY_USER, trace };
    }
    if (p.permission_type === 'deny_role' && p.tenant_role_id && roles.includes(p.role_slug || p.tenant_role_id)) {
      trace.push(AccessReasons.EXPLICIT_DENY_ROLE);
      return { allowed: false, reason: AccessReasons.EXPLICIT_DENY_ROLE, trace };
    }
  }

  if (visibility === 'public') {
    trace.push(AccessReasons.ALLOW_PUBLIC);
    return { allowed: true, reason: AccessReasons.ALLOW_PUBLIC, trace };
  }

  if (!membership || membership.status !== 'active') {
    trace.push(AccessReasons.MEMBERSHIP_INACTIVE);
    return { allowed: false, reason: AccessReasons.MEMBERSHIP_INACTIVE, trace };
  }

  if (visibility === 'member') {
    trace.push(AccessReasons.ALLOW_MEMBER);
    return { allowed: true, reason: AccessReasons.ALLOW_MEMBER, trace };
  }

  // Explicit allows for role/custom
  for (const p of permissions) {
    if (p.permission_type === 'allow_user' && p.user_id && userId && p.user_id === userId) {
      trace.push(AccessReasons.ALLOW_EXPLICIT_USER);
      return { allowed: true, reason: AccessReasons.ALLOW_EXPLICIT_USER, trace };
    }
    if (p.permission_type === 'allow_role') {
      const match = roles.includes(p.role_slug || p.tenant_role_id);
      if (match) {
        trace.push(AccessReasons.ALLOW_EXPLICIT_ROLE);
        return { allowed: true, reason: AccessReasons.ALLOW_EXPLICIT_ROLE, trace };
      }
    }
  }

  return { allowed: false, reason: AccessReasons.NO_ALLOW_MATCH, trace };
}
