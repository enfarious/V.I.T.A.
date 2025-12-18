/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  if (process.env.NODE_ENV === 'production') return;
  // Dev seed intentionally empty; wallet login flow creates users on demand.
}
