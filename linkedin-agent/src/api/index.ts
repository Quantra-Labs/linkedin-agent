import { Express, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { cadenceService } from '../services/cadence.js';

export function registerApi(app: Express) {
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Minimal endpoints
  app.post('/campaigns', async (req: Request, res: Response) => {
    const { ownerId, name, audienceJson } = req.body;
    const campaign = await prisma.campaign.create({ data: { ownerId, name, audienceJson } });
    res.json(campaign);
  });

  app.post('/campaigns/:id/assign', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { leadId, sequenceId } = req.body;
    const assignment = await prisma.leadAssignment.create({ data: { leadId, campaignId: id, sequenceId, status: 'PENDING', nextRunAt: new Date() } });
    res.json(assignment);
  });

  app.post('/scheduler/run', async (_req: Request, res: Response) => {
    const n = await cadenceService.processDueAssignments();
    res.json({ processed: n });
  });
}
