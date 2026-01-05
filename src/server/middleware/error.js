import { config } from '../../config.js';

function wantsJson(req) {
  const accept = req.get('Accept') || '';
  return accept.includes('application/json') || req.path.startsWith('/api/');
}

export function notFoundHandler(req, res) {
  if (wantsJson(req)) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(404).render('error', { message: 'Page not found.', user: req.user });
}

export function errorHandler(err, req, res, _next) {
  console.error(err);
  const status = err?.status || 500;
  const message = config.env === 'production' ? 'An unexpected error occurred.' : (err.message || 'Unexpected error');
  
  if (wantsJson(req)) {
    return res.status(status).json({
      error: err.code || 'internal_error',
      message: config.env === 'production' ? undefined : message
    });
  }
  res.status(status).render('error', { message, user: req.user });
}
