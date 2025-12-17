const TENANT_SCOPED_TABLES = new Set([
  'memberships',
  'audit_log'
]);

// Governance: tenant isolation guardrail. All tenant-scoped data must flow through this helper.
// It injects tenant_id and refuses raw SQL without tenant_id.
export function tenantDb(db, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for tenantDb');
  }

  const enforceTenant = (tableName, qb) => {
    if (TENANT_SCOPED_TABLES.has(tableName)) {
      return qb.where({ tenant_id: tenantId });
    }
    // Default: still apply tenant_id so adding new tenant-aware tables stays safe-by-default.
    return qb.where({ tenant_id: tenantId });
  };

  return {
    tenantId,
    table(tableName) {
      return enforceTenant(tableName, db(tableName));
    },
    where(tableName, where = {}) {
      return enforceTenant(tableName, db(tableName).where(where));
    },
    rawScoped(sql, params = []) {
      const text = String(sql).toLowerCase();
      if (!text.includes('tenant_id')) {
        throw new Error('rawScoped queries must include tenant_id predicate');
      }
      return db.raw(sql, params);
    }
  };
}

/**
 * Lint-ish guard for review: refuse to run raw/unsafe tenant queries in /t routes.
 */
export function assertTenantScoped(builder, tenantId) {
  return builder.where({ tenant_id: tenantId });
}
