import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  fixedWindow,
  tokenBucket,
  slidingWindowCounter,
  slidingWindowLog,
} from '../lib/rate-limit/algorithms.js';

type BaseConfig = {
  identifier: (req: FastifyRequest) => string;
  keyPrefix: string;
  failMode?: 'open' | 'closed';
};

type RateLimitConfig =
  | (BaseConfig & { algorithm: 'fixed-window'; limit: number; windowSeconds: number })
  | (BaseConfig & { algorithm: 'token-bucket'; capacity: number; refillRatePerSecond: number })
  | (BaseConfig & { algorithm: 'sliding-window-counter'; limit: number; windowSeconds: number })
  | (BaseConfig & { algorithm: 'sliding-window-log'; limit: number; windowMs: number });

declare module 'fastify' {
  interface FastifyInstance {
    rateLimit: (config: RateLimitConfig) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('rateLimit', (config: RateLimitConfig) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const key = `${config.keyPrefix}:${config.identifier(req)}`;

      try {
        let result: { allowed: boolean; remaining?: number };

        switch (config.algorithm) {
          case 'fixed-window':
            result = await fixedWindow(key, config.limit, config.windowSeconds);
            break;
          case 'token-bucket':
            result = await tokenBucket(key, config.capacity, config.refillRatePerSecond);
            break;
          case 'sliding-window-counter':
            result = await slidingWindowCounter(key, config.limit, config.windowSeconds);
            break;
          case 'sliding-window-log':
            result = await slidingWindowLog(key, config.limit, config.windowMs);
            break;
        }

        // "limit" only exists as a literal field on 3 of the 4 branches —
        // token-bucket's effective ceiling is its capacity instead.
        const effectiveLimit = config.algorithm === 'token-bucket' ? config.capacity : config.limit;
        reply.header('X-RateLimit-Limit', effectiveLimit);

        if (result.remaining !== undefined) {
          reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
        }

        if (!result.allowed) {
          const retryAfterSeconds =
            config.algorithm === 'sliding-window-log'
              ? Math.ceil(config.windowMs / 1000)
              : config.algorithm === 'token-bucket'
              ? Math.ceil(config.capacity / config.refillRatePerSecond)
              : config.windowSeconds;

          reply.header('Retry-After', retryAfterSeconds);
          reply.code(429).send({ error: 'Too Many Requests' });
        }
      } catch (err) {
        // Fail-open vs fail-closed — per notes.md, this is a product
        // decision per-route, not a global default. Login/payment routes
        // should pass failMode: 'closed'; general browsing should be 'open'.
        req.log.error({ err }, 'rate limit check failed');
        if (config.failMode === 'closed') {
          reply.code(503).send({ error: 'Service temporarily unavailable' });
        }
        // fail-open: swallow the error, let the request through
      }
    };
  });
};

export default fp(rateLimitPlugin);