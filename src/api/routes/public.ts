import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';

export interface PublicRouteOpts {
  service: ReviewService;
}

export async function publicRoutes(app: FastifyInstance, opts: PublicRouteOpts): Promise<void> {
  const { service } = opts;

  // GET /r/:logId (CTR Tracking Redirect)
  app.get(
    '/r/:logId',
    async (req: FastifyRequest<{ Params: { logId: string } }>, reply: FastifyReply) => {
      const { logId } = req.params;
      try {
        const result = await service.handleCustomerClick(logId);
        return reply.redirect(result.redirectUrl, 302);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );

// GET /opt-out/:customerId (1-click unsubscribe)
app.get(
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
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px 20px; background-color: #f9fafb; color: #111827;">
          <div style="max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="margin-top: 0;">Unsubscribed</h2>
            <p style="color: #4b5563; margin-bottom: 0;">You have been successfully removed and will no longer receive review requests from this business.</p>
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
