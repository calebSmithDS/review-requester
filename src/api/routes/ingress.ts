import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';
import { timingSafeEqual } from 'node:crypto';

export interface IngressRouteOpts {
  service: ReviewService;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function ingressRoutes(app: FastifyInstance, opts: IngressRouteOpts): Promise<void> {
  const { service } = opts;

  // POST /api/webhooks/ingress/:tenantId
  app.post(
    '/webhooks/ingress/:tenantId',
    async (
      req: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { secret?: string };
        Body: {
          job_reference_id: string;
          customer_phone: string;
          customer_first_name?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenantId } = req.params;
      const { job_reference_id, customer_phone, customer_first_name } = req.body || {};

      // 1. Extract secret from Header (X-Webhook-Secret / Bearer token) OR Query Param (?secret=...)
      const authHeader = req.headers['authorization'];
      const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const headerSecret = (req.headers['x-webhook-secret'] as string | undefined) || bearerSecret;
      const incomingSecret = headerSecret || req.query.secret;

      if (!job_reference_id || !customer_phone) {
        return reply.status(400).send({ error: 'Missing job_reference_id or customer_phone' });
      }

      try {
        const tenant = await service.tenantService.getTenant(tenantId);
        if (!tenant) {
          return reply.status(404).send({ error: `Tenant ${tenantId} not found` });
        }

        // 2. Validate tenant webhook secret
        if (!incomingSecret || !safeCompare(incomingSecret, tenant.webhookSecret)) {
          return reply.status(401).send({ error: 'Unauthorized: Invalid or missing webhook secret' });
        }

        const result = await service.handleIngress({
          tenantId,
          jobReferenceId: job_reference_id,
          customerPhone: customer_phone,
          customerFirstName: customer_first_name,
        });

        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );
}
