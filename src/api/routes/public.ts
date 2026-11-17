import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';

export interface PublicRouteOpts {
  service: ReviewService;
}

// Common patterns for automated preview crawlers / antivirus link scanners
const BOT_USER_AGENTS = [
  'bot',
  'crawler',
  'spider',
  'preview',
  'facebookexternalhit',
  'whatsapp',
  'slackbot',
  'twitterbot',
  'applebot',
  'google-read-aloud',
  'bitlybot',
  'skypeuripreview',
];

function isBotRequest(req: FastifyRequest): boolean {
  // 1. Check browser prefetch headers
  const purpose = req.headers['purpose'] || req.headers['sec-purpose'];
  if (typeof purpose === 'string' && purpose.toLowerCase().includes('prefetch')) {
    return true;
  }

  // 2. Check User-Agent
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return BOT_USER_AGENTS.some((pattern) => ua.includes(pattern));
}

export async function publicRoutes(app: FastifyInstance, opts: PublicRouteOpts): Promise<void> {
  const { service } = opts;

  // GET /r/:logId (CTR Tracking Redirect)
  app.get(
    '/r/:logId',
    async (req: FastifyRequest<{ Params: { logId: string } }>, reply: FastifyReply) => {
      const { logId } = req.params;
      try {
        // If it's an automated bot scanner, redirect without mutating database state
        if (isBotRequest(req)) {
          const log = await service.trackingService['db'].getReviewLog(logId);
          if (!log) return reply.status(404).send({ error: 'Review log not found' });
          const tenant = await service.tenantService.getTenant(log.tenantId);
          if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
          return reply.redirect(tenant.googleReviewUrl, 302);
        }

        const result = await service.handleCustomerClick(logId);
        return reply.redirect(result.redirectUrl, 302);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );

  // GET /opt-out/:customerId (Confirmation Landing Page)
  app.get(
    '/opt-out/:customerId',
    async (req: FastifyRequest<{ Params: { customerId: string } }>, reply: FastifyReply) => {
      const { customerId } = req.params;

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirm Opt-Out</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; padding: 40px 20px; display: flex; justify-content: center; }
            .card { max-width: 420px; width: 100%; background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); text-align: center; }
            h2 { margin-top: 0; font-size: 20px; color: #1e293b; }
            p { color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
            button { background: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer; width: 100%; }
            button:hover { background: #dc2626; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Opt Out of Review Requests</h2>
            <p>Are you sure you want to stop receiving review requests? You will no longer receive any SMS messages from this business.</p>
            <form action="/opt-out/${customerId}" method="POST">
              <button type="submit">Confirm Opt-Out</button>
            </form>
          </div>
        </body>
        </html>
      `;

      reply.type('text/html');
      return reply.status(200).send(html);
    }
  );

  // POST /opt-out/:customerId (Action - Submits the opt-out)
  app.post(
    '/opt-out/:customerId',
    async (req: FastifyRequest<{ Params: { customerId: string } }>, reply: FastifyReply) => {
      const { customerId } = req.params;

      try {
        await service.handleOptOut(customerId);

        const html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Unsubscribed</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; padding: 40px 20px; display: flex; justify-content: center; }
              .card { max-width: 420px; width: 100%; background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); text-align: center; }
              h2 { margin-top: 0; font-size: 20px; color: #166534; }
              p { color: #64748b; font-size: 14px; line-height: 1.5; margin: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✅ Successfully Unsubscribed</h2>
              <p>You have been removed from our list and will no longer receive any review requests.</p>
            </div>
          </body>
          </html>
        `;

        reply.type('text/html');
        return reply.status(200).send(html);
      } catch (error) {
        req.log.error(error);
        return reply.status(500).send('Internal Server Error');
      }
    }
  );
}
