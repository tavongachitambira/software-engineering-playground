import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

const USERS = { tavonga: 'hunter2' };

// Toy in-memory session store — this is the "shared state" that makes
// session auth hard to scale across multiple server instances (you'd need
// Redis or a DB here in a real multi-instance deployment).
const sessions = new Map<string, { username: string; expiresAt: number }>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export default async function sessionAuthRoutes(app: FastifyInstance) {
  // 1. Login: create a session, return the session id as a cookie
  app.post('/login', async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };

    if (USERS[username as keyof typeof USERS] !== password) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const sessionId = randomUUID();
    sessions.set(sessionId, { username, expiresAt: Date.now() + SESSION_TTL_MS });

    reply
      .setCookie('sessionId', sessionId, {
        httpOnly: true, // JS on the client can't read this — mitigates XSS token theft
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      })
      .send({ message: `Logged in as ${username}` });
  });

  // 2. Protected route: look up the session on every request
  app.get('/protected', async (req, reply) => {
    const sessionId = req.cookies?.sessionId;

    if (!sessionId) {
      reply.code(401).send({ error: 'No session cookie' });
      return;
    }

    const session = sessions.get(sessionId);

    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(sessionId);
      reply.code(401).send({ error: 'Session invalid or expired' });
      return;
    }

    return { message: `Welcome back, ${session.username}. Session is active.` };
  });

  // 3. Logout: instant revocation — this is session auth's one clean advantage over JWT
  app.post('/logout', async (req, reply) => {
    const sessionId = req.cookies?.sessionId;
    if (sessionId) sessions.delete(sessionId);
    reply.clearCookie('sessionId').send({ message: 'Logged out' });
  });
}