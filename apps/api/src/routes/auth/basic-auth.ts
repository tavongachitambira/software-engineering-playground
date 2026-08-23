import type { FastifyInstance } from 'fastify';

// Toy in-memory "database" — just for demonstrating the concept.
const USERS = { tavonga: 'hunter2' };

export default async function basicAuthRoutes(app: FastifyInstance) {
  app.get('/protected', async (req, reply) => {
    const header = req.headers.authorization;

    if (!header?.startsWith('Basic ')) {
      reply.code(401).header('WWW-Authenticate', 'Basic').send({ error: 'Missing credentials' });
      return;
    }

    // Decode "Basic base64(username:password)"
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');

    if (USERS[username as keyof typeof USERS] !== password) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    return { message: `Welcome, ${username}. This is a protected resource.` };
  });
}