import cron from 'node-cron';
import { cadenceService } from '../services/cadence.js';
import { logger } from '../utils/logger.js';
export function startScheduler() {
    cron.schedule('*/5 * * * *', async () => {
        try {
            const n = await cadenceService.processDueAssignments();
            if (n > 0)
                logger.info({ processed: n }, 'Processed due assignments');
        }
        catch (err) {
            logger.error({ err }, 'Scheduler tick failed');
        }
    });
    logger.info('Scheduler started (every 5 minutes)');
}
