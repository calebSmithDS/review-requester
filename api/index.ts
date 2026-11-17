import 'dotenv/config';
import { buildApp } from './src/api/app.ts';
import { ReviewService } from './src/services/index.ts';
import { NeonDatabaseAdapter } from './src/db/neon.ts';
import { MemoryDatabaseAdapter } from './src/db/memory.ts';

// Instantiate appropriate adapter based on environment
const db = process.env.DATABASE_URL
  ? new NeonDatabaseAdapter(process.env.DATABASE_URL)
  : new MemoryDatabaseAdapter();

const service = new ReviewService(db);
const app = buildApp({
  service,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
});

// Vercel serverless function entry handler
export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit('request', req, res);
}
