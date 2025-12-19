import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
import path from 'path';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { migrateLatest, seedDev } from '../db/migrate.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import tenantsRouter from './routes/tenants.js';
import tenantModulesRouter from './routes/tenantModules.js';
import uiRouter from './routes/ui.js';
import { ensureRootWalletAdmins } from './services/platformAdmins.js';
import adminRouter from './routes/admin.js';

export async function createApp() {
  await migrateLatest();
  if (config.env !== 'production' && config.env !== 'test') {
    await seedDev();
  }
  await ensureRootWalletAdmins(db);

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.resolve('src', 'server', 'views'));
  app.locals.appName = 'VITA Frontier';
  app.locals.version = config.version;
  app.locals.commit = config.commit || 'dev';

  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.resolve('src', 'server', 'public')));
  app.use('/css', express.static(path.resolve('src', 'server', 'public', 'css')));
  app.use('/js', express.static(path.resolve('src', 'server', 'public', 'js')));
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.sessionCookieSecure
      }
    })
  );

  app.use((req, _res, next) => {
    req.db = db;
    next();
  });
  app.use(loadUser());
  app.use((req, res, next) => {
    res.locals.app = req.app;
    res.locals.user = req.user;
    res.locals.flash = req.session?.flash || null;
    if (req.session) req.session.flash = null;
    next();
  });

  app.use('/', uiRouter);
  app.get('/favicon.ico', (_req, res) => {
    res.type('image/svg+xml').sendFile(path.resolve('src', 'server', 'public', 'favicon.svg'));
  });
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use('/me', meRouter);
  app.use('/tenants', tenantsRouter);
  app.use('/t', tenantModulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  const app = await createApp();
  app.listen(config.port, config.host, () => {
    console.log(`VITA Frontier spine listening on http://${config.host}:${config.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}
