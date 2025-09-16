import { addHours } from 'date-fns';
import { prisma } from '../utils/prisma.js';
import { aiService } from './ai.js';
import { linkedinProvider } from '../providers/linkedin.js';
import { logger } from '../utils/logger.js';
export class CadenceService {
    async scheduleNextStep(assignmentId) {
        const assign = await prisma.leadAssignment.findUnique({ where: { id: assignmentId }, include: { sequence: { include: { steps: true } } } });
        if (!assign || !assign.sequence)
            return;
        const steps = [...assign.sequence.steps].sort((a, b) => a.stepOrder - b.stepOrder);
        const lastOrder = assign.lastStepOrder ?? 0;
        const next = steps.find(s => s.stepOrder > lastOrder);
        if (!next) {
            await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { status: 'COMPLETED', nextRunAt: null } });
            return;
        }
        const runAt = addHours(new Date(), next.delayHours ?? 24);
        await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { status: 'SCHEDULED', nextRunAt: runAt } });
    }
    async processDueAssignments() {
        const now = new Date();
        const due = await prisma.leadAssignment.findMany({
            where: { status: { in: ['PENDING', 'SCHEDULED'] }, nextRunAt: { lte: now } },
            include: { lead: true, campaign: true, sequence: { include: { steps: true } } },
            orderBy: { nextRunAt: 'asc' },
            take: 20,
        });
        for (const a of due) {
            try {
                await this.executeNextStep(a.id);
            }
            catch (err) {
                logger.error({ err }, 'Failed processing assignment');
            }
        }
        return due.length;
    }
    async executeNextStep(assignmentId) {
        const assignment = await prisma.leadAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                lead: true,
                campaign: true,
                sequence: { include: { steps: true } },
            },
        });
        if (!assignment || !assignment.sequence || !assignment.lead)
            return;
        const steps = [...assignment.sequence.steps].sort((a, b) => a.stepOrder - b.stepOrder);
        const lastOrder = assignment.lastStepOrder ?? 0;
        const step = steps.find(s => s.stepOrder > lastOrder);
        if (!step) {
            await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { status: 'COMPLETED', nextRunAt: null } });
            return;
        }
        await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { status: 'RUNNING' } });
        if (step.action === 'WAIT') {
            await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { lastStepOrder: step.stepOrder } });
            await this.scheduleNextStep(assignmentId);
            return;
        }
        if (step.action === 'SEND_CONNECTION') {
            const result = await linkedinProvider.requestConnection({
                userId: assignment.campaign.ownerId,
                leadProfileUrl: assignment.lead.profileUrl ?? '',
                message: undefined,
            });
            await prisma.outboundMessage.create({
                data: {
                    provider: 'LINKEDIN',
                    direction: 'OUTBOUND',
                    leadId: assignment.leadId,
                    campaignId: assignment.campaignId,
                    assignmentId: assignment.id,
                    content: result.ok ? 'Connection requested' : ('reason' in result ? result.reason : 'Connection scheduled'),
                    sentAt: result.ok ? new Date() : null,
                    error: result.ok ? null : ('reason' in result ? result.reason : null),
                },
            });
        }
        else if (step.action === 'SEND_MESSAGE') {
            const template = step.templateId ? await prisma.template.findUnique({ where: { id: step.templateId } }) : null;
            const content = await aiService.generateMessage({
                lead: {
                    firstName: assignment.lead.firstName ?? undefined,
                    lastName: assignment.lead.lastName ?? undefined,
                    title: assignment.lead.title ?? undefined,
                    company: assignment.lead.company ?? undefined,
                    headline: assignment.lead.headline ?? undefined,
                    profileUrl: assignment.lead.profileUrl ?? undefined,
                },
                campaign: { name: assignment.campaign.name },
                template: template?.content,
            });
            const result = await linkedinProvider.sendMessage({
                userId: assignment.campaign.ownerId,
                leadProfileUrl: assignment.lead.profileUrl ?? '',
                content,
            });
            await prisma.outboundMessage.create({
                data: {
                    provider: 'LINKEDIN',
                    direction: 'OUTBOUND',
                    leadId: assignment.leadId,
                    campaignId: assignment.campaignId,
                    assignmentId: assignment.id,
                    templateId: step.templateId ?? undefined,
                    stepOrder: step.stepOrder,
                    content,
                    sentAt: result.ok ? new Date() : null,
                    error: result.ok ? null : ('reason' in result ? result.reason : null),
                },
            });
        }
        await prisma.leadAssignment.update({ where: { id: assignmentId }, data: { lastStepOrder: step.stepOrder } });
        await this.scheduleNextStep(assignmentId);
    }
}
export const cadenceService = new CadenceService();
