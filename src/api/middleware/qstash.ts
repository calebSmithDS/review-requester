import { Receiver } from '@upstash/qstash';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface QStashVerifierConfig {
  currentSigningKey?: string;
  nextSigningKey?: string;
}

export class QStashSignatureVerifier {
  private receiver?: Receiver;

  constructor(config: QStashVerifierConfig) {
    if (config.currentSigningKey && config.nextSigningKey) {
      this.receiver = new Receiver({
        currentSigningKey: config.currentSigningKey,
        nextSigningKey: config.nextSigningKey,
      });
    }
  }

  async verify(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    // If keys are not set (e.g. local dev without QStash verification configured), allow or log
    if (!this.receiver) {
      return true;
    }

    const signature = req.headers['upstash-signature'] as string | undefined;
    if (!signature) {
      reply.status(401).send({ error: 'Missing Upstash-Signature header' });
      return false;
    }

    try {
      const isValid = await this.receiver.verify({
        signature,
        body: JSON.stringify(req.body),
      });

      if (!isValid) {
        reply.status(401).send({ error: 'Invalid QStash signature' });
        return false;
      }
      return true;
    } catch (err: any) {
      reply.status(401).send({ error: `Signature verification failed: ${err.message}` });
      return false;
    }
  }
}
