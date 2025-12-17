export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member'
};

export const ROLE_LIST = Object.values(ROLES);

export function assertValidRole(role) {
  if (!ROLE_LIST.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  return role;
}
