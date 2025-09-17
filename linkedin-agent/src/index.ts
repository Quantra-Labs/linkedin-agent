import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './utils/logger.js';
import { registerApi } from './api/index.js';
import { startScheduler } from './workers/scheduler.js';

const app = express();
app.use(express.json());

registerApi(app);

// Serve static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info({ port }, 'Server listening');
});

startScheduler();
