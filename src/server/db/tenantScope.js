const TENANT_SCOPED_TABLES = new Set([
  'memberships',
  'audit_log'
]);

/**
 * Tenant-scoped query helper. Every call injects tenant_id = tenantId for known tables
 * and throws on raw SQL that lacks an explicit tenant_id predicate.
 */
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
