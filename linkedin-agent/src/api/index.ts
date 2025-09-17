import { Express, Request, Response } from 'express';
import axios from 'axios';
import { nanoid } from 'nanoid';
import { prisma } from '../utils/prisma.js';
import { cadenceService } from '../services/cadence.js';
import { config } from '../config/config.js';

export function registerApi(app: Express) {
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // In-memory OAuth state store for dev (ephemeral)
  const oauthState = new Map<string, { userId: string; createdAt: number }>();

  // LinkedIn OAuth - start
  app.get('/auth/linkedin/start', async (req: Request, res: Response) => {
    try {
      const userId = (req.query.userId as string) || '';
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_REDIRECT_URI) {
        return res.status(500).json({ error: 'LinkedIn OAuth not configured' });
      }
      const state = nanoid(24);
      oauthState.set(state, { userId, createdAt: Date.now() });
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.LINKEDIN_CLIENT_ID,
        redirect_uri: config.LINKEDIN_REDIRECT_URI,
        state,
        scope: config.LINKEDIN_SCOPES,
      });
      const url = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
      res.redirect(url);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'OAuth start failed' });
    }
  });

  // LinkedIn OAuth - callback
  app.get('/auth/linkedin/callback', async (req: Request, res: Response) => {
    try {
      // Return clear diagnostics when LinkedIn sends an error back
      const error = (req.query.error as string) || undefined;
      const error_description = (req.query.error_description as string) || undefined;
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (error) {
        return res.status(400).json({ error, error_description });
      }
      if (!code || !state) return res.status(400).json({ error: 'code and state required' });
      if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET || !config.LINKEDIN_REDIRECT_URI) {
        return res.status(500).json({ error: 'LinkedIn OAuth not configured' });
      }
      const meta = oauthState.get(state);
      if (!meta) return res.status(400).json({ error: 'invalid state' });
      oauthState.delete(state);
      const tokenResp = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.LINKEDIN_REDIRECT_URI,
          client_id: config.LINKEDIN_CLIENT_ID,
          client_secret: config.LINKEDIN_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const { access_token, expires_in, refresh_token } = tokenResp.data as any;
      const expiresAt = expires_in ? new Date(Date.now() + Number(expires_in) * 1000) : null;
      await prisma.oAuthToken.upsert({
        where: { userId_provider: { userId: meta.userId, provider: 'LINKEDIN' } },
        update: {
          accessToken: access_token,
          refreshToken: refresh_token ?? null,
          expiresAt: expiresAt,
          scope: config.LINKEDIN_SCOPES,
        },
        create: {
          userId: meta.userId,
          provider: 'LINKEDIN',
          accessToken: access_token,
          refreshToken: refresh_token ?? null,
          expiresAt: expiresAt,
          scope: config.LINKEDIN_SCOPES,
        },
      });
      res.json({ ok: true });
    } catch (err: any) {
      // Surface LinkedIn error payload for easier debugging
      const data = err?.response?.data ?? undefined;
      res.status(500).json({ error: err?.message ?? 'OAuth callback failed', data });
    }
  });

  // OAuth debug: show the exact authorization URL the server will use
  app.get('/auth/linkedin/debug', (_req: Request, res: Response) => {
    if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_REDIRECT_URI) {
      return res.status(500).json({ error: 'LinkedIn OAuth not configured' });
    }
    const state = 'debug-' + nanoid(10);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.LINKEDIN_CLIENT_ID,
      redirect_uri: config.LINKEDIN_REDIRECT_URI,
      state,
      scope: config.LINKEDIN_SCOPES,
    });
    const url = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    res.json({ url, scopes: config.LINKEDIN_SCOPES });
  });

  // OAuth status: check if we have a token for a user
  app.get('/auth/linkedin/status', async (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || '';
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const token = await prisma.oAuthToken.findUnique({ where: { userId_provider: { userId, provider: 'LINKEDIN' } } });
    if (!token) return res.json({ connected: false });
    res.json({ connected: true, expiresAt: token.expiresAt, scope: token.scope });
  });

  // Test endpoint: fetch LinkedIn profile with stored token
  app.get('/linkedin/me', async (req: Request, res: Response) => {
    try {
      const userId = (req.query.userId as string) || '';
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const token = await prisma.oAuthToken.findUnique({ where: { userId_provider: { userId, provider: 'LINKEDIN' } } });
      if (!token) return res.status(404).json({ error: 'No LinkedIn token for user' });
      // Prefer OIDC userinfo when using OpenID scopes
      const me = await axios.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.accessToken}` } });
      res.json(me.data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to fetch profile' });
    }
  });

  // Minimal endpoints
  app.post('/campaigns', async (req: Request, res: Response) => {
    const { ownerId, name, audienceJson } = req.body;
    const campaign = await prisma.campaign.create({ data: { ownerId, name, audienceJson } });
    res.json(campaign);
  });

  // List campaigns for an owner
  app.get('/campaigns', async (req: Request, res: Response) => {
    const ownerId = (req.query.ownerId as string) || undefined;
    const where = ownerId ? { ownerId } : {};
    const campaigns = await prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(campaigns);
  });

  // Create sequence with steps and optional template
  app.post('/sequences', async (req: Request, res: Response) => {
    const { campaignId, name, steps } = req.body as {
      campaignId: string;
      name: string;
      steps: Array<{ stepOrder: number; action: 'SEND_CONNECTION' | 'SEND_MESSAGE' | 'WAIT'; delayHours?: number; templateContent?: string }>;
    };
    if (!campaignId || !name || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'campaignId, name, and steps[] required' });
    }
    // Create optional templates first for steps that include templateContent
    const createdTemplates: Record<number, string> = {};
    for (const s of steps) {
      if (s.templateContent) {
        const t = await prisma.template.create({ data: { campaignId, name: `Step ${s.stepOrder}`, type: 'OUTREACH', content: s.templateContent, enabled: true, order: s.stepOrder } });
        createdTemplates[s.stepOrder] = t.id;
      }
    }
    const seq = await prisma.sequence.create({
      data: {
        campaignId,
        name,
        steps: {
          create: steps.map(s => ({ stepOrder: s.stepOrder, action: s.action, delayHours: s.delayHours ?? 24, templateId: createdTemplates[s.stepOrder] }))
        },
      },
      include: { steps: true },
    });
    res.json(seq);
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

  // Simple feed of outbound messages for verification
  app.get('/messages', async (req: Request, res: Response) => {
    const campaignId = (req.query.campaignId as string) || undefined;
    const leadId = (req.query.leadId as string) || undefined;
    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (leadId) where.leadId = leadId;
    const messages = await prisma.outboundMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(messages);
  });

  // Import leads as JSON and optionally auto-assign
  app.post('/leads/import', async (req: Request, res: Response) => {
    const { campaignId, sequenceId, leads } = req.body as {
      campaignId: string;
      sequenceId?: string;
      leads: Array<{ profileUrl: string; firstName?: string; lastName?: string; title?: string; company?: string }>;
    };
    if (!campaignId || !Array.isArray(leads)) return res.status(400).json({ error: 'campaignId and leads[] required' });
    const results: { leadId: string; created: boolean; assignmentId?: string }[] = [];
    for (const l of (leads as Array<{ profileUrl: string; firstName?: string; lastName?: string; title?: string; company?: string }>)) {
      if (!l.profileUrl) continue;
      let lead = await prisma.lead.findFirst({ where: { profileUrl: l.profileUrl } });
      if (!lead) {
        lead = await prisma.lead.create({ data: { profileUrl: l.profileUrl, firstName: l.firstName, lastName: l.lastName, title: l.title, company: l.company } });
        results.push({ leadId: lead.id, created: true });
      } else {
        results.push({ leadId: lead.id, created: false });
      }
      if (sequenceId) {
        const existing = await prisma.leadAssignment.findFirst({ where: { leadId: lead.id, campaignId, sequenceId } });
        if (!existing) {
          const a = await prisma.leadAssignment.create({ data: { leadId: lead.id, campaignId, sequenceId, status: 'PENDING', nextRunAt: new Date() } });
          results[results.length - 1].assignmentId = a.id;
        }
      }
    }
    res.json({ imported: results.length, details: results });
  });

  // Import with simple list of profile URLs
  app.post('/leads/import/urls', async (req: Request, res: Response) => {
    const { campaignId, sequenceId, urls } = req.body as { campaignId: string; sequenceId?: string; urls: string[] };
    if (!campaignId || !Array.isArray(urls)) return res.status(400).json({ error: 'campaignId and urls[] required' });
    const leads = urls.map(u => ({ profileUrl: u }));
    req.body = { campaignId, sequenceId, leads };
    // Delegate to main import
    // @ts-ignore
    return app._router.handle(req, res, () => {});
  });

  // Export leads in CSV for a campaign
  app.get('/leads/export.csv', async (req: Request, res: Response) => {
    const campaignId = req.query.campaignId as string;
    if (!campaignId) return res.status(400).send('campaignId required');
    const leads = await prisma.lead.findMany({
      where: { assignments: { some: { campaignId } } },
      include: { assignments: { where: { campaignId }, select: { status: true, nextRunAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const header = ['id','firstName','lastName','company','title','profileUrl','status','nextRunAt'];
    const rows = leads.map((l: any) => [
      l.id,
      l.firstName ?? '',
      l.lastName ?? '',
      l.company ?? '',
      l.title ?? '',
      l.profileUrl ?? '',
      l.assignments[0]?.status ?? '',
      l.assignments[0]?.nextRunAt?.toISOString() ?? '',
    ]);
    const csv = [header, ...rows].map((r: (string | null)[]) => r.map((v: string | null) => String(v ?? '').includes(',') ? '"' + String(v ?? '').replace(/"/g,'""') + '"' : String(v ?? '')).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });

  // Export messages in CSV
  app.get('/messages/export.csv', async (req: Request, res: Response) => {
    const campaignId = req.query.campaignId as string;
    if (!campaignId) return res.status(400).send('campaignId required');
    const msgs = await prisma.outboundMessage.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' }, take: 5000 });
    const header = ['id','createdAt','provider','direction','leadId','campaignId','assignmentId','stepOrder','content','sentAt','error'];
    const rows = msgs.map((m: any) => [m.id, m.createdAt.toISOString(), m.provider, m.direction, m.leadId, m.campaignId, m.assignmentId ?? '', m.stepOrder ?? '', m.content, m.sentAt?.toISOString() ?? '', m.error ?? '']);
    const csv = [header, ...rows].map((r: (string | null)[]) => r.map((v: string | null) => String(v ?? '').includes(',') ? '"' + String(v ?? '').replace(/"/g,'""') + '"' : String(v ?? '')).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });

  // Sender management
  app.post('/senders', async (req: Request, res: Response) => {
    const { ownerId, name, tokenUserId } = req.body as { ownerId: string; name: string; tokenUserId?: string };
    if (!ownerId || !name) return res.status(400).json({ error: 'ownerId and name required' });
    const sender = await prisma.sender.create({ data: { ownerId, name, tokenUserId: tokenUserId ?? ownerId } });
    res.json(sender);
  });
  app.post('/campaigns/:id/senders/:senderId/attach', async (req: Request, res: Response) => {
    const { id, senderId } = req.params;
    const cs = await prisma.campaignSender.upsert({
      where: { campaignId_senderId: { campaignId: id, senderId } },
      update: { active: true },
      create: { campaignId: id, senderId },
    });
    res.json(cs);
  });
  app.get('/campaigns/:id/senders', async (req: Request, res: Response) => {
    const { id } = req.params;
    const list = await prisma.campaignSender.findMany({ where: { campaignId: id }, include: { sender: true } });
    res.json(list);
  });
}
