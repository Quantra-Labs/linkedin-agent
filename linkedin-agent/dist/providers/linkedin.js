import Bottleneck from 'bottleneck';
import { safetyService } from '../services/safety.js';
import { logger } from '../utils/logger.js';
export class SafeLinkedInProvider {
    limiter = new Bottleneck({
        minTime: 2_000,
        maxConcurrent: 1,
    });
    async requestConnection(params) {
        const can = await safetyService.canPerform(params.userId, 'CONNECTION_SENT');
        if (!can.allowed) {
            logger.warn({ remaining: can.remaining }, 'Connection cap reached');
            return { ok: false, scheduled: true, reason: 'Daily connection cap reached' };
        }
        return this.limiter.schedule(async () => {
            logger.info({ lead: params.leadProfileUrl }, 'Simulate LinkedIn connection request');
            // Placeholder: integrate official APIs or user-authorized flows only.
            await safetyService.increment(params.userId, 'CONNECTION_SENT');
            return { ok: true };
        });
    }
    async sendMessage(params) {
        const can = await safetyService.canPerform(params.userId, 'MESSAGE_SENT');
        if (!can.allowed) {
            logger.warn({ remaining: can.remaining }, 'Message cap reached');
            return { ok: false, scheduled: true, reason: 'Daily DM cap reached' };
        }
        return this.limiter.schedule(async () => {
            logger.info({ to: params.leadProfileUrl }, 'Simulate LinkedIn DM');
            // Placeholder: integrate official APIs or user-authorized flows only.
            await safetyService.increment(params.userId, 'MESSAGE_SENT');
            return { ok: true };
        });
    }
}
export const linkedinProvider = new SafeLinkedInProvider();
