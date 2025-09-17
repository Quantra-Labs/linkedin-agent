import Bottleneck from 'bottleneck';
import axios from 'axios';
import { safetyService } from '../services/safety.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';
import { config } from '../config/config.js';

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
			const token = await prisma.oAuthToken.findUnique({ where: { userId_provider: { userId: params.userId, provider: 'LINKEDIN' } } });
			if (!token) {
				logger.warn('No LinkedIn token found; simulate request only');
				await safetyService.increment(params.userId, 'CONNECTION_SENT');
				return { ok: true, scheduled: true, reason: 'No token; simulated' };
			}
			// If a webhook endpoint is configured, hand off to it (approved integration)
			if ((config as any).LINKEDIN_WEBHOOK_URL) {
				try {
					await axios.post((config as any).LINKEDIN_WEBHOOK_URL, {
						kind: 'SEND_CONNECTION',
						userId: params.userId,
						leadProfileUrl: params.leadProfileUrl,
						bearerTokenPresent: true,
					});
				} catch (err: any) {
					logger.error({ err: err?.response?.data ?? err?.message }, 'Webhook connection handoff failed');
					return { ok: false, scheduled: true, reason: 'Webhook failed' };
				}
			}
			logger.info({ lead: params.leadProfileUrl }, 'Requesting LinkedIn connection (token present)');
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
			const token = await prisma.oAuthToken.findUnique({ where: { userId_provider: { userId: params.userId, provider: 'LINKEDIN' } } });
			if (!token) {
				logger.warn('No LinkedIn token found; simulate message only');
				await safetyService.increment(params.userId, 'MESSAGE_SENT');
				return { ok: true, scheduled: true, reason: 'No token; simulated' };
			}
			try {
				// Validate token via OIDC userinfo if available
				await axios.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.accessToken}` } });
			} catch (err: any) {
				logger.error({ err: err?.response?.data ?? err?.message }, 'LinkedIn token validation failed');
				return { ok: false, scheduled: true, reason: 'Token invalid; re-auth required' };
			}
			// If a webhook endpoint is configured, hand off message to it
			if ((config as any).LINKEDIN_WEBHOOK_URL) {
				try {
					await axios.post((config as any).LINKEDIN_WEBHOOK_URL, {
						kind: 'SEND_MESSAGE',
						userId: params.userId,
						leadProfileUrl: params.leadProfileUrl,
						content: params.content,
						bearerTokenPresent: true,
					});
				} catch (err: any) {
					logger.error({ err: err?.response?.data ?? err?.message }, 'Webhook message handoff failed');
					return { ok: false, scheduled: true, reason: 'Webhook failed' };
				}
			}
			logger.info({ to: params.leadProfileUrl }, 'Sending LinkedIn DM (placeholder)');
			await safetyService.increment(params.userId, 'MESSAGE_SENT');
			return { ok: true };
		});
	}
}

export const linkedinProvider = new SafeLinkedInProvider();