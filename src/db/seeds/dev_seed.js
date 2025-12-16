/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  if (process.env.NODE_ENV === 'production') return;

  const hasUsers = await knex('users').first();
  if (hasUsers) return;

  const passwordHash =
    '$2b$10$hbajG1JY0Cy3991HHstcnuvjyRmbKy96ZxkkD8Y/s7HKZ5xuNE4ya'; // admin123

  const [userId] = await knex('users').insert(
    {
      email: 'admin@example.com',
      password_hash: passwordHash,
      display_name: 'VITA Admin'
    },
    ['id']
  );
  const adminId = typeof userId === 'object' && userId !== null ? userId.id : userId;

  const [tenantId] = await knex('tenants').insert(
    {
      slug: 'demo',
      name: 'Demo Tenant',
      status: 'active'
    },
    ['id']
  );
  const demoTenantId = typeof tenantId === 'object' && tenantId !== null ? tenantId.id : tenantId;

  await knex('memberships').insert({
    user_id: adminId,
    tenant_id: demoTenantId,
    role: 'owner'
  });
}
