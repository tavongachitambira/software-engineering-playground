import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:4100/topics/oidc/callback';

// Store state and nonce together in session tracking
interface PendingSession {
  nonce: string;
}
const pendingSessions = new Map<string, PendingSession>();

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export default async function oidcGoogleRoutes(app: FastifyInstance) {
  app.get('/login', async (req, reply) => {
    const state = randomUUID();
    const nonce = randomUUID(); // 1. Generate cryptographic nonce

    pendingSessions.set(state, { nonce });

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce, // 2. Pass nonce to Google
    });

    reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state || !pendingSessions.has(state)) {
      reply.code(400).send({ error: 'Missing or invalid state — possible CSRF' });
      return;
    }

    const { nonce } = pendingSessions.get(state)!;
    pendingSessions.delete(state);

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenData.id_token) {
      reply.code(400).send({ error: 'Token exchange failed', details: tokenData });
      return;
    }

    // 3. Verify ID Token signature AND validate matching nonce claim
    const { payload } = await jwtVerify(tokenData.id_token, GOOGLE_JWKS, {
      issuer: 'https://accounts.google.com',
      audience: CLIENT_ID,
    });

    if (payload.nonce !== nonce) {
      reply.code(401).send({ error: 'Invalid nonce — potential token replay attack' });
      return;
    }

    return {
      message: `Authenticated via OIDC as ${payload.email}`,
      idTokenClaims: {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
      },
    };
  });
}