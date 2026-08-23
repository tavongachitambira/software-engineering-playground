import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:4100/topics/oauth/callback';

// Tracks in-flight state values so we can verify the callback wasn't forged
// (CSRF protection) — a real system would tie this to the user's session too.
const pendingStates = new Set<string>();

export default async function oauthGithubRoutes(app: FastifyInstance) {
  // 1. Kick off the flow — redirect the user to GitHub's consent screen
  app.get('/login', async (req, reply) => {
    const state = randomUUID();
    pendingStates.add(state);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'read:user',
      state,
    });

    reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // 2. GitHub redirects back here with ?code=...&state=...
  app.get('/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state || !pendingStates.has(state)) {
      reply.code(400).send({ error: 'Missing or invalid state — possible CSRF' });
      return;
    }
    pendingStates.delete(state); // one-time use

    // 3. Exchange the code for an access token — server-to-server,
    // requires client_secret. This is the step that proves the request
    // is coming from the app GitHub actually registered, not an attacker
    // who intercepted the redirect and stole the code.
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenData.access_token) {
      reply.code(400).send({ error: 'Token exchange failed', details: tokenData });
      return;
    }

    // 4. Use the access token to call the resource server (GitHub's API)
    const userResp = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'se-playground-oauth-demo',
      },
    });

    const githubUser = await userResp.json();

    return {
      message: `Authenticated as GitHub user ${githubUser.login}`,
      scope: tokenData.scope,
      user: { login: githubUser.login, id: githubUser.id, name: githubUser.name },
    };
  });
}