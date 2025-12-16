export const config = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'vita-frontier-dev-secret',
  dbPath: process.env.DB_PATH || 'src/db/vita.db'
};
