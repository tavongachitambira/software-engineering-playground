import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

// Each backend topic mounts its own router here, e.g.:
// import jwtRoutes from '../../topics/authentication/jwt/example/routes.js';
// app.register(jwtRoutes, { prefix: '/topics/jwt' });

const port = Number(process.env.PORT) || 4100;
app.listen({ port }, () => {
  console.log(`api listening on http://localhost:${port}`);
});
