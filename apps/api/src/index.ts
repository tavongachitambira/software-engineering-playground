import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import basicAuthRoutes from './routes/basic-auth.js';
import jwtAuthRoutes from './routes/jwt-auth.js';
import sessionAuthRoutes from './routes/session-auth.js';
import oauthGithubRoutes from './routes/oauth-github.js';
import oidcGoogleRoutes from './routes/oidc-google.js';

const app = Fastify({ logger: false });

app.register(cookie);

app.get('/health', async () => ({ status: 'ok' }));

app.register(basicAuthRoutes, { prefix: '/topics/basic-auth' });
app.register(jwtAuthRoutes, { prefix: '/topics/jwt' });
app.register(sessionAuthRoutes, { prefix: '/topics/session' });
app.register(oauthGithubRoutes, { prefix: '/topics/oauth' });
app.register(oidcGoogleRoutes, { prefix: '/topics/oidc' });

const port = Number(process.env.PORT) || 4100;
app.listen({ port }, () => {
  console.log(`api listening on http://localhost:${port}`);
});