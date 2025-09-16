import express from 'express';
import { logger } from './utils/logger.js';
import { registerApi } from './api/index.js';
import { startScheduler } from './workers/scheduler.js';
const app = express();
app.use(express.json());
registerApi(app);
const port = process.env.PORT || 3000;
app.listen(port, () => {
    logger.info({ port }, 'Server listening');
});
startScheduler();
