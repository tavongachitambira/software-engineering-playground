import type { FastifyInstance } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const SECRET = new TextEncoder().encode('dev-only-secret-change-me');
const USERS = { tavonga: 'hunter2' };

// Refresh tokens ARE tracked server-side — unlike access tokens, this is
// what makes them revocable. Map: refreshToken -> { username, expiresAt }
const refreshTokens = new Map<string, { username: string; expiresAt: number }>();
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function signAccessToken(username: string) {
  return new SignJWT({ role: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET);
}

function issueRefreshToken(username: string) {
  const token = randomUUID();
  refreshTokens.set(token, { username, expiresAt: Date.now() + REFRESH_TTL_MS });
  return token;
}

export default async function jwtAuthRoutes(app: FastifyInstance) {
  // 1. Login: issue both tokens
  app.post('/login', async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };

    if (USERS[username as keyof typeof USERS] !== password) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = await signAccessToken(username);
    const refreshToken = issueRefreshToken(username);

    return { accessToken, refreshToken };
  });

  // 2. Protected route — unchanged, still just verifies the access token
  app.get('/protected', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token' });
      return;
    }
    try {
      const { payload } = await jwtVerify(header.slice('Bearer '.length), SECRET);
      return { message: `Welcome, ${payload.sub}. Token is valid.`, claims: payload };
    } catch {
      reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  // 3. Refresh: exchange a valid refresh token for a new access token,
  // with rotation — the old refresh token is invalidated immediately.
  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string };

    const record = refreshTokens.get(refreshToken);

    if (!record || record.expiresAt < Date.now()) {
      refreshTokens.delete(refreshToken);
      reply.code(401).send({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Rotation: this refresh token is now dead, whether or not it gets used again.
    // If it's replayed after this point (e.g. stolen and reused), that's a signal
    // of theft — a real system would revoke the whole token family here.
    refreshTokens.delete(refreshToken);

    const newAccessToken = await signAccessToken(record.username);
    const newRefreshToken = issueRefreshToken(record.username);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}