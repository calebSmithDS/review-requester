import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';

export interface DispatchRouteOpts {
  service: ReviewService;
}

export async function dispatchRoutes(app: FastifyInstance, opts: DispatchRouteOpts): Promise<void> {
  const { service } = opts;

  // POST /api/internal/dispatch
  app.post(
    '/internal/dispatch',
    async (req: FastifyRequest<{ Body: { review_log_id: string } }>, reply: FastifyReply) => {
      const { review_log_id } = req.body || {};
      if (!review_log_id) {
        return reply.status(400).send({ error: 'Missing review_log_id' });
      }

      const result = await service.dispatchInitial(review_log_id);
      return reply.status(200).send(result);
    }
  );

  // POST /api/internal/dispatch-nudge
  app.post(
    '/internal/dispatch-nudge',
    async (req: FastifyRequest<{ Body: { review_log_id: string } }>, reply: FastifyReply) => {
      const { review_log_id } = req.body || {};
      if (!review_log_id) {
        return reply.status(400).send({ error: 'Missing review_log_id' });
      }

      const result = await service.dispatchNudge(review_log_id);
      return reply.status(200).send(result);
    }
  );
}
