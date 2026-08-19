// HTTP API entrypoint. Serves the REST API and, in production, the built client.
// Optionally starts the monitoring worker in-process (MONITOR_ENABLED).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { getDb } from './db/index.js';
import { router as walletsRouter } from './routes/wallets.js';
import { router as miscRouter } from './routes/misc.js';
import { runLoop } from './worker.js';

export function createApp() {
  getDb(); // init DB + migrations
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // request logging (concise)
  app.use((req, _res, next) => {
    logger.debug('request', { method: req.method, path: req.path });
    next();
  });

  app.use('/api/wallets', walletsRouter);
  app.use('/api', miscRouter);

  // Serve built client if present.
  const clientDist = path.join(config.root, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err, _req, res, _next) => {
    logger.error('unhandled error', { error: err.message });
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

export function start() {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info('API listening', { port: config.port, dataSource: config.dataSource });
  });
  if (config.monitor.enabled) {
    runLoop().catch((err) => logger.error('worker loop error', { error: err.message }));
  }
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
