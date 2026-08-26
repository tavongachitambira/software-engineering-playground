import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import basicAuthRoutes from './routes/auth/basic-auth.js';
import jwtAuthRoutes from './routes/auth/jwt-auth.js';
import sessionAuthRoutes from './routes/auth/session-auth.js';
import oauthGithubRoutes from './routes/auth/oauth-github.js';
import oidcGoogleRoutes from './routes/auth/oidc-google.js';
import rbacPlugin from './plugins/rbac.js';

import rateLimitPlugin from './plugins/rate-limit.js';
import { byIp, byIpAndRoute, byUserId } from './lib/rate-limit/identifiers.js';

const app = Fastify({ logger: true });

app.register(cookie);

app.register(basicAuthRoutes, { prefix: '/topics/basic-auth' });
app.register(jwtAuthRoutes, { prefix: '/topics/jwt' });
app.register(sessionAuthRoutes, { prefix: '/topics/session' });
app.register(oauthGithubRoutes, { prefix: '/topics/oauth' });
app.register(oidcGoogleRoutes, { prefix: '/topics/oidc' });

app.register(rbacPlugin);
app.register(rateLimitPlugin);


// Edge layer: blanket IP limit, applies to every request, fail-open
// (an outage shouldn't take down the whole API over a rate-limit check).
app.after(() => {
  app.addHook('onRequest', app.rateLimit({
    algorithm: 'token-bucket',
    capacity: 5000,
    refillRatePerSecond: 5000/60,
    identifier: byIp,
    keyPrefix: 'edge',
    failMode: 'open',
  }));

  // /health now registered AFTER the hook exists, so it actually applies
  app.get('/health', async () => ({ status: 'ok' }));
});

const port = Number(process.env.PORT) || 4100;
app.listen({ port }, () => {
  console.log(`api listening on http://localhost:${port}`);
});