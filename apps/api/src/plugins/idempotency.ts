import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { claimIdempotencyKey, hashRequestBody, storeIdempotentResult } from '../lib/idempotency/store.js';

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

const IDEMPOTENCY_HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 255; // Stripe's stated limit

const idempotencyPlugin: FastifyPluginAsync = async (fastify) => {
  // Runs on every request, but only actually does anything on routes
  // that opt in via { config: { idempotent: true } } — see usage below.
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const routeConfig = req.routeOptions?.config as { idempotent?: boolean } | undefined;
    if (!routeConfig?.idempotent) return;

    // Per Stripe docs: "Don't send idempotency keys in GET and DELETE
    // requests because it has no effect... All POST requests accept
    // idempotency keys." Enforce that scope rather than trusting callers.
    if (req.method !== 'POST') return;

    const header = req.headers[IDEMPOTENCY_HEADER];
    if (!header) return; // optional per-request, not mandatory globally

    const idempotencyKey = Array.isArray(header) ? header[0] : header;

    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      reply.code(400).send({ error: 'Idempotency-Key must be 255 characters or fewer' });
      return;
    }

    const requestHash = hashRequestBody(req.body);
    const result = await claimIdempotencyKey(idempotencyKey, requestHash);

    switch (result.status) {
      case 'claimed':
        // Mark the request so onSend below knows it owns this key and
        // must persist the eventual result.
        req.idempotencyKey = idempotencyKey;
        return;

      case 'mismatch':
        // Per Stripe: "the idempotency layer compares incoming
        // parameters to those of the original request and errors if
        // they're not the same to prevent accidental misuse."
        reply.code(422).send({
          error: 'idempotency_key_reused_with_different_params',
          message: 'This Idempotency-Key was previously used with different request parameters.',
        });
        return;

      case 'in-progress':
        // Stripe's status code reference: 409 = "request conflicts with
        // another request (perhaps due to using the same idempotent key)."
        reply.code(409).send({
          error: 'idempotency_key_in_use',
          message: 'A request with this Idempotency-Key is already being processed.',
        });
        return;

      case 'completed':
        // Replay verbatim, including the ORIGINAL status code — Stripe
        // caches "regardless of whether it succeeds or fails."
        reply
          .code(result.statusCode)
          .header('Idempotent-Replayed', 'true')
          .send(JSON.parse(result.body));
        return;
    }
  });

  // Fires for whatever response the handler actually produced —
  // success or error — which is what makes error responses cacheable
  // too, matching Stripe's documented behavior.
  fastify.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload) => {
    if (!req.idempotencyKey) return payload;

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    await storeIdempotentResult(req.idempotencyKey, reply.statusCode, body);
    return payload;
  });
};

export default fp(idempotencyPlugin);