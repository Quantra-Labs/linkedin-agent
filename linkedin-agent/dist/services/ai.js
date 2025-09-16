import { OpenAI } from 'openai';
import { config } from '../config/config.js';
function applyTemplate(template, ctx) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_m, key) => {
        const value = ctx.lead[key];
        return value ?? '';
    });
}
export class AiService {
    client;
    constructor() {
        this.client = config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null;
    }
    async generateMessage(ctx) {
        if (ctx.template) {
            return applyTemplate(ctx.template, ctx);
        }
        if (!this.client) {
            return `Hi ${ctx.lead.firstName ?? ''}, great to connect!`;
        }
        const system = ctx.systemPrompt ?? 'You are a helpful B2B outreach assistant. Be concise, value-led, and comply with LinkedIn policies. Avoid spam.';
        const messages = [
            { role: 'system', content: system },
            { role: 'user', content: `Lead: ${JSON.stringify(ctx.lead)}\nCampaign: ${JSON.stringify(ctx.campaign)}\nWrite a short outreach DM.` },
        ];
        const resp = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 180,
            temperature: 0.7,
        });
        return resp.choices[0]?.message?.content?.toString() ?? 'Hi there!';
    }
}
export const aiService = new AiService();
