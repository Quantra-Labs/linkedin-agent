import { addDays, startOfDay } from 'date-fns';
import { prisma } from '../utils/prisma.js';
import { config } from '../config/config.js';
export class SafetyService {
    async getCountForToday(userId, action) {
        const today = startOfDay(new Date());
        const counter = await prisma.safetyCounter.findUnique({
            where: {
                userId_date_provider_type: {
                    userId,
                    date: today,
                    provider: 'LINKEDIN',
                    type: action,
                },
            },
        });
        return counter?.count ?? 0;
    }
    async increment(userId, action, amount = 1) {
        const today = startOfDay(new Date());
        await prisma.safetyCounter.upsert({
            where: {
                userId_date_provider_type: {
                    userId,
                    date: today,
                    provider: 'LINKEDIN',
                    type: action,
                },
            },
            update: { count: { increment: amount } },
            create: {
                userId,
                date: today,
                provider: 'LINKEDIN',
                type: action,
                count: amount,
            },
        });
    }
    getLimitFor(action) {
        if (action === 'MESSAGE_SENT')
            return config.DAILY_DM_LIMIT;
        return config.DAILY_CONNECTION_LIMIT;
    }
    async canPerform(userId, action) {
        const count = await this.getCountForToday(userId, action);
        const limit = this.getLimitFor(action);
        return { allowed: count < limit, remaining: Math.max(limit - count, 0) };
    }
    // Exponential backoff based on retries
    computeBackoffMs(retry, baseMs = 5_000, maxMs = 5 * 60_000) {
        const jitter = Math.random() * 0.2 + 0.9;
        return Math.min(Math.floor(baseMs * 2 ** retry * jitter), maxMs);
    }
    // Safety window helper for scheduling into next day if over cap
    computeNextWindowIfCapped() {
        const earliest = addDays(startOfDay(new Date()), 1);
        const latest = addDays(earliest, 1);
        return { earliest, latest };
    }
}
export const safetyService = new SafetyService();
