import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { ReviewService } from '../services/index.ts';
import { ingressRoutes } from './routes/ingress.ts';
import { dispatchRoutes } from './routes/dispatch.ts';
import { publicRoutes } from './routes/public.ts';
import { devRoutes } from './routes/dev.ts';

export interface RouteDeps {
  service: ReviewService;
  baseUrl?: string;
}

export function buildApp(deps: RouteDeps): FastifyInstance {
  const app = Fastify({
    logger: true,
    genReqId: (req: IncomingMessage) => {
      const traceHeader =
        (req.headers['x-trace-id'] as string) ||
        (req.headers['x-request-id'] as string) ||
        (req.headers['traceparent'] as string);
      return traceHeader || `trace_${Math.random().toString(36).slice(2, 10)}`;
    },
  });

  const { service, baseUrl = 'http://localhost:3000' } = deps;

  // Register modular route plugins
  app.register(ingressRoutes, { prefix: '/api', service });
  app.register(dispatchRoutes, { prefix: '/api', service });

  // Dev Harness Sandbox & Outbox (enabled locally, disabled in production unless explicit)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_ROUTES === 'true') {
    app.register(devRoutes, { service, baseUrl });
  }

  // Public shortlinks (/r/:logId and /opt-out/:customerId) at root
  app.register(publicRoutes, { service });

  return app;
}
