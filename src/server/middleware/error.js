import { config } from '../../config.js';

export function notFoundHandler(req, res) {
  if ((req.get('accept') || '').includes('text/html')) {
    return res.status(404).render('error', { title: 'Not found', message: 'The requested resource was not found.' });
  }
  res.status(404).json({ error: 'not_found' });
}

export function errorHandler(err, req, res, _next) {
  console.error(err);
  const status = err?.status || 500;
  if ((req.get('accept') || '').includes('text/html')) {
    return res
      .status(status)
      .render('error', {
        title: status === 403 ? 'Access denied' : 'Error',
        message: config.env === 'production' ? 'Something went wrong.' : err.message || 'Unexpected error'
      });
  }
  res.status(status).json({
    error: err.code || 'internal_error',
    message: config.env === 'production' ? undefined : err.message || 'Unexpected error'
  });
}
