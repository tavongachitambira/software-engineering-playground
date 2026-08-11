import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:4100/topics/oidc/callback';

const pendingStates = new Set<string>();

// jose fetches Google's public signing keys once and refreshes them
// automatically as needed — this is what lets us verify the ID token's
// signature locally, no extra request needed per verification.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export default async function oidcGoogleRoutes(app: FastifyInstance) {
  app.get('/login', async (req, reply) => {
    const state = randomUUID();
    pendingStates.add(state);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      // 'openid' is the scope that turns this into OIDC — without it,
      // Google would only return an access token, same as plain OAuth.
      scope: 'openid email profile',
      state,
    });

    reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state || !pendingStates.has(state)) {
      reply.code(400).send({ error: 'Missing or invalid state — possible CSRF' });
      return;
    }
    pendingStates.delete(state);

    // Exchange the code for tokens — server-to-server, requires client_secret
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

    // The OIDC-specific step: verify the ID token's signature against
    // Google's public keys, and confirm issuer + audience match. This is
    // what actually establishes identity — access_token alone never does.
    const { payload } = await jwtVerify(tokenData.id_token, GOOGLE_JWKS, {
      issuer: 'https://accounts.google.com',
      audience: CLIENT_ID,
    });

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