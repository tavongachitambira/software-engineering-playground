import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../routes/auth/jwt-auth.js';
import type { UserRole, JwtPayload } from '../types/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedRoles: UserRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const rbacPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token' });
      return;
    }
    try {
      req.user = await verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  fastify.decorate('authorize', (allowedRoles: UserRole[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        reply.code(401).send({ error: 'Not authenticated' });
        return;
      }
      if (!allowedRoles.includes(req.user.role)) {
        reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions for this resource' });
      }
    };
  });
};

export default fp(rbacPlugin);