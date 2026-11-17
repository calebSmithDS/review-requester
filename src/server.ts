import 'dotenv/config';
import { buildApp } from './api/app.ts';
import { ReviewService } from './services/index.ts';
import { NeonDatabaseAdapter } from './db/neon.ts';
import { MemoryDatabaseAdapter } from './db/memory.ts';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const db = process.env.DATABASE_URL
  ? new NeonDatabaseAdapter(process.env.DATABASE_URL)
  : new MemoryDatabaseAdapter();

const service = new ReviewService(db);
const app = buildApp({
  service,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
});

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Review Requester server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
