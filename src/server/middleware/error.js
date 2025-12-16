import { config } from '../../config.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'not_found' });
}

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err?.status || 500;
  res.status(status).json({
    error: err.code || 'internal_error',
    message: config.env === 'production' ? undefined : err.message || 'Unexpected error'
  });
}
