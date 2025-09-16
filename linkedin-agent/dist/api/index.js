import { prisma } from '../utils/prisma.js';
import { cadenceService } from '../services/cadence.js';
export function registerApi(app) {
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    // Minimal endpoints
    app.post('/campaigns', async (req, res) => {
        const { ownerId, name, audienceJson } = req.body;
        const campaign = await prisma.campaign.create({ data: { ownerId, name, audienceJson } });
        res.json(campaign);
    });
    app.post('/campaigns/:id/assign', async (req, res) => {
        const { id } = req.params;
        const { leadId, sequenceId } = req.body;
        const assignment = await prisma.leadAssignment.create({ data: { leadId, campaignId: id, sequenceId, status: 'PENDING', nextRunAt: new Date() } });
        res.json(assignment);
    });
    app.post('/scheduler/run', async (_req, res) => {
        const n = await cadenceService.processDueAssignments();
        res.json({ processed: n });
    });
}
