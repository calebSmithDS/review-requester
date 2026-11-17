import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';

export interface IngressRouteOpts {
  service: ReviewService;
}

export async function ingressRoutes(app: FastifyInstance, opts: IngressRouteOpts): Promise<void> {
  const { service } = opts;

  // POST /api/webhooks/ingress/:tenantId
  app.post(
    '/webhooks/ingress/:tenantId',
    async (
      req: FastifyRequest<{
        Params: { tenantId: string };
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

      if (!job_reference_id || !customer_phone) {
        return reply.status(400).send({ error: 'Missing job_reference_id or customer_phone' });
      }

      try {
        const result = await service.handleIngress({
          tenantId,
          jobReferenceId: job_reference_id,
          customerPhone: customer_phone,
          customerFirstName: customer_first_name,
        });

        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );
}
