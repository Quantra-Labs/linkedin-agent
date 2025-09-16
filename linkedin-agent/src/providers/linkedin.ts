import Bottleneck from 'bottleneck';
import { safetyService } from '../services/safety.js';
import { logger } from '../utils/logger.js';

export type LinkedInConnectParams = {
	userId: string; // our system user
	leadProfileUrl: string;
	message?: string;
};

export type LinkedInMessageParams = {
	userId: string;
	leadProfileUrl: string;
	content: string;
};

export interface LinkedInProvider {
	requestConnection(params: LinkedInConnectParams): Promise<{ ok: boolean; scheduled?: boolean; reason?: string }>;
	sendMessage(params: LinkedInMessageParams): Promise<{ ok: boolean; scheduled?: boolean; reason?: string }>;
}

export class SafeLinkedInProvider implements LinkedInProvider {
	private limiter = new Bottleneck({
		minTime: 2_000,
		maxConcurrent: 1,
	});

	async requestConnection(params: LinkedInConnectParams) {
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

	async sendMessage(params: LinkedInMessageParams) {
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