import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
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

async function bootstrap() {
  await migrateLatest();
  if (config.env !== 'production') {
    await seedDev();
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
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

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/tenants', tenantsRouter);
  app.use('/t', tenantModulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`VITA Frontier spine listening on http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
