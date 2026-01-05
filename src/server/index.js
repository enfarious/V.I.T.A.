import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { db, usePostgres } from '../db/client.js';
import { migrateLatest, seedDev } from '../db/migrate.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import tenantsRouter from './routes/tenants.js';
import tenantModulesRouter from './routes/tenantModules.js';
import viewsRouter from './routes/views.js';
import oauthRouter from './routes/oauth.js';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  await migrateLatest();
  if (config.env !== 'production') {
    await seedDev();
  }

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, 'public')));
  const isSecure = config.sessionCookieSecure || config.env === 'production';
  const PgStore = pgSession(session);
  
  const sessionConfig = {
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000
    }
  };

  if (usePostgres && process.env.DATABASE_URL) {
    sessionConfig.store = new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true
    });
  }

  app.use(session(sessionConfig));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use((req, _res, next) => {
    req.db = db;
    next();
  });
  app.use(loadUser());

  app.use(viewsRouter);
  app.use(oauthRouter);
  app.use('/api', apiRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/tenants', tenantsRouter);
  app.use('/t', tenantModulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`VITA Frontier spine listening on http://0.0.0.0:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
