import 'dotenv/config';
import { buildApp } from './api/app.ts';
import { ReviewService } from './services/index.ts';
import { NeonDatabaseAdapter } from './db/neon.ts';
import { MemoryDatabaseAdapter } from './db/memory.ts';
import { DevSmsProvider } from './api/routes/dev.ts';
import { QStashSignatureVerifier } from './api/middleware/qstash.ts';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const db = process.env.DATABASE_URL
  ? new NeonDatabaseAdapter(process.env.DATABASE_URL)
  : new MemoryDatabaseAdapter();

const smsProvider = process.env.TWILIO_AUTH_TOKEN ? undefined : new DevSmsProvider();

const verifier =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? new QStashSignatureVerifier({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      })
    : undefined;

const service = new ReviewService({
  db,
  smsProvider,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
});

const app = buildApp({
  service,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
  verifier,
});

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Review Requester server listening on http://${HOST}:${PORT}`);
    console.log(`👉 Dev Sandbox available at http://localhost:${PORT}/dev`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
