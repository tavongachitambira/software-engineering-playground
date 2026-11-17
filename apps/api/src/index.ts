import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import rbacPlugin from './plugins/rbac.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import idempotencyPlugin from './plugins/idempotency.js';
import { byIp } from './lib/rate-limit/identifiers.js';

import basicAuthRoutes from './routes/auth/basic-auth.js';
import jwtAuthRoutes from './routes/auth/jwt-auth.js';
import sessionAuthRoutes from './routes/auth/session-auth.js';
import oauthGithubRoutes from './routes/auth/oauth-github.js';
import oidcGoogleRoutes from './routes/auth/oidc-google.js';
import incidentRoutes from './routes/incidents.js';

import presenceRoutes from './routes/presence.js';
import socketPlugin from './plugins/socket.js';
import websocketDemoRoutes from './routes/websocket-demo.js';

const app = Fastify({ logger: true });

// 1. Core plugins first — cookie support, then everything that adds
// decorators (authenticate/authorize, rateLimit, idempotency hooks).
app.register(cookie);
app.register(rbacPlugin);
app.register(rateLimitPlugin);
app.register(idempotencyPlugin);
app.register(socketPlugin);

// 2. Once the above have finished loading, set up the global hook and
// THEN register every route — routes always come last, since they're
// the consumers of everything registered above.
app.after(() => {
  app.addHook('onRequest', app.rateLimit({
    algorithm: 'token-bucket',
    capacity: 5000,
    refillRatePerSecond: 5000 / 60,
    identifier: byIp,
    keyPrefix: 'edge',
    failMode: 'open',
  }));

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(basicAuthRoutes, { prefix: '/topics/basic-auth' });
  app.register(jwtAuthRoutes, { prefix: '/topics/jwt' });
  app.register(sessionAuthRoutes, { prefix: '/topics/session' });
  app.register(oauthGithubRoutes, { prefix: '/topics/oauth' });
  app.register(oidcGoogleRoutes, { prefix: '/topics/oidc' });
  app.register(incidentRoutes, { prefix: '/topics/idempotency/incidents' });

   app.register(presenceRoutes, { prefix: '/topics/redis-presence' });
  app.register(websocketDemoRoutes, { prefix: '/topics/websockets' });
});

const port = Number(process.env.PORT) || 4100;
app.listen({ port }, () => {
  console.log(`api listening on http://localhost:${port}`);
});