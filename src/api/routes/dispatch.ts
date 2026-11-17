import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';
import { QStashSignatureVerifier } from '../middleware/qstash.ts';

export interface DispatchRouteOpts {
  service: ReviewService;
  verifier?: QStashSignatureVerifier;
}

export async function dispatchRoutes(app: FastifyInstance, opts: DispatchRouteOpts): Promise<void> {
  const { service, verifier } = opts;

  const authPreHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    if (verifier) {
      const allowed = await verifier.verify(req, reply);
      if (!allowed) {
        // Reply status and error already sent by verifier
        return;
      }
    }
  };

  // POST /api/internal/dispatch
  app.post(
    '/internal/dispatch',
    { preHandler: authPreHandler },
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
    { preHandler: authPreHandler },
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
