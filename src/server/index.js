import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { initDb } from '../db/db.js';
import { attachUser } from './middleware/auth.js';
import { MockChainAdapter } from '../core/chain/MockChainAdapter.js';
import { renderMarkdown } from './markdown.js';
import homeRouter from './routes/home.js';
import authRouter from './routes/auth.js';
import doctrineRouter from './routes/doctrine.js';
import aarRouter from './routes/aars.js';
import eventsRouter from './routes/events.js';
import rosterRouter from './routes/roster.js';
import meRouter from './routes/me.js';
import adminRouter from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = initDb();
const chainAdapter = new MockChainAdapter();

app.locals.db = db;
app.locals.chainAdapter = chainAdapter;
app.locals.renderMarkdown = renderMarkdown;
app.locals.appName = 'VITA Frontier';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, _res, next) => {
  // Basic flash helper stored in session
  res.locals.flash = req.session?.flash || null;
  req.session.flash = null;
  next();
});
app.use(attachUser(db));

app.use('/', homeRouter);
app.use('/auth', authRouter);
app.use('/doctrine', doctrineRouter);
app.use('/aars', aarRouter);
app.use('/events', eventsRouter);
app.use('/roster', rosterRouter);
app.use('/me', meRouter);
app.use('/admin', adminRouter);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

app.listen(config.port, () => {
  console.log(`VITA Frontier listening on http://localhost:${config.port}`);
});
