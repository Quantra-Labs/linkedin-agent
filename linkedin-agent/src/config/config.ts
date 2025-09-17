import * as dotenv from 'dotenv';
dotenv.config();
import { z } from 'zod';

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8),
  DAILY_DM_LIMIT: z.coerce.number().int().positive().default(50),
  DAILY_CONNECTION_LIMIT: z.coerce.number().int().positive().default(50),

  // LinkedIn OAuth (Authorization Code Flow)
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_REDIRECT_URI: z.string().url().optional(),
  // Default to OIDC scopes supported by Sign In with LinkedIn
  LINKEDIN_SCOPES: z.string().default('openid profile email'),

  // Optional: Approved integration webhook to actually send on LinkedIn
  LINKEDIN_WEBHOOK_URL: z.string().url().optional(),
});

export const config = ConfigSchema.parse(process.env);
