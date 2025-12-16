import { Router } from 'express';
import { config } from '../../config.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    version: config.version,
    commit: config.commit,
    timestamp: new Date().toISOString()
  });
});

export default router;
