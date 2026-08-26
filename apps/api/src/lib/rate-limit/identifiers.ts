import type { FastifyRequest } from 'fastify';

// Per the doc you pasted: which identifier to use depends on the layer.
// These are meant to be composed, not picked once for the whole app.

export function byIp(req: FastifyRequest): string {
  return `ip:${req.ip}`;
}

// Only valid on routes behind `app.authenticate` — request.user is
// populated by the RBAC plugin's decorator, not this file.
export function byUserId(req: FastifyRequest): string {
  if (!req.user) throw new Error('byUserId identifier used on an unauthenticated route');
  return `user:${req.user.sub}`;
}

export function byApiKey(req: FastifyRequest): string {
  const key = req.headers['x-api-key'];
  if (!key || typeof key !== 'string') throw new Error('Missing X-API-Key header');
  return `apikey:${key}`;
}

// IP-scoped to a specific route — this is the "5 login attempts per IP"
// pattern, distinct from the general edge-layer IP limit, because it
// needs its own key namespace so the two don't share a counter.
export function byIpAndRoute(routeName: string) {
  return (req: FastifyRequest): string => `ip:${req.ip}:route:${routeName}`;
}