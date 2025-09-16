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
});

export const config = ConfigSchema.parse(process.env);
